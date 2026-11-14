import {
  AssetDefinitionAliasSchema,
  NftIdSchema,
  RwaIdSchema,
  type AssetDefinitionSelector,
} from '@/shared/api/schemas';
import { normalizeDomainIdLiteral } from '@/shared/lib/rwa-id';
import type {
  AccountQrSnapshot,
  DefiOracleAttestationLatestParams,
  SorafsPinManifestSearchParams,
  ZkProofFilterParams,
  ZkProofListParams,
  ZkVerifyingKeyListParams,
} from '@/shared/api/schemas';

import {
  AccountQrResponse,
  AssetDefinitionIdSchema,
  ConfidentialAssetPolicy,
  ConnectSessionResponse,
  DefiOracleAttestation,
  DefiOracleAttestationLatestParamsSchema,
  SoracleFeedEventRecord,
  SoracleFeedIdSchema,
  SoracleFeedRegistry,
  SorafsPinManifestResponse,
  SystemParameters,
  VpnProfile,
  ZkProofCount,
  ZkProofDetail,
  ZkProofId,
  ZkProofRegistryItem,
  ZkVerifyingKeyDetail,
  ZkVerifyingKeyId,
  ZkVerifyingKeyListItem,
} from '@/shared/api/schemas';

import type {
  AccountSearchParams,
  AssetDefinitionId,
  AssetDefinitionSearchParams,
  AssetId,
  AssetSearchParams,
  CursorPaginationParams,
  DomainSearchParams,
  InstructionsSearchParams,
  MultisigProposalStatus,
  NftId,
  NFTsSearchParams,
  RWASearchParams,
  SorafsPinRegistrySearchParams,
  TransactionSearchParams,
} from '@/shared/api/schemas';
import { parseStrictLosslessIntegerJson } from '@/shared/lib/strict-lossless-integer-json';
import { registerConnectSession, type BrowserConnectSessionPreview } from '@iroha/iroha-js/connect-browser';
import { parse as parseLosslessJson, parseNumberAndBigInt } from 'lossless-json';
import { z } from 'zod/v4';
import { appendSearchParams } from './query';
import { fetchToriiWithDeadline } from './transport';

import {
  Account,
  AccountHistoryResponse,
  AccountPermissionsResponse,
  AssetDefinition,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  AssetIdSchema,
  Block,
  BLOCK_SAMPLE_FIELDS,
  BlockSampleRow,
  CanonicalDataspaceId,
  CollectionPage,
  ContractActivityResponse,
  ContractCodeView,
  ContractEvent,
  ContractEventResponse,
  DetailedTransaction,
  Domain,
  ExplorerAsset,
  ExplorerAssetDefinition,
  ExplorerHealth,
  Instruction,
  MultisigProposalsQueryResponse,
  MultisigSpecResponse,
  NexusDataspacesAccountSummary,
  NexusPublicStatus,
  NFT,
  NodeStatusSnapshot,
  PeerInfo,
  PeerMetrics,
  RWA,
  SorafsPinRegistryResponse,
  StateFinalityResponse,
  Transaction,
  TRANSACTION_SAMPLE_FIELDS,
  TransactionSampleRow,
} from '@/shared/api/schemas';

import type { SuccessfulFetching } from '@/shared/api/consts';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { normalizeAccountIdLiteral, normalizeToriiAccountSelectorLiteral } from '@/shared/lib/account-literal';
import type { CanonicalBlockSample } from '@/shared/lib/chain-analytics';
import { getExplorerReadAuth } from '@/shared/lib/explorer-read-auth';
import { requireIrohaHash32, requireIrohaHashLiteral32 } from '@/shared/lib/iroha-hash';
import { getRuntimeConfig } from '@/shared/runtime-config';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { transformErrorResponse } from '@/shared/utils/transform-error-response';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import type { ToriiBrowserCanonicalRequestOptions, ToriiSseEvent } from '@iroha/iroha-js/torii-browser';
import {
  field,
  ToriiBrowserClient,
  ToriiHttpError,
  ToriiStreamGapError,
  type Filter,
  type ListQueryInput,
} from '@iroha/iroha-js/torii-browser';
import { useEventSource } from '@vueuse/core';
import { computed, readonly, ref } from 'vue';
import type { ZodType } from 'zod/v4';
export { appendSearchParams } from './query';
export { ToriiStreamGapError };

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const defaultToriiOrigin = rawApiUrl.length > 0 ? rawApiUrl : defaultOrigin;
const EXPLORER_SUFFIX = '/v1/explorer';
const STORAGE_KEY = 'torii_base_url';
const FAILOVER_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_FAILOVER_THRESHOLD = 5;
const DEFAULT_FAILOVER_WINDOW_MS = 60_000;
const DEFAULT_FAILOVER_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_REQUEST_RETRY_COUNT = 1;
const DEFAULT_REQUEST_RETRY_BASE_DELAY_MS = 200;
const FAILOVER_HEALTH_PATH = '/v1/explorer/health';
const MAX_U64 = 18_446_744_073_709_551_615n;
const ASSET_ID_DATASPACE_SCOPE_PATTERN = /#dataspace:(\d+)$/u;

function toriiRequiredHeaders(): Record<string, string> {
  // Torii v1 is a single API contract. The retired pre-release
  // x-iroha-api-version negotiation header must not be sent.
  return {};
}

function toriiJsonHeaders(): Record<string, string> {
  return {
    ...toriiRequiredHeaders(),
    Accept: 'application/json',
  };
}

export type ToriiAvailabilityState = 'healthy' | 'degraded' | 'failing_over' | 'outage';

export interface ToriiFailoverSwitch {
  from: string;
  to: string;
  atMs: number;
  trigger: 'http_failure' | 'network_error' | 'manual';
}

export function normalizeToriiBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const normalizedDefaultToriiBase = normalizeToriiBaseUrl(defaultToriiOrigin);
if (!normalizedDefaultToriiBase) {
  throw new Error(
    'VITE_API_URL must be an absolute credential-free HTTP(S) Torii origin without a path, query, or fragment'
  );
}
const defaultToriiBase: string = normalizedDefaultToriiBase;

function safeReadStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage as unknown as { getItem?: (key: string) => string | null };
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  const storage = window.localStorage as unknown as {
    setItem?: (key: string, value: string) => void;
    removeItem?: (key: string) => void;
  };
  if (!storage) return;
  try {
    if (value === null) {
      storage.removeItem?.(key);
    } else {
      storage.setItem?.(key, value);
    }
  } catch {
    // ignore
  }
}

const toriiBaseUrlState = ref(
  (() => {
    const stored = safeReadStorage(STORAGE_KEY);
    if (!stored) return defaultToriiBase;
    const normalized = normalizeToriiBaseUrl(stored);
    if (normalized) return normalized;
    safeWriteStorage(STORAGE_KEY, null);
    return defaultToriiBase;
  })()
);
const routeScopedToriiBaseUrlState = ref<string | null>(null);

const toriiAvailabilityState = ref<ToriiAvailabilityState>('healthy');
const toriiFailureCountState = ref(0);
const toriiLastErrorState = ref<string | null>(null);
const toriiLastFailoverSwitchState = ref<ToriiFailoverSwitch | null>(null);
const failoverFailureTimestampsMs: number[] = [];
let failoverInFlight: Promise<boolean> | null = null;

function forcedToriiBaseUrl(): string | null {
  const config = getRuntimeConfig();
  return config.toriiForceBaseUrl === true && config.toriiBaseUrl ? normalizeToriiBaseUrl(config.toriiBaseUrl) : null;
}

const effectiveToriiBaseUrlState = computed(
  () => forcedToriiBaseUrl() ?? routeScopedToriiBaseUrlState.value ?? toriiBaseUrlState.value
);
const explorerApiBaseState = computed(() =>
  effectiveToriiBaseUrlState.value.endsWith(EXPLORER_SUFFIX)
    ? effectiveToriiBaseUrlState.value
    : `${effectiveToriiBaseUrlState.value}${EXPLORER_SUFFIX}`
);

export function getToriiBaseUrl(): string {
  return effectiveToriiBaseUrlState.value;
}

export function getConfiguredToriiBaseUrl(): string {
  return forcedToriiBaseUrl() ?? toriiBaseUrlState.value;
}

export function setRouteScopedToriiBaseUrl(baseUrl: string | null): string | null {
  if (!baseUrl?.trim()) {
    routeScopedToriiBaseUrlState.value = null;
    return null;
  }
  if (isToriiBaseUrlForced()) {
    routeScopedToriiBaseUrlState.value = null;
    return null;
  }

  const normalized = normalizeToriiBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error(
      'Torii base URL must be an absolute credential-free HTTP(S) origin without a path, query, or fragment'
    );
  }
  routeScopedToriiBaseUrlState.value = normalized;
  return normalized;
}

export function getExplorerApiBase(): string {
  return explorerApiBaseState.value;
}

function clearFailoverFailures() {
  failoverFailureTimestampsMs.length = 0;
  toriiFailureCountState.value = 0;
  toriiLastErrorState.value = null;
}

function markToriiHealthy() {
  clearFailoverFailures();
  toriiAvailabilityState.value = 'healthy';
}

function failoverRuntimeConfig() {
  const config = getRuntimeConfig();
  return {
    enabled: !forcedToriiBaseUrl() && config.toriiFailoverEnabled !== false,
    nodes: config.toriiFailoverNodes ?? [],
    failureThreshold: config.toriiFailoverFailureThreshold ?? DEFAULT_FAILOVER_THRESHOLD,
    windowMs: config.toriiFailoverWindowMs ?? DEFAULT_FAILOVER_WINDOW_MS,
    probeTimeoutMs: config.toriiFailoverProbeTimeoutMs ?? DEFAULT_FAILOVER_PROBE_TIMEOUT_MS,
    persistSwitch: config.toriiFailoverPersistSwitch !== false,
  };
}

function requestRuntimeConfig() {
  const config = getRuntimeConfig();
  return {
    timeoutMs: config.toriiRequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    retryCount: config.toriiRequestRetryCount ?? DEFAULT_REQUEST_RETRY_COUNT,
    retryBaseDelayMs: config.toriiRequestRetryBaseDelayMs ?? DEFAULT_REQUEST_RETRY_BASE_DELAY_MS,
  };
}

function normalizeCandidate(raw: string): string | null {
  return normalizeToriiBaseUrl(raw);
}

interface ToriiCandidateProbe {
  candidate: string;
  latestHeight: number | null;
  latestCreatedAtMs: number | null;
}

function parseCandidateProbeMetadata(payload: unknown): Omit<ToriiCandidateProbe, 'candidate'> | null {
  const parsed = ExplorerHealth.safeParse(payload);
  if (!parsed.success) return null;

  return {
    latestHeight: parsed.data.head_height,
    latestCreatedAtMs: parsed.data.head_created_at?.getTime() ?? null,
  };
}

function compareProbeMetric(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function isBetterProbeCandidate(left: ToriiCandidateProbe, right: ToriiCandidateProbe): boolean {
  const heightComparison = compareProbeMetric(left.latestHeight, right.latestHeight);
  if (heightComparison !== 0) return heightComparison < 0;

  const createdAtComparison = compareProbeMetric(left.latestCreatedAtMs, right.latestCreatedAtMs);
  if (createdAtComparison !== 0) return createdAtComparison < 0;

  return false;
}

async function probeToriiCandidate(baseUrl: string, timeoutMs: number): Promise<ToriiCandidateProbe | null> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${FAILOVER_HEALTH_PATH}`, {
      cache: 'no-store',
      headers: toriiJsonHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    try {
      const parsed = await response.json();
      const metadata = parseCandidateProbeMetadata(parsed);
      if (!metadata) return null;
      return {
        candidate: baseUrl,
        ...metadata,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function resolveFailoverCandidates(currentBase: string): string[] {
  const runtime = failoverRuntimeConfig();
  const out: string[] = [];
  const pushCandidate = (raw: string) => {
    const normalized = normalizeCandidate(raw);
    if (!normalized) return;
    if (normalized === currentBase) return;
    if (out.includes(normalized)) return;
    out.push(normalized);
  };

  runtime.nodes.forEach(pushCandidate);
  return out;
}

async function triggerToriiFailover(trigger: ToriiFailoverSwitch['trigger']): Promise<boolean> {
  const runtime = failoverRuntimeConfig();
  if (!runtime.enabled) return false;
  if (routeScopedToriiBaseUrlState.value) return false;
  if (failoverInFlight) return failoverInFlight;

  failoverInFlight = (async () => {
    toriiAvailabilityState.value = 'failing_over';
    const from = getConfiguredToriiBaseUrl();
    const candidates = await resolveFailoverCandidates(from);
    let bestCandidate: ToriiCandidateProbe | null = null;
    for (const candidate of candidates) {
      const probe = await probeToriiCandidate(candidate, runtime.probeTimeoutMs);
      if (!probe) continue;
      if (!bestCandidate || isBetterProbeCandidate(probe, bestCandidate)) {
        bestCandidate = probe;
      }
    }
    if (bestCandidate) {
      setToriiBaseUrl(bestCandidate.candidate, { persist: runtime.persistSwitch });
      toriiLastFailoverSwitchState.value = {
        from,
        to: bestCandidate.candidate,
        atMs: Date.now(),
        trigger,
      };
      markToriiHealthy();
      return true;
    }

    toriiAvailabilityState.value = 'outage';
    toriiLastErrorState.value = 'No healthy failover target available';
    return false;
  })().finally(() => {
    failoverInFlight = null;
  });

  return await failoverInFlight;
}

function trackToriiFailure(reason: string) {
  const runtime = failoverRuntimeConfig();
  const nowMs = Date.now();
  failoverFailureTimestampsMs.push(nowMs);
  const oldestAllowed = nowMs - runtime.windowMs;
  while (failoverFailureTimestampsMs.length && failoverFailureTimestampsMs[0] < oldestAllowed) {
    failoverFailureTimestampsMs.shift();
  }
  toriiFailureCountState.value = failoverFailureTimestampsMs.length;
  toriiLastErrorState.value = reason;
  if (toriiAvailabilityState.value !== 'failing_over' && toriiAvailabilityState.value !== 'outage') {
    toriiAvailabilityState.value = runtime.enabled ? 'degraded' : 'outage';
  }
}

function maybeTriggerToriiFailoverOnFailure(trigger: ToriiFailoverSwitch['trigger']) {
  const runtime = failoverRuntimeConfig();
  if (!runtime.enabled) return;
  if (routeScopedToriiBaseUrlState.value) return;
  if (toriiFailureCountState.value < runtime.failureThreshold) return;
  triggerToriiFailover(trigger).catch(() => false);
}

export function setToriiBaseUrl(baseUrl: string, options?: { persist?: boolean }): string {
  if (isToriiBaseUrlForced()) {
    throw new Error('Torii base URL is locked by runtime configuration');
  }
  const normalized = normalizeToriiBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error(
      'Torii base URL must be an absolute credential-free HTTP(S) origin without a path, query, or fragment'
    );
  }
  toriiBaseUrlState.value = normalized;
  if (options?.persist !== false) {
    safeWriteStorage(STORAGE_KEY, toriiBaseUrlState.value);
  }
  markToriiHealthy();
  return toriiBaseUrlState.value;
}

/**
 * Apply Torii base URL from runtime config. By default, stored user-selected nodes win.
 * Operators can force the configured base URL when a hostname must hard-cut to a new Torii target.
 */
export function setToriiBaseUrlFromConfig(baseUrl: string, options?: { force?: boolean }): string {
  const stored = safeReadStorage(STORAGE_KEY);
  if (stored && !options?.force) return toriiBaseUrlState.value;

  const normalized = normalizeToriiBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error(
      'Configured Torii base URL must be an absolute credential-free HTTP(S) origin without a path, query, or fragment'
    );
  }
  toriiBaseUrlState.value = normalized;
  if (stored && options?.force) {
    safeWriteStorage(STORAGE_KEY, null);
  }
  markToriiHealthy();
  return toriiBaseUrlState.value;
}

export function resetToriiBaseUrl(): string {
  if (isToriiBaseUrlForced()) {
    throw new Error('Torii base URL is locked by runtime configuration');
  }
  toriiBaseUrlState.value = defaultToriiBase;
  safeWriteStorage(STORAGE_KEY, null);
  markToriiHealthy();
  return toriiBaseUrlState.value;
}

export function useToriiAvailability() {
  return {
    state: readonly(toriiAvailabilityState),
    failureCount: readonly(toriiFailureCountState),
    lastError: readonly(toriiLastErrorState),
    lastSwitch: readonly(toriiLastFailoverSwitchState),
  };
}

export async function retryToriiFailover(): Promise<boolean> {
  return await triggerToriiFailover('manual');
}

type GetResult<T> = { status: SuccessfulFetching; data: T } | { status: 'error'; response: Response };
type ResultWithStatus<T> = { status: SuccessfulFetching; data: T } | ErrorResponse;
export type PermissionAwareResult<T> = ResultWithStatus<T> | { status: 'permission-denied'; error: Error };
export type ToriiCanonicalRequestAuth = Pick<
  ToriiBrowserCanonicalRequestOptions,
  'authAccountId' | 'sign' | 'nativeIdentity'
>;

async function fetchWithTimeoutRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  return await fetchToriiWithDeadline(input, init, requestRuntimeConfig());
}

function normalizeAccountSelectorForApi(value: string): string;
function normalizeAccountSelectorForApi(value: null): null;
function normalizeAccountSelectorForApi(value: undefined): undefined;
function normalizeAccountSelectorForApi(value: string | null | undefined): string | null | undefined;
function normalizeAccountSelectorForApi(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') throw new TypeError('Account selector must be a string');

  const normalized = normalizeToriiAccountSelectorLiteral(value);
  if (!normalized) {
    throw new TypeError('Account selector must be a canonical i105 account ID or account alias');
  }
  return normalized;
}

function normalizeAssetIdForApi(value: AssetId): string {
  const normalized = AssetIdSchema.parse(value);
  const scope = ASSET_ID_DATASPACE_SCOPE_PATTERN.exec(normalized);
  if (!scope) return normalized;

  const dataspace = BigInt(scope[1]!);
  if (dataspace > MAX_U64) throw new TypeError('Asset ID dataspace scope must be a u64');
  return `${normalized.slice(0, -scope[0].length)}#dataspace:${dataspace}`;
}

/** Express active resource selectors through the SDK's canonical filter AST. */
function collectionQuery(
  params: (CursorPaginationParams & { max_block_height?: number }) | undefined,
  selectors: Record<string, string | number | boolean | undefined> = {}
): ListQueryInput {
  if (params?.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)) {
    throw new RangeError('Explorer limit must be an integer in 1..100');
  }
  let filter: Filter | undefined;
  for (const [name, value] of Object.entries(selectors)) {
    if (value === undefined || value === '') continue;
    const predicate = field(name).eq(value);
    filter = filter ? filter.and(predicate) : predicate;
  }
  if (params?.max_block_height !== undefined) {
    const bound = field('block').lte(params.max_block_height);
    filter = filter ? filter.and(bound) : bound;
  }
  return {
    ...(params?.cursor === undefined || params.cursor === null ? {} : { cursor: params.cursor }),
    ...(params?.limit === undefined ? {} : { limit: params.limit }),
    ...(filter ? { filter } : {}),
  };
}

/** Validate the SDK page and refuse a repeated continuation without inventing totals. */
async function fetchCollectionPage<T>(
  params: CursorPaginationParams | undefined,
  itemSchema: ZodType<T>,
  request: (client: ToriiBrowserClient) => Promise<unknown>
): Promise<ResultWithStatus<CollectionPage<T>>> {
  const response = await parseToriiSdkResult(request, CollectionPage(itemSchema));
  if (response.status === SUCCESSFUL_FETCHING) {
    if (params?.limit !== undefined && response.data.items.length > params.limit) {
      throw new TypeError('Collection response exceeds the requested limit');
    }
    if (typeof params?.cursor === 'string' && response.data.nextCursor === params.cursor) {
      throw new TypeError('Explorer cursor did not advance');
    }
  }
  return response;
}

async function toriiSdkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetchWithTimeoutRetry(input, {
      cache: 'no-store',
      ...init,
    });

    if (!response.ok && FAILOVER_STATUSES.has(response.status)) {
      trackToriiFailure(`HTTP ${response.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    } else if (response.ok && (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0)) {
      markToriiHealthy();
    }

    return response;
  } catch (error) {
    // A caller cancelling a read is not evidence that Torii is unhealthy.
    const requestSignal =
      init?.signal === undefined && typeof Request !== 'undefined' && input instanceof Request
        ? input.signal
        : init?.signal;
    if (!requestSignal?.aborted) {
      trackToriiFailure(error instanceof Error ? error.message : String(error));
      maybeTriggerToriiFailoverOnFailure('network_error');
    }
    throw error;
  }
}

async function toriiSdkStreamFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, {
      ...init,
      cache: 'no-store',
    });

    if (!response.ok && FAILOVER_STATUSES.has(response.status)) {
      trackToriiFailure(`HTTP ${response.status}`);
    } else if (response.ok && (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0)) {
      markToriiHealthy();
    }

    return response;
  } catch (error) {
    if (!init?.signal?.aborted) {
      trackToriiFailure(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

function toriiSdkClient(fetchImpl = toriiSdkFetch): ToriiBrowserClient {
  const networkId = getRuntimeConfig().networkId;
  const baseUrl = getToriiBaseUrl();
  const canonicalRequestAuth = getExplorerReadAuth(baseUrl, networkId);
  return new ToriiBrowserClient(baseUrl, {
    fetchImpl,
    defaultHeaders: toriiRequiredHeaders(),
    ...(networkId ? { networkId: NetworkId.parse(networkId) } : {}),
    ...(canonicalRequestAuth ? { canonicalRequestAuth } : {}),
  });
}

async function parseToriiSdkResult<T>(
  request: (client: ToriiBrowserClient) => Promise<unknown>,
  schema: ZodType<T>
): Promise<ResultWithStatus<T>> {
  try {
    const payload = await request(toriiSdkClient());
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(payload) };
  } catch (error) {
    if (error instanceof ToriiHttpError) {
      return error.status === 404 ? { status: NOT_FOUND } : { status: UNKNOWN_ERROR, error };
    }
    throw error;
  }
}

async function parsePermissionAwareToriiSdkResult<T>(
  request: (client: ToriiBrowserClient) => Promise<unknown>,
  schema: ZodType<T>
): Promise<PermissionAwareResult<T>> {
  try {
    const payload = await request(toriiSdkClient());
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(payload) };
  } catch (error) {
    if (error instanceof ToriiHttpError) {
      if (error.status === 401 || error.status === 403) {
        return {
          status: 'permission-denied',
          error: new Error(error.bodyText || `Torii denied this read with status ${error.status}`),
        };
      }
      return error.status === 404 ? { status: NOT_FOUND } : { status: UNKNOWN_ERROR, error };
    }
    throw error;
  }
}

export async function fetchAccounts(params?: AccountSearchParams): Promise<ResultWithStatus<CollectionPage<Account>>> {
  return await fetchCollectionPage(params, Account, (client) =>
    client.explorerAccounts.list(
      collectionQuery(params, { domain: params?.domain, with_asset: params?.with_asset?.toString() })
    )
  );
}

export async function fetchAccount(id: string): Promise<ResultWithStatus<Account>> {
  const normalizedId = normalizeAccountIdForApi(id);
  return await parseBoundToriiSdkResult((client) => client.getExplorerAccount(normalizedId), Account, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'account',
  });
}

export type AccountPermissionsSearchParams = CursorPaginationParams;

export interface AccountHistorySearchParams extends CursorPaginationParams {
  asset_id?: string;
}

export async function fetchAccountPermissions(
  id: string,
  params: AccountPermissionsSearchParams
): Promise<PermissionAwareResult<AccountPermissionsResponse>> {
  return await parsePermissionAwareToriiSdkResult(
    (client) => client.accountPermissions(normalizeAccountSelectorForApi(id)).list(collectionQuery(params)),
    AccountPermissionsResponse
  );
}

export async function fetchAccountHistory(
  id: string,
  params: AccountHistorySearchParams
): Promise<PermissionAwareResult<AccountHistoryResponse>> {
  return await parsePermissionAwareToriiSdkResult(
    (client) =>
      client
        .accountHistory(normalizeAccountSelectorForApi(id))
        .list(collectionQuery(params, { asset_id: params.asset_id })),
    AccountHistoryResponse
  );
}

export interface MultisigProposalsSearchParams {
  status?: MultisigProposalStatus[];
  cursor?: string | null;
  limit?: number;
}

export async function fetchMultisigSpec(
  id: string,
  auth: ToriiCanonicalRequestAuth
): Promise<PermissionAwareResult<MultisigSpecResponse>> {
  const normalizedId = normalizeAccountSelectorForApi(id);
  const selector = normalizeAccountIdLiteral(normalizedId)
    ? { multisigAccountId: normalizedId }
    : { multisigAccountAlias: normalizedId };
  return await parsePermissionAwareToriiSdkResult(
    (client) => client.getMultisigSpec(selector, auth),
    MultisigSpecResponse
  );
}

export async function fetchMultisigProposals(
  id: string,
  params: MultisigProposalsSearchParams,
  auth: ToriiCanonicalRequestAuth
): Promise<PermissionAwareResult<MultisigProposalsQueryResponse>> {
  const normalizedId = normalizeAccountSelectorForApi(id);
  const selector = normalizeAccountIdLiteral(normalizedId)
    ? { multisigAccountId: normalizedId }
    : { multisigAccountAlias: normalizedId };
  return await parsePermissionAwareToriiSdkResult(
    (client) =>
      client.queryMultisigProposals(
        {
          ...selector,
          status: params.status,
          cursor: params.cursor,
          limit: params.limit,
        },
        auth
      ),
    MultisigProposalsQueryResponse
  );
}

export async function fetchAssets(
  params?: AssetSearchParams
): Promise<ResultWithStatus<CollectionPage<ExplorerAsset>>> {
  return await fetchCollectionPage(params, ExplorerAsset, (client) =>
    client.explorerAssets.list(
      collectionQuery(params, {
        account_id: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined,
        definition_id: params?.definition?.toString(),
        id: params?.asset_id === undefined ? undefined : normalizeAssetIdForApi(params.asset_id),
      })
    )
  );
}

export async function fetchAsset(id: AssetId): Promise<ResultWithStatus<ExplorerAsset>> {
  const normalizedId = normalizeAssetIdForApi(id.toString());
  const response = await get<unknown>(`/v1/explorer/assets/${encodeURIComponent(normalizedId)}`);
  if (response.status !== SUCCESSFUL_FETCHING) {
    return await transformErrorResponse(response.response);
  }
  const data = ExplorerAsset.parse(response.data);
  assertToriiResponseIdentity('asset', data.id === normalizedId);
  return { status: SUCCESSFUL_FETCHING, data };
}

export async function fetchAssetDefinitions(
  params?: AssetDefinitionSearchParams
): Promise<ResultWithStatus<CollectionPage<ExplorerAssetDefinition>>> {
  const owningDataspace = params?.dataspace === undefined ? undefined : CanonicalDataspaceId.parse(params.dataspace);
  if (owningDataspace !== undefined && params?.domain !== undefined) {
    throw new TypeError('Asset definition home filters must select either a domain or a dataspace');
  }
  return await fetchCollectionPage(params, ExplorerAssetDefinition, (client) =>
    client.explorerAssetDefinitions.list(
      collectionQuery(params, {
        owning_domain: params?.domain,
        owning_dataspace: owningDataspace,
        owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined,
      })
    )
  );
}

export async function fetchAssetDefinition(
  selectorInput: AssetDefinitionSelector
): Promise<ResultWithStatus<AssetDefinition>> {
  const selector = AssetDefinitionDetailSelectorSchema.parse(selectorInput.toString());
  return await parseBoundToriiSdkResult((client) => client.getAssetDefinition(selector), AssetDefinition, {
    matchesRequest: (data) => data.id === selector || data.alias === selector,
    resource: 'asset definition',
  });
}

export async function fetchAssetDefinitionEconometrics(
  id: AssetDefinitionId
): Promise<ResultWithStatus<AssetDefinitionEconometrics>> {
  const normalizedId = AssetDefinitionIdSchema.parse(id.toString());
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerAssetDefinitionEconometrics(normalizedId),
    AssetDefinitionEconometrics,
    { matchesRequest: (data) => data.definition_id === normalizedId, resource: 'asset definition econometrics' }
  );
}

export async function fetchAssetDefinitionSnapshot(
  id: AssetDefinitionId
): Promise<ResultWithStatus<AssetDefinitionSnapshot>> {
  const normalizedId = AssetDefinitionIdSchema.parse(id.toString());
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerAssetDefinitionSnapshot(normalizedId),
    AssetDefinitionSnapshot,
    { matchesRequest: (data) => data.definition_id === normalizedId, resource: 'asset definition snapshot' }
  );
}

export async function fetchNFTs(params?: NFTsSearchParams): Promise<ResultWithStatus<CollectionPage<NFT>>> {
  return await fetchCollectionPage(params, NFT, (client) =>
    client.explorerNfts.list(
      collectionQuery(params, {
        domain: params?.domain,
        owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined,
      })
    )
  );
}

export async function fetchNFTById(id: NftId): Promise<ResultWithStatus<NFT>> {
  const normalizedId = NftIdSchema.parse(id.toString());
  return await parseBoundToriiSdkResult((client) => client.getExplorerNft(normalizedId), NFT, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'NFT',
  });
}

export async function fetchRwas(params?: RWASearchParams): Promise<ResultWithStatus<CollectionPage<RWA>>> {
  return await fetchCollectionPage(params, RWA, (client) =>
    client.explorerRwas.list(
      collectionQuery(params, {
        domain: params?.domain,
        owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined,
      })
    )
  );
}

export async function fetchRwaById(id: string): Promise<ResultWithStatus<RWA>> {
  const normalizedId = RwaIdSchema.parse(id);
  return await parseBoundToriiSdkResult((client) => client.getExplorerRwa(normalizedId), RWA, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'RWA',
  });
}

export async function fetchDomains(params?: DomainSearchParams): Promise<ResultWithStatus<CollectionPage<Domain>>> {
  return await fetchCollectionPage(params, Domain, (client) =>
    client.explorerDomains.list(
      collectionQuery(params, { owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined })
    )
  );
}

export async function fetchDomain(id: string): Promise<ResultWithStatus<Domain>> {
  const normalizedId = normalizeDomainIdLiteral(id);
  if (!normalizedId) throw new TypeError('Domain ID must be a canonical domain.dataspace literal');
  return await parseBoundToriiSdkResult((client) => client.getExplorerDomain(normalizedId), Domain, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'domain',
  });
}

export async function fetchBlocks(params?: CursorPaginationParams): Promise<ResultWithStatus<CollectionPage<Block>>> {
  return await fetchCollectionPage(params, Block, (client) => client.explorerBlocks.list(collectionQuery(params)));
}

/** One newest-first page of projected block summaries; counts follow the caller's visibility. */
export async function fetchBlockSamples(
  params: CursorPaginationParams
): Promise<ResultWithStatus<CollectionPage<CanonicalBlockSample>>> {
  return await fetchCollectionPage(params, BlockSampleRow, (client) =>
    client.explorerBlocks.list({ ...collectionQuery(params), select: [...BLOCK_SAMPLE_FIELDS] })
  );
}

/** One newest-first page of projected visible transactions. */
export async function fetchTransactionSamples(
  params: CursorPaginationParams
): Promise<ResultWithStatus<CollectionPage<TransactionSampleRow>>> {
  return await fetchCollectionPage(params, TransactionSampleRow, (client) =>
    client.explorerTransactions.list({ ...collectionQuery(params), select: [...TRANSACTION_SAMPLE_FIELDS] })
  );
}

export async function fetchBlock(heightOrHash: number | string): Promise<ResultWithStatus<Block>> {
  const isHeight = typeof heightOrHash === 'number' || /^[1-9][0-9]{0,19}$/u.test(heightOrHash);
  const selector = isHeight ? heightOrHash : requireIrohaHash32(heightOrHash as string);
  return await parseBoundToriiSdkResult((client) => client.getExplorerBlock(selector), Block, {
    resource: 'block',
    matchesRequest: (data) =>
      isHeight ? String(data.height) === String(selector) : requireIrohaHash32(data.hash) === selector,
  });
}

export type TransactionProof = Awaited<ReturnType<ToriiBrowserClient['getExplorerTransactionProof']>>;

export async function fetchTransactionProof(transactionHash: string): Promise<ResultWithStatus<TransactionProof>> {
  try {
    const proof = await toriiSdkClient().getExplorerTransactionProof(requireIrohaHashLiteral32(transactionHash));
    return {
      status: SUCCESSFUL_FETCHING,
      data: proof,
    };
  } catch (error) {
    if (error instanceof ToriiHttpError) {
      if (error.status === 404) return { status: NOT_FOUND };
      // Preserve transport metadata without rendering an undecoded error body.
      return {
        status: UNKNOWN_ERROR,
        error: new ToriiHttpError({
          status: error.status,
          expected: error.expected,
          code: error.code,
          rejectCode: error.rejectCode,
          errorMessage:
            error.status === 401
              ? 'Transaction evidence requires authenticated access.'
              : error.status === 403
                ? 'This account cannot read the transaction evidence.'
                : 'Transaction evidence request failed.',
        }),
      };
    }
    throw error;
  }
}

export async function fetchLedgerStateRoot(blockHeight: number): Promise<ResultWithStatus<StateFinalityResponse>> {
  return await parseToriiSdkResult((client) => client.getLedgerStateRoot(blockHeight), StateFinalityResponse);
}

export async function fetchLedgerStateProof(blockHeight: number): Promise<ResultWithStatus<StateFinalityResponse>> {
  return await parseToriiSdkResult((client) => client.getLedgerStateProof(blockHeight), StateFinalityResponse);
}

export async function fetchExplorerHealth(): Promise<ResultWithStatus<ExplorerHealth>> {
  return await parseToriiSdkResult((client) => client.getExplorerHealth(), ExplorerHealth);
}

export async function fetchPeersInfo(): Promise<ResultWithStatus<PeerInfo[]>> {
  const res = await get('/v1/telemetry/peers-info');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: PeerInfo.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<CollectionPage<Transaction>>> {
  return await fetchCollectionPage(params, Transaction, (client) =>
    client.explorerTransactions.list(
      collectionQuery(params, {
        authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined,
        block: params?.block,
        status: params?.status,
        asset_id: params?.asset_id?.toString(),
      })
    )
  );
}

export async function fetchLatestTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<CollectionPage<Transaction>>> {
  return await fetchCollectionPage(params, Transaction, (client) =>
    client.explorerLatestTransactions.list(
      collectionQuery(params, {
        authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined,
        block: params?.block,
        status: params?.status,
        asset_id: params?.asset_id?.toString(),
      })
    )
  );
}

export async function fetchTransaction(hash: string): Promise<ResultWithStatus<DetailedTransaction>> {
  const normalizedHash = requireIrohaHash32(hash);
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerTransaction(normalizedHash),
    DetailedTransaction,
    { matchesRequest: (data) => requireIrohaHash32(data.hash) === normalizedHash, resource: 'transaction' }
  );
}

export async function fetchInstructions(
  params?: InstructionsSearchParams
): Promise<ResultWithStatus<CollectionPage<Instruction>>> {
  return await fetchCollectionPage(params, Instruction, (client) =>
    client.explorerInstructions.list(
      collectionQuery(params, {
        account: normalizeAccountSelectorForApi(params?.account) ?? undefined,
        authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined,
        kind: params?.kind,
        transaction_hash: params?.transaction_hash ? requireIrohaHash32(params.transaction_hash) : undefined,
        transaction_status: params?.transaction_status,
        block: params?.block,
        asset_id: params?.asset_id?.toString(),
      })
    )
  );
}

export interface ContractActivityFilters {
  authority?: string;
  contract_address?: string;
  contract_alias?: string;
  contract_entrypoint?: string;
  since_timestamp_ms?: number;
  until_timestamp_ms?: number;
  result_ok?: boolean;
}

export interface ContractActivitySearchParams extends CursorPaginationParams, ContractActivityFilters {}

export interface ContractEventFilters {
  authority?: string;
  contract_address?: string;
  event_kind?: string;
  participant?: string;
  asset_id?: string;
  /** Native contract events are committed native emissions. */
  provenance?: 'emitted';
  since_timestamp_ms?: number;
  until_timestamp_ms?: number;
  result_ok?: boolean;
}

export interface ContractEventSearchParams extends CursorPaginationParams, ContractEventFilters {}

function contractEventSdkOptions(params: ContractEventFilters) {
  return {
    authority: params.authority,
    contractAddress: params.contract_address,
    eventKind: params.event_kind,
    participant: params.participant,
    assetId: params.asset_id,
    provenance: params.provenance,
    sinceTimestampMs: params.since_timestamp_ms,
    untilTimestampMs: params.until_timestamp_ms,
    resultOk: params.result_ok,
  };
}

function contractCollectionQuery(
  params: CursorPaginationParams & ContractActivityFilters & Partial<ContractEventFilters>
): ListQueryInput {
  const query = collectionQuery(params, {
    authority: params.authority,
    contract_address: params.contract_address,
    contract_alias: params.contract_alias,
    contract_entrypoint: params.contract_entrypoint,
    event_kind: params.event_kind,
    participants: params.participant,
    asset_ids: params.asset_id,
    provenance: params.provenance,
    result_ok: params.result_ok,
  });
  let filter = query.filter as Filter | undefined;
  for (const predicate of [
    params.since_timestamp_ms === undefined ? undefined : field('timestamp_ms').gte(params.since_timestamp_ms),
    params.until_timestamp_ms === undefined ? undefined : field('timestamp_ms').lte(params.until_timestamp_ms),
  ]) {
    if (predicate) filter = filter ? filter.and(predicate) : predicate;
  }
  return { ...query, ...(filter ? { filter } : {}) };
}

export async function fetchContractActivity(
  params: ContractActivitySearchParams
): Promise<ResultWithStatus<ContractActivityResponse>> {
  return await parseToriiSdkResult(
    (client) => client.contractActivity.list(contractCollectionQuery(params)),
    ContractActivityResponse
  );
}

export async function fetchContractEvents(
  params: ContractEventSearchParams
): Promise<ResultWithStatus<ContractEventResponse>> {
  return await parseToriiSdkResult(
    (client) => client.contractEvents.list(contractCollectionQuery(params)),
    ContractEventResponse
  );
}

export type ContractEventStreamMessage = Omit<ToriiSseEvent<unknown>, 'data'> & { data: ContractEvent };

export async function* streamContractEvents(
  filters: ContractEventFilters,
  signal?: AbortSignal
): AsyncGenerator<ContractEventStreamMessage, void, unknown> {
  for await (const event of toriiSdkClient(toriiSdkStreamFetch).streamContractEvents<unknown>({
    ...contractEventSdkOptions(filters),
    signal,
  })) {
    yield {
      ...event,
      data: ContractEvent.parse(event.data),
    };
  }
}

export async function fetchLatestInstructions(
  params?: InstructionsSearchParams
): Promise<ResultWithStatus<CollectionPage<Instruction>>> {
  return await fetchCollectionPage(params, Instruction, (client) =>
    client.explorerLatestInstructions.list(
      collectionQuery(params, {
        account: normalizeAccountSelectorForApi(params?.account) ?? undefined,
        authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined,
        kind: params?.kind,
        transaction_hash: params?.transaction_hash ? requireIrohaHash32(params.transaction_hash) : undefined,
        transaction_status: params?.transaction_status,
        block: params?.block,
        asset_id: params?.asset_id?.toString(),
      })
    )
  );
}

export async function fetchInstructionDetail(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<Instruction>> {
  const normalizedHash = requireIrohaHash32(transactionHash);
  const normalizedIndex = normalizeInstructionIndexForApi(index);
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerInstruction(normalizedHash, normalizedIndex),
    Instruction,
    {
      matchesRequest: (data) =>
        requireIrohaHash32(data.transaction_hash) === normalizedHash && data.index === normalizedIndex,
      resource: 'instruction',
    }
  );
}

export async function fetchInstructionContractView(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<ContractCodeView>> {
  const normalizedHash = requireIrohaHash32(transactionHash);
  const normalizedIndex = normalizeInstructionIndexForApi(index);
  return await parseToriiSdkResult(
    (client) => client.getExplorerInstructionContractView(normalizedHash, normalizedIndex),
    ContractCodeView
  );
}

export async function fetchNexusDataspacesAccountSummary(
  literal: string
): Promise<ResultWithStatus<NexusDataspacesAccountSummary>> {
  const normalized = normalizeAccountIdForApi(literal);
  const res = await get<NexusDataspacesAccountSummary>(
    `/v1/nexus/dataspaces/accounts/${encodeURIComponent(normalized)}/summary`
  );
  if (res.status === SUCCESSFUL_FETCHING) {
    const data = NexusDataspacesAccountSummary.parse(res.data);
    assertToriiResponseIdentity(
      'Nexus dataspaces account summary',
      data.account === normalized && data.account_id === normalized
    );
    return { status: SUCCESSFUL_FETCHING, data };
  }

  return await transformErrorResponse(res.response);
}

async function fetchToriiStatus<T>(schema: ZodType<T>): Promise<ResultWithStatus<T>> {
  const url = new URL(`${getToriiBaseUrl()}/status`, defaultOrigin || undefined);
  let res: Response;
  try {
    res = await fetchWithTimeoutRetry(url, {
      cache: 'no-store',
      headers: toriiJsonHeaders(),
    });
  } catch (error) {
    trackToriiFailure(error instanceof Error ? error.message : String(error));
    maybeTriggerToriiFailoverOnFailure('network_error');
    throw error;
  }

  if (res.ok) {
    if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
      markToriiHealthy();
    }

    // Preserve u64 dataspace identifiers before schema validation; JSON.parse rounds them.
    const payload = parseLosslessJson(await res.text(), undefined, {
      parseNumber: (literal) => {
        const value = parseNumberAndBigInt(literal);
        return typeof value === 'bigint' && Number.isSafeInteger(Number(value)) ? Number(value) : value;
      },
    });
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(payload) };
  }

  if (FAILOVER_STATUSES.has(res.status)) {
    trackToriiFailure(`HTTP ${res.status}`);
    maybeTriggerToriiFailoverOnFailure('http_failure');
  }
  return await transformErrorResponse(res);
}

export async function fetchNexusPublicStatus(): Promise<ResultWithStatus<NexusPublicStatus>> {
  return await fetchToriiStatus(NexusPublicStatus);
}

/** The reporting peer's typed status snapshot for dashboard instruments. */
export async function fetchNodeStatus(): Promise<ResultWithStatus<NodeStatusSnapshot>> {
  return await fetchToriiStatus(NodeStatusSnapshot);
}

const EXACT_JSON_MEDIA_TYPE_PATTERN =
  /^[ \t]*application\/json(?:[ \t]*;[ \t]*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+|"(?:[ \t!#-\[\]-~\u0080-\u00ff]|\\[ \t!-~\u0080-\u00ff])*"))*[ \t]*$/iu;

export function buildToriiUrl(path: string): string {
  return `${getToriiBaseUrl()}${requireCanonicalToriiV1Path(path)}`;
}

export function buildToriiWsUrl(path: string): string {
  const url = new URL(buildToriiUrl(path));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function requireCanonicalToriiV1Path(path: string): string {
  const hasInvalidSegment = path.split('/').some((segment) => segment === '.' || segment === '..');
  if (
    !path.startsWith('/v1/') ||
    path.endsWith('/') ||
    path.includes('//') ||
    path.includes('\\') ||
    path.includes('?') ||
    path.includes('#') ||
    /[\u0000-\u0020\u007f]/u.test(path) ||
    hasInvalidSegment
  ) {
    throw new TypeError(`Torii API path must be an exact canonical /v1 pathname: ${path}`);
  }
  return path;
}

export function resolveApiUrl(path: string): string {
  return buildToriiUrl(path);
}

async function getWithResponseParser<T>(
  path: string,
  params?: Record<string, any>,
  {
    options = {},
    parseResponse = (response) => response.json() as Promise<T>,
  }: {
    options?: Pick<RequestInit, 'signal'>;
    parseResponse?: (response: Response, url: URL) => Promise<T>;
  } = {}
): Promise<GetResult<T>> {
  const url = new URL(resolveApiUrl(path), defaultOrigin || undefined);

  appendSearchParams(url, params);

  let res: Response;
  try {
    res = await fetchWithTimeoutRetry(url, {
      cache: 'no-store',
      headers: toriiJsonHeaders(),
      signal: options.signal,
    });
  } catch (error) {
    if (!options.signal?.aborted) {
      trackToriiFailure(error instanceof Error ? error.message : String(error));
      maybeTriggerToriiFailoverOnFailure('network_error');
    }
    throw error;
  }

  if (!res.ok) {
    if (FAILOVER_STATUSES.has(res.status)) {
      trackToriiFailure(`HTTP ${res.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    }
    return { status: 'error', response: res };
  }

  if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
    markToriiHealthy();
  }

  return {
    status: SUCCESSFUL_FETCHING,
    data: await parseResponse(res, url),
  };
}

async function get<T>(
  path: string,
  params?: Record<string, any>,
  options: Pick<RequestInit, 'signal'> = {}
): Promise<GetResult<T>> {
  return await getWithResponseParser(path, params, { options });
}

async function getLosslessIntegerJson<T>(
  path: string,
  params?: Record<string, any>,
  options: Pick<RequestInit, 'signal'> = {}
): Promise<GetResult<T>> {
  return await getWithResponseParser(path, params, {
    options,
    parseResponse: async (response, url) => {
      const context = `GET ${url.pathname} response`;
      if (!EXACT_JSON_MEDIA_TYPE_PATTERN.test(response.headers.get('content-type') ?? '')) {
        throw new TypeError(`${context} must use the application/json media type`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      let source: string;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new TypeError(`${context} must be valid UTF-8`);
      }
      return parseStrictLosslessIntegerJson(source, context) as T;
    },
  });
}

function normalizeAccountIdForApi(value: string): string;
function normalizeAccountIdForApi(value: null | undefined): undefined;
function normalizeAccountIdForApi(value: string | null | undefined): string | undefined;
function normalizeAccountIdForApi(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError('Account ID must be a string');

  const normalized = normalizeAccountIdLiteral(value);
  if (!normalized) {
    throw new TypeError('Account ID must be an exact canonical halfwidth i105 literal');
  }
  return normalized;
}

function assertToriiResponseIdentity(resource: string, matchesRequest: boolean): void {
  if (!matchesRequest) {
    throw new Error(`Torii ${resource} response identity does not match the requested resource`);
  }
}

export async function fetchAccountQr(id: string, signal?: AbortSignal): Promise<ResultWithStatus<AccountQrSnapshot>> {
  const normalizedId = normalizeAccountIdForApi(id);
  const result = await get<unknown>(`/v1/explorer/accounts/${encodeURIComponent(normalizedId)}/qr`, undefined, {
    signal,
  });
  if (result.status === SUCCESSFUL_FETCHING) {
    const data = AccountQrResponse.parse(result.data);
    if (data.canonicalId !== normalizedId) {
      throw new Error('Torii account QR response canonical_id does not match the requested account ID');
    }
    return { status: SUCCESSFUL_FETCHING, data };
  }
  return await transformErrorResponse(result.response);
}

export async function fetchConfidentialAssetTransitions(
  id: AssetDefinitionId
): Promise<ResultWithStatus<ConfidentialAssetPolicy>> {
  const normalizedId = AssetDefinitionIdSchema.parse(id.toString());
  const result = await getLosslessIntegerJson<unknown>(
    `/v1/confidential/assets/${encodeURIComponent(normalizedId)}/transitions`
  );
  if (result.status === SUCCESSFUL_FETCHING) {
    const data = ConfidentialAssetPolicy.parse(result.data);
    assertToriiResponseIdentity('confidential asset policy', data.asset_id === normalizedId);
    return { status: SUCCESSFUL_FETCHING, data };
  }
  return await transformErrorResponse(result.response);
}

export async function fetchSystemParameters(): Promise<ResultWithStatus<SystemParameters>> {
  const res = await get<unknown>('/v1/parameters');
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SystemParameters.parse(res.data) };
  }
  return await transformErrorResponse(res.response);
}

export async function fetchSoracleFeeds(): Promise<ResultWithStatus<SoracleFeedRegistry>> {
  const res = await getLosslessIntegerJson<unknown>('/v1/soracles/feeds');
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracleFeedRegistry.parse(res.data) };
  }
  return await transformErrorResponse(res.response);
}

export async function fetchSoracleFeedHistory(feedId: string): Promise<ResultWithStatus<SoracleFeedEventRecord[]>> {
  const canonicalFeedId = SoracleFeedIdSchema.parse(feedId);
  const res = await getLosslessIntegerJson<unknown>(
    `/v1/soracles/feeds/${encodeURIComponent(canonicalFeedId)}/history`
  );
  if (res.status === SUCCESSFUL_FETCHING) {
    const history = SoracleFeedEventRecord.array().parse(res.data);
    if (history.some((record) => record.event.feed_id[0] !== canonicalFeedId)) {
      throw new Error('Soracles history response identity does not match the requested feed');
    }
    return { status: SUCCESSFUL_FETCHING, data: history };
  }
  return await transformErrorResponse(res.response);
}

export async function fetchLatestDefiOracleAttestation(
  params: DefiOracleAttestationLatestParams
): Promise<ResultWithStatus<DefiOracleAttestation>> {
  const query = DefiOracleAttestationLatestParamsSchema.parse(params);
  const res = await getLosslessIntegerJson<unknown>('/v1/soracles/defi/attestations/latest', query);
  if (res.status === SUCCESSFUL_FETCHING) {
    const attestation = DefiOracleAttestation.parse(res.data);
    if (
      attestation.key.domain !== query.domain ||
      attestation.key.subject_id !== query.subject_id ||
      (query.status !== undefined && attestation.status_flags !== query.status)
    ) {
      throw new Error('DeFi oracle attestation response identity does not match the requested key');
    }
    return { status: SUCCESSFUL_FETCHING, data: attestation };
  }
  return await transformErrorResponse(res.response);
}

export function streamTelemetryMetrics() {
  const telemetryLiveUrl = computed(() => buildToriiUrl('/v1/telemetry/live'));
  const {
    data: streamedMetrics,
    status,
    open,
  } = useEventSource(telemetryLiveUrl, [], {
    autoReconnect: true,
  });

  return {
    data: computed(() => {
      if (!streamedMetrics.value) return null;
      try {
        return PeerMetrics.parse(JSON.parse(streamedMetrics.value));
      } catch (error) {
        console.warn('[streamTelemetryMetrics] Failed to parse SSE payload', error);
        return null;
      }
    }),
    status,
    reconnect: open,
  };
}

export async function fetchVpnProfile(): Promise<ResultWithStatus<VpnProfile>> {
  const res = await get<unknown>('/v1/vpn/profile');
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: VpnProfile.parse(res.data) };
  }
  return await transformErrorResponse(res.response);
}

const EXACT_HEX_32 = /^[0-9a-f]{64}$/u;

/** Validate and preserve Torii's finalized keyset query without offset emulation. */
export function normalizeSorafsPinRegistryParams(
  params: SorafsPinRegistrySearchParams = {}
): SorafsPinRegistrySearchParams {
  if (params.limit !== undefined && (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 256)) {
    throw new TypeError('SoraFS pin limit must be an integer between 1 and 256');
  }
  if (
    params.max_bytes !== undefined &&
    (!Number.isSafeInteger(params.max_bytes) || params.max_bytes < 1024 || params.max_bytes > 256 * 1024)
  ) {
    throw new TypeError('SoraFS pin max_bytes must be an integer between 1024 and 262144');
  }
  if (
    params.after_digest_hex !== undefined &&
    (!EXACT_HEX_32.test(params.after_digest_hex) || /^0+$/u.test(params.after_digest_hex))
  ) {
    throw new TypeError('SoraFS pin after_digest_hex must be non-zero lowercase 32-byte hex');
  }

  const hasExpectedHeight = params.expected_finalized_height !== undefined;
  const hasExpectedHash = params.expected_finalized_block_hash_hex !== undefined;
  if (hasExpectedHeight !== hasExpectedHash) {
    throw new TypeError('SoraFS pin finalized height and block hash must be supplied together');
  }
  if (
    params.expected_finalized_height !== undefined &&
    (!Number.isSafeInteger(params.expected_finalized_height) || params.expected_finalized_height < 1)
  ) {
    throw new TypeError('SoraFS pin expected_finalized_height must be a positive safe integer');
  }
  if (
    params.expected_finalized_block_hash_hex !== undefined &&
    (!EXACT_HEX_32.test(params.expected_finalized_block_hash_hex) ||
      /^0+$/u.test(params.expected_finalized_block_hash_hex))
  ) {
    throw new TypeError('SoraFS pin expected_finalized_block_hash_hex must be non-zero lowercase 32-byte hex');
  }

  return { ...params };
}

function sorafsFinalizedCursorMatchesRequest(
  cursor: { height: number; block_hash: string },
  request: SorafsPinManifestSearchParams
): boolean {
  return (
    request.expected_finalized_height === undefined ||
    (cursor.height === request.expected_finalized_height &&
      cursor.block_hash === request.expected_finalized_block_hash_hex)
  );
}

export async function fetchSorafsPinRegistry(
  params: SorafsPinRegistrySearchParams = {}
): Promise<ResultWithStatus<SorafsPinRegistryResponse>> {
  const request = normalizeSorafsPinRegistryParams(params);
  const res = await get<SorafsPinRegistryResponse>('/v1/sorafs/pin', request);
  if (res.status === SUCCESSFUL_FETCHING) {
    const data = SorafsPinRegistryResponse.parse(res.data);
    assertToriiResponseIdentity(
      'SoraFS pin registry snapshot',
      sorafsFinalizedCursorMatchesRequest(data.finalized_cursor, request)
    );
    return { status: SUCCESSFUL_FETCHING, data };
  }

  return await transformErrorResponse(res.response);
}

export function normalizeSorafsPinManifestRequest(
  digestHex: string,
  params: SorafsPinManifestSearchParams = {}
): { digestHex: string; params: SorafsPinManifestSearchParams } {
  if (!EXACT_HEX_32.test(digestHex) || /^0+$/u.test(digestHex)) {
    throw new TypeError('SoraFS pin digest must be non-zero lowercase 32-byte hex');
  }
  const normalized = normalizeSorafsPinRegistryParams(params);
  return {
    digestHex,
    params: {
      expected_finalized_height: normalized.expected_finalized_height,
      expected_finalized_block_hash_hex: normalized.expected_finalized_block_hash_hex,
    },
  };
}

export async function fetchSorafsPinManifest(
  digestHex: string,
  params: SorafsPinManifestSearchParams = {}
): Promise<ResultWithStatus<SorafsPinManifestResponse>> {
  const request = normalizeSorafsPinManifestRequest(digestHex, params);
  const res = await get<SorafsPinManifestResponse>(`/v1/sorafs/pin/${request.digestHex}`, request.params);
  if (res.status === SUCCESSFUL_FETCHING) {
    const data = SorafsPinManifestResponse.parse(res.data);
    assertToriiResponseIdentity(
      'SoraFS pin manifest',
      data.manifest.digest === request.digestHex &&
        sorafsFinalizedCursorMatchesRequest(data.finalized_cursor, request.params)
    );
    return { status: SUCCESSFUL_FETCHING, data };
  }

  return await transformErrorResponse(res.response);
}

export async function createConnectSession(
  preview: BrowserConnectSessionPreview
): Promise<ResultWithStatus<ConnectSessionResponse>> {
  try {
    const data = await registerConnectSession(getToriiBaseUrl(), preview, {
      fetchImpl: toriiSdkFetch,
      node: preview.node,
    });
    return {
      status: SUCCESSFUL_FETCHING,
      data: ConnectSessionResponse.parse(data),
    };
  } catch (error) {
    return {
      status: UNKNOWN_ERROR,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

const ZkQueryHeight = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ZK_PROOF_FILTER_QUERY_SHAPE = {
  backend: ZkProofId.shape.backend.optional(),
  status: z.enum(['Submitted', 'Verified', 'Rejected']).optional(),
  bridge_only: z.boolean().optional(),
  bridge_start_from_height: ZkQueryHeight.optional(),
  bridge_end_until_height: ZkQueryHeight.optional(),
  has_tag: z
    .string()
    .regex(/^[\x21-\x7e]{4}$/u, 'has_tag must be exactly 4 ASCII graphic characters')
    .optional(),
  verified_from_height: ZkQueryHeight.optional(),
  verified_until_height: ZkQueryHeight.optional(),
} as const;

const ZkProofFilterQuery = z
  .object(ZK_PROOF_FILTER_QUERY_SHAPE)
  .strict()
  .superRefine((value, context) => {
    if (
      value.verified_from_height !== undefined &&
      value.verified_until_height !== undefined &&
      value.verified_from_height > value.verified_until_height
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verified_until_height'],
        message: 'verified_until_height must be greater than or equal to verified_from_height',
      });
    }
    if (
      value.bridge_start_from_height !== undefined &&
      value.bridge_end_until_height !== undefined &&
      value.bridge_start_from_height > value.bridge_end_until_height
    ) {
      context.addIssue({
        code: 'custom',
        path: ['bridge_end_until_height'],
        message: 'bridge_end_until_height must be greater than or equal to bridge_start_from_height',
      });
    }
  });

const ZkProofListQuery = ZkProofFilterQuery.safeExtend({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().nonnegative().max(99_999).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  ids_only: z.boolean().optional(),
})
  .strict()
  .superRefine((value, context) => {
    if ((value.offset ?? 0) + (value.limit ?? 200) > 100_000) {
      context.addIssue({
        code: 'custom',
        path: ['offset'],
        message: 'offset plus limit must not exceed the 100000-row proof query window',
      });
    }
  });

const ZkProofLookup = z
  .object({
    backend: ZkProofId.shape.backend,
    hash: z
      .string()
      .regex(/^(?:0x)?[0-9a-fA-F]{64}$/u, 'hash must contain exactly 32 hexadecimal bytes')
      .transform((value) => value.replace(/^0x/u, '').toLowerCase()),
  })
  .strict();

const ZkVerifyingKeyListQuery = z
  .object({
    backend: ZkVerifyingKeyId.shape.backend.optional(),
    status: z.enum(['Active', 'Proposed', 'Withdrawn']).optional(),
    name_contains: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().nonnegative().max(499).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    ids_only: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.offset ?? 0) + (value.limit ?? 100) > 500) {
      context.addIssue({
        code: 'custom',
        path: ['offset'],
        message: 'offset plus limit must not exceed the 500-row verifying-key query window',
      });
    }
  });

export async function fetchZkProofs(
  params?: ZkProofListParams & { ids_only?: false }
): Promise<ResultWithStatus<ZkProofRegistryItem[]>>;
export async function fetchZkProofs(
  params: ZkProofListParams & { ids_only: true }
): Promise<ResultWithStatus<ZkProofId[]>>;
export async function fetchZkProofs(
  params: ZkProofListParams = {}
): Promise<ResultWithStatus<ZkProofRegistryItem[] | ZkProofId[]>> {
  const query = ZkProofListQuery.parse(params);
  const res = await get<unknown>('/v1/zk/proofs', query);
  if (res.status === SUCCESSFUL_FETCHING) {
    const schema = query.ids_only ? ZkProofId.array() : ZkProofRegistryItem.array();
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchZkProofCount(params: ZkProofFilterParams = {}): Promise<ResultWithStatus<ZkProofCount>> {
  const query = ZkProofFilterQuery.parse(params);
  const res = await get<unknown>('/v1/zk/proofs/count', query);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: ZkProofCount.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchZkProof(backend: string, hash: string): Promise<ResultWithStatus<ZkProofDetail>> {
  const lookup = ZkProofLookup.parse({ backend, hash });
  const res = await get<unknown>(
    `/v1/zk/proof/${encodeURIComponent(lookup.backend)}/${encodeURIComponent(lookup.hash)}`
  );
  if (res.status === SUCCESSFUL_FETCHING) {
    const data = ZkProofDetail.parse(res.data);
    assertToriiResponseIdentity('ZK proof', data.backend === lookup.backend && data.proof_hash === lookup.hash);
    return { status: SUCCESSFUL_FETCHING, data };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchZkVerifyingKeys(
  params?: ZkVerifyingKeyListParams & { ids_only?: false }
): Promise<ResultWithStatus<ZkVerifyingKeyListItem[]>>;
export async function fetchZkVerifyingKeys(
  params: ZkVerifyingKeyListParams & { ids_only: true }
): Promise<ResultWithStatus<ZkVerifyingKeyId[]>>;
export async function fetchZkVerifyingKeys(
  params: ZkVerifyingKeyListParams = {}
): Promise<ResultWithStatus<ZkVerifyingKeyListItem[] | ZkVerifyingKeyId[]>> {
  const query = ZkVerifyingKeyListQuery.parse(params);
  const res = await get<unknown>('/v1/zk/vk', query);
  if (res.status === SUCCESSFUL_FETCHING) {
    const schema = query.ids_only ? ZkVerifyingKeyId.array() : ZkVerifyingKeyListItem.array();
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchZkVerifyingKey(
  backend: string,
  name: string
): Promise<ResultWithStatus<ZkVerifyingKeyDetail>> {
  const lookup = ZkVerifyingKeyId.parse({ backend, name });
  const res = await get<unknown>(`/v1/zk/vk/${encodeURIComponent(lookup.backend)}/${encodeURIComponent(lookup.name)}`);
  if (res.status === SUCCESSFUL_FETCHING) {
    const data = ZkVerifyingKeyDetail.parse(res.data);
    assertToriiResponseIdentity('ZK verifying key', data.id.backend === lookup.backend && data.id.name === lookup.name);
    return { status: SUCCESSFUL_FETCHING, data };
  }

  return await transformErrorResponse(res.response);
}

export function isToriiBaseUrlForced(): boolean {
  return getRuntimeConfig().toriiForceBaseUrl === true;
}

async function parseBoundToriiSdkResult<T>(
  request: (client: ToriiBrowserClient) => Promise<unknown>,
  schema: ZodType<T>,
  binding: { matchesRequest: (data: T) => boolean; resource: string }
): Promise<ResultWithStatus<T>> {
  const result = await parseToriiSdkResult(request, schema);
  if (result.status === SUCCESSFUL_FETCHING) {
    assertToriiResponseIdentity(binding.resource, binding.matchesRequest(result.data));
  }
  return result;
}

function normalizeInstructionIndexForApi(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new TypeError('Instruction index must be a u32');
  }
  return index;
}

const AssetDefinitionDetailSelectorSchema = z.union([AssetDefinitionIdSchema, AssetDefinitionAliasSchema]);
