import { reactive, computed, watch, onScopeDispose, getCurrentScope, effectScope, ref } from 'vue';
import type { ComputedRef } from 'vue';
import type { EffectScope } from 'vue';
import type { PeerInfo, PeerPropagation, PeerStatus } from '@/shared/api/schemas';
import { fetchOnlinePeers, fetchPeersInfo, fetchTelemetryPropagation } from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useTelemetryMetrics } from './useTelemetryMetrics';

interface PeerRow {
  info: PeerInfo | null
  status: PeerStatus | null
}

type PeerTelemetrySource = 'LIVE_SSE' | 'SNAPSHOT' | 'FALLBACK' | 'MIXED' | 'NONE';
type PeerRowOrigin = 'live' | 'snapshot' | 'fallback';
type TelemetryOrigin = Exclude<PeerRowOrigin, 'fallback'>;
export type PeerTelemetryEventKind =
  | 'snapshot_peers_info'
  | 'snapshot_propagation'
  | 'fallback_peers'
  | 'sse_first'
  | 'sse_peer_info'
  | 'sse_peer_status'
  | 'sse_propagation'
  | 'sse_network_status';

export interface PeerTelemetryEvent {
  id: number
  kind: PeerTelemetryEventKind
  receivedAtMs: number
  payload: unknown
}

interface PeersState {
  metrics: ReturnType<typeof useTelemetryMetrics>['metrics']
  streamStatus: ReturnType<typeof useTelemetryMetrics>['streamStatus']
  peers: ComputedRef<PeerRow[]>
  propagation: ComputedRef<PeerPropagation[]>
  recentEvents: ComputedRef<PeerTelemetryEvent[]>
  peerDataSource: ComputedRef<PeerTelemetrySource>
  lastPeerSampleAtMs: ComputedRef<number | null>
  fallbackPeersCount: ComputedRef<number>
  isMetricsLoading: ReturnType<typeof useTelemetryMetrics>['isLoading']
  isPeersLoading: ComputedRef<boolean>
}

let peersState: PeersState | null = null;
let storedStops: Array<() => void> = [];
let peersConsumers = 0;
let peersScope: EffectScope | null = null;

export function usePeersTelemetry(): PeersState {
  if (!peersState) {
    peersScope = effectScope(true);
    const scopedState = peersScope.run(() => createPeersTelemetryState());
    if (!scopedState) {
      peersScope.stop();
      peersScope = null;
      throw new Error('[usePeersTelemetry] failed to initialize shared peers state');
    }
    peersState = scopedState;
  }

  peersConsumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      peersConsumers = Math.max(peersConsumers - 1, 0);
      if (peersConsumers === 0) {
        resetPeersState();
      }
    });
  }

  return peersState;
}

function createPeersTelemetryState(): PeersState {
  const telemetry = useTelemetryMetrics();
  const peersMap = reactive(new Map<string, PeerRow>());
  const rowSourceMap = reactive(new Map<string, PeerRowOrigin>());
  const propagationMap = reactive(new Map<number, PeerPropagation>());
  const eventLog = ref<PeerTelemetryEvent[]>([]);
  const maxEventLogSize = 80;
  let nextEventId = 1;
  const lastLiveSampleAtMs = ref<number | null>(null);
  const lastSnapshotSampleAtMs = ref<number | null>(null);
  const lastFallbackSampleAtMs = ref<number | null>(null);
  const peersRequest = setupAsyncData(() => fetchPeersInfo());
  const onlinePeersRequest = setupAsyncData(() => fetchOnlinePeers());
  const propagationRequest = setupAsyncData(() => fetchTelemetryPropagation());

  const serializeEventPayload = (payload: unknown) => {
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return payload;
    }
  };

  const pushEvent = (kind: PeerTelemetryEventKind, payload: unknown) => {
    eventLog.value = [
      ...eventLog.value,
      {
        id: nextEventId,
        kind,
        receivedAtMs: Date.now(),
        payload: serializeEventPayload(payload),
      },
    ].slice(-maxEventLogSize);
    nextEventId += 1;
  };

  const markTelemetrySample = (origin: TelemetryOrigin) => {
    if (origin === 'live') {
      lastLiveSampleAtMs.value = Date.now();
      return;
    }
    lastSnapshotSampleAtMs.value = Date.now();
  };

  const markFallbackSample = () => {
    lastFallbackSampleAtMs.value = Date.now();
  };

  const applyPeerInfo = (peer: PeerInfo, origin: TelemetryOrigin) => {
    const previous = peersMap.get(peer.url) ?? { info: null, status: null };
    peersMap.set(peer.url, { ...previous, info: peer });
    const previousOrigin = rowSourceMap.get(peer.url);
    const nextOrigin = previousOrigin === 'live' && origin === 'snapshot' ? 'live' : origin;
    rowSourceMap.set(peer.url, nextOrigin);
    markTelemetrySample(origin);
  };

  const applyPeerStatus = (status: PeerStatus, origin: TelemetryOrigin) => {
    const previous = peersMap.get(status.url) ?? { info: null, status: null };
    peersMap.set(status.url, { ...previous, status });
    const previousOrigin = rowSourceMap.get(status.url);
    const nextOrigin = previousOrigin === 'live' && origin === 'snapshot' ? 'live' : origin;
    rowSourceMap.set(status.url, nextOrigin);
    markTelemetrySample(origin);
  };

  const applyPropagation = (entry: PeerPropagation) => {
    propagationMap.set(entry.block, entry);
  };

  const stripKind = <T extends { kind: string }>(payload: T): Omit<T, 'kind'> => {
    const next: Partial<T> = { ...payload };
    delete next.kind;
    return next as Omit<T, 'kind'>;
  };

  const applyOnlinePeer = (peer: string) => {
    const normalized = peer.trim();
    if (!normalized) return;

    const separator = normalized.lastIndexOf('@');
    const endpoint = separator >= 0 ? normalized.slice(separator + 1).trim() : normalized;
    if (!endpoint) return;

    const publicKey = separator > 0 ? normalized.slice(0, separator).trim() : '';
    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `http://${endpoint}`;

    const existingSource = rowSourceMap.get(url);
    if (existingSource === 'live' || existingSource === 'snapshot') return;

    const previous = peersMap.get(url) ?? { info: null, status: null };
    if (previous.info) return;

    peersMap.set(url, {
      ...previous,
      info: {
        url,
        connected: true,
        telemetry_unsupported: false,
        config: publicKey
          ? {
              public_key: publicKey,
              queue_capacity: null,
              network_block_gossip_size: null,
              network_block_gossip_period: null,
              network_tx_gossip_size: null,
              network_tx_gossip_period: null,
            }
          : null,
        location: null,
        connected_peers: null,
      },
    });
    rowSourceMap.set(url, 'fallback');
    markFallbackSample();
  };

  storedStops = [
    watch(
      () => peersRequest.data,
      (response) => {
        if (response?.status === SUCCESSFUL_FETCHING) {
          response.data.forEach((peer) => applyPeerInfo(peer, 'snapshot'));
          if (response.data.length > 0) {
            pushEvent('snapshot_peers_info', {
              count: response.data.length,
              peers_info: response.data,
            });
          }
        }
      },
      { immediate: true }
    ),
    watch(
      () => onlinePeersRequest.data,
      (response) => {
        if (response?.status === SUCCESSFUL_FETCHING) {
          response.data.forEach(applyOnlinePeer);
          if (response.data.length > 0) {
            pushEvent('fallback_peers', {
              count: response.data.length,
              peers: response.data,
            });
          }
        }
      },
      { immediate: true }
    ),
    watch(
      () => propagationRequest.data,
      (response) => {
        if (response?.status === SUCCESSFUL_FETCHING) {
          response.data.forEach(applyPropagation);
          if (response.data.length > 0) {
            pushEvent('snapshot_propagation', {
              count: response.data.length,
              propagation: response.data,
            });
          }
        }
      },
      { immediate: true }
    ),
    watch(
      () => telemetry.streamedMetrics.value,
      () => {
        const payload = telemetry.streamedMetrics.value;
        if (!payload) return;

        switch (payload.kind) {
          case 'first':
            payload.peers_info.forEach((peer) => applyPeerInfo(peer, 'live'));
            payload.peers_status.forEach((status) => applyPeerStatus(status, 'live'));
            payload.propagation.forEach(applyPropagation);
            pushEvent('sse_first', payload);
            break;
          case 'peer_info': {
            applyPeerInfo(stripKind(payload) as PeerInfo, 'live');
            pushEvent('sse_peer_info', payload);
            break;
          }
          case 'peer_status': {
            applyPeerStatus(stripKind(payload) as PeerStatus, 'live');
            pushEvent('sse_peer_status', payload);
            break;
          }
          case 'propagation': {
            applyPropagation(stripKind(payload) as PeerPropagation);
            pushEvent('sse_propagation', payload);
            break;
          }
          case 'network_status': {
            pushEvent('sse_network_status', payload);
            break;
          }
          default:
            break;
        }
      }
    ),
  ];

  const liveRowsCount = computed(() =>
    Array.from(rowSourceMap.values()).filter((source) => source === 'live').length
  );
  const snapshotRowsCount = computed(() =>
    Array.from(rowSourceMap.values()).filter((source) => source === 'snapshot').length
  );
  const fallbackRowsCount = computed(() =>
    Array.from(rowSourceMap.values()).filter((source) => source === 'fallback').length
  );
  const lastObservedStatusAtMs = computed<number | null>(() => {
    const observedValues = Array.from(peersMap.values())
      .map((row) => row.status?.observed_at_ms ?? null)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

    if (!observedValues.length) return null;
    return Math.max(...observedValues);
  });

  return {
    metrics: telemetry.metrics,
    streamStatus: telemetry.streamStatus,
    peers: computed(() => Array.from(peersMap.values())),
    propagation: computed(() =>
      Array.from(propagationMap.values()).sort((left, right) => left.block - right.block)
    ),
    recentEvents: computed(() => eventLog.value.slice().reverse()),
    peerDataSource: computed<PeerTelemetrySource>(() => {
      const liveRows = liveRowsCount.value;
      const snapshotRows = snapshotRowsCount.value;
      const fallbackRows = fallbackRowsCount.value;

      if (liveRows === 0 && snapshotRows === 0 && fallbackRows === 0) return 'NONE';
      if (liveRows > 0 && snapshotRows === 0 && fallbackRows === 0) return 'LIVE_SSE';
      if (snapshotRows > 0 && liveRows === 0 && fallbackRows === 0) return 'SNAPSHOT';
      if (fallbackRows > 0 && liveRows === 0 && snapshotRows === 0) return 'FALLBACK';
      return 'MIXED';
    }),
    lastPeerSampleAtMs: computed(() => {
      const candidates = [
        lastObservedStatusAtMs.value,
        lastLiveSampleAtMs.value,
        lastSnapshotSampleAtMs.value,
        lastFallbackSampleAtMs.value,
      ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

      if (!candidates.length) return null;
      return Math.max(...candidates);
    }),
    fallbackPeersCount: fallbackRowsCount,
    isMetricsLoading: telemetry.isLoading,
    isPeersLoading: computed(
      () => peersMap.size === 0 && (telemetry.streamStatus.value === 'CONNECTING' || peersRequest.isLoading)
    ),
  };
}

export function __resetPeersTelemetryForTests() {
  resetPeersState();
  peersConsumers = 0;
}

function resetPeersState() {
  storedStops.forEach((stop) => stop());
  storedStops = [];
  peersState = null;
  peersScope?.stop();
  peersScope = null;
}
