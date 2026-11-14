import { describe, expect, it } from 'vitest';
import type { Instruction } from '@/shared/api/schemas';
import {
  CONTRACT_VIEW_INSTRUCTION_KINDS,
  resolveContractViewInstructionKind,
  selectPrimaryContractViewInstruction,
  type ContractViewInstructionKind,
} from './contract-view';

function instruction(kind: ContractViewInstructionKind, index = 0) {
  return {
    authority: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
    created_at: new Date('2026-08-30T00:00:00Z'),
    kind,
    index,
    transaction_hash: 'ab'.repeat(32),
    transaction_status: 'Committed',
    block: 7,
    box: {
      encoded: 'AQ==',
      framed_sha256: `0x${'cd'.repeat(32)}`,
      wire_id: `iroha.instruction.v1::smart_contract_code::${kind}`,
      json: null,
    },
  } satisfies Instruction;
}

describe('native contract-view instruction selection', () => {
  it.each(CONTRACT_VIEW_INSTRUCTION_KINDS)('recognizes the exact native %s wire identifier', (kind) => {
    expect(resolveContractViewInstructionKind(instruction(kind))).toBe(kind);
  });

  it('rejects retired wire identifiers and mismatched kinds', () => {
    const retired = instruction('RegisterSmartContractBytes');
    retired.box.wire_id = 'iroha_data_model::isi::smart_contract::RegisterSmartContractBytes';
    expect(resolveContractViewInstructionKind(retired)).toBeNull();
    expect(
      resolveContractViewInstructionKind({
        ...instruction('RegisterSmartContractBytes'),
        kind: 'RegisterSmartContractCode',
      })
    ).toBeNull();
  });

  it('does not guess contract identity from decoded JSON or the display kind', () => {
    const source = instruction('RegisterSmartContractBytes');
    expect(
      resolveContractViewInstructionKind({
        ...source,
        box: {
          encoded: source.box.encoded,
          framed_sha256: source.box.framed_sha256,
          json: { kind: source.kind, payload: { variant: source.kind, value: {} } },
        },
      })
    ).toBeNull();
  });

  it('orders authoritative candidates by kind then index without mutating the rows', () => {
    const rows = [
      instruction('ActivateContractInstance', 0),
      instruction('RegisterSmartContractCode', 1),
      instruction('RegisterSmartContractBytes', 7),
      instruction('RegisterSmartContractBytes', 4),
    ];
    const original = [...rows];
    expect(selectPrimaryContractViewInstruction(rows)).toBe(rows[3]);
    expect(rows).toEqual(original);
  });

  it('returns no candidate when the native list is empty or unrelated', () => {
    const unrelated = instruction('ActivateContractInstance');
    unrelated.box.wire_id = 'iroha.instruction.v1::transfer::Asset';
    expect(selectPrimaryContractViewInstruction([])).toBeNull();
    expect(selectPrimaryContractViewInstruction([unrelated])).toBeNull();
  });
});
