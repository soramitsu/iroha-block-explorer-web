<template>
  <section
    class="dash-panel"
    :aria-labelledby="title ? titleId : undefined"
  >
    <header
      v-if="title || slots.actions"
      class="dash-panel__header"
    >
      <div class="dash-panel__heading">
        <h2
          v-if="title"
          :id="titleId"
          class="dash-panel__title"
        >
          {{ title }}
        </h2>
        <p
          v-if="caption"
          class="dash-panel__caption"
        >
          {{ caption }}
        </p>
      </div>
      <div
        v-if="slots.actions"
        class="dash-panel__actions"
      >
        <slot name="actions" />
      </div>
    </header>
    <div class="dash-panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useId, useSlots } from 'vue';

defineProps<{
  title?: string
  caption?: string
}>();

const slots = useSlots();
const titleId = useId();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-panel {
  @include dash-raised-surface(size(3));
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: size(2);
  min-width: 0;
  padding: size(2);
  color: theme-color('content-primary');

  @include sm {
    padding: size(2.5) size(3);
  }

  &__header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: size(1.5);
  }

  &__heading {
    display: grid;
    gap: size(0.5);
    min-width: 0;
  }

  &__title {
    @include tpg-h3;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: theme-color('content-primary');
  }

  &__caption {
    @include tpg-s4;
    color: theme-color('dash-ink-muted');
    max-width: 62ch;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1);
  }

  &__body {
    min-width: 0;
  }
}
</style>
