<template>
  <div class="home-page">
    <div class="home-page__buttons">
      <ThemeSwitcher />
      <LangDropdown />
      <MobileMenu />
    </div>

    <div
      :id="PORTAL_ID"
      class="home-page__dropdown"
    />

    <BackgroundLogo class="home-page__background-logo" />
    <LogoIcon class="home-page__logo-icon" />

    <h1 class="home-page__title">
      <strong class="nowrap">{{ $t('homePage.title.firstLine') }}</strong>
      {{ ' ' }}
      <strong class="nowrap">{{ $t('homePage.title.secondLine') }}</strong>
    </h1>

    <div class="home-page__search">
      <SearchField
        size="lg"
        :placeholder="$t('homePage.search.placeholder')"
      />
      <div class="home-page__search-help">
        <span class="home-page__search-hint-title">{{ $t('homePage.search.hintTitle') }}</span>
        <div class="home-page__search-tags">
          <button
            v-for="sample in searchSamples"
            :key="sample.key"
            type="button"
            class="home-page__search-tag"
            @click="navigateToSample(sample.route)"
          >
            {{ sample.label }}
          </button>
        </div>
      </div>
    </div>

    <NavigationMenu class="home-page__menu" />
    <HomePageInfo />

    <div class="home-page__blocks">
      <LatestBlocks />
      <LatestTransactions />
    </div>
  </div>
</template>

<script setup lang="ts">
import BackgroundLogo from '@/shared/ui/icons/background-logo.svg';
import LogoIcon from '@/shared/ui/icons/logo.svg';
import { LatestBlocks } from '@/widgets/latest-blocks';
import { LatestTransactions } from '@/widgets/latest-transactions';
import { ThemeSwitcher } from '@/features/switch-theme';
import { LangDropdown } from '@/features/switch-lang';
import { MobileMenu } from '@/features/mobile-menu';
import { NavigationMenu } from '@/features/navigation';
import { HomePageInfo } from '@/widgets/home-page-info';
import { PORTAL_ID } from '@/shared/ui/consts';
import SearchField from '@/features/search/SearchField.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

const navigation = useScopedExplorerNavigation();
const { t } = useI18n({ useScope: 'global' });
const SAMPLE_BLOCK = '12345';
const SAMPLE_TX_HASH = '0xabc123';
const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION = 'usd#issuer.main';
const SAMPLE_NFT_ID = 'cool-cat$gallery';
const SAMPLE_RWA_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities';

interface SearchSample {
  key: string
  label: string
  route: RouteLocationRaw
}

const searchSamples = computed<SearchSample[]>(() => [
  {
    key: 'block',
    label: t('homePage.search.samples.block'),
    route: { name: 'blocks-details', params: { heightOrHash: SAMPLE_BLOCK } },
  },
  {
    key: 'tx',
    label: t('homePage.search.samples.tx'),
    route: { name: 'transaction-details', params: { hash: SAMPLE_TX_HASH } },
  },
  {
    key: 'account',
    label: t('homePage.search.samples.account'),
    route: { name: 'account-details', params: { id: SAMPLE_ACCOUNT_ID } },
  },
  {
    key: 'asset',
    label: t('homePage.search.samples.asset'),
    route: { name: 'asset-details', params: { id: SAMPLE_ASSET_DEFINITION } },
  },
  {
    key: 'nft',
    label: t('homePage.search.samples.nft'),
    route: { name: 'nft-details', params: { id: SAMPLE_NFT_ID } },
  },
  {
    key: 'rwa',
    label: t('homePage.search.samples.rwa'),
    route: { name: 'rwa-details', params: { id: SAMPLE_RWA_ID } },
  },
]);

function navigateToSample(route: RouteLocationRaw) {
  const result = navigation.push(route);
  if (result && typeof result.catch === 'function') {
    result.catch(() => {});
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.home-page {
  position: relative;
  display: grid;
  justify-items: center;
  z-index: 0;
  isolation: isolate;

  &__dropdown {
    position: absolute;
    z-index: 10;
    inset-inline-end: size(1);
    top: calc(2% + size(1));

    @include xs {
      inset-inline-end: size(2);
      top: calc(2% + size(3));
    }

    @include md {
      inset-inline-end: size(3);
    }

    @include lg {
      top: calc(3% + size(3.5));
      inset-inline-end: size(4);
    }
  }

  &__buttons {
    top: size(1);
    inset-inline-end: size(1);

    position: relative;
    display: grid;
    grid-auto-columns: auto;
    grid-auto-flow: column;
    grid-gap: size(0.5);
    margin-inline-start: auto;

    @include xs {
      grid-gap: size(1);
      top: size(2);
      inset-inline-end: size(2);
    }

    @include md {
      top: size(3);
      inset-inline-end: size(3);
    }

    @include lg {
      top: size(4);
      inset-inline-end: size(4);
    }

    @include xl {
      grid-gap: size(2);
    }
  }

  &__background-logo {
    position: absolute;
    top: size(-4);
    left: 50%;
    transform: translateX(-50.05%);
    color: theme-color('content-primary');
    z-index: -1;
  }

  &__logo-icon {
    height: 112px;
    width: 112px;
    margin-top: 25px;
    fill: theme-color('primary');

    @include md {
      margin-top: 50px;
    }

    @include xl {
      margin-top: 80px;
    }
  }

  &__title {
    @include tpg-h2;
    color: theme-color('content-primary');
    margin: size(4) size(6) size(2) size(6);
    text-align: center;
    max-width: min(940px, 92vw);
    text-wrap: balance;

    @include xs {
      @include tpg-h1;
    }

    @include md {
      @include tpg-d1;
    }
  }

  &__search {
    width: min(900px, 92vw);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
    padding: 0;
    margin-bottom: size(3);

    @include xs {
      gap: size(2);
    }

    @include md {
      gap: size(2.5);
      margin-bottom: size(4);
    }
  }

  &__search-help {
    display: flex;
    flex-direction: column;
    gap: size(1);
    align-items: center;
  }

  &__search-hint-title {
    color: theme-color('content-secondary');
    @include tpg-s3;
    letter-spacing: 0.3px;
  }

  &__search-tags {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    justify-content: center;
  }

  &__search-tag {
    appearance: none;
    padding: size(1) size(1.5);
    border-radius: size(1.5);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, theme-color('primary') 8%, transparent),
      color-mix(in srgb, theme-color('background') 90%, transparent)
    );
    border: 1px solid color-mix(in srgb, theme-color('primary') 40%, theme-color('border-secondary'));
    color: theme-color('content-primary');
    @include tpg-s4;
    white-space: nowrap;
    box-shadow: 0 10px 20px color-mix(in srgb, theme-color('primary') 7%, transparent);
    cursor: pointer;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      border-color 160ms ease;

    &:hover {
      border-color: color-mix(in srgb, theme-color('primary') 65%, theme-color('border-secondary'));
      box-shadow: 0 12px 24px color-mix(in srgb, theme-color('primary') 12%, transparent);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: none;
      box-shadow:
        0 12px 24px color-mix(in srgb, theme-color('primary') 12%, transparent),
        0 0 0 3px color-mix(in srgb, theme-color('primary') 18%, transparent);
    }
  }

  &__blocks {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: center;
    padding: size(1) size(1) size(2) size(1);
    grid-gap: size(1);
    width: 100%;

    @include xs {
      padding: size(2) size(2) size(4) size(2);
      grid-gap: size(2);
    }

    @include md {
      padding: size(5) size(3) size(5) size(3);
      grid-gap: size(3);
    }

    @include lg {
      grid-template-columns: 1fr 1fr;
    }

    @include xl {
      grid-template-columns: 600px 600px;
    }
  }
}

:root[dir='rtl'] {
  .home-page__search {
    direction: rtl;
    text-align: right;
    align-items: flex-end;
  }

  .home-page__search-help {
    align-items: flex-end;
    text-align: right;
  }

  .home-page__search-tags {
    justify-content: flex-end;
  }
}

@media (dynamic-range: high), (video-dynamic-range: high) {
  @supports (color: color(display-p3 1 1 1)) {
    html.dark .home-page {
      &__search-tag {
        background: linear-gradient(
          135deg,
          color-mix(in display-p3, theme-color('primary') 15%, transparent),
          color-mix(in display-p3, theme-color('background') 92%, transparent)
        );
        border-color: color-mix(in display-p3, theme-color('primary') 52%, theme-color('border-secondary'));
        box-shadow: 0 12px 24px color-mix(in display-p3, theme-color('primary') 14%, transparent);
      }
    }
  }
}
</style>
