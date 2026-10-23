import { ACCOUNT_CATEGORIES, CARD_INSTALLMENT_STATUSES, TRANSACTION_TYPES, isTwoLegTransfer } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CardInstallments from '@models/card-installments.model';
import { findTransactions } from '@models/transactions-query';
import type Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { classifyCardPayment, lastClosedStatementMonth, selectDueInstallments, toUtcMonth } from './installment-math';
import { refreshPlanStatuses } from './refresh-plan-statuses';
import { getStatementDay, getStatementSpend } from './statement-spend';

/**
 * Pays a card's installments from transfers into the card. The card-side leg of the transfer
 * (an income on the card) is the payment: when its amount equals `due(month)`, the pending
 * installments scheduled up to the transfer's month, they are marked paid, or proposed when the
 * amount is also the non-deferred spend of the statement it pays. A transfer that matches
 * nothing is an ordinary card payment. Every entry point is idempotent: a leg already linked to
 * installments is never matched twice, and releasing a leg returns its installments to pending.
 */

type Leg = Pick<
  Transactions,
  'id' | 'accountId' | 'amount' | 'time' | 'transactionType' | 'transferNature' | 'isPlanned'
>;

const isCardPaymentCandidate = ({ leg }: { leg: Leg }) =>
  isTwoLegTransfer(leg.transferNature) && leg.transactionType === TRANSACTION_TYPES.income && !leg.isPlanned;

const findCardAccountIds = async ({ accountIds }: { accountIds: string[] }) => {
  if (!accountIds.length) return new Set<string>();
  const cards = await Accounts.findAll({
    where: { id: { [Op.in]: [...new Set(accountIds)] }, accountCategory: ACCOUNT_CATEGORIES.creditCard },
    attributes: ['id'],
  });
  return new Set(cards.map((card) => card.id as string));
};

const matchLeg = async ({ leg }: { leg: Leg }) => {
  const alreadyLinked = await CardInstallments.count({
    where: { [Op.or]: [{ paidTransactionId: leg.id }, { rejectedTransactionId: leg.id }] },
  });
  if (alreadyLinked) return;

  const month = toUtcMonth({ date: new Date(leg.time) });
  const installments = await CardInstallments.findAll({
    where: { status: CARD_INSTALLMENT_STATUSES.pending, dueMonth: { [Op.lte]: `${month}-01` } },
    include: [{ model: CardInstallmentPlans, where: { accountId: leg.accountId }, required: true, attributes: [] }],
  });

  const { due, total } = selectDueInstallments({
    installments: installments.map((row) => ({
      row,
      dueMonth: row.dueMonth.slice(0, 7),
      amount: row.amount,
      status: row.status,
    })),
    month,
  });
  if (!total.isPositive() || !leg.amount.equals(total)) return;

  const statementDay = await getStatementDay({ accountId: leg.accountId });
  const { spend } = await getStatementSpend({
    accountId: leg.accountId,
    month: lastClosedStatementMonth({ statementDay, date: new Date(leg.time) }),
    statementDay,
  });

  const match = classifyCardPayment({ amount: leg.amount, due: total, statementSpend: spend });
  if (match === 'none') return;

  const ids = due.map(({ row }) => row.id);
  await CardInstallments.update(
    match === 'paid'
      ? { status: CARD_INSTALLMENT_STATUSES.paid, paidTransactionId: leg.id, paidAt: new Date(leg.time) }
      : { status: CARD_INSTALLMENT_STATUSES.proposed, paidTransactionId: leg.id, paidAt: null },
    { where: { id: { [Op.in]: ids } } },
  );
  await refreshPlanStatuses({ planIds: due.map(({ row }) => row.planId) });
};

/** Matches every leg that is a transfer into a credit card. Call after the legs are written. */
export const matchCardPaymentLegs = async ({ legs }: { legs: (Leg | undefined | null)[] }) => {
  const candidates = legs.filter((leg): leg is Leg => Boolean(leg) && isCardPaymentCandidate({ leg: leg! }));
  if (!candidates.length) return;

  const cardIds = await findCardAccountIds({ accountIds: candidates.map((leg) => leg.accountId) });
  for (const leg of candidates) {
    if (cardIds.has(leg.accountId)) await matchLeg({ leg });
  }
};

/**
 * Returns the installments paid or proposed by these transactions to pending and forgets any
 * rejection they carry, so a later match starts from scratch.
 */
export const releaseCardPayments = async ({ transactionIds }: { transactionIds: string[] }) => {
  if (!transactionIds.length) return;

  const linked = await CardInstallments.findAll({
    where: { paidTransactionId: { [Op.in]: transactionIds } },
    attributes: ['id', 'planId'],
  });

  if (linked.length) {
    await CardInstallments.update(
      { status: CARD_INSTALLMENT_STATUSES.pending, paidTransactionId: null, paidAt: null },
      { where: { id: { [Op.in]: linked.map((row) => row.id) } } },
    );
    await refreshPlanStatuses({ planIds: linked.map((row) => row.planId) });
  }

  await CardInstallments.update(
    { rejectedTransactionId: null },
    { where: { rejectedTransactionId: { [Op.in]: transactionIds } } },
  );
};

const findLegs = async ({ transaction }: { transaction: Leg & Pick<Transactions, 'transferId'> }): Promise<Leg[]> => {
  if (!transaction.transferId) return [transaction];

  // Both legs of a household transfer can belong to different users; the caller already
  // authorized the transaction this pair hangs off.
  return findTransactions({
    planned: 'include',
    access: 'unscoped-internal',
    balanceAdjustments: 'include',
    completeness: 'all',
    where: { transferId: transaction.transferId },
  });
};

/** Releases whatever this transaction or its transfer pair pays. Call before deleting it. */
export const releaseCardPaymentsOfTransaction = async ({
  transaction,
}: {
  transaction: Leg & Pick<Transactions, 'transferId'>;
}) => {
  const legs = await findLegs({ transaction });
  await releaseCardPayments({ transactionIds: legs.map((leg) => leg.id) });
};

const signature = ({ leg }: { leg: Leg }) =>
  JSON.stringify([
    leg.accountId,
    leg.amount.toCents(),
    new Date(leg.time).getTime(),
    leg.transactionType,
    leg.transferNature,
    Boolean(leg.isPlanned),
  ]);

/**
 * Snapshot of a transaction's legs before an edit, for `resyncCardPaymentsAfterEdit`. Only the
 * fields a match depends on are kept, so a note or category edit keeps a confirmed match.
 */
export const snapshotCardPaymentLegs = async ({
  transaction,
}: {
  transaction: Leg & Pick<Transactions, 'transferId'>;
}) => {
  const legs = await findLegs({ transaction });
  return new Map(legs.map((leg) => [leg.id as string, signature({ leg })]));
};

/** Re-matches every leg whose payment-relevant fields changed in the edit, and only those. */
export const resyncCardPaymentsAfterEdit = async ({
  before,
  after,
}: {
  before: Map<string, string>;
  after: (Leg | undefined | null)[];
}) => {
  const afterLegs = after.filter((leg): leg is Leg => Boolean(leg));
  const afterById = new Map(afterLegs.map((leg) => [leg.id as string, leg]));

  const changedIds = [...new Set([...before.keys(), ...afterById.keys()])].filter((id) => {
    const leg = afterById.get(id);
    return !leg || before.get(id) !== signature({ leg });
  });
  if (!changedIds.length) return;

  await releaseCardPayments({ transactionIds: changedIds });
  await matchCardPaymentLegs({ legs: changedIds.map((id) => afterById.get(id)) });
};
