import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { ContractCodeView, Instruction } from '@/shared/api/schemas';
import { i18n } from '@/shared/lib/localization';
import ContractCodeViewPanel from './ContractCodeViewPanel.vue';

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchInstructionContractView: vi.fn(),
  };
});

const BaseHashStub = defineComponent({
  props: { hash: { type: String, required: true } },
  template: '<span class="base-hash-stub">{{ hash }}</span>',
});

const DataFieldStub = defineComponent({
  props: {
    title: { type: String, required: true },
    value: { type: [String, Number], default: null },
  },
  template: '<div class="data-field-stub"><span>{{ title }}</span><span>{{ value }}</span><slot /></div>',
});

const ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const FRAMED_SHA256 = `0x${'cd'.repeat(32)}`;

function makeInstruction(transactionHash = 'ab'.repeat(32), index = 4): Instruction {
  const wireId = 'iroha.instruction.v1::smart_contract_code::RegisterSmartContractBytes';
  return {
    authority: ACCOUNT_ID,
    created_at: new Date('2026-08-30T00:00:00Z'),
    kind: 'RegisterSmartContractBytes',
    index,
    transaction_hash: transactionHash,
    transaction_status: 'Committed',
    block: 9,
    box: {
      encoded: '0x01',
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Custom',
        wire_id: wireId,
        encoded: '01',
        payload: {
          variant: 'RegisterSmartContractBytes',
          value: { wire_id: wireId, encoded: '01' },
        },
      },
    },
  };
}

function makeView(sourceText: string, codeHash = 'ef'.repeat(32)): ContractCodeView {
  return {
    code_hash: codeHash,
    declared_code_hash: codeHash,
    compiler_fingerprint: 'kotodama-current',
    byte_len: 42,
    permissions: [],
    entrypoints: [
      {
        name: 'main',
        kind: 'public',
        params: [{ name: 'amount', type_name: 'u32' }],
        return_type: 'bool',
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
        triggers: [],
      },
    ],
    warnings: ['authoritative warning'],
    rendered_source_kind: 'verified_source',
    rendered_source_text: sourceText,
    verified_source_ref: {
      language: 'kotodama',
      source_name: 'contract.ko',
      submitted_at: '2026-08-30T00:00:00Z',
      manifest_id_hex: null,
      payload_digest_hex: null,
      content_length: sourceText.length,
    },
  };
}

function factory(instruction: Instruction | null = makeInstruction()) {
  return mount(ContractCodeViewPanel, {
    props: { instruction },
    global: {
      plugins: [i18n],
      stubs: {
        BaseHash: BaseHashStub,
        DataField: DataFieldStub,
      },
    },
  });
}

describe('ContractCodeViewPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchInstructionContractView).mockResolvedValue({ status: NOT_FOUND } as never);
  });

  it('renders only the authoritative instruction-scoped contract view', async () => {
    const instruction = makeInstruction();
    vi.mocked(api.fetchInstructionContractView).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: makeView('kotoage fn main(amount: u32) -> bool {}'),
    });

    const wrapper = factory(instruction);
    await flushPromises();

    expect(api.fetchInstructionContractView).toHaveBeenCalledOnce();
    expect(api.fetchInstructionContractView).toHaveBeenCalledWith(instruction.transaction_hash, instruction.index);
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('kotoage fn main');
    expect(wrapper.get('[data-test="contract-view-source-kind"]').text()).toContain('Verified source');
    expect(wrapper.text()).toContain('public fn main(amount: u32) -> bool');
    expect(wrapper.text()).toContain('authoritative warning');
    expect(wrapper.get('[data-test="contract-view-verification-auth-boundary"]').text()).toContain(
      'canonical account authentication'
    );
  });

  it('fails closed when the route has no view or rejects', async () => {
    const notFound = factory();
    await flushPromises();

    expect(notFound.get('[data-test="contract-view-error"]').text()).toContain('not available');
    expect(notFound.find('[data-test="contract-view-source"]').exists()).toBe(false);

    vi.mocked(api.fetchInstructionContractView).mockRejectedValueOnce(new Error('offline'));
    const rejected = factory(makeInstruction('12'.repeat(32), 2));
    await flushPromises();

    expect(rejected.get('[data-test="contract-view-error"]').text()).toContain('not available');
    expect(rejected.find('[data-test="contract-view-source"]').exists()).toBe(false);
  });

  it('ignores a stale response after the selected instruction changes', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondInstruction = makeInstruction('34'.repeat(32), 8);

    vi.mocked(api.fetchInstructionContractView)
      .mockImplementationOnce(() => first as never)
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: makeView('kotoage fn current() {}', '34'.repeat(32)),
      });

    const wrapper = factory(makeInstruction('12'.repeat(32), 1));
    await Promise.resolve();
    await wrapper.setProps({ instruction: secondInstruction });
    await flushPromises();

    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('current');

    resolveFirst({
      status: SUCCESSFUL_FETCHING,
      data: makeView('kotoage fn stale() {}', '12'.repeat(32)),
    });
    await flushPromises();

    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('current');
    expect(wrapper.get('[data-test="contract-view-source"]').text()).not.toContain('stale');
  });
});
