import { describe, expect, it } from 'vitest';

import { estimateInterest, proposeInstallmentAmounts } from './helpers';

describe('proposeInstallmentAmounts', () => {
  it('splits the principal equally, leftover cents first', () => {
    expect(proposeInstallmentAmounts({ principal: 100, count: 3, apr: null, interestFreeMonths: null })).toEqual([
      33.34, 33.33, 33.33,
    ]);
  });

  it('prices a plan past the interest-free window with the APR', () => {
    expect(proposeInstallmentAmounts({ principal: 1200, count: 6, apr: 12, interestFreeMonths: 3 })).toEqual([
      207.06, 207.06, 207.06, 207.06, 207.06, 207.06,
    ]);
  });

  it('is empty until principal and count are valid', () => {
    expect(proposeInstallmentAmounts({ principal: null, count: 3, apr: null, interestFreeMonths: null })).toEqual([]);
    expect(proposeInstallmentAmounts({ principal: 100, count: 0, apr: null, interestFreeMonths: null })).toEqual([]);
    expect(proposeInstallmentAmounts({ principal: 100, count: 2.5, apr: null, interestFreeMonths: null })).toEqual([]);
    expect(proposeInstallmentAmounts({ principal: 100, count: 121, apr: null, interestFreeMonths: null })).toEqual([]);
  });
});

describe('estimateInterest', () => {
  it('is the schedule total over the principal, free of float noise', () => {
    expect(estimateInterest({ principal: 0.3, amounts: [0.1, 0.2, 0.1] })).toBe(0.1);
    expect(estimateInterest({ principal: 450, amounts: [150, 150, 150] })).toBe(0);
  });
});
