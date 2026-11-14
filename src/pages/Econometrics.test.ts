import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BigNumber from 'bignumber.js';
import Econometrics from './Econometrics.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ALT_ASSET_DEFINITION_ID = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
const SAMPLE_ASSET_ALIAS = 'USD#Issuer.Main';
const SAMPLE_EXPLORER_ASSET_DEFINITION = {
  id: SAMPLE_ASSET_DEFINITION_ID,
  owning_domain: null,
  mintable: 'Infinitely',
  logo: null,
  metadata: {},
  owned_by: SAMPLE_ACCOUNT_ID,
  assets: 0,
  total_quantity: new BigNumber(0),
  locked_quantity: null,
  circulating_quantity: null,
};
const SAMPLE_FULL_ASSET_DEFINITION = {
  id: SAMPLE_ASSET_DEFINITION_ID,
  owning_domain: null,
  name: 'usd',
  description: null,
  alias: null,
  balance_scope_policy: 'Global',
  confidential_policy: {},
  logo: null,
  metadata: {},
  mintable: 'Infinitely',
  owned_by: SAMPLE_ACCOUNT_ID,
  spec: {},
  total_quantity: new BigNumber(0),
};

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
  fetchAssetDefinitions: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'http://localhost'),
  isToriiBaseUrlForced: vi.fn(() => false),
}));

vi.mock('@/shared/api', () => apiMocks);

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { limit: 50, next_cursor: null as string | null, has_more: false },
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
    apiMocks.getToriiBaseUrl.mockClear();
    setupState.data.data.items = [];
    routerMocks.currentRoute.value = { name: 'econometrics', query: {}, params: {} } as any;

    apiMocks.fetchAssetDefinition.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...SAMPLE_FULL_ASSET_DEFINITION },
    });

    apiMocks.fetchAssetDefinitionSnapshot.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        computed_at_ms: 1_700_000_000_000,
        holders_total: 0,
        total_supply: new BigNumber(0),
        top_holders: [],
        distribution: {
          gini: 0,
          hhi: 0,
          theil: 0,
          entropy: 0,
          entropy_normalized: 0,
          nakamoto_33: 0,
          nakamoto_51: 0,
          nakamoto_67: 0,
          top1: 0,
          top5: 0,
          top10: 0,
          median: null,
          p90: null,
          p99: null,
          lorenz: [
            { population: 0, share: 0 },
            { population: 1, share: 1 },
          ],
        },
      },
    });
    apiMocks.fetchAssetDefinitionEconometrics.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        computed_at_ms: 1_700_000_000_000,
        velocity_windows: [],
        issuance_windows: [],
        issuance_series: [],
      },
    });
  });

  it('does not persist or present browser-derived holder churn from the top-holder projection', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;

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

    expect(apiMocks.getToriiBaseUrl).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Holder churn');
  });

  it('computes when an asset is clicked in the asset list (no Compute button required)', async () => {
    setupState.data.data.items = [{ ...SAMPLE_EXPLORER_ASSET_DEFINITION }];

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

  it('renders the fetched asset alias in the computed snapshot for canonical asset ids', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;

    apiMocks.fetchAssetDefinition.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...SAMPLE_FULL_ASSET_DEFINITION,
        alias: SAMPLE_ASSET_ALIAS,
        alias_binding: {
          alias: SAMPLE_ASSET_ALIAS,
          status: 'permanent',
          bound_at_ms: 1_700_000_000_000,
        },
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

  it('resolves an alias before requesting canonical snapshot and econometrics resources', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_ALIAS },
      params: {},
    } as any;
    apiMocks.fetchAssetDefinition.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...SAMPLE_FULL_ASSET_DEFINITION,
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: SAMPLE_ASSET_ALIAS,
      },
    });

    mount(Econometrics, {
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

    await vi.waitFor(() => {
      expect(apiMocks.fetchAssetDefinitionEconometrics).toHaveBeenCalledTimes(1);
    });

    expect(apiMocks.fetchAssetDefinition).toHaveBeenCalledWith(SAMPLE_ASSET_ALIAS);
    expect(apiMocks.fetchAssetDefinitionSnapshot).toHaveBeenCalledWith(SAMPLE_ASSET_DEFINITION_ID);
    expect(apiMocks.fetchAssetDefinitionEconometrics).toHaveBeenCalledWith(SAMPLE_ASSET_DEFINITION_ID);
    expect(apiMocks.fetchAssetDefinitionSnapshot).not.toHaveBeenCalledWith(SAMPLE_ASSET_ALIAS);
    expect(apiMocks.fetchAssetDefinitionEconometrics).not.toHaveBeenCalledWith(SAMPLE_ASSET_ALIAS);
    expect(apiMocks.fetchAssetDefinition.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.fetchAssetDefinitionSnapshot.mock.invocationCallOrder[0] ?? 0
    );
    expect(apiMocks.fetchAssetDefinitionSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.fetchAssetDefinitionEconometrics.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('renders canonical asset-definition ids without inferring aliases in the picker', async () => {
    setupState.data.data.items = [{ ...SAMPLE_EXPLORER_ASSET_DEFINITION }];

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

    expect(wrapper.text()).toContain(SAMPLE_ASSET_DEFINITION_ID);
    expect(wrapper.text()).not.toContain(SAMPLE_ASSET_ALIAS);
  });

  it('removes unfiltered picker rows while the owner filter is invalid', async () => {
    setupState.data.data.items = [
      {
        ...SAMPLE_EXPLORER_ASSET_DEFINITION,
        assets: 1,
        total_quantity: new BigNumber(1),
      },
    ];
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
    const ownerFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.ownerPlaceholder')}"]`);
    expect(wrapper.text()).toContain(SAMPLE_ASSET_DEFINITION_ID);

    await ownerFilter.setValue('not-a-valid-owner');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain(SAMPLE_ASSET_DEFINITION_ID);
  });

  it.each([
    {
      name: 'returned server error',
      configure: () =>
        apiMocks.fetchAssetDefinitionSnapshot.mockResolvedValueOnce({
          status: UNKNOWN_ERROR,
          error: new Error('snapshot service unavailable'),
        }),
      message: 'Unable to fetch econometrics data',
    },
    {
      name: 'thrown schema error',
      configure: () =>
        apiMocks.fetchAssetDefinitionSnapshot.mockRejectedValueOnce(new Error('snapshot schema mismatch')),
      message: 'Unable to fetch econometrics data',
    },
  ])('surfaces a $name and does not request activity data', async ({ configure, message }) => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;
    configure();

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

    await vi.waitFor(() => expect(wrapper.text()).toContain(message));
    expect(apiMocks.fetchAssetDefinitionEconometrics).not.toHaveBeenCalled();
  });

  it('surfaces an authoritative econometrics endpoint failure', async () => {
    routerMocks.currentRoute.value = {
      name: 'econometrics',
      query: { asset: SAMPLE_ASSET_DEFINITION_ID },
      params: {},
    } as any;
    apiMocks.fetchAssetDefinitionSnapshot.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        computed_at_ms: 1_700_000_000_000,
        holders_total: 0,
        total_supply: new BigNumber(0),
        top_holders: [],
        distribution: {
          gini: 0,
          hhi: 0,
          theil: 0,
          entropy: 0,
          entropy_normalized: 0,
          nakamoto_33: 0,
          nakamoto_51: 0,
          nakamoto_67: 0,
          top1: 0,
          top5: 0,
          top10: 0,
          median: null,
          p90: null,
          p99: null,
          lorenz: [
            { population: 0, share: 0 },
            { population: 1, share: 1 },
          ],
        },
      },
    });
    apiMocks.fetchAssetDefinitionEconometrics.mockRejectedValueOnce(new Error('econometrics schema mismatch'));

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

    await vi.waitFor(() => expect(wrapper.text()).toContain('Unable to fetch econometrics data'));
    expect(apiMocks.fetchAssetDefinitionEconometrics).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale endpoint failure after a newer asset finishes successfully', async () => {
    setupState.data.data.items = [
      {
        ...SAMPLE_EXPLORER_ASSET_DEFINITION,
        id: SAMPLE_ASSET_DEFINITION_ID,
      },
      {
        ...SAMPLE_EXPLORER_ASSET_DEFINITION,
        id: SAMPLE_ALT_ASSET_DEFINITION_ID,
      },
    ];
    apiMocks.fetchAssetDefinition.mockImplementation(async (definition: string) => ({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...SAMPLE_FULL_ASSET_DEFINITION,
        id: definition,
      },
    }));

    let rejectFirstSnapshot!: (reason: Error) => void;
    const firstSnapshot = new Promise((_, reject) => {
      rejectFirstSnapshot = reject;
    });
    apiMocks.fetchAssetDefinitionSnapshot
      .mockImplementationOnce(() => firstSnapshot)
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
          definition_id: SAMPLE_ASSET_DEFINITION_ID,
          computed_at_ms: 1_700_000_000_000,
          holders_total: 0,
          total_supply: new BigNumber(0),
          top_holders: [],
          distribution: {
            gini: 0,
            hhi: 0,
            theil: 0,
            entropy: 0,
            entropy_normalized: 0,
            nakamoto_33: 0,
            nakamoto_51: 0,
            nakamoto_67: 0,
            top1: 0,
            top5: 0,
            top10: 0,
            median: null,
            p90: null,
            p99: null,
            lorenz: [
              { population: 0, share: 0 },
              { population: 1, share: 1 },
            ],
          },
        },
      });
    apiMocks.fetchAssetDefinitionEconometrics.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        computed_at_ms: 1_700_000_000_000,
        velocity_windows: [],
        issuance_windows: [],
        issuance_series: [],
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

    await wrapper.findAll('.row')[0]!.trigger('click');
    await vi.waitFor(() => expect(apiMocks.fetchAssetDefinitionSnapshot).toHaveBeenCalledTimes(1));
    await wrapper.findAll('.row')[1]!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain(SAMPLE_ALT_ASSET_DEFINITION_ID));

    rejectFirstSnapshot(new Error('stale snapshot failure'));
    await flushPromises();

    expect(wrapper.text()).toContain(SAMPLE_ALT_ASSET_DEFINITION_ID);
    expect(wrapper.text()).not.toContain('stale snapshot failure');
  });
});
