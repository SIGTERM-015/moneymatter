import { CARD_INSTALLMENT_PLAN_STATUSES, CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import CardInstallmentPlans from '@models/card-installment-plans.model';
import CardInstallments from '@models/card-installments.model';
import { Op } from 'sequelize';

/** A plan is completed exactly when every installment is paid. */
export const refreshPlanStatuses = async ({ planIds }: { planIds: string[] }) => {
  const ids = [...new Set(planIds)];
  if (!ids.length) return;

  const open = await CardInstallments.findAll({
    where: { planId: { [Op.in]: ids }, status: { [Op.ne]: CARD_INSTALLMENT_STATUSES.paid } },
    attributes: ['planId'],
  });
  const openIds = new Set<string>(open.map((row) => row.planId));

  const completedIds = ids.filter((id) => !openIds.has(id));
  const activeIds = ids.filter((id) => openIds.has(id));

  if (completedIds.length) {
    await CardInstallmentPlans.update(
      { status: CARD_INSTALLMENT_PLAN_STATUSES.completed },
      { where: { id: { [Op.in]: completedIds } } },
    );
  }
  if (activeIds.length) {
    await CardInstallmentPlans.update(
      { status: CARD_INSTALLMENT_PLAN_STATUSES.active },
      { where: { id: { [Op.in]: activeIds } } },
    );
  }
};
