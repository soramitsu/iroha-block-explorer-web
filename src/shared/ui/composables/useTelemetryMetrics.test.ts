import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, reactive, computed, effectScope, onScopeDispose } from 'vue';
import type { NetworkMetrics } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const hoisted = vi.hoisted(() => ({
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
    fetchNetworkMetrics: vi.fn().mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: hoisted.sampleMetrics,
    }),
    streamTelemetryMetrics: vi.fn(() => {
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
      };
    }),
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

import { useTelemetryMetrics, __resetTelemetryMetricsForTests } from './useTelemetryMetrics';

describe('useTelemetryMetrics', () => {
  beforeEach(() => {
    __resetTelemetryMetricsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates metrics from the initial HTTP response', async () => {
    const { metrics, isLoading } = useTelemetryMetrics();

    await flushAll();
    expect(metrics.value).toEqual(sampleMetrics);
    expect(isLoading.value).toBe(false);
  });

  it('exposes a closed stream state when telemetry live stream is unavailable', async () => {
    const { metrics, streamStatus, streamedMetrics } = useTelemetryMetrics();
    await flushAll();
    expect(metrics.value).toEqual(sampleMetrics);
    expect(streamStatus.value).toBe('CLOSED');
    expect(streamedMetrics.value).toBeNull();
  });

  it('updates metrics from the live stream when EventSource is available', async () => {
    vi.stubGlobal('EventSource', class {} as any);

    const { metrics, streamStatus, streamedMetrics } = useTelemetryMetrics();
    await flushAll();

    expect(metrics.value).toEqual(sampleMetrics);
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
