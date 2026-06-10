<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import BigNumber from 'bignumber.js';
import * as http from '@/shared/api';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseInnerBlock from '@/shared/ui/components/BaseInnerBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { getRuntimeConfig } from '@/shared/runtime-config';
import {
  concentrationTopN,
  computeSetChurn,
  effectiveNumberFromEntropy,
  extractAmountFromIsiPayload,
  extractAssetDefinitionIdFromIsiPayload,
  giniCoefficient,
  herfindahlIndex,
  lorenzCurvePoints,
  median,
  nakamotoCoefficient,
  nearestRankQuantile,
  normalizedEntropy,
  safeRatio,
  shannonEntropy,
  sum,
  theilIndexT,
} from '@/shared/lib/econometrics';
import type { Instruction } from '@/shared/api/schemas';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { normalizeAssetDefinitionSelectorLiteral } from '@/shared/lib/asset-definition-literal';
import { parseOptionalFilter } from '@/shared/lib/optional-filter';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

defineOptions({
  name: 'EconometricsPage',
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ISSUANCE_SERIES_DAYS = 30;

const WINDOWS = [
  { key: '1h', ms: HOUR_MS },
  { key: '24h', ms: DAY_MS },
  { key: '7d', ms: 7 * DAY_MS },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];

interface HolderRow {
  account: string
  balance: BigNumber
  share: number | null
}

interface HolderSnapshot {
  computed_at_ms: number
  holders: string[]
  scanned: number
  total: number | null
}

interface HolderChurn {
  previousComputedAt: Date
  deltaMs: number
  previousScanned: number
  currentScanned: number
  retained: number
  entered: number
  exited: number
  retentionPrev: number | null
  retentionCurrent: number | null
}

interface VelocityWindowStats {
  key: WindowKey
  windowMs: number
  start: Date
  end: Date
  days: number
  transfers: number
  uniqueSenders: number
  uniqueReceivers: number
  amount: BigNumber | null
  amountParsed: number
  amountMissing: number
  turnover: number | null
  velocityPerDay: number | null
  transfersPerDay: number | null
  complete: boolean
}

interface IssuanceWindowStats {
  key: WindowKey
  windowMs: number
  start: Date
  end: Date
  mintCount: number
  burnCount: number
  minted: BigNumber | null
  burned: BigNumber | null
  net: BigNumber | null
  mintAmountParsed: number
  mintAmountMissing: number
  burnAmountParsed: number
  burnAmountMissing: number
  complete: boolean
}

interface IssuanceSeriesPoint {
  bucketStartMs: number
  minted: BigNumber
  burned: BigNumber
  net: BigNumber
}

type InstructionScanKind = 'Transfer' | 'Mint' | 'Burn';
type AssetDefinitionSnapshotSuccess = Extract<
  Awaited<ReturnType<typeof http.fetchAssetDefinitionSnapshot>>,
  { status: typeof SUCCESSFUL_FETCHING }
>;
type AssetDefinitionEconometricsSuccess = Extract<
  Awaited<ReturnType<typeof http.fetchAssetDefinitionEconometrics>>,
  { status: typeof SUCCESSFUL_FETCHING }
>;

interface InstructionScanBootstrap {
  firstPage: { items: Instruction[], totalPages: number }
  lastPage: { items: Instruction[], totalPages: number } | null
  totalPages: number
  perPage: number
  initialPage: number
  pageStep: 1 | -1
}

interface InstructionScanProgress {
  scanned: number
  matched: number
  cutoffReached: boolean
  oldestSeenMs: number | null
  lastProcessedMs: number | null
  isMonotonic: boolean
}

interface InstructionScanMeta {
  scanned: number
  matched: number
  endedByPagination: boolean
  cutoffReached: boolean
  oldestSeenMs: number | null
  isMonotonic: boolean
}

const assetDefinitionRowKey = (item: { id: string }) => item.id;
const holderRowKey = (item: { account: string }) => item.account;
const velocityWindowRowKey = (item: { key: WindowKey }) => item.key;
const issuanceWindowRowKey = (item: { key: WindowKey }) => item.key;

interface EconometricsResult {
  assetDefinitionId: string
  assetDefinitionAlias: string | null
  definitionTotalSupply: BigNumber | null
  definitionLockedSupply: BigNumber | null
  definitionCirculatingSupply: BigNumber | null
  velocitySupply: BigNumber
  supplyCoverage: number | null
  holders: HolderRow[]
  holdersTotalSupply: BigNumber
  holdersCount: number
  holdersTotalCount: number | null
  holdersComplete: boolean
  distribution: {
    gini: number
    hhi: number
    effectiveHolders: number | null
    theil: number
    entropy: number
    entropyNormalized: number
    entropyEffectiveHolders: number | null
    nakamoto33: number
    nakamoto51: number
    nakamoto67: number
    top1: number
    top5: number
    top10: number
    median: BigNumber | null
    p90: BigNumber | null
    p99: BigNumber | null
    lorenz: Array<{ population: number, share: number }>
  }
  holderChurn: HolderChurn | null
  velocityWindows: VelocityWindowStats[] | null
  issuanceWindows: IssuanceWindowStats[] | null
  issuanceSeries: IssuanceSeriesPoint[] | null
  computedAt: Date
}

const router = useRouter();
const navigation = useScopedExplorerNavigation();
const { t } = useI18n();

const assetInput = ref('');
const maxHoldersToScan = ref(5000);
const maxTransfersToScan = ref(2000);
const maxIssuanceToScan = ref(2000);

const assetDefinitionsState = reactive({
  page: 1,
  per_page: 50,
});

const assetDefinitionsFilters = reactive({
  domain: '',
  owner: '',
});
const ownerFilterState = computed(() =>
  parseOptionalFilter(assetDefinitionsFilters.owner, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedOwnerFilter = computed<string | undefined>(() => ownerFilterState.value.value);
const ownerFilterError = computed(() => ownerFilterState.value.error);

watch(
  () => [assetDefinitionsState.per_page, assetDefinitionsFilters.domain, parsedOwnerFilter.value] as const,
  () => {
    assetDefinitionsState.page = 1;
  }
);

const assetDefinitionsQuery = computed(() => ({
  page: assetDefinitionsState.page,
  per_page: assetDefinitionsState.per_page,
  domain: assetDefinitionsFilters.domain.trim() || undefined,
  owned_by: parsedOwnerFilter.value,
}));

const assetDefinitionsScope = useParamScope(
  () => ({
    key: JSON.stringify({
      page: assetDefinitionsQuery.value.page,
      per_page: assetDefinitionsQuery.value.per_page,
      domain: assetDefinitionsQuery.value.domain ?? null,
      owned_by: assetDefinitionsQuery.value.owned_by ?? null,
    }),
    payload: assetDefinitionsQuery.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinitions(payload))
);

const isAssetDefinitionsLoading = computed(() => !!assetDefinitionsScope.value?.expose.isLoading);
const totalAssetDefinitions = computed(() =>
  assetDefinitionsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetDefinitionsScope.value.expose.data.data.pagination.total_items
    : 0
);
const assetDefinitions = computed(() =>
  assetDefinitionsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetDefinitionsScope.value.expose.data.data.items : []
);

const assetInputError = computed(() => {
  const trimmed = assetInput.value.trim();
  if (!trimmed) return null;
  return normalizeAssetDefinitionSelectorLiteral(trimmed) ? null : t('econometrics.assetInvalid');
});

const parsedAssetDefinitionId = computed<string | null>(() => {
  const trimmed = assetInput.value.trim();
  if (!trimmed) return null;
  return normalizeAssetDefinitionSelectorLiteral(trimmed);
});

const state = reactive({
  isLoading: false,
  stage: 'idle' as 'idle' | 'holders' | 'activity' | 'transfers' | 'issuance',
  error: null as string | null,
  holdersFetched: 0,
  holdersTotal: null as number | null,
  transfersScanned: 0,
  transfersMatched: 0,
  mintsScanned: 0,
  mintsMatched: 0,
  burnsScanned: 0,
  burnsMatched: 0,
});

const result = ref<EconometricsResult | null>(null);
let runNonce = 0;
// Optional Torii-computed aggregates. When disabled, we fall back to client-side scans.
const supportsSnapshotEndpoint = ref(getRuntimeConfig().toriiEconometricsEndpointsEnabled !== false);
const supportsEconometricsEndpoint = ref(getRuntimeConfig().toriiEconometricsEndpointsEnabled !== false);

const canCompute = computed(() => !!parsedAssetDefinitionId.value && !assetInputError.value);
const isInitialLoading = computed(() => state.isLoading && !result.value);

const topHolders = computed(() => result.value?.holders.slice(0, 10) ?? []);
const selectedAssetDefinitionId = computed(() => result.value?.assetDefinitionId ?? parsedAssetDefinitionId.value ?? null);

function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return t('none');
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatRatio(ratio: number | null, digits = 6): string {
  if (ratio === null || !Number.isFinite(ratio)) return t('none');
  return ratio.toFixed(digits);
}

function formatMaybeBigNumber(value: { toString: () => string } | null): string {
  if (!value) return t('none');
  return value.toString();
}

function formatDate(value: Date | null): string {
  if (!value) return t('none');
  return value.toISOString();
}

function formatWindowLabel(key: WindowKey) {
  switch (key) {
    case '1h':
      return t('econometrics.windows.oneHour');
    case '24h':
      return t('econometrics.windows.day');
    case '7d':
      return t('econometrics.windows.week');
    default:
      return key;
  }
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return t('none');
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0 && parts.length < 2) parts.push(`${minutes % 60}m`);
  return parts.join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function storageKey(assetDefinitionId: string) {
  const node = encodeURIComponent(http.getToriiBaseUrl());
  return `econometrics_snapshot_v2:${node}:${assetDefinitionId}`;
}

function loadSnapshot(assetDefinitionId: string): HolderSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(assetDefinitionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HolderSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.computed_at_ms !== 'number') return null;
    if (!Array.isArray(parsed.holders)) return null;
    if (typeof parsed.scanned !== 'number') return null;
    const total = typeof parsed.total === 'number' ? parsed.total : null;
    return {
      computed_at_ms: parsed.computed_at_ms,
      holders: parsed.holders.filter((value): value is string => typeof value === 'string'),
      scanned: parsed.scanned,
      total,
    };
  } catch {
    return null;
  }
}

function saveSnapshot(assetDefinitionId: string, snapshot: HolderSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(assetDefinitionId), JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

async function fetchAssetHolders(
  definition: string,
  opts: { perPage: number, maxItems: number },
  localNonce: number
) {
  const holders: Array<{ account: string, balance: BigNumber }> = [];
  let page = 1;
  let totalItems: number | null = null;
  let totalPages = 1;

  while (holders.length < opts.maxItems && page <= totalPages) {
    if (localNonce !== runNonce) break;
    const res = await http.fetchAssets({ page, per_page: opts.perPage, definition });
    if (res.status !== SUCCESSFUL_FETCHING) {
      throw new Error(t('econometrics.fetchError'));
    }

    const { items, pagination } = res.data;
    totalItems = pagination.total_items;
    totalPages = pagination.total_pages;
    for (const item of items) {
      holders.push({ account: item.account_id, balance: item.value });
      if (holders.length >= opts.maxItems) break;
    }
    if (localNonce === runNonce) {
      state.holdersFetched = holders.length;
      state.holdersTotal = totalItems;
    }
    page += 1;
  }

  return { holders, totalItems, complete: totalItems !== null ? holders.length >= totalItems : false };
}

function normalizeInstructionTotalPages(totalPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages < 0) return 0;
  return totalPages;
}

async function fetchInstructionPage(kind: InstructionScanKind, page: number, perPage: number) {
  const res = await http.fetchInstructions({ page, per_page: perPage, kind });
  if (res.status !== SUCCESSFUL_FETCHING) throw new Error(t('econometrics.fetchError'));

  return {
    items: res.data.items,
    totalPages: normalizeInstructionTotalPages(res.data.pagination.total_pages),
  };
}

function resolveNewestInstructionPage(
  firstItems: Instruction[],
  lastItems: Instruction[],
  totalPages: number
): { initialPage: number, pageStep: 1 | -1 } {
  if (totalPages <= 1) return { initialPage: 1, pageStep: 1 };

  const page1MaxMs = firstItems.reduce((acc, item) => Math.max(acc, item.created_at.getTime()), Number.NEGATIVE_INFINITY);
  const lastMaxMs = lastItems.reduce((acc, item) => Math.max(acc, item.created_at.getTime()), Number.NEGATIVE_INFINITY);
  return page1MaxMs >= lastMaxMs
    ? { initialPage: 1, pageStep: 1 }
    : { initialPage: totalPages, pageStep: -1 };
}

async function bootstrapInstructionScan(kind: InstructionScanKind, perPage: number): Promise<InstructionScanBootstrap> {
  const firstPage = await fetchInstructionPage(kind, 1, perPage);
  const totalPages = firstPage.totalPages;
  const lastPage = totalPages > 1 ? await fetchInstructionPage(kind, totalPages, perPage) : null;
  const { initialPage, pageStep } = resolveNewestInstructionPage(firstPage.items, lastPage?.items ?? [], totalPages);

  return {
    firstPage,
    lastPage,
    totalPages,
    perPage,
    initialPage,
    pageStep,
  };
}

async function resolveInstructionScanPage(bootstrap: InstructionScanBootstrap, kind: InstructionScanKind, page: number) {
  if (page === 1) return bootstrap.firstPage;
  if (bootstrap.lastPage && page === bootstrap.totalPages) return bootstrap.lastPage;
  return fetchInstructionPage(kind, page, bootstrap.perPage);
}

function createInstructionScanProgress(): InstructionScanProgress {
  return {
    scanned: 0,
    matched: 0,
    cutoffReached: false,
    oldestSeenMs: null,
    lastProcessedMs: null,
    isMonotonic: true,
  };
}

function recordInstructionTimestamp(progress: InstructionScanProgress, createdAt: number, cutoffMs: number): boolean {
  if (progress.isMonotonic && progress.lastProcessedMs !== null && createdAt > progress.lastProcessedMs) {
    progress.isMonotonic = false;
  }
  progress.lastProcessedMs = createdAt;
  if (progress.oldestSeenMs === null || createdAt < progress.oldestSeenMs) {
    progress.oldestSeenMs = createdAt;
  }
  if (progress.isMonotonic && createdAt < cutoffMs) {
    progress.cutoffReached = true;
    return true;
  }
  return false;
}

function sortInstructionsNewestFirst(items: Instruction[]): Instruction[] {
  return items.slice().sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

async function scanInstructionsByKind(args: {
  kind: InstructionScanKind
  perPage: number
  maxItems: number
  cutoffMs: number
  localNonce: number
  onScanned?: (value: number) => void
  onMatched?: (value: number) => void
  matches: (payload: unknown) => boolean
  handleMatch: (payload: unknown, createdAt: number) => void
}): Promise<InstructionScanMeta> {
  const bootstrap = await bootstrapInstructionScan(args.kind, args.perPage);
  const progress = createInstructionScanProgress();
  let page = bootstrap.initialPage;

  while (progress.scanned < args.maxItems && page >= 1 && page <= bootstrap.totalPages) {
    if (args.localNonce !== runNonce) break;
    const currentPage = await resolveInstructionScanPage(bootstrap, args.kind, page);
    const shouldStop = processInstructionScanPage(args, currentPage.items, progress);
    if (shouldStop) break;
    page += bootstrap.pageStep;
  }

  return {
    scanned: progress.scanned,
    matched: progress.matched,
    endedByPagination: page < 1 || page > bootstrap.totalPages,
    cutoffReached: progress.cutoffReached,
    oldestSeenMs: progress.oldestSeenMs,
    isMonotonic: progress.isMonotonic,
  };
}

function processInstructionScanPage(
  args: {
    maxItems: number
    cutoffMs: number
    localNonce: number
    onScanned?: (value: number) => void
    onMatched?: (value: number) => void
    matches: (payload: unknown) => boolean
    handleMatch: (payload: unknown, createdAt: number) => void
  },
  items: Instruction[],
  progress: InstructionScanProgress
): boolean {
  for (const instruction of sortInstructionsNewestFirst(items)) {
    if (args.localNonce !== runNonce) return true;

    progress.scanned += 1;
    args.onScanned?.(progress.scanned);

    const createdAt = instruction.created_at.getTime();
    if (recordInstructionTimestamp(progress, createdAt, args.cutoffMs)) return true;

    const payload = instruction.box.json.payload;
    if (!args.matches(payload)) {
      if (progress.scanned >= args.maxItems) return true;
      continue;
    }

    progress.matched += 1;
    args.onMatched?.(progress.matched);
    args.handleMatch(payload, createdAt);

    if (progress.scanned >= args.maxItems) return true;
  }

  return false;
}

function initVelocityWindows(nowMs: number) {
  const windowsAcc = WINDOWS.map((entry) => ({
    key: entry.key as WindowKey,
    windowMs: entry.ms,
    startMs: nowMs - entry.ms,
    transfers: 0,
    senders: new Set<string>(),
    receivers: new Set<string>(),
    amountSum: new BigNumber(0),
    amountParsed: 0,
    amountMissing: 0,
  }));
  return windowsAcc;
}

function updateVelocityWindows(
  windowsAcc: ReturnType<typeof initVelocityWindows>,
  createdAt: number,
  payload: unknown
) {
  const amount = extractAmountFromIsiPayload(payload);

  for (const win of windowsAcc) {
    if (createdAt < win.startMs) continue;
    win.transfers += 1;

    if (isRecord(payload)) {
      const source = payload.source;
      const destination = payload.destination;
      if (typeof source === 'string' && source.trim()) win.senders.add(source.trim());
      if (typeof destination === 'string' && destination.trim()) win.receivers.add(destination.trim());
    }

    if (amount) {
      win.amountSum = win.amountSum.plus(amount);
      win.amountParsed += 1;
    } else {
      win.amountMissing += 1;
    }
  }
}

function finalizeVelocityWindows(
  windowsAcc: ReturnType<typeof initVelocityWindows>,
  args: {
    meta: InstructionScanMeta
    nowMs: number
    supplyDenom: BigNumber
  }
): VelocityWindowStats[] {
  return windowsAcc.map((win) => {
    const amount = win.amountParsed > 0 ? win.amountSum : null;
    const turnover = amount ? safeRatio(amount, args.supplyDenom) : null;
    const days = win.windowMs / DAY_MS;
    const velocityPerDay = turnover === null ? null : turnover / days;
    const transfersPerDay = win.transfers / days;

    const complete =
      args.meta.endedByPagination ||
      args.meta.cutoffReached ||
      (args.meta.isMonotonic && args.meta.oldestSeenMs !== null && args.meta.oldestSeenMs <= win.startMs);

    return {
      key: win.key,
      windowMs: win.windowMs,
      start: new Date(win.startMs),
      end: new Date(args.nowMs),
      days,
      transfers: win.transfers,
      uniqueSenders: win.senders.size,
      uniqueReceivers: win.receivers.size,
      amount,
      amountParsed: win.amountParsed,
      amountMissing: win.amountMissing,
      turnover,
      velocityPerDay,
      transfersPerDay,
      complete,
    };
  });
}

async function fetchVelocityWindows(args: {
  definitionId: string
  supplyDenom: BigNumber
  nowMs: number
  localNonce: number
}) {
  const windowsAcc = initVelocityWindows(args.nowMs);
  const earliestStartMs = Math.min(...windowsAcc.map((entry) => entry.startMs));
  const meta = await scanInstructionsByKind({
    kind: 'Transfer',
    perPage: 200,
    maxItems: maxTransfersToScan.value,
    cutoffMs: earliestStartMs,
    localNonce: args.localNonce,
    onScanned: (value) => {
      if (args.localNonce === runNonce) state.transfersScanned = value;
    },
    onMatched: (value) => {
      if (args.localNonce === runNonce) state.transfersMatched = value;
    },
    matches: (payload) => extractAssetDefinitionIdFromIsiPayload(payload) === args.definitionId,
    handleMatch: (payload, createdAt) => {
      updateVelocityWindows(windowsAcc, createdAt, payload);
    },
  });

  return {
    scanned: meta.scanned,
    matched: meta.matched,
    windows: finalizeVelocityWindows(windowsAcc, {
      meta,
      nowMs: args.nowMs,
      supplyDenom: args.supplyDenom,
    }),
  };
}

function initIssuanceWindows(nowMs: number) {
  return WINDOWS.map((entry) => ({
    key: entry.key as WindowKey,
    windowMs: entry.ms,
    startMs: nowMs - entry.ms,
    mintCount: 0,
    burnCount: 0,
    mintedSum: new BigNumber(0),
    burnedSum: new BigNumber(0),
    mintAmountParsed: 0,
    mintAmountMissing: 0,
    burnAmountParsed: 0,
    burnAmountMissing: 0,
  }));
}

function initIssuanceSeries(nowMs: number) {
  const startMs = nowMs - ISSUANCE_SERIES_DAYS * DAY_MS;
  const buckets = Array.from({ length: ISSUANCE_SERIES_DAYS }, (_, idx) => ({
    bucketStartMs: startMs + idx * DAY_MS,
    minted: new BigNumber(0),
    burned: new BigNumber(0),
    net: new BigNumber(0),
  }));
  return { startMs, buckets };
}

function updateIssuanceProgress(kind: 'Mint' | 'Burn', metric: 'scanned' | 'matched', value: number) {
  if (kind === 'Mint') {
    if (metric === 'scanned') state.mintsScanned = value;
    else state.mintsMatched = value;
    return;
  }

  if (metric === 'scanned') state.burnsScanned = value;
  else state.burnsMatched = value;
}

function updateIssuanceWindows(
  windowsAcc: ReturnType<typeof initIssuanceWindows>,
  args: {
    kind: 'Mint' | 'Burn'
    createdAt: number
    amount: BigNumber | null
  }
) {
  for (const win of windowsAcc) {
    if (args.createdAt < win.startMs) continue;
    if (args.kind === 'Mint') {
      win.mintCount += 1;
      if (args.amount) {
        win.mintedSum = win.mintedSum.plus(args.amount);
        win.mintAmountParsed += 1;
      } else {
        win.mintAmountMissing += 1;
      }
      continue;
    }

    win.burnCount += 1;
    if (args.amount) {
      win.burnedSum = win.burnedSum.plus(args.amount);
      win.burnAmountParsed += 1;
    } else {
      win.burnAmountMissing += 1;
    }
  }
}

function updateIssuanceSeries(
  series: ReturnType<typeof initIssuanceSeries>,
  args: {
    kind: 'Mint' | 'Burn'
    createdAt: number
    amount: BigNumber | null
  }
) {
  if (args.createdAt < series.startMs) return;

  const bucket = Math.floor((args.createdAt - series.startMs) / DAY_MS);
  if (bucket < 0 || bucket >= series.buckets.length) return;

  const entry = series.buckets[bucket]!;
  if (args.kind === 'Mint') {
    if (args.amount) entry.minted = entry.minted.plus(args.amount);
  } else if (args.amount) {
    entry.burned = entry.burned.plus(args.amount);
  }
  entry.net = entry.minted.minus(entry.burned);
}

async function scanIssuanceKind(args: {
  kind: 'Mint' | 'Burn'
  definitionId: string
  cutoffMs: number
  localNonce: number
  windowsAcc: ReturnType<typeof initIssuanceWindows>
  series: ReturnType<typeof initIssuanceSeries>
}): Promise<InstructionScanMeta> {
  return scanInstructionsByKind({
    kind: args.kind,
    perPage: 200,
    maxItems: maxIssuanceToScan.value,
    cutoffMs: args.cutoffMs,
    localNonce: args.localNonce,
    onScanned: (value) => {
      if (args.localNonce === runNonce) updateIssuanceProgress(args.kind, 'scanned', value);
    },
    onMatched: (value) => {
      if (args.localNonce === runNonce) updateIssuanceProgress(args.kind, 'matched', value);
    },
    matches: (payload) => extractAssetDefinitionIdFromIsiPayload(payload) === args.definitionId,
    handleMatch: (payload, createdAt) => {
      const amount = extractAmountFromIsiPayload(payload);
      updateIssuanceWindows(args.windowsAcc, { kind: args.kind, createdAt, amount });
      updateIssuanceSeries(args.series, { kind: args.kind, createdAt, amount });
    },
  });
}

function finalizeIssuanceWindows(
  windowsAcc: ReturnType<typeof initIssuanceWindows>,
  args: {
    mintMeta: InstructionScanMeta
    burnMeta: InstructionScanMeta
    nowMs: number
  }
): IssuanceWindowStats[] {
  return windowsAcc.map((win) => {
    const mintComplete =
      args.mintMeta.endedByPagination ||
      args.mintMeta.cutoffReached ||
      (args.mintMeta.isMonotonic && args.mintMeta.oldestSeenMs !== null && args.mintMeta.oldestSeenMs <= win.startMs);
    const burnComplete =
      args.burnMeta.endedByPagination ||
      args.burnMeta.cutoffReached ||
      (args.burnMeta.isMonotonic && args.burnMeta.oldestSeenMs !== null && args.burnMeta.oldestSeenMs <= win.startMs);
    const complete = mintComplete && burnComplete;

    const minted = win.mintAmountParsed > 0 ? win.mintedSum : null;
    const burned = win.burnAmountParsed > 0 ? win.burnedSum : null;
    const net = win.mintAmountParsed + win.burnAmountParsed > 0 ? win.mintedSum.minus(win.burnedSum) : null;
    return {
      key: win.key,
      windowMs: win.windowMs,
      start: new Date(win.startMs),
      end: new Date(args.nowMs),
      mintCount: win.mintCount,
      burnCount: win.burnCount,
      minted,
      burned,
      net,
      mintAmountParsed: win.mintAmountParsed,
      mintAmountMissing: win.mintAmountMissing,
      burnAmountParsed: win.burnAmountParsed,
      burnAmountMissing: win.burnAmountMissing,
      complete,
    };
  });
}

async function fetchIssuance(definitionId: string, nowMs: number, localNonce: number) {
  const windowsAcc = initIssuanceWindows(nowMs);
  const series = initIssuanceSeries(nowMs);
  const [mintMeta, burnMeta] = await Promise.all([
    scanIssuanceKind({ kind: 'Mint', definitionId, cutoffMs: series.startMs, localNonce, windowsAcc, series }),
    scanIssuanceKind({ kind: 'Burn', definitionId, cutoffMs: series.startMs, localNonce, windowsAcc, series }),
  ]);
  const buildWindows = () => finalizeIssuanceWindows(windowsAcc, { mintMeta, burnMeta, nowMs });

  return {
    complete: buildWindows().every((win) => win.complete),
    windows: buildWindows(),
    series: series.buckets,
  };
}

function resetEconometricsRunState() {
  state.isLoading = true;
  state.error = null;
  state.stage = 'holders';
  state.holdersFetched = 0;
  state.holdersTotal = null;
  state.transfersScanned = 0;
  state.transfersMatched = 0;
  state.mintsScanned = 0;
  state.mintsMatched = 0;
  state.burnsScanned = 0;
  state.burnsMatched = 0;
}

function createEmptyDistribution(): EconometricsResult['distribution'] {
  return {
    gini: 0,
    hhi: 0,
    effectiveHolders: null,
    theil: 0,
    entropy: 0,
    entropyNormalized: 0,
    entropyEffectiveHolders: null,
    nakamoto33: 0,
    nakamoto51: 0,
    nakamoto67: 0,
    top1: 0,
    top5: 0,
    top10: 0,
    median: null,
    p90: null,
    p99: null,
    lorenz: [{ population: 0, share: 0 }, { population: 1, share: 1 }],
  };
}

function buildDistributionFromSnapshot(snapshot: AssetDefinitionSnapshotSuccess['data']) {
  const holdersTotalSupply = snapshot.total_supply;
  const dist = snapshot.distribution;
  const hhi = dist.hhi;
  const entropy = dist.entropy;

  return {
    holders: snapshot.top_holders
      .map((entry) => ({
        account: entry.account_id,
        balance: entry.balance,
        share: safeRatio(entry.balance, holdersTotalSupply),
      }))
      .sort((a, b) => b.balance.comparedTo(a.balance) ?? 0),
    holdersTotalSupply,
    holdersCount: snapshot.holders_total,
    holdersTotalCount: snapshot.holders_total,
    holdersComplete: true,
    distribution: {
      gini: dist.gini,
      hhi,
      effectiveHolders: hhi > 0 ? 1 / hhi : null,
      theil: dist.theil,
      entropy,
      entropyNormalized: dist.entropy_normalized,
      entropyEffectiveHolders: effectiveNumberFromEntropy(entropy),
      nakamoto33: dist.nakamoto_33,
      nakamoto51: dist.nakamoto_51,
      nakamoto67: dist.nakamoto_67,
      top1: dist.top1,
      top5: dist.top5,
      top10: dist.top10,
      median: dist.median,
      p90: dist.p90,
      p99: dist.p99,
      lorenz: dist.lorenz,
    } satisfies EconometricsResult['distribution'],
  };
}

async function buildDistributionFromHolderScan(definition: string, localNonce: number) {
  const { holders, totalItems, complete } = await fetchAssetHolders(
    definition,
    {
      perPage: 200,
      maxItems: maxHoldersToScan.value,
    },
    localNonce
  );
  if (localNonce !== runNonce) return null;

  const balances = holders.map((entry) => entry.balance);
  const holdersTotalSupply = sum(balances);
  const hhi = herfindahlIndex(balances);
  const entropy = shannonEntropy(balances);

  return {
    holders: holders
      .slice()
      .sort((a, b) => b.balance.comparedTo(a.balance) ?? 0)
      .map((entry) => ({
        account: entry.account,
        balance: entry.balance,
        share: safeRatio(entry.balance, holdersTotalSupply),
      })),
    holdersTotalSupply,
    holdersCount: balances.length,
    holdersTotalCount: totalItems,
    holdersComplete: complete,
    distribution: {
      gini: giniCoefficient(balances),
      hhi,
      effectiveHolders: hhi > 0 ? 1 / hhi : null,
      theil: theilIndexT(balances),
      entropy,
      entropyNormalized: normalizedEntropy(balances),
      entropyEffectiveHolders: effectiveNumberFromEntropy(entropy),
      nakamoto33: nakamotoCoefficient(balances, 0.33),
      nakamoto51: nakamotoCoefficient(balances, 0.51),
      nakamoto67: nakamotoCoefficient(balances, 0.67),
      top1: concentrationTopN(balances, 1),
      top5: concentrationTopN(balances, 5),
      top10: concentrationTopN(balances, 10),
      median: median(balances),
      p90: nearestRankQuantile(balances, 0.9),
      p99: nearestRankQuantile(balances, 0.99),
      lorenz: lorenzCurvePoints(balances, 32),
    } satisfies EconometricsResult['distribution'],
  };
}

function computeHolderChurn(
  definitionId: string,
  args: {
    nowMs: number
    holders: HolderRow[]
    holdersTotalCount: number | null
  }
): HolderChurn | null {
  const snapshotPrev = loadSnapshot(definitionId);
  const snapshotNow: HolderSnapshot = {
    computed_at_ms: args.nowMs,
    holders: args.holders.map((row) => row.account),
    scanned: args.holders.length,
    total: args.holdersTotalCount,
  };
  saveSnapshot(definitionId, snapshotNow);
  if (!snapshotPrev) return null;

  const churnStats = computeSetChurn(snapshotPrev.holders, snapshotNow.holders);
  const deltaMs = Math.max(0, snapshotNow.computed_at_ms - snapshotPrev.computed_at_ms);
  return {
    previousComputedAt: new Date(snapshotPrev.computed_at_ms),
    deltaMs,
    previousScanned: snapshotPrev.scanned,
    currentScanned: snapshotNow.scanned,
    retained: churnStats.retained,
    entered: churnStats.entered,
    exited: churnStats.exited,
    retentionPrev: churnStats.retentionPrev,
    retentionCurrent: churnStats.retentionCurrent,
  };
}

async function fetchHolderSnapshot(definition: string) {
  let snapshotRes: Awaited<ReturnType<typeof http.fetchAssetDefinitionSnapshot>> | { status: typeof NOT_FOUND } = {
    status: NOT_FOUND,
  };

  if (!supportsSnapshotEndpoint.value) return snapshotRes;

  try {
    snapshotRes = await http.fetchAssetDefinitionSnapshot(definition);
  } catch {
    snapshotRes = { status: NOT_FOUND };
    supportsSnapshotEndpoint.value = false;
  }

  return snapshotRes;
}

function resolveDefinitionSupplies(definitionRes: Awaited<ReturnType<typeof http.fetchAssetDefinition>>) {
  const definitionDto = definitionRes.status === SUCCESSFUL_FETCHING ? definitionRes.data : null;
  return {
    assetDefinitionId: definitionDto?.id ?? null,
    assetDefinitionAlias: definitionDto?.alias ?? null,
    definitionTotalSupply: definitionDto?.total_quantity ?? null,
    definitionLockedSupply: definitionDto?.locked_quantity ?? null,
    definitionCirculatingSupply: definitionDto?.circulating_quantity ?? null,
  };
}

async function resolveHolderData(
  definition: string,
  localNonce: number,
  snapshotRes: Awaited<ReturnType<typeof http.fetchAssetDefinitionSnapshot>> | { status: typeof NOT_FOUND }
) {
  if (snapshotRes.status === SUCCESSFUL_FETCHING) return buildDistributionFromSnapshot(snapshotRes.data);
  return buildDistributionFromHolderScan(definition, localNonce);
}

function syncSnapshotHolderProgress(
  snapshotRes: Awaited<ReturnType<typeof http.fetchAssetDefinitionSnapshot>> | { status: typeof NOT_FOUND },
  localNonce: number
) {
  if (snapshotRes.status !== SUCCESSFUL_FETCHING || localNonce !== runNonce) return;
  state.holdersFetched = snapshotRes.data.holders_total;
  state.holdersTotal = snapshotRes.data.holders_total;
}

function resolveVelocitySupply(preferredSupply: BigNumber | null, holdersTotalSupply: BigNumber): BigNumber {
  return preferredSupply && preferredSupply.isFinite() && !preferredSupply.isZero()
    ? preferredSupply
    : holdersTotalSupply;
}

async function loadHolderDistribution(definition: string, nowMs: number, localNonce: number) {
  const definitionRes = await http.fetchAssetDefinition(definition);
  if (localNonce !== runNonce) return null;
  const { assetDefinitionId, assetDefinitionAlias, definitionTotalSupply, definitionLockedSupply, definitionCirculatingSupply } = resolveDefinitionSupplies(
    definitionRes
  );

  const snapshotRes = await fetchHolderSnapshot(definition);
  if (localNonce !== runNonce) return null;
  if (definitionRes.status === SUCCESSFUL_FETCHING && snapshotRes.status === NOT_FOUND) {
    supportsSnapshotEndpoint.value = false;
  }

  const holderData = await resolveHolderData(definition, localNonce, snapshotRes);
  if (!holderData || localNonce !== runNonce) return null;
  syncSnapshotHolderProgress(snapshotRes, localNonce);

  const preferredVelocitySupply = definitionCirculatingSupply ?? definitionTotalSupply;
  const velocitySupply = resolveVelocitySupply(preferredVelocitySupply, holderData.holdersTotalSupply);

  return {
    assetDefinitionId: assetDefinitionId ?? definition,
    assetDefinitionAlias,
    ...holderData,
    definitionTotalSupply,
    definitionLockedSupply,
    definitionCirculatingSupply,
    velocitySupply,
    supplyCoverage: definitionTotalSupply ? safeRatio(holderData.holdersTotalSupply, definitionTotalSupply) : null,
    holderChurn: computeHolderChurn(definition, {
      nowMs,
      holders: holderData.holders,
      holdersTotalCount: holderData.holdersTotalCount,
    }),
  };
}

function mapVelocityWindowsFromActivity(
  windows: AssetDefinitionEconometricsSuccess['data']['velocity_windows'],
  supplyDenom: BigNumber
): VelocityWindowStats[] {
  const order = new Map(WINDOWS.map((entry, idx) => [entry.key, idx]));
  return windows
    .slice()
    .sort((a, b) => (order.get(a.key as WindowKey) ?? 999) - (order.get(b.key as WindowKey) ?? 999))
    .map((win) => {
      const windowMs = Math.max(0, win.end_ms - win.start_ms);
      const days = windowMs / DAY_MS;
      const amount = win.amount;
      const turnover = safeRatio(amount, supplyDenom);
      const velocityPerDay = turnover === null || days <= 0 ? null : turnover / days;
      const transfersPerDay = days <= 0 ? null : win.transfers / days;

      return {
        key: win.key as WindowKey,
        windowMs,
        start: new Date(win.start_ms),
        end: new Date(win.end_ms),
        days,
        transfers: win.transfers,
        uniqueSenders: win.unique_senders,
        uniqueReceivers: win.unique_receivers,
        amount,
        amountParsed: win.transfers,
        amountMissing: 0,
        turnover,
        velocityPerDay,
        transfersPerDay,
        complete: true,
      } satisfies VelocityWindowStats;
    });
}

function mapIssuanceWindowsFromActivity(
  windows: AssetDefinitionEconometricsSuccess['data']['issuance_windows']
): IssuanceWindowStats[] {
  const order = new Map(WINDOWS.map((entry, idx) => [entry.key, idx]));
  return windows
    .slice()
    .sort((a, b) => (order.get(a.key as WindowKey) ?? 999) - (order.get(b.key as WindowKey) ?? 999))
    .map((win) => {
      const windowMs = Math.max(0, win.end_ms - win.start_ms);
      const minted = win.mint_count > 0 ? win.minted : null;
      const burned = win.burn_count > 0 ? win.burned : null;
      const net = win.mint_count + win.burn_count > 0 ? win.net : null;
      return {
        key: win.key as WindowKey,
        windowMs,
        start: new Date(win.start_ms),
        end: new Date(win.end_ms),
        mintCount: win.mint_count,
        burnCount: win.burn_count,
        minted,
        burned,
        net,
        mintAmountParsed: win.mint_count,
        mintAmountMissing: 0,
        burnAmountParsed: win.burn_count,
        burnAmountMissing: 0,
        complete: true,
      } satisfies IssuanceWindowStats;
    });
}

async function loadActivityBundle(args: {
  definition: string
  nowMs: number
  localNonce: number
  velocitySupply: BigNumber
}) {
  let velocityWindows: VelocityWindowStats[] | null = null;
  let issuanceWindows: IssuanceWindowStats[] | null = null;
  let issuanceSeries: IssuanceSeriesPoint[] | null = null;
  let activityComputedAt: Date | null = null;

  state.stage = 'activity';
  try {
    const activityRes = supportsEconometricsEndpoint.value
      ? await http.fetchAssetDefinitionEconometrics(args.definition)
      : ({ status: NOT_FOUND } as const);
    if (args.localNonce !== runNonce) return null;
    if (activityRes.status === NOT_FOUND) {
      supportsEconometricsEndpoint.value = false;
    }

    if (activityRes.status === SUCCESSFUL_FETCHING) {
      activityComputedAt = new Date(activityRes.data.computed_at_ms);
      velocityWindows = mapVelocityWindowsFromActivity(activityRes.data.velocity_windows, args.velocitySupply);
      issuanceWindows = mapIssuanceWindowsFromActivity(activityRes.data.issuance_windows);
      issuanceSeries = activityRes.data.issuance_series
        .slice()
        .sort((a, b) => a.bucket_start_ms - b.bucket_start_ms)
        .map((point) => ({
          bucketStartMs: point.bucket_start_ms,
          minted: point.minted,
          burned: point.burned,
          net: point.net,
        }));
    }
  } catch {
    // ignore and fall back to client-side scans
  }

  if (args.localNonce !== runNonce) return null;

  if (!velocityWindows) {
    state.stage = 'transfers';
    try {
      const transferStats = await fetchVelocityWindows({
        definitionId: args.definition,
        supplyDenom: args.velocitySupply,
        nowMs: args.nowMs,
        localNonce: args.localNonce,
      });
      if (args.localNonce !== runNonce) return null;
      velocityWindows = transferStats.windows;
    } catch {
      velocityWindows = null;
    }
  }

  if (args.localNonce !== runNonce) return null;

  if (!issuanceWindows || !issuanceSeries) {
    state.stage = 'issuance';
    try {
      const issuance = await fetchIssuance(args.definition, args.nowMs, args.localNonce);
      if (args.localNonce !== runNonce) return null;
      issuanceWindows = issuance.windows;
      issuanceSeries = issuance.series;
    } catch {
      issuanceWindows = null;
      issuanceSeries = null;
    }
  }

  if (args.localNonce !== runNonce) return null;

  return {
    velocityWindows,
    issuanceWindows,
    issuanceSeries,
    computedAt: activityComputedAt ?? new Date(),
  };
}

async function computeEconometrics(definition: string) {
  const localNonce = (runNonce += 1);
  const nowMs = Date.now();
  resetEconometricsRunState();

  try {
    const holderBundle = await loadHolderDistribution(definition, nowMs, localNonce);
    if (!holderBundle || localNonce !== runNonce) return;

    const activityBundle = await loadActivityBundle({
      definition,
      nowMs,
      localNonce,
      velocitySupply: holderBundle.velocitySupply,
    });
    if (!activityBundle || localNonce !== runNonce) return;

    result.value = {
      assetDefinitionId: holderBundle.assetDefinitionId,
      assetDefinitionAlias: holderBundle.assetDefinitionAlias,
      definitionTotalSupply: holderBundle.definitionTotalSupply,
      definitionLockedSupply: holderBundle.definitionLockedSupply,
      definitionCirculatingSupply: holderBundle.definitionCirculatingSupply,
      velocitySupply: holderBundle.velocitySupply,
      supplyCoverage: holderBundle.supplyCoverage,
      holders: holderBundle.holders,
      holdersTotalSupply: holderBundle.holdersTotalSupply,
      holdersCount: holderBundle.holdersCount,
      holdersTotalCount: holderBundle.holdersTotalCount,
      holdersComplete: holderBundle.holdersComplete,
      distribution: holderBundle.distribution ?? createEmptyDistribution(),
      holderChurn: holderBundle.holderChurn,
      velocityWindows: activityBundle.velocityWindows,
      issuanceWindows: activityBundle.issuanceWindows,
      issuanceSeries: activityBundle.issuanceSeries,
      computedAt: activityBundle.computedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.error = message;
  } finally {
    if (localNonce === runNonce) {
      state.isLoading = false;
      state.stage = 'idle';
    }
  }
}

function startCompute(definition: string) {
  assetInput.value = definition;
  navigation.replace({ query: { ...router.currentRoute.value.query, asset: definition } }).catch(() => {});
  computeEconometrics(definition);
}

function openHolderAccount(accountId: string) {
  navigation.push(`/accounts/${accountId}`).catch(() => {});
}

function handleCompute() {
  const definition = parsedAssetDefinitionId.value;
  if (!definition) return;

  startCompute(definition);
}

watch(
  () => router.currentRoute.value.query.asset,
  (queryAsset) => {
    if (typeof queryAsset !== 'string') return;
    const trimmed = queryAsset.trim();
    if (!trimmed) return;
    if (trimmed === assetInput.value.trim()) return;
    assetInput.value = trimmed;
    const parsed = parsedAssetDefinitionId.value;
    if (parsed && !assetInputError.value) {
      computeEconometrics(parsed);
    }
  },
  { immediate: true }
);

const lorenzSvgPoints = computed(() => {
  const points = result.value?.distribution.lorenz;
  if (!points || points.length === 0) return '';
  return points
    .map((point) => {
      const x = point.population * 100;
      const y = 100 - point.share * 100;
      return `${x},${y}`;
    })
    .join(' ');
});

const issuanceNetSparkline = computed(() => {
  const series = result.value?.issuanceSeries;
  if (!series || series.length < 2) return '';

  const values = series.map((entry) => entry.net);
  const maxAbs = values.reduce((acc, value) => {
    const abs = value.absoluteValue();
    return abs.gt(acc) ? abs : acc;
  }, new BigNumber(0));

  const denom = maxAbs.isZero() ? new BigNumber(1) : maxAbs;
  const height = 45;
  const baseline = 50;
  const count = series.length;

  return values
    .map((value, idx) => {
      const x = (idx / (count - 1)) * 100;
      const ratio = value.div(denom).toNumber();
      const clamped = Math.min(1, Math.max(-1, ratio));
      const y = baseline - clamped * height;
      return `${x},${y}`;
    })
    .join(' ');
});
</script>

<template>
  <div class="econometrics-page">
    <BaseContentBlock
      :title="$t('econometrics.title')"
      class="econometrics-page__block"
    >
      <template #header-action>
        <BaseButton
          line
          :disabled="!canCompute || state.isLoading"
          @click="handleCompute"
        >
          {{ $t('econometrics.compute') }}
        </BaseButton>
      </template>

      <template #default>
        <div class="econometrics-page__filters">
          <label>
            <span class="label">{{ $t('econometrics.assetLabel') }}</span>
            <input
              v-model="assetInput"
              type="text"
              :placeholder="$t('econometrics.assetPlaceholder')"
            >
            <small
              v-if="assetInputError"
              class="econometrics-page__filters-error"
            >
              {{ assetInputError }}
            </small>
          </label>
          <label>
            <span class="label">{{ $t('econometrics.maxHoldersLabel') }}</span>
            <input
              v-model.number="maxHoldersToScan"
              type="number"
              min="100"
              step="100"
            >
          </label>
          <label>
            <span class="label">{{ $t('econometrics.maxTransfersLabel') }}</span>
            <input
              v-model.number="maxTransfersToScan"
              type="number"
              min="200"
              step="200"
            >
          </label>
          <label>
            <span class="label">{{ $t('econometrics.maxIssuanceLabel') }}</span>
            <input
              v-model.number="maxIssuanceToScan"
              type="number"
              min="200"
              step="200"
            >
          </label>
        </div>

        <BaseInnerBlock :title="$t('assets.assets')">
          <div class="econometrics-page__asset-filters">
            <label>
              <span class="label">{{ $t('assets.filters.domainLabel') }}</span>
              <input
                v-model="assetDefinitionsFilters.domain"
                type="text"
                :placeholder="$t('assets.filters.domainPlaceholder')"
              >
            </label>
            <label>
              <span class="label">{{ $t('assets.filters.ownerLabel') }}</span>
              <input
                v-model="assetDefinitionsFilters.owner"
                type="text"
                :placeholder="$t('assets.filters.ownerPlaceholder')"
              >
              <small
                v-if="ownerFilterError"
                class="econometrics-page__asset-filters-error"
              >
                {{ ownerFilterError }}
              </small>
            </label>
          </div>

          <BaseTable
            v-model:page="assetDefinitionsState.page"
            v-model:page-size="assetDefinitionsState.per_page"
            :loading="isAssetDefinitionsLoading"
            :total="totalAssetDefinitions"
            :items="assetDefinitions"
            :row-key="assetDefinitionRowKey"
            container-class="econometrics-page__asset-list"
            row-pointer
            @click:row="(asset) => startCompute(asset.id)"
          >
            <template #header>
              <div class="econometrics-page__asset-row econometrics-page__asset-row--header">
                <span class="h-sm cell">{{ $t('econometrics.assetDefinition') }}</span>
                <span class="h-sm cell">{{ $t('assets.assets') }}</span>
                <span class="h-sm cell">{{ $t('econometrics.totalSupplyDefinition') }}</span>
                <span class="h-sm cell">{{ $t('assets.filters.ownerLabel') }}</span>
              </div>
            </template>

            <template #row="{ item }">
              <div
                :class="[
                  'econometrics-page__asset-row',
                  selectedAssetDefinitionId === item.id ? 'econometrics-page__asset-row--selected' : null,
                ]"
              >
                <div class="econometrics-page__asset-definition cell">
                  <span
                    v-if="item.alias"
                    class="econometrics-page__asset-alias row-text"
                  >
                    {{ item.alias }}
                  </span>
                  <span class="row-text-monospace">{{ item.id }}</span>
                </div>
                <span class="row-text-monospace cell">{{ item.assets }}</span>
                <span class="row-text-monospace cell">{{
                  item.total_quantity ? item.total_quantity.toString() : $t('none')
                }}</span>
                <span class="row-text-monospace cell">{{ item.owned_by }}</span>
              </div>
            </template>
          </BaseTable>
        </BaseInnerBlock>

        <div
          v-if="state.error"
          class="econometrics-page__error row-text"
        >
          {{ state.error }}
        </div>

        <div
          v-if="isInitialLoading"
          class="econometrics-page__loading"
        >
          <BaseLoading />
          <div class="econometrics-page__loading-text row-text-monospace">
            <template v-if="state.stage === 'holders'">
              {{ $t('econometrics.loadingHolders', [state.holdersFetched, state.holdersTotal ?? '?']) }}
            </template>
            <template v-else-if="state.stage === 'transfers'">
              {{ $t('econometrics.loadingTransfers', [state.transfersScanned, state.transfersMatched]) }}
            </template>
            <template v-else-if="state.stage === 'issuance'">
              {{
                $t('econometrics.loadingIssuance', [
                  state.mintsScanned,
                  state.mintsMatched,
                  state.burnsScanned,
                  state.burnsMatched,
                ])
              }}
            </template>
            <template v-else>
              {{ $t('econometrics.loading') }}
            </template>
          </div>
        </div>

        <div v-else-if="result">
          <div
            v-if="state.isLoading"
            class="econometrics-page__refresh-indicator"
            aria-hidden="true"
          >
            <BaseLoading />
          </div>

          <BaseInnerBlock :title="$t('econometrics.snapshotTitle')">
            <div class="econometrics-page__grid">
              <DataField
                :title="$t('econometrics.assetDefinition')"
                :value="result.assetDefinitionId"
                monospace
              />
              <DataField
                :title="$t('sorafs.columns.alias')"
                :value="result.assetDefinitionAlias"
                monospace
              />
              <DataField
                :title="$t('econometrics.holders')"
                :value="result.holdersCount"
                monospace
              />
              <DataField
                :title="$t('econometrics.totalSupplyDefinition')"
                :value="formatMaybeBigNumber(result.definitionTotalSupply)"
                monospace
              />
              <DataField
                :title="$t('econometrics.circulatingSupply')"
                :value="formatMaybeBigNumber(result.definitionCirculatingSupply)"
                monospace
              />
              <DataField
                :title="$t('econometrics.lockedSupply')"
                :value="formatMaybeBigNumber(result.definitionLockedSupply)"
                monospace
              />
              <DataField
                :title="$t('econometrics.totalSupply')"
                :value="result.holdersTotalSupply.toString()"
                monospace
              />
              <DataField
                :title="$t('econometrics.supplyCoverage')"
                :value="formatPercent(result.supplyCoverage)"
                monospace
              />
              <DataField
                :title="$t('econometrics.coverage')"
                :value="
                  result.holdersTotalCount === null
                    ? $t('none')
                    : `${result.holdersCount}/${result.holdersTotalCount} (${result.holdersComplete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled')})`
                "
                monospace
              />
              <DataField
                :title="$t('econometrics.gini')"
                :value="formatRatio(result.distribution.gini, 6)"
                monospace
              />
              <DataField
                :title="$t('econometrics.hhi')"
                :value="formatRatio(result.distribution.hhi, 6)"
                monospace
              />
              <DataField
                :title="$t('econometrics.effectiveHolders')"
                :value="result.distribution.effectiveHolders ? result.distribution.effectiveHolders.toFixed(2) : $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.nakamoto33')"
                :value="result.distribution.nakamoto33 || $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.nakamoto51')"
                :value="result.distribution.nakamoto51 || $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.nakamoto67')"
                :value="result.distribution.nakamoto67 || $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.theil')"
                :value="formatRatio(result.distribution.theil, 6)"
                monospace
              />
              <DataField
                :title="$t('econometrics.entropy')"
                :value="formatRatio(result.distribution.entropy, 6)"
                monospace
              />
              <DataField
                :title="$t('econometrics.entropyNormalized')"
                :value="formatRatio(result.distribution.entropyNormalized, 6)"
                monospace
              />
              <DataField
                :title="$t('econometrics.entropyEffectiveHolders')"
                :value="
                  result.distribution.entropyEffectiveHolders ? result.distribution.entropyEffectiveHolders.toFixed(2) : $t('none')
                "
                monospace
              />
              <DataField
                :title="$t('econometrics.top1')"
                :value="formatPercent(result.distribution.top1)"
                monospace
              />
              <DataField
                :title="$t('econometrics.top5')"
                :value="formatPercent(result.distribution.top5)"
                monospace
              />
              <DataField
                :title="$t('econometrics.top10')"
                :value="formatPercent(result.distribution.top10)"
                monospace
              />
              <DataField
                :title="$t('econometrics.median')"
                :value="result.distribution.median?.toString() ?? $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.p90')"
                :value="result.distribution.p90?.toString() ?? $t('none')"
                monospace
              />
              <DataField
                :title="$t('econometrics.p99')"
                :value="result.distribution.p99?.toString() ?? $t('none')"
                monospace
              />
            </div>

            <div class="econometrics-page__lorenz">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line
                  x1="0"
                  y1="100"
                  x2="100"
                  y2="0"
                  vector-effect="non-scaling-stroke"
                  class="econometrics-page__lorenz-diagonal"
                />
                <polyline
                  :points="lorenzSvgPoints"
                  vector-effect="non-scaling-stroke"
                  class="econometrics-page__lorenz-curve"
                />
              </svg>
              <span class="caption">{{ $t('econometrics.lorenzCaption') }}</span>
            </div>
          </BaseInnerBlock>

          <BaseInnerBlock :title="$t('econometrics.topHoldersTitle')">
            <BaseTable
              :loading="false"
              :items="topHolders"
              :row-key="holderRowKey"
              container-class="econometrics-page__holders-table"
              disable-pagination
              row-pointer
              @click:row="(holder) => openHolderAccount(holder.account)"
            >
              <template #header>
                <div class="econometrics-page__holders-row">
                  <span class="h-sm cell">{{ $t('accountId') }}</span>
                  <span class="h-sm cell">{{ $t('value') }}</span>
                  <span class="h-sm cell">{{ $t('econometrics.share') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div class="econometrics-page__holders-row">
                  <BaseHash
                    :hash="item.account"
                    :link="`/accounts/${item.account}`"
                    type="short"
                    copy
                    class="cell"
                  />
                  <span class="row-text-monospace cell">{{ item.balance.toString() }}</span>
                  <span class="row-text-monospace cell">{{ formatPercent(item.share) }}</span>
                </div>
              </template>
            </BaseTable>
          </BaseInnerBlock>

          <BaseInnerBlock :title="$t('econometrics.velocityTitle')">
            <BaseTable
              :loading="false"
              :items="result.velocityWindows ?? []"
              :row-key="velocityWindowRowKey"
              :disable-pagination="true"
              container-class="econometrics-page__velocity-table"
            >
              <template #header>
                <div class="econometrics-page__velocity-row econometrics-page__velocity-row--header">
                  <span>{{ $t('econometrics.window') }}</span>
                  <span>{{ $t('econometrics.transferMatched') }}</span>
                  <span>{{ $t('econometrics.transferAmount') }}</span>
                  <span>{{ $t('econometrics.turnover') }}</span>
                  <span>{{ $t('econometrics.velocity') }}</span>
                  <span>{{ $t('econometrics.transferPerDay') }}</span>
                  <span>{{ $t('econometrics.uniqueSenders') }}</span>
                  <span>{{ $t('econometrics.uniqueReceivers') }}</span>
                  <span>{{ $t('econometrics.coverageShort') }}</span>
                </div>
              </template>
              <template #row="{ item }">
                <div class="econometrics-page__velocity-row">
                  <span class="row-text-monospace">{{ formatWindowLabel(item.key) }}</span>
                  <span class="row-text-monospace">{{ item.transfers }}</span>
                  <span class="row-text-monospace">
                    {{ item.amount ? item.amount.toString() : $t('none') }}
                    <span
                      v-if="item.amountParsed + item.amountMissing > 0"
                      class="econometrics-page__sub"
                    >({{ item.amountParsed }}/{{ item.amountParsed + item.amountMissing }})</span>
                  </span>
                  <span class="row-text-monospace">{{ formatPercent(item.turnover) }}</span>
                  <span class="row-text-monospace">{{ formatRatio(item.velocityPerDay, 6) }}</span>
                  <span class="row-text-monospace">{{ formatRatio(item.transfersPerDay, 3) }}</span>
                  <span class="row-text-monospace">{{ item.uniqueSenders }}</span>
                  <span class="row-text-monospace">{{ item.uniqueReceivers }}</span>
                  <span class="row-text-monospace">{{ item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled') }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="econometrics-page__mobile-card">
                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.window') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatWindowLabel(item.key) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferMatched') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ item.transfers }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferAmount') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ item.amount ? item.amount.toString() : $t('none') }}
                      <span
                        v-if="item.amountParsed + item.amountMissing > 0"
                        class="econometrics-page__sub"
                      >({{ item.amountParsed }}/{{ item.amountParsed + item.amountMissing }})</span>
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.turnover') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatPercent(item.turnover) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.velocity') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatRatio(item.velocityPerDay, 6) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferPerDay') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatRatio(item.transfersPerDay, 3) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.uniqueSenders') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ item.uniqueSenders }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.uniqueReceivers') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ item.uniqueReceivers }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.coverageShort') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled') }}
                    </span>
                  </div>
                </div>
              </template>
            </BaseTable>

            <div class="econometrics-page__note row-text">
              {{ $t('econometrics.velocityNote') }}
            </div>
          </BaseInnerBlock>

          <BaseInnerBlock :title="$t('econometrics.issuanceTitle')">
            <div class="econometrics-page__sparkline">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line
                  x1="0"
                  y1="50"
                  x2="100"
                  y2="50"
                  vector-effect="non-scaling-stroke"
                  class="econometrics-page__sparkline-baseline"
                />
                <polyline
                  :points="issuanceNetSparkline"
                  vector-effect="non-scaling-stroke"
                  class="econometrics-page__sparkline-line"
                />
              </svg>
              <span class="caption">{{ $t('econometrics.issuanceCaption', [ISSUANCE_SERIES_DAYS]) }}</span>
            </div>

            <BaseTable
              :loading="false"
              :items="result.issuanceWindows ?? []"
              :row-key="issuanceWindowRowKey"
              :disable-pagination="true"
              container-class="econometrics-page__issuance-table"
            >
              <template #header>
                <div class="econometrics-page__issuance-row econometrics-page__issuance-row--header">
                  <span>{{ $t('econometrics.window') }}</span>
                  <span>{{ $t('econometrics.minted') }}</span>
                  <span>{{ $t('econometrics.burned') }}</span>
                  <span>{{ $t('econometrics.netIssuance') }}</span>
                  <span>{{ $t('econometrics.coverageShort') }}</span>
                </div>
              </template>
              <template #row="{ item }">
                <div class="econometrics-page__issuance-row">
                  <span class="row-text-monospace">{{ formatWindowLabel(item.key) }}</span>
                  <span class="row-text-monospace">
                    {{ formatMaybeBigNumber(item.minted) }}
                    <span
                      v-if="item.mintAmountParsed + item.mintAmountMissing > 0"
                      class="econometrics-page__sub"
                    >({{ item.mintAmountParsed }}/{{ item.mintAmountParsed + item.mintAmountMissing }})</span>
                  </span>
                  <span class="row-text-monospace">
                    {{ formatMaybeBigNumber(item.burned) }}
                    <span
                      v-if="item.burnAmountParsed + item.burnAmountMissing > 0"
                      class="econometrics-page__sub"
                    >({{ item.burnAmountParsed }}/{{ item.burnAmountParsed + item.burnAmountMissing }})</span>
                  </span>
                  <span class="row-text-monospace">{{ formatMaybeBigNumber(item.net) }}</span>
                  <span class="row-text-monospace">{{ item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled') }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="econometrics-page__mobile-card">
                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.window') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatWindowLabel(item.key) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.minted') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ formatMaybeBigNumber(item.minted) }}
                      <span
                        v-if="item.mintAmountParsed + item.mintAmountMissing > 0"
                        class="econometrics-page__sub"
                      >({{ item.mintAmountParsed }}/{{ item.mintAmountParsed + item.mintAmountMissing }})</span>
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.burned') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ formatMaybeBigNumber(item.burned) }}
                      <span
                        v-if="item.burnAmountParsed + item.burnAmountMissing > 0"
                        class="econometrics-page__sub"
                      >({{ item.burnAmountParsed }}/{{ item.burnAmountParsed + item.burnAmountMissing }})</span>
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.netIssuance') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ formatMaybeBigNumber(item.net) }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.coverageShort') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled') }}
                    </span>
                  </div>
                </div>
              </template>
            </BaseTable>

            <div class="econometrics-page__note row-text">
              {{ $t('econometrics.issuanceNote') }}
            </div>
          </BaseInnerBlock>

          <BaseInnerBlock :title="$t('econometrics.churnTitle')">
            <div
              v-if="result.holderChurn"
              class="econometrics-page__grid"
            >
              <DataField
                :title="$t('econometrics.previousSnapshot')"
                :value="formatDate(result.holderChurn.previousComputedAt)"
                monospace
              />
              <DataField
                :title="$t('econometrics.snapshotDelta')"
                :value="formatDuration(result.holderChurn.deltaMs)"
                monospace
              />
              <DataField
                :title="$t('econometrics.retained')"
                :value="result.holderChurn.retained"
                monospace
              />
              <DataField
                :title="$t('econometrics.entered')"
                :value="result.holderChurn.entered"
                monospace
              />
              <DataField
                :title="$t('econometrics.exited')"
                :value="result.holderChurn.exited"
                monospace
              />
              <DataField
                :title="$t('econometrics.retentionPrev')"
                :value="formatPercent(result.holderChurn.retentionPrev)"
                monospace
              />
              <DataField
                :title="$t('econometrics.retentionCurrent')"
                :value="formatPercent(result.holderChurn.retentionCurrent)"
                monospace
              />
            </div>
            <div
              v-else
              class="econometrics-page__empty row-text"
            >
              {{ $t('econometrics.churnEmpty') }}
            </div>

            <div class="econometrics-page__note row-text">
              {{ $t('econometrics.churnNote') }}
            </div>
          </BaseInnerBlock>
        </div>

        <div
          v-else
          class="econometrics-page__empty row-text"
        >
          {{ $t('econometrics.empty') }}
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.econometrics-page {
  &__block {
    position: relative;
  }

  &__filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: size(2);
    padding: size(3) size(4);

    @include md {
      grid-template-columns: 1.4fr 0.6fr 0.6fr 0.6fr;
      align-items: end;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      min-width: 220px;

      .label {
        font-size: size(1.5);
        color: theme-color('content-tertiary');
      }

      input {
        padding: size(1.25);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }

    &-error {
      color: theme-color('error');
      font-size: size(1.3);
    }
  }

  &__asset-filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(4) size(2);

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      min-width: 220px;

      .label {
        font-size: size(1.5);
        color: theme-color('content-tertiary');
      }

      input {
        padding: size(1.25);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: size(3);
    margin-top: size(2);

    @include md {
      grid-template-columns: 1fr 1fr;
    }

    @include lg {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }

  &__holders-table {
    display: grid;
    grid-template-columns: 1fr;
  }

  &__holders-row {
    width: 100%;
    display: grid;
    grid-template-columns: 2fr 1fr 0.8fr;
    justify-content: start;
    align-items: center;
  }

  &__asset-list {
    display: grid;
    grid-template-columns: 1fr;
  }

  &__asset-row {
    width: 100%;
    padding: size(1.5) size(2);
    display: grid;
    grid-template-columns: 1fr;
    gap: size(1);
    align-items: center;

    @include md {
      grid-template-columns: 2fr 90px 180px 2fr;
      gap: size(2);

      .cell {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &--header {
      padding: size(1) size(2);
    }

    &--selected {
      background: theme-color('background-hover');
    }
  }

  &__asset-definition {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    min-width: 0;

    > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__asset-alias {
    color: theme-color('content-secondary');
  }

  &__mobile-card {
    padding: size(2) size(3);
    display: grid;
    gap: size(1);
  }

  &__mobile-row {
    display: flex;
    gap: size(2);
    align-items: flex-start;
  }

  &__mobile-label {
    flex: 0 0 46%;
    max-width: 46%;
    padding: size(1) 0;
  }

  &__mobile-value {
    flex: 1;
    text-align: right;
    overflow-wrap: anywhere;
    padding: size(1) 0;
  }

  &__velocity-table,
  &__issuance-table {
    display: grid;
    grid-template-columns: 1fr;
  }

  &__velocity-row,
  &__issuance-row {
    width: 100%;
    display: grid;
    grid-template-columns:
      minmax(80px, 0.8fr)
      minmax(95px, 0.95fr)
      minmax(130px, 1.35fr)
      minmax(110px, 1fr)
      minmax(120px, 1.1fr)
      minmax(125px, 1.2fr)
      minmax(95px, 0.9fr)
      minmax(95px, 0.95fr)
      minmax(90px, 0.85fr);
    gap: size(1);
    align-items: center;

    > span {
      min-width: 0;
    }

    &--header {
      grid-template-columns:
        minmax(80px, 0.8fr)
        minmax(95px, 0.95fr)
        minmax(130px, 1.35fr)
        minmax(110px, 1fr)
        minmax(120px, 1.1fr)
        minmax(125px, 1.2fr)
        minmax(95px, 0.9fr)
        minmax(95px, 0.95fr)
        minmax(90px, 0.85fr);
      align-items: start;

      > span {
        white-space: normal;
        overflow-wrap: break-word;
        word-break: normal;
        line-height: 1.25;
      }
    }

    @include md {
      gap: size(2);
    }
  }

  &__issuance-row {
    grid-template-columns: minmax(80px, 0.9fr) minmax(130px, 1.5fr) minmax(130px, 1.5fr) minmax(130px, 1.5fr) minmax(90px, 0.9fr);

    &--header {
      grid-template-columns:
        minmax(80px, 0.9fr)
        minmax(130px, 1.5fr)
        minmax(130px, 1.5fr)
        minmax(130px, 1.5fr)
        minmax(90px, 0.9fr);
    }
  }

  &__sub {
    margin-inline-start: size(1);
    color: theme-color('content-tertiary');
    font-size: size(1.2);
  }

  &__note {
    margin-top: size(3);
    color: theme-color('content-tertiary');
    padding: 0 size(1);
  }

  &__error,
  &__empty {
    padding: size(3) size(4);
  }

  &__loading {
    display: grid;
    justify-items: center;
    gap: size(2);
    padding: size(4);

    &-text {
      color: theme-color('content-tertiary');
    }
  }

  &__refresh-indicator {
    position: absolute;
    top: 84px;
    right: size(4);
    pointer-events: none;
    opacity: 0.75;

    .base-loading {
      width: size(3.5);
      height: size(3.5);
    }
  }

  &__lorenz {
    margin-top: size(3);
    display: flex;
    align-items: center;
    gap: size(2);

    svg {
      width: 160px;
      height: 110px;
    }

    .caption {
      font-size: size(1.5);
      color: theme-color('content-secondary');
    }
  }

  &__lorenz-diagonal {
    stroke: color-mix(in srgb, theme-color('content-quaternary') 55%, transparent);
    stroke-width: 2;
  }

  &__lorenz-curve {
    stroke: theme-color('primary');
    stroke-width: 2;
    fill: none;
  }

  &__sparkline {
    margin: size(2) 0;
    display: flex;
    align-items: center;
    gap: size(2);

    svg {
      width: 240px;
      height: 60px;
      fill: none;
      stroke-width: 2;
    }

    .caption {
      font-size: size(1.5);
      color: theme-color('content-secondary');
    }
  }

  &__sparkline-baseline {
    stroke: color-mix(in srgb, theme-color('content-quaternary') 55%, transparent);
  }

  &__sparkline-line {
    stroke: theme-color('primary');
  }
}
</style>
