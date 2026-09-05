<template>
  <aside class="explorer-sidebar">
    <HeaderLogo /><NavigationMenu />
  </aside>
  <header class="app-header">
    <button
      ref="menuButton"
      type="button"
      class="app-header__menu icon-button"
      :aria-label="$t('accessibility.mobileMenu')"
      :aria-expanded="drawerOpen"
      aria-controls="explorer-drawer"
      @click="openDrawer"
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      ><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    <HeaderLogo class="app-header__logo" />
    <SearchField
      class="app-header__search"
      size="md"
    />
    <div class="app-header__buttons">
      <ScopedExplorerControl v-if="currentScope" />
      <NodeSettings v-else />
      <ThemeSwitcher /><LangDropdown />
    </div>
    <div
      :id="PORTAL_ID"
      class="app-header__dropdown"
    />
  </header>
  <dialog
    id="explorer-drawer"
    ref="drawer"
    class="explorer-drawer"
    :aria-label="$t('ux.navigation')"
    @close="drawerOpen = false"
    @click="onBackdrop"
    @keydown="containFocus"
  >
    <div class="explorer-drawer__header">
      <HeaderLogo />
      <button
        type="button"
        class="icon-button"
        :aria-label="$t('ux.close')"
        @click="closeDrawer"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        ><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>
    </div>
    <NavigationMenu />
  </dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import HeaderLogo from './HeaderLogo.vue';
import { NavigationMenu } from '@/features/navigation';
import { LangDropdown } from '@/features/switch-lang';
import { ThemeSwitcher } from '@/features/switch-theme';
import { SearchField } from '@/features/search';
import { NodeSettings, ScopedExplorerControl } from '@/features/node-settings';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';
const currentScope = useCurrentExplorerScope();
const route = useRoute();
const drawer = ref<HTMLDialogElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
const drawerOpen = ref(false);
const desktop = useMediaQuery('(min-width: 1200px)');

function openDrawer() {
  drawer.value?.showModal();
  drawerOpen.value = true;
}
function closeDrawer() {
  if (!drawerOpen.value) return;
  drawer.value?.close();
  drawerOpen.value = false;
}
function containFocus(event: KeyboardEvent) {
  const target = drawer.value;
  if (event.key !== 'Tab' || !target) return;
  const controls = Array.from(target.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex="0"]'))
    .filter((element) => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !target.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
function onBackdrop(event: MouseEvent) {
  const target = drawer.value;
  if (!target || event.target !== target) return;
  const rect = target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDrawer();
}
watch(() => route.fullPath, closeDrawer);
watch(desktop, (value) => { if (value) closeDrawer(); });
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.explorer-sidebar {
  display: none; position: fixed; inset-block: 0; inset-inline-start: 0; width: 240px;
  overflow-y: auto; background: theme-color('surface'); border-inline-end: 1px solid theme-color('border-primary'); z-index: 30;
  > .header-logo { height: 72px; display: flex; justify-content: start; padding: 16px 24px; }
  .header-logo__img { width: 160px; }
  @media (min-width: 1200px) { display: block; }
}
.app-header {
  position: relative; z-index: 25; background: theme-color('surface');
  border-bottom: 1px solid theme-color('border-primary'); padding: 6px 12px;
  display: grid; grid-template-columns: 44px minmax(0, 1fr) auto;
  grid-template-areas: 'menu logo controls' 'search search search'; gap: 4px 8px;
  &__menu { grid-area: menu; }
  &__logo { grid-area: logo; justify-content: flex-start; .header-logo__img { width: 96px; max-width: 100%; } }
  &__buttons { grid-area: controls; display: flex; align-items: center; gap: 4px; min-width: 0; }
  &__search { grid-area: search; min-width: 0; }
  @media (max-width: 1199px) { .scoped-explorer-control__label { max-width: clamp(48px, 12vw, 144px); } }
  &__dropdown { position: absolute; inset-inline-end: 12px; top: 100%; z-index: 40; }
  @media (min-width: 1200px) {
    margin-inline-start: 240px; min-height: 72px; padding: 12px 24px;
    grid-template-columns: minmax(0, 640px) auto; grid-template-areas: 'search controls'; justify-content: space-between; gap: 20px;
    &__logo, &__menu { display: none; }
  }
}
.explorer-drawer {
  position: fixed; inset-block: 0; inset-inline-start: 0; inset-inline-end: auto;
  margin: 0; width: min(320px, 90vw); max-width: none; height: 100dvh; max-height: none;
  padding: 0; border: 0; background: theme-color('surface'); color: theme-color('content-primary'); overflow-y: auto;
  &::backdrop { background: rgba(0, 0, 0, .45); }
  &__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid theme-color('border-primary'); }
  .header-logo__img { width: 160px; }
  &[open] { animation: drawer-open 150ms ease-out; }
}
@keyframes drawer-open { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
</style>
