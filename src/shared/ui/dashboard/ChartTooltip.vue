<template>
  <div
    class="chart-tooltip"
    role="presentation"
    :style="{ left: `${x}px`, top: `${y}px` }"
    :data-flip="flip || null"
  >
    <span class="chart-tooltip__title">{{ title }}</span>
    <span
      v-for="row in rows"
      :key="row.key"
      class="chart-tooltip__row"
    >
      <span
        v-if="row.color"
        class="chart-tooltip__key"
        :style="{ background: row.color }"
      />
      <strong class="chart-tooltip__value"><bdi>{{ row.value }}</bdi></strong>
      <span class="chart-tooltip__name">{{ row.label }}</span>
    </span>
    <span
      v-if="note"
      class="chart-tooltip__note"
    >{{ note }}</span>
  </div>
</template>

<script setup lang="ts">
export interface ChartTooltipRow {
  key: string
  label: string
  value: string
  color?: string
}

defineProps<{
  x: number
  y: number
  title: string
  rows: ChartTooltipRow[]
  note?: string
  /** Open to the left of `x` near the right edge. */
  flip?: boolean
}>();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.chart-tooltip {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 4px;
  min-width: 140px;
  max-width: 260px;
  padding: size(1) size(1.5);
  border-radius: size(1.5);
  pointer-events: none;
  transform: translate(12px, 0);
  background: color-mix(in srgb, theme-color('surface') 94%, transparent);
  border: 1px solid color-mix(in srgb, theme-color('border-secondary') 70%, transparent);
  box-shadow: theme-shadow('dash-raised-sm');
  backdrop-filter: blur(8px);

  &[data-flip] {
    transform: translate(calc(-100% - 12px), 0);
  }

  &__title {
    @include tpg-s5-bold;
    color: theme-color('content-secondary');
  }

  &__row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 6px;
  }

  &__key {
    width: 12px;
    height: 2px;
    border-radius: 1px;
  }

  &__value {
    @include tpg-s4;
    font-weight: 700;
    color: theme-color('content-primary');
    @include dash-tabular;
  }

  &__name {
    @include tpg-s5;
    color: theme-color('content-secondary');
  }

  &__note {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }
}
</style>
