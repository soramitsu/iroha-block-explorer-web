<template>
  <div class="home-page">
    <BackgroundLogo
      class="home-page__background-logo"
      aria-hidden="true"
      focusable="false"
    />
    <LogoIcon
      class="home-page__logo-icon"
      aria-hidden="true"
      focusable="false"
    />
    <h1 class="home-page__title">
      <strong>{{ $t('homePage.title.firstLine') }}</strong>
      {{ ' ' }}
      <strong>{{ $t('homePage.title.secondLine') }}</strong>
    </h1>
    <div class="home-page__search">
      <SearchField size="lg" />
    </div>
    <NavigationMenu
      class="home-page__menu"
      layout="inline"
    />
    <div class="home-page__context">
      <span class="home-page__node">
        <span class="home-page__node-label">{{ $t('ux.node') }}</span> <bdi>{{ node }}</bdi>
      </span>
      <span
        v-if="currentScope"
        class="home-page__scope"
      >{{ $t('scopedExplorer.dataspaceContext', { lane: currentScope.dataspaceLaneId, dataspace: currentScope.dataspaceId }) }}</span>
    </div>
    <HomePageInfo />
    <div class="home-page__blocks">
      <LatestBlocks /><LatestTransactions />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { getToriiBaseUrl } from '@/shared/api';
import BackgroundLogo from '@/shared/ui/icons/background-logo.svg';
import LogoIcon from '@/shared/ui/icons/logo.svg';
import { SearchField } from '@/features/search';
import { NavigationMenu } from '@/features/navigation';
import { LatestBlocks } from '@/widgets/latest-blocks';
import { LatestTransactions } from '@/widgets/latest-transactions';
import { HomePageInfo } from '@/widgets/home-page-info';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';

const node = computed(() => getToriiBaseUrl() || window.location.origin);
const currentScope = useCurrentExplorerScope();
</script>
<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.home-page {
  position: relative; display: grid; justify-items: center; min-width: 0; z-index: 0; isolation: isolate;
  &__background-logo { position: absolute; top: -32px; left: 50%; transform: translateX(-50.05%); color: theme-color('content-primary'); z-index: -1; pointer-events: none; }
  &__logo-icon {
    width: 112px; height: 112px; margin-top: 25px; fill: theme-color('primary');
    @include md { margin-top: 50px; }
    @include xl { margin-top: 80px; }
  }
  &__title {
    @include tpg-h2; color: theme-color('content-primary'); margin: 32px 16px 16px;
    max-width: min(940px, 92vw); text-align: center; text-wrap: balance; overflow-wrap: anywhere;
    @include xs { @include tpg-h1; }
    @include md { @include tpg-d1; }
  }
  &__search {
    width: min(900px, 92vw); margin-bottom: 24px;
    @include md { margin-bottom: 32px; }
    .search-field form { height: 56px; }
    .search-field input { height: 54px; }
    @include md { .search-field form { height: 64px; } .search-field input { height: 62px; font-size: 16px; } }
    .search-field__error { position: relative; top: auto; margin-top: 12px; }
  }
  &__menu { width: min(1248px, 100%); padding: 0 16px; }
  &__context {
    display: flex; justify-content: center; flex-wrap: wrap; gap: 4px 16px; min-width: 0;
    margin: 16px; font-size: 12px; color: theme-color('content-secondary'); text-align: center; overflow-wrap: anywhere;
  }
  &__node-label { margin-inline-end: 6px; }
  &__blocks {
    display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; width: 100%; min-width: 0;
    padding: 8px 8px 16px; align-items: start;
    @include xs { padding: 16px 16px 32px; gap: 16px; }
    @include md { padding: 40px 24px; gap: 24px; }
    @include lg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @include xl { max-width: 1272px; }
  }
  .latest-blocks__row, .latest-transactions__row, .latest-transactions__info { min-width: 0; }
}
</style>
