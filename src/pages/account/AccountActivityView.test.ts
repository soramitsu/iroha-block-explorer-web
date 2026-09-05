import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import AccountActivityView from './AccountActivityView.vue';
import { i18n } from '@/shared/lib/localization';

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
    total: { type: Number, default: 0 },
  },
  emits: ['update:page', 'update:page-size'],
  template: `
    <div class="base-table-stub" role="table" :data-total="total">
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

function historyResponse(items: Record<string, unknown>[], total = items.length) {
  return {
    status: 'ok',
    data: {
      items,
      total,
      has_more: false,
      count_mode: 'exact',
      indexed_height: 42,
      indexed_block_hash: 'f'.repeat(64),
      query_source: 'account_history_index',
    },
  };
}

function fanoutHistoryResponse(items: Record<string, unknown>[]) {
  return {
    status: 'ok',
    data: {
      items,
      total: items.length,
      has_more: false,
      count_mode: 'exact',
      query_source: 'account_history_fanout',
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
      plugins: [router, i18n],
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

  it('uses URL pagination/filter state and renders exact indexed values with semantic links', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(
      historyResponse(
        [
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
        ],
        21
      )
    );

    const { router, wrapper } = await factory({
      activity_page: '2',
      activity_per_page: '20',
      activity_asset: 'rose#wonderland',
    });

    expect(apiMocks.fetchAccountHistory).toHaveBeenCalledWith(ACCOUNT, {
      page: 2,
      per_page: 20,
      asset_id: 'rose#wonderland',
    });
    expect(wrapper.get('h2').text()).toBe('Account activity');
    expect(wrapper.get('[data-test="activity-index-evidence"]').text()).toContain('account_history_index');
    expect(wrapper.find('a[href="/blocks/42"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="activity-fanout-provenance"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(EXACT_AMOUNT);
    expect(wrapper.text()).toContain(i18n.global.t('units.milliseconds', { value: 1_725_000_000_123 }));
    expect(wrapper.find(`a[href="/accounts/${encodeURIComponent(COUNTERPARTY)}"]`).exists()).toBe(true);
    expect(wrapper.find('a[href="/assets/rose%23wonderland"]').exists()).toBe(true);
    expect(wrapper.find(`a[href="/transactions/${'a'.repeat(64)}"]`).exists()).toBe(true);
    expect(wrapper.get('.base-table-stub').attributes('data-total')).toBe('21');
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
      activity_per_page: '20',
    });
    expect(router.currentRoute.value.query.activity_page).toBeUndefined();
  });

  it('renders multi-route fanout provenance without inventing index evidence', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(
      fanoutHistoryResponse([
        {
          id: 'history-fanout-1',
          source: 'asset_transfer',
          type: 'TRANSFER',
          status: 'COMMITTED',
          direction: 'INCOMING',
          account_id: ACCOUNT,
        },
      ])
    );

    const { wrapper } = await factory();

    const provenance = wrapper.get('[data-test="activity-fanout-provenance"]');
    expect(provenance.text()).toContain('account_history_fanout');
    expect(provenance.text()).toContain('multiple Nexus routes');
    expect(provenance.text()).toContain('no single index checkpoint');
    expect(wrapper.find('[data-test="activity-index-evidence"]').exists()).toBe(false);
    expect(wrapper.find('a[href^="/blocks/"]').exists()).toBe(false);
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
      'could not be loaded',
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

  it('rejects malformed URL pagination without calling Torii', async () => {
    const { wrapper } = await factory({ activity_page: '01', activity_per_page: '30' });

    expect(apiMocks.fetchAccountHistory).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="activity-invalid-pagination"]').text()).toContain('first 500 matching rows');
    expect(wrapper.text()).toContain('Reset pagination');
  });

  it('keeps the table recovery controls for an empty page beyond a nonzero total', async () => {
    apiMocks.fetchAccountHistory.mockResolvedValue(historyResponse([], 7));

    const { wrapper } = await factory({ activity_page: '2' });

    expect(wrapper.find('[data-test="activity-empty"]').exists()).toBe(false);
    expect(wrapper.get('.base-table-stub').attributes('data-total')).toBe('7');
  });
});
