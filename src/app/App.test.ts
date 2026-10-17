import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';
import App from './App.vue';
import { activateExplorerReadSession, disconnectExplorerReadSession, explorerReadAccountId } from '@/shared/lib/explorer-read-auth';

const route = reactive({ name: 'transactions-list', path: '/transactions', fullPath: '/transactions', query: {} });
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/shared/api', () => ({ getToriiBaseUrl: () => 'https://taira.sora.org', setRouteScopedToriiBaseUrl: vi.fn() }));
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => { wrapper?.unmount(); disconnectExplorerReadSession(); });

describe('Explorer read identity lifecycle', () => {
  it('destroys the old routed data view on login and logout', async () => {
    let created = 0;
    const View = defineComponent({ setup() {
      const instance = ++created;
      const privateAtMount = explorerReadAccountId.value !== null;
      return () => h('div', { 'data-test': 'view', 'data-instance': instance }, privateAtMount ? 'Private records' : 'Public records');
    } });
    wrapper = mount(App, { global: { stubs: {
      RouterView: View,
      TheHeader: true,
      BasePageLayout: { template: '<div><slot /></div>' },
      NotificationsInstance: true,
    } } });
    expect(wrapper.get('[data-test="view"]').text()).toBe('Public records');
    activateExplorerReadSession({ baseUrl: 'https://taira.sora.org', networkId: 'network-a',
      auth: { authAccountId: 'reader@bank', sign: async () => new Uint8Array(64) }, close: vi.fn() });
    await flushPromises();
    expect(wrapper.get('[data-test="view"]').text()).toBe('Private records');
    expect(wrapper.get('[data-test="view"]').attributes('data-instance')).toBe('2');
    disconnectExplorerReadSession();
    await flushPromises();
    expect(wrapper.get('[data-test="view"]').text()).toBe('Public records');
    expect(wrapper.get('[data-test="view"]').attributes('data-instance')).toBe('3');
  });

  it('closes the approved wallet when the application is removed', () => {
    wrapper = mount(App, { global: { stubs: {
      RouterView: true, TheHeader: true, BasePageLayout: true, NotificationsInstance: true,
    } } });
    const close = vi.fn();
    activateExplorerReadSession({ baseUrl: 'https://taira.sora.org', networkId: 'network-a',
      auth: { authAccountId: 'reader@bank', sign: async () => new Uint8Array(64) }, close });
    wrapper.unmount();
    wrapper = undefined;
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
