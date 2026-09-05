import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NavigationMenu from './NavigationMenu.vue';
import { navigationGroups, menu } from '@/shared/config';
async function factory() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/telemetry', name: 'telemetry', component: { template: '<div />' } },
    { path: '/studio', name: 'kotodama-studio', component: { template: '<div />' } },
  ] });
  await router.push('/'); await router.isReady();
  return { router, wrapper: mount(NavigationMenu, { global: { plugins: [router], mocks: { $t: (key: string) => key }, stubs: { BaseLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } }) };
}
describe('Grouped navigation', () => {
  it('includes each destination exactly once and keeps Explore visible', async () => {
    expect(menu).toHaveLength(20);
    expect(new Set(menu.map((item) => item.to)).size).toBe(20);
    expect(navigationGroups.map((group) => group.id)).toEqual(['explore', 'analysis', 'network', 'develop']);
    const { wrapper } = await factory();
    expect(wrapper.get('ul').isVisible()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(3);
    expect(wrapper.get('[aria-current=page]').attributes('href')).toBe('/');
  });
  it('toggles groups and expands the destination group after navigation', async () => {
    const { wrapper, router } = await factory();
    const network = wrapper.findAll('button')[1];
    expect(network.attributes('aria-expanded')).toBe('false');
    await network.trigger('click'); expect(network.attributes('aria-expanded')).toBe('true');
    await network.trigger('click'); expect(network.attributes('aria-expanded')).toBe('false');
    await router.push('/telemetry'); await flushPromises();
    expect(network.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[aria-current=page]').attributes('href')).toBe('/telemetry');
    await router.push('/studio'); await flushPromises();
    expect(wrapper.findAll('button')[2].attributes('aria-expanded')).toBe('true');
  });
});
