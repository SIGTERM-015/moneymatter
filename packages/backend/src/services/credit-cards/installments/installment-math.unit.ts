import { splitInstallmentCents } from '@bt/shared/credit-cards/installment-split';
import { CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import {
  buildInstallmentMonths,
  classifyCardPayment,
  lastClosedStatementMonth,
  selectDueInstallments,
  statementWindow,
  windowLastDay,
} from './installment-math';

describe('splitInstallmentCents', () => {
  it('splits a principal equally and gives the leftover cents to the first installments', () => {
    expect(splitInstallmentCents({ principalCents: 10000, count: 3, apr: null, interestFreeMonths: null })).toEqual([
      3334, 3333, 3333,
    ]);
  });

  it('splits equally inside the interest-free window even with an APR', () => {
    expect(splitInstallmentCents({ principalCents: 90000, count: 3, apr: 20, interestFreeMonths: 3 })).toEqual([
      30000, 30000, 30000,
    ]);
  });

  it('prices a plan longer than the free window as an annuity at apr / 12', () => {
    // 1200.00 over 6 months at 12% APR (1% a month): 207.06 a month.
    expect(splitInstallmentCents({ principalCents: 120000, count: 6, apr: 12, interestFreeMonths: 3 })).toEqual([
      20706, 20706, 20706, 20706, 20706, 20706,
    ]);
  });

  it('treats a zero APR as interest free', () => {
    expect(splitInstallmentCents({ principalCents: 500, count: 2, apr: 0, interestFreeMonths: 0 })).toEqual([250, 250]);
  });
});

describe('buildInstallmentMonths', () => {
  it('schedules one installment per month across a year boundary', () => {
    expect(buildInstallmentMonths({ firstDueMonth: '2026-11', count: 4 })).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

describe('statementWindow', () => {
  const describeWindow = ({ statementDay, month }: { statementDay: number | null; month: string }) => {
    const window = statementWindow({ statementDay, month });
    return [window.from.toISOString().slice(0, 10), windowLastDay(window)];
  };

  it('runs from the day after the previous close to the close day', () => {
    expect(describeWindow({ statementDay: 25, month: '2026-10' })).toEqual(['2026-09-26', '2026-10-25']);
  });

  it('is the calendar month without a statement day', () => {
    expect(describeWindow({ statementDay: null, month: '2026-02' })).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('closes a short month on its last day', () => {
    expect(describeWindow({ statementDay: 31, month: '2026-03' })).toEqual(['2026-03-01', '2026-03-31']);
    expect(describeWindow({ statementDay: 30, month: '2026-03' })).toEqual(['2026-03-01', '2026-03-30']);
  });
});

describe('lastClosedStatementMonth', () => {
  it('is the current month once the close day is over', () => {
    expect(lastClosedStatementMonth({ statementDay: 25, date: new Date('2026-10-26T09:00:00Z') })).toBe('2026-10');
  });

  it('is the previous month on or before the close day', () => {
    expect(lastClosedStatementMonth({ statementDay: 25, date: new Date('2026-10-25T09:00:00Z') })).toBe('2026-09');
    expect(lastClosedStatementMonth({ statementDay: 25, date: new Date('2026-10-05T09:00:00Z') })).toBe('2026-09');
  });

  it('is the previous calendar month without a statement day', () => {
    expect(lastClosedStatementMonth({ statementDay: null, date: new Date('2026-10-05T09:00:00Z') })).toBe('2026-09');
  });
});

describe('selectDueInstallments', () => {
  const row = (dueMonth: string, cents: number, status = CARD_INSTALLMENT_STATUSES.pending) => ({
    dueMonth,
    amount: Money.fromCents(cents),
    status,
  });

  it('sums the pending installments due up to the month, overdue ones included', () => {
    const installments = [
      row('2026-09', 1000),
      row('2026-10', 2000),
      row('2026-10', 500, CARD_INSTALLMENT_STATUSES.paid),
      row('2026-10', 700, CARD_INSTALLMENT_STATUSES.proposed),
      row('2026-11', 3000),
    ];

    const { due, total } = selectDueInstallments({ installments, month: '2026-10' });

    expect(due).toEqual([installments[0], installments[1]]);
    expect(total.toCents()).toBe(3000);
  });

  it('is zero with nothing due', () => {
    expect(selectDueInstallments({ installments: [row('2026-11', 3000)], month: '2026-10' }).total.toCents()).toBe(0);
  });
});

describe('classifyCardPayment', () => {
  const money = (cents: number) => Money.fromCents(cents);

  it('pays when the transfer equals what is due and nothing else has that amount', () => {
    expect(classifyCardPayment({ amount: money(15000), due: money(15000), statementSpend: money(40000) })).toBe('paid');
  });

  it('proposes when the statement spend is the same amount', () => {
    expect(classifyCardPayment({ amount: money(15000), due: money(15000), statementSpend: money(15000) })).toBe(
      'proposed',
    );
  });

  it('ignores a transfer that does not equal what is due', () => {
    expect(classifyCardPayment({ amount: money(15001), due: money(15000), statementSpend: money(15001) })).toBe('none');
  });

  it('ignores any transfer when nothing is due', () => {
    expect(classifyCardPayment({ amount: money(0), due: money(0), statementSpend: money(0) })).toBe('none');
  });
});
