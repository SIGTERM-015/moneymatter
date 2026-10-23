/**
 * Installment amounts for a deferred card purchase, in cents. Shared so the create form previews
 * exactly the schedule the server would store.
 *
 * A plan no longer than the card's interest-free months, or without an APR, splits the principal
 * equally; the leftover cents go to the first installments so the sum is the principal exactly.
 * A longer plan with an APR is a fixed annuity at `apr / 12` per month, which is how a bank
 * prices a deferred purchase past its free window; the bank's real figure can then be typed in.
 */
export const splitInstallmentCents = ({
  principalCents,
  count,
  apr,
  interestFreeMonths,
}: {
  principalCents: number;
  count: number;
  apr: number | null;
  interestFreeMonths: number | null;
}): number[] => {
  const monthlyRate = apr ? apr / 100 / 12 : 0;
  const isInterestFree = monthlyRate === 0 || count <= (interestFreeMonths ?? 0);

  if (isInterestFree) {
    const base = Math.floor(principalCents / count);
    const leftover = principalCents - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < leftover ? 1 : 0));
  }

  const payment = Math.round((principalCents * monthlyRate) / (1 - (1 + monthlyRate) ** -count));
  return Array.from({ length: count }, () => payment);
};
