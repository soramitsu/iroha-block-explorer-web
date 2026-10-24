<template>
  <DashboardShell
    active="network"
    :title="$t('dashboards.titles.network')"
    :subtitle="$t('dashboards.subtitles.network')"
  >
    <template #controls>
      <DashLamp
        :tone="blocks.isLive.value ? 'good' : 'idle'"
        :pulse="blocks.isLive.value"
        :label="blocks.isLive.value ? $t('dashboards.live.streaming') : $t('dashboards.live.polling')"
      />
      <DashSegmented
        v-model="windowSize"
        :options="windowOptions"
        :label="$t('dashboards.window.label')"
      />
    </template>

    <p
      v-if="blocks.error.value"
      class="network-dashboard__error"
      role="alert"
    >
      {{ $t('dashboards.errors.history') }}
      <button
        type="button"
        class="network-dashboard__retry"
        @click="blocks.retry()"
      >
        {{ $t('dashboards.errors.retry') }}
      </button>
    </p>

    <DashPanel
      :title="$t('dashboards.instruments.title')"
      :caption="$t('dashboards.peerScope')"
    >
      <template #actions>
        <DashLamp
          :tone="chainStateTone"
          :label="$t(`dashboards.state.${chainState}`)"
          data-test="chain-state"
        />
      </template>

      <div class="network-dashboard__cluster">
        <div class="network-dashboard__height">
          <span class="network-dashboard__label">{{ $t('dashboards.instruments.height') }}</span>
          <DashOdometer
            :value="headHeight"
            :label="$t('dashboards.instruments.height')"
          />
          <span class="network-dashboard__meta">
            {{ lastBlockAgeMs === null ? '—' : $t('dashboards.instruments.lastBlock', { age: isolateText(formatDuration(lastBlockAgeMs)) }) }}
          </span>
          <span class="network-dashboard__meta">{{ coverageText }}</span>
        </div>

        <DashDial
          :value="node.status.value?.commit_time_ms ?? null"
          :min="100"
          :max="MINUTE_MS"
          scale="log"
          :ticks="COMMIT_TICKS"
          :format-tick="formatDurationTick"
          :label="$t('dashboards.instruments.commit')"
          :readout="formatDuration(node.status.value?.commit_time_ms ?? null)"
          :caption="$t('dashboards.instruments.commitHint')"
        />

        <DashDial
          :value="queueCapacity > 0 ? queueDepth : null"
          :min="0"
          :max="Math.max(1, queueCapacity)"
          :ticks="queueAxis.ticks"
          :format-tick="formatCompactNumber"
          :zones="queueZones"
          :label="$t('dashboards.instruments.queue')"
          :readout="queueReadout"
          :caption="queueCaption"
        />

        <div
          class="network-dashboard__activity"
          data-test="last-hour"
        >
          <DashStatTile
            :label="$t('dashboards.instruments.lastHour')"
            :value="lastHour.observedMs === 0 ? '—' : formatCompactNumber(lastHour.transactions)"
            :unit="lastHour.observedMs === 0 ? '' : $t('dashboards.instruments.lastHourUnit')"
            :hint="lastHourHint"
            :trend="lastHourTrend"
          />
          <span
            v-if="peak"
            class="network-dashboard__meta"
          >
            {{ $t('dashboards.instruments.busiestMinute', { count: formatCompactNumber(peak.transactions), time: clockFormat.format(peak.startMs) }) }}
          </span>
        </div>
      </div>

      <div class="network-dashboard__meters">
        <DashMeter
          :label="$t('dashboards.instruments.rejections')"
          :value="node.status.value?.txs_rejected ?? null"
          :max="txTotal"
          :value-text="rejectionsText"
          :caption="node.status.value ? $t('dashboards.instruments.rejectionsHint', { recent: formatCompactNumber(node.status.value.txs_rejected_recent_5m) }) : ''"
        />
        <div class="network-dashboard__readout">
          <span>{{ $t('dashboards.instruments.peers') }}</span>
          <strong>{{ node.status.value ? formatCompactNumber(node.status.value.peers) : '—' }}</strong>
          <small>{{ $t('dashboards.instruments.peersHint') }}</small>
        </div>
        <div class="network-dashboard__readout">
          <span>{{ $t('dashboards.instruments.viewChanges') }}</span>
          <strong>{{ node.status.value ? formatCompactNumber(node.status.value.view_changes) : '—' }}</strong>
          <small>{{ $t('dashboards.instruments.sinceGenesis') }}: <bdi>{{ uptimeText }}</bdi></small>
        </div>
      </div>
    </DashPanel>

    <div class="network-dashboard__grid">
      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.charts.perBlock.title')"
          :caption="perBlockCaption"
          :legend="outcomeLegend"
          :table="perBlockTable"
          :empty="blocks.samples.value.length === 0 && !blocks.isLoading.value ? $t('dashboards.chart.empty') : ''"
          :busy="blocks.isScanning.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="perBlock"
              :series="outcomeSeries"
              :width
              :axis="perBlockAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :total-label="$t('dashboards.chart.total')"
              :chart-label="$t('dashboards.charts.perBlock.title')"
              :unknown-label="$t('dashboards.chart.unknown')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.charts.distribution.title')"
          :caption="$t('dashboards.charts.distribution.caption', { count: blocks.samples.value.length })"
          :table="waitTable"
          :note="waitMedian === null ? '' : $t('dashboards.charts.distribution.median', { value: isolateText(formatDuration(waitMedian)) })"
          :empty="waitColumns.length === 0 && !blocks.isLoading.value ? $t('dashboards.chart.empty') : ''"
          :busy="blocks.isScanning.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="waitColumns"
              :series="waitSeries"
              :width
              :axis="waitAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :chart-label="$t('dashboards.charts.distribution.title')"
              :unknown-label="$t('dashboards.chart.unknown')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.charts.throughput.title')"
          :caption="$t('dashboards.charts.throughput.caption', { bucket: isolateText(formatDuration(bucketMs)) })"
          :legend="throughputLegend"
          :table="throughputTable"
          :empty="throughput.length < 2 && !blocks.isLoading.value ? $t('dashboards.chart.empty') : ''"
          :busy="blocks.isScanning.value"
        >
          <template #default="{ width }">
            <TimeSeriesChart
              :points="throughput"
              :series="throughputSeries"
              :width
              :axis="throughputAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :format-range
              :partial-note="$t('dashboards.chart.partial')"
              :unknown-label="$t('dashboards.chart.unknown')"
              :chart-label="$t('dashboards.charts.throughput.title')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel>
        <ChartFrame
          :title="$t('dashboards.charts.blockFill.title')"
          :caption="$t('dashboards.charts.blockFill.caption')"
          :table="fillTable"
          :empty="summary.timedBlocks === 0 && !blocks.isLoading.value ? $t('dashboards.chart.empty') : ''"
          :busy="blocks.isScanning.value"
        >
          <template #default="{ width }">
            <ColumnChart
              :data="fillColumns"
              :series="fillSeries"
              :width
              :axis="fillAxis"
              :format-tick="formatCompactNumber"
              :format-value="formatCompactNumber"
              :chart-label="$t('dashboards.charts.blockFill.title')"
              :unknown-label="$t('dashboards.chart.unknown')"
            />
          </template>
        </ChartFrame>
      </DashPanel>

      <DashPanel
        :title="$t('dashboards.charts.lanes.title')"
        :caption="$t('dashboards.charts.lanes.caption')"
      >
        <div
          v-if="lanes.length > 0"
          class="network-dashboard__lanes"
        >
          <DashMeter
            v-for="lane in lanes"
            :key="lane.laneId"
            :label="lane.alias ? `${lane.alias} · ${$t('dashboards.charts.lanes.lane', { id: lane.laneId })}` : $t('dashboards.charts.lanes.lane', { id: lane.laneId })"
            :value="lane.committed"
            :max="lane.capacity"
            :warn-at="0.8"
            :critical-at="1"
            :value-text="$t('dashboards.charts.lanes.value', { committed: formatCompactNumber(lane.committed), capacity: formatCompactNumber(lane.capacity) })"
          />
        </div>
        <p
          v-else
          class="network-dashboard__muted"
        >
          {{ node.status.value ? $t('dashboards.charts.lanes.empty') : $t('dashboards.errors.status') }}
        </p>
      </DashPanel>

      <DashPanel>
        <div class="network-dashboard__stats">
          <DashStatTile
            :label="$t('dashboards.stats.transactions')"
            :value="summary.timedBlocks === 0 ? '—' : formatCompactNumber(summary.transactionsTotal)"
            :hint="unreadable > 0 ? $t('dashboards.stats.unreadableHint') : ''"
          />
          <DashStatTile
            :label="$t('dashboards.stats.rejectionRate')"
            :value="formatPercent(summary.rejectionRate)"
          />
          <DashStatTile
            :label="$t('dashboards.stats.meanPerBlock')"
            :value="summary.meanTransactionsPerBlock === null ? '—' : formatCompactNumber(summary.meanTransactionsPerBlock)"
            :hint="summary.transactionsPerBlock ? $t('dashboards.stats.medianPerBlock', { value: formatCompactNumber(summary.transactionsPerBlock.median) }) : ''"
          />
          <DashStatTile
            :label="$t('dashboards.stats.busiest')"
            :value="summary.busiestBlock ? `#${summary.busiestBlock.height}` : '—'"
            :hint="summary.busiestBlock ? `${formatCompactNumber(summary.busiestBlock.transactionsTotal)} ${$t('dashboards.stats.transactions').toLowerCase()}` : ''"
          />
          <DashStatTile
            :label="$t('dashboards.stats.span')"
            :value="formatDuration(summary.spanMs)"
            :hint="`${formatCompactNumber(summary.blocks)} ${$t('dashboards.stats.blocks').toLowerCase()}`"
          />
          <DashStatTile
            :label="$t('dashboards.stats.unreadable')"
            :value="formatCompactNumber(unreadable)"
          />
        </div>
      </DashPanel>
    </div>
  </DashboardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNow } from '@vueuse/core';
import DashboardShell from './DashboardShell.vue';
import DashPanel from '@/shared/ui/dashboard/DashPanel.vue';
import DashLamp, { type DashLampTone } from '@/shared/ui/dashboard/DashLamp.vue';
import DashSegmented from '@/shared/ui/dashboard/DashSegmented.vue';
import DashOdometer from '@/shared/ui/dashboard/DashOdometer.vue';
import DashDial, { type DialZone } from '@/shared/ui/dashboard/DashDial.vue';
import DashMeter from '@/shared/ui/dashboard/DashMeter.vue';
import DashStatTile from '@/shared/ui/dashboard/DashStatTile.vue';
import ChartFrame from '@/shared/ui/dashboard/ChartFrame.vue';
import ColumnChart from '@/shared/ui/dashboard/ColumnChart.vue';
import TimeSeriesChart from '@/shared/ui/dashboard/TimeSeriesChart.vue';
import { CHART_COLORS, type ChartTable } from '@/shared/ui/dashboard/types';
import { useBlockSampleWindow } from '@/shared/ui/composables/useBlockSampleWindow';
import { useNodeStatusPoll } from '@/shared/ui/composables/useNodeStatusPoll';
import { useRouteQueryState } from '@/shared/ui/composables/useRouteQueryState';
import {
  MINUTE_MS,
  SECOND_MS,
  blockIntervals,
  bucketBlocksByTime,
  chooseBucketMs,
  classifyChainActivity,
  durationHistogram,
  isTimedSample,
  observedSpans,
  peakMinute,
  recentActivity,
  summarizeDistribution,
  summarizeWindow,
  type ChainActivityState,
} from '@/shared/lib/chain-analytics';
import {
  formatCompactNumber,
  formatDuration,
  formatDurationTick,
  formatPercent,
  niceZeroBasedAxis,
} from '@/shared/lib/chart-scale';
import { intlLocale } from '@/shared/lib/intl-locale';
import { isolateText } from '@/shared/lib/bidi';
import {
  countIntoBuckets,
  coverageFootnote,
  coverageMessageKey,
  histogramColumns,
  laneMeters,
  parseWindowParam,
  perBlockColumns,
  throughputPoints,
} from '@/shared/lib/dashboard-models';

const WINDOW_SIZES = [100, 250, 500, 1000] as const;
const DEFAULT_WINDOW = 250;
const COMMIT_TICKS = [100, SECOND_MS, 10 * SECOND_MS, MINUTE_MS];
/** Newest blocks drawn individually; captions disclose when the window holds more. */
const PER_BLOCK_BARS = 200;
/** Visible transactions per block: 0, 1, 2, 3–5, 6–10, 11–20, 21–50, 51–100, 101+. */
const FILL_EDGES = [0, 1, 2, 3, 6, 11, 21, 51, 101];

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
const node = useNodeStatusPoll();
const now = useNow({ interval: 1000 });

const summary = computed(() => summarizeWindow(blocks.samples.value));
const unreadable = computed(() => summary.value.blocks - summary.value.timedBlocks);
const observedUntil = computed(() => blocks.observedUntil(now.value.getTime()));
const spans = computed(() => observedSpans(blocks.samples.value, observedUntil.value));

const headHeight = computed(() => {
  const fromFeed = blocks.samples.value[blocks.samples.value.length - 1]?.height ?? null;
  const fromPeer = node.status.value?.blocks ?? null;
  if (fromFeed === null) return fromPeer;
  return fromPeer === null ? fromFeed : Math.max(fromFeed, fromPeer);
});

const elapsedSinceStatus = computed(() =>
  node.receivedAtMs.value === null ? null : Math.max(0, now.value.getTime() - node.receivedAtMs.value)
);
const lastBlockAgeMs = computed(() => {
  const status = node.status.value;
  if (!status || elapsedSinceStatus.value === null) return null;
  return status.time_since_last_block_ms + elapsedSinceStatus.value;
});

const chainState = computed<ChainActivityState>(() =>
  classifyChainActivity({
    nowMs: now.value.getTime(),
    receivedAtMs: node.receivedAtMs.value,
    timeSinceLastBlockMs: node.status.value?.time_since_last_block_ms ?? null,
    queueDepth: node.status.value?.queue_queued ?? null,
    queueInflight: node.status.value?.queue_inflight ?? null,
    oldestQueuedAgeMs: node.status.value?.sumeragi?.tx_queue_oldest_queued_age_ms ?? null,
  })
);
const chainStateTone = computed<DashLampTone>(() => {
  const tones: Record<ChainActivityState, DashLampTone> = {
    producing: 'good',
    pending: 'info',
    idle: 'idle',
    delayed: 'critical',
    stale: 'warning',
    unknown: 'off',
  };
  return tones[chainState.value];
});

const coverageText = computed(() => {
  const coverage = blocks.coverage.value;
  const key = coverageMessageKey(coverage, { scanning: blocks.isScanning.value, reachedGenesis: blocks.reachedGenesis.value });
  return t(`dashboards.coverage.${key}`, coverage);
});

// Queue fill: capacity pressure, with the warning zone where the queue nears its cap.
const queueDepth = computed(() => node.status.value?.sumeragi?.tx_queue_depth ?? node.status.value?.queue_queued ?? null);
const queueCapacity = computed(() => node.status.value?.sumeragi?.tx_queue_capacity ?? 0);
const queueSaturated = computed(() => node.status.value?.sumeragi?.tx_queue_saturated === true);
const queueAxis = computed(() => niceZeroBasedAxis(Math.max(1, queueCapacity.value), 4));
const queueZones = computed<DialZone[]>(() =>
  queueCapacity.value > 0 ? [{ from: queueCapacity.value * 0.8, to: queueCapacity.value, tone: 'warning' }] : []
);
const queueReadout = computed(() =>
  queueDepth.value === null || queueCapacity.value === 0
    ? '—'
    : t('dashboards.instruments.queueReadout', {
        depth: formatCompactNumber(queueDepth.value),
        capacity: formatCompactNumber(queueCapacity.value),
      })
);
const queueCaption = computed(() => {
  const status = node.status.value;
  if (!status) return '';
  if (queueSaturated.value) return t('dashboards.instruments.queueSaturated');
  return t('dashboards.instruments.queueHint', {
    inflight: formatCompactNumber(status.queue_inflight),
    age: isolateText(formatDuration(status.sumeragi?.tx_queue_oldest_queued_age_ms ?? null)),
  });
});

const txTotal = computed(() => (node.status.value ? node.status.value.txs_approved + node.status.value.txs_rejected : 0));
const rejectionsText = computed(() =>
  node.status.value
    ? t('dashboards.instruments.rejectionsValue', {
        rejected: formatCompactNumber(node.status.value.txs_rejected),
        total: formatCompactNumber(txTotal.value),
      })
    : '—'
);
const uptimeText = computed(() => (node.status.value ? formatDuration(node.status.value.uptime.secs * SECOND_MS) : '—'));

// Last hour: activity, not speed — Iroha idles without transactions.
const lastHour = computed(() =>
  observedUntil.value === null
    ? { buckets: [], transactions: 0, observedMs: 0, perMinute: null, complete: false }
    : recentActivity(blocks.samples.value, { spans: spans.value, endMs: observedUntil.value })
);
const lastHourTrend = computed(() =>
  lastHour.value.buckets.filter((bucket) => bucket.coverage !== 'none').map((bucket) => bucket.transactionsTotal)
);
const lastHourHint = computed(() => {
  const activity = lastHour.value;
  if (activity.perMinute === null) return '';
  const rate = t('dashboards.instruments.lastHourRate', { rate: formatCompactNumber(activity.perMinute) });
  if (activity.complete) return rate;
  return `${rate} · ${t('dashboards.instruments.lastHourPartial', { minutes: Math.round(activity.observedMs / MINUTE_MS) })}`;
});
const peak = computed(() => peakMinute(blocks.samples.value));
const clockFormat = computed(
  () => new Intl.DateTimeFormat(intlLocale(locale.value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
);

const blockTitle = (height: number) => t('dashboards.chart.blockTitle', { height: formatCompactNumber(height) });

// Transactions per block --------------------------------------------------------
const outcomeSeries = computed(() => [
  { key: 'committed', label: t('dashboards.charts.perBlock.committed'), color: CHART_COLORS.good },
  { key: 'rejected', label: t('dashboards.charts.perBlock.rejected'), color: CHART_COLORS.critical },
]);
const outcomeLegend = computed(() => outcomeSeries.value.map((series) => ({ ...series, shape: 'rect' as const })));
const footnoteLabels = computed(() => ({ partial: t('dashboards.chart.partial'), unknown: t('dashboards.chart.unknown') }));
const perBlock = computed(() => perBlockColumns(blocks.samples.value, PER_BLOCK_BARS, blockTitle));
const perBlockCaption = computed(() => {
  const count = blocks.samples.value.length;
  const caption = t('dashboards.charts.perBlock.caption', { count });
  if (count <= perBlock.value.length || perBlock.value.length === 0) return caption;
  return `${caption} ${t('dashboards.charts.perBlock.subset', {
    shown: perBlock.value.length,
    count,
    from: perBlock.value[0]!.key,
    to: perBlock.value[perBlock.value.length - 1]!.key,
  })}`;
});
const perBlockAxis = computed(() =>
  niceZeroBasedAxis(
    Math.max(0, ...perBlock.value.map((column) => (column.values ? column.values.committed! + column.values.rejected! : 0))),
    4
  )
);
const perBlockTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'height', label: t('dashboards.chart.height') },
    { key: 'committed', label: t('dashboards.charts.perBlock.committed'), align: 'end' },
    { key: 'rejected', label: t('dashboards.charts.perBlock.rejected'), align: 'end' },
  ],
  rows: [...perBlockColumns(blocks.samples.value, blocks.samples.value.length, blockTitle)].reverse().map((column) => ({
    height: `#${column.key}`,
    committed: column.values ? column.values.committed! : '—',
    rejected: column.values ? column.values.rejected! : '—',
  })),
  footnote: coverageFootnote(unreadable.value > 0 ? ['none'] : [], footnoteLabels.value),
}));

// Time between blocks: a distribution, so idle gaps read as quiet time, not slowness.
const waits = computed(() => blockIntervals(blocks.samples.value).map((entry) => entry.intervalMs));
const waitColumns = computed(() => histogramColumns(durationHistogram(waits.value)));
const waitMedian = computed(() => summarizeDistribution(waits.value)?.median ?? null);
const waitSeries = computed(() => [
  { key: 'count', label: t('dashboards.charts.distribution.series'), color: CHART_COLORS.series[0] },
]);
const waitAxis = computed(() =>
  niceZeroBasedAxis(Math.max(0, ...waitColumns.value.map((column) => column.values?.count ?? 0)), 4)
);
const waitTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'range', label: t('dashboards.charts.distribution.range') },
    { key: 'count', label: t('dashboards.charts.distribution.series'), align: 'end' },
  ],
  rows: waitColumns.value.map((column) => ({ range: column.label, count: column.values?.count ?? 0 })),
}));

// Block fill ------------------------------------------------------------------------
const fillColumns = computed(() =>
  countIntoBuckets(
    blocks.samples.value.filter(isTimedSample).map((sample) => sample.transactionsTotal),
    FILL_EDGES
  )
);
const fillSeries = computed(() => [
  { key: 'count', label: t('dashboards.charts.blockFill.series'), color: CHART_COLORS.series[0] },
]);
const fillAxis = computed(() =>
  niceZeroBasedAxis(Math.max(0, ...fillColumns.value.map((column) => column.values?.count ?? 0)), 4)
);
const fillTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'bucket', label: t('dashboards.charts.blockFill.bucket') },
    { key: 'count', label: t('dashboards.charts.blockFill.series'), align: 'end' },
  ],
  rows: fillColumns.value.map((column) => ({ bucket: column.label, count: column.values?.count ?? 0 })),
}));

// Throughput over time --------------------------------------------------------------
const bucketMs = computed(() => {
  const all = spans.value;
  if (all.length === 0) return MINUTE_MS;
  return chooseBucketMs(all[all.length - 1]!.endMs - all[0]!.startMs, 48);
});
const throughput = computed(() => throughputPoints(bucketBlocksByTime(blocks.samples.value, bucketMs.value, spans.value)));
const throughputSeries = computed(() =>
  outcomeSeries.value.map((series) => ({ ...series, area: series.key === 'committed' }))
);
/** Lines for the outcomes, plus the hatch key once a bucket's counts are unknown. */
const throughputLegend = computed(() => [
  ...outcomeSeries.value.map((series) => ({ ...series, shape: 'line' as const })),
  ...(throughput.value.some((point) => point.coverage === 'none')
    ? [{ key: 'unknown', label: t('dashboards.chart.unknown'), color: CHART_COLORS.muted, shape: 'hatch' as const }]
    : []),
]);
const throughputAxis = computed(() =>
  niceZeroBasedAxis(
    Math.max(0, ...throughput.value.map((point) => (point.values.committed ?? 0) + (point.values.rejected ?? 0))),
    4
  )
);
const timeFormat = computed(
  () =>
    new Intl.DateTimeFormat(intlLocale(locale.value), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
);
function formatRange(startMs: number, endMs: number) {
  return `${timeFormat.value.format(startMs)} – ${timeFormat.value.format(endMs)}`;
}
const throughputTable = computed<ChartTable>(() => ({
  columns: [
    { key: 'from', label: t('dashboards.chart.from') },
    { key: 'committed', label: t('dashboards.charts.throughput.committed'), align: 'end' },
    { key: 'rejected', label: t('dashboards.charts.throughput.rejected'), align: 'end' },
  ],
  rows: [...throughput.value].reverse().map((point) => ({
    from: `${timeFormat.value.format(point.startMs)}${point.coverage === 'partial' ? ' *' : ''}`,
    committed: point.coverage === 'none' ? '—' : point.values.committed ?? 0,
    rejected: point.coverage === 'none' ? '—' : point.values.rejected ?? 0,
  })),
  footnote: coverageFootnote(throughput.value.map((point) => point.coverage), footnoteLabels.value),
}));

const lanes = computed(() => laneMeters(node.status.value));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.network-dashboard {
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

  &__cluster {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: size(3);
    align-items: center;

    @include sm {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @include lg {
      grid-template-columns: minmax(0, 1.1fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.1fr);
    }
  }

  &__height,
  &__activity {
    display: grid;
    justify-items: start;
    gap: size(1);
    min-width: 0;
  }

  &__activity {
    justify-items: stretch;
  }

  &__label {
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-secondary');
  }

  &__meta {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }

  &__meters {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: size(2.5);
    margin-top: size(3);
    padding-top: size(2.5);
    border-top: 1px solid theme-color('dash-grid');

    @include md {
      grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
    }
  }

  &__readout {
    display: grid;
    gap: 2px;

    span {
      @include tpg-s4;
      color: theme-color('content-secondary');
    }

    strong {
      @include tpg-h2;
      font-weight: 600;
      color: theme-color('content-primary');
    }

    small {
      @include tpg-s5;
      color: theme-color('dash-ink-muted');
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: size(2.5);

    @include lg {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: size(1.5);
  }

  &__lanes {
    display: grid;
    gap: size(2) size(3);

    @include md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__muted {
    @include tpg-s4;
    color: theme-color('dash-ink-muted');
  }
}
</style>
