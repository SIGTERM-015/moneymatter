import type { CardMonthlySummaryApiResponse } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeCardInstallment } from '@root/serializers/card-installments.serializer';
import { getCardMonthlySummary } from '@services/credit-cards/installments/get-card-monthly-summary.service';
import { windowLastDay } from '@services/credit-cards/installments/installment-math';
import { z } from 'zod';

import { monthString } from './installment-schemas';

const schema = z.object({
  params: z.object({ id: recordId() }),
  query: z.object({ month: monthString() }),
});

export default createController(schema, async ({ user, params, query }) => {
  const summary = await getCardMonthlySummary({ userId: user.id, accountId: params.id, month: query.month });

  const data: CardMonthlySummaryApiResponse = {
    month: summary.month,
    statementFrom: summary.statement.from.toISOString().slice(0, 10),
    statementTo: windowLastDay({ toExclusive: summary.statement.toExclusive }),
    installmentsDue: summary.installmentsDue.toNumber(),
    statementSpend: summary.statement.spend.toNumber(),
    expectedTotal: summary.expectedTotal.toNumber(),
    installments: summary.installments.map((installment) => ({
      ...serializeCardInstallment(installment),
      planTitle: installment.plan.title,
    })),
  };

  return { data };
});
