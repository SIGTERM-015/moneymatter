<script setup lang="ts">
import { createCardInstallmentPlan } from '@/api/credit-cards';
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable/form-validator';
import { toLocalCurrencyNumber } from '@/js/helpers';
import * as validators from '@/js/helpers/validators';
import {
  CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH,
  CARD_INSTALLMENTS_MAX_COUNT,
  CREDIT_CARD_APR_RANGE,
  CREDIT_CARD_MAX_INTEREST_FREE_MONTHS,
  type CreateCardInstallmentPlanBody,
  SORT_DIRECTIONS,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { addMonths, format } from 'date-fns';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { estimateInterest, proposeInstallmentAmounts } from './helpers';

const props = defineProps<{
  accountId: string;
  currencyCode: string;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isOpen = ref(false);

// Recent card expenses to link the plan to; older purchases are rarely deferred.
const RECENT_PURCHASES_LIMIT = 50;

const { data: recentPurchases } = useQuery({
  queryKey: computed(() => [VUE_QUERY_GLOBAL_PREFIXES.transactionChange, 'card-purchases', props.accountId]),
  queryFn: () =>
    loadTransactions({
      accountIds: [props.accountId],
      transactionType: TRANSACTION_TYPES.expense,
      excludeTransfer: true,
      isPlanned: false,
      order: SORT_DIRECTIONS.desc,
      limit: RECENT_PURCHASES_LIMIT,
    }),
  enabled: isOpen,
});

interface PurchaseOption {
  value: string;
  label: string;
  amount: number;
  note: string | null;
}

const purchaseOptions = computed<PurchaseOption[]>(() =>
  (recentPurchases.value ?? []).map((tx) => ({
    value: tx.id,
    label: `${format(new Date(tx.time), 'P')} · ${toLocalCurrencyNumber(tx.amount, { currency: props.currencyCode })} ${props.currencyCode}${tx.note ? ` · ${tx.note}` : ''}`,
    amount: tx.amount,
    note: tx.note,
  })),
);

const nextMonth = () => format(addMonths(new Date(), 1), 'yyyy-MM');

interface FormState {
  title: string;
  principal: number | null;
  count: number | null;
  firstDueMonth: string;
  apr: number | null;
  interestFreeMonths: number | null;
  purchase: PurchaseOption | null;
}

const form = reactive<FormState>({
  title: '',
  principal: null,
  count: 3,
  firstDueMonth: nextMonth(),
  apr: null,
  interestFreeMonths: null,
  purchase: null,
});

const amounts = ref<(number | null)[]>([]);

const toNullableNumber = (value: number | string | null) => (value === null || value === '' ? null : Number(value));

// The schedule follows principal, count and pricing until the user types a bank figure into it.
const amountsEdited = ref(false);
const proposedAmounts = computed(() =>
  proposeInstallmentAmounts({
    principal: toNullableNumber(form.principal),
    count: toNullableNumber(form.count),
    apr: toNullableNumber(form.apr),
    interestFreeMonths: toNullableNumber(form.interestFreeMonths),
  }),
);

watch(proposedAmounts, (next) => {
  if (amountsEdited.value && next.length === amounts.value.length) return;
  amountsEdited.value = false;
  amounts.value = [...next];
});

const setAmount = ({ index, value }: { index: number; value: number | string | null }) => {
  amounts.value[index] = toNullableNumber(value);
  amountsEdited.value = true;
};

const resetAmounts = () => {
  amountsEdited.value = false;
  amounts.value = [...proposedAmounts.value];
};

watch(
  () => form.purchase,
  (purchase) => {
    if (!purchase) return;
    if (form.principal === null || form.principal === undefined) form.principal = purchase.amount;
    if (!form.title && purchase.note) form.title = purchase.note.slice(0, CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH);
  },
);

const scheduleMonths = computed(() =>
  amounts.value.map((_, index) => {
    const [year = 0, month = 1] = form.firstDueMonth.split('-').map(Number);
    return format(addMonths(new Date(year, month - 1, 1), index), 'LLL yyyy');
  }),
);

const isBlank = (v: unknown) => v === null || v === undefined || v === '';
const optionalBetween =
  ({ min, max }: { min: number; max: number }) =>
  (v: unknown) =>
    isBlank(v) || (Number(v) >= min && Number(v) <= max);
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  {
    form: {
      title: { required: validators.required, maxLength: validators.maxLength(CARD_INSTALLMENT_PLAN_TITLE_MAX_LENGTH) },
      principal: {
        required: validators.required,
        amount: validators.amount,
        currencyDecimal: validators.currencyDecimal,
      },
      count: {
        required: validators.required,
        integer: validators.integer,
        range: helpersBetween({ min: 1, max: CARD_INSTALLMENTS_MAX_COUNT }),
      },
      firstDueMonth: {
        required: validators.required,
        month: validators.helpers.withMessage(
          () => t('pages.account.cardInstallments.form.errors.month'),
          (v: string) => MONTH_PATTERN.test(v),
        ),
      },
      apr: {
        range: validators.helpers.withMessage(
          () => t('pages.account.creditCard.errors.aprRange'),
          optionalBetween(CREDIT_CARD_APR_RANGE),
        ),
      },
      interestFreeMonths: {
        integer: validators.integer,
        range: validators.helpers.withMessage(
          () => t('pages.account.creditCard.errors.interestFreeMonthsRange'),
          optionalBetween({ min: 0, max: CREDIT_CARD_MAX_INTEREST_FREE_MONTHS }),
        ),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      amount: t('pages.account.cardInstallments.form.errors.positive'),
      currencyDecimal: t('forms.validators.invalidCurrencyDecimal'),
    },
  },
);

function helpersBetween({ min, max }: { min: number; max: number }) {
  return validators.helpers.withMessage(
    () => t('pages.account.cardInstallments.form.errors.countRange', { max }),
    (v: unknown) => isBlank(v) || (Number(v) >= min && Number(v) <= max),
  );
}

const amountsValid = computed(
  () =>
    amounts.value.length > 0 &&
    amounts.value.every((v) => v !== null && validators.amount(v) && validators.currencyDecimal(v)),
);

const interest = computed(() =>
  amountsValid.value && form.principal
    ? estimateInterest({ principal: Number(form.principal), amounts: amounts.value as number[] })
    : null,
);

const formatAmount = (value: number) =>
  `${toLocalCurrencyNumber(value, { currency: props.currencyCode })} ${props.currencyCode}`;

const resetForm = () => {
  Object.assign(form, {
    title: '',
    principal: null,
    count: 3,
    firstDueMonth: nextMonth(),
    apr: null,
    interestFreeMonths: null,
    purchase: null,
  });
  resetAmounts();
  resetValidation();
};

watch(isOpen, (open) => {
  if (open) resetForm();
});

const createMutation = useMutation({
  mutationFn: (payload: CreateCardInstallmentPlanBody) =>
    createCardInstallmentPlan({ accountId: props.accountId, payload }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    addSuccessNotification(t('pages.account.cardInstallments.form.createSuccess'));
    isOpen.value = false;
  },
  onError: () => {
    addErrorNotification(t('pages.account.cardInstallments.form.createError'));
  },
});

const submit = () => {
  if (!isFormValid() || !amountsValid.value) return;

  createMutation.mutate({
    title: form.title.trim(),
    principal: Number(form.principal),
    firstDueMonth: form.firstDueMonth,
    amounts: amounts.value as number[],
    apr: toNullableNumber(form.apr),
    interestFreeMonths: toNullableNumber(form.interestFreeMonths),
    purchaseTransactionId: (form.purchase?.value as CreateCardInstallmentPlanBody['purchaseTransactionId']) ?? null,
  });
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>
    <template #title>{{ $t('pages.account.cardInstallments.form.title') }}</template>
    <template #description>{{ $t('pages.account.cardInstallments.form.description') }}</template>

    <form class="@container/installment-form grid gap-4 py-2" @submit.prevent="submit">
      <SelectField
        v-model="form.purchase"
        :values="purchaseOptions"
        with-search
        clearable
        :search-keys="['label']"
        :label="$t('pages.account.cardInstallments.form.purchase')"
        :placeholder="$t('pages.account.cardInstallments.form.purchasePlaceholder')"
      />

      <InputField
        v-model="form.title"
        :label="$t('pages.account.cardInstallments.form.planTitle')"
        :placeholder="$t('pages.account.cardInstallments.form.planTitlePlaceholder')"
        :error-message="getFieldErrorMessage('form.title')"
        @blur="touchField('form.title')"
      />

      <div class="grid grid-cols-1 gap-4 @sm/installment-form:grid-cols-2">
        <InputField
          v-model="form.principal"
          type="number"
          only-positive
          :label="$t('pages.account.cardInstallments.form.principal')"
          :placeholder="$t('pages.account.cardInstallments.form.principalPlaceholder')"
          :error-message="getFieldErrorMessage('form.principal')"
          @blur="touchField('form.principal')"
        />
        <InputField
          v-model="form.count"
          type="number"
          only-positive
          :label="$t('pages.account.cardInstallments.form.count')"
          :placeholder="$t('pages.account.cardInstallments.form.countPlaceholder')"
          :error-message="getFieldErrorMessage('form.count')"
          @blur="touchField('form.count')"
        />
        <InputField
          v-model="form.firstDueMonth"
          type="month"
          :label="$t('pages.account.cardInstallments.form.firstDueMonth')"
          :placeholder="$t('pages.account.cardInstallments.form.firstDueMonthPlaceholder')"
          :error-message="getFieldErrorMessage('form.firstDueMonth')"
          @blur="touchField('form.firstDueMonth')"
        />
        <InputField
          v-model="form.apr"
          type="number"
          :label="$t('pages.account.cardInstallments.form.apr')"
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
          :label="$t('pages.account.cardInstallments.form.interestFreeMonths')"
          :placeholder="$t('pages.account.creditCard.interestFreeMonthsPlaceholder')"
          :error-message="getFieldErrorMessage('form.interestFreeMonths')"
          @blur="touchField('form.interestFreeMonths')"
        />
      </div>

      <div v-if="amounts.length" class="grid gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">{{ $t('pages.account.cardInstallments.form.schedule') }}</span>
          <Button v-if="amountsEdited" type="button" variant="link" size="sm" @click="resetAmounts">
            {{ $t('pages.account.cardInstallments.form.resetSchedule') }}
          </Button>
        </div>
        <p class="text-muted-foreground text-xs">{{ $t('pages.account.cardInstallments.form.scheduleHint') }}</p>
        <div class="grid grid-cols-1 gap-2 @sm/installment-form:grid-cols-2">
          <InputField
            v-for="(value, index) in amounts"
            :key="index"
            :model-value="value"
            type="number"
            only-positive
            :label="scheduleMonths[index]"
            :placeholder="$t('pages.account.cardInstallments.form.amountPlaceholder')"
            @update:model-value="(v) => setAmount({ index, value: v ?? null })"
          />
        </div>
        <p v-if="!amountsValid" class="text-destructive-text text-sm">
          {{ $t('pages.account.cardInstallments.form.errors.amounts') }}
        </p>
        <p v-else-if="interest !== null" class="text-muted-foreground text-sm">
          {{ $t('pages.account.cardInstallments.estimatedInterest', { amount: formatAmount(interest) }) }}
        </p>
      </div>

      <Button type="submit" :disabled="createMutation.isPending.value" :loading="createMutation.isPending.value">
        {{ $t('pages.account.cardInstallments.form.submit') }}
      </Button>
    </form>
  </ResponsiveDialog>
</template>
