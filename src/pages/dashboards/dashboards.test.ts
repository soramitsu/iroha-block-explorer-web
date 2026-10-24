import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/shared/lib/localization';
import { routes } from '@/app/router';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const api = vi.hoisted(() => ({
  fetchBlockSamples: vi.fn(),
  fetchNodeStatus: vi.fn(),
  fetchTransactionSamples: vi.fn(),
  fetchDomains: vi.fn(),
  fetchAssetDefinitions: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('@/shared/api', () => ({
  ...api,
  buildExplorerUrl: (path: string) => `https://torii.example/v1/explorer${path}`,
  streamTelemetryMetrics: () => ({ data: ref(null), status: ref('CLOSED') }),
}));

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useElementSize: () => ({ width: ref(720), height: ref(240) }),
}));

const NOW = Date.UTC(2026, 9, 24, 8, 0, 0);
const stubRoutes = routes.map((route) => ('component' in route ? { ...route, component: { template: '<div />' } } : route));

function blocks(head: number) {
  return ({ limit = 64, cursor }: { limit?: number, cursor?: string | null }) => {
    const top = cursor ? Number(cursor) : head;
    const items = Array.from({ length: Math.min(limit, top) }, (_, index) => {
      const height = top - index;
      return {
        height,
        createdAtMs: NOW - (head - height) * 2000,
        transactionsTotal: height % 4,
        transactionsRejected: height % 7 === 0 ? 1 : 0,
      };
    }).map((sample) => ({ ...sample, transactionsRejected: Math.min(sample.transactionsRejected, sample.transactionsTotal) }));
    const bottom = top - items.length;
    return Promise.resolve({ status: SUCCESSFUL_FETCHING, data: { items, nextCursor: bottom > 0 ? String(bottom) : null } });
  };
}

interface SampleRow {
  height: number
  createdAtMs: number | null
  transactionsTotal: number
  transactionsRejected: number
}

function hideBody(sample: SampleRow): SampleRow {
  return { ...sample, createdAtMs: null, transactionsTotal: 0, transactionsRejected: 0 };
}

/** The same chain with every block body unavailable: no creation time, counts unknown. */
function unreadable(head: number) {
  const readable = blocks(head);
  return async (args: { limit?: number, cursor?: string | null }) => {
    const page = await readable(args);
    return { ...page, data: { ...page.data, items: page.data.items.map(hideBody) } };
  };
}

function statTile(wrapper: ReturnType<typeof mount>, label: string) {
  const tile = wrapper.findAll('.dash-stat').find((candidate) => candidate.find('.dash-stat__label').text() === label);
  if (!tile) throw new Error(`no stat tile labelled ${label}`);
  return { value: tile.find('.dash-stat__value').text(), hint: tile.find('.dash-stat__hint').exists() ? tile.find('.dash-stat__hint').text() : '' };
}

const STATUS = {
  build: { version: '2.0.0-rc.2.0' },
  observed_at_ms: NOW,
  peers: 3,
  blocks: 40,
  blocks_non_empty: 40,
  commit_time_ms: 3830,
  txs_approved: 120,
  txs_rejected: 4,
  txs_rejected_recent_5m: 1,
  uptime: { secs: 7200, nanos: 0 },
  view_changes: 2,
  queue_size: 0,
  queue_queued: 0,
  queue_inflight: 0,
  time_since_last_block_ms: 1500,
  sumeragi: { tx_queue_depth: 0, tx_queue_capacity: 20_000, tx_queue_saturated: false, tx_queue_oldest_queued_age_ms: 0 },
  teu_lane_commit: [{ lane_id: 0, capacity: 1000, committed: 250, block_height: 40 }],
  teu_dataspace_backlog: [],
  dataspace_catalog: [{ lane_id: 0, dataspace_id: '0', alias: 'universal', lane_alias: 'core' }],
};

async function mountPage(path: string, component: () => Promise<{ default: unknown }>) {
  const router = createRouter({ history: createMemoryHistory(), routes: stubRoutes as never });
  await router.push(path);
  await router.isReady();
  const { default: page } = await component();
  const wrapper = mount(page as never, { global: { plugins: [router, i18n] } });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

// Compile the pages once up front, so each test's time budget covers mounting rather than a cold import.
beforeAll(async () => {
  await Promise.all([import('./NetworkDashboard.vue'), import('./ActivityDashboard.vue'), import('./LedgerDashboard.vue')]);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.values(api).forEach((mock) => mock.mockReset());
  api.fetchBlockSamples.mockImplementation(blocks(40));
  api.fetchNodeStatus.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: STATUS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Network dashboard', () => {
  it('drives the instruments and charts from the block feed and peer status', async () => {
    const { wrapper } = await mountPage('/dashboards/network?window=100', () => import('./NetworkDashboard.vue'));

    expect(wrapper.find('.dash-odometer').attributes('aria-label')).toBe('Block height: 40');
    expect(wrapper.find('[data-test="chain-state"]').text()).toBe('Producing blocks');
    // Dials only for performance and capacity: commit latency and queue fill.
    const readouts = wrapper.findAll('.dash-dial__readout').map((readout) => readout.text());
    expect(readouts).toEqual(['3.8 s', '0/20K']);
    // Activity is a readout with a sparkline, not a gauge.
    const lastHour = wrapper.find('[data-test="last-hour"]');
    const expected = Array.from({ length: 40 }, (_, index) => (index + 1) % 4).reduce((sum, value) => sum + value, 0);
    expect(lastHour.find('.dash-stat__value').text()).toContain(String(expected));
    expect(lastHour.find('polyline').exists()).toBe(true);
    expect(wrapper.text()).toContain('Time between blocks');
    expect(wrapper.text()).toContain('Block fill');
    expect(wrapper.text()).toContain('core · Lane 0');
    expect(wrapper.text()).toContain('All 40 blocks since genesis');
    expect(wrapper.findAll('.column-chart')).toHaveLength(3);
    expect(wrapper.find('.time-series-chart').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('keeps the window choice in the URL', async () => {
    const { wrapper, router } = await mountPage('/dashboards/network', () => import('./NetworkDashboard.vue'));
    const keys = wrapper.findAll('.dash-segmented__key');
    await keys[2]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.window).toBe('500');
    await keys[1]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.window).toBeUndefined();
  });

  it('reports a failed history read with a retry and never invents rows', async () => {
    api.fetchBlockSamples.mockResolvedValue({ status: UNKNOWN_ERROR, error: new Error('Torii could not complete the request.') });
    const { wrapper } = await mountPage('/dashboards/network', () => import('./NetworkDashboard.vue'));
    expect(wrapper.find('[role="alert"]').text()).toContain('Block history could not be read.');
    expect(wrapper.find('.dash-odometer').attributes('aria-label')).toBe('Block height: 40');
    expect(wrapper.findAll('.column-chart__bar')).toHaveLength(0);

    api.fetchBlockSamples.mockImplementation(blocks(40));
    await wrapper.find('.network-dashboard__retry').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows unknown rather than zero when no block body in the window could be read', async () => {
    api.fetchBlockSamples.mockImplementation(unreadable(40));
    const { wrapper } = await mountPage('/dashboards/network?window=100', () => import('./NetworkDashboard.vue'));
    expect(statTile(wrapper, 'Last hour').value).toBe('—');
    expect(statTile(wrapper, 'Transactions').value).toBe('—');
    expect(statTile(wrapper, 'Unreadable blocks').value).toBe('40');
    expect(wrapper.findAll('.column-chart__unknown').length).toBeGreaterThan(0);
    expect(wrapper.findAll('.time-series-chart__line')).toHaveLength(0);
  });
});

describe('Activity dashboard', () => {
  it('summarises the block window and the transaction sample', async () => {
    api.fetchTransactionSamples.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [
          { authority: 'alice', block: 40, createdAtMs: NOW - 1500, executable: 'Instructions', status: 'Committed' },
          { authority: 'alice', block: 39, createdAtMs: NOW - 4000, executable: 'ContractCall', status: 'Rejected' },
          { authority: 'bob', block: 38, createdAtMs: NOW, executable: 'Unlisted', status: 'Committed' },
        ],
      },
    });
    const { wrapper } = await mountPage('/dashboards/activity', () => import('./ActivityDashboard.vue'));

    expect(wrapper.find('.heatmap-chart').exists()).toBe(true);
    const mix = wrapper.findAll('.share-bar__label').map((label) => label.text());
    expect(mix).toEqual(['Instructions', 'Contract call', 'Other', 'Committed', 'Rejected']);
    expect(wrapper.findAll('.ranked-bars__label').map((label) => label.text())).toEqual(['alice', 'bob']);
    expect(wrapper.text()).toContain('3 transactions');
    // Block 40 was created at NOW and block 39 two seconds earlier: waits of 1.5 s and 2 s;
    // block 38's transaction claims a creation time after its block and is left out.
    expect(wrapper.text()).toContain('Inclusion latency');
    expect(wrapper.text()).toContain('1 transactions report a creation time after their block');
    expect(wrapper.findAll('.dash-stat__value').map((value) => value.text())).toContain('1.8 s');
  });

  it('states unknown totals when no block body in the window could be read', async () => {
    api.fetchBlockSamples.mockImplementation(unreadable(40));
    api.fetchTransactionSamples.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: { nextCursor: null, items: [] } });
    const { wrapper } = await mountPage('/dashboards/activity', () => import('./ActivityDashboard.vue'));
    const transactions = statTile(wrapper, 'Transactions');
    expect(transactions.value).toBe('—');
    expect(transactions.hint).toContain('Counts unknown; totals exclude them');
  });

  it('re-reads the transaction sample when the block head advances', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    api.fetchTransactionSamples.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: { nextCursor: null, items: [] } });
    await mountPage('/dashboards/activity', () => import('./ActivityDashboard.vue'));
    expect(api.fetchTransactionSamples).toHaveBeenCalledTimes(1);

    // Without a stream the window polls the head; block 41 arrives.
    api.fetchBlockSamples.mockImplementation(blocks(41));
    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();
    expect(api.fetchTransactionSamples).toHaveBeenCalledTimes(2);
  });
});

describe('Ledger dashboard', () => {
  it('ranks domains and definitions and states how much it read', async () => {
    api.fetchDomains.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [
          { id: 'small.universal', accounts: 2, assets: 0, nfts: 0 },
          { id: 'big.universal', accounts: 9, assets: 1, nfts: 0 },
        ],
      },
    });
    api.fetchAssetDefinitions.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [
          { id: 'defA', assets: 4, mintable: 'Infinitely', owning_domain: 'wonderland', owning_dataspace: null },
          { id: 'defB', assets: 1, mintable: 'Limited(5)', owning_domain: null, owning_dataspace: '7' },
          // Neither home: a global definition, not a domain one.
          { id: 'defC', assets: 2, mintable: 'Infinitely', owning_domain: null, owning_dataspace: null },
        ],
      },
    });
    api.fetchAccounts.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { nextCursor: null, items: [{ owned_assets: 0 }, { owned_assets: 1 }, { owned_assets: 4 }] },
    });
    const { wrapper } = await mountPage('/dashboards/ledger', () => import('./LedgerDashboard.vue'));

    expect(wrapper.findAll('.ranked-bars__label').map((label) => label.text())).toEqual([
      'big.universal',
      'small.universal',
      'defA',
      'defC',
      'defB',
    ]);
    expect(wrapper.text()).toContain('Read 2 domains');
    expect(wrapper.text()).toContain('Read 3 accounts');
    expect(wrapper.findAll('.share-bar__label').map((label) => label.text())).toEqual([
      'Mintable',
      'Limited',
      'Domain',
      'Data space',
      'Global',
    ]);
    expect(wrapper.text()).toContain('Asset definitions by balances');
    // Without a telemetry stream the totals say so instead of looking live.
    expect(wrapper.find('[data-test="telemetry-state"]').text()).toBe('The telemetry stream is unavailable');
  });
});
