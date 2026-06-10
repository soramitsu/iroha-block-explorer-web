<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import * as http from '@/shared/api';
import type {
  ContractCodeView,
  ContractVerifiedSourceJobResponse,
  ContractVerifiedSourceRef,
  Instruction,
} from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { computeContractCodeViewInBackground } from '@/shared/lib/contract-view-worker-client';

const props = defineProps<{
  instruction?: Instruction | null
  relatedInstructions?: Instruction[] | null
}>();

const { t } = useI18n();

const uploadState = reactive({
  sourceName: '',
  sourceText: '',
  status: 'idle' as 'idle' | 'verifying' | 'accepted' | 'mismatch' | 'compile_error' | 'conflict' | 'error',
  message: '',
  actualCodeHash: null as string | null,
});

const localVerifiedSource = ref<{ text: string, ref: ContractVerifiedSourceRef | null } | null>(null);
const persistedVerifiedSource = ref<{ text: string, ref: ContractVerifiedSourceRef | null } | null>(null);
const renderState = reactive({
  isRendering: false,
  view: null as ContractCodeView | null,
});
let renderToken = 0;
let persistedSourceLookupToken = 0;
const persistedSourceLookupState = reactive({
  loadedKey: '',
});

const activeVerifiedSource = computed(() => localVerifiedSource.value ?? persistedVerifiedSource.value);

const viewData = computed(() => renderState.view);

const viewError = computed(() => {
  if (renderState.isRendering) return '';
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

const uploadStatusLabel = computed(() => {
  switch (uploadState.status) {
    case 'verifying':
      return t('transactions.contractView.verifyStatus.verifying');
    case 'accepted':
      return t('transactions.contractView.verifyStatus.accepted');
    case 'mismatch':
      return t('transactions.contractView.verifyStatus.mismatch');
    case 'compile_error':
      return t('transactions.contractView.verifyStatus.compileError');
    case 'conflict':
      return t('transactions.contractView.verifyStatus.conflict');
    case 'error':
      return t('transactions.contractView.verifyStatus.error');
    default:
      return '';
  }
});

const entrypointSummaries = computed(() =>
  (viewData.value?.entrypoints ?? []).map((entrypoint) => {
    const params = entrypoint.params.map((param) => `${param.name}: ${param.type_name}`).join(', ');
    const returnType = entrypoint.return_type ? ` -> ${entrypoint.return_type}` : '';
    return `${entrypoint.kind} fn ${entrypoint.name}(${params})${returnType}`;
  })
);

function resetUploadFeedback() {
  uploadState.status = 'idle';
  uploadState.message = '';
  uploadState.actualCodeHash = null;
}

function applyJobResult(result: ContractVerifiedSourceJobResponse) {
  uploadState.status = result.status === 'accepted'
    ? 'accepted'
    : result.status === 'mismatch'
      ? 'mismatch'
      : result.status === 'compile_error'
        ? 'compile_error'
        : result.status === 'conflict'
          ? 'conflict'
          : 'error';
  uploadState.message = result.message ?? '';
  uploadState.actualCodeHash = result.actual_code_hash ?? null;
}

async function renderContractView() {
  const currentToken = renderToken + 1;
  renderToken = currentToken;

  if (!props.instruction) {
    renderState.isRendering = false;
    renderState.view = null;
    return;
  }

  renderState.isRendering = true;
  const view = await computeContractCodeViewInBackground({
    instruction: props.instruction,
    relatedInstructions: props.relatedInstructions,
    verifiedSourceText: activeVerifiedSource.value?.text ?? null,
    verifiedSourceRef: activeVerifiedSource.value?.ref ?? null,
  });

  if (currentToken !== renderToken) return;

  renderState.view = view;
  renderState.isRendering = false;
}

function extractVerifiedSourceFromContractView(view: ContractCodeView | null): {
  text: string
  ref: ContractVerifiedSourceRef | null
} | null {
  if (!view) return null;
  if (view.rendered_source_kind !== 'verified_source') return null;
  const text = view.rendered_source_text.trim();
  if (!text) return null;
  return {
    text: view.rendered_source_text,
    ref: view.verified_source_ref ?? null,
  };
}

async function preloadPersistedVerifiedSource() {
  const instruction = props.instruction;
  const codeHash = viewData.value?.code_hash ?? null;
  if (!instruction || !codeHash) return;
  if (activeVerifiedSource.value) return;

  const lookupKey = `${instruction.transaction_hash}:${instruction.index}:${codeHash}`;
  if (persistedSourceLookupState.loadedKey === lookupKey) return;
  persistedSourceLookupState.loadedKey = lookupKey;

  const currentToken = persistedSourceLookupToken + 1;
  persistedSourceLookupToken = currentToken;

  const instructionViewResult = await http.fetchInstructionContractView(
    instruction.transaction_hash,
    instruction.index
  );

  if (currentToken !== persistedSourceLookupToken || activeVerifiedSource.value) return;

  let verifiedSource = instructionViewResult.status === SUCCESSFUL_FETCHING
    ? extractVerifiedSourceFromContractView(instructionViewResult.data)
    : null;

  if (!verifiedSource) {
    const codeViewResult = await http.fetchContractCodeView(codeHash);

    if (currentToken !== persistedSourceLookupToken || activeVerifiedSource.value) return;

    verifiedSource = codeViewResult.status === SUCCESSFUL_FETCHING
      ? extractVerifiedSourceFromContractView(codeViewResult.data)
      : null;
  }

  if (currentToken !== persistedSourceLookupToken || activeVerifiedSource.value) return;

  persistedVerifiedSource.value = verifiedSource;
}

async function submitVerifiedSource() {
  const codeHash = viewData.value?.code_hash;
  if (!codeHash) return;

  uploadState.status = 'verifying';
  uploadState.message = '';
  uploadState.actualCodeHash = null;

  try {
    const result = await http.submitVerifiedContractSource(codeHash, {
      language: 'kotodama',
      source_name: uploadState.sourceName.trim() || null,
      source_text: uploadState.sourceText,
    });

    if (result.data) {
      applyJobResult(result.data);
      if (result.data.status === 'accepted') {
        localVerifiedSource.value = {
          text: uploadState.sourceText,
          ref: result.data.verified_source_ref ?? {
            language: 'kotodama',
            source_name: uploadState.sourceName.trim() || null,
            submitted_at: result.data.completed_at ?? result.data.submitted_at,
            manifest_id_hex: null,
            payload_digest_hex: null,
            content_length: uploadState.sourceText.length,
          },
        };
      }
      return;
    }

    uploadState.status = 'error';
    uploadState.message = result.ok ? t('transactions.unknownError') : result.error?.message ?? t('transactions.unknownError');
  } catch (error) {
    uploadState.status = 'error';
    uploadState.message = error instanceof Error ? error.message : t('transactions.unknownError');
  }
}

watch(
  () => [props.instruction?.transaction_hash ?? '', props.instruction?.index ?? -1],
  () => {
    localVerifiedSource.value = null;
    persistedVerifiedSource.value = null;
    persistedSourceLookupState.loadedKey = '';
    persistedSourceLookupToken += 1;
    resetUploadFeedback();
  },
  { immediate: true }
);

watch(
  () => ({
    instruction: props.instruction,
    relatedInstructions: props.relatedInstructions,
    verifiedSourceText: activeVerifiedSource.value?.text ?? null,
    verifiedSourceSubmittedAt: activeVerifiedSource.value?.ref?.submitted_at ?? null,
    verifiedSourceDigest: activeVerifiedSource.value?.ref?.payload_digest_hex ?? null,
  }),
  () => {
    renderContractView().catch(() => {
      renderState.isRendering = false;
      renderState.view = null;
    });
  },
  { immediate: true, deep: true }
);

watch(
  () => ({
    transactionHash: props.instruction?.transaction_hash ?? '',
    index: props.instruction?.index ?? -1,
    codeHash: viewData.value?.code_hash ?? null,
    renderedKind: viewData.value?.rendered_source_kind ?? null,
    localVerifiedSource: localVerifiedSource.value?.ref?.submitted_at ?? localVerifiedSource.value?.text ?? null,
  }),
  () => {
    preloadPersistedVerifiedSource().catch(() => undefined);
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
      v-if="renderState.isRendering"
      class="contract-code-view__status"
      data-test="contract-view-loading"
    >
      {{ $t('transactions.loadingInstruction') }}
    </div>

    <div
      v-else-if="viewError"
      class="contract-code-view__status contract-code-view__status_error"
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

      <form
        class="contract-code-view__upload"
        data-test="contract-view-upload-form"
        @submit.prevent="submitVerifiedSource"
      >
        <div class="contract-code-view__section-title">
          {{ $t('transactions.contractView.verifyFormTitle') }}
        </div>
        <label class="contract-code-view__label">
          <span>{{ $t('transactions.contractView.sourceName') }}</span>
          <input
            v-model="uploadState.sourceName"
            type="text"
            :placeholder="$t('transactions.contractView.sourceNamePlaceholder')"
          >
        </label>
        <label class="contract-code-view__label">
          <span>{{ $t('transactions.contractView.sourceText') }}</span>
          <textarea
            v-model="uploadState.sourceText"
            rows="8"
            :placeholder="$t('transactions.contractView.sourceTextPlaceholder')"
          />
        </label>
        <div class="contract-code-view__upload-actions">
          <BaseButton
            bordered
            native-type="submit"
            data-test="contract-view-upload-submit"
          >
            {{ uploadState.status === 'verifying'
              ? $t('transactions.contractView.verifyActionBusy')
              : $t('transactions.contractView.verifyAction') }}
          </BaseButton>
          <div
            v-if="uploadState.status !== 'idle'"
            class="contract-code-view__upload-status"
            data-test="contract-view-upload-status"
          >
            <strong>{{ uploadStatusLabel }}</strong>
            <span v-if="uploadState.message">{{ uploadState.message }}</span>
            <span v-if="uploadState.actualCodeHash">
              {{ $t('transactions.contractView.actualCodeHash') }}: {{ uploadState.actualCodeHash }}
            </span>
          </div>
        </div>
      </form>
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

  &__body {
    display: flex;
    flex-direction: column;
    gap: size(2);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: size(2);
  }

  &__eyebrow,
  &__section-title,
  &__label > span {
    @include tpg-s3;
    color: theme-color('content-tertiary');
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

  &__provenance {
    @include tpg-s3;
    color: theme-color('content-secondary');
  }

  &__meta,
  &__analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(size(24), 1fr));
    gap: size(1.5);
  }

  &__warnings,
  &__entrypoints,
  &__source,
  &__verification,
  &__upload,
  &__analysis {
    display: flex;
    flex-direction: column;
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

  &__label {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__label input,
  &__label textarea {
    width: 100%;
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    background: theme-color('background');
    color: theme-color('content-primary');
    padding: size(1.5);
    resize: vertical;
  }

  &__upload-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1.5);
  }

  &__upload-status {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    @include tpg-s3;
  }
}

html:not(.dark) .contract-code-view {
  &__status,
  &__source pre,
  &__label input,
  &__label textarea {
    background: theme-color('surface');
  }
}
</style>
