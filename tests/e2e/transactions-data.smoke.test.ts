import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const fetchTransactionsMock = vi.fn();

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchTransactions: fetchTransactionsMock,
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
vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlockStub',
  props: { title: { type: String, required: false } },
  template: '<section data-test="content-block"><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTableStub',
  props: {
    items: { type: Array, default: () => [] },
    page: { type: Number, default: 0 },
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
    </div>
  `,
});

const BaseHashStub = defineComponent({
  name: 'BaseHashStub',
  props: { hash: { type: String, required: true } },
  template: '<span data-test="base-hash">{{ hash }}</span>',
});

const BaseLinkStub = defineComponent({
  name: 'BaseLinkStub',
  props: { to: { type: [String, Object], default: null } },
  template: '<a data-test="base-link"><slot /></a>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButtonStub',
  template: '<button data-test="base-button"><slot /></button>',
});

const TransactionStatusStub = defineComponent({
  name: 'TransactionStatusStub',
  template: '<span data-test="transaction-status" />',
});

const TransactionStatusFilterStub = defineComponent({
  name: 'TransactionStatusFilterStub',
  props: { modelValue: { type: String, required: false, default: null } },
  emits: ['update:modelValue'],
  template: '<div data-test="transaction-status-filter" />',
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
        BaseLink: BaseLinkStub,
        BaseButton: BaseButtonStub,
        TransactionStatus: TransactionStatusStub,
        TransactionStatusFilter: TransactionStatusFilterStub,
      },
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('Transactions data smoke', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  const liveStyleAuthority =
    'sorauﾛ1P7tｾEbxﾜ4ﾕｶzZ1ｦxXﾆvaxｴsｲｴﾕkxﾊﾘｼPdM1ｼﾘｷﾁKSAT7H';

  beforeEach(() => {
    fetchTransactionsMock.mockReset();
    fetchTransactionsMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 1 },
        items: [
          {
            authority: liveStyleAuthority,
            hash: 'fdf756c76095e2b9247db2af867e2a25647450f28eb8bbc973dee21ab54780bb',
            block: 37,
            created_at: new Date('2026-03-28T18:44:03.003Z'),
            executable: 'Instructions',
            status: 'Rejected',
          },
        ],
      },
    });
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  it('renders /transactions rows for live mixed Base58 + kana authority ids', async () => {
    const { wrapper } = await mountAppAt('/transactions');
    mountedWrappers.push(wrapper);
    await flushPromises();

    expect(fetchTransactionsMock).toHaveBeenCalled();
    const fetchArgs = fetchTransactionsMock.mock.calls.at(-1)?.[0];
    expect(fetchArgs?.page).toBe(1);
    expect(fetchArgs?.per_page).toBe(10);

    const row = wrapper.find('[data-test="base-table-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain(liveStyleAuthority);
    expect(row.text()).toContain('37');
    expect(row.text()).toContain('Instructions');
  }, 20000);
});
