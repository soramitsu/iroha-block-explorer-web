<template>
  <RouterLink
    v-if="to && !disabled"
    :to="scopedTo"
    class="base-button"
    active-class="base-button_active"
    :data-type="type"
    :data-pressed="pressed || null"
    :data-rounded="rounded || null"
  >
    <slot />
  </RouterLink>

  <button
    v-else
    class="base-button"
    :type="props.nativeType"
    :disabled
    :data-type="type"
    :data-pressed="pressed || null"
    :data-rounded="rounded || null"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { applyExplorerScopeToLocation } from '@/shared/lib/explorer-scope';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';

interface Props {
  to?: RouteLocationRaw
  line?: boolean
  bordered?: boolean
  rounded?: boolean
  pressed?: boolean
  disabled?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  to: undefined,
  nativeType: 'button',
});
const scope = useCurrentExplorerScope();

const type = computed(() => {
  switch (true) {
    case props.line:
      return 'line';
    case props.bordered:
      return 'bordered';
    default:
      return 'default';
  }
});

const scopedTo = computed(() => {
  if (!props.to) return '';
  return applyExplorerScopeToLocation(props.to, scope.value);
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.base-button {
  display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px;
  padding: 10px 14px; border: 1px solid transparent; border-radius: 8px;
  color: theme-color('content-secondary'); background: transparent; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.4; text-decoration: none;
  transition: background-color 120ms ease, color 120ms ease;
  &:hover { background: theme-color('background-hover'); color: theme-color('content-primary'); }
  &_active, &[data-pressed] { background: theme-color('primary-background'); color: theme-color('primary'); }
  &[data-type='bordered'] { border-color: theme-color('border-secondary'); }
  &[data-rounded] { padding: 10px; }
  &:disabled { cursor: not-allowed; color: theme-color('content-tertiary'); opacity: .65; }
}
.icon-button {
  display: inline-grid; place-items: center; min-width: 44px; min-height: 44px;
  border: 0; border-radius: 8px; background: transparent; color: theme-color('content-secondary');
  font: inherit; font-size: 20px; cursor: pointer;
  &:hover { color: theme-color('content-primary'); background: theme-color('background-hover'); }
}
:where(button, a, input, select, textarea, summary, [tabindex]):focus-visible { outline: 2px solid theme-color('primary'); outline-offset: 3px; }
</style>
