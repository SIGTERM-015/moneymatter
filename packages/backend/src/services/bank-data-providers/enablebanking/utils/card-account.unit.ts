import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { BalanceStatus, type EnableBankingBalance } from '../types';
import { isBankCardAccount, resolveCardBalance } from './card-account';

const balance = ({ type, amount, currency = 'EUR' }: { type: BalanceStatus; amount: string; currency?: string }) =>
  ({ balance_type: type, balance_amount: { amount, currency } }) as EnableBankingBalance;

const limit1500 = Money.fromDecimal(1500);

describe('resolveCardBalance', () => {
  it('keeps a booked balance that is already negative', () => {
    const balances = [balance({ type: BalanceStatus.ITBD, amount: '-792.00' })];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(-79_200);
  });

  it('turns a positive booked balance into debt when the available balance shows credit is in use', () => {
    const balances = [
      balance({ type: BalanceStatus.CLBD, amount: '792.00' }),
      balance({ type: BalanceStatus.ITAV, amount: '708.00' }),
    ];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(-79_200);
  });

  it('keeps a positive booked balance as credit when the whole limit is still available', () => {
    const balances = [
      balance({ type: BalanceStatus.ITBD, amount: '40.00' }),
      balance({ type: BalanceStatus.ITAV, amount: '1540.00' }),
    ];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(4_000);
  });

  it('treats the available balance of an unused card as zero owed', () => {
    const balances = [balance({ type: BalanceStatus.ITAV, amount: '1500.00' })];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(0);
  });

  it.each([
    [BalanceStatus.ITAV, '708.00'],
    [BalanceStatus.CLAV, '708.00'],
    [BalanceStatus.OPAV, '708.00'],
  ])('derives debt as limit minus available when only a %s balance is reported', (type, amount) => {
    const balances = [balance({ type, amount })];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(-79_200);
  });

  it('prefers the booked balance over the available one', () => {
    const balances = [
      balance({ type: BalanceStatus.ITAV, amount: '700.00' }),
      balance({ type: BalanceStatus.ITBD, amount: '-792.00' }),
    ];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(-79_200);
  });

  it('keeps the reported amount when an available balance cannot be converted without a limit', () => {
    const balances = [balance({ type: BalanceStatus.ITAV, amount: '708.00' })];
    expect(resolveCardBalance({ balances, creditLimit: Money.zero() })?.toCents()).toBe(70_800);
  });

  it('keeps a positive booked balance when there is nothing to corroborate it', () => {
    const balances = [balance({ type: BalanceStatus.ITBD, amount: '792.00' })];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(79_200);
    expect(resolveCardBalance({ balances, creditLimit: Money.zero() })?.toCents()).toBe(79_200);
  });

  it('ignores an available balance in another currency when judging the sign', () => {
    const balances = [
      balance({ type: BalanceStatus.ITBD, amount: '792.00' }),
      balance({ type: BalanceStatus.ITAV, amount: '708.00', currency: 'USD' }),
    ];
    expect(resolveCardBalance({ balances, creditLimit: limit1500 })?.toCents()).toBe(79_200);
  });

  it('returns null when the bank reports no usable balance', () => {
    expect(resolveCardBalance({ balances: [], creditLimit: limit1500 })).toBeNull();
    expect(
      resolveCardBalance({ balances: [balance({ type: BalanceStatus.ITBD, amount: 'N/A' })], creditLimit: limit1500 }),
    ).toBeNull();
  });
});

describe('isBankCardAccount', () => {
  it('is true only for accounts the bank reported as CARD', () => {
    expect(isBankCardAccount({ externalData: { cashAccountType: 'CARD' } })).toBe(true);
    expect(isBankCardAccount({ externalData: { cashAccountType: 'LOAN' } })).toBe(false);
    expect(isBankCardAccount({ externalData: {} })).toBe(false);
    expect(isBankCardAccount({ externalData: null })).toBe(false);
  });
});
