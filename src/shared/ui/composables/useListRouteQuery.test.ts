import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';

import {
  parseCursorListPagination,
  parseNumberedListPagination,
  useCursorListRouteQuery,
  useListRouteQuery,
} from './useListRouteQuery';

const route = reactive({ query: {} as Record<string, string> });
const updateRouteQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/shared/ui/composables/useRouteQueryState', () => ({
  useRouteQueryState: () => ({ route, updateRouteQuery }),
}));

describe('useListRouteQuery', () => {
  it('reads valid values and retains malformed route state as an explicit error', async () => {
    route.query = { page: '3', per_page: '20' };
    const state = useListRouteQuery();
    expect(state.page.value).toBe(3);
    expect(state.pageSize.value).toBe(20);
    expect(state.pagination.value).toEqual({ ok: true, page: 3, pageSize: 20 });

    updateRouteQuery.mockClear();
    route.query = { page: '0', per_page: '30' };
    await nextTick();
    expect(state.pagination.value).toEqual({ ok: false, code: 'invalid-page', maxFetchSize: 500 });
    expect(updateRouteQuery).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, undefined, { ok: true, page: 1, pageSize: 10 }],
    ['25', '20', { ok: true, page: 25, pageSize: 20 }],
    ['26', '20', { ok: false, code: 'fetch-window-exceeded', maxFetchSize: 500 }],
    ['01', '20', { ok: false, code: 'invalid-page', maxFetchSize: 500 }],
    ['1', ['20'], { ok: false, code: 'invalid-page-size', maxFetchSize: 500 }],
  ])('parses strict numbered pagination %#', (rawPage, rawPageSize, expected) => {
    expect(parseNumberedListPagination(rawPage, rawPageSize)).toEqual(expected);
  });

  it('resets invalid pagination only when the user requests recovery', async () => {
    route.query = { page: '0', per_page: '30', status: 'Committed' };
    updateRouteQuery.mockClear();
    const state = useListRouteQuery();

    await state.resetPagination();

    expect(updateRouteQuery).toHaveBeenCalledWith(
      { page: null, per_page: null },
      { history: 'replace', defaults: { page: 1, per_page: 10 } }
    );
  });

  it('throws instead of substituting invalid programmatic values', () => {
    route.query = {};
    const state = useListRouteQuery();
    expect(() => {
      state.page.value = 51;
    }).toThrow(RangeError);
    expect(() => {
      state.pageSize.value = 30;
    }).toThrow(RangeError);
  });

  it('pushes pages and replaces page-size/filter updates with an atomic page reset', async () => {
    route.query = {};
    updateRouteQuery.mockClear();
    const state = useListRouteQuery();
    state.page.value = 4;
    state.pageSize.value = 50;
    await state.updateListQuery({ status: 'Committed' });

    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      1,
      { page: 4 },
      { history: 'push', defaults: { page: 1, per_page: 10 } }
    );
    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      2,
      { page: 1, per_page: 50 },
      { history: 'replace', defaults: { page: 1, per_page: 10 } }
    );
    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      3,
      { page: 1, status: 'Committed' },
      { history: 'replace', defaults: { page: 1, per_page: 10 } }
    );
  });
});

describe('useCursorListRouteQuery', () => {
  it('reads an opaque cursor and a supported limit without deriving a page number', () => {
    route.query = { cursor: 'cursor-1', limit: '20' };
    const state = useCursorListRouteQuery();

    expect(state.cursor.value).toBe('cursor-1');
    expect(state.limit.value).toBe(20);
    expect(state.pagination.value).toEqual({ ok: true, cursor: 'cursor-1', limit: 20 });
    expect(state).not.toHaveProperty('page');
  });

  it.each([
    [undefined, undefined, { ok: true, cursor: null, limit: 10 }],
    ['Y3Vyc29yLTE', '100', { ok: true, cursor: 'Y3Vyc29yLTE', limit: 100 }],
    ['padded=', '20', { ok: true, cursor: 'padded=', limit: 20 }],
    ['', '20', { ok: false, code: 'invalid-cursor' }],
    [null, '20', { ok: false, code: 'invalid-cursor' }],
    [['cursor-1'], '20', { ok: false, code: 'invalid-cursor' }],
    ['cursor-1', '020', { ok: false, code: 'invalid-limit' }],
    ['cursor-1', ['20'], { ok: false, code: 'invalid-limit' }],
  ])('parses strict cursor pagination %#', (rawCursor, rawLimit, expected) => {
    expect(parseCursorListPagination(rawCursor, rawLimit)).toEqual(expected);
  });

  it('preserves long opaque cursors without applying retired frame ceilings', () => {
    const cursor = 'opaque=' + 'h'.repeat(2048);
    expect(parseCursorListPagination(cursor, '10')).toEqual({ ok: true, cursor, limit: 10 });
  });

  it('retains malformed cursor pagination until the user explicitly resets it', async () => {
    route.query = { cursor: '', limit: '30', domain: 'wonderland' };
    updateRouteQuery.mockClear();
    const state = useCursorListRouteQuery();
    await nextTick();

    expect(state.pagination.value).toEqual({ ok: false, code: 'invalid-cursor' });
    expect(updateRouteQuery).not.toHaveBeenCalled();

    await state.resetPagination();
    expect(updateRouteQuery).toHaveBeenCalledWith(
      { cursor: null, limit: null },
      { history: 'replace', defaults: { cursor: null, limit: 10 } }
    );
  });

  it('throws instead of substituting invalid programmatic cursor values', () => {
    route.query = {};
    const state = useCursorListRouteQuery();
    expect(() => {
      state.cursor.value = '';
    }).toThrow(TypeError);
    expect(() => {
      state.limit.value = 30;
    }).toThrow(RangeError);
  });

  it('pushes continuations and atomically clears them when the limit or filters change', async () => {
    route.query = {};
    updateRouteQuery.mockClear();
    const state = useCursorListRouteQuery();
    state.cursor.value = 'cursor-1';
    state.limit.value = 50;
    await state.updateListQuery({ domain: 'wonderland' });

    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      1,
      { cursor: 'cursor-1' },
      { history: 'push', defaults: { cursor: null, limit: 10 } }
    );
    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      2,
      { cursor: null, limit: 50 },
      { history: 'replace', defaults: { cursor: null, limit: 10 } }
    );
    expect(updateRouteQuery).toHaveBeenNthCalledWith(
      3,
      { cursor: null, domain: 'wonderland' },
      { history: 'replace', defaults: { cursor: null, limit: 10 } }
    );
  });

  it('does not canonicalize unrelated route state', async () => {
    route.query = { cursor: 'cursor-1', limit: '20', domain: 'wonderland', sort: 'name' };
    updateRouteQuery.mockClear();

    const state = useCursorListRouteQuery();
    await nextTick();

    expect(state.cursor.value).toBe('cursor-1');
    expect(state.limit.value).toBe(20);
    expect(updateRouteQuery).not.toHaveBeenCalled();
  });
});
