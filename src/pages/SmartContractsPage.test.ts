import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SmartContractsPage from './SmartContractsPage.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const navigationPushSpy = vi.fn().mockResolvedValue(undefined);

const setupState = {
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
      items: [] as any[],
    },
  },
  refetch: vi.fn(),
};

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupState),
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    push: navigationPushSpy,
  }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><h1>{{ title }}</h1><slot /></div>',
};

const BaseTableStub = {
  props: ['items'],
  emits: ['click:row'],
  template: `
    <div>
      <slot name="header" />
      <button
        v-for="item in items"
        :key="item.transactionHash + ':' + item.index"
        class="row-button"
        type="button"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </button>
    </div>
  `,
};

const BaseHashStub = {
  props: ['hash', 'link'],
  template: '<span class="base-hash-stub" :data-link="link">{{ hash }}</span>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a class="base-link-stub" :data-to="to"><slot /></a>',
};

describe('SmartContractsPage', () => {
  const contractAddress = 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7';
  const accountId =
    'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

  beforeEach(() => {
    setupState.data.data.items = [];
    setupState.data.data.pagination.total_items = 0;
    navigationPushSpy.mockClear();
  });

  const factory = () =>
    mount(SmartContractsPage, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
        },
      },
    });

  it('renders deployed contract activation history from activation instructions', async () => {
    setupState.data.data.items = [
      {
        authority: accountId,
        created_at: new Date('2026-04-04T00:00:00Z'),
        kind: 'ActivateContractInstance',
        index: 3,
        transaction_hash: '0xdeploy',
        transaction_status: 'Committed',
        block: 101,
        box: {
          encoded: '0x01',
          json: {
            kind: 'ActivateContractInstance',
            payload: {
              contract_address: contractAddress,
              code_hash: 'aa'.repeat(32),
            },
          },
        },
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();

    const hashes = wrapper.findAll('.base-hash-stub');
    expect(hashes[0]?.text()).toBe(contractAddress);
    expect(hashes[1]?.text()).toBe('aa'.repeat(32));
    expect(hashes[2]?.text()).toBe(accountId);
    expect(hashes[2]?.attributes('data-link')).toBe(`/accounts/${encodeURIComponent(accountId)}`);
    expect(hashes[3]?.attributes('data-link')).toBe('/transactions/0xdeploy');
    expect(wrapper.find('.base-link-stub').attributes('data-to')).toBe('/blocks/101');
  });

  it('opens the transaction when a deployment row is clicked', async () => {
    setupState.data.data.items = [
      {
        authority: accountId,
        created_at: new Date('2026-04-04T00:00:00Z'),
        kind: 'ActivateContractInstance',
        index: 4,
        transaction_hash: '0xfeed',
        transaction_status: 'Committed',
        block: 102,
        box: {
          encoded: '0x02',
          json: {
            kind: 'ActivateContractInstance',
            payload: {
              contract_address: contractAddress,
              code_hash: 'bb'.repeat(32),
            },
          },
        },
      },
    ];
    setupState.data.data.pagination.total_items = 1;

    const wrapper = factory();
    await flushPromises();
    await wrapper.get('.row-button').trigger('click');

    expect(navigationPushSpy).toHaveBeenCalledWith('/transactions/0xfeed');
  });
});
