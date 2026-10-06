import { fetchToriiWithDeadline } from './transport';
import { appendSearchParams } from './query';
import type {
  CursorPaginationParams,
  AssetSearchParams,
  AssetDefinitionId,
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
  SorafsAliasSearchParams,
  SorafsReplicationSearchParams,
  SoracloudServiceConfigStatusQuery,
  SoracloudServiceSecretStatusQuery,
  SoracloudTrainingJobStatusQuery,
  SoracloudModelWeightStatusQuery,
  SoracloudModelArtifactStatusQuery,
  SoracloudUploadedModelStatusQuery,
  SoracloudPrivateInferenceStatusQuery,
  SoracloudHfSharedLeaseStatusQuery,
  SoracloudModelHostStatusQuery,
  SoracloudAgentStatusQuery,
  SoracloudAgentMailboxStatusQuery,
  SoracloudAgentAutonomyStatusQuery,
  ZkAttachmentSearchParams,
  ZkProverReportSearchParams,
  SubmitVerifiedContractSource,
  MultisigProposalStatus,
  SumeragiStatus,
  SumeragiTelemetry,
  KaigiRelaySummaryList,
  KaigiRelayDetail,
  KaigiRelayHealthSnapshot,
} from '@/shared/api/schemas';
import {
  Account,
  CollectionPage,
  AssetIdSchema,
  ExplorerAsset,
  AssetDefinition,
  ExplorerAssetDefinition,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  Domain,
  Block,
  Transaction,
  DetailedTransaction,
  Instruction,
  NetworkMetrics,
  ExplorerHealth,
  PeerInfo,
  OnlinePeers,
  PeerPropagation,
  NFT,
  PeerMetrics,
  RWA,
  SorafsPinRegistryResponse,
  SorafsAliasResponse,
  SorafsReplicationResponse,
  SorafsStorageManifestResponse,
  SorafsCidLookupResponse,
  MinistryAgendaProposalDraftRequest,
  MinistryAgendaProposalDraftResponse,
  MinistryAgendaProposalGetResponse,
  PipelineTransactionStatusResponse,
  TransactionSubmissionReceiptResponse,
  SoracloudStatus,
  SoracloudServiceConfigStatusResponse,
  SoracloudServiceSecretStatusResponse,
  SoracloudTrainingJobStatusResponse,
  SoracloudModelWeightStatusResponse,
  SoracloudModelArtifactStatusResponse,
  SoracloudUploadedModelStatusResponse,
  SoracloudPrivateInferenceStatusResponse,
  SoracloudHfSharedLeaseStatusResponse,
  SoracloudModelHostStatusResponse,
  SoracloudAgentStatusResponse,
  SoracloudAgentMailboxStatusResponse,
  SoracloudAgentAutonomyStatusResponse,
  GovernanceCouncil,
  GovernanceUnlockStats,
  GovernanceReferendumResponse,
  GovernanceLocksResponse,
  GovernanceTallyResponse,
  GovernanceProposalResponse,
  ZkAttachment,
  ZkProverReport,
  CountResponse,
  NexusDataspacesAccountSummary,
  NexusPublicStatus,
  ContractCodeView,
  ContractVerifiedSourceJobResponse,
  ContractActivityResponse,
  ContractEvent,
  ContractEventResponse,
  StateFinalityResponse,
  AccountPermissionsResponse,
  AccountHistoryResponse,
  MultisigSpecResponse,
  MultisigProposalsQueryResponse,
} from '@/shared/api/schemas';
import { useEventSource } from '@vueuse/core';
import { computed, readonly, ref } from 'vue';
import type { ZodType } from 'zod/v4';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { transformErrorResponse } from '@/shared/utils/transform-error-response';
import type { SuccessfulFetching } from '@/shared/api/consts';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR, NOT_FOUND } from '@/shared/api/consts';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { normalizeAccountIdLiteral, normalizeToriiAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { ToriiBrowserClient, ToriiHttpError, ToriiStreamGapError, field, type Filter, type ListQueryInput } from '@iroha/iroha-js/torii-browser';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import type {
  ToriiBlockProofs,
  ToriiBlockProofVerification,
  ToriiBrowserCanonicalRequestOptions,
  ToriiSseEvent,
} from '@iroha/iroha-js/torii-browser';
export { appendSearchParams } from './query';
export { ToriiStreamGapError };

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const defaultExplorerBase = (rawApiUrl.length > 0 ? rawApiUrl : `${defaultOrigin}/v1/explorer`).replace(/\/+$/, '');
const EXPLORER_SUFFIX = '/v1/explorer';
const STORAGE_KEY = 'torii_base_url';
const USE_STORED_NODE = !(rawApiUrl.startsWith('/') || rawApiUrl.startsWith('./') || rawApiUrl.startsWith('../'));
const FAILOVER_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_FAILOVER_THRESHOLD = 5;
const DEFAULT_FAILOVER_WINDOW_MS = 60_000;
const DEFAULT_FAILOVER_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_FAILOVER_MAX_PEER_CANDIDATES = 16;
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

function toriiTextHeaders(): Record<string, string> {
  return {
    ...toriiRequiredHeaders(),
    Accept: 'text/plain',
  };
}

export type ToriiAvailabilityState = 'healthy' | 'degraded' | 'failing_over' | 'outage';

export interface ToriiFailoverSwitch {
  from: string;
  to: string;
  atMs: number;
  trigger: 'http_failure' | 'network_error' | 'manual';
}

export interface ToriiNodePreset {
  label: string;
  url: string;
}

const DEFAULT_TORII_NODE_PRESETS: ToriiNodePreset[] = [
  { label: 'Nexus (mainnet)', url: 'https://nexus.mof3.sora.org:18080' },
  { label: 'Testus (testnet)', url: 'https://testus.mof3.sora.org:18080' },
];

export function getToriiNodePresets(): ToriiNodePreset[] {
  return DEFAULT_TORII_NODE_PRESETS.map((item) => ({ ...item }));
}

function stripExplorerSuffix(value: string): string {
  return value
    .replace(/\/+$/, '')
    .replace(/\/v[12]\/explorer$/i, '')
    .replace(/\/v[12]$/i, '');
}

export function normalizeToriiBaseUrl(raw: string, fallback: string | null = null): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const normalized = stripExplorerSuffix(trimmed);
  try {
    const relativeBase = fallback ?? undefined;
    const url = new URL(normalized, normalized.startsWith('http') ? undefined : relativeBase);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

const defaultToriiBase =
  normalizeToriiBaseUrl(defaultExplorerBase, defaultOrigin || 'http://localhost') ?? 'http://localhost';

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
    if (!USE_STORED_NODE) {
      return defaultToriiBase;
    }
    const stored = safeReadStorage(STORAGE_KEY);
    return stored ? (normalizeToriiBaseUrl(stored, defaultToriiBase) ?? defaultToriiBase) : defaultToriiBase;
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
  return config.toriiForceBaseUrl === true && config.toriiBaseUrl
    ? normalizeToriiBaseUrl(config.toriiBaseUrl, null)
    : null;
}

const effectiveToriiBaseUrlState = computed(() =>
  forcedToriiBaseUrl() ?? routeScopedToriiBaseUrlState.value ?? toriiBaseUrlState.value
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
  if (forcedToriiBaseUrl() || !baseUrl?.trim()) {
    routeScopedToriiBaseUrlState.value = null;
    return null;
  }

  routeScopedToriiBaseUrlState.value = normalizeToriiBaseUrl(baseUrl, null);
  return routeScopedToriiBaseUrlState.value;
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
    maxPeerCandidates: config.toriiFailoverMaxPeerCandidates ?? DEFAULT_FAILOVER_MAX_PEER_CANDIDATES,
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
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(stripExplorerSuffix(trimmed));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function expandCandidateSchemes(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return [trimmed];
  return [`https://${trimmed}`, `http://${trimmed}`];
}

function parsePeerEndpoint(literal: string): string | null {
  const trimmed = literal.trim();
  if (!trimmed) return null;
  const separator = trimmed.lastIndexOf('@');
  const endpoint = separator >= 0 ? trimmed.slice(separator + 1).trim() : trimmed;
  return endpoint || null;
}

async function fetchPeerCandidates(baseUrl: string, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/peers`, {
      cache: 'no-store',
      headers: toriiJsonHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

interface ToriiCandidateProbe {
  candidate: string;
  latestHeight: number | null;
  latestCreatedAtMs: number | null;
}

function toProbeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCandidateProbeMetadata(payload: unknown): Omit<ToriiCandidateProbe, 'candidate'> {
  if (!payload || typeof payload !== 'object') {
    return { latestHeight: null, latestCreatedAtMs: null };
  }

  const record = payload as Record<string, unknown>;
  const healthHeight = toProbeNumber(record.head_height);
  const healthCreatedAt = record.head_created_at;

  if (healthHeight !== null || healthCreatedAt !== undefined) {
    const latestCreatedAtMs =
      healthCreatedAt instanceof Date
        ? toProbeNumber(healthCreatedAt.getTime())
        : toProbeNumber(new Date(String(healthCreatedAt ?? '')).getTime());
    return {
      latestHeight: healthHeight,
      latestCreatedAtMs,
    };
  }

  const items = record.items;
  if (!Array.isArray(items) || !items.length) return { latestHeight: null, latestCreatedAtMs: null };

  const latest = items[0];
  if (!latest || typeof latest !== 'object') return { latestHeight: null, latestCreatedAtMs: null };

  const latestHeight = toProbeNumber((latest as Record<string, unknown>).height);
  const rawCreatedAt = (latest as Record<string, unknown>).created_at;
  const latestCreatedAtMs =
    rawCreatedAt instanceof Date
      ? toProbeNumber(rawCreatedAt.getTime())
      : toProbeNumber(new Date(String(rawCreatedAt ?? '')).getTime());

  return {
    latestHeight,
    latestCreatedAtMs,
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
      return {
        candidate: baseUrl,
        ...parseCandidateProbeMetadata(parsed),
      };
    } catch {
      return {
        candidate: baseUrl,
        latestHeight: null,
        latestCreatedAtMs: null,
      };
    }
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function resolveFailoverCandidates(currentBase: string): Promise<string[]> {
  const runtime = failoverRuntimeConfig();
  const out: string[] = [];
  const pushCandidate = (raw: string) => {
    for (const candidate of expandCandidateSchemes(raw)) {
      const normalized = normalizeCandidate(candidate);
      if (!normalized) continue;
      if (normalized === currentBase) continue;
      if (out.includes(normalized)) continue;
      out.push(normalized);
    }
  };

  runtime.nodes.forEach(pushCandidate);

  const peerEndpoints = await fetchPeerCandidates(currentBase, runtime.probeTimeoutMs);
  peerEndpoints
    .slice(0, runtime.maxPeerCandidates)
    .map(parsePeerEndpoint)
    .forEach((endpoint) => {
      if (!endpoint) return;
      pushCandidate(endpoint);
    });

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
  toriiBaseUrlState.value = forcedToriiBaseUrl() ?? normalizeToriiBaseUrl(baseUrl, defaultToriiBase) ?? defaultToriiBase;
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

  toriiBaseUrlState.value = forcedToriiBaseUrl() ?? normalizeToriiBaseUrl(baseUrl, defaultToriiBase) ?? defaultToriiBase;
  if (stored && options?.force) {
    safeWriteStorage(STORAGE_KEY, null);
  }
  markToriiHealthy();
  return toriiBaseUrlState.value;
}

export function resetToriiBaseUrl(): string {
  toriiBaseUrlState.value = forcedToriiBaseUrl() ?? defaultToriiBase;
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

export function buildToriiUrl(path: string): string {
  const relative = normalizeToriiApiPath(path);
  return `${getToriiBaseUrl()}${relative}`;
}

export function buildExplorerUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getExplorerApiBase()}${normalized}`;
}

export function buildToriiWsUrl(path: string): string {
  const httpUrl = buildToriiUrl(path);
  try {
    const url = new URL(httpUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return httpUrl.replace(/^http/i, 'ws');
  }
}

type GetResult<T> = { status: SuccessfulFetching; data: T } | { status: 'error'; response: Response };
type ResultWithStatus<T> = { status: SuccessfulFetching; data: T } | ErrorResponse;
export type PermissionAwareResult<T> = ResultWithStatus<T> | { status: 'permission-denied'; error: Error };
export type ToriiCanonicalRequestAuth = Pick<ToriiBrowserCanonicalRequestOptions, 'authAccountId' | 'sign'>;
interface ConflictResult<T> {
  status: 'conflict';
  data: T;
}

const TORII_API_PREFIXES = [
  '/connect/',
  '/contracts/',
  '/events/',
  '/gov/',
  '/kaigi/',
  '/ministry/',
  '/nexus/',
  '/pipeline/',
  '/soracloud/',
  '/sorafs/',
  '/telemetry/',
  '/sumeragi/',
  '/zk/',
];
const ZK_PROVER_REPORTS_ENABLED = String(import.meta.env.VITE_ZK_PROVER_REPORTS_ENABLED ?? '').toLowerCase() === 'true';

function operatorSurfaceUnavailable<T>(message: string): ResultWithStatus<T> {
  return {
    status: UNKNOWN_ERROR,
    error: new Error(message),
  };
}

function normalizeToriiApiPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (/^\/v2\//i.test(normalized)) return normalized.replace(/^\/v2\//i, '/v1/');
  if (/^\/v1\//i.test(normalized)) return normalized;
  return `/v1${normalized}`;
}

export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (/^\/v[12]\//i.test(normalizedPath)) {
    return buildToriiUrl(normalizedPath);
  }
  const useTorii = TORII_API_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
  if (useTorii) {
    return buildToriiUrl(normalizedPath);
  }
  return `${getExplorerApiBase()}${normalizedPath}`;
}

async function fetchWithTimeoutRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  return await fetchToriiWithDeadline(input, init, requestRuntimeConfig());
}

async function get<T>(path: string, params?: Record<string, any>): Promise<GetResult<T>> {
  const url = new URL(resolveApiUrl(path), defaultOrigin || undefined);

  appendSearchParams(url, params);

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
    data: await res.json(),
  };
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

async function post(path: string, body: unknown): Promise<Response> {
  const url = new URL(resolveApiUrl(path), defaultOrigin || undefined);

  try {
    const response = await fetchWithTimeoutRetry(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...toriiJsonHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok && FAILOVER_STATUSES.has(response.status)) {
      trackToriiFailure(`HTTP ${response.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    } else if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
      markToriiHealthy();
    }

    return response;
  } catch (error) {
    trackToriiFailure(error instanceof Error ? error.message : String(error));
    maybeTriggerToriiFailoverOnFailure('network_error');
    throw error;
  }
}

async function postBinary(path: string, body: BodyInit, headers: Record<string, string>): Promise<Response> {
  const url = new URL(resolveApiUrl(path), defaultOrigin || undefined);

  try {
    const response = await fetchWithTimeoutRetry(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...toriiRequiredHeaders(),
        ...headers,
      },
      body,
    });

    if (!response.ok && FAILOVER_STATUSES.has(response.status)) {
      trackToriiFailure(`HTTP ${response.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    } else if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
      markToriiHealthy();
    }

    return response;
  } catch (error) {
    trackToriiFailure(error instanceof Error ? error.message : String(error));
    maybeTriggerToriiFailoverOnFailure('network_error');
    throw error;
  }
}

async function parseTypedResponse<T>(
  response: Response,
  schema: ZodType<T>
): Promise<{ data: T | null; text: string }> {
  const text = await response.text();
  if (!text) return { data: null, text };

  try {
    return {
      data: schema.parse(JSON.parse(text)),
      text,
    };
  } catch {
    return { data: null, text };
  }
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
    const requestSignal = init?.signal === undefined && typeof Request !== 'undefined' && input instanceof Request
      ? input.signal : init?.signal;
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
  return new ToriiBrowserClient(getToriiBaseUrl(), {
    fetchImpl,
    defaultHeaders: toriiRequiredHeaders(),
    ...(networkId ? { networkId: NetworkId.parse(networkId) } : {}),
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
    client.explorerAccounts.list(collectionQuery(params, { domain: params?.domain, with_asset: params?.with_asset?.toString() }))
  );
}

export async function fetchAccount(id: string): Promise<ResultWithStatus<Account>> {
  const normalizedId = normalizeAccountSelectorForApi(id);
  return await parseToriiSdkResult((client) => client.getExplorerAccount(normalizedId), Account);
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
    (client) => client.accountHistory(normalizeAccountSelectorForApi(id)).list(collectionQuery(params, { asset_id: params.asset_id })),
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

export async function fetchAssets(params?: AssetSearchParams): Promise<ResultWithStatus<CollectionPage<ExplorerAsset>>> {
  return await fetchCollectionPage(params, ExplorerAsset, (client) =>
    client.explorerAssets.list(collectionQuery(params, { account_id: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined, definition_id: params?.definition?.toString(), id: params?.asset_id === undefined ? undefined : normalizeAssetIdForApi(params.asset_id) }))
  );
}

export async function fetchAsset(id: AssetId): Promise<ResultWithStatus<ExplorerAsset>> {
  const normalizedId = normalizeAssetIdForApi(id.toString());
  const response = await get<unknown>(`/v1/explorer/assets/${encodeURIComponent(normalizedId)}`);
  if (response.status !== SUCCESSFUL_FETCHING) {
    return await transformErrorResponse(response.response);
  }
  return { status: SUCCESSFUL_FETCHING, data: ExplorerAsset.parse(response.data) };
}

export async function fetchAssetDefinitions(params?: AssetDefinitionSearchParams): Promise<ResultWithStatus<CollectionPage<ExplorerAssetDefinition>>> {
  return await fetchCollectionPage(params, ExplorerAssetDefinition, (client) =>
    client.explorerAssetDefinitions.list(collectionQuery(params, { owning_domain: params?.domain, owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined }))
  );
}

export async function fetchAssetDefinition(id: AssetDefinitionId): Promise<ResultWithStatus<AssetDefinition>> {
  return await parseToriiSdkResult((client) => client.getAssetDefinition(id.toString()), AssetDefinition);
}

export async function fetchAssetDefinitionEconometrics(
  id: AssetDefinitionId
): Promise<ResultWithStatus<AssetDefinitionEconometrics>> {
  return await parseToriiSdkResult(
    (client) => client.getExplorerAssetDefinitionEconometrics(id.toString()),
    AssetDefinitionEconometrics
  );
}

export async function fetchAssetDefinitionSnapshot(
  id: AssetDefinitionId
): Promise<ResultWithStatus<AssetDefinitionSnapshot>> {
  return await parseToriiSdkResult(
    (client) => client.getExplorerAssetDefinitionSnapshot(id.toString()),
    AssetDefinitionSnapshot
  );
}

export async function fetchNFTs(params?: NFTsSearchParams): Promise<ResultWithStatus<CollectionPage<NFT>>> {
  return await fetchCollectionPage(params, NFT, (client) =>
    client.explorerNfts.list(collectionQuery(params, { domain: params?.domain, owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined }))
  );
}

export async function fetchNFTById(id: NftId): Promise<ResultWithStatus<NFT>> {
  return await parseToriiSdkResult((client) => client.getExplorerNft(id.toString()), NFT);
}

export async function fetchRwas(params?: RWASearchParams): Promise<ResultWithStatus<CollectionPage<RWA>>> {
  return await fetchCollectionPage(params, RWA, (client) =>
    client.explorerRwas.list(collectionQuery(params, { domain: params?.domain, owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined }))
  );
}

export async function fetchRwaById(id: string): Promise<ResultWithStatus<RWA>> {
  return await parseToriiSdkResult((client) => client.getExplorerRwa(id), RWA);
}

export async function fetchDomains(params?: DomainSearchParams): Promise<ResultWithStatus<CollectionPage<Domain>>> {
  return await fetchCollectionPage(params, Domain, (client) =>
    client.explorerDomains.list(collectionQuery(params, { owned_by: normalizeAccountSelectorForApi(params?.owned_by) ?? undefined }))
  );
}

export async function fetchDomain(id: string): Promise<ResultWithStatus<Domain>> {
  return await parseToriiSdkResult((client) => client.getExplorerDomain(id), Domain);
}

export async function fetchBlocks(params?: CursorPaginationParams): Promise<ResultWithStatus<CollectionPage<Block>>> {
  return await fetchCollectionPage(params, Block, (client) =>
    client.explorerBlocks.list(collectionQuery(params))
  );
}

export async function fetchBlock(heightOrHash: number | string): Promise<ResultWithStatus<Block>> {
  return await parseToriiSdkResult((client) => client.getExplorerBlock(heightOrHash), Block);
}

export interface TransactionBlockEvidence {
  proof: ToriiBlockProofs;
  /**
   * Browser builds intentionally do not self-anchor a proof response. The
   * authenticated native verifier is unavailable in the browser, so callers
   * must treat Merkle/finality verification as
   * unavailable rather than copying proof fields into a trusted anchor.
   */
  pathVerification: ToriiBlockProofVerification | null;
}

export async function fetchLedgerBlockProof(
  blockHeight: number,
  transactionHash: string
): Promise<ResultWithStatus<TransactionBlockEvidence>> {
  try {
    const proof = await toriiSdkClient().getLedgerBlockProof(blockHeight, transactionHash);
    return {
      status: SUCCESSFUL_FETCHING,
      data: {
        proof,
        pathVerification: null,
      },
    };
  } catch (error) {
    if (error instanceof ToriiHttpError) {
      if (error.status === 404) return { status: NOT_FOUND };
      // This binary proof route can return a Norito error body. Keep HTTP and
      // rejection metadata without rendering undecoded bytes as message text.
      return {
        status: UNKNOWN_ERROR,
        error: new ToriiHttpError({
          status: error.status,
          expected: error.expected,
          code: error.code,
          rejectCode: error.rejectCode,
          errorMessage: error.status === 401
            ? 'Block evidence requires authenticated access.'
            : error.status === 403
              ? 'Torii denied access to block evidence.'
              : 'Block evidence request failed.',
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

export async function fetchNetworkMetrics(): Promise<ResultWithStatus<NetworkMetrics>> {
  return await parseToriiSdkResult((client) => client.getExplorerMetrics(), NetworkMetrics);
}

export async function fetchExplorerHealth(): Promise<ResultWithStatus<ExplorerHealth>> {
  return await parseToriiSdkResult((client) => client.getExplorerHealth(), ExplorerHealth);
}

export async function fetchToriiMetricsText(): Promise<ResultWithStatus<string>> {
  const url = new URL(`${getToriiBaseUrl()}/metrics`, defaultOrigin || undefined);
  let res: Response;
  try {
    res = await fetchWithTimeoutRetry(url, {
      cache: 'no-store',
      headers: toriiTextHeaders(),
    });
  } catch (error) {
    trackToriiFailure(error instanceof Error ? error.message : String(error));
    maybeTriggerToriiFailoverOnFailure('network_error');
    throw error;
  }

  if (!res.ok) {
    if (FAILOVER_STATUSES.has(res.status)) {
      trackToriiFailure(`HTTP ${res.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    }
    return await transformErrorResponse(res);
  }

  if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
    markToriiHealthy();
  }

  return {
    status: SUCCESSFUL_FETCHING,
    data: await res.text(),
  };
}

export function streamTelemetryMetrics() {
  const telemetryLiveUrl = computed(() => buildToriiUrl('/telemetry/live'));
  const { data: streamedMetrics, status } = useEventSource(telemetryLiveUrl, [], {
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
  };
}

export async function fetchSumeragiStatus(): Promise<ResultWithStatus<SumeragiStatus>> {
  return operatorSurfaceUnavailable(
    'Authoritative Sumeragi status requires an operator-signed Torii client and is unavailable in the public Explorer.'
  );
}

export function streamSumeragiStatus() {
  return {
    data: computed(() => null),
    status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED'),
  };
}

export async function fetchSumeragiTelemetry(): Promise<ResultWithStatus<SumeragiTelemetry>> {
  return operatorSurfaceUnavailable(
    'Aggregate Sumeragi telemetry was removed from Torii; the authoritative replacement requires an operator-signed client and is unavailable in the public Explorer.'
  );
}

export async function fetchPeersInfo(): Promise<ResultWithStatus<PeerInfo[]>> {
  const res = await get('/telemetry/peers-info');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: PeerInfo.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchOnlinePeers(): Promise<ResultWithStatus<OnlinePeers>> {
  const url = new URL(`${getToriiBaseUrl()}/peers`, defaultOrigin || undefined);
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
  if (!res.ok) {
    if (FAILOVER_STATUSES.has(res.status)) {
      trackToriiFailure(`HTTP ${res.status}`);
      maybeTriggerToriiFailoverOnFailure('http_failure');
    }
    return await transformErrorResponse(res);
  }

  if (toriiAvailabilityState.value !== 'healthy' || toriiFailureCountState.value > 0) {
    markToriiHealthy();
  }

  return {
    status: SUCCESSFUL_FETCHING,
    data: OnlinePeers.parse(await res.json()),
  };
}

export async function fetchTelemetryPropagation(): Promise<ResultWithStatus<PeerPropagation[]>> {
  const res = await get('/telemetry/propagation');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: PeerPropagation.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchTransactions(params?: TransactionSearchParams): Promise<ResultWithStatus<CollectionPage<Transaction>>> {
  return await fetchCollectionPage(params, Transaction, (client) =>
    client.explorerTransactions.list(collectionQuery(params, { authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined, block: params?.block, status: params?.status, asset_id: params?.asset_id?.toString() }))
  );
}

export async function fetchLatestTransactions(params?: TransactionSearchParams): Promise<ResultWithStatus<CollectionPage<Transaction>>> {
  return await fetchCollectionPage(params, Transaction, (client) =>
    client.explorerLatestTransactions.list(collectionQuery(params, { authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined, block: params?.block, status: params?.status, asset_id: params?.asset_id?.toString() }))
  );
}

export async function fetchTransaction(hash: string): Promise<ResultWithStatus<DetailedTransaction>> {
  return await parseToriiSdkResult((client) => client.getExplorerTransaction(hash), DetailedTransaction);
}

export async function fetchInstructions(params?: InstructionsSearchParams): Promise<ResultWithStatus<CollectionPage<Instruction>>> {
  return await fetchCollectionPage(params, Instruction, (client) =>
    client.explorerInstructions.list(collectionQuery(params, { account: normalizeAccountSelectorForApi(params?.account) ?? undefined, authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined, kind: params?.kind, transaction_hash: params?.transaction_hash, transaction_status: params?.transaction_status, block: params?.block, asset_id: params?.asset_id?.toString() }))
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
  contract_alias?: string;
  module?: string;
  event_kind?: string;
  participant?: string;
  asset_id?: string;
  provenance?: 'emitted' | 'derived';
  since_timestamp_ms?: number;
  until_timestamp_ms?: number;
  result_ok?: boolean;
}

export interface ContractEventSearchParams extends CursorPaginationParams, ContractEventFilters {}

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

function contractCollectionQuery(params: CursorPaginationParams & ContractActivityFilters & Partial<ContractEventFilters>): ListQueryInput {
  const query = collectionQuery(params, {
    authority: params.authority, contract_address: params.contract_address,
    contract_alias: params.contract_alias, contract_entrypoint: params.contract_entrypoint,
    module: params.module, event_kind: params.event_kind, participants: params.participant,
    asset_ids: params.asset_id, provenance: params.provenance, result_ok: params.result_ok,
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

export async function fetchContractActivity(params: ContractActivitySearchParams): Promise<ResultWithStatus<ContractActivityResponse>> {
  return await parseToriiSdkResult((client) => client.contractActivity.list(contractCollectionQuery(params)), ContractActivityResponse);
}

export async function fetchContractEvents(params: ContractEventSearchParams): Promise<ResultWithStatus<ContractEventResponse>> {
  return await parseToriiSdkResult((client) => client.contractEvents.list(contractCollectionQuery(params)), ContractEventResponse);
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

export async function fetchLatestInstructions(params?: InstructionsSearchParams): Promise<ResultWithStatus<CollectionPage<Instruction>>> {
  return await fetchCollectionPage(params, Instruction, (client) =>
    client.explorerLatestInstructions.list(collectionQuery(params, { account: normalizeAccountSelectorForApi(params?.account) ?? undefined, authority: normalizeAccountSelectorForApi(params?.authority) ?? undefined, kind: params?.kind, transaction_hash: params?.transaction_hash, transaction_status: params?.transaction_status, block: params?.block, asset_id: params?.asset_id?.toString() }))
  );
}

export async function fetchInstructionDetail(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<Instruction>> {
  return await parseToriiSdkResult((client) => client.getExplorerInstruction(transactionHash, index), Instruction);
}

export async function fetchInstructionContractView(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<ContractCodeView>> {
  return await parseToriiSdkResult(
    (client) => client.getExplorerInstructionContractView(transactionHash, index),
    ContractCodeView
  );
}

export async function fetchContractCodeView(codeHash: string): Promise<ResultWithStatus<ContractCodeView>> {
  const res = await get<ContractCodeView>(`/contracts/code/${codeHash}/contract-view`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: ContractCodeView.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchVerifiedContractSourceJob(
  codeHash: string,
  jobId: string
): Promise<ResultWithStatus<ContractVerifiedSourceJobResponse>> {
  const res = await get<ContractVerifiedSourceJobResponse>(`/contracts/code/${codeHash}/verified-source-jobs/${jobId}`);
  if (res.status === SUCCESSFUL_FETCHING) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: ContractVerifiedSourceJobResponse.parse(res.data),
    };
  }

  return await transformErrorResponse(res.response);
}

export type SubmitVerifiedContractSourceResult =
  | { ok: true; statusCode: number; data: ContractVerifiedSourceJobResponse }
  | { ok: false; statusCode: number; data: ContractVerifiedSourceJobResponse | null; error: Error | null };

export async function submitVerifiedContractSource(
  codeHash: string,
  payload: SubmitVerifiedContractSource
): Promise<SubmitVerifiedContractSourceResult> {
  const response = await post(`/contracts/code/${codeHash}/verified-source/jobs`, payload);
  const { data, text } = await parseTypedResponse(response, ContractVerifiedSourceJobResponse);

  if (data) {
    if (response.ok) {
      return {
        ok: true,
        statusCode: response.status,
        data,
      };
    }

    return {
      ok: false,
      statusCode: response.status,
      data,
      error: null,
    };
  }

  return {
    ok: false,
    statusCode: response.status,
    data: null,
    error: new Error(text || `Request failed with status ${response.status}`),
  };
}

export async function fetchNexusDataspacesAccountSummary(
  literal: string
): Promise<ResultWithStatus<NexusDataspacesAccountSummary>> {
  const trimmed = normalizeToriiAccountSelectorLiteral(literal) ?? literal.trim();
  const res = await get<NexusDataspacesAccountSummary>(
    `/nexus/dataspaces/accounts/${encodeURIComponent(trimmed)}/summary`
  );
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: NexusDataspacesAccountSummary.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchNexusPublicStatus(): Promise<ResultWithStatus<NexusPublicStatus>> {
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

    return { status: SUCCESSFUL_FETCHING, data: NexusPublicStatus.parse(await res.json()) };
  }

  if (FAILOVER_STATUSES.has(res.status)) {
    trackToriiFailure(`HTTP ${res.status}`);
    maybeTriggerToriiFailoverOnFailure('http_failure');
  }
  return await transformErrorResponse(res);
}

export async function fetchKaigiRelays(): Promise<ResultWithStatus<KaigiRelaySummaryList>> {
  return operatorSurfaceUnavailable(
    'Kaigi relay inventory requires an operator-signed Torii client and is unavailable in the public Explorer.'
  );
}

export async function fetchKaigiRelayDetail(_relayId: string): Promise<ResultWithStatus<KaigiRelayDetail>> {
  return operatorSurfaceUnavailable(
    'Kaigi relay detail requires an operator-signed Torii client and is unavailable in the public Explorer.'
  );
}

export async function fetchKaigiRelayHealthSnapshot(): Promise<ResultWithStatus<KaigiRelayHealthSnapshot>> {
  return operatorSurfaceUnavailable(
    'Kaigi relay health requires an operator-signed Torii client and is unavailable in the public Explorer.'
  );
}

export async function fetchSorafsPinRegistry(
  params: SorafsPinRegistrySearchParams
): Promise<ResultWithStatus<SorafsPinRegistryResponse>> {
  const res = await get<SorafsPinRegistryResponse>('/sorafs/pin', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SorafsPinRegistryResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchSorafsAliases(
  params: SorafsAliasSearchParams
): Promise<ResultWithStatus<SorafsAliasResponse>> {
  const res = await get<SorafsAliasResponse>('/sorafs/aliases', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SorafsAliasResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchSorafsReplicationOrders(
  params: SorafsReplicationSearchParams
): Promise<ResultWithStatus<SorafsReplicationResponse>> {
  const res = await get<SorafsReplicationResponse>('/sorafs/replication', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SorafsReplicationResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchSorafsStorageManifest(
  manifestIdHex: string
): Promise<ResultWithStatus<SorafsStorageManifestResponse>> {
  const res = await get<SorafsStorageManifestResponse>(`/sorafs/storage/manifest/${manifestIdHex}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SorafsStorageManifestResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchSorafsCidLookup(cid: string): Promise<ResultWithStatus<SorafsCidLookupResponse>> {
  const res = await get<SorafsCidLookupResponse>(`/sorafs/cid/${cid}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SorafsCidLookupResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function draftMinistryAgendaProposal(
  input: MinistryAgendaProposalDraftRequest
): Promise<ResultWithStatus<MinistryAgendaProposalDraftResponse> | ConflictResult<MinistryAgendaProposalGetResponse>> {
  const response = await post('/ministry/agenda/proposals/draft', MinistryAgendaProposalDraftRequest.parse(input));

  if (response.status === 409) {
    const { data, text } = await parseTypedResponse(response, MinistryAgendaProposalGetResponse);
    if (data) {
      return {
        status: 'conflict',
        data,
      };
    }

    return {
      status: UNKNOWN_ERROR,
      error: new Error(text || 'ministry agenda proposal duplicate response missing JSON body'),
    };
  }

  if (!response.ok) {
    return await transformErrorResponse(response);
  }

  const { data, text } = await parseTypedResponse(response, MinistryAgendaProposalDraftResponse);
  if (data) {
    return {
      status: SUCCESSFUL_FETCHING,
      data,
    };
  }

  return {
    status: UNKNOWN_ERROR,
    error: new Error(text || 'ministry agenda proposal draft response missing JSON body'),
  };
}

export async function getMinistryAgendaProposal(
  proposalId: string
): Promise<ResultWithStatus<MinistryAgendaProposalGetResponse>> {
  const normalizedProposalId = proposalId.trim();
  if (!normalizedProposalId) {
    return {
      status: UNKNOWN_ERROR,
      error: new Error('proposalId must not be empty'),
    };
  }

  const response = await get<MinistryAgendaProposalGetResponse>(
    `/ministry/agenda/proposals/${encodeURIComponent(normalizedProposalId)}`
  );

  if (response.status === SUCCESSFUL_FETCHING) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: MinistryAgendaProposalGetResponse.parse(response.data),
    };
  }

  if (response.response.status === 404) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: {
        found: false,
        record: null,
      },
    };
  }

  return await transformErrorResponse(response.response);
}

export async function submitSignedTransaction(
  signedTransaction: Uint8Array
): Promise<ResultWithStatus<TransactionSubmissionReceiptResponse>> {
  const response = await postBinary('/pipeline/transactions', signedTransaction as unknown as BodyInit, {
    Accept: 'application/json',
    'Content-Type': 'application/x-norito',
  });

  if (!response.ok) {
    return await transformErrorResponse(response);
  }

  const { data, text } = await parseTypedResponse(response, TransactionSubmissionReceiptResponse);
  if (data) {
    return {
      status: SUCCESSFUL_FETCHING,
      data,
    };
  }

  return {
    status: UNKNOWN_ERROR,
    error: new Error(text || 'transaction submission receipt missing JSON body'),
  };
}

export async function fetchPipelineTransactionStatus(
  hashHex: string,
  scope: 'local' | 'auto' | 'global' = 'auto'
): Promise<ResultWithStatus<PipelineTransactionStatusResponse | null>> {
  const response = await get<PipelineTransactionStatusResponse>('/pipeline/transactions/status', {
    hash: hashHex,
    scope,
  });

  if (response.status === SUCCESSFUL_FETCHING) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: PipelineTransactionStatusResponse.parse(response.data),
    };
  }

  if (response.response.status === 404) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: null,
    };
  }

  return await transformErrorResponse(response.response);
}

export async function fetchSoracloudStatus(): Promise<ResultWithStatus<SoracloudStatus>> {
  const res = await get<SoracloudStatus>('/soracloud/status');
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: SoracloudStatus.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudServiceConfigStatus(
  params: SoracloudServiceConfigStatusQuery
): Promise<ResultWithStatus<SoracloudServiceConfigStatusResponse>> {
  const res = await get<SoracloudServiceConfigStatusResponse>('/soracloud/service/config/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudServiceConfigStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudServiceSecretStatus(
  params: SoracloudServiceSecretStatusQuery
): Promise<ResultWithStatus<SoracloudServiceSecretStatusResponse>> {
  const res = await get<SoracloudServiceSecretStatusResponse>('/soracloud/service/secret/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudServiceSecretStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudTrainingJobStatus(
  params: SoracloudTrainingJobStatusQuery
): Promise<ResultWithStatus<SoracloudTrainingJobStatusResponse>> {
  const res = await get<SoracloudTrainingJobStatusResponse>('/soracloud/training/job/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudTrainingJobStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudModelWeightStatus(
  params: SoracloudModelWeightStatusQuery
): Promise<ResultWithStatus<SoracloudModelWeightStatusResponse>> {
  const res = await get<SoracloudModelWeightStatusResponse>('/soracloud/model/weight/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudModelWeightStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudModelArtifactStatus(
  params: SoracloudModelArtifactStatusQuery
): Promise<ResultWithStatus<SoracloudModelArtifactStatusResponse>> {
  const res = await get<SoracloudModelArtifactStatusResponse>('/soracloud/model/artifact/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudModelArtifactStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudUploadedModelStatus(
  params: SoracloudUploadedModelStatusQuery
): Promise<ResultWithStatus<SoracloudUploadedModelStatusResponse>> {
  const res = await get<SoracloudUploadedModelStatusResponse>('/soracloud/model/upload/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudUploadedModelStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudPrivateCompileStatus(
  params: SoracloudUploadedModelStatusQuery
): Promise<ResultWithStatus<SoracloudUploadedModelStatusResponse>> {
  const res = await get<SoracloudUploadedModelStatusResponse>('/soracloud/model/compile/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudUploadedModelStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudPrivateInferenceStatus(
  params: SoracloudPrivateInferenceStatusQuery
): Promise<ResultWithStatus<SoracloudPrivateInferenceStatusResponse>> {
  const res = await get<SoracloudPrivateInferenceStatusResponse>('/soracloud/model/run-status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudPrivateInferenceStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudHfSharedLeaseStatus(
  params: SoracloudHfSharedLeaseStatusQuery
): Promise<ResultWithStatus<SoracloudHfSharedLeaseStatusResponse>> {
  const res = await get<SoracloudHfSharedLeaseStatusResponse>('/soracloud/hf/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudHfSharedLeaseStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudModelHostStatus(
  params: SoracloudModelHostStatusQuery = {}
): Promise<ResultWithStatus<SoracloudModelHostStatusResponse>> {
  const res = await get<SoracloudModelHostStatusResponse>('/soracloud/model-host/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudModelHostStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudAgentStatus(
  params: SoracloudAgentStatusQuery = {}
): Promise<ResultWithStatus<SoracloudAgentStatusResponse>> {
  const res = await get<SoracloudAgentStatusResponse>('/soracloud/agent/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudAgentStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudAgentMailboxStatus(
  params: SoracloudAgentMailboxStatusQuery
): Promise<ResultWithStatus<SoracloudAgentMailboxStatusResponse>> {
  const res = await get<SoracloudAgentMailboxStatusResponse>('/soracloud/agent/mailbox/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudAgentMailboxStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchSoracloudAgentAutonomyStatus(
  params: SoracloudAgentAutonomyStatusQuery
): Promise<ResultWithStatus<SoracloudAgentAutonomyStatusResponse>> {
  const res = await get<SoracloudAgentAutonomyStatusResponse>('/soracloud/agent/autonomy/status', params);
  if (res.status === SUCCESSFUL_FETCHING) {
    return { status: SUCCESSFUL_FETCHING, data: SoracloudAgentAutonomyStatusResponse.parse(res.data) };
  }

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceCouncil(): Promise<ResultWithStatus<GovernanceCouncil>> {
  const res = await get<GovernanceCouncil>('/gov/council/current');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceCouncil.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceUnlockStats(): Promise<ResultWithStatus<GovernanceUnlockStats>> {
  const res = await get<GovernanceUnlockStats>('/gov/unlocks/stats');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceUnlockStats.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceReferendum(id: string): Promise<ResultWithStatus<GovernanceReferendumResponse>> {
  const res = await get<GovernanceReferendumResponse>(`/gov/referenda/${encodeURIComponent(id)}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceReferendumResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceLocks(id: string): Promise<ResultWithStatus<GovernanceLocksResponse>> {
  const res = await get<GovernanceLocksResponse>(`/gov/locks/${encodeURIComponent(id)}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceLocksResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceTally(id: string): Promise<ResultWithStatus<GovernanceTallyResponse>> {
  const res = await get<GovernanceTallyResponse>(`/gov/tally/${encodeURIComponent(id)}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceTallyResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchGovernanceProposal(id: string): Promise<ResultWithStatus<GovernanceProposalResponse>> {
  const res = await get<GovernanceProposalResponse>(`/gov/proposals/${encodeURIComponent(id)}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: GovernanceProposalResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchZkAttachments(params: ZkAttachmentSearchParams): Promise<ResultWithStatus<ZkAttachment[]>> {
  const res = await get<ZkAttachment[]>('/zk/attachments', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: ZkAttachment.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchZkAttachmentCount(
  params: Omit<ZkAttachmentSearchParams, 'limit' | 'offset' | 'order'>
): Promise<ResultWithStatus<CountResponse>> {
  const res = await get<CountResponse>('/zk/attachments/count', params);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: CountResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchZkProverReports(
  params: ZkProverReportSearchParams
): Promise<ResultWithStatus<ZkProverReport[]>> {
  if (!ZK_PROVER_REPORTS_ENABLED) {
    return { status: SUCCESSFUL_FETCHING, data: [] };
  }

  const query: Record<string, any> = {
    limit: params.limit,
    offset: params.offset,
    content_type: params.content_type,
    has_tag: params.has_tag,
    since_ms: params.since_ms,
    before_ms: params.before_ms,
    order: params.order,
  };
  if (params.status === 'ok') query.ok_only = true;
  if (params.status === 'failed') query.failed_only = true;

  const res = await get<ZkProverReport[]>('/zk/prover/reports', query);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: ZkProverReport.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchZkProverReportCount(
  params: Omit<ZkProverReportSearchParams, 'limit' | 'offset' | 'order'>
): Promise<ResultWithStatus<CountResponse>> {
  if (!ZK_PROVER_REPORTS_ENABLED) {
    return { status: SUCCESSFUL_FETCHING, data: { count: 0 } };
  }

  const query: Record<string, any> = {
    content_type: params.content_type,
    has_tag: params.has_tag,
    since_ms: params.since_ms,
    before_ms: params.before_ms,
  };
  if (params.status === 'ok') query.ok_only = true;
  if (params.status === 'failed') query.failed_only = true;

  const res = await get<CountResponse>('/zk/prover/reports/count', query);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: CountResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}
