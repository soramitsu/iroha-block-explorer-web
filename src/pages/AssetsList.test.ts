import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import BigNumber from 'bignumber.js';
import AssetsList from './AssetsList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const SAMPLE_ACCOUNT_ID =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_ACCOUNT_ID}`;

const currentRoute = ref({ name: 'assets', query: {}, params: {} } as any);
const pushSpy = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute,
    push: pushSpy,
  }),
}));

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
      items: [] as any[],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupState),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><h1>{{ title }}</h1><slot name="header-action" /><slot /></div>',
};

const BaseTabsStub = {
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template: '<div class="tabs" />',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

const BaseHashStub = {
  props: ['hash'],
  template: '<span class="hash">{{ hash }}</span>',
};

describe('AssetsList', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    setupState.data.data.items = [];
    setupState.data.data.pagination.total_items = 0;
    currentRoute.value = { name: 'assets', query: {}, params: {} } as any;
  });

  const factory = () =>
    mount(AssetsList, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseHash: BaseHashStub,
        },
      },
    });

  it('renders asset definitions on /assets', async () => {
    setupState.data.data.items = [
      {
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: SAMPLE_ASSET_ALIAS,
        name: 'usd',
        logo: null,
        assets: 0,
        total_quantity: new BigNumber(0),
        locked_quantity: null,
        circulating_quantity: null,
        metadata: {},
        mintable: 'Infinitely',
        owned_by: SAMPLE_ACCOUNT_ID,
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('a').text()).toBe(SAMPLE_ASSET_ALIAS);
    expect(wrapper.find('.hash').text()).toBe(SAMPLE_ASSET_DEFINITION_ID);
  });

  it('renders asset instances when view=holders is selected', async () => {
    currentRoute.value = { name: 'assets', query: { view: 'holders' }, params: {} } as any;
    setupState.data.data.items = [
      {
        id: SAMPLE_ASSET_ID,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_ACCOUNT_ID,
        asset_name: 'usd',
        asset_alias: SAMPLE_ASSET_ALIAS,
        value: new BigNumber(10),
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue(SAMPLE_ACCOUNT_ID);
    await flushPromises();

    expect(wrapper.find('a').text()).toBe(SAMPLE_ASSET_ALIAS);
    expect(wrapper.findAll('.hash')[0]?.text()).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(wrapper.findAll('.hash')[1]?.text()).toBe(SAMPLE_ACCOUNT_ID);
    expect(wrapper.text()).toContain('10');
  });

  it('renders canonical base58 asset definition ids without alias metadata', async () => {
    const literalId = '7KQj9rYxgS5mW1B3cD8uN4pL2tHv';
    setupState.data.data.items = [
      {
        id: literalId,
        logo: null,
        assets: 1,
        total_quantity: new BigNumber(44),
        locked_quantity: null,
        circulating_quantity: null,
        metadata: {},
        mintable: 'Infinitely',
        owned_by: SAMPLE_ACCOUNT_ID,
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('-');
    expect(wrapper.text()).toContain(literalId);
  });

  it('renders non-legacy asset instance definition ids in holders view', async () => {
    currentRoute.value = { name: 'assets', query: { view: 'holders' }, params: {} } as any;
    const literalId = '8Ls7qXz4Jm2dV9pT5bRc3HkW1Nu';
    setupState.data.data.items = [
      {
        id: `${literalId}#${SAMPLE_ACCOUNT_ID}`,
        definition_id: literalId,
        account_id: SAMPLE_ACCOUNT_ID,
        value: new BigNumber(10),
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue(SAMPLE_ACCOUNT_ID);
    await flushPromises();

    expect(wrapper.text()).toContain('-');
    expect(wrapper.text()).toContain(literalId);
    expect(wrapper.findAll('.hash')[0]?.text()).toBe(literalId);
    expect(wrapper.findAll('.hash')[1]?.text()).toBe(SAMPLE_ACCOUNT_ID);
    expect(wrapper.text()).toContain('10');
  });

  it('renders RWAs on /rwas', async () => {
    currentRoute.value = { name: 'rwas', query: {}, params: {} } as any;
    setupState.data.data.items = [
      {
        id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities',
        owned_by: SAMPLE_ACCOUNT_ID,
        quantity: new BigNumber(42),
        held_quantity: new BigNumber(2),
        primary_reference: 'vault://receipts/2',
        status: 'active',
        is_frozen: false,
        metadata: {},
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('commodities');
    expect(wrapper.text()).toContain(SAMPLE_ACCOUNT_ID);
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('2');
  });

  it('shows an error for invalid owner filters on the asset definitions tab', async () => {
    const wrapper = factory();
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);

    await ownerFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
  });

  it('shows an error for invalid holder filters on the holders tab', async () => {
    currentRoute.value = { name: 'assets', query: { view: 'holders' }, params: {} } as any;
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
  });

  it('waits for a holder filter before rendering the holders list', async () => {
    currentRoute.value = { name: 'assets', query: { view: 'holders' }, params: {} } as any;
    setupState.data.data.items = [
      {
        id: SAMPLE_ASSET_ID,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_ACCOUNT_ID,
        asset_name: 'usd',
        asset_alias: SAMPLE_ASSET_ALIAS,
        value: new BigNumber(10),
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).not.toContain(SAMPLE_ASSET_ALIAS);
    expect(wrapper.findAll('.hash')).toHaveLength(0);
  });

  it('shows an error for invalid owner filters on the rwa tab', async () => {
    currentRoute.value = { name: 'rwas', query: {}, params: {} } as any;
    const wrapper = factory();
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);

    await ownerFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
  });
});
