<template>
  <div class="dash-stat">
    <span class="dash-stat__label">{{ label }}</span>
    <span class="dash-stat__value">
      <bdi>{{ value }}</bdi><span
        v-if="unit"
        class="dash-stat__unit"
      >{{ unit }}</span>
    </span>
    <svg
      v-if="sparkPoints"
      class="dash-stat__spark"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        :points="sparkPoints"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-if="hint"
      class="dash-stat__hint"
    >{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string
    value: string
    unit?: string
    hint?: string
    /** Optional recent values, oldest first, drawn as a de-emphasised sparkline. */
    trend?: number[] | null
  }>(),
  { unit: '', hint: '', trend: null }
);

const sparkPoints = computed(() => {
  const values = (props.trend ?? []).filter((value) => Number.isFinite(value));
  if (values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${22 - ((value - min) / span) * 20}`)
    .join(' ');
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-stat {
  display: grid;
  align-content: start;
  gap: size(0.5);
  min-width: 0;
  padding: size(1.5) size(2);
  border-radius: size(2);
  background: theme-color('dash-well');
  box-shadow: theme-shadow('dash-inset');

  &__label {
    @include tpg-s4;
    color: theme-color('content-secondary');
  }

  &__value {
    @include tpg-h1;
    font-weight: 600;
    color: theme-color('content-primary');
    overflow-wrap: anywhere;
  }

  &__unit {
    margin-inline-start: 4px;
    @include tpg-s3;
    color: theme-color('dash-ink-muted');
  }

  &__spark {
    width: 100%;
    height: 24px;

    polyline {
      fill: none;
      stroke: theme-color('dash-ink-muted');
      stroke-width: 1.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
  }

  &__hint {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }
}
</style>
