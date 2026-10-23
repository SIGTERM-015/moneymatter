import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallment } from '@root/serializers/card-installments.serializer';
import { resolveProposedInstallment } from '@services/credit-cards/installments/resolve-proposed-installment.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const installments = await resolveProposedInstallment({
    userId: user.id,
    installmentId: params.id,
    decision: 'confirm',
  });

  return { data: installments.map(serializeCardInstallment) };
});
