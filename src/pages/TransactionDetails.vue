<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import invariant from 'tiny-invariant';
import TimeIcon from '@/shared/ui/icons/clock.svg';
import { TransactionStatus } from '@/entities/transaction';
import { getLocalTime, getUTCTime } from '@/shared/lib/time';
import { parseMetadata } from '@/shared/ui/utils/json';
import InstructionsTable from '@/shared/ui/components/InstructionsTable.vue';
import ContextTooltip from '@/shared/ui/components/ContextTooltip.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { formatTransactionRejectionReason } from '@/shared/api/rejection-reason';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import ContractCodeViewPanel from '@/shared/ui/components/ContractCodeViewPanel.vue';
import type { Instruction } from '@/shared/api/schemas';
import { collectInstructionFallback } from '@/shared/lib/instruction-fallback';
import { selectPrimaryContractViewInstruction } from '@/shared/lib/contract-view';
import { fetchAllTransactionInstructions } from '@/shared/lib/transaction-instructions';

const router = useRouter();
const navigation = useScopedExplorerNavigation();

const transactionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'full' }, 'medium');
const signatureHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' }, 'medium');
const instructionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' });
const accountIdHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', xxs: 'short' }, 'medium');
const instructionsListState = ref({
  isLoading: true,
  totalItems: 0,
  itemsCount: 0,
});

const txHash = computed(() => {
  const hash = router.currentRoute.value.params['hash'];

  invariant(typeof hash === 'string', 'Expected string');

  return hash;
});

const transactionScope = useParamScope(txHash, (value) => setupAsyncData(() => http.fetchTransaction(value)));

const isTransactionLoading = computed(() => transactionScope.value.expose.isLoading);
const transaction = computed(() =>
  transactionScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? transactionScope.value.expose.data.data
    : undefined
);
const isSmartContractExecutable = computed(() => {
  const executable = transaction.value?.executable;
  return executable === 'Wasm' || executable === 'Ivm' || executable === 'IvmProved' || executable === 'ContractCall';
});

function hasOpaqueErrorTag(message: string): boolean {
  return /(?:InstructionExecutionError|ValidationFail|FindError|TransactionRejectionReason)\(\d+\)/.test(
    message
  );
}

const rejectionReason = computed(() => {
  const reason = transaction.value?.rejection_reason;
  if (!reason) return null;
  const toriiMessage = reason.message.trim();
  const decodedFallback = formatTransactionRejectionReason(reason).trim();

  if (toriiMessage.length > 0 && !hasOpaqueErrorTag(toriiMessage)) return toriiMessage;
  if (decodedFallback.length > 0) return decodedFallback;
  return toriiMessage.length > 0 ? toriiMessage : null;
});

const instructionIndexFromQuery = computed(() => {
  const raw = router.currentRoute.value.query['instruction'];
  if (typeof raw !== 'string') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
});

const traceWorkspaceRoute = computed(() => ({
  name: 'tracing-workspace',
  query: {
    seed_type: 'transaction',
    seed_value: txHash.value,
  },
}));
const shouldShowEmptyInstructionsOverview = computed(() => {
  if (!transaction.value || isSmartContractExecutable.value) return false;
  if (instructionsListState.value.isLoading) return false;
  return instructionsListState.value.totalItems === 0 && instructionsListState.value.itemsCount === 0;
});

const smartContractInstructionState = reactive({
  isLoading: false,
  error: '',
  items: [] as Instruction[],
});

const primarySmartContractInstruction = computed(() =>
  selectPrimaryContractViewInstruction(smartContractInstructionState.items, transaction.value?.executable)
);

async function loadSmartContractInstructions() {
  if (!transaction.value || !isSmartContractExecutable.value) {
    smartContractInstructionState.isLoading = false;
    smartContractInstructionState.error = '';
    smartContractInstructionState.items = [];
    return;
  }

  smartContractInstructionState.isLoading = true;
  smartContractInstructionState.error = '';

  try {
    let instructions = await fetchAllTransactionInstructions({
      transactionHash: txHash.value,
      fetchInstructions: http.fetchInstructions,
      perPage: 128,
    });

    if (!instructions.length) {
      instructions = await collectInstructionFallback({
        transactionHash: txHash.value,
        fetchInstructionDetail: http.fetchInstructionDetail,
        maxProbe: 128,
      });
    }

    smartContractInstructionState.items = instructions;
    if (!instructions.length) {
      smartContractInstructionState.error = '';
    }
  } catch {
    smartContractInstructionState.items = [];
    smartContractInstructionState.error = 'unknown';
  } finally {
    smartContractInstructionState.isLoading = false;
  }
}

function updateInstructionQuery(index: number | null) {
  const currentRoute = router.currentRoute.value;
  const nextQuery = { ...currentRoute.query };
  if (index === null) {
    delete nextQuery.instruction;
  } else {
    nextQuery.instruction = index.toString();
  }
  navigation.replace({ query: nextQuery }).catch(() => {});
}

function handleInstructionOpened(payload: { transactionHash: string, index: number }) {
  if (transaction.value?.hash !== payload.transactionHash) return;
  updateInstructionQuery(payload.index);
}

function handleInstructionClosed() {
  updateInstructionQuery(null);
}

function handleInstructionsListState(payload: { isLoading: boolean, totalItems: number, itemsCount: number }) {
  instructionsListState.value = payload;
}

watch(
  () => txHash.value,
  () => {
    instructionsListState.value = {
      isLoading: true,
      totalItems: 0,
      itemsCount: 0,
    };
  },
  { immediate: true }
);

watch(
  () => [txHash.value, transaction.value?.hash ?? null, transaction.value?.executable ?? null],
  () => {
    loadSmartContractInstructions().catch(() => undefined);
  },
  { immediate: true }
);
</script>

<template>
  <div class="transaction-details">
    <BaseContentBlock
      class="transaction-details__metrics"
      :title="$t('transactions.transactionDetails')"
    >
      <template #header-action>
        <BaseButton
          bordered
          :to="traceWorkspaceRoute"
        >
          {{ $t('tracing.openFromTransaction') }}
        </BaseButton>
      </template>
      <template #default>
        <div
          v-if="isTransactionLoading"
          class="transaction-details__info_loading"
        >
          <BaseLoading />
        </div>
        <div v-else-if="transaction">
          <div class="transaction-details__info">
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.transactionHash')"
                :hash="transaction.hash"
                :type="transactionHashType"
                copy
              />

              <div class="transaction-details__info-row-time">
                <span class="h-sm">{{ $t('transactions.timestamp') }}</span>
                <div class="transaction-details__info-row-time-date row-text">
                  <TimeIcon />
                  <time :datetime="transaction.created_at.toISOString()">{{
                    getLocalTime(transaction.created_at)
                  }}</time>
                  <ContextTooltip :message="getUTCTime(transaction.created_at)" />
                </div>
              </div>
            </div>
            <div class="transaction-details__info-row">
              <div class="transaction-details__info-row-status">
                <span class="h-sm">{{ $t('transactions.status') }}</span>
                <TransactionStatus
                  :committed="transaction.status === 'Committed'"
                  type="label"
                />
              </div>

              <DataField
                v-if="transaction.rejection_reason"
                :title="$t('transactions.rejectedReason')"
                :value="rejectionReason"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('accounts.accountId')"
                :hash="transaction.authority"
                :type="accountIdHashType"
                :link="`/accounts/${transaction.authority}`"
                copy
              />

              <DataField
                :title="$t('transactions.nonce')"
                :value="transaction.nonce"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.block')"
                :value="transaction.block"
                :link="`/blocks/${transaction.block}`"
                monospace
              />

              <DataField
                :title="$t('transactions.metadata')"
                :value="parseMetadata(transaction.metadata)"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.signature')"
                :hash="transaction.signature"
                :type="signatureHashType"
              />
            </div>
          </div>
        </div>
      </template>
    </BaseContentBlock>
    <BaseContentBlock
      class="transaction-details__transactions"
      :title="isSmartContractExecutable ? $t('transactions.smartContract') : $t('transactions.instructions')"
    >
      <template #default>
        <div
          v-if="transaction && isSmartContractExecutable"
          class="transaction-details__transactions-wasm"
        >
          <BaseLoading v-if="smartContractInstructionState.isLoading" />
          <ContractCodeViewPanel
            v-else-if="primarySmartContractInstruction"
            data-test="smart-contract-panel"
            :instruction="primarySmartContractInstruction"
            :related-instructions="smartContractInstructionState.items"
          />
          <span
            v-else
            class="row-text"
            data-test="smart-contract-panel-empty"
          >
            {{
              smartContractInstructionState.error
                ? $t('transactions.unknownError')
                : $t('transactions.contractView.unavailable')
            }}
          </span>
        </div>
        <div v-else>
          <div
            v-if="transaction && shouldShowEmptyInstructionsOverview"
            class="transaction-details__transactions-empty"
            data-test="transaction-instructions-overview"
          >
            <span class="row-text">{{ $t('noData') }}</span>
            <div class="transaction-details__transactions-empty-grid">
              <DataField
                :title="$t('transactions.transactionHash')"
                :hash="transaction.hash"
                :type="transactionHashType"
                copy
              />
              <DataField
                :title="$t('transactions.executable')"
                :value="transaction.executable"
              />
              <DataField
                :title="$t('transactions.block')"
                :value="transaction.block"
                :link="`/blocks/${transaction.block}`"
                monospace
              />
              <DataField
                :title="$t('transactions.timestamp')"
                :value="getLocalTime(transaction.created_at)"
              />
              <div class="transaction-details__transactions-empty-status">
                <span class="h-sm">{{ $t('transactions.status') }}</span>
                <TransactionStatus
                  :committed="transaction.status === 'Committed'"
                  type="label"
                />
              </div>
              <DataField
                :title="$t('accounts.accountId')"
                :hash="transaction.authority"
                :type="accountIdHashType"
                :link="`/accounts/${transaction.authority}`"
                copy
              />
              <DataField
                :title="$t('transactions.nonce')"
                :value="transaction.nonce"
              />
              <DataField
                :title="$t('transactions.signature')"
                :hash="transaction.signature"
                :type="signatureHashType"
                copy
              />
              <DataField
                :title="$t('transactions.metadata')"
                :metadata="{ display: 'short' }"
                :value="parseMetadata(transaction.metadata)"
              />
              <DataField
                v-if="rejectionReason"
                :title="$t('transactions.rejectedReason')"
                :value="rejectionReason"
              />
            </div>
          </div>
          <InstructionsTable
            show-value
            :hash-type="instructionHashType"
            :filter-by="{ kind: 'transaction', value: txHash }"
            :initial-instruction-index="instructionIndexFromQuery"
            @details-opened="handleInstructionOpened"
            @details-closed="handleInstructionClosed"
            @list-state="handleInstructionsListState"
          />
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transaction-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__info {
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-row {
      display: flex;
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);

      @include xxs {
        flex-direction: column;
        justify-content: left;
        gap: size(2);
      }

      @include md {
        flex-direction: row;
        align-items: center;
        gap: size(8);
      }

      &-time {
        display: flex;
        flex-direction: column;
        gap: size(1);

        &-date {
          display: flex;
          position: relative;
          gap: size(1);

          &:hover .context-tooltip {
            display: flex;

            @include sm {
              top: size(-1);
              left: size(34);
            }

            @include lg {
              top: size(-4.5);
              left: size(4);
            }

            @include xl {
              top: size(-1);
              left: size(34);
            }
          }

          svg {
            width: 16px;
            height: 16px;
          }
        }
      }

      &-status {
        display: flex;
        flex-direction: column;
        gap: size(1);
      }
    }
  }

  &__transactions {
    & > hr {
      display: none;
    }

    &-empty {
      padding: size(0) size(4) size(2);
      display: flex;
      flex-direction: column;
      gap: size(2);

      &-grid {
        display: grid;
        gap: size(2);

        @include md {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      &-status {
        display: flex;
        flex-direction: column;
        gap: size(1);
      }
    }

    &-wasm {
      padding: 0 size(4);
    }
  }
}
</style>
