import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type * as SharedApiModule from '@/shared/api';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { AssetDefinitionId } from '@iroha/core/data-model';
import BigNumber from 'bignumber.js';

const fetchAssetDefinitionMock = vi.fn();
const fetchAssetsMock = vi.fn();

function requestedAssetsCursor(cursor: string): boolean {
  return fetchAssetsMock.mock.calls.some(([params]) => params?.cursor === cursor);
}

function assetRequestForCursor(cursor: string) {
  return fetchAssetsMock.mock.calls.findLast(([params]) => params?.cursor === cursor)?.[0];
}

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchAssetDefinition: fetchAssetDefinitionMock,
    fetchAssets: fetchAssetsMock,
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
  template: `
    <section data-test="content-block">
      <div data-test="header-action"><slot name="header-action" /></div>
      <slot />
    </section>
  `,
});

const BaseTableStub = defineComponent({
  name: 'BaseTableStub',
  props: {
    items: { type: Array, default: () => [] },
    cursor: { type: String, default: null },
    pageSize: { type: Number, default: 10 },
    cursorPagination: { type: Object, default: null },
    paginationMode: { type: String, default: 'numbered' },
    loading: { type: Boolean, default: false },
    containerClass: { type: String, default: '' },
  },
  emits: ['update:cursor', 'update:pageSize', 'click:row'],
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
      <button
        v-if="cursorPagination?.nextCursor"
        data-test="cursor-next"
        @click="$emit('update:cursor', cursorPagination.nextCursor)"
      >Next</button>
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

const DataFieldStub = defineComponent({
  name: 'DataFieldStub',
  props: {
    title: { type: String, required: false },
    value: { type: [String, Object], required: false },
    hash: { type: String, required: false },
  },
  template: '<div data-test="data-field">{{ title }} {{ value }} {{ hash }}</div>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButtonStub',
  props: { to: { type: [String, Object], default: null } },
  template: '<button data-test="base-button"><slot /></button>',
});

vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

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
        DataField: DataFieldStub,
        BaseButton: BaseButtonStub,
      },
    },
  });

  router.push(path);
  await router.isReady();
  await flushPromises();

  return { wrapper, router };
}

describe('Assets data smoke', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  const definition = AssetDefinitionId.parse('PKR#sbp');
  const holderAccount = '34mSYmm1zH85ddQ3noMyFzsBr5gYjSAywdR2FUShctqGxeFfwDUVgTpiknnwCpQsFbjNqtfpn';

  beforeEach(() => {
    fetchAssetDefinitionMock.mockReset();
    fetchAssetsMock.mockReset();

    fetchAssetDefinitionMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        id: definition,
        mintable: 'Infinitely',
        logo: null,
        metadata: {},
        owned_by: holderAccount,
        assets: 15,
      },
    });

    fetchAssetsMock.mockImplementation((params) => Promise.resolve({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: params?.cursor ? null : 'aG9sZGVycy1jdXJzb3ItMg',
        items: [
          {
            id: `PKR#sbp#${holderAccount}`,
            definition_id: definition,
            account_id: holderAccount,
            value: new BigNumber('1080'),
          },
        ],
      },
    }));
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  it('renders holders from explorer assets payloads that use non-legacy AssetId encoding', async () => {
    const { wrapper } = await mountAppAt('/assets/PKR%23sbp');
    mountedWrappers.push(wrapper);
    await flushPromises();

    expect(fetchAssetDefinitionMock).toHaveBeenCalledTimes(1);
    expect(fetchAssetsMock).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchAssetsMock.mock.calls[0]?.[0];
    expect(fetchArgs?.cursor).toBeNull();
    expect(fetchArgs?.limit).toBe(10);
    expect(fetchArgs?.definition.toString()).toBe(definition.toString());
    expect(fetchArgs).not.toHaveProperty('page');
    expect(fetchArgs).not.toHaveProperty('per_page');

    const row = wrapper.find('[data-test="base-table-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain(holderAccount);
    expect(row.text()).toContain('1080');

    await wrapper.get('[data-test="cursor-next"]').trigger('click');
    await vi.waitFor(() => {
      expect(requestedAssetsCursor('aG9sZGVycy1jdXJzb3ItMg')).toBe(true);
    });
    const cursorCall = assetRequestForCursor('aG9sZGVycy1jdXJzb3ItMg');
    expect(cursorCall?.limit).toBe(10);
  }, 20000);
});
