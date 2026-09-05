import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import BaseHash from './BaseHash.vue';
const state = vi.hoisted(() => ({ copy: vi.fn(), success: vi.fn(), error: vi.fn(), supported: true }));
vi.mock('@vueuse/core', async (original) => ({ ...await original<typeof import('@vueuse/core')>(), useClipboard: () => ({ copy: state.copy, isSupported: ref(state.supported) }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/shared/ui/composables/notifications', () => ({ useNotifications: () => state }));
const identifier = 'ab'.repeat(32);
function factory() { return mount(BaseHash, { props: { hash: identifier, type: 'short', copy: true }, global: { mocks: { $t: (key: string) => key } } }); }
beforeEach(() => { state.copy.mockReset(); state.success.mockReset(); state.error.mockReset(); state.supported = true; });
it('copies the complete value through a named native button', async () => {
  const wrapper = factory();
  await wrapper.get('button.base-hash__copy').trigger('click'); await flushPromises();
  expect(state.copy).toHaveBeenCalledWith(identifier);
  expect(state.success).toHaveBeenCalledWith('clipboard.success');
  expect(wrapper.get('button.base-hash__copy').attributes('aria-label')).toBe('ux.copyIdentifier');
});
it('reports rejected and unavailable clipboard access', async () => {
  state.copy.mockRejectedValueOnce(new Error('denied'));
  await factory().get('button.base-hash__copy').trigger('click'); await flushPromises();
  expect(state.error).toHaveBeenCalledWith('clipboard.error');
  state.supported = false;
  await factory().get('button.base-hash__copy').trigger('click');
  expect(state.copy).toHaveBeenCalledTimes(1);
  expect(state.error).toHaveBeenCalledTimes(2);
});
it('reveals and hides the full value without changing the identifier', async () => {
  const wrapper = factory(); const reveal = wrapper.get('.base-hash__reveal');
  await reveal.trigger('click');
  expect(reveal.attributes('aria-expanded')).toBe('true');
  expect(wrapper.get('.base-hash__full').text()).toBe(identifier);
  await reveal.trigger('click'); expect(wrapper.find('.base-hash__full').exists()).toBe(false);
});
