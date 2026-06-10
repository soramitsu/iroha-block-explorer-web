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
  display: flex;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  padding: size(1.5) size(2);
  border: 1px solid transparent;
  border-radius: size(3);
  transition:
    color 300ms ease-in-out,
    box-shadow 300ms ease-in-out,
    background-color 300ms ease-in-out,
    border-color 300ms ease-in-out;
  color: theme-color('content-secondary-bright');
  background: transparent;

  @include tpg-ch1;

  &_active {
    background: theme-color('background');
    @include shadow-elevated-active;
  }

  &:hover {
    color: theme-color('content-primary');
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    box-shadow: none;
  }

  &[data-type='line'] {
    padding: size(1.5) 0;
  }

  &[data-type='default'] {
    &:hover {
      background: theme-color('background');
      @include shadow-elevated-active;
    }
  }

  &[data-type='bordered'] {
    background: theme-color('background');
    @include shadow-elevated;

    &[data-pressed] {
      @include shadow-lowered;
      color: theme-color('content-primary');
    }

    &:hover {
      @include shadow-elevated-active;

      &[data-pressed] {
        @include shadow-lowered-active;
      }
    }

    &:disabled {
      @include shadow-elevated;
    }
  }

  &[data-rounded] {
    padding: size(1.5);
  }
}

html:not(.dark) .base-button {
  color: theme-color('content-secondary');
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.38);

  &_active,
  &[data-type='default']:hover {
    border-color: color-mix(in srgb, theme-color('border-primary') 76%, white);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 98%, white),
      color-mix(in srgb, theme-color('surface-variant') 94%, white)
    );
    box-shadow:
      theme-shadow('elevated-1'),
      theme-shadow('elevated-2'),
      theme-shadow('elevated-3');
  }

  &[data-type='bordered'] {
    border-color: color-mix(in srgb, theme-color('border-primary') 78%, white);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 98%, white),
      color-mix(in srgb, theme-color('surface-variant') 93%, white)
    );
    box-shadow:
      theme-shadow('elevated-1'),
      theme-shadow('elevated-2'),
      theme-shadow('elevated-3');

    &:hover {
      border-color: color-mix(in srgb, theme-color('primary') 18%, theme-color('border-primary'));
    }

    &[data-pressed] {
      background: linear-gradient(
        145deg,
        color-mix(in srgb, theme-color('surface-variant') 96%, white),
        color-mix(in srgb, theme-color('background') 90%, white)
      );
    }
  }

  &[data-type='line'] {
    border-color: transparent;
    background: transparent;
  }
}
</style>
