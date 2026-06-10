import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import type {
  SoracloudAgentAutonomyStatusQuery,
  SoracloudAgentAutonomyStatusResponse,
  SoracloudAgentMailboxStatusQuery,
  SoracloudAgentMailboxStatusResponse,
  SoracloudAgentStatusQuery,
  SoracloudAgentStatusResponse,
  SoracloudHfSharedLeaseStatusQuery,
  SoracloudHfSharedLeaseStatusResponse,
  SoracloudModelArtifactStatusQuery,
  SoracloudModelArtifactStatusResponse,
  SoracloudModelHostStatusQuery,
  SoracloudModelHostStatusResponse,
  SoracloudModelWeightStatusQuery,
  SoracloudModelWeightStatusResponse,
  SoracloudPrivateInferenceStatusQuery,
  SoracloudPrivateInferenceStatusResponse,
  SoracloudServiceConfigStatusQuery,
  SoracloudServiceConfigStatusResponse,
  SoracloudServiceSecretStatusQuery,
  SoracloudServiceSecretStatusResponse,
  SoracloudStatus,
  SoracloudTrainingJobStatusQuery,
  SoracloudTrainingJobStatusResponse,
  SoracloudUploadedModelStatusQuery,
  SoracloudUploadedModelStatusResponse,
} from '@/shared/api/schemas';
import {
  isSoracloudAgentAutonomyQueryReady,
  isSoracloudAgentMailboxQueryReady,
  isSoracloudHfSharedLeaseQueryReady,
  isSoracloudModelArtifactQueryReady,
  isSoracloudModelWeightQueryReady,
  isSoracloudPrivateInferenceQueryReady,
  isSoracloudServiceConfigQueryReady,
  isSoracloudServiceSecretQueryReady,
  isSoracloudTrainingJobQueryReady,
  isSoracloudUploadedModelQueryReady,
  sortSoracloudAuditEvents,
  sortSoracloudServices,
  suggestSoracloudApartmentNames,
  suggestSoracloudServiceNames,
  summarizeSoracloudStatus,
} from '@/shared/lib/soracloud';
import { formatNumber } from '@/shared/ui/utils/formatters';
import { createSoracloudSection } from './useSoracloudSection';
import {
  parseSoracloudAccountId,
  parseSoracloudLeaseTermMs,
  parseSoracloudOptionalHex,
} from './validation';

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function useSoracloudDashboard() {
  const toriiBaseUrl = computed(() => http.getToriiBaseUrl());

  const overviewRequest = createSoracloudSection<Record<string, never>, SoracloudStatus>({
    initialQuery: {},
    immediate: true,
    isReady: () => true,
    load: async () => await http.fetchSoracloudStatus(),
    errorKey: 'soracloud.loadFailed',
    notFoundKey: 'soracloud.notFound',
  });

  const modelHostRequest = createSoracloudSection<SoracloudModelHostStatusQuery, SoracloudModelHostStatusResponse>({
    initialQuery: {},
    immediate: true,
    isReady: () => true,
    load: async (query) => await http.fetchSoracloudModelHostStatus(query),
  });

  const agentStatusRequest = createSoracloudSection<SoracloudAgentStatusQuery, SoracloudAgentStatusResponse>({
    initialQuery: {},
    immediate: true,
    isReady: () => true,
    load: async (query) => await http.fetchSoracloudAgentStatus(query),
  });

  const serviceConfigRequest = createSoracloudSection<SoracloudServiceConfigStatusQuery, SoracloudServiceConfigStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudServiceConfigQueryReady,
    load: async (query) => await http.fetchSoracloudServiceConfigStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const serviceSecretRequest = createSoracloudSection<SoracloudServiceSecretStatusQuery, SoracloudServiceSecretStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudServiceSecretQueryReady,
    load: async (query) => await http.fetchSoracloudServiceSecretStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const trainingJobRequest = createSoracloudSection<SoracloudTrainingJobStatusQuery, SoracloudTrainingJobStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudTrainingJobQueryReady,
    load: async (query) => await http.fetchSoracloudTrainingJobStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const modelWeightRequest = createSoracloudSection<SoracloudModelWeightStatusQuery, SoracloudModelWeightStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudModelWeightQueryReady,
    load: async (query) => await http.fetchSoracloudModelWeightStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const modelArtifactRequest = createSoracloudSection<SoracloudModelArtifactStatusQuery, SoracloudModelArtifactStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudModelArtifactQueryReady,
    load: async (query) => await http.fetchSoracloudModelArtifactStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const uploadedModelRequest = createSoracloudSection<SoracloudUploadedModelStatusQuery, SoracloudUploadedModelStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudUploadedModelQueryReady,
    load: async (query) => await http.fetchSoracloudUploadedModelStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const privateCompileRequest = createSoracloudSection<SoracloudUploadedModelStatusQuery, SoracloudUploadedModelStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudUploadedModelQueryReady,
    load: async (query) => await http.fetchSoracloudPrivateCompileStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const privateInferenceRequest = createSoracloudSection<SoracloudPrivateInferenceStatusQuery, SoracloudPrivateInferenceStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudPrivateInferenceQueryReady,
    load: async (query) => await http.fetchSoracloudPrivateInferenceStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const hfLeaseRequest = createSoracloudSection<SoracloudHfSharedLeaseStatusQuery, SoracloudHfSharedLeaseStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudHfSharedLeaseQueryReady,
    load: async (query) => await http.fetchSoracloudHfSharedLeaseStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const agentMailboxRequest = createSoracloudSection<SoracloudAgentMailboxStatusQuery, SoracloudAgentMailboxStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudAgentMailboxQueryReady,
    load: async (query) => await http.fetchSoracloudAgentMailboxStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const agentAutonomyRequest = createSoracloudSection<SoracloudAgentAutonomyStatusQuery, SoracloudAgentAutonomyStatusResponse>({
    initialQuery: null,
    isReady: isSoracloudAgentAutonomyQueryReady,
    load: async (query) => await http.fetchSoracloudAgentAutonomyStatus(query),
    notFoundKey: 'soracloud.notFound',
  });

  const overviewUpdatedAt = ref<string | null>(null);
  watch(
    () => overviewRequest.data,
    (nextOverview, previousOverview) => {
      if (!nextOverview || nextOverview === previousOverview) return;
      overviewUpdatedAt.value = new Date().toLocaleString();
    }
  );

  const overview = computed(() => overviewRequest.data ?? null);
  const summaryStats = computed(() => (overview.value ? summarizeSoracloudStatus(overview.value) : null));
  const services = computed(() => (overview.value ? sortSoracloudServices(overview.value.control_plane.services) : []));
  const auditEvents = computed(() =>
    overview.value ? sortSoracloudAuditEvents(overview.value.control_plane.recent_audit_events) : []
  );
  const serviceSuggestions = computed(() => suggestSoracloudServiceNames(overview.value));
  const apartmentSuggestions = computed(() => suggestSoracloudApartmentNames(agentStatusRequest.data ?? null));

  const overviewCards = computed(() => {
    if (!summaryStats.value) return [];

    return [
      { key: 'service-count', label: 'soracloud.serviceCount', value: formatNumber(summaryStats.value.serviceCount) },
      { key: 'service-revisions', label: 'soracloud.serviceRevisions', value: formatNumber(summaryStats.value.serviceRevisions) },
      { key: 'audit-events', label: 'soracloud.auditEventCount', value: formatNumber(summaryStats.value.auditEventCount) },
      { key: 'apartments', label: 'soracloud.apartments', value: formatNumber(summaryStats.value.apartments) },
      { key: 'running-apartments', label: 'soracloud.runningApartments', value: formatNumber(summaryStats.value.runningApartments) },
      { key: 'failed-admissions', label: 'soracloud.failedAdmissions', value: formatNumber(summaryStats.value.failedAdmissionsTotal) },
      { key: 'queue-active', label: 'soracloud.queueActive', value: formatNumber(summaryStats.value.queueActive) },
      { key: 'queue-queued', label: 'soracloud.queueQueued', value: formatNumber(summaryStats.value.queueQueued) },
      { key: 'queue-capacity', label: 'soracloud.queueCapacity', value: formatNumber(summaryStats.value.queueCapacity) },
      { key: 'bundle-cache-misses', label: 'soracloud.bundleCacheMisses', value: formatNumber(summaryStats.value.bundleCacheMisses) },
      { key: 'artifact-cache-misses', label: 'soracloud.artifactCacheMisses', value: formatNumber(summaryStats.value.artifactCacheMisses) },
    ];
  });

  const serviceConfigDraft = reactive({
    service_name: '',
    config_name: '',
  });
  const serviceSecretDraft = reactive({
    service_name: '',
    secret_name: '',
  });
  const trainingJobDraft = reactive({
    service_name: '',
    job_id: '',
  });
  const modelWeightDraft = reactive({
    service_name: '',
    model_name: '',
  });
  const modelArtifactDraft = reactive({
    service_name: '',
    model_name: '',
    artifact_id: '',
    training_job_id: '',
    weight_version: '',
  });
  const uploadedModelDraft = reactive({
    service_name: '',
    weight_version: '',
    model_id: '',
    model_name: '',
    bundle_root: '',
    compile_profile_hash: '',
  });
  const privateCompileDraft = reactive({
    service_name: '',
    weight_version: '',
    model_id: '',
    model_name: '',
    bundle_root: '',
    compile_profile_hash: '',
  });
  const privateInferenceDraft = reactive({
    session_id: '',
  });
  const hfLeaseDraft = reactive({
    repo_id: '',
    revision: '',
    storage_class: '',
    lease_term_ms: '',
    account_id: '',
  });
  const modelHostDraft = reactive({
    account_id: '',
  });
  const agentStatusDraft = reactive({
    apartment_name: '',
  });
  const agentMailboxDraft = reactive({
    apartment_name: '',
  });
  const agentAutonomyDraft = reactive({
    apartment_name: '',
  });

  const uploadedModelBundleRootValidation = computed(() => parseSoracloudOptionalHex(uploadedModelDraft.bundle_root));
  const uploadedModelCompileProfileHashValidation = computed(() => parseSoracloudOptionalHex(uploadedModelDraft.compile_profile_hash));
  const privateCompileBundleRootValidation = computed(() => parseSoracloudOptionalHex(privateCompileDraft.bundle_root));
  const privateCompileCompileProfileHashValidation = computed(() => parseSoracloudOptionalHex(privateCompileDraft.compile_profile_hash));
  const hfLeaseLeaseTermValidation = computed(() => parseSoracloudLeaseTermMs(hfLeaseDraft.lease_term_ms));
  const hfLeaseAccountIdValidation = computed(() => parseSoracloudAccountId(hfLeaseDraft.account_id));
  const modelHostAccountIdValidation = computed(() => parseSoracloudAccountId(modelHostDraft.account_id));

  function buildServiceConfigQuery(): SoracloudServiceConfigStatusQuery {
    return {
      service_name: trimOptional(serviceConfigDraft.service_name) ?? '',
      ...(trimOptional(serviceConfigDraft.config_name) ? { config_name: trimOptional(serviceConfigDraft.config_name) } : {}),
    };
  }

  function buildServiceSecretQuery(): SoracloudServiceSecretStatusQuery {
    return {
      service_name: trimOptional(serviceSecretDraft.service_name) ?? '',
      ...(trimOptional(serviceSecretDraft.secret_name) ? { secret_name: trimOptional(serviceSecretDraft.secret_name) } : {}),
    };
  }

  function buildTrainingJobQuery(): SoracloudTrainingJobStatusQuery {
    return {
      service_name: trimOptional(trainingJobDraft.service_name) ?? '',
      job_id: trimOptional(trainingJobDraft.job_id) ?? '',
    };
  }

  function buildModelWeightQuery(): SoracloudModelWeightStatusQuery {
    return {
      service_name: trimOptional(modelWeightDraft.service_name) ?? '',
      model_name: trimOptional(modelWeightDraft.model_name) ?? '',
    };
  }

  function buildModelArtifactQuery(): SoracloudModelArtifactStatusQuery {
    return {
      service_name: trimOptional(modelArtifactDraft.service_name) ?? '',
      ...(trimOptional(modelArtifactDraft.model_name) ? { model_name: trimOptional(modelArtifactDraft.model_name) } : {}),
      ...(trimOptional(modelArtifactDraft.artifact_id) ? { artifact_id: trimOptional(modelArtifactDraft.artifact_id) } : {}),
      ...(trimOptional(modelArtifactDraft.training_job_id) ? { training_job_id: trimOptional(modelArtifactDraft.training_job_id) } : {}),
      ...(trimOptional(modelArtifactDraft.weight_version) ? { weight_version: trimOptional(modelArtifactDraft.weight_version) } : {}),
    };
  }

  function buildUploadedModelQuery(
    draft: typeof uploadedModelDraft | typeof privateCompileDraft,
    bundleRoot: string | undefined,
    compileProfileHash: string | undefined
  ): SoracloudUploadedModelStatusQuery {
    return {
      service_name: trimOptional(draft.service_name) ?? '',
      weight_version: trimOptional(draft.weight_version) ?? '',
      ...(trimOptional(draft.model_id) ? { model_id: trimOptional(draft.model_id) } : {}),
      ...(trimOptional(draft.model_name) ? { model_name: trimOptional(draft.model_name) } : {}),
      ...(bundleRoot ? { bundle_root: bundleRoot } : {}),
      ...(compileProfileHash ? { compile_profile_hash: compileProfileHash } : {}),
    };
  }

  function buildPrivateInferenceQuery(): SoracloudPrivateInferenceStatusQuery {
    return {
      session_id: trimOptional(privateInferenceDraft.session_id) ?? '',
    };
  }

  function buildHfLeaseQuery(): SoracloudHfSharedLeaseStatusQuery {
    return {
      repo_id: trimOptional(hfLeaseDraft.repo_id) ?? '',
      storage_class: trimOptional(hfLeaseDraft.storage_class) ?? '',
      lease_term_ms: hfLeaseLeaseTermValidation.value.value ?? 0,
      ...(trimOptional(hfLeaseDraft.revision) ? { revision: trimOptional(hfLeaseDraft.revision) } : {}),
      ...(hfLeaseAccountIdValidation.value.value ? { account_id: hfLeaseAccountIdValidation.value.value } : {}),
    };
  }

  function buildModelHostQuery(): SoracloudModelHostStatusQuery {
    return {
      ...(modelHostAccountIdValidation.value.value ? { account_id: modelHostAccountIdValidation.value.value } : {}),
    };
  }

  function buildAgentStatusQuery(): SoracloudAgentStatusQuery {
    return {
      ...(trimOptional(agentStatusDraft.apartment_name) ? { apartment_name: trimOptional(agentStatusDraft.apartment_name) } : {}),
    };
  }

  function buildAgentMailboxQuery(): SoracloudAgentMailboxStatusQuery {
    return {
      apartment_name: trimOptional(agentMailboxDraft.apartment_name) ?? '',
    };
  }

  function buildAgentAutonomyQuery(): SoracloudAgentAutonomyStatusQuery {
    return {
      apartment_name: trimOptional(agentAutonomyDraft.apartment_name) ?? '',
    };
  }

  const serviceConfigDraftReady = computed(() => isSoracloudServiceConfigQueryReady(buildServiceConfigQuery()));
  const serviceSecretDraftReady = computed(() => isSoracloudServiceSecretQueryReady(buildServiceSecretQuery()));
  const trainingJobDraftReady = computed(() => isSoracloudTrainingJobQueryReady(buildTrainingJobQuery()));
  const modelWeightDraftReady = computed(() => isSoracloudModelWeightQueryReady(buildModelWeightQuery()));
  const modelArtifactDraftReady = computed(() => isSoracloudModelArtifactQueryReady(buildModelArtifactQuery()));
  const uploadedModelDraftReady = computed(() =>
    isSoracloudUploadedModelQueryReady(
      buildUploadedModelQuery(
        uploadedModelDraft,
        uploadedModelBundleRootValidation.value.value,
        uploadedModelCompileProfileHashValidation.value.value
      )
    ) &&
    !uploadedModelBundleRootValidation.value.error &&
    !uploadedModelCompileProfileHashValidation.value.error
  );
  const privateCompileDraftReady = computed(() =>
    isSoracloudUploadedModelQueryReady(
      buildUploadedModelQuery(
        privateCompileDraft,
        privateCompileBundleRootValidation.value.value,
        privateCompileCompileProfileHashValidation.value.value
      )
    ) &&
    !privateCompileBundleRootValidation.value.error &&
    !privateCompileCompileProfileHashValidation.value.error
  );
  const privateInferenceDraftReady = computed(() => isSoracloudPrivateInferenceQueryReady(buildPrivateInferenceQuery()));
  const hfLeaseDraftReady = computed(() =>
    isSoracloudHfSharedLeaseQueryReady(buildHfLeaseQuery()) &&
    !hfLeaseLeaseTermValidation.value.error &&
    !hfLeaseAccountIdValidation.value.error
  );
  const modelHostDraftReady = computed(() => !modelHostAccountIdValidation.value.error);
  const agentMailboxDraftReady = computed(() => isSoracloudAgentMailboxQueryReady(buildAgentMailboxQuery()));
  const agentAutonomyDraftReady = computed(() => isSoracloudAgentAutonomyQueryReady(buildAgentAutonomyQuery()));

  function submitServiceConfig() {
    serviceConfigRequest.apply(buildServiceConfigQuery());
  }

  function submitServiceSecret() {
    serviceSecretRequest.apply(buildServiceSecretQuery());
  }

  function submitTrainingJob() {
    trainingJobRequest.apply(buildTrainingJobQuery());
  }

  function submitModelWeight() {
    modelWeightRequest.apply(buildModelWeightQuery());
  }

  function submitModelArtifact() {
    modelArtifactRequest.apply(buildModelArtifactQuery());
  }

  function submitUploadedModel() {
    uploadedModelRequest.apply(
      buildUploadedModelQuery(
        uploadedModelDraft,
        uploadedModelBundleRootValidation.value.value,
        uploadedModelCompileProfileHashValidation.value.value
      )
    );
  }

  function submitPrivateCompile() {
    privateCompileRequest.apply(
      buildUploadedModelQuery(
        privateCompileDraft,
        privateCompileBundleRootValidation.value.value,
        privateCompileCompileProfileHashValidation.value.value
      )
    );
  }

  function submitPrivateInference() {
    privateInferenceRequest.apply(buildPrivateInferenceQuery());
  }

  function submitHfLease() {
    hfLeaseRequest.apply(buildHfLeaseQuery());
  }

  function submitModelHost() {
    modelHostRequest.apply(buildModelHostQuery());
  }

  function submitAgentStatus() {
    agentStatusRequest.apply(buildAgentStatusQuery());
  }

  function submitAgentMailbox() {
    agentMailboxRequest.apply(buildAgentMailboxQuery());
  }

  function submitAgentAutonomy() {
    agentAutonomyRequest.apply(buildAgentAutonomyQuery());
  }

  const isRefreshing = computed(() =>
    [
      overviewRequest.isLoading,
      modelHostRequest.isLoading,
      agentStatusRequest.isLoading,
      serviceConfigRequest.isLoading,
      serviceSecretRequest.isLoading,
      trainingJobRequest.isLoading,
      modelWeightRequest.isLoading,
      modelArtifactRequest.isLoading,
      uploadedModelRequest.isLoading,
      privateCompileRequest.isLoading,
      privateInferenceRequest.isLoading,
      hfLeaseRequest.isLoading,
      agentMailboxRequest.isLoading,
      agentAutonomyRequest.isLoading,
    ].some(Boolean)
  );

  function refreshAll() {
    overviewRequest.refetch();
    modelHostRequest.refetch();
    agentStatusRequest.refetch();
    if (serviceConfigRequest.ready) serviceConfigRequest.refetch();
    if (serviceSecretRequest.ready) serviceSecretRequest.refetch();
    if (trainingJobRequest.ready) trainingJobRequest.refetch();
    if (modelWeightRequest.ready) modelWeightRequest.refetch();
    if (modelArtifactRequest.ready) modelArtifactRequest.refetch();
    if (uploadedModelRequest.ready) uploadedModelRequest.refetch();
    if (privateCompileRequest.ready) privateCompileRequest.refetch();
    if (privateInferenceRequest.ready) privateInferenceRequest.refetch();
    if (hfLeaseRequest.ready) hfLeaseRequest.refetch();
    if (agentMailboxRequest.ready) agentMailboxRequest.refetch();
    if (agentAutonomyRequest.ready) agentAutonomyRequest.refetch();
  }

  return {
    toriiBaseUrl,
    isRefreshing,
    refreshAll,
    overviewUpdatedAt,
    overviewRequest,
    overview,
    services,
    auditEvents,
    overviewCards,
    serviceSuggestions,
    apartmentSuggestions,
    serviceConfigDraft,
    serviceSecretDraft,
    trainingJobDraft,
    modelWeightDraft,
    modelArtifactDraft,
    uploadedModelDraft,
    privateCompileDraft,
    privateInferenceDraft,
    hfLeaseDraft,
    modelHostDraft,
    agentStatusDraft,
    agentMailboxDraft,
    agentAutonomyDraft,
    serviceConfigRequest,
    serviceSecretRequest,
    trainingJobRequest,
    modelWeightRequest,
    modelArtifactRequest,
    uploadedModelRequest,
    privateCompileRequest,
    privateInferenceRequest,
    hfLeaseRequest,
    modelHostRequest,
    agentStatusRequest,
    agentMailboxRequest,
    agentAutonomyRequest,
    serviceConfigDraftReady,
    serviceSecretDraftReady,
    trainingJobDraftReady,
    modelWeightDraftReady,
    modelArtifactDraftReady,
    uploadedModelDraftReady,
    privateCompileDraftReady,
    privateInferenceDraftReady,
    hfLeaseDraftReady,
    modelHostDraftReady,
    agentMailboxDraftReady,
    agentAutonomyDraftReady,
    uploadedModelBundleRootValidation,
    uploadedModelCompileProfileHashValidation,
    privateCompileBundleRootValidation,
    privateCompileCompileProfileHashValidation,
    hfLeaseLeaseTermValidation,
    hfLeaseAccountIdValidation,
    modelHostAccountIdValidation,
    submitServiceConfig,
    submitServiceSecret,
    submitTrainingJob,
    submitModelWeight,
    submitModelArtifact,
    submitUploadedModel,
    submitPrivateCompile,
    submitPrivateInference,
    submitHfLease,
    submitModelHost,
    submitAgentStatus,
    submitAgentMailbox,
    submitAgentAutonomy,
  };
}
