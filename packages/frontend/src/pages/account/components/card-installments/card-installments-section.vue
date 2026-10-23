<script setup lang="ts">
import { getCardInstallmentPlans, getCardMonthlySummary, resolveCardInstallment } from '@/api/credit-cards';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { Separator } from '@/components/lib/ui/separator';
import { useNotificationCenter } from '@/components/notification-center';
import { toLocalCurrencyNumber } from '@/js/helpers';
import { CARD_INSTALLMENT_STATUSES } from '@bt/shared/types';
import { CalendarClockIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from '@lucide/vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { addMonths, format, parse } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CreateInstallmentPlanDialog from './create-installment-plan-dialog.vue';
import InstallmentPlanItem from './installment-plan-item.vue';

const props = defineProps<{
  accountId: string;
  currencyCode: string;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const formatAmount = (value: number) =>
  `${toLocalCurrencyNumber(value, { currency: props.currencyCode })} ${props.currencyCode}`;

const month = ref(format(new Date(), 'yyyy-MM'));
const monthDate = computed(() => parse(month.value, 'yyyy-MM', new Date()));
const monthLabel = computed(() => format(monthDate.value, 'LLLL yyyy'));
const shiftMonth = (offset: number) => {
  month.value = format(addMonths(monthDate.value, offset), 'yyyy-MM');
};

const {
  data: plans,
  isPending: isPlansPending,
  isError: isPlansError,
} = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.cardInstallmentPlans, props.accountId]),
  queryFn: () => getCardInstallmentPlans({ accountId: props.accountId }),
});

const { data: summary, isPending: isSummaryPending } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.cardMonthlySummary, props.accountId, month.value]),
  queryFn: () => getCardMonthlySummary({ accountId: props.accountId, month: month.value }),
  placeholderData: (previous) => previous,
});

/** Proposed installments grouped by the transfer that would pay them: one decision per transfer. */
const proposals = computed(() => {
  const groups = new Map<string, { installmentId: string; titles: string[]; total: number }>();
  for (const plan of plans.value ?? []) {
    for (const installment of plan.installments) {
      if (installment.status !== CARD_INSTALLMENT_STATUSES.proposed || !installment.paidTransactionId) continue;
      const group = groups.get(installment.paidTransactionId) ?? {
        installmentId: installment.id,
        titles: [],
        total: 0,
      };
      if (!group.titles.includes(plan.title)) group.titles.push(plan.title);
      group.total = Math.round((group.total + installment.amount) * 100) / 100;
      groups.set(installment.paidTransactionId, group);
    }
  }
  return [...groups.values()];
});

const resolveMutation = useMutation({
  mutationFn: resolveCardInstallment,
  onSuccess: (_data, { decision }) => {
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    addSuccessNotification(
      t(
        decision === 'confirm'
          ? 'pages.account.cardInstallments.proposal.confirmSuccess'
          : 'pages.account.cardInstallments.proposal.rejectSuccess',
      ),
    );
  },
  onError: () => addErrorNotification(t('pages.account.cardInstallments.proposal.error')),
});

const summaryRows = computed(() =>
  summary.value
    ? [
        {
          key: 'installments',
          label: t('pages.account.cardInstallments.summary.installmentsDue'),
          value: summary.value.installmentsDue,
        },
        {
          key: 'statement',
          label: t('pages.account.cardInstallments.summary.statementSpend'),
          value: summary.value.statementSpend,
        },
      ]
    : [],
);
</script>

<template>
  <section class="@container/card-installments grid gap-4" data-testid="card-installments-section">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">{{ $t('pages.account.cardInstallments.title') }}</h3>
      <CreateInstallmentPlanDialog :account-id="accountId" :currency-code="currencyCode">
        <Button size="sm" variant="outline">
          <PlusIcon class="size-4" /> {{ $t('pages.account.cardInstallments.add') }}
        </Button>
      </CreateInstallmentPlanDialog>
    </div>

    <div class="grid gap-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium">{{ $t('pages.account.cardInstallments.summary.title') }}</span>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('pages.account.cardInstallments.summary.previousMonth')"
            @click="shiftMonth(-1)"
          >
            <ChevronLeftIcon class="size-4" />
          </Button>
          <span class="min-w-32 text-center text-sm capitalize">{{ monthLabel }}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('pages.account.cardInstallments.summary.nextMonth')"
            @click="shiftMonth(1)"
          >
            <ChevronRightIcon class="size-4" />
          </Button>
        </div>
      </div>

      <div v-if="isSummaryPending" class="grid gap-2">
        <div v-for="i in 3" :key="i" class="bg-muted h-5 w-full animate-pulse rounded" />
      </div>
      <div v-else-if="summary" class="grid gap-2 text-sm">
        <div v-for="row in summaryRows" :key="row.key" class="flex items-center justify-between gap-2">
          <span>{{ row.label }}</span>
          <span class="tabular-nums">{{ formatAmount(row.value) }}</span>
        </div>
        <div class="flex items-center justify-between gap-2 font-medium">
          <span>{{ $t('pages.account.cardInstallments.summary.expectedTotal') }}</span>
          <span class="tabular-nums">{{ formatAmount(summary.expectedTotal) }}</span>
        </div>
        <p class="text-muted-foreground text-xs">
          {{
            $t('pages.account.cardInstallments.summary.statementPeriod', {
              from: format(parse(summary.statementFrom, 'yyyy-MM-dd', new Date()), 'P'),
              to: format(parse(summary.statementTo, 'yyyy-MM-dd', new Date()), 'P'),
            })
          }}
        </p>
      </div>
    </div>

    <div
      v-for="proposal in proposals"
      :key="proposal.installmentId"
      class="border-border grid gap-2 rounded-md border p-3 text-sm"
      data-testid="installment-proposal"
    >
      <p>
        {{
          $t('pages.account.cardInstallments.proposal.message', {
            amount: formatAmount(proposal.total),
            plans: proposal.titles.join(', '),
          })
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="soft-success"
          :disabled="resolveMutation.isPending.value"
          @click="resolveMutation.mutate({ installmentId: proposal.installmentId, decision: 'confirm' })"
        >
          <CheckIcon class="size-4" /> {{ $t('pages.account.cardInstallments.proposal.confirm') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="resolveMutation.isPending.value"
          @click="resolveMutation.mutate({ installmentId: proposal.installmentId, decision: 'reject' })"
        >
          <XIcon class="size-4" /> {{ $t('pages.account.cardInstallments.proposal.reject') }}
        </Button>
      </div>
    </div>

    <Separator />

    <div v-if="isPlansPending" class="grid gap-2">
      <div v-for="i in 2" :key="i" class="bg-muted h-10 w-full animate-pulse rounded" />
    </div>

    <p v-else-if="isPlansError" class="text-destructive-text text-sm">
      {{ $t('pages.account.cardInstallments.loadError') }}
    </p>

    <div v-else-if="!plans?.length" class="flex flex-col items-center py-6 text-center">
      <div class="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
        <CalendarClockIcon class="text-muted-foreground size-6" />
      </div>
      <h4 class="mb-2 font-semibold">{{ $t('pages.account.cardInstallments.empty.title') }}</h4>
      <p class="text-muted-foreground max-w-md text-sm">{{ $t('pages.account.cardInstallments.empty.description') }}</p>
    </div>

    <div v-else class="grid gap-4">
      <InstallmentPlanItem v-for="plan in plans" :key="plan.id" :plan="plan" :currency-code="currencyCode" />
    </div>
  </section>
</template>
