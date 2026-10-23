import CreditCardDetails from '@models/credit-card-details.model';

import { findOwnCreditCardAccount } from './find-own-credit-card-account';

/** A card with no stored details yet reads as `details: null`, not as an error. */
export const getCreditCardDetails = async ({ userId, accountId }: { userId: number; accountId: string }) => {
  const account = await findOwnCreditCardAccount({ userId, accountId });
  const details = await CreditCardDetails.findOne({ where: { accountId: account.id } });

  return { account, details };
};
