import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallmentPlan } from '@root/serializers/card-installments.serializer';
import { updateInstallmentPlan } from '@services/credit-cards/installments/update-installment-plan.service';
import { z } from 'zod';

import { aprField, interestFreeMonthsField, planTitle } from './installment-schemas';

const schema = z.object({
  params: z.object({ id: recordId(), planId: recordId() }),
  body: z
    .object({
      title: planTitle().optional(),
      apr: aprField().optional(),
      interestFreeMonths: interestFreeMonthsField().optional(),
      purchaseTransactionId: recordId().nullable().optional(),
    })
    .strict(),
});

export default createController(schema, async ({ user, params, body }) => {
  const plan = await updateInstallmentPlan({ userId: user.id, accountId: params.id, planId: params.planId, ...body });

  return { data: serializeCardInstallmentPlan(plan) };
});
