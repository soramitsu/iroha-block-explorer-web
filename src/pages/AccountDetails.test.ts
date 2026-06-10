import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import BigNumber from 'bignumber.js';
import { i18n } from '@/shared/lib/localization';
import QRCode from 'qrcode';
import AccountDetails from './AccountDetails.vue';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const validAccountId =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const modernCanonicalAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const modernTestnetAccountId = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const toriiBaseUrlState = vi.hoisted(() => ({ value: 'https://nexus.mof3.sora.org:18080' }));

const mockRoute = ref({
  params: { id: validAccountId },
});

const pushSpy = vi.fn().mockResolvedValue(undefined);
const scopeExpose = ref<any>({
  isLoading: false,
  data: { status: UNKNOWN_ERROR },
  refetch: vi.fn(),
});
let scopeExposeQueue: any[] = [];
let scopeExposeIndex = 0;

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: mockRoute,
    push: pushSpy,
  }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => {
    const expose = scopeExposeQueue[scopeExposeIndex++] ?? scopeExpose.value;
    return ref({
      expose,
    });
  },
}));

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => toriiBaseUrlState.value,
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
  },
}));

vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({
    isSupported: true,
    copy: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  template: '<div><slot name="header-action" /><slot /></div>',
});

const BaseTabsStub = defineComponent({
  name: 'BaseTabs',
  props: {
    items: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="base-tabs-stub">
      <button
        v-for="item in items"
        :key="item.value"
        :class="[item.value === 'tracing' ? 'trace-tab-button' : '', 'tab-button', 'tab-button-' + item.value]"
        @click="$emit('update:modelValue', item.value)"
      >
        {{ item.value }}
      </button>
    </div>
  `,
});

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
  },
  emits: ['click:row', 'update:page', 'update:page-size'],
  template: `
    <div class="base-table-stub">
      <slot name="header" />
      <div
        v-for="item in items"
        :key="item.id ?? item.hash ?? item.definition_id ?? item.owned_by"
        class="base-table-stub__row"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </div>
    </div>
  `,
});

const DataFieldProbeStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, default: '' },
    hash: { type: String, default: '' },
    type: { type: String, default: '' },
  },
  template: `
    <div
      class="data-field-probe"
      :data-title="title"
      :data-hash="hash"
      :data-type="type"
    />
  `,
});

const qrToDataUrlMock = vi.mocked(QRCode.toDataURL as unknown as (...args: any[]) => Promise<string>);

describe('AccountDetails', () => {
  beforeEach(() => {
    pushSpy.mockClear();
    qrToDataUrlMock.mockReset();
    qrToDataUrlMock.mockResolvedValue('data:image/png;base64,AAA');
    toriiBaseUrlState.value = 'https://nexus.mof3.sora.org:18080';
    scopeExposeQueue = [];
    scopeExposeIndex = 0;
    scopeExpose.value = {
      isLoading: false,
      data: { status: UNKNOWN_ERROR },
      refetch: vi.fn(),
    };
    mockRoute.value = {
      params: { id: validAccountId },
    };
  });

  it('routes to tracing workspace when tracing tab is selected', async () => {
    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();
    await wrapper.find('.trace-tab-button').trigger('click');
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'tracing-workspace',
      query: {
        seed_type: 'account',
        seed_value: validAccountId,
      },
    });
  });

  it('hides the standalone account id field when the same i105 address is already shown', async () => {
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
          i105_address: validAccountId,
          network_prefix: 753,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: DataFieldProbeStub,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();

    const accountField = wrapper.find(`.data-field-probe[data-title="${i18n.global.t('accounts.accountId')}"]`);
    expect(accountField.exists()).toBe(false);
    expect(wrapper.text()).toContain(validAccountId);
  });

  it('renders account id field in full mode when no i105 address block is available', async () => {
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: DataFieldProbeStub,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();

    const accountField = wrapper.find(`.data-field-probe[data-hash="${validAccountId}"]`);
    expect(accountField.exists()).toBe(true);
    expect(accountField.attributes('data-type')).toBe('full');
    expect(accountField.attributes('data-hash')).not.toContain('...');
  });

  it('shows the qr caption only once while the qr image is still pending', () => {
    qrToDataUrlMock.mockImplementationOnce(() => new Promise<string>(() => {}));

    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
          i105_address: validAccountId,
          network_prefix: 753,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    const caption = i18n.global.t('accounts.accountAddressQrCaption');
    const captionCount = wrapper.text().split(caption).length - 1;

    expect(captionCount).toBe(1);
  });

  it('does not surface compressed sora-only address as the primary account address', async () => {
    const compressedI105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
          i105_address: validAccountId,
          compressed_address: compressedI105,
          network_prefix: 753,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };
    mockRoute.value = { params: { id: validAccountId } };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain(validAccountId);
    expect(wrapper.text()).not.toContain(compressedI105);
    expect(wrapper.text()).not.toContain('Compressed Sora-only address');
  });

  it('renders the displayed testnet account literal in the address card and QR payload', async () => {
    toriiBaseUrlState.value = 'https://taira.sora.org';
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: modernCanonicalAccountId,
          i105_address: modernCanonicalAccountId,
          network_prefix: 753,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };
    mockRoute.value = { params: { id: modernTestnetAccountId } };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain(modernTestnetAccountId);
    expect(wrapper.text()).not.toContain(modernCanonicalAccountId);
    expect(qrToDataUrlMock).toHaveBeenCalledWith(
      modernTestnetAccountId,
      expect.objectContaining({
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
      })
    );
  });

  it('renders account-owned RWAs behind a dedicated tab and routes to rwa details', async () => {
    const rwaId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities';
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            id: validAccountId,
            i105_address: validAccountId,
            network_prefix: 753,
            metadata: {},
            owned_domains: 0,
            owned_assets: 0,
            owned_nfts: 0,
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            pagination: { page: 1, per_page: 10, total_pages: 0, total_items: 0 },
            items: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            pagination: { page: 1, per_page: 10, total_pages: 0, total_items: 0 },
            items: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            pagination: { page: 1, per_page: 10, total_pages: 0, total_items: 0 },
            items: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 1 },
            items: [
              {
                id: rwaId,
                owned_by: validAccountId,
                quantity: new BigNumber(42),
                held_quantity: new BigNumber(2),
                primary_reference: 'vault://receipts/2',
                status: 'active',
                is_frozen: false,
                metadata: {},
                parents: [],
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: true,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    await flushPromises();
    await wrapper.get('.tab-button-rwa').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain(rwaId);
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('2');

    await wrapper.get('.base-table-stub__row').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith(`/rwas/${encodeURIComponent(rwaId)}`);
  });
});
