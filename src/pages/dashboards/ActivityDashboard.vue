<template>
  <DashboardShell
    active="activity"
    :title="$t('dashboards.titles.activity')"
    :subtitle="$t('dashboards.subtitles.activity')"
  >
    <template #controls>
      <span class="activity-dashboard__coverage">{{ coverageText }}</span>
      <DashSegmented
        v-model="windowSize"
        :options="windowOptions"
        :label="$t('dashboards.window.label')"
      />
    </template>

    <p
      v-if="blocks.error.value || sample.error.value"
      class="activity-dashboard__error"
      role="alert"
    >
      {{ $t('dashboards.errors.history') }}
      <button
        type="button"
        class="activity-dashboard__retry"
        @click="retry"
      >
        {{ $t('dashboards.errors.retry') }}
      </button>
    </p>

    <div class="activity-dashboard__tiles">
      <DashStatTile
        :label="$t('dashboards.stats.transactions')"
        :value="summary.timedBlocks === 0 ? '—' : formatCompactNumber(summary.transactionsTotal)"
        :hint="transactionsHint"
      />
      <DashStatTile
        :label="$t('dashboards.stats.rejectionRate')"
        :value="formatPercent(summary.rejectionRate)"
      />
      <DashStatTile
        :label="$t('dashboards.activity.latency.median')"
        :value="latencySummary ? formatDuration(latencySummary.median) : '—'"
        :hint="latencySummary ? $t('dashboards.activity.latency.p95', { value: isolateText(formatDuration(latencySummary.p95)) }) : ''"
      />
      <DashStatTile
        :label="$t('dashboards.activity.authoritiesCount')"
        :value="sample.items.value.length > 0 ? formatCompactNumber(distinctAuthorities) : '—'"
        :hint="$t('dashboards.activity.sample.size', { count: sample.items.value.length })"
      />
    </div>

    <DashPanel>
      <ChartFrame
        :title="$t('dashboards.activity.heatmap.title')"
        :caption="$t('dashboards.activity.heatmap.caption')"
        :table="heatmapTable"
        :empty="heatmap.days.length === 0 && !blocks.isLoading.value ? $t('dashboards.chart.empty') : ''"
        :busy="blocks.isScanning.value"
      >
        <template #default="{ width }">
          <HeatmapChart
            :heatmap
            :width
            :chart-label="$t('dashboards.activity.heatmap.title')"
            :value-label="$t('dashboards.activity.heatmap.value')"
            :blocks-label="$t('dashboards.activity.heatmap.blocks')"
            :no-data-label="$t('dashboards.chart.noData')"
            :partial-note="$t('dashboards.chart.partial')"
            :format-day
            :format-hour
            :format-value="formatCompactNumber"
            :format-slot
          />
        </template>
      </ChartFrame>
    </DashPanel>

    <div class="activity-dashboard__grid">
      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.activity.byHour.title')"
          :caption="$t('dashboards.activity.byHour.caption')"
          :legend="hourLegend"
          :table="hourTable"
          :busy="blocks.isScanning.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="hourColumns"
              :series="hourSeries"
              :width
              :axis="hourAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :chart-label="$t('dashboards.activity.byHour.title')"
              :unknown-label="$t('dashboards.chart.noData')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.activity.latency.title')"
          :caption="$t('dashboards.activity.latency.caption')"
          :table="latencyTable"
          :note="latencyNote"
          :empty="latencyColumns.length === 0 && !sample.isLoading.value ? $t('dashboards.activity.latency.empty') : ''"
          :busy="sample.isLoading.value || blocks.isScanning.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="latencyColumns"
              :series="latencySeries"
              :width
              :axis="latencyAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :chart-label="$t('dashboards.activity.latency.title')"
              :unknown-label="$t('dashboards.chart.noData')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel
        :title="$t('dashboards.activity.executables.title')"
        :caption="`${$t('dashboards.activity.executables.caption')} ${$t('dashboards.activity.sample.caption', { count: sample.items.value.length })}.`"
      >
        <ShareBar
          :segments="executableSegments"
          :chart-label="$t('dashboards.activity.executables.title')"
          :format-value="formatCompactNumber"
        />
        <h3 class="activity-dashboard__subhead">
          {{ $t('dashboards.activity.outcomes.title') }}
        </h3>
        <ShareBar
          :segments="outcomeSegments"
          :chart-label="$t('dashboards.activity.outcomes.title')"
          :format-value="formatCompactNumber"
        />
      </DashPanel>

      <DashPanel
        :title="$t('dashboards.activity.authorities.title')"
        :caption="$t('dashboards.activity.authorities.caption')"
      >
        <RankedBars
          v-if="authorities.length > 0"
          :items="authorities"
          :color="CHART_COLORS.accent"
          :format-value="formatCompactNumber"
        />
        <p
          v-else
          class="activity-dashboard__muted"
        >
          {{ sample.isLoading.value ? '…' : $t('dashboards.activity.authorities.empty') }}
        </p>
      </DashPanel>
    </div>
  </DashboardShell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DashboardShell from './DashboardShell.vue';
import DashPanel from '@/shared/ui/dashboard/DashPanel.vue';
import DashSegmented from '@/shared/ui/dashboard/DashSegmented.vue';
import DashStatTile from '@/shared/ui/dashboard/DashStatTile.vue';
import ChartFrame from '@/shared/ui/dashboard/ChartFrame.vue';
import ColumnChart from '@/shared/ui/dashboard/ColumnChart.vue';
import HeatmapChart from '@/shared/ui/dashboard/HeatmapChart.vue';
import RankedBars from '@/shared/ui/dashboard/RankedBars.vue';
import ShareBar from '@/shared/ui/dashboard/ShareBar.vue';
import { CHART_COLORS, type ChartTable, type RankedItem, type ShareSegment } from '@/shared/ui/dashboard/types';
import { useBlockSampleWindow } from '@/shared/ui/composables/useBlockSampleWindow';
import { useBoundedScan } from '@/shared/ui/composables/useBoundedScan';
import { useRouteQueryState } from '@/shared/ui/composables/useRouteQueryState';
import { fetchTransactionSamples } from '@/shared/api';
import {
  dayHourHeatmap,
  durationHistogram,
  inclusionLatencies,
  observedSpans,
  summarizeDistribution,
  summarizeWindow,
} from '@/shared/lib/chain-analytics';
import { formatCompactNumber, formatDuration, formatPercent, niceZeroBasedAxis } from '@/shared/lib/chart-scale';
import { useNow, useThrottleFn } from '@vueuse/core';
import {
  coverageFootnote,
  coverageMessageKey,
  histogramColumns,
  hourOfDayColumns,
  parseWindowParam,
  rankCounts,
} from '@/shared/lib/dashboard-models';
import { intlLocale } from '@/shared/lib/intl-locale';
import { isolateText } from '@/shared/lib/bidi';

const WINDOW_SIZES = [500, 1000, 2000] as const;
const DEFAULT_WINDOW = 1000;
const TRANSACTION_SAMPLE = 500;
/** New blocks bring new transactions; the sample follows the head at most this often. */
const SAMPLE_REFRESH_MS = 30_000;
const HEATMAP_DAYS = 7;
const EXECUTABLES = ['Instructions', 'ContractCall', 'Ivm', 'IvmProved', 'Batch'] as const;

const { t, locale } = useI18n();
const { route, updateRouteQuery } = useRouteQueryState();

const windowSize = computed<number>({
  get: () => parseWindowParam(route.query.window, WINDOW_SIZES, DEFAULT_WINDOW),
  set: (value) => {
    updateRouteQuery({ window: value === DEFAULT_WINDOW ? null : String(value) }).catch(() => {});
  },
});
const windowOptions = computed(() =>
  WINDOW_SIZES.map((value) => ({ value, label: t('dashboards.window.blocks', { count: value }) }))
);

const blocks = useBlockSampleWindow(windowSize);
const sample = useBoundedScan(fetchTransactionSamples, TRANSACTION_SAMPLE);

function retry() {
  blocks.retry();
  sample.retry();
}

// Keep the sample (and the latency join) aligned with the live block window.
const refreshSample = useThrottleFn(() => sample.refresh(), SAMPLE_REFRESH_MS, true, true);
watch(
  () => blocks.samples.value[blocks.samples.value.length - 1]?.height ?? null,
  (height, previous) => {
    if (height !== null && previous !== null && previous !== undefined && height > previous) refreshSample();
  }
);

const summary = computed(() => summarizeWindow(blocks.samples.value));
const unreadable = computed(() => summary.value.blocks - summary.value.timedBlocks);
/** Totals skip blocks whose bodies are unavailable, and say so. */
const transactionsHint = computed(() =>
  [
    `${formatCompactNumber(summary.value.blocks)} ${t('dashboards.stats.blocks').toLowerCase()}`,
    unreadable.value > 0 ? t('dashboards.stats.unreadableHint') : '',
  ]
    .filter(Boolean)
    .join(' · ')
);
const footnoteLabels = computed(() => ({ partial: t('dashboards.chart.partial'), unknown: t('dashboards.chart.noData') }));

const coverageText = computed(() => {
  const coverage = blocks.coverage.value;
  const key = coverageMessageKey(coverage, { scanning: blocks.isScanning.value, reachedGenesis: blocks.reachedGenesis.value });
  return t(`dashboards.coverage.${key}`, coverage);
});

// Heatmap ------------------------------------------------------------------------
const now = useNow({ interval: 1000 });
const observedUntil = computed(() => blocks.observedUntil(now.value.getTime()));
const spans = computed(() => observedSpans(blocks.samples.value, observedUntil.value));
const heatmap = computed(() => dayHourHeatmap(blocks.samples.value, { spans: spans.value, maxDays: HEATMAP_DAYS }));
const dayFormat = computed(() => new Intl.DateTimeFormat(intlLocale(locale.value), { weekday: 'short', day: 'numeric' }));
const slotFormat = computed(
  () =>
    new Intl.DateTimeFormat(intlLocale(locale.value), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
);
const formatDay = (ms: number) => dayFormat.value.format(ms);
const formatHour = (hour: number) => String(hour).padStart(2, '0');
const formatSlot = (ms: number) => slotFormat.value.format(ms);
const heatmapTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'slot', label: t('dashboards.chart.time') },
    { key: 'transactions', label: t('dashboards.activity.heatmap.value'), align: 'end' },
    { key: 'blocks', label: t('dashboards.activity.heatmap.blocks'), align: 'end' },
  ],
  rows: heatmap.value.cells
    .filter((cell) => cell.coverage !== 'none')
    .reverse()
    .map((cell) => ({
      slot: `${formatSlot(cell.startMs)}${cell.coverage === 'partial' ? ' *' : ''}`,
      transactions: cell.transactions,
      blocks: cell.blocks,
    })),
  footnote: coverageFootnote(
    heatmap.value.cells.map((cell) => cell.coverage).filter((coverage) => coverage !== 'none'),
    footnoteLabels.value
  ),
}));

// Hour-of-day profile -----------------------------------------------------------
const hourColumns = computed(() =>
  hourOfDayColumns(heatmap.value, (hour) => `${formatHour(hour)}:00`, t('dashboards.chart.partial'))
);
const hourCoverages = computed(() =>
  hourColumns.value.map((column) => (column.values === null ? 'none' : column.partial ? 'partial' : 'full') as const)
);
/** Keys for the hollow lower-bound mark and the hatch, shown only when a column uses them. */
const hourLegend = computed(() => [
  ...(hourCoverages.value.includes('partial')
    ? [{ key: 'partial', label: t('dashboards.chart.partial'), color: CHART_COLORS.muted, shape: 'hollow' as const }]
    : []),
  ...(hourCoverages.value.includes('none')
    ? [{ key: 'unknown', label: t('dashboards.chart.noData'), color: CHART_COLORS.muted, shape: 'hatch' as const }]
    : []),
]);
const hourSeries = computed(() => [
  { key: 'transactions', label: t('dashboards.activity.byHour.series'), color: CHART_COLORS.accent },
]);
const hourAxis = computed(() =>
  niceZeroBasedAxis(Math.max(0, ...hourColumns.value.map((column) => column.values?.transactions ?? 0)), 4)
);
const hourTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'hour', label: t('dashboards.chart.time') },
    { key: 'transactions', label: t('dashboards.activity.byHour.series'), align: 'end' },
  ],
  rows: hourColumns.value.map((column) => ({
    hour: `${column.label}${column.partial ? ' *' : ''}`,
    transactions: column.values ? column.values.transactions! : '—',
  })),
  footnote: coverageFootnote(hourCoverages.value, footnoteLabels.value),
}));

// Inclusion latency: a distribution, so long waits read as demand, not a verdict.
const latency = computed(() => inclusionLatencies(sample.items.value, blocks.samples.value));
const latencySummary = computed(() => summarizeDistribution(latency.value.values));
const latencyColumns = computed(() => histogramColumns(durationHistogram(latency.value.values)));
const latencySeries = computed(() => [
  { key: 'count', label: t('dashboards.activity.latency.series'), color: CHART_COLORS.series[0] },
]);
const latencyAxis = computed(() =>
  niceZeroBasedAxis(Math.max(0, ...latencyColumns.value.map((column) => column.values?.count ?? 0)), 4)
);
const latencyNote = computed(() =>
  [
    latency.value.clockAhead > 0 ? t('dashboards.activity.latency.clockAhead', { count: latency.value.clockAhead }) : '',
    latency.value.unmatched > 0 ? t('dashboards.activity.latency.unmatched', { count: latency.value.unmatched }) : '',
  ]
    .filter(Boolean)
    .join(' ')
);
const latencyTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'range', label: t('dashboards.charts.distribution.range') },
    { key: 'count', label: t('dashboards.activity.latency.series'), align: 'end' },
  ],
  rows: latencyColumns.value.map((column) => ({ range: column.label, count: column.values?.count ?? 0 })),
}));

// Transaction sample ------------------------------------------------------------
const executableSegments = computed<ShareSegment[]>(() => {
  const counts = new Map<string, number>();
  for (const row of sample.items.value) {
    const key = (EXECUTABLES as readonly string[]).includes(row.executable) ? row.executable : 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Colour follows the executable kind, never its rank.
  return [...EXECUTABLES, 'other' as const].flatMap((key, index) => {
    const value = counts.get(key) ?? 0;
    if (value === 0) return [];
    return [
      {
        key,
        label: t(`dashboards.activity.executables.${key}`),
        value,
        color: key === 'other' ? CHART_COLORS.muted : CHART_COLORS.series[index]!,
      },
    ];
  });
});

const outcomeSegments = computed<ShareSegment[]>(() => {
  const rejected = sample.items.value.filter((row) => row.status === 'Rejected').length;
  return [
    { key: 'committed', label: t('dashboards.activity.outcomes.committed'), value: sample.items.value.length - rejected, color: CHART_COLORS.good },
    { key: 'rejected', label: t('dashboards.activity.outcomes.rejected'), value: rejected, color: CHART_COLORS.critical },
  ];
});

const distinctAuthorities = computed(() => new Set(sample.items.value.map((row) => row.authority)).size);

function shortAccount(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

const authorities = computed<RankedItem[]>(() =>
  rankCounts(sample.items.value, (row) => row.authority, 8).ranked.map((entry) => ({
    key: entry.key,
    label: shortAccount(entry.key),
    value: entry.count,
    to: { name: 'account-details', params: { id: entry.key } },
  }))
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.activity-dashboard {
  &__coverage {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }

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
    margin-bottom: size(1.5);
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
  }

  &__muted {
    @include tpg-s4;
    color: theme-color('dash-ink-muted');
  }
}
</style>
