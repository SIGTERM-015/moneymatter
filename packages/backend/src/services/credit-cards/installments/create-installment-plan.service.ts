import { splitInstallmentCents } from '@bt/shared/credit-cards/installment-split';
import { TRANSACTION_TYPES, type RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ConflictError, ValidationError } from '@js/errors';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CardInstallments from '@models/card-installments.model';
import { findOneTransaction } from '@models/transactions-query';
import { withTransaction } from '@services/common/with-transaction';

import { findOwnCreditCardAccount } from '../find-own-credit-card-account';
import { findOwnInstallmentPlan } from './find-own-installments';
import { buildInstallmentMonths, monthToDate } from './installment-math';

/**
 * The purchase a plan defers must be a real expense on the same card, and deferred once:
 * a second plan on it would bill the purchase twice.
 */
export const assertDeferrablePurchase = async ({
  userId,
  accountId,
  purchaseTransactionId,
  ignorePlanId,
}: {
  userId: number;
  accountId: string;
  purchaseTransactionId: string;
  ignorePlanId?: string;
}) => {
  const purchase = await findOneTransaction({
    planned: 'exclude',
    access: { accountOwner: userId },
    balanceAdjustments: 'exclude',
    where: { id: purchaseTransactionId, accountId, transactionType: TRANSACTION_TYPES.expense },
    attributes: ['id'],
  });
  if (!purchase) {
    throw new ValidationError({ message: t({ key: 'creditCards.purchaseTransactionInvalid' }) });
  }

  const existing = await CardInstallmentPlans.findOne({ where: { purchaseTransactionId }, attributes: ['id'] });
  if (existing && existing.id !== ignorePlanId) {
    throw new ConflictError({ message: t({ key: 'creditCards.purchaseAlreadyDeferred' }) });
  }
};

interface CreateInstallmentPlanParams {
  userId: number;
  accountId: string;
  title: string;
  principal: Money;
  firstDueMonth: string;
  /** The bank's charge per installment; when absent the principal is split over `installmentsCount`. */
  amounts?: Money[];
  installmentsCount?: number;
  apr?: number | null;
  interestFreeMonths?: number | null;
  purchaseTransactionId?: RecordId | null;
}

const createInstallmentPlanImpl = async ({
  userId,
  accountId,
  title,
  principal,
  firstDueMonth,
  amounts,
  installmentsCount,
  apr = null,
  interestFreeMonths = null,
  purchaseTransactionId = null,
}: CreateInstallmentPlanParams) => {
  const account = await findOwnCreditCardAccount({ userId, accountId });

  if (purchaseTransactionId) {
    await assertDeferrablePurchase({ userId, accountId: account.id, purchaseTransactionId });
  }

  const schedule =
    amounts ??
    splitInstallmentCents({
      principalCents: principal.toCents(),
      count: installmentsCount!,
      apr,
      interestFreeMonths,
    }).map((cents) => Money.fromCents(cents));

  const plan = await CardInstallmentPlans.create({
    accountId: account.id,
    userId,
    title,
    principal,
    installmentsCount: schedule.length,
    firstDueMonth: monthToDate({ month: firstDueMonth }),
    apr,
    interestFreeMonths,
    purchaseTransactionId,
  });

  const months = buildInstallmentMonths({ firstDueMonth, count: schedule.length });
  await CardInstallments.bulkCreate(
    schedule.map((amount, index) => ({ planId: plan.id, dueMonth: monthToDate({ month: months[index]! }), amount })),
  );

  return findOwnInstallmentPlan({ userId, accountId: account.id, planId: plan.id });
};

export const createInstallmentPlan = withTransaction(createInstallmentPlanImpl);
