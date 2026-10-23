import { CARD_INSTALLMENTS_MAX_COUNT } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallmentPlan } from '@root/serializers/card-installments.serializer';
import { createInstallmentPlan } from '@services/credit-cards/installments/create-installment-plan.service';
import { z } from 'zod';

import {
  aprField,
  installmentsCountField,
  interestFreeMonthsField,
  monthString,
  planTitle,
  positiveMoney,
} from './installment-schemas';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z
    .object({
      title: planTitle(),
      principal: positiveMoney(),
      firstDueMonth: monthString(),
      installmentsCount: installmentsCountField().optional(),
      amounts: z.array(positiveMoney()).min(1).max(CARD_INSTALLMENTS_MAX_COUNT).optional(),
      apr: aprField().optional(),
      interestFreeMonths: interestFreeMonthsField().optional(),
      purchaseTransactionId: recordId().nullable().optional(),
    })
    .strict()
    .refine((body) => body.amounts !== undefined || body.installmentsCount !== undefined, {
      message: 'Send amounts or installmentsCount',
      path: ['installmentsCount'],
    })
    .refine((body) => !body.amounts || !body.installmentsCount || body.amounts.length === body.installmentsCount, {
      message: 'installmentsCount must equal the number of amounts',
      path: ['amounts'],
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const plan = await createInstallmentPlan({ userId: user.id, accountId: params.id, ...body });

  return { data: serializeCardInstallmentPlan(plan), statusCode: 201 };
});
