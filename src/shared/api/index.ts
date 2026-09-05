import { appendSearchParams } from './query';
import type {
  PaginationParams,
  AssetSearchParams,
  AssetDefinitionId,
  AssetDefinitionSelector,
  AssetId,
  TransactionSearchParams,
  AccountSearchParams,
  AssetDefinitionSearchParams,
  InstructionsSearchParams,
  DomainSearchParams,
  NftId,
  NFTsSearchParams,
  RWASearchParams,
  SorafsPinRegistrySearchParams,
  SorafsPinManifestSearchParams,
  AccountPermissionsSearchParams,
  AccountHistorySearchParams,
  MultisigProposalsSearchParams,
  ContractActivityFilters,
  ContractActivitySearchParams,
  ContractEventFilters,
  ContractEventSearchParams,
  ZkProofFilterParams,
  ZkProofListParams,
  ZkVerifyingKeyListParams,
  AccountQrSnapshot,
  DefiOracleAttestationLatestParams,
} from '@/shared/api/schemas';
import {
  Account,
  AccountSearchParamsSchema,
  AccountQrResponse,
  CursorPaginated,
  HistoryCursorPaginated,
  HistoryCursorParamsSchema,
  AssetDefinitionAliasSchema,
  AssetDefinitionIdSchema,
  AssetIdSchema,
  AssetSearchParamsSchema,
  ExplorerAsset,
  AssetDefinition,
  AssetDefinitionSearchParamsSchema,
  ExplorerAssetDefinition,
  ConfidentialAssetPolicy,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  Domain,
  DomainSearchParamsSchema,
  Block,
  Transaction,
  TransactionSearchParamsSchema,
  DetailedTransaction,
  Instruction,
  InstructionsSearchParamsSchema,
  ExplorerHealth,
  PeerInfo,
  NFT,
  NFTsSearchParamsSchema,
  NftIdSchema,
  LatestTransactionsResponse,
  LatestInstructionsResponse,
  PeerMetrics,
  RWA,
  RWASearchParamsSchema,
  RwaIdSchema,
  SorafsPinRegistryResponse,
  SorafsPinManifestResponse,
  ConnectSessionResponse,
  NexusDataspacesAccountSummary,
  ContractCodeView,
  ContractActivityResponse,
  ContractEvent,
  ContractEventResponse,
  LedgerStateRoot,
  LedgerStateProof,
  AccountPermissionsResponse,
  AccountPermissionsSearchParamsSchema,
  AccountHistoryResponse,
  AccountHistorySearchParamsSchema,
  MultisigSpecResponse,
  MultisigProposalsQueryResponse,
  MultisigProposalsSearchParamsSchema,
  ContractActivitySearchParamsSchema,
  ContractEventFiltersSchema,
  ContractEventSearchParamsSchema,
  ZkProofId,
  ZkProofRegistryItem,
  ZkProofDetail,
  ZkProofCount,
  ZkVerifyingKeyId,
  ZkVerifyingKeyListItem,
  ZkVerifyingKeyDetail,
  VpnProfile,
  SystemParameters,
  SoracleFeedIdSchema,
  SoracleFeedRegistry,
  SoracleFeedEventRecord,
  DefiOracleAttestationLatestParamsSchema,
  DefiOracleAttestation,
} from '@/shared/api/schemas';
import { useEventSource } from '@vueuse/core';
import { computed, readonly, ref } from 'vue';
import { z, type ZodType } from 'zod/v4';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { transformErrorResponse } from '@/shared/utils/transform-error-response';
import type { SuccessfulFetching } from '@/shared/api/consts';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { normalizeAccountIdLiteral, normalizeToriiAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';
import { normalizeDomainIdLiteral } from '@/shared/lib/rwa-id';
import { assertExactOffsetPage } from '@/shared/lib/pagination';
import { parseStrictLosslessIntegerJson } from '@/shared/lib/strict-lossless-integer-json';
import { NetworkId } from '@iroha/iroha-js/browser';
import { registerConnectSession, type BrowserConnectSessionPreview } from '@iroha/iroha-js/connect-browser';
import { ToriiBrowserClient, ToriiBrowserHttpError, ToriiBrowserStreamGapError } from '@iroha/iroha-js/torii-browser';
import type {
  ToriiBlockProofs,
  ToriiBrowserCanonicalRequestOptions,
  ToriiSseEvent,
} from '@iroha/iroha-js/torii-browser';
export { appendSearchParams } from './query';
export { ToriiBrowserStreamGapError };
export type {
  AccountPermissionsSearchParams,
  AccountHistorySearchParams,
  MultisigProposalsSearchParams,
  ContractActivityFilters,
  ContractActivitySearchParams,
  ContractEventFilters,
  ContractEventSearchParams,
} from '@/shared/api/schemas';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
const defaultToriiOrigin = rawApiUrl.length > 0 ? rawApiUrl : defaultOrigin;
const EXPLORER_SUFFIX = '/v1/explorer';
const STORAGE_KEY = 'torii_base_url';
const FAILOVER_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_FAILOVER_THRESHOLD = 5;
const DEFAULT_FAILOVER_WINDOW_MS = 60_000;
const DEFAULT_FAILOVER_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_RETRY_COUNT = 1;
const DEFAULT_REQUEST_RETRY_BASE_DELAY_MS = 200;
const FAILOVER_HEALTH_PATH = '/v1/explorer/health';
const MAX_U64 = 18_446_744_073_709_551_615n;
const ASSET_ID_DATASPACE_SCOPE_PATTERN = /#dataspace:(\d+)$/u;
const EXACT_JSON_MEDIA_TYPE_PATTERN =
  /^[ \t]*application\/json(?:[ \t]*;[ \t]*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+|"(?:[ \t!#-\[\]-~\u0080-\u00ff]|\\[ \t!-~\u0080-\u00ff])*"))*[ \t]*$/iu;

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

const effectiveToriiBaseUrlState = computed(() => routeScopedToriiBaseUrlState.value ?? toriiBaseUrlState.value);
const explorerApiBaseState = computed(() => `${effectiveToriiBaseUrlState.value}${EXPLORER_SUFFIX}`);

export function getToriiBaseUrl(): string {
  return effectiveToriiBaseUrlState.value;
}

export function getConfiguredToriiBaseUrl(): string {
  return toriiBaseUrlState.value;
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
    enabled: config.toriiForceBaseUrl !== true && config.toriiFailoverEnabled !== false,
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
    const candidates = resolveFailoverCandidates(from);
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
  if (!runtime.enabled) return;
  const nowMs = Date.now();
  failoverFailureTimestampsMs.push(nowMs);
  const oldestAllowed = nowMs - runtime.windowMs;
  while (failoverFailureTimestampsMs.length && failoverFailureTimestampsMs[0] < oldestAllowed) {
    failoverFailureTimestampsMs.shift();
  }
  toriiFailureCountState.value = failoverFailureTimestampsMs.length;
  toriiLastErrorState.value = reason;
  if (toriiAvailabilityState.value !== 'failing_over' && toriiAvailabilityState.value !== 'outage') {
    toriiAvailabilityState.value = 'degraded';
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

export function isToriiBaseUrlForced(): boolean {
  return getRuntimeConfig().toriiForceBaseUrl === true;
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

export function buildToriiUrl(path: string): string {
  return `${getToriiBaseUrl()}${requireCanonicalToriiV1Path(path)}`;
}

export function buildToriiWsUrl(path: string): string {
  const url = new URL(buildToriiUrl(path));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

type GetResult<T> = { status: SuccessfulFetching; data: T } | { status: 'error'; response: Response };
type ResultWithStatus<T> = { status: SuccessfulFetching; data: T } | ErrorResponse;
export type PermissionAwareResult<T> = ResultWithStatus<T> | { status: 'permission-denied'; error: Error };
export type ToriiCanonicalRequestAuth = Pick<ToriiBrowserCanonicalRequestOptions, 'authAccountId' | 'sign'>;

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

class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

function retryDelayMs(attemptIndex: number, baseDelayMs: number): number {
  const multiplier = Math.max(0, attemptIndex);
  return baseDelayMs * (multiplier + 1);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

async function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) throw abortReason(signal);
  if (ms <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
      reject(signal ? abortReason(signal) : new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const callerSignal = init.signal;
  if (callerSignal?.aborted) throw abortReason(callerSignal);

  const controller = new AbortController();
  let timedOut = false;
  const handleCallerAbort = () => {
    if (!controller.signal.aborted && callerSignal) controller.abort(abortReason(callerSignal));
  };
  callerSignal?.addEventListener('abort', handleCallerAbort, { once: true });
  const timeout = globalThis.setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort(new RequestTimeoutError(timeoutMs));
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', handleCallerAbort);
  }
}

function shouldRetryResponse(response: Response): boolean {
  return FAILOVER_STATUSES.has(response.status);
}

function shouldRetryError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error;
}

function isReplaySafeRequest(init: RequestInit): boolean {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  return !new Headers(init.headers).has('x-iroha-nonce');
}

async function fetchWithTimeoutRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const runtime = requestRuntimeConfig();
  const retryCount = isReplaySafeRequest(init) ? Math.max(0, runtime.retryCount) : 0;
  let attempt = 0;

  while (true) {
    if (init.signal?.aborted) throw abortReason(init.signal);
    try {
      const response = await fetchWithTimeout(input, init, runtime.timeoutMs);
      if (attempt < retryCount && shouldRetryResponse(response)) {
        await sleep(retryDelayMs(attempt, runtime.retryBaseDelayMs), init.signal);
        attempt += 1;
        continue;
      }
      return response;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      if (attempt < retryCount && shouldRetryError(error)) {
        await sleep(retryDelayMs(attempt, runtime.retryBaseDelayMs), init.signal);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
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

function normalizeMultisigAccountSelectorForApi(value: string): string {
  const normalized = normalizeToriiAccountSelectorLiteral(value);
  if (!normalized) {
    throw new TypeError('Multisig account selector must be a canonical i105 account ID or account alias');
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

function normalizeAccountQueryParams(params?: Record<string, any>): Record<string, any> | undefined {
  if (!params) return params;
  const normalized = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
  for (const key of ['owned_by', 'authority', 'account'] as const) {
    if (key in normalized) normalized[key] = normalizeAccountIdForApi(normalized[key]);
  }
  return normalized;
}

function toLimitOffsetParams(params?: PaginationParams): { limit?: number; offset?: number } {
  if (!params) return {};
  return {
    limit: params.per_page,
    offset: (params.page - 1) * params.per_page,
  };
}

interface ExplorerCursorSdkParams {
  cursor?: string;
  limit?: number;
}

/** Parse one SDK-backed Torii cursor page without synthesizing numbered-page metadata. */
async function fetchExplorerCursorPage<T>(
  params: { cursor?: string | null; limit?: number } | undefined,
  options: {
    itemSchema: ZodType<T>;
    request: (client: ToriiBrowserClient, pagination: ExplorerCursorSdkParams) => Promise<unknown>;
  }
): Promise<ResultWithStatus<CursorPaginated<T>>> {
  const cursor = params?.cursor ?? undefined;
  const limit = params?.limit;
  const pagination: ExplorerCursorSdkParams = {
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
  };
  const response = await parseToriiSdkResult(
    (client) => options.request(client, pagination),
    CursorPaginated(options.itemSchema)
  );
  if (response.status !== SUCCESSFUL_FETCHING) {
    return response;
  }

  const payload = response.data;
  if (limit !== undefined && payload.pagination.limit !== limit) {
    throw new TypeError('Explorer response limit must match the requested limit');
  }
  if (cursor !== undefined && payload.pagination.next_cursor === cursor) {
    throw new TypeError('Explorer cursor did not advance');
  }
  return { status: SUCCESSFUL_FETCHING, data: payload };
}

/** Parse one immutable, snapshot-bound Explorer history page. */
async function fetchExplorerHistoryPage<T>(
  params: { cursor?: string | null; limit?: number } | undefined,
  options: {
    itemSchema: ZodType<T>;
    request: (client: ToriiBrowserClient, pagination: ExplorerCursorSdkParams) => Promise<unknown>;
  }
): Promise<ResultWithStatus<HistoryCursorPaginated<T>>> {
  const request = HistoryCursorParamsSchema.parse({ cursor: params?.cursor, limit: params?.limit });
  const cursor = request.cursor ?? undefined;
  const limit = request.limit;
  const pagination: ExplorerCursorSdkParams = {
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
  };
  const response = await parseToriiSdkResult(
    (client) => options.request(client, pagination),
    HistoryCursorPaginated(options.itemSchema)
  );
  if (response.status !== SUCCESSFUL_FETCHING) return response;

  if (limit !== undefined && response.data.pagination.limit !== limit) {
    throw new TypeError('Explorer history response limit must match the requested limit');
  }
  if (cursor !== undefined && response.data.pagination.next_cursor === cursor) {
    throw new TypeError('Explorer history cursor did not advance');
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
    if (!init?.signal?.aborted) {
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
  const networkIdLiteral = getRuntimeConfig().networkId;
  return new ToriiBrowserClient(getToriiBaseUrl(), {
    fetchImpl,
    networkId: networkIdLiteral ? NetworkId.parse(networkIdLiteral) : undefined,
    defaultHeaders: toriiRequiredHeaders(),
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
    if (error instanceof ToriiBrowserHttpError) {
      return await transformErrorResponse(error.response);
    }
    throw error;
  }
}

function assertToriiResponseIdentity(resource: string, matchesRequest: boolean): void {
  if (!matchesRequest) {
    throw new Error(`Torii ${resource} response identity does not match the requested resource`);
  }
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

function normalizeExplorerHashForApi(value: string, resource: string): string {
  const normalized = normalizeIrohaHash32(value);
  if (!normalized) {
    throw new TypeError(`${resource} must be a canonical Iroha 32-byte hash`);
  }
  return normalized;
}

function normalizeInstructionIndexForApi(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new TypeError('Instruction index must be a u32');
  }
  return index;
}

const AssetDefinitionDetailSelectorSchema = z.union([AssetDefinitionIdSchema, AssetDefinitionAliasSchema]);

async function parsePermissionAwareToriiSdkResult<T>(
  request: (client: ToriiBrowserClient) => Promise<unknown>,
  schema: ZodType<T>
): Promise<PermissionAwareResult<T>> {
  try {
    const payload = await request(toriiSdkClient());
    return { status: SUCCESSFUL_FETCHING, data: schema.parse(payload) };
  } catch (error) {
    if (error instanceof ToriiBrowserHttpError) {
      if (error.status === 401 || error.status === 403) {
        return {
          status: 'permission-denied',
          error: new Error(error.bodyText || `Torii denied this read with status ${error.status}`),
        };
      }
      return await transformErrorResponse(error.response);
    }
    throw error;
  }
}

export async function fetchAccounts(params?: AccountSearchParams): Promise<ResultWithStatus<CursorPaginated<Account>>> {
  const request = AccountSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: Account,
    request: (client, pagination) =>
      client.listExplorerAccounts({
        ...pagination,
        domain: request.domain,
        withAsset: request.with_asset,
      }),
  });
}

export async function fetchAccount(id: string): Promise<ResultWithStatus<Account>> {
  const normalizedId = normalizeAccountIdForApi(id);
  return await parseBoundToriiSdkResult((client) => client.getExplorerAccount(normalizedId), Account, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'account',
  });
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

export async function fetchAccountPermissions(
  id: string,
  params: AccountPermissionsSearchParams
): Promise<PermissionAwareResult<AccountPermissionsResponse>> {
  const normalizedId = normalizeAccountIdForApi(id);
  const request = AccountPermissionsSearchParamsSchema.parse(params);
  const result = await parsePermissionAwareToriiSdkResult(
    (client) =>
      client.listAccountPermissions(normalizedId, {
        ...toLimitOffsetParams(request),
        countMode: 'exact',
      }),
    AccountPermissionsResponse
  );
  if (result.status === SUCCESSFUL_FETCHING) {
    assertExactOffsetPage('account permissions', request, result.data);
  }
  return result;
}

export async function fetchAccountHistory(
  id: string,
  params: AccountHistorySearchParams
): Promise<PermissionAwareResult<AccountHistoryResponse>> {
  const normalizedId = normalizeAccountIdForApi(id);
  const request = AccountHistorySearchParamsSchema.parse(params);
  const result = await parsePermissionAwareToriiSdkResult(
    (client) =>
      client.listAccountHistory(normalizedId, {
        ...toLimitOffsetParams(request),
        countMode: 'exact',
        assetId: request.asset_id,
      }),
    AccountHistoryResponse
  );
  if (result.status === SUCCESSFUL_FETCHING) {
    assertExactOffsetPage('account history', request, result.data);
  }
  return result;
}

export async function fetchMultisigSpec(
  id: string,
  auth: ToriiCanonicalRequestAuth
): Promise<PermissionAwareResult<MultisigSpecResponse>> {
  const normalizedId = normalizeMultisigAccountSelectorForApi(id);
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
  const normalizedId = normalizeMultisigAccountSelectorForApi(id);
  const request = MultisigProposalsSearchParamsSchema.parse(params);
  const selector = normalizeAccountIdLiteral(normalizedId)
    ? { multisigAccountId: normalizedId }
    : { multisigAccountAlias: normalizedId };
  return await parsePermissionAwareToriiSdkResult(
    (client) =>
      client.queryMultisigProposals(
        {
          ...selector,
          status: request.status,
          cursor: request.cursor,
          limit: request.limit,
        },
        auth
      ),
    MultisigProposalsQueryResponse
  );
}

export async function fetchAssets(
  params?: AssetSearchParams
): Promise<ResultWithStatus<CursorPaginated<ExplorerAsset>>> {
  const request = AssetSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: ExplorerAsset,
    request: (client, pagination) =>
      client.listExplorerAssets({
        ...pagination,
        ownedBy: normalizeAccountIdForApi(request.owned_by),
        definition: request.definition,
        assetId: request.asset_id === undefined ? undefined : normalizeAssetIdForApi(request.asset_id),
      }),
  });
}

export async function fetchAsset(id: AssetId): Promise<ResultWithStatus<ExplorerAsset>> {
  const normalizedId = normalizeAssetIdForApi(id.toString());
  const result = await get<unknown>(`/v1/explorer/assets/${encodeURIComponent(normalizedId)}`);
  if (result.status === SUCCESSFUL_FETCHING) {
    const data = ExplorerAsset.parse(result.data);
    if (data.id !== normalizedId) {
      throw new Error('Torii asset response id does not match the requested asset ID');
    }
    return { status: SUCCESSFUL_FETCHING, data };
  }
  return await transformErrorResponse(result.response);
}

export async function fetchAssetDefinitions(
  params?: AssetDefinitionSearchParams
): Promise<ResultWithStatus<CursorPaginated<ExplorerAssetDefinition>>> {
  const request = AssetDefinitionSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: ExplorerAssetDefinition,
    request: (client, pagination) =>
      client.listExplorerAssetDefinitions({
        ...pagination,
        owningDomain: request.owning_domain,
        ownedBy: normalizeAccountIdForApi(request.owned_by),
      }),
  });
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

export async function fetchNFTs(params?: NFTsSearchParams): Promise<ResultWithStatus<CursorPaginated<NFT>>> {
  const request = NFTsSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: NFT,
    request: (client, pagination) =>
      client.listExplorerNfts({
        ...pagination,
        domain: request.domain,
        ownedBy: normalizeAccountIdForApi(request.owned_by),
      }),
  });
}

export async function fetchNFTById(id: NftId): Promise<ResultWithStatus<NFT>> {
  const normalizedId = NftIdSchema.parse(id.toString());
  return await parseBoundToriiSdkResult((client) => client.getExplorerNft(normalizedId), NFT, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'NFT',
  });
}

export async function fetchRwas(params?: RWASearchParams): Promise<ResultWithStatus<CursorPaginated<RWA>>> {
  const request = RWASearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: RWA,
    request: (client, pagination) =>
      client.listExplorerRwas({
        ...pagination,
        domain: request.domain,
        ownedBy: normalizeAccountIdForApi(request.owned_by),
      }),
  });
}

export async function fetchRwaById(id: string): Promise<ResultWithStatus<RWA>> {
  const normalizedId = RwaIdSchema.parse(id);
  return await parseBoundToriiSdkResult((client) => client.getExplorerRwa(normalizedId), RWA, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'RWA',
  });
}

export async function fetchDomains(params?: DomainSearchParams): Promise<ResultWithStatus<CursorPaginated<Domain>>> {
  const request = DomainSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerCursorPage(request, {
    itemSchema: Domain,
    request: (client, pagination) =>
      client.listExplorerDomains({
        ...pagination,
        ownedBy: normalizeAccountIdForApi(request.owned_by),
      }),
  });
}

export async function fetchDomain(id: string): Promise<ResultWithStatus<Domain>> {
  const normalizedId = normalizeDomainIdLiteral(id);
  if (!normalizedId) throw new TypeError('Domain ID must be a canonical domain.dataspace literal');
  return await parseBoundToriiSdkResult((client) => client.getExplorerDomain(normalizedId), Domain, {
    matchesRequest: (data) => data.id === normalizedId,
    resource: 'domain',
  });
}

export async function fetchBlocks(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ResultWithStatus<HistoryCursorPaginated<Block>>> {
  return await fetchExplorerHistoryPage(params, {
    itemSchema: Block,
    request: (client, pagination) => client.listExplorerBlocks(pagination),
  });
}

export async function fetchBlock(heightOrHash: number | string): Promise<ResultWithStatus<Block>> {
  const isDecimalHeight = typeof heightOrHash === 'string' && /^\d+$/u.test(heightOrHash);
  if (typeof heightOrHash === 'number' || isDecimalHeight) {
    if (typeof heightOrHash === 'string' && !/^[1-9]\d*$/u.test(heightOrHash)) {
      throw new TypeError('Block height string must be a canonical positive decimal integer');
    }
    const height = typeof heightOrHash === 'number' ? heightOrHash : Number(heightOrHash);
    if (!Number.isSafeInteger(height) || height < 1) {
      throw new TypeError('Block height must be a positive safe integer');
    }
    return await parseBoundToriiSdkResult((client) => client.getExplorerBlock(height), Block, {
      matchesRequest: (data) => data.height === height,
      resource: 'block',
    });
  }

  const normalizedHash = normalizeExplorerHashForApi(heightOrHash, 'Block hash');
  return await parseBoundToriiSdkResult((client) => client.getExplorerBlock(normalizedHash), Block, {
    matchesRequest: (data) => data.hash === normalizedHash,
    resource: 'block',
  });
}

export interface TransactionBlockEvidence {
  proof: ToriiBlockProofs;
  pathVerification: {
    valid: boolean;
    entry_hash_matches: boolean;
    entry_proof_valid: boolean;
    result_proof_valid: boolean;
  };
}

export async function fetchLedgerBlockProof(
  blockHeight: number,
  transactionHash: string
): Promise<ResultWithStatus<TransactionBlockEvidence>> {
  try {
    const proof = await toriiSdkClient().getLedgerBlockProof(blockHeight, transactionHash);
    const { verifyBlockMerkleProof } = await import('@iroha/iroha-js/norito');
    const expectedEntryHash = normalizeIrohaHash32(transactionHash);
    const proofEntryHash = normalizeIrohaHash32(proof.entry_hash);
    const entryHashMatches = expectedEntryHash !== null && expectedEntryHash === proofEntryHash;
    const entryProofValid = verifyBlockMerkleProof(
      proof.entry_proof.leaf,
      proof.entry_proof.proof,
      proof.entry_commitment
    );
    const resultProofValid = verifyBlockMerkleProof(
      proof.result_proof.leaf,
      proof.result_proof.proof,
      proof.result_commitment
    );
    return {
      status: SUCCESSFUL_FETCHING,
      data: {
        proof,
        pathVerification: {
          valid: entryHashMatches && entryProofValid && resultProofValid,
          entry_hash_matches: entryHashMatches,
          entry_proof_valid: entryProofValid,
          result_proof_valid: resultProofValid,
        },
      },
    };
  } catch (error) {
    if (error instanceof ToriiBrowserHttpError) {
      return await transformErrorResponse(error.response);
    }
    throw error;
  }
}

export async function fetchLedgerStateRoot(blockHeight: number): Promise<ResultWithStatus<LedgerStateRoot>> {
  return await parseToriiSdkResult((client) => client.getLedgerStateRoot(blockHeight), LedgerStateRoot);
}

export async function fetchLedgerStateProof(blockHeight: number): Promise<ResultWithStatus<LedgerStateProof>> {
  return await parseToriiSdkResult((client) => client.getLedgerStateProof(blockHeight), LedgerStateProof);
}

export async function fetchExplorerHealth(): Promise<ResultWithStatus<ExplorerHealth>> {
  return await parseToriiSdkResult((client) => client.getExplorerHealth(), ExplorerHealth);
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
  const { data: streamedMetrics, status, open } = useEventSource(telemetryLiveUrl, [], {
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

export async function fetchPeersInfo(): Promise<ResultWithStatus<PeerInfo[]>> {
  const res = await get('/v1/telemetry/peers-info');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: PeerInfo.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchVpnProfile(): Promise<ResultWithStatus<VpnProfile>> {
  const res = await get<unknown>('/v1/vpn/profile');
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: VpnProfile.parse(res.data) };
  }
  return await transformErrorResponse(res.response);
}

export async function fetchTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<HistoryCursorPaginated<Transaction>>> {
  const request = TransactionSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerHistoryPage(request, {
    itemSchema: Transaction,
    request: (client, pagination) =>
      client.listExplorerTransactions(
        normalizeAccountQueryParams({
          ...pagination,
          authority: request.authority,
          block: request.block,
          status: request.status?.toLowerCase(),
          asset_id: request.asset_id === undefined ? undefined : normalizeAssetIdForApi(request.asset_id),
        })
      ),
  });
}

export async function fetchLatestTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<LatestTransactionsResponse>> {
  const request = TransactionSearchParamsSchema.parse(params ?? {});
  return await parseToriiSdkResult(
    (client) =>
      client.listLatestExplorerTransactions(
        normalizeAccountQueryParams({
          cursor: request.cursor ?? undefined,
          limit: request.limit,
          authority: request.authority,
          block: request.block,
          status: request.status?.toLowerCase(),
          asset_id: request.asset_id === undefined ? undefined : normalizeAssetIdForApi(request.asset_id),
        })
      ),
    LatestTransactionsResponse
  );
}

export async function fetchTransaction(hash: string): Promise<ResultWithStatus<DetailedTransaction>> {
  const normalizedHash = normalizeExplorerHashForApi(hash, 'Transaction hash');
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerTransaction(normalizedHash),
    DetailedTransaction,
    { matchesRequest: (data) => data.hash === normalizedHash, resource: 'transaction' }
  );
}

export async function fetchInstructions(
  params?: InstructionsSearchParams
): Promise<ResultWithStatus<HistoryCursorPaginated<Instruction>>> {
  const request = InstructionsSearchParamsSchema.parse(params ?? {});
  return await fetchExplorerHistoryPage(request, {
    itemSchema: Instruction,
    request: (client, pagination) =>
      client.listExplorerInstructions(
        normalizeAccountQueryParams({
          ...pagination,
          account: request.account,
          authority: request.authority,
          kind: request.kind,
          transaction_hash:
            request.transaction_hash === undefined
              ? undefined
              : normalizeExplorerHashForApi(request.transaction_hash, 'Instruction transaction hash'),
          transaction_status: request.transaction_status?.toLowerCase(),
          block: request.block,
          asset_id: request.asset_id === undefined ? undefined : normalizeAssetIdForApi(request.asset_id),
        })
      ),
  });
}

function contractEventSdkOptions(params: ContractEventFilters) {
  return {
    authority: params.authority,
    contractAddress: params.contract_address,
    contractAlias: params.contract_alias,
    module: params.module,
    eventKind: params.event_kind,
    participant: params.participant,
    assetId: params.asset_id,
    provenance: params.provenance,
    sinceTimestampMs: params.since_timestamp_ms,
    untilTimestampMs: params.until_timestamp_ms,
    resultOk: params.result_ok,
  };
}

export async function fetchContractActivity(
  params: ContractActivitySearchParams
): Promise<ResultWithStatus<ContractActivityResponse>> {
  const request = ContractActivitySearchParamsSchema.parse(params);
  const result = await parseToriiSdkResult(
    (client) =>
      client.listContractActivity({
        ...toLimitOffsetParams(request),
        countMode: 'exact',
        authority: request.authority,
        contractAddress: request.contract_address,
        contractAlias: request.contract_alias,
        contractEntrypoint: request.contract_entrypoint,
        sinceTimestampMs: request.since_timestamp_ms,
        untilTimestampMs: request.until_timestamp_ms,
        resultOk: request.result_ok,
      }),
    ContractActivityResponse
  );
  if (result.status === SUCCESSFUL_FETCHING) {
    assertExactOffsetPage('contract activity', request, result.data);
  }
  return result;
}

export async function fetchContractEvents(
  params: ContractEventSearchParams
): Promise<ResultWithStatus<ContractEventResponse>> {
  const request = ContractEventSearchParamsSchema.parse(params);
  const result = await parseToriiSdkResult(
    (client) =>
      client.listContractEvents({
        ...toLimitOffsetParams(request),
        countMode: 'exact',
        ...contractEventSdkOptions(request),
      }),
    ContractEventResponse
  );
  if (result.status === SUCCESSFUL_FETCHING) {
    assertExactOffsetPage('contract events', request, result.data);
  }
  return result;
}

export type ContractEventStreamMessage = Omit<ToriiSseEvent<unknown>, 'data'> & { data: ContractEvent };

export async function* streamContractEvents(
  filters: ContractEventFilters,
  signal?: AbortSignal
): AsyncGenerator<ContractEventStreamMessage, void, unknown> {
  const request = ContractEventFiltersSchema.parse(filters);
  for await (const event of toriiSdkClient(toriiSdkStreamFetch).streamContractEvents<unknown>({
    ...contractEventSdkOptions(request),
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
): Promise<ResultWithStatus<LatestInstructionsResponse>> {
  const request = InstructionsSearchParamsSchema.parse(params ?? {});
  return await parseToriiSdkResult(
    (client) =>
      client.listLatestExplorerInstructions(
        normalizeAccountQueryParams({
          cursor: request.cursor ?? undefined,
          limit: request.limit,
          account: request.account,
          authority: request.authority,
          kind: request.kind,
          transaction_hash:
            request.transaction_hash === undefined
              ? undefined
              : normalizeExplorerHashForApi(request.transaction_hash, 'Instruction transaction hash'),
          transaction_status: request.transaction_status?.toLowerCase(),
          block: request.block,
          asset_id: request.asset_id === undefined ? undefined : normalizeAssetIdForApi(request.asset_id),
        })
      ),
    LatestInstructionsResponse
  );
}

export async function fetchInstructionDetail(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<Instruction>> {
  const normalizedHash = normalizeExplorerHashForApi(transactionHash, 'Transaction hash');
  const normalizedIndex = normalizeInstructionIndexForApi(index);
  return await parseBoundToriiSdkResult(
    (client) => client.getExplorerInstruction(normalizedHash, normalizedIndex),
    Instruction,
    {
      matchesRequest: (data) => data.transaction_hash === normalizedHash && data.index === normalizedIndex,
      resource: 'instruction',
    }
  );
}

export async function fetchInstructionContractView(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<ContractCodeView>> {
  const normalizedHash = normalizeExplorerHashForApi(transactionHash, 'Transaction hash');
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
