import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type * as VueI18nModule from 'vue-i18n';
import HomePage from './HomePage.vue';

const pushSpy = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof VueI18nModule>();

  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('HomePage', () => {
  const sampleAccountId =
    'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
  const sampleAssetAlias = 'usd#issuer.main';

  beforeEach(() => {
    pushSpy.mockReset();
  });

  const mountPage = () =>
    mount(HomePage, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          ThemeSwitcher: true,
          LangDropdown: true,
          MobileMenu: true,
          NavigationMenu: true,
          HomePageInfo: true,
          LatestBlocks: true,
          LatestTransactions: true,
          SearchField: true,
          BackgroundLogo: true,
          LogoIcon: true,
        },
      },
    });

  it('routes to sample destinations when search tags are clicked', async () => {
    const wrapper = mountPage();
    const tags = wrapper.findAll('.home-page__search-tag');
    expect(tags).toHaveLength(6);

    await tags[0].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(1, { name: 'blocks-details', params: { heightOrHash: '12345' } });

    await tags[1].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(2, { name: 'transaction-details', params: { hash: '0xabc123' } });

    await tags[2].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(3, { name: 'account-details', params: { id: sampleAccountId } });

    await tags[3].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(4, { name: 'asset-details', params: { id: sampleAssetAlias } });

    await tags[4].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(5, { name: 'nft-details', params: { id: 'cool-cat$gallery' } });

    await tags[5].trigger('click');
    expect(pushSpy).toHaveBeenNthCalledWith(6, {
      name: 'rwa-details',
      params: { id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities' },
    });
  });
});
