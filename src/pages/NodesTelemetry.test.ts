import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { Ref } from 'vue';
import NodesTelemetry from './NodesTelemetry.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const api = vi.hoisted(() => ({
  fetchExplorerHealth: vi.fn(),
  fetchNetworkMetrics: vi.fn(),
  fetchToriiMetricsText: vi.fn(),
  fetchSumeragiStatus: vi.fn(),
  streamSumeragiStatus: vi.fn(),
  fetchSumeragiTelemetry: vi.fn(),
  fetchOnlinePeers: vi.fn(),
  fetchTelemetryPropagation: vi.fn(),
}));

const protectedDiagnosticRequests = [
  api.fetchNetworkMetrics,
  api.fetchToriiMetricsText,
  api.fetchSumeragiStatus,
  api.streamSumeragiStatus,
  api.fetchSumeragiTelemetry,
  api.fetchOnlinePeers,
  api.fetchTelemetryPropagation,
] as const;

const telemetry = vi.hoisted(() => ({
  metrics: null as unknown as Ref<any>,
  streamStatus: null as unknown as Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>,
  peers: null as unknown as Ref<any[]>,
  propagation: null as unknown as Ref<any[]>,
  isPeersLoading: null as unknown as Ref<boolean>,
}));

vi.mock('@/shared/api', () => ({ ...api }));

vi.mock('@/shared/ui/composables/usePeersTelemetry', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue');
  telemetry.metrics = ref(null);
  telemetry.streamStatus = ref('OPEN');
  telemetry.peers = ref([]);
  telemetry.propagation = ref([]);
  telemetry.isPeersLoading = ref(false);
  return {
    usePeersTelemetry: () => telemetry,
  };
});

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot name="header-action" /><slot /></section>',
};

const BaseLoadingStub = {
  template: '<div data-test="loading" />',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot v-for="item in items" name="row" :item="item" /></div>',
};

const DataFieldStub = {
  props: ['title', 'value'],
  template: '<div class="data-field"><span>{{ title }}</span><span>{{ value }}</span></div>',
};

function factory() {
  return mount(NodesTelemetry, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: BaseContentBlockStub,
        BaseLoading: BaseLoadingStub,
        BaseTable: BaseTableStub,
        DataField: DataFieldStub,
      },
    },
  });
}

describe('NodesTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telemetry.metrics.value = null;
    telemetry.streamStatus.value = 'OPEN';
    telemetry.propagation.value = [];
    telemetry.isPeersLoading.value = false;
    api.fetchExplorerHealth.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        head_height: 42,
        head_created_at: new Date('2026-08-30T01:00:00Z'),
        sampled_at: new Date('2026-08-30T01:00:01Z'),
      },
    });
    telemetry.peers.value = [
      {
        info: {
          url: 'https://peer-a.example',
          connected: true,
          telemetry_unsupported: false,
          location: { city: 'Tokyo', country: 'Japan', lat: 35.7, lon: 139.7 },
          connected_peers: ['peer-b'],
        },
        status: null,
      },
    ];
  });

  it('renders the public explorer health and authoritative peer state', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(api.fetchExplorerHealth).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-test="explorer-health"]').text()).toContain('42');
    expect(wrapper.get('[data-test="public-peer-row"]').text()).toContain('https://peer-a.example');
    expect(wrapper.get('[data-test="public-peer-row"]').text()).toContain('Tokyo, Japan');
    expect(wrapper.get('[data-test="peer-public-key"]').text()).toContain('—');
    expect(wrapper.get('[data-test="peer-commit-time"]').text()).toContain('—');
    expect(wrapper.get('[data-test="peer-observed-at"]').text()).toContain('—');
  });

  it('never requests protected diagnostic endpoints from the public page', async () => {
    factory();
    await flushPromises();

    expect(api.fetchExplorerHealth).toHaveBeenCalledTimes(1);
    for (const request of protectedDiagnosticRequests) {
      expect(request).not.toHaveBeenCalled();
    }
  });

  it('shows telemetry as unavailable when public health returns a non-success response', async () => {
    telemetry.peers.value = [];
    api.fetchExplorerHealth.mockResolvedValueOnce({
      status: UNKNOWN_ERROR,
      error: new Error('health unavailable'),
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="explorer-health"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="public-telemetry-error"]').text()).toContain('Telemetry data is unavailable');
  });

  it('shows telemetry as unavailable when public health cannot be reached', async () => {
    telemetry.peers.value = [];
    api.fetchExplorerHealth.mockRejectedValueOnce(new Error('network unavailable'));

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="explorer-health"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="public-telemetry-error"]').text()).toContain('Telemetry data is unavailable');
  });

  it('renders every authoritative live, peer-config, peer-status, and propagation field', async () => {
    const wrapper = factory();
    await flushPromises();

    const blockCreatedAt = new Date('2026-08-30T01:00:02Z');
    const firstSeenAtMs = Date.parse('2026-08-30T01:00:02.100Z');
    const lastSeenAtMs = Date.parse('2026-08-30T01:00:02.180Z');
    const observedAtMs = Date.parse('2026-08-30T01:00:02.200Z');
    telemetry.metrics.value = {
      peers: 3,
      domains: 4,
      accounts: 5,
      assets: 6,
      transactions_accepted: 7,
      transactions_rejected: 8,
      block: 43,
      block_created_at: blockCreatedAt,
      finalized_block: 42,
      avg_commit_time: { ms: 12 },
      avg_block_time: { ms: 13 },
    };
    telemetry.peers.value = [
      {
        info: {
          ...telemetry.peers.value[0].info,
          config: {
            public_key: 'ed0120-authoritative-key',
            queue_capacity: 16,
            network_block_gossip_size: 20,
            network_block_gossip_period: { ms: 21 },
            network_tx_gossip_size: 22,
            network_tx_gossip_period: { ms: 23 },
          },
        },
        status: {
          url: 'https://peer-a.example',
          block: 43,
          commit_time: { ms: 10 },
          avg_commit_time: { ms: 11 },
          status_rtt: { ms: 14 },
          status_rtt_avg: { ms: 15 },
          status_rtt_p95: { ms: 16 },
          queue_size: 0,
          uptime: { ms: 1_000 },
          propagation_time: { ms: 17 },
          observed_at_ms: observedAtMs,
        },
      },
    ];
    telemetry.propagation.value = [
      {
        block: 43,
        first_seen_at_ms: firstSeenAtMs,
        last_seen_at_ms: lastSeenAtMs,
        spread_ms: 80,
        peers_reported: 3,
      },
    ];
    await nextTick();

    expect(wrapper.get('[data-test="public-live-metrics"]').text()).toContain('Peers3');
    expect(wrapper.get('[data-test="live-block"]').text()).toBe('Block43');
    expect(wrapper.get('[data-test="live-block-created-at"]').text()).toContain(blockCreatedAt.toLocaleString());
    expect(wrapper.get('[data-test="live-average-commit-time"]').text()).toBe(
      'Average block commit time12 milliseconds'
    );
    expect(wrapper.get('[data-test="live-average-block-time"]').text()).toBe('Average block time13 milliseconds');
    expect(wrapper.get('[data-test="public-peer-row"]').text()).toContain('43');
    const peerDetails = wrapper.get('[data-test="public-peer-details"]');
    expect(peerDetails.get('[data-test="peer-public-key"]').text()).toContain('ed0120-authoritative-key');
    expect(peerDetails.get('[data-test="peer-queue-capacity"]').text()).toBe('Queue capacity16');
    expect(peerDetails.get('[data-test="peer-block-gossip"]').text()).toContain('size: 20');
    expect(peerDetails.get('[data-test="peer-block-gossip"]').text()).toContain('period: 21ms');
    expect(peerDetails.get('[data-test="peer-transaction-gossip"]').text()).toContain('size: 22');
    expect(peerDetails.get('[data-test="peer-transaction-gossip"]').text()).toContain('period: 23ms');
    expect(peerDetails.get('[data-test="peer-commit-time"]').text()).toBe('Commit time10 milliseconds');
    expect(peerDetails.get('[data-test="peer-average-commit-time"]').text()).toBe('Average commit time11 milliseconds');
    expect(peerDetails.get('[data-test="peer-status-rtt"]').text()).toBe('Status RTT14 milliseconds');
    expect(peerDetails.get('[data-test="peer-status-rtt-average"]').text()).toBe('Average status RTT15 milliseconds');
    expect(peerDetails.get('[data-test="peer-status-rtt-p95"]').text()).toBe('P95 status RTT16 milliseconds');
    expect(peerDetails.get('[data-test="peer-queue-size"]').text()).toBe('Queue0');
    expect(peerDetails.get('[data-test="peer-uptime"]').text()).toBe('Uptime1,000 milliseconds');
    expect(peerDetails.get('[data-test="peer-propagation-time"]').text()).toBe('Propagation time17 milliseconds');
    expect(peerDetails.get('[data-test="peer-observed-at"]').text()).toContain(new Date(observedAtMs).toLocaleString());
    const propagationRow = wrapper.get('[data-test="public-propagation-row"]').text();
    expect(propagationRow).toContain('43');
    expect(propagationRow).toContain('80 milliseconds');
    expect(propagationRow).toContain('3');
    expect(wrapper.get('[data-test="propagation-first-seen-at"]').text()).toBe(
      new Date(firstSeenAtMs).toLocaleString()
    );
    expect(wrapper.get('[data-test="propagation-last-seen-at"]').text()).toBe(new Date(lastSeenAtMs).toLocaleString());
  });

  it('preserves authoritative zeroes while keeping absent telemetry distinct', async () => {
    const wrapper = factory();
    await flushPromises();

    telemetry.metrics.value = {
      peers: 0,
      domains: 0,
      accounts: 0,
      assets: 0,
      transactions_accepted: 0,
      transactions_rejected: 0,
      block: 0,
      block_created_at: null,
      finalized_block: 0,
      avg_commit_time: { ms: 0 },
      avg_block_time: null,
    };
    telemetry.peers.value = [
      {
        info: {
          ...telemetry.peers.value[0].info,
          connected_peers: [],
          config: {
            queue_capacity: 0,
            network_block_gossip_size: 0,
          },
        },
        status: {
          url: 'https://peer-a.example',
          block: 0,
          commit_time: { ms: 0 },
          avg_commit_time: { ms: 0 },
          status_rtt: { ms: 0 },
          queue_size: 0,
          uptime: { ms: 0 },
          propagation_time: { ms: 0 },
          observed_at_ms: 0,
        },
      },
    ];
    telemetry.propagation.value = [
      {
        block: 0,
        first_seen_at_ms: 0,
        last_seen_at_ms: 0,
        spread_ms: 0,
        peers_reported: 0,
      },
    ];
    await nextTick();

    expect(wrapper.get('[data-test="live-block"]').text()).toBe('Block0');
    expect(wrapper.get('[data-test="live-block-created-at"]').text()).toBe('Last block—');
    expect(wrapper.get('[data-test="live-average-commit-time"]').text()).toBe(
      'Average block commit time0 milliseconds'
    );
    expect(wrapper.get('[data-test="live-average-block-time"]').text()).toBe('Average block time—');

    const peerRow = wrapper.get('[data-test="public-peer-row"]');
    expect(peerRow.findAll('[role="cell"]')[3]?.text()).toBe('0');
    expect(peerRow.findAll('[role="cell"]')[4]?.text()).toBe('0');
    const peerDetails = peerRow.get('[data-test="public-peer-details"]');
    expect(peerDetails.get('[data-test="peer-public-key"]').text()).toBe('Public key—');
    expect(peerDetails.get('[data-test="peer-queue-capacity"]').text()).toBe('Queue capacity0');
    expect(peerDetails.get('[data-test="peer-block-gossip"]').text()).toContain('size: 0');
    expect(peerDetails.get('[data-test="peer-block-gossip"]').text()).toContain('period: —ms');
    expect(peerDetails.get('[data-test="peer-transaction-gossip"]').text()).toContain('size: —');
    expect(peerDetails.get('[data-test="peer-commit-time"]').text()).toBe('Commit time0 milliseconds');
    expect(peerDetails.get('[data-test="peer-average-commit-time"]').text()).toBe('Average commit time0 milliseconds');
    expect(peerDetails.get('[data-test="peer-status-rtt"]').text()).toBe('Status RTT0 milliseconds');
    expect(peerDetails.get('[data-test="peer-status-rtt-average"]').text()).toBe('Average status RTT—');
    expect(peerDetails.get('[data-test="peer-status-rtt-p95"]').text()).toBe('P95 status RTT—');
    expect(peerDetails.get('[data-test="peer-queue-size"]').text()).toBe('Queue0');
    expect(peerDetails.get('[data-test="peer-uptime"]').text()).toBe('Uptime0 milliseconds');
    expect(peerDetails.get('[data-test="peer-propagation-time"]').text()).toBe('Propagation time0 milliseconds');
    expect(peerDetails.get('[data-test="peer-observed-at"]').text()).toContain(new Date(0).toLocaleString());

    expect(wrapper.get('[data-test="propagation-first-seen-at"]').text()).toBe(new Date(0).toLocaleString());
    expect(wrapper.get('[data-test="propagation-last-seen-at"]').text()).toBe(new Date(0).toLocaleString());
    const propagationRow = wrapper.get('[data-test="public-propagation-row"]').text();
    expect(propagationRow).toContain('0 milliseconds');
  });

  it('states the signed operator boundary without anonymously exposing consensus diagnostics', async () => {
    const wrapper = factory();
    await flushPromises();

    const boundary = wrapper.get('[data-test="operator-telemetry-boundary"]').text();
    expect(boundary).toContain('OperatorSigningContext');
    expect(boundary).toContain('no anonymous fallback');
    expect(wrapper.text()).not.toContain('View-change index');
  });
});
