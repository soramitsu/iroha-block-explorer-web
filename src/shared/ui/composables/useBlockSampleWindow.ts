import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
import { fetchBlockSamples } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { mergeBlockSamples, type CanonicalBlockSample } from '@/shared/lib/chain-analytics';
import { advanceHistoryScanCursor, createHistoryScanCursor, type HistoryScanCursor } from '@/shared/lib/history-scan';
import { useBlockStream } from './useBlockStream';
import type { BlockWindowRetention, RetainedBlockWindow } from './block-window-retention';

/**
 * Authoritative maximum requested page size. Torii may end a page early when
 * its source-read budget is spent; its opaque continuation resumes that scan.
 */
export const BLOCK_SAMPLE_PAGE_LIMIT = 100;
/** Heights kept above the visible window before the oldest are dropped. */
const RETAINED_HEADROOM = 512;
/** Consecutive pages without new rows before a scan gives up. */
const EMPTY_PAGE_ALLOWANCE = 4;
/** Pages a head refresh may read to reconnect with the retained window. */
const HEAD_REFRESH_PAGES = 5;
const POLL_INTERVAL_MS = 10_000;
const STREAM_DEBOUNCE_MS = 800;
/** Quiet time before a changed window is kept for the next dashboard or visit. */
const RETAIN_SAVE_DELAY_MS = 2_000;

type FetchPage = typeof fetchBlockSamples;
type PageResult = Awaited<ReturnType<FetchPage>>;

export interface BlockSampleWindowOptions {
  fetchPage?: FetchPage
  /** Live updates from the block stream (or signed polling when streaming is unavailable). */
  live?: boolean
  /** Keeps the window for the next dashboard and visit, and starts from one it kept. */
  retention?: BlockWindowRetention
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
 * failed or partial refresh never leaves a silent gap. With `retention`, a
 * window kept by an earlier dashboard or visit shows at once and only its head
 * is re-read; until that read lands, the present does not count as observed.
 */
export function useBlockSampleWindow(windowSize: Ref<number>, options: BlockSampleWindowOptions = {}) {
  const fetchPage = options.fetchPage ?? fetchBlockSamples;
  const live = options.live !== false;
  const retention = options.retention ?? null;
  const fetched = shallowRef<CanonicalBlockSample[]>([]);
  const isLoading = ref(true);
  const isScanning = ref(false);
  const scanError = ref<Error | null>(null);
  const refreshError = ref<Error | null>(null);
  const error = computed(() => scanError.value ?? refreshError.value);
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
  let acquiredAt: number | null = null;
  /** Largest window size these rows are read for, by this dashboard or the one that kept them. */
  let target = windowSize.value;

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
  function appendOlder(items: readonly CanonicalBlockSample[]) {
    fetched.value = mergeBlockSamples(fetched.value, items, Math.max(1, fetched.value.length + items.length));
  }

  /** Publish a reconnected head atomically, dropping heights far below the window. */
  function commitHead(items: readonly CanonicalBlockSample[]) {
    const merged = mergeBlockSamples(fetched.value, items, Math.max(1, fetched.value.length + items.length));
    // A smaller dashboard must keep the shared history a larger one has read, or
    // is still reading, with its continuation, so returning to that dashboard
    // needs only a head refresh and the missing older pages. The window sizes
    // are bounded, so this cap is too.
    const limit = Math.max(fetched.value.length, Math.max(target, windowSize.value) + RETAINED_HEADROOM);
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
    retainSoon();
  }

  async function runExtension(run: number) {
    isScanning.value = true;
    let nonProgressPages = 0;
    try {
      while (run === generation && fetched.value.length < windowSize.value && !reachedGenesis.value) {
        const current = cursor;
        if (current === null) {
          restart();
          return;
        }
        const limit = Math.min(BLOCK_SAMPLE_PAGE_LIMIT, windowSize.value - fetched.value.length);
        const result = await fetchPage({ limit, cursor: current.nextCursor });
        if (run !== generation) return;
        // A refresh trimmed the range meanwhile; the next pass rebuilds from the head.
        if (cursor !== current) continue;
        if (result.status !== SUCCESSFUL_FETCHING) throw pageError(result);
        const next = advanceHistoryScanCursor(current, result.data);
        cursor = next;
        const before = fetched.value.length;
        appendOlder(result.data.items);
        nonProgressPages = fetched.value.length > before ? 0 : nonProgressPages + 1;
        if (nonProgressPages > EMPTY_PAGE_ALLOWANCE) throw new Error('Block history scan did not fill the window');
        // The first page of a scan reads the head itself.
        if (current.nextCursor === null) {
          lastUpdatedAt.value = Date.now();
          acquiredAt = lastUpdatedAt.value;
        }
        retainSoon();
        isLoading.value = false;
        if (next.nextCursor === null) reachedGenesis.value = true;
      }
    } catch (failure) {
      if (run === generation) scanError.value = asError(failure);
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
    // Restart before assigning this scan's promise: a synchronous restart inside
    // runExtension would otherwise let the outer assignment replace the new task.
    if (cursor === null && !reachedGenesis.value && fetched.value.length < windowSize.value) return restart();
    const run = generation;
    scanError.value = null;
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
    scanError.value = null;
    refreshError.value = null;
    isLoading.value = true;
    isScanning.value = false;
    lastUpdatedAt.value = null;
    acquiredAt = null;
    // A rebuilt window is read for this dashboard alone.
    target = windowSize.value;
    // The rebuild reads the head itself.
    headPending.value = false;
    return extend();
  }

  async function refreshOnce(run: number) {
    const anchor = fetched.value[fetched.value.length - 1];
    const knownTop = anchor?.height ?? null;
    // The initial scan reads the head itself.
    if (knownTop === null || !anchor) return;
    const buffered: CanonicalBlockSample[] = [];
    let scan = createHistoryScanCursor();
    try {
      for (let page = 0; page < HEAD_REFRESH_PAGES; page += 1) {
        const result = await fetchPage({ limit: BLOCK_SAMPLE_PAGE_LIMIT, cursor: scan.nextCursor });
        if (run !== generation) return;
        if (result.status !== SUCCESSFUL_FETCHING) throw pageError(result);
        scan = advanceHistoryScanCursor(scan, result.data);
        buffered.push(...result.data.items);
        const freshTip = buffered.reduce<number | null>(
          (highest, item) => (highest === null || item.height > highest ? item.height : highest),
          null
        );
        // A same-genesis reset keeps the NetworkId and URL. Its shorter chain
        // cannot reconcile the retained heights, even when its page is complete.
        if ((freshTip !== null && freshTip < knownTop) || (freshTip === null && scan.nextCursor === null)) {
          await restart();
          return;
        }
        const overlap = buffered.find((item) => item.height === knownTop);
        if (overlap) {
          // Matching height alone cannot identify a chain that reset and regrew.
          if (overlap.hash !== anchor.hash) {
            await restart();
            return;
          }
          commitHead(buffered);
          refreshError.value = null;
          return;
        }
        if (scan.nextCursor === null) {
          await restart();
          return;
        }
      }
    } catch (failure) {
      if (run === generation) refreshError.value = asError(failure);
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

  /** The window as it stands, for the next dashboard or visit. */
  function kept(): RetainedBlockWindow | null {
    if (fetched.value.length === 0 || lastUpdatedAt.value === null || acquiredAt === null) return null;
    return {
      samples: fetched.value,
      reachedGenesis: reachedGenesis.value,
      readAt: lastUpdatedAt.value,
      acquiredAt,
      cursor,
      target: Math.max(target, windowSize.value),
    };
  }

  let retainTimer: ReturnType<typeof setTimeout> | null = null;
  function retainSoon() {
    if (!retention || retainTimer) return;
    retainTimer = setTimeout(() => {
      retainTimer = null;
      const snapshot = kept();
      if (snapshot) retention.save(snapshot);
    }, RETAIN_SAVE_DELAY_MS);
  }

  /** Start from a kept window: it shows at once, and its head is re-read before the present counts. */
  function resume(snapshot: RetainedBlockWindow) {
    generation += 1;
    extension = null;
    fetched.value = snapshot.samples;
    cursor = snapshot.cursor;
    reachedGenesis.value = snapshot.reachedGenesis;
    scanError.value = null;
    refreshError.value = null;
    isLoading.value = false;
    isScanning.value = false;
    lastUpdatedAt.value = snapshot.readAt;
    acquiredAt = snapshot.acquiredAt;
    target = Math.max(snapshot.target, windowSize.value);
    headPending.value = true;
    refresh();
    // Without its continuation (a reload) a short window is read afresh, from the head.
    if (fetched.value.length < windowSize.value && !reachedGenesis.value) extend();
  }

  watch(windowSize, (size, previous) => {
    target = Math.max(target, size);
    if (previous !== undefined && size > previous && !reachedGenesis.value) extend();
  });

  const resumable = retention?.load() ?? null;
  if (resumable) resume(resumable);
  else restart();

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
  }, { immediate: true });

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
    if (retainTimer) clearTimeout(retainTimer);
    const snapshot = kept();
    if (retention && snapshot) retention.save(snapshot);
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
