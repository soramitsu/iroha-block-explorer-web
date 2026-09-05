import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BlocksList from './BlocksList.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Block } from '@/shared/api/schemas';
import { ref } from 'vue';

const mockBlocks: Block[] = [
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
const cursorPaginationState = ref<
  { ok: true, cursor: string | null, limit: number } | { ok: false, code: 'invalid-cursor' | 'invalid-limit' }
>({ ok: true, cursor: null, limit: 10 });
const resetCursorPagination = vi.fn().mockResolvedValue(undefined);

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useWindowScroll: () => ({ y: scrollY }),
  };
});

const mainState = {
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
        snapshot_height: 100,
        snapshot_hash: '0xsnapshot',
        next_cursor: null,
        has_more: false,
      },
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
      pagination: {
        limit: 1,
        snapshot_height: 100,
        snapshot_hash: '0xsnapshot',
        next_cursor: null,
        has_more: false,
      },
      items: [{ ...mockBlocks[0], height: mockBlocks[0].height }],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: setupAsyncDataMock,
}));

vi.mock('@/shared/ui/composables/useListRouteQuery', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue');
  return {
    useCursorListRouteQuery: () => ({
      cursor: ref(null),
      limit: ref(10),
      pagination: cursorPaginationState,
      resetPagination: resetCursorPagination,
      updateListQuery: vi.fn(),
    }),
  };
});

const BaseContentBlockStub = {
  template: '<div><slot /></div>',
};

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items', 'paginationMode', 'cursorPagination', 'rowKey'],
  emits: ['update:cursor', 'update:pageSize'],
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
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    scrollY.value = 0;
    mainState.isLoading = false;
    mainState.data.data.items = [...mockBlocks];
    mainState.refetch = vi.fn();
    probeState.isLoading = false;
    probeState.data.data.items = [{ ...mockBlocks[0], height: mockBlocks[0].height }];
    probeState.refetch = vi.fn();
    cursorPaginationState.value = { ok: true, cursor: null, limit: 10 };
    resetCursorPagination.mockClear();

    setupAsyncDataMock.mockReset();
    setupAsyncDataMock
      .mockImplementationOnce(() => mainState)
      .mockImplementationOnce(() => probeState)
      .mockImplementation(() => mainState);
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) mountedWrappers.pop()?.unmount();
  });

  const factory = () => {
    const wrapper = mount(BlocksList, {
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
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  it('renders rows once data is loaded', async () => {
    factory();
    await flushPromises();
    expect(mainState.data.data.items).toHaveLength(1);
  });

  it('renders an unavailable timestamp for a hash-only committed-journal row', async () => {
    mainState.data.data.items = [{ ...mockBlocks[0], created_at: null }];
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="block-created-at-unavailable"]').text()).toBe('unknown');
    expect(wrapper.find('time').exists()).toBe(false);
  });

  it('uses Torii cursor pagination without an invented total', async () => {
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTable' });
    expect(table.props('paginationMode')).toBe('cursor');
    expect(table.props('cursorPagination')).toEqual(mainState.data.data.pagination);
    expect(table.attributes('total')).toBeUndefined();
  });

  it('blocks malformed cursor bookmarks until the user explicitly resets pagination', async () => {
    cursorPaginationState.value = { ok: false, code: 'invalid-cursor' };
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="blocks-invalid-pagination"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'BaseTable' }).exists()).toBe(false);

    await wrapper.get('[data-test="blocks-invalid-pagination"] button').trigger('click');
    expect(resetCursorPagination).toHaveBeenCalledOnce();
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
