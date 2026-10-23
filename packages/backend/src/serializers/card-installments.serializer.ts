import {
  CARD_INSTALLMENT_STATUSES,
  type CardInstallmentApiResponse,
  type CardInstallmentPlanApiResponse,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import type CardInstallmentPlans from '@models/card-installment-plans.model';
import type CardInstallments from '@models/card-installments.model';
import { dateToMonth } from '@services/credit-cards/installments/installment-math';

export function serializeCardInstallment(installment: CardInstallments): CardInstallmentApiResponse {
  return {
    id: installment.id,
    planId: installment.planId,
    dueMonth: dateToMonth({ date: installment.dueMonth }),
    amount: installment.amount.toNumber(),
    status: installment.status,
    paidTransactionId: installment.paidTransactionId,
    paidAt: installment.paidAt ? new Date(installment.paidAt).toISOString() : null,
  };
}

/** A plan with its schedule and progress. `installments` must be loaded, in due order. */
export function serializeCardInstallmentPlan(plan: CardInstallmentPlans): CardInstallmentPlanApiResponse {
  const installments = plan.installments ?? [];
  const total = Money.sum(installments.map((installment) => installment.amount));
  const unpaid = installments.filter((installment) => installment.status !== CARD_INSTALLMENT_STATUSES.paid);

  return {
    id: plan.id,
    accountId: plan.accountId,
    title: plan.title,
    principal: plan.principal.toNumber(),
    installmentsCount: plan.installmentsCount,
    firstDueMonth: dateToMonth({ date: plan.firstDueMonth }),
    apr: plan.apr,
    interestFreeMonths: plan.interestFreeMonths,
    purchaseTransactionId: plan.purchaseTransactionId,
    status: plan.status,
    paidCount: installments.length - unpaid.length,
    totalAmount: total.toNumber(),
    remainingAmount: Money.sum(unpaid.map((installment) => installment.amount)).toNumber(),
    estimatedInterest: total.subtract(plan.principal).toNumber(),
    installments: installments.map(serializeCardInstallment),
  };
}
