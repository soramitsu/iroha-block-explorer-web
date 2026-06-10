import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import type { SoracloudAgentStatusResponse, SoracloudStatus } from '@/shared/api/schemas';
import { useSoracloudDashboard } from './useSoracloudDashboard';

const mocks = vi.hoisted(() => ({
  toriiBaseUrl: null as any,
  sections: [] as Array<{
    options: { initialQuery: unknown, isReady: (query: unknown) => boolean }
    section: {
      activeQuery: unknown
      error: string | null
      ready: boolean
      isLoading: boolean
      data: unknown
      refetch: ReturnType<typeof vi.fn>
      apply: ReturnType<typeof vi.fn>
    }
  }>,
}));

vi.mock('@/shared/api', async () => {
  const { ref } = await import('vue');
  mocks.toriiBaseUrl = ref('https://torii-a.test');

  return {
    getToriiBaseUrl: () => mocks.toriiBaseUrl.value,
    fetchSoracloudStatus: vi.fn(),
    fetchSoracloudModelHostStatus: vi.fn(),
    fetchSoracloudAgentStatus: vi.fn(),
    fetchSoracloudServiceConfigStatus: vi.fn(),
    fetchSoracloudServiceSecretStatus: vi.fn(),
    fetchSoracloudTrainingJobStatus: vi.fn(),
    fetchSoracloudModelWeightStatus: vi.fn(),
    fetchSoracloudModelArtifactStatus: vi.fn(),
    fetchSoracloudUploadedModelStatus: vi.fn(),
    fetchSoracloudPrivateCompileStatus: vi.fn(),
    fetchSoracloudPrivateInferenceStatus: vi.fn(),
    fetchSoracloudHfSharedLeaseStatus: vi.fn(),
    fetchSoracloudAgentMailboxStatus: vi.fn(),
    fetchSoracloudAgentAutonomyStatus: vi.fn(),
  };
});

vi.mock('./useSoracloudSection', async () => {
  const { reactive } = await import('vue');

  return {
    createSoracloudSection: vi.fn((options: { initialQuery: unknown, isReady: (query: unknown) => boolean }) => {
      const section = reactive({
        activeQuery: options.initialQuery,
        error: null as string | null,
        ready: options.initialQuery !== null && options.isReady(options.initialQuery),
        isLoading: false,
        data: undefined as unknown,
        refetch: vi.fn(),
        apply: vi.fn((query: unknown) => {
          section.activeQuery = query;
          section.ready = options.isReady(query);
          return section.ready;
        }),
      });

      mocks.sections.push({ options, section });
      return section;
    }),
  };
});

const sampleStatus = {
  service_health: {
    status: 'healthy',
    service_revisions: 4,
    apartments: 2,
    running_apartments: 1,
  },
  failed_admissions: {
    total: 11,
  },
  resource_pressure: {
    queue_active: 2,
    queue_queued: 5,
    queue_capacity: 32,
    runtime: {
      reported_pending_mailbox_messages: 7,
      authoritative_pending_mailbox_messages: 9,
      bundle_cache_misses: 1,
      artifact_cache_misses: 3,
    },
  },
  control_plane: {
    service_count: 2,
    audit_event_count: 6,
    services: [
      {
        service_name: 'web_portal',
        current_version: '2.0.0',
      },
      {
        service_name: 'agent_api',
        current_version: '1.0.0',
      },
    ],
    recent_audit_events: [
      { sequence: 2, action: 'Deploy' },
      { sequence: 9, action: { variant: 'Upgrade' } },
    ],
  },
} as unknown as SoracloudStatus;

const sampleAgentStatus = {
  apartments: [
    { apartment_name: 'tenant-b' },
    { apartment_name: 'tenant-a' },
  ],
} as unknown as SoracloudAgentStatusResponse;

describe('useSoracloudDashboard', () => {
  beforeEach(() => {
    mocks.sections.length = 0;
    if (mocks.toriiBaseUrl) mocks.toriiBaseUrl.value = 'https://torii-a.test';
  });

  it('builds trimmed queries and readiness state for inspector drafts', async () => {
    const scope = effectScope();
    let dashboard!: ReturnType<typeof useSoracloudDashboard>;
    scope.run(() => {
      dashboard = useSoracloudDashboard();
    });

    const [
      ,
      ,
      ,
      serviceConfigRequest,
      ,
      ,
      ,
      ,
      uploadedModelRequest,
      ,
      ,
      hfLeaseRequest,
    ] = mocks.sections.map((entry) => entry.section);

    dashboard.serviceConfigDraft.service_name = ' web_portal ';
    dashboard.serviceConfigDraft.config_name = '   ';
    expect(dashboard.serviceConfigDraftReady.value).toBe(true);
    dashboard.submitServiceConfig();
    expect(serviceConfigRequest?.apply).toHaveBeenCalledWith({ service_name: 'web_portal' });

    dashboard.uploadedModelDraft.service_name = ' model_api ';
    dashboard.uploadedModelDraft.weight_version = ' v7 ';
    dashboard.uploadedModelDraft.model_name = ' llama-3 ';
    dashboard.uploadedModelDraft.bundle_root = '0xdeadbeef';
    dashboard.uploadedModelDraft.compile_profile_hash = 'cafe';
    expect(dashboard.uploadedModelDraftReady.value).toBe(true);
    dashboard.submitUploadedModel();
    expect(uploadedModelRequest?.apply).toHaveBeenCalledWith({
      service_name: 'model_api',
      weight_version: 'v7',
      model_name: 'llama-3',
      bundle_root: '0xdeadbeef',
      compile_profile_hash: 'cafe',
    });

    dashboard.hfLeaseDraft.repo_id = ' sora/models ';
    dashboard.hfLeaseDraft.storage_class = ' hot ';
    dashboard.hfLeaseDraft.lease_term_ms = '60000';
    dashboard.hfLeaseDraft.account_id = ' alice@wonderland ';
    expect(dashboard.hfLeaseDraftReady.value).toBe(true);
    dashboard.submitHfLease();
    expect(hfLeaseRequest?.apply).toHaveBeenCalledWith({
      repo_id: 'sora/models',
      storage_class: 'hot',
      lease_term_ms: 60000,
      account_id: 'alice@wonderland',
    });

    dashboard.privateCompileDraft.service_name = ' model_api ';
    dashboard.privateCompileDraft.weight_version = ' v7 ';
    dashboard.privateCompileDraft.model_id = ' model-42 ';
    dashboard.privateCompileDraft.bundle_root = '0xabc';
    expect(dashboard.privateCompileDraftReady.value).toBe(false);

    scope.stop();
    await nextTick();
  });

  it('aggregates overview cards and sorted suggestions from section data', async () => {
    const scope = effectScope();
    let dashboard!: ReturnType<typeof useSoracloudDashboard>;
    scope.run(() => {
      dashboard = useSoracloudDashboard();
    });

    const overviewRequest = mocks.sections[0]?.section;
    const agentStatusRequest = mocks.sections[2]?.section;
    expect(overviewRequest).toBeTruthy();
    expect(agentStatusRequest).toBeTruthy();

    overviewRequest!.data = sampleStatus;
    agentStatusRequest!.data = sampleAgentStatus;
    await nextTick();

    expect(dashboard.overview.value).toStrictEqual(sampleStatus);
    expect(dashboard.overviewUpdatedAt.value).toEqual(expect.any(String));
    expect(dashboard.services.value.map((service) => service.service_name)).toEqual(['agent_api', 'web_portal']);
    expect(dashboard.auditEvents.value.map((event) => event.sequence)).toEqual([9, 2]);
    expect(dashboard.serviceSuggestions.value).toEqual(['agent_api', 'web_portal']);
    expect(dashboard.apartmentSuggestions.value).toEqual(['tenant-a', 'tenant-b']);
    expect(dashboard.overviewCards.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'service-count', value: '2' }),
        expect.objectContaining({ key: 'bundle-cache-misses', value: '1' }),
      ])
    );

    mocks.toriiBaseUrl.value = 'https://torii-b.test';
    await nextTick();
    expect(dashboard.toriiBaseUrl.value).toBe('https://torii-b.test');

    scope.stop();
  });

  it('refreshes always-on sections and only refetches optional sections when ready', () => {
    const scope = effectScope();
    let dashboard!: ReturnType<typeof useSoracloudDashboard>;
    scope.run(() => {
      dashboard = useSoracloudDashboard();
    });

    const [
      overviewRequest,
      modelHostRequest,
      agentStatusRequest,
      serviceConfigRequest,
      serviceSecretRequest,
      trainingJobRequest,
      modelWeightRequest,
      modelArtifactRequest,
      uploadedModelRequest,
      privateCompileRequest,
      privateInferenceRequest,
      hfLeaseRequest,
      agentMailboxRequest,
      agentAutonomyRequest,
    ] = mocks.sections.map((entry) => entry.section);

    serviceConfigRequest!.ready = true;
    serviceSecretRequest!.ready = false;
    trainingJobRequest!.ready = true;
    modelWeightRequest!.ready = false;
    modelArtifactRequest!.ready = true;
    uploadedModelRequest!.ready = false;
    privateCompileRequest!.ready = true;
    privateInferenceRequest!.ready = false;
    hfLeaseRequest!.ready = true;
    agentMailboxRequest!.ready = false;
    agentAutonomyRequest!.ready = true;

    dashboard.refreshAll();

    expect(overviewRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(modelHostRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(agentStatusRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(serviceConfigRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(serviceSecretRequest!.refetch).not.toHaveBeenCalled();
    expect(trainingJobRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(modelWeightRequest!.refetch).not.toHaveBeenCalled();
    expect(modelArtifactRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(uploadedModelRequest!.refetch).not.toHaveBeenCalled();
    expect(privateCompileRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(privateInferenceRequest!.refetch).not.toHaveBeenCalled();
    expect(hfLeaseRequest!.refetch).toHaveBeenCalledTimes(1);
    expect(agentMailboxRequest!.refetch).not.toHaveBeenCalled();
    expect(agentAutonomyRequest!.refetch).toHaveBeenCalledTimes(1);

    expect(dashboard.isRefreshing.value).toBe(false);
    serviceSecretRequest!.isLoading = true;
    expect(dashboard.isRefreshing.value).toBe(true);

    scope.stop();
  });
});
