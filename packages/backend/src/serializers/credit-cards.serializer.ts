import type { CreditCardDetailsApiResponse } from '@bt/shared/types';
import type Accounts from '@models/accounts.model';
import type CreditCardDetails from '@models/credit-card-details.model';
import { computeCreditPosition } from '@services/credit-cards/compute-credit-position';

/** Card details, or their column defaults when none are stored, plus the account's credit position. */
export function serializeCreditCardDetails({
  account,
  details,
}: {
  account: Accounts;
  details: CreditCardDetails | null;
}): CreditCardDetailsApiResponse {
  const { used, available } = computeCreditPosition({
    balance: account.currentBalance,
    creditLimit: account.creditLimit,
  });

  return {
    accountId: account.id,
    statementDay: details?.statementDay ?? null,
    paymentDay: details?.paymentDay ?? null,
    apr: details?.apr ?? null,
    interestFreeMonths: details?.interestFreeMonths ?? 0,
    creditLimit: account.creditLimit.toNumber(),
    used: used.toNumber(),
    available: available.toNumber(),
  };
}
