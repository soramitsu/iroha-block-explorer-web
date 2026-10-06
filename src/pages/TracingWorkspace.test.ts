import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import TracingWorkspace from './TracingWorkspace.vue';
import tairaHistory from '../../tests/fixtures/taira-history.json';

const HISTORY_CURSOR = tairaHistory.latestTransactions.next_cursor;

const ACCOUNT_ALICE =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const ACCOUNT_BOB =
  'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const ACCOUNT_CAROL = 'reserve@settlement.main';
const ACCOUNT_DAVE = 'maker@treasury.main';
const ACCOUNT_ALIAS = 'treasury@banking.retail';
const ASSET_ID = `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${ACCOUNT_ALICE}`;

const routeState = vi.hoisted((): { query: Record<string, unknown> } => ({ query: {} }));

const replaceSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const apiMocks = vi.hoisted(() => ({
  fetchAccount: vi.fn(),
  fetchBlocks: vi.fn(),
  fetchInstructions: vi.fn(),
  fetchTransaction: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'https://torii.example'),
}));

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({
    replace: replaceSpy,
  }),
}));

vi.mock('@/shared/api', () => ({
  fetchAccount: (...args: unknown[]) => apiMocks.fetchAccount(...args),
  fetchBlocks: (...args: unknown[]) => apiMocks.fetchBlocks(...args),
  fetchInstructions: (...args: unknown[]) => apiMocks.fetchInstructions(...args),
  fetchTransaction: (...args: unknown[]) => apiMocks.fetchTransaction(...args),
  getToriiBaseUrl: () => apiMocks.getToriiBaseUrl(),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => notifications,
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  template: '<section><slot name="header-action" /><slot /></section>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  props: {
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  template: '<button class="base-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
});

const BaseTabsStub = defineComponent({
  name: 'BaseTabs',
  template: '<div class="base-tabs-stub" />',
});

const BaseHashStub = defineComponent({
  name: 'BaseHash',
  props: {
    hash: { type: String, required: true },
  },
  template: '<span class="base-hash-stub" :data-hash="hash">{{ hash }}</span>',
});

const BaseLoadingStub = defineComponent({
  name: 'BaseLoading',
  template: '<div class="base-loading-stub" />',
});

const TraceGraphWebGLStub = defineComponent({
  name: 'TraceGraphWebGL',
  props: {
    viewportResetNonce: { type: Number, default: 0 },
  },
  emits: ['select-node', 'node-context', 'viewport-interaction'],
  template:
    '<div class="trace-graph-webgl-stub" :data-reset-nonce="viewportResetNonce">' +
    `<button data-test="trace-graph-select-alice" @click="$emit('select-node', '${ACCOUNT_ALICE}'); $emit('node-context', { nodeId: '${ACCOUNT_ALICE}', x: 140, y: 110, width: 400, height: 300 })" />` +
    `<button data-test="trace-graph-select-bob" @click="$emit('select-node', '${ACCOUNT_BOB}'); $emit('node-context', { nodeId: '${ACCOUNT_BOB}', x: 180, y: 120, width: 400, height: 300 })" />` +
    '</div>',
});

function buildInstruction(overrides?: Partial<Record<string, unknown>>) {
  return {
    authority: ACCOUNT_ALICE,
    created_at: new Date('2026-02-26T00:00:00Z'),
    kind: 'Transfer',
    index: 0,
    transaction_hash: '0xabc',
    transaction_status: 'Committed',
    block: 1,
    box: {
      encoded: '0x01',
      json: {
        kind: 'Transfer',
        payload: {
            variant: 'Asset',
            value: {
            object: ASSET_ID,
            source: ACCOUNT_ALICE,
            destination: ACCOUNT_BOB,
          },
        },
      },
    },
    ...overrides,
  };
}

function buildTransferInstruction(source: string, destination: string, overrides?: Partial<Record<string, unknown>>) {
  return buildInstruction({
    box: {
      encoded: '0x01',
      json: {
        kind: 'Transfer',
        payload: {
            variant: 'Asset',
            value: {
            object: ASSET_ID,
            source,
            destination,
          },
        },
      },
    },
    ...overrides,
  });
}

function buildCapacityError(retryAfterSeconds = 1) {
  return {
    status: UNKNOWN_ERROR,
    error: new Error(JSON.stringify({
      code: 'query_validation_failed',
      message: 'Query execution capacity limit',
      details: {
        retry_after_seconds: retryAfterSeconds,
      },
    })),
  };
}

async function settle() {
  await flushPromises();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await flushPromises();
}

function factory() {
  return mount(TracingWorkspace, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: BaseContentBlockStub,
        BaseButton: BaseButtonStub,
        BaseTabs: BaseTabsStub,
        BaseHash: BaseHashStub,
        BaseLoading: BaseLoadingStub,
        TraceGraphWebGL: TraceGraphWebGLStub,
      },
    },
  });
}

function historyPage(nextCursor: string | null) {
  return { nextCursor };
}

describe('TracingWorkspace', () => {
  beforeEach(() => {
    routeState.query = {};
    replaceSpy.mockClear();
    notifications.success.mockClear();
    notifications.error.mockClear();
    apiMocks.fetchAccount.mockReset();
    apiMocks.fetchTransaction.mockReset();
    apiMocks.fetchBlocks.mockReset();
    apiMocks.fetchInstructions.mockReset();
    apiMocks.fetchAccount.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { id: ACCOUNT_ALICE, i105_address: ACCOUNT_ALICE },
    });
    apiMocks.fetchBlocks.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [{ height: 1 }],
      },
    });
    apiMocks.fetchInstructions.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [],
        ...historyPage(null),
      },
    });
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  });

  it('bootstraps from account seed and scans transfer instructions with account filter', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALIAS,
    };

    factory();
    await settle();

    expect(apiMocks.fetchAccount).toHaveBeenCalledWith(ACCOUNT_ALIAS);
    expect(apiMocks.fetchBlocks).toHaveBeenCalled();
    expect(apiMocks.fetchInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        account: ACCOUNT_ALICE,
        kind: 'Transfer',
        cursor: null,
        limit: 100,
      })
    );
    expect((apiMocks.fetchInstructions.mock.calls[0]?.[0] as Record<string, unknown>)?.transaction_status).toBeUndefined();
  });

  it('retries a canonical transient-capacity response and preserves the successful scan', async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof factory> | undefined;

    try {
      routeState.query = {
        seed_type: 'account',
        seed_value: ACCOUNT_ALICE,
      };
      apiMocks.fetchInstructions
        .mockResolvedValueOnce(buildCapacityError())
        .mockResolvedValueOnce({
          status: SUCCESSFUL_FETCHING,
          data: {
            items: [buildInstruction({ transaction_hash: '0xafter-capacity' })],
            ...historyPage(null),
          },
        });

      wrapper = factory();
      await flushPromises();

      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(1);
      expect(wrapper.find('.tracing-page__error').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain('0xafter-capacity');
      expect(wrapper.get('.tracing-page__status').text()).toContain('Requests: 2');
      expect(wrapper.find('.tracing-page__error').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it('paces opaque history continuations instead of issuing a zero-delay request burst', async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof factory> | undefined;

    try {
      routeState.query = {
        seed_type: 'account',
        seed_value: ACCOUNT_ALICE,
      };
      apiMocks.fetchBlocks.mockResolvedValue({
        status: SUCCESSFUL_FETCHING,
        data: {
          items: [{ height: 2 }],
        },
      });

      apiMocks.fetchInstructions.mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: { items: [], ...historyPage(HISTORY_CURSOR) },
      });
      wrapper = factory();
      await flushPromises();

      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchInstructions).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: null, limit: 100 })
      );

      await vi.advanceTimersByTimeAsync(124);
      await flushPromises();
      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(2);
      expect(apiMocks.fetchInstructions).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: HISTORY_CURSOR, limit: 100 })
      );
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it('bounds capacity retries, surfaces exhaustion, and keeps the cursor resumable', async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof factory> | undefined;

    try {
      routeState.query = {
        seed_type: 'account',
        seed_value: ACCOUNT_ALICE,
      };
      apiMocks.fetchInstructions.mockResolvedValue(buildCapacityError());

      wrapper = factory();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(5_000);
      await flushPromises();

      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(4);
      expect(wrapper.get('.tracing-page__error').text()).toContain('Failed to fetch trace data');
      expect(wrapper.get('.tracing-page__status').text()).toContain('Active cursors: 1');

      apiMocks.fetchInstructions.mockResolvedValue({
        status: SUCCESSFUL_FETCHING,
        data: {
          items: [],
          ...historyPage(null),
        },
      });
      const resumeButton = wrapper
        .findAll('.base-button-stub')
        .find((button) => button.text().includes('Resume'));
      expect(resumeButton).toBeDefined();
      await resumeButton!.trigger('click');
      await flushPromises();

      expect(apiMocks.fetchInstructions).toHaveBeenCalledTimes(5);
      expect(wrapper.find('.tracing-page__error').exists()).toBe(false);
      expect(wrapper.get('.tracing-page__status').text()).toContain('Active cursors: 0');
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it('rejects a cursor cycle before ingesting or advancing the failed page', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let wrapper: ReturnType<typeof factory> | undefined;
    try {
      routeState.query = { seed_type: 'account', seed_value: ACCOUNT_ALICE };
      apiMocks.fetchInstructions
        .mockResolvedValueOnce({
          status: SUCCESSFUL_FETCHING,
          data: { items: [], ...historyPage(HISTORY_CURSOR) },
        })
        .mockResolvedValueOnce({
          status: SUCCESSFUL_FETCHING,
          data: {
            items: [buildInstruction({ transaction_hash: '0xfailed-page' })],
            ...historyPage(HISTORY_CURSOR),
          },
        });
      wrapper = factory();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(125);
      await flushPromises();
      expect(wrapper.get('.tracing-page__error').text()).toContain('Failed to fetch trace data');
      expect(wrapper.text()).not.toContain('0xfailed-page');
      expect(wrapper.get('.tracing-page__status').text()).toContain('Active cursors: 1');

      const resume = wrapper.findAll('.base-button-stub').find((button) => button.text().includes('Resume'));
      await resume!.trigger('click');
      await flushPromises();
      expect(apiMocks.fetchInstructions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: HISTORY_CURSOR }));
      expect(wrapper.find('.tracing-page__error').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      errorSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('follows opaque cursors when ingesting a transaction seed', async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof factory> | undefined;
    try {
      routeState.query = { seed_type: 'transaction', seed_value: '0xseed' };
      apiMocks.fetchTransaction.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: { authority: ACCOUNT_ALICE } });
      apiMocks.fetchInstructions.mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: { items: [], ...historyPage(HISTORY_CURSOR) },
      });
      wrapper = factory();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(125);
      await flushPromises();
      expect(apiMocks.fetchInstructions.mock.calls.slice(0, 2).map(([params]) => params)).toEqual([
        { cursor: null, limit: 100, transaction_hash: '0xseed', kind: 'Transfer' },
        { cursor: HISTORY_CURSOR, limit: 100, transaction_hash: '0xseed', kind: 'Transfer' },
      ]);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it('updates route query from seed draft form', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="trace-seed-type"]').setValue('transaction');
    await wrapper.get('[data-test="trace-seed-value"]').setValue('0xseedhash');

    const startButton = wrapper
      .findAll('.base-button-stub')
      .find((button) => button.text().includes('Start trace'));
    expect(startButton).toBeDefined();
    await startButton!.trigger('click');

    expect(replaceSpy).toHaveBeenCalledWith({
      name: 'tracing-workspace',
      query: {
        seed_type: 'transaction',
        seed_value: '0xseedhash',
      },
    });
  });

  it('increments graph viewport reset nonce when reset button is clicked', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALIAS,
    };

    const wrapper = factory();
    await settle();

    const graph = wrapper.get('.trace-graph-webgl-stub');
    expect(graph.attributes('data-reset-nonce')).toBe('0');

    await wrapper.get('[data-test="trace-reset-viewport"]').trigger('click');

    expect(graph.attributes('data-reset-nonce')).toBe('1');
  });

  it('imports trace bundle and hydrates graph state', async () => {
    const wrapper = factory();
    await settle();

    const bundle = {
      format: 'iroha-trace-bundle' as const,
      version: 1 as const,
      exported_at: '2026-02-26T00:00:00.000Z',
      torii_base_url: 'https://torii.example',
      seed: { type: 'account' as const, value: ACCOUNT_ALICE },
      filters: { committed_only: true, transfer_variants: 'all' as const },
      graph: {
        nodes: [
          {
            id: ACCOUNT_ALICE,
            depth: 0,
            inDegree: 0,
            outDegree: 1,
            eventCount: 1,
            firstSeenMs: 1,
            lastSeenMs: 1,
            minGapMs: null,
            risk: { score: 0, flags: [] },
            manualLabel: null,
          },
        ],
        edges: [],
        events: [],
      },
      cursors: [{ accountId: ACCOUNT_ALICE, depth: 0, nextCursor: null, visitedCursors: [], exhausted: true }],
      labels: {},
      csv: { nodes: 'id', edges: 'id', events: 'id' },
    };

    const input = wrapper.get('input[type="file"]');
    const fileLike = {
      text: vi.fn().mockResolvedValue(JSON.stringify(bundle)),
    };
    Object.defineProperty(input.element, 'files', {
      get: () => [fileLike],
      configurable: true,
    });
    await input.trigger('change');
    await settle();

    expect(replaceSpy).toHaveBeenCalledWith({
      name: 'tracing-workspace',
      query: {
        seed_type: 'account',
        seed_value: ACCOUNT_ALICE,
      },
    });
    expect((wrapper.get('[data-test="trace-seed-value"]').element as HTMLInputElement).value).toBe(ACCOUNT_ALICE);
  });

  it('extracts transfer events from fetched instructions into side panel', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };
    apiMocks.fetchInstructions.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [buildInstruction()],
        ...historyPage(null),
      },
    });

    const wrapper = factory();
    await settle();

    expect(wrapper.text()).toContain(ACCOUNT_BOB);
    expect(wrapper.text()).toContain('Asset');
    expect(wrapper.text()).toContain('0xabc');
  });

  it('renders transaction-state list with status/hash filters', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    apiMocks.fetchInstructions.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [
          buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_BOB, {
            transaction_hash: '0xcommitted',
            transaction_status: 'Committed',
          }),
          buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_CAROL, {
            transaction_hash: '0xrejected',
            transaction_status: 'Rejected',
          }),
        ],
        ...historyPage(null),
      },
    });

    const wrapper = factory();
    await settle();

    expect(wrapper.get('[data-test="trace-transaction-list"]').text()).toContain('0xcommitted');
    expect(wrapper.get('[data-test="trace-transaction-list"]').text()).toContain('0xrejected');

    await wrapper.get('[data-test="trace-status-filter"]').setValue('Rejected');
    await settle();

    expect(wrapper.get('[data-test="trace-transaction-list"]').text()).toContain('0xrejected');
    expect(wrapper.get('[data-test="trace-transaction-list"]').text()).not.toContain('0xcommitted');

    await wrapper.get('[data-test="trace-hash-filter"]').setValue('0xcommitted');
    await settle();

    expect(wrapper.text()).toContain('No transactions match current filter.');
  });

  it('groups rejected transactions by decoded reason with hash/account drill-down', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    apiMocks.fetchInstructions.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [
          buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_BOB, {
            transaction_hash: '0xrej1',
            transaction_status: 'Rejected',
            authority: ACCOUNT_ALICE,
          }),
          buildTransferInstruction(ACCOUNT_CAROL, ACCOUNT_DAVE, {
            transaction_hash: '0xrej2',
            transaction_status: 'Rejected',
            authority: ACCOUNT_CAROL,
          }),
        ],
        ...historyPage(null),
      },
    });
    apiMocks.fetchTransaction.mockImplementation(async (hash: string) => ({
      status: SUCCESSFUL_FETCHING,
      data: {
        hash,
        rejection_reason: {
          message: 'Permission denied',
          encoded: '',
          json: null,
        },
      },
    }));

    const wrapper = factory();
    await settle();

    const grouped = wrapper.get('[data-test="trace-rejection-groups"]');
    expect(grouped.text()).toContain('Permission denied');
    expect(grouped.text()).toContain('Transactions: 2');
    expect(grouped.text()).toContain('0xrej1');
    expect(grouped.text()).toContain('0xrej2');
    expect(grouped.text()).toContain(ACCOUNT_ALICE);
    expect(grouped.text()).toContain(ACCOUNT_CAROL);
    expect(apiMocks.fetchTransaction).toHaveBeenCalledWith('0xrej1');
    expect(apiMocks.fetchTransaction).toHaveBeenCalledWith('0xrej2');
  });

  it('does not render top entities sidebar box', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    const wrapper = factory();
    await settle();

    expect(wrapper.text()).not.toContain('Top entities');
  });

  it('shows incoming and outgoing flow links in graph node menu', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    apiMocks.fetchInstructions.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [
          buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_BOB),
          buildTransferInstruction(ACCOUNT_CAROL, ACCOUNT_ALICE),
        ],
        ...historyPage(null),
      },
    });

    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="trace-graph-select-alice"]').trigger('click');
    await settle();

    const inflow = wrapper.get('[data-test="trace-node-menu-inflows"]');
    const outflow = wrapper.get('[data-test="trace-node-menu-outflows"]');

    expect(inflow.text()).toContain(ACCOUNT_CAROL);
    expect(outflow.text()).toContain(ACCOUNT_BOB);
  });

  it('loads seed-account flows without recursively auto-expanding counterpart accounts', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    apiMocks.fetchInstructions.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        items: [buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_BOB)],
        ...historyPage(null),
      },
    });

    factory();
    await settle();

    const calls = apiMocks.fetchInstructions.mock.calls
      .map((call) => call[0])
      .filter((params) => params && typeof params === 'object' && 'account' in (params as Record<string, unknown>))
      .map((params) => (params as { account?: string }).account);

    const aliceCalls = calls.filter((account) => account === ACCOUNT_ALICE);
    const bobCalls = calls.filter((account) => account === ACCOUNT_BOB);
    expect(aliceCalls).toHaveLength(1);
    expect(bobCalls).toHaveLength(0);
  });

  it('opens graph node menu on click and expands/collapses from menu action', async () => {
    routeState.query = {
      seed_type: 'account',
      seed_value: ACCOUNT_ALICE,
    };

    apiMocks.fetchInstructions.mockImplementation((params: { account?: string }) => {
      if (params?.account === ACCOUNT_ALICE) {
        return Promise.resolve({
          status: SUCCESSFUL_FETCHING,
          data: {
            items: [buildTransferInstruction(ACCOUNT_ALICE, ACCOUNT_BOB)],
            ...historyPage(null),
          },
        });
      }
      if (params?.account === ACCOUNT_BOB) {
        return Promise.resolve({
          status: SUCCESSFUL_FETCHING,
          data: {
            items: [buildTransferInstruction(ACCOUNT_BOB, ACCOUNT_CAROL)],
            ...historyPage(null),
          },
        });
      }
      return Promise.resolve({
        status: SUCCESSFUL_FETCHING,
        data: {
          items: [],
          ...historyPage(null),
        },
      });
    });

    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="trace-graph-select-bob"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-test="trace-node-menu"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="trace-node-menu-expand"]').text()).toContain('Expand');

    await wrapper.get('[data-test="trace-node-menu-expand"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="trace-node-menu-expand"]').text()).toContain('Collapse');
    const callsAfterExpand = apiMocks.fetchInstructions.mock.calls
      .map((call) => call[0] as { account?: string })
      .filter((params) => params?.account === ACCOUNT_BOB);
    expect(callsAfterExpand).toHaveLength(1);

    await wrapper.get('[data-test="trace-node-menu-expand"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="trace-node-menu-expand"]').text()).toContain('Expand');
    const callsAfterCollapse = apiMocks.fetchInstructions.mock.calls
      .map((call) => call[0] as { account?: string })
      .filter((params) => params?.account === ACCOUNT_BOB);
    expect(callsAfterCollapse).toHaveLength(1);
  });
});
