import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallment } from '@root/serializers/card-installments.serializer';
import { updateInstallment } from '@services/credit-cards/installments/update-installment.service';
import { z } from 'zod';

import { positiveMoney } from './installment-schemas';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({ amount: positiveMoney() }).strict(),
});

export default createController(schema, async ({ user, params, body }) => {
  const installment = await updateInstallment({ userId: user.id, installmentId: params.id, amount: body.amount });

  return { data: serializeCardInstallment(installment) };
});
