import { ToriiStreamGapError } from '@iroha/iroha-js/torii-browser';
import type { ContractActivitySearchParams, ContractEventFilters, ContractEventSearchParams } from '@/shared/api';
import { ContractAddressSchema, ContractAliasSchema, type ContractEvent } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';
import { normalizeAssetDefinitionSelectorLiteral, parseAssetIdLiteral } from '@/shared/lib/asset-definition-literal';
import { firstRouteQueryValue } from '@/shared/lib/route-query';
import { isExactNoritoQueryStringValue } from '@/shared/lib/torii-query-string';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

export type ContractExplorerTab = 'activity' | 'events';
export type ContractFilterField =
  | 'authority'
  | 'contract_address'
  | 'contract_alias'
  | 'contract_entrypoint'
  | 'module'
  | 'event_kind'
  | 'participant'
  | 'asset_id'
  | 'provenance'
  | 'result_ok'
  | 'since_timestamp_ms'
  | 'until_timestamp_ms';
export type ContractFilterValidationIssue =
  | {
      readonly code: 'providedOnce' | 'stringValue' | 'nonEmpty' | 'canonicalInteger' | 'safeIntegerRange';
      readonly params: { readonly field: ContractFilterField };
    }
  | {
      readonly code: 'canonicalAccountId';
      readonly params: { readonly field: 'authority'; readonly standard: 'I105' };
    }
  | {
      readonly code: 'canonicalContractAddress';
      readonly params: { readonly field: 'contract_address'; readonly standard: 'irohac Bech32m V1' };
    }
  | {
      readonly code: 'canonicalContractAlias';
      readonly params: { readonly field: 'contract_alias' };
    }
  | {
      readonly code: 'noritoStringValue';
      readonly params: { readonly field: ContractFilterField };
    }
  | {
      readonly code: 'booleanValue';
      readonly params: {
        readonly field: 'result_ok';
        readonly trueValue: 'true';
        readonly falseValue: 'false';
      };
    }
  | {
      readonly code: 'timestampOrder';
      readonly params: {
        readonly sinceField: 'since_timestamp_ms';
        readonly untilField: 'until_timestamp_ms';
      };
    }
  | {
      readonly code: 'provenanceValue';
      readonly params: {
        readonly field: 'provenance';
        readonly emittedValue: 'emitted';
        readonly derivedValue: 'derived';
      };
    };
export type ContractFilterValidationCode = ContractFilterValidationIssue['code'];
export type ContractFilterParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly ContractFilterValidationIssue[] };

export interface ContractListProblemMessages {
  readonly invalidListResponse: string;
  readonly validationError?: string;
}

const CONTRACT_TABS = new Set<ContractExplorerTab>(['activity', 'events']);

export function parseContractExplorerTab(value: unknown): ContractExplorerTab {
  const raw = firstRouteQueryValue(value);
  return raw && CONTRACT_TABS.has(raw as ContractExplorerTab) ? (raw as ContractExplorerTab) : 'activity';
}

function parseExactString(
  query: Record<string, unknown>,
  key: ContractFilterField,
  issues: ContractFilterValidationIssue[]
): string | undefined {
  const source = query[key];
  if (source === undefined) return undefined;
  if (Array.isArray(source) && source.length !== 1) {
    issues.push({ code: 'providedOnce', params: { field: key } });
    return undefined;
  }
  const value = Array.isArray(source) ? source[0] : source;
  if (typeof value !== 'string') {
    issues.push({ code: 'stringValue', params: { field: key } });
    return undefined;
  }
  if (!value || value.trim() !== value) {
    issues.push({ code: 'nonEmpty', params: { field: key } });
    return undefined;
  }
  return value;
}

function parseTimestamp(
  query: Record<string, unknown>,
  key: 'since_timestamp_ms' | 'until_timestamp_ms',
  issues: ContractFilterValidationIssue[]
): number | undefined {
  const raw = parseExactString(query, key, issues);
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    issues.push({ code: 'canonicalInteger', params: { field: key } });
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    issues.push({ code: 'safeIntegerRange', params: { field: key } });
    return undefined;
  }
  return value;
}

function parseNoritoString(
  query: Record<string, unknown>,
  key: ContractFilterField,
  issues: ContractFilterValidationIssue[]
): string | undefined {
  const raw = parseExactString(query, key, issues);
  if (raw === undefined) return undefined;
  if (!isExactNoritoQueryStringValue(raw)) {
    issues.push({ code: 'noritoStringValue', params: { field: key } });
    return undefined;
  }
  return raw;
}

function parseContractAddress(
  query: Record<string, unknown>,
  issues: ContractFilterValidationIssue[]
): string | undefined {
  const raw = parseExactString(query, 'contract_address', issues);
  if (raw === undefined) return undefined;
  if (!ContractAddressSchema.safeParse(raw).success) {
    issues.push({
      code: 'canonicalContractAddress',
      params: { field: 'contract_address', standard: 'irohac Bech32m V1' },
    });
    return undefined;
  }
  return raw;
}

function parseContractAlias(
  query: Record<string, unknown>,
  issues: ContractFilterValidationIssue[]
): string | undefined {
  const raw = parseExactString(query, 'contract_alias', issues);
  if (raw === undefined) return undefined;
  if (!ContractAliasSchema.safeParse(raw).success) {
    issues.push({ code: 'canonicalContractAlias', params: { field: 'contract_alias' } });
    return undefined;
  }
  return raw;
}

function parseCanonicalAccountId(
  query: Record<string, unknown>,
  key: 'authority',
  issues: ContractFilterValidationIssue[]
): string | undefined {
  const raw = parseExactString(query, key, issues);
  if (raw === undefined) return undefined;
  if (normalizeAccountIdLiteral(raw) !== raw) {
    issues.push({ code: 'canonicalAccountId', params: { field: key, standard: 'I105' } });
    return undefined;
  }
  return raw;
}

function parseResult(query: Record<string, unknown>, issues: ContractFilterValidationIssue[]): boolean | undefined {
  const raw = parseExactString(query, 'result_ok', issues);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  issues.push({
    code: 'booleanValue',
    params: { field: 'result_ok', trueValue: 'true', falseValue: 'false' },
  });
  return undefined;
}

function parseCommonFilters(query: Record<string, unknown>, issues: ContractFilterValidationIssue[]) {
  const sinceTimestampMs = parseTimestamp(query, 'since_timestamp_ms', issues);
  const untilTimestampMs = parseTimestamp(query, 'until_timestamp_ms', issues);
  if (sinceTimestampMs !== undefined && untilTimestampMs !== undefined && sinceTimestampMs > untilTimestampMs) {
    issues.push({
      code: 'timestampOrder',
      params: { sinceField: 'since_timestamp_ms', untilField: 'until_timestamp_ms' },
    });
  }

  return {
    authority: parseCanonicalAccountId(query, 'authority', issues),
    contract_address: parseContractAddress(query, issues),
    contract_alias: parseContractAlias(query, issues),
    since_timestamp_ms: sinceTimestampMs,
    until_timestamp_ms: untilTimestampMs,
    result_ok: parseResult(query, issues),
  };
}

function parseFailure<T>(issues: ContractFilterValidationIssue[], value: T): ContractFilterParseResult<T> {
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value };
}

export function parseContractActivitySearchParams(
  query: Record<string, unknown>,
  cursor: string | null,
  limit: number
): ContractFilterParseResult<ContractActivitySearchParams> {
  const issues: ContractFilterValidationIssue[] = [];
  const value: ContractActivitySearchParams = {
    cursor,
    limit,
    ...parseCommonFilters(query, issues),
    contract_entrypoint: parseNoritoString(query, 'contract_entrypoint', issues),
  };
  return parseFailure(issues, value);
}

export function parseContractEventSearchParams(
  query: Record<string, unknown>,
  cursor: string | null,
  limit: number
): ContractFilterParseResult<ContractEventSearchParams> {
  const issues: ContractFilterValidationIssue[] = [];
  const provenance = parseExactString(query, 'provenance', issues);
  if (provenance !== undefined && provenance !== 'emitted') {
    issues.push({
      code: 'provenanceValue',
      params: { field: 'provenance', emittedValue: 'emitted', derivedValue: 'derived' },
    });
  }

  const { contract_alias: _alias, ...common } = parseCommonFilters(query, issues);
  const value: ContractEventSearchParams = {
    cursor,
    limit,
    ...common,
    event_kind: parseNoritoString(query, 'event_kind', issues),
    participant: parseNoritoString(query, 'participant', issues),
    asset_id: parseNoritoString(query, 'asset_id', issues),
    provenance: provenance === 'emitted' ? provenance : undefined,
  };
  return parseFailure(issues, value);
}

export function contractEventFiltersFromSearchParams(params: ContractEventSearchParams): ContractEventFilters {
  const { cursor: _cursor, limit: _limit, ...filters } = params;
  return filters;
}

type ApiResult<T> = { status: typeof SUCCESSFUL_FETCHING; data: T } | { status: string; error?: unknown };

export function unwrapContractListSnapshot<T extends { items: readonly unknown[]; nextCursor: string | null }>(
  snapshot: ResourceSnapshot<ApiResult<T>>,
  problemMessages: ContractListProblemMessages
): ResourceSnapshot<T> {
  if (problemMessages.validationError) {
    return {
      status: 'error',
      problem: { kind: 'invalid-response', message: problemMessages.validationError },
    };
  }
  if (snapshot.status !== 'ready') return snapshot;
  if (snapshot.data.status !== SUCCESSFUL_FETCHING || !('data' in snapshot.data)) {
    return {
      status: 'error',
      problem: { kind: 'invalid-response', message: problemMessages.invalidListResponse },
    };
  }
  if (snapshot.data.data.items.length === 0 && snapshot.data.data.nextCursor === null) return { status: 'not-found' };
  return {
    status: 'ready',
    data: snapshot.data.data,
    isRefreshing: snapshot.isRefreshing,
    refreshError: snapshot.refreshError,
  };
}

export function contractAccountPath(value: string): string | null {
  const normalized = normalizeAccountIdLiteral(value);
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
      status: 'stale';
      message: string;
      code: string | null;
      droppedMessages: number | null;
      replayAvailable: false;
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
    ? (value as Record<string, unknown>)
    : { value };
}
