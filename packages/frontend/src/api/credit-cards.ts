import { api } from '@/api/_api';
import type { CreditCardDetailsApiResponse, UpsertCreditCardDetailsBody } from '@bt/shared/types';

/** Card billing terms plus the credit position (decimals in the card's currency). */
export const getCreditCardDetails = async ({
  accountId,
}: {
  accountId: string;
}): Promise<CreditCardDetailsApiResponse> => api.get(`/accounts/${accountId}/credit-card`);

/** Absent fields keep their stored value; `null` clears a nullable one. */
export const upsertCreditCardDetails = async ({
  accountId,
  payload,
}: {
  accountId: string;
  payload: UpsertCreditCardDetailsBody;
}): Promise<CreditCardDetailsApiResponse> => api.put(`/accounts/${accountId}/credit-card`, payload);
