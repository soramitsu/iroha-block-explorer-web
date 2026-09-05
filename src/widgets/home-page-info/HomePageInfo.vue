<template>
  <section
    class="home-page-info"
    :aria-label="$t('ux.network')"
  >
    <div
      v-if="!metrics"
      class="home-page-info__availability"
      role="status"
    >
      <BaseLoading v-if="isMetricsLoading" />
      <span>{{ $t(isMetricsLoading ? 'ux.collection.loading' : 'ux.metricsUnavailable') }}</span>
      <BaseButton @click="reconnect">
        {{ $t('ux.collection.retry') }}
      </BaseButton>
    </div>
    <template v-else>
      <div
        v-if="streamStatus !== 'OPEN'"
        class="home-page-info__availability"
        role="status"
      >
        <span>{{ $t('ux.metricsStale') }}</span><BaseButton @click="reconnect">
          {{ $t('ux.collection.retry') }}
        </BaseButton>
      </div>
      <dl class="home-page-info__grid">
        <div
          v-for="item in items"
          :key="item.i18nKey"
          class="home-page-info__item"
        >
          <dt>{{ $t(item.i18nKey) }}</dt><dd class="home-page-info__item-value">
            {{ item.value }}
          </dd>
        </div>
      </dl>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { useTelemetryMetrics } from '@/shared/ui/composables/useTelemetryMetrics';
const { metrics, isLoading: isMetricsLoading, streamStatus, reconnect } = useTelemetryMetrics();
const items = computed(() => [
  { value: metrics.value?.accounts, i18nKey: 'homePage.totalAccounts' },
  { value: metrics.value?.assets, i18nKey: 'homePage.totalAssets' },
  { value: metrics.value?.domains, i18nKey: 'homePage.totalDomains' },
  { value: metrics.value?.block, i18nKey: 'homePage.totalBlocks' },
  { value: metrics.value ? metrics.value.transactions_accepted + metrics.value.transactions_rejected : null, i18nKey: 'homePage.totalTransactions' },
  { value: metrics.value?.peers, i18nKey: 'homePage.totalNodes' },
]);
</script>
<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.home-page-info {
  min-width: 0;
  &__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding-block: 16px; border-block: 1px solid theme-color('border-primary'); }
  &__item { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  dt { color: theme-color('content-secondary'); font-size: 12px; }
  dd { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  &__availability { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; min-height: 72px; font-size: 13px; color: theme-color('content-secondary'); .base-loading { width: 24px; height: 24px; } }
  @container (min-width: 720px) { &__grid { grid-template-columns: repeat(6, minmax(0, 1fr)); padding-block: 24px; } }
}
</style>
