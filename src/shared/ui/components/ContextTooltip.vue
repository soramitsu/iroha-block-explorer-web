<script setup lang="ts">
import { ref, useId } from 'vue';
defineProps<{ message: string }>();
const open = ref(false);
const id = useId();
const dismissed = ref(false);
</script>
<template>
  <span
    class="context-tooltip"
    :class="{ 'context-tooltip--dismissed': dismissed }"
    @mouseenter="dismissed = false"
  >
    <button
      type="button"
      class="icon-button"
      :aria-label="$t('ux.moreInformation')"
      :aria-expanded="open"
      :aria-describedby="id"
      @focus="dismissed = false"
      @click.stop="open = !open; dismissed = !open"
      @keydown.esc.stop="open = false; dismissed = true"
    ><svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    ><circle
      cx="12"
      cy="12"
      r="9"
    /><path d="M12 11v6M12 7v1" /></svg></button>
    <span
      :id
      role="tooltip"
      :class="{ 'context-tooltip__open': open }"
    >{{ message }}</span>
  </span>
</template>
<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;
.context-tooltip {
  display: inline-flex; position: relative; vertical-align: middle;
  > span { display: none; position: absolute; z-index: 20; inset-inline-end: 0; bottom: 100%;
    background: theme-color('surface'); color: theme-color('content-primary'); border: 1px solid theme-color('border-secondary');
    border-radius: 8px; padding: 10px; width: max-content; max-width: min(280px, 80vw); font-size: 12px; white-space: normal; overflow-wrap: anywhere; }
  &:not(.context-tooltip--dismissed):hover > span, &:not(.context-tooltip--dismissed):focus-within > span, > span.context-tooltip__open { display: block; }
  button { font-size: 16px; }
}
</style>
