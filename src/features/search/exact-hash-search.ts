import type { Block, DetailedTransaction } from '@/shared/api/schemas';
import { NOT_FOUND, SUCCESSFUL_FETCHING, type UnknownError } from '@/shared/api/consts';
import {
  apiProblemFromError,
  resourceResultProblem,
  type ApiProblem,
  type ResourceSnapshot,
} from '@/shared/utils/resource-state';
import { classifySearchQuery } from './classifier';

export type ExactSearchProbe<T> =
  | { kind: 'match', value: T }
  | { kind: 'not-found' }
  | { kind: 'error', problem: ApiProblem };

export interface ExactHashSearchResult {
  query: string
  block: ExactSearchProbe<Block>
  transaction: ExactSearchProbe<DetailedTransaction>
}

type ApiResult<T> =
  | { status: typeof SUCCESSFUL_FETCHING, data: T }
  | { status: typeof NOT_FOUND }
  | { status: UnknownError, error: Error };

export interface ExactHashSearchDependencies {
  fetchBlock: (hash: string) => Promise<ApiResult<Block>>
  fetchTransaction: (hash: string) => Promise<ApiResult<DetailedTransaction>>
}

function probeFromSettledResult<T>(settled: PromiseSettledResult<ApiResult<T>>): ExactSearchProbe<T> {
  if (settled.status === 'rejected') {
    return { kind: 'error', problem: apiProblemFromError(settled.reason) };
  }

  const result = settled.value;
  if (result.status === SUCCESSFUL_FETCHING) return { kind: 'match', value: result.data };
  if (result.status === NOT_FOUND) return { kind: 'not-found' };
  return { kind: 'error', problem: resourceResultProblem(result) };
}

export async function resolveExactHashSearch(
  input: string,
  dependencies: ExactHashSearchDependencies
): Promise<ExactHashSearchResult> {
  const classification = classifySearchQuery(input);
  if (classification.kind !== 'hash') {
    throw new RangeError('Exact hash search requires 64 hexadecimal characters');
  }

  const query = classification.value;
  const [block, transaction] = await Promise.allSettled([
    dependencies.fetchBlock(query),
    dependencies.fetchTransaction(query),
  ]);

  return {
    query,
    block: probeFromSettledResult(block),
    transaction: probeFromSettledResult(transaction),
  };
}

export function snapshotFromExactHashSearch(
  result: ExactHashSearchResult
): ResourceSnapshot<ExactHashSearchResult> {
  const probes = [result.block, result.transaction] as const;
  if (probes.some(probe => probe.kind === 'match')) {
    return { status: 'ready', data: result, isRefreshing: false, refreshError: null };
  }

  const failedProbe = probes.find(probe => probe.kind === 'error');
  if (failedProbe?.kind === 'error') return { status: 'error', problem: failedProbe.problem };
  return { status: 'not-found' };
}
