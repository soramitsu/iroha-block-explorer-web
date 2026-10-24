import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref, type Component, type Ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/shared/lib/localization';
import { routes } from '@/app/router';
import type { ExplorerRouteScope } from '@/shared/lib/explorer-scope';
import GroupedNavigation from './GroupedNavigation.vue';
import DashboardShell from '@/pages/dashboards/DashboardShell.vue';

const scopeState = ref<ExplorerRouteScope | null>(null) as Ref<ExplorerRouteScope | null>;
vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => scopeState,
}));

const stubRoutes = routes.map((route) =>
  'component' in route ? { ...route, component: { template: '<div />' } } : route
);

async function mountAt(path: string, component: Component = GroupedNavigation, props: Record<string, unknown> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: stubRoutes as never });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    props,
    attachTo: document.body,
    global: { plugins: [router, i18n] },
  } as never);
  return { wrapper, router };
}

afterEach(() => {
  scopeState.value = null;
  document.body.innerHTML = '';
});

describe('GroupedNavigation', () => {
  it('highlights the current section and lists its destinations as quick links', async () => {
    const { wrapper } = await mountAt('/dashboards/activity');
    expect(wrapper.find('[data-test="nav-group-analytics"]').attributes('data-current')).toBe('true');
    const quick = wrapper.findAll('.grouped-nav__quick-link');
    expect(quick.map((link) => link.attributes('href'))).toEqual(['/dashboards/network', '/econometrics']);
    expect(quick[0]!.attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('opens one group panel at a time and closes it with Escape', async () => {
    const { wrapper } = await mountAt('/blocks');
    const network = wrapper.find('[data-test="nav-group-network"]');
    await network.trigger('click');
    expect(network.attributes('aria-expanded')).toBe('true');
    const panel = wrapper.find(`#${network.attributes('aria-controls')}`);
    expect(panel.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/telemetry',
      '/governance',
      '/zk/telemetry',
      '/kaigi/relays',
      '/vpn',
    ]);

    await wrapper.find('[data-test="nav-group-build"]').trigger('click');
    expect(network.attributes('aria-expanded')).toBe('false');

    await wrapper.find('.grouped-nav__panel').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.grouped-nav__panel').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find('[data-test="nav-group-build"]').element);
    wrapper.unmount();
  });

  it('moves focus into the panel with ArrowDown and closes after navigating', async () => {
    const { wrapper, router } = await mountAt('/blocks');
    const explore = wrapper.find('[data-test="nav-group-explore"]');
    await explore.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const links = wrapper.findAll('.grouped-nav__panel a');
    expect(document.activeElement).toBe(links[0]!.element);

    await router.push('/transactions');
    await flushPromises();
    expect(wrapper.find('.grouped-nav__panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps an active explorer scope on every destination', async () => {
    scopeState.value = { torii: 'https://peer.example', dataspaceLaneId: '7', dataspaceId: '42' };
    const { wrapper } = await mountAt('/blocks');
    const href = wrapper.find('.grouped-nav__quick-link').attributes('href');
    expect(href).toContain('/blocks?');
    expect(href).toContain(encodeURIComponent('https://peer.example'));
    wrapper.unmount();
  });
});

describe('DashboardShell', () => {
  it('marks the active dashboard tab for assistive technology', async () => {
    const { wrapper } = await mountAt('/dashboards/ledger', DashboardShell, {
      active: 'ledger',
      title: 'Ledger composition',
      subtitle: 'How the ledger is distributed',
    });
    const tabs = wrapper.findAll('.dashboard-shell__tab');
    expect(tabs.map((tab) => tab.attributes('href'))).toEqual([
      '/dashboards/network',
      '/dashboards/activity',
      '/dashboards/ledger',
    ]);
    expect(tabs[2]!.attributes('aria-current')).toBe('page');
    expect(tabs[0]!.attributes('aria-current')).toBeUndefined();
    expect(wrapper.find('h1').text()).toBe('Ledger composition');
    wrapper.unmount();
  });
});
