<template>
  <aside
    v-if="!isHomeRoute"
    class="explorer-sidebar"
  >
    <HeaderLogo /><NavigationMenu />
  </aside>
  <header
    class="app-header"
    :class="{ 'app-header--home': isHomeRoute }"
  >
    <HeaderLogo
      v-if="!isHomeRoute"
      class="app-header__logo"
    />
    <SearchField
      v-if="!isHomeRoute"
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
  <NavigationMenu
    v-if="!isHomeRoute"
    class="explorer-mobile-navigation"
    layout="inline"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
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
const isHomeRoute = computed(() => route.name === 'home');
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
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'logo controls' 'search search'; gap: 4px 8px;
  &__logo { grid-area: logo; justify-content: flex-start; .header-logo__img { width: 120px; max-width: 100%; } }
  &__buttons { grid-area: controls; display: flex; align-items: center; gap: 4px; min-width: 0; }
  &__search { grid-area: search; min-width: 0; }
  @media (max-width: 1199px) { .scoped-explorer-control__label { max-width: clamp(48px, 12vw, 144px); } }
  &__dropdown { position: absolute; inset-inline-end: 12px; top: 100%; z-index: 40; }
  @media (min-width: 1200px) {
    margin-inline-start: 240px; min-height: 72px; padding: 12px 24px;
    grid-template-columns: minmax(0, 640px) auto; grid-template-areas: 'search controls'; justify-content: space-between; gap: 20px;
    &__logo { display: none; }
  }
  &--home {
    display: flex; justify-content: flex-end; min-height: 64px; padding: 10px 12px;
    margin: 0; border: 0; background: transparent;
    @media (min-width: 640px) { padding: 16px 24px; min-height: 76px; }
    @media (min-width: 1440px) { padding: 24px 32px; }
  }
}
.explorer-mobile-navigation {
  border-bottom: 1px solid theme-color('border-primary');
  background: theme-color('surface'); padding: 12px;
  @media (min-width: 1200px) { display: none; }
}
</style>
