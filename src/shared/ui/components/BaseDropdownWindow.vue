<template>
  <div
    ref="target"
    class="base-dropdown-window"
    :data-size="size"
  >
    <slot name="top" />

    <ul
      v-if="items?.length"
      id="window_listbox"
      class="base-dropdown-window__list"
      role="listbox"
    >
      <li
        v-for="item in items"
        :key="item.value"
        :data-active="model === item.value || null"
        :data-size="size"
        class="base-dropdown-window__item"
        role="option"
        :aria-selected="model === item.value || false"
        tabindex="0"
        @click="model = item.value"
        @keydown.enter.space="model = item.value"
      >
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside, useVModel } from '@vueuse/core';
import { ref } from 'vue';

interface Props {
  modelValue: string
  size: 'md' | 'lg'
  ignoreClickOutside?: string[]
  items?: {
    label: string
    value: string
  }[]
}

type Emits = (event: 'update:modelValue', value: string) => void;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const target = ref(null);

onClickOutside(target, () => {
  emit('update:modelValue', model.value);
}, {
  ignore: props.ignoreClickOutside ?? [],
});

const model = useVModel(props, 'modelValue', emit);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-dropdown-window {
  position: relative;
  z-index: 1;
  isolation: isolate;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, theme-color('surface') 96%, white),
    color-mix(in srgb, theme-color('surface-variant') 92%, white)
  );
  color: theme-color('content-primary');
  fill: theme-color('content-primary');
  overflow: hidden;
  border: 1px solid color-mix(in srgb, theme-color('border-primary') 74%, white);

  @include tpg-s4;
  @include shadow-input;

  &[data-size='md'] {
    border-radius: size(2);
  }

  &[data-size='lg'] {
    border-radius: size(3);
  }

  &__list {
    padding: 0;
    margin: size(1) 0;
  }

  &__item {
    list-style: none;
    user-select: none;
    cursor: pointer;

    &:hover {
      background: theme-color('background-hover');
    }
    &[data-active] {
      background: theme-color('background-hover');
      cursor: default;
    }

    &[data-size='md'] {
      padding: size(0.5) size(2);
    }

    &[data-size='lg'] {
      padding: size(1) size(3);
    }
  }
}

html:not(.dark) .base-dropdown-window {
  box-shadow:
    theme-shadow('notification-1'),
    theme-shadow('notification-2'),
    inset 1px 1px 0 rgba(255, 255, 255, 0.92);

  &__item {
    &:hover,
    &[data-active] {
      background: color-mix(in srgb, theme-color('surface-variant') 82%, white);
    }
  }
}
</style>
