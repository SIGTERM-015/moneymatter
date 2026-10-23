import { Money } from '@common/types/money';

import { BalanceStatus, CashAccountType, type EnableBankingBalance } from '../types';
import { pickAccountBalance } from './balances';

/**
 * Balance types that report what can still be spent, not what is owed. On a card
 * `owed = creditLimit - available`.
 */
const AVAILABLE_BALANCE_TYPES: BalanceStatus[] = [
  BalanceStatus.ITAV,
  BalanceStatus.CLAV,
  BalanceStatus.OPAV,
  BalanceStatus.FWAV,
];

/** Available balances that can tell a debt from a credit, in `pickAccountBalance` priority order. */
const CORROBORATING_AVAILABLE_TYPES = [BalanceStatus.ITAV, BalanceStatus.CLAV];

/**
 * Whether the bank reported the account as a card when it was connected or linked
 * (`externalData.cashAccountType`, written by `fetchAccounts`). Keyed on the bank's
 * type, not on the account category, so a general account linked to a card follows
 * the same balance convention as one created as a credit card. Accounts connected
 * before the type was stored carry no flag and keep the balance as reported.
 */
export function isBankCardAccount({
  externalData,
}: {
  externalData: Record<string, unknown> | null | undefined;
}): boolean {
  return externalData?.cashAccountType === CashAccountType.CARD;
}

const parseAmount = ({ amount }: { amount: string | undefined }) => {
  const value = Number.parseFloat(amount ?? '');
  return Number.isFinite(value) ? Money.fromDecimal(value) : null;
};

/**
 * Card balance in the fork convention: what is owed is negative (`-792` = owes 792).
 *
 * Banks sign card balances inconsistently and Enable Banking balances carry no
 * credit/debit indicator, so the sign is normalised here. The balance is picked
 * with the usual priority (ITBD > CLBD > ITAV > CLAV), then:
 * - Available types (ITAV, CLAV, OPAV, FWAV) are spendable credit, not debt:
 *   `owed = creditLimit - available`, so the balance is `available - creditLimit`.
 *   Without a known limit the conversion is impossible and the amount is kept.
 * - A booked balance that is zero or negative is already "owed" and is kept.
 * - A positive booked balance is either a debt reported unsigned or a real credit
 *   in the customer's favour (overpayment). It is a debt unless an ITAV/CLAV balance
 *   in the same currency shows at least the whole limit still available (nothing
 *   owed, even counting holds). With no limit or no such balance the sign is kept,
 *   because nothing can corroborate flipping it.
 *
 * Returns null when the picked balance is missing or unparsable.
 */
export function resolveCardBalance({
  balances,
  creditLimit,
}: {
  balances: EnableBankingBalance[];
  creditLimit: Money;
}): Money | null {
  const picked = pickAccountBalance({ balances });
  const reported = parseAmount({ amount: picked?.balance_amount?.amount });
  if (!picked || !reported) return null;

  const hasLimit = creditLimit.isPositive();

  if (AVAILABLE_BALANCE_TYPES.includes(picked.balance_type)) {
    return hasLimit ? reported.subtract(creditLimit) : reported;
  }

  if (!reported.isPositive() || !hasLimit) return reported;

  const currency = picked.balance_amount.currency?.toUpperCase();
  const available = CORROBORATING_AVAILABLE_TYPES.map((type) =>
    balances.find(
      (balance) => balance.balance_type === type && balance.balance_amount?.currency?.toUpperCase() === currency,
    ),
  ).find((balance) => balance !== undefined);
  const availableAmount = parseAmount({ amount: available?.balance_amount.amount });
  if (!availableAmount) return reported;

  return availableAmount.lessThan(creditLimit) ? reported.negate() : reported;
}
