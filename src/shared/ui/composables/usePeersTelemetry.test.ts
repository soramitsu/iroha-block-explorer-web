import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref, reactive, nextTick, computed } from 'vue';
import type { PeerInfo, PeerPropagation, PeerStatus } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const hoisted = vi.hoisted(() => ({
  fetchPeersInfoMock: vi.fn(),
  protectedDiagnosticRequests: {
    fetchNetworkMetrics: vi.fn(),
    fetchToriiMetricsText: vi.fn(),
    fetchSumeragiStatus: vi.fn(),
    streamSumeragiStatus: vi.fn(),
    fetchSumeragiTelemetry: vi.fn(),
    fetchOnlinePeers: vi.fn(),
    fetchTelemetryPropagation: vi.fn(),
  },
  peersSample: [
    {
      url: 'https://node-a',
      connected: true,
      telemetry_unsupported: false,
      config: null,
      location: null,
      connected_peers: null,
    },
  ] satisfies PeerInfo[],
  propagationSample: [
    {
      block: 11,
      first_seen_at_ms: 1000,
      last_seen_at_ms: 1045,
      spread_ms: 45,
      peers_reported: 2,
    },
  ] satisfies PeerPropagation[],
}));

const peersSample = hoisted.peersSample;
const propagationSample = hoisted.propagationSample;

const telemetryMock = {
  metrics: ref(null),
  isLoading: ref(false),
  streamStatus: ref('CONNECTING'),
  streamedMetrics: ref<any>(null),
};

vi.mock('@/shared/api', () => {
  return {
    fetchPeersInfo: hoisted.fetchPeersInfoMock,
    ...hoisted.protectedDiagnosticRequests,
  };
});

vi.mock('@/shared/utils/setup-async-data', () => {
  return {
    setupAsyncData: (fn: () => Promise<any>) => {
      const isLoading = ref(true);
      const raw = ref();
      const data = computed(() => raw.value);
      fn().then((result) => {
        raw.value = result;
        isLoading.value = false;
      });
      return reactive({ isLoading, data });
    },
  };
});

vi.mock('./useTelemetryMetrics', () => {
  return {
    useTelemetryMetrics: () => telemetryMock,
  };
});

import { usePeersTelemetry, __resetPeersTelemetryForTests } from './usePeersTelemetry';

describe('usePeersTelemetry', () => {
  beforeEach(() => {
    __resetPeersTelemetryForTests();
    hoisted.fetchPeersInfoMock.mockReset().mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: hoisted.peersSample,
    });
    for (const request of Object.values(hoisted.protectedDiagnosticRequests)) {
      request.mockReset();
    }
    telemetryMock.streamStatus.value = 'CONNECTING';
    telemetryMock.streamedMetrics.value = null;
    telemetryMock.metrics.value = null;
  });

  it('hydrates peers from the SSE bootstrap payload', async () => {
    telemetryMock.streamStatus.value = 'OPEN';
    const {
      peers,
      propagation,
      recentEvents,
      isPeersLoading,
      peerDataSource,
      lastPeerSampleAtMs,
    } = usePeersTelemetry();

    telemetryMock.streamedMetrics.value = {
      kind: 'first',
      network_status: null,
      peers_info: peersSample,
      peers_status: [],
      propagation: propagationSample,
    };
    await nextTick();
    expect(peers.value).toHaveLength(1);
    expect(peers.value[0].info?.url).toBe('https://node-a');
    expect(propagation.value).toHaveLength(1);
    expect(propagation.value[0]?.spread_ms).toBe(45);
    expect(peerDataSource.value).toBe('LIVE_SSE');
    expect(lastPeerSampleAtMs.value).not.toBeNull();
    expect(recentEvents.value.some((event) => event.kind === 'sse_first')).toBe(true);
    expect(isPeersLoading.value).toBe(false);
  });

  it('uses only the public peers snapshot and never requests protected diagnostics', async () => {
    usePeersTelemetry();
    await flushAll();

    expect(hoisted.fetchPeersInfoMock).toHaveBeenCalledTimes(1);
    for (const request of Object.values(hoisted.protectedDiagnosticRequests)) {
      expect(request).not.toHaveBeenCalled();
    }
  });

  it('merges SSE peer status updates', async () => {
    const { peers } = usePeersTelemetry();
    await flushAll();
    const status: PeerStatus = {
      url: 'https://node-a',
      block: 10,
      commit_time: { ms: 100 },
      avg_commit_time: { ms: 200 },
      queue_size: 3,
      uptime: { ms: 5000 },
    };
    telemetryMock.streamedMetrics.value = { kind: 'peer_status', ...status };
    await nextTick();
    expect(peers.value[0].status).toEqual(status);
  });

  it('merges live propagation updates by block height', async () => {
    const { propagation } = usePeersTelemetry();
    telemetryMock.streamedMetrics.value = {
      kind: 'first',
      network_status: null,
      peers_info: peersSample,
      peers_status: [],
      propagation: propagationSample,
    };
    await flushAll();
    expect(propagation.value[0]?.spread_ms).toBe(45);

    telemetryMock.streamedMetrics.value = {
      kind: 'propagation',
      block: 12,
      first_seen_at_ms: 2_000,
      last_seen_at_ms: 2_080,
      spread_ms: 80,
      peers_reported: 3,
    };
    await nextTick();

    expect(propagation.value).toHaveLength(2);
    expect(propagation.value[1]?.block).toBe(12);
    expect(propagation.value[1]?.spread_ms).toBe(80);
  });

  it('keeps only the latest authoritative propagation history', async () => {
    const { propagation } = usePeersTelemetry();

    for (let block = 1; block <= 70; block += 1) {
      telemetryMock.streamedMetrics.value = {
        kind: 'propagation',
        block,
        first_seen_at_ms: block * 1_000,
        last_seen_at_ms: block * 1_000 + 10,
        spread_ms: 10,
        peers_reported: 2,
      };
      await nextTick();
    }

    expect(propagation.value).toHaveLength(64);
    expect(propagation.value[0]?.block).toBe(7);
    expect(propagation.value.at(-1)?.block).toBe(70);
  });

  it('stores snapshot and live updates in newest-first event order', async () => {
    const { recentEvents } = usePeersTelemetry();
    await flushAll();

    telemetryMock.streamedMetrics.value = {
      kind: 'peer_status',
      url: 'https://node-a',
      block: 15,
      commit_time: { ms: 120 },
      avg_commit_time: { ms: 140 },
      queue_size: 1,
      uptime: { ms: 10_000 },
    };
    await nextTick();

    expect(recentEvents.value.length).toBeGreaterThan(0);
    expect(recentEvents.value[0]?.kind).toBe('sse_peer_status');
    expect(recentEvents.value.some((event) => event.kind === 'snapshot_peers_info')).toBe(true);
  });

});

async function flushAll() {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}
