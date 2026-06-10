import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LatestBlocks from './LatestBlocks.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const mockBlocks = [
  {
    hash: '0xblock-1',
    height: 42,
    created_at: new Date('2024-01-01T00:00:00Z'),
    prev_block_hash: null,
    transactions_hash: '0xprev',
    transactions_rejected: 0,
    transactions_total: 12,
  },
  {
    hash: '0xblock-2',
    height: 43,
    created_at: new Date('2024-01-01T00:05:00Z'),
    prev_block_hash: '0xblock-1',
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
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { page: 1, per_page: 10, total_pages: 1, total_items: mockBlocks.length },
      items: mockBlocks,
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupState),
}));

const apiMocks = vi.hoisted(() => ({
  useToriiAvailability: vi.fn(() => ({
    state: { value: 'healthy' },
    failureCount: { value: 0 },
    lastError: { value: null },
    lastSwitch: { value: null },
  })),
  retryToriiFailover: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'https://taira.sora.org'),
}));

vi.mock('@/shared/api', () => ({
  fetchBlocks: vi.fn(),
  useToriiAvailability: apiMocks.useToriiAvailability,
  retryToriiFailover: apiMocks.retryToriiFailover,
  getToriiBaseUrl: apiMocks.getToriiBaseUrl,
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
    apiMocks.useToriiAvailability.mockReturnValue({
      state: { value: 'healthy' },
      failureCount: { value: 0 },
      lastError: { value: null },
      lastSwitch: { value: null },
    });
    apiMocks.retryToriiFailover.mockReset();
    apiMocks.getToriiBaseUrl.mockReset();
    apiMocks.getToriiBaseUrl.mockReturnValue('https://taira.sora.org');
  });

  const factory = () =>
    mount(LatestBlocks, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
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

  it('keeps showing existing rows while background refetch is pending', async () => {
    setupState.isLoading = true;
    setupState.data.data.items = [...mockBlocks];

    const wrapper = factory();
    await flushPromises();

    const rows = wrapper.findAll('.latest-blocks__row');
    expect(rows).toHaveLength(mockBlocks.length);
    expect(wrapper.find('.base-loading').exists()).toBe(false);
  });

  it('navigates to the selected block when row is clicked', async () => {
    const wrapper = factory();
    await flushPromises();

    await wrapper.find('.latest-blocks__row').trigger('click');
    expect(pushSpy).toHaveBeenCalledWith(`/blocks/${mockBlocks[0].height}`);
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

  it('shows unknown freshness when no blocks are available', async () => {
    setupState.data.data.items = [];
    const wrapper = factory();
    await flushPromises();

    const badge = wrapper.get('[data-test="latest-blocks-freshness"]');
    expect(badge.attributes('data-tone')).toBe('unknown');
    expect(badge.text()).toContain(i18n.global.t('telemetry.dataUnknown'));
  });
});
