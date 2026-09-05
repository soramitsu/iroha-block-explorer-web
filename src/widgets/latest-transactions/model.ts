import type { Transaction as TransactionDto } from '@/shared/api/schemas';

function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeLatestTransactions(
  sources: readonly (readonly TransactionDto[])[],
  limit: number
): TransactionDto[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const byHash = new Map<string, TransactionDto>();
  for (const source of sources) {
    for (const transaction of source) {
      if (byHash.has(transaction.hash)) continue;
      byHash.set(transaction.hash, transaction);
    }
  }

  return [...byHash.values()]
    .sort((left, right) => {
      const timeDelta = toTimestamp(right.created_at) - toTimestamp(left.created_at);
      if (timeDelta !== 0) return timeDelta;
      const blockDelta = right.block - left.block;
      if (blockDelta !== 0) return blockDelta;
      return right.hash.localeCompare(left.hash);
    })
    .slice(0, limit);
}
