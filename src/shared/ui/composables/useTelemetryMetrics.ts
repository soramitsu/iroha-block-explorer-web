import { ref, computed, watch, onScopeDispose, getCurrentScope, effectScope } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { EffectScope } from 'vue';
import type { NetworkMetrics, PeerMetrics } from '@/shared/api/schemas';
import { fetchNetworkMetrics, streamTelemetryMetrics } from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

interface TelemetryState {
  metrics: Ref<NetworkMetrics | null>
  isLoading: ComputedRef<boolean>
  streamStatus: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>
  streamedMetrics: Ref<PeerMetrics | null>
}

let telemetryState: TelemetryState | null = null;
let stopWatches: Array<() => void> = [];
let consumers = 0;
let telemetryScope: EffectScope | null = null;

export function useTelemetryMetrics(): TelemetryState {
  if (!telemetryState) {
    telemetryScope = effectScope(true);
    const scopedState = telemetryScope.run(() => createTelemetryMetricsState());
    if (!scopedState) {
      telemetryScope.stop();
      telemetryScope = null;
      throw new Error('[useTelemetryMetrics] failed to initialize shared telemetry state');
    }
    telemetryState = scopedState;
  }

  consumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      consumers = Math.max(consumers - 1, 0);
      if (consumers === 0) {
        resetTelemetryState();
      }
    });
  }

  return telemetryState;
}

function createTelemetryMetricsState(): TelemetryState {
  const metrics = ref<NetworkMetrics | null>(null);
  const streamStatus = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED');
  const streamedMetrics = ref<PeerMetrics | null>(null);

  const canUseEventSource = typeof window !== 'undefined' && 'EventSource' in window;
  const telemetryStream = canUseEventSource ? streamTelemetryMetrics() : null;
  const stripKind = <T extends { kind: string }>(payload: T): Omit<T, 'kind'> => {
    const next: Partial<T> = { ...payload };
    delete next.kind;
    return next as Omit<T, 'kind'>;
  };

  const metricsRequest = setupAsyncData(() => fetchNetworkMetrics(), {
    interval: 5000,
    pollWhen: () => streamStatus.value !== 'OPEN',
  });

  stopWatches = [
    watch(
      () => metricsRequest.data,
      (response) => {
        if (response?.status === SUCCESSFUL_FETCHING) {
          metrics.value = response.data;
        }
      },
      { immediate: true }
    ),
    ...(telemetryStream
      ? [
          watch(
            () => telemetryStream.status.value,
            (value) => {
              streamStatus.value = value;
            },
            { immediate: true }
          ),
          watch(
            () => telemetryStream.data.value,
            (payload) => {
              if (!payload) return;
              streamedMetrics.value = payload;
              if (payload.kind === 'first') {
                metrics.value = payload.network_status;
              } else if (payload.kind === 'network_status') {
                // Strip the discriminant before assigning into the NetworkMetrics ref.
                metrics.value = stripKind(payload) as NetworkMetrics;
              }
            },
            { immediate: true }
          ),
        ]
      : []),
  ];

  const isLoading = computed(() => !metrics.value && metricsRequest.isLoading);

  return {
    metrics,
    isLoading,
    streamStatus,
    streamedMetrics,
  };
}

export function __resetTelemetryMetricsForTests() {
  resetTelemetryState();
  consumers = 0;
}

function resetTelemetryState() {
  stopWatches.forEach((stop) => stop());
  stopWatches = [];
  telemetryState = null;
  telemetryScope?.stop();
  telemetryScope = null;
}
