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

const currentRoute = ref({ name: 'assets', path: '/assets', query: {}, params: {} } as any);
const pushSpy = vi.fn();
const replaceSpy = vi.fn();

function routeNameForPath(path: string) {
  if (path === '/nfts') return 'nfts';
  if (path === '/rwas') return 'rwas';
  return 'assets';
}

function applyNavigation(location: any) {
  const previous = currentRoute.value;
  if (typeof location === 'string') {
    const url = new URL(location, 'http://localhost');
    currentRoute.value = {
      ...previous,
      name: routeNameForPath(url.pathname),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    };
    return Promise.resolve();
  }

  const path = location.path ?? previous.path ?? '/assets';
  currentRoute.value = {
    ...previous,
    ...location,
    name: location.name ?? (location.path ? routeNameForPath(path) : previous.name),
    path,
    query: location.query ?? previous.query,
  };
  return Promise.resolve();
}

const routeProxy = {
  get name() { return currentRoute.value.name; },
  get path() { return currentRoute.value.path; },
  get query() { return currentRoute.value.query; },
  get params() { return currentRoute.value.params; },
};

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute,
    push: pushSpy,
    replace: replaceSpy,
  }),
  useRoute: () => routeProxy,
}));

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      nextCursor: null,
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
  name: 'BaseTabsStub',
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template: '<div class="tabs" />',
};

const BaseTableStub = {
  name: 'BaseTableStub',
  props: ['items', 'cursor', 'pageSize', 'paginationMode', 'cursorPagination'],
  emits: ['update:cursor', 'update:pageSize'],
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
    pushSpy.mockImplementation(applyNavigation);
    replaceSpy.mockReset();
    replaceSpy.mockImplementation(applyNavigation);
    setupState.data.data.items = [];
    setupState.data.data.nextCursor = null;
    currentRoute.value = { name: 'assets', path: '/assets', query: {}, params: {} } as any;
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
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue(SAMPLE_ACCOUNT_ID);
    await flushPromises();

    expect(currentRoute.value.query).toEqual({ view: 'holders', holder: SAMPLE_ACCOUNT_ID });
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
        id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities.main',
        owned_by: SAMPLE_ACCOUNT_ID,
        quantity: new BigNumber(42),
        held_quantity: new BigNumber(2),
        primary_reference: 'vault://receipts/2',
        status: 'active',
        is_frozen: false,
        metadata: {},
      },
    ];
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('commodities');
    expect(wrapper.text()).toContain(SAMPLE_ACCOUNT_ID);
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('2');
  });

  it('shows an error for invalid owner filters on the asset definitions tab', async () => {
    setupState.data.data.items = [
      {
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: null,
        name: null,
        logo: null,
        assets: 1,
        total_quantity: new BigNumber(1),
        locked_quantity: null,
        circulating_quantity: null,
        metadata: {},
        mintable: 'Infinitely',
        owned_by: SAMPLE_ACCOUNT_ID,
      },
    ];
    const wrapper = factory();
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);

    expect(wrapper.text()).toContain(SAMPLE_ASSET_DEFINITION_ID);

    await ownerFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain(SAMPLE_ASSET_DEFINITION_ID);
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
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).not.toContain(SAMPLE_ASSET_ALIAS);
    expect(wrapper.findAll('.hash')).toHaveLength(0);
  });

  it('shows an error for invalid owner filters on the rwa tab', async () => {
    currentRoute.value = { name: 'rwas', path: '/rwas', query: {}, params: {} } as any;
    setupState.data.data.items = [
      {
        id: 'lot-for-invalid-filter$commodities',
        owned_by: SAMPLE_ACCOUNT_ID,
        quantity: new BigNumber(42),
        held_quantity: new BigNumber(0),
        primary_reference: 'vault://invalid-filter-regression',
        status: null,
        is_frozen: false,
        metadata: {},
        parents: [],
      },
    ];
    const wrapper = factory();
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);

    expect(wrapper.text()).toContain('lot-for-invalid-filter');

    await ownerFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain('lot-for-invalid-filter');
  });

  it('does not retain unfiltered NFT rows for an invalid owner filter', async () => {
    currentRoute.value = { name: 'nfts', path: '/nfts', query: {}, params: {} } as any;
    setupState.data.data.items = [
      {
        id: 'invalid-filter-regression$collectibles',
        owned_by: SAMPLE_ACCOUNT_ID,
        metadata: {},
      },
    ];
    const wrapper = factory();
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);

    expect(wrapper.text()).toContain('invalid-filter-regression');

    await ownerFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain('invalid-filter-regression');
  });

  it('restores an NFT filter-bound cursor and limit from the route', async () => {
    currentRoute.value = {
      name: 'nfts',
      path: '/nfts',
      query: {
        cursor: 'nft_cursor_2',
        limit: '20',
        domain: 'collectibles',
        owner: SAMPLE_ACCOUNT_ID,
      },
      params: {},
    } as any;

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.domainPlaceholder')}"]`).element).toHaveProperty(
      'value',
      'collectibles'
    );
    expect(wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`).element).toHaveProperty(
      'value',
      SAMPLE_ACCOUNT_ID
    );
    const table = wrapper.getComponent({ name: 'BaseTableStub' });
    expect(table.props('cursor')).toBe('nft_cursor_2');
    expect(table.props('pageSize')).toBe(20);
  });

  it('atomically clears cursor and retired offset keys when a filter changes', async () => {
    currentRoute.value = {
      name: 'rwas',
      path: '/rwas',
      query: { cursor: 'rwa_cursor_2', limit: '20', domain: 'commodities' },
      params: {},
    } as any;
    const wrapper = factory();
    await flushPromises();

    currentRoute.value = {
      ...currentRoute.value,
      query: {
        cursor: 'rwa_cursor_2',
        limit: '20',
        domain: 'commodities',
        page: '2',
        per_page: '20',
      },
    };
    replaceSpy.mockClear();

    await wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.domainPlaceholder')}"]`).setValue('metals');
    await flushPromises();

    const filterNavigation = replaceSpy.mock.calls
      .map(([location]) => location)
      .find((location) => location.query?.domain === 'metals');
    expect(filterNavigation?.query).toEqual({ limit: '20', domain: 'metals' });
  });

  it('clears cursor and retired offset keys in the same page-size navigation', async () => {
    currentRoute.value = {
      name: 'assets',
      path: '/assets',
      query: { cursor: 'asset_cursor_2', domain: 'issuer' },
      params: {},
    } as any;
    const wrapper = factory();
    await flushPromises();

    currentRoute.value = {
      ...currentRoute.value,
      query: { cursor: 'asset_cursor_2', domain: 'issuer', page: '2', per_page: '10' },
    };
    replaceSpy.mockClear();
    wrapper.getComponent({ name: 'BaseTableStub' }).vm.$emit('update:pageSize', 50);
    await flushPromises();

    const limitNavigation = replaceSpy.mock.calls
      .map(([location]) => location)
      .find((location) => location.query?.limit === '50');
    expect(limitNavigation?.query).toEqual({ domain: 'issuer', limit: '50' });
  });

  it('pushes a tab route without carrying a cursor or retired offset keys', async () => {
    currentRoute.value = {
      name: 'assets',
      path: '/assets',
      query: {
        cursor: 'asset_cursor_2',
        limit: '20',
        domain: 'issuer',
        page: '2',
        per_page: '20',
      },
      params: {},
    } as any;
    const wrapper = factory();
    await flushPromises();
    pushSpy.mockClear();

    wrapper.getComponent({ name: 'BaseTabsStub' }).vm.$emit('update:modelValue', 'nft');
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({ path: '/nfts', query: { limit: '20' } });
  });

  it('restores filter and cursor state when browser history returns to a prior route', async () => {
    const wrapper = factory();
    await flushPromises();
    replaceSpy.mockClear();

    currentRoute.value = {
      name: 'assets',
      path: '/assets',
      query: {
        cursor: 'asset_cursor_3',
        limit: '20',
        domain: 'issuer',
        owner: SAMPLE_ACCOUNT_ID,
      },
      params: {},
    } as any;
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTableStub' });
    expect(table.props('cursor')).toBe('asset_cursor_3');
    expect(table.props('pageSize')).toBe(20);
    expect(wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.domainPlaceholder')}"]`).element).toHaveProperty(
      'value',
      'issuer'
    );
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
