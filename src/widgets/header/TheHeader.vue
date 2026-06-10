<template>
  <header class="app-header">
    <HeaderLogo />

    <SearchField
      class="app-header__search"
      size="md"
      :placeholder="$t('search')"
    />

    <div class="app-header__nav">
      <NavigationMenu />
    </div>

    <div class="app-header__buttons">
      <ScopedExplorerControl
        v-if="currentScope"
        class="app-header__button app-header__button_node"
      />
      <NodeSettings
        v-else
        class="app-header__button app-header__button_node"
      />
      <ThemeSwitcher class="app-header__button app-header__button_icon" />
      <LangDropdown class="app-header__button app-header__button_lang" />
    </div>

    <div
      :id="PORTAL_ID"
      class="app-header__dropdown"
    />
  </header>
</template>

<script setup lang="ts">
import HeaderLogo from './HeaderLogo.vue';
import { NavigationMenu } from '@/features/navigation';
import { LangDropdown } from '@/features/switch-lang';
import { ThemeSwitcher } from '@/features/switch-theme';
import { SearchField } from '@/features/search';
import { NodeSettings, ScopedExplorerControl } from '@/features/node-settings';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';

const currentScope = useCurrentExplorerScope();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.app-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'logo controls'
    'nav nav';
  align-items: center;
  column-gap: size(1);
  row-gap: size(1);
  min-height: $header-height-mobile;
  padding: size(1) size(1);
  margin: 0 auto;
  max-width: 1180px;
  position: relative;
  z-index: 20;
  isolation: isolate;
  background: color-mix(in srgb, theme-color('surface') 88%, transparent);
  border: 1px solid color-mix(in srgb, theme-color('border-primary') 70%, transparent);
  border-radius: size(2.5);
  box-shadow:
    0 12px 30px color-mix(in srgb, theme-color('primary') 8%, transparent),
    0 2px 8px color-mix(in srgb, theme-color('background') 30%, transparent);
  backdrop-filter: blur(10px);

  &::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: calc(size(2.5) - 1px);
    pointer-events: none;
    background:
      radial-gradient(circle at 16% 8%, rgba(255, 255, 255, 0.12), transparent 30%),
      radial-gradient(circle at 86% 14%, color-mix(in srgb, theme-color('primary') 6%, transparent), transparent 32%);
    opacity: 0.7;
  }

  @include xs {
    padding: size(1) size(2);
    min-height: $header-height-landscape-mobile;
  }

  @include md {
    padding: size(1.5) size(3);
    min-height: $header-height;
  }

  @include xl {
    max-width: $xl;
  }

  @include xxl {
    padding: 0 size(7);
    max-width: $xxl;
  }

  &__search {
    display: none !important;
  }

  &__nav {
    grid-area: nav;
    display: block;
    width: 100%;
    margin-inline-start: 0;
  }

  &__buttons {
    grid-area: controls;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: size(0.5);
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    flex-wrap: nowrap;
    justify-self: end;
    margin-inline-start: auto;

    @include sm {
      gap: size(1);
    }

    @include xxl {
      gap: size(2);
    }

  }

  &__button {
    flex: 0 0 auto;
    min-width: 0;
  }

  &__button_node {
    flex: 0 1 auto;
    min-width: 0;
    max-width: size(24);

    @include xxl {
      max-width: size(28);
    }
  }

  &__button_icon,
  &__button_lang {
    flex-shrink: 0;
  }

  .header-logo {
    grid-area: logo;
    justify-self: start;
  }

  &__dropdown {
    position: absolute;
    top: calc(100% + size(1));
    z-index: 100;
    inset-inline-end: size(1);

    @include xs {
      inset-inline-end: size(2);
    }

    @include md {
      inset-inline-end: size(3);
    }
  }

}
</style>
