import {
  CREDIT_CARD_APR_RANGE,
  CREDIT_CARD_DAY_OF_MONTH_RANGE,
  CREDIT_CARD_MAX_INTEREST_FREE_MONTHS,
} from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCreditCardDetails } from '@root/serializers/credit-cards.serializer';
import { upsertCreditCardDetails } from '@services/credit-cards/upsert-credit-card-details.service';
import { z } from 'zod';

const dayOfMonth = () =>
  z.number().int().min(CREDIT_CARD_DAY_OF_MONTH_RANGE.min).max(CREDIT_CARD_DAY_OF_MONTH_RANGE.max).nullable();

// DECIMAL(7,4) keeps four fractional digits; more would be rounded silently on write.
const APR_MAX_DECIMALS = 4;
const hasAtMostDecimals = (value: number) => Number(value.toFixed(APR_MAX_DECIMALS)) === value;

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z
    .object({
      statementDay: dayOfMonth().optional(),
      paymentDay: dayOfMonth().optional(),
      apr: z
        .number()
        .min(CREDIT_CARD_APR_RANGE.min)
        .max(CREDIT_CARD_APR_RANGE.max)
        .refine(hasAtMostDecimals, { message: `APR allows at most ${APR_MAX_DECIMALS} decimal places` })
        .nullable()
        .optional(),
      interestFreeMonths: z.number().int().min(0).max(CREDIT_CARD_MAX_INTEREST_FREE_MONTHS).optional(),
    })
    .strict(),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await upsertCreditCardDetails({ userId: user.id, accountId: params.id, ...body });

  return { data: serializeCreditCardDetails(result) };
});
