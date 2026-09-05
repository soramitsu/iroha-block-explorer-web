<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
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
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { effectiveNumberFromEntropy, safeRatio } from '@/shared/lib/econometrics';
import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';
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
  account: string;
  balance: BigNumber;
  share: number | null;
}

interface VelocityWindowStats {
  key: WindowKey;
  windowMs: number;
  start: Date;
  end: Date;
  days: number;
  transfers: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  amount: BigNumber | null;
  amountParsed: number;
  amountMissing: number;
  turnover: number | null;
  velocityPerDay: number | null;
  transfersPerDay: number | null;
  complete: boolean;
}

interface IssuanceWindowStats {
  key: WindowKey;
  windowMs: number;
  start: Date;
  end: Date;
  mintCount: number;
  burnCount: number;
  minted: BigNumber | null;
  burned: BigNumber | null;
  net: BigNumber | null;
  mintAmountParsed: number;
  mintAmountMissing: number;
  burnAmountParsed: number;
  burnAmountMissing: number;
  complete: boolean;
}

interface IssuanceSeriesPoint {
  bucketStartMs: number;
  minted: BigNumber;
  burned: BigNumber;
  net: BigNumber;
}

type AssetDefinitionSnapshotSuccess = Extract<
  Awaited<ReturnType<typeof http.fetchAssetDefinitionSnapshot>>,
  { status: typeof SUCCESSFUL_FETCHING }
>;
type AssetDefinitionEconometricsSuccess = Extract<
  Awaited<ReturnType<typeof http.fetchAssetDefinitionEconometrics>>,
  { status: typeof SUCCESSFUL_FETCHING }
>;

const assetDefinitionRowKey = (item: { id: string }) => item.id;
const holderRowKey = (item: { account: string }) => item.account;
const velocityWindowRowKey = (item: { key: WindowKey }) => item.key;
const issuanceWindowRowKey = (item: { key: WindowKey }) => item.key;

interface EconometricsResult {
  assetDefinitionId: string;
  assetDefinitionAlias: string | null;
  definitionTotalSupply: BigNumber | null;
  velocitySupply: BigNumber;
  supplyCoverage: number | null;
  holders: HolderRow[];
  holdersTotalSupply: BigNumber;
  holdersCount: number;
  holdersTotalCount: number | null;
  distribution: {
    gini: number;
    hhi: number;
    effectiveHolders: number | null;
    theil: number;
    entropy: number;
    entropyNormalized: number;
    entropyEffectiveHolders: number | null;
    nakamoto33: number;
    nakamoto51: number;
    nakamoto67: number;
    top1: number;
    top5: number;
    top10: number;
    median: BigNumber | null;
    p90: BigNumber | null;
    p99: BigNumber | null;
    lorenz: Array<{ population: number; share: number }>;
  };
  velocityWindows: VelocityWindowStats[] | null;
  issuanceWindows: IssuanceWindowStats[] | null;
  issuanceSeries: IssuanceSeriesPoint[] | null;
  computedAt: Date;
}

const router = useRouter();
const navigation = useScopedExplorerNavigation();
const { t } = useI18n();

const assetInput = ref('');

const assetDefinitionsState = reactive({
  cursor: null as string | null,
  limit: 50,
});

const assetDefinitionsFilters = reactive({
  domain: '',
  owner: '',
});
const ownerFilterState = computed(() =>
  parseOptionalFilter(assetDefinitionsFilters.owner, normalizeAccountIdLiteral, t('searchUnsupported'))
);
const parsedOwnerFilter = computed<string | undefined>(() => ownerFilterState.value.value);
const ownerFilterError = computed(() => ownerFilterState.value.error);

watch(
  () => [assetDefinitionsState.limit, assetDefinitionsFilters.domain, assetDefinitionsFilters.owner] as const,
  () => {
    assetDefinitionsState.cursor = null;
  }
);

const assetDefinitionsQuery = computed(() => ({
  cursor: assetDefinitionsState.cursor,
  limit: assetDefinitionsState.limit,
  owning_domain: assetDefinitionsFilters.domain.trim() || undefined,
  owned_by: parsedOwnerFilter.value,
}));

const assetDefinitionsScope = useParamScope(
  () => {
    if (ownerFilterError.value) return null;
    return {
      key: JSON.stringify({
        cursor: assetDefinitionsQuery.value.cursor,
        limit: assetDefinitionsQuery.value.limit,
        owning_domain: assetDefinitionsQuery.value.owning_domain ?? null,
        owned_by: assetDefinitionsQuery.value.owned_by ?? null,
      }),
      payload: assetDefinitionsQuery.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinitions(payload))
);

const isAssetDefinitionsLoading = computed(() => !!assetDefinitionsScope.value?.expose.isLoading);
const assetDefinitionsPagination = computed(() =>
  assetDefinitionsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetDefinitionsScope.value.expose.data.data.pagination
    : null
);
const assetDefinitions = computed(() =>
  assetDefinitionsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetDefinitionsScope.value.expose.data.data.items
    : []
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
  error: null as string | null,
});

const result = shallowRef<EconometricsResult | null>(null);
let runNonce = 0;

const canCompute = computed(() => !!parsedAssetDefinitionId.value && !assetInputError.value);
const isInitialLoading = computed(() => state.isLoading && !result.value);

const topHolders = computed(() => result.value?.holders.slice(0, 10) ?? []);
const selectedAssetDefinitionId = computed(
  () => result.value?.assetDefinitionId ?? parsedAssetDefinitionId.value ?? null
);

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

function formatHolderCoverage(holderResult: EconometricsResult): string {
  const total = holderResult.holdersTotalCount ?? holderResult.holdersCount;
  return t('econometrics.topHoldersCoverage', [holderResult.holdersCount, total]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resetEconometricsRunState() {
  state.isLoading = true;
  state.error = null;
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
    lorenz: [
      { population: 0, share: 0 },
      { population: 1, share: 1 },
    ],
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
    holdersCount: snapshot.top_holders.length,
    holdersTotalCount: snapshot.holders_total,
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

function explorerReadError(response: unknown): Error {
  if (isRecord(response) && response.error instanceof Error) return response.error;
  return new Error(t('econometrics.fetchError'));
}

async function fetchHolderSnapshot(definition: string) {
  const response = await http.fetchAssetDefinitionSnapshot(definition);
  if (response.status !== SUCCESSFUL_FETCHING) throw explorerReadError(response);
  return response.data;
}

function resolveDefinitionSupplies(definitionRes: Awaited<ReturnType<typeof http.fetchAssetDefinition>>) {
  if (definitionRes.status !== SUCCESSFUL_FETCHING) throw explorerReadError(definitionRes);
  const definitionDto = definitionRes.data;
  return {
    assetDefinitionId: definitionDto.id,
    assetDefinitionAlias: definitionDto.alias ?? null,
    definitionTotalSupply: definitionDto.total_quantity,
  };
}

async function resolveHolderData(snapshot: Awaited<ReturnType<typeof fetchHolderSnapshot>>) {
  return buildDistributionFromSnapshot(snapshot);
}

function resolveVelocitySupply(preferredSupply: BigNumber | null, holdersTotalSupply: BigNumber): BigNumber {
  return preferredSupply && preferredSupply.isFinite() && !preferredSupply.isZero()
    ? preferredSupply
    : holdersTotalSupply;
}

async function loadHolderDistribution(definition: string, localNonce: number) {
  const definitionRes = await http.fetchAssetDefinition(definition);
  if (localNonce !== runNonce) return null;
  const { assetDefinitionId, assetDefinitionAlias, definitionTotalSupply } = resolveDefinitionSupplies(definitionRes);

  const snapshot = await fetchHolderSnapshot(assetDefinitionId);
  if (localNonce !== runNonce) return null;

  const holderData = await resolveHolderData(snapshot);
  if (!holderData || localNonce !== runNonce) return null;

  const velocitySupply = resolveVelocitySupply(definitionTotalSupply, holderData.holdersTotalSupply);

  return {
    assetDefinitionId,
    assetDefinitionAlias,
    ...holderData,
    definitionTotalSupply,
    velocitySupply,
    supplyCoverage: definitionTotalSupply ? safeRatio(holderData.holdersTotalSupply, definitionTotalSupply) : null,
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

async function loadActivityBundle(args: { definition: string; localNonce: number; velocitySupply: BigNumber }) {
  const activityRes = await http.fetchAssetDefinitionEconometrics(args.definition);
  if (args.localNonce !== runNonce) return null;
  if (activityRes.status !== SUCCESSFUL_FETCHING) throw explorerReadError(activityRes);

  const velocityWindows = mapVelocityWindowsFromActivity(activityRes.data.velocity_windows, args.velocitySupply);
  const issuanceWindows = mapIssuanceWindowsFromActivity(activityRes.data.issuance_windows);
  const issuanceSeries = activityRes.data.issuance_series
    .slice()
    .sort((a, b) => a.bucket_start_ms - b.bucket_start_ms)
    .map((point) => ({
      bucketStartMs: point.bucket_start_ms,
      minted: point.minted,
      burned: point.burned,
      net: point.net,
    }));

  if (args.localNonce !== runNonce) return null;

  return {
    velocityWindows,
    issuanceWindows,
    issuanceSeries,
    computedAt: new Date(activityRes.data.computed_at_ms),
  };
}

async function computeEconometrics(definition: string) {
  const localNonce = (runNonce += 1);
  resetEconometricsRunState();

  try {
    const holderBundle = await loadHolderDistribution(definition, localNonce);
    if (!holderBundle || localNonce !== runNonce) return;

    const activityBundle = await loadActivityBundle({
      definition: holderBundle.assetDefinitionId,
      localNonce,
      velocitySupply: holderBundle.velocitySupply,
    });
    if (!activityBundle || localNonce !== runNonce) return;

    result.value = {
      assetDefinitionId: holderBundle.assetDefinitionId,
      assetDefinitionAlias: holderBundle.assetDefinitionAlias,
      definitionTotalSupply: holderBundle.definitionTotalSupply,
      velocitySupply: holderBundle.velocitySupply,
      supplyCoverage: holderBundle.supplyCoverage,
      holders: holderBundle.holders,
      holdersTotalSupply: holderBundle.holdersTotalSupply,
      holdersCount: holderBundle.holdersCount,
      holdersTotalCount: holderBundle.holdersTotalCount,
      distribution: holderBundle.distribution ?? createEmptyDistribution(),
      velocityWindows: activityBundle.velocityWindows,
      issuanceWindows: activityBundle.issuanceWindows,
      issuanceSeries: activityBundle.issuanceSeries,
      computedAt: activityBundle.computedAt,
    };
  } catch {
    if (localNonce !== runNonce) return;
    state.error = t('econometrics.fetchError');
  } finally {
    if (localNonce === runNonce) {
      state.isLoading = false;
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
    <BaseContentBlock :title="$t('econometrics.title')" class="econometrics-page__block">
      <template #header-action>
        <BaseButton line :disabled="!canCompute || state.isLoading" @click="handleCompute">
          {{ $t('econometrics.compute') }}
        </BaseButton>
      </template>

      <template #default>
        <div class="econometrics-page__filters">
          <label>
            <span class="label">{{ $t('econometrics.assetLabel') }}</span>
            <input v-model="assetInput" type="text" :placeholder="$t('econometrics.assetPlaceholder')" />
            <small v-if="assetInputError" class="econometrics-page__filters-error">
              {{ assetInputError }}
            </small>
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
              />
            </label>
            <label>
              <span class="label">{{ $t('assets.filters.ownerLabel') }}</span>
              <input
                v-model="assetDefinitionsFilters.owner"
                type="text"
                :placeholder="$t('assets.filters.ownerPlaceholder')"
              />
              <small v-if="ownerFilterError" class="econometrics-page__asset-filters-error">
                {{ ownerFilterError }}
              </small>
            </label>
          </div>

          <BaseTable
            v-model:cursor="assetDefinitionsState.cursor"
            v-model:page-size="assetDefinitionsState.limit"
            :loading="isAssetDefinitionsLoading"
            pagination-mode="cursor"
            :cursor-pagination="assetDefinitionsPagination"
            :items="assetDefinitions"
            :row-key="assetDefinitionRowKey"
            container-class="econometrics-page__asset-list"
            row-pointer
            @click:row="(asset) => startCompute(asset.id)"
          >
            <template #header>
              <div class="econometrics-page__asset-row econometrics-page__asset-row--header" role="presentation">
                <span class="h-sm cell" role="columnheader">{{ $t('econometrics.assetDefinition') }}</span>
                <span class="h-sm cell" role="columnheader">{{ $t('assets.assets') }}</span>
                <span class="h-sm cell" role="columnheader">{{ $t('econometrics.totalSupplyDefinition') }}</span>
                <span class="h-sm cell" role="columnheader">{{ $t('assets.filters.ownerLabel') }}</span>
              </div>
            </template>

            <template #row="{ item }">
              <div
                :class="[
                  'econometrics-page__asset-row',
                  selectedAssetDefinitionId === item.id ? 'econometrics-page__asset-row--selected' : null,
                ]"
                role="presentation"
              >
                <div class="econometrics-page__asset-definition cell" role="cell">
                  <span class="row-text-monospace">{{ item.id }}</span>
                </div>
                <span class="row-text-monospace cell" role="cell">{{ item.assets }}</span>
                <span class="row-text-monospace cell" role="cell">{{
                  item.total_quantity ? item.total_quantity.toString() : $t('none')
                }}</span>
                <span class="row-text-monospace cell" role="cell">{{ item.owned_by }}</span>
              </div>
            </template>
          </BaseTable>
        </BaseInnerBlock>

        <div v-if="state.error" class="econometrics-page__error row-text">
          {{ state.error }}
        </div>

        <div v-if="isInitialLoading" class="econometrics-page__loading">
          <BaseLoading />
          <div class="econometrics-page__loading-text row-text-monospace">
            {{ $t('econometrics.loading') }}
          </div>
        </div>

        <div v-else-if="result">
          <div v-if="state.isLoading" class="econometrics-page__refresh-indicator" aria-hidden="true">
            <BaseLoading />
          </div>

          <BaseInnerBlock :title="$t('econometrics.snapshotTitle')">
            <div class="econometrics-page__grid">
              <DataField :title="$t('econometrics.assetDefinition')" :value="result.assetDefinitionId" monospace />
              <DataField :title="$t('sorafs.columns.alias')" :value="result.assetDefinitionAlias" monospace />
              <DataField :title="$t('econometrics.holders')" :value="result.holdersCount" monospace />
              <DataField
                :title="$t('econometrics.totalSupplyDefinition')"
                :value="formatMaybeBigNumber(result.definitionTotalSupply)"
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
              <DataField :title="$t('econometrics.coverage')" :value="formatHolderCoverage(result)" monospace />
              <DataField :title="$t('econometrics.gini')" :value="formatRatio(result.distribution.gini, 6)" monospace />
              <DataField :title="$t('econometrics.hhi')" :value="formatRatio(result.distribution.hhi, 6)" monospace />
              <DataField
                :title="$t('econometrics.effectiveHolders')"
                :value="
                  result.distribution.effectiveHolders ? result.distribution.effectiveHolders.toFixed(2) : $t('none')
                "
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
                  result.distribution.entropyEffectiveHolders
                    ? result.distribution.entropyEffectiveHolders.toFixed(2)
                    : $t('none')
                "
                monospace
              />
              <DataField :title="$t('econometrics.top1')" :value="formatPercent(result.distribution.top1)" monospace />
              <DataField :title="$t('econometrics.top5')" :value="formatPercent(result.distribution.top5)" monospace />
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
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
                <div class="econometrics-page__holders-row" role="presentation">
                  <span class="h-sm cell" role="columnheader">{{ $t('accountId') }}</span>
                  <span class="h-sm cell" role="columnheader">{{ $t('value') }}</span>
                  <span class="h-sm cell" role="columnheader">{{ $t('econometrics.share') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div class="econometrics-page__holders-row" role="presentation">
                  <div class="cell" role="cell">
                    <BaseHash :hash="item.account" :link="`/accounts/${item.account}`" type="short" copy />
                  </div>
                  <span class="row-text-monospace cell" role="cell">{{ item.balance.toString() }}</span>
                  <span class="row-text-monospace cell" role="cell">{{ formatPercent(item.share) }}</span>
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
                <div
                  class="econometrics-page__velocity-row econometrics-page__velocity-row--header"
                  role="presentation"
                >
                  <span role="columnheader">{{ $t('econometrics.window') }}</span>
                  <span role="columnheader">{{ $t('econometrics.transferMatched') }}</span>
                  <span role="columnheader">{{ $t('econometrics.transferAmount') }}</span>
                  <span role="columnheader">{{ $t('econometrics.turnover') }}</span>
                  <span role="columnheader">{{ $t('econometrics.velocity') }}</span>
                  <span role="columnheader">{{ $t('econometrics.transferPerDay') }}</span>
                  <span role="columnheader">{{ $t('econometrics.uniqueSenders') }}</span>
                  <span role="columnheader">{{ $t('econometrics.uniqueReceivers') }}</span>
                  <span role="columnheader">{{ $t('econometrics.coverageShort') }}</span>
                </div>
              </template>
              <template #row="{ item }">
                <div class="econometrics-page__velocity-row" role="presentation">
                  <span class="row-text-monospace" role="cell">{{ formatWindowLabel(item.key) }}</span>
                  <span class="row-text-monospace" role="cell">{{ item.transfers }}</span>
                  <span class="row-text-monospace" role="cell">
                    {{ item.amount ? item.amount.toString() : $t('none') }}
                    <span v-if="item.amountParsed + item.amountMissing > 0" class="econometrics-page__sub"
                      >({{ item.amountParsed }}/{{ item.amountParsed + item.amountMissing }})</span
                    >
                  </span>
                  <span class="row-text-monospace" role="cell">{{ formatPercent(item.turnover) }}</span>
                  <span class="row-text-monospace" role="cell">{{ formatRatio(item.velocityPerDay, 6) }}</span>
                  <span class="row-text-monospace" role="cell">{{ formatRatio(item.transfersPerDay, 3) }}</span>
                  <span class="row-text-monospace" role="cell">{{ item.uniqueSenders }}</span>
                  <span class="row-text-monospace" role="cell">{{ item.uniqueReceivers }}</span>
                  <span class="row-text-monospace" role="cell">{{
                    item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled')
                  }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="econometrics-page__mobile-card">
                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.window') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatWindowLabel(item.key)
                    }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferMatched') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{ item.transfers }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferAmount') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ item.amount ? item.amount.toString() : $t('none') }}
                      <span v-if="item.amountParsed + item.amountMissing > 0" class="econometrics-page__sub"
                        >({{ item.amountParsed }}/{{ item.amountParsed + item.amountMissing }})</span
                      >
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.turnover') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatPercent(item.turnover)
                    }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.velocity') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatRatio(item.velocityPerDay, 6)
                    }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.transferPerDay') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatRatio(item.transfersPerDay, 3)
                    }}</span>
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
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
                <div
                  class="econometrics-page__issuance-row econometrics-page__issuance-row--header"
                  role="presentation"
                >
                  <span role="columnheader">{{ $t('econometrics.window') }}</span>
                  <span role="columnheader">{{ $t('econometrics.minted') }}</span>
                  <span role="columnheader">{{ $t('econometrics.burned') }}</span>
                  <span role="columnheader">{{ $t('econometrics.netIssuance') }}</span>
                  <span role="columnheader">{{ $t('econometrics.coverageShort') }}</span>
                </div>
              </template>
              <template #row="{ item }">
                <div class="econometrics-page__issuance-row" role="presentation">
                  <span class="row-text-monospace" role="cell">{{ formatWindowLabel(item.key) }}</span>
                  <span class="row-text-monospace" role="cell">
                    {{ formatMaybeBigNumber(item.minted) }}
                    <span v-if="item.mintAmountParsed + item.mintAmountMissing > 0" class="econometrics-page__sub"
                      >({{ item.mintAmountParsed }}/{{ item.mintAmountParsed + item.mintAmountMissing }})</span
                    >
                  </span>
                  <span class="row-text-monospace" role="cell">
                    {{ formatMaybeBigNumber(item.burned) }}
                    <span v-if="item.burnAmountParsed + item.burnAmountMissing > 0" class="econometrics-page__sub"
                      >({{ item.burnAmountParsed }}/{{ item.burnAmountParsed + item.burnAmountMissing }})</span
                    >
                  </span>
                  <span class="row-text-monospace" role="cell">{{ formatMaybeBigNumber(item.net) }}</span>
                  <span class="row-text-monospace" role="cell">{{
                    item.complete ? $t('econometrics.coverageComplete') : $t('econometrics.coverageSampled')
                  }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="econometrics-page__mobile-card">
                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.window') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatWindowLabel(item.key)
                    }}</span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.minted') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ formatMaybeBigNumber(item.minted) }}
                      <span v-if="item.mintAmountParsed + item.mintAmountMissing > 0" class="econometrics-page__sub"
                        >({{ item.mintAmountParsed }}/{{ item.mintAmountParsed + item.mintAmountMissing }})</span
                      >
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.burned') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">
                      {{ formatMaybeBigNumber(item.burned) }}
                      <span v-if="item.burnAmountParsed + item.burnAmountMissing > 0" class="econometrics-page__sub"
                        >({{ item.burnAmountParsed }}/{{ item.burnAmountParsed + item.burnAmountMissing }})</span
                      >
                    </span>
                  </div>

                  <div class="econometrics-page__mobile-row">
                    <span class="h-sm econometrics-page__mobile-label">{{ $t('econometrics.netIssuance') }}</span>
                    <span class="row-text-monospace econometrics-page__mobile-value">{{
                      formatMaybeBigNumber(item.net)
                    }}</span>
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
        </div>

        <div v-else class="econometrics-page__empty row-text">
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
    grid-template-columns: minmax(80px, 0.9fr) minmax(130px, 1.5fr) minmax(130px, 1.5fr) minmax(130px, 1.5fr) minmax(
        90px,
        0.9fr
      );

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
