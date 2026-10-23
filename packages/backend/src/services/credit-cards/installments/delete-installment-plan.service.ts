import { withTransaction } from '@services/common/with-transaction';

import { findOwnInstallmentPlan } from './find-own-installments';

/** Deleting a plan only drops its schedule; the purchase and any payments stay on the card. */
const deleteInstallmentPlanImpl = async ({
  userId,
  accountId,
  planId,
}: {
  userId: number;
  accountId: string;
  planId: string;
}) => {
  const plan = await findOwnInstallmentPlan({ userId, accountId, planId });
  await plan.destroy();
};

export const deleteInstallmentPlan = withTransaction(deleteInstallmentPlanImpl);
