import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, computed, effectScope, onScopeDispose } from 'vue';
import type { NetworkMetrics } from '@/shared/api/schemas';

const hoisted = vi.hoisted(() => ({
  streamTelemetryMetricsMock: vi.fn(),
  reconnect: vi.fn(),
  protectedDiagnosticRequests: {
    fetchNetworkMetrics: vi.fn(),
    fetchToriiMetricsText: vi.fn(),
    fetchSumeragiStatus: vi.fn(),
    streamSumeragiStatus: vi.fn(),
    fetchSumeragiTelemetry: vi.fn(),
    fetchOnlinePeers: vi.fn(),
    fetchTelemetryPropagation: vi.fn(),
  },
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
  hoisted.streamTelemetryMetricsMock.mockImplementation(() => {
    const status = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED');
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
  });

  return {
    streamTelemetryMetrics: hoisted.streamTelemetryMetricsMock,
    ...hoisted.protectedDiagnosticRequests,
  };
});

import { useTelemetryMetrics, __resetTelemetryMetricsForTests } from './useTelemetryMetrics';

describe('useTelemetryMetrics', () => {
  beforeEach(() => {
    __resetTelemetryMetricsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
    hoisted.streamTelemetryMetricsMock.mockClear();
    hoisted.reconnect.mockClear();
    for (const request of Object.values(hoisted.protectedDiagnosticRequests)) {
      request.mockReset();
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes a closed stream state when telemetry live stream is unavailable', async () => {
    const { metrics, isLoading, streamStatus, streamedMetrics } = useTelemetryMetrics();
    await flushAll();
    expect(metrics.value).toBeNull();
    expect(isLoading.value).toBe(false);
    expect(streamStatus.value).toBe('CLOSED');
    expect(streamedMetrics.value).toBeNull();
  });

  it('retries the same public stream without selecting a different node', () => {
    vi.stubGlobal('EventSource', class {} as any);
    const telemetry = useTelemetryMetrics();
    telemetry.reconnect();
    expect(hoisted.reconnect).toHaveBeenCalledOnce();
    expect(hoisted.streamTelemetryMetricsMock).toHaveBeenCalledOnce();
  });

  it('can retry without EventSource support without fabricating data', () => {
    vi.stubGlobal('EventSource', undefined);
    const telemetry = useTelemetryMetrics();
    expect(() => telemetry.reconnect()).not.toThrow();
    expect(telemetry.metrics.value).toBeNull();
  });

  it('retains metrics during disconnect, replaces them after reconnect, and clears the last consumer scope', async () => {
    vi.stubGlobal('EventSource', class {} as any);
    const scope = effectScope();
    const telemetry = scope.run(() => useTelemetryMetrics())!;
    hoisted.emit({ kind: 'network_status', ...sampleMetrics });
    await nextTick();
    hoisted.listeners[0].status.value = 'CLOSED';
    await nextTick();
    expect(telemetry.metrics.value?.block).toBe(sampleMetrics.block);
    expect(telemetry.streamStatus.value).toBe('CLOSED');
    expect(telemetry.isLoading.value).toBe(false);
    telemetry.reconnect();
    expect(hoisted.reconnect).toHaveBeenCalledOnce();
    hoisted.emit({ kind: 'network_status', ...sampleMetrics, block: 12345 });
    await nextTick();
    expect(telemetry.metrics.value?.block).toBe(12345);
    expect(telemetry.streamStatus.value).toBe('OPEN');
    scope.stop();
    const nextScope = effectScope();
    expect(nextScope.run(() => useTelemetryMetrics())!.metrics.value).toBeNull();
    nextScope.stop();
  });

  it('updates metrics from the live stream when EventSource is available', async () => {
    vi.stubGlobal('EventSource', class {} as any);

    const { metrics, streamStatus, streamedMetrics } = useTelemetryMetrics();
    await flushAll();

    expect(metrics.value).toBeNull();
    expect(streamStatus.value).toBe('CLOSED');
    expect(streamedMetrics.value).toBeNull();

    hoisted.emit({
      kind: 'network_status',
      ...sampleMetrics,
      block: 1234,
    });

    await nextTick();

    expect(streamStatus.value).toBe('OPEN');
    expect(metrics.value?.block).toBe(1234);
    expect(streamedMetrics.value?.kind).toBe('network_status');
  });

  it('uses only the public live stream and never requests protected diagnostics', async () => {
    vi.stubGlobal('EventSource', class {} as any);

    useTelemetryMetrics();
    await flushAll();

    expect(hoisted.streamTelemetryMetricsMock).toHaveBeenCalledTimes(1);
    for (const request of Object.values(hoisted.protectedDiagnosticRequests)) {
      expect(request).not.toHaveBeenCalled();
    }
  });

  it('keeps the live stream active when the first consumer scope is disposed', async () => {
    vi.stubGlobal('EventSource', class {} as any);

    const firstScope = effectScope();
    const first = firstScope.run(() => useTelemetryMetrics());
    const secondScope = effectScope();
    const second = secondScope.run(() => useTelemetryMetrics());

    await flushAll();
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
  });
});

async function flushAll() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
