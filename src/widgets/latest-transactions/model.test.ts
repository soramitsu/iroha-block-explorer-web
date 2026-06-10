import { describe, expect, it, vi } from 'vitest';
import type { Transaction as TransactionDto } from '@/shared/api/schemas';
import {
  buildLatestTransactionsCachePayload,
  mergeLatestTransactions,
  parseLatestTransactionsCache,
} from './model';

const SAMPLE_I105 = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

function tx(overrides: Partial<TransactionDto> & { hash: string }): TransactionDto {
  return {
    authority: SAMPLE_I105,
    hash: overrides.hash,
    block: overrides.block ?? 1,
    created_at: overrides.created_at ?? new Date('2026-01-01T00:00:00Z'),
    executable: overrides.executable ?? 'Instructions',
    status: overrides.status ?? 'Committed',
  };
}

describe('latest-transactions model', () => {
  it('deduplicates hashes and sorts by recency', () => {
    const t1 = tx({ hash: 'tx-1', block: 10, created_at: new Date('2026-01-01T00:00:02Z') });
    const t2 = tx({ hash: 'tx-2', block: 9, created_at: new Date('2026-01-01T00:00:01Z') });
    const duplicate = tx({ hash: 'tx-1', block: 8, created_at: new Date('2026-01-01T00:00:03Z') });

    const merged = mergeLatestTransactions([[t1], [duplicate, t2]], 5);

    expect(merged).toEqual([t1, t2]);
  });

  it('respects the output limit', () => {
    const merged = mergeLatestTransactions(
      [[tx({ hash: 'tx-1' }), tx({ hash: 'tx-2' }), tx({ hash: 'tx-3' }), tx({ hash: 'tx-4' })]],
      2
    );

    expect(merged).toHaveLength(2);
  });

  it('parses, filters by status, and limits cached entries', () => {
    const payload = buildLatestTransactionsCachePayload([
      tx({ hash: 'tx-1', status: 'Committed', created_at: new Date('2026-01-01T00:00:03Z') }),
      tx({ hash: 'tx-2', status: 'Rejected', created_at: new Date('2026-01-01T00:00:02Z') }),
      tx({ hash: 'tx-3', status: 'Committed', created_at: new Date('2026-01-01T00:00:01Z') }),
    ]);

    const committedOnly = parseLatestTransactionsCache(payload, { status: 'Committed', limit: 1 });

    expect(committedOnly.map((item) => item.hash)).toEqual(['tx-1']);
  });

  it('returns empty cache when payload version is unsupported', () => {
    const raw = JSON.stringify({
      version: 0,
      updated_at_ms: Date.now(),
      items: [tx({ hash: 'tx-1' })],
    });

    expect(parseLatestTransactionsCache(raw, { status: null, limit: 5 })).toEqual([]);
  });

  it('returns empty cache on malformed payload', () => {
    const spy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new Error('broken');
    });

    expect(parseLatestTransactionsCache('bad-json', { status: null, limit: 5 })).toEqual([]);
    spy.mockRestore();
  });
});
