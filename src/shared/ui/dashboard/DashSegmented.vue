<template>
  <div
    class="dash-segmented"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      ref="buttons"
      type="button"
      role="radio"
      class="dash-segmented__key"
      :aria-checked="option.value === model"
      :tabindex="option.value === model ? 0 : -1"
      :data-active="option.value === model || null"
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <span
        class="dash-segmented__led"
        aria-hidden="true"
      />
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import { ref } from 'vue';

const props = defineProps<{
  options: ReadonlyArray<{ value: T, label: string }>
  label: string
}>();

const model = defineModel<T>({ required: true });
const buttons = ref<HTMLButtonElement[]>([]);

function select(index: number) {
  const option = props.options[index];
  if (!option) return;
  model.value = option.value;
  buttons.value[index]?.focus();
}

/** Radio-group keys: arrows wrap and follow the reading direction, Home/End jump. */
function onKeydown(event: KeyboardEvent, index: number) {
  const last = props.options.length - 1;
  const forward = index === last ? 0 : index + 1;
  const backward = index === 0 ? last : index - 1;
  const host = event.currentTarget as HTMLElement;
  const rtl = (host.closest('[dir]')?.getAttribute('dir') ?? document.documentElement.dir) === 'rtl';
  const next = {
    ArrowRight: rtl ? backward : forward,
    ArrowDown: forward,
    ArrowLeft: rtl ? forward : backward,
    ArrowUp: backward,
    Home: 0,
    End: last,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  select(next);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: size(0.75);
  padding: size(0.5);
  border-radius: size(2);
  background: theme-color('dash-chassis');
  box-shadow: theme-shadow('dash-inset');

  &__key {
    @include dash-key-surface(size(1.5));
    display: inline-flex;
    align-items: center;
    gap: size(0.75);
    padding: size(0.75) size(1.5);
    border: none;
    cursor: pointer;
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-secondary');
    transition:
      box-shadow 160ms ease,
      color 160ms ease,
      transform 160ms ease;

    &:hover {
      color: theme-color('content-primary');
    }

    &[data-active] {
      color: theme-color('content-primary');
      background: theme-color('dash-well');
      box-shadow: theme-shadow('dash-inset-deep');
      transform: translateY(1px);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, theme-color('chart-accent') 60%, transparent);
      outline-offset: 2px;
    }
  }

  &__led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: theme-color('dash-led-off');

    [data-active] > & {
      background: theme-color('chart-accent');
      box-shadow: 0 0 8px color-mix(in srgb, theme-color('chart-accent') 80%, transparent);
    }
  }
}
</style>
