import { computed, watch } from 'vue';

import { HistoryCursorSchema, PINNED_TORII_DEFAULT_MAX_FETCH_SIZE, WorldCursorSchema } from '@/shared/api/schemas';
import { parseCanonicalRoutePositiveInteger, type RouteQueryPatchValue } from '@/shared/lib/route-query';
import { useRouteQueryState } from '@/shared/ui/composables/useRouteQueryState';

const PAGE_SIZES = new Set([10, 20, 50, 100]);

export type NumberedListPaginationState =
  | { ok: true; page: number; pageSize: number }
  | {
      ok: false;
      code: 'invalid-page' | 'invalid-page-size' | 'fetch-window-exceeded';
      maxFetchSize: number;
    };

export type CursorListPaginationState =
  | { ok: true; cursor: string | null; limit: number }
  | { ok: false; code: 'invalid-cursor' | 'invalid-limit' };

export type ExplorerCursorKind = 'world' | 'history';

function cursorSchemaForKind(kind: ExplorerCursorKind) {
  return kind === 'history' ? HistoryCursorSchema : WorldCursorSchema;
}

export function parseNumberedListPagination(
  rawPage: unknown,
  rawPageSize: unknown,
  options: { defaultPageSize?: number; maxFetchSize?: number } = {}
): NumberedListPaginationState {
  const defaultPageSize = options.defaultPageSize ?? 10;
  const maxFetchSize = options.maxFetchSize ?? PINNED_TORII_DEFAULT_MAX_FETCH_SIZE;
  const parsedPage = parseCanonicalRoutePositiveInteger(rawPage, 1);
  if (!parsedPage.ok) return { ok: false, code: 'invalid-page', maxFetchSize };

  const parsedPageSize = parseCanonicalRoutePositiveInteger(rawPageSize, defaultPageSize, PAGE_SIZES);
  if (!parsedPageSize.ok) return { ok: false, code: 'invalid-page-size', maxFetchSize };

  const window = parsedPage.value * parsedPageSize.value;
  if (!Number.isSafeInteger(window) || window > maxFetchSize) {
    return { ok: false, code: 'fetch-window-exceeded', maxFetchSize };
  }
  return { ok: true, page: parsedPage.value, pageSize: parsedPageSize.value };
}

export function parseCursorListPagination(
  rawCursor: unknown,
  rawLimit: unknown,
  options: { defaultLimit?: number; cursorKind?: ExplorerCursorKind } = {}
): CursorListPaginationState {
  const defaultLimit = options.defaultLimit ?? 10;
  const cursorSchema = cursorSchemaForKind(options.cursorKind ?? 'world');
  const cursor = rawCursor === undefined ? null : cursorSchema.safeParse(rawCursor);
  if (cursor !== null && !cursor.success) return { ok: false, code: 'invalid-cursor' };

  const parsedLimit = parseCanonicalRoutePositiveInteger(rawLimit, defaultLimit, PAGE_SIZES);
  if (!parsedLimit.ok) return { ok: false, code: 'invalid-limit' };

  return { ok: true, cursor: cursor === null ? null : cursor.data, limit: parsedLimit.value };
}

export function useListRouteQuery(
  options: {
    pageKey?: string;
    pageSizeKey?: string;
    defaultPageSize?: number;
  } = {}
) {
  const pageKey = options.pageKey ?? 'page';
  const pageSizeKey = options.pageSizeKey ?? 'per_page';
  const defaultPageSize = options.defaultPageSize ?? 10;
  const { route, updateRouteQuery } = useRouteQueryState();
  const defaults = { [pageKey]: 1, [pageSizeKey]: defaultPageSize };
  if (!PAGE_SIZES.has(defaultPageSize)) throw new TypeError('defaultPageSize must be one of 10, 20, 50, or 100');

  const pagination = computed(() =>
    parseNumberedListPagination(route.query[pageKey], route.query[pageSizeKey], { defaultPageSize })
  );

  const page = computed({
    get: () => (pagination.value.ok ? pagination.value.page : 1),
    set: (value: number) => {
      const candidate = parseNumberedListPagination(String(value), String(pageSize.value), { defaultPageSize });
      if (!candidate.ok) throw new RangeError('page must produce a valid Torii offset window');
      updateRouteQuery({ [pageKey]: value }, { history: 'push', defaults }).catch(() => undefined);
    },
  });
  const pageSize = computed({
    get: () => (pagination.value.ok ? pagination.value.pageSize : defaultPageSize),
    set: (value: number) => {
      const candidate = parseNumberedListPagination(undefined, String(value), { defaultPageSize });
      if (!candidate.ok) throw new RangeError('page size must be one of 10, 20, 50, or 100');
      updateRouteQuery({ [pageKey]: 1, [pageSizeKey]: value }, { history: 'replace', defaults }).catch(() => undefined);
    },
  });

  async function updateListQuery(
    patch: Record<string, RouteQueryPatchValue>,
    config: { history?: 'push' | 'replace'; resetPage?: boolean } = {}
  ) {
    await updateRouteQuery(
      { ...(config.resetPage === false ? {} : { [pageKey]: 1 }), ...patch },
      { history: config.history ?? 'replace', defaults }
    );
  }

  async function resetPagination() {
    await updateRouteQuery({ [pageKey]: null, [pageSizeKey]: null }, { history: 'replace', defaults });
  }

  watch(
    () => [route.query[pageKey], route.query[pageSizeKey]] as const,
    ([rawPage, rawPageSize]) => {
      if (!pagination.value.ok) return;
      const containsExplicitDefault = rawPage === '1' || rawPageSize === String(defaultPageSize);
      if (!containsExplicitDefault) return;

      updateRouteQuery(
        { [pageKey]: pagination.value.page, [pageSizeKey]: pagination.value.pageSize },
        { history: 'replace', defaults }
      ).catch(() => undefined);
    },
    { immediate: true }
  );

  return { route, page, pageSize, pagination, resetPagination, updateListQuery };
}

export function useCursorListRouteQuery(
  options: {
    cursorKey?: string;
    limitKey?: string;
    defaultLimit?: number;
    cursorKind?: ExplorerCursorKind;
  } = {}
) {
  const cursorKey = options.cursorKey ?? 'cursor';
  const limitKey = options.limitKey ?? 'limit';
  const defaultLimit = options.defaultLimit ?? 10;
  const cursorKind = options.cursorKind ?? 'world';
  const cursorSchema = cursorSchemaForKind(cursorKind);
  const { route, updateRouteQuery } = useRouteQueryState();
  const defaults = { [cursorKey]: null, [limitKey]: defaultLimit };
  if (!PAGE_SIZES.has(defaultLimit)) throw new TypeError('defaultLimit must be one of 10, 20, 50, or 100');

  const pagination = computed(() =>
    parseCursorListPagination(route.query[cursorKey], route.query[limitKey], { defaultLimit, cursorKind })
  );

  const cursor = computed<string | null>({
    get: () => (pagination.value.ok ? pagination.value.cursor : null),
    set: (value) => {
      if (value !== null && !cursorSchema.safeParse(value).success) {
        throw new TypeError('cursor must be an unpadded base64url Torii cursor');
      }
      updateRouteQuery({ [cursorKey]: value }, { history: 'push', defaults }).catch(() => undefined);
    },
  });
  const limit = computed({
    get: () => (pagination.value.ok ? pagination.value.limit : defaultLimit),
    set: (value: number) => {
      const candidate = parseCursorListPagination(undefined, String(value), { defaultLimit, cursorKind });
      if (!candidate.ok) throw new RangeError('limit must be one of 10, 20, 50, or 100');
      updateRouteQuery({ [cursorKey]: null, [limitKey]: candidate.limit }, { history: 'replace', defaults }).catch(
        () => undefined
      );
    },
  });

  async function updateListQuery(
    patch: Record<string, RouteQueryPatchValue>,
    config: { history?: 'push' | 'replace'; resetCursor?: boolean } = {}
  ) {
    await updateRouteQuery(
      { ...(config.resetCursor === false ? {} : { [cursorKey]: null }), ...patch },
      { history: config.history ?? 'replace', defaults }
    );
  }

  async function resetPagination() {
    await updateRouteQuery({ [cursorKey]: null, [limitKey]: null }, { history: 'replace', defaults });
  }

  watch(
    () => route.query[limitKey],
    (rawLimit) => {
      if (!pagination.value.ok || rawLimit !== String(defaultLimit)) return;
      updateRouteQuery({ [limitKey]: pagination.value.limit }, { history: 'replace', defaults }).catch(() => undefined);
    },
    { immediate: true }
  );

  return { route, cursor, limit, pagination, resetPagination, updateListQuery };
}
