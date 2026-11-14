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

const props = defineProps<{ blockHeight: number; transactionHash: string }>();
const resource = setupAsyncData(() => http.fetchTransactionProof(props.transactionHash));
const proof = computed(() => (resource.data?.status === SUCCESSFUL_FETCHING ? resource.data.data : null));
const agreement = computed(() =>
  proof.value
    ? transactionProofAgreement(proof.value, {
        transactionHash: props.transactionHash,
        blockHeight: props.blockHeight,
        networkId: getRuntimeConfig().networkId,
      })
    : null
);
const rawProof = computed(() => (proof.value ? stringifyLosslessJson(proof.value, undefined, 2) : ''));
watch(
  () => [props.blockHeight, props.transactionHash],
  () => resource.refetch()
);
</script>

<template>
  <BaseContentBlock :title="$t('transactions.evidence.title')">
    <template #header-action>
      <BaseButton bordered data-test="evidence-retry" :disabled="resource.isLoading" @click="resource.refetch()">
        {{ $t('transactions.evidence.refresh') }}
      </BaseButton>
    </template>
    <BaseResourceState
      :snapshot="resource.snapshot"
      :loading-label="$t('transactions.evidence.loading')"
      :error-label="$t('transactions.evidence.loadError')"
      :retry-label="$t('transactions.evidence.retry')"
      @retry="resource.refetch()"
    >
      <template #not-found>
        <p data-test="transaction-proof-unavailable">
          {{ $t('transactions.evidence.proofUnavailable') }}
        </p>
      </template>
      <div v-if="proof" class="transaction-evidence" data-test="transaction-proof-available">
        <p>
          {{ $t('transactions.evidence.scope') }}
        </p>
        <strong data-test="transaction-proof-claim" :class="{ 'transaction-evidence__error': !agreement?.matches }">
          {{
            $t(
              agreement?.matches
                ? 'transactions.evidence.nodeProvidedUnverified'
                : 'transactions.evidence.doesNotMatchProof'
            )
          }}
        </strong>
        <div class="transaction-evidence__grid">
          <DataField
            :title="$t('transactions.evidence.requestedTransaction')"
            :value="
              $t(
                agreement?.transactionMatches
                  ? 'transactions.evidence.matchesProof'
                  : 'transactions.evidence.doesNotMatchProof'
              )
            "
          />
          <DataField
            :title="$t('ux.network')"
            :value="
              $t(
                agreement?.networkMatches
                  ? 'transactions.evidence.matchesReference'
                  : 'transactions.evidence.doesNotMatchReference'
              )
            "
          />
          <DataField
            :title="$t('transactions.evidence.proofHeight')"
            :value="agreement?.heightMatches ? proof.block_height : $t('transactions.evidence.doesNotMatchHeight')"
          />
          <DataField :title="$t('transactions.evidence.blockHash')" :hash="proof.transaction.block_hash" copy />
          <DataField
            :title="$t('transactions.evidence.transactionEntryHash')"
            :hash="proof.transaction.entrypoint_hash"
            copy
          />
          <DataField
            :title="$t('transactions.evidence.executionOutputHash')"
            :hash="proof.transaction.output_hash"
            copy
          />
        </div>
        <details data-test="transaction-proof-raw">
          <summary>{{ $t('transactions.evidence.canonicalProof') }}</summary>
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
  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  &__error {
    color: theme-color('error');
  }
  summary {
    cursor: pointer;
  }
  pre {
    margin-top: 12px;
    max-height: 480px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
}
</style>
