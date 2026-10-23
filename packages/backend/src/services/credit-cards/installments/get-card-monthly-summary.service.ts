import { Money } from '@common/types/money';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CardInstallments from '@models/card-installments.model';

import { findOwnCreditCardAccount } from '../find-own-credit-card-account';
import { monthToDate } from './installment-math';
import { getStatementDay, getStatementSpend } from './statement-spend';

/**
 * What the bank should take from the card holder in `month`: the installments scheduled for the
 * month (whatever their status, so the figure does not drop once they are paid) plus the
 * non-deferred spend of the statement closing in the month.
 */
export const getCardMonthlySummary = async ({
  userId,
  accountId,
  month,
}: {
  userId: number;
  accountId: string;
  month: string;
}) => {
  const account = await findOwnCreditCardAccount({ userId, accountId });

  const installments = await CardInstallments.findAll({
    where: { dueMonth: monthToDate({ month }) },
    include: [{ model: CardInstallmentPlans, where: { accountId: account.id }, required: true, attributes: ['title'] }],
    order: [['createdAt', 'ASC']],
  });

  const statementDay = await getStatementDay({ accountId: account.id });
  const statement = await getStatementSpend({ accountId: account.id, month, statementDay });
  const installmentsDue = Money.sum(installments.map((installment) => installment.amount));

  return {
    month,
    statement,
    installmentsDue,
    expectedTotal: installmentsDue.add(statement.spend),
    installments,
  };
};
