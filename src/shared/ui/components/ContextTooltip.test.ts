import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextTooltip from './ContextTooltip.vue';
it('exposes information through a labeled native control and Escape', async () => {
  const wrapper = mount(ContextTooltip, { props: { message: '12:34 UTC' }, global: { mocks: { $t: (key: string) => key } } });
  const button = wrapper.get('button');
  expect(button.attributes('aria-label')).toBe('ux.moreInformation');
  expect(button.attributes('aria-describedby')).toBe(wrapper.get('[role=tooltip]').attributes('id'));
  await button.trigger('click'); expect(button.attributes('aria-expanded')).toBe('true');
  await button.trigger('keydown', { key: 'Escape' }); expect(button.attributes('aria-expanded')).toBe('false');
  await button.trigger('click'); await button.trigger('click'); expect(button.attributes('aria-expanded')).toBe('false');
});
