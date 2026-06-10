import type { UNKNOWN_ERROR } from '@/shared/api/consts';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Instruction } from '@/shared/api/schemas';

type InstructionDetailResult =
  | { status: typeof SUCCESSFUL_FETCHING, data: Instruction }
  | { status: typeof NOT_FOUND }
  | { status: typeof UNKNOWN_ERROR };

export type FetchInstructionDetail = (
  transactionHash: string,
  index: number
) => Promise<InstructionDetailResult>;

export interface CollectInstructionFallbackOptions {
  transactionHash: string
  fetchInstructionDetail: FetchInstructionDetail
  maxProbe?: number
  priorityIndex?: number | null
}

const DEFAULT_MAX_PROBE = 32;

function normalizeProbeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_PROBE;
  return Math.max(1, Math.floor(value as number));
}

function normalizePriorityIndex(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const index = Math.floor(value as number);
  return index >= 0 ? index : null;
}

function uniqueSortedByIndex(instructions: Instruction[]): Instruction[] {
  const uniqueByIndex = new Map<number, Instruction>();
  for (const instruction of instructions) {
    if (!uniqueByIndex.has(instruction.index)) {
      uniqueByIndex.set(instruction.index, instruction);
    }
  }

  return [...uniqueByIndex.values()].sort((left, right) => left.index - right.index);
}

export async function collectInstructionFallback(options: CollectInstructionFallbackOptions): Promise<Instruction[]> {
  const maxProbe = normalizeProbeLimit(options.maxProbe);
  const priorityIndex = normalizePriorityIndex(options.priorityIndex);
  const collected: Instruction[] = [];

  for (let index = 0; index < maxProbe; index++) {
    const response = await options.fetchInstructionDetail(options.transactionHash, index);

    if (response.status === SUCCESSFUL_FETCHING) {
      collected.push(response.data);
      continue;
    }

    if (response.status === NOT_FOUND) {
      if (index === 0 && priorityIndex !== null && priorityIndex > 0) {
        continue;
      }
      break;
    }

    break;
  }

  if (priorityIndex !== null && !collected.some((instruction) => instruction.index === priorityIndex)) {
    const response = await options.fetchInstructionDetail(options.transactionHash, priorityIndex);
    if (response.status === SUCCESSFUL_FETCHING) {
      collected.push(response.data);
    }
  }

  return uniqueSortedByIndex(collected);
}
