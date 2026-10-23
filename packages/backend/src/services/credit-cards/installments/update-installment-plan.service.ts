import type { RecordId } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import { withTransaction } from '@services/common/with-transaction';

import { assertDeferrablePurchase } from './create-installment-plan.service';
import { findOwnInstallmentPlan } from './find-own-installments';

/** Plan metadata only; the schedule is edited one pending installment at a time. */
const updateInstallmentPlanImpl = async ({
  userId,
  accountId,
  planId,
  ...fields
}: {
  userId: number;
  accountId: string;
  planId: string;
  title?: string;
  apr?: number | null;
  interestFreeMonths?: number | null;
  purchaseTransactionId?: RecordId | null;
}) => {
  const plan = await findOwnInstallmentPlan({ userId, accountId, planId });

  if (fields.purchaseTransactionId) {
    await assertDeferrablePurchase({
      userId,
      accountId: plan.accountId,
      purchaseTransactionId: fields.purchaseTransactionId,
      ignorePlanId: plan.id,
    });
  }

  await plan.update(removeUndefinedKeys(fields));

  return findOwnInstallmentPlan({ userId, accountId, planId });
};

export const updateInstallmentPlan = withTransaction(updateInstallmentPlanImpl);
