import type { RecordId } from './record-id';

/** Inclusive bounds of a card's statement and payment day of month. */
export const CREDIT_CARD_DAY_OF_MONTH_RANGE = { min: 1, max: 31 } as const;

/** Inclusive bounds of a card's APR, in percent (`19.99` = 19.99%). */
export const CREDIT_CARD_APR_RANGE = { min: 0, max: 100 } as const;

/** Upper bound of a card's interest-free months, so the value stays meaningful and inside the column. */
export const CREDIT_CARD_MAX_INTEREST_FREE_MONTHS = 999;

/**
 * `PUT /accounts/:id/credit-card` body. An absent field keeps its stored value
 * (or the column default when the card has no details yet); `null` clears it.
 */
export interface UpsertCreditCardDetailsBody {
  statementDay?: number | null;
  paymentDay?: number | null;
  apr?: number | null;
  interestFreeMonths?: number;
}

/**
 * Card details plus the credit position derived from the account. Amounts are decimals
 * in the card account's currency. A card balance is what is owed, stored negative, so
 * `used = max(-balance, 0)` and `available = max(creditLimit - used, 0)`.
 */
export interface CreditCardDetailsApiResponse {
  accountId: RecordId;
  statementDay: number | null;
  paymentDay: number | null;
  apr: number | null;
  interestFreeMonths: number;
  creditLimit: number;
  used: number;
  available: number;
}
