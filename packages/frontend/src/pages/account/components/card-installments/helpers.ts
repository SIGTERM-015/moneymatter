import { splitInstallmentCents } from '@bt/shared/credit-cards/installment-split';
import { CARD_INSTALLMENTS_MAX_COUNT } from '@bt/shared/types';

const toCents = (value: number) => Math.round(value * 100);

/**
 * Proposed per-installment amounts (decimals) for the create form, from the same split the
 * server uses. Empty until the principal and count describe a valid plan.
 */
export const proposeInstallmentAmounts = ({
  principal,
  count,
  apr,
  interestFreeMonths,
}: {
  principal: number | null;
  count: number | null;
  apr: number | null;
  interestFreeMonths: number | null;
}): number[] => {
  if (!principal || principal <= 0 || !count || !Number.isInteger(count)) return [];
  if (count < 1 || count > CARD_INSTALLMENTS_MAX_COUNT) return [];

  return splitInstallmentCents({ principalCents: toCents(principal), count, apr, interestFreeMonths }).map(
    (cents) => cents / 100,
  );
};

/** What the schedule costs over the principal; display only, never charged to the balance. */
export const estimateInterest = ({ principal, amounts }: { principal: number; amounts: number[] }): number =>
  (amounts.reduce((sum, amount) => sum + toCents(amount), 0) - toCents(principal)) / 100;
