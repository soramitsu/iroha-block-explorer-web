<template>
  <div class="app">
    <a
      class="app__skip-link"
      href="#main-content"
    >Skip to main content</a>

    <main
      v-if="isHomeRoute"
      id="main-content"
      ref="mainContent"
      class="app__main"
      tabindex="-1"
    >
      <RouterView :key="routerViewKey" />
    </main>

    <template v-else-if="isFullBleedRoute">
      <TheHeader />
      <div
        id="main-content"
        ref="mainContent"
        class="app__main app__main--full-bleed"
        tabindex="-1"
      >
        <RouterView :key="routerViewKey" />
      </div>
    </template>

    <template v-else>
      <TheHeader />

      <main
        id="main-content"
        ref="mainContent"
        class="app__main"
        tabindex="-1"
      >
        <BasePageLayout>
          <RouterView :key="routerViewKey" />
        </BasePageLayout>
      </main>
    </template>

    <NotificationsInstance />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import NotificationsInstance from '@/shared/ui/components/NotificationsInstance.vue';
import BasePageLayout from '@/shared/ui/components/BasePageLayout.vue';
import { TheHeader } from '@/widgets/header';
import { getToriiBaseUrl, setRouteScopedToriiBaseUrl } from '@/shared/api';
import { parseExplorerScopeFromRoute } from '@/shared/lib/explorer-scope';
import { disconnectExplorerReadSession, explorerReadAuthRevision } from '@/shared/lib/explorer-read-auth';

const route = useRoute();
const mainContent = ref<HTMLElement | null>(null);

watch(() => getToriiBaseUrl(), disconnectExplorerReadSession, { flush: 'sync' });
onBeforeUnmount(disconnectExplorerReadSession);

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

const routerViewKey = computed(() => `torii:${getToriiBaseUrl()}:reader:${explorerReadAuthRevision.value}`);
const isHomeRoute = computed(() => route.name === 'home');
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
  background:
    radial-gradient(circle at 15% 20%, color-mix(in srgb, theme-color('primary') 8%, transparent), transparent 40%),
    radial-gradient(circle at 85% 10%, color-mix(in srgb, theme-color('primary') 6%, transparent), transparent 35%),
    linear-gradient(180deg, color-mix(in srgb, theme-color('background') 90%, transparent), theme-color('background'));
  color: theme-color('content-primary');
}

html:not(.dark) body {
  background:
    radial-gradient(circle at 14% 18%, color-mix(in srgb, theme-color('primary') 10%, transparent), transparent 44%),
    radial-gradient(circle at 86% 10%, color-mix(in srgb, theme-color('info') 7%, transparent), transparent 40%),
    linear-gradient(180deg, theme-color('body'), theme-color('background'));
}

html:not(.dark) #app {
  background: color-mix(in srgb, theme-color('surface') 96%, transparent);
}

@media (dynamic-range: high), (video-dynamic-range: high) {
  @supports (color: color(display-p3 1 1 1)) {
    html.dark body {
      background:
        radial-gradient(
          circle at 15% 20%,
          color-mix(in display-p3, theme-color('primary') 18%, transparent),
          transparent 48%
        ),
        radial-gradient(
          circle at 85% 10%,
          color-mix(in display-p3, theme-color('primary') 14%, transparent),
          transparent 42%
        ),
        linear-gradient(
          180deg,
          color-mix(in display-p3, theme-color('background') 86%, transparent),
          theme-color('background')
        );
    }

    html.dark #app {
      background: color-mix(in display-p3, theme-color('background') 88%, transparent);
    }
  }
}

html[lang='ur'] body {
  --app-font-family:
    'Noto Nastaliq Urdu',
    'Urdu Typesetting',
    'Noto Naskh Arabic',
    'Noto Sans Arabic',
    'Geeza Pro',
    'Sora',
    sans-serif;
}

html[lang='akk'] body {
  --app-font-family:
    'Noto Sans Cuneiform',
    'Segoe UI Historic',
    'Akkadian',
    'Sora',
    sans-serif;
}

html[lang='egy'] body {
  --app-font-family:
    'Noto Sans Egyptian Hieroglyphs',
    'Aegyptus',
    'Segoe UI Historic',
    'Sora',
    sans-serif;
}

#app {
  background: color-mix(in srgb, theme-color('background') 92%, transparent);
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
    @include shadow-notification;
    transform: translateY(calc(-100% - #{size(2)}));

    &:focus-visible {
      transform: translateY(0);
    }
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
  box-shadow: theme-shadow('separator');

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

.content-row--with-hover:hover {
  box-shadow: theme-shadow('row');

  + hr {
    background: transparent;
    box-shadow: none;
  }
}

.h-sm {
  @include tpg-h4;
  color: theme-color('content-quaternary');
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
