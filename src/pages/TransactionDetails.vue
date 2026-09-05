<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, defineAsyncComponent, reactive, watch } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import invariant from 'tiny-invariant';
import { TransactionStatus } from '@/entities/transaction';
import { parseMetadata } from '@/shared/ui/utils/json';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import TransactionActionPreview from '@/shared/ui/components/TransactionActionPreview.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import type { Instruction } from '@/shared/api/schemas';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';

const InstructionsTable = defineAsyncComponent(() => import('@/shared/ui/components/InstructionsTable.vue'));
const ContractCodeViewPanel = defineAsyncComponent(() => import('@/shared/ui/components/ContractCodeViewPanel.vue'));
const TransactionEvidencePanel = defineAsyncComponent(
  () => import('@/shared/ui/components/TransactionEvidencePanel.vue')
);

const router = useRouter();
const navigation = useScopedExplorerNavigation();

const transactionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'full' }, 'medium');
const signatureHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' }, 'medium');
const instructionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' });
const accountIdHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', xxs: 'short' }, 'medium');


const txHash = computed(() => {
  const hash = router.currentRoute.value.params['hash'];

  invariant(typeof hash === 'string', 'Expected string');

  return hash;
});

const transactionScope = useParamScope(txHash, (value) => setupAsyncData(() => http.fetchTransaction(value)));

const transactionSnapshot = computed(() => transactionScope.value.expose.snapshot);
const transaction = computed(() =>
  transactionScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? transactionScope.value.expose.data.data
    : undefined
);
const isSmartContractExecutable = computed(() => {
  const executable = transaction.value?.executable;
  return executable === 'Ivm' || executable === 'IvmProved' || executable === 'ContractCall';
});

const rejectionReason = computed(() => transaction.value?.rejection_reason?.message ?? null);

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


const smartContractInstructionState = reactive({
  isLoading: false,
  error: '',
  items: [] as Instruction[],
  primary: null as Instruction | null,
});

const primarySmartContractInstruction = computed(() => smartContractInstructionState.primary);

let smartContractGeneration = 0;
async function loadSmartContractInstructions() {
  const generation = ++smartContractGeneration;
  const transactionHash = txHash.value;
  if (!transaction.value || !isSmartContractExecutable.value) {
    smartContractInstructionState.isLoading = false;
    smartContractInstructionState.error = '';
    smartContractInstructionState.items = [];
    smartContractInstructionState.primary = null;
    return;
  }

  smartContractInstructionState.isLoading = true;
  smartContractInstructionState.error = '';

  try {
    const [{ fetchAllTransactionInstructions }, { selectPrimaryContractViewInstruction }] = await Promise.all([
      import('@/shared/lib/transaction-instructions'),
      import('@/shared/lib/contract-view'),
    ]);
    const instructions = await fetchAllTransactionInstructions({
      transactionHash,
      fetchInstructions: http.fetchInstructions,
    });

    if (generation !== smartContractGeneration) return;
    smartContractInstructionState.items = instructions;
    smartContractInstructionState.primary = selectPrimaryContractViewInstruction(instructions);
    if (!instructions.length) {
      smartContractInstructionState.error = '';
    }
  } catch {
    if (generation !== smartContractGeneration) return;
    smartContractInstructionState.items = [];
    smartContractInstructionState.primary = null;
    smartContractInstructionState.error = 'unknown';
  } finally {
    if (generation === smartContractGeneration) smartContractInstructionState.isLoading = false;
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
        <BaseResourceState
          :snapshot="transactionSnapshot"
          :loading-label="$t('transactions.resource.loading')"
          :not-found-label="$t('transactions.resource.notFound')"
          :error-label="$t('transactions.resource.loadError')"
          :retry-label="$t('transactions.resource.retry')"
          @retry="transactionScope.expose.refetch()"
        >
          <div
            v-if="transaction"
            class="transaction-details__info"
          >
            <div class="transaction-details__info-row">
              <div class="transaction-details__info-row-status">
                <span class="h-sm">{{ $t('transactions.status') }}</span>
                <TransactionStatus
                  :committed="transaction.status === 'Committed'"
                  type="label"
                />
              </div>
              <DataField
                v-if="rejectionReason"
                :title="$t('transactions.rejectedReason')"
                :value="rejectionReason"
              />
            </div>
            <TransactionActionPreview
              v-if="transaction.executable === 'Instructions'"
              :transaction-hash="transaction.hash"
              :rejected="transaction.status === 'Rejected'"
            />
            <p
              v-else
              class="transaction-details__executable row-text"
            >
              {{ $t('transactions.executable') }}: {{ transaction.executable }}
            </p>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.authority')"
                :hash="transaction.authority"
                :type="accountIdHashType"
                :link="`/accounts/${transaction.authority}`"
                copy
              />
              <DataField
                :title="$t('transactions.block')"
                :value="transaction.block"
                :link="`/blocks/${transaction.block}`"
                monospace
              />
            </div>
            <div class="transaction-details__info-row">
              <div class="transaction-details__info-row-time">
                <span class="h-sm">{{ $t('transactions.timestamp') }}</span>
                <TimeStamp :value="transaction.created_at" inverted />
              </div>
              <DataField
                :title="$t('transactions.transactionHash')"
                :hash="transaction.hash"
                :type="transactionHashType"
                copy
              />
            </div>
            <details
              class="transaction-details__technical"
              data-test="transaction-technical-details"
            >
              <summary>{{ $t('ux.transaction.technicalDetails') }}</summary>
              <div class="transaction-details__info-row">
                <DataField
                  :title="$t('transactions.nonce')"
                  :value="transaction.nonce"
                />
                <DataField
                  :title="$t('ux.transaction.ttl')"
                  :value="transaction.time_to_live?.ms ?? null"
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
                  copy
                />
              </div>
            </details>
          </div>
        </BaseResourceState>
      </template>
    </BaseContentBlock>
    <BaseContentBlock
      id="transaction-instructions"
      class="transaction-details__transactions"
      :title="isSmartContractExecutable ? $t('transactions.smartContract') : $t('transactions.instructions')"
    >
      <template #default>
        <div
          v-if="transaction && isSmartContractExecutable"
          class="transaction-details__transactions-contract"
        >
          <BaseLoading v-if="smartContractInstructionState.isLoading" />
          <ContractCodeViewPanel
            v-else-if="primarySmartContractInstruction"
            data-test="smart-contract-panel"
            :instruction="primarySmartContractInstruction"
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
          <InstructionsTable
            show-value
            :hash-type="instructionHashType"
            :filter-by="{ kind: 'transaction', value: txHash }"
            :initial-instruction-index="instructionIndexFromQuery"
            @details-opened="handleInstructionOpened"
            @details-closed="handleInstructionClosed"
          />
        </div>
      </template>
    </BaseContentBlock>
    <TransactionEvidencePanel
      v-if="transaction"
      :block-height="transaction.block"
      :transaction-hash="transaction.hash"
    />
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
    padding: size(2) size(3);
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-row {
      display: flex;
      margin-top: size(2);
      padding: 0;
      flex-wrap: wrap;

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

  &__technical {
    margin-top: size(3);
    border-top: 1px solid theme-color('border-primary');
    summary { cursor: pointer; padding-block: size(2); min-height: 44px; font-weight: 600; }
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

    &-contract {
      padding: 0 size(4);
    }
  }
}
</style>
