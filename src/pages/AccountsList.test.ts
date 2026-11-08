import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import AccountsList from './AccountsList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

enableAutoUnmount(afterEach);
const updateListQuery = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      nextCursor: null as string | null,
      items: [] as any[],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupState),
}));

vi.mock('@/shared/ui/composables/useListRouteQuery', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue');
  return {
    useCursorListRouteQuery: () => ({
      route: { query: {} },
      cursor: ref<string | null>(null),
      limit: ref(10),
      updateListQuery,
    }),
  };
});

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><h1>{{ title }}</h1><slot /></div>',
};

const BaseTableStub = {
  name: 'BaseTableStub',
  props: ['items', 'paginationMode', 'cursorPagination', 'total'],
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
    'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';

  beforeEach(() => {
    vi.useFakeTimers();
    updateListQuery.mockClear();
    setupState.data.data.items = [];
    setupState.data.data.nextCursor = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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
    await vi.advanceTimersByTimeAsync(600);
    expect(updateListQuery).not.toHaveBeenCalled();
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
    await vi.advanceTimersByTimeAsync(300);
    expect(updateListQuery).toHaveBeenCalledExactlyOnceWith({ domain: null, asset: sampleAssetAlias });
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

    const wrapper = factory();
    await flushPromises();

    const hash = wrapper.get('.base-hash-stub');
    expect(hash.text()).toBe(canonicalAccountId);
    expect(hash.attributes('data-link')).toBe(`/accounts/${encodeURIComponent(canonicalAccountId)}`);
  });

  it('uses an explicit canonical account link instead of a clickable table row', async () => {
    setupState.data.data.items = [{
      id: 'legacy-account-id',
      i105_address: canonicalAccountIdAlt,
      owned_domains: 1,
      owned_assets: 0,
      owned_nfts: 0,
    }];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('.base-hash-stub').attributes('data-link')).toBe(
      `/accounts/${encodeURIComponent(canonicalAccountIdAlt)}`
    );
  });

  it('passes authoritative cursor metadata to the table without an exact total', async () => {
    setupState.data.data.nextCursor = 'cursor-1';
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTableStub' });
    expect(table.props('paginationMode')).toBe('cursor');
    expect(table.props('cursorPagination')).toEqual(setupState.data.data);
    expect(table.props('total')).toBeUndefined();
  });
});
