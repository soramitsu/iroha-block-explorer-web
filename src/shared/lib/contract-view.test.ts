import { describe, expect, it } from 'vitest';
import { Bytes, Hash } from '@iroha/core/crypto';
import {
  buildLocalContractCodeView,
  resolveContractViewInstructionKind,
  selectPrimaryContractViewInstruction,
} from './contract-view';
import type { Instruction } from '@/shared/api/schemas';

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function makeInstruction(overrides: Partial<Instruction> = {}): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'Register',
    index: 0,
    transaction_hash: '0xcontract',
    transaction_status: 'Committed',
    block: 77,
    box: {
      encoded: '0x01',
      json: {
        kind: 'Register',
        payload: {},
      },
    },
    ...overrides,
  };
}

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
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

function encodeStore(opcode: number, base: number, source: number, imm: number): number {
  return encodeRi(opcode, base, source, imm);
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
    ...encodeWord(encodeStore(0x31, 1, 2, 8)),
    ...encodeWord(0x49000000),
  ]);
}

const DIRECT_HELPER_SYSCALLS = [
  [0x84, 'JSON_GET_I64_DIRECT'],
  [0x85, 'JSON_GET_JSON_DIRECT'],
  [0x86, 'JSON_GET_NAME_DIRECT'],
  [0x87, 'JSON_GET_ACCOUNT_ID_DIRECT'],
  [0x88, 'JSON_GET_NFT_ID_DIRECT'],
  [0x89, 'JSON_GET_BLOB_HEX_DIRECT'],
  [0x8a, 'JSON_GET_NUMERIC_DIRECT'],
  [0x8b, 'JSON_GET_ASSET_DEFINITION_ID_DIRECT'],
  [0x8c, 'JSON_SET_I64_DIRECT'],
  [0x8d, 'JSON_SET_ACCOUNT_ID_DIRECT'],
  [0x8e, 'BUILD_PATH_KEY_NORITO_DIRECT'],
  [0x8f, 'SCHEMA_INFO_DIRECT'],
  [0xd0, 'SCHEMA_ENCODE_DIRECT'],
  [0xd1, 'SCHEMA_DECODE_DIRECT'],
  [0xd2, 'NUMERIC_TO_INT_DIRECT'],
  [0xd3, 'NUMERIC_ADD_DIRECT'],
  [0xd4, 'NUMERIC_SUB_DIRECT'],
  [0xd5, 'NUMERIC_MUL_DIRECT'],
  [0xd6, 'NUMERIC_DIV_DIRECT'],
  [0xd7, 'NUMERIC_REM_DIRECT'],
  [0xd8, 'NUMERIC_NEG_DIRECT'],
  [0xd9, 'NUMERIC_EQ_DIRECT'],
  [0xda, 'NUMERIC_NE_DIRECT'],
  [0xdb, 'NUMERIC_LT_DIRECT'],
  [0xdc, 'NUMERIC_LE_DIRECT'],
  [0xdd, 'NUMERIC_GT_DIRECT'],
  [0xde, 'NUMERIC_GE_DIRECT'],
] as const;

const DEBUG_HELPER_SYSCALLS = [
  [0x00, 'DEBUG_PRINT'],
  [0x03, 'DEBUG_LOG'],
] as const;

function makeDirectHelperContractBytes(): Uint8Array {
  return Uint8Array.from([
    0x49, 0x56, 0x4d, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x10, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x01,
    ...DIRECT_HELPER_SYSCALLS.flatMap(([number]) => encodeWord(encodeSys(number))),
    ...encodeWord(0x49000000),
  ]);
}

function makeDebugHelperContractBytes(): Uint8Array {
  return Uint8Array.from([
    0x49, 0x56, 0x4d, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x10, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x01,
    ...DEBUG_HELPER_SYSCALLS.flatMap(([number]) => encodeWord(encodeSys(number))),
    ...encodeWord(0x49000000),
  ]);
}

function computeCodeHash(bytes: Uint8Array): string {
  return Hash.hash(Bytes.array(bytes.slice(17))).payload.hex().toLowerCase();
}

function readDeclaredCodeHash(instruction: Instruction): string {
  const payload = instruction.box.json.payload as { code_hash?: string };
  return payload.code_hash ?? '';
}

function makeRegisterBytesInstruction(
  options: {
    index?: number
    codeBytes?: Uint8Array
    codeHash?: string
  } = {}
): Instruction {
  const codeBytes = options.codeBytes ?? makeContractBytes();
  const codeHash = options.codeHash ?? computeCodeHash(codeBytes);

  return makeInstruction({
    kind: 'RegisterSmartContractBytes',
    index: options.index ?? 0,
    box: {
      encoded: '0xbytes',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {
          code_hash: codeHash,
          code: encodeBase64(codeBytes),
        },
      },
    },
  });
}

function makeManifestInstruction(codeHash: string, index = 1): Instruction {
  return makeInstruction({
    kind: 'RegisterSmartContractCode',
    index,
    box: {
      encoded: '0xmanifest',
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
                triggers: [
                  {
                    id: 'on_update',
                    callback: {
                      namespace: 'demo',
                      entrypoint: 'main',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  });
}

function makeActivationInstruction(codeHash: string, index = 2): Instruction {
  return makeInstruction({
    kind: 'ActivateContractInstance',
    index,
    box: {
      encoded: '0xactivate',
      json: {
        kind: 'ActivateContractInstance',
        payload: {
          code_hash: codeHash,
          contract_address: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
          contract_alias: 'sample::universal',
          dataspace: 'universal',
        },
      },
    },
  });
}

describe('resolveContractViewInstructionKind', () => {
  it('recognizes explicit contract instruction kinds', () => {
    const instruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0x01',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: 'aa'.repeat(32),
          },
        },
      },
    });

    expect(resolveContractViewInstructionKind(instruction)).toBe('RegisterSmartContractBytes');
  });

  it('recognizes contract instruction kinds from nested variant/wire metadata', () => {
    const instruction = makeInstruction({
      kind: 'Custom',
      box: {
        encoded: '0x02',
        json: {
          kind: 'Custom',
          wire_id: 'iroha_data_model::isi::smart_contract_code::RegisterSmartContractCode',
          payload: {
            variant: 'Unknown',
            value: {
              wire_id: 'iroha_data_model::isi::smart_contract_code::RegisterSmartContractCode',
            },
          },
        },
      },
    });

    expect(resolveContractViewInstructionKind(instruction)).toBe('RegisterSmartContractCode');
  });

  it('returns null for non-contract instructions', () => {
    const instruction = makeInstruction({
      kind: 'Transfer',
      box: {
        encoded: '0x03',
        json: {
          kind: 'Transfer',
          payload: {
            object: 'asset',
          },
        },
      },
    });

    expect(resolveContractViewInstructionKind(instruction)).toBeNull();
  });
});

describe('selectPrimaryContractViewInstruction', () => {
  it('prefers register-bytes before activation when several contract instructions are present', () => {
    const activate = makeActivationInstruction('aa'.repeat(32), 2);
    const registerBytes = makeRegisterBytesInstruction({ index: 1, codeHash: 'aa'.repeat(32) });

    expect(
      selectPrimaryContractViewInstruction([activate, registerBytes], 'Ivm')?.index
    ).toBe(1);
  });

  it('returns null when the transaction has no contract-view instructions', () => {
    const instruction = makeInstruction({
      kind: 'Transfer',
      box: {
        encoded: '0x06',
        json: {
          kind: 'Transfer',
          payload: {},
        },
      },
    });

    expect(selectPrimaryContractViewInstruction([instruction], 'Wasm')).toBeNull();
  });
});

describe('buildLocalContractCodeView', () => {
  it('reconstructs pseudo-source locally from bytes plus companion manifest metadata', () => {
    const bytesInstruction = makeRegisterBytesInstruction();
    const codeHash = readDeclaredCodeHash(bytesInstruction);
    const manifestInstruction = makeManifestInstruction(codeHash);

    const view = buildLocalContractCodeView({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_kind).toBe('pseudo_source');
    expect(view?.code_hash).toBe(codeHash);
    expect(view?.compiler_fingerprint).toBe('kotodama-1.0');
    expect(view?.entrypoints).toHaveLength(1);
    expect(view?.rendered_source_text).toContain('Decompiled locally in the browser');
    expect(view?.rendered_source_text).toContain('// public fn main(value: u32)');
    expect(view?.rendered_source_text).toContain('L0000:');
    expect(view?.rendered_source_text).toContain('addi r1, r0, +5');
    expect(view?.rendered_source_text).toContain('load64 r2, [r1]');
    expect(view?.rendered_source_text).toContain('scall 0xa0 ; SMARTCONTRACT_EXECUTE_INSTRUCTION');
    expect(view?.rendered_source_text).toContain('beq r1, r2, L0014');
    expect(view?.rendered_source_text).toContain('store64 [r1 + 8], r2');
    expect(view?.analysis).toEqual({
      instruction_count: 6,
      memory: {
        load64: 1,
        store64: 1,
        load128: 0,
        store128: 0,
      },
      syscalls: [
        {
          number: 0xa0,
          name: 'SMARTCONTRACT_EXECUTE_INSTRUCTION',
          count: 1,
        },
      ],
    });
  });

  it('renders direct codec and numeric helper syscall labels locally', () => {
    const codeBytes = makeDirectHelperContractBytes();
    const bytesInstruction = makeRegisterBytesInstruction({ codeBytes });
    const view = buildLocalContractCodeView({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction],
    });

    expect(view).not.toBeNull();
    for (const [number, name] of DIRECT_HELPER_SYSCALLS) {
      expect(view?.rendered_source_text).toContain(`scall 0x${number.toString(16)} ; ${name}`);
    }
    expect(view?.analysis?.syscalls).toEqual(
      DIRECT_HELPER_SYSCALLS.map(([number, name]) => ({
        number,
        name,
        count: 1,
      }))
    );
  });

  it('renders ABI debug helper syscall labels locally', () => {
    const codeBytes = makeDebugHelperContractBytes();
    const bytesInstruction = makeRegisterBytesInstruction({ codeBytes });
    const view = buildLocalContractCodeView({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction],
    });

    expect(view).not.toBeNull();
    for (const [number, name] of DEBUG_HELPER_SYSCALLS) {
      expect(view?.rendered_source_text).toContain(`scall 0x${number.toString(16).padStart(2, '0')} ; ${name}`);
    }
    expect(view?.analysis?.syscalls).toEqual(
      DEBUG_HELPER_SYSCALLS.map(([number, name]) => ({
        number,
        name,
        count: 1,
      }))
    );
  });

  it('warns when the declared hash in the instruction does not match the local browser hash', () => {
    const codeBytes = makeContractBytes();
    const bytesInstruction = makeRegisterBytesInstruction({
      codeBytes,
      codeHash: 'ff'.repeat(32),
    });

    const view = buildLocalContractCodeView({
      instruction: bytesInstruction,
      relatedInstructions: [bytesInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.declared_code_hash).toBe('ff'.repeat(32));
    expect(view?.code_hash).toBe(computeCodeHash(codeBytes));
    expect(view?.warnings).toContain(
      'Declared code hash does not match the browser-computed artifact hash.'
    );
  });

  it('falls back to a manifest stub when the transaction only contains manifest metadata', () => {
    const codeHash = 'aa'.repeat(32);
    const manifestInstruction = makeManifestInstruction(codeHash);

    const view = buildLocalContractCodeView({
      instruction: manifestInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_kind).toBe('manifest_stub');
    expect(view?.code_hash).toBe(codeHash);
    expect(view?.warnings).toContain(
      'Contract bytes are not present in the loaded transaction instructions, so only manifest hints can be shown.'
    );
    expect(view?.rendered_source_text).toContain('ManifestStub_aaaaaaaa');
    expect(view?.rendered_source_text).toContain('entrypoint: public fn main(value: u32)');
  });

  it('resolves activation instructions against related bytecode and manifest instructions in the same transaction', () => {
    const bytesInstruction = makeRegisterBytesInstruction({ index: 0 });
    const codeHash = readDeclaredCodeHash(bytesInstruction);
    const manifestInstruction = makeManifestInstruction(codeHash, 1);
    const activationInstruction = makeActivationInstruction(codeHash, 2);

    const view = buildLocalContractCodeView({
      instruction: activationInstruction,
      relatedInstructions: [bytesInstruction, manifestInstruction, activationInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_kind).toBe('pseudo_source');
    expect(view?.code_hash).toBe(codeHash);
    expect(view?.rendered_source_text).toContain('contract_address: tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7');
    expect(view?.rendered_source_text).toContain('contract_alias: sample::universal');
    expect(view?.rendered_source_text).toContain('compiler_fingerprint: kotodama-1.0');
  });
});
