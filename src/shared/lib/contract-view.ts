import { Bytes, Hash } from '@iroha/core/crypto';
import type {
  ContractCodeView,
  ContractVerifiedSourceRef,
  Instruction,
  Transaction,
} from '@/shared/api/schemas';
import { extractActivateContractInstancePayload, type ActivateContractInstancePayload } from './smart-contracts';

export const CONTRACT_VIEW_INSTRUCTION_KINDS = [
  'RegisterSmartContractBytes',
  'RegisterSmartContractCode',
  'ActivateContractInstance',
] as const;

export type ContractViewInstructionKind = (typeof CONTRACT_VIEW_INSTRUCTION_KINDS)[number];

const CONTRACT_VIEW_KIND_SET = new Set<string>(CONTRACT_VIEW_INSTRUCTION_KINDS);
const IVM_MAGIC = [0x49, 0x56, 0x4d, 0x00] as const;
const IVM_HEADER_LEN = 17;
const LITERAL_SECTION_MAGIC = 'LTLB';
const CONTRACT_INTERFACE_SECTION_MAGIC = 'CNTR';
const CONTRACT_DEBUG_SECTION_MAGIC = 'DBG1';

interface RegisterSmartContractBytesPayload {
  codeHash: string | null
  codeBytes: Uint8Array | null
}

interface LocalManifest {
  codeHash: string | null
  abiHash: string | null
  compilerFingerprint: string | null
  featuresBitmap: number | null
  accessHints: ContractCodeView['access_hints']
  entrypoints: ContractCodeView['entrypoints']
}

interface LocalProgramMetadata {
  versionMajor: number
  versionMinor: number
  abiVersion: number
  mode: string[]
  vectorLength: number | null
  maxCycles: number
  codeOffset: number
  sections: string[]
}

function normalizeVariant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sections = trimmed.split('::').filter(Boolean);
  return sections.at(-1) ?? trimmed;
}

function readSingleKeyVariant(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length !== 1) return null;
  return normalizeVariant(entries[0]?.[0]);
}

function instructionVariantCandidates(instruction: Pick<Instruction, 'kind' | 'box'>): string[] {
  const payload = instruction.box.json.payload;
  const nestedValue = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).value
    : null;

  return [
    normalizeVariant(instruction.kind),
    normalizeVariant(instruction.box.json.kind),
    normalizeVariant(instruction.box.json.wire_id),
    payload && typeof payload === 'object' ? normalizeVariant((payload as Record<string, unknown>).variant) : null,
    readSingleKeyVariant(payload),
    readSingleKeyVariant(nestedValue),
    nestedValue && typeof nestedValue === 'object'
      ? normalizeVariant((nestedValue as Record<string, unknown>).wire_id)
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function resolveContractViewInstructionKind(
  instruction: Pick<Instruction, 'kind' | 'box'>
): ContractViewInstructionKind | null {
  for (const candidate of instructionVariantCandidates(instruction)) {
    if (CONTRACT_VIEW_KIND_SET.has(candidate)) {
      return candidate as ContractViewInstructionKind;
    }
  }
  return null;
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

export function selectPrimaryContractViewInstruction(
  instructions: Instruction[],
  executable?: Transaction['executable'] | null
): Instruction | null {
  const candidates = instructions
    .map((instruction) => ({
      instruction,
      kind: resolveContractViewInstructionKind(instruction),
    }))
    .filter((entry): entry is { instruction: Instruction, kind: ContractViewInstructionKind } => entry.kind !== null);

  if (!candidates.length) return null;

  const preferred = [...candidates].sort((left, right) => {
    const priorityDelta = instructionPriority(left.kind) - instructionPriority(right.kind);
    if (priorityDelta !== 0) return priorityDelta;
    return left.instruction.index - right.instruction.index;
  });

  if (executable === 'Ivm' || executable === 'IvmProved' || executable === 'Wasm') {
    return preferred[0]?.instruction ?? null;
  }

  return preferred[0]?.instruction ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unwrapVariantRecord(payload: unknown, expectedKind: ContractViewInstructionKind): Record<string, unknown> | null {
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

function decodeBase64Bytes(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    if (typeof atob === 'function') {
      const binary = atob(trimmed);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(trimmed, 'base64'));
    }
  } catch {
    return null;
  }

  return null;
}

function extractRegisterSmartContractBytesPayload(
  instruction: Pick<Instruction, 'kind' | 'box'>
): RegisterSmartContractBytesPayload | null {
  const payload = unwrapVariantRecord(instruction.box.json.payload, 'RegisterSmartContractBytes');
  if (!payload) return null;

  const encodedCode = readString(payload.code);
  if (!encodedCode) return null;

  return {
    codeHash: readHashLiteral(payload.code_hash),
    codeBytes: decodeBase64Bytes(encodedCode),
  };
}

function formatTrigger(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const triggerId = readString(value.id);
  const callback = isRecord(value.callback) ? value.callback : null;
  const callbackEntrypoint = callback ? readString(callback.entrypoint) : null;
  const callbackNamespace = callback ? readString(callback.namespace) : null;

  if (!triggerId && !callbackEntrypoint) return null;
  const target = callbackEntrypoint
    ? callbackNamespace
      ? `${callbackNamespace}.${callbackEntrypoint}`
      : callbackEntrypoint
    : 'callback';
  return triggerId ? `${triggerId} -> ${target}` : target;
}

function normalizeEntrypointKind(value: unknown): string {
  const raw = readString(value)?.toLowerCase()
    ?? (isRecord(value) ? readString(value.kind)?.toLowerCase() : null);
  switch (raw) {
    case 'public':
    case 'kotoage':
    case 'view':
    case 'hajimari':
    case 'initializer':
    case 'init':
      return raw === 'initializer' || raw === 'init' ? 'hajimari' : raw === 'kotoage' ? 'public' : raw;
    case 'kaizen':
      return raw;
    default:
      return raw === 'public' ? 'public' : raw ?? 'public';
  }
}

function normalizeEntrypointParams(value: unknown): ContractCodeView['entrypoints'][number]['params'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = readString(entry.name);
    const typeName = readString(entry.type_name);
    if (!name || !typeName) return [];
    return [{ name, type_name: typeName }];
  });
}

function normalizeEntrypoints(value: unknown): ContractCodeView['entrypoints'] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = readString(entry.name);
    if (!name) return [];

    return [{
      name,
      kind: normalizeEntrypointKind(entry.kind),
      params: normalizeEntrypointParams(entry.params),
      return_type: readString(entry.return_type),
      permission: readString(entry.permission),
      read_keys: readStringArray(entry.read_keys),
      write_keys: readStringArray(entry.write_keys),
      access_hints_complete: readBoolean(entry.access_hints_complete),
      access_hints_skipped: readStringArray(entry.access_hints_skipped),
      triggers: Array.isArray(entry.triggers)
        ? entry.triggers.map((trigger) => formatTrigger(trigger)).filter((trigger): trigger is string => trigger !== null)
        : [],
    }];
  });
}

function normalizeManifest(value: unknown): LocalManifest | null {
  if (!isRecord(value)) return null;

  const accessHintsValue = isRecord(value.access_set_hints)
    ? {
        read_keys: readStringArray(value.access_set_hints.read_keys),
        write_keys: readStringArray(value.access_set_hints.write_keys),
      }
    : null;

  return {
    codeHash: readHashLiteral(value.code_hash),
    abiHash: readHashLiteral(value.abi_hash),
    compilerFingerprint: readString(value.compiler_fingerprint),
    featuresBitmap: readOptionalNumber(value.features_bitmap),
    accessHints: accessHintsValue,
    entrypoints: normalizeEntrypoints(value.entrypoints),
  };
}

function extractRegisterSmartContractCodeManifest(
  instruction: Pick<Instruction, 'kind' | 'box'>
): LocalManifest | null {
  const payload = unwrapVariantRecord(instruction.box.json.payload, 'RegisterSmartContractCode');
  if (!payload) return null;
  return normalizeManifest(payload.manifest);
}

function findRelatedManifest(
  currentInstruction: Pick<Instruction, 'kind' | 'box' | 'index'>,
  relatedInstructions: Instruction[],
  targetCodeHash: string | null
): LocalManifest | null {
  const manifests = relatedInstructions
    .filter((instruction) => resolveContractViewInstructionKind(instruction) === 'RegisterSmartContractCode')
    .map((instruction) => ({
      instruction,
      manifest: extractRegisterSmartContractCodeManifest(instruction),
    }))
    .filter((entry): entry is { instruction: Instruction, manifest: LocalManifest } => entry.manifest !== null);

  if (!manifests.length) return null;

  if (targetCodeHash) {
    const exact = manifests.find((entry) => entry.manifest.codeHash === targetCodeHash);
    if (exact) return exact.manifest;
  }

  if (manifests.length === 1) return manifests[0]?.manifest ?? null;

  const nearest = [...manifests].sort((left, right) => {
    const leftDistance = Math.abs(left.instruction.index - currentInstruction.index);
    const rightDistance = Math.abs(right.instruction.index - currentInstruction.index);
    return leftDistance - rightDistance;
  });
  return nearest[0]?.manifest ?? null;
}

function findRelatedBytecode(
  currentInstruction: Pick<Instruction, 'kind' | 'box' | 'index'>,
  relatedInstructions: Instruction[],
  targetCodeHash: string | null
): RegisterSmartContractBytesPayload | null {
  const candidates = relatedInstructions
    .filter((instruction) => resolveContractViewInstructionKind(instruction) === 'RegisterSmartContractBytes')
    .map((instruction) => ({
      instruction,
      payload: extractRegisterSmartContractBytesPayload(instruction),
    }))
    .filter(
      (entry): entry is { instruction: Instruction, payload: RegisterSmartContractBytesPayload } =>
        entry.payload !== null
    );

  if (!candidates.length) return null;

  const withBytes = candidates.filter(
    (entry): entry is { instruction: Instruction, payload: RegisterSmartContractBytesPayload & { codeBytes: Uint8Array } } =>
      entry.payload.codeBytes instanceof Uint8Array
  );

  if (targetCodeHash) {
    const exactWithBytes = withBytes.find((entry) => entry.payload.codeHash === targetCodeHash);
    if (exactWithBytes) return exactWithBytes.payload;

    const exact = candidates.find((entry) => entry.payload.codeHash === targetCodeHash);
    if (exact) return exact.payload;
  }

  if (withBytes.length === 1) return withBytes[0]?.payload ?? null;

  if (withBytes.length > 1) {
    const nearestLoaded = [...withBytes].sort((left, right) => {
      const leftDistance = Math.abs(left.instruction.index - currentInstruction.index);
      const rightDistance = Math.abs(right.instruction.index - currentInstruction.index);
      return leftDistance - rightDistance;
    });
    return nearestLoaded[0]?.payload ?? null;
  }

  if (candidates.length === 1) return candidates[0]?.payload ?? null;

  const nearest = [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(left.instruction.index - currentInstruction.index);
    const rightDistance = Math.abs(right.instruction.index - currentInstruction.index);
    return leftDistance - rightDistance;
  });
  return nearest[0]?.payload ?? null;
}

type LocalContractAnalysis = NonNullable<ContractCodeView['analysis']>;

interface LocalDisassembledInstruction {
  pc: number
  word: number
  mnemonic: string
  rendered: string
  targetPc: number | null
}

interface LocalDisassembly {
  instructions: LocalDisassembledInstruction[]
  labels: Set<number>
  analysis: LocalContractAnalysis
  warnings: string[]
}

const OPCODE_NAMES: Record<number, string> = {
  0x01: 'add',
  0x02: 'sub',
  0x03: 'and',
  0x04: 'or',
  0x05: 'xor',
  0x06: 'sll',
  0x07: 'srl',
  0x08: 'sra',
  0x09: 'slt',
  0x0a: 'sltu',
  0x0b: 'cmov',
  0x0c: 'not',
  0x0d: 'neg',
  0x0e: 'seq',
  0x0f: 'sne',
  0x10: 'mul',
  0x11: 'mulh',
  0x12: 'mulhu',
  0x13: 'mulhsu',
  0x14: 'div',
  0x15: 'divu',
  0x16: 'rem',
  0x17: 'remu',
  0x18: 'rotl',
  0x19: 'rotr',
  0x1a: 'popcnt',
  0x1b: 'clz',
  0x1c: 'ctz',
  0x1d: 'isqrt',
  0x1e: 'min',
  0x1f: 'max',
  0x20: 'addi',
  0x21: 'andi',
  0x22: 'ori',
  0x23: 'xori',
  0x24: 'cmovi',
  0x25: 'rotl_imm',
  0x26: 'rotr_imm',
  0x27: 'abs',
  0x28: 'div_ceil',
  0x29: 'gcd',
  0x2a: 'mean',
  0x30: 'load64',
  0x31: 'store64',
  0x32: 'load128',
  0x33: 'store128',
  0x40: 'beq',
  0x41: 'bne',
  0x42: 'blt',
  0x43: 'bge',
  0x44: 'bltu',
  0x45: 'bgeu',
  0x46: 'jal',
  0x47: 'jr',
  0x48: 'jalr',
  0x49: 'halt',
  0x4a: 'jmp',
  0x4b: 'jals',
  0x60: 'scall',
  0x61: 'getgas',
  0x62: 'system',
  0x70: 'vadd32',
  0x71: 'vadd64',
  0x72: 'vand',
  0x73: 'vxor',
  0x74: 'vor',
  0x75: 'vrot32',
  0x76: 'setvl',
  0x77: 'parbegin',
  0x78: 'parend',
  0x80: 'sha256block',
  0x81: 'sha3block',
  0x82: 'poseidon2',
  0x83: 'poseidon6',
  0x84: 'pubkgen',
  0x85: 'valcom',
  0x86: 'ecadd',
  0x87: 'ecmul_var',
  0x88: 'aesenc',
  0x89: 'aesdec',
  0x8a: 'blake2s',
  0x8b: 'ed25519verify',
  0x8c: 'ecdsaverify',
  0x8d: 'dilithiumverify',
  0x8e: 'pairing',
  0x8f: 'ed25519batchverify',
  0x90: 'msg_create',
  0x91: 'msg_clone',
  0x92: 'msg_set',
  0x93: 'msg_get',
  0x94: 'msg_add',
  0x95: 'msg_remove',
  0x96: 'msg_clear',
  0x97: 'msg_parse',
  0x98: 'msg_serialize',
  0x99: 'msg_validate',
  0x9a: 'msg_sign',
  0x9b: 'msg_verify_sig',
  0x9c: 'msg_send',
  0x9d: 'encode_str',
  0x9e: 'decode_str',
  0x9f: 'validate_format',
  0xa0: 'assert',
  0xa1: 'assert_eq',
  0xa2: 'fadd',
  0xa3: 'fsub',
  0xa4: 'fmul',
  0xa5: 'finv',
  0xa6: 'assert_range',
};

const SYSCALL_NAMES: Record<number, string> = {
  0x00: 'DEBUG_PRINT',
  0x01: 'EXIT',
  0x02: 'ABORT',
  0x03: 'DEBUG_LOG',
  0x10: 'REGISTER_DOMAIN',
  0x11: 'UNREGISTER_DOMAIN',
  0x12: 'TRANSFER_DOMAIN',
  0x13: 'REGISTER_ACCOUNT',
  0x14: 'UNREGISTER_ACCOUNT',
  0x15: 'REGISTER_PEER',
  0x16: 'UNREGISTER_PEER',
  0x17: 'ADD_SIGNATORY',
  0x18: 'REMOVE_SIGNATORY',
  0x19: 'SET_ACCOUNT_QUORUM',
  0x1a: 'SET_ACCOUNT_DETAIL',
  0x20: 'REGISTER_ASSET',
  0x21: 'UNREGISTER_ASSET',
  0x22: 'MINT_ASSET',
  0x23: 'BURN_ASSET',
  0x24: 'TRANSFER_ASSET',
  0x25: 'NFT_MINT_ASSET',
  0x26: 'NFT_TRANSFER_ASSET',
  0x27: 'NFT_SET_METADATA',
  0x28: 'NFT_BURN_ASSET',
  0x29: 'TRANSFER_V1_BATCH_BEGIN',
  0x2a: 'TRANSFER_V1_BATCH_END',
  0x2b: 'TRANSFER_V1_BATCH_APPLY',
  0x30: 'CREATE_ROLE',
  0x31: 'DELETE_ROLE',
  0x32: 'GRANT_ROLE',
  0x33: 'REVOKE_ROLE',
  0x34: 'GRANT_PERMISSION',
  0x35: 'REVOKE_PERMISSION',
  0x40: 'CREATE_TRIGGER',
  0x41: 'REMOVE_TRIGGER',
  0x42: 'SET_TRIGGER_ENABLED',
  0x43: 'DEACTIVATE_CONTRACT_INSTANCE',
  0x44: 'REMOVE_SMART_CONTRACT_BYTES',
  0x45: 'REGISTER_SMART_CONTRACT_CODE',
  0x46: 'REGISTER_SMART_CONTRACT_BYTES',
  0x47: 'ACTIVATE_CONTRACT_INSTANCE',
  0x50: 'STATE_GET',
  0x51: 'STATE_SET',
  0x52: 'STATE_DEL',
  0x53: 'DECODE_INT',
  0x54: 'BUILD_PATH_MAP_KEY',
  0x55: 'ENCODE_INT',
  0x56: 'BUILD_PATH_KEY_NORITO',
  0x57: 'JSON_ENCODE',
  0x58: 'JSON_DECODE',
  0x59: 'SCHEMA_ENCODE',
  0x5a: 'SCHEMA_DECODE',
  0x5b: 'SCHEMA_INFO',
  0x5c: 'NAME_DECODE',
  0x5d: 'POINTER_TO_NORITO',
  0x5e: 'POINTER_FROM_NORITO',
  0x5f: 'TLV_EQ',
  0x60: 'ZK_VERIFY_TRANSFER',
  0x61: 'ZK_VERIFY_UNSHIELD',
  0x62: 'ZK_VOTE_VERIFY_BALLOT',
  0x63: 'ZK_VOTE_VERIFY_TALLY',
  0x64: 'ZK_ROOTS_GET',
  0x65: 'ZK_VOTE_GET_TALLY',
  0x66: 'VRF_VERIFY',
  0x67: 'VRF_VERIFY_BATCH',
  0x68: 'ZK_VERIFY_BATCH',
  0x69: 'NUMERIC_FROM_INT',
  0x6a: 'NUMERIC_TO_INT',
  0x6b: 'NUMERIC_ADD',
  0x6c: 'NUMERIC_SUB',
  0x6d: 'NUMERIC_MUL',
  0x6e: 'NUMERIC_DIV',
  0x6f: 'NUMERIC_REM',
  0x70: 'NUMERIC_NEG',
  0x71: 'NUMERIC_EQ',
  0x72: 'NUMERIC_NE',
  0x73: 'NUMERIC_LT',
  0x74: 'NUMERIC_LE',
  0x75: 'NUMERIC_GT',
  0x76: 'NUMERIC_GE',
  0x77: 'TLV_LEN',
  0x78: 'JSON_GET_I64',
  0x79: 'JSON_GET_JSON',
  0x7a: 'JSON_GET_NAME',
  0x7b: 'JSON_GET_ACCOUNT_ID',
  0x7c: 'JSON_GET_NFT_ID',
  0x7d: 'JSON_GET_BLOB_HEX',
  0x7e: 'VRF_EPOCH_SEED',
  0x7f: 'JSON_GET_NUMERIC',
  0x80: 'JSON_GET_ASSET_DEFINITION_ID',
  0x81: 'JSON_OBJECT',
  0x82: 'JSON_SET_I64',
  0x83: 'JSON_SET_ACCOUNT_ID',
  0x84: 'JSON_GET_I64_DIRECT',
  0x85: 'JSON_GET_JSON_DIRECT',
  0x86: 'JSON_GET_NAME_DIRECT',
  0x87: 'JSON_GET_ACCOUNT_ID_DIRECT',
  0x88: 'JSON_GET_NFT_ID_DIRECT',
  0x89: 'JSON_GET_BLOB_HEX_DIRECT',
  0x8a: 'JSON_GET_NUMERIC_DIRECT',
  0x8b: 'JSON_GET_ASSET_DEFINITION_ID_DIRECT',
  0x8c: 'JSON_SET_I64_DIRECT',
  0x8d: 'JSON_SET_ACCOUNT_ID_DIRECT',
  0x8e: 'BUILD_PATH_KEY_NORITO_DIRECT',
  0x8f: 'SCHEMA_INFO_DIRECT',
  0x90: 'SM3_HASH',
  0x91: 'SM2_VERIFY',
  0x92: 'SM4_GCM_SEAL',
  0x93: 'SM4_GCM_OPEN',
  0x94: 'SM4_CCM_SEAL',
  0x95: 'SM4_CCM_OPEN',
  0x96: 'SHA256_HASH',
  0x97: 'SHA3_HASH',
  0x98: 'BLAKE2B256_HASH',
  0x99: 'KECCAK256_HASH',
  0x9a: 'IROHA_HASH',
  0xa0: 'SMARTCONTRACT_EXECUTE_INSTRUCTION',
  0xa1: 'SMARTCONTRACT_EXECUTE_QUERY',
  0xa2: 'CREATE_NFTS_FOR_ALL_USERS',
  0xa3: 'SET_SMARTCONTRACT_EXECUTION_DEPTH',
  0xa4: 'GET_AUTHORITY',
  0xa5: 'SUBSCRIPTION_BILL',
  0xa6: 'SUBSCRIPTION_RECORD_USAGE',
  0xa7: 'RESOLVE_ACCOUNT_ALIAS',
  0xa8: 'CURRENT_TIME_MS',
  0xa9: 'CALL_CONTRACT',
  0xaa: 'ANONYMOUS_ESCROW_OPEN_OFFER',
  0xab: 'ANONYMOUS_ESCROW_ACCEPT',
  0xac: 'ANONYMOUS_ESCROW_MARK_PAYMENT_SENT',
  0xad: 'ANONYMOUS_ESCROW_RELEASE',
  0xae: 'ANONYMOUS_ESCROW_CANCEL',
  0xaf: 'ANONYMOUS_ESCROW_OPEN_DISPUTE',
  0x01_0000: 'QUERY_EXECUTE_NORITO',
  0x01_0001: 'QUERY_GET_ACCOUNT',
  0x01_0002: 'QUERY_GET_ASSET',
  0x01_0003: 'QUERY_GET_ASSET_DEFINITION',
  0x01_0004: 'QUERY_GET_DOMAIN',
  0x01_0005: 'QUERY_GET_NFT',
  0x01_0006: 'QUERY_GET_PARAMETER',
  0x01_0007: 'QUERY_GET_CONTRACT_MANIFEST',
  0x01_0008: 'QUERY_GET_CONTRACT_INSTANCE',
  0x01_0020: 'SYSVAR_CHAIN_ID',
  0x01_0021: 'SYSVAR_BLOCK_HEIGHT',
  0x01_0022: 'SYSVAR_BLOCK_TIME_MS',
  0x01_0023: 'SYSVAR_AUTHORITY',
  0x01_0024: 'SYSVAR_CONTRACT_ADDRESS',
  0x01_0025: 'SYSVAR_ENTRYPOINT',
  0x01_0030: 'STATE_KEYS',
  0x01_0031: 'STATE_HAS',
  0x01_0032: 'STATE_LEN',
  0x01_0033: 'STATE_COUNT',
  0xb0: 'AXT_BEGIN',
  0xb1: 'AXT_TOUCH',
  0xb2: 'AXT_COMMIT',
  0xb3: 'VERIFY_DS_PROOF',
  0xb4: 'USE_ASSET_HANDLE',
  0xb8: 'ESCROW_OPEN_OFFER',
  0xb9: 'ESCROW_ACCEPT',
  0xba: 'ESCROW_MARK_PAYMENT_SENT',
  0xbb: 'ESCROW_RELEASE',
  0xbc: 'ESCROW_CANCEL',
  0xbd: 'ESCROW_OPEN_DISPUTE',
  0xbe: 'ESCROW_RESOLVE_DISPUTE',
  0xbf: 'ANONYMOUS_ESCROW_RESOLVE_DISPUTE',
  0xc0: 'SORACLOUD_READ_COMMITTED_STATE',
  0xc1: 'SORACLOUD_EMIT_STATE_MUTATION',
  0xc2: 'SORACLOUD_EMIT_MAILBOX_MESSAGE',
  0xc3: 'SORACLOUD_APPEND_JOURNAL',
  0xc4: 'SORACLOUD_PUBLISH_CHECKPOINT',
  0xc5: 'SORACLOUD_READ_SECRET',
  0xc6: 'SORACLOUD_READ_CREDENTIAL',
  0xc7: 'SORACLOUD_EGRESS_FETCH',
  0xc8: 'SORACLOUD_READ_CONFIG',
  0xc9: 'SORACLOUD_READ_SECRET_ENVELOPE',
  0xd0: 'SCHEMA_ENCODE_DIRECT',
  0xd1: 'SCHEMA_DECODE_DIRECT',
  0xd2: 'NUMERIC_TO_INT_DIRECT',
  0xd3: 'NUMERIC_ADD_DIRECT',
  0xd4: 'NUMERIC_SUB_DIRECT',
  0xd5: 'NUMERIC_MUL_DIRECT',
  0xd6: 'NUMERIC_DIV_DIRECT',
  0xd7: 'NUMERIC_REM_DIRECT',
  0xd8: 'NUMERIC_NEG_DIRECT',
  0xd9: 'NUMERIC_EQ_DIRECT',
  0xda: 'NUMERIC_NE_DIRECT',
  0xdb: 'NUMERIC_LT_DIRECT',
  0xdc: 'NUMERIC_LE_DIRECT',
  0xdd: 'NUMERIC_GT_DIRECT',
  0xde: 'NUMERIC_GE_DIRECT',
  0xe0: 'INPUT_PUBLISH_TLV',
  0xf0: 'ALLOC',
  0xf1: 'GET_PUBLIC_INPUT',
  0xf4: 'PROVE_EXECUTION',
  0xf5: 'GROW_HEAP',
  0xf6: 'VERIFY_PROOF',
  0xf7: 'GET_MERKLE_PATH',
  0xf9: 'GET_ACCOUNT_BALANCE',
  0xfa: 'GET_MERKLE_COMPACT',
  0xfb: 'USE_NULLIFIER',
  0xfc: 'VERIFY_SIGNATURE',
  0xfd: 'GET_PRIVATE_INPUT',
  0xfe: 'COMMIT_OUTPUT',
  0xff: 'GET_REGISTER_MERKLE_COMPACT',
  0x00fe_0001: 'KOTO_TEST_ACTOR_ACCOUNT',
  0x00fe_0002: 'KOTO_TEST_ACTOR_PUBLIC_KEY',
  0x00fe_0003: 'KOTO_TEST_ACTOR_SIGN',
  0x00fe_0004: 'KOTO_TEST_INVOKE_ENTRYPOINT_AS',
  0x00fe_0005: 'KOTO_TEST_EXPECT_REJECT_AS',
};

const ONE_SOURCE_ONE_DEST_OPCODES = new Set<number>([
  0x0c,
  0x0d,
  0x1a,
  0x1b,
  0x1c,
  0x1d,
  0x27,
]);

const IMMEDIATE_OPCODES = new Set<number>([0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26]);
const BRANCH_OPCODES = new Set<number>([0x40, 0x41, 0x42, 0x43, 0x44, 0x45]);
const JUMP_LINK_OPCODES = new Set<number>([0x46, 0x4b]);

function aggregatePermissions(entrypoints: ContractCodeView['entrypoints']): string[] {
  const permissions = new Set<string>();
  for (const entrypoint of entrypoints) {
    if (entrypoint.permission) permissions.add(entrypoint.permission);
  }
  return [...permissions];
}

function entrypointSignature(entrypoint: ContractCodeView['entrypoints'][number]): string {
  const params = entrypoint.params
    .map((param) => `${param.name}: ${param.type_name}`)
    .join(', ');
  const returnType = entrypoint.return_type ? ` -> ${entrypoint.return_type}` : '';
  return `${entrypoint.kind} fn ${entrypoint.name}(${params})${returnType}`;
}

function computeContractCodeHash(codeBytes: Uint8Array): string | null {
  if (codeBytes.length < IVM_HEADER_LEN) return null;
  return Hash.hash(Bytes.array(codeBytes.slice(IVM_HEADER_LEN))).payload.hex().toLowerCase();
}

function readU32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function readU64LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 8 > bytes.length) return null;

  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index]!) << BigInt(index * 8);
  }

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function readMagic(bytes: Uint8Array, offset: number): string | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!
  );
}

function parseLocalProgramMetadata(codeBytes: Uint8Array): LocalProgramMetadata | null {
  if (codeBytes.length < IVM_HEADER_LEN) return null;
  if (!IVM_MAGIC.every((value, index) => codeBytes[index] === value)) return null;

  const versionMajor = codeBytes[4]!;
  const versionMinor = codeBytes[5]!;
  const mode = codeBytes[6]!;
  const vectorLengthRaw = codeBytes[7]!;
  const maxCycles = readU64LE(codeBytes, 8) ?? 0;
  const abiVersion = codeBytes[16]!;

  let cursor = IVM_HEADER_LEN;
  const sections: string[] = [];

  const sectionMagic = readMagic(codeBytes, cursor);
  if (sectionMagic === CONTRACT_INTERFACE_SECTION_MAGIC) {
    const payloadLen = readU32LE(codeBytes, cursor + 4);
    if (payloadLen === null) return null;
    sections.push(`${CONTRACT_INTERFACE_SECTION_MAGIC}:${payloadLen}`);
    cursor += 8 + payloadLen;
  }

  const debugMagic = readMagic(codeBytes, cursor);
  if (debugMagic === CONTRACT_DEBUG_SECTION_MAGIC) {
    const payloadLen = readU32LE(codeBytes, cursor + 4);
    if (payloadLen === null) return null;
    sections.push(`${CONTRACT_DEBUG_SECTION_MAGIC}:${payloadLen}`);
    cursor += 8 + payloadLen;
  }

  const literalMagic = readMagic(codeBytes, cursor);
  if (literalMagic === LITERAL_SECTION_MAGIC) {
    const literalCount = readU32LE(codeBytes, cursor + 4);
    const postPad = readU32LE(codeBytes, cursor + 8);
    const dataLen = readU32LE(codeBytes, cursor + 12);
    if (literalCount === null || postPad === null || dataLen === null) return null;
    sections.push(`${LITERAL_SECTION_MAGIC}:${literalCount}`);
    cursor += 16 + (literalCount * 8) + postPad + dataLen;
  }

  const modeFlags: string[] = [];
  if ((mode & 0x01) !== 0) modeFlags.push('zk');
  if ((mode & 0x02) !== 0) modeFlags.push('vector');
  if ((mode & 0x04) !== 0) modeFlags.push('htm');

  return {
    versionMajor,
    versionMinor,
    abiVersion,
    mode: modeFlags,
    vectorLength: vectorLengthRaw === 0 ? null : vectorLengthRaw,
    maxCycles,
    codeOffset: Math.min(cursor, codeBytes.length),
    sections,
  };
}

function opcodeOf(word: number): number {
  return (word >>> 24) & 0xff;
}

function rdOf(word: number): number {
  return (word >>> 16) & 0xff;
}

function rs1Of(word: number): number {
  return (word >>> 8) & 0xff;
}

function rs2Of(word: number): number {
  return word & 0xff;
}

function syscallxOf(word: number): number {
  return word & 0x00ff_ffff;
}

function imm8Of(word: number): number {
  const value = word & 0xff;
  return value & 0x80 ? value - 0x100 : value;
}

function imm16Of(word: number): number {
  const value = word & 0xffff;
  return value & 0x8000 ? value - 0x1_0000 : value;
}

function formatRegister(index: number): string {
  return `r${index}`;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return value.toString();
}

function formatWord(word: number): string {
  return `0x${word.toString(16).padStart(8, '0')}`;
}

function formatProgramOffset(value: number): string {
  if (value < 0) return `-0x${Math.abs(value).toString(16)}`;
  return `0x${value.toString(16).padStart(4, '0')}`;
}

function formatLabel(pc: number): string {
  return `L${pc.toString(16).padStart(4, '0')}`;
}

function isValidCodeTarget(targetPc: number, codeLength: number): boolean {
  return targetPc >= 0 && targetPc < codeLength && targetPc % 4 === 0;
}

function formatTarget(targetPc: number, codeLength: number): string {
  return isValidCodeTarget(targetPc, codeLength) ? formatLabel(targetPc) : formatProgramOffset(targetPc);
}

function formatMemory(base: number, imm: number): string {
  if (imm === 0) return `[${formatRegister(base)}]`;
  const operator = imm < 0 ? '-' : '+';
  return `[${formatRegister(base)} ${operator} ${Math.abs(imm)}]`;
}

function resolveSyscallName(number: number): string | null {
  return SYSCALL_NAMES[number] ?? null;
}

function pushWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function disassembleInstruction(
  word: number,
  pc: number,
  codeLength: number,
  warnings: string[],
  memory: LocalContractAnalysis['memory'],
  syscallCounts: Map<number, number>
): LocalDisassembledInstruction {
  const opcode = opcodeOf(word);
  const mnemonic = OPCODE_NAMES[opcode];
  let targetPc: number | null = null;
  let rendered = '';

  if (!mnemonic) {
    pushWarning(warnings, `Unknown opcode 0x${opcode.toString(16).padStart(2, '0')} at pc ${formatProgramOffset(pc)}.`);
    return {
      pc,
      word,
      mnemonic: 'unknown',
      rendered: `.word ${formatWord(word)}`,
      targetPc: null,
    };
  }

  if (BRANCH_OPCODES.has(opcode)) {
    const left = rdOf(word);
    const right = rs1Of(word);
    targetPc = pc + (imm8Of(word) * 4);
    rendered = `${mnemonic} ${formatRegister(left)}, ${formatRegister(right)}, ${formatTarget(targetPc, codeLength)}`;
  } else if (JUMP_LINK_OPCODES.has(opcode)) {
    const dest = rdOf(word);
    targetPc = pc + (imm16Of(word) * 4);
    rendered = `${mnemonic} ${formatRegister(dest)}, ${formatTarget(targetPc, codeLength)}`;
  } else {
    switch (opcode) {
      case 0x30: {
        memory.load64 += 1;
        const dest = rdOf(word);
        const base = rs1Of(word);
        rendered = `${mnemonic} ${formatRegister(dest)}, ${formatMemory(base, imm8Of(word))}`;
        break;
      }
      case 0x31: {
        memory.store64 += 1;
        const base = rdOf(word);
        const source = rs1Of(word);
        rendered = `${mnemonic} ${formatMemory(base, imm8Of(word))}, ${formatRegister(source)}`;
        break;
      }
      case 0x32: {
        memory.load128 += 1;
        const destLo = rdOf(word);
        const base = rs1Of(word);
        const destHi = rs2Of(word);
        rendered = `${mnemonic} ${formatRegister(destLo)}:${formatRegister(destHi)}, ${formatMemory(base, 0)}`;
        break;
      }
      case 0x33: {
        memory.store128 += 1;
        const base = rdOf(word);
        const sourceLo = rs1Of(word);
        const sourceHi = rs2Of(word);
        rendered = `${mnemonic} ${formatMemory(base, 0)}, ${formatRegister(sourceLo)}:${formatRegister(sourceHi)}`;
        break;
      }
      case 0x47:
        rendered = `${mnemonic} ${formatRegister(rdOf(word))}`;
        break;
      case 0x48:
        rendered = `${mnemonic} ${formatRegister(rdOf(word))}, ${formatRegister(rs1Of(word))}, ${formatSigned(imm8Of(word))}`;
        break;
      case 0x49:
      case 0x77:
      case 0x78:
        rendered = mnemonic;
        break;
      case 0x4a:
        targetPc = pc + (imm16Of(word) * 4);
        rendered = `${mnemonic} ${formatTarget(targetPc, codeLength)}`;
        break;
      case 0x60: {
        const number = rs2Of(word);
        syscallCounts.set(number, (syscallCounts.get(number) ?? 0) + 1);
        const syscallName = resolveSyscallName(number);
        rendered = syscallName
          ? `${mnemonic} 0x${number.toString(16).padStart(2, '0')} ; ${syscallName}`
          : `${mnemonic} 0x${number.toString(16).padStart(2, '0')}`;
        break;
      }
      case 0x62: {
        const number = syscallxOf(word);
        syscallCounts.set(number, (syscallCounts.get(number) ?? 0) + 1);
        const syscallName = resolveSyscallName(number);
        rendered = syscallName
          ? `${mnemonic} 0x${number.toString(16).padStart(2, '0')} ; ${syscallName}`
          : `${mnemonic} 0x${number.toString(16).padStart(2, '0')}`;
        break;
      }
      case 0x61:
        rendered = `${mnemonic} ${formatRegister(rdOf(word))}`;
        break;
      case 0x76: {
        const vectorLength = rs2Of(word) === 0 ? 1 : rs2Of(word);
        rendered = `${mnemonic} ${vectorLength}`;
        break;
      }
      default:
        if (ONE_SOURCE_ONE_DEST_OPCODES.has(opcode)) {
          rendered = `${mnemonic} ${formatRegister(rdOf(word))}, ${formatRegister(rs1Of(word))}`;
        } else if (IMMEDIATE_OPCODES.has(opcode)) {
          rendered = `${mnemonic} ${formatRegister(rdOf(word))}, ${formatRegister(rs1Of(word))}, ${formatSigned(imm8Of(word))}`;
        } else {
          rendered = `${mnemonic} ${formatRegister(rdOf(word))}, ${formatRegister(rs1Of(word))}, ${formatRegister(rs2Of(word))}`;
        }
        break;
    }
  }

  return {
    pc,
    word,
    mnemonic,
    rendered,
    targetPc,
  };
}

function disassembleProgram(codeBytes: Uint8Array, metadata: LocalProgramMetadata | null): LocalDisassembly | null {
  const codeOffset = metadata?.codeOffset ?? Math.min(IVM_HEADER_LEN, codeBytes.length);
  const code = codeBytes.slice(codeOffset);
  const warnings: string[] = [];
  const memory = {
    load64: 0,
    store64: 0,
    load128: 0,
    store128: 0,
  };
  const syscallCounts = new Map<number, number>();

  if (!code.length) {
    return {
      instructions: [],
      labels: new Set([0]),
      analysis: {
        instruction_count: 0,
        memory,
        syscalls: [],
      },
      warnings,
    };
  }

  const trailingBytes = code.length % 4;
  if (trailingBytes !== 0) {
    pushWarning(
      warnings,
      `Code section has ${trailingBytes} trailing byte(s) past the last full 32-bit instruction word.`
    );
  }

  const fullWordBytes = code.length - trailingBytes;
  const instructions: LocalDisassembledInstruction[] = [];
  for (let offset = 0; offset < fullWordBytes; offset += 4) {
    const word = readU32LE(code, offset);
    if (word === null) break;
    instructions.push(
      disassembleInstruction(word, offset, fullWordBytes, warnings, memory, syscallCounts)
    );
  }

  const labels = new Set<number>([0]);
  for (const instruction of instructions) {
    if (instruction.targetPc !== null && isValidCodeTarget(instruction.targetPc, fullWordBytes)) {
      labels.add(instruction.targetPc);
    }
  }

  return {
    instructions,
    labels,
    analysis: {
      instruction_count: instructions.length,
      memory,
      syscalls: [...syscallCounts.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([number, count]) => ({
          number,
          name: resolveSyscallName(number),
          count,
        })),
    },
    warnings,
  };
}

function renderPseudoSource(options: {
  codeHash: string
  declaredCodeHash: string | null
  manifest: LocalManifest | null
  byteLength: number | null
  metadata: LocalProgramMetadata | null
  disassembly: LocalDisassembly | null
  warnings: string[]
  activation: ActivateContractInstancePayload | null
}): string {
  const contractName = `Contract_${options.codeHash.slice(0, 8)}`;
  const lines = [
    `contract ${contractName} {`,
    '  // Decompiled locally in the browser from historical transaction payloads.',
    `  // code_hash: ${options.codeHash}`,
  ];

  if (options.declaredCodeHash && options.declaredCodeHash !== options.codeHash) {
    lines.push(`  // declared_code_hash: ${options.declaredCodeHash}`);
  }

  if (options.manifest?.abiHash) {
    lines.push(`  // abi_hash: ${options.manifest.abiHash}`);
  }
  if (options.manifest?.compilerFingerprint) {
    lines.push(`  // compiler_fingerprint: ${options.manifest.compilerFingerprint}`);
  }
  if (options.manifest?.featuresBitmap !== null && options.manifest?.featuresBitmap !== undefined) {
    lines.push(`  // features_bitmap: 0x${options.manifest.featuresBitmap.toString(16)}`);
  }
  if (options.byteLength !== null) {
    lines.push(`  // artifact_bytes: ${options.byteLength}`);
  }
  if (options.metadata) {
    const mode = options.metadata.mode.length ? options.metadata.mode.join(', ') : 'none';
    lines.push(
      `  // ivm_header: v${options.metadata.versionMajor}.${options.metadata.versionMinor}, abi=${options.metadata.abiVersion}, mode=${mode}, code_offset=${options.metadata.codeOffset}`
    );
    if (options.metadata.vectorLength !== null) {
      lines.push(`  // vector_length: ${options.metadata.vectorLength}`);
    }
    if (options.metadata.maxCycles > 0) {
      lines.push(`  // max_cycles: ${options.metadata.maxCycles}`);
    }
    if (options.metadata.sections.length) {
      lines.push(`  // sections: ${options.metadata.sections.join(', ')}`);
    }
  }
  if (options.activation?.contractAddress) {
    lines.push(`  // contract_address: ${options.activation.contractAddress}`);
  }
  if (options.activation?.contractAlias) {
    lines.push(`  // contract_alias: ${options.activation.contractAlias}`);
  }
  if (options.activation?.dataspace) {
    lines.push(`  // dataspace: ${options.activation.dataspace}`);
  }
  if (!options.activation?.contractAddress && options.activation?.namespace && options.activation?.contractId) {
    lines.push(`  // activated_as: ${options.activation.namespace}.${options.activation.contractId}`);
  }

  for (const warning of options.warnings) {
    lines.push(`  // warning: ${warning}`);
  }

  if (options.manifest?.entrypoints.length) {
    lines.push('');
    lines.push('  // Entry points declared in the companion manifest:');
    for (const entrypoint of options.manifest.entrypoints) {
      lines.push(`  // ${entrypointSignature(entrypoint)}`);
      if (entrypoint.permission) lines.push(`  //   permission: ${entrypoint.permission}`);
      if (entrypoint.read_keys.length) lines.push(`  //   reads: ${entrypoint.read_keys.join(', ')}`);
      if (entrypoint.write_keys.length) lines.push(`  //   writes: ${entrypoint.write_keys.join(', ')}`);
      if (entrypoint.triggers.length) lines.push(`  //   triggers: ${entrypoint.triggers.join(', ')}`);
      if (entrypoint.access_hints_skipped.length) {
        lines.push(`  //   skipped access hints: ${entrypoint.access_hints_skipped.join(', ')}`);
      }
    }
  } else {
    lines.push('');
    lines.push('  // Entrypoint metadata is unavailable in this transaction, so only raw code flow is shown.');
  }

  lines.push('');
  lines.push('  asm {');
  if (options.disassembly?.instructions.length) {
    for (const instruction of options.disassembly.instructions) {
      if (options.disassembly.labels.has(instruction.pc)) {
        lines.push(`    ${formatLabel(instruction.pc)}:`);
      }
      lines.push(`      ${instruction.rendered}`);
    }
  } else {
    lines.push('    // No executable 32-bit instruction words could be decoded from this artifact.');
  }
  lines.push('  }');

  lines.push('}');
  return lines.join('\n');
}

function renderManifestStub(codeHash: string, manifest: LocalManifest | null, warnings: string[]): string {
  const contractName = `ManifestStub_${codeHash.slice(0, 8)}`;
  const lines = [
    `contract ${contractName} {`,
    '  // Decompiled bytes are unavailable in this transaction; showing manifest hints only.',
    `  // code_hash: ${codeHash}`,
  ];

  if (manifest?.abiHash) lines.push(`  // abi_hash: ${manifest.abiHash}`);
  if (manifest?.compilerFingerprint) lines.push(`  // compiler_fingerprint: ${manifest.compilerFingerprint}`);
  if (manifest?.featuresBitmap !== null && manifest?.featuresBitmap !== undefined) {
    lines.push(`  // features_bitmap: 0x${manifest.featuresBitmap.toString(16)}`);
  }
  for (const entrypoint of manifest?.entrypoints ?? []) {
    lines.push(`  // entrypoint: ${entrypointSignature(entrypoint)}`);
  }
  for (const warning of warnings) {
    lines.push(`  // warning: ${warning}`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function buildLocalContractCodeView(options: BuildLocalContractCodeViewOptions): ContractCodeView | null {
  const instruction = options.instruction;
  if (!instruction) return null;

  const instructionKind = resolveContractViewInstructionKind(instruction);
  if (!instructionKind) return null;

  const relatedInstructions = options.relatedInstructions ?? [];
  const warnings: string[] = [];

  let manifest = extractRegisterSmartContractCodeManifest(instruction);
  let bytecode = extractRegisterSmartContractBytesPayload(instruction);
  const activation = instructionKind === 'ActivateContractInstance'
    ? extractActivateContractInstancePayload(instruction)
    : null;

  let declaredCodeHash = bytecode?.codeHash ?? manifest?.codeHash ?? activation?.codeHash ?? null;

  if (!manifest) {
    manifest = findRelatedManifest(instruction, relatedInstructions, declaredCodeHash);
  }
  if (!bytecode) {
    bytecode = findRelatedBytecode(instruction, relatedInstructions, declaredCodeHash);
  }
  if (!declaredCodeHash) {
    declaredCodeHash = manifest?.codeHash ?? bytecode?.codeHash ?? activation?.codeHash ?? null;
  }

  const codeBytes = bytecode?.codeBytes ?? null;
  const byteLength = codeBytes?.length ?? null;
  const computedCodeHash = codeBytes ? computeContractCodeHash(codeBytes) : null;
  const codeHash = computedCodeHash ?? declaredCodeHash;

  if (!codeHash) return null;

  if (declaredCodeHash && computedCodeHash && declaredCodeHash !== computedCodeHash) {
    warnings.push('Declared code hash does not match the browser-computed artifact hash.');
  }
  if (instructionKind === 'RegisterSmartContractBytes' && !manifest) {
    warnings.push('Companion RegisterSmartContractCode manifest metadata was not found in the loaded transaction instructions.');
  }
  if ((instructionKind === 'RegisterSmartContractCode' || instructionKind === 'ActivateContractInstance') && !codeBytes) {
    warnings.push('Contract bytes are not present in the loaded transaction instructions, so only manifest hints can be shown.');
  }

  const metadata = codeBytes ? parseLocalProgramMetadata(codeBytes) : null;
  if (codeBytes && !metadata) {
    warnings.push('Artifact does not look like a self-describing IVM bytecode image.');
  }
  if (codeBytes && codeBytes.length < IVM_HEADER_LEN) {
    warnings.push('Artifact is shorter than the minimum IVM header length, so only partial decoding is possible.');
  }
  const disassembly = codeBytes ? disassembleProgram(codeBytes, metadata) : null;
  for (const warning of disassembly?.warnings ?? []) {
    pushWarning(warnings, warning);
  }

  const baseView: ContractCodeView = {
    code_hash: codeHash,
    declared_code_hash: declaredCodeHash,
    abi_hash: manifest?.abiHash ?? null,
    compiler_fingerprint: manifest?.compilerFingerprint ?? null,
    byte_len: byteLength,
    permissions: aggregatePermissions(manifest?.entrypoints ?? []),
    access_hints: manifest?.accessHints ?? null,
    entrypoints: manifest?.entrypoints ?? [],
    analysis: disassembly?.analysis ?? null,
    warnings,
    rendered_source_kind: codeBytes ? 'pseudo_source' : 'manifest_stub',
    rendered_source_text: codeBytes
      ? renderPseudoSource({
          codeHash,
          declaredCodeHash,
          manifest,
          byteLength,
          metadata,
          disassembly,
          warnings,
          activation,
        })
      : renderManifestStub(codeHash, manifest, warnings),
    verified_source_ref: null,
  };

  if (options.verifiedSourceText) {
    return {
      ...baseView,
      rendered_source_kind: 'verified_source',
      rendered_source_text: options.verifiedSourceText,
      verified_source_ref: options.verifiedSourceRef ?? null,
    };
  }

  return baseView;
}

export interface BuildLocalContractCodeViewOptions {
  instruction: Instruction | null | undefined
  relatedInstructions?: Instruction[] | null
  verifiedSourceText?: string | null
  verifiedSourceRef?: ContractVerifiedSourceRef | null
}
