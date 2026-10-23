import { CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ConflictError } from '@js/errors';
import { withTransaction } from '@services/common/with-transaction';

import { findOwnInstallment } from './find-own-installments';

/** The bank fixes each charge; only an installment not yet matched to a payment can change it. */
const updateInstallmentImpl = async ({
  userId,
  installmentId,
  amount,
}: {
  userId: number;
  installmentId: string;
  amount: Money;
}) => {
  const installment = await findOwnInstallment({ userId, installmentId });
  if (installment.status !== CARD_INSTALLMENT_STATUSES.pending) {
    throw new ConflictError({ message: t({ key: 'creditCards.installmentNotPending' }) });
  }

  return installment.update({ amount });
};

export const updateInstallment = withTransaction(updateInstallmentImpl);
