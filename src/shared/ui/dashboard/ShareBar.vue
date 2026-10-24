<template>
  <div class="share-bar">
    <div
      class="share-bar__track"
      role="img"
      :aria-label="chartLabel"
    >
      <span
        v-for="segment in visible"
        :key="segment.key"
        class="share-bar__segment"
        :style="{ flexGrow: segment.value, background: segment.color }"
        :title="`${segment.label}: ${formatValue(segment.value)} (${formatPercent(segment.value / total)})`"
      />
    </div>
    <ul class="share-bar__legend">
      <li
        v-for="segment in segments"
        :key="segment.key"
        class="share-bar__item"
      >
        <span
          class="share-bar__swatch"
          :style="{ background: segment.color }"
          aria-hidden="true"
        />
        <span class="share-bar__label">{{ segment.label }}</span>
        <strong class="share-bar__value">{{ formatValue(segment.value) }}</strong>
        <span class="share-bar__percent">{{ total > 0 ? formatPercent(segment.value / total) : '—' }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatPercent } from '@/shared/lib/chart-scale';
import type { ShareSegment } from './types';

const props = defineProps<{
  segments: ShareSegment[]
  chartLabel: string
  formatValue: (value: number) => string
}>();

const total = computed(() => props.segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0));
const visible = computed(() => props.segments.filter((segment) => segment.value > 0));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.share-bar {
  display: grid;
  gap: size(1.5);

  &__track {
    display: flex;
    gap: 2px;
    height: 18px;
    padding: 3px;
    border-radius: 999px;
    background: theme-color('dash-well');
    box-shadow: theme-shadow('dash-inset');
    overflow: hidden;
  }

  &__segment {
    flex-basis: 0;
    min-width: 3px;
    border-radius: 3px;

    &:first-child {
      border-radius: 999px 3px 3px 999px;
    }

    &:last-child {
      border-radius: 3px 999px 999px 3px;
    }

    &:only-child {
      border-radius: 999px;
    }
  }

  &__legend {
    display: grid;
    gap: size(0.75);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: size(1);
    @include tpg-s4;
  }

  &__swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: theme-color('content-secondary');
  }

  &__value {
    color: theme-color('content-primary');
    @include dash-tabular;
  }

  &__percent {
    min-width: 5ch;
    text-align: end;
    color: theme-color('dash-ink-muted');
    @include dash-tabular;
  }
}
</style>
