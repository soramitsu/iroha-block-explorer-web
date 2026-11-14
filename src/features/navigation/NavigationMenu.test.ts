import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NavigationMenu from './NavigationMenu.vue';
import { navigationGroups, menu } from '@/shared/config';
import { toExplorerScopeQuery } from '@/shared/lib/explorer-scope';

const forced = vi.hoisted(() => ({ value: false }));
vi.mock('@/shared/api', () => ({ isToriiBaseUrlForced: () => forced.value }));
beforeEach(() => { forced.value = false; });

async function factory(layout: 'sidebar' | 'inline' = 'sidebar') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/telemetry', name: 'telemetry', component: { template: '<div />' } },
    { path: '/studio', name: 'kotodama-studio', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] });
  await router.push('/');
  await router.isReady();
  return { router, wrapper: mount(NavigationMenu, { props: { layout }, global: { plugins: [router], mocks: { $t: (key: string) => key } } }) };
}

describe('Always-visible navigation', () => {
  it.each(['sidebar', 'inline'] as const)('shows every destination without disclosures in %s layout', async (layout) => {
    expect(menu).toHaveLength(21);
    expect(new Set(menu.map((item) => item.to)).size).toBe(21);
    expect(navigationGroups.map((group) => group.id)).toEqual(['explore', 'analysis', 'network', 'develop']);
    const { wrapper } = await factory(layout);
    expect(wrapper.findAll('a')).toHaveLength(21);
    expect(wrapper.findAll('a').every((link) => link.isVisible())).toBe(true);
    expect(wrapper.find('button, details, [aria-expanded]').exists()).toBe(false);
    expect(wrapper.get('[aria-current=page]').attributes('href')).toBe('/');
    expect(wrapper.classes().includes('navigation-menu--inline')).toBe(layout === 'inline');
  });

  it('updates active destinations while keeping every other group visible', async () => {
    const { wrapper, router } = await factory();
    for (const path of ['/telemetry', '/studio', '/']) {
      await router.push(path);
      await flushPromises();
      expect(wrapper.get('[aria-current=page]').attributes('href')).toBe(path);
      expect(wrapper.findAll('[aria-current=page]')).toHaveLength(1);
      expect(wrapper.findAll('a').every((link) => link.isVisible())).toBe(true);
    }
  });

  it('preserves scoped navigation and keeps global destinations outside that scope', async () => {
    const { wrapper, router } = await factory('inline');
    await router.push({ name: 'home', query: toExplorerScopeQuery({ torii: 'https://scope.example', dataspaceLaneId: '7', dataspaceId: '42' }) });
    await flushPromises();
    for (const link of wrapper.findAll('a')) {
      const url = new URL(link.attributes('href')!, 'https://explorer.example');
      if (['/dataspaces', '/parameters', '/soracles', '/vpn', '/studio'].includes(url.pathname)) {
        expect(url.search).toBe('');
      } else {
        expect(url.searchParams.get('torii')).toBe('https://scope.example');
        expect(url.searchParams.get('dataspaceLaneId')).toBe('7');
        expect(url.searchParams.get('dataspaceId')).toBe('42');
      }
    }
  });
  it('retains forced-node boundaries when scoped parameters are present', async () => {
    forced.value = true;
    const { wrapper, router } = await factory('inline');
    await router.push({ name: 'home', query: toExplorerScopeQuery({ torii: 'https://scope.example', dataspaceLaneId: '7', dataspaceId: '42' }) });
    await flushPromises();
    for (const link of wrapper.findAll('a')) {
      expect(new URL(link.attributes('href')!, 'https://explorer.example').search).toBe('');
    }
  });

});
