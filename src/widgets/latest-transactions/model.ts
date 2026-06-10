import { Transaction as TransactionSchema } from '@/shared/api/schemas';
import type { Transaction as TransactionDto, TransactionStatus as TransactionStatusType } from '@/shared/api/schemas';

const CACHE_VERSION = 1;
const CACHE_ITEMS_LIMIT = 30;

interface LatestTransactionsCachePayload {
  version: number
  updated_at_ms: number
  items: unknown
}

export const LATEST_TRANSACTIONS_CACHE_KEY = 'latest_transactions_cache_v2';

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

export function buildLatestTransactionsCachePayload(items: readonly TransactionDto[]): string {
  const normalized = mergeLatestTransactions([items], CACHE_ITEMS_LIMIT);
  return JSON.stringify({
    version: CACHE_VERSION,
    updated_at_ms: Date.now(),
    items: normalized,
  } satisfies LatestTransactionsCachePayload);
}

export function parseLatestTransactionsCache(
  raw: string | null,
  options: { status: TransactionStatusType | null, limit: number }
): TransactionDto[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as LatestTransactionsCachePayload;
    if (typeof parsed !== 'object' || parsed === null) return [];
    if (parsed.version !== CACHE_VERSION) return [];
    if (!Array.isArray(parsed.items)) return [];

    const decoded = TransactionSchema.array().safeParse(parsed.items);
    if (!decoded.success) return [];

    const filtered = options.status
      ? decoded.data.filter((transaction) => transaction.status === options.status)
      : decoded.data;

    return mergeLatestTransactions([filtered], options.limit);
  } catch {
    return [];
  }
}
