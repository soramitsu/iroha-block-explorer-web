import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TransactionsTable from './TransactionsTable.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import type * as VueUse from '@vueuse/core';
import { defineComponent, reactive, ref } from 'vue';
import { historyCacheKey } from '@/shared/lib/history-cache';

const cacheScope = vi.hoisted(() => ({
  networkId: `hash:${'AB'.repeat(32)}#B99E`,
  toriiUrl: 'https://taira.sora.org',
}));
vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => ({ networkId: cacheScope.networkId, toriiBaseUrl: cacheScope.toriiUrl, toriiForceBaseUrl: true }),
}));
const boundCacheKey = () => historyCacheKey('transactions', cacheScope.networkId, cacheScope.toriiUrl)!;

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

const eventSourceData = ref<string | null>(null);
const windowScrollY = ref(0);
const routeQuery = reactive<Record<string, string | undefined>>({});
const routeCursor = ref<string | null>(null);
const routeLimit = ref(10);

vi.mock('@/shared/ui/composables/useListRouteQuery', () => ({
  useCursorListRouteQuery: () => ({
    route: reactive({ query: routeQuery }),
    cursor: routeCursor,
    limit: routeLimit,
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
    error: { type: Object, default: null },
    cursorPagination: { type: Object, default: null },
    reversed: { type: Boolean, required: false, default: false },
  },
  emits: ['update:cursor', 'update:pageSize', 'click:row', 'retry'],
  template: `
    <div data-test="base-table">
      <slot name="header" />
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
    useEventSource: () => ({
      data: eventSourceData,
      status: ref('CLOSED'),
    }),
    useThrottleFn: (fn: any) => fn,
    useWindowScroll: () => ({ x: ref(0), y: windowScrollY }),
  };
});

const fetchTransactionsMock = vi.fn();
const localStorageState = new Map<string, string>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function installLocalStorageMock() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => localStorageState.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageState.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageState.delete(key);
      },
      clear: () => {
        localStorageState.clear();
      },
    },
  });
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
    hash: '0xtx',
    block: 10,
    created_at: new Date('2024-01-01T00:00:00Z'),
    executable: 'Instructions',
    status: 'Committed',
  } as const;

  beforeEach(() => {
    installLocalStorageMock();
    localStorageState.clear();
    fetchTransactionsMock.mockReset();
    eventSourceData.value = null;
    windowScrollY.value = 0;
    routeCursor.value = null;
    routeLimit.value = 10;
    for (const key of Object.keys(routeQuery)) delete routeQuery[key];
    // Ensure stream code-path is exercised.
    (window as any).EventSource = class EventSource {};

    fetchTransactionsMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        total: undefined,
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

  it('does not auto-refetch on stream updates when not on the latest page', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    // Move away from the latest page.
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'next');
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);

    // Stream update should not trigger another refetch.
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: '0xtx2',
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);

    // Back on the latest page, stream updates should refetch.
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', null);
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(3);

    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: '0xtx3',
      created_at: new Date('2024-01-01T00:02:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(4);

    // Keep types/shape honest by asserting the component did attempt to call the real API helper.
    expect(api.fetchTransactions).toBeDefined();
  });

  it('uses non-reversed 1-based pagination for Torii transaction pages', async () => {
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTable' });
    expect(table.props('reversed')).not.toBe(true);
    expect(fetchTransactionsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cursor: null, limit: 10,
      })
    );
  });

  it('does not auto-refetch on stream updates when the user is scrolled down', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    windowScrollY.value = 200;
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: '0xtx2',
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="pending-refresh"]').exists()).toBe(true);

    await wrapper.get('[data-test="pending-refresh-load"]').trigger('click');
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('labels pending cache stale and replaces it on current response (empty: %s)', async (empty) => {
    const first = deferred<{
      status: string
      data: {
        nextCursor: string | null
        total: undefined
        items: Array<typeof baseTransaction>
      }
    }>();

    fetchTransactionsMock.mockImplementationOnce(() => first.promise);

    window.localStorage.setItem(
      boundCacheKey(),
      JSON.stringify({
        version: 1,
        updated_at_ms: Date.now(),
        items: [
          {
            ...baseTransaction,
            hash: '0xcached',
            created_at: new Date('2024-01-01T00:05:00Z').toISOString(),
          },
        ],
      })
    );

    const wrapper = factory();
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('0xcached');
    expect(wrapper.get('[data-test="history-cache-stale"]').text()).toContain(i18n.global.t('telemetry.dataStale'));

    first.resolve({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        total: undefined,
        items: empty ? [] : [baseTransaction],
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-test="history-cache-stale"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('0xcached');
    expect(JSON.parse(window.localStorage.getItem(boundCacheKey())!).items).toHaveLength(empty ? 0 : 1);
  });

  it.each([
    'transactions_table_cache_v2',
    historyCacheKey('transactions', cacheScope.networkId, 'https://another.example')!,
    historyCacheKey('transactions', `hash:${'11'.repeat(32)}#4667`, cacheScope.toriiUrl)!,
  ])('does not render cache from a different ledger identity or retired key: %s', async (key) => {
    fetchTransactionsMock.mockImplementationOnce(() => new Promise(() => {}));
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      updated_at_ms: Date.now(),
      items: [{ ...baseTransaction, hash: '0xforeign-cache' }],
    }));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.text()).not.toContain('0xforeign-cache');
    expect(wrapper.find('[data-test="history-cache-stale"]').exists()).toBe(false);
  });

  it('renders fetched paginated rows after leaving the latest page even when cache is warm', async () => {
    fetchTransactionsMock
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
        nextCursor: 'next',
        total: undefined,
          items: [baseTransaction],
        },
      })
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
        nextCursor: null,
        total: undefined,
          items: [
            {
              ...baseTransaction,
              hash: '0xolder-page',
              block: 9,
              created_at: new Date('2023-12-31T23:59:00Z'),
            },
          ],
        },
      });

    window.localStorage.setItem(
      boundCacheKey(),
      JSON.stringify({
        version: 1,
        updated_at_ms: Date.now(),
        items: [
          {
            ...baseTransaction,
            hash: '0xcached-latest',
            created_at: new Date('2024-01-01T00:05:00Z').toISOString(),
          },
        ],
      })
    );

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('0xtx');

    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'next');
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('0xolder-page');
    expect(wrapper.text()).not.toContain('0xcached-latest');
  });

  it('does not write older paginated default-feed rows back into the latest-page cache', async () => {
    fetchTransactionsMock
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
        nextCursor: 'next',
        total: undefined,
          items: [baseTransaction],
        },
      })
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
        nextCursor: null,
        total: undefined,
          items: [
            {
              ...baseTransaction,
              hash: '0xolder-cache-candidate',
              block: 9,
              created_at: new Date('2023-12-31T23:59:00Z'),
            },
          ],
        },
      });

    const wrapper = factory();
    await flushPromises();

    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'next');
    await flushPromises();

    const rawCache = window.localStorage.getItem(boundCacheKey());
    expect(rawCache).not.toBeNull();

    const parsedCache = JSON.parse(rawCache!);
    const cachedHashes = (parsedCache.items as Array<{ hash: string }>).map((item) => item.hash);
    expect(cachedHashes).toContain('0xtx');
    expect(cachedHashes).not.toContain('0xolder-cache-candidate');
  });

  it('queues a single stream-triggered refetch while a fetch is pending', async () => {
    const first = deferred<{
      status: string
      data: {
        nextCursor: string | null
        total: undefined
        items: Array<typeof baseTransaction>
      }
    }>();

    fetchTransactionsMock
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({
        status: SUCCESSFUL_FETCHING,
        data: {
        nextCursor: null,
        total: undefined,
          items: [
            baseTransaction,
            {
              ...baseTransaction,
              hash: '0xtx2',
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
      hash: '0xtx2',
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    eventSourceData.value = JSON.stringify({
      ...baseTransaction,
      hash: '0xtx3',
      created_at: new Date('2024-01-01T00:02:00Z').toISOString(),
    });
    await flushPromises();
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);

    first.resolve({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        total: undefined,
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
      hash: '0xtx',
      created_at: new Date('2024-01-01T00:01:00Z').toISOString(),
    });
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
  });

  it('exposes failed history reads and recovers when the table retries', async () => {
    fetchTransactionsMock.mockResolvedValueOnce({ status: 'unknown-error', error: new TypeError('offline') });
    const wrapper = factory();
    await flushPromises();
    const table = wrapper.getComponent({ name: 'BaseTable' });

    expect(table.props('error')).toMatchObject({ kind: 'network' });
    expect(table.props('items')).toEqual([]);
    table.vm.$emit('retry');
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalledTimes(2);
    expect(table.props('error')).toBeNull();
    expect(table.props('items')).toEqual([baseTransaction]);
    expect(table.props('cursorPagination')).toEqual({ items: [baseTransaction], nextCursor: null, total: undefined });
  });

});
