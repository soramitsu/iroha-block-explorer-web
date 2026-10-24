import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { useBoundedScan } from './useBoundedScan';

function feed(total: number) {
  return vi.fn(async ({ limit, cursor }: { limit?: number, cursor?: string | null }) => {
    const start = cursor ? Number(cursor) : 0;
    const items = Array.from({ length: Math.min(limit ?? 100, total - start) }, (_, index) => `row-${start + index}`);
    const end = start + items.length;
    return { status: SUCCESSFUL_FETCHING, data: { items, nextCursor: end < total ? String(end) : null } } as const;
  });
}

function rename(row: string) {
  return `new-${row}`;
}

/** A feed whose pages, once `hold()` is called, return renamed rows and wait for `release()`. */
function heldFeed(total: number) {
  const rows = feed(total);
  const releases: Array<() => void> = [];
  let held = false;
  const fetchPage = vi.fn(async (args: { limit?: number, cursor?: string | null }) => {
    const result = await rows(args);
    if (!held) return result;
    await new Promise<void>((resolve) => {
      releases.push(resolve);
    });
    return { ...result, data: { ...result.data, items: result.data.items.map(rename) } };
  });
  return {
    fetchPage,
    hold: () => {
      held = true;
    },
    release: () => releases.shift()?.(),
  };
}

async function settle() {
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
  await nextTick();
}

let scope: ReturnType<typeof effectScope>;
beforeEach(() => {
  scope = effectScope();
});
afterEach(() => scope.stop());

describe('useBoundedScan', () => {
  it('reads every page of a small collection and reports completeness', async () => {
    const fetchPage = feed(150);
    const scan = scope.run(() => useBoundedScan(fetchPage, 1000))!;
    await settle();
    expect(scan.items.value).toHaveLength(150);
    expect(scan.complete.value).toBe(true);
    expect(scan.truncated.value).toBe(false);
    expect(scan.isLoading.value).toBe(false);
  });

  it('stops at the bound and says rows remain', async () => {
    const fetchPage = feed(1000);
    const scan = scope.run(() => useBoundedScan(fetchPage, 250))!;
    await settle();
    expect(fetchPage.mock.calls.map((call) => call[0].limit)).toEqual([100, 100, 50]);
    expect(scan.items.value).toHaveLength(250);
    expect(scan.complete.value).toBe(false);
    expect(scan.truncated.value).toBe(true);
  });

  it('rescans when the bound changes', async () => {
    const fetchPage = feed(1000);
    const bound = ref(100);
    const scan = scope.run(() => useBoundedScan(fetchPage, bound))!;
    await settle();
    bound.value = 200;
    await settle();
    expect(scan.items.value).toHaveLength(200);
    expect(scan.items.value[0]).toBe('row-0');
  });

  it('surfaces failures and keeps rows read so far', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: { items: ['a'], nextCursor: 'next' } })
      .mockResolvedValueOnce({ status: UNKNOWN_ERROR, error: new Error('busy') });
    const scan = scope.run(() => useBoundedScan(fetchPage, 500))!;
    await settle();
    expect(scan.items.value).toEqual(['a']);
    expect(scan.error.value?.message).toBe('busy');
    expect(scan.complete.value).toBe(false);
  });

  it('refreshes in the background and swaps rows in only when the new scan finishes', async () => {
    const source = heldFeed(1000);
    const scan = scope.run(() => useBoundedScan(source.fetchPage, 150))!;
    await settle();
    const before = scan.items.value;

    source.hold();
    const refreshed = scan.refresh();
    await settle();
    source.release();
    await settle();
    // One of two pages read: the old sample stays whole and nothing looks busy.
    expect(scan.items.value).toBe(before);
    expect(scan.isLoading.value).toBe(false);
    source.release();
    await refreshed;
    expect(scan.items.value).toHaveLength(150);
    expect(scan.items.value[0]).toBe('new-row-0');
    expect(scan.truncated.value).toBe(true);
  });

  it('keeps the previous sample when a background refresh fails', async () => {
    const fetchPage = feed(50);
    const scan = scope.run(() => useBoundedScan(fetchPage, 100))!;
    await settle();
    const before = scan.items.value;
    fetchPage.mockResolvedValueOnce({ status: UNKNOWN_ERROR, error: new Error('busy') } as never);
    await scan.refresh();
    expect(scan.items.value).toBe(before);
    expect(scan.error.value?.message).toBe('busy');
    await scan.refresh();
    expect(scan.error.value).toBeNull();
    expect(scan.complete.value).toBe(true);
  });

  it('rejects a repeated continuation without keeping its rows', async () => {
    const fetchPage = vi.fn(async () => ({
      status: SUCCESSFUL_FETCHING as typeof SUCCESSFUL_FETCHING,
      data: { items: ['same'], nextCursor: 'again' },
    }));
    const scan = scope.run(() => useBoundedScan(fetchPage, 500))!;
    await settle();
    expect(scan.items.value).toEqual(['same']);
    expect(scan.error.value?.message).toMatch(/did not advance/);
  });
});
