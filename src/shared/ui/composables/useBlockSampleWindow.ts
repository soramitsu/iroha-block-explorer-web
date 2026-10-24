import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
import { fetchBlockSamples } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { mergeBlockSamples, type BlockSample } from '@/shared/lib/chain-analytics';
import { advanceHistoryScanCursor, createHistoryScanCursor, type HistoryScanCursor } from '@/shared/lib/history-scan';
import { useBlockStream } from './useBlockStream';

/**
 * Rows per page. The feed accepts up to 100, but Torii charges every block a
 * page reads to one per-request history budget and currently answers a spent
 * budget with HTTP 500 instead of a short page; on Taira a 100-row page of
 * busy blocks exceeds it. 64 rows stay within that budget there.
 */
export const BLOCK_SAMPLE_PAGE_LIMIT = 64;
/** Heights kept above the visible window before the oldest are dropped. */
const RETAINED_HEADROOM = 512;
/** Empty pages followed per requested page before a scan gives up. */
const EMPTY_PAGE_ALLOWANCE = 4;
/** Pages a head refresh may read to reconnect with the retained window. */
const HEAD_REFRESH_PAGES = 5;
const POLL_INTERVAL_MS = 10_000;
const STREAM_DEBOUNCE_MS = 800;

type FetchPage = typeof fetchBlockSamples;
type PageResult = Awaited<ReturnType<FetchPage>>;

export interface BlockSampleWindowOptions {
  fetchPage?: FetchPage
  /** Live updates from the block stream (or signed polling when streaming is unavailable). */
  live?: boolean
}

function asError(failure: unknown): Error {
  return failure instanceof Error ? failure : new Error(String(failure));
}

function pageError(result: PageResult): Error {
  if (result.status === SUCCESSFUL_FETCHING) return new Error('Unexpected block page state');
  return 'error' in result && result.error instanceof Error ? result.error : new Error(`Block page request failed: ${result.status}`);
}

/**
 * The newest `windowSize` committed block summaries as one contiguous height
 * range, read newest-first in bounded pages. The first page renders at once;
 * one serialized scan extends the window backwards. Live updates re-read the
 * head and publish it only after it reconnects with the retained heights, so a
 * failed or partial refresh never leaves a silent gap.
 */
export function useBlockSampleWindow(windowSize: Ref<number>, options: BlockSampleWindowOptions = {}) {
  const fetchPage = options.fetchPage ?? fetchBlockSamples;
  const live = options.live !== false;
  const fetched = shallowRef<BlockSample[]>([]);
  const isLoading = ref(true);
  const isScanning = ref(false);
  const error = ref<Error | null>(null);
  const reachedGenesis = ref(false);
  /** Local time the head was last read; everything up to it is observed. */
  const lastUpdatedAt = ref<number | null>(null);
  /** A new block was announced, or a head refresh failed, and the window has not caught up yet. */
  const headPending = ref(false);

  let cursor: HistoryScanCursor | null = createHistoryScanCursor();
  let generation = 0;
  let extension: Promise<void> | null = null;
  let refreshing: Promise<void> | null = null;
  let refreshQueued = false;
  let disposed = false;

  const samples = computed(() => {
    const all = fetched.value;
    return all.length > windowSize.value ? all.slice(all.length - windowSize.value) : all;
  });
  const coverage = computed(() => ({
    loaded: samples.value.length,
    target: windowSize.value,
    complete: samples.value.length >= windowSize.value || reachedGenesis.value,
  }));
  const top = () => fetched.value[fetched.value.length - 1]?.height ?? null;

  /** Extension pages sit directly below the window, so merging never trims. */
  function appendOlder(items: readonly BlockSample[]) {
    fetched.value = mergeBlockSamples(fetched.value, items, Math.max(1, fetched.value.length + items.length));
  }

  /** Publish a reconnected head atomically, dropping heights far below the window. */
  function commitHead(items: readonly BlockSample[]) {
    const merged = mergeBlockSamples(fetched.value, items, Math.max(1, fetched.value.length + items.length));
    const limit = windowSize.value + RETAINED_HEADROOM;
    if (merged.length > limit) {
      fetched.value = merged.slice(merged.length - limit);
      // Older heights exist again below the trimmed range; the old continuation does not reach them.
      cursor = null;
      reachedGenesis.value = false;
    } else {
      fetched.value = merged;
    }
    lastUpdatedAt.value = Date.now();
    headPending.value = false;
  }

  async function runExtension(run: number) {
    isScanning.value = true;
    let requests = 0;
    try {
      while (run === generation && fetched.value.length < windowSize.value && !reachedGenesis.value) {
        const current = cursor;
        if (current === null) {
          restart();
          return;
        }
        requests += 1;
        if (requests > Math.ceil(windowSize.value / BLOCK_SAMPLE_PAGE_LIMIT) * (1 + EMPTY_PAGE_ALLOWANCE)) {
          throw new Error('Block history scan did not fill the window');
        }
        const limit = Math.min(BLOCK_SAMPLE_PAGE_LIMIT, windowSize.value - fetched.value.length);
        const result = await fetchPage({ limit, cursor: current.nextCursor });
        if (run !== generation) return;
        // A refresh trimmed the range meanwhile; the next pass rebuilds from the head.
        if (cursor !== current) continue;
        if (result.status !== SUCCESSFUL_FETCHING) throw pageError(result);
        const next = advanceHistoryScanCursor(current, result.data);
        cursor = next;
        appendOlder(result.data.items);
        // The first page of a scan reads the head itself.
        if (current.nextCursor === null) lastUpdatedAt.value = Date.now();
        isLoading.value = false;
        if (next.nextCursor === null) reachedGenesis.value = true;
      }
    } catch (failure) {
      if (run === generation) error.value = asError(failure);
    } finally {
      if (run === generation) {
        isScanning.value = false;
        isLoading.value = false;
      }
    }
  }

  /** One scan at a time; a running scan re-reads the requested size every page. */
  function extend(): Promise<void> {
    if (extension) return extension;
    const run = generation;
    const task: Promise<void> = runExtension(run).finally(() => {
      if (extension !== task) return;
      extension = null;
      // A size increase that landed after the last page check still gets its rows.
      if (run === generation && !error.value && !reachedGenesis.value && fetched.value.length < windowSize.value) {
        extend();
      }
    });
    extension = task;
    return task;
  }

  function restart(): Promise<void> {
    generation += 1;
    extension = null;
    fetched.value = [];
    cursor = createHistoryScanCursor();
    reachedGenesis.value = false;
    error.value = null;
    isLoading.value = true;
    isScanning.value = false;
    lastUpdatedAt.value = null;
    // The rebuild reads the head itself.
    headPending.value = false;
    return extend();
  }

  async function refreshOnce(run: number) {
    const knownTop = top();
    // The initial scan reads the head itself.
    if (knownTop === null) return;
    const buffered: BlockSample[] = [];
    let scan = createHistoryScanCursor();
    try {
      for (let page = 0; page < HEAD_REFRESH_PAGES; page += 1) {
        const result = await fetchPage({ limit: BLOCK_SAMPLE_PAGE_LIMIT, cursor: scan.nextCursor });
        if (run !== generation) return;
        if (result.status !== SUCCESSFUL_FETCHING) throw pageError(result);
        scan = advanceHistoryScanCursor(scan, result.data);
        buffered.push(...result.data.items);
        const oldest = result.data.items.reduce<number | null>(
          (lowest, item) => (lowest === null || item.height < lowest ? item.height : lowest),
          null
        );
        if (scan.nextCursor === null || (oldest !== null && oldest <= knownTop + 1)) {
          commitHead(buffered);
          error.value = null;
          return;
        }
      }
    } catch (failure) {
      if (run === generation) error.value = asError(failure);
      return;
    }
    // Too far ahead to reconnect from a few pages: rebuild the window from the head.
    await restart();
  }

  /** Re-read the head; a request arriving mid-refresh schedules one trailing pass. */
  function refresh(): Promise<void> {
    if (refreshing) {
      refreshQueued = true;
      return refreshing;
    }
    const task: Promise<void> = (async () => {
      do {
        refreshQueued = false;
        await refreshOnce(generation);
        if (disposed) return;
      } while (refreshQueued);
    })().finally(() => {
      if (refreshing === task) refreshing = null;
    });
    refreshing = task;
    return task;
  }

  watch(windowSize, (size, previous) => {
    if (previous !== undefined && size > previous && !reachedGenesis.value) extend();
  });

  restart();

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const stream = useBlockStream(() => {
    headPending.value = true;
    if (debounce) return;
    debounce = setTimeout(() => {
      debounce = null;
      refresh();
    }, STREAM_DEBOUNCE_MS);
  });
  const isLive = computed(() => live && stream.isStreaming.value);

  watch(top, (height) => {
    if (!live || height === null) return;
    stream.connectFrom(height + 1);
  });

  // Streams start after their admission height without replay: reconcile on every (re)open.
  watch(isLive, (open) => {
    if (!open) return;
    headPending.value = true;
    refresh();
  });

  // Poll while there is no stream, and keep retrying an unconfirmed head even while one is open.
  const visibility = useDocumentVisibility();
  useIntervalFn(() => {
    if (!live || (isLive.value && !headPending.value) || visibility.value === 'hidden' || isLoading.value) return;
    refresh();
  }, POLL_INTERVAL_MS);

  /**
   * Everything up to this time is observed: the present while an open stream's
   * announcements are all applied, otherwise only up to the last head read.
   */
  function observedUntil(nowMs: number): number | null {
    return isLive.value && !headPending.value ? nowMs : lastUpdatedAt.value;
  }

  onScopeDispose(() => {
    disposed = true;
    generation += 1;
    if (debounce) clearTimeout(debounce);
  });

  return {
    samples,
    coverage,
    isLoading,
    isScanning,
    error,
    reachedGenesis,
    lastUpdatedAt,
    isLive,
    isReconciled: computed(() => !headPending.value),
    observedUntil,
    refresh,
    retry: restart,
  };
}
