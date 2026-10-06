<template>
  <BaseContentBlock
    :title="$t('contracts.title')"
    class="smart-contracts-page"
  >
    <p class="smart-contracts-page__hint">
      Inspect deployed contract instances, committed calls, indexed event history, and live contract events.
    </p>

    <BaseTabs
      :model-value="activeTab"
      :items="tabs"
      class="smart-contracts-page__tabs"
      @update:model-value="selectTab"
    />

    <form
      v-if="activeTab !== 'deployments'"
      class="smart-contracts-page__filters"
      data-test="contract-filters"
      @submit.prevent="applyFilters"
    >
      <label>
        <span>Authority</span>
        <input
          v-model="filterDraft.authority"
          name="authority"
          placeholder="Account ID or alias"
        >
      </label>
      <label>
        <span>Contract address</span>
        <input
          v-model="filterDraft.contract_address"
          name="contract_address"
          placeholder="tairac1…"
        >
      </label>
      <label>
        <span>Contract alias</span>
        <input
          v-model="filterDraft.contract_alias"
          name="contract_alias"
          placeholder="router"
        >
      </label>
      <label v-if="activeTab === 'activity'">
        <span>Entrypoint</span>
        <input
          v-model="filterDraft.contract_entrypoint"
          name="contract_entrypoint"
          placeholder="swap"
        >
      </label>
      <template v-else>
        <label>
          <span>Module</span>
          <input
            v-model="filterDraft.module"
            name="module"
            placeholder="router"
          >
        </label>
        <label>
          <span>Event kind</span>
          <input
            v-model="filterDraft.event_kind"
            name="event_kind"
            placeholder="swap_filled"
          >
        </label>
        <label>
          <span>Participant</span>
          <input
            v-model="filterDraft.participant"
            name="participant"
            placeholder="Account ID or alias"
          >
        </label>
        <label>
          <span>Asset</span>
          <input
            v-model="filterDraft.asset_id"
            name="asset_id"
            placeholder="Asset ID or alias"
          >
        </label>
        <label>
          <span>Provenance</span>
          <select
            v-model="filterDraft.provenance"
            name="provenance"
          >
            <option value="">Any</option>
            <option value="emitted">Emitted</option>
            <option value="derived">Derived</option>
          </select>
        </label>
      </template>
      <label>
        <span>Result</span>
        <select
          v-model="filterDraft.result_ok"
          name="result_ok"
        >
          <option value="">Any</option>
          <option value="true">Succeeded</option>
          <option value="false">Failed</option>
        </select>
      </label>
      <label>
        <span>Since (Unix ms)</span>
        <input
          v-model="filterDraft.since_timestamp_ms"
          name="since_timestamp_ms"
          inputmode="numeric"
          placeholder="0"
        >
      </label>
      <label>
        <span>Until (Unix ms)</span>
        <input
          v-model="filterDraft.until_timestamp_ms"
          name="until_timestamp_ms"
          inputmode="numeric"
          placeholder="1767225599999"
        >
      </label>
      <div class="smart-contracts-page__filter-actions">
        <BaseButton
          native-type="submit"
          bordered
        >
          Apply filters
        </BaseButton>
        <BaseButton
          native-type="button"
          line
          data-test="clear-contract-filters"
          @click="clearFilters"
        >
          Clear
        </BaseButton>
      </div>
    </form>

    <BaseResourceState
      v-if="activeTab === 'deployments'"
      :snapshot="deploymentSnapshot"
      loading-label="Loading deployments…"
      not-found-label="No contract deployments found."
      error-label="Contract deployments could not be loaded."
      @retry="retryDeployments"
    >
      <template #default="{ data }">
        <BaseTable
          v-model:cursor="deploymentCursor"
          v-model:page-size="deploymentLimit"
          :loading="false"
          pagination-mode="cursor"
          :cursor-pagination="data"
          :items="data.items"
          :row-key="deploymentRowKey"
          container-class="smart-contracts-page__container"
          row-pointer
          @click:row="openDeployment"
        >
          <template #header>
            <div
              class="smart-contracts-page__row smart-contracts-page__row--deployments"
              role="presentation"
            >
              <span class="h-sm" role="columnheader">Contract</span>
              <span class="h-sm" role="columnheader">Code hash</span>
              <span class="h-sm" role="columnheader">Deployer</span>
              <span class="h-sm" role="columnheader">Block</span>
              <span class="h-sm" role="columnheader">Created</span>
              <span class="h-sm" role="columnheader">Transaction</span>
            </div>
          </template>
          <template #row="{ item }">
            <div
              class="smart-contracts-page__row smart-contracts-page__row--deployments"
              role="presentation"
            >
              <div role="cell">
                <BaseHash
                  :hash="item.contractAddress"
                  :type="addressHashType"
                  copy
                />
                <small v-if="item.contractAlias">{{ item.contractAlias }}</small>
              </div>
              <div role="cell">
                <BaseHash
                  :hash="item.codeHash ?? '—'"
                  :type="hashType"
                  :copy="Boolean(item.codeHash)"
                />
              </div>
              <div role="cell">
                <BaseHash
                  :hash="item.authority"
                  :link="contractAccountPath(item.authority) ?? undefined"
                  :type="hashType"
                  copy
                />
              </div>
              <div role="cell">
                <BaseLink :to="`/blocks/${item.block}`">
                  {{ item.block }}
                </BaseLink>
              </div>
              <div role="cell">
                <time :datetime="item.createdAt.toISOString()">
                  {{ defaultFormat(item.createdAt) }}
                </time>
              </div>
              <div role="cell">
                <BaseHash
                  :hash="item.transactionHash"
                  :link="transactionPath(item.transactionHash)"
                  :type="hashType"
                  copy
                />
              </div>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseResourceState>

    <BaseResourceState
      v-else-if="activeTab === 'activity'"
      :snapshot="activitySnapshot"
      loading-label="Loading contract activity…"
      not-found-label="No committed contract calls match these filters."
      :retry-label="activityParams.ok ? 'Retry' : 'Clear invalid filters'"
      @retry="retryActivity"
    >
      <template #error="{ problem }">
        <span>{{ problem.message }}</span>
      </template>
      <template #default="{ data }">
        <BaseTable
          v-model:cursor="cursor"
          v-model:page-size="limit"
          pagination-mode="cursor"
          :loading="false"
          :cursor-pagination="data"
          :items="data.items"
          :row-key="activityRowKey"
          container-class="smart-contracts-page__container"
        >
          <template #header>
            <div
              class="smart-contracts-page__row smart-contracts-page__row--activity"
              role="presentation"
            >
              <span class="h-sm" role="columnheader">Contract / entrypoint</span>
              <span class="h-sm" role="columnheader">Authority</span>
              <span class="h-sm" role="columnheader">Result</span>
              <span class="h-sm" role="columnheader">Timestamp</span>
              <span class="h-sm" role="columnheader">Transaction</span>
              <span class="h-sm" role="columnheader">Decoded call data</span>
            </div>
          </template>
          <template #row="{ item }">
            <div
              class="smart-contracts-page__row smart-contracts-page__row--activity"
              role="presentation"
            >
              <div class="smart-contracts-page__stack" role="cell">
                <BaseHash
                  :hash="item.contract_address"
                  :type="addressHashType"
                  copy
                />
                <small>{{ item.contract_alias ?? 'No alias' }} · {{ item.contract_entrypoint ?? 'Unknown entrypoint' }}</small>
              </div>
              <div role="cell">
                <BaseHash
                  v-if="item.authority"
                  :hash="item.authority"
                  :link="contractAccountPath(item.authority) ?? undefined"
                  :type="hashType"
                  copy
                />
                <span v-else>—</span>
              </div>
              <span
                class="smart-contracts-page__result"
                :class="item.result_ok ? 'smart-contracts-page__result--ok' : 'smart-contracts-page__result--failed'"
                role="cell"
              >
                {{ item.result_ok ? 'Succeeded' : 'Failed' }}
              </span>
              <div role="cell">
                <time
                  v-if="item.timestamp_ms !== undefined"
                  :datetime="new Date(item.timestamp_ms).toISOString()"
                >
                  {{ defaultFormat(new Date(item.timestamp_ms)) }}
                </time>
                <span v-else>—</span>
              </div>
              <div role="cell">
                <BaseHash
                  :hash="item.entrypoint_hash"
                  :link="transactionPath(item.entrypoint_hash)"
                  :type="hashType"
                  copy
                />
              </div>
              <div role="cell">
                <details v-if="item.contract_payload !== undefined || item.fee_payment !== undefined">
                  <summary>View decoded data</summary>
                  <div class="smart-contracts-page__decoded">
                    <section v-if="item.contract_payload !== undefined">
                      <strong>Contract payload</strong>
                      <BaseJson :value="jsonRecord(item.contract_payload)" />
                    </section>
                    <section v-if="item.fee_payment !== undefined">
                      <strong>Fee payment</strong>
                      <BaseJson :value="jsonRecord(item.fee_payment)" />
                    </section>
                  </div>
                </details>
                <span v-else>—</span>
              </div>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseResourceState>

    <template v-else>
      <section
        class="smart-contracts-page__live"
        aria-labelledby="contract-live-events-title"
      >
        <div class="smart-contracts-page__live-header">
          <div>
            <h3 id="contract-live-events-title">
              Live events
            </h3>
            <p>One non-replayable Torii stream using the filters below.</p>
          </div>
          <div class="smart-contracts-page__live-actions">
            <BaseButton
              v-if="streamState.status === 'idle' || streamState.status === 'stopped'"
              bordered
              :disabled="!eventParams.ok"
              data-test="start-contract-stream"
              @click="startLiveEvents"
            >
              Start live stream
            </BaseButton>
            <BaseButton
              v-if="streamState.status === 'connecting' || streamState.status === 'live'"
              bordered
              data-test="stop-contract-stream"
              @click="stopLiveEvents"
            >
              Stop
            </BaseButton>
            <BaseButton
              v-if="streamState.status === 'stale'"
              bordered
              data-test="resync-contract-stream"
              @click="resyncLiveEvents"
            >
              Reload history and resync
            </BaseButton>
          </div>
        </div>

        <p
          v-if="streamState.status === 'connecting'"
          class="smart-contracts-page__stream-status"
          role="status"
        >
          Connecting to Torii…
        </p>
        <p
          v-else-if="streamState.status === 'live'"
          class="smart-contracts-page__stream-status smart-contracts-page__stream-status--live"
          role="status"
        >
          Live · {{ liveEvents.length }} event{{ liveEvents.length === 1 ? '' : 's' }} retained
        </p>
        <p
          v-else-if="streamState.status === 'stopped'"
          class="smart-contracts-page__stream-status"
          role="status"
        >
          Stream stopped by the user.
        </p>
        <div
          v-else-if="streamState.status === 'stale'"
          class="smart-contracts-page__stream-stale"
          role="alert"
          data-test="contract-stream-stale"
        >
          <strong>Live view is stale.</strong>
          <span>{{ streamState.message }}</span>
          <span v-if="streamState.code">Code: {{ streamState.code }}</span>
          <span v-if="streamState.droppedMessages !== null">
            Dropped messages: {{ streamState.droppedMessages }}
          </span>
          <span>This stream cannot replay and will not reconnect automatically.</span>
        </div>

        <div
          v-if="liveEvents.length > 0"
          class="smart-contracts-page__live-events"
        >
          <article
            v-for="event in liveEvents"
            :key="event.event_id"
            class="smart-contracts-page__live-event"
          >
            <div>
              <strong>{{ event.module }} · {{ event.event_kind }}</strong>
              <small>{{ event.provenance }} · block {{ event.block_height }}</small>
            </div>
            <BaseHash
              :hash="event.tx_hash_hex"
              :link="transactionPath(event.tx_hash_hex)"
              :type="hashType"
              copy
            />
            <details v-if="event.payload !== undefined || event.numeric_fields !== undefined">
              <summary>Decoded event data</summary>
              <BaseJson :value="jsonRecord(event.payload ?? event.numeric_fields)" />
            </details>
          </article>
        </div>
      </section>

      <h3 class="smart-contracts-page__history-title">
        Indexed event history
      </h3>
      <BaseResourceState
        :snapshot="eventSnapshot"
        loading-label="Loading contract events…"
        not-found-label="No indexed contract events match these filters."
        :retry-label="eventParams.ok ? 'Retry' : 'Clear invalid filters'"
        @retry="retryEvents"
      >
        <template #error="{ problem }">
          <span>{{ problem.message }}</span>
        </template>
        <template #default="{ data }">
          <BaseTable
            v-model:cursor="cursor"
            v-model:page-size="limit"
          pagination-mode="cursor"
            :loading="false"
            :cursor-pagination="data"
            :items="data.items"
            :row-key="eventRowKey"
            container-class="smart-contracts-page__container"
          >
            <template #header>
              <div
                class="smart-contracts-page__row smart-contracts-page__row--events"
                role="presentation"
              >
                <span class="h-sm" role="columnheader">Event</span>
                <span class="h-sm" role="columnheader">Contract</span>
                <span class="h-sm" role="columnheader">Participants / assets</span>
                <span class="h-sm" role="columnheader">Result</span>
                <span class="h-sm" role="columnheader">Block</span>
                <span class="h-sm" role="columnheader">Transaction</span>
                <span class="h-sm" role="columnheader">Decoded event data</span>
              </div>
            </template>
            <template #row="{ item }">
              <div
                class="smart-contracts-page__row smart-contracts-page__row--events"
                role="presentation"
              >
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseHash
                    :hash="item.event_id"
                    :type="hashType"
                    copy
                  />
                  <small>{{ item.module }} · {{ item.event_kind }} · {{ item.provenance }}</small>
                  <time
                    v-if="item.timestamp_ms !== undefined"
                    :datetime="new Date(item.timestamp_ms).toISOString()"
                  >
                    {{ defaultFormat(new Date(item.timestamp_ms)) }}
                  </time>
                </div>
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseHash
                    :hash="item.contract_address"
                    :type="addressHashType"
                    copy
                  />
                  <small>{{ item.contract_alias ?? 'No alias' }}</small>
                  <BaseHash
                    v-if="item.authority"
                    :hash="item.authority"
                    :link="contractAccountPath(item.authority) ?? undefined"
                    :type="hashType"
                  />
                </div>
                <div class="smart-contracts-page__related" role="cell">
                  <template
                    v-for="participant in item.participants ?? []"
                    :key="`participant:${participant}`"
                  >
                    <BaseLink
                      v-if="contractAccountPath(participant)"
                      :to="contractAccountPath(participant)!"
                    >
                      {{ participant }}
                    </BaseLink>
                    <span v-else>{{ participant }}</span>
                  </template>
                  <template
                    v-for="asset in item.asset_ids ?? []"
                    :key="`asset:${asset}`"
                  >
                    <BaseLink
                      v-if="contractAssetPath(asset)"
                      :to="contractAssetPath(asset)!"
                    >
                      {{ asset }}
                    </BaseLink>
                    <span v-else>{{ asset }}</span>
                  </template>
                  <span v-if="!(item.participants?.length || item.asset_ids?.length)">—</span>
                </div>
                <span
                  class="smart-contracts-page__result"
                  :class="item.result_ok ? 'smart-contracts-page__result--ok' : 'smart-contracts-page__result--failed'"
                  role="cell"
                >
                  {{ item.result_ok ? 'Succeeded' : 'Failed' }}
                </span>
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseLink :to="`/blocks/${item.block_height}`">
                    {{ item.block_height }}
                  </BaseLink>
                  <BaseHash
                    :hash="item.block_hash_hex"
                    :type="hashType"
                    copy
                  />
                </div>
                <div role="cell">
                  <BaseHash
                    :hash="item.tx_hash_hex"
                    :link="transactionPath(item.tx_hash_hex)"
                    :type="hashType"
                    copy
                  />
                </div>
                <div role="cell">
                  <details
                    v-if="item.payload !== undefined || item.numeric_fields !== undefined || item.fee_payment !== undefined"
                  >
                    <summary>View decoded data</summary>
                    <div class="smart-contracts-page__decoded">
                      <section v-if="item.payload !== undefined">
                        <strong>Payload</strong>
                        <BaseJson :value="jsonRecord(item.payload)" />
                      </section>
                      <section v-if="item.numeric_fields !== undefined">
                        <strong>Numeric fields</strong>
                        <BaseJson :value="jsonRecord(item.numeric_fields)" />
                      </section>
                      <section v-if="item.fee_payment !== undefined">
                        <strong>Fee payment</strong>
                        <BaseJson :value="jsonRecord(item.fee_payment)" />
                      </section>
                    </div>
                  </details>
                  <span v-else>—</span>
                </div>
              </div>
            </template>
          </BaseTable>
        </template>
      </BaseResourceState>
    </template>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import type { ContractActivity, ContractEvent, CollectionContinuation } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';
import { apiProblemFromError } from '@/shared/utils/resource-state';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { extractSmartContractDeployment, type SmartContractDeployment } from '@/shared/lib/smart-contracts';
import {
  appendLiveContractEvent,
  contractAccountPath,
  contractAssetPath,
  contractEventFiltersFromSearchParams,
  contractStreamStaleState,
  isAbortError,
  jsonRecord,
  parseContractActivitySearchParams,
  parseContractEventSearchParams,
  parseContractExplorerTab,
  unwrapContractListSnapshot,
  type ContractStreamState,
} from '@/shared/lib/contract-explorer';
import { firstRouteQueryValue, type RouteQueryPatchValue } from '@/shared/lib/route-query';
import { defaultFormat } from '@/shared/lib/time';

const tabs = [
  { value: 'deployments', label: 'Deployments' },
  { value: 'activity', label: 'Activity' },
  { value: 'events', label: 'Events' },
];
const filterKeys = [
  'authority',
  'contract_address',
  'contract_alias',
  'contract_entrypoint',
  'module',
  'event_kind',
  'participant',
  'asset_id',
  'provenance',
  'result_ok',
  'since_timestamp_ms',
  'until_timestamp_ms',
] as const;
const eventOnlyFilterKeys = ['module', 'event_kind', 'participant', 'asset_id', 'provenance'] as const;

const navigation = useScopedExplorerNavigation();
const { route, cursor, limit, updateListQuery } = useCursorListRouteQuery();
const activeTab = computed(() => parseContractExplorerTab(route.query.tab));
const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'medium', xs: 'two-line' }, 'short');
const addressHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'medium', md: 'short' }, 'two-line');

const filterDraft = reactive<Record<(typeof filterKeys)[number], string>>(
  Object.fromEntries(filterKeys.map((key) => [key, firstRouteQueryValue(route.query[key]) ?? ''])) as Record<
    (typeof filterKeys)[number],
    string
  >
);

watch(
  () => filterKeys.map((key) => route.query[key]),
  () => {
    for (const key of filterKeys) filterDraft[key] = firstRouteQueryValue(route.query[key]) ?? '';
  }
);

function selectTab(value: string) {
  const next = parseContractExplorerTab(value);
  const patch: Record<string, RouteQueryPatchValue> = {
    tab: next === 'deployments' ? null : next,
  };
  if (next === 'deployments') {
    for (const key of filterKeys) patch[key] = null;
  } else if (next === 'activity') {
    for (const key of eventOnlyFilterKeys) patch[key] = null;
  } else {
    patch.contract_entrypoint = null;
  }
  updateListQuery(patch, { history: 'push' }).catch(() => {});
}

function applyFilters() {
  const relevant = activeTab.value === 'activity'
    ? filterKeys.filter((key) => !eventOnlyFilterKeys.includes(key as (typeof eventOnlyFilterKeys)[number]))
    : filterKeys.filter((key) => key !== 'contract_entrypoint');
  const patch = Object.fromEntries(filterKeys.map((key) => [key, null])) as Record<string, RouteQueryPatchValue>;
  for (const key of relevant) patch[key] = filterDraft[key].trim() || null;
  updateListQuery(patch).catch(() => {});
}

function clearFilters() {
  const patch = Object.fromEntries(filterKeys.map((key) => [key, null])) as Record<string, null>;
  updateListQuery(patch).catch(() => {});
}

const deploymentCursor = ref<string | null>(null);
const deploymentLimit = ref(10);
const deploymentQuery = computed(() => ({
  cursor: deploymentCursor.value,
  limit: deploymentLimit.value,
  kind: 'ActivateContractInstance',
}));
const deploymentScope = useParamScope(
  () => ({
    key: JSON.stringify({ tab: activeTab.value, ...deploymentQuery.value }),
    payload: { params: deploymentQuery.value, active: activeTab.value === 'deployments' },
  }),
  ({ payload }) => setupAsyncData(
    () => http.fetchInstructions(payload.params),
    { immediate: payload.active }
  )
);

interface DeploymentList {
  items: SmartContractDeployment[]
  nextCursor: CollectionContinuation['nextCursor']
}

const deploymentSnapshot = computed<ResourceSnapshot<DeploymentList>>(() => {
  const snapshot = deploymentScope.value.expose.snapshot;
  if (snapshot.status !== 'ready') return snapshot as ResourceSnapshot<DeploymentList>;
  if (snapshot.data.status !== SUCCESSFUL_FETCHING) {
    return { status: 'error', problem: apiProblemFromError(snapshot.data) };
  }
  const items = snapshot.data.data.items.flatMap((instruction) => {
    const deployment = extractSmartContractDeployment(instruction);
    return deployment ? [deployment] : [];
  });
  if (items.length === 0) return { status: 'not-found' };
  return {
    status: 'ready',
    data: { items, nextCursor: snapshot.data.data.nextCursor },
    isRefreshing: snapshot.isRefreshing,
    refreshError: snapshot.refreshError,
  };
});

const activityParams = computed(() =>
  parseContractActivitySearchParams(route.query, cursor.value, limit.value)
);
const activityScope = useParamScope(
  () => ({
    key: JSON.stringify({ tab: activeTab.value, params: activityParams.value }),
    payload: {
      params: activityParams.value.ok ? activityParams.value.value : null,
      active: activeTab.value === 'activity' && activityParams.value.ok,
    },
  }),
  ({ payload }) => setupAsyncData(
    () => http.fetchContractActivity(payload.params!),
    { immediate: payload.active }
  )
);
const activitySnapshot = computed(() => unwrapContractListSnapshot(
  activityScope.value.expose.snapshot,
  activityParams.value.ok ? undefined : activityParams.value.error
));

const eventParams = computed(() =>
  parseContractEventSearchParams(route.query, cursor.value, limit.value)
);
const eventScope = useParamScope(
  () => ({
    key: JSON.stringify({ tab: activeTab.value, params: eventParams.value }),
    payload: {
      params: eventParams.value.ok ? eventParams.value.value : null,
      active: activeTab.value === 'events' && eventParams.value.ok,
    },
  }),
  ({ payload }) => setupAsyncData(
    () => http.fetchContractEvents(payload.params!),
    { immediate: payload.active }
  )
);
const eventSnapshot = computed(() => unwrapContractListSnapshot(
  eventScope.value.expose.snapshot,
  eventParams.value.ok ? undefined : eventParams.value.error
));

const liveEvents = shallowRef<ContractEvent[]>([]);
const streamState = ref<ContractStreamState>({ status: 'idle' });
let streamController: AbortController | null = null;
let streamGeneration = 0;

const liveFilterKey = computed(() => eventParams.value.ok
  ? JSON.stringify(contractEventFiltersFromSearchParams(eventParams.value.value))
  : eventParams.value.error
);

function resetLiveEvents() {
  streamGeneration += 1;
  streamController?.abort();
  streamController = null;
  liveEvents.value = [];
  streamState.value = { status: 'idle' };
}

watch(
  () => [activeTab.value, liveFilterKey.value] as const,
  (next, previous) => {
    if (previous && (next[0] !== previous[0] || next[1] !== previous[1])) resetLiveEvents();
  }
);

async function startLiveEvents() {
  if (activeTab.value !== 'events' || !eventParams.value.ok) return;
  resetLiveEvents();
  const generation = ++streamGeneration;
  const controller = new AbortController();
  streamController = controller;
  streamState.value = { status: 'connecting' };

  try {
    const filters = contractEventFiltersFromSearchParams(eventParams.value.value);
    for await (const message of http.streamContractEvents(filters, controller.signal)) {
      if (generation !== streamGeneration) return;
      liveEvents.value = appendLiveContractEvent(liveEvents.value, message.data);
      streamState.value = { status: 'live' };
    }
    if (generation === streamGeneration && !controller.signal.aborted) {
      streamState.value = contractStreamStaleState(
        new Error('The contract event stream ended unexpectedly and cannot be resumed.')
      );
    }
  } catch (error) {
    if (generation !== streamGeneration) return;
    if (controller.signal.aborted && isAbortError(error)) return;
    streamState.value = contractStreamStaleState(error);
  } finally {
    if (generation === streamGeneration) streamController = null;
  }
}

function stopLiveEvents() {
  streamGeneration += 1;
  streamController?.abort();
  streamController = null;
  streamState.value = { status: 'stopped' };
}

async function resyncLiveEvents() {
  if (!eventParams.value.ok) return;
  const result = await eventScope.value.expose.refetch();
  if (result?.status !== SUCCESSFUL_FETCHING) {
    streamState.value = contractStreamStaleState(new Error('History reload failed; the live view remains stale.'));
    return;
  }
  await startLiveEvents();
}

function retryDeployments() {
  deploymentScope.value.expose.refetch().catch(() => {});
}

function retryActivity() {
  if (!activityParams.value.ok) clearFilters();
  else activityScope.value.expose.refetch().catch(() => {});
}

function retryEvents() {
  if (!eventParams.value.ok) clearFilters();
  else eventScope.value.expose.refetch().catch(() => {});
}

function transactionPath(hash: string) {
  return `/transactions/${encodeURIComponent(hash)}`;
}

function deploymentRowKey(item: SmartContractDeployment) {
  return `${item.transactionHash}:${item.index}`;
}

function activityRowKey(item: ContractActivity) {
  return `${item.entrypoint_hash}:${item.contract_address}:${item.contract_entrypoint ?? ''}`;
}

function eventRowKey(item: ContractEvent) {
  return item.event_id;
}

function openDeployment(item: SmartContractDeployment) {
  navigation.push(transactionPath(item.transactionHash)).catch(() => {});
}

onScopeDispose(() => {
  streamGeneration += 1;
  streamController?.abort();
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.smart-contracts-page {
  &__hint,
  &__tabs,
  &__filters,
  &__live,
  &__history-title {
    margin-inline: size(2);

    @include sm {
      margin-inline: size(3);
    }

    @include md {
      margin-inline: size(2);
    }
  }

  &__hint {
    margin-block: 0 size(2);
    color: theme-color('content-secondary');
  }

  &__tabs {
    margin-block-end: size(3);
  }

  &__filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: size(2);
    padding: size(2);
    margin-block-end: size(3);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);

    label {
      display: grid;
      gap: size(0.75);

      span {
        color: theme-color('content-tertiary');
        font-size: size(1.5);
      }
    }

    input,
    select {
      min-width: 0;
      padding: size(1.25);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      color: theme-color('content-primary');
      background: theme-color('surface');
    }
  }

  &__filter-actions,
  &__live-actions {
    display: flex;
    align-items: end;
    gap: size(1);
  }

  &__container {
    display: grid;
    grid-template-columns: minmax(980px, 1fr);
    overflow-x: auto;
  }

  &__row {
    width: 100%;
    min-width: 980px;
    display: grid;
    gap: size(1.5);
    align-items: start;

    &--deployments {
      grid-template-columns: 2fr 1.2fr 1.5fr 0.5fr 1fr 1.2fr;
    }

    &--activity {
      grid-template-columns: 1.8fr 1.3fr 0.6fr 1fr 1.2fr 1.4fr;
    }

    &--events {
      grid-template-columns: 1.4fr 1.6fr 1.4fr 0.6fr 0.8fr 1.1fr 1.4fr;
    }

    small,
    time {
      color: theme-color('content-tertiary');
    }
  }

  &__stack,
  &__related,
  &__decoded {
    display: grid;
    gap: size(0.75);
    min-width: 0;
  }

  &__related {
    word-break: break-all;
  }

  &__result {
    width: fit-content;
    padding: size(0.5) size(1);
    border-radius: size(2);

    &--ok {
      color: theme-color('success');
      background: color-mix(in srgb, theme-color('success') 12%, transparent);
    }

    &--failed {
      color: theme-color('error');
      background: color-mix(in srgb, theme-color('error') 12%, transparent);
    }
  }

  details {
    max-width: 100%;

    summary {
      cursor: pointer;
      color: theme-color('primary');
    }
  }

  &__decoded {
    max-width: 440px;
    padding-block: size(1);

    section {
      min-width: 0;
    }
  }

  &__live {
    display: grid;
    gap: size(2);
    padding: size(2);
    margin-block-end: size(3);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__live-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: size(2);

    h3,
    p {
      margin: 0;
    }

    p {
      color: theme-color('content-tertiary');
    }
  }

  &__stream-status {
    margin: 0;
    color: theme-color('content-tertiary');

    &--live {
      color: theme-color('success');
    }
  }

  &__stream-stale {
    display: grid;
    gap: size(0.5);
    padding: size(2);
    border: 1px solid color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary'));
    border-radius: size(1);
    color: theme-color('warning');
    background: color-mix(in srgb, theme-color('warning') 8%, transparent);
  }

  &__live-events {
    display: grid;
    gap: size(1);
  }

  &__live-event {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr);
    gap: size(2);
    padding-block: size(1);
    border-top: 1px solid theme-color('border-primary');

    > div {
      display: grid;
    }

    small {
      color: theme-color('content-tertiary');
    }
  }

  &__history-title {
    margin-block-end: size(1);
  }
}
</style>
