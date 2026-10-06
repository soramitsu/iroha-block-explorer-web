import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBlocks, fetchInstructions, fetchLatestTransactions } from './index';
import { Block, CollectionPage, CollectionContinuation, LatestTransactionsResponse } from './schemas';
import { jsonResponse } from '../../../tests/fixtures/http-response';
import tairaHistory from '../../../tests/fixtures/taira-history.json';

// DTO rows are retained from public Taira; pagination is the current collection contract.
const blockCursor = 'opaque_server_cursor_2026';
const blocks = { items: tairaHistory.blocks.items, next_cursor: blockCursor };
const latest = { items: tairaHistory.latestTransactions.items, next_cursor: null };
const nativeFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = nativeFetch; });

describe('opaque Taira collection continuations', () => {
  it('parses SDK block and latest transaction pages without client snapshot metadata', () => {
    const parsed = CollectionPage(Block).parse({ items: blocks.items, nextCursor: blockCursor });
    expect(parsed.items[0].height).toBe(835);
    expect(parsed.items[0].created_at).toEqual(new Date('2026-09-12T03:30:05.553Z'));
    expect(parsed.nextCursor).toBe(blockCursor);
    expect(LatestTransactionsResponse.parse({ items: latest.items, nextCursor: null }).items[0].authority)
      .toBe(latest.items[0].authority);
  });

  it.each(['opaque', 'A'.repeat(192), 'B'.repeat(204), 'C'.repeat(1500)])(
    'does not guess a server cursor frame from its length or prefix', (nextCursor) => {
      expect(CollectionContinuation.parse({ nextCursor }).nextCursor).toBe(nextCursor);
    }
  );

  it('requires a continuation or explicit exhaustion and rejects retired envelopes', () => {
    expect(CollectionContinuation.parse({ nextCursor: null })).toEqual({ nextCursor: null });
    expect(CollectionContinuation.safeParse({ nextCursor: '' }).success).toBe(false);
    expect(CollectionPage(Block).safeParse(tairaHistory.blocks).success).toBe(false);
  });

  it('uses the installed SDK POST query and forwards an empty-page continuation unchanged', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [], next_cursor: blockCursor }))
      .mockResolvedValueOnce(jsonResponse({ items: blocks.items, next_cursor: null }));
    globalThis.fetch = fetchSpy;
    const first = await fetchBlocks({ limit: 2 });
    if (first.status !== 'ok') throw new Error('Expected successful collection page');
    expect(first.data.items).toEqual([]);
    const second = await fetchBlocks({ limit: 2, cursor: first.data.nextCursor });
    expect(second.status).toBe('ok');
    expect(new URL(String(fetchSpy.mock.calls[1][0])).pathname).toBe('/v1/explorer/blocks/query');
    expect(fetchSpy.mock.calls[1][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({ limit: 2, cursor: blockCursor });
  });

  it('loads the current latest endpoint without requiring sampling metadata', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(latest));
    globalThis.fetch = fetchSpy;
    const result = await fetchLatestTransactions({ limit: 2 });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.items).toHaveLength(2);
    expect(new URL(String(fetchSpy.mock.calls[0][0])).pathname).toBe('/v1/explorer/transactions/latest/query');
  });

  it('retains an explicit committed block bound across filtered instruction scans', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));
    globalThis.fetch = fetchSpy;
    await fetchInstructions({ limit: 10, kind: 'Mint', max_block_height: 12 });
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.filter).toEqual({ op: 'and', args: [
      { op: 'eq', args: ['kind', 'Mint'] }, { op: 'lte', args: ['block', 12] },
    ] });
  });
});
