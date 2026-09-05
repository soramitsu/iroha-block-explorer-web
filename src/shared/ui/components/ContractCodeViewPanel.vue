<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { ContractCodeView, Instruction } from '@/shared/api/schemas';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import DataField from '@/shared/ui/components/DataField.vue';

const props = defineProps<{
  instruction?: Instruction | null
}>();

const { t } = useI18n();
const loadState = reactive({
  isLoading: false,
  view: null as ContractCodeView | null,
});
let loadToken = 0;

const viewData = computed(() => loadState.view);
const viewError = computed(() => {
  if (loadState.isLoading) return '';
  if (!props.instruction) return t('transactions.contractView.unavailable');
  if (!viewData.value) return t('transactions.contractView.notFound');
  return '';
});

const sourceKindLabel = computed(() => {
  switch (viewData.value?.rendered_source_kind) {
    case 'verified_source':
      return t('transactions.contractView.verifiedSource');
    case 'manifest_stub':
      return t('transactions.contractView.manifestStub');
    default:
      return t('transactions.contractView.decompiled');
  }
});

const sourceKindClass = computed(() => {
  switch (viewData.value?.rendered_source_kind) {
    case 'verified_source':
      return 'verified';
    case 'manifest_stub':
      return 'manifest';
    default:
      return 'decompiled';
  }
});

const entrypointSummaries = computed(() =>
  (viewData.value?.entrypoints ?? []).map((entrypoint) => {
    const params = entrypoint.params.map((param) => `${param.name}: ${param.type_name}`).join(', ');
    const returnType = entrypoint.return_type ? ` -> ${entrypoint.return_type}` : '';
    return `${entrypoint.kind} fn ${entrypoint.name}(${params})${returnType}`;
  })
);

async function loadContractView() {
  const token = ++loadToken;
  const instruction = props.instruction;

  if (!instruction) {
    loadState.isLoading = false;
    loadState.view = null;
    return;
  }

  loadState.isLoading = true;
  loadState.view = null;

  try {
    const result = await http.fetchInstructionContractView(
      instruction.transaction_hash,
      instruction.index
    );
    if (token !== loadToken) return;
    loadState.view = result.status === SUCCESSFUL_FETCHING ? result.data : null;
  } catch {
    if (token !== loadToken) return;
    loadState.view = null;
  } finally {
    if (token === loadToken) loadState.isLoading = false;
  }
}

watch(
  () => [props.instruction?.transaction_hash ?? '', props.instruction?.index ?? -1] as const,
  async () => {
    await loadContractView();
  },
  { immediate: true }
);
</script>

<template>
  <section
    class="contract-code-view"
    data-test="contract-view-panel"
  >
    <div
      v-if="loadState.isLoading"
      class="contract-code-view__status"
      data-test="contract-view-loading"
    >
      {{ $t('transactions.loadingInstruction') }}
    </div>

    <div
      v-else-if="viewError"
      class="contract-code-view__status contract-code-view__status_error"
      data-test="contract-view-error"
    >
      {{ viewError }}
    </div>

    <div
      v-else-if="viewData"
      class="contract-code-view__body"
    >
      <div class="contract-code-view__header">
        <div>
          <div class="contract-code-view__eyebrow">
            {{ $t('transactions.contractView.title') }}
          </div>
          <div
            class="contract-code-view__badge"
            :data-kind="sourceKindClass"
            data-test="contract-view-source-kind"
          >
            {{ sourceKindLabel }}
          </div>
        </div>
        <div
          v-if="viewData.verified_source_ref"
          class="contract-code-view__provenance"
        >
          {{ $t('transactions.contractView.verifiedStoredInSorafs') }}
        </div>
      </div>

      <div class="contract-code-view__meta">
        <DataField :title="$t('transactions.contractView.codeHash')">
          <BaseHash
            :hash="viewData.code_hash"
            type="short"
            copy
          />
        </DataField>
        <DataField
          v-if="viewData.declared_code_hash"
          :title="$t('transactions.contractView.declaredCodeHash')"
        >
          <BaseHash
            :hash="viewData.declared_code_hash"
            type="short"
            copy
          />
        </DataField>
        <DataField
          v-if="viewData.abi_hash"
          :title="$t('transactions.contractView.abiHash')"
        >
          <BaseHash
            :hash="viewData.abi_hash"
            type="short"
            copy
          />
        </DataField>
        <DataField
          v-if="viewData.compiler_fingerprint"
          :title="$t('transactions.contractView.compilerFingerprint')"
          :value="viewData.compiler_fingerprint"
        />
        <DataField
          v-if="viewData.byte_len !== null"
          :title="$t('transactions.contractView.byteLength')"
          :value="viewData.byte_len"
        />
      </div>

      <div
        v-if="viewData.warnings.length"
        class="contract-code-view__warnings"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.warnings') }}
        </div>
        <ul>
          <li
            v-for="warning in viewData.warnings"
            :key="warning"
            data-test="contract-view-warning"
          >
            {{ warning }}
          </li>
        </ul>
      </div>

      <div
        v-if="entrypointSummaries.length"
        class="contract-code-view__entrypoints"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.entrypoints') }}
        </div>
        <ul>
          <li
            v-for="entrypoint in entrypointSummaries"
            :key="entrypoint"
          >
            <code>{{ entrypoint }}</code>
          </li>
        </ul>
      </div>

      <div
        v-if="viewData.analysis"
        class="contract-code-view__analysis"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.analysis') }}
        </div>
        <div class="contract-code-view__analysis-grid">
          <DataField
            :title="$t('transactions.contractView.instructionCount')"
            :value="viewData.analysis.instruction_count"
          />
          <DataField
            :title="$t('transactions.contractView.syscalls')"
            :value="viewData.analysis.syscalls.length"
          />
        </div>
      </div>

      <div class="contract-code-view__source">
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.source') }}
        </div>
        <pre data-test="contract-view-source">{{ viewData.rendered_source_text }}</pre>
      </div>

      <div
        v-if="viewData.verified_source_ref"
        class="contract-code-view__verification"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.verificationRecord') }}
        </div>
        <div class="contract-code-view__meta">
          <DataField
            :title="$t('transactions.contractView.sourceLanguage')"
            :value="viewData.verified_source_ref.language"
          />
          <DataField
            v-if="viewData.verified_source_ref.source_name"
            :title="$t('transactions.contractView.sourceName')"
            :value="viewData.verified_source_ref.source_name"
          />
          <DataField
            :title="$t('transactions.contractView.submittedAt')"
            :value="viewData.verified_source_ref.submitted_at"
          />
          <DataField
            v-if="viewData.verified_source_ref.manifest_id_hex"
            :title="$t('transactions.contractView.sorafsManifestId')"
          >
            <BaseHash
              :hash="viewData.verified_source_ref.manifest_id_hex"
              type="short"
              copy
            />
          </DataField>
          <DataField
            v-if="viewData.verified_source_ref.payload_digest_hex"
            :title="$t('transactions.contractView.payloadDigest')"
          >
            <BaseHash
              :hash="viewData.verified_source_ref.payload_digest_hex"
              type="short"
              copy
            />
          </DataField>
        </div>
      </div>

      <div
        class="contract-code-view__verification-boundary"
        data-test="contract-view-verification-auth-boundary"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.submissionBoundaryTitle') }}
        </div>
        <p>
          {{ $t('transactions.contractView.submissionBoundaryDescription') }}
        </p>
      </div>
    </div>
  </section>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.contract-code-view {
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__status {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: size(12);
    border-radius: size(3);
    background: theme-color('background');
    padding: size(2);

    &_error {
      justify-content: flex-start;
      color: theme-color('error');
    }
  }

  &__body,
  &__warnings,
  &__entrypoints,
  &__source,
  &__verification,
  &__verification-boundary,
  &__analysis {
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__body {
    gap: size(2);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: size(2);
  }

  &__eyebrow,
  &__section-title {
    color: theme-color('content-tertiary');
    text-transform: uppercase;
    letter-spacing: 0.04em;
    @include tpg-s3;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    border-radius: size(2);
    padding: size(0.75) size(1.5);
    margin-top: size(1);
    @include tpg-s3;

    &[data-kind='verified'] {
      color: theme-color('content-primary');
      background: color-mix(in srgb, theme-color('success') 18%, transparent);
    }

    &[data-kind='decompiled'] {
      color: theme-color('content-primary');
      background: color-mix(in srgb, theme-color('info') 18%, transparent);
    }

    &[data-kind='manifest'] {
      color: theme-color('content-primary');
      background: color-mix(in srgb, theme-color('border-primary') 28%, transparent);
    }
  }

  &__provenance,
  &__verification-boundary p {
    margin: 0;
    color: theme-color('content-secondary');
    @include tpg-s3;
  }

  &__meta,
  &__analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(size(24), 1fr));
    gap: size(1.5);
  }

  &__warnings ul,
  &__entrypoints ul {
    display: flex;
    flex-direction: column;
    gap: size(0.75);
    padding-left: size(2);
    margin: 0;
  }

  &__source pre {
    overflow: auto;
    border-radius: size(3);
    background: theme-color('background');
    padding: size(2);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
}

html:not(.dark) .contract-code-view {
  &__status,
  &__source pre {
    background: theme-color('surface');
  }
}
</style>
