import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LatestTransactions from './LatestTransactions.vue';
import { i18n } from '@/shared/lib/localization';
import { ref, defineComponent } from 'vue';

const SAMPLE_I105 = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

const mocks = vi.hoisted(() => ({
  fetchLatestTransactions: vi.fn().mockResolvedValue({
    status: 'ok',
    data: {
      sampled_at: new Date('2026-03-05T00:00:00Z'),
      items: [] as Array<Record<string, unknown>>,
    },
  }),
  fetchTransactions: vi.fn().mockResolvedValue({
    status: 'ok',
    data: {
      pagination: { page: 0, per_page: 5, total_pages: 0, total_items: 0 },
      items: [],
    },
  }),
  setupState: {
    isLoading: false,
    data: {
      status: 'ok',
      data: {
        pagination: { page: 0, per_page: 5, total_pages: 0, total_items: 0 },
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
  fetchTransactions: mocks.fetchTransactions,
  buildToriiUrl: vi.fn((path: string) => `https://torii.example${path}`),
  useToriiAvailability: () => ({
    state: { value: 'healthy' },
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
  beforeEach(() => {
    mocks.fetchLatestTransactions.mockClear();
    mocks.fetchTransactions.mockClear();
    mocks.setupAsyncData.mockClear();
    mocks.setupState.isLoading = false;
    mocks.setupState.data = {
      status: 'ok',
      data: {
        pagination: { page: 0, per_page: 5, total_pages: 0, total_items: 0 },
        items: [],
      },
    };
    mocks.setupState.refetch = vi.fn();
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') localStorage.clear();
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
      expect.objectContaining({ per_page: 5, status: undefined })
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
});
