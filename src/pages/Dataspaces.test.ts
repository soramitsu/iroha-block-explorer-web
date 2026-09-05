import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Dataspaces from './Dataspaces.vue';
import { i18n } from '@/shared/lib/localization';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

vi.mock('@/shared/api', () => ({
  fetchNexusDataspacesAccountSummary: vi.fn(),
}));

import * as api from '@/shared/api';

const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const MISSING_ACCOUNT_ID = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const summaryPayload = {
  account: SAMPLE_ACCOUNT_ID,
  account_id: SAMPLE_ACCOUNT_ID,
  uaid: 'uaid:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  totals: {
    dataspaces: 2,
    accounts_bound: 3,
    portfolio_accounts: 2,
    portfolio_positions: 5,
    manifests_total: 2,
    manifests_active: 1,
    consensus_entries: 3,
    consensus_tx_count: 9,
    consensus_chunks_total: 18,
    consensus_rbc_bytes_total: 1800,
    consensus_teu_total: 900,
  },
  dataspaces: [
    {
      dataspace_id: 10,
      dataspace_alias: 'sbp',
      accounts: [SAMPLE_ACCOUNT_ID],
      portfolio: { accounts: 1, positions: 2, asset_definitions: 1 },
      manifest: {
        present: true,
        status: 'Active',
        active: true,
        issued_ms: 1700000000000,
        activation_epoch: 100,
        expiry_epoch: null,
        activated_epoch: 101,
        expired_epoch: null,
        revoked_epoch: null,
        revoked_reason: null,
        entries: 1,
      },
      consensus: {
        entries: 2,
        lane_ids: [0, 3],
        tx_count: 7,
        total_chunks: 14,
        rbc_bytes_total: 1400,
        teu_total: 700,
        last_block_height: 123,
        last_block_hash: '0xabc',
        details: [],
      },
    },
    {
      dataspace_id: 12,
      dataspace_alias: null,
      accounts: [SAMPLE_ACCOUNT_ID, 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV'],
      portfolio: { accounts: 2, positions: 3, asset_definitions: 2 },
      manifest: {
        present: false,
        status: 'Missing',
        active: false,
        issued_ms: null,
        activation_epoch: null,
        expiry_epoch: null,
        activated_epoch: null,
        expired_epoch: null,
        revoked_epoch: null,
        revoked_reason: null,
        entries: 0,
      },
      consensus: {
        entries: 1,
        lane_ids: [],
        tx_count: 2,
        total_chunks: 4,
        rbc_bytes_total: 400,
        teu_total: 200,
        last_block_height: null,
        last_block_hash: null,
        details: [],
      },
    },
  ],
};

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};

const BaseButtonStub = {
  props: ['disabled', 'nativeType', 'to'],
  template:
    '<button :disabled="disabled" :type="nativeType || \'button\'" :data-route="to ? JSON.stringify(to) : undefined"><slot /></button>',
};

const BaseTableStub = {
  props: ['items', 'rowKey'],
  emits: ['click:row'],
  template:
    '<div><slot name="header" /><button v-for="item in items" :key="rowKey(item)" :data-test="\'row-\' + rowKey(item)" @click="$emit(\'click:row\', item)"><slot name="row" :item="item" /></button></div>',
};

const DataFieldStub = {
  props: ['title', 'value'],
  template: '<div class="data-field"><span>{{ title }}</span><span>{{ value }}</span></div>',
};

describe('Dataspaces account-summary page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const factory = () =>
    mount(Dataspaces, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseButton: BaseButtonStub,
          BaseContentBlock: BaseContentBlockStub,
          BaseLoading: { template: '<div>loading...</div>' },
          BaseTable: BaseTableStub,
          DataField: DataFieldStub,
        },
      },
    });

  async function submitLookup(wrapper: ReturnType<typeof factory>, literal = SAMPLE_ACCOUNT_ID) {
    await wrapper.get('input').setValue(literal);
    await wrapper.get('[data-test="dataspaces-lookup"]').trigger('submit');
    await flushPromises();
  }

  it('does not query diagnostic or account data before an explicit lookup', () => {
    factory();
    expect(api.fetchNexusDataspacesAccountSummary).not.toHaveBeenCalled();
  });

  it('requires a canonical i105 account ID without issuing a request', async () => {
    const wrapper = factory();
    await wrapper.get('[data-test="dataspaces-lookup"]').trigger('submit');

    expect(api.fetchNexusDataspacesAccountSummary).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="dataspaces-error"]').text()).toContain(i18n.global.t('dataspaces.accountRequired'));
  });

  it('rejects account aliases before issuing a request', async () => {
    const wrapper = factory();
    await submitLookup(wrapper, 'treasury@banking.retail');

    expect(api.fetchNexusDataspacesAccountSummary).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="dataspaces-error"]').text()).toContain(i18n.global.t('dataspaces.accountInvalid'));
  });

  it('renders the authoritative account summary and selects its first dataspace', async () => {
    vi.mocked(api.fetchNexusDataspacesAccountSummary).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: summaryPayload,
    } as never);

    const wrapper = factory();
    await submitLookup(wrapper);

    expect(api.fetchNexusDataspacesAccountSummary).toHaveBeenCalledWith(SAMPLE_ACCOUNT_ID);
    expect(wrapper.get('[data-test="dataspaces-identity"]').text()).toContain('uaid:0123456789abcdef');
    expect(wrapper.get('[data-test="dataspaces-stats"]').text()).toContain('1/2');
    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(7);
    expect(wrapper.get('[data-test="row-10"]').text()).toContain('sbp (#10)');
    expect(wrapper.get('[data-test="row-10"]').text()).toContain('0, 3');
    expect(wrapper.get('[data-test="dataspaces-selected"]').text()).toContain('sbp (#10)');
    expect(wrapper.findAll('[data-test="dataspaces-lane-links"] button')).toHaveLength(2);
  });

  it('switches selected detail and represents missing manifest and commit data exactly', async () => {
    vi.mocked(api.fetchNexusDataspacesAccountSummary).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: summaryPayload,
    } as never);

    const wrapper = factory();
    await submitLookup(wrapper);
    await wrapper.get('[data-test="row-12"]').trigger('click');

    const selected = wrapper.get('[data-test="dataspaces-selected"]');
    expect(selected.text()).toContain('#12');
    expect(selected.text()).toContain('Missing');
    expect(selected.text()).toContain('None');
    expect(wrapper.find('[data-test="dataspaces-lane-links"]').exists()).toBe(false);
  });

  it.each([
    [NOT_FOUND, 'Account not found'],
    [UNKNOWN_ERROR, 'Unable to load dataspace summary'],
  ])('maps %s responses without retaining stale summary data', async (status, message) => {
    vi.mocked(api.fetchNexusDataspacesAccountSummary)
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: summaryPayload } as never)
      .mockResolvedValueOnce({ status } as never);

    const wrapper = factory();
    await submitLookup(wrapper);
    await submitLookup(wrapper, MISSING_ACCOUNT_ID);

    expect(wrapper.get('[data-test="dataspaces-error"]').text()).toContain(message);
    expect(wrapper.find('[data-test="dataspaces-stats"]').exists()).toBe(false);
  });

  it('disables lookup while the request is in flight', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.mocked(api.fetchNexusDataspacesAccountSummary).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }) as never
    );

    const wrapper = factory();
    await wrapper.get('input').setValue(SAMPLE_ACCOUNT_ID);
    await wrapper.get('[data-test="dataspaces-lookup"]').trigger('submit');
    await nextTick();

    expect(wrapper.get('[data-test="dataspaces-submit"]').attributes('disabled')).toBeDefined();

    resolveRequest({ status: SUCCESSFUL_FETCHING, data: summaryPayload });
    await flushPromises();
    expect(wrapper.get('[data-test="dataspaces-submit"]').attributes('disabled')).toBeUndefined();
  });
});
