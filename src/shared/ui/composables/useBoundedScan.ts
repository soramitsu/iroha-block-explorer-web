import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { CollectionPage, CursorPaginationParams } from '@/shared/api/schemas';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { advanceHistoryScanCursor, createHistoryScanCursor } from '@/shared/lib/history-scan';

type PageResult<T> = { status: typeof SUCCESSFUL_FETCHING; data: CollectionPage<T> } | ErrorResponse;

const PAGE_LIMIT = 100;
/** Empty continuation pages followed per requested page. */
const EMPTY_PAGE_ALLOWANCE = 4;

/**
 * Read a bounded feed page by page up to `maxItems` rows. Results report
 * whether the feed was exhausted (`complete`) or the bound stopped the scan
 * with rows left unread (`truncated`), so callers never present a sample as
 * the whole collection. `refresh()` re-reads in the background and swaps the
 * rows in only once the new scan finishes, keeping the old ones on failure.
 */
export function useBoundedScan<T>(
  fetchPage: (params: CursorPaginationParams) => Promise<PageResult<T>>,
  maxItems: MaybeRefOrGetter<number>
) {
  const items = shallowRef<T[]>([]);
  const isLoading = ref(true);
  const error = ref<Error | null>(null);
  const complete = ref(false);
  const truncated = ref(false);
  let generation = 0;

  async function run(background = false) {
    generation += 1;
    const current = generation;
    const bound = Math.max(1, Math.floor(toValue(maxItems)));
    let cursor = createHistoryScanCursor();
    let collected: T[] = [];
    let budget = Math.ceil(bound / PAGE_LIMIT) * (1 + EMPTY_PAGE_ALLOWANCE);
    let exhausted = false;
    if (!background) {
      isLoading.value = true;
      error.value = null;
      complete.value = false;
      truncated.value = false;
    }
    try {
      while (budget > 0) {
        budget -= 1;
        const result = await fetchPage({ limit: Math.min(PAGE_LIMIT, bound - collected.length), cursor: cursor.nextCursor });
        if (current !== generation) return;
        if (result.status !== SUCCESSFUL_FETCHING) {
          throw 'error' in result ? result.error : new Error(`Collection page request failed: ${result.status}`);
        }
        // Validate the continuation before keeping rows, so a repeated page adds nothing.
        cursor = advanceHistoryScanCursor(cursor, result.data);
        collected = [...collected, ...result.data.items];
        // A first read shows rows as they arrive; a background refresh never shows a partial sample.
        if (!background) items.value = collected;
        if (cursor.nextCursor === null) {
          exhausted = true;
          break;
        }
        if (collected.length >= bound) break;
      }
      items.value = collected;
      complete.value = exhausted;
      truncated.value = !exhausted;
      error.value = null;
    } catch (failure) {
      if (current === generation) error.value = failure instanceof Error ? failure : new Error(String(failure));
    } finally {
      if (current === generation && !background) isLoading.value = false;
    }
  }

  watch(
    () => toValue(maxItems),
    () => {
      run();
    },
    { immediate: true }
  );
  onScopeDispose(() => {
    generation += 1;
  });

  return { items, isLoading, error, complete, truncated, retry: () => run(), refresh: () => run(true) };
}
