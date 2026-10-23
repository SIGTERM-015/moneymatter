<script setup lang="ts">
import { getCreditCardDetails, upsertCreditCardDetails } from '@/api/credit-cards';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Separator } from '@/components/lib/ui/separator';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable/form-validator';
import { toLocalCurrencyNumber } from '@/js/helpers';
import {
  type AccountModel,
  CREDIT_CARD_APR_RANGE,
  CREDIT_CARD_DAY_OF_MONTH_RANGE,
  CREDIT_CARD_MAX_INTEREST_FREE_MONTHS,
  type CreditCardDetailsApiResponse,
  type UpsertCreditCardDetailsBody,
} from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { helpers, integer } from '@vuelidate/validators';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
  currencyCode: string;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

// Balance and limit are part of the key, so a transaction or a limit edit refetches the position.
const queryKey = computed(() => [
  ...VUE_QUERY_CACHE_KEYS.creditCardDetails,
  props.account.id,
  props.account.currentBalance,
  props.account.creditLimit,
]);

const {
  data: details,
  isPending,
  isError,
} = useQuery({
  queryKey,
  queryFn: () => getCreditCardDetails({ accountId: props.account.id }),
  // Keeps the panel steady while the position refetches, but never shows another card's data.
  placeholderData: (previous) => (previous?.accountId === props.account.id ? previous : undefined),
});

interface FormState {
  statementDay: number | null;
  paymentDay: number | null;
  apr: number | null;
  interestFreeMonths: number | null;
}

const form = reactive<FormState>({ statementDay: null, paymentDay: null, apr: null, interestFreeMonths: 0 });

// Server values the form was last filled from: the reference for unsaved edits.
const formSource = ref<CreditCardDetailsApiResponse | null>(null);

const fillForm = (value: CreditCardDetailsApiResponse | undefined) => {
  formSource.value = value ?? null;
  form.statementDay = value?.statementDay ?? null;
  form.paymentDay = value?.paymentDay ?? null;
  form.apr = value?.apr ?? null;
  form.interestFreeMonths = value?.interestFreeMonths ?? 0;
};

const toNullableNumber = (value: number | string | null) => (value === null || value === '' ? null : Number(value));

const buildPayload = (): UpsertCreditCardDetailsBody => ({
  statementDay: toNullableNumber(form.statementDay),
  paymentDay: toNullableNumber(form.paymentDay),
  apr: toNullableNumber(form.apr),
  interestFreeMonths: toNullableNumber(form.interestFreeMonths) ?? 0,
});

const differsFrom = (value: CreditCardDetailsApiResponse) => {
  const payload = buildPayload();
  return (
    payload.statementDay !== value.statementDay ||
    payload.paymentDay !== value.paymentDay ||
    payload.apr !== value.apr ||
    payload.interestFreeMonths !== value.interestFreeMonths
  );
};

// The query refetches on focus and whenever the balance or limit moves; a refetch must not
// wipe edits the user has not saved yet, so the form only follows the server while it is clean.
// Another card's data always replaces the form: this component is reused across cards.
watch(
  details,
  (next) => {
    if (!next) return;
    const source = formSource.value;
    if (source && source.accountId === next.accountId && differsFrom(source)) return;
    fillForm(next);
  },
  { immediate: true },
);

// The API stores APR as DECIMAL(7,4) and rejects anything finer.
const APR_MAX_DECIMALS = 4;

const isBlank = (v: unknown) => v === null || v === undefined || v === '';

const optionalBetween =
  ({ min, max }: { min: number; max: number }) =>
  (v: unknown) =>
    isBlank(v) || (Number(v) >= min && Number(v) <= max);

const isValidApr = (v: unknown) =>
  optionalBetween(CREDIT_CARD_APR_RANGE)(v) &&
  (isBlank(v) || Number(Number(v).toFixed(APR_MAX_DECIMALS)) === Number(v));

const dayRule = {
  integer,
  range: helpers.withMessage(
    () => t('pages.account.creditCard.errors.dayRange'),
    optionalBetween(CREDIT_CARD_DAY_OF_MONTH_RANGE),
  ),
};

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  {
    form: {
      statementDay: dayRule,
      paymentDay: dayRule,
      apr: {
        range: helpers.withMessage(() => t('pages.account.creditCard.errors.aprRange'), isValidApr),
      },
      interestFreeMonths: {
        integer,
        range: helpers.withMessage(
          () => t('pages.account.creditCard.errors.interestFreeMonthsRange'),
          optionalBetween({ min: 0, max: CREDIT_CARD_MAX_INTEREST_FREE_MONTHS }),
        ),
      },
    },
  },
);

const isDirty = computed(() => !!details.value && differsFrom(details.value));

const saveMutation = useMutation({
  mutationFn: (payload: UpsertCreditCardDetailsBody) =>
    upsertCreditCardDetails({ accountId: props.account.id, payload }),
  onSuccess: (saved) => {
    // The response is the full read model, so it replaces the cached query without a refetch.
    fillForm(saved);
    queryClient.setQueryData(queryKey.value, saved);
    resetValidation();
    addSuccessNotification(t('pages.account.creditCard.saveSuccess'));
  },
  onError: () => {
    addErrorNotification(t('pages.account.creditCard.saveError'));
  },
});

const save = () => {
  if (!isFormValid() || !isDirty.value) return;
  saveMutation.mutate(buildPayload());
};

const formatAmount = (value: number) =>
  `${toLocalCurrencyNumber(value, { currency: props.currencyCode })} ${props.currencyCode}`;

const positionRows = computed(() =>
  details.value
    ? [
        { key: 'used', label: t('pages.account.creditCard.used'), value: details.value.used },
        { key: 'available', label: t('pages.account.creditCard.available'), value: details.value.available },
        { key: 'limit', label: t('pages.account.creditCard.limit'), value: details.value.creditLimit },
      ]
    : [],
);
</script>

<template>
  <section class="@container/credit-card grid gap-4" data-testid="credit-card-section">
    <h3 class="text-sm font-semibold">{{ $t('pages.account.creditCard.title') }}</h3>

    <div v-if="isPending" class="grid gap-2">
      <div v-for="i in 3" :key="i" class="bg-muted h-5 w-full animate-pulse rounded" />
    </div>

    <p v-else-if="isError" class="text-destructive-text text-sm">{{ $t('pages.account.creditCard.loadError') }}</p>

    <template v-else>
      <div class="grid gap-2 text-sm">
        <div v-for="row in positionRows" :key="row.key" class="flex items-center justify-between gap-2">
          <span>{{ row.label }}</span>
          <span class="tabular-nums">{{ formatAmount(row.value) }}</span>
        </div>
      </div>

      <Separator />

      <form class="grid gap-4" @submit.prevent="save">
        <div class="grid grid-cols-1 gap-4 @sm/credit-card:grid-cols-2">
          <InputField
            v-model="form.statementDay"
            type="number"
            :label="$t('pages.account.creditCard.statementDay')"
            :placeholder="$t('pages.account.creditCard.dayPlaceholder')"
            :error-message="getFieldErrorMessage('form.statementDay')"
            @blur="touchField('form.statementDay')"
          />
          <InputField
            v-model="form.paymentDay"
            type="number"
            :label="$t('pages.account.creditCard.paymentDay')"
            :placeholder="$t('pages.account.creditCard.dayPlaceholder')"
            :error-message="getFieldErrorMessage('form.paymentDay')"
            @blur="touchField('form.paymentDay')"
          />
          <InputField
            v-model="form.apr"
            type="number"
            :label="$t('pages.account.creditCard.apr')"
            :placeholder="$t('pages.account.creditCard.aprPlaceholder')"
            :error-message="getFieldErrorMessage('form.apr')"
            @blur="touchField('form.apr')"
          >
            <template #iconTrailing>
              <span class="text-muted-foreground text-sm">%</span>
            </template>
          </InputField>
          <InputField
            v-model="form.interestFreeMonths"
            type="number"
            :label="$t('pages.account.creditCard.interestFreeMonths')"
            :placeholder="$t('pages.account.creditCard.interestFreeMonthsPlaceholder')"
            :error-message="getFieldErrorMessage('form.interestFreeMonths')"
            @blur="touchField('form.interestFreeMonths')"
          />
        </div>

        <Button
          type="submit"
          :disabled="!isDirty || saveMutation.isPending.value"
          :loading="saveMutation.isPending.value"
        >
          {{ $t('pages.account.creditCard.save') }}
        </Button>
      </form>
    </template>
  </section>
</template>
