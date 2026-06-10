import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import AssetDetails from './AssetDetails.vue';
import { i18n } from '@/shared/lib/localization';

const SAMPLE_ACCOUNT_ID =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';

const routeState = ref({
  params: { id: SAMPLE_ASSET_ALIAS },
});

const setupStateQueue = vi.hoisted((): any[] => []);
const assetDetailsStates = vi.hoisted(() => ({
  asset: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        alias: 'usd#issuer.main',
        name: 'usd',
        owned_by:
          'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
        mintable: 'Infinitely',
        metadata: {},
        assets: 1,
      },
    },
    refetch: vi.fn(),
  },
  assets: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
        items: [],
      },
    },
    refetch: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: routeState,
  }),
}));

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupStateQueue.shift() ?? assetDetailsStates.assets),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><slot name="header-action" /><slot /></div>',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseHashStub = {
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

const BaseButtonStub = {
  props: ['to'],
  template: '<button><slot /></button>',
};

describe('AssetDetails', () => {
  beforeEach(() => {
    routeState.value = {
      params: { id: SAMPLE_ASSET_ALIAS },
    };
    setupStateQueue.splice(0);
    setupStateQueue.push(assetDetailsStates.asset, assetDetailsStates.assets);
  });

  const factory = () =>
    mount(AssetDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseButton: BaseButtonStub,
          BaseContentBlock: BaseContentBlockStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          BaseTable: BaseTableStub,
          DataField: true,
        },
      },
    });

  it('shows an error for invalid holder filters', async () => {
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
  });

  it('clears the holder filter error after a valid account id is entered', async () => {
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();
    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));

    await holderFilter.setValue(SAMPLE_ACCOUNT_ID);
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('searchUnsupported'));
  });
});
