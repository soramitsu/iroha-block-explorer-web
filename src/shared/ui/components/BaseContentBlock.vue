<template>
  <div class="base-content-block">
    <div class="base-content-block__header">
      <slot name="header" />

      <template v-if="!slots.header">
        <h2 class="base-content-block__title">
          {{ props.title }}
        </h2>
        <slot name="header-action" />
      </template>
    </div>

    <hr>

    <div class="base-content-block__body">
      <slot name="default" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
}

const props = defineProps<Props>();
const slots = defineSlots();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.base-content-block {
  min-width: 0; background: theme-color('surface'); border: 1px solid theme-color('border-primary'); border-radius: 12px;
  &__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; min-height: 64px; padding: 12px 24px; }
  &__title { color: theme-color('content-primary'); font-size: 22px; font-weight: 600; line-height: 1.35; }
  &__body { min-width: 0; padding-bottom: 16px; }
}
</style>
