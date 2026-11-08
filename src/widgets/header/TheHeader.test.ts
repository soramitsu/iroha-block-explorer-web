import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import TheHeader from './TheHeader.vue';

const scope = ref<unknown>(null);
vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({ useCurrentExplorerScope: () => scope }));
const stubs = {
  HeaderLogo: { template: '<a href="/">Iroha</a>' }, NavigationMenu: { template: '<nav />' },
  SearchField: { template: '<form role="search" />' }, NodeSettings: { template: '<button data-test="node">Node</button>' },
  ScopedExplorerControl: { template: '<button data-test="scope">Scope</button>' },
  ThemeSwitcher: { template: '<button data-test="theme">Theme</button>' }, LangDropdown: { template: '<button>Language</button>' },
};
async function factory(path = '/accounts') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] });
  await router.push(path);
  await router.isReady();
  return { router, wrapper: mount(TheHeader, { global: { plugins: [router], mocks: { $t: (key: string) => key }, stubs } }) };
}
beforeEach(() => { scope.value = null; });

describe('Explorer shell', () => {
  it('provides search, desktop and inline mobile navigation without a hidden drawer on inner pages', async () => {
    const { wrapper } = await factory();
    expect(wrapper.find('[role=search]').exists()).toBe(true);
    expect(wrapper.find('.explorer-sidebar nav').exists()).toBe(true);
    expect(wrapper.find('.explorer-mobile-navigation').exists()).toBe(true);
    expect(wrapper.find('dialog, [aria-expanded]').exists()).toBe(false);
    expect(wrapper.find('[data-test=theme]').exists()).toBe(true);
  });

  it('keeps the landing toolbar minimal and restores the inner-page shell after navigation', async () => {
    const { wrapper, router } = await factory('/');
    expect(wrapper.find('.app-header--home').exists()).toBe(true);
    expect(wrapper.find('[role=search], .explorer-sidebar, .explorer-mobile-navigation').exists()).toBe(false);
    expect(wrapper.find('[data-test=theme]').exists()).toBe(true);
    expect(wrapper.find('[data-test=node]').exists()).toBe(true);
    await router.push('/accounts');
    await flushPromises();
    expect(wrapper.find('.app-header--home').exists()).toBe(false);
    expect(wrapper.find('[role=search]').exists()).toBe(true);
    expect(wrapper.find('.explorer-mobile-navigation').exists()).toBe(true);
    await router.push('/');
    await flushPromises();
    expect(wrapper.find('.explorer-sidebar').exists()).toBe(false);
  });

  it.each(['/', '/accounts'])('uses scope-specific node controls on %s', async (path) => {
    const { wrapper } = await factory(path);
    expect(wrapper.find('[data-test=node]').exists()).toBe(true);
    scope.value = { torii: 'https://node.example' };
    await flushPromises();
    expect(wrapper.find('[data-test=scope]').exists()).toBe(true);
    expect(wrapper.find('[data-test=node]').exists()).toBe(false);
  });
});
