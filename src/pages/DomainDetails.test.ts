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
            pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
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
            pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
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
            pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
            items: [],
          },
        },
        refetch: vi.fn(),
      }
    );
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
        },
      },
    });

  it('shows an error for invalid account asset filters', async () => {
    const wrapper = factory();
    const accountAssetFilter = wrapper.get(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);

    await accountAssetFilter.setValue('not-a-valid-asset-id');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('accounts.filters.assetInvalid'));
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
      'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    setupStateQueue[2].data.data.items = [
      {
        id: 'legacy-account-id',
        i105_address: canonicalAccountId,
      },
    ];
    setupStateQueue[2].data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    const hash = wrapper.get('.base-hash-stub');
    expect(hash.text()).toBe(canonicalAccountId);
    expect(hash.attributes('data-link')).toBe(`/accounts/${encodeURIComponent(canonicalAccountId)}`);
  });
});
