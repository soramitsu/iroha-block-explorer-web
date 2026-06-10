<template>
  <div
    class="base-radio-group"
    role="radiogroup"
  >
    <div
      v-for="item in props.items"
      :key="item.value"
      class="base-radio-group__item"
      :data-active="item.value === props.modelValue || null"
      :aria-checked="item.value === props.modelValue"
      role="radio"
      tabindex="0"
      @click="choose(item.value)"
      @keydown.enter.space="choose(item.value)"
    >
      {{ item.label }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface RadioItem {
  label: string
  value: string
}

interface Props {
  items: RadioItem[]
  modelValue: string | null
}

type Emits = (e: 'update:modelValue', value: string | null) => void;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function choose(value: string) {
  const val = value === props.modelValue ? null : value;
  emit('update:modelValue', val);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-radio-group {
  display: grid;
  grid-gap: size(1);
  grid-auto-flow: column;
  grid-auto-columns: auto;

  &__item {
    display: grid;
    grid-gap: size(0.5);
    grid-auto-flow: column;
    width: fit-content;
    align-items: center;
    padding: size(1) size(2);
    border-radius: size(2);
    background: theme-color('background');
    cursor: pointer;
    user-select: none;
    transition: all 300ms ease-in-out;
    color: theme-color('content-secondary-bright');
    @include shadow-input;
    @include tpg-s4;

    &:hover {
      background: theme-color('background-hover');
    }

    &[data-active] {
      background: theme-color('content-quaternary');
      color: theme-color('content-on-surface-variant');
      box-shadow: none;

      &:hover {
        background: theme-color('content-quaternary');
      }
    }
  }
}
</style>
