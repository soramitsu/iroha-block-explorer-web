import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const visibility = vi.hoisted(() => ({ state: null as null | { value: string } }));

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  return {
    useDocumentVisibility: () => {
      const state = ref('visible');
      visibility.state = state;
      return state;
    },
  };
});

vi.mock('@/shared/api', () => ({ fetchNodeStatus: vi.fn() }));

const { useNodeStatusPoll } = await import('./useNodeStatusPoll');

const SNAPSHOT = { blocks: 7, queue_size: 0 } as never;

let scope: ReturnType<typeof effectScope>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T08:00:00Z'));
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});

describe('useNodeStatusPoll', () => {
  it('polls immediately and on the interval, stamping local arrival time', async () => {
    const fetchStatus = vi.fn(async () => ({ status: SUCCESSFUL_FETCHING, data: SNAPSHOT }) as const);
    const poll = scope.run(() => useNodeStatusPoll(5000, fetchStatus as never))!;
    expect(poll.isLoading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(poll.status.value).toBe(SNAPSHOT);
    expect(poll.receivedAtMs.value).toBe(Date.parse('2026-10-24T08:00:00Z'));
    expect(poll.isLoading.value).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good sample when a poll fails', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: SNAPSHOT })
      .mockResolvedValueOnce({ status: UNKNOWN_ERROR, error: new Error('busy') });
    const poll = scope.run(() => useNodeStatusPoll(5000, fetchStatus))!;
    await vi.advanceTimersByTimeAsync(5000);

    expect(poll.status.value).toBe(SNAPSHOT);
    expect(poll.error.value?.message).toBe('busy');
  });

  it('pauses while the page is hidden and resumes when shown', async () => {
    const fetchStatus = vi.fn(async () => ({ status: SUCCESSFUL_FETCHING, data: SNAPSHOT }) as const);
    scope.run(() => useNodeStatusPoll(5000, fetchStatus as never));
    await vi.advanceTimersByTimeAsync(0);
    visibility.state!.value = 'hidden';
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    visibility.state!.value = 'visible';
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('stops polling when its scope ends', async () => {
    const fetchStatus = vi.fn(async () => ({ status: SUCCESSFUL_FETCHING, data: SNAPSHOT }) as const);
    scope.run(() => useNodeStatusPoll(5000, fetchStatus as never));
    await vi.advanceTimersByTimeAsync(0);
    scope.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
