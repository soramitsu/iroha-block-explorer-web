import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const fetchBlocksMock = vi.fn();
const connectStreamMock = vi.fn();

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchBlocks: fetchBlocksMock,
  };
});

vi.mock('@/shared/ui/composables/useBlockStream', () => ({
  useBlockStream: () => ({
    connectFrom: connectStreamMock,
    disconnect: vi.fn(),
    isStreaming: { value: false },
    isSupported: true,
  }),
}));

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
  props: {
    title: { type: String, required: false },
  },
  template: '<section data-test="content-block"><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTableStub',
  props: {
    items: { type: Array, default: () => [] },
  },
  emits: ['update:page', 'update:pageSize'],
  template: `
    <div data-test="base-table">
      <slot name="header" />
      <div data-test="base-table-rows">
        <slot name="row" v-for="item in items" :item="item" />
      </div>
      <div data-test="base-table-mobile">
        <slot name="mobile-card" v-for="item in items" :item="item" />
      </div>
    </div>
  `,
});

const BaseLinkStub = defineComponent({
  name: 'BaseLinkStub',
  props: {
    to: { type: [String, Object], required: false },
  },
  template: '<a data-test="base-link"><slot /></a>',
});

const BaseHashStub = defineComponent({
  name: 'BaseHashStub',
  props: {
    hash: { type: String, required: true },
  },
  template: '<span data-test="base-hash">{{ hash }}</span>',
});

const TimeStampStub = defineComponent({
  name: 'TimeStampStub',
  props: { value: { type: [String, Date], required: true } },
  template: '<time data-test="timestamp">{{ value }}</time>',
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
        BaseLink: BaseLinkStub,
        BaseHash: BaseHashStub,
        TimeStamp: TimeStampStub,
      },
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('Blocks data smoke', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  const mockBlocks = [
    {
      hash: '0xblock-1',
      height: 321,
      created_at: new Date('2024-02-02T00:00:00Z'),
      prev_block_hash: null,
      transactions_hash: '0xprev',
      transactions_rejected: 1,
      transactions_total: 7,
    },
  ];

  beforeEach(() => {
    fetchBlocksMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: mockBlocks.length },
        items: mockBlocks,
      },
    });
    connectStreamMock.mockReset();
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
    fetchBlocksMock.mockReset();
  });

  it('renders fetched blocks and wires the block stream from the last height', async () => {
    const { wrapper } = await mountAppAt('/blocks');
    mountedWrappers.push(wrapper);
    await flushPromises();

    const fetchArgs = fetchBlocksMock.mock.calls.at(-1)?.[0];
    expect(fetchArgs?.page).toBe(1);
    expect(fetchArgs?.per_page).toBe(10);

    const rowsText = wrapper.find('[data-test="base-table-rows"]').text();
    expect(rowsText).toContain(String(mockBlocks[0].height));
    expect(rowsText).toContain(mockBlocks[0].hash);

    expect(connectStreamMock).toHaveBeenCalledWith(mockBlocks[0].height + 1);
  }, 20000);
});
