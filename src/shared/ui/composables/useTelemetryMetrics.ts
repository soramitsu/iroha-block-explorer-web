import { ref, computed, watch, onScopeDispose, getCurrentScope, effectScope } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { EffectScope } from 'vue';
import type { NetworkMetrics, PeerMetrics } from '@/shared/api/schemas';
import { streamTelemetryMetrics } from '@/shared/api';

interface TelemetryState {
  metrics: Ref<NetworkMetrics | null>
  isLoading: ComputedRef<boolean>
  isUnavailable: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  streamStatus: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>
  streamedMetrics: Ref<PeerMetrics | null>
  reconnect: () => void
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
  const hasCurrentSnapshot = ref(false);

  const canUseEventSource = typeof window !== 'undefined' && typeof window.EventSource === 'function';
  const telemetryStream = canUseEventSource ? streamTelemetryMetrics() : null;
  const stripKind = <T extends { kind: string }>(payload: T): Omit<T, 'kind'> => {
    const next: Partial<T> = { ...payload };
    delete next.kind;
    return next as Omit<T, 'kind'>;
  };

  // The public live route emits a complete bootstrap snapshot before deltas.
  // `/v1/explorer/metrics` requires a signed global reader and must not be
  // requested by the anonymous Explorer, including during reconnects.
  stopWatches = telemetryStream
    ? [
        watch(
          () => telemetryStream.status.value,
          (value) => {
            streamStatus.value = value;
            if (value !== 'OPEN') hasCurrentSnapshot.value = false;
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
              hasCurrentSnapshot.value = streamStatus.value === 'OPEN';
            } else if (payload.kind === 'network_status') {
              // Strip the discriminant before assigning into the NetworkMetrics ref.
              metrics.value = stripKind(payload) as NetworkMetrics;
              hasCurrentSnapshot.value = streamStatus.value === 'OPEN';
            }
          },
          { immediate: true }
        ),
      ]
    : [];

  const isLoading = computed(() => !metrics.value && streamStatus.value !== 'CLOSED');
  const isUnavailable = computed(() => !metrics.value && streamStatus.value === 'CLOSED');
  const isStale = computed(() => !!metrics.value && !hasCurrentSnapshot.value);

  return {
    metrics,
    isLoading,
    isUnavailable,
    isStale,
    streamStatus,
    streamedMetrics,
    reconnect: () => telemetryStream?.reconnect(),
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
