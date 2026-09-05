import { describe, expect, it } from 'vitest';
import type { Instruction } from '@/shared/api/schemas';
import {
  CONTRACT_VIEW_INSTRUCTION_KINDS,
  resolveContractViewInstructionKind,
  selectPrimaryContractViewInstruction,
  type ContractViewInstructionKind,
} from './contract-view';

const ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const TRANSACTION_HASH = 'ab'.repeat(32);
const FRAMED_SHA256 = `0x${'cd'.repeat(32)}`;

function makeInstruction(kind: ContractViewInstructionKind, index = 0): Instruction {
  const wireId = `iroha.instruction.v1::smart_contract_code::${kind}`;
  return {
    authority: ACCOUNT_ID,
    created_at: new Date('2026-08-30T00:00:00Z'),
    kind,
    index,
    transaction_hash: TRANSACTION_HASH,
    transaction_status: 'Committed',
    block: 7,
    box: {
      encoded: '0x01',
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Custom',
        wire_id: wireId,
        encoded: '01',
        payload: { variant: kind, value: { wire_id: wireId, encoded: '01' } },
      },
    },
  };
}

function makeUnrelatedInstruction(index = 0): Instruction {
  const instruction = makeInstruction('ActivateContractInstance', index);
  return {
    ...instruction,
    kind: 'Transfer',
    box: {
      ...instruction.box,
      json: {
        ...instruction.box.json,
        kind: 'Transfer',
        wire_id: 'iroha.instruction.v1::transfer::Asset',
        payload: { variant: 'Asset', value: {} },
      },
    },
  };
}

describe('resolveContractViewInstructionKind', () => {
  it.each(CONTRACT_VIEW_INSTRUCTION_KINDS)('accepts the exact current %s envelope', (kind) => {
    expect(resolveContractViewInstructionKind(makeInstruction(kind))).toBe(kind);
  });

  it('rejects retired wire ids and mismatched discriminants', () => {
    const legacy = makeInstruction('RegisterSmartContractBytes');
    legacy.box.json.wire_id = 'iroha_data_model::isi::smart_contract::RegisterSmartContractBytes';

    const mismatchedKind = makeInstruction('RegisterSmartContractCode');
    mismatchedKind.kind = 'RegisterSmartContractBytes';

    const mismatchedPayload = makeInstruction('ActivateContractInstance');
    mismatchedPayload.box.json.payload = {
      variant: 'RegisterSmartContractCode',
      value: {},
    };

    expect(resolveContractViewInstructionKind(legacy)).toBeNull();
    expect(resolveContractViewInstructionKind(mismatchedKind)).toBeNull();
    expect(resolveContractViewInstructionKind(mismatchedPayload)).toBeNull();
  });

  it('rejects non-Custom and malformed payload envelopes', () => {
    const nonCustom = makeInstruction('RegisterSmartContractBytes');
    nonCustom.box.json.kind = 'Register';

    const malformed = makeInstruction('RegisterSmartContractBytes');
    malformed.box.json.payload = { variant: 'RegisterSmartContractBytes', value: null };

    const extendedFallback = makeInstruction('RegisterSmartContractBytes');
    extendedFallback.box.json.payload = {
      variant: 'RegisterSmartContractBytes',
      value: {
        wire_id: extendedFallback.box.json.wire_id,
        encoded: extendedFallback.box.json.encoded,
        legacy: true,
      },
    };

    expect(resolveContractViewInstructionKind(nonCustom)).toBeNull();
    expect(resolveContractViewInstructionKind(malformed)).toBeNull();
    expect(resolveContractViewInstructionKind(extendedFallback)).toBeNull();
    expect(resolveContractViewInstructionKind(makeUnrelatedInstruction())).toBeNull();
  });
});

describe('selectPrimaryContractViewInstruction', () => {
  it('prefers registered bytes, then uses instruction index as the tie-breaker', () => {
    const activation = makeInstruction('ActivateContractInstance', 0);
    const laterBytes = makeInstruction('RegisterSmartContractBytes', 8);
    const earlierBytes = makeInstruction('RegisterSmartContractBytes', 3);
    const manifest = makeInstruction('RegisterSmartContractCode', 1);

    expect(selectPrimaryContractViewInstruction([activation, laterBytes, manifest, earlierBytes])).toBe(earlierBytes);
  });

  it('falls through to manifests and activations when no byte registration exists', () => {
    const activation = makeInstruction('ActivateContractInstance', 0);
    const manifest = makeInstruction('RegisterSmartContractCode', 9);

    expect(selectPrimaryContractViewInstruction([activation, manifest])).toBe(manifest);
    expect(selectPrimaryContractViewInstruction([activation])).toBe(activation);
  });

  it('returns null when no canonical contract instruction is present', () => {
    expect(selectPrimaryContractViewInstruction([])).toBeNull();
    expect(selectPrimaryContractViewInstruction([makeUnrelatedInstruction()])).toBeNull();
  });
});
