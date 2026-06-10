<template>
  <div class="soracloud-page">
    <datalist
      id="soracloud-service-suggestions"
      data-test="soracloud-service-suggestions"
    >
      <option
        v-for="serviceName in dashboard.serviceSuggestions"
        :key="serviceName"
        :value="serviceName"
      />
    </datalist>

    <datalist
      id="soracloud-apartment-suggestions"
      data-test="soracloud-apartment-suggestions"
    >
      <option
        v-for="apartmentName in dashboard.apartmentSuggestions"
        :key="apartmentName"
        :value="apartmentName"
      />
    </datalist>

    <SoracloudOverviewSection
      :torii-base-url="dashboard.toriiBaseUrl"
      :is-refreshing="dashboard.isRefreshing"
      :overview-updated-at="dashboard.overviewUpdatedAt"
      :overview-request="dashboard.overviewRequest"
      :overview="dashboard.overview"
      :overview-cards="dashboard.overviewCards"
      :services="dashboard.services"
      :audit-events="dashboard.auditEvents"
      :refresh-all="dashboard.refreshAll"
    />

    <SoracloudServiceInspectorSection
      v-model:service-config-draft="dashboard.serviceConfigDraft"
      v-model:service-secret-draft="dashboard.serviceSecretDraft"
      :service-suggestions="dashboard.serviceSuggestions"
      :service-config-draft-ready="dashboard.serviceConfigDraftReady"
      :service-secret-draft-ready="dashboard.serviceSecretDraftReady"
      :service-config-request="dashboard.serviceConfigRequest"
      :service-secret-request="dashboard.serviceSecretRequest"
      :submit-service-config="dashboard.submitServiceConfig"
      :submit-service-secret="dashboard.submitServiceSecret"
    />

    <SoracloudModelInspectorSection
      v-model:training-job-draft="dashboard.trainingJobDraft"
      v-model:model-weight-draft="dashboard.modelWeightDraft"
      v-model:model-artifact-draft="dashboard.modelArtifactDraft"
      v-model:uploaded-model-draft="dashboard.uploadedModelDraft"
      v-model:private-compile-draft="dashboard.privateCompileDraft"
      v-model:private-inference-draft="dashboard.privateInferenceDraft"
      :service-suggestions="dashboard.serviceSuggestions"
      :training-job-draft-ready="dashboard.trainingJobDraftReady"
      :model-weight-draft-ready="dashboard.modelWeightDraftReady"
      :model-artifact-draft-ready="dashboard.modelArtifactDraftReady"
      :uploaded-model-draft-ready="dashboard.uploadedModelDraftReady"
      :private-compile-draft-ready="dashboard.privateCompileDraftReady"
      :private-inference-draft-ready="dashboard.privateInferenceDraftReady"
      :training-job-request="dashboard.trainingJobRequest"
      :model-weight-request="dashboard.modelWeightRequest"
      :model-artifact-request="dashboard.modelArtifactRequest"
      :uploaded-model-request="dashboard.uploadedModelRequest"
      :private-compile-request="dashboard.privateCompileRequest"
      :private-inference-request="dashboard.privateInferenceRequest"
      :uploaded-model-bundle-root-validation="dashboard.uploadedModelBundleRootValidation"
      :uploaded-model-compile-profile-hash-validation="dashboard.uploadedModelCompileProfileHashValidation"
      :private-compile-bundle-root-validation="dashboard.privateCompileBundleRootValidation"
      :private-compile-compile-profile-hash-validation="dashboard.privateCompileCompileProfileHashValidation"
      :submit-training-job="dashboard.submitTrainingJob"
      :submit-model-weight="dashboard.submitModelWeight"
      :submit-model-artifact="dashboard.submitModelArtifact"
      :submit-uploaded-model="dashboard.submitUploadedModel"
      :submit-private-compile="dashboard.submitPrivateCompile"
      :submit-private-inference="dashboard.submitPrivateInference"
    />

    <SoracloudHfAgentInspectorSection
      v-model:hf-lease-draft="dashboard.hfLeaseDraft"
      v-model:model-host-draft="dashboard.modelHostDraft"
      v-model:agent-status-draft="dashboard.agentStatusDraft"
      v-model:agent-mailbox-draft="dashboard.agentMailboxDraft"
      v-model:agent-autonomy-draft="dashboard.agentAutonomyDraft"
      :apartment-suggestions="dashboard.apartmentSuggestions"
      :hf-lease-draft-ready="dashboard.hfLeaseDraftReady"
      :model-host-draft-ready="dashboard.modelHostDraftReady"
      :agent-mailbox-draft-ready="dashboard.agentMailboxDraftReady"
      :agent-autonomy-draft-ready="dashboard.agentAutonomyDraftReady"
      :hf-lease-request="dashboard.hfLeaseRequest"
      :model-host-request="dashboard.modelHostRequest"
      :agent-status-request="dashboard.agentStatusRequest"
      :agent-mailbox-request="dashboard.agentMailboxRequest"
      :agent-autonomy-request="dashboard.agentAutonomyRequest"
      :hf-lease-lease-term-validation="dashboard.hfLeaseLeaseTermValidation"
      :hf-lease-account-id-validation="dashboard.hfLeaseAccountIdValidation"
      :model-host-account-id-validation="dashboard.modelHostAccountIdValidation"
      :submit-hf-lease="dashboard.submitHfLease"
      :submit-model-host="dashboard.submitModelHost"
      :submit-agent-status="dashboard.submitAgentStatus"
      :submit-agent-mailbox="dashboard.submitAgentMailbox"
      :submit-agent-autonomy="dashboard.submitAgentAutonomy"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import SoracloudHfAgentInspectorSection from '@/features/soracloud/SoracloudHfAgentInspectorSection.vue';
import SoracloudModelInspectorSection from '@/features/soracloud/SoracloudModelInspectorSection.vue';
import SoracloudOverviewSection from '@/features/soracloud/SoracloudOverviewSection.vue';
import SoracloudServiceInspectorSection from '@/features/soracloud/SoracloudServiceInspectorSection.vue';
import { useSoracloudDashboard } from '@/features/soracloud/useSoracloudDashboard';

defineOptions({
  name: 'SoracloudPage',
});

const dashboard = reactive(useSoracloudDashboard());
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.soracloud-page {
  display: grid;
  gap: size(3);

  &__header-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: size(1.25);
  }

  &__source,
  &__updated,
  &__hint,
  &__empty,
  &__section-error,
  &__inline-error {
    color: theme-color('content-secondary');
    margin: 0 size(2);

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__inline-error,
  &__section-error,
  &__field-error {
    color: theme-color('error');
  }

  &__field-error {
    margin: 0;
    font-size: 0.875rem;
  }

  &__refresh,
  &__submit {
    padding: size(1.25) size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    color: theme-color('content-primary');
    background: theme-color('surface-variant');
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;

    &:hover:not(:disabled) {
      background: theme-color('surface');
      border-color: theme-color('primary');
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  &__section-state {
    display: flex;
    justify-content: center;
    padding: size(4);
  }

  &__stats,
  &__section-grid,
  &__entry-list,
  &__json-stack {
    display: grid;
    gap: size(2);
    margin: size(2) size(2) 0;

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__stats {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  &__section-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  &__stat,
  &__panel,
  &__service-card,
  &__audit-card,
  &__entry-card,
  &__json-card {
    padding: size(2);
    border-radius: size(2);
    background: theme-color('surface');
    border: 1px solid theme-color('border-primary');
  }

  &__panel-title,
  &__service-title,
  &__entry-title {
    color: theme-color('content-primary');
    margin: 0;
  }

  &__detail-grid,
  &__service-grid,
  &__form-grid {
    display: grid;
    gap: size(1.5);
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  &__form-grid {
    margin-bottom: size(1.5);
  }

  &__field {
    display: grid;
    gap: size(0.75);
    color: theme-color('content-secondary');
  }

  &__input {
    width: 100%;
    min-width: 0;
    padding: size(1.1) size(1.25);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface');
    color: theme-color('content-primary');
  }

  &__service-head,
  &__audit-head,
  &__entry-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: size(1);
    margin-bottom: size(1.5);
  }

  &__service-list,
  &__audit-list {
    display: grid;
    gap: size(2);
    margin: 0 size(2);

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__service-field {
    display: grid;
    gap: size(0.5);
  }

  &__json-card {
    display: grid;
    gap: size(1);
  }

  &__status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: size(0.5) size(1);
    border-radius: 999px;
    font-weight: 600;
    text-transform: capitalize;

    &--healthy,
    &--running,
    &--active {
      background: color-mix(in srgb, theme-color('success') 16%, transparent);
      color: theme-color('success');
    }

    &--degraded,
    &--warning {
      background: color-mix(in srgb, theme-color('warning') 16%, transparent);
      color: theme-color('warning');
    }

    &--unavailable,
    &--failed,
    &--expired {
      background: color-mix(in srgb, theme-color('error') 16%, transparent);
      color: theme-color('error');
    }
  }
}
</style>
