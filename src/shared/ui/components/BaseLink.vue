<template>
  <a
    v-if="isExternalLink"
    :href="externalHref"
    target="_blank"
    rel="noopener noreferrer"
    class="base-link"
  >
    <slot />
  </a>
  <router-link
    v-else
    :to="scopedTo"
    class="base-link"
    :data-monospace="monospace || null"
    :data-custom-font="customFont || null"
  >
    <slot />
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { applyExplorerScopeToLocation } from '@/shared/lib/explorer-scope';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { getToriiBaseUrl } from '@/shared/api';
import { normalizeAccountRoutePath } from '@/shared/lib/account-id';

interface Props {
  to: RouteLocationRaw
  monospace?: boolean
  customFont?: boolean
}

const props = defineProps<Props>();
const scope = useCurrentExplorerScope();

const isExternalLink = computed(() => {
  return typeof props.to === 'string' && /^https?:\/\//.test(props.to);
});

const normalizedTo = computed<RouteLocationRaw>(() => {
  if (typeof props.to !== 'string') return props.to;
  if (isExternalLink.value) return props.to;
  return normalizeAccountRoutePath(props.to, scope.value?.torii ?? getToriiBaseUrl());
});

const externalHref = computed(() => (typeof normalizedTo.value === 'string' ? normalizedTo.value : ''));

const scopedTo = computed(() => applyExplorerScopeToLocation(normalizedTo.value, scope.value));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-link {
  color: theme-color('primary');
  cursor: pointer;

  &:hover {
    color: theme-color('primary-hover');
  }

  &[data-monospace] {
    @include tpg-link1-mono;
  }

  &:not([data-custom-font], [data-monospace]) {
    @include tpg-link1;
  }
}
</style>
