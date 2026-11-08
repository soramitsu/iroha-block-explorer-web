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

export function resolveContractViewInstructionKind(
  instruction: Pick<Instruction, 'kind' | 'box'>
): ContractViewInstructionKind | null {
  if (!('wire_id' in instruction.box)) return null;
  const kind = CONTRACT_VIEW_KIND_BY_WIRE_ID[instruction.box.wire_id];
  return kind && instruction.kind === kind ? kind : null;
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
