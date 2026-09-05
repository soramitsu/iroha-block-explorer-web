import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LatestTransactions from './LatestTransactions.vue';
import { i18n } from '@/shared/lib/localization';
import { ref, defineComponent } from 'vue';

const SAMPLE_I105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';

const mocks = vi.hoisted(() => ({
  fetchLatestTransactions: vi.fn().mockResolvedValue({
    status: 'ok',
    data: {
      sampled_at: new Date('2026-03-05T00:00:00Z'),
      pagination: {
        limit: 5,
        snapshot_height: 0,
        snapshot_hash: '0xsnapshot',
        next_cursor: null,
        has_more: false,
      },
      items: [] as Array<Record<string, unknown>>,
    },
  }),
  setupState: {
    get snapshot(): any {
      return { status: 'ready', data: this.data, isRefreshing: this.isLoading, refreshError: null };
    },
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        pagination: {
          limit: 5,
          snapshot_height: 0,
          snapshot_hash: '0xsnapshot',
          next_cursor: null,
          has_more: false,
        },
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

vi.mock('@/shared/api', () => ({
  fetchLatestTransactions: mocks.fetchLatestTransactions,
  buildToriiUrl: vi.fn((path: string) => `https://torii.example${path}`),
  useToriiAvailability: () => ({
    state: { value: 'healthy' },
    failureCount: { value: 0 },
    lastError: { value: null },
    lastSwitch: { value: null },
  }),
  retryToriiFailover: vi.fn(),
  getToriiBaseUrl: () => 'https://torii.example',
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
  beforeEach(() => {
    mocks.fetchLatestTransactions.mockClear();
    mocks.setupAsyncData.mockClear();
    mocks.setupState.isLoading = false;
    mocks.setupState.data = {
      status: 'ok',
      data: {
        pagination: {
          limit: 5,
          snapshot_height: 0,
          snapshot_hash: '0xsnapshot',
          next_cursor: null,
          has_more: false,
        },
        items: [],
      },
    };
    mocks.setupState.refetch = vi.fn();
  });

  const factory = () =>
    mount(LatestTransactions, {
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

  it('fetches transactions on mount', async () => {
    factory();
    await flushPromises();

    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledWith(
      { limit: 5, status: undefined }
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

  it('shows one empty state when no transactions are available', async () => {
    mocks.setupState.data.data.items = [];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="latest-transactions-freshness"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="collection-empty"]').text()).toContain(i18n.global.t('ux.collection.empty'));
  });
});
