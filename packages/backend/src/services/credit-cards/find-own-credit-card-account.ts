import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';

/**
 * The user's own credit-card account. Another user's account, a missing id and a
 * non-card account all answer the same 404, so the endpoint never reveals which
 * of them an id is.
 */
export const findOwnCreditCardAccount = ({ userId, accountId }: { userId: number; accountId: string }) =>
  findOrThrowNotFound({
    query: Accounts.findOne({ where: { id: accountId, userId, accountCategory: ACCOUNT_CATEGORIES.creditCard } }),
    message: t({ key: 'creditCards.creditCardNotFound' }),
  });
