import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import type * as VueUseCore from '@vueuse/core';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { i18n } from '@/shared/lib/localization';
import { LATEST_TRANSACTIONS_CACHE_KEY } from '@/widgets/latest-transactions/model';
import type LatestTransactionsComponent from '@/widgets/latest-transactions/LatestTransactions.vue';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

const originalEventSource = globalThis.EventSource;
globalThis.EventSource = class MockEventSource {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  close() {
    // noop
  }
} as typeof EventSource;

const eventSourceData = ref<string | null>(null);
const eventSourceStatus = ref<'OPEN' | 'CLOSED'>('OPEN');
const fetchLatestTransactionsMock = vi.fn();
const fetchTransactionsMock = vi.fn();
const buildExplorerUrlMock = vi.fn(() => 'https://torii/v1/explorer/transactions/stream');

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchLatestTransactions: fetchLatestTransactionsMock,
    fetchTransactions: fetchTransactionsMock,
    buildExplorerUrl: buildExplorerUrlMock,
  };
});

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUseCore>('@vueuse/core');
  return {
    ...actual,
    useEventSource: () => ({
      data: eventSourceData,
      status: eventSourceStatus,
      eventSource: null,
      close: vi.fn(),
    }),
    useThrottleFn: (fn: (...args: any[]) => any) => {
      const wrapped: any = (...args: any[]) => fn(...args);
      wrapped.cancel = () => {};
      wrapped.pending = () => false;
      wrapped.flush = () => {};
      return wrapped;
    },
  };
});

const TransactionStatusFilterStub = defineComponent({
  name: 'TransactionStatusFilterStub',
  props: {
    modelValue: { type: String, default: null },
  },
  emits: ['update:modelValue'],
  template: `
    <div data-test="status-filter">
      <button data-test="status-filter-committed" @click="$emit('update:modelValue', 'Committed')">Committed</button>
      <button data-test="status-filter-rejected" @click="$emit('update:modelValue', 'Rejected')">Rejected</button>
      <button data-test="status-filter-all" @click="$emit('update:modelValue', null)">All</button>
    </div>
  `,
});

vi.mock('@/features/filter/transactions', () => ({
  TransactionStatusFilter: TransactionStatusFilterStub,
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlockStub',
  template: `
    <section data-test="base-content-block">
      <div data-test="header-action"><slot name="header-action" /></div>
      <slot />
    </section>
  `,
});

const BaseButtonStub = defineComponent({
  name: 'BaseButtonStub',
  props: { to: { type: [String, Object], default: null } },
  template: '<button data-test="base-button"><slot /></button>',
});

const BaseHashStub = defineComponent({
  name: 'BaseHashStub',
  props: { hash: { type: String, required: true } },
  template: '<span data-test="base-hash">{{ hash }}</span>',
});

const BaseLoadingStub = defineComponent({
  name: 'BaseLoadingStub',
  template: '<div data-test="base-loading">loading</div>',
});

const TransactionStatusStub = defineComponent({
  name: 'TransactionStatusStub',
  template: '<span data-test="transaction-status" />',
});

const TimeStampStub = defineComponent({
  name: 'TimeStampStub',
  props: { value: { type: [String, Date], required: true } },
  template: '<time data-test="timestamp">{{ value }}</time>',
});

vi.mock('@/shared/ui/components/BaseContentBlock.vue', () => ({ default: BaseContentBlockStub }));
vi.mock('@/shared/ui/components/BaseButton.vue', () => ({ default: BaseButtonStub }));
vi.mock('@/shared/ui/components/BaseHash.vue', () => ({ default: BaseHashStub }));
vi.mock('@/shared/ui/components/BaseLoading.vue', () => ({ default: BaseLoadingStub }));
vi.mock('@/entities/transaction/TransactionStatus.vue', () => ({ default: TransactionStatusStub }));
vi.mock('@/shared/ui/components/TimeStamp.vue', () => ({ default: TimeStampStub }));
vi.mock('@/shared/ui/icons/clock.svg', () => ({
  default: defineComponent({
    name: 'ClockIconStub',
    template: '<span data-test="clock-icon" />',
  }),
}));
vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

let LatestTransactions: LatestTransactionsComponent;
let mountedWrapper: VueWrapper | null = null;
let resetExplorerTransactionsEventsForTests: (() => void) | null = null;

beforeAll(async () => {
  const [{ default: component }, streamModule] = await Promise.all([
    import('@/widgets/latest-transactions/LatestTransactions.vue'),
    import('@/shared/ui/composables/useExplorerTransactionsEvents'),
  ]);
  LatestTransactions = component;
  resetExplorerTransactionsEventsForTests = streamModule.__resetExplorerTransactionsEventsForTests;
});

afterAll(() => {
  if (originalEventSource) {
    globalThis.EventSource = originalEventSource;
  } else {
    delete (globalThis as any).EventSource;
  }
});

async function mountLatestTransactions() {
  mountedWrapper = mount(LatestTransactions, {
    global: {
      plugins: [i18n],
    },
  });
  return mountedWrapper;
}

const baseResponse = {
  status: SUCCESSFUL_FETCHING,
  data: {
    sampled_at: new Date('2024-01-01T00:00:00Z'),
    items: [
      {
        authority: SAMPLE_I105,
        hash: 'tx-1',
        block: 1,
        created_at: new Date('2024-01-01T00:00:00Z'),
        executable: 'Instructions',
        status: 'Committed',
      },
    ],
  },
};

const paginatedBaseResponse = {
  status: SUCCESSFUL_FETCHING,
  data: {
    pagination: { page: 1, per_page: 5, total_pages: 1, total_items: 1 },
    items: [
      {
        authority: SAMPLE_I105,
        hash: 'tx-1',
        block: 1,
        created_at: new Date('2024-01-01T00:00:00Z'),
        executable: 'Instructions',
        status: 'Committed',
      },
    ],
  },
};

describe('LatestTransactions SSE smoke', () => {
  beforeEach(() => {
    resetExplorerTransactionsEventsForTests?.();
    fetchLatestTransactionsMock.mockReset();
    fetchLatestTransactionsMock.mockResolvedValue(baseResponse);
    fetchTransactionsMock.mockReset();
    fetchTransactionsMock.mockResolvedValue(paginatedBaseResponse);
    eventSourceData.value = null;
    eventSourceStatus.value = 'OPEN';
    const storage = window.localStorage as unknown as { removeItem?: (key: string) => void };
    if (typeof storage.removeItem === 'function') {
      storage.removeItem(LATEST_TRANSACTIONS_CACHE_KEY);
    }
  });

  afterEach(() => {
    mountedWrapper?.unmount();
    mountedWrapper = null;
    resetExplorerTransactionsEventsForTests?.();
  });

  it('refetches when the SSE transaction matches the active status filter', async () => {
    const wrapper = await mountLatestTransactions();
    await flushPromises();

    expect(fetchLatestTransactionsMock).toHaveBeenCalledTimes(1);
    expect(fetchTransactionsMock).not.toHaveBeenCalled();

    await wrapper.find('[data-test="status-filter-committed"]').trigger('click');
    await flushPromises();

    fetchLatestTransactionsMock.mockClear();
    fetchTransactionsMock.mockClear();

    eventSourceData.value = JSON.stringify({
      authority: SAMPLE_I105_ALT,
      hash: 'tx-77',
      block: 77,
      created_at: new Date('2024-02-02T00:00:00Z').toISOString(),
      executable: 'Instructions',
      status: 'Committed',
    });
    await flushPromises();

    expect(fetchLatestTransactionsMock).toHaveBeenCalledTimes(1);
    expect(fetchTransactionsMock).not.toHaveBeenCalled();
  }, 20000);

  it('ignores SSE payloads that do not satisfy the current filter', async () => {
    const wrapper = await mountLatestTransactions();
    await flushPromises();

    await wrapper.find('[data-test="status-filter-committed"]').trigger('click');
    await flushPromises();

    fetchLatestTransactionsMock.mockClear();
    fetchTransactionsMock.mockClear();

    eventSourceData.value = JSON.stringify({
      authority: SAMPLE_I105_ALT,
      hash: 'tx-88',
      block: 88,
      created_at: new Date('2024-03-03T00:00:00Z').toISOString(),
      executable: 'Instructions',
      status: 'Rejected',
    });
    await flushPromises();

    expect(fetchLatestTransactionsMock).not.toHaveBeenCalled();
    expect(fetchTransactionsMock).not.toHaveBeenCalled();
  }, 20000);

  it('renders the streamed transaction before a slow fetch resolves', async () => {
    let resolveFetch: ((value: typeof baseResponse) => void) | null = null;
    fetchLatestTransactionsMock.mockImplementation(
      () =>
        new Promise<typeof baseResponse>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const wrapper = await mountLatestTransactions();
    await flushPromises();

    expect(wrapper.find('[data-test="base-loading"]').exists()).toBe(true);

    eventSourceData.value = JSON.stringify({
      authority: SAMPLE_I105_ALT,
      hash: 'tx-live',
      block: 91,
      created_at: new Date('2024-04-04T00:00:00Z').toISOString(),
      executable: 'Instructions',
      status: 'Committed',
    });
    await flushPromises();

    expect(wrapper.find('[data-test="base-loading"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('tx-live');

    resolveFetch?.(baseResponse);
  }, 20000);
});
