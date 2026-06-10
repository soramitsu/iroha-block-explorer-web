import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref, defineComponent, h, watchEffect } from 'vue';
import TransactionDetails from './TransactionDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';

const SAMPLE_I105 = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

const mockRoute = ref({
  params: { hash: '0xtest-hash' },
  query: {},
});

const replaceSpy = vi.fn().mockResolvedValue(undefined);
const instructionsListState = ref({
  isLoading: false,
  totalItems: 1,
  itemsCount: 1,
});
const scopeExpose = ref({
  isLoading: false,
  data: {
    status: SUCCESSFUL_FETCHING,
    data: {
      authority: SAMPLE_I105,
      hash: '0xtest-hash',
      block: 42,
      created_at: new Date('2026-02-24T12:00:00Z'),
      executable: 'Instructions',
      status: 'Rejected',
      rejection_reason: {
        encoded: '',
        json: '',
        message: '',
      },
      metadata: {},
      nonce: null,
      signature: 'deadbeef',
      time_to_live: { ms: 1000 },
    },
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
    relatedInstructions: { type: Array, default: () => [] },
  },
  template:
    '<div class="contract-code-view-stub" :data-transaction-hash="instruction?.transaction_hash ?? \'\'" :data-instruction-index="instruction?.index ?? -1" :data-related-count="relatedInstructions.length" />',
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
  template: '<button class="base-button-stub" :data-to="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></button>',
});

const DataFieldStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, required: true },
    value: { type: [String, Number, Object], default: null },
    hash: { type: String, default: '' },
  },
  template: '<div class="data-field-stub"><span>{{ title }}</span><span>{{ value }}</span><span>{{ hash }}</span></div>',
});

describe('TransactionDetails', () => {
  beforeEach(() => {
    replaceSpy.mockClear();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 64,
          total_pages: 1,
          total_items: 1,
        },
        items: [
          {
            authority: SAMPLE_I105,
            created_at: new Date('2026-02-24T12:00:00Z'),
            kind: 'RegisterSmartContractBytes',
            box: {
              encoded: '0xcontract',
              json: {
                kind: 'RegisterSmartContractBytes',
                payload: {
                  code_hash: 'aa'.repeat(32),
                },
              },
            },
            transaction_hash: '0xtest-hash',
            transaction_status: 'Rejected',
            block: 42,
            index: 0,
          },
        ],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'not_found',
    });
    instructionsListState.value = {
      isLoading: false,
      totalItems: 1,
      itemsCount: 1,
    };
    mockRoute.value = {
      params: { hash: '0xtest-hash' },
      query: {},
    };
    scopeExpose.value = {
      isLoading: false,
      data: {
        status: SUCCESSFUL_FETCHING,
        data: {
          authority: SAMPLE_I105,
          hash: '0xtest-hash',
          block: 42,
          created_at: new Date('2026-02-24T12:00:00Z'),
          executable: 'Instructions',
          status: 'Rejected',
          rejection_reason: {
            encoded: '',
            json: '',
            message: '',
          },
          metadata: {},
          nonce: null,
          signature: 'deadbeef',
          time_to_live: { ms: 1000 },
        },
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
          ContextTooltip: ContextTooltipStub,
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
      json: 'ignored',
      message: 'Validation failed: Instruction execution failed: Failed to find domain: sbp',
    };

    const wrapper = factory();
    await flushPromises();

    expect(findRejectedReasonValue(wrapper)).toBe(
      'Validation failed: Instruction execution failed: Failed to find domain: sbp'
    );
  });

  it('falls back to local decoder when torii message is missing', async () => {
    scopeExpose.value.data.data.rejection_reason = {
      encoded:
        '0x020000004b00000000000000020000003f000000000000000400000033000000000000000400000000000000030000001f000000000000000000000013000000000000000b000000000000000300000000000000736270',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBXAAAAAAAAANkeGTU4zDb4AAIAAABLAAAAAAAAAAIAAAA/AAAAAAAAAAQAAAAzAAAAAAAAAAQAAAAAAAAAAwAAAB8AAAAAAAAAAAAAABMAAAAAAAAACwAAAAAAAAADAAAAAAAAAHNicA==',
      message: '',
    };

    const wrapper = factory();
    await flushPromises();

    expect(findRejectedReasonValue(wrapper)).toBe(
      'Validation failed: Instruction failed: Repeated instruction for id: sbp'
    );
  });

  it('falls back to local decoder when torii message contains only opaque numeric tags', async () => {
    scopeExpose.value.data.data.rejection_reason = {
      encoded:
        '0x020000004b00000000000000020000003f000000000000000400000033000000000000000400000000000000030000001f000000000000000000000013000000000000000b000000000000000300000000000000736270',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBXAAAAAAAAANkeGTU4zDb4AAIAAABLAAAAAAAAAAIAAAA/AAAAAAAAAAQAAAAzAAAAAAAAAAQAAAAAAAAAAwAAAB8AAAAAAAAAAAAAABMAAAAAAAAACwAAAAAAAAADAAAAAAAAAHNicA==',
      message: 'Validation failed: Instruction failed: InstructionExecutionError(4).',
    };

    const wrapper = factory();
    await flushPromises();

    expect(findRejectedReasonValue(wrapper)).toBe(
      'Validation failed: Instruction failed: Repeated instruction for id: sbp'
    );
  });

  it('renders instructions table for instruction executables', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(true);
    expect(wrapper.find('.transaction-details__transactions-wasm').exists()).toBe(false);
  });

  it('treats Ivm executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'Ivm';

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
    expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true);
  });

  it('treats IvmProved executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'IvmProved';

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
    expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true);
  });

  it('treats ContractCall executables as smart-contract transactions', async () => {
    scopeExpose.value.data.data.executable = 'ContractCall';

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table-stub').exists()).toBe(false);
    expect(wrapper.find('.contract-code-view-stub').exists()).toBe(true);
  });

  it('passes the primary smart-contract instruction target into the contract panel', async () => {
    scopeExpose.value.data.data.executable = 'Wasm';

    const wrapper = factory();
    await flushPromises();

    const panel = wrapper.find('.contract-code-view-stub');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes('data-transaction-hash')).toBe('0xtest-hash');
    expect(panel.attributes('data-instruction-index')).toBe('0');
    expect(panel.attributes('data-related-count')).toBe('1');
  });

  it('loads every instruction-history page for smart-contract transactions before rendering the contract panel', async () => {
    scopeExpose.value.data.data.executable = 'Wasm';
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockImplementation(async ({ page = 1 }) => ({
      status: SUCCESSFUL_FETCHING,
      data: page === 1
        ? {
            pagination: {
              page: 1,
              per_page: 128,
              total_pages: 2,
              total_items: 2,
            },
            items: [
              {
                authority: SAMPLE_I105,
                created_at: new Date('2026-02-24T12:00:00Z'),
                kind: 'RegisterSmartContractBytes',
                box: {
                  encoded: '0xcontract',
                  json: {
                    kind: 'RegisterSmartContractBytes',
                    payload: {
                      code_hash: 'aa'.repeat(32),
                    },
                  },
                },
                transaction_hash: '0xtest-hash',
                transaction_status: 'Rejected',
                block: 42,
                index: 0,
              },
            ],
          }
        : {
            pagination: {
              page: 2,
              per_page: 128,
              total_pages: 2,
              total_items: 2,
            },
            items: [
              {
                authority: SAMPLE_I105,
                created_at: new Date('2026-02-24T12:00:01Z'),
                kind: 'RegisterSmartContractCode',
                box: {
                  encoded: '0xmanifest',
                  json: {
                    kind: 'RegisterSmartContractCode',
                    payload: {
                      manifest: {
                        code_hash: 'aa'.repeat(32),
                      },
                    },
                  },
                },
                transaction_hash: '0xtest-hash',
                transaction_status: 'Rejected',
                block: 42,
                index: 1,
              },
            ],
          },
    }));

    const wrapper = factory();
    await flushPromises();

    const panel = wrapper.find('.contract-code-view-stub');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes('data-related-count')).toBe('2');
    expect(api.fetchInstructions).toHaveBeenCalledWith({
      page: 1,
      per_page: 128,
      transaction_hash: '0xtest-hash',
    });
    expect(api.fetchInstructions).toHaveBeenCalledWith({
      page: 2,
      per_page: 128,
      transaction_hash: '0xtest-hash',
    });
  });

  it('shows transaction overview context when instruction list is empty', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';
    scopeExpose.value.data.data.rejection_reason = {
      encoded: '',
      json: '',
      message: 'Validation failed: instruction failed',
    };
    instructionsListState.value = {
      isLoading: false,
      totalItems: 0,
      itemsCount: 0,
    };

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="transaction-instructions-overview"]').exists()).toBe(true);
    const overview = wrapper.get('[data-test="transaction-instructions-overview"]');
    expect(overview.text()).toContain('No data');
    expect(overview.text()).toContain('Transaction Hash');
    expect(overview.text()).toContain('0xtest-hash');
    expect(overview.text()).toContain('Executable');
    expect(overview.text()).toContain('Instructions');
    expect(overview.text()).toContain('Block');
    expect(overview.text()).toContain('42');
    expect(overview.text()).toContain('Nonce');
    expect(overview.text()).toContain('Signature');
    expect(overview.text()).toContain('deadbeef');
    expect(overview.text()).toContain('Validation failed: instruction failed');
  });

  it('hides empty-instructions overview while instruction list is still loading', async () => {
    scopeExpose.value.data.data.executable = 'Instructions';
    instructionsListState.value = {
      isLoading: true,
      totalItems: 0,
      itemsCount: 0,
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
        seed_value: '0xtest-hash',
      },
    });
  });
});
