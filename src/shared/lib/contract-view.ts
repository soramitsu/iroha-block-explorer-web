import type { Instruction } from '@/shared/api/schemas';

export const CONTRACT_VIEW_INSTRUCTION_KINDS = [
  'RegisterSmartContractBytes',
  'RegisterSmartContractCode',
  'ActivateContractInstance',
] as const;

export type ContractViewInstructionKind = (typeof CONTRACT_VIEW_INSTRUCTION_KINDS)[number];

const CONTRACT_VIEW_KIND_BY_WIRE_ID: Readonly<Record<string, ContractViewInstructionKind>> = Object.freeze({
  'iroha.instruction.v1::smart_contract_code::RegisterSmartContractBytes': 'RegisterSmartContractBytes',
  'iroha.instruction.v1::smart_contract_code::RegisterSmartContractCode': 'RegisterSmartContractCode',
  'iroha.instruction.v1::smart_contract_code::ActivateContractInstance': 'ActivateContractInstance',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function resolveContractViewInstructionKind(
  instruction: Pick<Instruction, 'kind' | 'box'>
): ContractViewInstructionKind | null {
  const kind = CONTRACT_VIEW_KIND_BY_WIRE_ID[instruction.box.json.wire_id];
  if (!kind || instruction.kind !== kind || instruction.box.json.kind !== 'Custom') return null;

  const payload = instruction.box.json.payload;
  if (!isRecord(payload) || !hasExactKeys(payload, ['variant', 'value']) || payload.variant !== kind) return null;
  const value = payload.value;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['wire_id', 'encoded']) ||
    value.wire_id !== instruction.box.json.wire_id ||
    value.encoded !== instruction.box.json.encoded
  ) {
    return null;
  }

  return kind;
}

function instructionPriority(kind: ContractViewInstructionKind): number {
  switch (kind) {
    case 'RegisterSmartContractBytes':
      return 0;
    case 'RegisterSmartContractCode':
      return 1;
    case 'ActivateContractInstance':
      return 2;
  }
}

export function selectPrimaryContractViewInstruction(instructions: Instruction[]): Instruction | null {
  const candidates = instructions.flatMap((instruction) => {
    const kind = resolveContractViewInstructionKind(instruction);
    return kind ? [{ instruction, kind }] : [];
  });

  candidates.sort((left, right) => {
    const priority = instructionPriority(left.kind) - instructionPriority(right.kind);
    return priority || left.instruction.index - right.instruction.index;
  });

  return candidates[0]?.instruction ?? null;
}
