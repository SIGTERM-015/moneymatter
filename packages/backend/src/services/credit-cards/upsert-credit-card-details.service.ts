import type { UpsertCreditCardDetailsBody } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import CreditCardDetails from '@models/credit-card-details.model';
import { withTransaction } from '@services/common/with-transaction';

import { findOwnCreditCardAccount } from './find-own-credit-card-account';

const upsertCreditCardDetailsImpl = async ({
  userId,
  accountId,
  ...fields
}: { userId: number; accountId: string } & UpsertCreditCardDetailsBody) => {
  const account = await findOwnCreditCardAccount({ userId, accountId });
  const changes = removeUndefinedKeys(fields);

  const existing = await CreditCardDetails.findOne({ where: { accountId: account.id } });
  const details = existing
    ? await existing.update(changes)
    : await CreditCardDetails.create({ ...changes, accountId: account.id, userId });

  return { account, details };
};

export const upsertCreditCardDetails = withTransaction(upsertCreditCardDetailsImpl);
