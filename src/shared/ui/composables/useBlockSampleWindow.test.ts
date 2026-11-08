import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import type { BlockSample } from '@/shared/lib/chain-analytics';

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

function block(height: number): BlockSample {
  return { height, createdAtMs: T0 + height * 1000, transactionsTotal: height % 3, transactionsRejected: 0 };
}

/** A chain served newest-first with opaque cursors; `failRequest(n)` fails the n-th next request once. */
function chain(initialHead: number) {
  const state = { head: initialHead, failAt: null as number | null, calls: 0 };
  const fetchPage = vi.fn(async ({ limit, cursor }: PageArgs) => {
    state.calls += 1;
    if (state.failAt === state.calls) return { status: UNKNOWN_ERROR, error: new Error('busy') } as const;
    const top = cursor ? Number(cursor.slice(1)) : state.head;
    const items = Array.from({ length: Math.min(limit ?? PAGE, top) }, (_, index) => block(top - index));
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
