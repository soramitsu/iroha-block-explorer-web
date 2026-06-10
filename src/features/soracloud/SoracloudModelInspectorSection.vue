<template>
  <BaseContentBlock :title="$t('soracloud.modelInspector')">
    <BaseInnerBlock
      :title="$t('soracloud.trainingJobStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitTrainingJob"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="trainingJobDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.jobId') }}</span>
            <input
              v-model="trainingJobDraft.job_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.jobIdPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!trainingJobDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!trainingJobRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="trainingJobRequest.isLoading && !trainingJobRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="trainingJobRequest.data">
        <p
          v-if="trainingJobRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ trainingJobRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.service')"
            :value="trainingJobRequest.data.job.service_name"
          />
          <DataField
            :title="$t('soracloud.modelName')"
            :value="trainingJobRequest.data.job.model_name"
          />
          <DataField
            :title="$t('soracloud.jobId')"
            :value="trainingJobRequest.data.job.job_id"
            monospace
          />
          <DataField
            :title="$t('soracloud.status')"
            :value="trainingJobRequest.data.job.status"
          />
          <DataField
            :title="$t('soracloud.workerGroupSize')"
            :value="formatNumber(trainingJobRequest.data.job.worker_group_size)"
          />
          <DataField
            :title="$t('soracloud.targetSteps')"
            :value="formatNumber(trainingJobRequest.data.job.target_steps)"
          />
          <DataField
            :title="$t('soracloud.completedSteps')"
            :value="formatNumber(trainingJobRequest.data.job.completed_steps)"
          />
          <DataField
            :title="$t('soracloud.checkpointIntervalSteps')"
            :value="formatNumber(trainingJobRequest.data.job.checkpoint_interval_steps)"
          />
          <DataField
            :title="$t('soracloud.lastCheckpointStep')"
            :value="formatNullableNumber(trainingJobRequest.data.job.last_checkpoint_step)"
          />
          <DataField
            :title="$t('soracloud.checkpointCount')"
            :value="formatNumber(trainingJobRequest.data.job.checkpoint_count)"
          />
          <DataField
            :title="$t('soracloud.retryCount')"
            :value="formatNumber(trainingJobRequest.data.job.retry_count)"
          />
          <DataField
            :title="$t('soracloud.maxRetries')"
            :value="formatNumber(trainingJobRequest.data.job.max_retries)"
          />
          <DataField
            :title="$t('soracloud.stepComputeUnits')"
            :value="formatNumber(trainingJobRequest.data.job.step_compute_units)"
          />
          <DataField
            :title="$t('soracloud.computeBudgetUnits')"
            :value="formatNumber(trainingJobRequest.data.job.compute_budget_units)"
          />
          <DataField
            :title="$t('soracloud.computeConsumedUnits')"
            :value="formatNumber(trainingJobRequest.data.job.compute_consumed_units)"
          />
          <DataField
            :title="$t('soracloud.computeRemainingUnits')"
            :value="formatNumber(trainingJobRequest.data.job.compute_remaining_units)"
          />
          <DataField
            :title="$t('soracloud.storageBudgetBytes')"
            :value="formatBytes(trainingJobRequest.data.job.storage_budget_bytes)"
          />
          <DataField
            :title="$t('soracloud.storageConsumedBytes')"
            :value="formatBytes(trainingJobRequest.data.job.storage_consumed_bytes)"
          />
          <DataField
            :title="$t('soracloud.storageRemainingBytes')"
            :value="formatBytes(trainingJobRequest.data.job.storage_remaining_bytes)"
          />
          <DataField
            :title="$t('soracloud.latestMetricsHash')"
            :value="trainingJobRequest.data.job.latest_metrics_hash ?? '—'"
            :hash="trainingJobRequest.data.job.latest_metrics_hash ?? undefined"
            monospace
          />
          <DataField
            :title="$t('soracloud.lastFailureReason')"
            :value="trainingJobRequest.data.job.last_failure_reason ?? '—'"
          />
          <DataField
            :title="$t('soracloud.createdSequence')"
            :value="formatNumber(trainingJobRequest.data.job.created_sequence)"
          />
          <DataField
            :title="$t('soracloud.updatedSequence')"
            :value="formatNumber(trainingJobRequest.data.job.updated_sequence)"
          />
        </div>
      </template>

      <p
        v-else-if="trainingJobRequest.error"
        class="soracloud-page__section-error"
      >
        {{ trainingJobRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.modelWeightStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitModelWeight"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="modelWeightDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelName') }}</span>
            <input
              v-model="modelWeightDraft.model_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.modelNamePlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!modelWeightDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!modelWeightRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="modelWeightRequest.isLoading && !modelWeightRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="modelWeightRequest.data">
        <p
          v-if="modelWeightRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ modelWeightRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.service')"
            :value="modelWeightRequest.data.model.service_name"
          />
          <DataField
            :title="$t('soracloud.modelName')"
            :value="modelWeightRequest.data.model.model_name"
          />
          <DataField
            :title="$t('soracloud.currentVersion')"
            :value="modelWeightRequest.data.model.current_version ?? '—'"
            monospace
          />
          <DataField
            :title="$t('soracloud.versionCount')"
            :value="formatNumber(modelWeightRequest.data.model.version_count)"
          />
        </div>

        <div
          v-if="modelWeightRequest.data.model.versions.length"
          class="soracloud-page__entry-list"
        >
          <article
            v-for="version in modelWeightRequest.data.model.versions"
            :key="version.weight_version"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title row-text-monospace">
                {{ version.weight_version }}
              </h4>
              <span class="row-text">{{ formatNumber(version.registered_sequence) }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.parentVersion')"
                :value="version.parent_version ?? '—'"
                monospace
              />
              <DataField
                :title="$t('soracloud.trainingJobId')"
                :value="version.training_job_id"
                monospace
              />
              <DataField
                :title="$t('soracloud.weightArtifactHash')"
                :value="version.weight_artifact_hash"
                :hash="version.weight_artifact_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.datasetRef')"
                :value="version.dataset_ref"
              />
              <DataField
                :title="$t('soracloud.trainingConfigHash')"
                :value="version.training_config_hash"
                :hash="version.training_config_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.reproducibilityHash')"
                :value="version.reproducibility_hash"
                :hash="version.reproducibility_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.provenanceAttestationHash')"
                :value="version.provenance_attestation_hash"
                :hash="version.provenance_attestation_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.registeredSequence')"
                :value="formatNumber(version.registered_sequence)"
              />
              <DataField
                :title="$t('soracloud.promotedSequence')"
                :value="formatNullableNumber(version.promoted_sequence)"
              />
              <DataField
                :title="$t('soracloud.gateReportHash')"
                :value="version.gate_report_hash ?? '—'"
                :hash="version.gate_report_hash ?? undefined"
                monospace
              />
            </div>
          </article>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="modelWeightRequest.error"
        class="soracloud-page__section-error"
      >
        {{ modelWeightRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.modelArtifactStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitModelArtifact"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="modelArtifactDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelName') }}</span>
            <input
              v-model="modelArtifactDraft.model_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.artifactId') }}</span>
            <input
              v-model="modelArtifactDraft.artifact_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.trainingJobId') }}</span>
            <input
              v-model="modelArtifactDraft.training_job_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.weightVersion') }}</span>
            <input
              v-model="modelArtifactDraft.weight_version"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!modelArtifactDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!modelArtifactRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="modelArtifactRequest.isLoading && !modelArtifactRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="modelArtifactRequest.data">
        <p
          v-if="modelArtifactRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ modelArtifactRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.service')"
            :value="modelArtifactRequest.data.service_name"
          />
          <DataField
            :title="$t('soracloud.modelName')"
            :value="modelArtifactRequest.data.model_name"
          />
          <DataField
            :title="$t('soracloud.artifactCount')"
            :value="formatNumber(modelArtifactRequest.data.artifact_count)"
          />
          <DataField
            :title="$t('soracloud.artifactId')"
            :value="modelArtifactRequest.data.artifact.artifact_id"
            monospace
          />
        </div>

        <div class="soracloud-page__entry-list">
          <article
            v-for="artifact in modelArtifactRequest.data.artifacts"
            :key="artifact.artifact_id"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title row-text-monospace">
                {{ artifact.artifact_id }}
              </h4>
              <span class="row-text">{{ formatNumber(artifact.registered_sequence) }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.trainingJobId')"
                :value="artifact.training_job_id"
                monospace
              />
              <DataField
                :title="$t('soracloud.weightVersion')"
                :value="artifact.weight_version ?? '—'"
                monospace
              />
              <DataField
                :title="$t('soracloud.weightArtifactHash')"
                :value="artifact.weight_artifact_hash"
                :hash="artifact.weight_artifact_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.datasetRef')"
                :value="artifact.dataset_ref"
              />
              <DataField
                :title="$t('soracloud.trainingConfigHash')"
                :value="artifact.training_config_hash"
                :hash="artifact.training_config_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.reproducibilityHash')"
                :value="artifact.reproducibility_hash"
                :hash="artifact.reproducibility_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.provenanceAttestationHash')"
                :value="artifact.provenance_attestation_hash"
                :hash="artifact.provenance_attestation_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.consumedByVersion')"
                :value="artifact.consumed_by_version ?? '—'"
                monospace
              />
              <DataField
                :title="$t('soracloud.privateBundleRoot')"
                :value="artifact.private_bundle_root ?? '—'"
                :hash="artifact.private_bundle_root ?? undefined"
                monospace
              />
              <DataField
                :title="$t('soracloud.compileProfileHash')"
                :value="artifact.compile_profile_hash ?? '—'"
                :hash="artifact.compile_profile_hash ?? undefined"
                monospace
              />
              <DataField
                :title="$t('soracloud.chunkManifestRoot')"
                :value="artifact.chunk_manifest_root ?? '—'"
                :hash="artifact.chunk_manifest_root ?? undefined"
                monospace
              />
              <DataField
                :title="$t('soracloud.privacyMode')"
                :value="artifact.privacy_mode === null ? '—' : jsonString(artifact.privacy_mode)"
              />
            </div>
          </article>
        </div>
      </template>

      <p
        v-else-if="modelArtifactRequest.error"
        class="soracloud-page__section-error"
      >
        {{ modelArtifactRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.uploadedModelStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-uploaded-model"
        @submit.prevent="handleSubmitUploadedModel"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="uploadedModelDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
              data-test="soracloud-uploaded-model-service"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.weightVersion') }}</span>
            <input
              v-model="uploadedModelDraft.weight_version"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.weightVersionPlaceholder')"
              data-test="soracloud-uploaded-model-weight-version"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelId') }}</span>
            <input
              v-model="uploadedModelDraft.model_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-uploaded-model-model-id"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelName') }}</span>
            <input
              v-model="uploadedModelDraft.model_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-uploaded-model-model-name"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.bundleRoot') }}</span>
            <input
              v-model="uploadedModelDraft.bundle_root"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-uploaded-model-bundle-root"
              @blur="validationTouched.uploadedBundleRoot = true"
            >
            <p
              v-if="uploadedModelBundleRootError"
              class="soracloud-page__field-error"
              data-test="soracloud-uploaded-model-bundle-root-error"
            >
              {{ uploadedModelBundleRootError }}
            </p>
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.compileProfileHash') }}</span>
            <input
              v-model="uploadedModelDraft.compile_profile_hash"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-uploaded-model-compile-profile-hash"
              @blur="validationTouched.uploadedCompileProfileHash = true"
            >
            <p
              v-if="uploadedModelCompileProfileHashError"
              class="soracloud-page__field-error"
              data-test="soracloud-uploaded-model-compile-profile-hash-error"
            >
              {{ uploadedModelCompileProfileHashError }}
            </p>
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!uploadedModelDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!uploadedModelRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="uploadedModelRequest.isLoading && !uploadedModelRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="uploadedModelRequest.data">
        <p
          v-if="uploadedModelRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ uploadedModelRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.uploadedChunkCount')"
            :value="formatNumber(uploadedModelRequest.data.uploaded_chunk_count)"
          />
          <DataField
            :title="$t('soracloud.chunkOrdinals')"
            :value="uploadedModelRequest.data.chunk_ordinals.length ? uploadedModelRequest.data.chunk_ordinals.join(', ') : '—'"
          />
          <DataField
            :title="$t('soracloud.compileProfile')"
            :value="uploadedModelRequest.data.compile_profile ? $t('soracloud.available') : '—'"
          />
          <DataField
            :title="$t('soracloud.artifact')"
            :value="uploadedModelRequest.data.artifact ? uploadedModelRequest.data.artifact.artifact_id : '—'"
          />
        </div>

        <div class="soracloud-page__json-stack">
          <div class="soracloud-page__json-card">
            <span class="label">{{ $t('soracloud.bundle') }}</span>
            <BaseJson
              :value="uploadedModelRequest.data.bundle"
              full
            />
          </div>

          <div
            v-if="uploadedModelRequest.data.compile_profile"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.compileProfile') }}</span>
            <BaseJson
              :value="uploadedModelRequest.data.compile_profile"
              full
            />
          </div>
        </div>
      </template>

      <p
        v-else-if="uploadedModelRequest.error"
        class="soracloud-page__section-error"
      >
        {{ uploadedModelRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.privateCompileStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-private-compile"
        @submit.prevent="handleSubmitPrivateCompile"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="privateCompileDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.weightVersion') }}</span>
            <input
              v-model="privateCompileDraft.weight_version"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.weightVersionPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelId') }}</span>
            <input
              v-model="privateCompileDraft.model_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.modelName') }}</span>
            <input
              v-model="privateCompileDraft.model_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.bundleRoot') }}</span>
            <input
              v-model="privateCompileDraft.bundle_root"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-private-compile-bundle-root"
              @blur="validationTouched.privateCompileBundleRoot = true"
            >
            <p
              v-if="privateCompileBundleRootError"
              class="soracloud-page__field-error"
              data-test="soracloud-private-compile-bundle-root-error"
            >
              {{ privateCompileBundleRootError }}
            </p>
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.compileProfileHash') }}</span>
            <input
              v-model="privateCompileDraft.compile_profile_hash"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-private-compile-compile-profile-hash"
              @blur="validationTouched.privateCompileCompileProfileHash = true"
            >
            <p
              v-if="privateCompileCompileProfileHashError"
              class="soracloud-page__field-error"
              data-test="soracloud-private-compile-compile-profile-hash-error"
            >
              {{ privateCompileCompileProfileHashError }}
            </p>
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!privateCompileDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!privateCompileRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="privateCompileRequest.isLoading && !privateCompileRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="privateCompileRequest.data">
        <p
          v-if="privateCompileRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ privateCompileRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.uploadedChunkCount')"
            :value="formatNumber(privateCompileRequest.data.uploaded_chunk_count)"
          />
          <DataField
            :title="$t('soracloud.chunkOrdinals')"
            :value="privateCompileRequest.data.chunk_ordinals.length ? privateCompileRequest.data.chunk_ordinals.join(', ') : '—'"
          />
          <DataField
            :title="$t('soracloud.compileProfile')"
            :value="privateCompileRequest.data.compile_profile ? $t('soracloud.available') : '—'"
          />
          <DataField
            :title="$t('soracloud.artifact')"
            :value="privateCompileRequest.data.artifact ? privateCompileRequest.data.artifact.artifact_id : '—'"
          />
        </div>

        <div class="soracloud-page__json-stack">
          <div class="soracloud-page__json-card">
            <span class="label">{{ $t('soracloud.bundle') }}</span>
            <BaseJson
              :value="privateCompileRequest.data.bundle"
              full
            />
          </div>

          <div
            v-if="privateCompileRequest.data.compile_profile"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.compileProfile') }}</span>
            <BaseJson
              :value="privateCompileRequest.data.compile_profile"
              full
            />
          </div>
        </div>
      </template>

      <p
        v-else-if="privateCompileRequest.error"
        class="soracloud-page__section-error"
      >
        {{ privateCompileRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.privateInferenceStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitPrivateInference"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.sessionId') }}</span>
            <input
              v-model="privateInferenceDraft.session_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.sessionIdPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!privateInferenceDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!privateInferenceRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="privateInferenceRequest.isLoading && !privateInferenceRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="privateInferenceRequest.data">
        <p
          v-if="privateInferenceRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ privateInferenceRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.checkpointCount')"
            :value="formatNumber(privateInferenceRequest.data.checkpoint_count)"
          />
          <DataField
            :title="$t('soracloud.checkpoints')"
            :value="formatNumber(privateInferenceRequest.data.checkpoints.length)"
          />
        </div>

        <div class="soracloud-page__json-stack">
          <div class="soracloud-page__json-card">
            <span class="label">{{ $t('soracloud.session') }}</span>
            <BaseJson
              :value="privateInferenceRequest.data.session"
              full
            />
          </div>

          <div
            v-if="privateInferenceRequest.data.checkpoints.length"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.checkpoints') }}</span>
            <BaseJson
              :value="{ checkpoints: privateInferenceRequest.data.checkpoints }"
              full
            />
          </div>
        </div>
      </template>

      <p
        v-else-if="privateInferenceRequest.error"
        class="soracloud-page__section-error"
      >
        {{ privateInferenceRequest.error }}
      </p>
    </BaseInnerBlock>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  SoracloudModelArtifactStatusQuery,
  SoracloudModelArtifactStatusResponse,
  SoracloudModelWeightStatusQuery,
  SoracloudModelWeightStatusResponse,
  SoracloudPrivateInferenceStatusQuery,
  SoracloudPrivateInferenceStatusResponse,
  SoracloudTrainingJobStatusQuery,
  SoracloudTrainingJobStatusResponse,
  SoracloudUploadedModelStatusQuery,
  SoracloudUploadedModelStatusResponse,
} from '@/shared/api/schemas';
import { formatBytes, formatNumber } from '@/shared/ui/utils/formatters';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseInnerBlock from '@/shared/ui/components/BaseInnerBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { formatNullableNumber, jsonString } from './display';
import type { SoracloudParsedField, SoracloudSectionState } from './types';
import { soracloudValidationMessageKey } from './validation';

const { t } = useI18n();

const trainingJobDraft = defineModel<{ service_name: string, job_id: string }>('trainingJobDraft', { required: true });
const modelWeightDraft = defineModel<{ service_name: string, model_name: string }>('modelWeightDraft', { required: true });
const modelArtifactDraft = defineModel<{
  service_name: string
  model_name: string
  artifact_id: string
  training_job_id: string
  weight_version: string
}>('modelArtifactDraft', { required: true });
const uploadedModelDraft = defineModel<{
  service_name: string
  weight_version: string
  model_id: string
  model_name: string
  bundle_root: string
  compile_profile_hash: string
}>('uploadedModelDraft', { required: true });
const privateCompileDraft = defineModel<{
  service_name: string
  weight_version: string
  model_id: string
  model_name: string
  bundle_root: string
  compile_profile_hash: string
}>('privateCompileDraft', { required: true });
const privateInferenceDraft = defineModel<{ session_id: string }>('privateInferenceDraft', { required: true });

const props = defineProps<{
  serviceSuggestions: string[]
  trainingJobDraftReady: boolean
  modelWeightDraftReady: boolean
  modelArtifactDraftReady: boolean
  uploadedModelDraftReady: boolean
  privateCompileDraftReady: boolean
  privateInferenceDraftReady: boolean
  trainingJobRequest: SoracloudSectionState<SoracloudTrainingJobStatusQuery, SoracloudTrainingJobStatusResponse>
  modelWeightRequest: SoracloudSectionState<SoracloudModelWeightStatusQuery, SoracloudModelWeightStatusResponse>
  modelArtifactRequest: SoracloudSectionState<SoracloudModelArtifactStatusQuery, SoracloudModelArtifactStatusResponse>
  uploadedModelRequest: SoracloudSectionState<SoracloudUploadedModelStatusQuery, SoracloudUploadedModelStatusResponse>
  privateCompileRequest: SoracloudSectionState<SoracloudUploadedModelStatusQuery, SoracloudUploadedModelStatusResponse>
  privateInferenceRequest: SoracloudSectionState<SoracloudPrivateInferenceStatusQuery, SoracloudPrivateInferenceStatusResponse>
  uploadedModelBundleRootValidation: SoracloudParsedField<string>
  uploadedModelCompileProfileHashValidation: SoracloudParsedField<string>
  privateCompileBundleRootValidation: SoracloudParsedField<string>
  privateCompileCompileProfileHashValidation: SoracloudParsedField<string>
  submitTrainingJob: () => void
  submitModelWeight: () => void
  submitModelArtifact: () => void
  submitUploadedModel: () => void
  submitPrivateCompile: () => void
  submitPrivateInference: () => void
}>();

const validationTouched = reactive({
  uploadedBundleRoot: false,
  uploadedCompileProfileHash: false,
  privateCompileBundleRoot: false,
  privateCompileCompileProfileHash: false,
});

const validationSubmitted = reactive({
  uploadedModel: false,
  privateCompile: false,
});

function resolveValidationMessage(error: SoracloudParsedField<string>['error'], touched: boolean, submitted: boolean) {
  if (!error || (!touched && !submitted)) return null;
  return t(soracloudValidationMessageKey(error));
}

const uploadedModelBundleRootError = computed(() =>
  resolveValidationMessage(
    props.uploadedModelBundleRootValidation.error,
    validationTouched.uploadedBundleRoot,
    validationSubmitted.uploadedModel
  )
);
const uploadedModelCompileProfileHashError = computed(() =>
  resolveValidationMessage(
    props.uploadedModelCompileProfileHashValidation.error,
    validationTouched.uploadedCompileProfileHash,
    validationSubmitted.uploadedModel
  )
);
const privateCompileBundleRootError = computed(() =>
  resolveValidationMessage(
    props.privateCompileBundleRootValidation.error,
    validationTouched.privateCompileBundleRoot,
    validationSubmitted.privateCompile
  )
);
const privateCompileCompileProfileHashError = computed(() =>
  resolveValidationMessage(
    props.privateCompileCompileProfileHashValidation.error,
    validationTouched.privateCompileCompileProfileHash,
    validationSubmitted.privateCompile
  )
);

function handleSubmitUploadedModel() {
  validationSubmitted.uploadedModel = true;
  if (!props.uploadedModelDraftReady) return;
  props.submitUploadedModel();
}

function handleSubmitPrivateCompile() {
  validationSubmitted.privateCompile = true;
  if (!props.privateCompileDraftReady) return;
  props.submitPrivateCompile();
}
</script>
