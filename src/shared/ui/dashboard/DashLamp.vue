<template>
  <span
    class="dash-lamp"
    :data-tone="tone"
    role="status"
  >
    <span
      class="dash-lamp__bulb"
      :data-tone="tone"
      :data-pulse="pulse || null"
      aria-hidden="true"
    />
    <span class="dash-lamp__label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
export type DashLampTone = 'good' | 'info' | 'warning' | 'critical' | 'idle' | 'off';

withDefaults(
  defineProps<{
    tone: DashLampTone
    label: string
    pulse?: boolean
  }>(),
  { pulse: false }
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-lamp {
  display: inline-flex;
  align-items: center;
  gap: size(1);
  min-width: 0;
  @include tpg-s4;
  color: theme-color('content-primary');

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // Each tone has its own bulb shape so state never depends on colour alone.
  &__bulb {
    position: relative;
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    background: theme-color('dash-led-off');
    box-shadow: theme-shadow('dash-inset');
    border-radius: 50%;

    &[data-tone='good'] {
      background: radial-gradient(circle at 35% 35%, #ffffff 0, theme-color('chart-good') 45%);
      box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-good') 70%, transparent);
    }

    &[data-tone='info'] {
      border-radius: 2px;
      transform: rotate(45deg) scale(0.86);
      background: radial-gradient(circle at 35% 35%, #ffffff 0, theme-color('chart-series-1') 50%);
      box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-series-1') 60%, transparent);
    }

    &[data-tone='warning'] {
      border-radius: 0;
      clip-path: polygon(50% 4%, 98% 96%, 2% 96%);
      background: theme-color('chart-warning');
      box-shadow: none;
    }

    &[data-tone='critical'] {
      border-radius: 2px;
      background: radial-gradient(circle at 35% 35%, #ffffff 0, theme-color('chart-critical') 45%);
      box-shadow: 0 0 10px color-mix(in srgb, theme-color('chart-critical') 70%, transparent);
    }

    &[data-tone='idle'] {
      background: transparent;
      border: 2px solid theme-color('dash-ink-muted');
      box-shadow: none;
    }

    &[data-pulse]::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      border: 2px solid currentColor;
      color: theme-color('chart-good');
      opacity: 0;
      animation: dash-lamp-pulse 2.4s ease-out infinite;
    }
  }
}

@keyframes dash-lamp-pulse {
  0% {
    opacity: 0.55;
    transform: scale(0.7);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}
</style>
