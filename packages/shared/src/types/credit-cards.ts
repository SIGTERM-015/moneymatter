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

/** Most installments one deferred purchase may be split into (ten years of monthly charges). */
export const CARD_INSTALLMENTS_MAX_COUNT = 120;

/** Longest installment plan title, matching the column. */
export const CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH = 200;

export enum CARD_INSTALLMENT_PLAN_STATUSES {
  active = 'active',
  completed = 'completed',
}

/**
 * - `pending`: not charged yet.
 * - `proposed`: a transfer into the card matched it, but the same amount also matches the
 *   card's non-deferred statement spend, so the user confirms or rejects the match.
 * - `paid`: settled by `paidTransactionId`.
 */
export enum CARD_INSTALLMENT_STATUSES {
  pending = 'pending',
  proposed = 'proposed',
  paid = 'paid',
}

/** One scheduled charge of a deferred card purchase. `dueMonth` is `YYYY-MM`; `amount` is a decimal. */
export interface CardInstallmentApiResponse {
  id: RecordId;
  planId: RecordId;
  dueMonth: string;
  amount: number;
  status: CARD_INSTALLMENT_STATUSES;
  paidTransactionId: RecordId | null;
  paidAt: string | null;
}

/**
 * A deferred purchase on a card and its billing schedule. The purchase is already an expense
 * on the card, so the installments only say when the bank charges it. `estimatedInterest`
 * is `sum(amounts) - principal`, display only.
 */
export interface CardInstallmentPlanApiResponse {
  id: RecordId;
  accountId: RecordId;
  title: string;
  principal: number;
  installmentsCount: number;
  firstDueMonth: string;
  apr: number | null;
  interestFreeMonths: number | null;
  purchaseTransactionId: RecordId | null;
  status: CARD_INSTALLMENT_PLAN_STATUSES;
  paidCount: number;
  totalAmount: number;
  remainingAmount: number;
  estimatedInterest: number;
  installments: CardInstallmentApiResponse[];
}

/**
 * `POST /accounts/:id/credit-card/installments`. Send `amounts` (the bank's real charge per
 * installment) or `installmentsCount` for a split computed from `principal`, `apr` and
 * `interestFreeMonths`; with both, the lengths must agree.
 */
export interface CreateCardInstallmentPlanBody {
  title: string;
  principal: number;
  firstDueMonth: string;
  installmentsCount?: number;
  amounts?: number[];
  apr?: number | null;
  interestFreeMonths?: number | null;
  purchaseTransactionId?: RecordId | null;
}

/** `PATCH /accounts/:id/credit-card/installments/:planId`. The schedule itself is edited per installment. */
export interface UpdateCardInstallmentPlanBody {
  title?: string;
  apr?: number | null;
  interestFreeMonths?: number | null;
  purchaseTransactionId?: RecordId | null;
}

/** `PATCH /credit-card/installments/:id`. Only a `pending` installment can change its amount. */
export interface UpdateCardInstallmentBody {
  amount: number;
}

/**
 * `GET /accounts/:id/credit-card/summary?month=YYYY-MM`. `installmentsDue` sums the installments
 * scheduled for the month, whatever their status; `statementSpend` is the card's non-deferred spend
 * of the statement that closes in the month (the calendar month when no statement day is set).
 */
export interface CardMonthlySummaryApiResponse {
  month: string;
  statementFrom: string;
  statementTo: string;
  installmentsDue: number;
  statementSpend: number;
  expectedTotal: number;
  installments: (CardInstallmentApiResponse & { planTitle: string })[];
}
