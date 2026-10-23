import { api } from '@/api/_api';
import type {
  CardInstallmentApiResponse,
  CardInstallmentPlanApiResponse,
  CardMonthlySummaryApiResponse,
  CreateCardInstallmentPlanBody,
  CreditCardDetailsApiResponse,
  UpdateCardInstallmentBody,
  UpsertCreditCardDetailsBody,
} from '@bt/shared/types';

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

/** Deferred purchases on the card with their schedule and progress, oldest first. */
export const getCardInstallmentPlans = async ({
  accountId,
}: {
  accountId: string;
}): Promise<CardInstallmentPlanApiResponse[]> => api.get(`/accounts/${accountId}/credit-card/installments`);

export const createCardInstallmentPlan = async ({
  accountId,
  payload,
}: {
  accountId: string;
  payload: CreateCardInstallmentPlanBody;
}): Promise<CardInstallmentPlanApiResponse> => api.post(`/accounts/${accountId}/credit-card/installments`, payload);

export const deleteCardInstallmentPlan = async ({
  accountId,
  planId,
}: {
  accountId: string;
  planId: string;
}): Promise<void> => api.delete(`/accounts/${accountId}/credit-card/installments/${planId}`);

/** Only a pending installment can change its amount. */
export const updateCardInstallment = async ({
  installmentId,
  payload,
}: {
  installmentId: string;
  payload: UpdateCardInstallmentBody;
}): Promise<CardInstallmentApiResponse> => api.patch(`/credit-card/installments/${installmentId}`, payload);

/** Confirms or rejects every installment the same transfer proposed to pay. */
export const resolveCardInstallment = async ({
  installmentId,
  decision,
}: {
  installmentId: string;
  decision: 'confirm' | 'reject';
}): Promise<CardInstallmentApiResponse[]> => api.post(`/credit-card/installments/${installmentId}/${decision}`);

/** `month` is `YYYY-MM`. */
export const getCardMonthlySummary = async ({
  accountId,
  month,
}: {
  accountId: string;
  month: string;
}): Promise<CardMonthlySummaryApiResponse> => api.get(`/accounts/${accountId}/credit-card/summary`, { month });
