import { CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ConflictError } from '@js/errors';
import CardInstallments from '@models/card-installments.model';
import { findOneTransaction } from '@models/transactions-query';
import { withTransaction } from '@services/common/with-transaction';

import { findOwnInstallment } from './find-own-installments';
import { refreshPlanStatuses } from './refresh-plan-statuses';

/**
 * Settles an ambiguous match. A transfer proposes every installment it could pay at once, and
 * only the whole set adds up to it, so confirming or rejecting one installment resolves all
 * installments proposed by the same transfer. A rejection is remembered so the transfer is not
 * proposed again; it stays an ordinary card payment.
 */
const resolveProposedInstallmentImpl = async ({
  userId,
  installmentId,
  decision,
}: {
  userId: number;
  installmentId: string;
  decision: 'confirm' | 'reject';
}) => {
  const installment = await findOwnInstallment({ userId, installmentId });
  if (installment.status !== CARD_INSTALLMENT_STATUSES.proposed || !installment.paidTransactionId) {
    throw new ConflictError({ message: t({ key: 'creditCards.installmentNotProposed' }) });
  }

  const transactionId = installment.paidTransactionId;
  const group = await CardInstallments.findAll({
    where: { paidTransactionId: transactionId, status: CARD_INSTALLMENT_STATUSES.proposed },
    attributes: ['id', 'planId'],
  });
  const ids = group.map((row) => row.id);

  if (decision === 'confirm') {
    // The installment's own transfer, already tied to the user's card by the match.
    const payment = await findOneTransaction({
      planned: 'include',
      access: 'unscoped-internal',
      balanceAdjustments: 'include',
      where: { id: transactionId },
      attributes: ['id', 'time'],
    });
    await CardInstallments.update(
      { status: CARD_INSTALLMENT_STATUSES.paid, paidAt: payment ? new Date(payment.time) : new Date() },
      { where: { id: ids } },
    );
  } else {
    await CardInstallments.update(
      {
        status: CARD_INSTALLMENT_STATUSES.pending,
        paidTransactionId: null,
        paidAt: null,
        rejectedTransactionId: transactionId,
      },
      { where: { id: ids } },
    );
  }

  await refreshPlanStatuses({ planIds: group.map((row) => row.planId) });

  return CardInstallments.findAll({ where: { id: ids }, order: [['dueMonth', 'ASC']] });
};

export const resolveProposedInstallment = withTransaction(resolveProposedInstallmentImpl);
