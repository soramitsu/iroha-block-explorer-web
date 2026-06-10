import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import { i18n } from '@/shared/lib/localization';

const HomePageStub = defineComponent({
  name: 'HomePageStub',
  template: '<div data-test="home-page-stub">Home</div>',
});

const BlocksListStub = defineComponent({
  name: 'BlocksListStub',
  template: '<div data-test="blocks-list-stub">Blocks</div>',
});

const SoracloudPageStub = defineComponent({
  name: 'SoracloudPageStub',
  template: '<div data-test="soracloud-page-stub">SoraCloud</div>',
});

const BasePageLayoutStub = defineComponent({
  name: 'BasePageLayoutStub',
  template: '<div data-test="layout-stub"><slot /></div>',
});

const NotificationsStub = defineComponent({
  name: 'NotificationsStub',
  template: '<div data-test="notifications-stub" />',
});

const HeaderStub = defineComponent({
  name: 'HeaderStub',
  template: '<header data-test="header-stub">Header</header>',
});

vi.mock('@/pages/HomePage.vue', () => ({ default: HomePageStub }));
vi.mock('@/pages/BlocksList.vue', () => ({ default: BlocksListStub }));
vi.mock('@/pages/SoracloudPage.vue', () => ({ default: SoracloudPageStub }));
vi.mock('@/widgets/header', () => ({ TheHeader: HeaderStub }));
vi.mock('@/shared/ui/components/BasePageLayout.vue', () => ({ default: BasePageLayoutStub }));
vi.mock('@/shared/ui/components/NotificationsInstance.vue', () => ({ default: NotificationsStub }));

async function mountAppAt(path: string) {
  const [{ routes }, { default: App }] = await Promise.all([
    import('@/app/router'),
    import('@/app/App.vue'),
  ]);
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });
  const wrapper = mount(App, {
    global: {
      plugins: [router, i18n],
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('App routing smoke test', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  it('shows the bare home layout without header or BasePageLayout wrapper', async () => {
    const { wrapper } = await mountAppAt('/');
    mountedWrappers.push(wrapper);
    expect(wrapper.find('[data-test="home-page-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="header-stub"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="layout-stub"]').exists()).toBe(false);
  }, 20000);

  it('wraps non-home routes with the header and page layout', async () => {
    const { wrapper } = await mountAppAt('/blocks');
    mountedWrappers.push(wrapper);
    expect(wrapper.find('[data-test="header-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="layout-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="blocks-list-stub"]').exists()).toBe(true);
  }, 20000);

  it('mounts the Soracloud route inside the standard layout chrome', async () => {
    const { wrapper } = await mountAppAt('/soracloud');
    mountedWrappers.push(wrapper);
    expect(wrapper.find('[data-test="header-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="layout-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="soracloud-page-stub"]').exists()).toBe(true);
  }, 20000);
});
