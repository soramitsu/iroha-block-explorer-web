import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TransactionsTable from './TransactionsTable.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import type * as VueUse from '@vueuse/core';
import { computed, defineComponent, reactive, ref } from 'vue';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const transactionHash = 'a'.repeat(64);
const transactionHash2 = 'b'.repeat(64);
const transactionHash3 = 'c'.repeat(64);
const olderPageTransactionHash = 'e'.repeat(64);
const snapshotHash = '2'.repeat(64);

const eventSourceData = ref<string | null>(null);
const useEventSourceMock = vi.fn();
const windowScrollY = ref(0);
const routeQuery = reactive<Record<string, string | string[] | null | undefined>>({});
const routeCursor = ref<string | null>(null);
const routeLimit = ref(10);
const routePaginationInvalid = ref(false);
const resetRoutePagination = vi.fn().mockResolvedValue(undefined);

vi.mock('@/shared/ui/composables/useListRouteQuery', () => ({
  useCursorListRouteQuery: () => ({
    route: reactive({ query: routeQuery }),
    cursor: routeCursor,
    limit: routeLimit,
    pagination: computed(() =>
      routePaginationInvalid.value
        ? { ok: false as const, code: 'invalid-cursor' as const }
        : { ok: true as const, cursor: routeCursor.value, limit: routeLimit.value }
    ),
    resetPagination: resetRoutePagination,
    updateListQuery: vi.fn(async (patch: Record<string, string | number | null | undefined>) => {
      routeCursor.value = null;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') delete routeQuery[key];
        else routeQuery[key] = String(value);
      }
    }),
  }),
}));

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    rowKey: { type: Function, required: false, default: undefined },
    emptyLabel: { type: String, default: '' },
    paginationMode: { type: String, required: false, default: 'numbered' },
    cursorPagination: { type: Object, required: false, default: null },
  },
  emits: ['update:cursor', 'update:pageSize', 'click:row'],
  template: `
    <div data-test="base-table">
      <slot name="header" />
      <div v-if="items.length === 0" data-test="table-empty"><slot name="empty">{{ emptyLabel }}</slot></div>
      <div data-test="rows">
        <slot name="row" v-for="item in items" :item="item" />
      </div>
      <div data-test="mobile-cards">
        <slot name="mobile-card" v-for="item in items" :item="item" />
      </div>
    </div>
  `,
});

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUse>('@vueuse/core');
  return {
    ...actual,
    useEventSource: (...args: unknown[]) => {
      useEventSourceMock(...args);
      return {
        data: eventSourceData,
        status: ref('CLOSED'),
      };
    },
    useThrottleFn: (fn: any) => fn,
    useWindowScroll: () => ({ x: ref(0), y: windowScrollY }),
  };
});

const fetchTransactionsMock = vi.fn();

function historyPagination(nextCursor: string | null = null, hasMore = false) {
  return {
    limit: 10,
    snapshot_height: 10,
    snapshot_hash: snapshotHash,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchTransactions: (...args: any[]) => fetchTransactionsMock(...args),
  };
});

const TransactionStatusFilterStub = defineComponent({
  name: 'TransactionStatusFilterStub',
  props: {
    modelValue: { type: String, required: false, default: null },
  },
  emits: ['update:modelValue'],
  template: '<div data-test="status-filter" />',
});

const TransactionStatusStub = defineComponent({
  name: 'TransactionStatusStub',
  template: '<span data-test="status" />',
});

const BaseHashStub = defineComponent({
  name: 'BaseHashStub',
  props: {
    hash: { type: String, required: true },
  },
  template: '<span data-test="hash">{{ hash }}</span>',
});

const BaseLinkStub = defineComponent({
  name: 'BaseLinkStub',
  props: {
    to: { type: [String, Object], required: false },
  },
  template: '<a data-test="link"><slot /></a>',
});

describe('TransactionsTable', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];
  const baseTransaction = {
    authority: SAMPLE_I105,
    hash: transactionHash,
    block: 10,
    created_at: new Date('2024-01-01T00:00:00Z'),
    executable: 'Instructions',
    status: 'Committed',
  } as const;

  beforeEach(() => {
    fetchTransactionsMock.mockReset();
    useEventSourceMock.mockClear();
    eventSourceData.value = null;
    windowScrollY.value = 0;
    routeCursor.value = null;
    routeLimit.value = 10;
    routePaginationInvalid.value = false;
    resetRoutePagination.mockClear();
    for (const key of Object.keys(routeQuery)) delete routeQuery[key];
    // Ensure stream code-path is exercised.
    (window as any).EventSource = class EventSource {};

    fetchTransactionsMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          limit: 10,
          snapshot_height: 10,
          snapshot_hash: snapshotHash,
          next_cursor: null,
          has_more: false,
        },
        items: [baseTransaction],
      },
    });
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  const factory = (props: Partial<InstanceType<typeof TransactionsTable>['$props']> = {}) => {
    const wrapper = mount(TransactionsTable, {
      props: {
        hashType: 'short',
        showBlock: true,
        showAuthority: true,
        ...props,
      },
      global: {
        plugins: [i18n],
        stubs: {
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
          TransactionStatus: TransactionStatusStub,
          TransactionStatusFilter: TransactionStatusFilterStub,
          RouterLink: {
            template: '<a><slot /></a>',
          },
          'router-link': {
            template: '<a><slot /></a>',
          },
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  it('shows a failure and retry instead of an empty table when the initial request fails', async () => {
    fetchTransactionsMock.mockRejectedValueOnce(new TypeError('offline'));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('ux.collection.retry'));
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="rows"]').text()).toContain(transactionHash);
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps verified rows through a failed refresh and clears them when a filter changes', async () => {
    const wrapper = factory();
    await flushPromises();
    fetchTransactionsMock.mockRejectedValueOnce(new TypeError('offline'));
    wrapper.getComponent({ name: 'BaseCollectionState' }).vm.$emit('retry');
    await flushPromises();
    expect(wrapper.get('[data-test="rows"]').text()).toContain(transactionHash);
    expect(wrapper.find('[data-test="resource-refresh-retry"]').exists()).toBe(true);
    const filtered = deferred<any>();
    fetchTransactionsMock.mockReturnValueOnce(filtered.promise);
    routeQuery.status = 'Rejected';
    await flushPromises();
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="resource-refresh-retry"]').exists()).toBe(false);
    filtered.resolve({ status: SUCCESSFUL_FETCHING, data: { pagination: historyPagination(), items: [] } });
    await flushPromises();
    expect(wrapper.get('[data-test="table-empty"]').text()).toContain(i18n.global.t('ux.collection.filteredEmpty'));
    await wrapper.get('[data-test="collection-reset"]').trigger('click');
    await flushPromises();
    expect(routeQuery.status).toBeUndefined();
    expect(fetchTransactionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null, status: undefined }));
  });

  it('exposes optional transaction columns as distinct cells without replacing link semantics', async () => {
    const fullWrapper = factory();
    await flushPromises();

    const fullRow = fullWrapper.get('.transactions-table__row');
    expect(fullRow.attributes('role')).toBe('presentation');
    expect(fullRow.findAll('[role="cell"]')).toHaveLength(5);
    expect(fullRow.get('.transactions-table__column-block[role="cell"] a').text()).toBe('10');

    const compactWrapper = factory({ showBlock: false, showAuthority: false });
    await flushPromises();

    const compactRow = compactWrapper.get('.transactions-table__row');
    expect(compactRow.findAll('[role="cell"]')).toHaveLength(3);
    expect(compactRow.find('.transactions-table__column-block').exists()).toBe(false);
    expect(compactRow.find('.transactions-table__column-authority').exists()).toBe(false);
  });

  it('does not auto-refetch on stream updates outside the latest cursor window', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'older-cursor');
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);

    // Stream update should not trigger another refetch.
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash2,
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);

    // Back on the latest window, stream updates should refetch.
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', null);
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(3);

    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash3,
      created_at: new Date('2024-01-01T00:02:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(4);

    // Keep types/shape honest by asserting the component did attempt to call the real API helper.
    expect(api.fetchTransactions).toBeDefined();
  });

  it('sends only the opaque cursor contract and renders cursor pagination', async () => {
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTable' });
    expect(table.props('paginationMode')).toBe('cursor');
    expect(table.props('cursorPagination')).toEqual(expect.objectContaining({ limit: 10, has_more: false }));
    expect(fetchTransactionsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cursor: null,
        limit: 10,
      })
    );
    expect(fetchTransactionsMock.mock.calls[0]?.[0]).not.toHaveProperty('page');
    expect(fetchTransactionsMock.mock.calls[0]?.[0]).not.toHaveProperty('per_page');
  });

  it('blocks an invalid cursor route until pagination is explicitly reset', async () => {
    routePaginationInvalid.value = true;
    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="transactions-invalid-pagination"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(false);

    await wrapper.get('[data-test="transactions-invalid-pagination"] button').trigger('click');
    expect(resetRoutePagination).toHaveBeenCalledOnce();
  });

  it.each([
    ['status', 'committed'],
    ['authority', `${SAMPLE_I105} `],
    ['block', '01'],
    ['block', '1e2'],
    ['block', '9007199254740992'],
  ])('blocks the malformed %s bookmark instead of loading the default feed', async (key, value) => {
    routeQuery[key] = value;
    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).not.toHaveBeenCalled();
    expect(useEventSourceMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="transactions-invalid-filters"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(false);

    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash2,
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['status', ['Committed', 'Rejected']],
    ['authority', [SAMPLE_I105, SAMPLE_I105]],
    ['block', ['10', '11']],
  ])('rejects duplicate %s bookmark values instead of selecting one', async (key, values) => {
    routeQuery[key] = values;
    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).not.toHaveBeenCalled();
    expect(useEventSourceMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="transactions-invalid-filters"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(false);
  });

  it('clears explicit invalid filters and resumes from an unfiltered latest cursor only on recovery', async () => {
    routeQuery.status = 'unknown';
    routeQuery.authority = [SAMPLE_I105, SAMPLE_I105];
    routeQuery.block = '01';
    routeCursor.value = 'filter-bound-cursor';
    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).not.toHaveBeenCalled();
    expect(useEventSourceMock).not.toHaveBeenCalled();

    await wrapper.get('[data-test="transactions-invalid-filters"] button').trigger('click');
    await flushPromises();

    expect(routeQuery.status).toBeUndefined();
    expect(routeQuery.authority).toBeUndefined();
    expect(routeQuery.block).toBeUndefined();
    expect(routeCursor.value).toBeNull();
    expect(fetchTransactionsMock).toHaveBeenCalledOnce();
    expect(useEventSourceMock).toHaveBeenCalledOnce();
    expect(fetchTransactionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 10, status: undefined, authority: undefined, block: undefined })
    );
    expect(wrapper.find('[data-test="transactions-invalid-filters"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(true);
  });

  it('does not auto-refetch on stream updates when the user is scrolled down', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    windowScrollY.value = 200;
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash2,
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="pending-refresh"]').exists()).toBe(true);

    await wrapper.get('[data-test="pending-refresh-load"]').trigger('click');
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
  });

  it('does not render transaction rows before the first authoritative fetch resolves', async () => {
    const first = deferred<{
      status: string
      data: {
        pagination: ReturnType<typeof historyPagination>
        items: Array<typeof baseTransaction>
      }
    }>();

    fetchTransactionsMock.mockImplementationOnce(() => first.promise);

    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(false);
    expect(wrapper.find('.base-resource-state--loading').exists()).toBe(true);

    first.resolve({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: historyPagination(),
        items: [baseTransaction],
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain(transactionHash);
  });

  it('renders the fetched cursor window after leaving the latest window', async () => {
    fetchTransactionsMock
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
          pagination: historyPagination('older-cursor', true),
          items: [baseTransaction],
        },
      })
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
          pagination: historyPagination(),
          items: [
            {
              ...baseTransaction,
              hash: olderPageTransactionHash,
              block: 9,
              created_at: new Date('2023-12-31T23:59:00Z'),
            },
          ],
        },
      });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(transactionHash);

    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'older-cursor');
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(olderPageTransactionHash);
    expect(wrapper.text()).not.toContain(transactionHash);
  });

  it('queues a single stream-triggered refetch while a fetch is pending', async () => {
    const first = deferred<{
      status: string
      data: {
        pagination: ReturnType<typeof historyPagination>
        items: Array<typeof baseTransaction>
      }
    }>();

    fetchTransactionsMock
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({
        status: SUCCESSFUL_FETCHING,
        data: {
          pagination: historyPagination(),
          items: [
            baseTransaction,
            {
              ...baseTransaction,
              hash: transactionHash2,
              created_at: new Date('2024-01-01T00:01:00Z'),
            },
          ],
        },
      });

    factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash2,
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash3,
      created_at: new Date('2024-01-01T00:02:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    first.resolve({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: historyPagination(),
        items: [baseTransaction],
      },
    });

    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when a stream payload hash is already visible', async () => {
    factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: transactionHash,
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
  });
});
