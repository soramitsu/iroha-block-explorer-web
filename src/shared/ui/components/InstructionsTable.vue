<script setup lang="ts">
import { defaultFormat } from '@/shared/lib/time';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import TransactionStatus from '@/entities/transaction/TransactionStatus.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseCollectionState from '@/shared/ui/components/BaseCollectionState.vue';
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
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING, NOT_FOUND } from '@/shared/api/consts';
import { useClipboard, useThrottleFn, useWindowScroll } from '@vueuse/core';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { applyExplorerScopeToLocation } from '@/shared/lib/explorer-scope';
import { Instruction as InstructionSchema } from '@/shared/api/schemas';
import { resolveContractViewInstructionKind } from '@/shared/lib/contract-view';
import { useExplorerInstructionsEvents } from '@/shared/ui/composables/useExplorerInstructionsEvents';
import InstructionSemanticCard from '@/shared/ui/components/InstructionSemanticCard.vue';
import {
  buildInstructionPresentation,
  type InstructionPresentation,
  type InstructionPresentationField,
} from '@/shared/lib/instruction-presentation';

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
  (e: 'list-state', payload: { isLoading: boolean, itemsCount: number, hasMore: boolean }): void
}>();

const presentationCache = new WeakMap<Instruction, InstructionPresentation | null>();

function getInstructionPresentation(item: Instruction): InstructionPresentation | null {
  if (presentationCache.has(item)) return presentationCache.get(item) ?? null;
  const result = buildInstructionPresentation(item);
  presentationCache.set(item, result);
  return result;
}

function getInstructionKindLabel(item: Instruction): string {
  const message = getInstructionPresentation(item)?.kindLabel;
  return message ? t(message.key, message.params ?? {}) : item.kind;
}

function getInstructionPrimaryEntity(item: Instruction): InstructionPresentationField | null {
  return getInstructionPresentation(item)?.primaryEntity ?? null;
}

const isOnAccountPage = computed(() => props.filterBy.kind === 'authority');
const shouldShowKind = computed(() => listState.kind === 'All');

const listState = reactive({
  transaction_status: null,
  authority: computed(() => (props.filterBy.kind === 'authority' ? props.filterBy.value.toString() : '')),
  transaction_hash: computed(() => (props.filterBy.kind === 'transaction' ? props.filterBy.value : '')),
  kind: 'All' as ftm.TabInstructions,
  cursor: null as string | null,
  limit: 10,
});

const searchParams = computed<InstructionsSearchParams>(() => {
  const selectedKind = listState.kind === 'All' ? null : listState.kind;
  const shared = {
    cursor: listState.cursor,
    limit: listState.limit,
    ...(selectedKind === null ? {} : { kind: selectedKind }),
  };
  if (isOnAccountPage.value) {
    return {
      ...shared,
      authority: props.filterBy.value,
      ...(listState.transaction_status === null ? {} : { transaction_status: listState.transaction_status }),
    };
  }

  return {
    ...shared,
    transaction_hash: props.filterBy.value,
  };
});

watch([() => listState.kind, () => listState.transaction_status, () => listState.limit], () => {
  listState.cursor = null;
});
watch(
  () => `${props.filterBy.kind}:${props.filterBy.value}`,
  () => {
    listState.cursor = null;
  }
);

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
const fetchedItems = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value?.expose.data.data.items : []
);
const payloadPagination = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination : undefined
);
const items = computed(() => fetchedItems.value);

const instructionRowKey = (item: Instruction) => `${item.transaction_hash}:${item.index}`;

const { y: windowScrollY } = useWindowScroll();
const pendingRefresh = ref(false);

const detailState = reactive({
  isOpen: false,
  isLoading: false,
  error: '',
  data: null as Instruction | null,
});

const autoInstructionIndex = ref<number | null>(null);
const lastSelection = ref<{ transactionHash: string, index: number } | null>(null);
const clipboard = useClipboard();
const notifications = useNotifications();
const currentScope = useCurrentExplorerScope();
let detailRequestGeneration = 0;

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

async function loadInstructionDetail(target: { transactionHash: string, index: number }) {
  const requestGeneration = ++detailRequestGeneration;
  detailState.isOpen = true;
  detailState.isLoading = true;
  detailState.error = '';
  detailState.data = null;
  emit('details-opened', target);
  try {
    const response = await http.fetchInstructionDetail(target.transactionHash, target.index);
    if (requestGeneration !== detailRequestGeneration) return;
    if (response.status === SUCCESSFUL_FETCHING) {
      detailState.data = response.data;
    } else if (response.status === NOT_FOUND) {
      detailState.error = t('transactions.instructionNotFound');
    } else {
      detailState.error = t('transactions.unknownError');
    }
  } catch (error) {
    if (requestGeneration === detailRequestGeneration) detailState.error = t('transactions.unknownError');
  } finally {
    if (requestGeneration === detailRequestGeneration) detailState.isLoading = false;
  }
}

async function openInstructionDetails(item: Instruction) {
  lastSelection.value = { transactionHash: item.transaction_hash, index: item.index };
  await loadInstructionDetail(lastSelection.value);
}

function closeInstructionDetails() {
  detailRequestGeneration++;
  detailState.isOpen = false;
  detailState.isLoading = false;
  detailState.error = '';
  detailState.data = null;
  emit('details-closed');
  lastSelection.value = null;
}

const selectedInstructionJson = computed(() => {
  const instruction = detailState.data;
  if (!instruction) return null;
  return instruction.box.json;
});

const selectedInstructionPresentation = computed(() => {
  const instruction = detailState.data;
  if (!instruction) return null;
  return getInstructionPresentation(instruction);
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

const shareLink = computed(() => {
  if (!lastSelection.value) return null;
  if (typeof window === 'undefined') return null;
  const path = `/transactions/${lastSelection.value.transactionHash}?instruction=${lastSelection.value.index}`;
  const scopedPath = applyExplorerScopeToLocation(path, currentScope.value) as string;
  return new URL(scopedPath, window.location.origin).toString();
});

watch(
  () => JSON.stringify(searchParams.value),
  () => {
    pendingRefresh.value = false;
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
    if (isNil(value) && detailState.isOpen) {
      closeInstructionDetails();
    }
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
  try {
    await clipboard.copy(detailState.data.box.encoded);
    notifications.success(t('clipboard.success'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
}

async function copyInstructionLink() {
  if (!shareLink.value) return;
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }
  try {
    await clipboard.copy(shareLink.value);
    notifications.success(t('transactions.instructionLinkCopied'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
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
      listState.kind === 'All' || instruction.kind === listState.kind || instruction.box.json.kind === listState.kind;
    if (!instructionKindMatches) return;
    if (listState.transaction_status && instruction.transaction_status !== listState.transaction_status) return;

    // Avoid shifting historical cursor windows under the user's cursor.
    if (listState.cursor !== null) return;

    // Avoid shifting the latest cursor window while the user is scrolled down.
    if (windowScrollY.value > 80) {
      pendingRefresh.value = true;
      return;
    }

    scheduleInstructionsReload();
  }
);

watch(
  () => [isLoading.value, items.value.length, payloadPagination.value?.has_more === true] as const,
  ([tableLoading, currentItemsCount, hasMore]) => {
    emit('list-state', {
      isLoading: Boolean(tableLoading),
      itemsCount: currentItemsCount,
      hasMore,
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

    <BaseCollectionState
      v-if="scope"
      v-slot="{ emptyLabel }"
      table
      :snapshot="scope.expose.snapshot"
      :count="items.length"
      :filtered="listState.kind !== 'All' || listState.transaction_status !== null"
      @retry="scope.expose.refetch()"
      @reset="listState.kind = 'All'; listState.transaction_status = null"
    >
      <BaseTable
        v-model:cursor="listState.cursor"
        v-model:page-size="listState.limit"
        :empty-label
        :loading="isLoading"
        :cursor-pagination="payloadPagination"
        pagination-mode="cursor"
        :items
        :row-key="instructionRowKey"
        container-class="instructions-table__container"
        :pagination-breakpoint="1441"
      >
        <template #row="{ item }">
          <div
            class="instructions-table__row"
            :class="{ 'instructions-table__row_with-value': props.showValue }"
            role="presentation"
          >
            <TransactionStatus
              type="tooltip"
              class="instructions-table__icon"
              :committed="item.transaction_status === 'Committed'"
              role="cell"
            />

            <div
              class="instructions-table__column"
              role="cell"
            >
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

            <div
              class="instructions-table__columns"
              role="presentation"
            >
              <div
                v-if="shouldShowKind"
                class="instructions-table__column"
                role="cell"
              >
                <div class="instructions-table__label">
                  {{ $t('kind') }}
                </div>

                <span
                  class="row-text instructions-table__kind-badge"
                  data-test="instruction-kind-label"
                >{{
                  getInstructionKindLabel(item)
                }}</span>
              </div>

              <div
                class="instructions-table__column"
                role="cell"
              >
                <div class="instructions-table__label">
                  {{ $t('entity') }}
                </div>

                <BaseLink
                  v-if="getInstructionPrimaryEntity(item)?.link"
                  :to="getInstructionPrimaryEntity(item)?.link ?? ''"
                  monospace
                >
                  {{ getInstructionPrimaryEntity(item)?.value }}
                </BaseLink>
                <span
                  v-else
                  class="row-text"
                >{{ getInstructionPrimaryEntity(item)?.value ?? '—' }}</span>
              </div>

              <div
                class="instructions-table__column-block"
                role="cell"
              >
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
              role="cell"
            >
              <div class="instructions-table__label">
                {{ $t('value') }}
              </div>

              <div class="instructions-table__value-content">
                <InstructionSemanticCard
                  v-if="getInstructionPresentation(item)"
                  :presentation="getInstructionPresentation(item)!"
                  compact
                />
                <details
                  class="instructions-table__raw-disclosure"
                  data-test="instruction-row-raw-json"
                >
                  <summary>{{ $t('studio.instructionPresentation.card.rawJson') }}</summary>
                  <BaseJson
                    class="instructions-table__value-json"
                    :value="item.box.json"
                  />
                </details>
              </div>
            </div>

            <div
              class="instructions-table__actions"
              role="cell"
            >
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
        <template #empty>
          <span>{{ emptyLabel }}</span>
          <BaseButton
            v-if="listState.kind !== 'All' || listState.transaction_status !== null"
            bordered
            data-test="collection-reset"
            @click="listState.kind = 'All'; listState.transaction_status = null"
          >
            {{ $t('ux.collection.resetFilters') }}
          </BaseButton>
        </template>
      </BaseTable>
    </BaseCollectionState>

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

        <InstructionSemanticCard
          v-if="selectedInstructionPresentation"
          :presentation="selectedInstructionPresentation"
        />

        <div class="instructions-detail__json">
          <div class="instructions-table__label">
            {{ $t('studio.instructionPresentation.card.rawJson') }}
          </div>
          <BaseJson
            class="instructions-detail__json-tree"
            full
            :value="selectedInstructionJson ?? detailState.data.box.json"
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
          <ContractCodeViewPanel :instruction="detailState.data" />
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
        width: 100%;
      }

      @include lg {
        width: 100%;
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
        width: 100%;
      }

      @include sm {
        width: 100%;
      }

      @include md {
        width: 100%;
      }

      @include lg {
        width: 100%;
      }

      @include xl {
        width: 100%;
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

  &__value-content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: size(1.5);
    min-width: 0;
  }

  &__raw-disclosure {
    min-width: 0;
    padding: size(1.5);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    background: theme-color('background-hover');

    summary {
      width: fit-content;
      color: theme-color('content-tertiary');
      cursor: pointer;
      font-weight: 600;
    }

    &[open] summary {
      margin-bottom: size(1.5);
    }
  }

  &__actions {
    margin-left: auto;
    display: flex;
    justify-content: flex-end;
    min-width: max-content;
  }

  &__action-button {
    min-height: 44px;
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
  border-radius: 12px;
  border: 1px solid theme-color('border-primary');
  background: theme-color('surface');
  display: flex;
  flex-direction: column;
  gap: size(3);

  &__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: size(2);

    h3 {
      margin: 0;
      font-size: size(3);
    }
  }

  &__title {
    min-width: 0;
    overflow-wrap: anywhere;
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
    flex-wrap: wrap;
    max-width: 100%;
    gap: size(2);
  }

  &__share,
  &__close {
    min-height: 44px;
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
    min-height: 44px;
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
    min-height: 44px;
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
