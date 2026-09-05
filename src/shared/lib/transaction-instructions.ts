import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { InstructionsSearchParamsSchema } from '@/shared/api/schemas';
import type { Instruction, InstructionsSearchParams } from '@/shared/api/schemas';

export interface FetchAllTransactionInstructionsOptions {
  transactionHash: string;
  fetchInstructions: (params?: InstructionsSearchParams) => Promise<{
    status: string;
    data?: {
      items: Instruction[];
      pagination: {
        next_cursor: string | null;
        has_more: boolean;
      };
    };
  }>;
  limit?: number;
  maxPages?: number;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 128;

function requirePositiveInteger(
  name: string,
  value: number | undefined,
  bounds: { fallback: number; max: number }
): number {
  const candidate = value ?? bounds.fallback;
  const { max } = bounds;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > max) {
    throw new TypeError(`${name} must be an integer from 1 through ${max}`);
  }
  return candidate;
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
  const limit = requirePositiveInteger('Instruction page limit', options.limit, {
    fallback: DEFAULT_LIMIT,
    max: 100,
  });
  const maxPages = requirePositiveInteger(
    'Instruction cursor-page safety limit',
    options.maxPages,
    { fallback: DEFAULT_MAX_PAGES, max: DEFAULT_MAX_PAGES }
  );
  const collected: Instruction[] = [];
  const visitedCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const request = InstructionsSearchParamsSchema.parse({
      cursor,
      limit,
      transaction_hash: options.transactionHash,
    });
    const response = await options.fetchInstructions(request);

    if (response.status !== SUCCESSFUL_FETCHING || !response.data) {
      throw new Error(`Failed to fetch transaction instructions cursor page ${pageNumber}`);
    }

    collected.push(...response.data.items);

    if (!response.data.pagination.has_more) {
      return uniqueSortedByIndex(collected);
    }

    const nextCursor = response.data.pagination.next_cursor;
    if (!nextCursor) {
      throw new Error('Instruction history reported more pages without a continuation cursor');
    }
    if (visitedCursors.has(nextCursor)) {
      throw new Error('Instruction history returned a repeated continuation cursor');
    }
    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error(`Instruction history exceeded the ${maxPages}-page safety limit`);
}
