import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import BigNumber from 'bignumber.js';
import { i18n } from '@/shared/lib/localization';
import AccountDetails from './AccountDetails.vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const validAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const modernCanonicalAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const modernTestnetAccountId = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const fetchAccountQrMock = vi.hoisted(() => vi.fn());

config.global.stubs = {
  ...config.global.stubs,
  RouterLink: { template: '<a><slot /></a>' },
};

const mockRoute = ref({
  params: { id: validAccountId },
  query: {} as Record<string, string>,
});

const pushSpy = vi.fn().mockResolvedValue(undefined);
const scopeExpose = ref<any>({
  isLoading: false,
  data: { status: UNKNOWN_ERROR },
  refetch: vi.fn(),
});
let scopeExposeQueue: any[] = [];
let scopeExposeIndex = 0;

function exposeWithSnapshot(candidate: any) {
  if (candidate.snapshot) return candidate;
  if (candidate.data?.status === SUCCESSFUL_FETCHING) {
    return {
      ...candidate,
      snapshot: {
        status: 'ready',
        data: candidate.data,
        isRefreshing: false,
        refreshError: null,
      },
    };
  }
  if (candidate.data?.status === NOT_FOUND) return { ...candidate, snapshot: { status: 'not-found' } };
  return {
    ...candidate,
    snapshot: {
      status: 'error',
      problem: { kind: 'invalid-response', message: 'request failed' },
    },
  };
}

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: mockRoute,
    push: pushSpy,
  }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => {
    const expose = exposeWithSnapshot(scopeExposeQueue[scopeExposeIndex++] ?? scopeExpose.value);
    return ref({
      expose,
    });
  },
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => ref(null),
  useScopedExplorerNavigation: () => ({
    push: pushSpy,
  }),
}));

vi.mock('@/shared/api', () => ({
  fetchAccountQr: fetchAccountQrMock,
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
    cursor: { type: String, default: null },
    pageSize: { type: Number, default: 10 },
    cursorPagination: { type: Object, default: null },
  },
  emits: ['click:row', 'update:cursor', 'update:pageSize'],
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

const BaseLinkStub = defineComponent({
  name: 'BaseLink',
  props: {
    to: { type: [String, Object], required: true },
  },
  template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
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

describe('AccountDetails', () => {
  beforeEach(() => {
    pushSpy.mockClear();
    fetchAccountQrMock.mockReset();
    fetchAccountQrMock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        canonicalId: validAccountId,
        literal: validAccountId,
        networkPrefix: 753,
        errorCorrection: 'M',
        modules: 192,
        qrVersion: 8,
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
      },
    });
    scopeExposeQueue = [];
    scopeExposeIndex = 0;
    scopeExpose.value = {
      isLoading: false,
      data: { status: UNKNOWN_ERROR },
      refetch: vi.fn(),
    };
    mockRoute.value = {
      params: { id: validAccountId },
      query: {},
    };
  });

  it('routes to tracing workspace when tracing tab is selected', async () => {
    mockRoute.value.query = { tab: 'activity' };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          AccountActivityView: true,
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

  it('derives the account surface from the URL and writes tab changes back to query state', async () => {
    mockRoute.value.query = { tab: 'permissions' };
    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          AccountPermissionsView: { template: '<div data-test="permissions-view-stub" />' },
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });

    expect(wrapper.find('[data-test="account-permissions"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="account-overview"]').exists()).toBe(false);

    await wrapper.get('.tab-button-multisig').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({ query: { tab: 'multisig' } });
  });

  it('renders the canonical id field as the single account address without a duplicate field', async () => {
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
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
          BaseLink: BaseLinkStub,
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
    expect(wrapper.get('.account-details__address-copy').element.tagName).toBe('BUTTON');
    expect(wrapper.get('.account-details__address-copy').attributes('aria-label')).toBe('Copy I105 address');
  });

  it('renders account not-found explicitly without misleading owned-resource sections', async () => {
    scopeExpose.value = {
      isLoading: false,
      data: { status: NOT_FOUND },
      refetch: vi.fn(),
    };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Account not found');
    expect(wrapper.find('.base-table-stub').exists()).toBe(false);
  });

  it('labels owned assets with definition_id instead of the asset instance id', async () => {
    const definitionId = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
    const instanceId = `${definitionId}#${validAccountId}`;
    const emptyPage = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: { pagination: { limit: 10, next_cursor: null, has_more: false }, items: [] },
      },
      refetch: vi.fn(),
    };
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            id: validAccountId,
            network_prefix: 753,
            metadata: {},
            owned_domains: 0,
            owned_assets: 1,
            owned_nfts: 0,
          },
        },
        refetch: vi.fn(),
      },
      emptyPage,
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            pagination: { limit: 10, next_cursor: null, has_more: false },
            items: [{ id: instanceId, definition_id: definitionId, account_id: validAccountId, value: '7' }],
          },
        },
        refetch: vi.fn(),
      },
      emptyPage,
      emptyPage,
    ];

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });
    await flushPromises();

    const definitionLink = wrapper.get(`a[href="/assets/${definitionId}"]`);
    expect(definitionLink.text()).toBe(definitionId);
    expect(definitionLink.text()).not.toBe(instanceId);
  });

  it('keeps a terminal account error visible until retry is requested', async () => {
    const refetch = vi.fn();
    scopeExpose.value = {
      isLoading: false,
      data: { status: UNKNOWN_ERROR },
      refetch,
    };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();

    expect(refetch).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('Account could not be loaded');
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the qr caption only once while the qr image is still pending', () => {
    fetchAccountQrMock.mockImplementationOnce(() => new Promise(() => {}));

    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
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
          BaseLink: BaseLinkStub,
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

  it("requests and renders Torii's authoritative QR for the routed account selector", async () => {
    fetchAccountQrMock.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        canonicalId: modernTestnetAccountId,
        literal: modernTestnetAccountId,
        networkPrefix: 753,
        errorCorrection: 'M',
        modules: 192,
        qrVersion: 8,
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>',
      },
    });
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: modernCanonicalAccountId,
          network_prefix: 753,
          metadata: {},
          owned_domains: 0,
          owned_assets: 0,
          owned_nfts: 0,
        },
      },
      refetch: vi.fn(),
    };
    mockRoute.value = { params: { id: modernTestnetAccountId }, query: {} };

    const wrapper = mount(AccountDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTabs: BaseTabsStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
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
    expect(fetchAccountQrMock).toHaveBeenCalledWith(modernTestnetAccountId, expect.any(AbortSignal));
    expect(wrapper.get('.account-details__address-qr img').attributes('src')).toContain(
      'data:image/svg+xml;charset=utf-8,'
    );
  });

  it('fails closed when Torii cannot provide an authoritative QR', async () => {
    fetchAccountQrMock.mockResolvedValueOnce({ status: NOT_FOUND });
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          id: validAccountId,
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
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: true,
          TransactionsTable: true,
          InstructionsTable: true,
          CopyIcon: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('.account-details__address-qr img').exists()).toBe(false);
    expect(wrapper.text()).toContain(i18n.global.t('accounts.accountAddressQrError'));
  });

  it('renders account-owned RWAs behind a dedicated tab and routes to rwa details', async () => {
    const rwaId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities.main';
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            id: validAccountId,
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
            pagination: { limit: 10, next_cursor: null, has_more: false },
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
            pagination: { limit: 10, next_cursor: null, has_more: false },
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
            pagination: { limit: 10, next_cursor: null, has_more: false },
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
            pagination: { limit: 10, next_cursor: null, has_more: false },
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
          BaseLink: BaseLinkStub,
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

    expect(wrapper.get(`a[href="/rwas/${encodeURIComponent(rwaId)}"]`).text()).toContain(rwaId);
  });
});
