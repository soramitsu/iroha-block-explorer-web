<template>
  <div
    class="column-chart"
    :style="{ height: `${totalHeight}px` }"
  >
    <svg
      class="column-chart__svg"
      :width
      :height="totalHeight"
      role="img"
      :aria-label="chartLabel"
      tabindex="0"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="active = null"
      @pointerleave="active = null"
    >
      <defs>
        <pattern
          :id="hatchId"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            class="column-chart__hatch-line"
          />
        </pattern>
      </defs>

      <g class="column-chart__grid">
        <template
          v-for="tick in yTicks"
          :key="tick.value"
        >
          <line
            :x1="MARGIN.left"
            :x2="width - MARGIN.right"
            :y1="tick.y"
            :y2="tick.y"
          />
          <text
            :x="MARGIN.left - 8"
            :y="tick.y"
            text-anchor="end"
            dominant-baseline="middle"
          >{{ tick.text }}</text>
        </template>
      </g>

      <g
        v-for="(bar, index) in bars"
        :key="bar.key"
        class="column-chart__bar"
        :data-active="index === active || null"
      >
        <rect
          v-if="bar.unknown"
          class="column-chart__unknown"
          :x="bar.x"
          :y="MARGIN.top"
          :width="layout.barWidth"
          :height="plotHeight"
          :fill="`url(#${hatchId})`"
        />
        <path
          v-for="segment in bar.segments"
          :key="segment.key"
          :d="segment.path"
          :style="{ fill: segment.color }"
        />
        <circle
          v-if="bar.partialY !== null"
          class="column-chart__partial"
          :cx="bar.x + layout.barWidth / 2"
          :cy="bar.partialY"
          r="3"
        />
      </g>

      <g
        v-if="referenceY !== null && reference"
        class="column-chart__reference"
      >
        <line
          :x1="MARGIN.left"
          :x2="width - MARGIN.right"
          :y1="referenceY"
          :y2="referenceY"
        />
        <text
          :x="MARGIN.left + 6"
          :y="referenceY - 6"
          text-anchor="start"
        >{{ reference.label }}</text>
      </g>

      <line
        class="column-chart__baseline"
        :x1="MARGIN.left"
        :x2="width - MARGIN.right"
        :y1="baseline"
        :y2="baseline"
      />

      <text
        v-for="label in xLabels"
        :key="label.key"
        class="column-chart__x-label"
        :x="label.x"
        :y="baseline + 16"
        text-anchor="middle"
      >{{ label.text }}</text>

      <rect
        v-for="(datum, index) in data"
        :key="`hit-${datum.key}`"
        class="column-chart__hit"
        :x="MARGIN.left + index * layout.band"
        :y="MARGIN.top"
        :width="layout.band"
        :height="plotHeight"
        @pointerenter="active = index"
      />
    </svg>

    <ChartTooltip
      v-if="tooltip"
      v-bind="tooltip"
    />
    <p
      class="column-chart__live"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import ChartTooltip, { type ChartTooltipRow } from './ChartTooltip.vue';
import { bandLayout, barPath, labelStride, stackSegments } from '@/shared/lib/chart-geometry';
import { linearScale, type NiceAxis } from '@/shared/lib/chart-scale';
import type { ColumnDatum, ColumnSeries } from './types';
import { describeTooltip } from './types';

const props = withDefaults(
  defineProps<{
    data: ColumnDatum[]
    series: ColumnSeries[]
    width: number
    axis: NiceAxis
    formatTick: (value: number) => string
    formatValue: (value: number) => string
    chartLabel: string
    unknownLabel: string
    height?: number
    reference?: { value: number, label: string } | null
    totalLabel?: string
  }>(),
  { height: 180, reference: null, totalLabel: '' }
);

const MARGIN = { top: 12, right: 8, bottom: 26, left: 48 };
const hatchId = `column-hatch-${useId()}`;
const active = ref<number | null>(null);

const plotHeight = computed(() => props.height);
const totalHeight = computed(() => props.height + MARGIN.top + MARGIN.bottom);
const baseline = computed(() => MARGIN.top + plotHeight.value);
const plotWidth = computed(() => Math.max(10, props.width - MARGIN.left - MARGIN.right));
const layout = computed(() => bandLayout(props.data.length, plotWidth.value, MARGIN.left));

const yScale = computed(() => linearScale(props.axis.domain, [baseline.value, MARGIN.top]));

const yTicks = computed(() =>
  props.axis.ticks.map((value) => ({ value, y: yScale.value(value), text: props.formatTick(value) }))
);

const bars = computed(() =>
  props.data.map((datum, index) => {
    const x = layout.value.barX(index);
    if (datum.values === null) return { key: datum.key, x, unknown: true, segments: [], partialY: null };
    const values = props.series.map((series) => datum.values?.[series.key] ?? 0);
    const top = yScale.value(values.reduce((sum, value) => sum + value, 0));
    return {
      key: datum.key,
      x,
      unknown: false,
      // A hollow mark above the column flags a lower bound, as on the time series.
      partialY: datum.partial ? top - 7 : null,
      segments: stackSegments(values, baseline.value, (total) => yScale.value(total)).map((segment) => ({
        key: props.series[segment.index]?.key ?? String(segment.index),
        path: barPath({ x, width: layout.value.barWidth, y0: segment.y0, y1: segment.y1 }, segment.top),
        color: props.series[segment.index]?.color ?? 'currentColor',
      })),
    };
  })
);

const referenceY = computed(() => {
  if (!props.reference || !Number.isFinite(props.reference.value)) return null;
  const y = yScale.value(props.reference.value);
  return y >= MARGIN.top && y <= baseline.value ? y : null;
});

const xLabels = computed(() => {
  const stride = labelStride(props.data.length, layout.value.band);
  const last = props.data.length - 1;
  return props.data.flatMap((datum, index) => {
    // Always label the newest column; skip neighbours that would collide with it.
    const labelled = index === last || (index % stride === 0 && last - index >= stride);
    return labelled ? [{ key: datum.key, x: layout.value.center(index), text: datum.tick ?? datum.label }] : [];
  });
});

const tooltip = computed(() => {
  if (active.value === null) return null;
  const datum = props.data[active.value];
  if (!datum) return null;
  const x = layout.value.center(active.value);
  let rows: ChartTooltipRow[];
  if (datum.values === null) {
    rows = [{ key: 'unknown', label: props.unknownLabel, value: '—' }];
  } else {
    rows = props.series.map((series) => ({
      key: series.key,
      label: series.label,
      value: props.formatValue(datum.values?.[series.key] ?? 0),
      color: series.color,
    }));
    if (props.totalLabel && props.series.length > 1) {
      const total = props.series.reduce((sum, series) => sum + (datum.values?.[series.key] ?? 0), 0);
      rows.push({ key: '__total', label: props.totalLabel, value: props.formatValue(total) });
    }
  }
  return { x, y: MARGIN.top, title: datum.label, rows, note: datum.note, flip: x > props.width * 0.62 };
});

watch(
  () => props.data.length,
  (length) => {
    if (active.value !== null && active.value >= length) active.value = length > 0 ? length - 1 : null;
  }
);

const announcement = computed(() => describeTooltip(tooltip.value));

function onFocus() {
  if (active.value === null && props.data.length > 0) active.value = props.data.length - 1;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    active.value = null;
    return;
  }
  if (props.data.length === 0) return;
  const last = props.data.length - 1;
  const current = active.value ?? last;
  const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  active.value = Math.min(last, Math.max(0, next));
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.column-chart {
  position: relative;
  width: 100%;

  &__live {
    @include dash-visually-hidden;
  }

  &__svg {
    display: block;
    overflow: visible;

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, theme-color('chart-accent') 55%, transparent);
      outline-offset: 4px;
      border-radius: 6px;
    }
  }

  &__grid {
    line {
      stroke: theme-color('dash-grid');
      stroke-width: 1;
      shape-rendering: crispEdges;
    }

    text {
      fill: theme-color('dash-ink-muted');
      font-size: 11px;
      @include dash-tabular;
    }
  }

  &__baseline {
    stroke: theme-color('dash-axis');
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  &__x-label {
    fill: theme-color('dash-ink-muted');
    font-size: 11px;
    @include dash-tabular;
  }

  &__bar {
    transition: opacity 160ms ease;

    &[data-active] {
      filter: brightness(1.12);
    }
  }

  &__unknown {
    opacity: 0.6;
  }

  &__hatch-line {
    stroke: theme-color('chart-unknown');
    stroke-width: 2;
  }

  &__partial {
    fill: theme-color('dash-well');
    stroke: theme-color('content-secondary');
    stroke-width: 1.5;
  }

  &__reference {
    line {
      stroke: theme-color('content-secondary');
      stroke-width: 1;
      opacity: 0.7;
    }

    text {
      fill: theme-color('content-primary');
      font-size: 11px;
      font-weight: 600;
      paint-order: stroke;
      stroke: theme-color('dash-well');
      stroke-width: 4px;
      stroke-linejoin: round;
    }
  }

  &__hit {
    fill: transparent;
    cursor: crosshair;
  }
}
</style>
