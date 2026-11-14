import { describe, expect, it } from 'vitest';
import type { Transaction as TransactionDto } from '@/shared/api/schemas';
import { mergeLatestTransactions } from './model';

const SAMPLE_I105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const transactionHash1 = '1'.repeat(64);
const transactionHash2 = '2'.repeat(64);
const transactionHash3 = '3'.repeat(64);
const transactionHash4 = '4'.repeat(64);

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
    const t1 = tx({ hash: transactionHash1, block: 10, created_at: new Date('2026-01-01T00:00:02Z') });
    const t2 = tx({ hash: transactionHash2, block: 9, created_at: new Date('2026-01-01T00:00:01Z') });
    const duplicate = tx({ hash: transactionHash1, block: 8, created_at: new Date('2026-01-01T00:00:03Z') });

    const merged = mergeLatestTransactions([[t1], [duplicate, t2]], 5);

    expect(merged).toEqual([t1, t2]);
  });

  it('respects the output limit', () => {
    const merged = mergeLatestTransactions(
      [[
        tx({ hash: transactionHash1 }),
        tx({ hash: transactionHash2 }),
        tx({ hash: transactionHash3 }),
        tx({ hash: transactionHash4 }),
      ]],
      2
    );

    expect(merged).toHaveLength(2);
  });
});
