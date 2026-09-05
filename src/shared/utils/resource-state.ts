import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

export type ApiProblem =
  | { kind: 'http'; status: number; message: string }
  | { kind: 'network' | 'timeout' | 'invalid-response'; message: string };

export type ResourceSnapshot<T> =
  | { status: 'idle' }
  | { status: 'initial-loading' }
  | { status: 'ready'; data: T; isRefreshing: boolean; refreshError: ApiProblem | null }
  | { status: 'not-found' }
  | { status: 'error'; problem: ApiProblem };

interface ResultRecord {
  status: string;
  error?: unknown;
}

function isResultRecord(value: unknown): value is ResultRecord {
  return Boolean(value && typeof value === 'object' && 'status' in value);
}

export function apiProblemFromError(error: unknown): ApiProblem {
  if (isResultRecord(error) && error.status === UNKNOWN_ERROR) {
    return apiProblemFromError(error.error ?? new Error());
  }

  if (error && typeof error === 'object') {
    const status = 'status' in error ? Number(error.status) : NaN;
    const message = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return { kind: 'http', status, message };
    }
    if ('name' in error && error.name === 'AbortError') {
      return { kind: 'timeout', message };
    }
  }

  if (error instanceof TypeError) return { kind: 'network', message: error.message };
  if (error instanceof Error) return { kind: 'invalid-response', message: error.message };
  return { kind: 'invalid-response', message: String(error) };
}

export function resourceResultStatus(value: unknown): 'ready' | 'not-found' | 'error' {
  if (!isResultRecord(value)) return 'ready';
  if (value.status === NOT_FOUND) return 'not-found';
  if (value.status === UNKNOWN_ERROR) return 'error';
  if (value.status === SUCCESSFUL_FETCHING) return 'ready';
  return 'ready';
}

export function resourceResultProblem(value: unknown): ApiProblem {
  if (isResultRecord(value) && value.status === UNKNOWN_ERROR) {
    return apiProblemFromError(value.error ?? new Error());
  }
  return apiProblemFromError(value);
}
