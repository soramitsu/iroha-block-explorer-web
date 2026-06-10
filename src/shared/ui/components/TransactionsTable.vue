<script setup lang="ts">
import { defaultFormat } from '@/shared/lib/time';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import TransactionStatus from '@/entities/transaction/TransactionStatus.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import type { TransactionSearchParams, TransactionStatus as TransactionStatusType } from '@/shared/api/schemas';
import { TransactionStatusFilter } from '@/features/filter/transactions';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import * as http from '@/shared/api';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useI18n } from 'vue-i18n';
import { useThrottleFn, useWindowScroll } from '@vueuse/core';
import { Transaction as TransactionSchema } from '@/shared/api/schemas';
import type { Transaction as TransactionDto } from '@/shared/api/schemas';
import { useExplorerTransactionsEvents } from '@/shared/ui/composables/useExplorerTransactionsEvents';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';

interface TransactionsTableCachePayload {
  version: number
  updated_at_ms: number
  items: unknown
}

const TRANSACTIONS_TABLE_CACHE_KEY = 'transactions_table_cache_v2';
const TRANSACTIONS_TABLE_CACHE_VERSION = 1;
const TRANSACTIONS_TABLE_CACHE_LIMIT = 100;

function toTransactionTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeTransactions(sources: readonly (readonly TransactionDto[])[], limit: number): TransactionDto[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const byHash = new Map<string, TransactionDto>();
  for (const source of sources) {
    for (const transaction of source) {
      if (byHash.has(transaction.hash)) continue;
      byHash.set(transaction.hash, transaction);
    }
  }

  return [...byHash.values()]
    .sort((left, right) => {
      const timeDelta = toTransactionTimestamp(right.created_at) - toTransactionTimestamp(left.created_at);
      if (timeDelta !== 0) return timeDelta;
      const blockDelta = right.block - left.block;
      if (blockDelta !== 0) return blockDelta;
      return right.hash.localeCompare(left.hash);
    })
    .slice(0, limit);
}

function parseTransactionsTableCache(raw: string | null): TransactionDto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TransactionsTableCachePayload;
    if (!parsed || typeof parsed !== 'object') return [];
    if (parsed.version !== TRANSACTIONS_TABLE_CACHE_VERSION) return [];

    const decoded = TransactionSchema.array().safeParse(parsed.items);
    if (!decoded.success) return [];

    return mergeTransactions([decoded.data], TRANSACTIONS_TABLE_CACHE_LIMIT);
  } catch {
    return [];
  }
}

const props = withDefaults(
  defineProps<{
    showBlock?: boolean
    showAuthority?: boolean
    hashType: HashType
    filterBy?: { kind: 'authority', value: string } | { kind: 'block', value: number } | null
  }>(),
  { showBlock: false, showAuthority: false, filterBy: null }
);

const { t } = useI18n();

const listState = reactive({
  status: null as TransactionStatusType | null,
  page: 1,
  per_page: 10,
});
const authority = shallowRef<string | undefined>(undefined);
const block = ref<number | undefined>(undefined);

const authorityFilter = ref('');
const blockFilter = ref('');
const authorityFilterError = ref<string | null>(null);
const blockFilterError = ref<string | null>(null);
const streamedTransactions = ref<TransactionDto[]>([]);

function readTransactionsTableCache(): TransactionDto[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseTransactionsTableCache(window.localStorage.getItem(TRANSACTIONS_TABLE_CACHE_KEY));
  } catch {
    return [];
  }
}

function writeTransactionsTableCache(items: readonly TransactionDto[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      TRANSACTIONS_TABLE_CACHE_KEY,
      JSON.stringify({
        version: TRANSACTIONS_TABLE_CACHE_VERSION,
        updated_at_ms: Date.now(),
        items: mergeTransactions([items], TRANSACTIONS_TABLE_CACHE_LIMIT),
      } satisfies TransactionsTableCachePayload)
    );
  } catch {
    // ignore storage quota/privacy mode failures
  }
}

const cachedTransactions = ref<TransactionDto[]>(readTransactionsTableCache());

watch(
  () => props.filterBy,
  (value) => {
    if (value?.kind === 'authority') {
      authority.value = value.value;
      block.value = undefined;
      authorityFilter.value = value.value.toString();
    } else if (value?.kind === 'block') {
      block.value = value.value;
      authority.value = undefined;
      blockFilter.value = value.value.toString();
    } else {
      authority.value = undefined;
      block.value = undefined;
    }
    listState.page = 1;
  },
  { immediate: true }
);

const searchParams = computed<TransactionSearchParams>(() => {
  return {
    page: listState.page,
    per_page: listState.per_page,
    status: listState.status ?? undefined,
    authority: authority.value,
    block: typeof block.value === 'number' && Number.isFinite(block.value) ? block.value : undefined,
  };
});

watch([() => listState.per_page, () => listState.status], () => {
  listState.page = 1;
});

watch(authorityFilter, (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    authorityFilterError.value = null;
    authority.value = props.filterBy?.kind === 'authority' ? props.filterBy.value : undefined;
    listState.page = 1;
    return;
  }
  const normalized = normalizeAccountSelectorLiteral(trimmed);
  if (!normalized) {
    authorityFilterError.value = t('searchUnsupported');
    return;
  }
  authority.value = normalized;
  authorityFilterError.value = null;
  listState.page = 1;
});

watch(blockFilter, (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    blockFilterError.value = null;
    block.value = props.filterBy?.kind === 'block' ? props.filterBy.value : undefined;
    listState.page = 1;
    return;
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) {
    blockFilterError.value = t('transactions.filters.blockInvalid');
    return;
  }
  blockFilterError.value = null;
  block.value = parsed;
  listState.page = 1;
});

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(searchParams.value),
      payload: searchParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchTransactions(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const fetchedTransactions = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);
const payloadPagination = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination : undefined
);

const hasAuthorityFilter = computed(() => Boolean(authority.value?.trim()));
const hasBlockFilter = computed(() => typeof block.value === 'number' && Number.isFinite(block.value));
const isDefaultFeed = computed(() => !listState.status && !hasAuthorityFilter.value && !hasBlockFilter.value);
const isLatestPage = computed(() => listState.page === 1);
const shouldRenderLiveDefaultFeed = computed(() => isDefaultFeed.value && isLatestPage.value);

const transactions = computed(() =>
  shouldRenderLiveDefaultFeed.value
    ? mergeTransactions([streamedTransactions.value, fetchedTransactions.value, cachedTransactions.value], listState.per_page)
    : fetchedTransactions.value
);
const visibleTransactionHashes = computed(() => new Set(transactions.value.map((item) => item.hash)));

const transactionRowKey = (item: TransactionDto) => item.hash;

const { y: windowScrollY } = useWindowScroll();
const pendingRefresh = ref(false);
const pendingAutoRefresh = ref(false);

const transactionsStream = useExplorerTransactionsEvents();

const latestTransaction = computed<TransactionDto | null>(() => {
  const raw = transactionsStream.data.value;
  if (!raw) return null;
  try {
    return TransactionSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn('[TransactionsTable] Failed to parse transaction stream payload', error);
    return null;
  }
});

const scheduleTransactionsReload = useThrottleFn(() => {
  if (isLoading.value) {
    pendingAutoRefresh.value = true;
    return;
  }
  pendingAutoRefresh.value = false;
  pendingRefresh.value = false;
  scope.value?.expose.refetch?.();
}, 1000);

function applyPendingRefresh() {
  scheduleTransactionsReload();
}

watch(
  () => isDefaultFeed.value,
  (isDefault) => {
    if (isDefault) cachedTransactions.value = readTransactionsTableCache();
    else streamedTransactions.value = [];
  },
  { immediate: true }
);

watch(
  () => fetchedTransactions.value,
  (items) => {
    if (shouldRenderLiveDefaultFeed.value && items.length) {
      cachedTransactions.value = mergeTransactions([items, cachedTransactions.value], TRANSACTIONS_TABLE_CACHE_LIMIT);
      writeTransactionsTableCache(cachedTransactions.value);
    }

    if (!streamedTransactions.value.length || !items.length) return;
    const fetchedHashes = new Set(items.map((item) => item.hash));
    streamedTransactions.value = streamedTransactions.value.filter((item) => !fetchedHashes.has(item.hash));
  },
  { immediate: true }
);

watch(
  () => JSON.stringify(searchParams.value),
  () => {
    pendingRefresh.value = false;
    pendingAutoRefresh.value = false;
  }
);

watch(
  () => isLoading.value,
  (loading) => {
    if (loading || !pendingAutoRefresh.value) return;
    if (listState.page !== 1) {
      pendingAutoRefresh.value = false;
      return;
    }
    if (windowScrollY.value > 80) {
      pendingRefresh.value = true;
      return;
    }
    scheduleTransactionsReload();
  }
);

watch(
  () => latestTransaction.value,
  (transaction) => {
    if (!transaction) return;
    if (listState.status && transaction.status !== listState.status) return;

    const authorityFilterValue = authority.value?.toString();
    if (authorityFilterValue && transaction.authority !== authorityFilterValue) return;

    if (typeof block.value === 'number' && Number.isFinite(block.value)) {
      if (transaction.block !== block.value) return;
    }

    if (visibleTransactionHashes.value.has(transaction.hash)) return;

    // Avoid shifting paginated views under the user's cursor.
    // Only auto-refresh when the table is on the "latest" page.
    if (listState.page !== 1) return;

    // Avoid shifting the page while the user is scrolled down.
    if (windowScrollY.value > 80) {
      pendingRefresh.value = true;
      return;
    }

    if (isDefaultFeed.value) {
      streamedTransactions.value = mergeTransactions([[transaction], streamedTransactions.value], listState.per_page);
    }

    scheduleTransactionsReload();
  }
);
</script>

<template>
  <div class="transactions-table">
    <div class="transactions-table-filters content-row">
      <TransactionStatusFilter v-model="listState.status" />
      <label class="transactions-table-filter">
        <span class="transactions-table-filter__label">{{ $t('accounts.accountId') }}</span>
        <input
          v-model="authorityFilter"
          :placeholder="$t('transactions.filters.authorityPlaceholder')"
          :disabled="props.filterBy?.kind === 'authority'"
        >
        <small
          v-if="authorityFilterError"
          class="transactions-table-filter__error"
        >
          {{ authorityFilterError }}
        </small>
      </label>
      <label class="transactions-table-filter">
        <span class="transactions-table-filter__label">{{ $t('transactions.filters.blockLabel') }}</span>
        <input
          v-model="blockFilter"
          :placeholder="$t('transactions.filters.blockPlaceholder')"
          :disabled="props.filterBy?.kind === 'block'"
        >
        <small
          v-if="blockFilterError"
          class="transactions-table-filter__error"
        >
          {{ blockFilterError }}
        </small>
      </label>
    </div>

    <div
      v-if="pendingRefresh"
      class="transactions-table__pending content-row"
      data-test="pending-refresh"
    >
      <span class="row-text">{{ $t('table.newDataAvailable') }}</span>
      <BaseButton
        bordered
        data-test="pending-refresh-load"
        @click="applyPendingRefresh"
      >
        {{ $t('table.load') }}
      </BaseButton>
    </div>

    <BaseTable
      v-model:page="listState.page"
      v-model:page-size="listState.per_page"
      :loading="isLoading"
      :items="transactions"
      :row-key="transactionRowKey"
      :total="payloadPagination?.total_items"
      :payload-pagination
      container-class="transactions-table__container"
      :pagination-breakpoint="1700"
    >
      <template #row="{ item }">
        <div class="transactions-table__row">
          <TransactionStatus
            type="tooltip"
            class="transactions-table__icon"
            :committed="item.status === 'Committed'"
          />

          <div class="transactions-table__column transactions-table__column-hash">
            <div class="transactions-table__label">
              {{ $t('transactions.transactionID') }}
            </div>

            <BaseHash
              :hash="item.hash"
              :type="hashType"
              :link="`/transactions/${item.hash}`"
              copy
            />

            <time
              :datetime="item.created_at.toISOString()"
              class="transactions-table__time row-text-monospace"
            >
              {{ defaultFormat(item.created_at) }}
            </time>
          </div>

          <div class="transactions-table__columns">
            <div
              v-if="props.showAuthority"
              class="transactions-table__column transactions-table__column-authority"
            >
              <div class="transactions-table__label">
                {{ $t('accounts.accountId') }}
              </div>

              <BaseHash
                :hash="item.authority"
                type="short"
                :link="`/accounts/${item.authority}`"
              />
            </div>

            <div
              v-if="props.showBlock"
              class="transactions-table__column-block"
            >
              <div class="transactions-table__label">
                {{ $t('transactions.block') }}
              </div>

              <BaseLink
                :to="`/blocks/${item.block}`"
                monospace
              >
                {{ item.block }}
              </BaseLink>
            </div>

            <div class="transactions-table__column">
              <div class="transactions-table__label">
                {{ $t('transactions.executable') }}
              </div>

              <span class="row-text">{{ item.executable }}</span>
            </div>
          </div>
        </div>
      </template>
    </BaseTable>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transactions-table {
  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 80px;
    margin: size(1) 0;

    @include xxs {
      grid-template-columns: 1fr 1fr;
      margin: size(2) 0;
      grid-gap: size(2);
      display: flex;
      flex-direction: column;
    }

    @include sm {
      display: grid;
      grid-template-columns: 32px 0.9fr 1fr;
      grid-gap: size(2);
      align-items: center;
    }

    @include md {
      grid-template-columns: 32px 0.5fr 1fr;
    }

    @include lg {
      grid-template-columns: 32px 0.9fr 1fr;
    }
  }

  &-filters {
    padding: size(2) size(4);
    display: flex;
    flex-direction: column;
    gap: size(2);

    @include sm {
      flex-direction: row;
      align-items: flex-end;
      flex-wrap: wrap;
    }
  }

  &-filter {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    min-width: 220px;

    &__label {
      font-size: size(1.5);
      color: theme-color('content-tertiary');
    }

    input {
      padding: size(1.25);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
    }

    &__error {
      color: theme-color('error');
      font-size: size(1.3);
    }
  }

  &__container {
    display: grid;
    .content-row {
      padding: 0 size(4);
    }
  }

  &__pending {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(2);
    padding: size(1.5) size(4);
    border-bottom: 1px solid theme-color('border-primary');
    background: color-mix(in srgb, theme-color('surface') 70%, transparent);
  }

  &__icon {
    display: none;

    @include sm {
      display: grid;
    }
  }

  &__label {
    @include tpg-s3;
    color: theme-color('content-quaternary');
  }

  &__time {
    color: theme-color('content-primary');
    grid-column: 1 / -1;
  }

  &__columns {
    display: flex;
    gap: size(2);

    flex-direction: column;
    @include md {
      flex-direction: row;
    }
  }

  &__column {
    display: grid;
    grid-gap: size(1) size(1);
    margin-bottom: auto;

    @include xs {
      grid-template-columns: auto 1fr;
      margin: auto 0;
    }

    @include sm {
      grid-gap: size(1);
    }

    &-hash {
      @include sm {
        width: 100%;
      }
      @include xl {
        width: size(82);
      }
    }

    &-authority {
      width: size(36);
    }

    &-block {
      display: flex;
      gap: size(1);
      align-items: center;

      @include xxs {
        width: size(16);
      }
      @include md {
        width: size(14);
      }
    }
  }
}
</style>
