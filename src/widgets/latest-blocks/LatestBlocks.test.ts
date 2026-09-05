import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LatestBlocks from './LatestBlocks.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Block } from '@/shared/api/schemas';

const blockHash1 = 'a'.repeat(64);
const blockHash2 = 'b'.repeat(64);
const transactionsHash = 'c'.repeat(64);
const snapshotHash = 'd'.repeat(64);

const mockBlocks: Block[] = [
  {
    hash: blockHash1,
    height: 42,
    created_at: new Date('2024-01-01T00:00:00Z'),
    prev_block_hash: null,
    transactions_hash: transactionsHash,
    transactions_rejected: 0,
    transactions_total: 12,
  },
  {
    hash: blockHash2,
    height: 43,
    created_at: new Date('2024-01-01T00:05:00Z'),
    prev_block_hash: blockHash1,
    transactions_hash: null,
    transactions_rejected: 2,
    transactions_total: 4,
  },
];

const pushSpy = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}));

const { connectFromMock, getOnBlock, resetOnBlock, setOnBlock } = vi.hoisted(() => {
  let onBlock: (() => void) | null = null;
  return {
    connectFromMock: vi.fn(),
    getOnBlock: () => onBlock,
    resetOnBlock: () => {
      onBlock = null;
    },
    setOnBlock: (cb: () => void) => {
      onBlock = cb;
    },
  };
});

vi.mock('@/shared/ui/composables/useBlockStream', () => ({
  useBlockStream: (onBlock: () => void) => {
    setOnBlock(onBlock);
    return {
      connectFrom: connectFromMock,
      disconnect: vi.fn(),
      isStreaming: { value: false },
      isSupported: true,
    };
  },
}));

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
      pagination: {
        limit: 10,
        snapshot_height: 43,
        snapshot_hash: snapshotHash,
        next_cursor: null,
        has_more: false,
      },
      items: mockBlocks,
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn((request: () => Promise<unknown>) => {
    request().catch(() => undefined);
    return setupState;
  }),
}));

const apiMocks = vi.hoisted(() => ({
  fetchBlocks: vi.fn(),
  useToriiAvailability: vi.fn(() => ({
    state: { value: 'healthy' },
    failureCount: { value: 0 },
    lastError: { value: null },
    lastSwitch: { value: null },
  })),
  retryToriiFailover: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'https://taira.sora.org'),
  isToriiBaseUrlForced: vi.fn(() => false),
}));

vi.mock('@/shared/api', () => ({
  fetchBlocks: apiMocks.fetchBlocks,
  useToriiAvailability: apiMocks.useToriiAvailability,
  retryToriiFailover: apiMocks.retryToriiFailover,
  getToriiBaseUrl: apiMocks.getToriiBaseUrl,
  isToriiBaseUrlForced: apiMocks.isToriiBaseUrlForced,
}));

const BaseContentBlockStub = {
  template: '<div><slot name="header-action" /><slot /></div>',
};
const BaseButtonStub = {
  template: '<button><slot /></button>',
};
const BaseLoadingStub = {
  template: '<div class="base-loading"><slot /></div>',
};
const TimeStampStub = {
  props: ['value'],
  template: '<time>{{ value }}</time>',
};
const TimeIconStub = {
  template: '<svg />',
};

describe('LatestBlocks', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    setupState.isLoading = false;
    setupState.data.data.items = [...mockBlocks];
    setupState.refetch = vi.fn();
    connectFromMock.mockReset();
    resetOnBlock();
    apiMocks.useToriiAvailability.mockClear();
    apiMocks.fetchBlocks.mockReset();
    apiMocks.fetchBlocks.mockResolvedValue(setupState.data);
    apiMocks.useToriiAvailability.mockReturnValue({
      state: { value: 'healthy' },
      failureCount: { value: 0 },
      lastError: { value: null },
      lastSwitch: { value: null },
    });
    apiMocks.retryToriiFailover.mockReset();
    apiMocks.getToriiBaseUrl.mockReset();
    apiMocks.getToriiBaseUrl.mockReturnValue('https://taira.sora.org');
    apiMocks.isToriiBaseUrlForced.mockReset();
    apiMocks.isToriiBaseUrlForced.mockReturnValue(false);
  });

  const factory = () =>
    mount(LatestBlocks, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
          BaseLoading: BaseLoadingStub,
          TimeStamp: TimeStampStub,
          TimeIcon: TimeIconStub,
        },
      },
    });

  it('renders fetched blocks once data is ready', async () => {
    const wrapper = factory();
    await flushPromises();

    const rows = wrapper.findAll('.latest-blocks__row');
    expect(rows).toHaveLength(mockBlocks.length);
    expect(wrapper.text()).toContain(String(mockBlocks[0].height));
    expect(wrapper.text()).toContain(String(mockBlocks[1].transactions_total));
  });

  it('renders a hash-only committed-journal block without inventing a timestamp or empty-body signal', async () => {
    setupState.data.data.items = [{ ...mockBlocks[0], created_at: null, transactions_hash: null }];
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="latest-block-created-at-unavailable"]').text()).toBe('unknown');
    expect(wrapper.get('.latest-blocks__row-block-height').text()).toContain('?');
  });

  it('requests the latest history window with the canonical limit parameter', async () => {
    factory();
    await flushPromises();

    expect(apiMocks.fetchBlocks).toHaveBeenCalledWith({ limit: 10 });
    expect(apiMocks.fetchBlocks).not.toHaveBeenCalledWith(expect.objectContaining({ per_page: expect.anything() }));
  });

  it('keeps showing existing rows while background refetch is pending', async () => {
    setupState.isLoading = true;
    setupState.data.data.items = [...mockBlocks];

    const wrapper = factory();
    await flushPromises();

    const rows = wrapper.findAll('.latest-blocks__row');
    expect(rows).toHaveLength(mockBlocks.length);
    expect(wrapper.find('.base-resource-state--loading').exists()).toBe(false);
  });

  it('links block height without making timestamp controls navigate', async () => {
    const wrapper = factory();
    await flushPromises();

    const row = wrapper.get('.latest-blocks__row');
    expect(row.attributes('role')).toBeUndefined();
    expect(row.get('a').attributes('href')).toBe(`/blocks/${mockBlocks[0].height}`);
  });

  it('wires the block stream from the latest height', async () => {
    factory();
    await flushPromises();

    const maxHeight = Math.max(...mockBlocks.map((block) => block.height));
    expect(connectFromMock).toHaveBeenCalledWith(maxHeight + 1);
  });

  it('refetches when the block stream emits and the widget is not loading', async () => {
    factory();
    await flushPromises();

    const onBlock = getOnBlock();
    expect(typeof onBlock).toBe('function');
    onBlock?.();

    expect(setupState.refetch).toHaveBeenCalled();
  });

  it('does not refetch when the block stream emits during loading', async () => {
    setupState.isLoading = true;
    factory();
    await flushPromises();

    const onBlock = getOnBlock();
    expect(typeof onBlock).toBe('function');
    onBlock?.();

    expect(setupState.refetch).not.toHaveBeenCalled();
  });

  it('shows freshness badge with stale tone when latest sample is old', async () => {
    const wrapper = factory();
    await flushPromises();

    const badge = wrapper.get('[data-test="latest-blocks-freshness"]');
    expect(badge.attributes('data-tone')).toBe('stale');
    expect(badge.text()).toContain(i18n.global.t('telemetry.dataTrustSampleAge'));
  });

  it('shows one empty state when no blocks are available', async () => {
    setupState.data.data.items = [];
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="latest-blocks-freshness"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="collection-empty"]').text()).toContain(i18n.global.t('ux.collection.empty'));
  });
});
