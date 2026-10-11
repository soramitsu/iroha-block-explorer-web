<template>
  <BaseContentBlock
    title="Search results"
    class="search-results-page"
  >
    <div class="search-results-page__query">
      <span class="h-sm">Exact hash</span>
      <code data-test="search-results-query">{{ displayedQuery }}</code>
    </div>

    <BaseResourceState
      :snapshot
      loading-label="Checking blocks and transactions…"
      error-label="The exact lookup could not be completed."
      retry-label="Retry exact lookup"
      @retry="load"
    >
      <template #not-found>
        <span data-test="search-results-not-found">
          No block or transaction matches this exact hash.
        </span>
      </template>

      <template #error="{ problem }">
        <span data-test="search-results-error">
          The exact lookup could not be completed: {{ describeProblem(problem) }}
        </span>
      </template>

      <template #default="{ data }">
        <div class="search-results-page__results">
          <article
            v-if="data.block.kind === 'match'"
            class="search-results-page__result"
            data-test="search-result-block"
          >
            <h3>
              <BaseLink :to="{ name: 'blocks-details', params: { heightOrHash: data.block.value.hash } }">
                Block
              </BaseLink>
            </h3>
            <DataField
              :title="$t('blocks.height')"
              :value="data.block.value.height"
            />
            <DataField
              :title="$t('blocks.blockHash')"
              :hash="data.block.value.hash"
              :link="`/blocks/${encodeURIComponent(data.block.value.hash)}`"
              copy
            />
            <DataField
              :title="$t('blocks.totalTransactions')"
              :value="data.block.value.transactions_total"
            />
          </article>

          <article
            v-if="data.transaction.kind === 'match'"
            class="search-results-page__result"
            data-test="search-result-transaction"
          >
            <h3>
              <BaseLink :to="{ name: 'transaction-details', params: { hash: data.transaction.value.hash } }">
                Transaction
              </BaseLink>
            </h3>
            <DataField
              :title="$t('transactions.transactionHash')"
              :hash="data.transaction.value.hash"
              :link="`/transactions/${encodeURIComponent(data.transaction.value.hash)}`"
              copy
            />
            <DataField
              :title="$t('transactions.block')"
              :value="data.transaction.value.block"
              :link="`/blocks/${data.transaction.value.block}`"
            />
            <DataField
              :title="$t('transactions.status')"
              :value="data.transaction.value.status"
            />
          </article>

          <div
            v-for="notice in probeNotices(data)"
            :key="notice.target"
            class="search-results-page__notice"
            :class="{ 'search-results-page__notice--error': notice.problem }"
            :role="notice.problem ? 'alert' : 'status'"
            :data-test="`search-result-${notice.target}-notice`"
          >
            <span>{{ notice.message }}</span>
            <BaseButton
              v-if="notice.problem"
              bordered
              :disabled="snapshot.status === 'ready' && snapshot.isRefreshing"
              data-test="search-results-partial-retry"
              @click="load"
            >
              Retry exact lookup
            </BaseButton>
          </div>
        </div>
      </template>
    </BaseResourceState>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import * as http from '@/shared/api';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { firstRouteQueryValue } from '@/shared/lib/route-query';
import {
  resolveExactHashSearch,
  snapshotFromExactHashSearch,
  type ExactHashSearchResult,
} from '@/features/search/exact-hash-search';
import { classifySearchQuery } from '@/features/search/classifier';
import { apiProblemFromError, type ApiProblem, type ResourceSnapshot } from '@/shared/utils/resource-state';

defineOptions({ name: 'SearchResultsPage' });

interface ProbeNotice {
  target: 'block' | 'transaction'
  message: string
  problem: ApiProblem | null
}

const route = useRoute();
const routeQuery = computed(() => firstRouteQueryValue(route.query.q)?.trim() ?? '');
const displayedQuery = computed(() => {
  const classified = classifySearchQuery(routeQuery.value);
  return classified.kind === 'hash' ? classified.value : routeQuery.value;
});
const snapshot = shallowRef<ResourceSnapshot<ExactHashSearchResult>>({ status: 'idle' });
let requestGeneration = 0;

function describeProblem(problem: ApiProblem): string {
  if (problem.kind === 'http') return `HTTP ${problem.status}`;
  if (problem.kind === 'network') return 'the Explorer API is unreachable';
  if (problem.kind === 'timeout') return 'the Explorer API timed out';
  return problem.message || 'the Explorer API returned an invalid response';
}

function probeNotices(result: ExactHashSearchResult): ProbeNotice[] {
  const notices: ProbeNotice[] = [];
  const candidates = [
    { target: 'block' as const, label: 'block', probe: result.block },
    { target: 'transaction' as const, label: 'transaction', probe: result.transaction },
  ];

  for (const candidate of candidates) {
    if (candidate.probe.kind === 'not-found') {
      notices.push({
        target: candidate.target,
        message: `No ${candidate.label} matches this hash.`,
        problem: null,
      });
    } else if (candidate.probe.kind === 'error') {
      notices.push({
        target: candidate.target,
        message: `${candidate.label[0]!.toUpperCase()}${candidate.label.slice(1)} lookup failed: ${describeProblem(candidate.probe.problem)}.`,
        problem: candidate.probe.problem,
      });
    }
  }

  return notices;
}

async function load(): Promise<void> {
  const queryAtStart = routeQuery.value;
  const generation = ++requestGeneration;
  const classified = classifySearchQuery(queryAtStart);

  if (classified.kind !== 'hash') {
    snapshot.value = {
      status: 'error',
      problem: {
        kind: 'invalid-response',
        message: 'Enter exactly 64 hexadecimal characters, with an optional 0x prefix',
      },
    };
    return;
  }

  const current = snapshot.value;
  snapshot.value = current.status === 'ready' && current.data.query === classified.value
    ? { status: 'ready', data: current.data, isRefreshing: true, refreshError: null }
    : { status: 'initial-loading' };

  try {
    const result = await resolveExactHashSearch(classified.value, {
      fetchBlock: http.fetchBlock,
      fetchTransaction: http.fetchTransaction,
    });
    if (generation !== requestGeneration) return;
    snapshot.value = snapshotFromExactHashSearch(result);
  } catch (error) {
    if (generation !== requestGeneration) return;
    snapshot.value = { status: 'error', problem: apiProblemFromError(error) };
  }
}

watch(routeQuery, load, { immediate: true });
onScopeDispose(() => {
  requestGeneration += 1;
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.search-results-page {
  &__query {
    display: grid;
    gap: size(1);
    padding: 0 size(4) size(4);

    code {
      color: theme-color('content-primary');
      overflow-wrap: anywhere;
    }
  }

  &__results {
    display: grid;
    gap: size(3);
    padding: 0 size(4);

    @include md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__result {
    display: grid;
    align-content: start;
    gap: size(3);
    padding: size(3);
    border: 1px solid theme-color('border-primary');
    border-radius: size(3);
    min-width: 0;

    h3 {
      @include tpg-h3;
    }
  }

  &__notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(2);
    grid-column: 1 / -1;
    padding: size(2) size(3);
    color: theme-color('content-tertiary');
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);

    &--error {
      color: theme-color('content-primary');
    }
  }
}
</style>
