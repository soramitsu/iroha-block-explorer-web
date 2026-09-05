<template>
  <div class="app">
    <a
      class="app__skip-link"
      href="#main-content"
    >{{ $t('accessibility.skipToMain') }}</a>
    <TheHeader />
    <main
      id="main-content"
      ref="mainContent"
      class="app__main"
      :class="{ 'app__main--full-bleed': isFullBleedRoute }"
      tabindex="-1"
    >
      <RouterView
        v-if="isFullBleedRoute"
        :key="routerViewKey"
      />
      <BasePageLayout v-else>
        <RouterView :key="routerViewKey" />
      </BasePageLayout>
    </main>
    <NotificationsInstance />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import NotificationsInstance from '@/shared/ui/components/NotificationsInstance.vue';
import BasePageLayout from '@/shared/ui/components/BasePageLayout.vue';
import { getToriiBaseUrl, setRouteScopedToriiBaseUrl } from '@/shared/api';
import { parseExplorerScopeFromRoute } from '@/shared/lib/explorer-scope';

const TheHeader = defineAsyncComponent(async () => (await import('@/widgets/header')).TheHeader);

const route = useRoute();
const mainContent = ref<HTMLElement | null>(null);

watch(
  () => route.fullPath,
  () => {
    const scope = parseExplorerScopeFromRoute(route);
    setRouteScopedToriiBaseUrl(scope?.torii ?? null);
  },
  { immediate: true }
);

watch(
  () => route.path,
  async (path, previousPath) => {
    if (previousPath === undefined || path === previousPath) return;
    await nextTick();
    mainContent.value?.focus({ preventScroll: true });
  }
);

const routerViewKey = computed(() => {
  const scope = parseExplorerScopeFromRoute(route);
  return JSON.stringify([getToriiBaseUrl(), scope?.dataspaceLaneId, scope?.dataspaceId]);
});
const isFullBleedRoute = computed(() => route.name === 'kotodama-studio');
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

html {
  &:not(.dark) {
    @include light-theme;
  }

  &.dark {
    @include dark-theme;
  }
}

body {
  --app-font-family: 'Sora';
  font-family: var(--app-font-family), 'Helvetica Neue', Arial, sans-serif;
  min-height: 100vh;
  background: theme-color('body');
  color: theme-color('content-primary');
}

html:not(.dark) { color-scheme: light; }
html.dark { color-scheme: dark; }

html[lang='ur'] body {
  --app-font-family:
    'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Geeza Pro', 'Sora', sans-serif;
}

#app {
  background: theme-color('body');
  overflow-x: hidden;
  z-index: 0;
  position: relative;
}

.app {
  &__skip-link {
    position: fixed;
    top: size(1);
    inset-inline-start: size(1);
    z-index: 1000;
    padding: size(1) size(1.5);
    border-radius: size(1);
    color: theme-color('content-primary');
    background: theme-color('surface');
    border: 1px solid theme-color('border-secondary');
    transform: translateY(calc(-100% - #{size(2)}));

    &:focus-visible {
      transform: translateY(0);
    }
  }

  &__main {
    min-width: 0;
    @media (min-width: 1200px) { margin-inline-start: 240px; }
  }

  &__main:focus {
    outline: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  html:focus-within {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}

* {
  box-sizing: border-box;
  margin: 0;
}

hr {
  border: none;
  height: 1px;
  background: theme-color('border-primary');


  &[data-vertical] {
    width: 1px;
    height: 100%;
  }
}

.content-row {
  padding: 0 size(2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  border-top: 1px solid theme-color('border-primary');

  @include sm {
    padding: 0 size(3);
  }

  @include md {
    padding: 0 size(2);
  }

  &_empty {
    justify-content: center;
  }
}

.content-row--with-hover:hover { background: theme-color('background-hover'); }

.h-sm {
  @include tpg-h4;
  color: theme-color('content-secondary');
}

.cell {
  padding: 0 size(2);
}

.nowrap {
  white-space: nowrap;
}

.row-text,
.row-text-monospace {
  color: theme-color('content-primary');
}
.row-text {
  @include tpg-s3;
}

.row-text-monospace {
  @include tpg-link1-mono;
}
</style>
