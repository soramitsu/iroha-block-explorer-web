<template>
  <div class="heatmap-chart">
    <svg
      class="heatmap-chart__svg"
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
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="5"
            class="heatmap-chart__hatch-line"
          />
        </pattern>
      </defs>

      <text
        v-for="hour in hourLabels"
        :key="`h${hour}`"
        class="heatmap-chart__axis"
        :x="LABEL_WIDTH + hour * cellPitch + cellSize / 2"
        :y="12"
        text-anchor="middle"
      >{{ formatHour(hour) }}</text>

      <text
        v-for="(day, dayIndex) in heatmap.days"
        :key="`d${day}`"
        class="heatmap-chart__axis"
        :x="LABEL_WIDTH - 8"
        :y="TOP + dayIndex * rowPitch + rowSize / 2"
        text-anchor="end"
        dominant-baseline="middle"
      >{{ formatDay(day) }}</text>

      <rect
        v-for="(cell, index) in heatmap.cells"
        :key="`${cell.dayIndex}-${cell.hour}`"
        class="heatmap-chart__cell"
        :data-active="index === active || null"
        :x="LABEL_WIDTH + cell.hour * cellPitch"
        :y="TOP + cell.dayIndex * rowPitch"
        :width="cellSize"
        :height="rowSize"
        rx="3"
        :style="{ fill: cellFill(cell) }"
        @pointerenter="active = index"
      />

      <path
        v-for="marker in partialMarkers"
        :key="marker.key"
        class="heatmap-chart__partial"
        :d="marker.d"
      />
    </svg>

    <div
      class="heatmap-chart__scale"
      aria-hidden="true"
    >
      <span>0</span>
      <span class="heatmap-chart__ramp" />
      <span>{{ formatValue(heatmap.maxTransactions) }}</span>
      <span class="heatmap-chart__nodata">
        <svg
          width="14"
          height="14"
        ><rect
          width="14"
          height="14"
          rx="3"
          :fill="`url(#${hatchId})`"
        /></svg>
        {{ noDataLabel }}
      </span>
    </div>

    <ChartTooltip
      v-if="tooltip"
      v-bind="tooltip"
    />
    <p
      class="heatmap-chart__live"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import ChartTooltip from './ChartTooltip.vue';
import { describeTooltip } from './types';
import type { DayHourHeatmap, HeatmapCell } from '@/shared/lib/chain-analytics';

const props = defineProps<{
  heatmap: DayHourHeatmap
  width: number
  chartLabel: string
  valueLabel: string
  blocksLabel: string
  noDataLabel: string
  partialNote: string
  formatDay: (dayStartMs: number) => string
  formatHour: (hour: number) => string
  formatValue: (value: number) => string
  formatSlot: (startMs: number) => string
}>();

const LABEL_WIDTH = 64;
const TOP = 20;
const hatchId = `heat-hatch-${useId()}`;
const active = ref<number | null>(null);

const cellPitch = computed(() => Math.max(6, (props.width - LABEL_WIDTH - 4) / 24));
const cellSize = computed(() => Math.max(4, cellPitch.value - 2));
const rowSize = computed(() => Math.min(28, Math.max(12, cellSize.value)));
const rowPitch = computed(() => rowSize.value + 2);
const totalHeight = computed(() => TOP + props.heatmap.days.length * rowPitch.value);
const hourLabels = computed(() => {
  const stride = cellPitch.value < 18 ? 6 : 3;
  return Array.from({ length: 24 / stride }, (_, index) => index * stride);
});

/** Linear magnitude on the brand ramp; any activity stays distinguishable from zero. */
function cellFill(cell: HeatmapCell): string {
  if (cell.coverage === 'none') return `url(#${hatchId})`;
  if (cell.transactions === 0 || props.heatmap.maxTransactions === 0) {
    return 'color-mix(in oklab, var(--color_chart-heat-low) 45%, var(--color_dash-well))';
  }
  const share = 14 + 86 * (cell.transactions / props.heatmap.maxTransactions);
  return `color-mix(in oklab, var(--color_chart-heat-high) ${share.toFixed(1)}%, var(--color_chart-heat-low))`;
}

const partialMarkers = computed(() =>
  props.heatmap.cells
    .filter((cell) => cell.coverage === 'partial')
    .map((cell) => {
      const x = LABEL_WIDTH + cell.hour * cellPitch.value + cellSize.value;
      const y = TOP + cell.dayIndex * rowPitch.value;
      return { key: `${cell.dayIndex}-${cell.hour}`, d: `M ${x - 7} ${y} L ${x} ${y} L ${x} ${y + 7} Z` };
    })
);

const tooltip = computed(() => {
  const cell = active.value === null ? undefined : props.heatmap.cells[active.value];
  if (!cell) return null;
  const x = LABEL_WIDTH + cell.hour * cellPitch.value + cellSize.value / 2;
  return {
    x,
    y: TOP + cell.dayIndex * rowPitch.value + rowSize.value,
    title: props.formatSlot(cell.startMs),
    rows:
      cell.coverage === 'none'
        ? [{ key: 'none', label: props.noDataLabel, value: '—' }]
        : [
            { key: 'tx', label: props.valueLabel, value: props.formatValue(cell.transactions) },
            { key: 'blocks', label: props.blocksLabel, value: props.formatValue(cell.blocks) },
          ],
    note: cell.coverage === 'partial' ? props.partialNote : undefined,
    flip: x > props.width * 0.62,
  };
});

const announcement = computed(() => describeTooltip(tooltip.value));

/** Keyboard focus opens on the newest hour that was observed at all. */
function onFocus() {
  if (active.value !== null || props.heatmap.cells.length === 0) return;
  const newestObserved = props.heatmap.cells.map((cell) => cell.coverage !== 'none').lastIndexOf(true);
  active.value = newestObserved >= 0 ? newestObserved : props.heatmap.cells.length - 1;
}

/** Arrow keys walk hours (left/right) and days (up/down). */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    active.value = null;
    return;
  }
  const count = props.heatmap.cells.length;
  if (count === 0) return;
  const current = active.value ?? count - 1;
  const next = { ArrowLeft: current - 1, ArrowRight: current + 1, ArrowUp: current - 24, ArrowDown: current + 24 }[
    event.key
  ];
  if (next === undefined) return;
  event.preventDefault();
  active.value = Math.min(count - 1, Math.max(0, next));
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.heatmap-chart {
  position: relative;
  display: grid;
  gap: size(1);

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

  &__axis {
    fill: theme-color('dash-ink-muted');
    font-size: 11px;
    @include dash-tabular;
  }

  &__cell {
    transition: filter 120ms ease;

    &[data-active] {
      stroke: theme-color('content-primary');
      stroke-width: 1.5;
    }
  }

  &__hatch-line {
    stroke: theme-color('chart-unknown');
    stroke-width: 1.5;
  }

  &__partial {
    fill: theme-color('content-secondary');
    opacity: 0.75;
    pointer-events: none;
  }

  &__scale {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1);
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
    @include dash-tabular;
  }

  &__ramp {
    width: 120px;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      color-mix(in oklab, var(--color_chart-heat-low) 45%, var(--color_dash-well)),
      color-mix(in oklab, var(--color_chart-heat-high) 14%, var(--color_chart-heat-low)),
      var(--color_chart-heat-high)
    );
  }

  &__nodata {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-start: size(1);
  }
}
</style>
