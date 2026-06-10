import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import BaseTable from './BaseTable.vue';

const BaseLoadingStub = {
  name: 'BaseLoading',
  template: '<div data-test="loading">loading</div>',
};

describe('BaseTable', () => {
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
});
