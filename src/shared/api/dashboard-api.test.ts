import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { jsonResponse } from '../../../tests/fixtures/http-response';
import type * as ApiIndexModule from './index';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

vi.mock('@vueuse/core', () => ({
  useEventSource: vi.fn(() => ({ data: ref<string | null>(null), status: ref('CONNECTING') })),
}));

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => ({}),
}));

const TORII_ENV = { VITE_API_URL: 'https://torii.example/v1/explorer' };
const SAMPLE_AUTHORITY = 'testuﾛ1QDﾘHKHsncAQPsﾐﾚCCecｴVﾖrTﾖx2ﾒﾕﾃVﾂﾓVﾕﾇｾaﾐ2GBTXB';
const nativeFetch = global.fetch;

async function importApi(): Promise<typeof ApiIndexModule> {
  vi.resetModules();
  vi.unstubAllEnvs();
  Object.entries(TORII_ENV).forEach(([key, value]) => vi.stubEnv(key, value));
  return await import('./index');
}

function sentQuery(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [url, init] = spy.mock.calls[0] as [URL, RequestInit];
  expect(url.pathname).toBe('/v1/explorer/blocks/query');
  expect(init.method).toBe('POST');
  return JSON.parse(String(init.body));
}

const STATUS = {
  build: { version: '2.0.0-rc.2.0', git_commit_sha: 'abc' },
  observed_at_ms: 1_792_828_007_602,
  peers: 3,
  blocks: 1101,
  blocks_non_empty: 1101,
  commit_time_ms: 3830,
  txs_approved: 1292,
  txs_rejected: 10,
  txs_rejected_recent_5m: 0,
  uptime: { secs: 162_998, nanos: 785_000_000 },
  view_changes: 50,
  queue_size: 2,
  queue_queued: 1,
  queue_inflight: 1,
  last_block_committed_at_ms: 1_792_826_635_145,
  time_since_last_block_ms: 1_372_457,
  sumeragi: {
    mode_tag: 'npos',
    tx_queue_depth: 1,
    tx_queue_capacity: 20_000,
    tx_queue_saturated: false,
    tx_queue_oldest_queued_age_ms: 900,
  },
  teu_lane_commit: [{ lane_id: 0, capacity: 50_000_000, committed: 384, block_height: 1101, settlement_backlog_xor_micro: 0 }],
  teu_dataspace_backlog: [],
  dataspace_catalog: [{ lane_id: 0, lane_alias: 'core', dataspace_id: 0, alias: 'universal' }],
};

function without(value: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

beforeEach(() => {
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') localStorage.clear();
});

afterEach(() => {
  global.fetch = nativeFetch;
});

describe('fetchBlockSamples', () => {
  it('requests the dashboard projection and maps rows to samples', async () => {
    const spy = vi.fn().mockImplementation(() =>
      jsonResponse({
        items: [
          { height: 1102, created_at: '2026-10-24T07:48:01.266Z', transactions_total: 3, transactions_rejected: 1 },
          { height: 1101, created_at: '', transactions_total: 0, transactions_rejected: 0 },
        ],
        next_cursor: 'next-page',
      })
    );
    global.fetch = spy as any;
    const api = await importApi();
    const result = await api.fetchBlockSamples({ limit: 100, cursor: 'previous' });

    const query = sentQuery(spy);
    expect(query.select).toEqual(['height', 'created_at', 'transactions_total', 'transactions_rejected']);
    expect(query.limit).toBe(100);
    expect(query.cursor).toBe('previous');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) return;
    expect(result.data.nextCursor).toBe('next-page');
    expect(result.data.items).toEqual([
      { height: 1102, createdAtMs: Date.parse('2026-10-24T07:48:01.266Z'), transactionsTotal: 3, transactionsRejected: 1 },
      // An unreadable body keeps unknown counts instead of measured zeros.
      { height: 1101, createdAtMs: null, transactionsTotal: 0, transactionsRejected: 0 },
    ]);
  });

  it('rejects a page that ignored the projection', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        items: [
          {
            height: 5,
            hash: 'hash:00',
            created_at: '2026-10-24T07:48:01.266Z',
            transactions_total: 1,
            transactions_rejected: 0,
          },
        ],
        next_cursor: null,
      })
    ) as any;
    const api = await importApi();
    await expect(api.fetchBlockSamples({ limit: 1 })).rejects.toThrow();
  });

  it('rejects impossible counters and malformed times', async () => {
    for (const row of [
      { height: 5, created_at: '2026-10-24T07:48:01Z', transactions_total: 1, transactions_rejected: 2 },
      { height: 5, created_at: 'yesterday', transactions_total: 1, transactions_rejected: 0 },
    ]) {
      global.fetch = vi.fn().mockImplementation(() => jsonResponse({ items: [row], next_cursor: null })) as any;
      const api = await importApi();
      await expect(api.fetchBlockSamples({ limit: 1 })).rejects.toThrow();
    }
  });
});

describe('fetchNodeStatus', () => {
  it('parses the typed peer snapshot from root /status', async () => {
    const spy = vi.fn().mockImplementation(() => jsonResponse(STATUS));
    global.fetch = spy as any;
    const api = await importApi();
    const result = await api.fetchNodeStatus();

    expect((spy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/status');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) return;
    expect(result.data.commit_time_ms).toBe(3830);
    expect(result.data.queue_inflight).toBe(1);
    expect(result.data.sumeragi?.tx_queue_capacity).toBe(20_000);
    expect(result.data.teu_lane_commit[0]).toMatchObject({ lane_id: 0, capacity: 50_000_000, committed: 384 });
    expect(result.data.dataspace_catalog[0]?.alias).toBe('universal');
  });

  it('accepts a peer without a consensus snapshot or catalogue', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(without(STATUS, 'sumeragi', 'dataspace_catalog'))) as any;
    const api = await importApi();
    const result = await api.fetchNodeStatus();
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) return;
    expect(result.data.sumeragi).toBeUndefined();
    expect(result.data.dataspace_catalog).toEqual([]);
  });

  it('rejects snapshots missing typed fields', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(without(STATUS, 'queue_inflight'))) as any;
    const api = await importApi();
    await expect(api.fetchNodeStatus()).rejects.toThrow();
  });
});

describe('fetchTransactionSamples', () => {
  it('requests the sample projection from the transactions feed and parses creation time', async () => {
    const spy = vi.fn().mockImplementation(() =>
      jsonResponse({
        items: [
          {
            authority: SAMPLE_AUTHORITY,
            block: 1102,
            created_at: '2026-10-24T07:47:59.865Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
        next_cursor: null,
      })
    );
    global.fetch = spy as any;
    const api = await importApi();
    const result = await api.fetchTransactionSamples({ limit: 100 });

    const [url, init] = spy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/v1/explorer/transactions/query');
    expect(JSON.parse(String(init.body)).select).toEqual(['authority', 'block', 'created_at', 'executable', 'status']);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) return;
    expect(result.data.items[0]).toMatchObject({
      block: 1102,
      createdAtMs: Date.parse('2026-10-24T07:47:59.865Z'),
      executable: 'Instructions',
      status: 'Committed',
    });
  });

  it('keeps unknown executable kinds instead of failing the page', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        items: [{ authority: SAMPLE_AUTHORITY, block: 3, created_at: '2026-10-24T07:47:59Z', executable: 'Batch', status: 'Rejected' }],
        next_cursor: null,
      })
    ) as any;
    const api = await importApi();
    const result = await api.fetchTransactionSamples({ limit: 1 });
    expect(result.status === SUCCESSFUL_FETCHING && result.data.items[0]?.executable).toBe('Batch');
  });

  it('rejects rows that ignored the projection or carry an unknown status', async () => {
    for (const row of [
      { authority: SAMPLE_AUTHORITY, hash: 'hash:00', block: 3, created_at: '2026-10-24T07:47:59Z', executable: 'Instructions', status: 'Committed' },
      { authority: SAMPLE_AUTHORITY, block: 3, created_at: '2026-10-24T07:47:59Z', executable: 'Instructions', status: 'Pending' },
    ]) {
      global.fetch = vi.fn().mockImplementation(() => jsonResponse({ items: [row], next_cursor: null })) as any;
      const api = await importApi();
      await expect(api.fetchTransactionSamples({ limit: 1 })).rejects.toThrow();
    }
  });
});
