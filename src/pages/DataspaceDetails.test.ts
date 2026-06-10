import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DataspaceDetails from './DataspaceDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const routeState = reactive({
  params: {
    laneId: '7',
    dataspaceId: '42',
  },
});

const pushSpy = vi.fn();

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<any>('vue-router');
  return {
    ...actual,
    useRoute: () => routeState,
  };
});

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    push: pushSpy,
  }),
}));

vi.mock('@/shared/api', () => ({
  fetchNexusPublicStatus: vi.fn(),
  fetchSumeragiStatus: vi.fn(),
  getConfiguredToriiBaseUrl: vi.fn(() => 'https://registry.example:8080'),
  normalizeToriiBaseUrl: vi.fn((raw: string, fallback: string | null = null) => {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = new URL(trimmed.replace(/\/v[12]\/explorer$/i, '').replace(/\/+$/, ''));
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    } catch {
      return fallback;
    }
  }),
}));

import * as api from '@/shared/api';

const nexusStatusPayload = {
  blocks: 12,
  txs_approved: 20,
  txs_rejected: 1,
  queue_size: 3,
  teu_dataspace_backlog: [
    {
      lane_id: 7,
      dataspace_id: 42,
      fault_tolerance: 2,
      backlog: 9,
      age_slots: 6,
      virtual_finish: 11,
      tx_served: 88,
      alias: 'lane-seven',
      description: 'Lane seven dataspace',
    },
  ],
};

const sumeragiPayload = {
  leader_index: 0,
  view_change_index: 0,
  highest_qc: { height: 1, view: 1, subject_block_hash: null },
  locked_qc: { height: 1, view: 1, subject_block_hash: null },
  tx_queue: { depth: 0, capacity: 10, saturated: false },
  epoch: { length_blocks: 1, commit_deadline_offset: 1, reveal_deadline_offset: 1 },
  membership: { height: 1, view: 1, epoch: 1, view_hash: null },
  prf: { height: 1, view: 1, epoch_seed: null },
  gossip_fallback_total: 0,
  bg_post_inline_post_total: 0,
  bg_post_inline_broadcast_total: 0,
  block_created_dropped_by_lock_total: 0,
  block_created_hint_mismatch_total: 0,
  block_created_proposal_mismatch_total: 0,
  settlement: {
    dvp: { success_total: 0, failure_total: 0, final_state_totals: {}, failure_reasons: {}, last_event: null },
    pvp: { success_total: 0, failure_total: 0, final_state_totals: {}, failure_reasons: {}, last_event: null },
  },
  pacemaker_backpressure_deferrals_total: 0,
  rbc_retry_attempts_total: 0,
  rbc_retry_abort_total: 0,
  da_reschedule_total: 0,
  rbc_store: { sessions: 0, bytes: 0, pressure_level: 0, backpressure_deferrals_total: 0, evictions_total: 0, recent_evictions: [] },
  view_change_proof_accepted_total: 0,
  view_change_proof_stale_total: 0,
  view_change_proof_rejected_total: 0,
  view_change_suggest_total: 0,
  view_change_install_total: 0,
  vrf_penalty_epoch: 0,
  vrf_committed_no_reveal_total: 0,
  vrf_no_participation_total: 0,
  vrf_late_reveals_total: 0,
  consensus_penalties_applied_total: 0,
  consensus_penalties_pending: 0,
  vrf_penalties_applied_total: 0,
  vrf_penalties_pending: 0,
  lane_governance_sealed_total: 0,
  lane_governance_sealed_aliases: [],
  lane_governance: [
    {
      lane_id: 7,
      alias: 'lane-seven',
      governance: 'managed',
      manifest_required: true,
      manifest_ready: true,
      manifest_path: '/manifests/lane7.json',
      validator_ids: ['validator-a', 'validator-b'],
      quorum: 2,
      protected_namespaces: ['bank', 'gov'],
      runtime_upgrade: null,
      privacy_commitments: [],
    },
  ],
  nexus_fee: {
    charged_total: 0,
    charged_via_payer_total: 0,
    charged_via_sponsor_total: 0,
    sponsor_disabled_total: 0,
    sponsor_cap_exceeded_total: 0,
    config_errors_total: 0,
    transfer_failures_total: 0,
    last_amount: null,
    last_asset_id: null,
    last_payer: null,
    last_payer_id: null,
    last_error: null,
  },
  nexus_staking: { lanes: [] },
  npos_election: null,
};

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot name="header-action" /><slot /></section>',
};

const BaseButtonStub = {
  props: ['nativeType', 'disabled'],
  emits: ['click'],
  template:
    '<button :type="nativeType || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};

const BaseLoadingStub = {
  template: '<div>loading...</div>',
};

const DataFieldStub = {
  props: ['title', 'value'],
  template:
    '<div class="data-field"><span class="data-field__title">{{ title }}</span><span class="data-field__value">{{ value }}</span></div>',
};

describe('Dataspace details page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushSpy.mockReset();
    pushSpy.mockReturnValue(Promise.resolve());
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }

    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: nexusStatusPayload,
    });
    (api.fetchSumeragiStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: sumeragiPayload,
    });
  });

  const factory = () =>
    mount(DataspaceDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseLoading: BaseLoadingStub,
          DataField: DataFieldStub,
        },
      },
    });

  it('renders matched backlog row and matched lane governance fields', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(api.fetchNexusPublicStatus).toHaveBeenCalledTimes(1);
    expect(api.fetchSumeragiStatus).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain('lane-seven (#42)');
    expect(wrapper.get('[data-test="dataspace-details-governance"]').text()).toContain('validator-a, validator-b');
    expect(wrapper.get('[data-test="dataspace-details-governance"]').text()).toContain('/manifests/lane7.json');
  });

  it('adds and removes a saved public node', async () => {
    const wrapper = factory();
    await flushPromises();

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Public node A');
    await inputs[1].setValue('https://public-node-a.example:18080/v1/explorer');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-test="dataspace-details-public-nodes"]').text()).toContain('Public node A');
    expect(wrapper.get('[data-test="dataspace-details-public-nodes"]').text()).toContain(
      'https://public-node-a.example:18080'
    );

    await wrapper.get('[data-test="dataspace-details-remove-node"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="dataspace-details-public-nodes-empty"]').text()).toContain('No public nodes saved');
  });

  it('opens scoped explorer with selected public node', async () => {
    const wrapper = factory();
    await flushPromises();

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Public node B');
    await inputs[1].setValue('https://public-node-b.example:18080');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    await wrapper.get('[data-test="dataspace-details-open-scoped"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/blocks',
      query: {
        torii: 'https://public-node-b.example:18080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
    });
  });
});
