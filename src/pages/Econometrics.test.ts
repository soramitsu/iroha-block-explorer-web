import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BigNumber from 'bignumber.js';
import Econometrics from './Econometrics.vue';
import { i18n } from '@/shared/lib/localization';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const SAMPLE_ACCOUNT_ID =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  currentRoute: { value: { name: 'econometrics', query: {}, params: {} } as any },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: routerMocks.currentRoute,
    replace: routerMocks.replace,
    push: routerMocks.push,
  }),
}));

const apiMocks = vi.hoisted(() => ({
  fetchAssetDefinition: vi.fn(),
  fetchAssetDefinitionEconometrics: vi.fn(),
  fetchAssetDefinitionSnapshot: vi.fn(),
  fetchAssets: vi.fn(),
  fetchInstructions: vi.fn(),
  fetchAssetDefinitions: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'http://localhost'),
}));

vi.mock('@/shared/api', () => apiMocks);

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { page: 1, per_page: 50, total_pages: 1, total_items: 0 },
      items: [] as any[],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupState),
}));

const BaseContentBlockStub = {
  template: '<div><slot name="header-action" /><slot /><slot name="default" /></div>',
};

const BaseInnerBlockStub = {
  props: ['title'],
  template: '<div><div class="inner-title">{{ title }}</div><slot /></div>',
};

const DataFieldStub = {
  props: ['title', 'value', 'hash'],
  template: `
    <div
      class="data-field-stub"
      :data-title="title"
    >
      <span class="data-field-title">{{ title }}</span>
      <span class="data-field-value">{{
        typeof hash === 'string' && hash.length > 0 ? hash : value === null || value === undefined ? 'none' : String(value)
      }}</span>
    </div>
  `,
};

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items'],
  emits: ['click:row', 'update:page', 'update:pageSize'],
  template: `
    <div>
      <div
        v-for="item in items"
        class="row"
        @click="$emit('click:row', item)"
      >
        <slot
          name="row"
          :item="item"
        />
      </div>
    </div>
  `,
};

describe('Econometrics', () => {
  beforeEach(() => {
    routerMocks.replace.mockReset();
    routerMocks.push.mockReset();
    apiMocks.fetchAssetDefinition.mockReset();
    apiMocks.fetchAssetDefinitionEconometrics.mockReset();
    apiMocks.fetchAssetDefinitionSnapshot.mockReset();
    apiMocks.fetchAssets.mockReset();
    apiMocks.fetchInstructions.mockReset();
    setupState.data.data.items = [];
    routerMocks.currentRoute.value = { name: 'econometrics', query: {}, params: {} } as any;

    apiMocks.fetchAssetDefinition.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: null,
        total_quantity: new BigNumber(0),
        locked_quantity: null,
        circulating_quantity: null,
      },
    });

    apiMocks.fetchAssetDefinitionSnapshot.mockResolvedValue({ status: NOT_FOUND });
    apiMocks.fetchAssetDefinitionEconometrics.mockResolvedValue({ status: NOT_FOUND });

    apiMocks.fetchAssets.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 200, total_pages: 0, total_items: 0 },
        items: [],
      },
    });

    apiMocks.fetchInstructions.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 200, total_pages: 1, total_items: 0 },
        items: [],
      },
    });
  });

  it('computes when an asset is clicked in the asset list (no Compute button required)', async () => {
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

    const wrapper = mount(Econometrics, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseTable: BaseTableStub,
          BaseButton: true,
          BaseHash: true,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();

    const row = wrapper.get('.row');
    await row.trigger('click');
    await flushPromises();

    expect(routerMocks.replace).toHaveBeenCalledWith({ query: { asset: SAMPLE_ASSET_DEFINITION_ID } });
    expect(apiMocks.fetchAssetDefinition).toHaveBeenCalledTimes(1);
  });

  it('falls back to holder scan when snapshot endpoint throws (network/CORS)', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;

    apiMocks.fetchAssetDefinitionSnapshot.mockRejectedValueOnce(new Error('Failed to fetch'));
    apiMocks.fetchAssets.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 200, total_pages: 1, total_items: 0 },
        items: [],
      },
    });

    const wrapper = mount(Econometrics, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseTable: BaseTableStub,
          BaseButton: true,
          BaseHash: true,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();

    expect(apiMocks.fetchAssetDefinitionSnapshot).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchAssets).toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Failed to fetch');
  });

  it('renders the fetched asset alias in the computed snapshot for canonical asset ids', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;

    apiMocks.fetchAssetDefinition.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: SAMPLE_ASSET_ALIAS,
        total_quantity: new BigNumber(0),
        locked_quantity: null,
        circulating_quantity: null,
      },
    });

    const wrapper = mount(Econometrics, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseTable: BaseTableStub,
          BaseButton: true,
          BaseHash: true,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(wrapper.get('[data-title="Alias"]').text()).toContain(SAMPLE_ASSET_ALIAS);
    expect(wrapper.get('[data-title="Asset definition"]').text()).toContain(SAMPLE_ASSET_DEFINITION_ID);
  });

  it('renders asset aliases in the asset-definition picker list when available', async () => {
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

    const wrapper = mount(Econometrics, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseTable: BaseTableStub,
          BaseButton: true,
          BaseHash: true,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain(SAMPLE_ASSET_ALIAS);
    expect(wrapper.text()).toContain(SAMPLE_ASSET_DEFINITION_ID);
  });
});
