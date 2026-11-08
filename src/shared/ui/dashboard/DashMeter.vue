<template>
  <div class="dash-meter">
    <div class="dash-meter__head">
      <span
        :id="labelId"
        class="dash-meter__label"
      >{{ label }}</span>
      <span class="dash-meter__value">{{ valueText }}</span>
    </div>
    <div
      class="dash-meter__track"
      role="meter"
      :aria-labelledby="labelId"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-valuenow="value ?? undefined"
      :aria-valuetext="valueText"
    >
      <div
        class="dash-meter__fill"
        :data-tone="tone"
        :style="{ width: `${percent}%` }"
      />
    </div>
    <span
      v-if="caption"
      class="dash-meter__caption"
    >{{ caption }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string
    value: number | null
    max: number
    valueText: string
    caption?: string
    /** Fractions of `max` where the fill turns to warning and critical. */
    warnAt?: number | null
    criticalAt?: number | null
  }>(),
  { caption: '', warnAt: null, criticalAt: null }
);

const labelId = useId();

const fraction = computed(() =>
  props.value === null || !Number.isFinite(props.value) || !(props.max > 0)
    ? 0
    : Math.min(1, Math.max(0, props.value / props.max))
);
const percent = computed(() => Math.round(fraction.value * 1000) / 10);

const tone = computed(() => {
  if (props.criticalAt !== null && fraction.value >= props.criticalAt) return 'critical';
  if (props.warnAt !== null && fraction.value >= props.warnAt) return 'warning';
  return 'normal';
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-meter {
  display: grid;
  gap: size(0.75);
  min-width: 0;

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: size(1);
  }

  &__label {
    @include tpg-s4;
    color: theme-color('content-secondary');
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__value {
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
    @include dash-tabular;
    white-space: nowrap;
  }

  &__track {
    position: relative;
    height: 12px;
    border-radius: 999px;
    background: theme-color('dash-well');
    box-shadow: theme-shadow('dash-inset');
    overflow: hidden;
  }

  &__fill {
    position: absolute;
    inset-block: 2px;
    inset-inline-start: 2px;
    min-width: 0;
    max-width: calc(100% - 4px);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, theme-color('chart-accent') 70%, theme-color('dash-well')),
      theme-color('chart-accent')
    );
    box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-accent') 45%, transparent);
    transition: width 500ms ease;

    // The fill grows from the inline start, so its bright edge leads in either direction.
    &:dir(rtl) {
      background: linear-gradient(
        270deg,
        color-mix(in srgb, theme-color('chart-accent') 70%, theme-color('dash-well')),
        theme-color('chart-accent')
      );
    }

    &[data-tone='warning'] {
      background: theme-color('chart-warning');
      box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-warning') 45%, transparent);
    }

    &[data-tone='critical'] {
      background: theme-color('chart-critical');
      box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-critical') 45%, transparent);
    }
  }

  &__caption {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }
}
</style>
