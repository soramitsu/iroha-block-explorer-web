<script setup lang="ts">
import { computed, watch } from 'vue';
import { stringify as stringifyLosslessJson } from 'lossless-json';
import * as http from '@/shared/api';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { transactionProofAgreement } from '@/shared/lib/transaction-evidence';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseButton from './BaseButton.vue';
import BaseContentBlock from './BaseContentBlock.vue';
import BaseResourceState from './BaseResourceState.vue';
import DataField from './DataField.vue';

const props = defineProps<{ blockHeight: number, transactionHash: string }>();
const resource = setupAsyncData(() => http.fetchTransactionProof(props.transactionHash));
const proof = computed(() => resource.data?.status === SUCCESSFUL_FETCHING ? resource.data.data : null);
const agreement = computed(() => proof.value ? transactionProofAgreement(proof.value, {
  transactionHash: props.transactionHash, blockHeight: props.blockHeight, networkId: getRuntimeConfig().networkId,
}) : null);
const rawProof = computed(() => proof.value ? stringifyLosslessJson(proof.value, undefined, 2) : '');
watch(() => [props.blockHeight, props.transactionHash], () => resource.refetch());
</script>

<template>
  <BaseContentBlock title="Transaction evidence">
    <template #header-action>
      <BaseButton
        bordered
        data-test="evidence-retry"
        :disabled="resource.isLoading"
        @click="resource.refetch()"
      >
        Refresh evidence
      </BaseButton>
    </template>
    <BaseResourceState
      :snapshot="resource.snapshot"
      loading-label="Loading transaction evidence"
      error-label="Transaction evidence could not be loaded"
      retry-label="Retry evidence"
      @retry="resource.refetch()"
    >
      <template #not-found>
        <p data-test="transaction-proof-unavailable">
          This transaction proof is unavailable to the current reader. For a private data space, use Read access to connect an authorized wallet.
        </p>
      </template>
      <div
        v-if="proof"
        class="transaction-evidence"
        data-test="transaction-proof-available"
      >
        <p>
          These inclusion paths and consensus certificate cover this transaction. They are supplied by the node;
          this browser does not independently verify Merkle paths or validator signatures against a trusted checkpoint.
        </p>
        <strong
          data-test="transaction-proof-claim"
          :class="{ 'transaction-evidence__error': !agreement?.matches }"
        >
          {{ agreement?.matches ? 'Identifiers match · finality not verified here' : 'Evidence identity mismatch' }}
        </strong>
        <div class="transaction-evidence__grid">
          <DataField
            title="Requested transaction"
            :value="agreement?.transactionMatches ? 'Matches proof entry' : 'Does not match proof entry'"
          />
          <DataField
            title="Network identity"
            :value="agreement?.networkMatches ? 'Matches configured network' : 'Does not match configured network'"
          />
          <DataField
            title="Block height"
            :value="agreement?.heightMatches ? proof.block_height : 'Does not match requested height'"
          />
          <DataField
            title="Block hash"
            :hash="proof.transaction.block_hash"
            copy
          />
          <DataField
            title="Transaction entry hash"
            :hash="proof.transaction.entrypoint_hash"
            copy
          />
          <DataField
            title="Execution output hash"
            :hash="proof.transaction.output_hash"
            copy
          />
        </div>
        <details data-test="transaction-proof-raw">
          <summary>Transaction inclusion paths and consensus certificate</summary>
          <pre>{{ rawProof }}</pre>
        </details>
      </div>
    </BaseResourceState>
  </BaseContentBlock>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;
.transaction-evidence {
  display: grid;
  gap: 20px;
  color: theme-color('content-primary');
  line-height: 1.6;
  &__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  &__error { color: theme-color('error'); }
  summary { cursor: pointer; }
  pre { margin-top: 12px; max-height: 480px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
}
</style>
