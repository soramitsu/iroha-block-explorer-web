import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import SoracloudPage from './SoracloudPage.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const mocks = vi.hoisted(() => ({
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
}));

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    ...mocks,
  };
});

import * as api from '@/shared/api';

const statusPayload = {
  schema_version: 1,
  service_health: {
    mode: 'embedded_runtime_manager',
    status: 'healthy',
    message: 'embedded runtime manager reports healthy hosted workloads',
    observed_height: 123,
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
      observed_height: 123,
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

const modelHostPayload = {
  schema_version: 1,
  validator_account_id: null,
  active_host_count: 1,
  hosts: [{ host_id: 'host-1', region: 'uae' }],
};

const agentStatusPayload = {
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

const serviceConfigPayload = {
  schema_version: 1,
  service_name: 'custom_service',
  current_version: '1.2.3',
  config_generation: 7,
  config_entry_count: 1,
  configs: [
    {
      config_name: 'ui/theme',
      value_hash: '0xconfig',
      value_json: { palette: 'daybreak' },
      last_update_sequence: 91,
    },
  ],
};

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><header><h2>{{ title }}</h2><slot name="header-action" /></header><slot /></section>',
};

const BaseInnerBlockStub = {
  props: ['title'],
  template: '<section><h3>{{ title }}</h3><slot /></section>',
};

const BaseLoadingStub = {
  template: '<div data-test="loading-stub">loading...</div>',
};

const BaseJsonStub = {
  props: ['value'],
  template: '<pre class="json-stub">{{ JSON.stringify(value) }}</pre>',
};

const DataFieldStub = {
  props: ['title', 'value', 'hash'],
  template: '<div class="data-field-stub"><strong>{{ title }}</strong><span>{{ hash ?? value }}</span></div>',
};

describe('SoracloudPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.resetToriiBaseUrl();

    mocks.fetchSoracloudStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });
    mocks.fetchSoracloudModelHostStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: modelHostPayload,
    });
    mocks.fetchSoracloudAgentStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: agentStatusPayload,
    });
    mocks.fetchSoracloudServiceConfigStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: serviceConfigPayload,
    });
    mocks.fetchSoracloudServiceSecretStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudTrainingJobStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudModelWeightStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudModelArtifactStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudUploadedModelStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudPrivateCompileStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudPrivateInferenceStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudHfSharedLeaseStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudAgentMailboxStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
    mocks.fetchSoracloudAgentAutonomyStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: null });
  });

  afterEach(() => {
    api.resetToriiBaseUrl();
    vi.useRealTimers();
  });

  const factory = () =>
    mount(SoracloudPage, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseLoading: BaseLoadingStub,
          BaseJson: BaseJsonStub,
          DataField: DataFieldStub,
        },
      },
    });

  it('loads the core Soracloud sections on mount and renders sorted services, audit, and suggestions', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(mocks.fetchSoracloudStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudAgentStatus).toHaveBeenCalledTimes(1);

    expect(wrapper.get('[data-test="soracloud-stats"]').text()).toContain('Services');
    expect(wrapper.text()).toContain('portal.sora.org/app');

    const services = wrapper.findAll('[data-test="soracloud-service"]');
    expect(services).toHaveLength(2);
    expect(services[0]?.text()).toContain('agent_api');
    expect(services[1]?.text()).toContain('web_portal');

    const auditEvents = wrapper.findAll('[data-test="soracloud-audit"]');
    expect(auditEvents[0]?.text()).toContain('#9');
    expect(auditEvents[1]?.text()).toContain('#2');

    const serviceOptions = wrapper
      .findAll('#soracloud-service-suggestions option')
      .map((option) => option.attributes('value'));
    expect(serviceOptions).toEqual(['agent_api', 'web_portal']);

    const apartmentOptions = wrapper
      .findAll('#soracloud-apartment-suggestions option')
      .map((option) => option.attributes('value'));
    expect(apartmentOptions).toEqual(['tenant-a', 'tenant-b']);
  });

  it('polls active core sections and refetches when the Torii base changes', async () => {
    vi.useFakeTimers();

    const wrapper = factory();
    await flushPromises();

    expect(mocks.fetchSoracloudStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudAgentStatus).toHaveBeenCalledTimes(1);

    api.setToriiBaseUrl('https://alt-node.example:18080');
    await nextTick();
    await flushPromises();

    const statusCallsAfterBaseChange = mocks.fetchSoracloudStatus.mock.calls.length;
    const modelHostCallsAfterBaseChange = mocks.fetchSoracloudModelHostStatus.mock.calls.length;
    const agentCallsAfterBaseChange = mocks.fetchSoracloudAgentStatus.mock.calls.length;

    expect(statusCallsAfterBaseChange).toBeGreaterThanOrEqual(2);
    expect(modelHostCallsAfterBaseChange).toBeGreaterThanOrEqual(2);
    expect(agentCallsAfterBaseChange).toBeGreaterThanOrEqual(2);

    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();

    expect(mocks.fetchSoracloudStatus).toHaveBeenCalledTimes(statusCallsAfterBaseChange + 1);
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(modelHostCallsAfterBaseChange + 1);
    expect(mocks.fetchSoracloudAgentStatus).toHaveBeenCalledTimes(agentCallsAfterBaseChange + 1);

    wrapper.unmount();
  });

  it('keeps stale overview data visible when a refresh fails', async () => {
    mocks.fetchSoracloudStatus
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: statusPayload,
      })
      .mockResolvedValueOnce({
        status: UNKNOWN_ERROR,
        error: new Error('upstream unavailable'),
      });

    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="soracloud-refresh"]').trigger('click');
    await flushPromises();

    expect(mocks.fetchSoracloudStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('web_portal');
    expect(wrapper.get('[data-test="soracloud-error"]').text()).toContain('upstream unavailable');
  });

  it('keeps parameterized inspector sections idle until submitted and accepts typed values outside suggestions', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(mocks.fetchSoracloudServiceConfigStatus).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="soracloud-query-idle-service-config"]').text()).toContain(
      'Provide the required identifiers'
    );

    await wrapper.get('[data-test="soracloud-service-config-service"]').setValue('custom_service');
    await wrapper.get('[data-test="soracloud-submit-service-config"]').trigger('submit');
    await wrapper.find('[data-test="soracloud-form-service-config"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudServiceConfigStatus).toHaveBeenCalledWith({ service_name: 'custom_service' });
    expect(wrapper.text()).toContain('ui/theme');
    expect(wrapper.text()).toContain('0xconfig');
  });

  it('shows section-level inspector errors without wiping unrelated sections', async () => {
    mocks.fetchSoracloudServiceConfigStatus.mockResolvedValue({
      status: UNKNOWN_ERROR,
      error: new Error('config query denied'),
    });

    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="soracloud-service-config-service"]').setValue('web_portal');
    await wrapper.find('[data-test="soracloud-form-service-config"]').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('config query denied');
    expect(wrapper.text()).toContain('web_portal');
    expect(wrapper.text()).toContain('Active hosts');
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);
  });

  it('shows inline validation errors for structured inputs before issuing filtered requests', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-test="soracloud-model-host-account-id"]').setValue('not a selector');
    await wrapper.find('[data-test="soracloud-form-model-host"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-test="soracloud-model-host-account-id-error"]').text()).toBe(
      i18n.global.t('soracloud.validation.accountId')
    );

    await wrapper.get('[data-test="soracloud-model-host-account-id"]').setValue('alice@wonderland');
    await wrapper.find('[data-test="soracloud-form-model-host"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(2);
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenLastCalledWith({ account_id: 'alice@wonderland' });
  });

  it('blocks uploaded-model inspection until optional hex fields are well-formed', async () => {
    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="soracloud-uploaded-model-bundle-root"]').setValue('0xabc');
    await wrapper.find('[data-test="soracloud-form-uploaded-model"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudUploadedModelStatus).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="soracloud-uploaded-model-bundle-root-error"]').text()).toContain(
      'hexadecimal'
    );

    await wrapper.get('[data-test="soracloud-uploaded-model-service"]').setValue('web_portal');
    await wrapper.get('[data-test="soracloud-uploaded-model-weight-version"]').setValue('v2');
    await wrapper.get('[data-test="soracloud-uploaded-model-model-name"]').setValue('llm-demo');
    await wrapper.get('[data-test="soracloud-uploaded-model-bundle-root"]').setValue('0xabcdef12');
    await wrapper.get('[data-test="soracloud-uploaded-model-compile-profile-hash"]').setValue('0x12345678');
    await wrapper.find('[data-test="soracloud-form-uploaded-model"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudUploadedModelStatus).toHaveBeenCalledWith({
      service_name: 'web_portal',
      weight_version: 'v2',
      model_name: 'llm-demo',
      bundle_root: '0xabcdef12',
      compile_profile_hash: '0x12345678',
    });
  });
});
