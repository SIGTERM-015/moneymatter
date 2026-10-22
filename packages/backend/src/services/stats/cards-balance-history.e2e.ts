import { ACCOUNT_CATEGORIES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, startOfDay, subDays } from 'date-fns';

const dayKey = (daysAgo: number) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');

describe('[Stats] Credit cards in combined balance history', () => {
  it('routes card balances into cardsBalance, keeps them out of accountsBalance and still counts them in the total', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.creditCard,
        initialBalance: -300,
        creditLimit: 2000,
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ from: dayKey(2), to: dayKey(0), raw: true });
    const today = data.find((entry) => entry.date === dayKey(0))!;

    expect(today.accountsBalance).toBe(1000);
    expect(today.cardsBalance).toBe(-300);
    expect(today.loansBalance).toBe(0);
    expect(today.totalBalance).toBe(700);
  });

  it('follows card spending day by day from the card transactions, not from an opening balance', async () => {
    const card = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.creditCard,
        initialBalance: 0,
        creditLimit: 1000,
      }),
      raw: true,
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: card.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: startOfDay(subDays(new Date(), 3)).toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: card.id,
        amount: 50,
        transactionType: TRANSACTION_TYPES.expense,
        time: startOfDay(subDays(new Date(), 1)).toISOString(),
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ from: dayKey(5), to: dayKey(0), raw: true });
    const byDate = new Map(data.map((entry) => [entry.date, entry]));

    expect(byDate.get(dayKey(5))!.cardsBalance).toBe(0);
    expect(byDate.get(dayKey(4))!.cardsBalance).toBe(0);
    expect(byDate.get(dayKey(3))!.cardsBalance).toBe(-100);
    expect(byDate.get(dayKey(2))!.cardsBalance).toBe(-100);
    expect(byDate.get(dayKey(1))!.cardsBalance).toBe(-150);
    expect(byDate.get(dayKey(0))!.cardsBalance).toBe(-150);
    for (const entry of data) {
      expect(entry.accountsBalance).toBe(0);
      expect(entry.totalBalance).toBe(entry.cardsBalance);
    }
  });

  it('keeps a non-card credit limit in accountsBalance and a card limit in cardsBalance when the setting is on', async () => {
    await helpers.updateUserSettings({
      raw: true,
      settings: { locale: 'en', includeCreditLimitInStats: true },
    });
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000, creditLimit: 400 }),
      raw: true,
    });
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.creditCard,
        initialBalance: 2500,
        creditLimit: 3000,
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ from: dayKey(1), to: dayKey(0), raw: true });
    const today = data.find((entry) => entry.date === dayKey(0))!;

    expect(today.accountsBalance).toBe(600);
    expect(today.cardsBalance).toBe(-500);
    expect(today.totalBalance).toBe(100);
  });

  it('leaves out cards excluded from stats', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    const card = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.creditCard,
        initialBalance: -300,
      }),
      raw: true,
    });
    await helpers.updateAccount({ id: card.id, payload: { excludeFromStats: true }, raw: true });

    const data = await helpers.getCombinedBalanceHistory({ from: dayKey(1), to: dayKey(0), raw: true });

    for (const entry of data) {
      expect(entry.cardsBalance).toBe(0);
      expect(entry.totalBalance).toBe(1000);
    }
  });

  it('matches the net-worth history, which still classifies the owed card balance as a liability', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.creditCard,
        initialBalance: -300,
      }),
      raw: true,
    });

    const from = dayKey(7);
    const to = dayKey(0);
    const [combined, netWorth] = await Promise.all([
      helpers.getCombinedBalanceHistory({ from, to, raw: true }),
      helpers.getNetWorthHistory({ from, to, granularity: 'weekly', raw: true }),
    ]);
    const lastNetWorth = netWorth.points[netWorth.points.length - 1]!;

    expect(lastNetWorth.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(-300);
    expect(lastNetWorth.assets.cash).toBe(1000);
    expect(combined[combined.length - 1]!.totalBalance).toBe(lastNetWorth.netWorth);
  });
});
