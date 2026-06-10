import { ref, computed, watch, onScopeDispose, getCurrentScope, effectScope } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { EffectScope } from 'vue';
import type { SumeragiTelemetry as SumeragiTelemetrySchema } from '@/shared/api/schemas';
import { fetchSumeragiTelemetry } from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

interface SumeragiTelemetryState {
  telemetry: Ref<SumeragiTelemetrySchema | null>
  isLoading: ComputedRef<boolean>
  refresh: () => void
}

let telemetryState: SumeragiTelemetryState | null = null;
let telemetryWatchStop: (() => void) | null = null;
let telemetryConsumers = 0;
let telemetryScope: EffectScope | null = null;

export function useSumeragiTelemetry(): SumeragiTelemetryState {
  if (!telemetryState) {
    telemetryScope = effectScope(true);
    const scopedState = telemetryScope.run(() => createSumeragiTelemetryState());
    if (!scopedState) {
      telemetryScope.stop();
      telemetryScope = null;
      throw new Error('[useSumeragiTelemetry] failed to initialize shared sumeragi telemetry');
    }
    telemetryState = scopedState;
  }

  telemetryConsumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      telemetryConsumers = Math.max(telemetryConsumers - 1, 0);
      if (telemetryConsumers === 0) {
        resetTelemetryState();
      }
    });
  }

  return telemetryState;
}

function createSumeragiTelemetryState(): SumeragiTelemetryState {
  const telemetry = ref<SumeragiTelemetrySchema | null>(null);
  const telemetryRequest = setupAsyncData(() => fetchSumeragiTelemetry());

  telemetryWatchStop = watch(
    () => telemetryRequest.data,
    (response) => {
      if (response?.status === SUCCESSFUL_FETCHING) {
        telemetry.value = response.data;
      }
    },
    { immediate: true }
  );

  const isLoading = computed(() => telemetryRequest.isLoading && telemetry.value === null);

  const refresh = () => telemetryRequest.refetch();

  return {
    telemetry,
    isLoading,
    refresh,
  };
}

function resetTelemetryState() {
  telemetryWatchStop?.();
  telemetryWatchStop = null;
  telemetryState = null;
  telemetryScope?.stop();
  telemetryScope = null;
}

export function __resetSumeragiTelemetryForTests() {
  resetTelemetryState();
  telemetryConsumers = 0;
}
