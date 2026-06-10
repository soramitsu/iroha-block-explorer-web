import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import ContractCodeViewPanel from './ContractCodeViewPanel.vue';
import { i18n } from '@/shared/lib/localization';
import * as api from '@/shared/api';
import type * as SharedApiModule from '@/shared/api';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { Bytes, Hash } from '@iroha/core/crypto';

vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof SharedApiModule>('@/shared/api');
  return {
    ...actual,
    fetchInstructionContractView: vi.fn(),
    fetchContractCodeView: vi.fn(),
    submitVerifiedContractSource: vi.fn(),
  };
});

const BaseHashStub = defineComponent({
  name: 'BaseHash',
  props: {
    hash: { type: String, required: true },
  },
  template: '<span class="base-hash-stub">{{ hash }}</span>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  props: {
    nativeType: { type: String, default: 'button' },
  },
  template: '<button class="base-button-stub" :type="nativeType"><slot /></button>',
});

const DataFieldStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, required: true },
    value: { type: [String, Number], default: null },
  },
  template: '<div class="data-field-stub"><span>{{ title }}</span><span>{{ value }}</span><slot /></div>',
});

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function encodeBase64(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

function encodeWord(word: number): number[] {
  return [
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ];
}

function encodeRi(opcode: number, rd: number, rs1: number, imm: number): number {
  return (((opcode & 0xff) << 24) | ((rd & 0xff) << 16) | ((rs1 & 0xff) << 8) | (imm & 0xff)) >>> 0;
}

function encodeLoad(opcode: number, rd: number, base: number, imm: number): number {
  return encodeRi(opcode, rd, base, imm);
}

function encodeBranch(opcode: number, left: number, right: number, offsetWords: number): number {
  return encodeRi(opcode, left, right, offsetWords);
}

function encodeSys(number: number): number {
  return (((0x60 & 0xff) << 24) | (number & 0xff)) >>> 0;
}

function makeContractBytes(): Uint8Array {
  return Uint8Array.from([
    0x49, 0x56, 0x4d, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x10, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x01,
    ...encodeWord(encodeRi(0x20, 1, 0, 5)),
    ...encodeWord(encodeLoad(0x30, 2, 1, 0)),
    ...encodeWord(encodeSys(0xa0)),
    ...encodeWord(encodeBranch(0x40, 1, 2, 2)),
    ...encodeWord(encodeRi(0x31, 1, 2, 8)),
    ...encodeWord(0x49000000),
  ]);
}

function computeCodeHash(bytes: Uint8Array): string {
  return Hash.hash(Bytes.array(bytes.slice(17))).payload.hex().toLowerCase();
}

function makeInstructionBytesInstruction() {
  const codeBytes = makeContractBytes();
  const codeHash = computeCodeHash(codeBytes);

  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'RegisterSmartContractBytes',
    index: 0,
    transaction_hash: '0xcontract',
    transaction_status: 'Rejected',
    block: 77,
    box: {
      encoded: '0x01',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {
          code_hash: codeHash,
          code: encodeBase64(codeBytes),
        },
      },
    },
  };
}

function makeManifestInstruction(codeHash: string) {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:01Z'),
    kind: 'RegisterSmartContractCode',
    index: 1,
    transaction_hash: '0xcontract',
    transaction_status: 'Rejected',
    block: 77,
    box: {
      encoded: '0x02',
      json: {
        kind: 'RegisterSmartContractCode',
        payload: {
          manifest: {
            code_hash: codeHash,
            abi_hash: 'bb'.repeat(32),
            compiler_fingerprint: 'kotodama-1.0',
            features_bitmap: 3,
            access_set_hints: {
              read_keys: ['account:alice'],
              write_keys: ['asset:usd'],
            },
            entrypoints: [
              {
                name: 'main',
                kind: 'public',
                params: [{ name: 'value', type_name: 'u32' }],
                return_type: null,
                permission: 'CanExecute',
                read_keys: ['account:alice'],
                write_keys: ['asset:usd'],
                access_hints_complete: true,
                access_hints_skipped: [],
                triggers: [],
              },
            ],
          },
        },
      },
    },
  };
}

describe('ContractCodeViewPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    (api.fetchInstructionContractView as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: NOT_FOUND,
    });
    (api.fetchContractCodeView as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: NOT_FOUND,
    });

    (api.submitVerifiedContractSource as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      statusCode: 202,
      data: {
        job_id: 'job-1',
        code_hash: 'aa'.repeat(32),
        status: 'accepted',
        submitted_at: '2026-03-28T00:00:00Z',
        completed_at: '2026-03-28T00:00:01Z',
        message: 'verified source stored',
        actual_code_hash: 'aa'.repeat(32),
        verified_source_ref: {
          language: 'kotodama',
          source_name: 'demo.ko',
          submitted_at: '2026-03-28T00:00:00Z',
          manifest_id_hex: 'cc'.repeat(16),
          payload_digest_hex: 'dd'.repeat(32),
          content_length: 44,
        },
      },
    });
  });

  function factory(props: Record<string, unknown>) {
    return mount(ContractCodeViewPanel, {
      props,
      global: {
        plugins: [i18n],
        stubs: {
          BaseHash: BaseHashStub,
          BaseButton: BaseButtonStub,
          DataField: DataFieldStub,
        },
      },
    });
  }

  it('renders decompiled contract code locally from instruction payloads', async () => {
    const bytesInstruction = makeInstructionBytesInstruction();
    const manifestInstruction = makeManifestInstruction(bytesInstruction.box.json.payload.code_hash);
    const wrapper = factory({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });
    await flushPromises();

    expect(wrapper.get('[data-test="contract-view-source-kind"]').text()).toContain('Decompiled');
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain(
      'addi r1, r0, +5'
    );
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain(
      'scall 0xa0 ; SMARTCONTRACT_EXECUTE_INSTRUCTION'
    );
    expect(wrapper.text()).toContain('Instructions');
    expect(wrapper.text()).toContain('6');
    expect(wrapper.text()).toContain('public fn main(value: u32)');
  });

  it('hydrates a persisted verified source on page load when the backend reports one', async () => {
    const bytesInstruction = makeInstructionBytesInstruction();
    const manifestInstruction = makeManifestInstruction(bytesInstruction.box.json.payload.code_hash);
    (api.fetchInstructionContractView as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        code_hash: bytesInstruction.box.json.payload.code_hash,
        declared_code_hash: bytesInstruction.box.json.payload.code_hash,
        abi_hash: null,
        compiler_fingerprint: null,
        byte_len: 41,
        permissions: [],
        access_hints: null,
        entrypoints: [],
        analysis: null,
        warnings: [],
        rendered_source_kind: 'verified_source',
        rendered_source_text: 'kotoage fn persisted() {}',
        verified_source_ref: {
          language: 'kotodama',
          source_name: 'persisted.ko',
          submitted_at: '2026-03-28T00:00:00Z',
          manifest_id_hex: null,
          payload_digest_hex: null,
          content_length: 26,
        },
      },
    });

    const wrapper = factory({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });
    await flushPromises();
    await flushPromises();

    expect(api.fetchInstructionContractView).toHaveBeenCalledWith('0xcontract', 0);
    expect(wrapper.get('[data-test="contract-view-source-kind"]').text()).toContain('Verified source');
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('kotoage fn persisted() {}');
  });

  it('falls back to the code-hash endpoint when the instruction-scoped endpoint has no verified source', async () => {
    const bytesInstruction = makeInstructionBytesInstruction();
    const manifestInstruction = makeManifestInstruction(bytesInstruction.box.json.payload.code_hash);
    (api.fetchInstructionContractView as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        code_hash: bytesInstruction.box.json.payload.code_hash,
        declared_code_hash: bytesInstruction.box.json.payload.code_hash,
        abi_hash: null,
        compiler_fingerprint: null,
        byte_len: 41,
        permissions: [],
        access_hints: null,
        entrypoints: [],
        analysis: null,
        warnings: [],
        rendered_source_kind: 'pseudo_source',
        rendered_source_text: 'contract Demo {}',
        verified_source_ref: null,
      },
    });
    (api.fetchContractCodeView as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        code_hash: bytesInstruction.box.json.payload.code_hash,
        declared_code_hash: bytesInstruction.box.json.payload.code_hash,
        abi_hash: null,
        compiler_fingerprint: null,
        byte_len: 41,
        permissions: [],
        access_hints: null,
        entrypoints: [],
        analysis: null,
        warnings: [],
        rendered_source_kind: 'verified_source',
        rendered_source_text: 'kotoage fn from_code_hash() {}',
        verified_source_ref: {
          language: 'kotodama',
          source_name: 'by-code-hash.ko',
          submitted_at: '2026-03-28T00:00:00Z',
          manifest_id_hex: null,
          payload_digest_hex: null,
          content_length: 31,
        },
      },
    });

    const wrapper = factory({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });
    await flushPromises();
    await flushPromises();

    expect(api.fetchInstructionContractView).toHaveBeenCalledWith('0xcontract', 0);
    expect(api.fetchContractCodeView).toHaveBeenCalledWith(bytesInstruction.box.json.payload.code_hash);
    expect(wrapper.get('[data-test="contract-view-source-kind"]').text()).toContain('Verified source');
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('kotoage fn from_code_hash() {}');
  });

  it('shows mismatch verification feedback when the submitted source compiles to a different hash', async () => {
    const bytesInstruction = makeInstructionBytesInstruction();
    const manifestInstruction = makeManifestInstruction(bytesInstruction.box.json.payload.code_hash);
    (api.submitVerifiedContractSource as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      statusCode: 400,
      data: {
        job_id: 'job-2',
        code_hash: bytesInstruction.box.json.payload.code_hash,
        status: 'mismatch',
        submitted_at: '2026-03-28T00:00:00Z',
        completed_at: '2026-03-28T00:00:01Z',
        message: 'compiled source does not match the requested code hash',
        actual_code_hash: 'ee'.repeat(32),
        verified_source_ref: null,
      },
    });

    const wrapper = factory({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });
    await flushPromises();

    await wrapper.get('textarea').setValue('kotoage fn main() {}');
    await wrapper.get('[data-test="contract-view-upload-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-test="contract-view-upload-status"]').text()).toContain('Hash mismatch');
    expect(wrapper.get('[data-test="contract-view-upload-status"]').text()).toContain('compiled source does not match');
    expect(wrapper.get('[data-test="contract-view-upload-status"]').text()).toContain('ee');
  });

  it('replaces the local decompiled view with the submitted verified source after acceptance', async () => {
    const bytesInstruction = makeInstructionBytesInstruction();
    const manifestInstruction = makeManifestInstruction(bytesInstruction.box.json.payload.code_hash);
    const wrapper = factory({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });
    await flushPromises();

    await wrapper.get('input').setValue('demo.ko');
    await wrapper.get('textarea').setValue('kotoage fn main() {}');
    await wrapper.get('[data-test="contract-view-upload-form"]').trigger('submit');
    await flushPromises();

    expect(api.submitVerifiedContractSource).toHaveBeenCalledWith(
      bytesInstruction.box.json.payload.code_hash,
      {
        language: 'kotodama',
        source_name: 'demo.ko',
        source_text: 'kotoage fn main() {}',
      }
    );
    expect(wrapper.get('[data-test="contract-view-source-kind"]').text()).toContain('Verified source');
    expect(wrapper.get('[data-test="contract-view-source"]').text()).toContain('kotoage fn main() {}');
  });
});
