<template>
  <DashboardShell
    active="ledger"
    :title="$t('dashboards.titles.ledger')"
    :subtitle="$t('dashboards.subtitles.ledger')"
  >
    <p
      v-if="domains.error.value || definitions.error.value || accounts.error.value"
      class="ledger-dashboard__error"
      role="alert"
    >
      {{ $t('dashboards.errors.history') }}
      <button
        type="button"
        class="ledger-dashboard__retry"
        @click="retry"
      >
        {{ $t('dashboards.errors.retry') }}
      </button>
    </p>

    <DashPanel>
      <template #actions>
        <DashLamp
          :tone="countsTone"
          :label="countsCaption"
          data-test="telemetry-state"
        />
      </template>
      <div class="ledger-dashboard__tiles">
        <DashStatTile
          :label="$t('dashboards.ledger.accounts')"
          :value="metricText(metrics?.accounts)"
        />
        <DashStatTile
          :label="$t('dashboards.ledger.domains')"
          :value="metricText(metrics?.domains)"
        />
        <DashStatTile
          :label="$t('dashboards.ledger.assets')"
          :value="metricText(metrics?.assets)"
        />
        <DashStatTile
          :label="$t('dashboards.ledger.nodes')"
          :value="metricText(metrics?.peers)"
        />
      </div>
    </DashPanel>

    <div class="ledger-dashboard__grid">
      <DashPanel
        :title="$t('dashboards.ledger.domainsByAccounts.title')"
        :caption="`${$t('dashboards.ledger.domainsByAccounts.caption', { count: TOP })} ${scanText(domains, 'domains')}`"
      >
        <RankedBars
          :items="domainRanking"
          :color="CHART_COLORS.accent"
          :format-value="formatCompactNumber"
        />
      </DashPanel>

      <DashPanel
        :title="$t('dashboards.ledger.definitionsByBalances.title')"
        :caption="`${$t('dashboards.ledger.definitionsByBalances.caption', { count: TOP })} ${scanText(definitions, 'definitions')}`"
      >
        <RankedBars
          :items="definitionRanking"
          :color="CHART_COLORS.accent"
          :format-value="formatCompactNumber"
        />
      </DashPanel>

      <DashPanel
        :title="$t('dashboards.ledger.mintability.title')"
        :caption="$t('dashboards.ledger.mintability.caption')"
      >
        <ShareBar
          :segments="mintabilitySegments"
          :chart-label="$t('dashboards.ledger.mintability.title')"
          :format-value="formatCompactNumber"
        />
        <h3 class="ledger-dashboard__subhead">
          {{ $t('dashboards.ledger.homes.title') }}
        </h3>
        <p class="ledger-dashboard__subcaption">
          {{ $t('dashboards.ledger.homes.caption') }}
        </p>
        <ShareBar
          :segments="homeSegments"
          :chart-label="$t('dashboards.ledger.homes.title')"
          :format-value="formatCompactNumber"
        />
      </DashPanel>

      <DashPanel class="ledger-dashboard__holdings">
        <ChartFrame
          :title="$t('dashboards.ledger.holdings.title')"
          :caption="`${$t('dashboards.ledger.holdings.caption')} ${scanText(accounts, 'accounts')}`"
          :table="holdingsTable"
          :busy="accounts.isLoading.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="holdingColumns"
              :series="holdingSeries"
              :width
              :axis="holdingAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :chart-label="$t('dashboards.ledger.holdings.title')"
              :unknown-label="$t('dashboards.chart.noData')"
            />
          </template>
        </ChartFrame>
      </DashPanel>
    </div>
  </DashboardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DashboardShell from './DashboardShell.vue';
import DashPanel from '@/shared/ui/dashboard/DashPanel.vue';
import DashStatTile from '@/shared/ui/dashboard/DashStatTile.vue';
import DashLamp, { type DashLampTone } from '@/shared/ui/dashboard/DashLamp.vue';
import ChartFrame from '@/shared/ui/dashboard/ChartFrame.vue';
import ColumnChart from '@/shared/ui/dashboard/ColumnChart.vue';
import RankedBars from '@/shared/ui/dashboard/RankedBars.vue';
import ShareBar from '@/shared/ui/dashboard/ShareBar.vue';
import { CHART_COLORS, type ChartTable, type RankedItem, type ShareSegment } from '@/shared/ui/dashboard/types';
import { useBoundedScan } from '@/shared/ui/composables/useBoundedScan';
import { useTelemetryMetrics } from '@/shared/ui/composables/useTelemetryMetrics';
import { fetchAccounts, fetchAssetDefinitions, fetchDomains } from '@/shared/api';
import { formatCompactNumber, niceZeroBasedAxis } from '@/shared/lib/chart-scale';
import { countIntoBuckets } from '@/shared/lib/dashboard-models';

const TOP = 10;
const SCAN_LIMIT = 1000;
const HOLDING_EDGES = [0, 1, 2, 3, 6, 11, 21];
const MINTABILITY = ['Infinitely', 'Once', 'Not', 'Limited'] as const;

const { t } = useI18n();
const telemetry = useTelemetryMetrics();
const metrics = computed(() => telemetry.metrics.value);
const countsTone = computed<DashLampTone>(() => {
  if (telemetry.isUnavailable.value) return 'off';
  if (telemetry.isStale.value) return 'warning';
  return metrics.value ? 'good' : 'idle';
});
const countsCaption = computed(() => {
  if (telemetry.isUnavailable.value) return t('dashboards.ledger.countsUnavailable');
  if (telemetry.isStale.value) return t('dashboards.ledger.countsStale');
  return t('dashboards.ledger.countsLive');
});

const domains = useBoundedScan(fetchDomains, SCAN_LIMIT);
const definitions = useBoundedScan(fetchAssetDefinitions, SCAN_LIMIT);
const accounts = useBoundedScan(fetchAccounts, SCAN_LIMIT);

function retry() {
  domains.retry();
  definitions.retry();
  accounts.retry();
}

function metricText(value: number | undefined): string {
  return value === undefined ? '—' : formatCompactNumber(value);
}

/** Say exactly how much of the collection the figures cover. */
function scanText(scan: { items: { value: unknown[] }, complete: { value: boolean } }, kind: 'domains' | 'definitions' | 'accounts') {
  const params = { loaded: formatCompactNumber(scan.items.value.length), kind: t(`dashboards.ledger.kinds.${kind}`) };
  return scan.complete.value ? t('dashboards.ledger.scan', params) : t('dashboards.ledger.scanIncomplete', params);
}

const domainRanking = computed<RankedItem[]>(() =>
  [...domains.items.value]
    .sort((left, right) => right.accounts - left.accounts || left.id.localeCompare(right.id))
    .slice(0, TOP)
    .map((domain) => ({
      key: domain.id,
      label: domain.id,
      value: domain.accounts,
      to: { name: 'domain-details', params: { id: domain.id } },
    }))
);

const definitionRanking = computed<RankedItem[]>(() =>
  [...definitions.items.value]
    .sort((left, right) => right.assets - left.assets || String(left.id).localeCompare(String(right.id)))
    .slice(0, TOP)
    .map((definition) => ({
      key: String(definition.id),
      label: String(definition.id),
      value: definition.assets,
      to: { name: 'asset-details', params: { id: String(definition.id) } },
    }))
);

const mintabilitySegments = computed<ShareSegment[]>(() => {
  const counts = new Map<string, number>();
  for (const definition of definitions.items.value) {
    const key = String(definition.mintable).startsWith('Limited') ? 'Limited' : String(definition.mintable);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return MINTABILITY.flatMap((key, index) => {
    const value = counts.get(key) ?? 0;
    return value > 0
      ? [{ key, label: t(`dashboards.ledger.mintability.${key}`), value, color: CHART_COLORS.series[index]! }]
      : [];
  });
});

/** A definition lives in a domain, in a data space, or (with neither home) globally. */
const homeSegments = computed<ShareSegment[]>(() => {
  const counts = { domain: 0, dataspace: 0, global: 0 };
  for (const definition of definitions.items.value) {
    if (definition.owning_domain !== null && definition.owning_domain !== undefined) counts.domain += 1;
    else if (definition.owning_dataspace !== null && definition.owning_dataspace !== undefined) counts.dataspace += 1;
    else counts.global += 1;
  }
  // Categorical hues in their validated order, fixed to each home.
  const colors = { domain: CHART_COLORS.series[0], dataspace: CHART_COLORS.series[1], global: CHART_COLORS.series[2] };
  return (['domain', 'dataspace', 'global'] as const).flatMap((key) =>
    counts[key] > 0 ? [{ key, label: t(`dashboards.ledger.homes.${key}`), value: counts[key], color: colors[key] }] : []
  );
});

const holdingColumns = computed(() =>
  countIntoBuckets(
    accounts.items.value.map((account) => account.owned_assets),
    HOLDING_EDGES
  )
);
const holdingSeries = computed(() => [
  { key: 'count', label: t('dashboards.ledger.holdings.series'), color: CHART_COLORS.accent },
]);
const holdingAxis = computed(() =>
  niceZeroBasedAxis(Math.max(0, ...holdingColumns.value.map((column) => column.values?.count ?? 0)), 4)
);
const holdingsTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'bucket', label: t('dashboards.ledger.holdings.bucket') },
    { key: 'count', label: t('dashboards.ledger.holdings.series'), align: 'end' },
  ],
  rows: holdingColumns.value.map((column) => ({ bucket: column.label, count: column.values?.count ?? 0 })),
}));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.ledger-dashboard {
  &__error {
    @include dash-well-surface(size(2));
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1.5);
    padding: size(1.5) size(2);
    color: theme-color('content-primary');
  }

  &__retry {
    @include dash-key-surface(size(1.25));
    border: none;
    padding: size(0.75) size(1.5);
    cursor: pointer;
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
  }

  &__tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: size(2);

    @include md {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: size(2.5);

    @include lg {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__subhead {
    margin-top: size(2.5);
    margin-bottom: size(0.5);
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
  }

  &__subcaption {
    margin-bottom: size(1.5);
    @include tpg-s4;
    color: theme-color('dash-ink-muted');
  }
}
</style>
