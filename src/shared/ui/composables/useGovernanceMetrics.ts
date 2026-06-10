import { computed, getCurrentScope, onScopeDispose, watch, effectScope } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { EffectScope } from 'vue';
import type { GovernanceCouncil, GovernanceUnlockStats } from '@/shared/api/schemas';
import { fetchGovernanceCouncil, fetchGovernanceUnlockStats } from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useGovernanceEvents } from './useGovernanceEvents';

interface GovernanceMetricsState {
  council: ComputedRef<GovernanceCouncil | null>
  unlockStats: ComputedRef<GovernanceUnlockStats | null>
  isCouncilLoading: ComputedRef<boolean>
  isUnlocksLoading: ComputedRef<boolean>
  streamStatus: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>
  refresh: () => void
}

let sharedState: GovernanceMetricsState | null = null;
let stopWatcher: (() => void) | null = null;
let consumers = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let sharedScope: EffectScope | null = null;

function clearRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function createGovernanceMetricsState(): GovernanceMetricsState {
  const councilRequest = setupAsyncData(() => fetchGovernanceCouncil(), { immediate: true });
  const unlockRequest = setupAsyncData(() => fetchGovernanceUnlockStats());
  const events = useGovernanceEvents();

  stopWatcher = watch(
    () => events.data.value,
    (message) => {
      if (typeof message !== 'string') return;
      try {
        const payload = JSON.parse(message);
        switch (payload.kind) {
          case 'CouncilUpdated':
            councilRequest.refetch();
            break;
          case 'UnlockStatsUpdated':
            unlockRequest.refetch();
            break;
          default:
            break;
        }
      } catch (error) {
        console.warn('[useGovernanceMetrics] Failed to parse governance event payload', error);
      }
    },
    { immediate: true }
  );

  watch(
    () => events.status.value,
    (status) => {
      if (status === 'OPEN') {
        councilRequest.refetch();
        unlockRequest.refetch();
      }
    },
    { immediate: true }
  );

  clearRefreshInterval();
  refreshInterval = setInterval(() => {
    if (events.status.value !== 'OPEN') {
      councilRequest.refetch();
      unlockRequest.refetch();
    }
  }, 60_000);

  const council = computed(() => {
    const data = councilRequest.data;
    return data?.status === SUCCESSFUL_FETCHING ? data.data : null;
  });

  const unlockStats = computed(() => {
    const data = unlockRequest.data;
    return data?.status === SUCCESSFUL_FETCHING ? data.data : null;
  });

  return {
    council,
    unlockStats,
    // `setupAsyncData` keeps stale data; expose loading only for the initial fetch
    // so the UI doesn't flash/blank on background refresh.
    isCouncilLoading: computed(() => council.value === null && Boolean(councilRequest.isLoading)),
    isUnlocksLoading: computed(() => unlockStats.value === null && Boolean(unlockRequest.isLoading)),
    streamStatus: events.status,
    refresh: () => {
      councilRequest.refetch();
      unlockRequest.refetch();
    },
  };
}

function resetState() {
  stopWatcher?.();
  stopWatcher = null;
  clearRefreshInterval();
  sharedState = null;
  sharedScope?.stop();
  sharedScope = null;
}

export function useGovernanceMetrics(): GovernanceMetricsState {
  if (!sharedState) {
    sharedScope = effectScope(true);
    const scopedState = sharedScope.run(() => createGovernanceMetricsState());
    if (!scopedState) {
      sharedScope.stop();
      sharedScope = null;
      throw new Error('[useGovernanceMetrics] failed to initialize shared governance metrics');
    }
    sharedState = scopedState;
  }

  consumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      consumers = Math.max(consumers - 1, 0);
      if (consumers === 0) {
        resetState();
      }
    });
  }

  return sharedState;
}

export function __resetGovernanceMetricsForTests() {
  consumers = 0;
  resetState();
}
