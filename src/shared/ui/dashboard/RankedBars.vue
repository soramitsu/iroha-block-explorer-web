<template>
  <ol class="ranked-bars">
    <li
      v-for="item in items"
      :key="item.key"
      class="ranked-bars__row"
    >
      <BaseLink
        v-if="item.to"
        class="ranked-bars__label"
        :to="item.to"
        :title="item.label"
      >
        {{ item.label }}
      </BaseLink>
      <span
        v-else
        class="ranked-bars__label"
        :title="item.label"
      >{{ item.label }}</span>
      <span
        class="ranked-bars__track"
        aria-hidden="true"
      >
        <span
          class="ranked-bars__fill"
          :style="{ width: `${share(item.value)}%`, background: color }"
        />
      </span>
      <span class="ranked-bars__value">{{ formatValue(item.value) }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import type { RankedItem } from './types';

const props = defineProps<{
  items: RankedItem[]
  color: string
  formatValue: (value: number) => string
}>();

const max = computed(() => Math.max(0, ...props.items.map((item) => item.value)));

function share(value: number): number {
  return max.value > 0 ? Math.max(1, (value / max.value) * 100) : 0;
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.ranked-bars {
  display: grid;
  gap: size(1);
  margin: 0;
  padding: 0;
  list-style: none;

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 11rem) minmax(0, 1fr) auto;
    align-items: center;
    gap: size(1.5);
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    @include tpg-s4;
    color: theme-color('content-primary');
  }

  &__track {
    height: 10px;
    border-radius: 999px;
    background: color-mix(in srgb, theme-color('dash-grid') 70%, transparent);
    overflow: hidden;
  }

  &__fill {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
    transition: width 400ms ease;
  }

  &__value {
    min-width: 3ch;
    text-align: end;
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
    @include dash-tabular;
  }
}
</style>
