import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

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

const BasePageLayoutStub = defineComponent({
  name: 'BasePageLayoutStub',
  template: '<div data-test="layout-stub"><slot /></div>',
});

const NotificationsStub = defineComponent({
  name: 'NotificationsStub',
  template: '<div data-test="notifications-stub" />',
});

const HeaderStub = defineComponent({
  name: 'HeaderStub',
  template: '<header data-test="header-stub">Header</header>',
});

vi.mock('@/widgets/header', () => ({ TheHeader: HeaderStub }));
vi.mock('@/shared/ui/components/BasePageLayout.vue', () => ({ default: BasePageLayoutStub }));
vi.mock('@/shared/ui/components/NotificationsInstance.vue', () => ({ default: NotificationsStub }));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlockStub',
  props: {
    title: { type: String, required: false },
  },
  template: '<section data-test="content-block"><header><h2>{{ title }}</h2><slot name="header-action" /></header><slot /></section>',
});

const BaseInnerBlockStub = defineComponent({
  name: 'BaseInnerBlockStub',
  props: {
    title: { type: String, required: false },
  },
  template: '<section data-test="inner-block"><h3>{{ title }}</h3><slot /></section>',
});

const BaseLoadingStub = defineComponent({
  name: 'BaseLoadingStub',
  template: '<div data-test="loading-stub">loading...</div>',
});

const BaseJsonStub = defineComponent({
  name: 'BaseJsonStub',
  props: {
    value: { type: Object, required: true },
  },
  template: '<pre data-test="json-stub">{{ JSON.stringify(value) }}</pre>',
});

const DataFieldStub = defineComponent({
  name: 'DataFieldStub',
  props: {
    title: { type: String, required: true },
    value: { type: [String, Number, Object], required: false, default: null },
    hash: { type: String, required: false, default: '' },
  },
  template: '<div data-test="data-field"><strong>{{ title }}</strong><span>{{ hash || value }}</span></div>',
});

const statusPayload = {
  schema_version: 1,
  service_health: {
    mode: 'embedded_runtime_manager',
    status: 'healthy',
    message: 'runtime healthy',
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
    service_count: 1,
    audit_event_count: 2,
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
    ],
    recent_audit_events: [
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
  hosts: [{ host_id: 'host-1' }],
};

const agentStatusPayload = {
  schema_version: 1,
  apartment_count: 1,
  event_count: 1,
  apartments: [
    {
      apartment_name: 'tenant-a',
      manifest_hash: '0xmanifest',
      status: 'Running',
      lease_started_sequence: 1,
      lease_expires_sequence: 2,
      lease_remaining_ticks: 1,
      restart_count: 0,
      state_quota_bytes: 1,
      tool_capability_count: 1,
      policy_capability_count: 1,
      revoked_policy_capability_count: 0,
      pending_wallet_request_count: 0,
      pending_mailbox_message_count: 0,
      autonomy_budget_ceiling_units: 10,
      autonomy_budget_remaining_units: 9,
      artifact_allowlist_count: 0,
      autonomy_run_count: 0,
      process_generation: 1,
      process_started_sequence: 1,
      last_active_sequence: 1,
      last_checkpoint_sequence: null,
      checkpoint_count: 0,
      persistent_state_total_bytes: 0,
      persistent_state_key_count: 0,
      spend_limit_count: 0,
      upgrade_policy: { kind: 'managed' },
      last_restart_sequence: null,
      last_restart_reason: null,
    },
  ],
};

const serviceConfigPayload = {
  schema_version: 1,
  service_name: 'web_portal',
  current_version: '2.0.0',
  config_generation: 3,
  config_entry_count: 1,
  configs: [
    {
      config_name: 'ui/theme',
      value_hash: '0xconfig',
      value_json: { palette: 'daybreak' },
      last_update_sequence: 90,
    },
  ],
};

async function mountAppAt(path: string) {
  const [{ routes }, { default: App }] = await Promise.all([import('@/app/router'), import('@/app/App.vue')]);

  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });

  const wrapper = mount(App, {
    global: {
      plugins: [router, i18n],
      stubs: {
        BaseContentBlock: BaseContentBlockStub,
        BaseInnerBlock: BaseInnerBlockStub,
        BaseLoading: BaseLoadingStub,
        BaseJson: BaseJsonStub,
        DataField: DataFieldStub,
      },
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('Soracloud data smoke', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    api.resetToriiBaseUrl();
    vi.clearAllMocks();

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
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
    api.resetToriiBaseUrl();
  });

  it('renders aggregate Soracloud data and a parameterized service inspector query through the routed app shell', async () => {
    const { wrapper } = await mountAppAt('/soracloud');
    mountedWrappers.push(wrapper);

    expect(wrapper.text()).toContain('SoraCloud control plane');
    expect(wrapper.text()).toContain('web_portal');
    expect(wrapper.text()).toContain('portal.sora.org/app');
    expect(mocks.fetchSoracloudStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudModelHostStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSoracloudAgentStatus).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-test="soracloud-service-config-service"]').setValue('web_portal');
    await wrapper.find('[data-test="soracloud-form-service-config"]').trigger('submit');
    await flushPromises();

    expect(mocks.fetchSoracloudServiceConfigStatus).toHaveBeenCalledWith({ service_name: 'web_portal' });
    expect(wrapper.text()).toContain('ui/theme');
    expect(wrapper.text()).toContain('0xconfig');
  }, 20000);
});
