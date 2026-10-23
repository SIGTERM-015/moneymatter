import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CardInstallments from '@models/card-installments.model';

/** One of the user's plans on this card, with its installments in due order. */
export const findOwnInstallmentPlan = ({
  userId,
  accountId,
  planId,
}: {
  userId: number;
  accountId: string;
  planId: string;
}) =>
  findOrThrowNotFound({
    query: CardInstallmentPlans.findOne({
      where: { id: planId, accountId, userId },
      include: [{ model: CardInstallments }],
      order: [[{ model: CardInstallments, as: 'installments' }, 'dueMonth', 'ASC']],
    }),
    message: t({ key: 'creditCards.installmentPlanNotFound' }),
  });

/** One of the user's installments, whatever card it is on. */
export const findOwnInstallment = ({ userId, installmentId }: { userId: number; installmentId: string }) =>
  findOrThrowNotFound({
    query: CardInstallments.findOne({
      where: { id: installmentId },
      include: [{ model: CardInstallmentPlans, where: { userId }, required: true }],
    }),
    message: t({ key: 'creditCards.installmentNotFound' }),
  });

/** Every plan on a card with its installments, oldest first. */
export const findCardInstallmentPlans = ({ accountId }: { accountId: string }) =>
  CardInstallmentPlans.findAll({
    where: { accountId },
    include: [{ model: CardInstallments }],
    order: [
      ['firstDueMonth', 'ASC'],
      ['createdAt', 'ASC'],
      [{ model: CardInstallments, as: 'installments' }, 'dueMonth', 'ASC'],
    ],
  });
