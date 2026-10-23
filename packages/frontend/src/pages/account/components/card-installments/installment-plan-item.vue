<script setup lang="ts">
import { deleteCardInstallmentPlan, updateCardInstallment } from '@/api/credit-cards';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { toLocalCurrencyNumber } from '@/js/helpers';
import * as validators from '@/js/helpers/validators';
import { cn } from '@/lib/utils';
import {
  CARD_INSTALLMENT_PLAN_STATUSES,
  CARD_INSTALLMENT_STATUSES,
  type CardInstallmentApiResponse,
  type CardInstallmentPlanApiResponse,
} from '@bt/shared/types';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon, Trash2Icon, XIcon } from '@lucide/vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { format, parse } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  plan: CardInstallmentPlanApiResponse;
  currencyCode: string;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isExpanded = ref(false);
const isDeleteOpen = ref(false);

const formatAmount = (value: number) =>
  `${toLocalCurrencyNumber(value, { currency: props.currencyCode })} ${props.currencyCode}`;
const formatMonth = (month: string) => format(parse(month, 'yyyy-MM', new Date()), 'LLL yyyy');

const progressPercent = computed(() => Math.round((props.plan.paidCount / props.plan.installmentsCount) * 100));
const isCompleted = computed(() => props.plan.status === CARD_INSTALLMENT_PLAN_STATUSES.completed);

const invalidate = () => queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

const deleteMutation = useMutation({
  mutationFn: () => deleteCardInstallmentPlan({ accountId: props.plan.accountId, planId: props.plan.id }),
  onSuccess: () => {
    invalidate();
    addSuccessNotification(t('pages.account.cardInstallments.deleteSuccess'));
  },
  onError: () => addErrorNotification(t('pages.account.cardInstallments.deleteError')),
});

const editingId = ref<string | null>(null);
const editingAmount = ref<number | null>(null);

const startEdit = (installment: CardInstallmentApiResponse) => {
  editingId.value = installment.id;
  editingAmount.value = installment.amount;
};

const isEditValid = computed(
  () =>
    editingAmount.value !== null &&
    validators.amount(editingAmount.value) &&
    validators.currencyDecimal(editingAmount.value),
);

const updateMutation = useMutation({
  mutationFn: ({ installmentId, amount }: { installmentId: string; amount: number }) =>
    updateCardInstallment({ installmentId, payload: { amount } }),
  onSuccess: () => {
    editingId.value = null;
    invalidate();
    addSuccessNotification(t('pages.account.cardInstallments.amountUpdateSuccess'));
  },
  onError: () => addErrorNotification(t('pages.account.cardInstallments.amountUpdateError')),
});

const saveEdit = () => {
  if (!editingId.value || !isEditValid.value) return;
  updateMutation.mutate({ installmentId: editingId.value, amount: Number(editingAmount.value) });
};

const STATUS_CLASSES: Record<CARD_INSTALLMENT_STATUSES, string> = {
  [CARD_INSTALLMENT_STATUSES.pending]: 'text-muted-foreground',
  [CARD_INSTALLMENT_STATUSES.proposed]: 'text-warning-text',
  [CARD_INSTALLMENT_STATUSES.paid]: 'text-success-text',
};
</script>

<template>
  <div class="grid gap-2" data-testid="installment-plan-item">
    <Collapsible.Collapsible v-model:open="isExpanded">
      <div class="flex items-start justify-between gap-2">
        <div class="grid min-w-0 gap-1">
          <span class="truncate font-medium">{{ plan.title }}</span>
          <span class="text-muted-foreground text-xs">
            {{
              $t('pages.account.cardInstallments.progress', {
                paid: plan.paidCount,
                total: plan.installmentsCount,
              })
            }}
            ·
            {{ $t('pages.account.cardInstallments.remaining', { amount: formatAmount(plan.remainingAmount) }) }}
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <span class="text-sm tabular-nums">{{ formatAmount(plan.principal) }}</span>
          <DesktopOnlyTooltip :content="$t('pages.account.cardInstallments.delete')">
            <Button
              variant="ghost-destructive"
              size="icon-sm"
              :aria-label="$t('pages.account.cardInstallments.delete')"
              @click="isDeleteOpen = true"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
          <Collapsible.CollapsibleTrigger as-child>
            <Button variant="ghost" size="icon-sm" :aria-label="$t('pages.account.cardInstallments.toggleSchedule')">
              <ChevronUpIcon v-if="isExpanded" class="size-4" />
              <ChevronDownIcon v-else class="size-4" />
            </Button>
          </Collapsible.CollapsibleTrigger>
        </div>
      </div>

      <div class="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
        <div
          :class="cn('h-full rounded-full', isCompleted ? 'bg-success' : 'bg-primary')"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>

      <p v-if="plan.estimatedInterest !== 0" class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.account.cardInstallments.estimatedInterest', { amount: formatAmount(plan.estimatedInterest) }) }}
      </p>

      <Collapsible.CollapsibleContent>
        <ul class="mt-2 grid gap-1">
          <li
            v-for="installment in plan.installments"
            :key="installment.id"
            class="flex min-h-9 items-center justify-between gap-2 text-sm"
          >
            <span>{{ formatMonth(installment.dueMonth) }}</span>

            <form v-if="editingId === installment.id" class="flex items-center gap-1" @submit.prevent="saveEdit">
              <InputField
                v-model="editingAmount"
                type="number"
                only-positive
                class="w-28"
                :placeholder="$t('pages.account.cardInstallments.form.amountPlaceholder')"
              />
              <DesktopOnlyTooltip :content="$t('pages.account.cardInstallments.saveAmount')">
                <Button
                  type="submit"
                  variant="ghost-success"
                  size="icon-sm"
                  :aria-label="$t('pages.account.cardInstallments.saveAmount')"
                  :disabled="!isEditValid || updateMutation.isPending.value"
                >
                  <CheckIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('common.actions.cancel')">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="$t('common.actions.cancel')"
                  @click="editingId = null"
                >
                  <XIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
            </form>

            <div v-else class="flex items-center gap-2">
              <span :class="cn('text-xs', STATUS_CLASSES[installment.status])">
                {{ $t(`pages.account.cardInstallments.status.${installment.status}`) }}
              </span>
              <span class="tabular-nums">{{ formatAmount(installment.amount) }}</span>
              <DesktopOnlyTooltip
                v-if="installment.status === CARD_INSTALLMENT_STATUSES.pending"
                :content="$t('pages.account.cardInstallments.editAmount')"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="$t('pages.account.cardInstallments.editAmount')"
                  @click="startEdit(installment)"
                >
                  <PencilIcon class="size-3.5" />
                </Button>
              </DesktopOnlyTooltip>
            </div>
          </li>
        </ul>
      </Collapsible.CollapsibleContent>
    </Collapsible.Collapsible>

    <ResponsiveAlertDialog
      v-model:open="isDeleteOpen"
      :confirm-label="$t('pages.account.cardInstallments.delete')"
      confirm-variant="destructive"
      @confirm="deleteMutation.mutate()"
    >
      <template #title>{{ $t('pages.account.cardInstallments.deleteTitle', { title: plan.title }) }}</template>
      <template #description>{{ $t('pages.account.cardInstallments.deleteDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>
