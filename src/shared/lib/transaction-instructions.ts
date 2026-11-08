import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Instruction, InstructionsSearchParams, CollectionPage } from '@/shared/api/schemas';

export interface FetchAllTransactionInstructionsOptions {
  transactionHash: string
  fetchInstructions: (params?: InstructionsSearchParams) => Promise<{
    status: string
    data?: CollectionPage<Instruction>
  }>
  limit?: number
  maxPages?: number
}

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 128;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

function uniqueSortedByIndex(instructions: Instruction[]): Instruction[] {
  const uniqueByIndex = new Map<number, Instruction>();
  for (const instruction of instructions) {
    uniqueByIndex.set(instruction.index, instruction);
  }
  return [...uniqueByIndex.values()].sort((left, right) => left.index - right.index);
}

export async function fetchAllTransactionInstructions(
  options: FetchAllTransactionInstructionsOptions
): Promise<Instruction[]> {
  const limit = Math.min(100, normalizePositiveInteger(options.limit, DEFAULT_LIMIT));
  const maxPages = normalizePositiveInteger(options.maxPages, DEFAULT_MAX_PAGES);
  const collected: Instruction[] = [];

  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await options.fetchInstructions({ cursor, limit, transaction_hash: options.transactionHash });
    if (response.status !== SUCCESSFUL_FETCHING || !response.data) {
      throw new Error(`Failed to fetch transaction instructions page ${page}`);
    }
    const { nextCursor, items } = response.data;
    collected.push(...items);
    if (nextCursor === null) return uniqueSortedByIndex(collected);
    if (!nextCursor || seen.has(nextCursor)) throw new Error('Instruction history cursor did not advance');
    seen.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error('Instruction history exceeded the bounded page limit');
}
