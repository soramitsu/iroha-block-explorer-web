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

      <BaseResourceState
        v-if="scope?.expose.error"
        :snapshot="{ status: 'error', problem: scope?.expose.error }"
        @retry="scope?.expose.refetch()"
      />
      <div v-if="!isInitialLoading">
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
            type="medium"
            :link="`/transactions/${transaction.hash}`"
            class="latest-transactions__hash"
            copy
          />

          <div class="latest-transactions__info">
            <BaseHash
              :hash="transaction.authority"
              type="medium"
              :link="`/accounts/${transaction.authority}`"
              class="latest-transactions__account"
            />

            <div class="latest-transactions__time">
              <TimeIcon
                class="latest-transactions__clock"
                aria-hidden="true"
              />
              <TimeStamp :value="transaction.created_at" />
            </div>
          </div>
        </div>
      </div>
      <BaseLoading
        v-else
        class="latest-transactions_loading"
      />
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
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import * as http from '@/shared/api';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { historyCacheKey } from '@/shared/lib/history-cache';
import { useIntervalFn, useThrottleFn } from '@vueuse/core';
import { Transaction as TransactionSchema } from '@/shared/api/schemas';
import type { Transaction as TransactionDto, TransactionStatus as TransactionStatusType } from '@/shared/api/schemas';
import {
  buildLatestTransactionsCachePayload,
  mergeLatestTransactions,
  parseLatestTransactionsCache,
} from '@/widgets/latest-transactions/model';
import { classifySampleFreshness } from '@/shared/lib/freshness';
import { useExplorerTransactionsEvents } from '@/shared/ui/composables/useExplorerTransactionsEvents';

const listState = reactive({
  limit: 5,
  status: null as TransactionStatusType | null,
});

async function fetchTransactions(params: typeof listState) {
  return await http.fetchLatestTransactions({ ...params, status: params.status ?? undefined });
}

const cacheKey = historyCacheKey('latest-transactions', getRuntimeConfig().networkId, http.getToriiBaseUrl());

function readTransactionsCache(status: TransactionStatusType | null): TransactionDto[] {
  const key = cacheKey;
  if (typeof window === 'undefined' || !key) return [];
  try {
    return parseLatestTransactionsCache(window.localStorage.getItem(key), {
      status,
      limit: listState.limit,
    });
  } catch {
    return [];
  }
}

function writeTransactionsCache(items: readonly TransactionDto[]) {
  const key = cacheKey;
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.setItem(key, buildLatestTransactionsCachePayload(items));
  } catch {
    // ignore storage quota/privacy mode failures
  }
}

const transactionsStream = useExplorerTransactionsEvents();
const streamRevision = ref(0);

watch(
  () => transactionsStream.status.value,
  () => { streamRevision.value += 1; },
  { flush: 'sync' }
);

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(listState),
      payload: listState,
    };
  },
  ({ payload }) => {
    const params = { ...payload };
    let snapshotStreamRevision = -1;
    return setupAsyncData(async () => {
      const revision = streamRevision.value;
      snapshotStreamRevision = -1;
      const result = await fetchTransactions(params);
      if (result.status === SUCCESSFUL_FETCHING) snapshotStreamRevision = revision;
      return result;
    }, {
      interval: 5000,
      // An open delta stream cannot replace a successful history snapshot.
      // Reconcile each connection and filter, including after refresh errors.
      pollWhen: () => transactionsStream.status.value !== 'OPEN' || snapshotStreamRevision !== streamRevision.value,
    });
  }
);

const isLoading = computed(() => scope.value?.expose.isLoading ?? false);
const fetchedTransactions = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);
const streamedTransactions = ref<TransactionDto[]>([]);
const cachedTransactions = ref<TransactionDto[]>(readTransactionsCache(listState.status));
const transactions = computed(() =>
  mergeLatestTransactions([streamedTransactions.value, fetchedTransactions.value, cachedTransactions.value], listState.limit)
);
const isInitialLoading = computed(() => isLoading.value && transactions.value.length === 0);
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
const latestSampleTone = computed(() =>
  cachedTransactions.value.length > 0 && (availability.state.value !== 'healthy' || (!fetchedTransactions.value.length && !streamedTransactions.value.length))
    ? 'stale'
    : classifySampleFreshness(latestSampleDate.value?.getTime() ?? null, nowMs.value)
);
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
  (status) => {
    streamedTransactions.value = [];
    cachedTransactions.value = readTransactionsCache(status);
  }
);

watch(
  () => fetchedTransactions.value,
  (items) => {
    if (scope.value?.expose.data?.status !== SUCCESSFUL_FETCHING) return;

    cachedTransactions.value = mergeLatestTransactions([items], listState.limit);

    if (!listState.status) {
      writeTransactionsCache(items);
    }

    if (!streamedTransactions.value.length) return;
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
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    grid-template-areas: 'status hash' 'status info';
    column-gap: 12px;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid theme-color('border-primary');
    transition: background-color 120ms ease;

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: theme-color('background-hover');
    }
  }

  &__hash {
    grid-area: hash;
    min-width: 0;
    min-height: 44px;
    gap: 4px;
  }

  &__info {
    grid-area: info;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0 16px;
    min-width: 0;
  }

  &__hash .base-link,
  &__account .base-link {
    font-size: 12px;
    line-height: 1.5;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &__account {
    min-width: 0;
    min-height: 32px;
    align-items: center;

    .base-link {
      color: theme-color('content-secondary');

      &:hover {
        color: theme-color('primary');
      }
    }
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
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    min-height: 32px;
    gap: 6px;
    color: theme-color('content-secondary');
    white-space: nowrap;

    .time-ago {
      font-family: inherit;
      font-size: 12px;
      line-height: 1.5;
    }
  }

  &__clock {
    flex: 0 0 12px;
    width: 12px;
    height: 12px;
    fill: currentColor;
  }

  &__status {
    grid-area: status;
    align-self: start;
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
