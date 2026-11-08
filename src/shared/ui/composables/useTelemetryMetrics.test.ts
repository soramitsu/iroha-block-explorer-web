import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, computed, effectScope, onScopeDispose } from 'vue';
import type { NetworkMetrics } from '@/shared/api/schemas';

const hoisted = vi.hoisted(() => ({
  fetchNetworkMetrics: vi.fn(),
  reconnect: vi.fn(),
  sampleMetrics: {
    peers: 5,
    domains: 3,
    accounts: 42,
    assets: 17,
    transactions_accepted: 11,
    transactions_rejected: 2,
    block: 99,
    block_created_at: new Date(),
    finalized_block: 95,
    avg_commit_time: { ms: 1200 },
    avg_block_time: { ms: 6000 },
  } satisfies NetworkMetrics,
  listeners: [] as Array<{
    status: ReturnType<typeof ref<'CONNECTING' | 'OPEN' | 'CLOSED'>>
    payload: ReturnType<typeof ref<any>>
  }>,
  emit(payload: any) {
    for (const listener of this.listeners) {
      listener.status.value = 'OPEN';
      listener.payload.value = payload;
    }
  },
}));

const sampleMetrics = hoisted.sampleMetrics;

vi.mock('@/shared/api', () => {
  return {
    fetchNetworkMetrics: hoisted.fetchNetworkMetrics,
    streamTelemetryMetrics: vi.fn(() => {
      const status = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING');
      const payload = ref<any>(null);
      const listener = { status, payload };
      hoisted.listeners.push(listener);
      onScopeDispose(() => {
        const index = hoisted.listeners.indexOf(listener);
        if (index >= 0) hoisted.listeners.splice(index, 1);
        status.value = 'CLOSED';
        payload.value = null;
      });
      return {
        status,
        data: computed(() => payload.value),
        reconnect: hoisted.reconnect,
      };
    }),
  };
});

import { useTelemetryMetrics, __resetTelemetryMetricsForTests } from './useTelemetryMetrics';

describe('useTelemetryMetrics', () => {
  beforeEach(() => {
    __resetTelemetryMetricsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
    hoisted.fetchNetworkMetrics.mockClear();
    hoisted.reconnect.mockClear();
    vi.stubGlobal('EventSource', class {} as any);
  });

  afterEach(() => {
    __resetTelemetryMetricsForTests();
    expect(hoisted.fetchNetworkMetrics).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('loads metrics from the public stream bootstrap without a privileged HTTP request', async () => {
    const { metrics, isLoading, isUnavailable, isStale } = useTelemetryMetrics();
    expect(metrics.value).toBeNull();
    expect(isLoading.value).toBe(true);

    hoisted.emit({ kind: 'first', network_status: sampleMetrics, peers_info: [], peers_status: [], propagation: [] });
    await nextTick();

    expect(metrics.value).toEqual(sampleMetrics);
    expect(isLoading.value).toBe(false);
    expect(isUnavailable.value).toBe(false);
    expect(isStale.value).toBe(false);
  });

  it('retries only the existing public telemetry stream', () => {
    const telemetry = useTelemetryMetrics();
    telemetry.reconnect();
    expect(hoisted.reconnect).toHaveBeenCalledOnce();
    expect(hoisted.listeners).toHaveLength(1);
  });

  it('reports unavailable data when the browser has no EventSource', () => {
    vi.stubGlobal('EventSource', undefined);
    const { metrics, streamStatus, streamedMetrics, isLoading, isUnavailable } = useTelemetryMetrics();
    expect(metrics.value).toBeNull();
    expect(streamStatus.value).toBe('CLOSED');
    expect(streamedMetrics.value).toBeNull();
    expect(isLoading.value).toBe(false);
    expect(isUnavailable.value).toBe(true);
    expect(hoisted.listeners).toHaveLength(0);
    expect(() => useTelemetryMetrics().reconnect()).not.toThrow();
    expect(hoisted.reconnect).not.toHaveBeenCalled();
  });

  it('reports an unavailable stream before any snapshot and stays empty while reconnecting', async () => {
    const { metrics, isLoading, isUnavailable } = useTelemetryMetrics();
    hoisted.listeners[0].status.value = 'CLOSED';
    await nextTick();
    expect(metrics.value).toBeNull();
    expect(isUnavailable.value).toBe(true);
    expect(isLoading.value).toBe(false);

    hoisted.listeners[0].status.value = 'CONNECTING';
    await nextTick();
    expect(metrics.value).toBeNull();
    expect(isUnavailable.value).toBe(false);
    expect(isLoading.value).toBe(true);
  });

  it('updates metrics from the live stream when EventSource is available', async () => {
    const { metrics, streamStatus, streamedMetrics } = useTelemetryMetrics();
    expect(metrics.value).toBeNull();
    expect(streamStatus.value).toBe('CONNECTING');
    expect(streamedMetrics.value).toBeNull();

    hoisted.emit({
      kind: 'network_status',
      ...sampleMetrics,
      block: 1234,
    });

    await nextTick();

    expect(streamStatus.value).toBe('OPEN');
    expect(metrics.value?.block).toBe(1234);
    expect(metrics.value).not.toHaveProperty('kind');
    expect(streamedMetrics.value?.kind).toBe('network_status');
  });

  it('keeps the last real metrics visibly stale until a reconnect snapshot arrives', async () => {
    const { metrics, isLoading, isUnavailable, isStale } = useTelemetryMetrics();
    hoisted.emit({ kind: 'network_status', ...sampleMetrics });
    await nextTick();
    hoisted.listeners[0].status.value = 'CLOSED';
    await nextTick();
    expect(metrics.value).toEqual(sampleMetrics);
    expect(isLoading.value).toBe(false);
    expect(isUnavailable.value).toBe(false);
    expect(isStale.value).toBe(true);

    hoisted.listeners[0].status.value = 'CONNECTING';
    await nextTick();
    expect(isStale.value).toBe(true);
    hoisted.listeners[0].status.value = 'OPEN';
    await nextTick();
    expect(isStale.value).toBe(true);
    hoisted.emit({ kind: 'peer_removed', url: 'https://peer.example' });
    await nextTick();
    expect(isStale.value).toBe(true);

    hoisted.emit({ kind: 'first', network_status: { ...sampleMetrics, block: 100 }, peers_info: [], peers_status: [], propagation: [] });
    await nextTick();
    expect(metrics.value?.block).toBe(100);
    expect(isStale.value).toBe(false);
  });

  it('keeps network metrics while delivering unrelated peer events to other consumers', async () => {
    const { metrics, streamedMetrics } = useTelemetryMetrics();
    hoisted.emit({ kind: 'network_status', ...sampleMetrics });
    await nextTick();
    hoisted.emit({ kind: 'peer_removed', url: 'https://peer.example' });
    await nextTick();
    expect(metrics.value).toEqual(sampleMetrics);
    expect(streamedMetrics.value?.kind).toBe('peer_removed');
  });

  it('keeps the live stream active when the first consumer scope is disposed', async () => {
    vi.stubGlobal('EventSource', class {} as any);

    const firstScope = effectScope();
    const first = firstScope.run(() => useTelemetryMetrics());
    const secondScope = effectScope();
    const second = secondScope.run(() => useTelemetryMetrics());

    await nextTick();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(hoisted.listeners).toHaveLength(1);

    firstScope.stop();
    expect(hoisted.listeners).toHaveLength(1);

    hoisted.emit({
      kind: 'network_status',
      ...sampleMetrics,
      block: 7777,
    });
    await nextTick();

    expect(second?.metrics.value?.block).toBe(7777);
    secondScope.stop();
    expect(hoisted.listeners).toHaveLength(0);
  });
});
