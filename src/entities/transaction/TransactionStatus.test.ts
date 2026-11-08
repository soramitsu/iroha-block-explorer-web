import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import TransactionStatus from './TransactionStatus.vue';

enableAutoUnmount(afterEach);

function factory(committed = true, type: 'label' | 'tooltip' = 'tooltip') {
  return mount(TransactionStatus, {
    attachTo: document.body,
    props: { committed, type },
    global: { mocks: { $t: (key: string) => key } },
  });
}

describe('TransactionStatus', () => {
  it.each([
    [true, 'transactions.committedTransaction'],
    [false, 'transactions.rejectedTransaction'],
  ])('uses one named badge button for committed=%s', (committed, message) => {
    const wrapper = factory(committed);
    const button = wrapper.get('button');
    const tooltip = wrapper.get('[role="tooltip"]');

    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(wrapper.find('.context-tooltip').exists()).toBe(false);
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe(message);
    expect(button.attributes('aria-describedby')).toBe(tooltip.attributes('id'));
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(tooltip.text()).toBe(message);
    expect(tooltip.isVisible()).toBe(false);
    expect(wrapper.get('.transaction-status__icon').attributes('data-committed')).toBe(String(committed));
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    const wrapper = factory();
    const button = wrapper.get('button');

    await button.trigger('mouseenter');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[role="tooltip"]').isVisible()).toBe(true);
    await button.trigger('mouseleave');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('[role="tooltip"]').isVisible()).toBe(false);
  });

  it('stays open while focused, then closes on blur', async () => {
    const wrapper = factory();
    const button = wrapper.get('button');

    await button.trigger('focus');
    await button.trigger('mouseenter');
    await button.trigger('mouseleave');
    expect(button.attributes('aria-expanded')).toBe('true');
    await button.trigger('blur');
    expect(button.attributes('aria-expanded')).toBe('false');
  });

  it('toggles by click and dismisses despite hover or focus', async () => {
    const wrapper = factory();
    const button = wrapper.get('button');

    await button.trigger('focus');
    await button.trigger('mouseenter');
    await button.trigger('click');
    await button.trigger('mouseleave');
    expect(button.attributes('aria-expanded')).toBe('true');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('[role="tooltip"]').isVisible()).toBe(false);
  });

  it('dismisses with Escape and reopens after a new focus interaction', async () => {
    const wrapper = factory();
    const button = wrapper.get('button');

    await button.trigger('focus');
    await button.trigger('mouseenter');
    await button.trigger('click');
    await button.trigger('keydown', { key: 'Escape' });
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('[role="tooltip"]').isVisible()).toBe(false);
    await button.trigger('blur');
    await button.trigger('mouseleave');
    await button.trigger('focus');
    expect(button.attributes('aria-expanded')).toBe('true');
  });

  it('closes a pinned tooltip when focus moves away', async () => {
    const wrapper = factory();
    const button = wrapper.get('button');

    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    await button.trigger('blur');
    expect(button.attributes('aria-expanded')).toBe('false');
  });

  it.each([
    [true, 'transactions.committed'],
    [false, 'transactions.rejected'],
  ])('preserves visible label mode for committed=%s', (committed, message) => {
    const wrapper = factory(committed, 'label');

    expect(wrapper.get('.transaction-status__label').text()).toBe(message);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    expect(wrapper.get('.transaction-status__icon').attributes('data-committed')).toBe(String(committed));
  });
});
