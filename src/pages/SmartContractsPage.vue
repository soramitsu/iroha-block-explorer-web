<template>
  <BaseContentBlock :title="$t('contracts.title')" class="smart-contracts-page">
    <p class="smart-contracts-page__hint">
      {{ $t('contracts.explorerHint') }}
    </p>

    <BaseTabs
      :model-value="activeTab"
      :items="tabs"
      class="smart-contracts-page__tabs"
      @update:model-value="selectTab"
    />

    <form class="smart-contracts-page__filters" data-test="contract-filters" @submit.prevent="applyFilters">
      <label>
        <span>{{ $t('contracts.filters.authority') }}</span>
        <input
          v-model="filterDraft.authority"
          name="authority"
          :placeholder="$t('contracts.filters.authorityPlaceholder')"
        />
      </label>
      <label>
        <span>{{ $t('contracts.filters.contractAddress') }}</span>
        <input
          v-model="filterDraft.contract_address"
          name="contract_address"
          :placeholder="$t('contracts.filters.contractAddressPlaceholder')"
        />
      </label>
      <label>
        <span>{{ $t('contracts.filters.contractAlias') }}</span>
        <input
          v-model="filterDraft.contract_alias"
          name="contract_alias"
          :placeholder="$t('contracts.filters.contractAliasPlaceholder')"
        />
      </label>
      <label v-if="activeTab === 'activity'">
        <span>{{ $t('contracts.filters.entrypoint') }}</span>
        <input
          v-model="filterDraft.contract_entrypoint"
          name="contract_entrypoint"
          :placeholder="$t('contracts.filters.entrypointPlaceholder')"
        />
      </label>
      <template v-else>
        <label>
          <span>{{ $t('contracts.filters.module') }}</span>
          <input v-model="filterDraft.module" name="module" :placeholder="$t('contracts.filters.modulePlaceholder')" />
        </label>
        <label>
          <span>{{ $t('contracts.filters.eventKind') }}</span>
          <input
            v-model="filterDraft.event_kind"
            name="event_kind"
            :placeholder="$t('contracts.filters.eventKindPlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('contracts.filters.participant') }}</span>
          <input
            v-model="filterDraft.participant"
            name="participant"
            :placeholder="$t('contracts.filters.participantPlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('contracts.filters.asset') }}</span>
          <input
            v-model="filterDraft.asset_id"
            name="asset_id"
            :placeholder="$t('contracts.filters.assetPlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('contracts.filters.provenance') }}</span>
          <select v-model="filterDraft.provenance" name="provenance">
            <option value="">{{ $t('contracts.filters.any') }}</option>
            <option value="emitted">{{ $t('contracts.filters.emitted') }}</option>
            <option value="derived">{{ $t('contracts.filters.derived') }}</option>
          </select>
        </label>
      </template>
      <label>
        <span>{{ $t('contracts.filters.result') }}</span>
        <select v-model="filterDraft.result_ok" name="result_ok">
          <option value="">{{ $t('contracts.filters.any') }}</option>
          <option value="true">{{ $t('contracts.filters.succeeded') }}</option>
          <option value="false">{{ $t('contracts.filters.failed') }}</option>
        </select>
      </label>
      <label>
        <span>{{ $t('contracts.filters.since') }}</span>
        <input v-model="filterDraft.since_timestamp_ms" name="since_timestamp_ms" inputmode="numeric" placeholder="0" />
      </label>
      <label>
        <span>{{ $t('contracts.filters.until') }}</span>
        <input
          v-model="filterDraft.until_timestamp_ms"
          name="until_timestamp_ms"
          inputmode="numeric"
          placeholder="1767225599999"
        />
      </label>
      <div class="smart-contracts-page__filter-actions">
        <BaseButton native-type="submit" bordered>
          {{ $t('contracts.filters.apply') }}
        </BaseButton>
        <BaseButton native-type="button" line data-test="clear-contract-filters" @click="clearFilters">
          {{ $t('contracts.filters.clear') }}
        </BaseButton>
      </div>
    </form>

    <BaseResourceState
      v-if="activeTab === 'activity'"
      :snapshot="activitySnapshot"
      :loading-label="$t('contracts.states.loadingActivity')"
      :not-found-label="$t('contracts.states.noActivity')"
      :error-label="activityErrorLabel"
      :retry-label="
        !pagination.ok
          ? $t('table.resetPagination')
          : activityParams.ok
            ? $t('contracts.states.retry')
            : $t('contracts.filters.clearInvalid')
      "
      @retry="retryActivity"
    >
      <template #default="{ data }">
        <BaseTable
          v-model:page="page"
          v-model:page-size="pageSize"
          :loading="false"
          :total="data.total"
          :items="data.items"
          :max-fetch-size="PINNED_TORII_DEFAULT_MAX_FETCH_SIZE"
          :row-key="activityRowKey"
          container-class="smart-contracts-page__container"
        >
          <template #header>
            <div class="smart-contracts-page__row smart-contracts-page__row--activity" role="presentation">
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.contractEntrypoint') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.authority') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.result') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.timestamp') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.transaction') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('contracts.columns.decodedCallData') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="smart-contracts-page__row smart-contracts-page__row--activity" role="presentation">
              <div class="smart-contracts-page__stack" role="cell">
                <BaseHash :hash="item.contract_address" :type="addressHashType" copy />
                <small>
                  {{ item.contract_alias ?? $t('contracts.noAlias') }} ·
                  {{ item.contract_entrypoint ?? $t('contracts.unknownEntrypoint') }}
                </small>
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
                {{ item.result_ok ? $t('contracts.filters.succeeded') : $t('contracts.filters.failed') }}
              </span>
              <div role="cell">
                <time v-if="item.timestamp_ms !== undefined" :datetime="new Date(item.timestamp_ms).toISOString()">
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
                  <summary>{{ $t('contracts.decoded.view') }}</summary>
                  <div class="smart-contracts-page__decoded">
                    <section v-if="item.contract_payload !== undefined">
                      <strong>{{ $t('contracts.decoded.contractPayload') }}</strong>
                      <BaseJson :value="jsonRecord(item.contract_payload)" />
                    </section>
                    <section v-if="item.fee_payment !== undefined">
                      <strong>{{ $t('contracts.decoded.feePayment') }}</strong>
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
      <section class="smart-contracts-page__live" aria-labelledby="contract-live-events-title">
        <div class="smart-contracts-page__live-header">
          <div>
            <h3 id="contract-live-events-title">
              {{ $t('contracts.live.title') }}
            </h3>
            <p>{{ $t('contracts.live.hint') }}</p>
          </div>
          <div class="smart-contracts-page__live-actions">
            <BaseButton
              v-if="streamState.status === 'idle' || streamState.status === 'stopped'"
              bordered
              :disabled="!eventParams.ok"
              data-test="start-contract-stream"
              @click="startLiveEvents"
            >
              {{ $t('contracts.live.start') }}
            </BaseButton>
            <BaseButton
              v-if="streamState.status === 'connecting' || streamState.status === 'live'"
              bordered
              data-test="stop-contract-stream"
              @click="stopLiveEvents"
            >
              {{ $t('contracts.live.stop') }}
            </BaseButton>
            <BaseButton
              v-if="streamState.status === 'stale'"
              bordered
              data-test="resync-contract-stream"
              @click="resyncLiveEvents"
            >
              {{ $t('contracts.live.resync') }}
            </BaseButton>
          </div>
        </div>

        <p v-if="streamState.status === 'connecting'" class="smart-contracts-page__stream-status" role="status">
          {{ $t('contracts.live.connecting') }}
        </p>
        <p
          v-else-if="streamState.status === 'live'"
          class="smart-contracts-page__stream-status smart-contracts-page__stream-status--live"
          role="status"
        >
          {{
            $t(liveEvents.length === 1 ? 'contracts.live.oneRetained' : 'contracts.live.manyRetained', {
              count: liveEvents.length,
            })
          }}
        </p>
        <p v-else-if="streamState.status === 'stopped'" class="smart-contracts-page__stream-status" role="status">
          {{ $t('contracts.live.stopped') }}
        </p>
        <div
          v-else-if="streamState.status === 'stale'"
          class="smart-contracts-page__stream-stale"
          role="alert"
          data-test="contract-stream-stale"
        >
          <strong>{{ $t('contracts.live.stale') }}</strong>
          <span>{{ $t('contracts.live.streamFailed') }}</span>
          <span v-if="streamState.code">{{ $t('contracts.live.code', { code: streamState.code }) }}</span>
          <span v-if="streamState.droppedMessages !== null">
            {{ $t('contracts.live.dropped', { count: streamState.droppedMessages }) }}
          </span>
          <span>{{ $t('contracts.live.noReplay') }}</span>
        </div>

        <div v-if="liveEvents.length > 0" class="smart-contracts-page__live-events">
          <article v-for="event in liveEvents" :key="event.event_id" class="smart-contracts-page__live-event">
            <div>
              <strong>{{ event.module }} · {{ event.event_kind }}</strong>
              <small>
                {{ contractProvenanceLabel(event.provenance) }} ·
                {{ $t('contracts.live.block', { height: event.block_height }) }}
              </small>
            </div>
            <BaseHash :hash="event.tx_hash_hex" :link="transactionPath(event.tx_hash_hex)" :type="hashType" copy />
            <details v-if="event.payload !== undefined || event.numeric_fields !== undefined">
              <summary>{{ $t('contracts.live.decodedEvent') }}</summary>
              <BaseJson :value="jsonRecord(event.payload ?? event.numeric_fields)" />
            </details>
          </article>
        </div>
      </section>

      <h3 class="smart-contracts-page__history-title">
        {{ $t('contracts.live.history') }}
      </h3>
      <BaseResourceState
        :snapshot="eventSnapshot"
        :loading-label="$t('contracts.states.loadingEvents')"
        :not-found-label="$t('contracts.states.noEvents')"
        :error-label="eventErrorLabel"
        :retry-label="
          !pagination.ok
            ? $t('table.resetPagination')
            : eventParams.ok
              ? $t('contracts.states.retry')
              : $t('contracts.filters.clearInvalid')
        "
        @retry="retryEvents"
      >
        <template #default="{ data }">
          <BaseTable
            v-model:page="page"
            v-model:page-size="pageSize"
            :loading="false"
            :total="data.total"
            :items="data.items"
            :max-fetch-size="PINNED_TORII_DEFAULT_MAX_FETCH_SIZE"
            :row-key="eventRowKey"
            container-class="smart-contracts-page__container"
          >
            <template #header>
              <div class="smart-contracts-page__row smart-contracts-page__row--events" role="presentation">
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.event') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.contract') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.participantsAssets') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.result') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.block') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.transaction') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('contracts.columns.decodedEventData') }}</span>
              </div>
            </template>
            <template #row="{ item }">
              <div class="smart-contracts-page__row smart-contracts-page__row--events" role="presentation">
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseHash :hash="item.event_id" :type="hashType" copy />
                  <small>
                    {{ item.module }} · {{ item.event_kind }} · {{ contractProvenanceLabel(item.provenance) }}
                  </small>
                  <time v-if="item.timestamp_ms !== undefined" :datetime="new Date(item.timestamp_ms).toISOString()">
                    {{ defaultFormat(new Date(item.timestamp_ms)) }}
                  </time>
                </div>
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseHash :hash="item.contract_address" :type="addressHashType" copy />
                  <small>{{ item.contract_alias ?? $t('contracts.noAlias') }}</small>
                  <BaseHash
                    v-if="item.authority"
                    :hash="item.authority"
                    :link="contractAccountPath(item.authority) ?? undefined"
                    :type="hashType"
                  />
                </div>
                <div class="smart-contracts-page__related" role="cell">
                  <template v-for="participant in item.participants ?? []" :key="`participant:${participant}`">
                    <BaseLink v-if="contractAccountPath(participant)" :to="contractAccountPath(participant)!">
                      {{ participant }}
                    </BaseLink>
                    <span v-else>{{ participant }}</span>
                  </template>
                  <template v-for="asset in item.asset_ids ?? []" :key="`asset:${asset}`">
                    <BaseLink v-if="contractAssetPath(asset)" :to="contractAssetPath(asset)!">
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
                  {{ item.result_ok ? $t('contracts.filters.succeeded') : $t('contracts.filters.failed') }}
                </span>
                <div class="smart-contracts-page__stack" role="cell">
                  <BaseLink :to="`/blocks/${item.block_height}`">
                    {{ item.block_height }}
                  </BaseLink>
                  <BaseHash :hash="item.block_hash_hex" :type="hashType" copy />
                </div>
                <div role="cell">
                  <BaseHash :hash="item.tx_hash_hex" :link="transactionPath(item.tx_hash_hex)" :type="hashType" copy />
                </div>
                <div role="cell">
                  <details
                    v-if="
                      item.payload !== undefined || item.numeric_fields !== undefined || item.fee_payment !== undefined
                    "
                  >
                    <summary>{{ $t('contracts.decoded.view') }}</summary>
                    <div class="smart-contracts-page__decoded">
                      <section v-if="item.payload !== undefined">
                        <strong>{{ $t('contracts.decoded.payload') }}</strong>
                        <BaseJson :value="jsonRecord(item.payload)" />
                      </section>
                      <section v-if="item.numeric_fields !== undefined">
                        <strong>{{ $t('contracts.decoded.numericFields') }}</strong>
                        <BaseJson :value="jsonRecord(item.numeric_fields)" />
                      </section>
                      <section v-if="item.fee_payment !== undefined">
                        <strong>{{ $t('contracts.decoded.feePayment') }}</strong>
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
import { useI18n } from 'vue-i18n';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import { PINNED_TORII_DEFAULT_MAX_FETCH_SIZE, type ContractActivity, type ContractEvent } from '@/shared/api/schemas';
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
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { useListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';
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
  type ContractFilterValidationCode,
  type ContractFilterValidationIssue,
  type ContractStreamState,
} from '@/shared/lib/contract-explorer';
import { firstRouteQueryValue, type RouteQueryPatchValue } from '@/shared/lib/route-query';
import { defaultFormat } from '@/shared/lib/time';

const { t } = useI18n();
const tabs = [
  { value: 'activity', i18nKey: 'contracts.tabs.activity' },
  { value: 'events', i18nKey: 'contracts.tabs.events' },
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
const contractValidationKeys = {
  providedOnce: 'contracts.validation.providedOnce',
  stringValue: 'contracts.validation.stringValue',
  nonEmpty: 'contracts.validation.nonEmpty',
  canonicalInteger: 'contracts.validation.canonicalInteger',
  safeIntegerRange: 'contracts.validation.safeIntegerRange',
  canonicalAccountId: 'contracts.validation.canonicalAccountId',
  canonicalContractAddress: 'contracts.validation.canonicalContractAddress',
  canonicalContractAlias: 'contracts.validation.canonicalContractAlias',
  noritoStringValue: 'contracts.validation.noritoStringValue',
  booleanValue: 'contracts.validation.booleanValue',
  timestampOrder: 'contracts.validation.timestampOrder',
  provenanceValue: 'contracts.validation.provenanceValue',
} as const satisfies Record<ContractFilterValidationCode, string>;

const { route, page, pageSize, pagination, resetPagination, updateListQuery } = useListRouteQuery();
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
    tab: next === 'activity' ? null : next,
  };
  if (next === 'activity') {
    for (const key of eventOnlyFilterKeys) patch[key] = null;
  } else {
    patch.contract_entrypoint = null;
  }
  updateListQuery(patch, { history: 'push' }).catch(() => {});
}

function applyFilters() {
  const relevant =
    activeTab.value === 'activity'
      ? filterKeys.filter((key) => !eventOnlyFilterKeys.includes(key as (typeof eventOnlyFilterKeys)[number]))
      : filterKeys.filter((key) => key !== 'contract_entrypoint');
  const patch = Object.fromEntries(filterKeys.map((key) => [key, null])) as Record<string, RouteQueryPatchValue>;
  for (const key of relevant) patch[key] = filterDraft[key] || null;
  updateListQuery(patch).catch(() => {});
}

function clearFilters() {
  const patch = Object.fromEntries(filterKeys.map((key) => [key, null])) as Record<string, null>;
  updateListQuery(patch).catch(() => {});
}

function contractFilterValidationMessage(issues: readonly ContractFilterValidationIssue[]) {
  const details = issues.map((issue) => t(contractValidationKeys[issue.code], { ...issue.params })).join('; ');
  return t('contracts.validation.invalidFilters', { details });
}

function contractProvenanceLabel(provenance: ContractEvent['provenance']) {
  return t(provenance === 'emitted' ? 'contracts.filters.emitted' : 'contracts.filters.derived');
}

const activityParams = computed(() => parseContractActivitySearchParams(route.query, page.value, pageSize.value));
const paginationError = computed(() =>
  pagination.value.ok ? undefined : t('table.invalidPagination', { maxFetchSize: pagination.value.maxFetchSize })
);
const activityListValid = computed(() => pagination.value.ok && activityParams.value.ok);
const activityErrorLabel = computed(
  () =>
    paginationError.value ??
    (activityParams.value.ok
      ? t('contracts.states.activityError')
      : contractFilterValidationMessage(activityParams.value.issues))
);
const activityScope = useParamScope(
  () => ({
    key: JSON.stringify({ tab: activeTab.value, pagination: pagination.value, params: activityParams.value }),
    payload: {
      params: activityParams.value.ok ? activityParams.value.value : null,
      active: activeTab.value === 'activity' && activityListValid.value,
    },
  }),
  ({ payload }) => setupAsyncData(() => http.fetchContractActivity(payload.params!), { immediate: payload.active })
);
const activitySnapshot = computed(() =>
  unwrapContractListSnapshot(activityScope.value.expose.snapshot, {
    invalidListResponse: t('contracts.states.invalidListResponse'),
    validationError:
      paginationError.value ??
      (activityParams.value.ok ? undefined : contractFilterValidationMessage(activityParams.value.issues)),
  })
);

const eventParams = computed(() => parseContractEventSearchParams(route.query, page.value, pageSize.value));
const eventListValid = computed(() => pagination.value.ok && eventParams.value.ok);
const eventErrorLabel = computed(
  () =>
    paginationError.value ??
    (eventParams.value.ok
      ? t('contracts.states.eventError')
      : contractFilterValidationMessage(eventParams.value.issues))
);
const eventScope = useParamScope(
  () => ({
    key: JSON.stringify({ tab: activeTab.value, pagination: pagination.value, params: eventParams.value }),
    payload: {
      params: eventParams.value.ok ? eventParams.value.value : null,
      active: activeTab.value === 'events' && eventListValid.value,
    },
  }),
  ({ payload }) => setupAsyncData(() => http.fetchContractEvents(payload.params!), { immediate: payload.active })
);
const eventSnapshot = computed(() =>
  unwrapContractListSnapshot(eventScope.value.expose.snapshot, {
    invalidListResponse: t('contracts.states.invalidListResponse'),
    validationError:
      paginationError.value ??
      (eventParams.value.ok ? undefined : contractFilterValidationMessage(eventParams.value.issues)),
  })
);

const liveEvents = shallowRef<ContractEvent[]>([]);
const streamState = ref<ContractStreamState>({ status: 'idle' });
let streamController: AbortController | null = null;
let streamGeneration = 0;

const liveFilterKey = computed(() =>
  eventParams.value.ok
    ? JSON.stringify(contractEventFiltersFromSearchParams(eventParams.value.value))
    : JSON.stringify(eventParams.value.issues)
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
      streamState.value = contractStreamStaleState(new Error(t('contracts.live.streamEnded')));
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
  if (!eventListValid.value) return;
  const result = await eventScope.value.expose.refetch();
  if (result?.status !== SUCCESSFUL_FETCHING) {
    streamState.value = contractStreamStaleState(new Error(t('contracts.live.historyReloadFailed')));
    return;
  }
  await startLiveEvents();
}

function retryActivity() {
  if (!pagination.value.ok) resetPagination().catch(() => {});
  else if (!activityParams.value.ok) clearFilters();
  else activityScope.value.expose.refetch().catch(() => {});
}

function retryEvents() {
  if (!pagination.value.ok) resetPagination().catch(() => {});
  else if (!eventParams.value.ok) clearFilters();
  else eventScope.value.expose.refetch().catch(() => {});
}

function transactionPath(hash: string) {
  return `/transactions/${encodeURIComponent(hash)}`;
}

function activityRowKey(item: ContractActivity) {
  return `${item.entrypoint_hash}:${item.contract_address}:${item.contract_entrypoint ?? ''}`;
}

function eventRowKey(item: ContractEvent) {
  return item.event_id;
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
