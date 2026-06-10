import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AccountsList from './AccountsList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const navigationPushSpy = vi.fn().mockResolvedValue(undefined);

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

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    push: navigationPushSpy,
  }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><h1>{{ title }}</h1><slot /></div>',
};

const BaseTableStub = {
  props: ['items'],
  emits: ['click:row'],
  template: `
    <div>
      <slot name="header" />
      <button
        v-for="item in items"
        :key="item.id"
        class="row-button"
        type="button"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </button>
    </div>
  `,
};

const BaseHashStub = {
  props: ['hash', 'link'],
  template: '<span class="base-hash-stub" :data-link="link">{{ hash }}</span>',
};

describe('AccountsList', () => {
  const sampleAssetAlias = 'usd#issuer.main';
  const canonicalAccountId =
    'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
  const canonicalAccountIdAlt =
    'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

  beforeEach(() => {
    setupState.data.data.items = [];
    setupState.data.data.pagination.total_items = 0;
    navigationPushSpy.mockClear();
  });

  const factory = () =>
    mount(AccountsList, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
        },
      },
    });

  it('shows an error for invalid asset filters', async () => {
    const wrapper = factory();
    const assetFilter = wrapper.get(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);

    await assetFilter.setValue('not-a-valid-asset-id');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('accounts.filters.assetInvalid'));
  });

  it('clears the asset filter error after a valid asset selector is entered', async () => {
    const wrapper = factory();
    const assetFilter = wrapper.get(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);

    await assetFilter.setValue('not-a-valid-asset-id');
    await flushPromises();
    expect(wrapper.text()).toContain(i18n.global.t('accounts.filters.assetInvalid'));

    await assetFilter.setValue(sampleAssetAlias);
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('accounts.filters.assetInvalid'));
  });

  it('renders canonical i105 account ids in the list even when generic ids differ', async () => {
    setupState.data.data.items = [
      {
        id: 'legacy-account-id',
        i105_address: canonicalAccountId,
        owned_domains: 1,
        owned_assets: 2,
        owned_nfts: 3,
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    const hash = wrapper.get('.base-hash-stub');
    expect(hash.text()).toBe(canonicalAccountId);
    expect(hash.attributes('data-link')).toBe(`/accounts/${encodeURIComponent(canonicalAccountId)}`);
  });

  it('navigates row clicks with the canonical i105 account id', async () => {
    setupState.data.data.items = [
      {
        id: 'legacy-account-id',
        i105_address: canonicalAccountIdAlt,
        owned_domains: 1,
        owned_assets: 0,
        owned_nfts: 0,
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();
    await wrapper.get('.row-button').trigger('click');

    expect(navigationPushSpy).toHaveBeenCalledWith(`/accounts/${encodeURIComponent(canonicalAccountIdAlt)}`);
  });
});
