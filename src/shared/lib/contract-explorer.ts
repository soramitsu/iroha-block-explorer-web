import { ToriiStreamGapError } from '@iroha/iroha-js/torii-browser';
import type {
  ContractActivitySearchParams,
  ContractEventFilters,
  ContractEventSearchParams,
} from '@/shared/api';
import type { ContractEvent } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import {
  normalizeAssetDefinitionSelectorLiteral,
  parseAssetIdLiteral,
} from '@/shared/lib/asset-definition-literal';
import { firstRouteQueryValue } from '@/shared/lib/route-query';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

export type ContractExplorerTab = 'deployments' | 'activity' | 'events';
export type ContractFilterParseResult<T> =
  | { ok: true, value: T }
  | { ok: false, error: string };

const CONTRACT_TABS = new Set<ContractExplorerTab>(['deployments', 'activity', 'events']);

export function parseContractExplorerTab(value: unknown): ContractExplorerTab {
  const raw = firstRouteQueryValue(value);
  return raw && CONTRACT_TABS.has(raw as ContractExplorerTab)
    ? raw as ContractExplorerTab
    : 'deployments';
}

function parseExactString(
  query: Record<string, unknown>,
  key: string,
  errors: string[]
): string | undefined {
  const source = query[key];
  if (source === undefined) return undefined;
  if (Array.isArray(source) && source.length !== 1) {
    errors.push(`${key} must be provided once`);
    return undefined;
  }
  const value = Array.isArray(source) ? source[0] : source;
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string value`);
    return undefined;
  }
  if (!value || value.trim() !== value) {
    errors.push(`${key} must be non-empty and contain no surrounding whitespace`);
    return undefined;
  }
  return value;
}

function parseTimestamp(
  query: Record<string, unknown>,
  key: string,
  errors: string[]
): number | undefined {
  const raw = parseExactString(query, key, errors);
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    errors.push(`${key} must be a canonical non-negative integer`);
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    errors.push(`${key} exceeds the safe integer range`);
    return undefined;
  }
  return value;
}

function parseResult(
  query: Record<string, unknown>,
  errors: string[]
): boolean | undefined {
  const raw = parseExactString(query, 'result_ok', errors);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push('result_ok must be true or false');
  return undefined;
}

function parseCommonFilters(query: Record<string, unknown>, errors: string[]) {
  const sinceTimestampMs = parseTimestamp(query, 'since_timestamp_ms', errors);
  const untilTimestampMs = parseTimestamp(query, 'until_timestamp_ms', errors);
  if (
    sinceTimestampMs !== undefined &&
    untilTimestampMs !== undefined &&
    sinceTimestampMs > untilTimestampMs
  ) {
    errors.push('since_timestamp_ms must not be greater than until_timestamp_ms');
  }

  return {
    authority: parseExactString(query, 'authority', errors),
    contract_address: parseExactString(query, 'contract_address', errors),
    contract_alias: parseExactString(query, 'contract_alias', errors),
    since_timestamp_ms: sinceTimestampMs,
    until_timestamp_ms: untilTimestampMs,
    result_ok: parseResult(query, errors),
  };
}

function parseFailure<T>(errors: string[], value: T): ContractFilterParseResult<T> {
  if (errors.length > 0) return { ok: false, error: `Invalid contract filters: ${errors.join('; ')}` };
  return { ok: true, value };
}

export function parseContractActivitySearchParams(
  query: Record<string, unknown>,
  cursor: string | null,
  limit: number
): ContractFilterParseResult<ContractActivitySearchParams> {
  const errors: string[] = [];
  const value: ContractActivitySearchParams = {
    cursor,
    limit,
    ...parseCommonFilters(query, errors),
    contract_entrypoint: parseExactString(query, 'contract_entrypoint', errors),
  };
  return parseFailure(errors, value);
}

export function parseContractEventSearchParams(
  query: Record<string, unknown>,
  cursor: string | null,
  limit: number
): ContractFilterParseResult<ContractEventSearchParams> {
  const errors: string[] = [];
  const provenance = parseExactString(query, 'provenance', errors);
  if (provenance !== undefined && provenance !== 'emitted' && provenance !== 'derived') {
    errors.push('provenance must be emitted or derived');
  }

  const value: ContractEventSearchParams = {
    cursor,
    limit,
    ...parseCommonFilters(query, errors),
    module: parseExactString(query, 'module', errors),
    event_kind: parseExactString(query, 'event_kind', errors),
    participant: parseExactString(query, 'participant', errors),
    asset_id: parseExactString(query, 'asset_id', errors),
    provenance: provenance === 'emitted' || provenance === 'derived' ? provenance : undefined,
  };
  return parseFailure(errors, value);
}

export function contractEventFiltersFromSearchParams(
  params: ContractEventSearchParams
): ContractEventFilters {
  const { cursor: _cursor, limit: _limit, ...filters } = params;
  return filters;
}

type ApiResult<T> =
  | { status: typeof SUCCESSFUL_FETCHING, data: T }
  | { status: string, error?: unknown };

export function unwrapContractListSnapshot<T extends { items: readonly unknown[] }>(
  snapshot: ResourceSnapshot<ApiResult<T>>,
  validationError?: string
): ResourceSnapshot<T> {
  if (validationError) {
    return {
      status: 'error',
      problem: { kind: 'invalid-response', message: validationError },
    };
  }
  if (snapshot.status !== 'ready') return snapshot;
  if (snapshot.data.status !== SUCCESSFUL_FETCHING || !('data' in snapshot.data)) {
    return {
      status: 'error',
      problem: { kind: 'invalid-response', message: 'Torii did not return a contract list' },
    };
  }
  if (snapshot.data.data.items.length === 0) return { status: 'not-found' };
  return {
    status: 'ready',
    data: snapshot.data.data,
    isRefreshing: snapshot.isRefreshing,
    refreshError: snapshot.refreshError,
  };
}

export function contractAccountPath(value: string): string | null {
  const normalized = normalizeAccountSelectorLiteral(value);
  return normalized ? `/accounts/${encodeURIComponent(normalized)}` : null;
}

export function contractAssetPath(value: string): string | null {
  const asset = parseAssetIdLiteral(value);
  const definition = asset?.definitionId ?? normalizeAssetDefinitionSelectorLiteral(value);
  return definition ? `/assets/${encodeURIComponent(definition)}` : null;
}

export function appendLiveContractEvent(
  current: readonly ContractEvent[],
  event: ContractEvent,
  limit = 50
): ContractEvent[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  return [event, ...current.filter((item) => item.event_id !== event.event_id)].slice(0, limit);
}

export type ContractStreamState =
  | { status: 'idle' | 'connecting' | 'live' | 'stopped' }
  | {
      status: 'stale'
      message: string
      code: string | null
      droppedMessages: number | null
      replayAvailable: false
    };

export function contractStreamStaleState(error: unknown): ContractStreamState {
  if (error instanceof ToriiStreamGapError) {
    return {
      status: 'stale',
      message: error.message,
      code: error.code,
      droppedMessages: error.droppedMessages,
      replayAvailable: false,
    };
  }
  return {
    status: 'stale',
    message: error instanceof Error ? error.message : String(error),
    code: null,
    droppedMessages: null,
    replayAvailable: false,
  };
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

export function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value };
}
