import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BlocksList from './BlocksList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const mockBlocks = [
  {
    hash: '0xblock-1',
    height: 100,
    created_at: new Date('2024-01-01T00:00:00Z'),
    prev_block_hash: null,
    transactions_hash: '0xprev',
    transactions_rejected: 0,
    transactions_total: 8,
  },
];

const { scrollY, setupAsyncDataMock } = vi.hoisted(() => ({
  scrollY: { value: 0 },
  setupAsyncDataMock: vi.fn(),
}));

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useWindowScroll: () => ({ y: scrollY }),
  };
});

const mainState = {
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

const probeState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { page: 1, per_page: 1, total_pages: 1, total_items: 1 },
      items: [{ ...mockBlocks[0], height: mockBlocks[0].height }],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: setupAsyncDataMock,
}));

const BaseContentBlockStub = {
  template: '<div><slot /></div>',
};

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items', 'reversed', 'rowKey'],
  emits: ['update:page', 'update:pageSize'],
  template: '<div><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseButtonStub = {
  emits: ['click'],
  template: `<button v-bind="$attrs" type="button" @click="$emit('click')"><slot /></button>`,
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

const BaseHashStub = {
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const TimeStampStub = {
  props: ['value'],
  template: '<time>{{ value }}</time>',
};

describe('BlocksList', () => {
  beforeEach(() => {
    scrollY.value = 0;
    mainState.isLoading = false;
    mainState.data.data.items = [...mockBlocks];
    mainState.refetch = vi.fn();
    probeState.isLoading = false;
    probeState.data.data.items = [{ ...mockBlocks[0], height: mockBlocks[0].height }];
    probeState.refetch = vi.fn();

    setupAsyncDataMock.mockReset();
    setupAsyncDataMock
      .mockImplementationOnce(() => mainState)
      .mockImplementationOnce(() => probeState)
      .mockImplementation(() => mainState);
  });

  const factory = () =>
    mount(BlocksList, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseButton: BaseButtonStub,
          BaseLink: BaseLinkStub,
          BaseHash: BaseHashStub,
          TimeStamp: TimeStampStub,
        },
      },
    });

  it('renders rows once data is loaded', async () => {
    factory();
    await flushPromises();
    expect(mainState.data.data.items).toHaveLength(1);
  });

  it('uses non-reversed pagination mode for Torii blocks pages', async () => {
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTable' });
    expect(table.props('reversed')).not.toBe(true);
  });

  it('shows a pending refresh banner while scrolled down and a new block is available', async () => {
    scrollY.value = 200;
    probeState.data.data.items = [{ ...mockBlocks[0], height: mockBlocks[0].height + 1 }];

    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test=\"pending-refresh\"]').exists()).toBe(true);

    await wrapper.get('[data-test=\"pending-refresh-load\"]').trigger('click');
    await flushPromises();

    expect(mainState.refetch).toHaveBeenCalled();
    expect(wrapper.find('[data-test=\"pending-refresh\"]').exists()).toBe(false);
  });
});
