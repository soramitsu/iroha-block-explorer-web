import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import TheHeader from './TheHeader.vue';
const scope = ref<unknown>(null);
const desktop = ref(false);
vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({ useCurrentExplorerScope: () => scope }));
vi.mock('@vueuse/core', () => ({ useMediaQuery: () => desktop }));
const stubs = {
  HeaderLogo: { template: '<a href="/">Iroha</a>' }, NavigationMenu: { template: '<nav />' },
  SearchField: { template: '<form role="search" />' }, NodeSettings: { template: '<button data-test="node">Node</button>' },
  ScopedExplorerControl: { template: '<button data-test="scope">Scope</button>' },
  ThemeSwitcher: { template: '<button data-test="theme">Theme</button>' }, LangDropdown: { template: '<button>Language</button>' },
};
async function factory() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  await router.push('/accounts'); await router.isReady();
  return { router, wrapper: mount(TheHeader, { attachTo: document.body, global: { plugins: [router], mocks: { $t: (key: string) => key }, stubs } }) };
}
beforeEach(() => {
  scope.value = null; desktop.value = false;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
});
describe('Explorer shell', () => {
  it('wraps Tab and Shift+Tab within visible drawer controls', async () => {
    const { wrapper } = await factory();
    await wrapper.get('.app-header__menu').trigger('click');
    const first = wrapper.get('dialog a');
    const last = wrapper.get('dialog button');
    for (const control of [first, last]) vi.spyOn(control.element, 'getClientRects').mockReturnValue([{}] as any);
    (last.element as HTMLElement).focus();
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);
    await first.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(last.element);
    wrapper.unmount();
  });

  it('always supplies search and theme controls and uses scope-specific node controls', async () => {
    const { wrapper } = await factory();
    expect(wrapper.find('[role=search]').exists()).toBe(true);
    expect(wrapper.find('[data-test=theme]').exists()).toBe(true);
    expect(wrapper.find('[data-test=node]').exists()).toBe(true);
    scope.value = { torii: 'https://node.example' }; await flushPromises();
    expect(wrapper.find('[data-test=scope]').exists()).toBe(true);
    expect(wrapper.find('[data-test=node]').exists()).toBe(false);
  });
  it('opens a modal drawer and closes it through its close control', async () => {
    const { wrapper } = await factory();
    const trigger = wrapper.get('.app-header__menu');
    await trigger.trigger('click');
    expect(wrapper.get('dialog').element.open).toBe(true);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    await wrapper.get('dialog button').trigger('click');
    expect(wrapper.get('dialog').element.open).toBe(false);
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });
  it('closes the drawer after navigation and when desktop becomes available', async () => {
    const { wrapper, router } = await factory();
    await wrapper.get('.app-header__menu').trigger('click');
    await router.push('/blocks'); await flushPromises();
    expect(wrapper.get('dialog').element.open).toBe(false);
    await wrapper.get('.app-header__menu').trigger('click');
    desktop.value = true; await flushPromises();
    expect(wrapper.get('dialog').element.open).toBe(false);
  });
  it('only dismisses clicks on the backdrop outside the drawer', async () => {
    const { wrapper } = await factory();
    await wrapper.get('.app-header__menu').trigger('click');
    await wrapper.get('dialog nav').trigger('click');
    expect(wrapper.get('dialog').element.open).toBe(true);
    await wrapper.get('dialog').trigger('click', { clientX: 400, clientY: 10 });
    expect(wrapper.get('dialog').element.open).toBe(false);
  });
});
