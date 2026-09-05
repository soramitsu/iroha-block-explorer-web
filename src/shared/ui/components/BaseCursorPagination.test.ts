import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseCursorPagination from './BaseCursorPagination.vue';
import { i18n } from '@/shared/lib/localization';

describe('BaseCursorPagination', () => {
  it('renders only current-page evidence when Torii reports a terminal page', () => {
    const wrapper = mount(BaseCursorPagination, {
      props: {
        items: 3,
        pageSize: 10,
        cursor: null,
        pagination: { limit: 10, next_cursor: null, has_more: false },
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="cursor-page-summary"]').text()).toContain('3 rows on this page');
    expect(wrapper.text()).toContain('exact total unavailable');
    expect(wrapper.text()).not.toContain('of 3');
    expect(wrapper.get<HTMLButtonElement>('[data-testid="cursor-previous"]').element.disabled).toBe(true);
    expect(wrapper.get<HTMLButtonElement>('[data-testid="cursor-next"]').element.disabled).toBe(true);
    expect(wrapper.findAll('button.base-pagination__item-numbers-number')).toHaveLength(0);
  });

  it('uses Torii next_cursor verbatim and follows the discovered cursor trail backwards', async () => {
    const wrapper = mount(BaseCursorPagination, {
      props: {
        items: 10,
        pageSize: 10,
        cursor: null,
        pagination: { limit: 10, next_cursor: 'cursor-1', has_more: true },
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="cursor-next"]').trigger('click');
    expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual(['cursor-1']);

    await wrapper.setProps({
      cursor: 'cursor-1',
      pagination: { limit: 10, next_cursor: 'cursor-2', has_more: true },
    });
    await wrapper.get('[data-testid="cursor-next"]').trigger('click');
    await wrapper.setProps({ cursor: 'cursor-2' });
    await wrapper.get('[data-testid="cursor-previous"]').trigger('click');
    expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual(['cursor-1']);

    await wrapper.setProps({ cursor: 'cursor-1' });
    await wrapper.get('[data-testid="cursor-previous"]').trigger('click');
    expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual([null]);
  });

  it('returns a bookmarked opaque cursor directly to the collection start', async () => {
    const wrapper = mount(BaseCursorPagination, {
      props: {
        items: 10,
        pageSize: 10,
        cursor: 'bookmarked-cursor',
        pagination: { limit: 10, next_cursor: null, has_more: false },
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="cursor-previous"]').trigger('click');
    expect(wrapper.emitted('update:cursor')).toEqual([[null]]);
  });

  it('stops and reports a continuation cycle across visited cursor pages', async () => {
    const wrapper = mount(BaseCursorPagination, {
      props: {
        items: 10,
        pageSize: 10,
        cursor: 'cursor-1',
        pagination: { limit: 10, next_cursor: 'cursor-2', has_more: true },
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="cursor-next"]').trigger('click');
    await wrapper.setProps({
      cursor: 'cursor-2',
      pagination: { limit: 10, next_cursor: 'cursor-1', has_more: true },
    });

    expect(wrapper.get('[data-testid="cursor-repeat-error"]').attributes('role')).toBe('alert');
    expect(wrapper.get<HTMLButtonElement>('[data-testid="cursor-next"]').element.disabled).toBe(true);
    expect(wrapper.emitted('update:cursor')).toEqual([['cursor-2']]);
  });

  it('allows a known forward continuation after browser-style cursor history navigation', async () => {
    const wrapper = mount(BaseCursorPagination, {
      props: {
        items: 10,
        pageSize: 10,
        cursor: 'cursor-1',
        pagination: { limit: 10, next_cursor: 'cursor-2', has_more: true },
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="cursor-next"]').trigger('click');
    await wrapper.setProps({
      cursor: 'cursor-2',
      pagination: { limit: 10, next_cursor: null, has_more: false },
    });
    await wrapper.setProps({
      cursor: 'cursor-1',
      pagination: { limit: 10, next_cursor: 'cursor-2', has_more: true },
    });

    expect(wrapper.find('[data-testid="cursor-repeat-error"]').exists()).toBe(false);
    expect(wrapper.get<HTMLButtonElement>('[data-testid="cursor-next"]').element.disabled).toBe(false);
  });
});
