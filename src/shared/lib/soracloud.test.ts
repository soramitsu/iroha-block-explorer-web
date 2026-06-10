import { describe, expect, it } from 'vitest';
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
  soracloudActionLabel,
  soracloudInlineErrorMessage,
  soracloudResultErrorMessage,
  soracloudServiceRouteLabel,
  sortSoracloudAuditEvents,
  sortSoracloudServices,
  suggestSoracloudApartmentNames,
  suggestSoracloudServiceNames,
  summarizeSoracloudStatus,
} from './soracloud';
import type { SoracloudAgentStatusResponse, SoracloudStatus } from '@/shared/api/schemas';
import { NOT_FOUND, UNKNOWN_ERROR } from '@/shared/api/consts';

const sampleStatus: SoracloudStatus = {
  schema_version: 1,
  service_health: {
    mode: 'embedded_runtime_manager',
    status: 'healthy',
    message: 'ok',
    observed_height: 321,
    observed_block_hash: '0xblock',
    state_dir: '/tmp/soracloud/runtime',
    service_revisions: 4,
    healthy_service_revisions: 3,
    hydrating_service_revisions: 1,
    degraded_service_revisions: 0,
    unavailable_service_revisions: 0,
    apartments: 2,
    running_apartments: 1,
    expired_apartments: 1,
  },
  routing: {
    nexus_enabled: true,
    lane_count: 4,
    dataspace_count: 8,
    routing_rules: 12,
    default_lane_id: 0,
    default_dataspace_id: 0,
  },
  resource_pressure: {
    queue_active: 2,
    queue_queued: 5,
    queue_capacity: 32,
    queue_saturated: false,
    high_load_threshold: 16,
    high_load: false,
    runtime: {
      enabled: true,
      state_dir: '/tmp/soracloud/runtime',
      observed_height: 321,
      service_revisions: 4,
      apartments: 2,
      max_load_factor_bps: 9150,
      reported_pending_mailbox_messages: 7,
      authoritative_pending_mailbox_messages: 9,
      bundle_cache_misses: 1,
      artifact_cache_misses: 3,
    },
  },
  failed_admissions: {
    available: true,
    total: 11,
    governance_manifest_rejected: 4,
    sorafs_provider_rejected: 7,
  },
  runtime_manager: {
    available: true,
    state_dir: '/tmp/soracloud/runtime',
    snapshot: {},
  },
  control_plane: {
    schema_version: 1,
    service_count: 2,
    audit_event_count: 6,
    services: [
      {
        service_name: 'web_portal',
        current_version: '2.0.0',
        revision_count: 2,
        config_generation: 3,
        secret_generation: 1,
        config_entry_count: 5,
        secret_entry_count: 2,
        latest_revision: {
          sequence: 4,
          action: 'Rollout',
          service_version: '2.0.0',
          replicas: 3,
          route_host: 'portal.sora.org',
          route_path_prefix: '/app',
          state_binding_count: 1,
          signed_by: 'alice@sora',
        },
        active_rollout: { status: 'running' },
        last_rollout: null,
      },
      {
        service_name: 'agent_api',
        current_version: '1.0.0',
        revision_count: 1,
        config_generation: 0,
        secret_generation: 0,
        config_entry_count: 1,
        secret_entry_count: 0,
        latest_revision: {
          sequence: 3,
          action: { kind: 'Deploy' },
          service_version: '1.0.0',
          replicas: 1,
          route_host: null,
          route_path_prefix: '/agent',
          state_binding_count: 0,
          signed_by: null,
        },
        active_rollout: null,
        last_rollout: null,
      },
    ],
    recent_audit_events: [
      {
        sequence: 2,
        action: 'Deploy',
        service_name: 'agent_api',
        from_version: null,
        to_version: '1.0.0',
        governance_tx_hash: null,
      },
      {
        sequence: 9,
        action: { variant: 'Upgrade' },
        service_name: 'web_portal',
        from_version: '1.9.0',
        to_version: '2.0.0',
        governance_tx_hash: '0xabc',
      },
    ],
  },
};

const sampleAgentStatus: SoracloudAgentStatusResponse = {
  schema_version: 1,
  apartment_count: 2,
  event_count: 4,
  apartments: [
    {
      apartment_name: 'tenant-b',
      manifest_hash: '0xbbb',
      status: 'Running',
      lease_started_sequence: 3,
      lease_expires_sequence: 30,
      lease_remaining_ticks: 27,
      restart_count: 0,
      state_quota_bytes: 1024,
      tool_capability_count: 1,
      policy_capability_count: 1,
      revoked_policy_capability_count: 0,
      pending_wallet_request_count: 0,
      pending_mailbox_message_count: 1,
      autonomy_budget_ceiling_units: 20,
      autonomy_budget_remaining_units: 18,
      artifact_allowlist_count: 1,
      autonomy_run_count: 2,
      process_generation: 1,
      process_started_sequence: 4,
      last_active_sequence: 5,
      last_checkpoint_sequence: null,
      checkpoint_count: 1,
      persistent_state_total_bytes: 64,
      persistent_state_key_count: 1,
      spend_limit_count: 1,
      upgrade_policy: { kind: 'manual' },
      last_restart_sequence: null,
      last_restart_reason: null,
    },
    {
      apartment_name: 'tenant-a',
      manifest_hash: '0xaaa',
      status: 'Running',
      lease_started_sequence: 1,
      lease_expires_sequence: 20,
      lease_remaining_ticks: 19,
      restart_count: 1,
      state_quota_bytes: 512,
      tool_capability_count: 2,
      policy_capability_count: 3,
      revoked_policy_capability_count: 1,
      pending_wallet_request_count: 1,
      pending_mailbox_message_count: 2,
      autonomy_budget_ceiling_units: 10,
      autonomy_budget_remaining_units: 5,
      artifact_allowlist_count: 2,
      autonomy_run_count: 3,
      process_generation: 2,
      process_started_sequence: 2,
      last_active_sequence: 6,
      last_checkpoint_sequence: 4,
      checkpoint_count: 2,
      persistent_state_total_bytes: 32,
      persistent_state_key_count: 2,
      spend_limit_count: 1,
      upgrade_policy: { kind: 'managed' },
      last_restart_sequence: 5,
      last_restart_reason: 'operator',
    },
  ],
};

describe('soracloud helpers', () => {
  it('summarizes top-level soracloud counters', () => {
    expect(summarizeSoracloudStatus(sampleStatus)).toEqual({
      runtimeStatus: 'healthy',
      serviceCount: 2,
      serviceRevisions: 4,
      auditEventCount: 6,
      apartments: 2,
      runningApartments: 1,
      failedAdmissionsTotal: 11,
      queueActive: 2,
      queueQueued: 5,
      queueCapacity: 32,
      reportedPendingMailboxMessages: 7,
      authoritativePendingMailboxMessages: 9,
      bundleCacheMisses: 1,
      artifactCacheMisses: 3,
    });
  });

  it('sorts services by service name and version', () => {
    const sorted = sortSoracloudServices(sampleStatus.control_plane.services);
    expect(sorted.map((service) => service.service_name)).toEqual(['agent_api', 'web_portal']);
  });

  it('sorts audit events in descending sequence order', () => {
    const sorted = sortSoracloudAuditEvents(sampleStatus.control_plane.recent_audit_events);
    expect(sorted.map((event) => event.sequence)).toEqual([9, 2]);
  });

  it('derives readable action labels from different wire shapes', () => {
    expect(soracloudActionLabel('Deploy')).toBe('Deploy');
    expect(soracloudActionLabel({ kind: 'Upgrade' })).toBe('Upgrade');
    expect(soracloudActionLabel({ variant: 'Rollback' })).toBe('Rollback');
    expect(soracloudActionLabel({ action_name: 'Rollout' })).toBe('Rollout');
    expect(soracloudActionLabel({ Deploy: {} })).toBe('Deploy');
    expect(soracloudActionLabel(null)).toBe('Unknown');
  });

  it('formats service routes from host/path combinations', () => {
    const [agentApi, webPortal] = sortSoracloudServices(sampleStatus.control_plane.services);
    expect(soracloudServiceRouteLabel(webPortal!)).toBe('portal.sora.org/app');
    expect(soracloudServiceRouteLabel(agentApi!)).toBe('/agent');
    expect(
      soracloudServiceRouteLabel({
        ...agentApi!,
        latest_revision: null,
      })
    ).toBe('—');
  });

  it('derives sorted service and apartment suggestions from loaded status data', () => {
    expect(suggestSoracloudServiceNames(sampleStatus)).toEqual(['agent_api', 'web_portal']);
    expect(suggestSoracloudApartmentNames(sampleAgentStatus)).toEqual(['tenant-a', 'tenant-b']);
  });

  it('validates Soracloud inspector query readiness rules', () => {
    expect(isSoracloudServiceConfigQueryReady({ service_name: 'web_portal' })).toBe(true);
    expect(isSoracloudServiceSecretQueryReady({ service_name: 'web_portal' })).toBe(true);
    expect(isSoracloudTrainingJobQueryReady({ service_name: 'trainer', job_id: 'job-1' })).toBe(true);
    expect(isSoracloudModelWeightQueryReady({ service_name: 'trainer', model_name: 'llm-demo' })).toBe(true);
    expect(isSoracloudModelArtifactQueryReady({ service_name: 'trainer', training_job_id: 'job-1' })).toBe(true);
    expect(isSoracloudUploadedModelQueryReady({ service_name: 'trainer', weight_version: 'v1', model_id: 'model-1' })).toBe(
      true
    );
    expect(isSoracloudPrivateInferenceQueryReady({ session_id: 'session-1' })).toBe(true);
    expect(isSoracloudHfSharedLeaseQueryReady({ repo_id: 'org/model', storage_class: 'hot', lease_term_ms: 60_000 })).toBe(
      true
    );
    expect(isSoracloudAgentMailboxQueryReady({ apartment_name: 'tenant-a' })).toBe(true);
    expect(isSoracloudAgentAutonomyQueryReady({ apartment_name: 'tenant-a' })).toBe(true);
  });

  it('rejects incomplete Soracloud inspector queries', () => {
    expect(isSoracloudServiceConfigQueryReady({ service_name: '   ' })).toBe(false);
    expect(isSoracloudTrainingJobQueryReady({ service_name: 'trainer', job_id: ' ' })).toBe(false);
    expect(isSoracloudModelArtifactQueryReady({ service_name: 'trainer' })).toBe(false);
    expect(isSoracloudUploadedModelQueryReady({ service_name: 'trainer', weight_version: 'v1' })).toBe(false);
    expect(isSoracloudPrivateInferenceQueryReady({ session_id: '' })).toBe(false);
    expect(isSoracloudHfSharedLeaseQueryReady({ repo_id: 'org/model', storage_class: 'hot', lease_term_ms: 0 })).toBe(
      false
    );
    expect(isSoracloudAgentMailboxQueryReady({ apartment_name: '' })).toBe(false);
    expect(isSoracloudAgentAutonomyQueryReady({ apartment_name: '   ' })).toBe(false);
  });

  it('normalizes Soracloud inline error messages for generic and not-found failures', () => {
    expect(soracloudInlineErrorMessage(new Error('upstream unavailable'), 'fallback')).toBe('upstream unavailable');
    expect(soracloudInlineErrorMessage('literal failure', 'fallback')).toBe('literal failure');
    expect(soracloudInlineErrorMessage(null, 'fallback')).toBe('fallback');

    expect(
      soracloudResultErrorMessage(
        { status: UNKNOWN_ERROR, error: new Error('permission denied') },
        'fallback',
        'not found fallback'
      )
    ).toBe('permission denied');
    expect(soracloudResultErrorMessage({ status: NOT_FOUND }, 'fallback', 'not found fallback')).toBe('not found fallback');
  });
});
