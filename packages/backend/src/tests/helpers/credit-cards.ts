import type { CreditCardDetailsApiResponse, UpsertCreditCardDetailsBody } from '@bt/shared/types';

import { makeRequest } from './common';

export async function getCreditCardDetails<R extends boolean | undefined = undefined>({
  accountId,
  raw,
}: {
  accountId: string;
  raw?: R;
}) {
  return makeRequest<CreditCardDetailsApiResponse, R>({
    method: 'get',
    url: `/accounts/${accountId}/credit-card`,
    raw,
  });
}

export async function upsertCreditCardDetails<R extends boolean | undefined = undefined>({
  accountId,
  payload,
  raw,
}: {
  accountId: string;
  payload: UpsertCreditCardDetailsBody | Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<CreditCardDetailsApiResponse, R>({
    method: 'put',
    url: `/accounts/${accountId}/credit-card`,
    payload,
    raw,
  });
}
