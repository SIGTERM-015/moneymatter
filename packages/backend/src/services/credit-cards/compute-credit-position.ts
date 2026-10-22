import { Money } from '@common/types/money';

/**
 * Credit drawn and left on a card. A card balance is what is owed, stored negative
 * (`-792` = owes 792), so a positive balance is an overpayment and draws nothing.
 * Same rule as the frontend `computeCreditUsed` for a balance that does not embed
 * the credit limit.
 */
export const computeCreditPosition = ({ balance, creditLimit }: { balance: Money; creditLimit: Money }) => {
  const used = balance.isNegative() ? balance.negate() : Money.zero();
  const remaining = creditLimit.subtract(used);
  const available = remaining.isNegative() ? Money.zero() : remaining;

  return { used, available };
};
