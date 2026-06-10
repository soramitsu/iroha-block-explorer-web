import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const fetchAccountsMock = vi.fn();

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchAccounts: fetchAccountsMock,
  };
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

vi.mock('@/widgets/header', () => ({ TheHeader: HeaderStub }));
vi.mock('@/shared/ui/components/BasePageLayout.vue', () => ({ default: BasePageLayoutStub }));
vi.mock('@/shared/ui/components/NotificationsInstance.vue', () => ({ default: NotificationsStub }));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlockStub',
  props: { title: { type: String, required: false } },
  template: '<section data-test="content-block"><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTableStub',
  props: {
    items: { type: Array, default: () => [] },
    page: { type: Number, default: 1 },
    pageSize: { type: Number, default: 10 },
    total: { type: Number, default: 0 },
    loading: { type: Boolean, default: false },
    containerClass: { type: String, default: '' },
  },
  emits: ['update:page', 'update:pageSize', 'click:row'],
  template: `
    <div data-test="base-table">
      <slot name="header" />
      <div data-test="base-table-rows">
        <div
          v-for="(item, idx) in items"
          :key="'row-' + idx"
          data-test="base-table-row"
          @click="$emit('click:row', item)"
        >
          <slot name="row" :item="item" />
        </div>
      </div>
      <div data-test="base-table-mobile">
        <div
          v-for="(item, idx) in items"
          :key="'mobile-' + idx"
          data-test="base-table-mobile-card"
        >
          <slot name="mobile-card" :item="item" />
        </div>
      </div>
    </div>
  `,
});

const BaseHashStub = defineComponent({
  name: 'BaseHashStub',
  props: { hash: { type: String, required: true } },
  template: '<span data-test="base-hash">{{ hash }}</span>',
});

async function mountAppAt(path: string) {
  const [{ routes }, { default: App }] = await Promise.all([import('@/app/router'), import('@/app/App.vue')]);

  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });

  const wrapper = mount(App, {
    global: {
      plugins: [router, i18n],
      stubs: {
        BaseContentBlock: BaseContentBlockStub,
        BaseTable: BaseTableStub,
        BaseHash: BaseHashStub,
      },
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('Accounts data smoke', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  const mockAccounts = [
    {
      id: 'alice@wonderland',
      compressed_address: 'compressed',
      network_prefix: 42,
      metadata: {},
      owned_assets: 2,
      owned_nfts: 1,
      owned_domains: 3,
    },
  ];

  beforeEach(() => {
    fetchAccountsMock.mockReset();
    fetchAccountsMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: mockAccounts.length },
        items: mockAccounts,
      },
    });
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  it('renders fetched accounts, handles filters, and routes to the detail page', async () => {
    const { wrapper, router } = await mountAppAt('/accounts');
    mountedWrappers.push(wrapper);
    await flushPromises();

    expect(fetchAccountsMock).toHaveBeenCalled();
    const fetchArgs = fetchAccountsMock.mock.calls.at(-1)?.[0];
    expect(fetchArgs?.page).toBe(1);
    expect(fetchArgs?.per_page).toBe(10);

    const firstRow = wrapper.find('[data-test="base-table-row"]');
    expect(firstRow.exists()).toBe(true);
    expect(firstRow.text()).toContain('alice@wonderland');
    expect(firstRow.text()).toContain(String(mockAccounts[0].owned_domains));
    expect(firstRow.text()).toContain(String(mockAccounts[0].owned_assets + mockAccounts[0].owned_nfts));

    const domainInput = wrapper.find(`input[placeholder="${i18n.global.t('accounts.filters.domainPlaceholder')}"]`);
    await domainInput.setValue('wonderland');
    await flushPromises();
    const domainCall = fetchAccountsMock.mock.calls.at(-1)?.[0];
    expect(domainCall?.domain).toBe('wonderland');
    expect(domainCall?.page).toBe(1);

    const assetInput = wrapper.find(`input[placeholder="${i18n.global.t('accounts.filters.assetPlaceholder')}"]`);
    await assetInput.setValue('invalid asset id');
    await flushPromises();
    const errorHint = wrapper.find('.accounts-list-page__filters-error');
    expect(errorHint.exists()).toBe(true);
    expect(errorHint.text()).toBe(i18n.global.t('accounts.filters.assetInvalid'));

    const pushSpy = vi.spyOn(router, 'push');
    const updatedRow = wrapper.find('[data-test="base-table-row"]');
    await updatedRow.trigger('click');
    await flushPromises();
    expect(pushSpy).toHaveBeenCalledWith(`/accounts/${encodeURIComponent('alice@wonderland')}`);
    pushSpy.mockRestore();
  }, 20000);
});
