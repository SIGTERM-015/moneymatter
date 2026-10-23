import {
  CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH,
  CARD_INSTALLMENTS_MAX_COUNT,
  CREDIT_CARD_APR_RANGE,
  CREDIT_CARD_MAX_INTEREST_FREE_MONTHS,
} from '@bt/shared/types';
import { boundedDecimalAmount } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { z } from 'zod';

/** `YYYY-MM` with a real month. */
export const monthString = () => z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Month must be YYYY-MM' });

/** A positive amount of at most two decimals, as Money. */
export const positiveMoney = () => boundedDecimalAmount({ positive: true }).transform((v) => Money.fromDecimal(v));

// DECIMAL(7,4) keeps four fractional digits; more would be rounded silently on write.
const APR_MAX_DECIMALS = 4;

export const aprField = () =>
  z
    .number()
    .min(CREDIT_CARD_APR_RANGE.min)
    .max(CREDIT_CARD_APR_RANGE.max)
    .refine((value) => Number(value.toFixed(APR_MAX_DECIMALS)) === value, {
      message: `APR allows at most ${APR_MAX_DECIMALS} decimal places`,
    })
    .nullable();

export const interestFreeMonthsField = () =>
  z.number().int().min(0).max(CREDIT_CARD_MAX_INTEREST_FREE_MONTHS).nullable();

export const planTitle = () => z.string().trim().min(1).max(CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH);

export const installmentsCountField = () => z.number().int().min(1).max(CARD_INSTALLMENTS_MAX_COUNT);
