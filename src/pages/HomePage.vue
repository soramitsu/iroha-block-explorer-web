<template>
  <div class="home-page">
    <header class="home-page__heading">
      <h1>{{ $t('ux.overview') }}</h1>
      <div class="home-page__context">
        <span class="home-page__node"><span class="home-page__node-label">{{ $t('ux.node') }}</span> <bdi>{{ node }}</bdi></span>
        <span v-if="currentScope" class="home-page__scope">{{ $t('scopedExplorer.dataspaceContext', { lane: currentScope.dataspaceLaneId, dataspace: currentScope.dataspaceId }) }}</span>
      </div>
    </header>
    <HomePageInfo />
    <div class="home-page__blocks">
      <LatestBlocks /><LatestTransactions />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { getToriiBaseUrl } from '@/shared/api';
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
  container-type: inline-size; display: grid; gap: 24px; min-width: 0;
  &__heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 20px; }
  h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
  &__context { display: flex; flex-wrap: wrap; gap: 4px 16px; min-width: 0; font-size: 12px; color: theme-color('content-secondary'); overflow-wrap: anywhere; }
  &__node-label { margin-inline-end: 6px; }
  &__blocks { display: grid; gap: 24px; align-items: start; min-width: 0; }
  @container (min-width: 880px) { &__blocks { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .base-content-block__header { padding: 0 16px; min-height: 56px; }
  .base-content-block__title { font-size: 18px; }
  .latest-blocks__row, .latest-transactions__row { min-width: 0; padding-inline: 16px; }
  .latest-transactions__info { min-width: 0; }
}
</style>
