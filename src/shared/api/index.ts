import { appendSearchParams } from './query';
import type {
  PaginationParams,
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
  SubmitVerifiedContractSource} from '@/shared/api/schemas';
import {
  Account,
  Paginated,
  Asset,
  AssetDefinition,
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
  LatestTransactionsResponse,
  LatestInstructionsResponse,
  PeerMetrics,
  SumeragiStatus,
  SumeragiTelemetry,
  RWA,
  KaigiRelaySummaryList,
  KaigiRelayDetail,
  KaigiRelayHealthSnapshot,
  SorafsPinRegistryResponse,
  SorafsAliasResponse,
  SorafsReplicationResponse,
  SorafsStorageManifestResponse,
  SorafsCidLookupResponse,
  ConnectStatusResponse,
  ConnectSessionResponse,
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
  ContractDeployResponse,
  ContractCodeView,
  ContractVerifiedSourceJobResponse,
  SubmitContractDeployRequest
} from '@/shared/api/schemas';
import { useEventSource } from '@vueuse/core';
import { computed, readonly, ref } from 'vue';
import { z, type ZodType } from 'zod/v4';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { transformErrorResponse } from '@/shared/utils/transform-error-response';
import type { SuccessfulFetching } from '@/shared/api/consts';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { normalizeToriiAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { ToriiBrowserClient, ToriiBrowserHttpError } from '@iroha/iroha-js/torii-browser';
export { appendSearchParams } from './query';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const defaultExplorerBase = (rawApiUrl.length > 0 ? rawApiUrl : `${defaultOrigin}/v1/explorer`).replace(
  /\/+$/,
  ''
);
const EXPLORER_SUFFIX = '/v1/explorer';
const STORAGE_KEY = 'torii_base_url';
const USE_STORED_NODE = !(rawApiUrl.startsWith('/') || rawApiUrl.startsWith('./') || rawApiUrl.startsWith('../'));
const FAILOVER_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_FAILOVER_THRESHOLD = 5;
const DEFAULT_FAILOVER_WINDOW_MS = 60_000;
const DEFAULT_FAILOVER_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_FAILOVER_MAX_PEER_CANDIDATES = 16;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_RETRY_COUNT = 1;
const DEFAULT_REQUEST_RETRY_BASE_DELAY_MS = 200;
const FAILOVER_HEALTH_PATH = '/v1/explorer/health';
const I105_ADDRESS_FORMAT = 'i105';
const TORII_API_VERSION = '1.1';
const TORII_API_VERSION_HEADER = 'x-iroha-api-version';

function toriiRequiredHeaders(): Record<string, string> {
  if (getRuntimeConfig().toriiApiVersionHeaderEnabled === false) return {};
  return { [TORII_API_VERSION_HEADER]: TORII_API_VERSION };
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

type ToriiAddressFormatPreference = typeof I105_ADDRESS_FORMAT;

export type ToriiAvailabilityState = 'healthy' | 'degraded' | 'failing_over' | 'outage';

export interface ToriiFailoverSwitch {
  from: string
  to: string
  atMs: number
  trigger: 'http_failure' | 'network_error' | 'manual'
}

export interface ToriiNodePreset {
  label: string
  url: string
}

const DEFAULT_TORII_NODE_PRESETS: ToriiNodePreset[] = [
  { label: 'Nexus (mainnet)', url: 'https://nexus.mof3.sora.org:18080' },
  { label: 'Testus (testnet)', url: 'https://testus.mof3.sora.org:18080' },
];

export function getToriiNodePresets(): ToriiNodePreset[] {
  return DEFAULT_TORII_NODE_PRESETS.map((item) => ({ ...item }));
}

function stripExplorerSuffix(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/v[12]\/explorer$/i, '').replace(/\/v[12]$/i, '');
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

const defaultToriiBase = normalizeToriiBaseUrl(defaultExplorerBase, defaultOrigin || 'http://localhost') ??
  'http://localhost';

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
    setItem?: (key: string, value: string) => void
    removeItem?: (key: string) => void
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

const toriiBaseUrlState = ref((() => {
  if (!USE_STORED_NODE) {
    return defaultToriiBase;
  }
  const stored = safeReadStorage(STORAGE_KEY);
  return stored ? normalizeToriiBaseUrl(stored, defaultToriiBase) ?? defaultToriiBase : defaultToriiBase;
})());
const routeScopedToriiBaseUrlState = ref<string | null>(null);

const toriiAvailabilityState = ref<ToriiAvailabilityState>('healthy');
const toriiFailureCountState = ref(0);
const toriiLastErrorState = ref<string | null>(null);
const toriiLastFailoverSwitchState = ref<ToriiFailoverSwitch | null>(null);
const failoverFailureTimestampsMs: number[] = [];
let failoverInFlight: Promise<boolean> | null = null;

const effectiveToriiBaseUrlState = computed(() => routeScopedToriiBaseUrlState.value ?? toriiBaseUrlState.value);
const explorerApiBaseState = computed(() =>
  effectiveToriiBaseUrlState.value.endsWith(EXPLORER_SUFFIX)
    ? effectiveToriiBaseUrlState.value
    : `${effectiveToriiBaseUrlState.value}${EXPLORER_SUFFIX}`
);

export function getToriiBaseUrl(): string {
  return effectiveToriiBaseUrlState.value;
}

export function getConfiguredToriiBaseUrl(): string {
  return toriiBaseUrlState.value;
}

export function getToriiAddressFormatPreference(_baseUrl: string = getToriiBaseUrl()): ToriiAddressFormatPreference {
  return I105_ADDRESS_FORMAT;
}

export function useToriiAddressFormatPreference() {
  return readonly(computed(() => getToriiAddressFormatPreference(getToriiBaseUrl())));
}

export function setRouteScopedToriiBaseUrl(baseUrl: string | null): string | null {
  if (!baseUrl?.trim()) {
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
    enabled: config.toriiFailoverEnabled !== false,
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
  candidate: string
  latestHeight: number | null
  latestCreatedAtMs: number | null
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
  toriiBaseUrlState.value = normalizeToriiBaseUrl(baseUrl, defaultToriiBase) ?? defaultToriiBase;
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

  toriiBaseUrlState.value = normalizeToriiBaseUrl(baseUrl, defaultToriiBase) ?? defaultToriiBase;
  if (stored && options?.force) {
    safeWriteStorage(STORAGE_KEY, null);
  }
  markToriiHealthy();
  return toriiBaseUrlState.value;
}

export function resetToriiBaseUrl(): string {
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

type GetResult<T> = { status: SuccessfulFetching, data: T } | { status: 'error', response: Response };
type ResultWithStatus<T> = { status: SuccessfulFetching, data: T } | ErrorResponse;
interface ConflictResult<T> { status: 'conflict', data: T }

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
const SUMERAGI_STATUS_STREAM_ENABLED =
  String(import.meta.env.VITE_SUMERAGI_STATUS_STREAM_ENABLED ?? '').toLowerCase() === 'true';
const ZK_PROVER_REPORTS_ENABLED =
  String(import.meta.env.VITE_ZK_PROVER_REPORTS_ENABLED ?? '').toLowerCase() === 'true';

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

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
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

async function fetchWithTimeoutRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const runtime = requestRuntimeConfig();
  const retryCount = Math.max(0, runtime.retryCount);
  let attempt = 0;

  while (true) {
    try {
      const response = await fetchWithTimeout(input, init, runtime.timeoutMs);
      if (attempt < retryCount && shouldRetryResponse(response)) {
        await sleep(retryDelayMs(attempt, runtime.retryBaseDelayMs));
        attempt += 1;
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < retryCount && shouldRetryError(error)) {
        await sleep(retryDelayMs(attempt, runtime.retryBaseDelayMs));
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
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

function normalizeAccountSelectorForApi(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  return normalizeToriiAccountSelectorLiteral(value) ?? value.trim();
}

function normalizeAccountQueryParams(params?: Record<string, any>): Record<string, any> | undefined {
  if (!params) return params;

  return {
    ...params,
    owned_by: normalizeAccountSelectorForApi(params.owned_by),
    authority: normalizeAccountSelectorForApi(params.authority),
    account: normalizeAccountSelectorForApi(params.account),
  };
}

function toLimitOffsetParams(params?: PaginationParams): { limit?: number, offset?: number } {
  if (!params) return {};
  return {
    limit: params.per_page,
    offset: Math.max(0, params.page - 1) * params.per_page,
  };
}

function iterableToPaginated<T>(payload: { items: T[], total: number }, params?: PaginationParams): Paginated<T> {
  const page = params?.page ?? 1;
  const perPage = params?.per_page ?? Math.max(payload.items.length, 1);
  return {
    pagination: {
      page,
      per_page: perPage,
      total_pages: Math.max(1, Math.ceil(payload.total / perPage)),
      total_items: payload.total,
    },
    items: payload.items,
  };
}

const IterablePayload = z.object({
  items: z.unknown().array(),
  total: z.number(),
});

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
): Promise<{ data: T | null, text: string }> {
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
    trackToriiFailure(error instanceof Error ? error.message : String(error));
    maybeTriggerToriiFailoverOnFailure('network_error');
    throw error;
  }
}

function toriiSdkClient(): ToriiBrowserClient {
  return new ToriiBrowserClient(getToriiBaseUrl(), {
    fetchImpl: toriiSdkFetch,
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

export async function fetchAccounts(params?: AccountSearchParams): Promise<ResultWithStatus<Paginated<Account>>> {
  return await parseToriiSdkResult(
    (client) => client.listExplorerAccounts({
      page: params?.page,
      per_page: params?.per_page,
      domain: params?.domain,
      with_asset: params?.with_asset?.toString(),
      address_format: I105_ADDRESS_FORMAT,
    }),
    Paginated(Account)
  );
}

export async function fetchAccount(id: string): Promise<ResultWithStatus<Account>> {
  const normalizedId = normalizeToriiAccountSelectorLiteral(id) ?? id.trim();
  return await parseToriiSdkResult(
    (client) => client.getExplorerAccount(normalizedId, { address_format: I105_ADDRESS_FORMAT }),
    Account
  );
}

export async function fetchAssets(params?: AssetSearchParams): Promise<ResultWithStatus<Paginated<Asset>>> {
  const paginationParams = toLimitOffsetParams(params);
  const definition = params?.definition;

  if (params?.owned_by) {
    const normalizedAccountId = normalizeAccountSelectorForApi(params.owned_by);
    if (typeof normalizedAccountId === 'string' && normalizedAccountId) {
      return await parseToriiSdkResult(
        async (client) => iterableToPaginated(
          IterablePayload.parse(
            await client.listAccountAssets(normalizedAccountId, {
              ...paginationParams,
              asset: definition?.toString(),
            })
          ),
          params
        ),
        Paginated(Asset)
      );
    }
  } else if (definition) {
    const definitionId = definition.toString();
    return await parseToriiSdkResult(
      async (client) => iterableToPaginated(
        IterablePayload.parse(
          await client.listAssetHolders(definitionId, paginationParams)
        ),
        params
      ),
      Paginated(Asset)
    );
  }

  return await parseToriiSdkResult(
    (client) => client.listExplorerAssets(normalizeAccountQueryParams(params)),
    Paginated(Asset)
  );
}

export async function fetchAsset(id: AssetId): Promise<ResultWithStatus<Asset>> {
  return await parseToriiSdkResult((client) => client.getExplorerAsset(id.toString()), Asset);
}

export async function fetchAssetDefinitions(
  params?: AssetDefinitionSearchParams
): Promise<ResultWithStatus<Paginated<AssetDefinition>>> {
  const filtersRequested = !!params?.domain || !!params?.owned_by;
  if (filtersRequested) {
    return await parseToriiSdkResult(
      (client) => client.listExplorerAssetDefinitions(normalizeAccountQueryParams(params)),
      Paginated(AssetDefinition)
    );
  }

  return await parseToriiSdkResult(
    async (client) => iterableToPaginated(
      IterablePayload.parse(
        await client.listAssetDefinitions(toLimitOffsetParams(params))
      ),
      params
    ),
    Paginated(AssetDefinition)
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

export async function fetchNFTs(params?: NFTsSearchParams): Promise<ResultWithStatus<Paginated<NFT>>> {
  return await parseToriiSdkResult((client) => client.listExplorerNfts(normalizeAccountQueryParams(params)), Paginated(NFT));
}

export async function fetchNFTById(id: NftId): Promise<ResultWithStatus<NFT>> {
  return await parseToriiSdkResult((client) => client.getExplorerNft(id.toString()), NFT);
}

export async function fetchRwas(params?: RWASearchParams): Promise<ResultWithStatus<Paginated<RWA>>> {
  return await parseToriiSdkResult((client) => client.listExplorerRwas(normalizeAccountQueryParams(params)), Paginated(RWA));
}

export async function fetchRwaById(id: string): Promise<ResultWithStatus<RWA>> {
  return await parseToriiSdkResult((client) => client.getExplorerRwa(id), RWA);
}

export async function fetchDomains(params?: DomainSearchParams): Promise<ResultWithStatus<Paginated<Domain>>> {
  return await parseToriiSdkResult((client) => client.listExplorerDomains(normalizeAccountQueryParams(params)), Paginated(Domain));
}

export async function fetchDomain(id: string): Promise<ResultWithStatus<Domain>> {
  return await parseToriiSdkResult((client) => client.getExplorerDomain(id), Domain);
}

export async function fetchBlocks(params?: Partial<PaginationParams>): Promise<ResultWithStatus<Paginated<Block>>> {
  return await parseToriiSdkResult((client) => client.listExplorerBlocks(params), Paginated(Block));
}

export async function fetchBlock(heightOrHash: number | string): Promise<ResultWithStatus<Block>> {
  return await parseToriiSdkResult((client) => client.getExplorerBlock(heightOrHash), Block);
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
  return await parseToriiSdkResult((client) => client.getSumeragiStatus(), SumeragiStatus);
}

export function streamSumeragiStatus() {
  if (!SUMERAGI_STATUS_STREAM_ENABLED) {
    return {
      data: computed(() => null),
      status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED'),
    };
  }

  const statusUrl = computed(() => buildToriiUrl('/sumeragi/status/sse'));
  const { data, status } = useEventSource(statusUrl, [], { autoReconnect: true });
  return {
    data: computed(() => {
      if (!data.value) return null;
      return SumeragiStatus.parse(JSON.parse(data.value));
    }),
    status,
  };
}

export async function fetchSumeragiTelemetry(): Promise<ResultWithStatus<SumeragiTelemetry>> {
  return await parseToriiSdkResult((client) => client.getSumeragiTelemetry(), SumeragiTelemetry);
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

export async function fetchTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<Paginated<Transaction>>> {
  return await parseToriiSdkResult(
    (client) => client.listExplorerTransactions(normalizeAccountQueryParams({
      page: params?.page,
      per_page: params?.per_page,
      authority: params?.authority,
      block: params?.block,
      status: params?.status,
      asset_id: params?.asset_id?.toString(),
      address_format: I105_ADDRESS_FORMAT,
    })),
    Paginated(Transaction)
  );
}

export async function fetchLatestTransactions(
  params?: Omit<TransactionSearchParams, 'page'>
): Promise<ResultWithStatus<LatestTransactionsResponse>> {
  return await parseToriiSdkResult(
    (client) => client.listLatestExplorerTransactions(normalizeAccountQueryParams({
      per_page: params?.per_page,
      authority: params?.authority,
      block: params?.block,
      status: params?.status,
      asset_id: params?.asset_id?.toString(),
      address_format: I105_ADDRESS_FORMAT,
    })),
    LatestTransactionsResponse
  );
}

export async function fetchTransaction(hash: string): Promise<ResultWithStatus<DetailedTransaction>> {
  return await parseToriiSdkResult(
    (client) => client.getExplorerTransaction(hash, { address_format: I105_ADDRESS_FORMAT }),
    DetailedTransaction
  );
}

export async function fetchInstructions(
  params?: InstructionsSearchParams
): Promise<ResultWithStatus<Paginated<Instruction>>> {
  return await parseToriiSdkResult(
    (client) => client.listExplorerInstructions(normalizeAccountQueryParams({
      page: params?.page,
      per_page: params?.per_page,
      account: params?.account,
      authority: params?.authority,
      kind: params?.kind,
      transaction_hash: params?.transaction_hash,
      transaction_status: params?.transaction_status,
      block: params?.block,
      asset_id: params?.asset_id?.toString(),
      address_format: I105_ADDRESS_FORMAT,
    })),
    Paginated(Instruction)
  );
}

export async function fetchLatestInstructions(
  params?: Omit<InstructionsSearchParams, 'page'>
): Promise<ResultWithStatus<LatestInstructionsResponse>> {
  return await parseToriiSdkResult(
    (client) => client.listLatestExplorerInstructions(normalizeAccountQueryParams({
      per_page: params?.per_page,
      account: params?.account,
      authority: params?.authority,
      kind: params?.kind,
      transaction_hash: params?.transaction_hash,
      transaction_status: params?.transaction_status,
      block: params?.block,
      asset_id: params?.asset_id?.toString(),
      address_format: I105_ADDRESS_FORMAT,
    })),
    LatestInstructionsResponse
  );
}

export async function fetchInstructionDetail(
  transactionHash: string,
  index: number
): Promise<ResultWithStatus<Instruction>> {
  return await parseToriiSdkResult(
    (client) => client.getExplorerInstruction(transactionHash, index, { address_format: I105_ADDRESS_FORMAT }),
    Instruction
  );
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
  const res = await get<ContractVerifiedSourceJobResponse>(
    `/contracts/code/${codeHash}/verified-source-jobs/${jobId}`
  );
  if (res.status === SUCCESSFUL_FETCHING) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: ContractVerifiedSourceJobResponse.parse(res.data),
    };
  }

  return await transformErrorResponse(res.response);
}

export type SubmitVerifiedContractSourceResult =
  | { ok: true, statusCode: number, data: ContractVerifiedSourceJobResponse }
  | { ok: false, statusCode: number, data: ContractVerifiedSourceJobResponse | null, error: Error | null };

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

export type SubmitContractDeployResult =
  | { ok: true, statusCode: number, data: ContractDeployResponse }
  | { ok: false, statusCode: number, data: ContractDeployResponse | null, error: Error | null };

export async function submitContractDeployRequest(
  payload: SubmitContractDeployRequest
): Promise<SubmitContractDeployResult> {
  const normalized = SubmitContractDeployRequest.parse(payload);
  try {
    const data = ContractDeployResponse.parse(
      await toriiSdkClient().deployContract(normalized as unknown as Record<string, unknown>)
    );
    return { ok: true, statusCode: 200, data };
  } catch (error) {
    if (!(error instanceof ToriiBrowserHttpError)) throw error;
    const { data, text } = await parseTypedResponse(error.response, ContractDeployResponse);
    return {
      ok: false,
      statusCode: error.status,
      data,
      error: data ? null : new Error(text || error.bodyText || `Request failed with status ${error.status}`),
    };
  }
}

export async function fetchNexusDataspacesAccountSummary(
  literal: string,
  params?: { address_format?: 'i105' }
): Promise<ResultWithStatus<NexusDataspacesAccountSummary>> {
  const trimmed = normalizeToriiAccountSelectorLiteral(literal) ?? literal.trim();
  const res = await get<NexusDataspacesAccountSummary>(
    `/nexus/dataspaces/accounts/${encodeURIComponent(trimmed)}/summary`,
    params
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
  return await parseToriiSdkResult((client) => client.listKaigiRelays(), KaigiRelaySummaryList);
}

export async function fetchKaigiRelayDetail(relayId: string): Promise<ResultWithStatus<KaigiRelayDetail>> {
  return await parseToriiSdkResult((client) => client.getKaigiRelay(relayId), KaigiRelayDetail);
}

export async function fetchKaigiRelayHealthSnapshot(): Promise<ResultWithStatus<KaigiRelayHealthSnapshot>> {
  return await parseToriiSdkResult((client) => client.getKaigiRelaysHealth(), KaigiRelayHealthSnapshot);
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

export async function fetchConnectStatus(): Promise<ResultWithStatus<ConnectStatusResponse | null>> {
  const res = await get<ConnectStatusResponse>('/connect/status');
  if (res.status === SUCCESSFUL_FETCHING) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: ConnectStatusResponse.parse(res.data),
    };
  }

  if (res.response.status === 404) {
    return {
      status: SUCCESSFUL_FETCHING,
      data: null,
    };
  }

  return await transformErrorResponse(res.response);
}

export async function createConnectSession(input: {
  sid: string
  node?: string | null
}): Promise<ResultWithStatus<ConnectSessionResponse>> {
  const payload = {
    sid: input.sid,
    ...(input.node?.trim() ? { node: input.node.trim() } : {}),
  };
  const response = await post('/connect/session', payload);

  if (!response.ok) {
    return await transformErrorResponse(response);
  }

  const { data, text } = await parseTypedResponse(response, ConnectSessionResponse);
  if (data) {
    return {
      status: SUCCESSFUL_FETCHING,
      data,
    };
  }

  return {
    status: UNKNOWN_ERROR,
    error: new Error(text || 'connect session response missing JSON body'),
  };
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
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: SoracloudStatus.parse(res.data) };

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
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: GovernanceCouncil.parse(res.data) };

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

export async function fetchZkAttachments(
  params: ZkAttachmentSearchParams
): Promise<ResultWithStatus<ZkAttachment[]>> {
  const res = await get<ZkAttachment[]>('/zk/attachments', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: ZkAttachment.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchZkAttachmentCount(
  params: Omit<ZkAttachmentSearchParams, 'limit' | 'offset' | 'order'>
): Promise<ResultWithStatus<CountResponse>> {
  const res = await get<CountResponse>('/zk/attachments/count', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: CountResponse.parse(res.data) };

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
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: CountResponse.parse(res.data) };

  return await transformErrorResponse(res.response);
}
