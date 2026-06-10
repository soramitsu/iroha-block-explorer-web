import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import InstructionsTable from './InstructionsTable.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, NOT_FOUND } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import type * as VueUse from '@vueuse/core';
import { defineComponent, ref } from 'vue';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

const clipboardCopySpy = vi.fn();
const eventSourceData = ref<string | null>(null);
const windowScrollY = ref(0);

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    rowKey: { type: Function, required: false, default: undefined },
  },
  emits: ['update:page', 'update:pageSize', 'click:row'],
  template: `
    <div data-test="base-table">
      <slot name="header" />
      <div data-test="rows">
        <slot name="row" v-for="item in items" :item="item" />
      </div>
      <div data-test="mobile-cards">
        <slot name="mobile-card" v-for="item in items" :item="item" />
      </div>
    </div>
  `,
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

const BaseJsonStub = defineComponent({
  name: 'BaseJson',
  props: {
    full: { type: Boolean, default: false },
    value: { type: Object, default: () => ({}) },
  },
  template: '<div class="base-json-stub" :data-full="full ? \'true\' : \'false\'" />',
});

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUse>('@vueuse/core');
  return {
    ...actual,
    useClipboard: () => ({
      isSupported: true,
      copy: clipboardCopySpy,
    }),
    useEventSource: () => ({
      data: eventSourceData,
      status: ref('CLOSED'),
    }),
    useThrottleFn: (fn: any) => fn,
    useWindowScroll: () => ({ x: ref(0), y: windowScrollY }),
  };
});

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchInstructions: vi.fn(),
    fetchInstructionDetail: vi.fn(),
  };
});

describe('InstructionsTable', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];
  const baseInstruction = {
    authority: SAMPLE_I105,
    created_at: new Date('2024-01-01T00:00:00Z'),
    kind: 'Register',
    box: {
      encoded: '0x01',
      json: {
        kind: 'Register',
        payload: {
          object: {
            type: 'Domain',
            id: 'wonderland',
          },
          owner: SAMPLE_I105,
        },
      },
    },
    transaction_hash: '0xabc',
    transaction_status: 'Committed',
    block: 10,
    index: 0,
  } as const;

  const makeMultisigCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x99',
      json: {
        kind: 'Custom',
        payload: {
          Register: {
            account: SAMPLE_I105,
            spec: {
              signatories: {
                [SAMPLE_I105]: 1,
                [SAMPLE_I105_ALT]: 1,
              },
              quorum: 2,
              transaction_ttl_ms: 60000,
            },
          },
        },
      },
    },
  });

  const makeNonMultisigCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x88',
      json: {
        kind: 'Custom',
        payload: {
          extension: {
            note: 'hello',
          },
        },
      },
    },
  });

  const makeWireIdCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x77',
      json: {
        kind: 'Custom',
        wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
        payload: {
          variant: 'Unknown',
          value: {
            wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
            encoded: '0x77',
          },
        },
      },
    },
  });

  const makeVariantCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x66',
      json: {
        kind: 'Custom',
        payload: {
          variant: 'RegisterConsensusKey',
          value: {
            account: SAMPLE_I105,
          },
        },
      },
    },
  });

  const makeResolvedWireIdCustomInstruction = () => ({
    ...makeWireIdCustomInstruction(),
    kind: 'SubmitOfflineToOnlineTransfer',
  });

  beforeEach(() => {
    vi.resetAllMocks();
    clipboardCopySpy.mockReset();
    eventSourceData.value = null;
    windowScrollY.value = 0;
    // Ensure stream code-path is exercised.
    (window as any).EventSource = class EventSource {};
    window.history.replaceState(null, '', '/');

    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 1,
        },
        items: [baseInstruction],
      },
    });

    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...baseInstruction,
        box: {
          encoded: '0x01',
          json: {
            kind: 'Register',
            payload: {
              object: {
                type: 'Domain',
                id: 'wonderland',
              },
              owner: SAMPLE_I105,
              metadata: { label: 'Wonderland' },
            },
          },
        },
      },
    });
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  const factory = (props: Partial<InstanceType<typeof InstructionsTable>['$props']> = {}) =>
    (() => {
      const wrapper = mount(InstructionsTable, {
      props: {
        showValue: true,
        hashType: 'short',
        filterBy: { kind: 'transaction', value: '0xabc' },
        ...props,
      },
      global: {
        plugins: [i18n],
        stubs: {
          BaseTable: BaseTableStub,
          BaseJson: BaseJsonStub,
          ContractCodeViewPanel: ContractCodeViewPanelStub,
          RouterLink: {
            template: '<a><slot /></a>',
          },
          'router-link': {
            template: '<a><slot /></a>',
          },
        },
      },
      });
      mountedWrappers.push(wrapper);
      return wrapper;
    })();

  it('fetches and displays instruction details when action is clicked', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('.instructions-table__value-json').exists()).toBe(true);

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(api.fetchInstructionDetail).toHaveBeenCalledWith('0xabc', 0);
    expect(wrapper.find('.instructions-detail__body').exists()).toBe(true);
    expect(wrapper.text()).toContain('Instruction details');
    expect(wrapper.text()).toContain('Register');
    expect(wrapper.get('[data-test="instruction-detail-kind"]').text()).toContain('Register');
    const detailMeta = wrapper.get('.instructions-detail__meta');
    expect(detailMeta.text()).not.toContain('None');
    expect(detailMeta.text()).toContain('Committed');
    expect(detailMeta.text()).toContain('10');
    expect(detailMeta.text()).toContain('0');
    expect(detailMeta.text()).toContain('sora');
    expect(wrapper.find('.instructions-detail__close').exists()).toBe(true);
    expect(wrapper.find('.instructions-detail__close').text()).toBe('Hide details');
    expect(wrapper.find('.instructions-detail__encoded-box').exists()).toBe(true);
    expect(wrapper.find('.instructions-detail__json-tree').exists()).toBe(true);
    expect(wrapper.get('[data-test="instruction-encoded-payload"]').text()).toBe('0x01');
  });

  it('renders full metadata JSON inline in the instruction detail drawer', async () => {
    const wrapper = factory();
    await flushPromises();

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.instructions-table__value-json').attributes('data-full')).toBe('false');
    expect(wrapper.get('.instructions-detail__json-tree').attributes('data-full')).toBe('true');
  });

  it('renders the contract code panel for smart-contract instructions in the detail drawer', async () => {
    const contractInstruction = {
      ...baseInstruction,
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0x07',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: 'aa'.repeat(32),
          },
        },
      },
    };
    const manifestInstruction = {
      ...baseInstruction,
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0x08',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: {
              code_hash: 'aa'.repeat(32),
            },
          },
        },
      },
    };
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockImplementation(async ({ page = 1 }) => ({
      status: SUCCESSFUL_FETCHING,
      data: page === 1
        ? {
            pagination: {
              page: 1,
              per_page: 10,
              total_pages: 2,
              total_items: 2,
            },
            items: [contractInstruction],
          }
        : {
            pagination: {
              page: 2,
              per_page: 10,
              total_pages: 2,
              total_items: 2,
            },
            items: [manifestInstruction],
          },
    }));
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: contractInstruction,
    });

    const wrapper = factory();
    await flushPromises();

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    const panel = wrapper.find('.contract-code-view-stub');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes('data-transaction-hash')).toBe('0xabc');
    expect(panel.attributes('data-instruction-index')).toBe('0');
    expect(panel.attributes('data-related-count')).toBe('2');
  });

  it('shows Multisig kind label for multisig custom instructions in row and detail', async () => {
    const multisigInstruction = makeMultisigCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 1,
        },
        items: [multisigInstruction],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: multisigInstruction,
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('Multisig');

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-detail-kind"]').text()).toContain('Multisig');

    const kindField = wrapper
      .findAll('.data-field')
      .find((field) => field.find('.data-field__title').text() === 'Kind');
    expect(kindField?.find('.data-field__value-text').text()).toBe('Multisig');
  });

  it('keeps Custom kind label for non-multisig custom instructions', async () => {
    const customInstruction = makeNonMultisigCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 1,
        },
        items: [customInstruction],
      },
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('Custom');
  });

  it('shows concrete custom ISI label derived from payload wire_id', async () => {
    const wireIdInstruction = makeWireIdCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 1,
        },
        items: [wireIdInstruction],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: wireIdInstruction,
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('SubmitOfflineToOnlineTransfer');

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-detail-kind"]').text()).toContain('SubmitOfflineToOnlineTransfer');
  });

  it('shows concrete custom ISI label derived from payload variant', async () => {
    const variantInstruction = makeVariantCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 1,
        },
        items: [variantInstruction],
      },
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('RegisterConsensusKey');
  });

  it('auto-opens instruction when initialInstructionIndex is provided', async () => {
    const wrapper = factory({ initialInstructionIndex: 0 });
    await flushPromises();

    expect(api.fetchInstructionDetail).toHaveBeenCalledWith('0xabc', 0);
    expect(wrapper.find('.instructions-detail__body').exists()).toBe(true);
  });

  it('shows error when detail fetch fails and allows retry', async () => {
    const detailMock = api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>;
    detailMock.mockResolvedValueOnce({
      status: 'unknown-error',
      error: new Error('nope'),
    });

    const wrapper = factory();
    await flushPromises();
    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Unknown error occurred');

    detailMock.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...baseInstruction,
        box: {
          encoded: '0x01',
          json: {
            kind: 'Register',
            payload: {
              object: 'domain',
            },
          },
        },
      },
    });

    await wrapper.find('.instructions-detail__retry').trigger('click');
    await flushPromises();

    expect(detailMock).toHaveBeenLastCalledWith('0xabc', 0);
    expect(wrapper.find('.instructions-detail__body').exists()).toBe(true);
  });

  it('copies instruction share link when available', async () => {
    window.history.replaceState(null, '', '/transactions/0xabc');
    clipboardCopySpy.mockResolvedValueOnce(undefined);

    const wrapper = factory();
    await flushPromises();
    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    const shareButton = wrapper.find('.instructions-detail__share');
    expect(shareButton.exists()).toBe(true);
    await shareButton.trigger('click');
    expect(clipboardCopySpy).toHaveBeenLastCalledWith(expect.stringContaining('instruction=0'));
  });

  it('does not auto-refetch on stream updates when not on the first page', async () => {
    const fetchMock = api.fetchInstructions as unknown as ReturnType<typeof vi.fn>;

    const wrapper = factory({ filterBy: { kind: 'authority', value: SAMPLE_I105 } });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Move away from the latest page.
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:page', 2);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    eventSourceData.value = JSON.stringify({
      ...baseInstruction,
      authority: SAMPLE_I105,
      index: 1,
    });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Back on page 1, stream updates should refetch.
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:page', 1);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    eventSourceData.value = JSON.stringify({
      ...baseInstruction,
      authority: SAMPLE_I105,
      index: 2,
    });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('auto-refetches for Custom filter when stream kind is concrete ISI and box kind is Custom', async () => {
    const fetchMock = api.fetchInstructions as unknown as ReturnType<typeof vi.fn>;

    const wrapper = factory();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    wrapper.getComponent({ name: 'InstructionTypeFilter' }).vm.$emit('update:modelValue', 'Custom');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    eventSourceData.value = JSON.stringify({
      ...makeResolvedWireIdCustomInstruction(),
      authority: SAMPLE_I105,
      index: 11,
    });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not auto-refetch on stream updates when the user is scrolled down', async () => {
    const fetchMock = api.fetchInstructions as unknown as ReturnType<typeof vi.fn>;

    const wrapper = factory();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    windowScrollY.value = 200;
    eventSourceData.value = JSON.stringify({
      ...baseInstruction,
      index: 1,
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="pending-refresh"]').exists()).toBe(true);

    await wrapper.get('[data-test="pending-refresh-load"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to instruction detail endpoints when history query is temporarily empty', async () => {
    const fallbackInstruction = {
      ...baseInstruction,
      transaction_hash: '0xfallback',
      index: 0,
    };
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: {
          page: 1,
          per_page: 10,
          total_pages: 0,
          total_items: 0,
        },
        items: [],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_hash: string, index: number) => {
        if (index === 0) {
          return {
            status: SUCCESSFUL_FETCHING,
            data: fallbackInstruction,
          };
        }
        return { status: NOT_FOUND };
      }
    );

    const wrapper = factory({ filterBy: { kind: 'transaction', value: '0xfallback' } });
    await flushPromises();

    expect(api.fetchInstructionDetail).toHaveBeenCalledWith('0xfallback', 0);
    expect(wrapper.find('[data-test="instruction-kind-label"]').text()).toBe('Register');
  });
});
