<template>
  <div class="home-page-info">
    <div class="home-page-info__search">
      <SearchField
        size="lg"
        :placeholder="$t('homePage.search.placeholder')"
        large
      />
    </div>

    <BaseLoading
      v-if="isMetricsLoading"
      class="home-page-info_loading"
    />

    <div
      v-if="!isMetricsLoading"
      class="home-page-info__grid"
    >
      <div
        v-for="item in firstSection"
        :key="item.i18nKey"
        class="home-page-info__item"
      >
        <span class="home-page-info__item-value">
          {{ item.value }}
        </span>

        <span class="home-page-info__item-label">
          {{ $t(item.i18nKey) }}
        </span>
      </div>
    </div>

    <div
      v-if="!isMetricsLoading"
      class="home-page-info__grid"
    >
      <div
        v-for="item in secondSection"
        :key="item.i18nKey"
        class="home-page-info__item"
      >
        <span class="home-page-info__item-value">
          {{ item.value }}
        </span>

        <span class="home-page-info__item-label">
          {{ $t(item.i18nKey) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SearchField } from '@/features/search';
import { computed } from 'vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import { useTelemetryMetrics } from '@/shared/ui/composables/useTelemetryMetrics';

const firstSection = computed(() => {
  return [
    { value: metrics.value?.accounts ?? 0, i18nKey: 'homePage.totalAccounts' },
    { value: metrics.value?.assets ?? 0, i18nKey: 'homePage.totalAssets' },
    { value: metrics.value?.domains ?? 0, i18nKey: 'homePage.totalDomains' },
  ];
});

const secondSection = computed(() => {
  return [
    { value: metrics.value?.block ?? 0, i18nKey: 'homePage.totalBlocks' },
    {
      value: metrics.value ? metrics.value.transactions_accepted + metrics.value.transactions_rejected : 0,
      i18nKey: 'homePage.totalTransactions',
    },
    { value: metrics.value ? metrics.value.peers : 1, i18nKey: 'homePage.totalNodes' },
  ];
});

const { metrics, isLoading: isMetricsLoading } = useTelemetryMetrics();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.home-page-info {
  height: 160px;
  background: theme-color('surface-variant');
  width: 100%;
  display: grid;
  justify-items: center;
  margin-top: 0;
  z-index: 1;
  position: relative;
  isolation: isolate;

  @include xs {
    margin-top: size(3);
    margin-top: size(0); // #SEARCH: remove when functionality is ready
  }

  @include sm {
    height: 210px;
  }

  @include md {
    margin-top: size(10);
    margin-top: size(4); // #SEARCH: remove when functionality is ready
  }

  &_loading {
    margin-top: 60px;

    @include sm {
      margin-top: 85px;
    }
  }

  &__search {
    display: none; // #SEARCH: remove when functionality is ready

    position: relative;
    margin-top: size(-3);
    width: 100%;
    padding: 0 size(2);

    @include xs {
      margin-top: size(-4);
    }

    @include md {
      margin-top: size(-5.5);
      padding: 0 size(9);
      width: $home-content-width-tablet;
    }

    @include lg {
      padding: 0 size(12);
      width: $home-content-width;
    }
  }

  &__grid {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: size(2) 0 size(1) 0;

    @include md {
      padding: size(2) 0;
    }
  }

  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 33%;

    &-value {
      @include tpg-h2;
      color: theme-color('content-on-surface-variant');
      height: size(3.5);

      @include xs {
        height: size(4);
        @include tpg-h2;
      }
      @include sm {
        @include tpg-h1;
        height: size(5.5);
      }
      @include md {
        @include tpg-d2;
      }
      @include lg {
        height: size(7);
        @include tpg-d1;
      }
    }

    @include md {
      width: 25%;
    }
    @include xl {
      width: 20%;
    }
    @include xxl {
      width: 18%;
    }

    &-label {
      @include tpg-s5;
      color: theme-color('content-quaternary');
      text-align: center;

      @include xs {
        @include tpg-s4;
      }
    }
  }
}

html:not(.dark) {
  .home-page-info {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, theme-color('surface') 98%, white),
      color-mix(in srgb, theme-color('surface-variant') 92%, white)
    );
    border-top: 1px solid color-mix(in srgb, theme-color('border-secondary') 75%, white);
    border-bottom: 1px solid color-mix(in srgb, theme-color('border-secondary') 60%, white);
  }

  .home-page-info__item-value {
    color: theme-color('primary');
  }

  .home-page-info__item-label {
    color: theme-color('content-secondary');
  }
}
</style>
