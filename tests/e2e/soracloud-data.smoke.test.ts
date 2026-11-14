import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import { i18n } from '@/shared/lib/localization';

const BasePageLayoutStub = defineComponent({
  template: '<div data-test="layout-stub"><slot /></div>',
});
const NotificationsStub = defineComponent({ template: '<div />' });
const HeaderStub = defineComponent({ template: '<header>Header</header>' });
const BaseContentBlockStub = defineComponent({
  props: { title: { type: String, required: false } },
  template: '<section><h2>{{ title }}</h2><slot /></section>',
});

vi.mock('@/widgets/header', () => ({ TheHeader: HeaderStub }));
vi.mock('@/shared/ui/components/BasePageLayout.vue', () => ({ default: BasePageLayoutStub }));
vi.mock('@/shared/ui/components/NotificationsInstance.vue', () => ({ default: NotificationsStub }));

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('Soracloud route smoke', () => {
  it('renders the canonical authentication boundary without issuing unsigned Soracloud reads', async () => {
    const fetchSpy = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);

    const [{ routes }, { default: App }] = await Promise.all([import('@/app/router'), import('@/app/App.vue')]);
    const router = createRouter({ history: createMemoryHistory(), routes });
    wrapper = mount(App, {
      global: {
        plugins: [router, i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub },
      },
    });

    await router.push('/soracloud');
    await router.isReady();
    await flushPromises();

    const boundary = wrapper.get('[data-test="soracloud-auth-boundary"]').text();
    expect(boundary).toContain('canonical account authentication');
    expect(boundary).toContain('does not issue unsigned requests');
    expect(wrapper.text()).toContain('/v1/soracloud/hf/lease/status');
    expect(wrapper.find('[data-test="soracloud-retired-routes"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('/model/compile/status');
    expect(fetchSpy.mock.calls.map(([input]) => String(input)).some((url) => url.includes('/v1/soracloud/'))).toBe(
      false
    );
  });
});
