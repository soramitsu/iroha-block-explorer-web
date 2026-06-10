import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import NodesTelemetry from './NodesTelemetry.vue';
import { i18n } from '@/shared/lib/localization';
import type { PeerInfo, PeerStatus } from '@/shared/api/schemas';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

const routerReplaceMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const routeState = vi.hoisted((): { query: Record<string, unknown> } => ({ query: {} }));
const clipboardCopyMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    replace: routerReplaceMock,
  }),
}));

vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({
    isSupported: true,
    copy: clipboardCopyMock,
  }),
}));

const sumeragiStatus = {
  leader_index: 1,
  view_change_index: 3,
  highest_qc: { height: 10, view: 2, subject_block_hash: '0xaaa' },
  locked_qc: { height: 9, view: 1, subject_block_hash: '0xbbb' },
  tx_queue: { depth: 1, capacity: 5, saturated: false },
  epoch: { length_blocks: 0, commit_deadline_offset: 0, reveal_deadline_offset: 0 },
  membership: { height: 10, view: 2, epoch: 0, view_hash: 'viewhash001' },
  prf: { height: 10, view: 2, epoch_seed: 'deadbeef' },
  gossip_fallback_total: 2,
  bg_post_inline_post_total: 4,
  bg_post_inline_broadcast_total: 6,
  block_created_dropped_by_lock_total: 0,
  block_created_hint_mismatch_total: 0,
  block_created_proposal_mismatch_total: 0,
  settlement: {
    dvp: {
      success_total: 1,
      failure_total: 0,
      final_state_totals: { both: 1 },
      failure_reasons: {},
      last_event: {
        observed_at_ms: 10,
        settlement_id: 'dvp-1',
        plan: { order: 'process_delivery_first', atomicity: 'commit_first_leg' },
        outcome: 'Success',
        failure_reason: null,
        final_state: 'delivery_and_payment',
        legs: { delivery_committed: true, payment_committed: false },
      },
    },
    pvp: {
      success_total: 0,
      failure_total: 1,
      final_state_totals: { none: 1 },
      failure_reasons: { timeout: 1 },
      last_event: {
        observed_at_ms: 11,
        settlement_id: 'pvp-1',
        plan: { order: 'process_payment_first', atomicity: 'commit_second_leg' },
        outcome: 'Failure',
        failure_reason: 'timeout',
        final_state: 'none',
        legs: { primary_committed: false, counter_committed: false },
        fx_window_ms: 500,
      },
    },
  },
  pacemaker_backpressure_deferrals_total: 1,
  rbc_retry_attempts_total: 2,
  rbc_retry_abort_total: 1,
  da_reschedule_total: 0,
  rbc_store: {
    sessions: 3,
    bytes: 2048,
    pressure_level: 1,
    backpressure_deferrals_total: 2,
    evictions_total: 1,
    recent_evictions: [{ block_hash: '0xabc', height: 10, view: 2 }],
  },
  view_change_proof_accepted_total: 1,
  view_change_proof_stale_total: 0,
  view_change_proof_rejected_total: 0,
  view_change_suggest_total: 1,
  view_change_install_total: 1,
  collectors_targeted_current: 1,
  collectors_targeted_last_per_block: 2,
  redundant_sends_total: 0,
  vrf_penalty_epoch: 1,
  vrf_committed_no_reveal_total: 0,
  vrf_no_participation_total: 0,
  vrf_late_reveals_total: 0,
  consensus_penalties_applied_total: 1,
  consensus_penalties_pending: 0,
  vrf_penalties_applied_total: 1,
  vrf_penalties_pending: 0,
  lane_governance_sealed_total: 1,
  lane_governance_sealed_aliases: ['lane-a'],
  lane_governance: [
    {
      lane_id: 1,
      alias: 'alpha',
      governance: 'manual',
      manifest_required: true,
      manifest_ready: false,
      manifest_path: null,
      validator_ids: [],
      quorum: null,
      protected_namespaces: [],
      runtime_upgrade: { allow: true, require_metadata: false, metadata_key: null, allowed_ids: [] },
      privacy_commitments: [],
    },
  ],
  nexus_fee: {
    charged_total: 3,
    charged_via_payer_total: 2,
    charged_via_sponsor_total: 1,
    sponsor_disabled_total: 0,
    sponsor_cap_exceeded_total: 0,
    config_errors_total: 0,
    transfer_failures_total: 1,
    last_amount: '10',
    last_asset_id: 'xor#sora',
    last_payer: 'payer',
    last_payer_id: SAMPLE_I105,
    last_error: null,
  },
  nexus_staking: { lanes: [{ lane_id: 1, bonded: '10', pending_unbond: '2', slash_total: 0 }] },
  npos_election: {
    epoch: 7,
    snapshot_height: 20,
    seed: 'deadbeef',
    candidates_total: 5,
    validator_set_hash: '0xhash',
    validator_set: ['ed0120...'],
    params: {
      max_validators: 7,
      min_self_bond: 1,
      min_nomination_bond: 1,
      max_nominator_concentration_pct: 30,
      seat_band_pct: 5,
      max_entity_correlation_pct: 10,
      finality_margin_blocks: 8,
    },
    rejection_reason: null,
    tie_break: [{ peer_id: 'ed0120...', score: '00ff' }],
  },
};

const sumeragiTelemetry = {
  availability: {
    total_votes_ingested: 12,
    collectors: [
      { collector_idx: 0, peer_id: 'ed0120...', votes_ingested: 5 },
      { collector_idx: 1, peer_id: 'ed0999...', votes_ingested: 7 },
    ],
  },
  qc_latency_ms: [
    { kind: 'availability', last_ms: 120 },
    { kind: 'commit', last_ms: 95 },
  ],
  rbc_backlog: { pending_sessions: 1, total_missing_chunks: 3, max_missing_chunks: 2 },
  vrf: {
    found: true,
    epoch: 42,
    finalized: true,
    seed_hex: 'cafebabe',
    epoch_length: 3600,
    commit_deadline_offset: 120,
    reveal_deadline_offset: 160,
    roster_len: 7,
    updated_at_height: 999,
    participants_total: 7,
    commitments_total: 7,
    reveals_total: 7,
    late_reveals_total: 0,
    committed_no_reveal: [],
    no_participation: [],
    late_reveals: [],
  },
};

interface PeerRow {
  info: PeerInfo | null
  status: PeerStatus | null
}

const createDefaultMetrics = () => ({
  peers: 0,
  domains: 0,
  accounts: 0,
  assets: 0,
  transactions_accepted: 0,
  transactions_rejected: 0,
  block: 10,
  block_created_at: new Date().toISOString(),
  finalized_block: 9,
  avg_block_time: { ms: 5000 },
  avg_commit_time: { ms: 1000 },
});

const peersTelemetry = {
  metrics: ref(createDefaultMetrics()),
  streamStatus: ref('OPEN'),
  peers: ref<PeerRow[]>([]),
  propagation: ref([]),
  recentEvents: ref<any[]>([]),
  peerDataSource: ref<'LIVE_SSE' | 'SNAPSHOT' | 'FALLBACK' | 'MIXED' | 'NONE'>('LIVE_SSE'),
  lastPeerSampleAtMs: ref<number | null>(Date.now()),
  fallbackPeersCount: ref(0),
  isMetricsLoading: false,
  isPeersLoading: false,
};

vi.mock('@/shared/ui/composables/usePeersTelemetry', () => ({
  usePeersTelemetry: () => peersTelemetry,
}));

vi.mock('@/shared/ui/composables/useSumeragiStatus', () => ({
  useSumeragiStatus: () => ({
    status: ref(sumeragiStatus),
    lastUpdatedAtMs: ref(Date.now()),
    isLoading: false,
    streamStatus: ref('OPEN'),
  }),
}));

vi.mock('@/shared/ui/composables/useSumeragiTelemetry', () => ({
  useSumeragiTelemetry: () => ({
    telemetry: ref(sumeragiTelemetry),
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><div class="block-title">{{ title }}</div><slot /><slot name="header-action" /></div>',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot v-for="item in items" name="row" :item="item" /></div>',
};

const SimpleStub = {
  template: '<div><slot /></div>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

const BaseHashStub = {
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const BaseLoadingStub = {
  template: '<div class="loading-stub" />',
};

const LatestBlockStub = {
  props: ['date'],
  template: '<span>{{ date }}</span>',
};

describe('NodesTelemetry', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    routeState.query = {};
    routerReplaceMock.mockClear();
    clipboardCopyMock.mockClear();
    const storage = (window as unknown as { localStorage?: { removeItem?: (key: string) => void } }).localStorage;
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem('iroha.telemetry.ops.v2');
    }
    peersTelemetry.metrics.value = createDefaultMetrics();
    peersTelemetry.peers.value = [];
    peersTelemetry.propagation.value = [];
    peersTelemetry.recentEvents.value = [];
    peersTelemetry.peerDataSource.value = 'LIVE_SSE';
    peersTelemetry.lastPeerSampleAtMs.value = Date.now();
    peersTelemetry.fallbackPeersCount.value = 0;
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  const factory = () => {
    const wrapper = mount(NodesTelemetry, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: SimpleStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
          BaseLoading: BaseLoadingStub,
          LatestBlock: LatestBlockStub,
          ContextTooltip: SimpleStub,
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  it('renders consensus and view-change metrics from the Sumeragi status snapshot', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.text()).toContain('Live network pulse');
    expect(wrapper.text()).toContain('View-change index');
    expect(wrapper.text()).toContain('v3');
    expect(wrapper.text()).toContain('Inline posts');
    expect(wrapper.text()).toContain('4 / 6');
    expect(wrapper.text()).toContain('Consensus penalties applied');
  });

  it('renders settlement, nexus, election, and governance snapshots', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.text()).toContain('Settlement ID');
    expect(wrapper.text()).toContain('Nexus fee snapshot');
    expect(wrapper.text()).toContain('NPoS election');
    expect(wrapper.text()).toContain('Lane governance');
    expect(wrapper.text()).toContain('alpha (#1)');
  });

  it('renders sumeragi chain and block producer details', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Sumeragi chain');
    expect(wrapper.text()).toContain('Membership view hash');
    expect(wrapper.text()).toContain('viewhash001');
    expect(wrapper.text()).toContain('Block producers');
    expect(wrapper.text()).toContain('Current producer');
    expect(wrapper.text()).toContain('Leader index: #1');

    const leaderRows = wrapper.findAll('.nodes-telemetry-page__npos-producers-row[data-leader="true"]');
    expect(leaderRows).toHaveLength(1);
  });

  it('renders additional node stats (connected peers, block delta, queue capacity)', async () => {
    peersTelemetry.peers.value = [
      {
        info: {
          url: 'https://node-a',
          connected: true,
          telemetry_unsupported: false,
          config: {
            public_key: 'ed0120...',
            queue_capacity: 10,
            network_block_gossip_size: 10,
            network_block_gossip_period: { ms: 1000 },
            network_tx_gossip_size: 10,
            network_tx_gossip_period: { ms: 1000 },
          },
          location: { lat: 0, lon: 0, country: 'United States', city: 'New York' },
          connected_peers: ['peer-1', 'peer-2', 'peer-3'],
        },
        status: {
          url: 'https://node-a',
          block: 8,
          commit_time: { ms: 500 },
          avg_commit_time: { ms: 600 },
          queue_size: 3,
          uptime: { ms: 1000 },
        },
      },
    ];

    const wrapper = factory();
    await flushPromises();
    expect(wrapper.text()).toContain('Graphs');
    expect(wrapper.text()).toContain('Map');
    expect(wrapper.text()).toContain('Ping (status RTT)');
    expect(wrapper.text()).toContain('Observed propagation');
    expect(wrapper.text()).toContain('Connected peers');
    expect(wrapper.text()).toContain('3 / 10');
    expect(wrapper.text()).toContain('(-2)');
    expect(wrapper.text()).toContain('10.00 s');
    expect(wrapper.text()).toContain('30%');
    expect(wrapper.text()).toContain('United States');
    expect(wrapper.text()).toContain('New York');

    const kpiValues = wrapper.findAll('.nodes-telemetry-page__ethstats-kpi-value');
    expect(kpiValues[0]?.text()).toBe('4 / 4');
    expect(kpiValues[1]?.text()).toBe('1');
  });

  it('supports interactive map mode with node selection and tooltip', async () => {
    peersTelemetry.peers.value = [
      {
        info: {
          url: 'https://node-a',
          connected: true,
          telemetry_unsupported: false,
          config: null,
          location: { lat: 35.68, lon: 139.76, country: 'Japan', city: 'Tokyo' },
          connected_peers: null,
        },
        status: {
          url: 'https://node-a',
          block: 10,
          commit_time: { ms: 120 },
          avg_commit_time: { ms: 140 },
          status_rtt: { ms: 20 },
          status_rtt_avg: { ms: 25 },
          status_rtt_p95: { ms: 34 },
          queue_size: 1,
          uptime: { ms: 10_000 },
          propagation_time: { ms: 40 },
          observed_at_ms: 1_000,
        },
      },
    ];

    const wrapper = factory();
    await flushPromises();

    const mapToggle = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Map');
    expect(mapToggle).toBeTruthy();
    await mapToggle!.trigger('click');
    await nextTick();

    const marker = wrapper.find('.nodes-telemetry-page__ethstats-map-point');
    expect(marker.exists()).toBe(true);

    await marker.trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.nodes-telemetry-page__ethstats-map-tooltip').exists()).toBe(true);

    await marker.trigger('click');
    await nextTick();
    expect(wrapper.find('.nodes-telemetry-page__ethstats-node[data-selected=\"true\"]').exists()).toBe(true);
  });

  it('falls back to network peer count when peer details are unavailable', async () => {
    peersTelemetry.metrics.value = {
      ...createDefaultMetrics(),
      peers: 4,
    };
    peersTelemetry.peers.value = [];

    const wrapper = factory();
    await flushPromises();

    const kpiValues = wrapper.findAll('.nodes-telemetry-page__ethstats-kpi-value');
    expect(kpiValues[0]?.text()).toBe('4 / 4');
    expect(kpiValues[1]?.text()).toBe('4');
  });

  it('shows fallback source and stale sample-age trust badges when peer telemetry is degraded', async () => {
    peersTelemetry.peerDataSource.value = 'FALLBACK';
    peersTelemetry.fallbackPeersCount.value = 4;
    peersTelemetry.lastPeerSampleAtMs.value = Date.now() - 120_000;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Source: Fallback /peers');
    expect(wrapper.text()).toContain('Sample age');
    expect(wrapper.text()).toContain('(stale)');
    expect(wrapper.text()).toContain('(4)');
    expect(wrapper.text()).toContain('Fresh <= 15s · Delayed <= 60s');
    expect(wrapper.text()).toContain('Detailed peer telemetry is incomplete.');
  });

  it('supports pulse filters, pin+compare panel, and raw event drawer', async () => {
    peersTelemetry.peers.value = [
      {
        info: {
          url: 'https://node-a',
          connected: true,
          telemetry_unsupported: false,
          config: { public_key: 'ed0120-a', queue_capacity: 10, network_block_gossip_size: 1, network_block_gossip_period: { ms: 1 }, network_tx_gossip_size: 1, network_tx_gossip_period: { ms: 1 } },
          location: { lat: 0, lon: 0, country: 'United States', city: 'NY' },
          connected_peers: [],
        },
        status: {
          url: 'https://node-a',
          block: 10,
          commit_time: { ms: 100 },
          avg_commit_time: { ms: 110 },
          queue_size: 1,
          uptime: { ms: 1000 },
          status_rtt_p95: { ms: 120 },
        },
      },
      {
        info: {
          url: 'https://node-b',
          connected: false,
          telemetry_unsupported: false,
          config: { public_key: 'ed0120-b', queue_capacity: 10, network_block_gossip_size: 1, network_block_gossip_period: { ms: 1 }, network_tx_gossip_size: 1, network_tx_gossip_period: { ms: 1 } },
          location: { lat: 0, lon: 0, country: 'Japan', city: 'Tokyo' },
          connected_peers: [],
        },
        status: {
          url: 'https://node-b',
          block: 8,
          commit_time: { ms: 220 },
          avg_commit_time: { ms: 230 },
          queue_size: 4,
          uptime: { ms: 1000 },
          status_rtt_p95: { ms: 260 },
        },
      },
      {
        info: {
          url: 'https://node-c',
          connected: true,
          telemetry_unsupported: true,
          config: null,
          location: null,
          connected_peers: [],
        },
        status: null,
      },
    ];
    peersTelemetry.recentEvents.value = [
      {
        id: 101,
        kind: 'sse_peer_status',
        receivedAtMs: Date.now() - 1_000,
        payload: { url: 'https://node-a', block: 10 },
      },
      {
        id: 102,
        kind: 'sse_peer_info',
        receivedAtMs: Date.now() - 800,
        payload: { url: 'https://node-b', connected: false },
      },
    ];

    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="pulse-filter-unsupported"]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('.nodes-telemetry-page__ethstats-node')).toHaveLength(1);
    expect(wrapper.text()).toContain('Unsupported');

    await wrapper.get('[data-test="pulse-filter-all"]').trigger('click');
    await nextTick();

    const pinButtons = wrapper.findAll('[data-test^="pulse-pin-node-"]');
    const compareButtons = wrapper.findAll('[data-test^="pulse-compare-node-"]');
    await pinButtons[0]!.trigger('click');
    await compareButtons[1]!.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="pulse-compare-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pinned node compare');

    const getElementByIdSpy = vi.spyOn(document, 'getElementById');
    await wrapper.get('[data-test="pulse-toggle-events"]').trigger('click');
    await nextTick();
    await nextTick();

    const eventToggle = wrapper.get('[data-test="pulse-toggle-events"]');
    expect(eventToggle.attributes('aria-expanded')).toBe('true');
    expect(eventToggle.attributes('aria-controls')).toBe('telemetry-pulse-events-drawer');
    expect(wrapper.find('[data-test="pulse-events-drawer"]').exists()).toBe(true);
    expect(getElementByIdSpy).toHaveBeenCalledWith('telemetry-pulse-events-search');
    getElementByIdSpy.mockRestore();
    expect(wrapper.text()).toContain('SSE peer status');
    expect(wrapper.text()).toContain('"block": 10');
    expect(wrapper.find('.nodes-telemetry-page__ethstats-events-absolute-time').attributes('datetime')).toContain('T');
    expect(wrapper.get('[data-test="pulse-events-count"]').text()).toBe('2 / 2');
    await wrapper.get('[data-test="pulse-copy-link"]').trigger('click');
    expect(clipboardCopyMock).toHaveBeenCalledWith(window.location.href);
    clipboardCopyMock.mockClear();
    const eventsList = wrapper.get('.nodes-telemetry-page__ethstats-events-list');
    expect(eventsList.attributes('aria-activedescendant')).toBe('telemetry-event-option-101');

    await eventsList.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(wrapper.get('[data-test="pulse-event-102"]').attributes('aria-selected')).toBe('true');
    expect(eventsList.attributes('aria-activedescendant')).toBe('telemetry-event-option-102');

    await eventsList.trigger('keydown', { key: 'End' });
    await nextTick();
    expect(wrapper.get('[data-test="pulse-event-102"]').attributes('aria-selected')).toBe('true');

    await eventsList.trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(wrapper.get('[data-test="pulse-event-101"]').attributes('aria-selected')).toBe('true');

    const searchInput = wrapper.get('#telemetry-pulse-events-search');
    await searchInput.setValue('node-a');
    await nextTick();
    expect(wrapper.get('[data-test="pulse-events-count"]').text()).toBe('1 / 2');
    expect(wrapper.text()).toContain('https://node-a');

    await searchInput.setValue('not-present');
    await nextTick();
    expect(wrapper.get('[data-test="pulse-events-count"]').text()).toBe('0 / 2');
    expect(wrapper.text()).toContain('No events captured yet');

    await searchInput.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect((searchInput.element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('[data-test="pulse-events-count"]').text()).toBe('2 / 2');
    expect(wrapper.text()).toContain('https://node-a');
  });

  it('restores ops state from query and persists updates to router/localStorage', async () => {
    routeState.query = {
      pf: 'online',
      pd: '1',
      ps: 'node-a',
    };
    peersTelemetry.peers.value = [
      {
        info: {
          url: 'https://node-a',
          connected: true,
          telemetry_unsupported: false,
          config: null,
          location: null,
          connected_peers: null,
        },
        status: {
          url: 'https://node-a',
          block: 10,
          commit_time: { ms: 100 },
          avg_commit_time: { ms: 120 },
          queue_size: 1,
          uptime: { ms: 1_000 },
        },
      },
      {
        info: {
          url: 'https://node-b',
          connected: false,
          telemetry_unsupported: false,
          config: null,
          location: null,
          connected_peers: null,
        },
        status: {
          url: 'https://node-b',
          block: 8,
          commit_time: { ms: 220 },
          avg_commit_time: { ms: 230 },
          queue_size: 2,
          uptime: { ms: 1_000 },
        },
      },
    ];
    peersTelemetry.recentEvents.value = [
      {
        id: 201,
        kind: 'sse_peer_status',
        receivedAtMs: Date.now() - 2000,
        payload: { url: 'https://node-a', block: 10 },
      },
    ];

    const storage = (window as unknown as { localStorage?: Partial<Storage> }).localStorage;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="pulse-filter-online"]').attributes('data-active')).toBe('true');
    expect(wrapper.find('[data-test="pulse-events-drawer"]').exists()).toBe(true);
    expect((wrapper.get('#telemetry-pulse-events-search').element as HTMLInputElement).value).toBe('node-a');

    await wrapper.get('[data-test="pulse-filter-lagging"]').trigger('click');
    await nextTick();
    await flushPromises();

    expect(routerReplaceMock).toHaveBeenCalled();
    const lastCall = routerReplaceMock.mock.calls.at(-1)?.[0] as { query: Record<string, unknown> } | undefined;
    expect(lastCall?.query?.pf).toBe('lagging');

    if (storage && typeof storage.getItem === 'function') {
      const persistedValue = storage.getItem('iroha.telemetry.ops.v2');
      expect(String(persistedValue ?? '')).toContain('"filter":"LAGGING"');
      expect(String(persistedValue ?? '')).toContain('"search":"node-a"');
    }
  });

  it('preserves scoped explorer query keys while telemetry ops query state updates', async () => {
    routeState.query = {
      torii: 'https://public-node.example:18080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
      pf: 'online',
    };
    peersTelemetry.peers.value = [
      {
        info: {
          url: 'https://node-a',
          connected: true,
          telemetry_unsupported: false,
          config: null,
          location: null,
          connected_peers: null,
        },
        status: {
          url: 'https://node-a',
          block: 10,
          commit_time: { ms: 100 },
          avg_commit_time: { ms: 120 },
          queue_size: 1,
          uptime: { ms: 1_000 },
        },
      },
      {
        info: {
          url: 'https://node-b',
          connected: false,
          telemetry_unsupported: false,
          config: null,
          location: null,
          connected_peers: null,
        },
        status: {
          url: 'https://node-b',
          block: 8,
          commit_time: { ms: 220 },
          avg_commit_time: { ms: 230 },
          queue_size: 2,
          uptime: { ms: 1_000 },
        },
      },
    ];

    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="pulse-filter-lagging"]').trigger('click');
    await nextTick();
    await flushPromises();

    const lastCall = routerReplaceMock.mock.calls.at(-1)?.[0] as { query: Record<string, unknown> } | undefined;
    expect(lastCall?.query?.pf).toBe('lagging');
    expect(lastCall?.query?.torii).toBe('https://public-node.example:18080');
    expect(lastCall?.query?.dataspaceLaneId).toBe('7');
    expect(lastCall?.query?.dataspaceId).toBe('42');
  });
});
