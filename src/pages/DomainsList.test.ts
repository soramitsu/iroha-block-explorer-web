import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

import DomainsList from './DomainsList.vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { i18n } from '@/shared/lib/localization';

const { setupAsyncDataMock } = vi.hoisted(() => ({ setupAsyncDataMock: vi.fn() }));

const cursor = ref<string | null>(null);
const limit = ref(10);
const pagination = ref<
  { ok: true, cursor: string | null, limit: number } | { ok: false, code: 'invalid-cursor' | 'invalid-limit' }
>({ ok: true, cursor: null, limit: 10 });
const resetPagination = vi.fn().mockResolvedValue(undefined);

vi.mock('@/shared/ui/composables/useListRouteQuery', () => ({
  useCursorListRouteQuery: () => ({ cursor, limit, pagination, resetPagination, updateListQuery: vi.fn() }),
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
      nextCursor: null,
      items: [],
    },
  },
};
vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: setupAsyncDataMock,
}));

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items', 'paginationMode', 'cursorPagination'],
  emits: ['update:cursor', 'update:pageSize'],
  template: '<div data-test="base-table" />',
};

describe('DomainsList', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    cursor.value = null;
    limit.value = 10;
    pagination.value = { ok: true, cursor: null, limit: 10 };
    resetPagination.mockClear();
    setupAsyncDataMock.mockClear();
    setupAsyncDataMock.mockImplementation(() => setupState);
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) mountedWrappers.pop()?.unmount();
  });

  const factory = () => {
    const wrapper = mount(DomainsList, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: { template: '<section><slot /></section>' },
          BaseTable: BaseTableStub,
          BaseButton: {
            emits: ['click'],
            template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
          },
          BaseLink: true,
          BaseHash: true,
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  it('renders the authoritative cursor page without an invented total', async () => {
    const wrapper = factory();
    await flushPromises();

    const table = wrapper.getComponent({ name: 'BaseTable' });
    expect(table.props('paginationMode')).toBe('cursor');
    expect(table.props('cursorPagination')).toEqual(setupState.data.data);
    expect(setupAsyncDataMock).toHaveBeenCalledOnce();
  });

  it('does not fetch a malformed bookmark and exposes explicit recovery', async () => {
    pagination.value = { ok: false, code: 'invalid-cursor' };
    const wrapper = factory();
    await flushPromises();

    expect(setupAsyncDataMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="domains-invalid-pagination"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="base-table"]').exists()).toBe(false);

    await wrapper.get('[data-test="domains-invalid-pagination"] button').trigger('click');
    expect(resetPagination).toHaveBeenCalledOnce();
  });
});
