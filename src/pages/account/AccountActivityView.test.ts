import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import AccountActivityView from './AccountActivityView.vue';

const apiMocks = vi.hoisted(() => ({
  fetchAccountHistory: vi.fn(),
}));

vi.mock('@/shared/api', () => ({
  fetchAccountHistory: apiMocks.fetchAccountHistory,
}));

const ACCOUNT = 'account:alice';
const COUNTERPARTY = 'account:bob';
const EXACT_AMOUNT = '90071992547409931234567890.000000000000000001';

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  props: { title: { type: String, default: '' } },
  template: '<section><h2>{{ title }}</h2><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    cursorPagination: { type: Object, default: null },
  },
  emits: ['update:cursor', 'update:pageSize'],
  template: `
    <div class="base-table-stub" role="table" :data-next-cursor="cursorPagination?.nextCursor">
      <div role="row">
        <slot name="header" />
      </div>
      <div v-for="item in items" :key="item.id" class="base-table-row" role="row">
        <slot name="row" :item="item" />
      </div>
    </div>
  `,
});

const BaseLinkStub = defineComponent({
  name: 'BaseLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
});

function historyResponse(items: Record<string, unknown>[]) {
  return {
    status: 'ok',
    data: {
      items,
      total: undefined,
      nextCursor: 'activity-next',
    },
  };
}

async function factory(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/account', component: { template: '<div />' } }],
  });
  await router.push({ path: '/account', query });
  await router.isReady();

  const wrapper = mount(AccountActivityView, {
    props: { accountId: ACCOUNT },
    global: {
      plugins: [router],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseLink: BaseLinkStub,
        BaseLoading: { template: '<span>spinner</span>' },
        BaseTable: BaseTableStub,
      },
    },
  });

  await flushPromises();
  return { router, wrapper };
}

describe('AccountActivityView', () => {
  beforeEach(() => {
    apiMocks.fetchAccountHistory.mockReset();
  });

  it('uses URL cursor/filter state and renders exact row values with semantic links', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(
      historyResponse([
        {
          id: 'history-1',
          source: 'asset_transfer',
          type: 'TRANSFER',
          timestamp_ms: 1_725_000_000_123,
          status: 'COMMITTED',
          result_ok: true,
          direction: 'OUTGOING',
          account_id: ACCOUNT,
          counterparty_account_id: COUNTERPARTY,
          asset_id: 'rose#wonderland#account:alice',
          asset_definition_id: 'rose#wonderland',
          amount: EXACT_AMOUNT,
          tx_hash: 'a'.repeat(64),
          operation_id: 'operation-7',
        },
      ])
    );

    const { router, wrapper } = await factory({
      activity_cursor: 'activity-current',
      activity_limit: '20',
      activity_asset: 'rose#wonderland',
    });

    expect(apiMocks.fetchAccountHistory).toHaveBeenCalledWith(ACCOUNT, {
      cursor: 'activity-current',
      limit: 20,
      asset_id: 'rose#wonderland',
    });
    expect(wrapper.get('h2').text()).toBe('Account activity');
    expect(wrapper.find('[data-test="activity-index-evidence"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/blocks/42"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="activity-fanout-provenance"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(EXACT_AMOUNT);
    expect(wrapper.text()).toContain('1725000000123 ms');
    expect(wrapper.find(`a[href="/accounts/${encodeURIComponent(COUNTERPARTY)}"]`).exists()).toBe(true);
    expect(wrapper.find('a[href="/assets/rose%23wonderland"]').exists()).toBe(true);
    expect(wrapper.find(`a[href="/transactions/${'a'.repeat(64)}"]`).exists()).toBe(true);
    expect(wrapper.get('.base-table-stub').attributes('data-next-cursor')).toBe('activity-next');
    expect(wrapper.getComponent(BaseTableStub).props('cursorPagination')?.total).toBeUndefined();
    expect(wrapper.findAll('[role="columnheader"]').map((header) => header.text())).toEqual([
      'Activity',
      'Source / direction',
      'Entities',
      'Value / status',
    ]);
    expect(wrapper.findAll('[role="cell"]')).toHaveLength(4);
    expect(wrapper.findAll('.account-activity__row[role="presentation"]')).toHaveLength(2);

    await wrapper.get('[data-test="activity-asset-filter"]').setValue('  tea#wonderland  ');
    await flushPromises();

    expect(router.currentRoute.value.query).toMatchObject({
      activity_asset: 'tea#wonderland',
      activity_limit: '20',
    });
    expect(router.currentRoute.value.query.activity_cursor).toBeUndefined();
  });

  it('keeps row source without inventing collection-wide index or fanout evidence', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(
      historyResponse([
        {
          id: 'history-source-1',
          source: 'asset_transfer',
          type: 'TRANSFER',
          status: 'COMMITTED',
          direction: 'INCOMING',
          account_id: ACCOUNT,
        },
      ])
    );

    const { wrapper } = await factory();

    expect(wrapper.text()).toContain('asset_transfer');
    expect(wrapper.text()).toContain('INCOMING');
    expect(wrapper.find('[data-test="activity-fanout-provenance"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="activity-index-evidence"]').exists()).toBe(false);
    expect(wrapper.find('a[href^="/blocks/"]').exists()).toBe(false);
  });

  it('requests the opaque continuation while preserving the asset filter', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(historyResponse([{ id: 'history-1', source: 'asset_transfer', type: 'TRANSFER' }]));
    const { wrapper } = await factory({ activity_asset: 'rose#wonderland' });

    wrapper.getComponent(BaseTableStub).vm.$emit('update:cursor', 'activity-next');
    await flushPromises();

    expect(apiMocks.fetchAccountHistory).toHaveBeenLastCalledWith(ACCOUNT, {
      cursor: 'activity-next', limit: 10, asset_id: 'rose#wonderland',
    });
  });

  it.each([
    [
      'permission-denied',
      { status: 'permission-denied', error: new Error('private dataspace') },
      '[data-test="activity-permission-denied"]',
      'Torii denied access',
    ],
    [
      'error',
      { status: 'unknown-error', error: new Error('bad payload') },
      '[data-test="activity-error"]',
      'bad payload',
    ],
  ])('renders the %s state without presenting it as an empty result', async (_name, result, selector, message) => {
    apiMocks.fetchAccountHistory.mockResolvedValue(result);

    const { wrapper } = await factory();

    expect(wrapper.get(selector).text()).toContain(message);
    expect(wrapper.find('[data-test="activity-empty"]').exists()).toBe(false);
  });

  it('renders an explicit empty state for a successful zero-row response', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(historyResponse([]));

    const { wrapper } = await factory();

    expect(wrapper.get('[data-test="activity-empty"]').text()).toContain('No account activity');
    expect(wrapper.get('[data-test="activity-visibility-notice"]').text()).toContain('private dataspaces');
  });
});
