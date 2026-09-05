import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref, defineComponent, h, watchEffect } from 'vue';
import TransactionDetails from './TransactionDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';

const SAMPLE_I105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const TRANSACTION_HASH = 'a'.repeat(64);
const SNAPSHOT_HASH = 'b'.repeat(64);
const FRAMED_SHA256 = `0x${'c'.repeat(64)}`;
const REJECTION_JSON = { Validation: 'TooComplex' } as const;

const mockRoute = ref({
  params: { hash: TRANSACTION_HASH },
  query: {},
});

const replaceSpy = vi.fn().mockResolvedValue(undefined);
function historyPagination(nextCursor: string | null = null, hasMore = false) {
  return {
    limit: 100,
    snapshot_height: 42,
    snapshot_hash: SNAPSHOT_HASH,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

function contractInstruction(kind: 'RegisterSmartContractBytes' | 'RegisterSmartContractCode', index: number) {
  const encoded = (index + 1).toString(16).padStart(2, '0');
  const wireId = `iroha.instruction.v1::smart_contract_code::${kind}`;
  return {
    authority: SAMPLE_I105,
    created_at: new Date(`2026-02-24T12:00:0${index}Z`),
    kind,
    box: {
      encoded: `0x${encoded}`,
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Custom',
        wire_id: wireId,
        encoded,
        payload: { variant: kind, value: { wire_id: wireId, encoded } },
      },
    },
    transaction_hash: TRANSACTION_HASH,
    transaction_status: 'Rejected',
    block: 42,
    index,
  };
}
const instructionsListState = ref({
  isLoading: false,
  itemsCount: 1,
  hasMore: false,
});
const scopeExpose = ref<any>({
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      authority: SAMPLE_I105,
      hash: TRANSACTION_HASH,
      block: 42,
      created_at: new Date('2026-02-24T12:00:00Z'),
      executable: 'Instructions',
      status: 'Rejected',
      rejection_reason: {
        encoded: '0x01',
        json: REJECTION_JSON,
        message: 'Rejected by Torii',
      },
      metadata: {},
      nonce: null,
      signature: 'deadbeef',
      time_to_live: { ms: 1000 },
    },
  },
  snapshot: {
    status: 'ready',
    data: {
      status: SUCCESSFUL_FETCHING,
      data: {
        authority: SAMPLE_I105,
        hash: TRANSACTION_HASH,
        block: 42,
        created_at: new Date('2026-02-24T12:00:00Z'),
        executable: 'Instructions',
        status: 'Rejected',
        rejection_reason: { encoded: '0x01', json: REJECTION_JSON, message: 'Rejected by Torii' },
        metadata: {},
        nonce: null,
        signature: 'deadbeef',
        time_to_live: { ms: 1000 },
      },
    },
    isRefreshing: false,
    refreshError: null,
  },
  refetch: vi.fn(),
});

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchInstructions: vi.fn(),
    fetchInstructionDetail: vi.fn(),
  };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: mockRoute,
    replace: replaceSpy,
  }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => ref({ expose: scopeExpose.value }),
}));

vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  template: '<div><slot name="header-action" /><slot /></div>',
});

const BaseLoadingStub = defineComponent({
  name: 'BaseLoading',
  template: '<div class="base-loading" />',
});

const TransactionStatusStub = defineComponent({
  name: 'TransactionStatus',
  template: '<div class="transaction-status-stub" />',
});

const InstructionsTableStub = defineComponent({
  name: 'InstructionsTable',
  emits: ['list-state'],
  setup(_, { emit }) {
    watchEffect(() => {
      emit('list-state', instructionsListState.value);
    });
    return () => h('div', { class: 'instructions-table-stub' });
  },
});

const ContractCodeViewPanelStub = defineComponent({
  name: 'ContractCodeViewPanel',
  props: {
    instruction: { type: Object, default: null },
  },
  template:
    '<div class="contract-code-view-stub" :data-transaction-hash="instruction?.transaction_hash ?? \'\'" :data-instruction-index="instruction?.index ?? -1" />',
});

const ContextTooltipStub = defineComponent({
  name: 'ContextTooltip',
  template: '<div class="context-tooltip-stub" />',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  props: {
    to: { type: [String, Object], default: null },
  },
  template:
    '<button class="base-button-stub" :data-to="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></button>',
});

const DataFieldStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, required: true },
    value: { type: [String, Number, Object], default: null },
    hash: { type: String, default: '' },
  },
  template:
    '<div class="data-field-stub"><span>{{ title }}</span><span>{{ value }}</span><span>{{ hash }}</span></div>',
});

describe('TransactionDetails', () => {
  beforeEach(() => {
    replaceSpy.mockClear();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: historyPagination(),
        items: [contractInstruction('RegisterSmartContractBytes', 0)],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'not_found',
    });
    instructionsListState.value = {
      isLoading: false,
      itemsCount: 1,
      hasMore: false,
    };
    mockRoute.value = {
      params: { hash: TRANSACTION_HASH },
      query: {},
    };
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          authority: SAMPLE_I105,
          hash: TRANSACTION_HASH,
          block: 42,
          created_at: new Date('2026-02-24T12:00:00Z'),
          executable: 'Instructions',
          status: 'Rejected',
          rejection_reason: {
            encoded: '0x01',
            json: REJECTION_JSON,
            message: 'Rejected by Torii',
          },
          metadata: {},
          nonce: null,
          signature: 'deadbeef',
          time_to_live: { ms: 1000 },
        },
      },
      snapshot: {
        status: 'ready',
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            authority: SAMPLE_I105,
            hash: TRANSACTION_HASH,
            block: 42,
            created_at: new Date('2026-02-24T12:00:00Z'),
            executable: 'Instructions',
            status: 'Rejected',
            rejection_reason: {
              encoded: '0x01',
              json: REJECTION_JSON,
              message: 'Rejected by Torii',
            },
            metadata: {},
            nonce: null,
            signature: 'deadbeef',
            time_to_live: { ms: 1000 },
          },
        },
        isRefreshing: false,
        refreshError: null,
      },
      refetch: vi.fn(),
    };
  });

  const factory = () =>
    mount(TransactionDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseLoading: BaseLoadingStub,
          ContractCodeViewPanel: ContractCodeViewPanelStub,
          DataField: DataFieldStub,
          TransactionStatus: TransactionStatusStub,
          InstructionsTable: InstructionsTableStub,
          TransactionActionPreview: { template: '<section data-test="action-preview" />' },
          ContextTooltip: ContextTooltipStub,
          TransactionEvidencePanel: { template: '<div class="transaction-evidence-stub" />' },
        },
      },
    });

  function findRejectedReasonValue(wrapper: ReturnType<typeof factory>): string | null {
    const fields = wrapper.findAllComponents(DataFieldStub);
    const rejected = fields.find((field) => field.props('title') === 'Rejected Reason');
    const value = rejected?.props('value');
    return typeof value === 'string' ? value : null;
  }

  it('prefers torii-provided rejection_reason.message when available', async () => {
    scopeExpose.value.data.data.rejection_reason = {
      encoded: '0x01',
      json: REJECTION_JSON,
      message: 'Validation failed: Instruction execution failed: Failed to find domain: sbp',
    };

    const wrapper = factory();
    await flushPromises();

    expect(findRejectedReasonValue(wrapper)).toBe(
      'Validation failed: Instruction execution failed: Failed to find domain: sbp'
    );
  });

  it('renders not-found and error snapshots explicitly with user-controlled retry', async () => {
    const retry = vi.fn();
    scopeExpose.value = {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch: retry,
    };
    const missing = factory();
    await flushPromises();
    expect(missing.text()).toContain('Transaction not found');
    expect(retry).not.toHaveBeenCalled();

    scopeExpose.value = {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'error', problem: { kind: 'network', message: 'offline' } },
      refetch: retry,
    };
    const failed = factory();
    await flushPromises();
    expect(failed.text()).toContain('Transaction could not be loaded');
    await failed.get('[data-test="resource-retry"]').trigger('click');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders Torii rejection text unchanged instead of reinterpreting its evidence bytes', async () => {
    scopeExpose.value.data.data.rejection_reason = {
      encoded:
        '0x020000004b00000000000000020000003f000000000000000400000033000000000000000400000000000000030000001f000000000000000000000013000000000000000b000000000000000300000000000000736270',
      json: 'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBXAAAAAAAAANkeGTU4zDb4AAIAAABLAAAAAAAAAAIAAAA/AAAAAAAAAAQAAAAzAAAAAAAAAAQAAAAAAAAAAwAAAB8AAAAAAAAAAAAAABMAAAAAAAAACwAAAAAAAAADAAAAAAAAAHNicA==',
      message: 'Validation failed: Instruction failed: InstructionExecutionError(4).',
    };

    const wrapper = factory();
    await flushPromises();

    expect(findRejectedReasonValue(wrapper)).toBe(
      'Validation failed: Instruction failed: InstructionExecutionError(4).'
    );
  });

  it('renders instructions table for instruction executables', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(true);
    expect(wrapper.find('.transaction-details__transactions-contract').exists()).toBe(false);
  });

  it('treats Ivm executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'Ivm';

    const wrapper = factory();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true));

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
  });

  it('treats IvmProved executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'IvmProved';

    const wrapper = factory();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true));

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
  });

  it('treats ContractCall executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'ContractCall';

    const wrapper = factory();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true));

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
  });

  it('passes the primary smart-contract instruction target into the contract panel', async () => {
    scopeExpose.value.data.data.executable = 'Ivm';

    const wrapper = factory();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true));

    const panel = wrapper.find('.contract-code-view-stub');
    expect(panel.attributes('data-transaction-hash')).toBe(TRANSACTION_HASH);
    expect(panel.attributes('data-instruction-index')).toBe('0');
  });

  it('loads every instruction-history cursor window for smart-contract transactions before rendering the contract panel', async () => {
    scopeExpose.value.data.data.executable = 'Ivm';
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockImplementation(async ({ cursor = null }) => ({
      status: SUCCESSFUL_FETCHING,
      data:
        cursor === null
          ? {
              pagination: historyPagination('smart-contract-next', true),
              items: [contractInstruction('RegisterSmartContractBytes', 0)],
            }
          : {
              pagination: historyPagination(),
              items: [contractInstruction('RegisterSmartContractCode', 1)],
            },
    }));

    const wrapper = factory();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true));

    expect(api.fetchInstructions).toHaveBeenCalledWith({
      cursor: null,
      limit: 100,
      transaction_hash: TRANSACTION_HASH,
    });
    expect(api.fetchInstructions).toHaveBeenCalledWith({
      cursor: 'smart-contract-next',
      limit: 100,
      transaction_hash: TRANSACTION_HASH,
    });
  });

  it('leads with outcome and keeps technical fields inside a collapsed native disclosure', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('[data-test="action-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="transaction-instructions-overview"]').exists()).toBe(false);
    const technical = wrapper.get('details[data-test="transaction-technical-details"]');
    expect(technical.attributes('open')).toBeUndefined();
    expect(technical.text()).toContain('Nonce');
    expect(technical.text()).toContain('Signature');
    expect(technical.text()).toContain('deadbeef');
    expect(technical.text()).toContain('1000');
  });

  it('hides empty-instructions overview while instruction list is still loading', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';
    instructionsListState.value = {
      isLoading: true,
      itemsCount: 0,
      hasMore: false,
    };

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="transaction-instructions-overview"]').exists()).toBe(false);
  });

  it('does not claim the instruction list is empty when Torii has another cursor window', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';
    instructionsListState.value = {
      isLoading: false,
      itemsCount: 0,
      hasMore: true,
    };

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="transaction-instructions-overview"]').exists()).toBe(false);
  });

  it('renders tracing launch action seeded by transaction hash', async () => {
    const wrapper = factory();
    await flushPromises();

    const button = wrapper.find('.base-button-stub');
    expect(button.exists()).toBe(true);
    const to = JSON.parse(button.attributes('data-to') ?? '{}');
    expect(to).toEqual({
      name: 'tracing-workspace',
      query: {
        seed_type: 'transaction',
        seed_value: TRANSACTION_HASH,
      },
    });
  });
});
