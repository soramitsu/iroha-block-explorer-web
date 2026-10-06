import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LatestTransactions from './LatestTransactions.vue';
import { i18n } from '@/shared/lib/localization';
import { ref, defineComponent } from 'vue';
import { historyCacheKey } from '@/shared/lib/history-cache';

const SAMPLE_I105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';

const mocks = vi.hoisted(() => ({
  networkId: `hash:${'AB'.repeat(32)}#B99E`,
  toriiUrl: 'https://taira.sora.org',
  availability: 'healthy',
  fetchLatestTransactions: vi.fn().mockResolvedValue({
    status: 'ok',
    data: {
      nextCursor: null,
      total: undefined,
      items: [] as Array<Record<string, unknown>>,
    },
  }),
  fetchTransactions: vi.fn().mockResolvedValue({
    status: 'ok',
    data: {
      nextCursor: null,
      total: undefined,
      items: [],
    },
  }),
  setupState: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        nextCursor: null,
        total: undefined,
        items: [] as Array<Record<string, unknown>>,
      },
    },
    refetch: vi.fn(),
  },
  setupAsyncData: vi.fn((request: () => Promise<any>) => {
    request();
    return mocks.setupState;
  }),
}));

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => ({ networkId: mocks.networkId }),
}));

vi.mock('@/shared/api', () => ({
  fetchLatestTransactions: mocks.fetchLatestTransactions,
  fetchTransactions: mocks.fetchTransactions,
  buildToriiUrl: vi.fn((path: string) => `https://torii.example${path}`),
  getToriiBaseUrl: () => mocks.toriiUrl,
  useToriiAvailability: () => ({
    state: { value: mocks.availability },
    failureCount: { value: 0 },
    lastError: { value: null },
    lastSwitch: { value: null },
  }),
  retryToriiFailover: vi.fn(),
}));

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: mocks.setupAsyncData,
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: (resolver: () => { key: string, payload: any }, factory: (arg: { payload: any }) => any) => {
    const descriptor = resolver();
    const expose = factory(descriptor);
    return ref({ expose });
  },
}));

vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

const TransactionStatusFilterStub = defineComponent({
  name: 'TransactionStatusFilter',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div />',
});

const BaseContentBlockStub = {
  name: 'BaseContentBlock',
  template: '<div><slot name="header-action" /><slot /></div>',
};

const BaseButtonStub = {
  name: 'BaseButton',
  template: '<button><slot /></button>',
};

const BaseHashStub = {
  name: 'BaseHash',
  template: '<span><slot /></span>',
};

const TransactionStatusStub = {
  name: 'TransactionStatus',
  template: '<span />',
};

const BaseLoadingStub = {
  name: 'BaseLoading',
  template: '<div class="base-loading"><slot /></div>',
};

const TimeStampStub = {
  name: 'TimeStamp',
  template: '<time><slot /></time>',
};

describe('LatestTransactions', () => {
  const wrappers: Array<ReturnType<typeof mount>> = [];
  const cache = new Map<string, string>();
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => cache.get(key) ?? null,
        setItem: (key: string, value: string) => cache.set(key, value),
        clear: () => cache.clear(),
      },
    });
    mocks.availability = 'healthy';
    mocks.fetchLatestTransactions.mockClear();
    mocks.fetchTransactions.mockClear();
    mocks.setupAsyncData.mockClear();
    mocks.setupState.isLoading = false;
    mocks.setupState.data = {
      status: 'ok',
      data: {
        nextCursor: null,
        total: undefined,
        items: [],
      },
    };
    mocks.setupState.refetch = vi.fn();
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') localStorage.clear();
  });

  afterEach(() => {
    while (wrappers.length) wrappers.pop()?.unmount();
  });

  const factory = () => {
    const wrapper = mount(LatestTransactions, {
      global: {
        plugins: [i18n],
        stubs: {
          TransactionStatusFilter: TransactionStatusFilterStub,
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseHash: BaseHashStub,
          TransactionStatus: TransactionStatusStub,
          BaseLoading: BaseLoadingStub,
          TimeStamp: TimeStampStub,
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  it('fetches transactions on mount', async () => {
    factory();
    await flushPromises();

    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, status: undefined })
    );
  });

  it('works when EventSource is not available', async () => {
    delete (window as any).EventSource;
    factory();
    await flushPromises();

    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
  });

  it('shows stale freshness when latest sample is old', async () => {
    mocks.setupState.data.data.items = [
      {
        authority: SAMPLE_I105,
        hash: '0xtx-1',
        block: 1,
        created_at: new Date('2024-01-01T00:00:00Z'),
        executable: 'Instructions',
        status: 'Committed',
      },
    ];

    const wrapper = factory();
    await flushPromises();

    const badge = wrapper.get('[data-test="latest-transactions-freshness"]');
    expect(badge.attributes('data-tone')).toBe('stale');
  });

  it('shows unknown freshness when no transactions are available', async () => {
    mocks.setupState.data.data.items = [];

    const wrapper = factory();
    await flushPromises();

    const badge = wrapper.get('[data-test="latest-transactions-freshness"]');
    expect(badge.attributes('data-tone')).toBe('unknown');
    expect(badge.text()).toContain(i18n.global.t('telemetry.dataUnknown'));
  });

  it('labels recent cached data as stale during an outage', async () => {
    mocks.availability = 'outage';
    mocks.setupState.data.status = 'unknown-error';
    cache.set(historyCacheKey('latest-transactions', mocks.networkId, mocks.toriiUrl)!, JSON.stringify({
      version: 1,
      updated_at_ms: Date.now(),
      items: [{
        authority: SAMPLE_I105,
        hash: '0xcached',
        block: 1,
        created_at: new Date(),
        executable: 'Instructions',
        status: 'Committed',
      }],
    }));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(true);
    const badge = wrapper.get('[data-test="latest-transactions-freshness"]');
    expect(badge.attributes('data-tone')).toBe('stale');
    expect(badge.text()).toContain(i18n.global.t('telemetry.dataStale'));
  });

  it.each([
    'latest_transactions_cache_v2',
    historyCacheKey('latest-transactions', mocks.networkId, 'https://another.example')!,
    historyCacheKey('latest-transactions', `hash:${'11'.repeat(32)}#4667`, mocks.toriiUrl)!,
  ])('does not show another ledger cache as current history: %s', async (key) => {
    cache.set(key, JSON.stringify({
      version: 1,
      updated_at_ms: Date.now(),
      items: [{ authority: SAMPLE_I105, hash: '0xforeign', block: 1, created_at: new Date(), executable: 'Instructions', status: 'Committed' }],
    }));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(false);
    expect(wrapper.get('[data-test="latest-transactions-freshness"]').attributes('data-tone')).toBe('unknown');
  });
});
