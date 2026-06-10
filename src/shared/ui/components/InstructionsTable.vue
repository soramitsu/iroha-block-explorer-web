<script setup lang="ts">
import { defaultFormat } from '@/shared/lib/time';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import TransactionStatus from '@/entities/transaction/TransactionStatus.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import ContractCodeViewPanel from '@/shared/ui/components/ContractCodeViewPanel.vue';
import type { Instruction, InstructionsSearchParams } from '@/shared/api/schemas';
import { useI18n } from 'vue-i18n';
import {
  type filterTransactionsModel as ftm,
  InstructionTypeFilter,
  TransactionStatusFilter,
} from '@/features/filter/transactions';
import {
  ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS,
  INSTRUCTIONS_ADAPTIVE_OPTIONS,
} from '@/features/filter/transactions/adaptive-options';
import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import { objectOmit } from '@vueuse/shared';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING, NOT_FOUND } from '@/shared/api/consts';
import { useClipboard, useThrottleFn, useWindowScroll } from '@vueuse/core';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { Instruction as InstructionSchema } from '@/shared/api/schemas';
import { collectInstructionFallback } from '@/shared/lib/instruction-fallback';
import { resolveContractViewInstructionKind } from '@/shared/lib/contract-view';
import { fetchAllTransactionInstructions } from '@/shared/lib/transaction-instructions';
import {
  buildMultisigCustomDisplayPayload,
  readMultisigCustomEnvelope,
} from '@/shared/lib/multisig-custom';
import { useExplorerInstructionsEvents } from '@/shared/ui/composables/useExplorerInstructionsEvents';

const { t } = useI18n();
const props = defineProps<{
  showValue?: boolean
  hashType: HashType
  filterBy: { kind: 'authority', value: string } | { kind: 'transaction', value: string }
  initialInstructionIndex?: number | null
}>();

const emit = defineEmits<{
  (e: 'details-opened', payload: { transactionHash: string, index: number }): void
  (e: 'details-closed'): void
  (e: 'list-state', payload: { isLoading: boolean, totalItems: number, itemsCount: number }): void
}>();

function isBase64EncodedWasm(item: Instruction) {
  return item.kind === 'Upgrade';
}

function resolveInstructionRawPayload(item: Instruction) {
  return item.box.json.payload ?? null;
}

function resolveInstructionPayload(item: Instruction) {
  const payload = resolveInstructionRawPayload(item);
  if (item.kind !== 'Custom') return payload;

  return buildMultisigCustomDisplayPayload(payload) ?? payload;
}

const MULTISIG_CUSTOM_VARIANTS = new Set(['Register', 'Propose', 'Approve']);
const CUSTOM_VARIANT_PLACEHOLDER = 'Unknown';

function readMultisigVariantCandidate(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const entries = Object.entries(candidate as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [variant, details] = entries[0];
  if (!MULTISIG_CUSTOM_VARIANTS.has(variant)) return null;
  if (!details || typeof details !== 'object') return null;
  const account = (details as Record<string, unknown>).account;
  if (typeof account !== 'string') return null;
  return variant;
}

function getMultisigVariant(item: Instruction): string | null {
  if (item.kind !== 'Custom') return null;
  const payload = resolveInstructionRawPayload(item);
  const directVariant = readMultisigVariantCandidate(payload);
  if (directVariant) return directVariant;

  return readMultisigCustomEnvelope(payload)?.variant ?? null;
}

function toVariantLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sections = trimmed.split('::').filter(Boolean);
  return sections.at(-1) ?? trimmed;
}

function readWireIdVariant(payload: unknown, wireId: string | undefined): string | null {
  const topLevelVariant = toVariantLabel(wireId);
  if (topLevelVariant) return topLevelVariant;

  if (!payload || typeof payload !== 'object') return null;
  const payloadRecord = payload as Record<string, unknown>;

  const payloadWireIdVariant = toVariantLabel(payloadRecord.wire_id);
  if (payloadWireIdVariant) return payloadWireIdVariant;

  const nestedValue = payloadRecord.value;
  if (!nestedValue || typeof nestedValue !== 'object') return null;
  return toVariantLabel((nestedValue as Record<string, unknown>).wire_id);
}

function readSingleKeyVariant(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [key] = entries[0];
  if (key === 'value') return null;
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(key)) return null;
  return toVariantLabel(key);
}

function getCustomInstructionKind(item: Instruction): string | null {
  if (item.kind !== 'Custom') return null;
  if (getMultisigVariant(item)) return t('transactions.multisig');

  const payload = resolveInstructionRawPayload(item);
  const wireIdVariant = readWireIdVariant(payload, item.box.json.wire_id);
  if (wireIdVariant) return wireIdVariant;

  if (payload && typeof payload === 'object') {
    const payloadRecord = payload as Record<string, unknown>;

    const variant = toVariantLabel(payloadRecord.variant);
    if (variant && variant !== CUSTOM_VARIANT_PLACEHOLDER) return variant;

    const directKeyVariant = readSingleKeyVariant(payloadRecord);
    if (directKeyVariant) return directKeyVariant;

    const nestedValue = payloadRecord.value;
    const nestedValueVariant = readSingleKeyVariant(nestedValue);
    if (nestedValueVariant) return nestedValueVariant;
  }

  return null;
}

function getInstructionKindLabel(item: Instruction): string {
  const customInstructionKind = getCustomInstructionKind(item);
  if (customInstructionKind) return customInstructionKind;
  return item.kind;
}

function getInstructionPayloadValue(item: Instruction): Record<string, any> {
  const payload = resolveInstructionPayload(item);
  if (payload && typeof payload === 'object') return payload as Record<string, any>;
  if (payload !== null && payload !== undefined) return { value: payload };
  return {};
}

function getInstructionPayloadEntity(item: Instruction) {
  if (isBase64EncodedWasm(item)) return t('transactions.object');
  const payload = resolveInstructionRawPayload(item);
  if (!payload || typeof payload !== 'object') return t('transactions.object');
  const multisigEnvelope = readMultisigCustomEnvelope(payload);
  if (multisigEnvelope) {
    return `${multisigEnvelope.variant} (${multisigEnvelope.instructions.length})`;
  }
  const payloadRecord = payload as Record<string, any>;
  if ('object' in payloadRecord) {
    const target = payloadRecord.object;
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object') {
      if (typeof target.id === 'string') return target.id;
      if (typeof target.type === 'string') return target.type;
    }
  }
  const keys = Object.keys(payloadRecord);
  if (keys.length > 0) return keys[0];
  return t('transactions.object');
}

const isOnAccountPage = computed(() => props.filterBy.kind === 'authority');
const shouldShowKind = computed(() => listState.kind === 'All');

const listState = reactive({
  transaction_status: null,
  authority: computed(() => (props.filterBy.kind === 'authority' ? props.filterBy.value.toString() : '')),
  transaction_hash: computed(() => (props.filterBy.kind === 'transaction' ? props.filterBy.value : '')),
  kind: 'All' as ftm.TabInstructions,
  page: 1,
  per_page: 10,
});

const searchParams = computed<InstructionsSearchParams>(() => {
  if (isOnAccountPage.value) {
    return {
      ...objectOmit(listState, shouldShowKind.value ? ['kind'] : []),
      transaction_status: listState.transaction_status ?? undefined,
    };
  }

  return {
    ...objectOmit(listState, shouldShowKind.value ? ['kind', 'transaction_status'] : ['transaction_status']),
  };
});

watch([() => listState.kind, () => listState.transaction_status, () => listState.per_page], () => {
  listState.page = 1;
});

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(searchParams.value),
      payload: searchParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchInstructions(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const fetchedTotalItems = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination.total_items : 0
);
const fetchedItems = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value?.expose.data.data.items : []
);
const fallbackInstructions = ref<Instruction[]>([]);
const fallbackAttemptedHash = ref<string | null>(null);
const fallbackLoading = ref(false);
const shouldUseFallbackInstructions = computed(
  () => props.filterBy.kind === 'transaction' && listState.page === 1 && fallbackInstructions.value.length > 0
);
const totalItems = computed(() =>
  fetchedTotalItems.value > 0 || fetchedItems.value.length > 0
    ? fetchedTotalItems.value
    : shouldUseFallbackInstructions.value
      ? fallbackInstructions.value.length
      : 0
);
const items = computed(() =>
  fetchedItems.value.length > 0
    ? fetchedItems.value
    : shouldUseFallbackInstructions.value
      ? fallbackInstructions.value
      : []
);

const instructionRowKey = (item: Instruction) => `${item.transaction_hash}:${item.index}`;

const { y: windowScrollY } = useWindowScroll();
const pendingRefresh = ref(false);

const detailState = reactive({
  isOpen: false,
  isLoading: false,
  error: '',
  data: null as Instruction | null,
});
const detailRelatedInstructionsState = reactive({
  isLoading: false,
  transactionHash: '',
  items: [] as Instruction[],
});

const autoInstructionIndex = ref<number | null>(null);
const lastSelection = ref<{ transactionHash: string, index: number } | null>(null);
const clipboard = useClipboard();
const notifications = useNotifications();

const instructionsStream = useExplorerInstructionsEvents();

const latestInstruction = computed<Instruction | null>(() => {
  const raw = instructionsStream.data.value;
  if (!raw) return null;
  try {
    return InstructionSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn('[InstructionsTable] Failed to parse instruction stream payload', error);
    return null;
  }
});

const scheduleInstructionsReload = useThrottleFn(() => {
  pendingRefresh.value = false;
  scope.value?.expose.refetch?.();
}, 1000);

function applyPendingRefresh() {
  scheduleInstructionsReload();
}

async function tryTransactionInstructionFallback() {
  if (props.filterBy.kind !== 'transaction') return;
  if (listState.page !== 1) return;
  if (isLoading.value || fallbackLoading.value) return;
  if (fetchedItems.value.length > 0 || fetchedTotalItems.value > 0) {
    fallbackInstructions.value = [];
    return;
  }

  const hash = props.filterBy.value;
  const targetIndex = isNil(autoInstructionIndex.value) ? null : Math.max(0, Math.floor(autoInstructionIndex.value));
  const targetPresent = isNil(targetIndex)
    ? true
    : fallbackInstructions.value.some((instruction) => instruction.index === targetIndex);

  if (fallbackAttemptedHash.value === hash && targetPresent) return;

  fallbackAttemptedHash.value = hash;
  fallbackLoading.value = true;
  try {
    fallbackInstructions.value = await collectInstructionFallback({
      transactionHash: hash,
      fetchInstructionDetail: http.fetchInstructionDetail,
      priorityIndex: targetIndex,
      maxProbe: 64,
    });
  } finally {
    fallbackLoading.value = false;
  }
}

function triggerTransactionInstructionFallback() {
  tryTransactionInstructionFallback().catch((error) => {
    console.warn('[InstructionsTable] Failed to collect instruction fallback', error);
  });
}

async function loadInstructionDetail(target: { transactionHash: string, index: number }) {
  detailState.isOpen = true;
  detailState.isLoading = true;
  detailState.error = '';
  detailState.data = null;
  emit('details-opened', target);
  try {
    const response = await http.fetchInstructionDetail(target.transactionHash, target.index);
    if (response.status === SUCCESSFUL_FETCHING) {
      detailState.data = response.data;
    } else if (response.status === NOT_FOUND) {
      detailState.error = t('transactions.instructionNotFound');
    } else {
      detailState.error = t('transactions.unknownError');
    }
  } catch (error) {
    detailState.error = t('transactions.unknownError');
  } finally {
    detailState.isLoading = false;
  }
}

async function loadRelatedContractInstructions(instruction: Instruction) {
  if (props.filterBy.kind !== 'transaction') {
    detailRelatedInstructionsState.transactionHash = '';
    detailRelatedInstructionsState.items = [];
    detailRelatedInstructionsState.isLoading = false;
    return;
  }

  if (!resolveContractViewInstructionKind(instruction)) {
    detailRelatedInstructionsState.transactionHash = '';
    detailRelatedInstructionsState.items = [];
    detailRelatedInstructionsState.isLoading = false;
    return;
  }

  if (
    detailRelatedInstructionsState.transactionHash === instruction.transaction_hash
    && detailRelatedInstructionsState.items.length > 0
  ) {
    return;
  }

  detailRelatedInstructionsState.isLoading = true;
  try {
    let instructions = await fetchAllTransactionInstructions({
      transactionHash: instruction.transaction_hash,
      fetchInstructions: http.fetchInstructions,
      perPage: 128,
    });

    if (!instructions.length) {
      instructions = await collectInstructionFallback({
        transactionHash: instruction.transaction_hash,
        fetchInstructionDetail: http.fetchInstructionDetail,
        priorityIndex: instruction.index,
        maxProbe: 128,
      });
    }

    detailRelatedInstructionsState.transactionHash = instruction.transaction_hash;
    detailRelatedInstructionsState.items = instructions;
  } catch (error) {
    console.warn('[InstructionsTable] Failed to load related contract instructions', error);
    detailRelatedInstructionsState.transactionHash = instruction.transaction_hash;
    detailRelatedInstructionsState.items = items.value;
  } finally {
    detailRelatedInstructionsState.isLoading = false;
  }
}

async function openInstructionDetails(item: Instruction) {
  lastSelection.value = { transactionHash: item.transaction_hash, index: item.index };
  await loadInstructionDetail(lastSelection.value);
}

function closeInstructionDetails() {
  detailState.isOpen = false;
  detailState.error = '';
  detailState.data = null;
  detailRelatedInstructionsState.transactionHash = '';
  detailRelatedInstructionsState.items = [];
  detailRelatedInstructionsState.isLoading = false;
  emit('details-closed');
  lastSelection.value = null;
}

const selectedInstructionJson = computed(() => {
  const instruction = detailState.data;
  if (!instruction) return null;
  return resolveInstructionPayload(instruction) ?? instruction.box.json.payload ?? instruction.box.json;
});

const selectedInstructionKindLabel = computed(() => {
  const instruction = detailState.data;
  if (!instruction) return '';
  return getInstructionKindLabel(instruction);
});

const selectedContractInstructionKind = computed(() => {
  const instruction = detailState.data;
  if (!instruction) return null;
  return resolveContractViewInstructionKind(instruction);
});

const relatedContractInstructions = computed(() => {
  if (!detailState.data) return items.value;
  if (!selectedContractInstructionKind.value) return items.value;
  if (detailRelatedInstructionsState.transactionHash !== detailState.data.transaction_hash) {
    return items.value;
  }
  return detailRelatedInstructionsState.items.length > 0 ? detailRelatedInstructionsState.items : items.value;
});

const shareLink = computed(() => {
  if (!lastSelection.value) return null;
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.origin);
  url.pathname = `/transactions/${lastSelection.value.transactionHash}`;
  url.searchParams.set('instruction', String(lastSelection.value.index));
  return url.toString();
});

watch(
  () => JSON.stringify(searchParams.value),
  () => {
    pendingRefresh.value = false;
    fallbackInstructions.value = [];
    fallbackAttemptedHash.value = null;
    if (detailState.isOpen) closeInstructionDetails();
  }
);

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

watch(
  () => props.initialInstructionIndex ?? null,
  (value) => {
    autoInstructionIndex.value = Number.isFinite(value) ? (value as number) : null;
    fallbackAttemptedHash.value = null;
    if (isNil(value) && detailState.isOpen) {
      closeInstructionDetails();
    }
  },
  { immediate: true }
);

watch(
  () => [
    props.filterBy.kind,
    props.filterBy.value,
    listState.page,
    isLoading.value,
    fetchedItems.value.length,
    fetchedTotalItems.value,
    autoInstructionIndex.value,
  ],
  () => {
    triggerTransactionInstructionFallback();
  },
  { immediate: true }
);

watch(
  () => [items.value, autoInstructionIndex.value, props.filterBy.kind],
  ([currentItems, targetIndex, filterKind]) => {
    if (isNil(targetIndex) || filterKind !== 'transaction') return;
    if (detailState.isOpen && detailState.data?.index === targetIndex) return;
    const match = (currentItems as Instruction[]).find((instruction) => instruction.index === targetIndex);
    if (match) {
      lastSelection.value = { transactionHash: match.transaction_hash, index: match.index };
      loadInstructionDetail(lastSelection.value).catch(() => undefined);
    }
  },
  { immediate: true }
);

watch(
  () => detailState.data,
  (instruction) => {
    if (!instruction) return;
    if (!resolveContractViewInstructionKind(instruction)) return;
    loadRelatedContractInstructions(instruction).catch(() => undefined);
  }
);

async function retryInstructionDetail() {
  if (!lastSelection.value) return;
  await loadInstructionDetail(lastSelection.value);
}

async function copyEncodedPayload() {
  if (!detailState.data) return;
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }
  await clipboard.copy(detailState.data.box.encoded);
  notifications.success(t('clipboard.success'));
}

async function copyInstructionLink() {
  if (!shareLink.value) return;
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }
  await clipboard.copy(shareLink.value);
  notifications.success(t('transactions.instructionLinkCopied'));
}

watch(
  () => latestInstruction.value,
  (instruction) => {
    if (!instruction) return;

    if (props.filterBy.kind === 'authority') {
      if (instruction.authority !== props.filterBy.value.toString()) return;
    } else if (props.filterBy.kind === 'transaction') {
      if (instruction.transaction_hash !== props.filterBy.value) return;
    }

    const instructionKindMatches =
      listState.kind === 'All' ||
      instruction.kind === listState.kind ||
      instruction.box.json.kind === listState.kind;
    if (!instructionKindMatches) return;
    if (listState.transaction_status && instruction.transaction_status !== listState.transaction_status) return;

    // Avoid shifting paginated views under the user's cursor.
    // Only auto-refresh when the table is on the first page.
    if (listState.page !== 1) return;

    // Avoid shifting the page while the user is scrolled down.
    if (windowScrollY.value > 80) {
      pendingRefresh.value = true;
      return;
    }

    scheduleInstructionsReload();
  }
);

watch(
  () => [isLoading.value, fallbackLoading.value, totalItems.value, items.value.length] as const,
  ([tableLoading, fallbackInFlight, currentTotalItems, currentItemsCount]) => {
    emit('list-state', {
      isLoading: tableLoading || fallbackInFlight,
      totalItems: currentTotalItems,
      itemsCount: currentItemsCount,
    });
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="instructions-table"
    :class="{ 'instructions-table_short': !props.showValue }"
  >
    <div class="instructions-table__filters content-row">
      <InstructionTypeFilter
        v-model="listState.kind"
        :adaptive-options="isOnAccountPage ? ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS : INSTRUCTIONS_ADAPTIVE_OPTIONS"
      />
      <TransactionStatusFilter
        v-if="isOnAccountPage"
        v-model="listState.transaction_status"
      />
    </div>

    <div
      v-if="pendingRefresh"
      class="instructions-table__pending content-row"
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
      :total="totalItems"
      :items
      :row-key="instructionRowKey"
      container-class="instructions-table__container"
      :pagination-breakpoint="1441"
    >
      <template #row="{ item }">
        <div
          class="instructions-table__row"
          :class="{ 'instructions-table__row_with-value': props.showValue }"
        >
          <TransactionStatus
            type="tooltip"
            class="instructions-table__icon"
            :committed="item.transaction_status === 'Committed'"
          />

          <div class="instructions-table__column">
            <div class="instructions-table__label">
              {{ $t('transactions.transactionID') }}
            </div>

            <BaseHash
              :hash="item.transaction_hash"
              :type="hashType"
              :link="`/transactions/${item.transaction_hash}`"
              copy
            />

            <time
              class="instructions-table__time row-text-monospace"
              :datetime="item.created_at.toISOString()"
            >
              {{ defaultFormat(item.created_at) }}
            </time>
          </div>

          <div class="instructions-table__columns">
            <div
              v-if="shouldShowKind"
              class="instructions-table__column"
            >
              <div class="instructions-table__label">
                {{ $t('kind') }}
              </div>

              <span
                class="row-text instructions-table__kind-badge"
                data-test="instruction-kind-label"
              >{{ getInstructionKindLabel(item) }}</span>
            </div>

            <div class="instructions-table__column">
              <div class="instructions-table__label">
                {{ $t('entity') }}
              </div>

              <span class="row-text">{{ getInstructionPayloadEntity(item) }}</span>
            </div>

            <div class="instructions-table__column-block">
              <div class="instructions-table__label">
                {{ $t('transactions.block') }}
              </div>

              <BaseLink
                :to="`/blocks/${item.block}`"
                monospace
              >
                {{ item.block }}
              </BaseLink>
            </div>
          </div>

          <div
            v-if="props.showValue"
            class="instructions-table__column-value"
          >
            <div class="instructions-table__label">
              {{ $t('value') }}
            </div>

            <BaseJson
              v-if="!isBase64EncodedWasm(item)"
              class="instructions-table__value-json"
              :value="getInstructionPayloadValue(item)"
            />
            <span
              v-else
              class="row-text"
            >{{ $t('transactions.displayingIsntSupported') }}</span>
          </div>

          <div class="instructions-table__actions">
            <button
              class="instructions-table__action-button"
              type="button"
              @click="openInstructionDetails(item)"
            >
              {{ $t('transactions.viewInstruction') }}
            </button>
          </div>
        </div>
      </template>
    </BaseTable>

    <section
      v-if="detailState.isOpen"
      class="instructions-detail"
    >
      <div class="instructions-detail__header">
        <div class="instructions-detail__title">
          <h3>{{ $t('transactions.instructionDetails') }}</h3>
          <div
            v-if="detailState.data && !detailState.isLoading && !detailState.error"
            class="instructions-detail__kind"
            data-test="instruction-detail-kind"
          >
            <span class="instructions-detail__kind-label">{{ $t('transactions.kind') }}</span>
            <span class="instructions-detail__kind-value">{{ selectedInstructionKindLabel }}</span>
          </div>
        </div>
        <div class="instructions-detail__header-actions">
          <button
            v-if="shareLink"
            class="instructions-detail__share"
            type="button"
            @click="copyInstructionLink"
          >
            {{ $t('transactions.copyInstructionLink') }}
          </button>
          <button
            class="instructions-detail__close"
            type="button"
            @click="closeInstructionDetails"
          >
            {{ $t('transactions.hideInstruction') }}
          </button>
        </div>
      </div>

      <div
        v-if="detailState.isLoading"
        class="instructions-detail__status"
      >
        {{ $t('transactions.loadingInstruction') }}
      </div>

      <div
        v-else-if="detailState.error"
        class="instructions-detail__status instructions-detail__status_error"
      >
        <span>{{ detailState.error }}</span>
        <button
          class="instructions-detail__retry"
          type="button"
          @click="retryInstructionDetail"
        >
          {{ $t('transactions.retryInstruction') }}
        </button>
      </div>

      <div
        v-else-if="detailState.data"
        class="instructions-detail__body"
      >
        <div class="instructions-detail__meta">
          <DataField :title="$t('transactions.transactionID')">
            <BaseHash
              :hash="detailState.data.transaction_hash"
              type="short"
              :link="`/transactions/${detailState.data.transaction_hash}`"
            />
          </DataField>
          <DataField :title="$t('transactions.block')">
            <BaseLink
              :to="`/blocks/${detailState.data.block}`"
              monospace
            >
              {{ detailState.data.block }}
            </BaseLink>
          </DataField>
          <DataField :title="$t('accounts.accountId')">
            <BaseHash
              :hash="detailState.data.authority"
              type="short"
              :link="`/accounts/${detailState.data.authority}`"
            />
          </DataField>
          <DataField
            :title="$t('transactions.kind')"
            :value="selectedInstructionKindLabel"
          />
          <DataField :title="$t('transactions.status')">
            <TransactionStatus
              type="label"
              :committed="detailState.data.transaction_status === 'Committed'"
            />
          </DataField>
          <DataField :title="$t('transactions.index')">
            <span class="row-text">{{ detailState.data.index }}</span>
          </DataField>
        </div>

        <div class="instructions-detail__json">
          <div class="instructions-table__label">
            {{ $t('transactions.metadata') }}
          </div>
          <BaseJson
            class="instructions-detail__json-tree"
            full
            :value="selectedInstructionJson ?? detailState.data.box.json?.payload ?? detailState.data.box.json ?? {}"
          />
        </div>

        <div class="instructions-detail__encoded">
          <div class="instructions-table__label">
            {{ $t('transactions.instructionEncodedPayload') }}
          </div>
          <div class="instructions-detail__encoded-content">
            <div class="instructions-detail__encoded-box">
              <pre data-test="instruction-encoded-payload">{{ detailState.data.box.encoded }}</pre>
            </div>
            <button
              class="instructions-detail__copy"
              type="button"
              @click="copyEncodedPayload"
            >
              {{ $t('transactions.copyEncodedPayload') }}
            </button>
          </div>
        </div>

        <div
          v-if="selectedContractInstructionKind"
          class="instructions-detail__contract-code"
        >
          <div class="instructions-table__label">
            {{ $t('transactions.contractView.title') }}
          </div>
          <ContractCodeViewPanel
            :instruction="detailState.data"
            :related-instructions="relatedContractInstructions"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.instructions-table {
  &_short {
    .content-row {
      height: auto;

      @include xxs {
        width: 90vw;
      }

      @include lg {
        width: 46vw;
        height: size(12) !important;
      }

      @include xl {
        width: auto;
      }
    }
    & > .content-row {
      @include lg {
        height: size(6) !important;
      }
    }

    .instructions-table__columns {
      @include lg {
        flex-direction: column;
        gap: size(2);
      }

      .instructions-table__column,
      .instructions-table__column-block {
        width: auto;
        min-width: 0;
      }
    }

    .instructions-table__row {
      @include sm {
        grid-template-columns: 32px minmax(0, 0.9fr) minmax(0, 0.7fr) auto;
      }

      @include lg {
        grid-template-columns: 32px minmax(0, 0.8fr) minmax(0, 0.9fr) auto;
      }

      @include xl {
        grid-template-columns: 32px minmax(0, 1.4fr) minmax(0, 1fr) auto;
      }
    }

    .instructions-table__actions {
      grid-column: -2 / -1;
      margin-left: 0;
      align-self: start;
    }
  }

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
      grid-template-columns: 32px 0.9fr 0.6fr;
      grid-gap: size(2);
      align-items: center;
    }

    @include lg {
      grid-template-columns: 32px 0.8fr 0.9fr;
    }

    @include xl {
      grid-template-columns: 32px 1.4fr 1fr;
    }

    &_with-value {
      @include sm {
        grid-template-columns: 32px minmax(0, 1fr) auto;
        align-items: start;
      }

      @include lg {
        grid-template-columns: 32px minmax(0, 0.9fr) minmax(0, 1fr) auto;
      }

      @include xl {
        grid-template-columns: 32px minmax(0, 1.1fr) minmax(0, 1fr) auto;
      }

      .instructions-table__column {
        grid-column: 2 / 3;
      }

      .instructions-table__columns {
        grid-column: 2 / 3;
        min-width: 0;
      }

      .instructions-table__column-value {
        grid-column: 2 / 3;
        min-width: 0;
        width: 100%;
      }

      .instructions-table__actions {
        grid-column: -2 / -1;
        grid-row: 1 / span 3;
        margin-left: 0;
        align-self: start;
      }

      @include lg {
        .instructions-table__columns {
          grid-column: 3 / 4;
        }

        .instructions-table__column-value {
          grid-column: 2 / 4;
        }
      }
    }
  }

  &__container {
    display: grid;
    .content-row {
      padding: 0 size(4);

      height: auto;
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

  &__filters {
    padding: size(2) size(4);
    display: flex;
    flex-direction: column;
    gap: size(1);

    @include sm {
      flex-direction: row;
    }
  }

  &__icon {
    display: none;

    @include sm {
      display: grid;
    }
  }

  &__label {
    width: size(6);
    color: theme-color('content-quaternary');
    @include tpg-s3;
  }

  &__time {
    color: theme-color('content-primary');
    grid-column: 1 / -1;
  }

  &__kind-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: size(0.5) size(1.5);
    border-radius: size(2);
    border: 1px solid color-mix(in srgb, theme-color('primary') 45%, theme-color('border-primary'));
    background: color-mix(in srgb, theme-color('primary') 10%, transparent);
    font-weight: 600;
  }

  &__columns {
    display: flex;
    gap: size(3);
    flex-direction: column;

    @include md {
      flex-direction: row;
    }

    @include xl {
      flex-direction: column;
      gap: size(2);
    }

    .instructions-table__column {
      width: size(22);

      &-block {
        width: size(10);
        display: flex;
        gap: size(1);
        align-items: center;
      }
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

    &-value {
      display: flex;
      gap: size(2);
      min-width: 0;

      span {
        word-break: break-all;
      }

      @include xxs {
        width: 75vw;
      }

      @include sm {
        width: 82vw;
      }

      @include md {
        width: 85vw;
      }

      @include lg {
        width: 80vw;
      }

      @include xl {
        width: 75vw;
      }
    }
  }

  &__value-json {
    min-width: 0;
    width: 100%;

    :deep(.vjs-tree.is-virtual) {
      max-height: min(32vh, 14rem);
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable both-edges;
    }

    :deep(.vjs-tree.is-virtual .vjs-tree-node) {
      white-space: pre-wrap;
    }

    :deep(.vjs-value) {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  }

&__actions {
  margin-left: auto;
  display: flex;
  justify-content: flex-end;
  min-width: max-content;
}

&__action-button {
  border: 1px solid theme-color('primary');
  background: transparent;
  color: theme-color('primary');
  font-weight: 600;
  padding: size(1) size(3);
  border-radius: size(1);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: color-mix(in srgb, theme-color('primary') 10%, transparent);
  }

    &:active {
      transform: translateY(1px);
    }
  }
}

.instructions-detail {
  margin-top: size(4);
  padding: size(4);
  border-radius: size(2);
  border: 1px solid theme-color('border-primary');
  background: theme-color('surface');
  display: flex;
  flex-direction: column;
  gap: size(3);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: size(2);

    h3 {
      margin: 0;
      font-size: size(3);
    }
  }

  &__title {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__kind {
    display: inline-flex;
    align-items: center;
    gap: size(1.5);
  }

  &__kind-label {
    color: theme-color('content-tertiary');
    @include tpg-s3;
  }

  &__kind-value {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: size(0.5) size(1.5);
    border-radius: size(2);
    border: 1px solid color-mix(in srgb, theme-color('primary') 45%, theme-color('border-primary'));
    background: color-mix(in srgb, theme-color('primary') 12%, transparent);
    color: theme-color('content-primary');
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  &__header-actions {
    display: flex;
    gap: size(2);
  }

&__share,
&__close {
  border: 1px solid theme-color('border-secondary');
  background: theme-color('border-primary');
  color: theme-color('content-primary');
  padding: size(1) size(3);
  border-radius: size(1);
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, theme-color('border-secondary') 70%, theme-color('surface'));
  }
}

  &__share {
    border: 1px solid theme-color('primary');
    color: theme-color('primary');
    background: transparent;

    &:hover {
      background: color-mix(in srgb, theme-color('primary') 10%, transparent);
    }
  }

  &__status {
    font-size: size(2);
    color: theme-color('content-tertiary');

    &_error {
      color: theme-color('error');
      display: flex;
      align-items: center;
      gap: size(2);
    }
  }

  &__retry {
    border: 1px solid theme-color('error');
    background: transparent;
    color: theme-color('error');
    padding: size(1) size(3);
    border-radius: size(1);
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, theme-color('error') 10%, transparent);
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: size(3);
  }

  &__meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(2);
  }

  &__json {
    padding: size(2);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('background-hover');
    color: theme-color('content-primary');

    pre {
      white-space: pre-wrap;
      color: inherit;
    }

    :deep(.vjs-tree) {
      color: inherit;
    }
  }

  &__json-tree {
    min-width: 0;
    width: 100%;

    :deep(.vjs-tree.is-virtual) {
      max-height: none;
      overflow: visible;
    }

    :deep(.vjs-tree.is-virtual .vjs-tree-node) {
      white-space: pre-wrap;
    }

    :deep(.vjs-value) {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  }

  &__encoded {
    &-content {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: size(2);
      align-items: start;
    }

    &-box {
      min-width: 0;
      width: 100%;
    }

    pre {
      margin: 0;
      background: theme-color('background-hover');
      color: theme-color('content-primary');
      border: 1px solid theme-color('border-primary');
      padding: size(2);
      border-radius: size(1);
      overflow: auto;
      font-family: 'JetBrainsMono', monospace;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      max-height: min(50vh, 28rem);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  }

  &__copy {
    border: 1px solid theme-color('primary');
    background: transparent;
    color: theme-color('primary');
    padding: size(1) size(3);
    border-radius: size(1);
    cursor: pointer;
    width: fit-content;

    &:hover {
      background: color-mix(in srgb, theme-color('primary') 10%, transparent);
    }
  }

  &__contract-code {
    padding: size(2);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('background-hover');
  }
}
</style>
