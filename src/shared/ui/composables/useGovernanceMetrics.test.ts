import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, computed, reactive, nextTick } from 'vue';
import { useGovernanceMetrics, __resetGovernanceMetricsForTests } from './useGovernanceMetrics';
import { __resetGovernanceEventsForTests } from './useGovernanceEvents';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

const shared = vi.hoisted(() => ({
  councilResponse: {
    status: 'ok',
    data: {
      epoch: 42,
      members: [{ account_id: { toString: () => SAMPLE_I105 } }],
    },
  },
  unlocksResponse: {
    status: 'ok',
    data: {
      height_current: 100,
      expired_locks_now: 2,
      referenda_with_expired: 1,
      last_sweep_height: 95,
    },
  },
  apiMocks: {
    fetchCouncil: null as ReturnType<typeof vi.fn> | null,
    fetchUnlocks: null as ReturnType<typeof vi.fn> | null,
  },
}));

vi.mock('@/shared/api', () => {
  shared.apiMocks.fetchCouncil = vi.fn().mockResolvedValue(shared.councilResponse);
  shared.apiMocks.fetchUnlocks = vi.fn().mockResolvedValue(shared.unlocksResponse);
  return {
    fetchGovernanceCouncil: shared.apiMocks.fetchCouncil,
    fetchGovernanceUnlockStats: shared.apiMocks.fetchUnlocks,
  };
});

vi.mock('@/shared/utils/setup-async-data', () => {
  return {
    setupAsyncData: <T,>(fn: () => Promise<T>) => {
      const raw = ref<T>();
      const isLoading = ref(true);
      const run = async () => {
        const result = await fn();
        raw.value = result;
        isLoading.value = false;
      };
      run();
      return reactive({
        data: computed(() => raw.value),
        isLoading,
        refetch: () => {
          isLoading.value = true;
          run();
        },
      });
    },
  };
});

describe('useGovernanceMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetGovernanceMetricsForTests();
    __resetGovernanceEventsForTests();
    shared.apiMocks.fetchCouncil?.mockClear().mockResolvedValue(shared.councilResponse);
    shared.apiMocks.fetchUnlocks?.mockClear().mockResolvedValue(shared.unlocksResponse);
  });

  afterEach(() => {
    __resetGovernanceMetricsForTests();
    __resetGovernanceEventsForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('loads governance metrics initially', async () => {
    const state = useGovernanceMetrics();
    await waitFor(() => state.council.value);
    expect(shared.apiMocks.fetchCouncil).toHaveBeenCalled();
    expect(shared.apiMocks.fetchUnlocks).toHaveBeenCalled();
    expect(state.council.value?.epoch).toBe(42);
    expect(state.unlockStats.value?.height_current).toBe(100);
    expect(state.streamStatus.value).toBe('CLOSED');
  });

  it('refetches governance metrics on polling interval while stream is closed', async () => {
    useGovernanceMetrics();
    await flushAll();
    shared.apiMocks.fetchCouncil?.mockClear();
    shared.apiMocks.fetchUnlocks?.mockClear();

    vi.advanceTimersByTime(60_000);
    await flushAll();

    expect(shared.apiMocks.fetchCouncil).toHaveBeenCalled();
    expect(shared.apiMocks.fetchUnlocks).toHaveBeenCalled();
  });
});

async function flushAll() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

async function waitFor(getter: () => unknown, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    if (getter()) return;
    await flushAll();
  }
  throw new Error('value not ready');
}
