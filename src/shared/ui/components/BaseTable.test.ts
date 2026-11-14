import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, ref, nextTick } from 'vue';
import BaseTable from './BaseTable.vue';
const elementWidth = ref(1440);
vi.mock('@vueuse/core', async (original) => ({ ...await original<typeof import('@vueuse/core')>(), useElementSize: () => ({ width: elementWidth }) }));

const BaseLoadingStub = {
  name: 'BaseLoading',
  template: '<div data-test="loading">loading</div>',
};

describe('BaseTable', () => {
  it('switches rows using measured container width and respects a dense-table threshold', async () => {
    const wrapper = mount(BaseTable, {
      props: { loading: false, items: [{ id: 'a' }], containerClass: 'rows', disablePagination: true },
      slots: { row: () => 'desktop', 'mobile-card': () => 'card' },
      global: { mocks: { $t: (key: string) => key } },
    });
    expect(wrapper.attributes('role')).toBe('table');
    elementWidth.value = 959;
    await nextTick();
    expect(wrapper.find('[role="listitem"]').text()).toBe('card');
    elementWidth.value = 960;
    await nextTick();
    expect(wrapper.attributes('role')).toBe('table');
    await wrapper.setProps({ breakpoint: 1200 });
    expect(wrapper.find('[role="listitem"]').exists()).toBe(true);
    elementWidth.value = 1440;
    wrapper.unmount();
  });

  it('renders a consumer-provided filtered-empty slot without losing pagination', () => {
    const wrapper = mount(BaseTable, {
      props: { loading: false, items: [], containerClass: 'rows', paginationMode: 'cursor' },
      slots: { empty: () => h('button', 'Clear filters') },
      global: { stubs: { BaseCursorPagination: true }, mocks: { $t: (key: string) => key } },
    });
    expect(wrapper.get('button').text()).toBe('Clear filters');
    expect(wrapper.find('base-cursor-pagination-stub').exists()).toBe(true);
  });

  it('keeps rendering existing rows while background refresh is pending', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: true,
        disablePagination: true,
        items: [{ id: 'a' }, { id: 'b' }],
        containerClass: 'base-table__container',
      },
      slots: {
        row: ({ item }: any) => h('div', { class: 'row' }, item.id),
      },
      global: {
        stubs: {
          BaseLoading: BaseLoadingStub,
        },
        mocks: {
          $t: (key: string) => key,
        },
      },
    });

    expect(wrapper.findAll('.content-row--with-hover')).toHaveLength(2);
    expect(wrapper.text()).toContain('a');
    expect(wrapper.text()).toContain('b');
  });

  it('shows a loader when loading and no items are available yet', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: true,
        disablePagination: true,
        items: [],
        containerClass: 'base-table__container',
      },
      slots: {
        row: ({ item }: any) => h('div', { class: 'row' }, item.id),
      },
      global: {
        stubs: {
          BaseLoading: BaseLoadingStub,
        },
        mocks: {
          $t: (key: string) => key,
        },
      },
    });

    expect(wrapper.find('[data-test="loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('noData');
  });

  it('shows empty state when not loading and items list is empty', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: false,
        disablePagination: true,
        items: [],
        containerClass: 'base-table__container',
      },
      slots: {
        row: ({ item }: any) => h('div', { class: 'row' }, item.id),
      },
      global: {
        stubs: {
          BaseLoading: BaseLoadingStub,
        },
        mocks: {
          $t: (key: string) => key,
        },
      },
    });

    expect(wrapper.text()).toContain('noData');
    expect(wrapper.find('[data-test="loading"]').exists()).toBe(false);
  });

  it('exposes every consumer-provided desktop column as its own header and cell', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: false,
        disablePagination: true,
        items: [{ id: 'a' }],
        containerClass: 'base-table__container',
      },
      slots: {
        header: () =>
          h('div', { role: 'presentation' }, [
            h('span', { role: 'columnheader' }, 'Identifier'),
            h('span', { role: 'columnheader' }, 'Value'),
          ]),
        row: ({ item }: any) =>
          h('div', { class: 'row', role: 'presentation' }, [
            h('span', { role: 'cell' }, item.id),
            h('span', { role: 'cell' }, '42'),
          ]),
      },
      global: {
        mocks: { $t: (key: string) => key },
      },
    });

    expect(wrapper.get('[role="table"]').attributes('aria-busy')).toBe('false');
    expect(wrapper.findAll('[role="rowgroup"]')).toHaveLength(2);
    expect(wrapper.findAll('[role="row"]')).toHaveLength(2);
    expect(wrapper.findAll('[role="columnheader"]').map((header) => header.text())).toEqual(['Identifier', 'Value']);
    expect(wrapper.findAll('[role="cell"]').map((cell) => cell.text())).toEqual(['a', '42']);
    expect(wrapper.find('.base-table__semantic-cell').exists()).toBe(false);
  });

  it('uses list semantics and omits the desktop header on mobile', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: false,
        disablePagination: true,
        items: [{ id: 'a' }, { id: 'b' }],
        containerClass: 'base-table__container',
        breakpoint: Number.MAX_SAFE_INTEGER,
      },
      slots: {
        header: () => h('span', { role: 'columnheader' }, 'Identifier'),
        row: ({ item }: any) => h('span', { role: 'cell' }, item.id),
        'mobile-card': ({ item }: any) => h('div', { class: 'card' }, item.id),
      },
      global: {
        mocks: { $t: (key: string) => key },
      },
    });

    expect(wrapper.classes()).toContain('base-table');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.find('[role="table"]').exists()).toBe(false);
    expect(wrapper.find('[role="row"]').exists()).toBe(false);
    expect(wrapper.find('[role="columnheader"]').exists()).toBe(false);
    expect(wrapper.get('[role="list"]').attributes('role')).toBe('list');
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2);
  });

  it('makes pointer rows keyboard reachable and activates them with Enter or Space', async () => {
    const item = { id: 'a' };
    const wrapper = mount(BaseTable, {
      props: {
        loading: false,
        disablePagination: true,
        items: [item],
        containerClass: 'base-table__container',
        rowPointer: true,
      },
      slots: {
        row: ({ item: rowItem }: any) => h('div', { role: 'cell' }, rowItem.id),
      },
      global: {
        mocks: { $t: (key: string) => key },
      },
    });

    const row = wrapper.get('[role="row"]');
    expect(row.attributes('tabindex')).toBe('0');
    await row.trigger('keydown', { key: 'Enter' });
    await row.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('click:row')).toEqual([[item], [item]]);
  });

  it('forwards an opt-in Torii fetch-window cap to numbered pagination', () => {
    const wrapper = mount(BaseTable, {
      props: {
        loading: false,
        items: [{ id: 'a' }],
        total: 1_000,
        maxFetchSize: 500,
        containerClass: 'base-table__container',
      },
      global: {
        stubs: {
          BasePagination: {
            name: 'BasePagination',
            props: ['maxFetchSize'],
            template: '<div data-test="pagination" :data-max-fetch-size="maxFetchSize" />',
          },
        },
        mocks: { $t: (key: string) => key },
      },
    });

    expect(wrapper.get('[data-test="pagination"]').attributes('data-max-fetch-size')).toBe('500');
  });
});
