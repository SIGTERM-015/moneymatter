import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallmentPlan } from '@root/serializers/card-installments.serializer';
import { getInstallmentPlans } from '@services/credit-cards/installments/get-installment-plans.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const plans = await getInstallmentPlans({ userId: user.id, accountId: params.id });

  return { data: plans.map(serializeCardInstallmentPlan) };
});
