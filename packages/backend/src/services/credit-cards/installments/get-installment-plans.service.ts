import { findOwnCreditCardAccount } from '../find-own-credit-card-account';
import { findCardInstallmentPlans } from './find-own-installments';

export const getInstallmentPlans = async ({ userId, accountId }: { userId: number; accountId: string }) => {
  const account = await findOwnCreditCardAccount({ userId, accountId });
  return findCardInstallmentPlans({ accountId: account.id });
};
