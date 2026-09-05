<script setup lang="ts">
import { computed, watch } from 'vue';
import type { Block, LedgerStateProof, LedgerStateRoot } from '@/shared/api/schemas';
import type { TransactionBlockEvidence } from '@/shared/api';
import * as http from '@/shared/api';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import {
  loadTransactionEvidence,
  stateEvidenceAgreement,
  verifyTransactionBlockEvidence,
  type TransactionEvidenceBundle,
} from '@/shared/lib/transaction-evidence';
import { setupAsyncData } from '@/shared/utils/setup-async-data';

const props = defineProps<{
  blockHeight: number;
  transactionHash: string;
}>();

type EvidenceBundle = TransactionEvidenceBundle<TransactionBlockEvidence, Block, LedgerStateRoot, LedgerStateProof>;

const evidenceResource = setupAsyncData<EvidenceBundle>(() =>
  loadTransactionEvidence({
    fetchBlockProof: () => http.fetchLedgerBlockProof(props.blockHeight, props.transactionHash),
    fetchReferenceBlock: () => http.fetchBlock(props.blockHeight),
    fetchStateRoot: () => http.fetchLedgerStateRoot(props.blockHeight),
    fetchStateProof: () => http.fetchLedgerStateProof(props.blockHeight),
  })
);

const stateAgreement = computed(() =>
  evidenceResource.data ? stateEvidenceAgreement(evidenceResource.data, props.blockHeight) : null
);

const blockVerification = computed(() =>
  evidenceResource.data
    ? verifyTransactionBlockEvidence({
        blockProof: evidenceResource.data.blockProof,
        referenceBlock: evidenceResource.data.referenceBlock,
        requestedTransactionHash: props.transactionHash,
        requestedBlockHeight: props.blockHeight,
      })
    : null
);

type BlockVerificationClaim = 'verified' | 'failed' | 'incomplete';

const blockVerificationClaim = computed<BlockVerificationClaim | null>(() => {
  const verification = blockVerification.value;
  const evidence = evidenceResource.data;
  if (!verification || evidence?.blockProof.status !== 'available') return null;

  if (!verification.pathVerificationValid || !verification.transactionHashMatches || !verification.proofHeightMatches) {
    return 'failed';
  }
  if (evidence.referenceBlock.status !== 'available') return 'incomplete';
  return verification.valid ? 'verified' : 'failed';
});

const rawBlockProof = computed(() => {
  const part = evidenceResource.data?.blockProof;
  return part?.status === 'available' ? JSON.stringify(part.data.proof, null, 2) : '';
});

watch(
  () => [props.blockHeight, props.transactionHash] as const,
  ([height, hash], previous) => {
    if (!previous || (height === previous[0] && hash === previous[1])) return;
    evidenceResource.refetch();
  }
);
</script>

<template>
  <BaseContentBlock class="transaction-evidence" :title="$t('transactions.evidence.title')">
    <template #header-action>
      <BaseButton
        bordered
        data-test="evidence-retry"
        :disabled="evidenceResource.isLoading"
        @click="evidenceResource.refetch()"
      >
        {{ $t('transactions.evidence.refresh') }}
      </BaseButton>
    </template>

    <BaseResourceState
      :snapshot="evidenceResource.snapshot"
      :loading-label="$t('transactions.evidence.loading')"
      :error-label="$t('transactions.evidence.loadError')"
      :retry-label="$t('transactions.evidence.retry')"
      @retry="evidenceResource.refetch()"
    >
      <div v-if="evidenceResource.data" class="transaction-evidence__body">
        <p class="transaction-evidence__scope row-text">
          {{ $t('transactions.evidence.scope') }}
        </p>

        <section class="transaction-evidence__section" aria-labelledby="transaction-evidence-merkle">
          <div class="transaction-evidence__heading">
            <h3 id="transaction-evidence-merkle">
              {{ $t('transactions.evidence.blockProof') }}
            </h3>
            <span
              v-if="evidenceResource.data.blockProof.status === 'available'"
              class="transaction-evidence__claim"
              data-test="block-proof-claim"
              :class="
                blockVerificationClaim === 'verified'
                  ? 'transaction-evidence__claim--verified'
                  : blockVerificationClaim === 'failed'
                    ? 'transaction-evidence__claim--failed'
                    : 'transaction-evidence__claim--provided'
              "
            >
              {{
                blockVerificationClaim === 'verified'
                  ? $t('transactions.evidence.entryVerified')
                  : blockVerificationClaim === 'failed'
                    ? $t('transactions.evidence.verificationFailed')
                    : $t('transactions.evidence.verificationIncomplete')
              }}
            </span>
          </div>

          <div
            v-if="evidenceResource.data.blockProof.status === 'available'"
            class="transaction-evidence__grid"
            data-test="block-proof-available"
          >
            <DataField
              :title="$t('transactions.evidence.entrypointPath')"
              :value="
                evidenceResource.data.blockProof.data.pathVerification.entry_hash_matches &&
                evidenceResource.data.blockProof.data.pathVerification.entry_proof_valid
                  ? $t('transactions.evidence.validEntryRoot')
                  : $t('transactions.evidence.pathFailed')
              "
            />
            <DataField
              :title="$t('transactions.evidence.executionResultPath')"
              :value="
                evidenceResource.data.blockProof.data.pathVerification.result_proof_valid
                  ? $t('transactions.evidence.validResultRoot')
                  : $t('transactions.evidence.pathFailed')
              "
            />
            <DataField
              :title="$t('transactions.evidence.requestedTransaction')"
              :value="
                blockVerification?.transactionHashMatches
                  ? $t('transactions.evidence.matchesProof')
                  : $t('transactions.evidence.doesNotMatchProof')
              "
            />
            <DataField
              :title="$t('transactions.evidence.proofHeight')"
              :value="
                blockVerification?.proofHeightMatches
                  ? $t('transactions.evidence.matchesHeight')
                  : $t('transactions.evidence.doesNotMatchHeight')
              "
            />
            <DataField
              :title="$t('transactions.evidence.referenceHeight')"
              :value="
                evidenceResource.data.referenceBlock.status !== 'available'
                  ? $t('transactions.evidence.couldNotCheck')
                  : blockVerification?.referenceBlockHeightMatches
                    ? $t('transactions.evidence.matchesHeight')
                    : $t('transactions.evidence.doesNotMatchHeight')
              "
            />
            <DataField
              :title="$t('transactions.evidence.transactionsRootBinding')"
              :value="
                evidenceResource.data.referenceBlock.status !== 'available'
                  ? $t('transactions.evidence.couldNotCheck')
                  : blockVerification?.entryRootMatches
                    ? $t('transactions.evidence.matchesReference')
                    : $t('transactions.evidence.doesNotMatchReference')
              "
            />
            <DataField
              :title="$t('transactions.evidence.entrypointRoot')"
              :hash="evidenceResource.data.blockProof.data.proof.entry_commitment.root"
              copy
            />
            <DataField
              :title="$t('transactions.evidence.resultRoot')"
              :hash="evidenceResource.data.blockProof.data.proof.result_commitment.root"
              copy
            />
          </div>
          <p
            v-else-if="evidenceResource.data.blockProof.status === 'unavailable'"
            class="transaction-evidence__message row-text"
            data-test="block-proof-unavailable"
          >
            {{ $t('transactions.evidence.noBlockProof') }}
          </p>
          <p v-else class="transaction-evidence__message transaction-evidence__message--error row-text" role="alert">
            {{ $t('transactions.evidence.blockProofRequestFailed') }}
          </p>

          <div
            v-if="evidenceResource.data.referenceBlock.status === 'available'"
            class="transaction-evidence__grid transaction-evidence__reference"
            data-test="reference-block-available"
          >
            <DataField
              :title="$t('transactions.evidence.referenceHeight')"
              :value="evidenceResource.data.referenceBlock.data.height"
            />
            <DataField
              :title="$t('transactions.evidence.referenceBlockHash')"
              :hash="evidenceResource.data.referenceBlock.data.hash"
              copy
            />
            <DataField
              :title="$t('transactions.evidence.referenceTransactionsRoot')"
              :hash="evidenceResource.data.referenceBlock.data.transactions_hash ?? undefined"
              :value="
                evidenceResource.data.referenceBlock.data.transactions_hash
                  ? undefined
                  : $t('transactions.evidence.noTransactionsRoot')
              "
              copy
            />
          </div>
          <p
            v-else-if="evidenceResource.data.referenceBlock.status === 'unavailable'"
            class="transaction-evidence__message row-text"
            data-test="reference-block-unavailable"
          >
            {{ $t('transactions.evidence.referenceUnavailable') }}
          </p>
          <p
            v-else
            class="transaction-evidence__message transaction-evidence__message--error row-text"
            data-test="reference-block-error"
            role="alert"
          >
            {{ $t('transactions.evidence.referenceRequestFailed') }}
          </p>

          <details v-if="rawBlockProof">
            <summary>{{ $t('transactions.evidence.canonicalProof') }}</summary>
            <pre>{{ rawBlockProof }}</pre>
          </details>
        </section>

        <section class="transaction-evidence__section" aria-labelledby="transaction-evidence-state">
          <div class="transaction-evidence__heading">
            <h3 id="transaction-evidence-state">
              {{ $t('transactions.evidence.stateRoot') }}
            </h3>
            <span class="transaction-evidence__claim transaction-evidence__claim--provided">
              {{ $t('transactions.evidence.nodeProvidedUnverified') }}
            </span>
          </div>
          <div v-if="evidenceResource.data.stateRoot.status === 'available'" class="transaction-evidence__grid">
            <DataField
              :title="$t('transactions.evidence.stateRoot')"
              :hash="evidenceResource.data.stateRoot.data.state_root"
              copy
            />
            <DataField
              :title="$t('transactions.evidence.source')"
              :value="evidenceResource.data.stateRoot.data.source"
            />
            <DataField
              :title="$t('transactions.evidence.blockHash')"
              :hash="evidenceResource.data.stateRoot.data.block_hash"
              copy
            />
          </div>
          <p
            v-else-if="evidenceResource.data.stateRoot.status === 'unavailable'"
            class="transaction-evidence__message row-text"
          >
            {{ $t('transactions.evidence.stateRootUnavailable') }}
          </p>
          <p v-else class="transaction-evidence__message transaction-evidence__message--error row-text" role="alert">
            {{ $t('transactions.evidence.stateRootRequestFailed') }}
          </p>
        </section>

        <section class="transaction-evidence__section" aria-labelledby="transaction-evidence-qc">
          <div class="transaction-evidence__heading">
            <h3 id="transaction-evidence-qc">
              {{ $t('transactions.evidence.quorumCertificate') }}
            </h3>
            <span class="transaction-evidence__claim transaction-evidence__claim--provided">
              {{ $t('transactions.evidence.nodeProvidedBlsUnverified') }}
            </span>
          </div>
          <div
            v-if="evidenceResource.data.stateProof.status === 'available'"
            class="transaction-evidence__grid"
            data-test="state-proof-available"
          >
            <DataField
              :title="$t('transactions.evidence.phase')"
              :value="evidenceResource.data.stateProof.data.commit_qc.phase"
            />
            <DataField
              :title="$t('transactions.evidence.viewEpoch')"
              :value="`${evidenceResource.data.stateProof.data.commit_qc.view} / ${evidenceResource.data.stateProof.data.commit_qc.epoch}`"
            />
            <DataField
              :title="$t('transactions.evidence.validatorEntries')"
              :value="evidenceResource.data.stateProof.data.commit_qc.validator_set.length"
            />
            <DataField
              :title="$t('transactions.evidence.signerBitmap')"
              :hash="evidenceResource.data.stateProof.data.commit_qc.aggregate.signers_bitmap"
              copy
            />
            <DataField
              :title="$t('transactions.evidence.validatorSetHash')"
              :hash="evidenceResource.data.stateProof.data.commit_qc.validator_set_hash"
              copy
            />
            <DataField
              :title="$t('transactions.evidence.aggregateSignature')"
              :hash="evidenceResource.data.stateProof.data.commit_qc.aggregate.bls_aggregate_signature"
              copy
            />
          </div>
          <p
            v-else-if="evidenceResource.data.stateProof.status === 'unavailable'"
            class="transaction-evidence__message row-text"
            data-test="state-proof-unavailable"
          >
            {{ $t('transactions.evidence.quorumUnavailable') }}
          </p>
          <p v-else class="transaction-evidence__message transaction-evidence__message--error row-text" role="alert">
            {{ $t('transactions.evidence.quorumRequestFailed') }}
          </p>

          <p
            v-if="stateAgreement !== null"
            class="transaction-evidence__agreement row-text"
            :class="
              stateAgreement ? 'transaction-evidence__agreement--matching' : 'transaction-evidence__agreement--mismatch'
            "
            role="status"
          >
            {{
              stateAgreement ? $t('transactions.evidence.stateAgreement') : $t('transactions.evidence.stateMismatch')
            }}
          </p>
        </section>
      </div>
    </BaseResourceState>
  </BaseContentBlock>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transaction-evidence {
  &__body {
    display: flex;
    flex-direction: column;
    gap: size(3);
    padding: 0 size(4) size(3);
  }

  &__scope {
    max-width: 78ch;
    color: theme-color('content-secondary');
  }

  &__section {
    padding-block-start: size(3);
    border-block-start: 1px solid theme-color('border-primary');

    details {
      margin-block-start: size(3);
    }

    summary {
      cursor: pointer;
      color: theme-color('content-secondary');
    }

    pre {
      max-height: 28rem;
      overflow: auto;
      margin-block-start: size(2);
      padding: size(2);
      border: 1px solid theme-color('border-primary');
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
    }
  }

  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: size(2);
    margin-block-end: size(2);
  }

  &__claim {
    padding: size(0.5) size(1.5);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;

    &--verified {
      color: theme-color('success');
      background: color-mix(in srgb, theme-color('success') 14%, transparent);
    }

    &--failed {
      color: theme-color('error');
      background: color-mix(in srgb, theme-color('error') 14%, transparent);
    }

    &--provided {
      color: theme-color('warning');
      background: color-mix(in srgb, theme-color('warning') 14%, transparent);
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: size(3);
  }

  &__reference {
    margin-block-start: size(3);
  }

  &__message {
    color: theme-color('content-secondary');

    &--error {
      color: theme-color('error');
    }
  }

  &__agreement {
    margin-block-start: size(3);

    &--matching {
      color: theme-color('success');
    }

    &--mismatch {
      color: theme-color('error');
    }
  }
}
</style>
