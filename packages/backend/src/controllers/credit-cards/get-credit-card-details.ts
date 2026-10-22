import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCreditCardDetails } from '@root/serializers/credit-cards.serializer';
import { getCreditCardDetails } from '@services/credit-cards/get-credit-card-details.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const result = await getCreditCardDetails({ userId: user.id, accountId: params.id });

  return { data: serializeCreditCardDetails(result) };
});
