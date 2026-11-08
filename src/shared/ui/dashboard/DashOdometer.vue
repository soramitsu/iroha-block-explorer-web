<template>
  <div
    class="dash-odometer"
    role="img"
    :aria-label="`${label}: ${formatted}`"
  >
    <span
      v-for="cell in cells"
      :key="cell.key"
      class="dash-odometer__cell"
      :data-kind="cell.kind"
      aria-hidden="true"
    >
      <span
        v-if="cell.kind === 'digit'"
        class="dash-odometer__strip"
        :style="{ transform: `translateY(${-cell.digit * 10}%)` }"
      >
        <span
          v-for="digit in DIGITS"
          :key="digit"
        >{{ digit }}</span>
      </span>
      <template v-else>{{ cell.text }}</template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  value: number | null
  label: string
}>();

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type OdometerCell =
  | { key: string, kind: 'digit', digit: number }
  | { key: string, kind: 'separator' | 'placeholder', text: string };

const formatted = computed(() =>
  props.value === null || !Number.isSafeInteger(props.value) || props.value < 0
    ? '—'
    : new Intl.NumberFormat('en-US').format(props.value)
);

/** Cells keyed from the right so a growing number keeps each wheel's identity. */
const cells = computed<OdometerCell[]>(() => {
  const text = formatted.value;
  if (text === '—') return [{ key: 'placeholder', kind: 'placeholder', text }];
  return [...text].map((char, index) => {
    const key = `p${text.length - index}`;
    return /\d/.test(char)
      ? { key, kind: 'digit' as const, digit: Number(char) }
      : { key, kind: 'separator' as const, text: char };
  });
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-odometer {
  // Digits read left to right in every locale.
  direction: ltr;
  unicode-bidi: isolate;
  display: inline-flex;
  align-items: stretch;
  gap: 3px;
  padding: size(0.75);
  border-radius: size(1.5);
  background: theme-color('dash-lcd');
  box-shadow: theme-shadow('dash-inset-deep');
  @include tpg-d2;
  font-weight: 600;
  line-height: 1;
  @include dash-tabular;

  &__cell {
    position: relative;
    display: block;
    height: 1em;
    overflow: hidden;
    color: theme-color('dash-lcd-ink');

    &[data-kind='digit'] {
      width: 0.72em;
      border-radius: 6px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, theme-color('dash-bezel-dark') 30%, transparent),
        transparent 30%,
        transparent 70%,
        color-mix(in srgb, theme-color('dash-bezel-dark') 30%, transparent)
      );
    }

    &[data-kind='separator'] {
      width: 0.3em;
      text-align: center;
      opacity: 0.7;
    }
  }

  &__strip {
    display: grid;
    grid-auto-rows: 1em;
    justify-items: center;
    transition: transform 700ms cubic-bezier(0.22, 1.2, 0.36, 1);
  }
}

html.dark .dash-odometer__cell {
  text-shadow: 0 0 10px color-mix(in srgb, theme-color('dash-lcd-ink') 60%, transparent);
}
</style>
