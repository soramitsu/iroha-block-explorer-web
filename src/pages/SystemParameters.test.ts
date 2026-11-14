import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { i18n } from '@/shared/lib/localization';
import SystemParameters from './SystemParameters.vue';

const api = vi.hoisted(() => ({ fetchSystemParameters: vi.fn() }));
vi.mock('@/shared/api', () => api);

const snapshot = {
  sumeragi: {
    block_cadence_ms: 1000,
    max_clock_drift_ms: 50,
    key_activation_lead_blocks: 10,
    key_overlap_grace_blocks: 5,
    key_expiry_grace_blocks: 2,
    key_require_hsm: false,
    key_allowed_algorithms: ['ed25519'],
    key_allowed_hsm_providers: [],
  },
  block: { max_transactions: 512 },
  transaction: {
    max_signatures: 16,
    max_instructions: 4096,
    ivm_bytecode_size: 1048576,
    max_tx_bytes: 4194304,
    max_decompressed_bytes: 8388608,
    max_metadata_depth: 64,
    max_time_to_live_ms: 86400000,
    require_height_ttl: true,
    require_sequence: true,
  },
  executor: { fuel: 55000000, memory: 1048576, execution_depth: 3, max_output_items: 4096, max_output_bytes: 8388608 },
  smart_contract: {
    fuel: 55000000,
    memory: 1048576,
    execution_depth: 3,
    max_output_items: 4096,
    max_output_bytes: 8388608,
  },
  custom: { feature_gate: { id: 'feature_gate', payload: { enabled: true } } },
};

describe('SystemParameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchSystemParameters.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: snapshot });
  });

  it('renders every fixed parameter group and the exact custom registry', async () => {
    const wrapper = mount(SystemParameters, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: { props: ['title'], template: '<section><h2>{{ title }}</h2><slot /></section>' },
          BaseJson: { props: ['value'], template: '<pre>{{ JSON.stringify(value) }}</pre>' },
          BaseLoading: { template: '<span>loading</span>' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();

    expect(api.fetchSystemParameters).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-test="system-parameters"]').text()).toContain('sumeragi');
    expect(wrapper.text()).toContain('smart_contract');
    expect(wrapper.text()).toContain('feature_gate');
    expect(wrapper.text()).toContain('enabled');
  });

  it('keeps an upstream failure explicit with user-controlled retry', async () => {
    api.fetchSystemParameters.mockResolvedValue({ status: UNKNOWN_ERROR, error: new Error('offline') });
    const wrapper = mount(SystemParameters, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: { props: ['title'], template: '<section><h2>{{ title }}</h2><slot /></section>' },
          BaseLoading: { template: '<span>loading</span>' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded');
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(api.fetchSystemParameters).toHaveBeenCalledTimes(2);
  });
});
