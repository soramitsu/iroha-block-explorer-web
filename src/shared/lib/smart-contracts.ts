import type { Instruction } from '@/shared/api/schemas';

export interface ActivateContractInstancePayload {
  codeHash: string | null
  contractAddress: string | null
  contractAlias: string | null
  dataspace: string | null
  namespace: string | null
  contractId: string | null
}

export interface SmartContractDeployment {
  contractAddress: string
  contractAlias: string | null
  dataspace: string | null
  codeHash: string | null
  authority: string
  transactionHash: string
  index: number
  block: number
  createdAt: Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeVariant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sections = trimmed.split('::').filter(Boolean);
  return sections.at(-1) ?? trimmed;
}

function unwrapVariantRecord(payload: unknown, expectedKind: 'ActivateContractInstance'): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;

  const directKey = Object.entries(payload).find(([key]) => normalizeVariant(key) === expectedKind)?.[1];
  if (isRecord(directKey)) return directKey;

  const nestedValue = payload.value;
  if (isRecord(nestedValue)) {
    const nestedKey = Object.entries(nestedValue).find(([key]) => normalizeVariant(key) === expectedKind)?.[1];
    if (isRecord(nestedKey)) return nestedKey;
    return nestedValue;
  }

  return payload;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readHashLiteral(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const normalized = raw.replace(/^0x/i, '').toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}

export function extractActivateContractInstancePayload(
  instruction: Pick<Instruction, 'kind' | 'box'>
): ActivateContractInstancePayload | null {
  const payload = unwrapVariantRecord(instruction.box.json.payload, 'ActivateContractInstance');
  if (!payload) return null;

  return {
    codeHash: readHashLiteral(payload.code_hash),
    contractAddress: readString(payload.contract_address),
    contractAlias: readString(payload.contract_alias),
    dataspace: readString(payload.dataspace),
    namespace: readString(payload.namespace),
    contractId: readString(payload.contract_id),
  };
}

export function extractSmartContractDeployment(instruction: Instruction): SmartContractDeployment | null {
  const payload = extractActivateContractInstancePayload(instruction);
  if (!payload?.contractAddress) return null;

  return {
    contractAddress: payload.contractAddress,
    contractAlias: payload.contractAlias,
    dataspace: payload.dataspace,
    codeHash: payload.codeHash,
    authority: instruction.authority,
    transactionHash: instruction.transaction_hash,
    index: instruction.index,
    block: instruction.block,
    createdAt: instruction.created_at,
  };
}
