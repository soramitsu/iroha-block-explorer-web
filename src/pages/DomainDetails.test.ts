import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import DomainDetails from './DomainDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const SAMPLE_ACCOUNT_ID =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';

const routeState = ref({
  params: { id: 'wonderland' },
  query: {},
});

const setupStateQueue = vi.hoisted((): any[] => []);

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: routeState,
  }),
}));

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupStateQueue.shift()),
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => ref(null),
  useScopedExplorerNavigation: () => ({
    push: vi.fn().mockResolvedValue(undefined),
  }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><slot name="header-action" /><slot /></div>',
};

const BaseTabsStub = {
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template: '<div class="tabs" />',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseHashStub = {
  props: ['hash', 'link'],
  template: '<span class="base-hash-stub" :data-link="link">{{ hash }}</span>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

describe('DomainDetails', () => {
  beforeEach(() => {
    routeState.value = {
      params: { id: 'wonderland' },
      query: {},
    };
    setupStateQueue.splice(0);
    setupStateQueue.push(
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            owned_by: SAMPLE_ACCOUNT_ID,
            metadata: {},
            assets: 1,
            nfts: 0,
            accounts: 1,
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            nextCursor: null,
            items: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            nextCursor: null,
            items: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            nextCursor: null,
            items: [],
          },
        },
        refetch: vi.fn(),
      }
    );
    setupStateQueue[0].snapshot = {
      status: 'ready',
      data: setupStateQueue[0].data,
      isRefreshing: false,
      refreshError: null,
    };
  });

  const factory = () =>
    mount(DomainDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          BaseTable: BaseTableStub,
          BaseTabs: BaseTabsStub,
          DataField: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

  it('shows an error for invalid account asset filters', async () => {
    setupStateQueue[2].data.data.items = [
      {
        id: SAMPLE_ACCOUNT_ID,
        i105_address: SAMPLE_ACCOUNT_ID,
      },
    ];
    const wrapper = factory();
    const accountAssetFilter = wrapper.get(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);

    expect(wrapper.text()).toContain(SAMPLE_ACCOUNT_ID);

    await accountAssetFilter.setValue('not-a-valid-asset-id');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('accounts.filters.assetInvalid'));
    expect(wrapper.text()).not.toContain(SAMPLE_ACCOUNT_ID);
  });

  it('clears the account asset filter error after a valid asset selector is entered', async () => {
    const wrapper = factory();
    const accountAssetFilter = wrapper.get(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);

    await accountAssetFilter.setValue('not-a-valid-asset-id');
    await flushPromises();
    expect(wrapper.text()).toContain(i18n.global.t('accounts.filters.assetInvalid'));

    await accountAssetFilter.setValue(SAMPLE_ASSET_ALIAS);
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('accounts.filters.assetInvalid'));
  });

  it('renders domain account rows with canonical i105 ids', async () => {
    const canonicalAccountId =
      'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
    setupStateQueue[2].data.data.items = [
      {
        id: 'legacy-account-id',
        i105_address: canonicalAccountId,
      },
    ];
    const wrapper = factory();
    await flushPromises();

    const hash = wrapper.get('.base-hash-stub');
    expect(hash.text()).toBe(canonicalAccountId);
    expect(hash.attributes('data-link')).toBe(`/accounts/${encodeURIComponent(canonicalAccountId)}`);
  });

  it('renders a domain asset as an explicit link instead of a pointer-only row', async () => {
    setupStateQueue[1].data.data.items = [
      {
        id: SAMPLE_ASSET_ALIAS,
        alias: SAMPLE_ASSET_ALIAS,
        name: 'usd',
        owned_by: SAMPLE_ACCOUNT_ID,
        mintable: 'Infinitely',
        metadata: {},
        assets: 1,
      },
    ];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get(`a[href="/assets/${encodeURIComponent(SAMPLE_ASSET_ALIAS)}"]`).text()).toBe('usd');
  });

  it('renders not-found without misleading empty dependent sections', async () => {
    setupStateQueue.splice(0, setupStateQueue.length, {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch: vi.fn(),
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Domain not found');
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('requires an explicit action before retrying a terminal domain error', async () => {
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
