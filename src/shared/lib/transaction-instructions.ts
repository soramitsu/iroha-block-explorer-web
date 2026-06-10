import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Instruction, InstructionsSearchParams, Paginated } from '@/shared/api/schemas';

export interface FetchAllTransactionInstructionsOptions {
  transactionHash: string
  fetchInstructions: (params?: InstructionsSearchParams) => Promise<{
    status: string
    data?: Paginated<Instruction>
  }>
  perPage?: number
  maxPages?: number
}

const DEFAULT_PER_PAGE = 128;
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
  const perPage = normalizePositiveInteger(options.perPage, DEFAULT_PER_PAGE);
  const maxPages = normalizePositiveInteger(options.maxPages, DEFAULT_MAX_PAGES);
  const collected: Instruction[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await options.fetchInstructions({
      page,
      per_page: perPage,
      transaction_hash: options.transactionHash,
    });

    if (response.status !== SUCCESSFUL_FETCHING || !response.data) {
      throw new Error(`Failed to fetch transaction instructions page ${page}`);
    }

    collected.push(...response.data.items);

    const totalPages = Math.max(0, response.data.pagination.total_pages);
    if (response.data.items.length === 0 || totalPages <= page) {
      break;
    }
  }

  return uniqueSortedByIndex(collected);
}
