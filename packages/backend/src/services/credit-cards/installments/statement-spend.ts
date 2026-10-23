import { TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CreditCardDetails from '@models/credit-card-details.model';
import { findTransactions } from '@models/transactions-query';
import { Op } from 'sequelize';

import { statementWindow } from './installment-math';

/** The card's statement day, or null when it has no details or none is set. */
export const getStatementDay = async ({ accountId }: { accountId: string }) => {
  const details = await CreditCardDetails.findOne({ where: { accountId }, attributes: ['statementDay'] });
  return details?.statementDay ?? null;
};

/**
 * Non-deferred spend of the statement that closes in `month`: the card's real expenses in the
 * window minus the principal of plans whose purchase lies in it, since the bank bills those
 * through their installments instead. Never negative.
 */
export const getStatementSpend = async ({
  accountId,
  month,
  statementDay,
}: {
  accountId: string;
  month: string;
  statementDay: number | null;
}) => {
  const window = statementWindow({ statementDay, month });

  // The account id fixes the row set; callers have already authorized the card.
  const expenses = await findTransactions({
    planned: 'exclude',
    access: 'unscoped-internal',
    balanceAdjustments: 'exclude',
    transfers: 'exclude',
    completeness: 'all',
    where: {
      accountId,
      transactionType: TRANSACTION_TYPES.expense,
      time: { [Op.gte]: window.from, [Op.lt]: window.toExclusive },
    },
    attributes: ['id', 'amount'],
  });

  const deferred = expenses.length
    ? await CardInstallmentPlans.findAll({
        where: { accountId, purchaseTransactionId: { [Op.in]: expenses.map((tx) => tx.id) } },
        attributes: ['id', 'principal'],
      })
    : [];

  const spend = Money.sum(expenses.map((tx) => tx.amount)).subtract(Money.sum(deferred.map((plan) => plan.principal)));

  return { ...window, spend: spend.isNegative() ? Money.zero() : spend };
};
