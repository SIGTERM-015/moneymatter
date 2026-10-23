import type {
  CardInstallmentApiResponse,
  CardInstallmentPlanApiResponse,
  CardMonthlySummaryApiResponse,
  CreateCardInstallmentPlanBody,
  CreditCardDetailsApiResponse,
  UpdateCardInstallmentBody,
  UpdateCardInstallmentPlanBody,
  UpsertCreditCardDetailsBody,
} from '@bt/shared/types';

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

export async function createCardInstallmentPlan<R extends boolean | undefined = undefined>({
  accountId,
  payload,
  raw,
}: {
  accountId: string;
  payload: CreateCardInstallmentPlanBody | Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<CardInstallmentPlanApiResponse, R>({
    method: 'post',
    url: `/accounts/${accountId}/credit-card/installments`,
    payload,
    raw,
  });
}

export async function getCardInstallmentPlans<R extends boolean | undefined = undefined>({
  accountId,
  raw,
}: {
  accountId: string;
  raw?: R;
}) {
  return makeRequest<CardInstallmentPlanApiResponse[], R>({
    method: 'get',
    url: `/accounts/${accountId}/credit-card/installments`,
    raw,
  });
}

export async function updateCardInstallmentPlan<R extends boolean | undefined = undefined>({
  accountId,
  planId,
  payload,
  raw,
}: {
  accountId: string;
  planId: string;
  payload: UpdateCardInstallmentPlanBody | Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<CardInstallmentPlanApiResponse, R>({
    method: 'patch',
    url: `/accounts/${accountId}/credit-card/installments/${planId}`,
    payload,
    raw,
  });
}

export async function deleteCardInstallmentPlan({ accountId, planId }: { accountId: string; planId: string }) {
  return makeRequest<undefined, false>({
    method: 'delete',
    url: `/accounts/${accountId}/credit-card/installments/${planId}`,
  });
}

export async function updateCardInstallment<R extends boolean | undefined = undefined>({
  installmentId,
  payload,
  raw,
}: {
  installmentId: string;
  payload: UpdateCardInstallmentBody | Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<CardInstallmentApiResponse, R>({
    method: 'patch',
    url: `/credit-card/installments/${installmentId}`,
    payload,
    raw,
  });
}

export async function resolveCardInstallment<R extends boolean | undefined = undefined>({
  installmentId,
  decision,
  raw,
}: {
  installmentId: string;
  decision: 'confirm' | 'reject';
  raw?: R;
}) {
  return makeRequest<CardInstallmentApiResponse[], R>({
    method: 'post',
    url: `/credit-card/installments/${installmentId}/${decision}`,
    raw,
  });
}

export async function getCardMonthlySummary<R extends boolean | undefined = undefined>({
  accountId,
  month,
  raw,
}: {
  accountId: string;
  month: string;
  raw?: R;
}) {
  return makeRequest<CardMonthlySummaryApiResponse, R>({
    method: 'get',
    url: `/accounts/${accountId}/credit-card/summary`,
    payload: { month },
    raw,
  });
}
