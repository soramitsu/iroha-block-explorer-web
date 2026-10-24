<template>
  <div
    class="time-series-chart"
    :style="{ height: `${totalHeight}px` }"
  >
    <svg
      ref="svg"
      class="time-series-chart__svg"
      :width
      :height="totalHeight"
      role="img"
      :aria-label="chartLabel"
      tabindex="0"
      @pointermove="onPointerMove"
      @pointerleave="active = null"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="active = null"
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
            class="time-series-chart__hatch-line"
          />
        </pattern>
      </defs>

      <g class="time-series-chart__grid">
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

      <rect
        v-for="band in unknownBands"
        :key="band.key"
        class="time-series-chart__unknown"
        :x="band.x"
        :y="MARGIN.top"
        :width="band.width"
        :height
        :fill="`url(#${hatchId})`"
      />

      <template
        v-for="line in lines"
        :key="line.key"
      >
        <template
          v-for="(segment, index) in line.segments"
          :key="`${line.key}-${index}`"
        >
          <path
            v-if="segment.area"
            class="time-series-chart__area"
            :d="segment.area"
            :style="{ fill: line.color }"
          />
          <path
            class="time-series-chart__line"
            :d="segment.path"
            :style="{ stroke: line.color }"
          />
        </template>
        <circle
          v-for="dot in line.dots"
          :key="`${line.key}-dot-${dot.index}`"
          class="time-series-chart__dot"
          :cx="dot.x"
          :cy="dot.y"
          r="3"
          :style="{ fill: line.color }"
        />
        <circle
          v-for="marker in line.partial"
          :key="`${line.key}-partial-${marker.index}`"
          class="time-series-chart__partial"
          :cx="marker.x"
          :cy="marker.y"
          r="4"
          :style="{ stroke: line.color }"
        />
      </template>

      <line
        class="time-series-chart__baseline"
        :x1="MARGIN.left"
        :x2="width - MARGIN.right"
        :y1="baseline"
        :y2="baseline"
      />

      <text
        v-for="tick in xTicks"
        :key="tick.value"
        class="time-series-chart__x-label"
        :x="tick.x"
        :y="baseline + 16"
        text-anchor="middle"
      >{{ tick.text }}</text>

      <g
        v-if="active !== null && crosshairX !== null"
        class="time-series-chart__crosshair"
      >
        <line
          :x1="crosshairX"
          :x2="crosshairX"
          :y1="MARGIN.top"
          :y2="baseline"
        />
        <circle
          v-for="dot in activeDots"
          :key="dot.key"
          :cx="crosshairX"
          :cy="dot.y"
          r="4"
          :style="{ fill: dot.color }"
        />
      </g>
    </svg>

    <ChartTooltip
      v-if="tooltip"
      v-bind="tooltip"
    />
    <p
      class="time-series-chart__live"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import ChartTooltip from './ChartTooltip.vue';
import { intlLocale } from '@/shared/lib/intl-locale';
import { formatTimeTick, linearScale, timeTicks, type NiceAxis } from '@/shared/lib/chart-scale';
import type { TimeSeries, TimeSeriesPoint } from './types';
import { describeTooltip } from './types';

const props = withDefaults(
  defineProps<{
    points: TimeSeriesPoint[]
    series: TimeSeries[]
    width: number
    axis: NiceAxis
    formatTick: (value: number) => string
    formatValue: (value: number) => string
    formatRange: (startMs: number, endMs: number) => string
    partialNote: string
    /** Names buckets nothing was observed in; they are drawn hatched, never as zero. */
    unknownLabel: string
    chartLabel: string
    height?: number
  }>(),
  { height: 180 }
);

const MARGIN = { top: 12, right: 12, bottom: 26, left: 48 };
const hatchId = `series-hatch-${useId()}`;
const active = ref<number | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const { locale } = useI18n();
const tickLocale = computed(() => intlLocale(locale.value));

const totalHeight = computed(() => props.height + MARGIN.top + MARGIN.bottom);
const baseline = computed(() => MARGIN.top + props.height);
const domainStart = computed(() => props.points[0]?.startMs ?? 0);
const domainEnd = computed(() => props.points[props.points.length - 1]?.endMs ?? 1);
const xScale = computed(() =>
  linearScale([domainStart.value, domainEnd.value], [MARGIN.left, props.width - MARGIN.right])
);
const yScale = computed(() => linearScale(props.axis.domain, [baseline.value, MARGIN.top]));

const centerX = (point: TimeSeriesPoint) => xScale.value((point.startMs + point.endMs) / 2);

const yTicks = computed(() =>
  props.axis.ticks.map((value) => ({ value, y: yScale.value(value), text: props.formatTick(value) }))
);

const xTicks = computed(() => {
  const span = domainEnd.value - domainStart.value;
  const target = Math.max(2, Math.floor((props.width - MARGIN.left - MARGIN.right) / 110));
  return timeTicks(domainStart.value, domainEnd.value, target).map((value) => ({
    value,
    x: xScale.value(value),
    text: formatTimeTick(value, span, tickLocale.value),
  }));
});

/** Runs of consecutive observed buckets; an unknown bucket breaks every line and area. */
const runs = computed(() => {
  const result: number[][] = [];
  let current: number[] = [];
  props.points.forEach((point, index) => {
    if (point.coverage !== 'none') {
      current.push(index);
      return;
    }
    if (current.length > 0) result.push(current);
    current = [];
  });
  if (current.length > 0) result.push(current);
  return result;
});

/** Unknown buckets are hatched across their whole time span, so a gap never reads as zero. */
const unknownBands = computed(() =>
  props.points.flatMap((point, index) => {
    if (point.coverage !== 'none') return [];
    const x = xScale.value(point.startMs);
    return [{ key: `unknown-${index}`, x, width: Math.max(1, xScale.value(point.endMs) - x) }];
  })
);

function seriesCoords(seriesKey: string, run: number[]) {
  return run.map((index) => {
    const point = props.points[index]!;
    return { index, x: centerX(point), y: yScale.value(point.values[seriesKey] ?? 0) };
  });
}

function runPath(coords: Array<{ x: number, y: number }>) {
  return coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ');
}

const lines = computed(() =>
  props.series.map((series) => {
    const coords = runs.value.map((run) => seriesCoords(series.key, run));
    const segments = coords
      .filter((run) => run.length > 1)
      .map((run) => {
        const path = runPath(run);
        const area = series.area
          ? `${path} L ${run[run.length - 1]!.x} ${baseline.value} L ${run[0]!.x} ${baseline.value} Z`
          : '';
        return { path, area };
      });
    const observed = coords.flat();
    return {
      key: series.key,
      color: series.color,
      segments,
      // A fully observed bucket between unknown ones has no neighbour to join, so it is a dot.
      dots: coords
        .filter((run) => run.length === 1)
        .flat()
        .filter((coord) => props.points[coord.index]!.coverage === 'full'),
      partial: observed.filter((coord) => props.points[coord.index]!.coverage === 'partial'),
    };
  })
);

const crosshairX = computed(() => {
  const point = active.value === null ? undefined : props.points[active.value];
  return point ? centerX(point) : null;
});

const activeDots = computed(() => {
  const point = active.value === null ? undefined : props.points[active.value];
  if (!point || point.coverage === 'none') return [];
  return props.series.map((series) => ({
    key: series.key,
    color: series.color,
    y: yScale.value(point.values[series.key] ?? 0),
  }));
});

const tooltip = computed(() => {
  const point = active.value === null ? undefined : props.points[active.value];
  if (!point || crosshairX.value === null) return null;
  return {
    x: crosshairX.value,
    y: MARGIN.top,
    title: props.formatRange(point.startMs, point.endMs),
    rows:
      point.coverage === 'none'
        ? [{ key: 'unknown', label: props.unknownLabel, value: '—' }]
        : props.series.map((series) => ({
            key: series.key,
            label: series.label,
            value: props.formatValue(point.values[series.key] ?? 0),
            color: series.color,
          })),
    note: point.coverage === 'partial' ? props.partialNote : undefined,
    flip: crosshairX.value > props.width * 0.62,
  };
});

/** Snap the crosshair to the nearest bucket centre. */
function onPointerMove(event: PointerEvent) {
  if (!svg.value || props.points.length === 0) return;
  const x = event.clientX - svg.value.getBoundingClientRect().left;
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  props.points.forEach((point, index) => {
    const gap = Math.abs(centerX(point) - x);
    if (gap < distance) {
      distance = gap;
      nearest = index;
    }
  });
  active.value = nearest;
}

const announcement = computed(() => describeTooltip(tooltip.value));

function onFocus() {
  if (active.value === null && props.points.length > 0) active.value = props.points.length - 1;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    active.value = null;
    return;
  }
  if (props.points.length === 0) return;
  const last = props.points.length - 1;
  const current = active.value ?? last;
  const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  active.value = Math.min(last, Math.max(0, next));
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.time-series-chart {
  position: relative;
  width: 100%;

  &__live {
    @include dash-visually-hidden;
  }

  &__svg {
    display: block;
    overflow: visible;
    cursor: crosshair;

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

  &__area {
    opacity: 0.1;
  }

  &__line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  &__partial {
    fill: theme-color('dash-well');
    stroke-width: 2;
  }

  &__dot {
    stroke: theme-color('dash-well');
    stroke-width: 1.5;
  }

  &__unknown {
    opacity: 0.6;
  }

  &__hatch-line {
    stroke: theme-color('chart-unknown');
    stroke-width: 2;
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

  &__crosshair {
    line {
      stroke: theme-color('content-secondary');
      stroke-width: 1;
      opacity: 0.6;
    }

    circle {
      stroke: theme-color('dash-well');
      stroke-width: 2;
    }
  }
}
</style>
