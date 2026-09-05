import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AccountsList from './AccountsList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { ref } from 'vue';

const cursorPaginationState = ref<
  { ok: true, cursor: string | null, limit: number } | { ok: false, code: 'invalid-cursor' | 'invalid-limit' }
>({ ok: true, cursor: null, limit: 10 });
const resetCursorPagination = vi.fn().mockResolvedValue(undefined);

const setupState = {
  get snapshot(): any {
    return this.isLoading && !this.data.data.items.length
      ? { status: 'initial-loading' }
      : { status: 'ready', data: this.data, isRefreshing: this.isLoading, refreshError: null };
  },
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { limit: 10, next_cursor: null as string | null, has_more: false },
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
      pagination: cursorPaginationState,
      resetPagination: resetCursorPagination,
      updateListQuery: vi.fn().mockResolvedValue(undefined),
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
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];
  const sampleAssetAlias = 'usd#issuer.main';
  const canonicalAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
  const canonicalAccountIdAlt = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';

  beforeEach(() => {
    setupState.data.data.items = [];
    setupState.data.data.pagination = { limit: 10, next_cursor: null, has_more: false };
    cursorPaginationState.value = { ok: true, cursor: null, limit: 10 };
    resetCursorPagination.mockClear();
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) mountedWrappers.pop()?.unmount();
  });

  const factory = () => {
    const wrapper = mount(AccountsList, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          BaseButton: {
            emits: ['click'],
            template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

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

  it('renders Torii canonical account ids directly from the id field', async () => {
    setupState.data.data.items = [
      {
        id: canonicalAccountId,
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
    setupState.data.data.items = [
      {
        id: canonicalAccountIdAlt,
        owned_domains: 1,
        owned_assets: 0,
        owned_nfts: 0,
      },
    ];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('.base-hash-stub').attributes('data-link')).toBe(
      `/accounts/${encodeURIComponent(canonicalAccountIdAlt)}`
    );
  });

  it('passes authoritative cursor metadata to the table without an exact total', async () => {
    setupState.data.data.pagination = { limit: 10, next_cursor: 'cursor-1', has_more: true };
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTableStub' });
    expect(table.props('paginationMode')).toBe('cursor');
    expect(table.props('cursorPagination')).toEqual(setupState.data.data.pagination);
    expect(table.props('total')).toBeUndefined();
  });

  it('renders an explicit recovery state instead of fetching a normalized cursor page', async () => {
    cursorPaginationState.value = { ok: false, code: 'invalid-limit' };
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="accounts-invalid-pagination"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'BaseTableStub' }).exists()).toBe(false);

    await wrapper.get('[data-test="accounts-invalid-pagination"] button').trigger('click');
    expect(resetCursorPagination).toHaveBeenCalledOnce();
  });
});
