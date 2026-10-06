import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import InstructionsTable from './InstructionsTable.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import type * as VueUse from '@vueuse/core';
import { defineComponent, ref } from 'vue';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const LIVE_MULTISIG_ACCOUNT = 'soraﾁｷVMXKﾏtKAoQﾅﾛ3qｾヱ8aﾄdNuｷﾀｱｽh9ｻtWﾐBﾒ9AﾏHｼQﾅvﾛﾌｹYﾑﾐﾛCﾎjtQQヰYCbﾎｵPfb6vXcﾖ1176ﾃﾈcﾐｲUEtﾎヱﾅｻﾀiuｦ2MPﾍﾏiﾌhﾓJｶｶgboCｻBpｷ35ｸ15ｼmGｲFK9NﾑoVﾜWvQMKﾃﾎB7ヰdM99EU4V';
const LIVE_TRANSFER_INSTRUCTION =
  'TlJUMAAAhip9dwddTSP/bBJh2wJ4EQDSAQAAAAAAABQKMDTp3Yu+Ag8OaXJvaGEudHJhbnNmZXLAA7gBAAAAAAAATlJUMAAApBdMeNY0H4+Y/Cra6O1nuQCQAQAAAAAAAOy4mMbcuTFWAgIAAACKA6oCggIBAAAA/AEBAQICAPUBAwAAAAAAAABOSiEAAAAAAAAAAQABhAExAb0BZQH/ASQBcwHNAacBpwEHAcEBgAH3AcEB5AH2AcQBzAGVASABPQFuAXoBJwFLAYUBswHtAW8BbAE1AgEATkohAAAAAAAAAAEAAbQBJgHPAXIBUQE3Af8B5gEzAbkB7gFJAXQBIAGoAYIB2gGYAW0BNgGxAfMBgQGPASEBkQFsAdUBtQH9AUoB/QIBAE5KIQAAAAAAAAABAAHHAeIB8QH8AZMBSQHvAZ8BkgG6AYEBeAFSAa4BbQGBAV0B2wGyAWABgQHUAWsBrQHiATMBSwERATwBHwF/AWUCAQAgAW4BFQFrAVABEAHmAUUB+AGDAesBgwEZAUYBuAGNAbgEAAAAAA0HAwAAAKCGAQQAAAAATwAAAABKIQAAAAAAAAABAAH9AVUB7wEWAZIB1QGPAYcBkwEvAVkBgAEhAbEB1gEWATkBRwGAAQgBIwHlAb4BuQF0AcoBiAEEAZoByAGaAfc=';
const FRAMED_SHA256 = `0x${'00'.repeat(32)}`;

const clipboardCopySpy = vi.fn();
const eventSourceData = ref<string | null>(null);
const windowScrollY = ref(0);

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    rowKey: { type: Function, required: false, default: undefined },
  },
  emits: ['update:cursor', 'update:pageSize', 'click:row'],
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

vi.mock('@/shared/runtime-config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/runtime-config')>(),
  getRuntimeNetworkPrefix: () => 369,
}));

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
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Register',
        payload: {
          variant: 'Domain',
          value: {
            object: {
              id: 'wonderland.universal',
              logo: null,
              metadata: {},
            },
          },
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
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Custom',
        payload: {
          variant: 'Custom',
          value: {
            Register: {
              account: SAMPLE_I105,
              home_domain: null,
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
    },
  });

  const makeNonMultisigCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x88',
      framed_sha256: FRAMED_SHA256,
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

  const makeNestedTransferMultisigInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x0d0c69726f68612e637573746f6d',
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Custom',
        payload: {
          variant: 'Custom',
          value: {
            Propose: {
              account: LIVE_MULTISIG_ACCOUNT,
              instructions: [LIVE_TRANSFER_INSTRUCTION],
              transaction_ttl_ms: null,
            },
          },
        },
        wire_id: 'iroha_data_model::isi::transparent::CustomInstruction',
      },
    },
  });

  const makeWireIdCustomInstruction = () => ({
    ...baseInstruction,
    kind: 'Custom',
    box: {
      encoded: '0x77',
      framed_sha256: FRAMED_SHA256,
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
      framed_sha256: FRAMED_SHA256,
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
        nextCursor: null,
        items: [baseInstruction],
      },
    });

    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...baseInstruction,
        box: {
          encoded: '0x01',
          framed_sha256: FRAMED_SHA256,
          json: {
            kind: 'Register',
            payload: {
              variant: 'Domain',
              value: {
                object: {
                  id: 'wonderland.universal',
                  logo: null,
                  metadata: { label: 'Wonderland' },
                },
              },
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

  it('does not pass a blank authority selector for a transaction-scoped list', async () => {
    factory();
    await flushPromises();

    expect(api.fetchInstructions).toHaveBeenCalledWith(
      expect.objectContaining({ transaction_hash: '0xabc' })
    );
    expect((api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toHaveProperty(
      'authority'
    );
  });

  it('exposes each dynamic instruction field as a cell and keeps the action button interactive', async () => {
    const fullWrapper = factory();
    await flushPromises();

    const fullRow = fullWrapper.get('.instructions-table__row');
    expect(fullRow.attributes('role')).toBe('presentation');
    expect(fullRow.findAll('[role="cell"]')).toHaveLength(7);
    expect(fullRow.get('.instructions-table__actions[role="cell"] button').text()).toBe('View details');

    const compactWrapper = factory({ showValue: false });
    await flushPromises();

    const compactRow = compactWrapper.get('.instructions-table__row');
    expect(compactRow.findAll('[role="cell"]')).toHaveLength(6);
    expect(compactRow.find('.instructions-table__column-value').exists()).toBe(false);
    expect(compactRow.get('.instructions-table__actions[role="cell"] button').text()).toBe('View details');
  });

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
        framed_sha256: FRAMED_SHA256,
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
        framed_sha256: FRAMED_SHA256,
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
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockImplementation(async ({ cursor }) => ({
      status: SUCCESSFUL_FETCHING,
      data: cursor === null
        ? {
            nextCursor: 'next',
            items: [contractInstruction],
          }
        : {
            nextCursor: null,
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
        nextCursor: null,
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

  it('labels native-only nested instructions as encoded and preserves raw Torii JSON', async () => {
    const multisigInstruction = makeNestedTransferMultisigInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [multisigInstruction],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: multisigInstruction,
    });

    const wrapper = factory({ initialInstructionIndex: 0 });
    await flushPromises();

    const jsonComponents = wrapper.findAllComponents(BaseJsonStub);
    const rowJson = jsonComponents.find((component) => component.classes().includes('instructions-table__value-json'));
    const detailJson = jsonComponents.find((component) => component.classes().includes('instructions-detail__json-tree'));

    expect(wrapper.findAll('[data-test="instruction-semantic-card"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Multisig proposal');
    expect(wrapper.text()).toContain('Encoded instruction');
    expect(wrapper.text()).toContain(LIVE_TRANSFER_INSTRUCTION);
    expect(wrapper.text()).not.toContain('Asset transfer');
    expect(rowJson?.props('value')).toEqual(multisigInstruction.box.json);
    expect(detailJson?.props('value')).toEqual(multisigInstruction.box.json);
    expect(multisigInstruction.box.json.payload.value.Propose.instructions).toEqual([LIVE_TRANSFER_INSTRUCTION]);
  });

  it('keeps Custom kind label for non-multisig custom instructions', async () => {
    const customInstruction = makeNonMultisigCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [customInstruction],
      },
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('Custom');
  });

  it('does not infer a custom ISI label from payload wire_id', async () => {
    const wireIdInstruction = makeWireIdCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [wireIdInstruction],
      },
    });
    (api.fetchInstructionDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: wireIdInstruction,
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('Custom');

    await wrapper.find('.instructions-table__action-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-detail-kind"]').text()).toContain('Custom');
  });

  it('does not infer a custom ISI label from an unregistered payload variant', async () => {
    const variantInstruction = makeVariantCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [variantInstruction],
      },
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('Custom');
  });

  it('uses the concrete instruction kind supplied by Torii', async () => {
    const resolvedInstruction = makeResolvedWireIdCustomInstruction();
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [resolvedInstruction],
      },
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="instruction-kind-label"]').text()).toBe('SubmitOfflineToOnlineTransfer');
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
          framed_sha256: FRAMED_SHA256,
          json: {
            kind: 'Register',
            payload: {
              variant: 'Domain',
              value: {
                object: {
                  id: 'wonderland.universal',
                  logo: null,
                  metadata: {},
                },
              },
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
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', 'next');
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
    wrapper.getComponent({ name: 'BaseTable' }).vm.$emit('update:cursor', null);
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

  it('does not probe instruction detail indexes when the history query is empty', async () => {
    (api.fetchInstructions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        nextCursor: null,
        items: [],
      },
    });

    const wrapper = factory({ filterBy: { kind: 'transaction', value: '0xempty' } });
    await flushPromises();

    expect(api.fetchInstructionDetail).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="instruction-kind-label"]').exists()).toBe(false);
  });
});
