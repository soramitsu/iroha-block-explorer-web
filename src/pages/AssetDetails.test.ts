import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import AssetDetails from './AssetDetails.vue';
import { i18n } from '@/shared/lib/localization';

const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';

const routeState = ref({
  params: { id: SAMPLE_ASSET_ALIAS },
});

const setupStateQueue = vi.hoisted((): any[] => []);
const assetDetailsStates = vi.hoisted((): any => ({
  asset: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        owning_domain: 'issuer.main',
        alias: 'usd#issuer.main',
        alias_binding: null,
        name: 'usd',
        description: null,
        owned_by: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
        mintable: 'Infinitely',
        logo: null,
        metadata: {},
        assets: null,
        total_quantity: '11',
        locked_quantity: null,
        circulating_quantity: null,
      },
    },
    refetch: vi.fn(),
  },
  assets: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        nextCursor: null,
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

const DataFieldStub = {
  props: ['title', 'value', 'link'],
  template: '<div data-test="data-field" :data-title="title" :data-value="value" :data-link="link" />',
};

describe('AssetDetails', () => {
  beforeEach(() => {
    routeState.value = {
      params: { id: SAMPLE_ASSET_ALIAS },
    };
    setupStateQueue.splice(0);
    assetDetailsStates.asset.data.data.owning_domain = 'issuer.main';
    assetDetailsStates.assets.data.data.items = [];
    assetDetailsStates.assets.data.data.nextCursor = null;
    assetDetailsStates.asset.snapshot = {
      status: 'ready',
      data: assetDetailsStates.asset.data,
      isRefreshing: false,
      refreshError: null,
    };
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
          DataField: DataFieldStub,
        },
      },
    });

  it('shows an error for invalid holder filters', async () => {
    assetDetailsStates.assets.data.data.items = [
      {
        id: `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${SAMPLE_ACCOUNT_ID}`,
        definition_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        account_id: SAMPLE_ACCOUNT_ID,
        value: '11',
      },
    ];
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    expect(wrapper.text()).toContain(SAMPLE_ACCOUNT_ID);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain(SAMPLE_ACCOUNT_ID);
  });

  it('renders the zero-holder state from a terminal empty first cursor page', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('assets.assetDoesntContainAnyInstances'));
  });

  it('does not claim zero holders while Torii exposes a continuation cursor', async () => {
    assetDetailsStates.assets.data.data.nextCursor = 'holder_cursor_2';
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('assets.assetDoesntContainAnyInstances'));
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

  it('displays the authoritative owning domain for an opaque asset-definition id', async () => {
    assetDetailsStates.assets.data.data.items = [
      {
        id: `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${SAMPLE_ACCOUNT_ID}`,
        definition_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        account_id: SAMPLE_ACCOUNT_ID,
        value: '11',
      },
    ];
    const wrapper = factory();
    await flushPromises();

    const domainField = wrapper
      .findAll('[data-test="data-field"]')
      .find((field) => field.attributes('data-title') === i18n.global.t('domain'));
    expect(domainField?.attributes('data-value')).toBe('issuer.main');
    expect(domainField?.attributes('data-link')).toBe('/domains/issuer.main');
    expect(wrapper.get('a[href="/domains/issuer.main"]').text()).toBe('issuer.main');
  });

  it('renders an explicit not-found state and hides the holder controls', async () => {
    setupStateQueue.splice(0, setupStateQueue.length, {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch: vi.fn(),
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Asset definition not found');
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('does not retry a terminal error until the user activates retry', async () => {
    const refetch = vi.fn();
    setupStateQueue.splice(0, setupStateQueue.length, {
      isLoading: false,
      data: undefined,
      snapshot: {
        status: 'error',
        problem: { kind: 'network', message: 'offline' },
      },
      refetch,
    });

    const wrapper = factory();
    await flushPromises();

    expect(refetch).not.toHaveBeenCalled();
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
