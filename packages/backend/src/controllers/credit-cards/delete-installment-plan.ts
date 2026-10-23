import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteInstallmentPlan } from '@services/credit-cards/installments/delete-installment-plan.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId(), planId: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  await deleteInstallmentPlan({ userId: user.id, accountId: params.id, planId: params.planId });

  return { statusCode: 204 };
});
