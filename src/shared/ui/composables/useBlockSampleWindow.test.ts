import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import type { BlockSample, CanonicalBlockSample } from '@/shared/lib/chain-analytics';
import { requireIrohaHashLiteral32 } from '@/shared/lib/iroha-hash';
import type { RetainedBlockWindow } from './block-window-retention';

const streamState = vi.hoisted(() => ({
  connectFrom: vi.fn(),
  onBlock: null as null | (() => void),
  streaming: null as null | { value: boolean },
  /** The polling tick, run by hand. */
  poll: null as null | (() => void),
}));

vi.mock('./useBlockStream', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useBlockStream: (onBlock: () => void) => {
      streamState.onBlock = onBlock;
      const streaming = vueRef(false);
      streamState.streaming = streaming;
      return { isSupported: true, isStreaming: streaming, connectFrom: streamState.connectFrom, disconnect: vi.fn() };
    },
  };
});

vi.mock('@vueuse/core', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useDocumentVisibility: () => vueRef('visible'),
    useIntervalFn: (tick: () => void) => {
      streamState.poll = tick;
    },
  };
});

vi.mock('@/shared/api', () => ({ fetchBlockSamples: vi.fn() }));

const { useBlockSampleWindow, BLOCK_SAMPLE_PAGE_LIMIT: PAGE } = await import('./useBlockSampleWindow');

const T0 = Date.UTC(2026, 9, 24, 7, 0, 0);

interface PageArgs {
  limit?: number
  cursor?: string | null
}

function block(height: number): CanonicalBlockSample {
  return { height, hash: requireIrohaHashLiteral32((height * 2 + 1).toString(16).padStart(64, '0')), createdAtMs: T0 + height * 1000, transactionsTotal: height % 3, transactionsRejected: 0 };
}

/** A chain served newest-first with opaque cursors; `failRequest(n)` fails the n-th next request once. */
function chain(initialHead: number, hashOffset = 0) {
  const state = { head: initialHead, failAt: null as number | null, calls: 0 };
  const fetchPage = vi.fn(async ({ limit, cursor }: PageArgs) => {
    state.calls += 1;
    if (state.failAt === state.calls) return { status: UNKNOWN_ERROR, error: new Error('busy') } as const;
    const top = cursor ? Number(cursor.slice(1)) : state.head;
    const items = Array.from({ length: Math.min(limit ?? PAGE, top) }, (_, index) => ({ ...block(top - index), hash: block(top - index + hashOffset).hash }));
    const bottom = top - items.length;
    return {
      status: SUCCESSFUL_FETCHING,
      data: { items, nextCursor: bottom > 0 ? `c${bottom}` : null },
    } as const;
  });
  function grow(to: number) {
    state.head = to;
  }
  function failRequest(nthFromNow: number) {
    state.failAt = state.calls + nthFromNow;
  }
  return { fetchPage, grow, failRequest };
}

/** Holds every page request until the test releases it, oldest first. */
function deferredPages(fetchPage: ReturnType<typeof chain>['fetchPage']) {
  const releases: Array<() => void> = [];
  const deferred = vi.fn(
    (args: PageArgs) =>
      new Promise<Awaited<ReturnType<typeof fetchPage>>>((resolve) => {
        releases.push(() => resolve(fetchPage(args)));
      })
  );
  return { deferred, releases };
}

/** A retention that keeps windows in memory and records every save. */
function memoryRetention(initial: RetainedBlockWindow | null = null) {
  const state = { kept: initial, saves: [] as RetainedBlockWindow[] };
  return {
    state,
    retention: {
      load: () => state.kept,
      save: (window: RetainedBlockWindow) => {
        state.saves.push(window);
        state.kept = window;
      },
    },
  };
}

function keptWindow(from: number, to: number, nextCursor: string | null, target = 0): RetainedBlockWindow {
  return {
    samples: Array.from({ length: to - from + 1 }, (_, index) => block(from + index)),
    reachedGenesis: false,
    readAt: T0,
    acquiredAt: T0,
    cursor: nextCursor === null ? null : { nextCursor, visitedCursors: [] },
    target,
  };
}

async function settle() {
  for (let step = 0; step < 40; step += 1) await Promise.resolve();
  await nextTick();
}

function contiguous(samples: readonly BlockSample[]) {
  return samples.every((sample, index) => index === 0 || sample.height === samples[index - 1]!.height + 1);
}

let scope: ReturnType<typeof effectScope>;

beforeEach(() => {
  scope = effectScope();
  streamState.connectFrom.mockReset();
  streamState.onBlock = null;
  streamState.poll = null;
});

afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});

describe('useBlockSampleWindow: initial scan', () => {
  it('fills the window newest-first and exposes it oldest-first', async () => {
    const { fetchPage } = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(150), { fetchPage }))!;
    await settle();

    expect(fetchPage).toHaveBeenCalledTimes(Math.ceil(150 / PAGE));
    expect(fetchPage.mock.calls[1]?.[0]).toEqual({ limit: Math.min(PAGE, 150 - PAGE), cursor: `c${1102 - PAGE}` });
    expect(window.samples.value).toHaveLength(150);
    expect(window.samples.value[0]?.height).toBe(953);
    expect(window.samples.value[149]?.height).toBe(1102);
    expect(window.isLoading.value).toBe(false);
    expect(window.coverage.value).toEqual({ loaded: 150, target: 150, complete: true });
    expect(window.lastUpdatedAt.value).not.toBeNull();
    expect(streamState.connectFrom).toHaveBeenLastCalledWith(1103);
  });

  it('requests 100 rows and follows every budget-shortened page in the same cursor chain', async () => {
    const source = chain(1102);
    const fetchPage = vi.fn((args: PageArgs) => source.fetchPage({ ...args, limit: Math.min(args.limit ?? PAGE, 3) }));
    const window = scope.run(() => useBlockSampleWindow(ref(200), { fetchPage }))!;
    for (let pass = 0; pass < 8; pass += 1) await settle();

    expect(fetchPage.mock.calls[0]?.[0]).toEqual({ limit: 100, cursor: null });
    expect(fetchPage).toHaveBeenCalledTimes(67);
    expect(fetchPage.mock.calls.slice(1).every((call) => call[0].cursor !== null)).toBe(true);
    expect(window.samples.value).toHaveLength(200);
    expect(contiguous(window.samples.value)).toBe(true);
    expect(window.coverage.value.complete).toBe(true);
    expect(window.error.value).toBeNull();
  });

  it('bounds advancing continuations that never yield any new rows', async () => {
    let request = 0;
    const fetchPage = vi.fn(async () => {
      request += 1;
      const items: CanonicalBlockSample[] = [];
      return { status: SUCCESSFUL_FETCHING, data: { items, nextCursor: `empty-${request}` } } as const;
    });
    const window = scope.run(() => useBlockSampleWindow(ref(200), { fetchPage }))!;
    await settle();

    expect(fetchPage).toHaveBeenCalledTimes(5);
    expect(window.error.value?.message).toBe('Block history scan did not fill the window');
    expect(window.samples.value).toEqual([]);
    expect(window.isScanning.value).toBe(false);
  });

  it('requests only the rows still missing, so large windows never overshoot', async () => {
    const { fetchPage } = chain(5000);
    const window = scope.run(() => useBlockSampleWindow(ref(2000), { fetchPage }))!;
    await settle();

    const limits = fetchPage.mock.calls.map((call) => call[0].limit ?? 0);
    expect(limits.reduce((sum, limit) => sum + limit, 0)).toBe(2000);
    expect(limits[limits.length - 1]).toBe(2000 % PAGE || PAGE);
    expect(window.error.value).toBeNull();
    expect(window.samples.value).toHaveLength(2000);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('marks a short chain complete at genesis', async () => {
    const { fetchPage } = chain(42);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage }))!;
    await settle();

    expect(window.samples.value).toHaveLength(42);
    expect(window.reachedGenesis.value).toBe(true);
    expect(window.coverage.value.complete).toBe(true);
  });

  it('surfaces a failed page without inventing rows', async () => {
    const fetchPage = vi.fn(async () => ({ status: UNKNOWN_ERROR, error: new Error('torii down') }) as const);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: fetchPage as never }))!;
    await settle();

    expect(window.error.value?.message).toBe('torii down');
    expect(window.samples.value).toEqual([]);
    expect(window.isScanning.value).toBe(false);
  });

  it('describes non-error failures by status', async () => {
    const fetchPage = vi.fn(async () => ({ status: NOT_FOUND }) as const);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: fetchPage as never }))!;
    await settle();
    expect(window.error.value?.message).toContain(NOT_FOUND);
  });

  it('rejects a feed that repeats its continuation', async () => {
    const fetchPage = vi.fn(async () => ({
      status: SUCCESSFUL_FETCHING,
      data: { items: [], nextCursor: 'same' },
    }) as const);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: fetchPage as never }))!;
    await settle();
    expect(window.error.value?.message).toMatch(/did not advance/);
  });
});

describe('useBlockSampleWindow: growing the window', () => {
  it('continues from the stored cursor when the window grows', async () => {
    const { fetchPage } = chain(1102);
    const size = ref(100);
    const window = scope.run(() => useBlockSampleWindow(size, { fetchPage }))!;
    await settle();
    const initial = fetchPage.mock.calls.length;

    size.value = 250;
    await settle();
    expect(fetchPage.mock.calls[initial]?.[0].cursor).toBe(`c${1102 - 100}`);
    expect(window.samples.value).toHaveLength(250);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('serializes growth while a page is still in flight', async () => {
    const { deferred, releases } = deferredPages(chain(1102).fetchPage);
    const size = ref(100);
    const window = scope.run(() => useBlockSampleWindow(size, { fetchPage: deferred as never }))!;
    await settle();
    expect(deferred).toHaveBeenCalledTimes(1);

    size.value = 250;
    size.value = 300;
    await settle();
    // Still one request in flight: the running scan picks up the new size itself.
    expect(deferred).toHaveBeenCalledTimes(1);

    while (releases.length > 0) {
      releases.shift()!();
      await settle();
    }
    expect(window.error.value).toBeNull();
    expect(window.isScanning.value).toBe(false);
    expect(window.samples.value).toHaveLength(300);
    const cursors = deferred.mock.calls.map((call) => call[0].cursor);
    expect(new Set(cursors).size).toBe(cursors.length);
  });
});

describe('useBlockSampleWindow: live head', () => {
  it('re-reads the head on a stream signal and reconnects it to the window', async () => {
    vi.useFakeTimers();
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();

    source.grow(1105);
    streamState.onBlock?.();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1105);
    expect(window.samples.value).toHaveLength(100);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('keeps the previous coherent window when a refresh page fails, then repairs it', async () => {
    const source = chain(2000);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();
    const before = window.samples.value;

    source.grow(2000 + 3 * PAGE);
    source.failRequest(2);
    await window.refresh();
    await settle();
    expect(window.samples.value).toBe(before);
    expect(window.error.value?.message).toBe('busy');

    await window.refresh();
    await settle();
    expect(window.error.value).toBeNull();
    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(2000 + 3 * PAGE);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('runs one trailing pass for signals that arrive mid-refresh', async () => {
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();

    const first = window.refresh();
    source.grow(1110);
    window.refresh();
    window.refresh();
    await first;
    await settle();
    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1110);
  });

  it('reconciles the head whenever the stream (re)opens', async () => {
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();
    const calls = source.fetchPage.mock.calls.length;

    source.grow(1104);
    streamState.streaming!.value = true;
    await settle();
    expect(source.fetchPage.mock.calls.length).toBe(calls + 1);
    expect(window.isLive.value).toBe(true);
    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1104);
  });

  it('keeps retrying an unconfirmed head while the stream stays open, observing only up to the last read', async () => {
    vi.useFakeTimers();
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();
    streamState.streaming!.value = true;
    await settle();
    expect(window.isReconciled.value).toBe(true);
    expect(window.observedUntil(T0)).toBe(T0);

    const lastRead = window.lastUpdatedAt.value;
    source.grow(1103);
    source.failRequest(1);
    streamState.onBlock?.();
    // Announced but not applied: the present is no longer observed.
    expect(window.isReconciled.value).toBe(false);
    expect(window.observedUntil(T0)).toBe(lastRead);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(window.error.value?.message).toBe('busy');
    expect(window.isReconciled.value).toBe(false);

    // The chain idles, so no further announcement arrives; the poll retries anyway.
    streamState.poll?.();
    await settle();
    expect(window.isReconciled.value).toBe(true);
    expect(window.error.value).toBeNull();
    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1103);
  });

  it('does not poll while an open stream has nothing unapplied', async () => {
    const source = chain(1102);
    scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }));
    await settle();
    streamState.streaming!.value = true;
    await settle();
    const calls = source.fetchPage.mock.calls.length;
    streamState.poll?.();
    await settle();
    expect(source.fetchPage.mock.calls.length).toBe(calls);

    streamState.streaming!.value = false;
    await settle();
    streamState.poll?.();
    await settle();
    expect(source.fetchPage.mock.calls.length).toBe(calls + 1);
  });

  it('rescans when the head moved further than the refresh can reconnect', async () => {
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage }))!;
    await settle();

    source.grow(1102 + 10 * PAGE);
    await window.refresh();
    await settle();

    const heights = window.samples.value.map((sample) => sample.height);
    expect(heights[heights.length - 1]).toBe(1102 + 10 * PAGE);
    expect(heights).toHaveLength(100);
    expect(contiguous(window.samples.value)).toBe(true);
  });
});

describe('useBlockSampleWindow: retention', () => {
  it('discards retained heights when the same-genesis endpoint resets to a shorter chain', async () => {
    const source = chain(50);
    const { retention } = memoryRetention(keptWindow(1003, 1102, 'c1002'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }))!;
    await settle();

    expect(window.samples.value.map((sample) => sample.height)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(window.reachedGenesis.value).toBe(true);
    expect(window.error.value).toBeNull();
    expect(window.isReconciled.value).toBe(true);
  });

  it.each([1102, 1102 + PAGE])('discards a regrown chain at tip %i when the retained hash anchor differs', async (tip) => {
    const source = chain(tip, 10_000);
    const { retention } = memoryRetention(keptWindow(1003, 1102, 'c1002'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }))!;
    await settle();

    expect(window.samples.value).toHaveLength(100);
    expect(window.samples.value.at(-1)?.height).toBe(tip);
    expect(window.samples.value.every((sample) => sample.hash === block(sample.height + 10_000).hash)).toBe(true);
    expect(window.error.value).toBeNull();
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('reads an overlapping anchor before accepting an adjacent page as the same chain', async () => {
    const { deferred, releases } = deferredPages(chain(1102 + PAGE).fetchPage);
    const { retention } = memoryRetention(keptWindow(1003, 1102, 'c1002'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: deferred as never, retention }))!;

    releases.shift()!();
    await settle();
    expect(window.samples.value.at(-1)?.height).toBe(1102);
    expect(window.isReconciled.value).toBe(false);
    expect(deferred).toHaveBeenCalledTimes(2);

    releases.shift()!();
    await settle();
    expect(window.samples.value.at(-1)?.height).toBe(1102 + PAGE);
    expect(window.isReconciled.value).toBe(true);
  });

  it('keeps an older-page failure visible after concurrent and later head refreshes succeed', async () => {
    const source = chain(1102);
    const { deferred, releases } = deferredPages(source.fetchPage);
    const { retention } = memoryRetention(keptWindow(1003, 1102, 'c1002'));
    const window = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: deferred as never, retention }))!;
    expect(releases).toHaveLength(2);

    source.failRequest(1);
    releases.pop()!(); // The extension fails before the head response arrives.
    await settle();
    expect(window.error.value?.message).toBe('busy');
    releases.shift()!();
    await settle();
    expect(window.error.value?.message).toBe('busy');
    expect(window.coverage.value.complete).toBe(false);
    expect(window.isScanning.value).toBe(false);

    const refreshed = window.refresh();
    releases.shift()!();
    await refreshed;
    expect(window.error.value?.message).toBe('busy');

    const retried = window.retry();
    while (releases.length > 0) {
      releases.shift()!();
      await settle();
    }
    await retried;
    expect(window.error.value).toBeNull();
    expect(window.coverage.value.complete).toBe(true);
  });

  it('does not renew old unavailable-body rows when only the head is read again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 10 * 60_000);
    const initial = keptWindow(103, 1102, 'c102');
    initial.samples[0] = { ...initial.samples[0]!, createdAtMs: null };
    const { retention, state } = memoryRetention(initial);
    const source = chain(1102);
    const window = scope.run(() => useBlockSampleWindow(ref(1000), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    vi.setSystemTime(T0 + 20 * 60_000);
    await window.refresh();
    scope.stop();

    expect(state.kept?.samples[0]?.createdAtMs).toBeNull();
    expect(state.kept?.readAt).toBe(T0 + 20 * 60_000);
    expect(state.kept?.acquiredAt).toBe(T0);
  });

  it('subscribes immediately from a retained head even when the head read is unchanged', async () => {
    const source = chain(1102);
    const { retention } = memoryRetention(keptWindow(953, 1102, 'c952'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }))!;

    expect(streamState.connectFrom).toHaveBeenCalledExactlyOnceWith(1103);
    await settle();
    expect(streamState.connectFrom).toHaveBeenCalledExactlyOnceWith(1103);
    expect(window.samples.value.at(-1)?.height).toBe(1102);

    streamState.streaming!.value = true;
    await settle();
    expect(window.isLive.value).toBe(true);
    expect(window.observedUntil(T0 + 60_000)).toBe(T0 + 60_000);
  });

  it('starts the retained-head stream after a failed read without marking stale rows reconciled', async () => {
    const source = chain(1102);
    source.failRequest(1);
    const { retention } = memoryRetention(keptWindow(953, 1102, 'c952'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }))!;
    await settle();

    expect(streamState.connectFrom).toHaveBeenCalledExactlyOnceWith(1103);
    expect(window.error.value?.message).toBe('busy');
    expect(window.isReconciled.value).toBe(false);
    expect(window.observedUntil(T0 + 60_000)).toBe(T0);

    // Opening the subscription retries the read and closes the observation gap.
    streamState.streaming!.value = true;
    await settle();
    expect(window.error.value).toBeNull();
    expect(window.isReconciled.value).toBe(true);
    expect(window.observedUntil(T0 + 60_000)).toBe(T0 + 60_000);
  });

  it('does not subscribe from a retained head when live updates are disabled', async () => {
    const source = chain(1102);
    const { retention } = memoryRetention(keptWindow(953, 1102, 'c952'));
    scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention, live: false }));
    await settle();

    expect(streamState.connectFrom).not.toHaveBeenCalled();
  });

  it('shows a kept window at once and re-reads only its head before counting the present', async () => {
    const source = chain(1105);
    const { retention } = memoryRetention(keptWindow(953, 1102, 'c952'));
    const window = scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }))!;

    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1102);
    expect(window.isLoading.value).toBe(false);
    expect(window.isReconciled.value).toBe(false);
    expect(window.observedUntil(T0 + 60_000)).toBe(T0);

    await settle();
    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    expect(source.fetchPage.mock.calls[0]?.[0]).toEqual({ limit: PAGE, cursor: null });
    expect(window.samples.value[window.samples.value.length - 1]?.height).toBe(1105);
    expect(window.samples.value).toHaveLength(100);
    expect(window.isReconciled.value).toBe(true);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('extends a kept window from its continuation when the next dashboard needs more', async () => {
    const source = chain(1102);
    const { retention } = memoryRetention(keptWindow(1003, 1102, 'c1002'));
    const window = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: source.fetchPage, retention }))!;
    await settle();

    const cursors = source.fetchPage.mock.calls.map((call) => call[0].cursor);
    expect(cursors).toContain('c1002');
    // One head re-read and the pages below the kept rows: no second read of the kept heights.
    expect(cursors.filter((cursor) => cursor === null)).toHaveLength(1);
    expect(window.samples.value).toHaveLength(250);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('reads a short kept window afresh when its continuation did not survive a reload', async () => {
    const source = chain(1102);
    const { retention } = memoryRetention(keptWindow(1003, 1102, null));
    const window = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: source.fetchPage, retention }))!;
    await settle();

    expect(window.samples.value).toHaveLength(250);
    expect(window.samples.value[0]?.height).toBe(853);
    expect(contiguous(window.samples.value)).toBe(true);
  });

  it('keeps the rebuilt scan serialized when a persisted short window grows before its first page arrives', async () => {
    const { deferred, releases } = deferredPages(chain(1102).fetchPage);
    const { retention } = memoryRetention(keptWindow(1003, 1102, null));
    const size = ref(250);
    const window = scope.run(() => useBlockSampleWindow(size, { fetchPage: deferred as never, retention }))!;
    expect(deferred).toHaveBeenCalledTimes(2); // Resume refresh, then the fresh scan without a saved cursor.

    releases.shift()!(); // The old-generation refresh is ignored; the rebuild remains pending.
    await settle();
    expect(releases).toHaveLength(1);
    size.value = 300;
    await settle();
    expect(deferred).toHaveBeenCalledTimes(2);
    expect(releases).toHaveLength(1);

    while (releases.length > 0) {
      releases.shift()!();
      await settle();
      expect(releases.length).toBeLessThanOrEqual(1);
    }
    const scanCursors = deferred.mock.calls.slice(1).map((call) => call[0].cursor);
    expect(new Set(scanCursors).size).toBe(scanCursors.length);
    expect(window.samples.value).toHaveLength(300);
    expect(contiguous(window.samples.value)).toBe(true);
    expect(window.coverage.value.complete).toBe(true);
    expect(window.error.value).toBeNull();
  });

  it.each([0, 1])('reuses the full shared window after visiting a smaller dashboard with %i new blocks', async (growth) => {
    const source = chain(2000);
    const { retention, state } = memoryRetention(keptWindow(1001, 2000, 'c1000'));
    const activity = scope.run(() => useBlockSampleWindow(ref(1000), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    expect(activity.samples.value).toHaveLength(1000);
    scope.stop();

    source.grow(2000 + growth);
    scope = effectScope();
    const network = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    expect(network.samples.value).toHaveLength(250);
    scope.stop();
    expect(state.kept?.samples).toHaveLength(1000 + growth);
    expect(state.kept?.target).toBe(1000);

    const callsBeforeReturn = source.fetchPage.mock.calls.length;
    scope = effectScope();
    const returnedActivity = scope.run(() => useBlockSampleWindow(ref(1000), { fetchPage: source.fetchPage, retention }))!;
    expect(returnedActivity.samples.value).toHaveLength(1000);
    await settle();
    expect(source.fetchPage.mock.calls.length - callsBeforeReturn).toBe(1);
    expect(returnedActivity.samples.value.at(-1)?.height).toBe(2000 + growth);
    expect(returnedActivity.coverage.value.complete).toBe(true);
    expect(contiguous(returnedActivity.samples.value)).toBe(true);
    expect(returnedActivity.error.value).toBeNull();
  });

  it('keeps an unfinished larger window and its continuation through a smaller dashboard that sees new blocks', async () => {
    const source = chain(2000);
    // Activity had read 800 of its 1,000 blocks when the reader opened Network.
    const { retention, state } = memoryRetention(keptWindow(1201, 2000, 'c1200', 1000));
    source.grow(2001);
    const network = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    expect(network.samples.value.at(-1)?.height).toBe(2001);
    expect(network.samples.value).toHaveLength(250);
    scope.stop();
    expect(state.kept?.samples).toHaveLength(801);
    expect(state.kept?.cursor?.nextCursor).toBe('c1200');
    expect(state.kept?.target).toBe(1000);

    const callsBeforeReturn = source.fetchPage.mock.calls.length;
    scope = effectScope();
    const activity = scope.run(() => useBlockSampleWindow(ref(1000), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    // One head re-read, then only the pages below the kept rows: no rescan from the head.
    expect(source.fetchPage.mock.calls.slice(callsBeforeReturn).map((call) => call[0].cursor)).toEqual([null, 'c1200', 'c1100']);
    expect(activity.samples.value).toHaveLength(1000);
    expect(activity.samples.value[0]?.height).toBe(1002);
    expect(contiguous(activity.samples.value)).toBe(true);
    expect(activity.coverage.value.complete).toBe(true);
    expect(activity.error.value).toBeNull();
  });

  it('bounds the rows a smaller dashboard keeps for a larger one at that window plus its headroom', async () => {
    const source = chain(2000);
    const { retention, state } = memoryRetention(keptWindow(1001, 2000, 'c1000', 1000));
    const network = scope.run(() => useBlockSampleWindow(ref(250), { fetchPage: source.fetchPage, retention }))!;
    await settle();
    for (const head of [2400, 2800]) {
      source.grow(head);
      await network.refresh();
      await settle();
    }
    scope.stop();

    // 1,800 heights were read; the 1,000-block window keeps 512 more and drops the oldest.
    expect(state.kept?.samples).toHaveLength(1512);
    expect(state.kept?.samples.at(-1)?.height).toBe(2800);
    expect(contiguous(state.kept!.samples)).toBe(true);
    // The trimmed range no longer reaches the old continuation.
    expect(state.kept?.cursor).toBeNull();
  });

  it('keeps the window, with its continuation, for the next dashboard', async () => {
    const source = chain(1102);
    const { state, retention } = memoryRetention();
    scope.run(() => useBlockSampleWindow(ref(100), { fetchPage: source.fetchPage, retention }));
    await settle();
    scope.stop();

    const saved = state.saves[state.saves.length - 1];
    expect(saved?.samples).toHaveLength(100);
    expect(saved?.cursor?.nextCursor).toBe(`c${1102 - 100}`);
    expect(saved?.readAt).not.toBeNull();
  });
});
