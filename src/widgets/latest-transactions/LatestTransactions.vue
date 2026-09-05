<template>
  <BaseContentBlock
    :title="$t('widgets.latestTransactions')"
    class="latest-transactions"
  >
    <template #header-action>
      <BaseButton
        line
        to="/transactions"
      >
        {{ $t('viewAll') }}
      </BaseButton>
    </template>

    <template #default>
      <div class="latest-transactions__filters">
        <TransactionStatusFilter v-model="listState.status" />
      </div>

      <hr>

      <div
        v-if="showAvailabilityNotice"
        class="latest-transactions__availability"
        :class="`latest-transactions__availability_${availability.state.value}`"
      >
        <span>{{ $t(availabilityNoticeKey) }}</span>
        <BaseButton
          size="xs"
          variant="secondary"
          @click="retryAvailabilityFailover"
        >
          {{ $t('settings.retryFailover') }}
        </BaseButton>
      </div>
      <div
        v-if="latestSampleDate"
        class="latest-transactions__freshness"
        :data-tone="latestSampleTone"
        data-test="latest-transactions-freshness"
      >
        <span>{{ $t('telemetry.dataTrustSampleAge') }}:</span>
        <TimeStamp
          v-if="latestSampleDate"
          :value="latestSampleDate"
        />
        <span v-else>{{ $t('telemetry.dataUnknown') }}</span>
        <span>({{ $t(latestSampleToneKey) }})</span>
      </div>

      <BaseCollectionState
        :snapshot="collectionSnapshot"
        :count="transactions.length"
        :filtered="listState.status !== null"
        @retry="scope.expose.refetch()"
        @reset="listState.status = null"
      >
        <div>
          <div
            v-for="transaction in transactions"
            :key="transaction.hash"
            class="latest-transactions__row"
          >
            <TransactionStatus
              :committed="transaction.status === 'Committed'"
              type="tooltip"
              class="latest-transactions__status"
            />

            <BaseHash
              :hash="transaction.hash"
              :type="hashType"
              :link="`/transactions/${transaction.hash}`"
              copy
            />

            <div class="latest-transactions__info">
              <div class="latest-transactions__time">
                <TimeIcon />
                <TimeStamp :value="transaction.created_at" />
              </div>

              <BaseHash
                :hash="transaction.authority"
                :type="hashType"
                :link="`/accounts/${transaction.authority}`"
                class="latest-transactions__account"
              />
            </div>
          </div>
        </div>
      </BaseCollectionState>
    </template>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import TimeIcon from '@/shared/ui/icons/clock.svg';
import { TransactionStatusFilter } from '@/features/filter/transactions';
import TransactionStatus from '@/entities/transaction/TransactionStatus.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseCollectionState from '@/shared/ui/components/BaseCollectionState.vue';
import * as http from '@/shared/api';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useIntervalFn, useThrottleFn } from '@vueuse/core';
import { Transaction as TransactionSchema } from '@/shared/api/schemas';
import type { Transaction as TransactionDto, TransactionStatus as TransactionStatusType } from '@/shared/api/schemas';
import { mergeLatestTransactions } from '@/widgets/latest-transactions/model';
import { classifySampleFreshness } from '@/shared/lib/freshness';
import { useExplorerTransactionsEvents } from '@/shared/ui/composables/useExplorerTransactionsEvents';

const listState = reactive({
  limit: 5,
  status: null as TransactionStatusType | null,
});

async function fetchTransactions(params: typeof listState) {
  return await http.fetchLatestTransactions({
    ...params,
    status: params.status ?? undefined,
  });
}

const hashType = useAdaptiveHash({ lg: 'short', xxs: 'short' }, 'medium');

const transactionsStream = useExplorerTransactionsEvents();

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(listState),
      payload: listState,
    };
  },
  ({ payload }) =>
    setupAsyncData(() => fetchTransactions(payload), {
      interval: 5000,
      pollWhen: () => transactionsStream.status.value !== 'OPEN',
    })
);

const isLoading = computed(() => scope.value?.expose.isLoading ?? false);
const fetchedTransactions = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);
const streamedTransactions = ref<TransactionDto[]>([]);
const transactions = computed(() =>
  mergeLatestTransactions([streamedTransactions.value, fetchedTransactions.value], listState.limit)
);
// SSE rows are independently schema-validated evidence, even before the first list response.
const collectionSnapshot = computed<ResourceSnapshot<TransactionDto[]>>(() => {
  const snapshot = scope.value.expose.snapshot;
  if (snapshot.status === 'ready') return { ...snapshot, data: transactions.value };
  if (!streamedTransactions.value.length) return snapshot;
  return {
    status: 'ready',
    data: transactions.value,
    isRefreshing: false,
    refreshError: snapshot.status === 'error' ? snapshot.problem
      : snapshot.status === 'not-found' ? { kind: 'http', status: 404, message: '404' } : null,
  };
});
const availability = http.useToriiAvailability();
const showAvailabilityNotice = computed(() => availability.state.value !== 'healthy');
const availabilityNoticeKey = computed(() => `settings.nodeHealth.${availability.state.value}`);
const nowMs = ref(Date.now());

const latestTransaction = computed<TransactionDto | null>(() => {
  const raw = transactionsStream.data.value;
  if (!raw) return null;
  try {
    return TransactionSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn('[LatestTransactions] Failed to parse transaction stream payload', error);
    return null;
  }
});
const latestSampleDate = computed<Date | null>(() => {
  if (!transactions.value.length) return null;
  return transactions.value.reduce(
    (latest, transaction) => (transaction.created_at > latest ? transaction.created_at : latest),
    transactions.value[0].created_at
  );
});
const latestSampleTone = computed(() => classifySampleFreshness(latestSampleDate.value?.getTime() ?? null, nowMs.value));
const latestSampleToneKeyMap = {
  fresh: 'telemetry.dataFresh',
  delayed: 'telemetry.dataDelayed',
  stale: 'telemetry.dataStale',
  unknown: 'telemetry.dataUnknown',
} as const;
const latestSampleToneKey = computed(() => latestSampleToneKeyMap[latestSampleTone.value]);

const scheduleTransactionsReload = useThrottleFn(() => {
  if (isLoading.value) return;
  scope.value?.expose.refetch?.();
}, 1000);

useIntervalFn(() => {
  nowMs.value = Date.now();
}, 1000);

watch(
  () => listState.status,
  () => {
    streamedTransactions.value = [];
  }
);

watch(
  () => fetchedTransactions.value,
  (items) => {
    if (!streamedTransactions.value.length || !items.length) return;
    const fetchedHashes = new Set(items.map((item) => item.hash));
    streamedTransactions.value = streamedTransactions.value.filter((item) => !fetchedHashes.has(item.hash));
  },
  { immediate: true }
);

watch(
  () => latestTransaction.value,
  (transaction) => {
    if (!transaction) return;
    if (listState.status && transaction.status !== listState.status) return;
    streamedTransactions.value = mergeLatestTransactions([[transaction], streamedTransactions.value], listState.limit);
    scheduleTransactionsReload();
  }
);

async function retryAvailabilityFailover() {
  await http.retryToriiFailover();
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.latest-transactions {
  &_loading {
    display: flex;
    align-items: center;
    margin-top: 20px;
  }

  &__row {
    border-bottom: 1px solid theme-color('border-primary');
    display: grid;
    grid-gap: size(1);
    grid-template-columns: 32px minmax(0, 1fr);
    grid-template-rows: auto auto;
    justify-content: start;
    align-items: center;
    min-height: 64px;
    overflow-wrap: anywhere;

    &:hover {
      background: theme-color('background-hover');
    }

    & > * {
      width: fit-content;
    }

    @include xxs {
      padding: size(3) size(4);
      grid-gap: size(1) size(2);
    }

    @include lg {
      grid-gap: size(1.5) size(2);
    }
  }

  &__info {
    display: grid;
    grid-gap: size(0.5) size(4);

    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  &__filters {
    display: grid;
    justify-items: center;
    justify-content: center;
    padding: size(2);

    @include xs {
      grid-template-columns: auto auto;
      justify-items: initial;
      justify-content: end;
    }
  }

  &__time {
    user-select: none;
    cursor: default;
    position: relative;
    display: flex;
    align-items: center;

    svg {
      fill: theme-color('content-quaternary');
      width: 10px;
      height: 10px;
      margin-right: 6px;
    }
  }

  &__status {
    grid-row: 1 / -1;
  }

  &__availability {
    margin: size(1) size(2) size(2);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface-variant');
    padding: size(1) size(1.5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(1);
    @include tpg-s4;
  }

  &__availability_degraded {
    border-color: color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary'));
  }

  &__availability_failing_over,
  &__availability_outage {
    border-color: color-mix(in srgb, theme-color('error') 45%, theme-color('border-primary'));
  }

  &__freshness {
    margin: 0 size(2) size(1.5);
    padding: size(0.75) size(1.25);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface-variant');
    display: inline-flex;
    align-items: center;
    gap: size(0.75);
    @include tpg-s5;

    &[data-tone='fresh'] {
      border-color: color-mix(in srgb, theme-color('success') 40%, theme-color('border-primary'));
    }

    &[data-tone='delayed'] {
      border-color: color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary'));
    }

    &[data-tone='stale'] {
      border-color: color-mix(in srgb, theme-color('error') 45%, theme-color('border-primary'));
    }
  }
}
</style>
