import { ref, computed, watch, onScopeDispose, getCurrentScope, effectScope } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { EffectScope } from 'vue';
import type { SumeragiStatus as SumeragiStatusSchema } from '@/shared/api/schemas';
import { fetchSumeragiStatus, streamSumeragiStatus } from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

interface SumeragiStatusState {
  status: Ref<SumeragiStatusSchema | null>
  isLoading: ComputedRef<boolean>
  lastUpdatedAtMs: Ref<number | null>
  // Effective connection indicator for the UI:
  // - OPEN: SSE stream is open
  // - CONNECTING: SSE is trying to connect and we don't have a snapshot yet
  // - POLLING: SSE is unavailable/closed but we have snapshot data and keep it fresh via polling
  // - CLOSED: neither SSE nor a snapshot is available
  streamStatus: Ref<'CONNECTING' | 'OPEN' | 'POLLING' | 'CLOSED'>
}

let statusState: SumeragiStatusState | null = null;
let statusWatchers: Array<() => void> = [];
let statusConsumers = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let statusScope: EffectScope | null = null;

function clearRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export function useSumeragiStatus(): SumeragiStatusState {
  if (!statusState) {
    statusScope = effectScope(true);
    const scopedState = statusScope.run(() => createSumeragiStatusState());
    if (!scopedState) {
      statusScope.stop();
      statusScope = null;
      throw new Error('[useSumeragiStatus] failed to initialize shared sumeragi status');
    }
    statusState = scopedState;
  }

  statusConsumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      statusConsumers = Math.max(statusConsumers - 1, 0);
      if (statusConsumers === 0) {
        resetSumeragiStatusState();
      }
    });
  }

  return statusState;
}

function createSumeragiStatusState(): SumeragiStatusState {
  const status = ref<SumeragiStatusSchema | null>(null);
  const lastUpdatedAtMs = ref<number | null>(null);
  const statusRequest = setupAsyncData(() => fetchSumeragiStatus());
  const { data: streamedStatus, status: sseStreamStatus } = streamSumeragiStatus();

  const applyStatus = (payload: SumeragiStatusSchema) => {
    status.value = payload;
    lastUpdatedAtMs.value = Date.now();
  };

  statusWatchers = [
    watch(
      () => statusRequest.data,
      (response) => {
        if (response?.status !== SUCCESSFUL_FETCHING) return;
        // When the SSE stream is unavailable/closed, keep the view updated via polling.
        // But when the stream is open, avoid overwriting newer streamed payloads with
        // late-arriving HTTP responses.
        if (!status.value || sseStreamStatus.value !== 'OPEN') {
          applyStatus(response.data);
        }
      },
      { immediate: true }
    ),
    watch(
      () => streamedStatus.value,
      () => {
        if (streamedStatus.value) {
          applyStatus(streamedStatus.value);
        }
      }
    ),
  ];

  clearRefreshInterval();
  refreshInterval = setInterval(() => {
    if (sseStreamStatus.value === 'OPEN') return;
    if (statusRequest.isLoading) return;
    statusRequest.refetch();
  }, 10_000);

  const streamStatus = computed<'CONNECTING' | 'OPEN' | 'POLLING' | 'CLOSED'>(() => {
    if (sseStreamStatus.value === 'OPEN') return 'OPEN';
    if (status.value) return 'POLLING';
    if (sseStreamStatus.value === 'CONNECTING') return 'CONNECTING';
    return 'CLOSED';
  });

  const isLoading = computed(() => !status.value && (statusRequest.isLoading || sseStreamStatus.value === 'CONNECTING'));

  return {
    status,
    lastUpdatedAtMs,
    streamStatus,
    isLoading,
  };
}

function resetSumeragiStatusState() {
  statusWatchers.forEach((stop) => stop());
  statusWatchers = [];
  clearRefreshInterval();
  statusState = null;
  statusScope?.stop();
  statusScope = null;
}

export function __resetSumeragiStatusForTests() {
  resetSumeragiStatusState();
  statusConsumers = 0;
}
