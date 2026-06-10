<template>
  <div class="base-inner-block">
    <div
      v-if="props.title"
      :data-clickable="props.accordion || null"
      :data-open="isOpen || null"
      class="base-inner-block__header"
      @click="toggle"
    >
      <h3 class="base-inner-block__title">
        {{ props.title }}
      </h3>

      <ArrowIcon
        v-if="props.accordion"
        :data-open="isOpen || null"
        class="base-inner-block__icon"
      />
    </div>

    <slot v-if="isOpen" />
  </div>
</template>

<script setup lang="ts">
import ArrowIcon from '@/shared/ui/icons/arrow.svg';
import { ref } from 'vue';

interface Props {
  accordion?: boolean
  title?: string
}

const props = defineProps<Props>();
const isOpen = ref(true);

function toggle() {
  if (props.accordion) {
    isOpen.value = !isOpen.value;
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-inner-block {
  border-radius: size(4);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, theme-color('surface') 96%, white),
    color-mix(in srgb, theme-color('surface-variant') 92%, white)
  );
  padding: size(3) size(4);
  margin: size(3) size(4);

  @include shadow-elevated;

  &__header {
    display: flex;
    align-items: center;
    user-select: none;

    &[data-clickable] {
      cursor: pointer;
    }

    &[data-open] {
      margin-bottom: size(3);
    }
  }

  &__title {
    color: theme-color('content-primary');
    @include tpg-s2;
  }

  &__icon {
    margin-left: size(1);
    color: theme-color('content-primary');
    transform: rotate(-90deg);

    &[data-open] {
      transform: rotate(90deg);
    }
  }
}

html:not(.dark) .base-inner-block {
  border: 1px solid color-mix(in srgb, theme-color('border-primary') 72%, white);
  box-shadow:
    theme-shadow('elevated-1'),
    theme-shadow('elevated-2'),
    theme-shadow('elevated-3');
}
</style>
