import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { blake3 } from '@noble/hashes/blake3.js';
import { buildLocalContractCodeView } from './contract-view';
import { compileKotodamaStudioProgram } from './kotodama-studio-compiler';
import { renderCanonicalAccountIdLiteralFromPublicKeyLiteral } from './account-literal';
import type { Instruction } from '@/shared/api/schemas';

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

const TEST_NORITO_MAGIC = Uint8Array.from([0x4e, 0x52, 0x54, 0x30]);
const TEST_NORITO_HEADER_FLAG_COMPACT_LEN = 0x02;
const TEST_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TEST_ASSET_DEFINITION_ADDRESS_VERSION = 1;
const TEST_CREATE_ELECTION_TYPE_NAME = 'iroha_data_model::isi::zk::CreateElection';
const TEST_SUBMIT_BALLOT_TYPE_NAME = 'iroha_data_model::isi::zk::SubmitBallot';
const TEST_FINALIZE_ELECTION_TYPE_NAME = 'iroha_data_model::isi::zk::FinalizeElection';
const TEST_UNSHIELD_TYPE_NAME = 'iroha_data_model::isi::zk::Unshield';
const SAMPLE_ASSET_DEFINITION_BYTES = Uint8Array.from([
  0x10, 0x20, 0x30, 0x40,
  0x50, 0x60, 0x4a, 0x70,
  0x88, 0xaa, 0xbb, 0xcc,
  0xdd, 0xee, 0x01, 0x02,
]);
const SAMPLE_ED25519_PUBLIC_KEY = 'ed01201509A611AD6D97B01D871E58ED00C8FD7C3917B6CA61A8C2833A19E000AAC2E4';
const SAMPLE_SECP256K1_PUBLIC_KEY = 'e701210312273E8810581E58948D3FB8F9E8AD53AAA21492EBB8703915BBB565A21B7FCC';
const HASH_LITERAL_PATTERN = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const PUBLIC_MANIFEST_KIND = { kind: 'Public', value: null } as const;
const VIEW_MANIFEST_KIND = { kind: 'View', value: null } as const;
const KAIZEN_MANIFEST_KIND = { kind: 'Kaizen', value: null } as const;
const UPSTREAM_KOTODAMA_SAMPLE_DIR = path.resolve(process.cwd(), '../iroha/crates/kotodama_lang/src/samples');
const UPSTREAM_IVM_TEST_DATA_DIR = path.resolve(process.cwd(), '../iroha/crates/ivm/tests/data');
const UPSTREAM_IVM_DOC_EXAMPLES_DIR = path.resolve(process.cwd(), '../iroha/crates/ivm/docs/examples');
const UPSTREAM_KOTODAMA_ZK_ATTACHMENTS_DIR = path.resolve(process.cwd(), '../iroha/fuzz/attachments/zk/kotodama');
const UPSTREAM_EXAMPLES_DIR = path.resolve(process.cwd(), '../iroha/examples');

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function littleEndianU32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function littleEndianU64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function littleEndianU128(value: bigint): Uint8Array {
  let remaining = value;
  const out = new Uint8Array(16);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
}

function compactLength(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

function encodeNoritoLength(value: number, flags = 0): Uint8Array {
  return (flags & TEST_NORITO_HEADER_FLAG_COMPACT_LEN) === 0
    ? littleEndianU64(BigInt(value))
    : compactLength(value);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function readLiteralSectionEntries(artifactBytes: Uint8Array): Array<{ typeId: number, payload: Uint8Array }> {
  const contractPayloadLength = readU32LE(artifactBytes, 21);
  let literalSectionOffset = 17 + 8 + contractPayloadLength;
  const nextSectionMagic = new TextDecoder().decode(artifactBytes.slice(literalSectionOffset, literalSectionOffset + 4));
  if (nextSectionMagic === 'DBG1') {
    literalSectionOffset += 8 + readU32LE(artifactBytes, literalSectionOffset + 4);
  }
  const entryCount = readU32LE(artifactBytes, literalSectionOffset + 4);
  const literalDataLength = readU32LE(artifactBytes, literalSectionOffset + 12);
  const literalDataOffset = literalSectionOffset + 16 + entryCount * 8;
  const literalData = artifactBytes.slice(literalDataOffset, literalDataOffset + literalDataLength);
  const entries: Array<{ typeId: number, payload: Uint8Array }> = [];
  let offset = 0;
  while (offset + 39 <= literalData.length) {
    const typeId = new DataView(literalData.buffer, literalData.byteOffset, literalData.byteLength).getUint16(offset, false);
    const payloadLength = readU32BE(literalData, offset + 3);
    const payloadOffset = offset + 7;
    entries.push({
      typeId,
      payload: literalData.slice(payloadOffset, payloadOffset + payloadLength),
    });
    offset += 7 + payloadLength + 32;
  }
  return entries;
}

function readArtifactCode(artifactBytes: Uint8Array): Uint8Array {
  let offset = 17;
  while (offset + 8 <= artifactBytes.length) {
    const magic = new TextDecoder().decode(artifactBytes.slice(offset, offset + 4));
    if (magic === 'CNTR' || magic === 'DBG1') {
      offset += 8 + readU32LE(artifactBytes, offset + 4);
      continue;
    }
    if (magic === 'LTLB') {
      const entryCount = readU32LE(artifactBytes, offset + 4);
      const postPad = readU32LE(artifactBytes, offset + 8);
      const literalDataLength = readU32LE(artifactBytes, offset + 12);
      offset += 16 + entryCount * 8 + literalDataLength + postPad;
      continue;
    }
    break;
  }
  return artifactBytes.slice(offset);
}

function encodeStructField(payload: Uint8Array, flags = 0): Uint8Array {
  return concatBytes(encodeNoritoLength(payload.length, flags), payload);
}

function encodeNoritoStringBare(value: string, flags = 0): Uint8Array {
  const bytes = encodeUtf8(value);
  return concatBytes(encodeNoritoLength(bytes.length, flags), bytes);
}

function encodeNoritoU8VecBare(value: Uint8Array, flags = 0): Uint8Array {
  return concatBytes(
    littleEndianU64(BigInt(value.length)),
    ...Array.from(value, (byte) => encodeStructField(Uint8Array.from([byte]), flags))
  );
}

function encodeNoritoBytesBare(value: Uint8Array, flags = 0): Uint8Array {
  return concatBytes(encodeNoritoLength(value.length, flags), value);
}

function encodeNoritoVecBare(items: Uint8Array[], flags = 0): Uint8Array {
  return concatBytes(
    littleEndianU64(BigInt(items.length)),
    ...items.map((item) => encodeStructField(item, flags))
  );
}

function encodeNoritoOptionBare(value: Uint8Array | null, flags = 0): Uint8Array {
  return value === null
    ? Uint8Array.from([0])
    : concatBytes(Uint8Array.from([1]), encodeStructField(value, flags));
}

function encodeNoritoEnumVariantBare(tag: number, payload?: Uint8Array): Uint8Array {
  if (payload === undefined) return littleEndianU32(tag);
  return concatBytes(
    littleEndianU32(tag),
    littleEndianU64(BigInt(payload.length)),
    payload
  );
}

function encodeNoritoEnumVariant(tag: number, payload?: Uint8Array, flags = 0): Uint8Array {
  if (payload === undefined) return littleEndianU32(tag);
  return concatBytes(
    littleEndianU32(tag),
    encodeNoritoLength(payload.length, flags),
    payload
  );
}

function encodeNoritoTopLevel(payload: Uint8Array, typeName = 'test::Payload', flags = 0): Uint8Array {
  return concatBytes(
    TEST_NORITO_MAGIC,
    Uint8Array.from([0, 0]),
    new Uint8Array(16),
    Uint8Array.from([0]),
    littleEndianU64(BigInt(payload.length)),
    littleEndianU64(BigInt(typeName.length)),
    Uint8Array.from([flags]),
    payload
  );
}

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits: number[] = [0];
  for (const value of bytes) {
    let carry = value;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index]! * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leadingZeroCount = 0;
  while (leadingZeroCount < bytes.length && bytes[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }
  let output = '1'.repeat(leadingZeroCount);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += TEST_BASE58_ALPHABET[digits[index]!]!;
  }
  return output;
}

function makeCanonicalAssetDefinitionLiteral(aidBytes: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = TEST_ASSET_DEFINITION_ADDRESS_VERSION;
  payload.set(aidBytes, 1);
  payload.set(blake3(payload.slice(0, 17)).slice(0, 4), 17);
  return encodeBase58(payload);
}

function encodeNameBare(value: string, flags = 0): Uint8Array {
  return encodeNoritoStringBare(value, flags);
}

function encodeDomainIdBare(value: string, flags = 0): Uint8Array {
  return encodeStructField(encodeNameBare(value, flags), flags);
}

function encodeRoleIdBare(value: string, flags = 0): Uint8Array {
  return encodeStructField(encodeNameBare(value, flags), flags);
}

function encodeAccountIdBare(publicKey: string): Uint8Array {
  return encodeNoritoEnumVariantBare(0, encodeNoritoStringBare(publicKey));
}

function encodeAccountIdCompact(publicKey: string): Uint8Array {
  const normalized = publicKey.toLowerCase();
  if (!/^ed0120[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error('compact account-id test fixture must use an ed25519 public key');
  }
  const compactPublicKey = concatBytes(
    Uint8Array.from([0]),
    hexToBytes(normalized.slice(6))
  );
  return encodeNoritoEnumVariant(
    0,
    encodeNoritoU8VecBare(compactPublicKey, TEST_NORITO_HEADER_FLAG_COMPACT_LEN),
    TEST_NORITO_HEADER_FLAG_COMPACT_LEN
  );
}

function encodeAccountIdBareWithFlags(publicKey: string, flags = 0): Uint8Array {
  return (flags & TEST_NORITO_HEADER_FLAG_COMPACT_LEN) === 0
    ? encodeAccountIdBare(publicKey)
    : encodeAccountIdCompact(publicKey);
}

function encodeTriggerIdBare(value: string, flags = 0): Uint8Array {
  return encodeStructField(encodeNameBare(value, flags), flags);
}

function encodeAssetDefinitionIdBare(aidBytes: Uint8Array): Uint8Array {
  return Uint8Array.from(aidBytes);
}

function encodeNftIdBare(name: string, domain: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeDomainIdBare(domain, flags), flags),
    encodeStructField(encodeNameBare(name, flags), flags)
  );
}

function encodePermissionBare(
  name: string,
  options: { includePayload?: boolean, extraFields?: Uint8Array[], flags?: number } = {}
): Uint8Array {
  const flags = options.flags ?? 0;
  const fields = [
    encodeStructField(encodeNoritoStringBare(name, flags), flags),
  ];
  if (options.includePayload ?? true) {
    fields.push(encodeStructField(encodeNoritoStringBare('{}', flags), flags));
  }
  for (const field of options.extraFields ?? []) {
    fields.push(encodeStructField(field, flags));
  }
  return concatBytes(...fields);
}

function encodeDataSpaceIdBare(value: number | bigint): Uint8Array {
  return littleEndianU64(BigInt(value));
}

function encodeAssetBalanceScopeBare(scope?: number | bigint, flags = 0): Uint8Array {
  if (scope === undefined) return encodeNoritoEnumVariant(0, undefined, flags);
  return encodeNoritoEnumVariant(1, encodeDataSpaceIdBare(scope), flags);
}

function encodeAssetIdBare(
  definitionBytes: Uint8Array,
  accountPublicKey: string,
  scope?: number | bigint,
  flags = 0
): Uint8Array {
  return concatBytes(
    encodeStructField(encodeAccountIdBareWithFlags(accountPublicKey, flags), flags),
    encodeStructField(encodeAssetDefinitionIdBare(definitionBytes), flags),
    encodeStructField(encodeAssetBalanceScopeBare(scope, flags), flags)
  );
}

function toHexLiteral(bytes: Uint8Array): string {
  return `0x${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function hexToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    out[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return out;
}

function encodeInstructionLiteral(wireId: string, payload: Uint8Array, flags = 0, outerFlags = 0): string {
  const framedPayload = encodeNoritoTopLevel(payload, wireId, flags);
  const pair = concatBytes(
    encodeStructField(encodeNoritoStringBare(wireId, outerFlags), outerFlags),
    encodeStructField(encodeNoritoBytesBare(framedPayload, outerFlags), outerFlags)
  );
  return toHexLiteral(encodeNoritoTopLevel(pair, 'InstructionBox', outerFlags));
}

function encodeSetKeyValueInstructionLiteral(
  tag: number,
  object: Uint8Array,
  key: string,
  options: { includeValue?: boolean, extraFields?: Uint8Array[], flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const fields = [
    encodeStructField(object, flags),
    encodeStructField(encodeNameBare(key, flags), flags),
  ];
  if (options.includeValue ?? true) {
    fields.push(encodeStructField(encodeNoritoStringBare('{"ok":true}', flags), flags));
  }
  for (const field of options.extraFields ?? []) {
    fields.push(encodeStructField(field, flags));
  }
  const payload = encodeNoritoEnumVariant(tag, concatBytes(
    ...fields
  ), flags);
  return encodeInstructionLiteral('iroha.set_key_value', payload, flags, options.outerFlags ?? 0);
}

function encodeRemoveKeyValueInstructionLiteral(
  tag: number,
  object: Uint8Array,
  key: string,
  options: { extraFields?: Uint8Array[], flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = encodeNoritoEnumVariant(tag, concatBytes(
    encodeStructField(object, flags),
    encodeStructField(encodeNameBare(key, flags), flags),
    ...(options.extraFields ?? []).map((field) => encodeStructField(field, flags))
  ), flags);
  return encodeInstructionLiteral('iroha.remove_key_value', payload, flags, options.outerFlags ?? 0);
}

function encodeSetAssetKeyValueInstructionLiteral(options: {
  definitionBytes: Uint8Array
  accountPublicKey: string
  key: string
  scope?: number | bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeAssetIdBare(options.definitionBytes, options.accountPublicKey, options.scope, flags), flags),
    encodeStructField(encodeNameBare(options.key, flags), flags),
    encodeStructField(encodeNoritoStringBare('{"ok":true}', flags), flags)
  );
  return encodeInstructionLiteral('iroha_data_model::isi::transparent::SetAssetKeyValue', payload, flags, options.outerFlags ?? 0);
}

function encodeRemoveAssetKeyValueInstructionLiteral(options: {
  definitionBytes: Uint8Array
  accountPublicKey: string
  key: string
  scope?: number | bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeAssetIdBare(options.definitionBytes, options.accountPublicKey, options.scope, flags), flags),
    encodeStructField(encodeNameBare(options.key, flags), flags)
  );
  return encodeInstructionLiteral('iroha_data_model::isi::transparent::RemoveAssetKeyValue', payload, flags, options.outerFlags ?? 0);
}

function encodeGrantRolePermissionInstructionLiteral(
  role: string,
  permission: string,
  options: Uint8Array[] | { extraFields?: Uint8Array[], flags?: number, outerFlags?: number } = []
): string {
  const resolved = Array.isArray(options) ? { extraFields: options } : options;
  const flags = resolved.flags ?? 0;
  const payload = encodeNoritoEnumVariant(2, concatBytes(
    encodeStructField(encodePermissionBare(permission, { flags }), flags),
    encodeStructField(encodeRoleIdBare(role, flags), flags),
    ...(resolved.extraFields ?? []).map((field) => encodeStructField(field, flags))
  ), flags);
  return encodeInstructionLiteral('iroha.grant', payload, flags, resolved.outerFlags ?? 0);
}

interface PermissionInstructionOptions {
  permissionOptions?: { includePayload?: boolean, extraFields?: Uint8Array[], flags?: number }
  extraFields?: Uint8Array[]
  flags?: number
  outerFlags?: number
}

function encodeGrantAccountPermissionInstructionLiteral(
  publicKey: string,
  permission: string,
  options: PermissionInstructionOptions = {}
): string {
  const flags = options.flags ?? 0;
  const permissionOptions = {
    ...options.permissionOptions,
    flags: options.permissionOptions?.flags ?? flags,
  };
  const payload = encodeNoritoEnumVariant(0, concatBytes(
    encodeStructField(encodePermissionBare(permission, permissionOptions), flags),
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags),
    ...(options.extraFields ?? []).map((field) => encodeStructField(field, flags))
  ), flags);
  return encodeInstructionLiteral('iroha.grant', payload, flags, options.outerFlags ?? 0);
}

function encodeGrantAccountRoleInstructionLiteral(
  publicKey: string,
  role: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = encodeNoritoEnumVariant(1, concatBytes(
    encodeStructField(encodeRoleIdBare(role, flags), flags),
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags)
  ), flags);
  return encodeInstructionLiteral('iroha.grant', payload, flags, options.outerFlags ?? 0);
}

function encodeRevokeAccountPermissionInstructionLiteral(
  publicKey: string,
  permission: string,
  options: Uint8Array[] | { extraFields?: Uint8Array[], permissionOptions?: { includePayload?: boolean, extraFields?: Uint8Array[], flags?: number }, flags?: number, outerFlags?: number } = []
): string {
  const resolved = Array.isArray(options) ? { extraFields: options } : options;
  const flags = resolved.flags ?? 0;
  const permissionOptions = {
    ...resolved.permissionOptions,
    flags: resolved.permissionOptions?.flags ?? flags,
  };
  const payload = encodeNoritoEnumVariant(0, concatBytes(
    encodeStructField(encodePermissionBare(permission, permissionOptions), flags),
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags),
    ...(resolved.extraFields ?? []).map((field) => encodeStructField(field, flags))
  ), flags);
  return encodeInstructionLiteral('iroha.revoke', payload, flags, resolved.outerFlags ?? 0);
}

function encodeRevokeAccountRoleInstructionLiteral(
  publicKey: string,
  role: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = encodeNoritoEnumVariant(1, concatBytes(
    encodeStructField(encodeRoleIdBare(role, flags), flags),
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags)
  ), flags);
  return encodeInstructionLiteral('iroha.revoke', payload, flags, options.outerFlags ?? 0);
}

function encodeExecuteTriggerInstructionLiteral(
  triggerId: string,
  options: { includeArgs?: boolean, extraFields?: Uint8Array[], flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const fields = [
    encodeStructField(encodeTriggerIdBare(triggerId, flags), flags),
  ];
  if (options.includeArgs ?? true) {
    fields.push(encodeStructField(encodeNoritoStringBare('{}', flags), flags));
  }
  for (const field of options.extraFields ?? []) {
    fields.push(encodeStructField(field, flags));
  }
  const payload = concatBytes(...fields);
  return encodeInstructionLiteral('iroha.execute_trigger', payload, flags, options.outerFlags ?? 0);
}

function encodeEmptyMetadataBare(): Uint8Array {
  return littleEndianU64(0n);
}

function encodeOptionNoneBare(): Uint8Array {
  return littleEndianU32(0);
}

function encodeEmptyVecBare(): Uint8Array {
  return littleEndianU64(0n);
}

function encodeNewDomainBare(domain: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeDomainIdBare(domain, flags), flags),
    encodeStructField(encodeOptionNoneBare(), flags),
    encodeStructField(encodeEmptyMetadataBare(), flags)
  );
}

function encodeNewAccountBare(publicKey: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags),
    encodeStructField(encodeEmptyMetadataBare(), flags),
    encodeStructField(encodeOptionNoneBare(), flags),
    encodeStructField(encodeOptionNoneBare(), flags),
    encodeStructField(encodeEmptyVecBare(), flags)
  );
}

function encodeNftBare(options: { name: string, domain: string, ownerPublicKey: string, flags?: number }): Uint8Array {
  const flags = options.flags ?? 0;
  return concatBytes(
    encodeStructField(encodeNftIdBare(options.name, options.domain, flags), flags),
    encodeStructField(encodeEmptyMetadataBare(), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.ownerPublicKey, flags), flags)
  );
}

function encodeRoleBare(role: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeRoleIdBare(role, flags), flags),
    encodeStructField(encodeEmptyVecBare(), flags),
    encodeStructField(encodeEmptyMetadataBare(), flags)
  );
}

function encodeNewRoleBare(role: string, publicKey: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeRoleBare(role, flags), flags),
    encodeStructField(encodeAccountIdBareWithFlags(publicKey, flags), flags)
  );
}

function encodeProofBoxBare(backend: string, proof: Uint8Array, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeNoritoStringBare(backend, flags), flags),
    encodeStructField(encodeNoritoBytesBare(proof, flags), flags)
  );
}

function encodeVerifyingKeyIdBare(backend: string, name: string, flags = 0): Uint8Array {
  return concatBytes(
    encodeStructField(encodeNoritoStringBare(backend, flags), flags),
    encodeStructField(encodeNoritoStringBare(name, flags), flags)
  );
}

function encodeProofAttachmentBare(
  backend = 'halo2',
  proof = Uint8Array.from([1, 2, 3]),
  verifyingKey = 'vk',
  flags = 0
): Uint8Array {
  return concatBytes(
    encodeStructField(encodeNoritoStringBare(backend, flags), flags),
    encodeStructField(encodeProofBoxBare(backend, proof, flags), flags),
    encodeStructField(encodeVerifyingKeyIdBare(backend, verifyingKey, flags), flags)
  );
}

function encodeRegisterInstructionLiteral(
  tag: number,
  object: Uint8Array,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeInstructionLiteral(
    'iroha.register',
    encodeNoritoEnumVariant(tag, encodeStructField(object, flags), flags),
    flags,
    options.outerFlags ?? 0
  );
}

function encodeUnregisterInstructionLiteral(
  tag: number,
  object: Uint8Array,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeInstructionLiteral(
    'iroha.unregister',
    encodeNoritoEnumVariant(tag, encodeStructField(object, flags), flags),
    flags,
    options.outerFlags ?? 0
  );
}

function encodeLogInstructionLiteral(level: number, message: string): string {
  return encodeInstructionLiteral('iroha.log', concatBytes(
    encodeStructField(Uint8Array.from([level])),
    encodeStructField(encodeNoritoStringBare(message))
  ));
}

function encodeCreateElectionInstructionLiteral(
  electionId: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeNoritoStringBare(electionId, flags), flags),
    encodeStructField(littleEndianU32(3), flags),
    encodeStructField(new Uint8Array(32).fill(1), flags),
    encodeStructField(littleEndianU64(10n), flags),
    encodeStructField(littleEndianU64(20n), flags),
    encodeStructField(encodeVerifyingKeyIdBare('halo2', 'ballot-vk', flags), flags),
    encodeStructField(encodeVerifyingKeyIdBare('halo2', 'tally-vk', flags), flags),
    encodeStructField(encodeNoritoStringBare('vote-domain', flags), flags)
  );
  return encodeInstructionLiteral(TEST_CREATE_ELECTION_TYPE_NAME, payload, flags, options.outerFlags ?? 0);
}

function encodeSubmitBallotInstructionLiteral(
  electionId: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeNoritoStringBare(electionId, flags), flags),
    encodeStructField(encodeNoritoBytesBare(Uint8Array.from([4, 5, 6]), flags), flags),
    encodeStructField(encodeProofAttachmentBare('halo2', Uint8Array.from([1, 2, 3]), 'vk', flags), flags),
    encodeStructField(new Uint8Array(32).fill(2), flags)
  );
  return encodeInstructionLiteral(TEST_SUBMIT_BALLOT_TYPE_NAME, payload, flags, options.outerFlags ?? 0);
}

function encodeFinalizeElectionInstructionLiteral(
  electionId: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeNoritoStringBare(electionId, flags), flags),
    encodeStructField(encodeNoritoVecBare([littleEndianU64(7n), littleEndianU64(8n)], flags), flags),
    encodeStructField(encodeProofAttachmentBare('halo2', Uint8Array.from([1, 2, 3]), 'vk', flags), flags)
  );
  return encodeInstructionLiteral(TEST_FINALIZE_ELECTION_TYPE_NAME, payload, flags, options.outerFlags ?? 0);
}

function encodeUnshieldInstructionLiteral(options: {
  definitionBytes: Uint8Array
  publicKey: string
  amount: bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  const payload = concatBytes(
    encodeStructField(encodeAssetDefinitionIdBare(options.definitionBytes), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.publicKey, flags), flags),
    encodeStructField(littleEndianU128(options.amount), flags),
    encodeStructField(encodeNoritoVecBare([new Uint8Array(32).fill(3)], flags), flags),
    encodeStructField(encodeNoritoVecBare([], flags), flags),
    encodeStructField(encodeProofAttachmentBare('halo2', Uint8Array.from([7, 8]), 'unshield-vk', flags), flags),
    encodeStructField(encodeNoritoOptionBare(null, flags), flags)
  );
  return encodeInstructionLiteral(TEST_UNSHIELD_TYPE_NAME, payload, flags, options.outerFlags ?? 0);
}

function encodeQueryLiteral(singularTag: number, singularPayload: Uint8Array, flags = 0): string {
  const request = encodeNoritoEnumVariant(0, encodeNoritoEnumVariant(singularTag, singularPayload, flags), flags);
  return toHexLiteral(encodeNoritoTopLevel(request, 'QueryRequest', flags));
}

function encodeZkRootsGetRequestLiteral(assetId: string, max: number): string {
  const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
  return toHexLiteral(encodeNoritoTopLevel(concatBytes(
    encodeStructField(encodeNoritoStringBare(assetId, flags), flags),
    encodeStructField(littleEndianU32(max), flags)
  ), 'RootsGetRequest', flags));
}

function encodeZkVoteGetTallyRequestLiteral(electionId: string): string {
  const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
  return toHexLiteral(encodeNoritoTopLevel(concatBytes(
    encodeStructField(encodeNoritoStringBare(electionId, flags), flags)
  ), 'VoteGetTallyRequest', flags));
}

function sortKeys(...keys: string[]): string[] {
  return [...keys].sort();
}

function encodeTransferInstructionLiteral(
  tag: number,
  payload: Uint8Array,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeInstructionLiteral('iroha.transfer', encodeNoritoEnumVariant(tag, payload, flags), flags, options.outerFlags ?? 0);
}

function encodeMintInstructionLiteral(
  tag: number,
  payload: Uint8Array,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeInstructionLiteral('iroha.mint', encodeNoritoEnumVariant(tag, payload, flags), flags, options.outerFlags ?? 0);
}

function encodeBurnInstructionLiteral(
  tag: number,
  payload: Uint8Array,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeInstructionLiteral('iroha.burn', encodeNoritoEnumVariant(tag, payload, flags), flags, options.outerFlags ?? 0);
}

function encodeTransferDomainInstructionLiteral(options: {
  sourcePublicKey: string
  destinationPublicKey: string
  domain: string
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeTransferInstructionLiteral(0, concatBytes(
    encodeStructField(encodeAccountIdBareWithFlags(options.sourcePublicKey, flags), flags),
    encodeStructField(encodeDomainIdBare(options.domain, flags), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.destinationPublicKey, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeTransferAssetDefinitionInstructionLiteral(options: {
  sourcePublicKey: string
  destinationPublicKey: string
  definitionBytes: Uint8Array
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeTransferInstructionLiteral(1, concatBytes(
    encodeStructField(encodeAccountIdBareWithFlags(options.sourcePublicKey, flags), flags),
    encodeStructField(encodeAssetDefinitionIdBare(options.definitionBytes), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.destinationPublicKey, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeTransferAssetInstructionLiteral(options: {
  sourcePublicKey: string
  destinationPublicKey: string
  definitionBytes: Uint8Array
  scope?: number | bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeTransferInstructionLiteral(2, concatBytes(
    encodeStructField(encodeAssetIdBare(options.definitionBytes, options.sourcePublicKey, options.scope, flags), flags),
    encodeStructField(littleEndianU32(1), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.destinationPublicKey, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeTransferNftInstructionLiteral(options: {
  sourcePublicKey: string
  destinationPublicKey: string
  name: string
  domain: string
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeTransferInstructionLiteral(3, concatBytes(
    encodeStructField(encodeAccountIdBareWithFlags(options.sourcePublicKey, flags), flags),
    encodeStructField(encodeNftIdBare(options.name, options.domain, flags), flags),
    encodeStructField(encodeAccountIdBareWithFlags(options.destinationPublicKey, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeMintAssetInstructionLiteral(options: {
  accountPublicKey: string
  definitionBytes: Uint8Array
  scope?: number | bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeMintInstructionLiteral(0, concatBytes(
    encodeStructField(littleEndianU32(1), flags),
    encodeStructField(encodeAssetIdBare(options.definitionBytes, options.accountPublicKey, options.scope, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeBurnAssetInstructionLiteral(options: {
  accountPublicKey: string
  definitionBytes: Uint8Array
  scope?: number | bigint
  flags?: number
  outerFlags?: number
}): string {
  const flags = options.flags ?? 0;
  return encodeBurnInstructionLiteral(0, concatBytes(
    encodeStructField(littleEndianU32(1), flags),
    encodeStructField(encodeAssetIdBare(options.definitionBytes, options.accountPublicKey, options.scope, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeMintTriggerRepetitionsInstructionLiteral(
  triggerId: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeMintInstructionLiteral(1, concatBytes(
    encodeStructField(littleEndianU32(1), flags),
    encodeStructField(encodeTriggerIdBare(triggerId, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function encodeBurnTriggerRepetitionsInstructionLiteral(
  triggerId: string,
  options: { flags?: number, outerFlags?: number } = {}
): string {
  const flags = options.flags ?? 0;
  return encodeBurnInstructionLiteral(1, concatBytes(
    encodeStructField(littleEndianU32(1), flags),
    encodeStructField(encodeTriggerIdBare(triggerId, flags), flags)
  ), { flags, outerFlags: options.outerFlags ?? 0 });
}

function containsBytes(haystack: Uint8Array, needle: number[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function compactBitmapU32Needle(mask: number): number[] {
  return [
    0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    mask & 0xff,
    (mask >>> 8) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 24) & 0xff,
  ];
}

function syscallxNeedle(syscall: number): number[] {
  const word = ((0x62 << 24) | syscall) >>> 0;
  return [
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ];
}

function syscallNeedle(syscall: number): number[] {
  return [syscall, 0x00, 0x00, 0x60];
}

function ivmWordNeedle(op: number, a: number, b: number, c: number): number[] {
  const word = (((op & 0xff) << 24) | ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff)) >>> 0;
  return [
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ];
}

function invokeEntrypointAsFlagNeedle(flag: number): number[] {
  return [
    ...ivmWordNeedle(0x20, 13, 0, flag),
    ...syscallxNeedle(0x00fe_0004),
  ];
}

function makeInstruction(overrides: Partial<Instruction>): Instruction {
  return {
    authority: 'sample@authority.main',
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'RegisterSmartContractBytes',
    index: 0,
    transaction_hash: '0xstudio',
    transaction_status: 'Committed',
    block: 1,
    box: {
      encoded: '0x01',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {},
      },
    },
    ...overrides,
  };
}

function readUpstreamKotodamaSample(sourceName: string): string {
  return readFileSync(path.join(UPSTREAM_KOTODAMA_SAMPLE_DIR, sourceName), 'utf8').replace(/\r\n/g, '\n');
}

function buildRenderedSourceFromCompiled(compiled: ReturnType<typeof compileKotodamaStudioProgram>): string {
  const registerBytesInstruction = makeInstruction({
    kind: 'RegisterSmartContractBytes',
    box: {
      encoded: '0xbytes',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {
          code_hash: compiled.codeHashHex,
          code: encodeBase64(compiled.artifactBytes),
        },
      },
    },
  });

  const manifestInstruction = makeInstruction({
    kind: 'RegisterSmartContractCode',
    index: 1,
    box: {
      encoded: '0xmanifest',
      json: {
        kind: 'RegisterSmartContractCode',
        payload: {
          manifest: compiled.manifest,
        },
      },
    },
  });

  return buildLocalContractCodeView({
    instruction: registerBytesInstruction,
    relatedInstructions: [manifestInstruction],
  })?.rendered_source_text ?? '';
}

describe('compileKotodamaStudioProgram', () => {
  it('emits a parseable contract artifact for the Studio subset', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RewardGarden {
  state int points;

  kotoage fn celebrate() permission(Builder) {
    info("Confetti!");
    points = 1;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.slice(0, 4)).toEqual(Uint8Array.from([0x49, 0x56, 0x4d, 0x00]));
    expect(compiled.manifest?.code_hash).toMatch(HASH_LITERAL_PATTERN);
    expect(compiled.manifest?.abi_hash).toMatch(HASH_LITERAL_PATTERN);
    expect(compiled.sourceMap).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'celebrate',
        line: 5,
      }),
    ]));
    expect(compiled.budgetReport).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'celebrate',
        bytecode_bytes: expect.any(Number),
      }),
    ]));

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });

    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });

    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.code_hash).toBe(compiled.codeHashHex);
    expect(view?.rendered_source_kind).toBe('pseudo_source');
    expect(view?.analysis?.instruction_count).toBeGreaterThan(0);
    expect(view?.warnings).toEqual([]);
  });

  it('mirrors Rust no-function diagnostics through the SDK package boundary', () => {
    const empty = compileKotodamaStudioProgram('');
    const onlyStruct = compileKotodamaStudioProgram('struct User { value: int }');
    const onlyProductionStrippedTest = compileKotodamaStudioProgram(`
#[test]
fn smoke() {}
`);

    expect(empty.artifactBytes).toHaveLength(0);
    expect(empty.diagnostics[0]?.message).toBe('no functions to compile');
    expect(onlyStruct.artifactBytes).toHaveLength(0);
    expect(onlyStruct.diagnostics[0]?.message).toBe('no functions to compile');
    expect(onlyProductionStrippedTest.artifactBytes).toHaveLength(0);
    expect(onlyProductionStrippedTest.diagnostics[0]?.message).toBe('no functions to compile');
  });

  it('logs raw info string literals without JSON decoding', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InfoLiteralOps {
  hajimari() {
    info("ready");
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('DEBUG_LOG');
    expect(rendered).not.toContain('INPUT_PUBLISH_TLV');
    expect(rendered).not.toContain('JSON_DECODE');
  });

  it('accepts upstream kaizen upgrade hooks through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku UpgradeHook {
  kaizen() {
    info("upgrade");
  }
}
`);
    const unicode = compileKotodamaStudioProgram(`
seiyaku UpgradeHookUnicode {
  改善() {
    info("upgrade");
  }
}
`);
    const withParamPermission = compileKotodamaStudioProgram(`
seiyaku UpgradeHookParam {
  kaizen(_new_impl: int) permission(Admin) {
    info("upgrade requested");
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toHaveLength(1);
    expect(compiled.manifest?.entrypoints[0]?.name).toBe('kaizen');
    expect(compiled.manifest?.entrypoints[0]?.kind).toEqual(KAIZEN_MANIFEST_KIND);
    expect(containsBytes(compiled.artifactBytes, [
      0x6b, 0x61, 0x69, 0x7a, 0x65, 0x6e,
      0x04, 0x03, 0x00, 0x00, 0x00,
    ])).toBe(true);
    expect(unicode.diagnostics).toEqual([]);
    expect(unicode.manifest?.entrypoints[0]?.name).toBe('kaizen');
    expect(unicode.manifest?.entrypoints[0]?.kind).toEqual(KAIZEN_MANIFEST_KIND);
    expect(withParamPermission.diagnostics).toEqual([]);
    expect(withParamPermission.manifest?.entrypoints[0]?.name).toBe('kaizen');
    expect(withParamPermission.manifest?.entrypoints[0]?.params).toEqual([
      { name: '_new_impl', type_name: 'int' },
    ]);
    expect(withParamPermission.manifest?.entrypoints[0]?.permission).toBe('Admin');
  });

  it('compiles info through the SDK generic call path', () => {
    const valid = compileKotodamaStudioProgram(`
seiyaku InfoCall {
  fn helper() {
    call info("ready");
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidInfoCall {
  fn helper() {
    call info(json!{ value: "ready" });
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(valid)).toContain('DEBUG_LOG');
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'semantic error: info expects (string|int)',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('validates bare info arguments through the SDK package boundary', () => {
    const numeric = compileKotodamaStudioProgram(`
seiyaku InfoNumeric {
  kotoage fn run(amount: Amount) permission(Admin) {
    info(amount);
    call info(amount);
  }
}
`);
    const pointer = compileKotodamaStudioProgram(`
fn helper() {
  let event = trigger_event();
  info(event);
}
`);

    expect(numeric.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(numeric)).toContain('DEBUG_LOG');
    expect(pointer.artifactBytes).toHaveLength(0);
    expect(pointer.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'semantic error: info expects (string|int)',
      }),
    ]);
  });

  it('lowers asset_definition literals through direct pointer stubs instead of json lookups', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetLiteralOps {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });
    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });

    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_text).toContain('sll');
    expect(view?.rendered_source_text).not.toContain('JSON_DECODE');
    expect(view?.rendered_source_text).not.toContain('NAME_DECODE');
    expect(view?.rendered_source_text).not.toContain('JSON_GET_ASSET_DEFINITION_ID');
  });

  it('retains Rust unused pointer literal locals through the reusable SDK', () => {
    const account = 'sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D';
    const asset = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const cases: Array<[string, string, number[]]> = [
      [
        'unused_account_asset',
        `seiyaku X { kotoage fn run() permission(Admin) { let who = account!("${account}"); let ad = asset_definition!("${asset}"); info("s"); } }`,
        [6, 1, 2],
      ],
      [
        'unused_name',
        'seiyaku X { kotoage fn run() permission(Admin) { let key = name!("x"); info("s"); } }',
        [6, 3],
      ],
      [
        'unused_norito_bytes',
        'seiyaku X { kotoage fn run() permission(Admin) { let proof = norito_bytes("B"); info("s"); } }',
        [6, 9],
      ],
    ];

    for (const [name, source, literalTypes] of cases) {
      const compiled = compileKotodamaStudioProgram(source, { sourceName: `/tmp/${name}.ko` });

      expect(compiled.diagnostics).toEqual([]);
      expect(readLiteralSectionEntries(compiled.artifactBytes).map((entry) => entry.typeId)).toEqual(literalTypes);
    }
  });

  it('rematerializes base58 asset_definition locals at each use site', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetLiteralReuse {
  kotoage fn run() permission(Admin) {
    let coin = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    mint_asset(authority(), coin, 1);
    mint_asset(authority(), coin, 2);
    burn_asset(authority(), coin, 3);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });
    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });

    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    const sllCount = (view?.rendered_source_text.match(/\bsll\b/g) ?? []).length;
    expect(sllCount).toBe(3);
  });

  it('lowers large integer literals with the Rust-style base-2048 shift preload', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BigAmount {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1000);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });
    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });

    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_text).toContain('addi r26, r26, +11');
  });

  it('supports local bindings, local reassignment, and while loops', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RewardGarden {
  state int points;

  kotoage fn celebrate() permission(Builder) {
    let limit = 2;
    let message = json!{ status: "go" };
    points = 0;
    while (points < limit) {
      info(limit);
      info(1);
      points = limit;
      limit = 3;
    }
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(32);
  });

  it('supports arithmetic expressions, underscored integers, and if syntax without mandatory else/parens', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RewardGarden {
  state int points;

  kotoage fn celebrate() permission(Builder) {
    let bonus = 1_000_000;
    points = (bonus / 2) + 3 * 4 - 5 % 2;
    if points > 0 {
      info(points);
    }
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(32);
  });

  it('supports helper functions with typed params, returns, standalone calls, and poseidon2', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DexSimple {
  fn quote_sell(reserve_in: int, reserve_out: int, amount_in: int) -> int {
    let effective = (amount_in * 997) / 1000;
    let numerator = reserve_out * effective;
    let denominator = reserve_in + effective;
    let out = numerator / denominator;
    return out;
  }

  kotoage fn swap(trader: AccountId,
                  pool_account: AccountId,
                  input_asset: AssetDefinitionId,
                  output_asset: AssetDefinitionId,
                  amount_in: int,
                  reserve_in: int,
                  reserve_out: int) -> int permission(Admin) {
    let out = quote_sell(reserve_in, reserve_out, amount_in);
    transfer_asset(trader, pool_account, input_asset, amount_in);
    transfer_asset(pool_account, trader, output_asset, out);
    return out;
  }

  kotoage fn order_id(trader: int, salt: int) -> int {
    let h = poseidon2(trader, salt);
    return h;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports type-first params, ternary expressions, assert_eq, mint_asset, and burn_asset', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LendingSimple {
  fn collateral_ratio_bps(collateral_value: int, debt_value: int) -> int {
    if debt_value == 0 {
      return 1_000_000;
    }
    let ratio = (collateral_value * 10_000) / debt_value;
    return ratio;
  }

  kotoage fn borrow(AccountId user,
                    AccountId vault_account,
                    AssetDefinitionId debt_asset,
                    int amount,
                    int collateral_value,
                    int current_debt_value,
                    int min_ratio_bps) permission(Admin) {
    let new_debt_value = current_debt_value + amount;
    let ratio = collateral_ratio_bps(collateral_value, new_debt_value);
    let ok = ratio >= min_ratio_bps ? 1 : 0;
    assert_eq(ok, 1);
    mint_asset(user, debt_asset, amount);
    burn_asset(vault_account, debt_asset, 1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports logical operators plus break and continue inside loops', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LoopLogic {
  state int counter;

  kotoage fn main() permission(Admin) {
    let index = 0;
    while index < 6 {
      index = index + 1;
      if index == 2 {
        continue;
      }
      if index == 5 {
        break;
      }
      counter = counter + 1;
    }

    let ok = !(counter == 0) && true || false;
    assert(ok);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports tuple params, tuple returns, numeric member access, and embeds CNTR tuple metadata', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TupleReturnDemo {
  fn pair(a: int, b: int) -> (int, int) {
    let t = (a + 1, b + 1);
    return t;
  }

  view fn compute() -> (int, int) {
    let p = pair(3, 5);
    return (p.0, p.1);
  }

  fn sum_pair(pair: (int, int)) -> int {
    return pair.0 + pair.1;
  }

  view fn add_pair() -> int {
    return sum_pair((8, 13));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);

    const artifactText = new TextDecoder().decode(compiled.artifactBytes);
    expect(artifactText).toContain('compute');
    expect(artifactText).toContain('add_pair');
    expect(artifactText).toContain('(int, int)');
  });

  it('returns line-aware diagnostics for out-of-bounds tuple member access', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TupleBounds {
  view fn broken() -> int {
    let pair = (1, 2);
    return pair.2;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('out of bounds'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports struct declarations, constructors, nested named members, and struct metadata names', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StructDemo {
  struct Quote {
    gross: int;
    fee_bps: int;
  }

  struct Wrapper {
    quote: Quote;
    approved: bool;
  }

  fn make_quote(gross: int, fee_bps: int) -> Quote {
    return Quote(gross, fee_bps);
  }

  view fn total() -> int {
    let wrapped = Wrapper(make_quote(10, 25), true);
    assert(wrapped.approved);
    return wrapped.quote.gross + wrapped.quote.fee_bps;
  }

  fn score_quote(quote: Quote) -> int {
    return quote.gross - quote.fee_bps;
  }

  view fn quote() -> Quote {
    return make_quote(30, 12);
  }

  view fn score() -> int {
    return score_quote(make_quote(30, 12));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);

    const artifactText = new TextDecoder().decode(compiled.artifactBytes);
    expect(artifactText).toContain('struct Quote');
    expect(artifactText).toContain('score');
  });

  it('supports top-level consts, for-in-range loops, and compound assignment on locals and state', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RangeAndConst {
  const BONUS: int = 2;
  const LIMIT = 4;

  state int total;

  kotoage fn run() -> int {
    let score = BONUS;
    total = 0;
    for i in range(LIMIT) {
      score += i;
      total += 1;
    }
    return score + total;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports upstream loose top-level declarations without a seiyaku wrapper', () => {
    const compiled = compileKotodamaStudioProgram(`
kotoba { "E1": { en: "bad quote" } }
const BONUS: int = 2;
struct Pair { a: int; b: int; }
state total: int;

hajimari() {
  total = 1;
}

kotoage fn main() -> int permission(Admin) {
  let pair = Pair(BONUS, 3);
  total = total + pair.a;
  return total;
}
`);
    const internalMain = compileKotodamaStudioProgram(`
fn main() -> int {
  return 7;
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(compiled.manifest?.entrypoints.map((entry) => entry.name)).toEqual(['hajimari', 'main']);
    expect(compiled.manifest?.kotoba).toHaveLength(1);
    expect(internalMain.diagnostics).toEqual([]);
    expect(internalMain.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'main',
        kind: { kind: 'Public', value: null },
        return_type: 'int',
        access_hints_complete: null,
      }),
    ]);
  });

  it('distinguishes fn hajimari from lifecycle hajimari through the SDK package boundary', () => {
    const ordinaryFunctionName = compileKotodamaStudioProgram(`
seiyaku OrdinaryHajimariName {
  fn hajimari() {
    let value = 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const lifecycleEntrypoint = compileKotodamaStudioProgram(`
seiyaku LifecycleHajimari {
  hajimari() {
    let value = 1;
  }
}
`);

    expect(ordinaryFunctionName.diagnostics).toEqual([]);
    expect(ordinaryFunctionName.manifest?.entrypoints.map((entrypoint) => [
      entrypoint.name,
      entrypoint.kind,
    ])).toEqual([
      ['run', { kind: 'Public', value: null }],
    ]);
    expect(lifecycleEntrypoint.diagnostics).toEqual([]);
    expect(lifecycleEntrypoint.manifest?.entrypoints[0]?.name).toBe('hajimari');
    expect(lifecycleEntrypoint.manifest?.entrypoints[0]?.kind).toEqual({
      kind: 'Hajimari',
      value: null,
    });
  });

  it('supports upstream-style map states, indexed reads and writes, map helpers, isqrt, and assert messages', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku IrohaSwapLite {
  state PoolAssetA: Map<Name, AssetDefinitionId>;
  state PoolAccount: Map<Name, AccountId>;
  state ReserveA: Map<Name, int>;

  kotoage fn init_pool(pool: Name,
                       asset_a: AssetDefinitionId,
                       pool_account: AccountId) permission(Admin) {
    assert(!PoolAssetA.contains(pool), "pool exists");
    PoolAssetA[pool] = asset_a;
    PoolAccount[pool] = pool_account;
    ReserveA[pool] = 0;
  }

  kotoage fn deposit(provider: AccountId, pool: Name, amount: int) permission(Admin) {
    assert(PoolAssetA.contains(pool), "unknown pool");
    let asset_a = PoolAssetA[pool];
    let pool_account = PoolAccount[pool];
    let reserve = ReserveA.ensure(pool, 0);
    let minted = isqrt(amount * amount);
    transfer_asset(provider, pool_account, asset_a, amount);
    ReserveA[pool] = reserve + minted;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect([...compiled.artifactBytes]).toContain(0x54);
    expect([...compiled.artifactBytes]).toContain(0x56);
    expect([...compiled.artifactBytes]).toContain(0x5d);
    expect([...compiled.artifactBytes]).toContain(0x5e);
    expect([...compiled.artifactBytes]).toContain(0x1d);
  });

  it('supports upstream get_or_default as read-only map access', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku GetOrDefaultRead {
  state Values: Map<Name, int>;

  view fn read(key: Name) -> int {
    return get_or_default(Values, key, 7);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        read_keys: ['state:Values'],
        write_keys: [],
        access_hints_complete: true,
      }),
    );
  });

  it('embeds declared state descriptors into CNTR metadata', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MetadataParity {
  state int points;
  state Scores: Map<Name, int>;
  state int unused_counter;

  fn helper(pool: Name) -> int {
    return Scores.get_or(pool, points);
  }

  kotoage fn run(pool: Name) permission(Admin) {
    let current = helper(pool);
    points = current + 1;
    Scores[pool] = current;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const artifactText = new TextDecoder().decode(compiled.artifactBytes);
    expect(artifactText).not.toContain('custom:read');
    expect(artifactText).not.toContain('custom:write');
    expect(artifactText).toContain('state:points');
    expect(artifactText).toContain('state:Scores');
    expect(artifactText).toContain('unused_counter');
  });

  it('omits unsupported wildcard access keys for dynamic host calls', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccessParity {
  kotoage fn move(from: AccountId, to: AccountId, asset: AssetDefinitionId, amount: int) permission(Admin) {
    transfer_asset(from, to, asset, amount);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toBeNull();
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'move',
        kind: PUBLIC_MANIFEST_KIND,
        params: [
          { name: 'from', type_name: 'AccountId' },
          { name: 'to', type_name: 'AccountId' },
          { name: 'asset', type_name: 'AssetDefinitionId' },
          { name: 'amount', type_name: 'int' },
        ],
        return_type: null,
        permission: 'Admin',
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives exact asset access hints for static asset host calls', () => {
    const fromAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const toAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_SECP256K1_PUBLIC_KEY)!;
    const assetDefinition = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const fromAsset = `${assetDefinition}#${fromAccount}`;
    const toAsset = `${assetDefinition}#${toAccount}`;
    const compiled = compileKotodamaStudioProgram(`
seiyaku StaticAssetAccess {
  kotoage fn move() permission(Admin) {
    transfer_asset(
      account!("${fromAccount}"),
      account!("${toAccount}"),
      asset_definition!("${assetDefinition}"),
      1
    );
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: sortKeys(
        `asset:${fromAsset}`,
        `account:${fromAccount}`,
        `asset_def:${assetDefinition}`,
        `asset:${toAsset}`,
        `account:${toAccount}`
      ),
      write_keys: sortKeys(`asset:${fromAsset}`, `asset:${toAsset}`),
      dynamic_reads: [],
      dynamic_writes: [],
    });
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'move',
        read_keys: [
          `asset:${fromAsset}`,
          `account:${fromAccount}`,
          `asset_def:${assetDefinition}`,
          `asset:${toAsset}`,
          `account:${toAccount}`,
        ],
        write_keys: [`asset:${fromAsset}`, `asset:${toAsset}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('keeps static asset access hints for alias-resolved accounts', () => {
    const fromAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const assetDefinition = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const fromAsset = `${assetDefinition}#${fromAccount}`;
    const compiled = compileKotodamaStudioProgram(`
seiyaku RuntimeAccountStaticAssetAccess {
  kotoage fn transfer() permission(Admin) {
    transfer_asset(
      account_id("${fromAccount}"),
      account_id("merchant@paynet"),
      asset_definition("${assetDefinition}"),
      1
    );
  }

  kotoage fn mint() permission(Admin) {
    mint_asset(account_id("merchant@paynet"), asset_definition("${assetDefinition}"), 1);
  }

  kotoage fn burn() permission(Admin) {
    burn_asset(account_id("merchant@"), asset_definition("${assetDefinition}"), 1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'transfer',
        read_keys: [
          `asset:${fromAsset}`,
          `account:${fromAccount}`,
          `asset_def:${assetDefinition}`,
        ],
        write_keys: [
          `asset:${fromAsset}`,
          `asset_def:${assetDefinition}`,
        ],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'mint',
        read_keys: [`asset_def:${assetDefinition}`],
        write_keys: [`asset_def:${assetDefinition}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'burn',
        read_keys: [`asset_def:${assetDefinition}`],
        write_keys: [`asset_def:${assetDefinition}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
    const accessKeys = compiled.manifest?.entrypoints.flatMap((entrypoint) => [
      ...entrypoint.read_keys,
      ...entrypoint.write_keys,
    ]);
    expect(accessKeys?.some((key) => key === '*' || key.endsWith(':*'))).toBe(false);
  });

  it('omits unsupported wildcard execute_instruction access instead of skipped metadata', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HostInstruction {
  kotoage fn run() permission(Admin) {
    execute_instruction(norito_bytes("0x00"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toBeNull();
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'run',
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      })
    );
  });

  it('derives exact domain detail access from static execute_instruction Norito payloads', () => {
    const literal = encodeSetKeyValueInstructionLiteral(0, encodeDomainIdBare('wonderland'), 'meta');
    const compiled = compileKotodamaStudioProgram(`
seiyaku DomainInstructionAccess {
  kotoage fn run() permission(Admin) {
    execute_instruction(norito_bytes("${literal}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: ['domain.detail:wonderland:meta', 'domain:wonderland'],
      write_keys: ['domain.detail:wonderland:meta'],
      dynamic_reads: [],
      dynamic_writes: [],
    });
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'run',
        read_keys: ['domain:wonderland', 'domain.detail:wonderland:meta'],
        write_keys: ['domain.detail:wonderland:meta'],
        access_hints_complete: true,
        access_hints_skipped: [],
      })
    );
  });

  it('does not derive detail access from malformed metadata instruction payloads through the SDK package boundary', () => {
    const missingSetValue = encodeSetKeyValueInstructionLiteral(0, encodeDomainIdBare('wonderland'), 'meta', {
      includeValue: false,
    });
    const extraRemoveValue = encodeRemoveKeyValueInstructionLiteral(0, encodeDomainIdBare('wonderland'), 'meta', {
      extraFields: [encodeNoritoStringBare('{"ok":true}')],
    });
    const compiled = compileKotodamaStudioProgram(`
seiyaku MalformedMetadataInstructionAccess {
  kotoage fn missing_set_value() permission(Admin) {
    execute_instruction(norito_bytes("${missingSetValue}"));
  }

  kotoage fn extra_remove_value() permission(Admin) {
    execute_instruction(norito_bytes("${extraRemoveValue}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toBeNull();
    for (const entrypoint of compiled.manifest?.entrypoints ?? []) {
      expect(entrypoint).toEqual(expect.objectContaining({
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }));
    }
  });

  it('derives detail access from compact metadata instruction payloads through the SDK package boundary', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const compactSet = encodeSetKeyValueInstructionLiteral(
      0,
      encodeDomainIdBare('wonderland', flags),
      'meta',
      { flags, outerFlags: flags }
    );
    const compactRemove = encodeRemoveKeyValueInstructionLiteral(
      0,
      encodeDomainIdBare('wonderland', flags),
      'meta',
      { flags, outerFlags: flags }
    );
    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactMetadataInstructionAccess {
  kotoage fn compact_set() permission(Admin) {
    execute_instruction(norito_bytes("${compactSet}"));
  }

  kotoage fn compact_remove() permission(Admin) {
    execute_instruction(norito_bytes("${compactRemove}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'compact_set',
        read_keys: ['domain:wonderland', 'domain.detail:wonderland:meta'],
        write_keys: ['domain.detail:wonderland:meta'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'compact_remove',
        read_keys: ['domain:wonderland', 'domain.detail:wonderland:meta'],
        write_keys: ['domain.detail:wonderland:meta'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives exact asset definition, nft, and trigger detail access from static execute_instruction payloads', () => {
    const assetDefinitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetDefinitionInstruction = encodeSetKeyValueInstructionLiteral(
      2,
      encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES),
      'info'
    );
    const nftInstruction = encodeSetKeyValueInstructionLiteral(
      3,
      encodeNftIdBare('n0', 'wonderland'),
      'rarity'
    );
    const triggerInstruction = encodeSetKeyValueInstructionLiteral(
      4,
      encodeTriggerIdBare('wake'),
      'phase'
    );

    const compiled = compileKotodamaStudioProgram(`
seiyaku DetailInstructionAccess {
  kotoage fn update_asset() permission(Admin) {
    execute_instruction(norito_bytes("${assetDefinitionInstruction}"));
  }

  kotoage fn update_nft() permission(Admin) {
    execute_instruction(norito_bytes("${nftInstruction}"));
  }

  kotoage fn update_trigger() permission(Admin) {
    execute_instruction(norito_bytes("${triggerInstruction}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'update_asset',
        read_keys: [`asset_def:${assetDefinitionLiteral}`, `asset_def.detail:${assetDefinitionLiteral}:info`],
        write_keys: [`asset_def.detail:${assetDefinitionLiteral}:info`],
      }),
      expect.objectContaining({
        name: 'update_nft',
        read_keys: ['nft:n0$wonderland', 'nft.detail:n0$wonderland:rarity'],
        write_keys: ['nft.detail:n0$wonderland:rarity'],
      }),
      expect.objectContaining({
        name: 'update_trigger',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger.detail:wake:phase'],
      }),
    ]);
  });

  it('derives exact role-permission and trigger repetition access from static execute_instruction payloads', () => {
    const grantLiteral = encodeGrantRolePermissionInstructionLiteral('auditor', 'CanManageDomains');
    const triggerLiteral = encodeExecuteTriggerInstructionLiteral('wake');
    const compiled = compileKotodamaStudioProgram(`
seiyaku PermissionInstructionAccess {
  kotoage fn grant_role() permission(Admin) {
    execute_instruction(norito_bytes("${grantLiteral}"));
  }

  kotoage fn wake_trigger() permission(Admin) {
    execute_instruction(norito_bytes("${triggerLiteral}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'grant_role',
        read_keys: ['role:auditor'],
        write_keys: ['role:auditor', 'perm.role:auditor:CanManageDomains'],
      }),
      expect.objectContaining({
        name: 'wake_trigger',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger.repetitions:wake'],
      }),
    ]);
  });

  it('derives permission and trigger access from compact static execute_instruction payloads through the SDK package boundary', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const grantAccountLiteral = encodeGrantAccountPermissionInstructionLiteral(
      SAMPLE_ED25519_PUBLIC_KEY,
      'CanTransferAssets',
      { flags, outerFlags: flags }
    );
    const grantRoleLiteral = encodeGrantRolePermissionInstructionLiteral(
      'auditor',
      'CanManageDomains',
      { flags, outerFlags: flags }
    );
    const triggerLiteral = encodeExecuteTriggerInstructionLiteral('wake', { flags, outerFlags: flags });
    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactPermissionInstructionAccess {
  kotoage fn grant_account() permission(Admin) {
    execute_instruction(norito_bytes("${grantAccountLiteral}"));
  }

  kotoage fn grant_role() permission(Admin) {
    execute_instruction(norito_bytes("${grantRoleLiteral}"));
  }

  kotoage fn wake_trigger() permission(Admin) {
    execute_instruction(norito_bytes("${triggerLiteral}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'grant_account',
        read_keys: [`account:${accountLiteral}`],
        write_keys: [`account:${accountLiteral}`, `perm.account:${accountLiteral}:CanTransferAssets`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'grant_role',
        read_keys: ['role:auditor'],
        write_keys: ['role:auditor', 'perm.role:auditor:CanManageDomains'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'wake_trigger',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger.repetitions:wake'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('does not derive permission or trigger access from malformed static execute_instruction payloads', () => {
    const missingPermissionPayload = encodeGrantAccountPermissionInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'CanTransferAssets', {
      permissionOptions: { includePayload: false },
    });
    const extraRevokeField = encodeRevokeAccountPermissionInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'CanTransferAssets', [
      encodeNoritoStringBare('tail'),
    ]);
    const missingTriggerArgs = encodeExecuteTriggerInstructionLiteral('wake', { includeArgs: false });
    const extraTriggerArgs = encodeExecuteTriggerInstructionLiteral('wake', {
      extraFields: [encodeNoritoStringBare('{}')],
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku MalformedPermissionTriggerInstructionAccess {
  kotoage fn missing_permission_payload() permission(Admin) {
    execute_instruction(norito_bytes("${missingPermissionPayload}"));
  }

  kotoage fn extra_revoke_field() permission(Admin) {
    execute_instruction(norito_bytes("${extraRevokeField}"));
  }

  kotoage fn missing_trigger_args() permission(Admin) {
    execute_instruction(norito_bytes("${missingTriggerArgs}"));
  }

  kotoage fn extra_trigger_args() permission(Admin) {
    execute_instruction(norito_bytes("${extraTriggerArgs}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toBeNull();
    for (const entrypoint of compiled.manifest?.entrypoints ?? []) {
      expect(entrypoint).toEqual(expect.objectContaining({
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }));
    }
  });

  it('derives bounded asset-definition query access and falls back to wildcard query access when payload decoding is unsupported', () => {
    const assetDefinitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const boundedQuery = encodeQueryLiteral(7, encodeStructField(encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES)));
    const compiled = compileKotodamaStudioProgram(`
seiyaku QueryAccessParity {
  view fn fetch_known() -> int {
    let result = execute_query(norito_bytes("${boundedQuery}"));
    return 1;
  }

  view fn fetch_unknown() -> int {
    let result = execute_query(norito_bytes("0x00"));
    return 2;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'fetch_known',
        read_keys: [`asset_def:${assetDefinitionLiteral}`],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'fetch_unknown',
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives bounded asset-definition query access from compact QueryRequest payloads', () => {
    const assetDefinitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const query = encodeQueryLiteral(
      7,
      encodeStructField(encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES), flags),
      flags
    );
    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactQueryAccessParity {
  view fn fetch_known() -> int {
    let result = execute_query(norito_bytes("${query}"));
    return 1;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'fetch_known',
        read_keys: [`asset_def:${assetDefinitionLiteral}`],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      })
    );
  });

  it('derives exact account detail access from static execute_instruction payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const literal = encodeSetKeyValueInstructionLiteral(1, encodeAccountIdBare(SAMPLE_ED25519_PUBLIC_KEY), 'profile');
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountInstructionAccess {
  kotoage fn run() permission(Admin) {
    execute_instruction(norito_bytes("${literal}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'run',
        read_keys: [`account:${accountLiteral}`, `account.detail:${accountLiteral}:profile`],
        write_keys: [`account.detail:${accountLiteral}:profile`],
        access_hints_complete: true,
        access_hints_skipped: [],
      })
    );
  });

  it('derives exact asset metadata access from static transparent asset key-value payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}#dataspace:7`;
    const setLiteral = encodeSetAssetKeyValueInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      key: 'quota',
      scope: 7,
    });
    const removeLiteral = encodeRemoveAssetKeyValueInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      key: 'quota',
      scope: 7,
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetMetadataInstructionAccess {
  kotoage fn set_quota() permission(Admin) {
    execute_instruction(norito_bytes("${setLiteral}"));
  }

  kotoage fn remove_quota() permission(Admin) {
    execute_instruction(norito_bytes("${removeLiteral}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'set_quota',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset.detail:${assetLiteral}:quota`,
        ],
        write_keys: [`asset.detail:${assetLiteral}:quota`],
      }),
      expect.objectContaining({
        name: 'remove_quota',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset.detail:${assetLiteral}:quota`,
        ],
        write_keys: [`asset.detail:${assetLiteral}:quota`],
      }),
    ]);
  });

  it('derives asset metadata access from compact transparent payloads through the SDK package boundary', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}#dataspace:7`;
    const setLiteral = encodeSetAssetKeyValueInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      key: 'quota',
      scope: 7,
      flags,
      outerFlags: flags,
    });
    const removeLiteral = encodeRemoveAssetKeyValueInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      key: 'quota',
      scope: 7,
      flags,
      outerFlags: flags,
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactAssetMetadataInstructionAccess {
  kotoage fn set_quota() permission(Admin) {
    execute_instruction(norito_bytes("${setLiteral}"));
  }

  kotoage fn remove_quota() permission(Admin) {
    execute_instruction(norito_bytes("${removeLiteral}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'set_quota',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset.detail:${assetLiteral}:quota`,
        ],
        write_keys: [`asset.detail:${assetLiteral}:quota`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'remove_quota',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset.detail:${assetLiteral}:quota`,
        ],
        write_keys: [`asset.detail:${assetLiteral}:quota`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives exact transfer-box access from static boxed transfer payloads', () => {
    const sourceAccountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const destinationAccountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_SECP256K1_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const sourceAssetLiteral = `${definitionLiteral}#${sourceAccountLiteral}#dataspace:7`;
    const destinationAssetLiteral = `${definitionLiteral}#${destinationAccountLiteral}`;
    const transferDomain = encodeTransferDomainInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey: SAMPLE_SECP256K1_PUBLIC_KEY,
      domain: 'wonderland',
    });
    const transferDefinition = encodeTransferAssetDefinitionInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey: SAMPLE_SECP256K1_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
    });
    const transferAsset = encodeTransferAssetInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey: SAMPLE_SECP256K1_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
    });
    const transferNft = encodeTransferNftInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey: SAMPLE_SECP256K1_PUBLIC_KEY,
      name: 'n0',
      domain: 'wonderland',
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku TransferInstructionAccess {
  kotoage fn move_domain() permission(Admin) {
    execute_instruction(norito_bytes("${transferDomain}"));
  }

  kotoage fn move_definition() permission(Admin) {
    execute_instruction(norito_bytes("${transferDefinition}"));
  }

  kotoage fn move_asset() permission(Admin) {
    execute_instruction(norito_bytes("${transferAsset}"));
  }

  kotoage fn move_nft() permission(Admin) {
    execute_instruction(norito_bytes("${transferNft}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'move_domain',
        read_keys: ['domain:wonderland', `account:${sourceAccountLiteral}`, `account:${destinationAccountLiteral}`],
        write_keys: ['domain:wonderland'],
      }),
      expect.objectContaining({
        name: 'move_definition',
        read_keys: [`asset_def:${definitionLiteral}`, `account:${sourceAccountLiteral}`, `account:${destinationAccountLiteral}`],
        write_keys: [`asset_def:${definitionLiteral}`],
      }),
      expect.objectContaining({
        name: 'move_asset',
        read_keys: [
          `asset:${sourceAssetLiteral}`,
          `account:${sourceAccountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset:${destinationAssetLiteral}`,
          `account:${destinationAccountLiteral}`,
        ],
        write_keys: [
          `asset:${sourceAssetLiteral}`,
          `asset:${destinationAssetLiteral}`,
        ],
      }),
      expect.objectContaining({
        name: 'move_nft',
        read_keys: ['nft:n0$wonderland', `account:${sourceAccountLiteral}`, `account:${destinationAccountLiteral}`],
        write_keys: ['nft:n0$wonderland'],
      }),
    ]);
  });

  it('derives exact mint and burn access from static boxed payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}#dataspace:7`;
    const mintAsset = encodeMintAssetInstructionLiteral({
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
    });
    const burnAsset = encodeBurnAssetInstructionLiteral({
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
    });
    const mintTrigger = encodeMintTriggerRepetitionsInstructionLiteral('wake');
    const burnTrigger = encodeBurnTriggerRepetitionsInstructionLiteral('wake');

    const compiled = compileKotodamaStudioProgram(`
seiyaku MintBurnInstructionAccess {
  kotoage fn mint_asset_run() permission(Admin) {
    execute_instruction(norito_bytes("${mintAsset}"));
  }

  kotoage fn burn_asset_run() permission(Admin) {
    execute_instruction(norito_bytes("${burnAsset}"));
  }

  kotoage fn mint_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${mintTrigger}"));
  }

  kotoage fn burn_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${burnTrigger}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'mint_asset_run',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
        ],
        write_keys: [
          `asset:${assetLiteral}`,
          `asset_def:${definitionLiteral}`,
        ],
      }),
      expect.objectContaining({
        name: 'burn_asset_run',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
        ],
        write_keys: [
          `asset:${assetLiteral}`,
          `asset_def:${definitionLiteral}`,
        ],
      }),
      expect.objectContaining({
        name: 'mint_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
      }),
      expect.objectContaining({
        name: 'burn_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
      }),
    ]);
  });

  it('derives transfer, mint, and burn access from compact static boxed payloads through the SDK package boundary', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const destinationPublicKey = 'ed01202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40';
    const sourceAccountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const destinationAccountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(destinationPublicKey)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const sourceAssetLiteral = `${definitionLiteral}#${sourceAccountLiteral}#dataspace:7`;
    const destinationAssetLiteral = `${definitionLiteral}#${destinationAccountLiteral}`;
    const transferDomain = encodeTransferDomainInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey,
      domain: 'wonderland',
      flags,
      outerFlags: flags,
    });
    const transferAsset = encodeTransferAssetInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
      flags,
      outerFlags: flags,
    });
    const transferNft = encodeTransferNftInstructionLiteral({
      sourcePublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      destinationPublicKey,
      name: 'n0',
      domain: 'wonderland',
      flags,
      outerFlags: flags,
    });
    const mintAsset = encodeMintAssetInstructionLiteral({
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
      flags,
      outerFlags: flags,
    });
    const burnAsset = encodeBurnAssetInstructionLiteral({
      accountPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      scope: 7,
      flags,
      outerFlags: flags,
    });
    const mintTrigger = encodeMintTriggerRepetitionsInstructionLiteral('wake', { flags, outerFlags: flags });
    const burnTrigger = encodeBurnTriggerRepetitionsInstructionLiteral('wake', { flags, outerFlags: flags });

    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactAssetOperationInstructionAccess {
  kotoage fn move_domain() permission(Admin) {
    execute_instruction(norito_bytes("${transferDomain}"));
  }

  kotoage fn move_asset() permission(Admin) {
    execute_instruction(norito_bytes("${transferAsset}"));
  }

  kotoage fn move_nft() permission(Admin) {
    execute_instruction(norito_bytes("${transferNft}"));
  }

  kotoage fn mint_asset_run() permission(Admin) {
    execute_instruction(norito_bytes("${mintAsset}"));
  }

  kotoage fn burn_asset_run() permission(Admin) {
    execute_instruction(norito_bytes("${burnAsset}"));
  }

  kotoage fn mint_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${mintTrigger}"));
  }

  kotoage fn burn_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${burnTrigger}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'move_domain',
        read_keys: ['domain:wonderland', `account:${sourceAccountLiteral}`, `account:${destinationAccountLiteral}`],
        write_keys: ['domain:wonderland'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'move_asset',
        read_keys: [
          `asset:${sourceAssetLiteral}`,
          `account:${sourceAccountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset:${destinationAssetLiteral}`,
          `account:${destinationAccountLiteral}`,
        ],
        write_keys: [`asset:${sourceAssetLiteral}`, `asset:${destinationAssetLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'move_nft',
        read_keys: ['nft:n0$wonderland', `account:${sourceAccountLiteral}`, `account:${destinationAccountLiteral}`],
        write_keys: ['nft:n0$wonderland'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'mint_asset_run',
        read_keys: [`asset:${sourceAssetLiteral}`, `account:${sourceAccountLiteral}`, `asset_def:${definitionLiteral}`],
        write_keys: [`asset:${sourceAssetLiteral}`, `asset_def:${definitionLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'burn_asset_run',
        read_keys: [`asset:${sourceAssetLiteral}`, `account:${sourceAccountLiteral}`, `asset_def:${definitionLiteral}`],
        write_keys: [`asset:${sourceAssetLiteral}`, `asset_def:${definitionLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'mint_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'burn_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives exact account permission and role-binding access from static grant and revoke payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_SECP256K1_PUBLIC_KEY)!;
    const grantPermission = encodeGrantAccountPermissionInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'CanTransferAssets');
    const grantRole = encodeGrantAccountRoleInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'auditor');
    const revokePermission = encodeRevokeAccountPermissionInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'CanTransferAssets');
    const revokeRole = encodeRevokeAccountRoleInstructionLiteral(SAMPLE_SECP256K1_PUBLIC_KEY, 'auditor');

    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountPermissionAccess {
  kotoage fn grant_permission() permission(Admin) {
    execute_instruction(norito_bytes("${grantPermission}"));
  }

  kotoage fn grant_role() permission(Admin) {
    execute_instruction(norito_bytes("${grantRole}"));
  }

  kotoage fn revoke_permission() permission(Admin) {
    execute_instruction(norito_bytes("${revokePermission}"));
  }

  kotoage fn revoke_role() permission(Admin) {
    execute_instruction(norito_bytes("${revokeRole}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'grant_permission',
        read_keys: [`account:${accountLiteral}`],
        write_keys: [`account:${accountLiteral}`, `perm.account:${accountLiteral}:CanTransferAssets`],
      }),
      expect.objectContaining({
        name: 'grant_role',
        read_keys: [`account:${accountLiteral}`, 'role:auditor'],
        write_keys: [`account:${accountLiteral}`, `role.binding:${accountLiteral}:auditor`],
      }),
      expect.objectContaining({
        name: 'revoke_permission',
        read_keys: [`account:${accountLiteral}`],
        write_keys: [`account:${accountLiteral}`, `perm.account:${accountLiteral}:CanTransferAssets`],
      }),
      expect.objectContaining({
        name: 'revoke_role',
        read_keys: [`account:${accountLiteral}`, 'role:auditor'],
        write_keys: [`account:${accountLiteral}`, `role.binding:${accountLiteral}:auditor`],
      }),
    ]);
  });

  it('derives exact register and unregister access from static boxed payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const registerDomain = encodeRegisterInstructionLiteral(1, encodeNewDomainBare('wonderland'));
    const registerAccount = encodeRegisterInstructionLiteral(2, encodeNewAccountBare(SAMPLE_ED25519_PUBLIC_KEY));
    const registerDefinition = encodeRegisterInstructionLiteral(3, encodeStructField(encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES)));
    const registerNft = encodeRegisterInstructionLiteral(4, encodeNftBare({
      name: 'n0',
      domain: 'wonderland',
      ownerPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
    }));
    const registerRole = encodeRegisterInstructionLiteral(5, encodeNewRoleBare('auditor', SAMPLE_ED25519_PUBLIC_KEY));
    const unregisterDefinition = encodeUnregisterInstructionLiteral(3, encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES));
    const unregisterTrigger = encodeUnregisterInstructionLiteral(6, encodeTriggerIdBare('wake'));

    const compiled = compileKotodamaStudioProgram(`
seiyaku RegisterUnregisterInstructionAccess {
  kotoage fn register_domain_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerDomain}"));
  }

  kotoage fn register_account_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerAccount}"));
  }

  kotoage fn register_definition_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerDefinition}"));
  }

  kotoage fn register_nft_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerNft}"));
  }

  kotoage fn register_role_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerRole}"));
  }

  kotoage fn unregister_definition_run() permission(Admin) {
    execute_instruction(norito_bytes("${unregisterDefinition}"));
  }

  kotoage fn unregister_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${unregisterTrigger}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'register_domain_run',
        read_keys: ['domain:wonderland'],
        write_keys: ['domain:wonderland'],
      }),
      expect.objectContaining({
        name: 'register_account_run',
        read_keys: [`account:${accountLiteral}`],
        write_keys: [`account:${accountLiteral}`],
      }),
      expect.objectContaining({
        name: 'register_definition_run',
        read_keys: [`asset_def:${definitionLiteral}`],
        write_keys: [`asset_def:${definitionLiteral}`],
      }),
      expect.objectContaining({
        name: 'register_nft_run',
        read_keys: ['nft:n0$wonderland'],
        write_keys: ['nft:n0$wonderland'],
      }),
      expect.objectContaining({
        name: 'register_role_run',
        read_keys: ['role:auditor'],
        write_keys: ['role:auditor'],
      }),
      expect.objectContaining({
        name: 'unregister_definition_run',
        read_keys: [`asset_def:${definitionLiteral}`],
        write_keys: [`asset_def:${definitionLiteral}`],
      }),
      expect.objectContaining({
        name: 'unregister_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
      }),
    ]);
    for (const entrypoint of compiled.manifest?.entrypoints ?? []) {
      expect(entrypoint.access_hints_complete).toBe(true);
      expect(entrypoint.access_hints_skipped).toEqual([]);
    }
  });

  it('derives register and unregister access from compact static boxed payloads through the SDK package boundary', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const registerDomain = encodeRegisterInstructionLiteral(
      1,
      encodeNewDomainBare('wonderland', flags),
      { flags, outerFlags: flags }
    );
    const registerAccount = encodeRegisterInstructionLiteral(
      2,
      encodeNewAccountBare(SAMPLE_ED25519_PUBLIC_KEY, flags),
      { flags, outerFlags: flags }
    );
    const registerDefinition = encodeRegisterInstructionLiteral(
      3,
      encodeStructField(encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES), flags),
      { flags, outerFlags: flags }
    );
    const registerNft = encodeRegisterInstructionLiteral(
      4,
      encodeNftBare({
        name: 'n0',
        domain: 'wonderland',
        ownerPublicKey: SAMPLE_ED25519_PUBLIC_KEY,
        flags,
      }),
      { flags, outerFlags: flags }
    );
    const registerRole = encodeRegisterInstructionLiteral(
      5,
      encodeNewRoleBare('auditor', SAMPLE_ED25519_PUBLIC_KEY, flags),
      { flags, outerFlags: flags }
    );
    const unregisterDefinition = encodeUnregisterInstructionLiteral(
      3,
      encodeAssetDefinitionIdBare(SAMPLE_ASSET_DEFINITION_BYTES),
      { flags, outerFlags: flags }
    );
    const unregisterTrigger = encodeUnregisterInstructionLiteral(
      6,
      encodeTriggerIdBare('wake', flags),
      { flags, outerFlags: flags }
    );

    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactRegisterUnregisterInstructionAccess {
  kotoage fn register_domain_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerDomain}"));
  }

  kotoage fn register_account_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerAccount}"));
  }

  kotoage fn register_definition_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerDefinition}"));
  }

  kotoage fn register_nft_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerNft}"));
  }

  kotoage fn register_role_run() permission(Admin) {
    execute_instruction(norito_bytes("${registerRole}"));
  }

  kotoage fn unregister_definition_run() permission(Admin) {
    execute_instruction(norito_bytes("${unregisterDefinition}"));
  }

  kotoage fn unregister_trigger_run() permission(Admin) {
    execute_instruction(norito_bytes("${unregisterTrigger}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'register_domain_run',
        read_keys: ['domain:wonderland'],
        write_keys: ['domain:wonderland'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'register_account_run',
        read_keys: [`account:${accountLiteral}`],
        write_keys: [`account:${accountLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'register_definition_run',
        read_keys: [`asset_def:${definitionLiteral}`],
        write_keys: [`asset_def:${definitionLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'register_nft_run',
        read_keys: ['nft:n0$wonderland'],
        write_keys: ['nft:n0$wonderland'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'register_role_run',
        read_keys: ['role:auditor'],
        write_keys: ['role:auditor'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'unregister_definition_run',
        read_keys: [`asset_def:${definitionLiteral}`],
        write_keys: [`asset_def:${definitionLiteral}`],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'unregister_trigger_run',
        read_keys: ['trigger:wake'],
        write_keys: ['trigger:wake', 'trigger.repetitions:wake'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('does not derive register access from malformed static register object payloads', () => {
    const missingDomainFields = encodeRegisterInstructionLiteral(1, concatBytes(
      encodeStructField(encodeDomainIdBare('wonderland'))
    ));
    const extraAccountField = encodeRegisterInstructionLiteral(2, concatBytes(
      encodeNewAccountBare(SAMPLE_ED25519_PUBLIC_KEY),
      encodeStructField(encodeNoritoStringBare('tail'))
    ));
    const missingNftOwner = encodeRegisterInstructionLiteral(4, concatBytes(
      encodeStructField(encodeNftIdBare('n0', 'wonderland')),
      encodeStructField(encodeEmptyMetadataBare())
    ));
    const missingRoleOwner = encodeRegisterInstructionLiteral(5, concatBytes(
      encodeStructField(encodeRoleBare('auditor'))
    ));

    const compiled = compileKotodamaStudioProgram(`
seiyaku MalformedRegisterObjectAccess {
  kotoage fn missing_domain_fields() permission(Admin) {
    execute_instruction(norito_bytes("${missingDomainFields}"));
  }

  kotoage fn extra_account_field() permission(Admin) {
    execute_instruction(norito_bytes("${extraAccountField}"));
  }

  kotoage fn missing_nft_owner() permission(Admin) {
    execute_instruction(norito_bytes("${missingNftOwner}"));
  }

  kotoage fn missing_role_owner() permission(Admin) {
    execute_instruction(norito_bytes("${missingRoleOwner}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toBeNull();
    for (const entrypoint of compiled.manifest?.entrypoints ?? []) {
      expect(entrypoint).toEqual(expect.objectContaining({
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      }));
    }
  });

  it('derives exact asset-bucket query access from static FindAssetById Norito payloads', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}#dataspace:7`;
    const query = encodeQueryLiteral(6, encodeStructField(encodeAssetIdBare(SAMPLE_ASSET_DEFINITION_BYTES, SAMPLE_ED25519_PUBLIC_KEY, 7)));
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetQueryAccess {
  view fn fetch_asset() -> int {
    let result = execute_query(norito_bytes("${query}"));
    return 1;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'fetch_asset',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
        ],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
      })
    );
  });

  it('supports typed local Map::new bindings, local map aliasing, and one-slot in-memory map helpers', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalMapDemo {
  kotoage fn compute() -> int {
    let values: Map<Name, int> = std::map::new();
    let aliases: Map<Name, int> = std::Map::new();
    let mirror: Map<Name, int> = values;
    let primary = name("alice");
    let secondary = name("bob");
    mirror[primary] = 7;
    aliases[primary] = 5;
    let existing = values.get_or(primary, 1);
    let seen = values.contains(primary);
    let inserted = mirror.ensure(secondary, 9);
    return existing + seen + inserted + values[secondary] + aliases[primary];
  }
}
`);
    const inferredAlias = compileKotodamaStudioProgram(`
seiyaku InferredMapAlias {
  kotoage fn run() -> int {
    let values: Map<int, int> = Map::new();
    values[1] = 41;
    let alias = values;
    alias[1] += 1;
    return alias[1];
  }
}
`);
    const unusedAlias = compileKotodamaStudioProgram(`
seiyaku UnusedMapAlias {
  kotoage fn run() {
    let values: Map<Name, int> = Map::new();
    let _copy = values;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect([...compiled.artifactBytes]).toContain(0xf0);
    expect([...compiled.artifactBytes]).toContain(0x21);
    expect([...compiled.artifactBytes]).toContain(0x30);
    expect([...compiled.artifactBytes]).toContain(0x31);
    expect([...compiled.artifactBytes]).toContain(0x5f);
    expect(inferredAlias.diagnostics).toEqual([]);
    expect(inferredAlias.artifactBytes.length).toBeGreaterThan(64);
    expect(unusedAlias.diagnostics).toEqual([]);
    expect(unusedAlias.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports map-valued helper parameters and returns through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MapReturnHelpers {
  fn make_empty() -> Map<Name, int> {
    return Map::new();
  }

  fn make_seeded() -> Map<Name, int> {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    return values;
  }

  fn read(values: Map<Name, int>, key: Name) -> int {
    return values.get_or(key, 0);
  }

  kotoage fn run() -> int permission(Admin) {
    let empty = make_empty();
    let seeded = make_seeded();
    return read(empty, name("bob")) + read(seeded, name("alice"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x50))).toBe(false);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x56))).toBe(false);
  });

  it('uses direct Name literal TLVs for local map keys through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalNameMapKeys {
  kotoage fn run() -> int permission(Admin) {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    let first = values.get_or(name("alice"), 0);
    let second = values[name("alice")];
    let seen = values.contains(name("alice"));
    return first + second + seen;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x5c))).toBe(false);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x5f))).toBe(true);
  });

  it('supports maps inside local struct fields through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
struct Holder { values: Map<Name, int>; }
struct Wrap { holder: Holder; }

seiyaku StructMapFields {
  fn build() -> Wrap {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    return Wrap(Holder(values));
  }

  fn read(wrapped: Wrap) -> int {
    return wrapped.holder.values.get_or(name("alice"), 0);
  }

  kotoage fn run() -> int permission(Admin) {
    return read(build());
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports method calls after tuple numeric map members through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TupleMapMembers {
  fn make() -> (Map<Name, int>, int) {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    return (values, 1);
  }

  kotoage fn run() -> int permission(Admin) {
    let pair = make();
    return pair.0.get_or(name("alice"), 0) + pair.1;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('mirrors Rust opaque aggregate helper parameter ABI through the SDK package boundary', () => {
    const tupleParam = compileKotodamaStudioProgram(`
seiyaku HelperTupleParam {
  fn sum(pair: (int, int)) -> int {
    return pair.0 + pair.1;
  }

  kotoage fn run(x: int) -> int {
    return sum((x, 2));
  }
}
`);
    const structParam = compileKotodamaStudioProgram(`
struct Pair { a: int; b: int; }

seiyaku HelperStructParam {
  fn sum(pair: Pair) -> int {
    return pair.a + pair.b;
  }

  kotoage fn run(x: int) -> int {
    return sum(Pair(x, 2));
  }
}
`);

    for (const compiled of [tupleParam, structParam]) {
      const budgets = new Map(compiled.budgetReport.map((entry) => [entry.function_name, entry]));

      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.artifactBytes).toHaveLength(1293);
      expect({
        bytecode_bytes: budgets.get('sum')?.bytecode_bytes,
        frame_bytes: budgets.get('sum')?.frame_bytes,
      }).toEqual({ bytecode_bytes: 92, frame_bytes: 40 });
      expect({
        bytecode_bytes: budgets.get('__entrypoint_impl__run')?.bytecode_bytes,
        frame_bytes: budgets.get('__entrypoint_impl__run')?.frame_bytes,
      }).toEqual({ bytecode_bytes: 416, frame_bytes: 48 });
    }
  });

  it('supports direct map-valued helper expressions through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
struct Holder { values: Map<Name, int>; }

seiyaku DirectMapExpressions {
  fn make() -> Map<Name, int> {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    return values;
  }

  fn make_pair() -> (Map<Name, int>, int) {
    return (make(), 1);
  }

  fn make_holder() -> Holder {
    return Holder(make());
  }

  fn read(values: Map<Name, int>, key: Name) -> int {
    return values.get_or(key, 0);
  }

  kotoage fn run() -> int permission(Admin) {
    let typed: Map<Name, int> = make();
    let conditional: Map<Name, int> = 1 > 0 ? make() : make();
    return make().get_or(name("alice"), 0)
      + make()[name("alice")]
      + make().contains(name("alice"))
      + make_pair().0.get_or(name("alice"), 0)
      + make_pair().0[name("alice")]
      + make_holder().values.get_or(name("alice"), 0)
      + read(make(), name("alice"))
      + (1 > 0 ? make() : make()).get_or(name("alice"), 0)
      + conditional.get_or(name("alice"), 0)
      + typed.get_or(name("alice"), 0);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('matches Rust budget for helper map-return lookups through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HelperMapReturn {
  fn make() -> Map<Name, int> {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    return values;
  }

  kotoage fn run() -> int permission(Admin) {
    return make().get_or(name("alice"), 0);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
    }))).toEqual([
      { function_name: 'run', bytecode_bytes: 668, frame_bytes: 48, pc_start: 0, pc_end: 668 },
      { function_name: 'make', bytecode_bytes: 228, frame_bytes: 32, pc_start: 668, pc_end: 896 },
    ]);
  });

  it('supports call-style pointer constructors, time sysvars, get_or, and upstream integer helper builtins', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BuiltinParity {
  state LastSeen: Map<Name, int>;

  kotoage fn quote(key: Name) -> int permission(Admin) {
    let pool = name("pool");
    let owner = account_id("alice@wonderland");
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    let note = json("\\"hello\\"");
    let payload = norito_bytes("0x0102");
    let raw = blob("raw");
    let now = current_time_ms();
    let block_time = block_time_ms();
    let chain = chain_id();
    let cached = LastSeen.get_or(key, 5);
    let limit = max(min(abs(-7), div_ceil(9, 2)), mean(gcd(48, 18), 5));
    info(now);
    info(block_time);
    info(tlv_len(chain));
    set_account_detail(owner, pool, note);
    mint_asset(owner, asset, cached + limit);
    assert(payload == payload);
    return now + cached + limit;
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect([...compiled.artifactBytes]).toContain(0xa8);
    expect([...compiled.artifactBytes]).toContain(0x27);
    expect([...compiled.artifactBytes]).toContain(0x1e);
    expect([...compiled.artifactBytes]).toContain(0x1f);
    expect([...compiled.artifactBytes]).toContain(0x28);
    expect([...compiled.artifactBytes]).toContain(0x29);
    expect([...compiled.artifactBytes]).toContain(0x2a);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('SYSVAR_BLOCK_TIME_MS');
    expect(rendered).toContain('SYSVAR_CHAIN_ID');
  });

  it('resolves account_id alias literals through the upstream alias syscall', () => {
    const canonicalPublicKey = 'ed01200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
    const canonicalAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(canonicalPublicKey);
    const testnetAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(canonicalPublicKey, 0x0171);

    if (canonicalAccount === null || testnetAccount === null) {
      throw new Error('failed to construct account literal fixtures');
    }

    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountAliasPointers {
  kotoage fn run() permission(Admin) {
    let alias = account_id("merchant@paynet");
    let deferred = account_id("merchant@");
    set_account_detail(alias, name("status"), json!{ ok: true });
    set_account_detail(deferred, name("status"), json!{ ok: false });
  }
}
`, { mode: 'test' });
    const canonical = compileKotodamaStudioProgram(`
seiyaku CanonicalAccountPointer {
  kotoage fn run() permission(Admin) {
    let account = account_id("${canonicalAccount}");
    set_account_detail(account, name("status"), json!{ ok: true });
  }
}
`);
    const invalidPublicKey = compileKotodamaStudioProgram(`
seiyaku InvalidPublicKeyAccountPointer {
  kotoage fn run() permission(Admin) {
    let account = account_id("${canonicalPublicKey}");
  }
}
`);
    const invalidNetwork = compileKotodamaStudioProgram(`
seiyaku InvalidNetworkAccountPointer {
  kotoage fn run() permission(Admin) {
    let account = account_id("${testnetAccount}");
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidAccountAliasPointer {
  kotoage fn run() permission(Admin) {
    let account = account_id("merchant");
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0xa7))).toBe(true);
    expect(canonical.diagnostics).toEqual([]);
    expect(containsBytes(canonical.artifactBytes, syscallNeedle(0xa7))).toBe(false);
    expect(invalid.artifactBytes.length).toBe(0);
    expect(invalid.diagnostics).toHaveLength(1);
    expect(invalid.diagnostics[0]?.message).toMatch(
      /invalid AccountId literal `merchant`: AccountId must use a canonical I105 literal/
    );
    expect(invalidPublicKey.artifactBytes).toHaveLength(0);
    expect(invalidPublicKey.diagnostics[0]?.message).toMatch(
      /invalid AccountId literal `ed01200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20`: AccountId must use a canonical I105 literal/
    );
    expect(invalidNetwork.artifactBytes).toHaveLength(0);
    expect(invalidNetwork.diagnostics[0]?.message).toMatch(
      /invalid AccountId literal `test.*`: ERR_UNEXPECTED_NETWORK_PREFIX/
    );
  });

  it('supports trigger/runtime builtins like trigger_event, resolve_account_alias, execute_instruction, and json field getters', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerBridge {
  fn read_trigger_amount() -> int {
    let ev = trigger_event();
    let payload = json!{ amount: 7, "meta": "ok", owner: "alice@wonderland", asset_definition_id: "rose#wonderland", nft: "n0$wonderland.universal", proof: "010203" };
    let meta = payload.get_json(name("meta"));
    let key = ev.get_name(name("kind"));
    let owner = payload.get_account_id(name("owner"));
    let asset = payload.get_asset_definition_id(name("asset_definition_id"));
    let nft = payload.get_nft_id(name("nft"));
    let proof = payload.get_blob_hex(name("proof"));
    let amount = payload.get_int(name("amount"));
    let numeric = payload.get_numeric(name("amount"));
    let alias = resolve_account_alias("banking@sbp");
    execute_instruction(norito_bytes("0x0102"));
    info(tlv_len(pointer_to_norito(nft)));
    info(tlv_len(proof));
    set_account_detail(alias, key, meta);
    mint_asset(owner, asset, amount);
    return amount + numeric;
  }

  kotoage fn run() permission(Admin) {
    let amount = read_trigger_amount();
    info(amount);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect([...compiled.artifactBytes]).toContain(0xf1);
    expect([...compiled.artifactBytes]).toContain(0xa0);
    expect([...compiled.artifactBytes]).toContain(0xa7);
    expect([...compiled.artifactBytes]).toContain(0x78);
    expect([...compiled.artifactBytes]).toContain(0x79);
    expect([...compiled.artifactBytes]).toContain(0x7a);
    expect([...compiled.artifactBytes]).toContain(0x7b);
    expect([...compiled.artifactBytes]).toContain(0x7c);
    expect([...compiled.artifactBytes]).toContain(0x7d);
    expect([...compiled.artifactBytes]).toContain(0x7f);
    expect([...compiled.artifactBytes]).toContain(0x80);
    expect([...compiled.artifactBytes]).toContain(0x6a);
  });

  it('matches Rust account alias payload semantics through the reusable SDK', () => {
    const blobAlias = compileKotodamaStudioProgram(`
fn resolve_from_blob() {
  let alias = blob("banking@centralbank");
  let account = resolve_account_alias(alias);
  let encoded = pointer_to_norito(account);
  info(tlv_len(encoded));
}
`);
    const triggerEventEquality = compileKotodamaStudioProgram(`
fn compare_trigger_account() {
  let ev = trigger_event();
  let account = ev.get_account_id(name("account_id"));
  let resolved = resolve_account_alias("banking@centralbank");
  let same = account == resolved;
  assert(same, "account match");
}
`);

    for (const compiled of [blobAlias, triggerEventEquality]) {
      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.codeHashHex).toHaveLength(64);
      expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    }
  });

  it('lowers upstream sc_execute instruction aliases through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ScExecuteAliases {
  kotoage fn run() permission(Admin) {
    sc_execute_submit_ballot(norito_bytes("0x0102"));
    sc_execute_unshield(norito_bytes("0x0304"));
  }
}
`);
    const view = compileKotodamaStudioProgram(`
seiyaku ViewScExecuteAlias {
  view fn inspect() -> int {
    sc_execute_unshield(norito_bytes("0x0102"));
    return 1;
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const firstInstructionCall = rendered.indexOf('SMARTCONTRACT_EXECUTE_INSTRUCTION');

    expect(compiled.diagnostics).toEqual([]);
    expect(firstInstructionCall).toBeGreaterThanOrEqual(0);
    expect(rendered.indexOf('SMARTCONTRACT_EXECUTE_INSTRUCTION', firstInstructionCall + 1)).toBeGreaterThan(firstInstructionCall);
    expect(view.artifactBytes).toHaveLength(0);
    expect(view.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('view function `inspect` cannot perform instruction emission'),
      }),
    ]);
  });

  it('supports upstream JSON object builder builtins through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku JsonObjectBuilders {
  kotoage fn build(owner: AccountId) -> Json {
    let payload = json_object();
    let payload = json_set_int(payload, name("bucket_id"), 1);
    return json_set_account_id(payload, name("owner"), owner);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.manifest?.entrypoints[0]?.return_type).toBe('Json');
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('JSON_OBJECT');
    expect(rendered).toContain('JSON_SET_I64');
    expect(rendered).toContain('JSON_SET_ACCOUNT_ID');
  });

  it('accepts Rust int-like JSON integer builder values through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku JsonObjectIntLikeBuilders {
  kotoage fn build(amount: Amount, balance: Balance, exact: fixed_u128) -> Json {
    let payload = json_object();
    let payload = json_set_int(payload, name("amount"), amount);
    let payload = json_set_int(payload, name("balance"), balance);
    return json_set_int(payload, name("exact"), exact);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.manifest?.entrypoints[0]?.return_type).toBe('Json');
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('NUMERIC_TO_INT');
    expect(rendered).toContain('JSON_SET_I64');
    expect(readArtifactCode(compiled.artifactBytes)).toHaveLength(1308);
    expect(compiled.artifactBytes).toHaveLength(1981);
    expect(compiled.budgetReport.map(({ function_name, bytecode_bytes, frame_bytes }) => ({
      function_name,
      bytecode_bytes,
      frame_bytes,
    }))).toEqual([
      { function_name: 'build', bytecode_bytes: 620, frame_bytes: 48 },
      { function_name: '__entrypoint_impl__build', bytecode_bytes: 688, frame_bytes: 80 },
    ]);
  });

  it('supports upstream path helper method syntax through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PathHelpers {
  fn build_paths() {
    let base = name("EntryByKey");
    let int_path = base.path(7);
    let blob_path = base.path(norito_bytes("0x0102"));
    info(1);
  }

  kotoage fn run() {
    build_paths();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('BUILD_PATH_MAP_KEY');
    expect(rendered).toContain('BUILD_PATH_KEY_NORITO');
  });

  it('accepts Rust int-like path helper keys through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericPathHelpers {
  fn build_paths(amount: Amount, balance: Balance, exact: fixed_u128) {
    let base = name("EntryByKey");
    let amount_path = base.path(amount);
    let balance_path = base.path(balance);
    let exact_path = base.path(exact);
    info(1);
  }

  kotoage fn run(amount: Amount, balance: Balance, exact: fixed_u128) permission(Admin) {
    build_paths(amount, balance, exact);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('BUILD_PATH_MAP_KEY');
    expect(rendered).toContain('NUMERIC_TO_INT');
    expect(rendered).not.toContain('NAME_DECODE');
    expect(readArtifactCode(compiled.artifactBytes)).toHaveLength(1504);
    expect(compiled.artifactBytes).toHaveLength(2273);
    expect(compiled.budgetReport.map(({ function_name, bytecode_bytes, frame_bytes }) => ({
      function_name,
      bytecode_bytes,
      frame_bytes,
    }))).toEqual([
      { function_name: 'run', bytecode_bytes: 612, frame_bytes: 48 },
      { function_name: 'build_paths', bytecode_bytes: 500, frame_bytes: 72 },
      { function_name: '__entrypoint_impl__run', bytecode_bytes: 392, frame_bytes: 56 },
    ]);
  });

  it('supports upstream schema helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SchemaHelpers {
  fn roundtrip() -> Json {
    let schema = name("example.schema");
    let encoded = encode_schema(schema, json!{ ok: true });
    let decoded = decode_schema(schema, encoded);
    let info_json = schema_info(schema);
    info(1);
    return decoded;
  }

  kotoage fn run() permission(Admin) {
    let decoded = roundtrip();
    info(1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('SCHEMA_ENCODE');
    expect(rendered).toContain('SCHEMA_DECODE');
    expect(rendered).toContain('SCHEMA_INFO');
  });

  it('supports upstream hash helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HashHelpers {
  fn digest(payload: Blob) {
    let sm3 = sm3_hash(payload);
    let sm3_namespaced = sm::hash(payload);
    let sm3_explicit_namespaced = sm::sm3_hash(payload);
    let sha256 = sha256_hash(payload);
    let sha3 = sha3_hash(payload);
    let blake2b = blake2b256_hash(payload);
    let keccak = keccak256_hash(payload);
    let iroha = iroha_hash(payload);
    info(tlv_len(sm3));
    info(tlv_len(sm3_namespaced));
    info(tlv_len(sm3_explicit_namespaced));
    info(tlv_len(sha256));
    info(tlv_len(sha3));
    info(tlv_len(blake2b));
    info(tlv_len(keccak));
    info(tlv_len(iroha));
  }

  kotoage fn run() permission(Admin) {
    digest(blob("0x010203"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('SM3_HASH');
    expect(rendered).toContain('SHA256_HASH');
    expect(rendered).toContain('SHA3_HASH');
    expect(rendered).toContain('BLAKE2B256_HASH');
    expect(rendered).toContain('KECCAK256_HASH');
    expect(rendered).toContain('IROHA_HASH');
  });

  it('rejects stale free hash helper aliases through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku FreeHashAlias {
  kotoage fn run() permission(Admin) {
    let digest = hash(blob("0x010203"));
    info(1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics[0]?.message).toMatch(/hash/);
  });

  it('supports upstream encode and decode helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku EncodeDecodeHelpers {
  fn roundtrip() -> int {
    let int_bytes = encode_int(7);
    let decoded_int = decode_int(int_bytes);
    let json_bytes = encode_json(json!{ ok: true });
    let decoded_json = decode_json(json_bytes);
    info(tlv_len(json_bytes));
    return decoded_int;
  }

  kotoage fn run() permission(Admin) {
    let decoded = roundtrip();
    info(decoded);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('ENCODE_INT');
    expect(rendered).toContain('DECODE_INT');
    expect(rendered).toContain('JSON_ENCODE');
    expect(rendered).toContain('JSON_DECODE');
  });

  it('supports upstream name_decode helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NameDecodeHelper {
  view fn decode() -> Name {
    return name_decode(norito_bytes("70726f6265"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('NAME_DECODE');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('supports explicit TLV equality helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TlvEqHelper {
  view fn compare() -> int {
    let left = name("probe");
    let right = name_decode(norito_bytes("70726f6265"));
    if tlv_eq(left, right) {
      return 1;
    }
    return 0;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('TLV_EQ');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('accepts Rust int-like encode_int values through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku EncodeIntLikeHelpers {
  fn encode(amount: Amount, balance: Balance, exact: fixed_u128) {
    let amount_bytes = encode_int(amount);
    let balance_bytes = encode_int(balance);
    let exact_bytes = encode_int(exact);
    info(tlv_len(amount_bytes) + tlv_len(balance_bytes) + tlv_len(exact_bytes));
  }

  kotoage fn run(amount: Amount, balance: Balance, exact: fixed_u128) permission(Admin) {
    encode(amount, balance, exact);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('ENCODE_INT');
    expect(rendered).toContain('NUMERIC_TO_INT');
  });

  it('supports upstream pointer-to-Norito and TLV length helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PointerTlvHelpers {
  fn payload_size(owner: AccountId) -> int {
    let owner_bytes = pointer_to_norito(owner);
    let owner_len = tlv_len(owner_bytes);
    let json_len = tlv_len(json!{ ok: true });
    info(owner_len);
    return owner_len + json_len;
  }

  kotoage fn run() permission(Admin) {
    let size = payload_size(authority());
    info(size);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('POINTER_TO_NORITO');
    expect(rendered).toContain('TLV_LEN');
  });

  it('supports direct durable state helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectStateHelpers {
  fn touch() {
    let path = name("DirectStateValue");
    let stored = state_get(path);
    state_set(path, stored);
    let keys = state_keys(path, 0, 2);
    let present = state_has(path);
    let len = state_len(path);
    let count = state_count(path);
    info(tlv_len(keys));
    if present {
      info(len);
    }
    info(count);
    state_del(path);
  }

  kotoage fn run() permission(Admin) {
    touch();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('STATE_GET');
    expect(rendered).toContain('STATE_SET');
    expect(rendered).toContain('STATE_KEYS');
    expect(rendered).toContain('STATE_HAS');
    expect(rendered).toContain('STATE_LEN');
    expect(rendered).toContain('STATE_COUNT');
    expect(rendered).toContain('STATE_DEL');
  });

  it('normalizes upstream host namespace helper calls through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HostNamespaceHelpers {
  kotoage fn run(payload: Json) -> bytes permission(Admin) {
    let path = host::name("HostNamespacePath");
    let stored = host::state_get(path);
    host::state_set(path, stored);
    host::state_del(path);
    let now = host::current_time_ms();
    let block_time = host::block_time_ms();
    let chain = host::chain_id();
    let total = host::state_count(path);
    info(now);
    info(block_time);
    info(tlv_len(chain));
    info(total);
    return host::call_contract("target.contract", "settle", payload);
  }
}
`, { mode: 'test' });
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidHostNamespaceHelper {
  kotoage fn run() permission(Admin) {
    let response = host::call_contract(1, "settle", json!{ amount: 1 });
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.return_type).toBe('bytes');
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('STATE_GET');
    expect(rendered).toContain('STATE_SET');
    expect(rendered).toContain('STATE_DEL');
    expect(rendered).toContain('CURRENT_TIME_MS');
    expect(rendered).toContain('SYSVAR_BLOCK_TIME_MS');
    expect(rendered).toContain('SYSVAR_CHAIN_ID');
    expect(rendered).toContain('STATE_COUNT');
    expect(rendered).toContain('CALL_CONTRACT');
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('call_contract expects (String|Blob, String|Blob, Json)'),
      }),
    ]);
  });

  it('supports upstream VRF helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku VrfHelpers {
  fn verify(payload: Blob) {
    let proof = vrf_verify(payload, payload, payload, 1);
    let batch = vrf_verify_batch(payload);
    info(1);
  }

  kotoage fn run() permission(Admin) {
    verify(blob("0x010203"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('VRF_VERIFY');
    expect(rendered).toContain('VRF_VERIFY_BATCH');
  });

  it('supports upstream namespaced ZK helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ZkNamespaceHelpers {
  fn verify(payload: Blob) {
    zk::verify_transfer(payload);
    zk::verify_unshield(payload);
    zk::verify_batch(payload);
    zk::vote::verify_ballot(payload);
    zk::vote::verify_tally(payload);
  }

  kotoage fn run() permission(Admin) {
    verify(blob("0x010203"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('ZK_VERIFY_TRANSFER');
    expect(rendered).toContain('ZK_VERIFY_UNSHIELD');
    expect(rendered).toContain('ZK_VERIFY_BATCH');
    expect(rendered).toContain('ZK_VOTE_VERIFY_BALLOT');
    expect(rendered).toContain('ZK_VOTE_VERIFY_TALLY');
  });

  it('supports upstream setvl vector helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku VectorLength {
  const VL: int = 8;

  kotoage fn main() {
    setvl(VL);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.features_bitmap).toBe(2);
    expect(compiled.artifactBytes[6]).toBe(2);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('setvl');
  });

  it('derives ZK feature metadata from poseidon usage through the SDK package boundary', () => {
    const plain = compileKotodamaStudioProgram(`
seiyaku PlainFeature {
  kotoage fn main() -> int {
    return 1;
  }
}
`);
    const poseidon = compileKotodamaStudioProgram(`
seiyaku PoseidonFeature {
  kotoage fn order_id(trader: int, salt: int) -> int {
    let h = poseidon2(trader, salt);
    return h;
  }
}
`);

    expect(plain.diagnostics).toEqual([]);
    expect(poseidon.diagnostics).toEqual([]);
    expect(plain.manifest?.features_bitmap).toBe(0);
    expect(plain.artifactBytes[6]).toBe(0);
    expect(poseidon.manifest?.features_bitmap).toBe(1);
    expect(poseidon.artifactBytes[6]).toBe(1);
  });

  it('supports upstream pubkgen and valcom helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku CommitmentHelpers {
  kotoage fn main() -> int {
    let public_key = pubkgen(7);
    let commitment = valcom(11, 13);
    return public_key + commitment;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.features_bitmap).toBe(1);
    expect(compiled.artifactBytes[6]).toBe(1);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('pubkgen');
    expect(rendered).toContain('valcom');
  });

  it('mirrors upstream poseidon6 unsupported diagnostics through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku Poseidon6Unsupported {
  kotoage fn main() -> int {
    let h = poseidon6(1, 2, 3, 4, 5, 6);
    return h;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('POSEIDON6 not supported'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports upstream call_contract helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ContractCallRelay {
  kotoage fn relay(target: bytes, payload: Json) -> bytes permission(Admin) {
    return call_contract(target, "settle", payload);
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('CALL_CONTRACT');
    expect(compiled.manifest?.entrypoints[0]?.return_type).toBe('bytes');
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).toBe(false);
  });

  it('renders canonical bytes state and ABI type names through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku CanonicalBytesTypes {
  state Payload: bytes;
  state Values: Map<Name, bytes>;

  kotoage fn run(key: Name, payload: Bytes) -> bytes permission(Admin) {
    Payload = payload;
    Values[key] = Payload;
    return Values[key];
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.params).toEqual([
      { name: 'key', type_name: 'Name' },
      { name: 'payload', type_name: 'bytes' },
    ]);
    expect(compiled.manifest?.entrypoints[0]?.return_type).toBe('bytes');
    expect(compiled.manifest?.states).toEqual([
      { name: 'Payload', type_name: 'bytes' },
      { name: 'Values', type_name: 'map<Name, bytes>' },
    ]);
    expect(compiled.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
    }))).toEqual([
      { function_name: 'run', bytecode_bytes: 488, frame_bytes: 40, pc_start: 0, pc_end: 488 },
      { function_name: '__entrypoint_impl__run', bytecode_bytes: 748, frame_bytes: 64, pc_start: 488, pc_end: 1236 },
    ]);

    const scalarState = compileKotodamaStudioProgram(`
seiyaku ScalarBytesState {
  state Payload: bytes;

  kotoage fn run(payload: bytes) -> bytes permission(Admin) {
    Payload = payload;
    return Payload;
  }
}
`);

    expect(scalarState.diagnostics).toEqual([]);
    expect(scalarState.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
    }))).toEqual([
      { function_name: 'run', bytecode_bytes: 356, frame_bytes: 32, pc_start: 0, pc_end: 356 },
      { function_name: '__entrypoint_impl__run', bytecode_bytes: 328, frame_bytes: 40, pc_start: 356, pc_end: 684 },
    ]);
  });

  it('treats user-written NoritoBytes as a normal struct name through the reusable SDK package boundary', () => {
    const publicType = compileKotodamaStudioProgram(`
seiyaku PublicNoritoBytes {
  kotoage fn run(payload: NoritoBytes) -> NoritoBytes permission(Admin) {
    return payload;
  }
}
`);
    const stateType = compileKotodamaStudioProgram(`
seiyaku StateNoritoBytes {
  state Payload: NoritoBytes;

  kotoage fn run(payload: bytes) -> bytes permission(Admin) {
    Payload = payload;
    return Payload;
  }
}
`);
    const mapStateType = compileKotodamaStudioProgram(`
seiyaku MapStateNoritoBytes {
  state Values: Map<Name, NoritoBytes>;

  kotoage fn run(key: Name, payload: bytes) -> bytes permission(Admin) {
    Values[key] = payload;
    return Values[key];
  }
}
`);
    const localType = compileKotodamaStudioProgram(`
seiyaku LocalNoritoBytes {
  kotoage fn run(payload: bytes) -> bytes permission(Admin) {
    let local: NoritoBytes = payload;
    return local;
  }
}
`);
    const userStruct = compileKotodamaStudioProgram(`
seiyaku StructNoritoBytes {
  struct NoritoBytes { value: int }

  fn make() -> NoritoBytes {
    return NoritoBytes(1);
  }

  view fn run() -> int {
    let value = make();
    return value.value;
  }
}
`);

    expect(publicType.artifactBytes).toHaveLength(0);
    expect(publicType.diagnostics[0]?.message).toBe(
      'entrypoint parameter `payload` uses unsupported public type Opaque("NoritoBytes")',
    );
    expect(stateType.artifactBytes).toHaveLength(0);
    expect(stateType.diagnostics[0]?.message).toBe(
      'semantic error: state type `NoritoBytes` is not supported for durable storage; use int, bool, Json, Blob, or pointer types',
    );
    expect(mapStateType.artifactBytes).toHaveLength(0);
    expect(mapStateType.diagnostics[0]?.message).toBe(
      'semantic error: state Map value type `NoritoBytes` is not supported for durable storage; use int, bool, Json, Blob, or pointer types',
    );
    expect(localType.artifactBytes).toHaveLength(0);
    expect(localType.diagnostics[0]?.message).toBe(
      'semantic error: type annotation mismatch: expected NoritoBytes, got bytes',
    );
    expect(userStruct.diagnostics).toEqual([]);
    expect(userStruct.manifest?.entrypoints[0]?.return_type).toBe('int');
  });

  it('mirrors Rust numeric type aliases through the reusable SDK package boundary', () => {
    const aliases = compileKotodamaStudioProgram(`
seiyaku NumericTypeAliases {
  state Counter: i64;
  state Values: Map<number, i64>;

  kotoage fn run(key: i64, value: number) -> i64 permission(Admin) {
    Counter = value;
    Values[key] = Counter;
    let local: number = Values[key];
    return local;
  }
}
`);
    const staleU32 = compileKotodamaStudioProgram(`
seiyaku StaleU32Alias {
  kotoage fn run(value: u32) -> u32 permission(Admin) {
    return value;
  }
}
`);
    const staleNumeric = compileKotodamaStudioProgram(`
seiyaku StaleNumericAlias {
  kotoage fn run(value: Numeric) -> Numeric permission(Admin) {
    return value;
  }
}
`);

    expect(aliases.diagnostics).toEqual([]);
    expect(aliases.manifest?.entrypoints[0]?.params).toEqual([
      { name: 'key', type_name: 'int' },
      { name: 'value', type_name: 'int' },
    ]);
    expect(aliases.manifest?.entrypoints[0]?.return_type).toBe('int');
    expect(aliases.manifest?.states).toEqual([
      { name: 'Counter', type_name: 'int' },
      { name: 'Values', type_name: 'map<int, int>' },
    ]);
    expect(staleU32.artifactBytes).toHaveLength(0);
    expect(staleU32.diagnostics[0]?.message).toBe(
      'entrypoint parameter `value` uses unsupported public type Opaque("u32")',
    );
    expect(staleNumeric.artifactBytes).toHaveLength(0);
    expect(staleNumeric.diagnostics[0]?.message).toBe(
      'entrypoint parameter `value` uses unsupported public type Opaque("Numeric")',
    );
  });

  it('preserves dynamic String ABI values through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DynamicStringAbi {
  fn label(raw: String) -> String {
    return raw;
  }

  view fn current_label() -> String {
    let raw: String = "settle";
    return label(raw);
  }

  kotoage fn run() permission(Admin) {
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    let symbol: String = label("ROSE");
    register_asset(asset, symbol, 0, 1);
    create_new_asset(asset, symbol, 7, authority(), 0);
    let response = call_contract("contract", label("settle"), json!{ ok: true });
    info(tlv_len(response));
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('REGISTER_ASSET');
    expect(rendered).toContain('MINT_ASSET');
    expect(rendered).toContain('CALL_CONTRACT');
    expect(compiled.manifest?.entrypoints.find((entry) => entry.name === 'current_label')?.return_type).toBe('string');
  });

  it('supports upstream account and asset lifecycle helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LifecycleHelpers {
  kotoage fn run() permission(Admin) {
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    register_account(authority());
    unregister_account(authority());
    register_asset(asset, "ROSE", 0, 1);
    create_new_asset(asset, "ROSE", 7, authority(), 0);
    unregister_asset(asset);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('REGISTER_ACCOUNT');
    expect(rendered).toContain('UNREGISTER_ACCOUNT');
    expect(rendered).toContain('REGISTER_ASSET');
    expect(rendered).toContain('UNREGISTER_ASSET');
    expect(rendered).toContain('MINT_ASSET');
  });

  it('supports upstream role and permission helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RolePermissionHelpers {
  kotoage fn run() permission(Admin) {
    let role = name("auditor");
    create_role(role, json!{ permissions: ["read_blocks"] });
    grant_role(authority(), role);
    revoke_role(authority(), role);
    grant_permission(authority(), name("read_blocks"));
    revoke_permission(authority(), json!{ "permission": "read_blocks" });
    delete_role(role);
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('CREATE_ROLE');
    expect(rendered).toContain('DELETE_ROLE');
    expect(rendered).toContain('GRANT_ROLE');
    expect(rendered).toContain('REVOKE_ROLE');
    expect(rendered).toContain('GRANT_PERMISSION');
    expect(rendered).toContain('REVOKE_PERMISSION');
  });

  it('derives exact permission management access through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PermissionTokenAccess {
  kotoage fn run() permission(Admin) {
    let account = authority();
    let scoped = name("mint_asset:62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    let object_token = json!{ type: "burn_asset:62Fk4FPcMuLvW5QjDGNF2a4jAmjM" };
    let string_token = json("\\"transfer_asset:62Fk4FPcMuLvW5QjDGNF2a4jAmjM\\"");
    grant_permission(account, scoped);
    revoke_permission(account, object_token);
    grant_permission(account, string_token);
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const entrypoint = compiled.manifest?.entrypoints.find((entry) => entry.name === 'run');
    expect(new Set(entrypoint?.read_keys)).toEqual(new Set(['account:$authority']));
    expect(new Set(entrypoint?.write_keys)).toEqual(new Set([
      'account:$authority',
      'perm.account:$authority:mint_asset',
      'perm.account:$authority:burn_asset',
      'perm.account:$authority:transfer_asset',
    ]));
    expect(entrypoint?.read_keys).not.toContain('*');
    expect(entrypoint?.write_keys).not.toContain('*');
  });

  it('supports upstream peer and trigger management helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PeerTriggerHelpers {
  kotoage fn run() permission(Admin) {
    let trigger = name("wake");
    register_peer(json!{ address: "127.0.0.1:1337" });
    unregister_peer(json!{ address: "127.0.0.1:1337" });
    create_trigger(json!{ id: "wake", action: "noop" });
    remove_trigger(trigger);
    set_trigger_enabled(trigger, 1);
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('REGISTER_PEER');
    expect(rendered).toContain('UNREGISTER_PEER');
    expect(rendered).toContain('CREATE_TRIGGER');
    expect(rendered).toContain('REMOVE_TRIGGER');
    expect(rendered).toContain('SET_TRIGGER_ENABLED');
  });

  it('derives exact trigger management access through the reusable SDK package boundary', () => {
    const noritoTriggerJson = JSON.stringify([
      'TlJUMAAAQetZvFUPBy9B61m8VQ8HLwA+AQAAAAAAAFTpjwhsEu+KABkAAAAAAAAA',
      'EQAAAAAAAAAJAAAAAAAAAHRlYV9wYXJ0eRUBAAAAAAAAFAAAAAAAAAAAAAAACAAAA',
      'AAAAAAAAAAAAAAAABAAAAAAAAAAAQAAAAQAAAAAAAAAAQAAAHgAAAAAAAAAGgAAAA',
      'AAAAASAAAAAAAAAAoAAAAAAAAAd29uZGVybGFuZE4AAAAAAAAARgAAAAAAAABlZD',
      'AxMjBDRTdGQTQ2QzlEQ0U3RUE0QjEyNUUyRTM2QkRCNjNFQTMzMDczRTc1OTBBQz',
      'kyODE2QUUxRTg2MUI3MDQ4QjAzEAAAAAAAAAABAAAABAAAAAAAAAAAAAAAQQAAAA',
      'AAAAABAAAAAAAAADEAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAHRlYV90aW1lEQAAAAAA',
      'AAAJAAAAAAAAAAEAAAAAAAAANQ==',
    ].join(''));
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerManagementAccess {
  kotoage fn run() permission(Admin) {
    create_trigger(json!{ id: "wake", action: "noop" });
    let nap = json("{\\"id\\":\\"nap\\",\\"action\\":\\"noop\\"}");
    register_trigger(nap);
    create_trigger(json(${JSON.stringify(noritoTriggerJson)}));
    remove_trigger(name("wake"));
    unregister_trigger(name("nap"));
    set_trigger_enabled(name("wake"), 1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: ['trigger:wake', 'trigger:nap', 'trigger:tea_party'],
      write_keys: [
        'trigger:wake',
        'trigger.repetitions:wake',
        'trigger:nap',
        'trigger.repetitions:nap',
        'trigger:tea_party',
        'trigger.repetitions:tea_party',
      ],
      access_hints_complete: true,
      access_hints_skipped: [],
    }));
  });

  it('keeps malformed base64 trigger JSON access opaque through the reusable SDK package boundary', () => {
    const malformedTriggerJson = JSON.stringify(encodeBase64(encodeNoritoTopLevel(concatBytes(
      encodeStructField(encodeTriggerIdBare('fake')),
      encodeStructField(Uint8Array.from([0xff]))
    ))));
    const compiled = compileKotodamaStudioProgram(`
seiyaku MalformedTriggerAccess {
  kotoage fn run() permission(Admin) {
    create_trigger(json(${JSON.stringify(malformedTriggerJson)}));
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_complete: false,
      access_hints_skipped: ['opaque ISI access is not compiler-resolved'],
    }));
  });

  it('supports upstream signature verification helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SignatureHelpers {
  fn verify(payload: Blob) {
    let sm2 = sm2_verify(payload, payload, payload);
    let sm2_with_distid = sm2_verify(payload, payload, payload, payload);
    let generic = verify_signature(payload, payload, payload, 0);
    assert(sm2, "sm2");
    assert(sm2_with_distid, "sm2_distid");
    assert(generic, "generic");
  }

  kotoage fn run() permission(Admin) {
    verify(blob("0x010203"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('SM2_VERIFY');
    expect(rendered).toContain('VERIFY_SIGNATURE');
  });

  it('supports upstream SM4 helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku Sm4Helpers {
  fn crypt(payload: Blob) {
    let gcm = sm4_gcm_seal(payload, payload, payload, payload);
    let opened_gcm = sm4_gcm_open(payload, payload, payload, gcm);
    let ccm = sm::seal_ccm(payload, payload, payload, payload, 12);
    let opened_ccm = sm::open_ccm(payload, payload, payload, ccm);
    info(tlv_len(opened_gcm));
    info(tlv_len(opened_ccm));
  }

  kotoage fn run() permission(Admin) {
    crypt(blob("0x010203"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('SM4_GCM_SEAL');
    expect(rendered).toContain('SM4_GCM_OPEN');
    expect(rendered).toContain('SM4_CCM_SEAL');
    expect(rendered).toContain('SM4_CCM_OPEN');
  });

  it('accepts Rust int-like crypto selector arguments through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku CryptoIntLikeSelectors {
  fn verify(payload: Blob, amount: Amount, balance: Balance, exact: fixed_u128) {
    let vrf = vrf_verify(payload, payload, payload, amount);
    let signature = verify_signature(payload, payload, payload, balance);
    let sealed = sm4_ccm_seal(payload, payload, payload, payload, exact);
    let opened = sm4_ccm_open(payload, payload, payload, sealed, amount);
    assert(signature, "signature");
    info(tlv_len(vrf) + tlv_len(opened));
  }

  kotoage fn run(amount: Amount, balance: Balance, exact: fixed_u128) permission(Admin) {
    verify(blob("0x010203"), amount, balance, exact);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('VRF_VERIFY');
    expect(rendered).toContain('VERIFY_SIGNATURE');
    expect(rendered).toContain('SM4_CCM_SEAL');
    expect(rendered).toContain('SM4_CCM_OPEN');
    expect(rendered).toContain('NUMERIC_TO_INT');
  });

  it('supports upstream NFT host helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NftHostHelpers {
  kotoage fn run() permission(Admin) {
    let nft = nft_id("n0$wonderland.universal");
    nft_mint_asset(nft, authority());
    nft_set_metadata(nft, name("dpn_metadata"), json!{ "meta": 1 });
    nft_transfer_asset(authority(), nft, authority());
    nft_burn_asset(nft);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('NFT_MINT_ASSET');
    expect(rendered).toContain('NFT_SET_METADATA');
    expect(rendered).toContain('NFT_TRANSFER_ASSET');
    expect(rendered).toContain('NFT_BURN_ASSET');
  });

  it('supports upstream fixed-cap map enumeration helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MapEnumerationHelpers {
  fn scan() -> int {
    let values: Map<int, int> = Map::new();
    values[11] = 22;
    let key = keys_take2(values, 0, 0);
    let value = std::map::values_take2(values, 0, 0);
    let pair = keys_values_take2(values, 0, 0);
    return key + value + pair.0 + pair.1;
  }

  kotoage fn run() permission(Admin) {
    let value = scan();
    info(value);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('load64');
  });

  it('preserves Rust bytecode shape for direct map enumeration returns through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MapEnum {
  kotoage fn run() -> int permission(Admin) {
    let values: Map<int, int> = Map::new();
    values[11] = 22;
    let first_key = keys_take2(values, 0, 0);
    let first_value = std::map::values_take2(values, 0, 0);
    let first_pair = keys_values_take2(values, 0, 0);
    return first_key + first_value + first_pair.0 + first_pair.1;
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const runBudget = compiled.budgetReport.find((entry) => entry.function_name === 'run');

    expect(compiled.diagnostics).toEqual([]);
    expect(runBudget).toEqual(expect.objectContaining({
      bytecode_bytes: 336,
      bytecode_words: 84,
      frame_bytes: 72,
    }));
    expect(code).toHaveLength(336);
    expect(toHexLiteral(code.slice(208, 328))).toBe(
      '0x000005200000072000000620010606200607170300170620000017201017172017060510051817010017053008170630000507200000172000000620000005200105052005060403000405200000042010040420040517101718040100041730080418300018052008090401070408010508040100040a20'
    );
  });

  it('supports bounded upstream map foreach syntax through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BoundedMapForeach {
  fn scan_attr() -> int {
    let values: Map<int, int> = Map::new();
    values[11] = 22;
    let total = 0;
    for (key, value) in values #[bounded(1)] {
      total = total + key + value;
    }
    return total;
  }

  fn scan_take() -> int {
    let values: Map<int, int> = Map::new();
    values[3] = 5;
    let total = 0;
    for (key, value) in values.take(1) {
      total = total + key + value;
    }
    return total;
  }

  fn scan_range() -> int {
    let values: Map<int, int> = Map::new();
    values[7] = 9;
    let total = 0;
    for key in values.range(0, 1) {
      total = total + key;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {
    info(scan_attr() + scan_take() + scan_range());
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('load64');
  });

  it('supports direct map-valued helper foreach expressions through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectMapForeach {
  fn make() -> Map<int, int> {
    let values: Map<int, int> = Map::new();
    values[3] = 5;
    return values;
  }

  kotoage fn run() -> int permission(Admin) {
    let total = 0;
    for (key, value) in make().take(1) {
      total = total + key + value;
    }
    return total;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.codeHashHex).toHaveLength(64);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports bounded in-memory map foreach with policy-supported word keys through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalWordMapForeach {
  fn scan_name() -> int {
    let values: Map<Name, int> = Map::new();
    values[name("alice")] = 7;
    let total = 0;
    for (key, value) in values #[bounded(1)] {
      total = total + value + tlv_len(pointer_to_norito(key));
    }
    return total;
  }

  kotoage fn run() permission(Admin) {
    info(scan_name());
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0xe0))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x77))).toBe(true);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('supports bounded durable state map foreach loops through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateMapForeach {
  state Values: Map<int, int>;

  fn scan_attr() -> int {
    let total = 0;
    for (key, value) in Values #[bounded(2)] {
      total = total + key + value;
    }
    return total;
  }

  fn scan_take() -> int {
    let total = 0;
    for (key, value) in Values.take(2) {
      total = total + key + value;
    }
    return total;
  }

  fn scan_range() -> int {
    let total = 0;
    for (key, value) in Values.range(1, 3) {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {
    Values[0] = 2;
    Values[1] = 3;
    Values[2] = 5;
    info(scan_attr() + scan_take() + scan_range());
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('STATE_GET');
    expect(rendered).toContain('STATE_SET');
    expect(rendered).toContain('DECODE_INT');
    expect(rendered).toContain('BUILD_PATH_MAP_KEY');
  });

  it('supports dynamic durable state map foreach bounds through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DynamicStateMapForeach {
  state Values: Map<int, int>;

  fn scan_take(n: int) -> int {
    let total = 0;
    for (key, value) in Values.take(n) {
      total = total + key + value;
    }
    return total;
  }

  fn scan_range(start: int, end: int) -> int {
    let total = 0;
    for (key, value) in Values.range(start, end) {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run(n: int, start: int, end: int) -> int permission(Admin) {
    return scan_take(n) + scan_range(start, end);
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('ABORT');
    expect(rendered).toContain('STATE_GET');
    expect(compiled.manifest?.entrypoints[0]?.read_keys).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).toBe(true);
    expect(compiled.manifest?.access_set_hints?.read_keys).toEqual(['state:Values']);
    expect(compiled.manifest?.access_set_hints?.dynamic_reads).toEqual([
      {
        base_key: 'state:Values',
        key_type: 'int',
        bound_kind: 'range',
        max_keys: 64,
      },
      {
        base_key: 'state:Values',
        key_type: 'int',
        bound_kind: 'take',
        max_keys: 64,
      },
    ]);
    const code = readArtifactCode(compiled.artifactBytes);
    expect(Buffer.from(code.slice(736, 760)).toString('hex')).toBe(
      '000009200009072000180820000009200109092019000046',
    );
    expect(Buffer.from(code.slice(1172, 1216)).toString('hex')).toBe(
      'e000006000070b2054000060000a062000060a20e000006050000060000a1820000006200618050f1a000541',
    );
    expect(Buffer.from(code.slice(1416, 1444)).toString('hex')).toBe(
      '00180a20e000006053000060000a0520000718200018062005061801',
    );
    expect(Buffer.from(code.slice(1544, 1552)).toString('hex')).toBe('0907070153ff0046');
    expect(Buffer.from(code.slice(1884, 1908)).toString('hex')).toBe(
      '181707020018172007180501000007200107072019000046',
    );
    expect(Buffer.from(code.slice(2320, 2364)).toString('hex')).toBe(
      'e000006000170b2054000060000a062000060a20e000006050000060000a1820000006200618080f1a000841',
    );
    expect(Buffer.from(code.slice(2564, 2592)).toString('hex')).toBe(
      '00180a20e000006053000060000a0820001718200018062008061801',
    );
    expect(Buffer.from(code.slice(2692, 2700)).toString('hex')).toBe('0717170153ff0046');
    expect(compiled.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
    }))).toEqual([
      { function_name: 'run', pc_start: 0, pc_end: 620, bytecode_bytes: 620, frame_bytes: 48 },
      { function_name: 'scan_take', pc_start: 620, pc_end: 1732, bytecode_bytes: 1112, frame_bytes: 72 },
      { function_name: 'scan_range', pc_start: 1732, pc_end: 2880, bytecode_bytes: 1148, frame_bytes: 80 },
      {
        function_name: '__entrypoint_impl__run',
        pc_start: 2880,
        pc_end: 3524,
        bytecode_bytes: 644,
        frame_bytes: 64,
      },
    ]);
  });

  it('reports direct dynamic durable state map entrypoint reads through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectDynamicStateMapForeach {
  state Values: Map<int, int>;

  kotoage fn run(n: int) -> int permission(Admin) {
    let total = 0;
    for (key, value) in Values.take(n) {
      total = total + key + value;
    }
    return total;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.read_keys).toEqual(['state:Values']);
    expect(compiled.manifest?.entrypoints[0]?.write_keys).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: ['state:Values'],
      write_keys: [],
      dynamic_reads: [
        {
          base_key: 'state:Values',
          key_type: 'int',
          bound_kind: 'take',
          max_keys: 64,
        },
      ],
      dynamic_writes: [],
    });
  });

  it('keeps helper access at contract scope without transitive entrypoint keys through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountDetailHelperAccess {
  fn write_detail() {
    set_account_detail(authority(), name!("example"), json!{ hello: "world" });
  }

  kotoage fn run() permission(Admin) {
    write_detail();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.read_keys).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.write_keys).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: [
        'account.detail:$authority:example',
        'account:$authority',
      ],
      write_keys: ['account.detail:$authority:example'],
      dynamic_reads: [],
      dynamic_writes: [],
    });
  });

  it('emits default raw main entrypoint metadata through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
fn main(from: AccountId) {
  let mfc = mfc_asset();
  register_asset(mfc, "MFC", 0, 1);
  mint_asset(from, mfc, 1337);
}

fn mfc_asset() -> AssetDefinitionId {
  let mfc = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
  return mfc;
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      {
        name: 'main',
        kind: { kind: 'Public', value: null },
        params: [{ name: 'from', type_name: 'AccountId' }],
        return_type: null,
        permission: null,
        read_keys: ['asset_def:62Fk4FPcMuLvW5QjDGNF2a4jAmjM'],
        write_keys: ['asset_def:62Fk4FPcMuLvW5QjDGNF2a4jAmjM'],
        access_hints_complete: true,
        access_hints_skipped: [],
        triggers: [],
      },
    ]);
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: ['asset_def:62Fk4FPcMuLvW5QjDGNF2a4jAmjM'],
      write_keys: ['asset_def:62Fk4FPcMuLvW5QjDGNF2a4jAmjM'],
      dynamic_reads: [],
      dynamic_writes: [],
    });
  });

  it('matches direct entrypoint fixed parameter homes through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'direct_kaizen_unused_param',
        'seiyaku T { kaizen(value: int) permission(Admin) { info("ok"); } }',
        [['kaizen', 124, 24]],
      ],
      [
        'direct_kaizen_used_param',
        'seiyaku T { kaizen(value: int) permission(Admin) { info(value); } }',
        [['kaizen', 40, 32]],
      ],
      [
        'direct_kaizen_empty',
        'seiyaku T { kaizen(value: int) permission(Admin) { } }',
        [['kaizen', 16, 24]],
      ],
      [
        'direct_hajimari_used_param',
        'seiyaku T { hajimari(value: int) { info(value); } }',
        [['hajimari', 40, 32]],
      ],
      [
        'direct_first_free_function',
        'fn start(value: int) { info(value); }',
        [['start', 40, 32]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('reuses dead direct entrypoint local results through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'dead_int_then_int',
        'seiyaku T { hajimari() { let x = 2; let a = 1; } }',
        [['hajimari', 24, 16]],
      ],
      [
        'dead_poseidon_then_int',
        'seiyaku T { hajimari() { let digest = poseidon2(1, 2); let a = 1; } }',
        [['hajimari', 36, 32]],
      ],
      [
        'dead_call_then_int',
        'fn helper() -> int { return 1; }\nseiyaku T { hajimari() { let value = helper(); let a = 1; } }',
        [
          ['hajimari', 120, 16],
          ['helper', 160, 16],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs meta header budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '10_meta_header.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '10_meta_header.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([['hajimari', 52, 32]]);
    expect(compiled.manifest?.features_bitmap).toBe(3);
  });

  it('matches docs detail-transfer literal frame rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '11_detail_and_transfer.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '11_detail_and_transfer.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([['set_cursor_and_transfer', 624, 48]]);
  });

  it('matches Rust local map frame rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'map_new_only_void',
        'seiyaku T { kotoage fn f() { let m = Map::new(); } }',
        [['f', 44, 16]],
      ],
      [
        'map_set_only',
        'seiyaku T { kotoage fn f() { let m = Map::new(); m[1] = 42; } }',
        [['f', 68, 32]],
      ],
      [
        'map_get_unset_return',
        'seiyaku T { kotoage fn f() -> int { let m = Map::new(); let v = m[1]; return v; } }',
        [['f', 76, 32]],
      ],
      [
        'map_set_get_return',
        'seiyaku T { kotoage fn f() -> int { let m = Map::new(); m[1] = 42; let v = m[1]; return v; } }',
        [['f', 100, 32]],
      ],
      [
        'map_set_get_direct_return',
        'seiyaku T { kotoage fn f() -> int { let m = Map::new(); m[1] = 42; return m[1]; } }',
        [['f', 100, 32]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs map-ops budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '06_map_ops.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '06_map_ops.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([['map_example', 100, 32]]);
  });

  it('matches Rust static durable map iteration rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'state_map_take_empty',
        'seiyaku T { state Entries: Map<int, int>; kotoage fn f() -> int { let acc = 0; for (k, v) in Entries.take(2) { } return acc; } }',
        [['f', 924, 64]],
      ],
      [
        'state_map_take_value',
        'seiyaku T { state Entries: Map<int, int>; kotoage fn f() -> int { let acc = 0; for (k, v) in Entries.take(2) { acc = acc + v; } return acc; } }',
        [['f', 928, 64]],
      ],
      [
        'state_map_take_increment_literal',
        'seiyaku T { state Entries: Map<int, int>; kotoage fn f() -> int { let acc = 0; for (k, v) in Entries.take(2) { acc = acc + 1; } return acc; } }',
        [['f', 936, 64]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs/example static map iteration rows through the reusable SDK', () => {
    const cases: Array<[string, string, string, Array<[string, number, number]>]> = [
      [
        UPSTREAM_IVM_DOC_EXAMPLES_DIR,
        '14_map_sum_take2.ko',
        '14_map_sum_take2.ko',
        [['sum_two', 928, 64]],
      ],
      [
        path.join(UPSTREAM_EXAMPLES_DIR, 'map'),
        'map.ko',
        'map.ko',
        [['sum_first_two', 928, 64]],
      ],
    ];

    for (const [baseDir, fileName, sourceName, rows] of cases) {
      const source = readFileSync(path.join(baseDir, fileName), 'utf8');
      const compiled = compileKotodamaStudioProgram(source, { sourceName });
      const code = readArtifactCode(compiled.artifactBytes);

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => [
          entry.function_name,
          entry.bytecode_bytes,
          entry.frame_bytes,
        ]),
      ).toEqual(rows);
      expect([177, 178].map((word) => readU32LE(code, word * 4))).toEqual([
        readU32LE(Uint8Array.from(ivmWordNeedle(0x20, 7, 5, 0)), 0),
        readU32LE(Uint8Array.from(ivmWordNeedle(0x46, 0, 0, 25)), 0),
      ]);
    }
  });

  it('matches Rust static NFT syscall rows through the reusable SDK', () => {
    const owner = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    const recipient = 'sorauﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76';
    const nft = 'n0$wonderland.universal';
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'nft_id_local',
        `seiyaku NftFlow { kotoage fn f() permission(NftAuthority) { let nft = nft_id!("${nft}"); } }`,
        [['f', 8, 16]],
      ],
      [
        'nft_mint',
        `seiyaku NftFlow { kotoage fn f() permission(NftAuthority) { let owner = account!("${owner}"); let nft = nft_id!("${nft}"); nft_mint_asset(nft, owner); } }`,
        [['f', 232, 24]],
      ],
      [
        'nft_mint_transfer',
        `seiyaku NftFlow { kotoage fn f() permission(NftAuthority) { let owner = account!("${owner}"); let nft = nft_id!("${nft}"); nft_mint_asset(nft, owner); let to = account!("${recipient}"); nft_transfer_asset(owner, nft, to); } }`,
        [['f', 564, 32]],
      ],
      [
        'nft_full',
        `seiyaku NftFlow { kotoage fn f() permission(NftAuthority) { let owner = account!("${owner}"); let nft = nft_id!("${nft}"); nft_mint_asset(nft, owner); let to = account!("${recipient}"); nft_transfer_asset(owner, nft, to); nft_set_metadata(nft, name!("issued"), json!{ issued: "demo" }); nft_burn_asset(nft); } }`,
        [['f', 1008, 32]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs NFT-flow rows through the reusable SDK', () => {
    const cases: Array<[string, string, string, Array<[string, number, number]>]> = [
      [
        UPSTREAM_IVM_DOC_EXAMPLES_DIR,
        '12_nft_flow.ko',
        '12_nft_flow.ko',
        [['nft_issue_and_transfer', 1008, 32]],
      ],
      [
        path.resolve(process.cwd(), '../iroha/docs/portal/static/norito-snippets'),
        'nft-flow.ko',
        'nft-flow.ko',
        [['nft_issue_and_transfer', 1008, 32]],
      ],
    ];

    for (const [baseDir, fileName, sourceName, rows] of cases) {
      const source = readFileSync(path.join(baseDir, fileName), 'utf8');
      const compiled = compileKotodamaStudioProgram(source, { sourceName });
      const code = readArtifactCode(compiled.artifactBytes);

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => [
          entry.function_name,
          entry.bytecode_bytes,
          entry.frame_bytes,
        ]),
      ).toEqual(rows);
      expect([...code.slice(223 * 4, 223 * 4 + 4)]).toEqual(ivmWordNeedle(0x20, 24, 0, 0));
    }
  });

  it('matches Rust raw asset helper rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'raw_if_arith',
        'fn f(src_balance: int, dst_balance: int, wad: int) { if src_balance >= wad { let new_src = src_balance - wad; let new_dst = dst_balance + wad; } else { assert_eq(1, 0); } }',
        [['f', 488, 64]],
      ],
      [
        'raw_transfer_if',
        'fn transfer(src_balance: int, dst_balance: int, from_account: AccountId, to_account: AccountId, asset: AssetDefinitionId, wad: int) { if src_balance >= wad { let new_src = src_balance - wad; let new_dst = dst_balance + wad; transfer_asset(from_account, to_account, asset, wad); } else { assert_eq(1, 0); } }',
        [['transfer', 596, 112]],
      ],
      [
        'helper_mint',
        'fn entry() { } fn mint(account: AccountId, asset: AssetDefinitionId, wad: int) { mint_asset(account, asset, wad); }',
        [['entry', 8, 8], ['mint', 248, 64]],
      ],
      [
        'helper_burn_if',
        'fn entry() { } fn burn(balance: int, total_supply: int, account: AccountId, asset: AssetDefinitionId, wad: int) { if balance >= wad { let new_balance = balance - wad; let new_supply = total_supply - wad; burn_asset(account, asset, wad); } else { assert_eq(1, 0); } }',
        [['entry', 8, 8], ['burn', 736, 96]],
      ],
      [
        'helper_transfer_nested',
        'fn entry() { } fn transfer_from(src_balance: int, dst_balance: int, allowance: int, from_account: AccountId, to_account: AccountId, asset: AssetDefinitionId, wad: int) { if src_balance >= wad { if allowance >= wad { let new_src = src_balance - wad; let new_dst = dst_balance + wad; let new_allowance = allowance - wad; transfer_asset(from_account, to_account, asset, wad); } else { assert_eq(1, 0); } } else { assert_eq(1, 0); } }',
        [['entry', 8, 8], ['transfer_from', 1240, 128]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches Rust DAI budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_TEST_DATA_DIR, 'dai.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: 'dai.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['transfer', 596, 112],
      ['approve', 44, 32],
      ['transfer_from', 1136, 128],
      ['mint', 144, 64],
      ['burn', 1048, 96],
    ]);

    const code = readArtifactCode(compiled.artifactBytes);
    expect(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((word) => [
        ...code.slice(word * 4, word * 4 + 4),
      ]),
    ).toEqual([
      ivmWordNeedle(0x31, 31, 11, 72),
      ivmWordNeedle(0x31, 31, 12, 80),
      ivmWordNeedle(0x31, 31, 13, 88),
      ivmWordNeedle(0x31, 31, 14, 96),
      ivmWordNeedle(0x31, 31, 15, 104),
      ivmWordNeedle(0x30, 24, 31, 64),
      ivmWordNeedle(0x30, 23, 31, 72),
      ivmWordNeedle(0x30, 9, 31, 80),
      ivmWordNeedle(0x30, 8, 31, 88),
      ivmWordNeedle(0x30, 7, 31, 96),
    ]);
    expect(
      [119, 120, 122, 347, 348, 350, 401, 402, 404, 600, 601, 603].map((word) => [
        ...code.slice(word * 4, word * 4 + 4),
      ]),
    ).toEqual([
      ivmWordNeedle(0x20, 7, 0, 0),
      ivmWordNeedle(0x40, 5, 7, 2),
      ivmWordNeedle(0x20, 7, 0, 0),
      ivmWordNeedle(0x20, 6, 0, 0),
      ivmWordNeedle(0x40, 4, 6, 2),
      ivmWordNeedle(0x20, 6, 0, 0),
      ivmWordNeedle(0x20, 6, 0, 0),
      ivmWordNeedle(0x20, 6, 6, 1),
      ivmWordNeedle(0x40, 6, 4, 2),
      ivmWordNeedle(0x20, 8, 0, 0),
      ivmWordNeedle(0x40, 6, 8, 2),
      ivmWordNeedle(0x20, 8, 0, 0),
    ]);
  });

  it('matches Rust aggregate scalar state rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'one_field_struct_state',
        'seiyaku T { struct One { value: int } state One stored; kotoage fn f(a: int) { stored = One(a); } }',
        [
          ['f', 348, 32],
          ['__entrypoint_impl__f', 300, 40],
        ],
      ],
      [
        'two_field_struct_state',
        'seiyaku T { struct Pair { first: int, second: int } state Pair stored; kotoage fn f(a: int, b: int) { stored = Pair(a, b); } }',
        [
          ['f', 480, 40],
          ['__entrypoint_impl__f', 468, 64],
        ],
      ],
      [
        'two_field_literal_struct_state',
        'seiyaku T { struct Pair { first: int, second: int } state Pair stored; kotoage fn f() { stored = Pair(1, 2); } }',
        [['f', 312, 48]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs struct-state budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '09_struct_and_state.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '09_struct_and_state.ko' });
    const code = readArtifactCode(compiled.artifactBytes);
    const impl = compiled.budgetReport.find((entry) => entry.function_name === '__entrypoint_impl__set_pair');

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['set_pair', 480, 40],
      ['__entrypoint_impl__set_pair', 576, 64],
    ]);
    if (impl === undefined) {
      throw new Error('Missing __entrypoint_impl__set_pair budget row.');
    }
    expect([50, 75, 83, 107, 109].map(
      (rel) => [...code.slice(impl.pc_start + rel * 4, impl.pc_start + rel * 4 + 4)],
    )).toEqual([
      ivmWordNeedle(0x20, 9, 10, 0),
      ivmWordNeedle(0x20, 11, 9, 0),
      ivmWordNeedle(0x20, 8, 0, 0),
      ivmWordNeedle(0x20, 10, 8, 0),
      ivmWordNeedle(0x20, 8, 0, 0),
    ]);
  });

  it('matches Rust-style for-loop wrapper rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'sum_to',
        'seiyaku T { kotoage fn sum_to(n: int) -> int { let acc = 0; for let i = 0; i < n; i++ { acc = acc + i; } return acc; } }',
        [
          ['sum_to', 356, 32],
          ['__entrypoint_impl__sum_to', 772, 56],
        ],
      ],
      [
        'sum_to_step_assign',
        'seiyaku T { kotoage fn sum_to(n: int) -> int { let acc = 0; for let i = 0; i < n; i = i + 1 { acc = acc + i; } return acc; } }',
        [
          ['sum_to', 356, 32],
          ['__entrypoint_impl__sum_to', 772, 56],
        ],
      ],
      [
        'loop_with_extra_local',
        'seiyaku T { kotoage fn f(n: int) -> int { let acc = 0; let extra = 2; for let i = 0; i < n; i++ { acc = acc + i + extra; } return acc; } }',
        [
          ['f', 356, 32],
          ['__entrypoint_impl__f', 800, 64],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs range-for budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '05_range_for.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '05_range_for.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['sum_to', 356, 32],
      ['__entrypoint_impl__sum_to', 772, 56],
    ]);
  });

  it('matches docs ternary exact rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '18_ternary.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '18_ternary.ko' });
    const code = readArtifactCode(compiled.artifactBytes);
    const impl = compiled.budgetReport.find((entry) => entry.function_name === '__entrypoint_impl__choose_min');

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['choose_min', 488, 40],
      ['__entrypoint_impl__choose_min', 640, 56],
    ]);
    if (impl === undefined) {
      throw new Error('Missing __entrypoint_impl__choose_min budget row.');
    }
    expect([65, 66, 92, 93, 119].map(
      (rel) => [...code.slice(impl.pc_start + rel * 4, impl.pc_start + rel * 4 + 4)],
    )).toEqual([
      ivmWordNeedle(0x20, 9, 0, 0),
      ivmWordNeedle(0x20, 8, 24, 0),
      ivmWordNeedle(0x20, 9, 0, 0),
      ivmWordNeedle(0x20, 8, 23, 0),
      ivmWordNeedle(0x20, 10, 8, 0),
    ]);
  });

  it('matches docs contract-flow exact rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '19_contract_flow_test.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '19_contract_flow_test.ko' });
    const code = readArtifactCode(compiled.artifactBytes);

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['hajimari', 156, 24],
      ['increment', 320, 32],
      ['remember_caller', 188, 24],
      ['reject_me', 368, 24],
    ]);
    expect([5, 30, 121, 128, 153, 161, 174].map(
      (rel) => [...code.slice(rel * 4, rel * 4 + 4)],
    )).toEqual([
      ivmWordNeedle(0x20, 23, 10, 0),
      ivmWordNeedle(0x20, 11, 23, 0),
      ivmWordNeedle(0x31, 31, 23, 8),
      ivmWordNeedle(0x20, 23, 10, 0),
      ivmWordNeedle(0x20, 11, 23, 0),
      ivmWordNeedle(0x30, 23, 31, 8),
      ivmWordNeedle(0x20, 23, 0, 0),
    ]);
  });

  it('matches Rust register-and-mint literal local rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'register_only_literal_locals',
        'seiyaku T { kotoage fn f() permission(Admin) { let asset = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"); let symbol = "ROSE"; let qty = 1000; let mintable = 1; register_asset(asset, symbol, qty, mintable); } }',
        [['f', 288, 48]],
      ],
      [
        'direct_literal_int_info',
        'seiyaku T { kotoage fn f() { let qty = 1000; info(qty); } }',
        [['f', 76, 24]],
      ],
      [
        'direct_literal_int_return',
        'seiyaku T { kotoage fn f() -> int { let qty = 1000; return qty; } }',
        [['f', 60, 16]],
      ],
      [
        'docs_shaped_register_and_mint',
        'seiyaku RegisterAndMint { kotoage fn register_and_mint() permission(AssetManager) { let asset = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"); let symbol = "ROSE"; let qty = 1000; let mintable = 1; register_asset(asset, symbol, qty, mintable); let to = account!("sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB"); mint_asset(to, asset, 250); } }',
        [['register_and_mint', 560, 48]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs register-and-mint budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '13_register_and_mint.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '13_register_and_mint.ko' });
    const code = readArtifactCode(compiled.artifactBytes);

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([['register_and_mint', 560, 48]]);
    expect([73, 74, 75, 76, 78, 127, 138].map(
      (rel) => [...code.slice(rel * 4, rel * 4 + 4)],
    )).toEqual([
      ivmWordNeedle(0x20, 8, 0, 0),
      ivmWordNeedle(0x20, 8, 8, 127),
      ivmWordNeedle(0x20, 8, 8, 123),
      ivmWordNeedle(0x20, 10, 8, 0),
      ivmWordNeedle(0x20, 23, 10, 0),
      ivmWordNeedle(0x20, 12, 23, 0),
      ivmWordNeedle(0x20, 23, 0, 0),
    ]);
  });

  it('matches Rust ZK and direct mint frame rows through the reusable SDK', () => {
    const account = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    const asset = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const proof = 'norito_bytes("ENV-UNSHIELD")';
    const proofEnv = 'norito_bytes("ENV-SHIELD")';
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'zk_then_set_detail_direct_all',
        `fn run() { zk_verify_unshield(${proof}); set_account_detail(account!("${account}"), name!("zk_demo"), json!{ attempt: true }); }`,
        [['run', 448, 32]],
      ],
      [
        'account_zk_then_set_detail_local_name',
        `fn run() { let to = account!("${account}"); let key = name!("zk_demo"); zk_verify_unshield(${proof}); set_account_detail(to, key, json!{ attempt: true }); }`,
        [['run', 448, 32]],
      ],
      [
        'mint_direct_no_meta',
        `fn run() { mint_asset(account!("${account}"), asset_definition!("${asset}"), 1); }`,
        [['run', 268, 40]],
      ],
      [
        'zk_then_mint_direct',
        `fn run() { zk_verify_transfer(${proofEnv}); mint_asset(account!("${account}"), asset_definition!("${asset}"), 1); }`,
        [['run', 376, 40]],
      ],
      [
        'to_proof_key_info_zk_set',
        `fn run() { let to = account!("${account}"); let proof = ${proof}; let key = name!("zk_demo"); info("check"); zk_verify_unshield(proof); set_account_detail(to, key, json!{ attempt: true }); }`,
        [['run', 556, 40]],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }

    const directMint = compileKotodamaStudioProgram(
      `fn run() { mint_asset(account!("${account}"), asset_definition!("${asset}"), 1); }`,
      { sourceName: '/tmp/mint_direct_no_meta.ko' },
    );
    const directMintCode = readArtifactCode(directMint.artifactBytes);
    expect([1, 2, 3, 5, 54, 65].map(
      (rel) => [...directMintCode.slice(rel * 4, rel * 4 + 4)],
    )).toEqual([
      ivmWordNeedle(0x20, 9, 0, 0),
      ivmWordNeedle(0x20, 9, 9, 1),
      ivmWordNeedle(0x20, 10, 9, 0),
      ivmWordNeedle(0x20, 8, 10, 0),
      ivmWordNeedle(0x20, 12, 8, 0),
      ivmWordNeedle(0x20, 8, 0, 0),
    ]);
  });

  it('matches ZK attachment budget rows through the reusable SDK', () => {
    const cases: Array<[string, Array<[string, number, number]>]> = [
      [
        'zk_shield_example.ko',
        [['run', 924, 40]],
      ],
      [
        'zk_unshield_verify_example.ko',
        [['run', 772, 40]],
      ],
    ];
    const exactShape = new Map<string, { literalTypes: number[], words: Array<[number, number[]]> }>([
      [
        'zk_shield_example.ko',
        {
          literalTypes: [6, 9, 1, 3, 4, 2, 6],
          words: [
            [1, ivmWordNeedle(0x20, 9, 0, 0)],
            [25, ivmWordNeedle(0x20, 10, 9, 0)],
            [137, ivmWordNeedle(0x20, 8, 0, 0)],
            [142, ivmWordNeedle(0x20, 9, 10, 0)],
            [202, ivmWordNeedle(0x20, 9, 0, 0)],
            [227, ivmWordNeedle(0x20, 10, 9, 0)],
            [229, ivmWordNeedle(0x20, 9, 0, 0)],
          ],
        },
      ],
      [
        'zk_unshield_verify_example.ko',
        {
          literalTypes: [6, 6, 9, 1, 3, 4, 6, 2],
          words: [
            [28, ivmWordNeedle(0x20, 8, 0, 0)],
            [52, ivmWordNeedle(0x20, 10, 8, 0)],
            [81, ivmWordNeedle(0x20, 23, 0, 0)],
            [164, ivmWordNeedle(0x20, 23, 0, 0)],
            [165, ivmWordNeedle(0x20, 23, 0, 0)],
            [189, ivmWordNeedle(0x20, 10, 23, 0)],
            [191, ivmWordNeedle(0x20, 23, 0, 0)],
          ],
        },
      ],
    ]);

    for (const [sourceName, rows] of cases) {
      const source = readFileSync(path.join(UPSTREAM_KOTODAMA_ZK_ATTACHMENTS_DIR, sourceName), 'utf8');
      const compiled = compileKotodamaStudioProgram(source, { sourceName });
      const code = readArtifactCode(compiled.artifactBytes);
      const entries = readLiteralSectionEntries(compiled.artifactBytes);
      const shape = exactShape.get(sourceName);

      if (!shape) {
        throw new Error(`missing exact ZK shape for ${sourceName}`);
      }

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => [
          entry.function_name,
          entry.bytecode_bytes,
          entry.frame_bytes,
        ]),
      ).toEqual(rows);
      expect(entries.map((entry) => entry.typeId)).toEqual(shape.literalTypes);
      expect(shape.words.map(
        ([wordOffset]) => [...code.slice(wordOffset * 4, wordOffset * 4 + 4)],
      )).toEqual(shape.words.map(([, word]) => word));
    }
  });

  it('matches Rust wrapped void for-loop control rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'loop_empty',
        'seiyaku Example { kotoage fn control(a, b) { for let i = a; i < b; ++i { } } }',
        [
          ['control', 480, 40],
          ['__entrypoint_impl__control', 728, 64],
        ],
      ],
      [
        'loop_if_no_else',
        'seiyaku Example { kotoage fn control(a, b) { for let i = a; i < b; ++i { if i == b { info(i); } } } }',
        [
          ['control', 480, 40],
          ['__entrypoint_impl__control', 1160, 64],
        ],
      ],
      [
        'loop_if_empty_else',
        'seiyaku Example { kotoage fn control(a, b) { for let i = a; i < b; ++i { if i == b { } else { } } } }',
        [
          ['control', 480, 40],
          ['__entrypoint_impl__control', 1136, 64],
        ],
      ],
      [
        'loop_if_poseidon_valcom',
        'seiyaku Example { kotoage fn control(a, b) { for let i = a; i < b; ++i { if i == b { let c = poseidon2(i, b); } else { let c = valcom(i, b); } } } }',
        [
          ['control', 480, 40],
          ['__entrypoint_impl__control', 1144, 64],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches control-flow fixture budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_TEST_DATA_DIR, 'control.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: 'control.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['control', 480, 40],
      ['__entrypoint_impl__control', 1144, 64],
    ]);

    const code = readArtifactCode(compiled.artifactBytes);
    expect(
      [131, 132, 133, 159, 214, 266, 292, 345, 346].map((word) => [
        ...code.slice(word * 4, word * 4 + 4),
      ]),
    ).toEqual([
      ivmWordNeedle(0x20, 9, 24, 0),
      ivmWordNeedle(0x20, 8, 23, 0),
      ivmWordNeedle(0x20, 23, 24, 0),
      ivmWordNeedle(0x02, 12, 23, 8),
      ivmWordNeedle(0x0e, 24, 23, 8),
      ivmWordNeedle(0x82, 24, 23, 8),
      ivmWordNeedle(0x85, 24, 23, 8),
      ivmWordNeedle(0x01, 7, 23, 24),
      ivmWordNeedle(0x20, 23, 7, 0),
    ]);
  });

  it('matches Rust require lowering rows through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'direct_require_false',
        'seiyaku T { kotoage fn f() { require(false); } }',
        [['f', 28, 24]],
      ],
      [
        'direct_require_true',
        'seiyaku T { kotoage fn f() { require(true); } }',
        [['f', 32, 24]],
      ],
      [
        'direct_require_false_then_info',
        'seiyaku T { kotoage fn f() { require(false); info("x"); } }',
        [['f', 136, 24]],
      ],
      [
        'private_require_false',
        'fn f() { require(false); }\nfn main() { f(); }',
        [
          ['main', 112, 16],
          ['f', 160, 24],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches docs contract-flow require rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_DOC_EXAMPLES_DIR, '19_contract_flow_test.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: '19_contract_flow_test.ko' });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['hajimari', 156, 24],
      ['increment', 320, 32],
      ['remember_caller', 188, 24],
      ['reject_me', 368, 24],
    ]);
  });

  it('matches raw main fixed parameter frame homes through the reusable SDK', () => {
    const cases: Array<[string, string, number, number]> = [
      ['raw_param_info', 'fn main(value: int) { info(value); }', 40, 32],
      ['raw_unused_param_info', 'fn main(value: int) { info(1); }', 48, 32],
      ['raw_unused_param_empty', 'fn main(value: int) { }', 16, 24],
      ['raw_two_used_ints', 'fn main(a: int, b: int) { info(a); info(b); }', 72, 48],
      ['raw_two_unused', 'fn main(a: int, b: int) { info(1); }', 56, 40],
      ['raw_three_used_ints', 'fn main(a: int, b: int, c: int) { info(a); info(b); info(c); }', 104, 64],
      ['raw_account_unused', 'fn main(account: AccountId) { }', 16, 24],
      ['raw_account_info_int', 'fn main(account: AccountId) { info(1); }', 48, 32],
      [
        'raw_account_detail',
        'fn main(account: AccountId) { set_account_detail(account, name!("probe"), json!("\\"ok\\"")); }',
        256,
        40,
      ],
      [
        'raw_two_accounts_transfer',
        'fn main(from: AccountId, to: AccountId) { let mfc = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"); transfer_asset(from, to, mfc, 1); }',
        208,
        64,
      ],
      ['raw_name_info_int', 'fn main(key: Name) { info(1); }', 48, 32],
    ];

    for (const [name, source, bytecodeBytes, frameBytes] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath, mode: 'test' });

      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.budgetReport).toEqual([
        {
          function_name: 'main',
          pc_start: 0,
          pc_end: bytecodeBytes,
          bytecode_bytes: bytecodeBytes,
          bytecode_words: bytecodeBytes / 4,
          frame_bytes: frameBytes,
          jump_span_words: bytecodeBytes / 4,
          jump_range_risk: false,
          source_path: sourcePath,
          line: 1,
          column: 4,
        },
      ]);
    }
  });

  it('matches raw parameterized void helper call discards through the reusable SDK', () => {
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'void_no_params',
        'fn main() { helper(); }\nfn helper() { info(1); }',
        [
          ['main', 112, 16],
          ['helper', 172, 24],
        ],
      ],
      [
        'void_one_int',
        'fn main(value: int) { helper(value); }\nfn helper(value: int) { info(value); }',
        [
          ['main', 124, 24],
          ['helper', 172, 32],
        ],
      ],
      [
        'void_two_int',
        'fn main(a: int, b: int) { helper(a, b); }\nfn helper(a: int, b: int) { info(a); info(b); }',
        [
          ['main', 136, 40],
          ['helper', 212, 48],
        ],
      ],
      [
        'void_one_account',
        'fn main(account: AccountId) { helper(account); }\nfn helper(account: AccountId) { info(1); }',
        [
          ['main', 124, 24],
          ['helper', 180, 32],
        ],
      ],
      [
        'void_three_mixed',
        'fn main(from: AccountId, to: AccountId) { helper(from, to, 369); }\nfn helper(from: AccountId, to: AccountId, amount: int) { info(amount); }',
        [
          ['main', 164, 48],
          ['helper', 188, 48],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches private transfer helper frame homes through the reusable SDK', () => {
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'helper_transfer_asset_param',
        'fn main(from: AccountId, to: AccountId, mfc: AssetDefinitionId, amount: int) { send(from, to, mfc, amount); }\n'
          + 'fn send(from_account: AccountId, to_account: AccountId, mfc: AssetDefinitionId, amount: int) { transfer_asset(from_account, to_account, mfc, amount); }',
        [
          ['main', 160, 72],
          ['send', 280, 80],
        ],
      ],
      [
        'send_literal_local',
        `fn main(from: AccountId, to: AccountId) { send_mfc(from, to, 369); }\n`
          + `fn send_mfc(from_account: AccountId, to_account: AccountId, amount: int) {\n`
          + `  let mfc = asset_definition!("${assetDefinition}");\n`
          + `  transfer_asset(from_account, to_account, mfc, amount);\n`
          + `}`,
        [
          ['main', 164, 48],
          ['send_mfc', 364, 72],
        ],
      ],
      [
        'send_helper_let_return',
        `fn main(from: AccountId, to: AccountId) { send_mfc(from, to, 369); }\n`
          + `fn send_mfc(from_account: AccountId, to_account: AccountId, amount: int) {\n`
          + `  let mfc = mfc_asset();\n`
          + `  transfer_asset(from_account, to_account, mfc, amount);\n`
          + `}\n`
          + `fn mfc_asset() -> AssetDefinitionId { let mfc = asset_definition!("${assetDefinition}"); return mfc; }`,
        [
          ['main', 164, 48],
          ['send_mfc', 364, 72],
          ['mfc_asset', 348, 16],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches Rust-style for-loop transfer frame homes through the reusable SDK', () => {
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'loop_info',
        'fn main() { loop_qty(); }\n'
          + 'fn loop_qty() { for let qty = 369; qty <= 1337; qty++ { info(qty); } }',
        [
          ['main', 112, 16],
          ['loop_qty', 796, 32],
        ],
      ],
      [
        'loop_transfer_param',
        'fn main(from: AccountId, to: AccountId, mfc: AssetDefinitionId) { loop_mfc(from, to, mfc); }\n'
          + 'fn loop_mfc(from_account: AccountId, to_account: AccountId, mfc: AssetDefinitionId) {\n'
          + '  for let qty = 369; qty <= 1337; qty++ {\n'
          + '    transfer_asset(from_account, to_account, mfc, qty);\n'
          + '  }\n'
          + '}',
        [
          ['main', 148, 56],
          ['loop_mfc', 916, 80],
        ],
      ],
      [
        'loop_transfer_helper_return',
        `fn main(from: AccountId, to: AccountId) { loop_mfc(from, to); }\n`
          + `fn loop_mfc(from_account: AccountId, to_account: AccountId) {\n`
          + `  let mfc = mfc_asset();\n`
          + `  for let qty = 369; qty <= 1337; qty++ {\n`
          + `    transfer_asset(from_account, to_account, mfc, qty);\n`
          + `  }\n`
          + `}\n`
          + `fn mfc_asset() -> AssetDefinitionId { let mfc = asset_definition!("${assetDefinition}"); return mfc; }`,
        [
          ['main', 136, 40],
          ['loop_mfc', 1000, 72],
          ['mfc_asset', 348, 16],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('rematerializes static asset helper returns in raw register and mint paths through the reusable SDK', () => {
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const helper = `fn mfc_asset() -> AssetDefinitionId { let mfc = asset_definition!("${assetDefinition}"); return mfc; }`;
    const cases: Array<[string, string, Array<[string, number, number]>]> = [
      [
        'register_helper',
        `fn main() { let mfc = mfc_asset(); register_asset(mfc, "MFC", 0, 1); }\n${helper}`,
        [
          ['main', 352, 40],
          ['mfc_asset', 244, 16],
        ],
      ],
      [
        'mint_helper',
        `fn main(from: AccountId) { let mfc = mfc_asset(); mint_asset(from, mfc, 1337); }\n${helper}`,
        [
          ['main', 336, 48],
          ['mfc_asset', 244, 16],
        ],
      ],
      [
        'register_mint_helper',
        `fn main(from: AccountId) { let mfc = mfc_asset(); register_asset(mfc, "MFC", 0, 1); let mfc = mfc_asset(); mint_asset(from, mfc, 1337); }\n${helper}`,
        [
          ['main', 680, 56],
          ['mfc_asset', 244, 16],
        ],
      ],
    ];

    for (const [name, source, rows] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(
        compiled.budgetReport.map((entry) => ({
          function_name: entry.function_name,
          bytecode_bytes: entry.bytecode_bytes,
          frame_bytes: entry.frame_bytes,
          source_path: entry.source_path,
        })),
      ).toEqual(
        rows.map(([functionName, bytecodeBytes, frameBytes]) => ({
          function_name: functionName,
          bytecode_bytes: bytecodeBytes,
          frame_bytes: frameBytes,
          source_path: sourcePath,
        })),
      );
    }
  });

  it('matches full MFC raw-main budget rows through the reusable SDK', () => {
    const source = readFileSync(path.join(UPSTREAM_IVM_TEST_DATA_DIR, 'mfc.ko'), 'utf8');
    const compiled = compileKotodamaStudioProgram(source, { sourceName: 'mfc.ko' });
    const code = readArtifactCode(compiled.artifactBytes);
    const loop = compiled.budgetReport.find((entry) => entry.function_name === 'loop_mfc');

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => [
        entry.function_name,
        entry.bytecode_bytes,
        entry.frame_bytes,
      ]),
    ).toEqual([
      ['main', 940, 72],
      ['send_mfc', 364, 72],
      ['loop_mfc', 1000, 72],
      ['mfc_asset', 452, 16],
    ]);
    expect(loop).toBeDefined();
    if (!loop) {
      throw new Error('missing loop_mfc budget row');
    }
    expect(
      [90, 119, 131, 133, 159, 205, 233].map((wordOffset) => [
        ...code.slice(wordOffset * 4, wordOffset * 4 + 4),
      ]),
    ).toEqual([
      ivmWordNeedle(0x20, 7, 0, 0),
      ivmWordNeedle(0x20, 6, 0, 0),
      ivmWordNeedle(0x20, 10, 6, 0),
      ivmWordNeedle(0x20, 8, 10, 0),
      ivmWordNeedle(0x20, 12, 8, 0),
      ivmWordNeedle(0x20, 8, 0, 0),
      ivmWordNeedle(0x20, 23, 0, 0),
    ]);
    expect(
      [45, 69, 70, 171, 216].map((rel) => [
        ...code.slice(loop.pc_start + rel * 4, loop.pc_start + rel * 4 + 4),
      ]),
    ).toEqual([
      ivmWordNeedle(0x20, 24, 0, 0),
      ivmWordNeedle(0x20, 9, 8, 0),
      ivmWordNeedle(0x20, 8, 23, 0),
      ivmWordNeedle(0x20, 12, 24, 0),
      ivmWordNeedle(0x46, 0, 255, 136),
    ]);
  });

  it('matches rematerialized AssetDefinitionId helper return rows through the reusable SDK', () => {
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const cases: Array<[string, string]> = [
      [
        'helper_asset_direct_return',
        `fn main() { info(1); }\nfn mfc_asset() -> AssetDefinitionId { return asset_definition!("${assetDefinition}"); }`,
      ],
      [
        'helper_asset_let_return',
        `fn main() { info(1); }\nfn mfc_asset() -> AssetDefinitionId { let mfc = asset_definition!("${assetDefinition}"); return mfc; }`,
      ],
    ];

    for (const [name, source] of cases) {
      const sourcePath = `/tmp/${name}.ko`;
      const compiled = compileKotodamaStudioProgram(source, { sourceName: sourcePath });

      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.budgetReport).toEqual([
        {
          function_name: 'main',
          pc_start: 0,
          pc_end: 40,
          bytecode_bytes: 40,
          bytecode_words: 10,
          frame_bytes: 24,
          jump_span_words: 10,
          jump_range_risk: false,
          source_path: sourcePath,
          line: 1,
          column: 4,
        },
        {
          function_name: 'mfc_asset',
          pc_start: 40,
          pc_end: 284,
          bytecode_bytes: 244,
          bytecode_words: 61,
          frame_bytes: 16,
          jump_span_words: 61,
          jump_range_risk: false,
          source_path: sourcePath,
          line: 2,
          column: 4,
        },
      ]);
    }
  });

  it('supports aggregate durable state map foreach values through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AggregateStateMapForeach {
  struct Pair {
    left: int,
    right: int,
  }

  state StructValues: Map<int, Pair>;
  state TupleValues: Map<int, (int, int)>;

  fn scan_structs() -> int {
    let total = 0;
    for (key, value) in StructValues #[bounded(2)] {
      total = total + key + value.left + value.right;
    }
    return total;
  }

  fn scan_tuples() -> int {
    let total = 0;
    for (key, value) in TupleValues.take(2) {
      total = total + key + value.0 + value.1;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {
    StructValues[0] = Pair(2, 3);
    TupleValues[0] = (5, 7);
    info(scan_structs() + scan_tuples());
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect((rendered.match(/STATE_GET/gu) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(rendered).toContain('STATE_SET');
    expect(rendered).toContain('DECODE_INT');
    expect(rendered).toContain('BUILD_PATH_MAP_KEY');
  });

  it('supports aggregate state map helper handles through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AggregateStateMapHandles {
  struct Pair {
    left: int,
    right: int,
  }

  state Pairs: Map<int, Pair>;
  state Tuples: Map<int, (int, int)>;

  fn ensure_pair(state Map<int, Pair> values, key: int) -> Pair {
    return values.ensure(key, Pair(2, 3));
  }

  fn sum_pair(state Map<int, Pair> values, key: int) -> int {
    let value = values.get_or(key, Pair(5, 7));
    return value.left + value.right;
  }

  fn forward_pair(state Map<int, Pair> values, key: int) -> int {
    return sum_pair(values, key);
  }

  fn ensure_tuple(state Map<int, (int, int)> values, key: int) -> (int, int) {
    return values.ensure(key, (11, 13));
  }

  kotoage fn run() permission(Admin) {
    let pair = ensure_pair(Pairs, 0);
    let tuple = ensure_tuple(Tuples, 1);
    info(pair.left + pair.right + tuple.0 + tuple.1 + forward_pair(Pairs, 0));
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect((rendered.match(/STATE_GET/gu) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((rendered.match(/STATE_SET/gu) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(rendered).toContain('DECODE_INT');
    expect(rendered).toContain('BUILD_PATH_MAP_KEY');
  });

  it('embeds trigger descriptors with repeats, callback namespaces, metadata, and execute filters into CNTR metadata', () => {
    const authority = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(
      'ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    if (authority === null) {
      throw new Error('failed to construct canonical trigger authority literal');
    }

    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerManifest {
  kotoage fn run() permission(Admin) {
    info("ok");
  }

  trigger wake {
    call run;
    on time pre_commit;
    authority "${authority}";
  }

  register_trigger billing_cycle {
    call billing::run;
    on execute trigger "wake";
    repeats 2;
    metadata {
      tag: "alpha";
      count: 1;
      enabled: true;
      payload: json("{\\"kind\\":\\"mint\\"}");
    }
  }

  register_trigger domain_watch {
    call run;
    on data domain created {
      domain "wonderland.universal";
    }
  }

  register_trigger block_wake {
    call run;
    on pipeline block;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('embedded in contract metadata'),
        line: 7,
      }),
    ]);
    const artifactText = new TextDecoder().decode(compiled.artifactBytes);
    expect(artifactText).toContain('wake');
    expect(artifactText).toContain('billing_cycle');
    expect(artifactText).toContain('billing');
    expect(artifactText).toContain('alpha');
    expect(artifactText).toContain('mint');
    expect(artifactText).toContain('wonderland');
    expect(containsBytes(compiled.artifactBytes, [
      0x21, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x01, 0xaa,
      0x01, 0xaa,
      0x01, 0xaa,
    ])).toBe(true);
    expect(containsBytes(compiled.artifactBytes, [
      0x02, 0x00, 0x00, 0x00,
      0x04,
      0x00, 0x00, 0x00, 0x00,
    ])).toBe(true);
    expect(containsBytes(compiled.artifactBytes, [
      0x01, 0x00, 0x00, 0x00,
      0x04, 0x02, 0x00, 0x00, 0x00,
    ])).toBe(true);
    expect(containsBytes(compiled.artifactBytes, [
      0x03, 0x00, 0x00, 0x00,
      0x0b, 0x08, 0x01, 0x06, 0x05, 0x04,
      0x77, 0x61, 0x6b, 0x65,
      0x01, 0x00,
    ])).toBe(true);
  });

  it('returns line-aware diagnostics for unknown struct member access', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StructFields {
  struct Quote {
    gross: int;
    fee_bps: int;
  }

  view fn broken() -> int {
    let quote = Quote(1, 2);
    return quote.net;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining("unknown field 'net' on struct Quote (available: gross, fee_bps)"),
        line: 10,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns line-aware diagnostics for indexed access on non-map state', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NotAMap {
  state int total;

  kotoage fn broken() permission(Admin) {
    total[1] = 2;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toHaveLength(1);
    expect(compiled.diagnostics[0]?.severity).toBe('error');
    expect(compiled.diagnostics[0]?.message).toContain('map assignment expects Map<K,V> target');
    expect(compiled.diagnostics[0]?.line).toBe(6);
    expect(typeof compiled.diagnostics[0]?.column).toBe('number');
  });

  it('rejects manual access attributes with the upstream parser diagnostic', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccessAttrTarget {
  #[access(read="*", write="*")]
  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('manual `#[access(...)]` hints are not supported in first-release Kotodama'),
        line: 3,
        column: 5,
      }),
    ]);
  });

  it('rejects unsupported attributes with the upstream parser diagnostic', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku UnknownAttr {
  #[memo]
  fn helper() {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: expected expected attribute `test` or `テスト` but found Ident("memo")',
        line: 3,
        column: 5,
      }),
    ]);
  });

  it('mirrors Rust function-attribute parser diagnostics through the SDK package boundary', () => {
    const attrBeforeState = compileKotodamaStudioProgram(`
#[test]
state int Counter;
fn run() {}
`);
    const attrBeforeStruct = compileKotodamaStudioProgram(`
#[test]
struct User { value: int }
fn run() {}
`);
    const invalidAttributeName = compileKotodamaStudioProgram(`
#[123]
fn run() {}
`);
    const invalidFixtureValue = compileKotodamaStudioProgram(`
#[test(fixture=true)]
fn run() {}
`, { mode: 'test' });
    const invalidFixtureKey = compileKotodamaStudioProgram(`
#[test(fn="seeded")]
fn run() {}
`, { mode: 'test' });

    expect(attrBeforeState.artifactBytes).toHaveLength(0);
    expect(attrBeforeState.diagnostics[0]?.message).toBe('parser error: expected function attributes must precede a function but found State');
    expect(attrBeforeStruct.artifactBytes).toHaveLength(0);
    expect(attrBeforeStruct.diagnostics[0]?.message).toBe('parser error: {error}: expected function attributes must precede a function but found Struct');
    expect(invalidAttributeName.artifactBytes).toHaveLength(0);
    expect(invalidAttributeName.diagnostics[0]?.message).toBe('parser error: expected expected attribute identifier but found Number(123)');
    expect(invalidFixtureValue.artifactBytes).toHaveLength(0);
    expect(invalidFixtureValue.diagnostics[0]?.message).toBe('parser error: expected identifier or string literal but found True');
    expect(invalidFixtureKey.artifactBytes).toHaveLength(0);
    expect(invalidFixtureKey.diagnostics[0]?.message).toBe('parser error: expected identifier but found Fn');
  });

  it('returns line-aware diagnostics when a trigger targets a non-public helper', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerVisibility {
  fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('public entrypoint'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects trigger declarations targeting view entrypoints through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerViewTarget {
  view fn read() -> int {
    return 1;
  }

  register_trigger wake {
    call read;
    on pipeline block;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('cannot target read-only view entrypoint `read`'),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects string trigger declaration names through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StringTriggerName {
  kotoage fn run() {}

  register_trigger "wake" {
    call run;
    on time pre_commit;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected identifier but found String("wake")'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects parenthesized trigger callback calls through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ParenthesizedTriggerCall {
  kotoage fn run() {}

  register_trigger wake {
    call run();
    on time pre_commit;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Semicolon but found LParen'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
  });

  it('encodes unstructured data-any trigger filters through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DataAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data any;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
    expect(containsBytes(compiled.artifactBytes, [
      0x01, 0x00, 0x00, 0x00,
      0x04,
      0x00, 0x00, 0x00, 0x00,
    ])).toBe(true);
  });

  it('encodes rwa data trigger filters through the SDK package boundary', () => {
    const valid = compileKotodamaStudioProgram(`
seiyaku TriggerRwa {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa frozen {
      rwa "0707070707070707070707070707070707070707070707070707070707070707$wonderland.universal";
    }
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidTriggerRwa {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa frozen {
      rwa "0000$wonderland.universal";
    }
  }
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(valid.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
    expect(new TextDecoder().decode(valid.artifactBytes)).toContain('wonderland');
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'trigger `wake` has invalid `rwa` matcher literal `0000$wonderland.universal` in `rwa` data filter',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('encodes scoped asset data trigger filters through the SDK package boundary', () => {
    const account = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    const valid = compileKotodamaStudioProgram(`
seiyaku TriggerScopedAsset {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "62Fk4FPcMuLvW5QjDGNF2a4jAmjM#${account}#dataspace:3";
    }
  }
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(valid.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
  });

  it('mirrors upstream pipeline trigger filters through the SDK package boundary', () => {
    const blockShorthand = compileKotodamaStudioProgram(`
seiyaku TriggerBlockShorthand {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline block;
  }
}
`);
    const block = compileKotodamaStudioProgram(`
seiyaku TriggerBlock {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline block approved;
  }
}
`);
    const transactionShorthand = compileKotodamaStudioProgram(`
seiyaku TriggerTransactionShorthand {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline transaction;
  }
}
`);
    const transaction = compileKotodamaStudioProgram(`
seiyaku TriggerTransaction {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline transaction approved;
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku TriggerMerge {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline merge;
  }
}
`);

    expect(blockShorthand.diagnostics).toEqual([]);
    expect(block.diagnostics).toEqual([]);
    expect(transactionShorthand.diagnostics).toEqual([]);
    expect(transaction.diagnostics).toEqual([]);
    expect(blockShorthand.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
    expect(transactionShorthand.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
    expect(containsBytes(block.artifactBytes, [
      0x01, 0x00, 0x00, 0x00,
      0x09,
      0x01, 0x00,
      0x06, 0x01, 0x04, 0x01, 0x00, 0x00, 0x00,
    ])).toBe(true);
    expect(containsBytes(transaction.artifactBytes, [
      0x00, 0x00, 0x00, 0x00,
      0x0f,
      0x01, 0x00,
      0x01, 0x00,
      0x01, 0x00,
      0x01, 0x00,
      0x06, 0x01, 0x04, 0x02, 0x00, 0x00, 0x00,
    ])).toBe(true);
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('transaction [approved]'),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts encoded account trigger authority and matchers through the SDK package boundary', () => {
    const publicKey = 'ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey);
    const testnetAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey, 0x0171);

    if (account === null || testnetAccount === null) {
      throw new Error('failed to construct canonical account literal for trigger test');
    }

    const compiled = compileKotodamaStudioProgram(`
seiyaku PaddedEncodedAccountTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account metadata_inserted {
      account " \\n${account}\\t ";
    }
    authority " \\n${account}\\t ";
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidEncodedAccountTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account metadata_inserted {
      account "alice@wonderland";
    }
    authority "alice@wonderland";
  }
}
`);
    const invalidPublicKeyMatcher = compileKotodamaStudioProgram(`
seiyaku InvalidPublicKeyAccountMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account metadata_inserted {
      account "${publicKey}";
    }
  }
}
`);
    const invalidPublicKeyAuthority = compileKotodamaStudioProgram(`
seiyaku InvalidPublicKeyTriggerAuthority {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data any;
    authority "${publicKey}";
  }
}
`);
    const invalidNetworkMatcher = compileKotodamaStudioProgram(`
seiyaku InvalidNetworkAccountMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account metadata_inserted {
      account "${testnetAccount}";
    }
  }
}
`);
    const invalidNetworkAuthority = compileKotodamaStudioProgram(`
seiyaku InvalidNetworkTriggerAuthority {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data any;
    authority "${testnetAccount}";
  }
}
`);
    const compactPublicKeyNeedle = [
      0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00,
      ...Array.from({ length: 32 }, () => [0x01, 0xaa]).flat(),
    ];

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.triggers).toHaveLength(1);
    expect(containsBytes(compiled.artifactBytes, compactPublicKeyNeedle)).toBe(true);
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'trigger `wake` has invalid `account` matcher literal `alice@wonderland` in `account` data filter: AccountId must use a canonical I105 literal',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidPublicKeyMatcher.artifactBytes).toHaveLength(0);
    expect(invalidPublicKeyMatcher.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'trigger `wake` has invalid `account` matcher literal `ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` in `account` data filter: AccountId must use a canonical I105 literal',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidPublicKeyAuthority.artifactBytes).toHaveLength(0);
    expect(invalidPublicKeyAuthority.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: invalid trigger authority `ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`: AccountId must use a canonical I105 literal',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNetworkMatcher.artifactBytes).toHaveLength(0);
    expect(invalidNetworkMatcher.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(
          /trigger `wake` has invalid `account` matcher literal `test.*` in `account` data filter: ERR_UNEXPECTED_NETWORK_PREFIX/
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNetworkAuthority.artifactBytes).toHaveLength(0);
    expect(invalidNetworkAuthority.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(
          /semantic error: invalid trigger authority `test.*`: ERR_UNEXPECTED_NETWORK_PREFIX/
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects non-canonical data trigger event casing through the SDK package boundary', () => {
    const account = compileKotodamaStudioProgram(`
seiyaku MixedCaseAccountTriggerEvent {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account Metadata_Inserted {}
  }
}
`);
    const domain = compileKotodamaStudioProgram(`
seiyaku MixedCaseDomainTriggerEvent {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain Created {}
  }
}
`);

    expect(account.artifactBytes).toHaveLength(0);
    expect(account.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `Metadata_Inserted` event kind for `account` data filter',
        ),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
    expect(domain.artifactBytes).toHaveLength(0);
    expect(domain.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `Created` event kind for `domain` data filter',
        ),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
  });

  it('encodes upstream account trigger event-set bits through the SDK package boundary', () => {
    const publicKey = 'ed0120bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey);

    if (account === null) {
      throw new Error('failed to construct canonical account literal for trigger mask test');
    }

    const repo = compileKotodamaStudioProgram(`
seiyaku AccountRepoTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account repo {
      account "${account}";
    }
  }
}
`);
    const metadata = compileKotodamaStudioProgram(`
seiyaku AccountMetadataTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account metadata_inserted {
      account "${account}";
    }
  }
}
`);
    const any = compileKotodamaStudioProgram(`
seiyaku AccountAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account any {
      account "${account}";
    }
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku AccountRecoveryTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account recovery {}
  }
}
`);

    expect(repo.diagnostics).toEqual([]);
    expect(metadata.diagnostics).toEqual([]);
    expect(any.diagnostics).toEqual([]);
    expect(containsBytes(repo.artifactBytes, compactBitmapU32Needle(0x0000_0800))).toBe(true);
    expect(containsBytes(metadata.artifactBytes, compactBitmapU32Needle(0x0000_0100))).toBe(true);
    expect(containsBytes(any.artifactBytes, compactBitmapU32Needle(0x0000_0fff))).toBe(true);
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `recovery` event kind for `account` data filter',
        ),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
  });

  it('encodes upstream domain trigger event-set bits through the SDK package boundary', () => {
    const account = compileKotodamaStudioProgram(`
seiyaku DomainAccountTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain account {
      domain "wonderland.universal";
    }
  }
}
`);
    const linked = compileKotodamaStudioProgram(`
seiyaku DomainLinkedTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain account_linked {
      domain "wonderland.universal";
    }
  }
}
`);
    const streaming = compileKotodamaStudioProgram(`
seiyaku DomainStreamingTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain streaming_ticket_revoked {
      domain "wonderland.universal";
    }
  }
}
`);
    const any = compileKotodamaStudioProgram(`
seiyaku DomainAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain any {
      domain "wonderland.universal";
    }
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku DomainRwaTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain rwa {}
  }
}
`);

    expect(account.diagnostics).toEqual([]);
    expect(linked.diagnostics).toEqual([]);
    expect(streaming.diagnostics).toEqual([]);
    expect(any.diagnostics).toEqual([]);
    expect(containsBytes(account.artifactBytes, compactBitmapU32Needle(0x0000_0020))).toBe(true);
    expect(containsBytes(linked.artifactBytes, compactBitmapU32Needle(0x0000_0040))).toBe(true);
    expect(containsBytes(streaming.artifactBytes, compactBitmapU32Needle(0x0002_0000))).toBe(true);
    expect(containsBytes(any.artifactBytes, compactBitmapU32Needle(0x0003_ffff))).toBe(true);
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `rwa` event kind for `domain` data filter',
        ),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
  });

  it('encodes upstream asset-definition trigger event-set bits through the SDK package boundary', () => {
    const detailed = compileKotodamaStudioProgram(`
seiyaku AssetDefinitionDetailedTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset_definition mintability_changed_detailed {}
  }
}
`);
    const total = compileKotodamaStudioProgram(`
seiyaku AssetDefinitionTotalTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset_definition total_quantity_changed {}
  }
}
`);
    const owner = compileKotodamaStudioProgram(`
seiyaku AssetDefinitionOwnerTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset_definition owner_changed {}
  }
}
`);
    const any = compileKotodamaStudioProgram(`
seiyaku AssetDefinitionAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset_definition any {}
  }
}
`);

    expect(detailed.diagnostics).toEqual([]);
    expect(total.diagnostics).toEqual([]);
    expect(owner.diagnostics).toEqual([]);
    expect(any.diagnostics).toEqual([]);
    expect(containsBytes(detailed.artifactBytes, compactBitmapU32Needle(0x0000_0020))).toBe(true);
    expect(containsBytes(total.artifactBytes, compactBitmapU32Needle(0x0000_0040))).toBe(true);
    expect(containsBytes(owner.artifactBytes, compactBitmapU32Needle(0x0000_0080))).toBe(true);
    expect(containsBytes(any.artifactBytes, compactBitmapU32Needle(0x0000_00ff))).toBe(true);
  });

  it('encodes remaining upstream data trigger event-set bits through the SDK package boundary', () => {
    const nftOwner = compileKotodamaStudioProgram(`
seiyaku NftOwnerTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data nft owner_changed {
      nft "badge$wonderland.universal";
    }
  }
}
`);
    const nftAny = compileKotodamaStudioProgram(`
seiyaku NftAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data nft any {}
  }
}
`);
    const rwaForce = compileKotodamaStudioProgram(`
seiyaku RwaForceTransferTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa force_transferred {
      rwa "0707070707070707070707070707070707070707070707070707070707070707$wonderland.universal";
    }
  }
}
`);
    const rwaAny = compileKotodamaStudioProgram(`
seiyaku RwaAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa any {}
  }
}
`);
    const triggerExtended = compileKotodamaStudioProgram(`
seiyaku TriggerExtendedTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data trigger extended {
      trigger "wake";
    }
  }
}
`);
    const triggerAny = compileKotodamaStudioProgram(`
seiyaku TriggerAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data trigger any {}
  }
}
`);
    const rolePermission = compileKotodamaStudioProgram(`
seiyaku RolePermissionTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data role permission_removed {
      role "auditor";
    }
  }
}
`);
    const roleAny = compileKotodamaStudioProgram(`
seiyaku RoleAnyTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data role any {}
  }
}
`);
    const configurationChanged = compileKotodamaStudioProgram(`
seiyaku ConfigurationChangedTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data configuration changed {}
  }
}
`);
    const configurationInvalidMatcher = compileKotodamaStudioProgram(`
seiyaku ConfigurationInvalidMatcherTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data configuration changed {
      role "auditor";
    }
  }
}
`);
    const executorUpgraded = compileKotodamaStudioProgram(`
seiyaku ExecutorUpgradedTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data executor upgraded {}
  }
}
`);
    const executorInvalidMatcher = compileKotodamaStudioProgram(`
seiyaku ExecutorInvalidMatcherTrigger {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data executor upgraded {
      trigger "wake";
    }
  }
}
`);

    expect(nftOwner.diagnostics).toEqual([]);
    expect(nftAny.diagnostics).toEqual([]);
    expect(rwaForce.diagnostics).toEqual([]);
    expect(rwaAny.diagnostics).toEqual([]);
    expect(triggerExtended.diagnostics).toEqual([]);
    expect(triggerAny.diagnostics).toEqual([]);
    expect(rolePermission.diagnostics).toEqual([]);
    expect(roleAny.diagnostics).toEqual([]);
    expect(configurationChanged.diagnostics).toEqual([]);
    expect(executorUpgraded.diagnostics).toEqual([]);
    expect(containsBytes(nftOwner.artifactBytes, compactBitmapU32Needle(0x0000_0010))).toBe(true);
    expect(containsBytes(nftAny.artifactBytes, compactBitmapU32Needle(0x0000_001f))).toBe(true);
    expect(containsBytes(rwaForce.artifactBytes, compactBitmapU32Needle(0x0000_0800))).toBe(true);
    expect(containsBytes(rwaAny.artifactBytes, compactBitmapU32Needle(0x0000_1fff))).toBe(true);
    expect(containsBytes(triggerExtended.artifactBytes, compactBitmapU32Needle(0x0000_0004))).toBe(true);
    expect(containsBytes(triggerAny.artifactBytes, compactBitmapU32Needle(0x0000_003f))).toBe(true);
    expect(containsBytes(rolePermission.artifactBytes, compactBitmapU32Needle(0x0000_0008))).toBe(true);
    expect(containsBytes(roleAny.artifactBytes, compactBitmapU32Needle(0x0000_000f))).toBe(true);
    expect(containsBytes(configurationChanged.artifactBytes, compactBitmapU32Needle(0x0000_0001))).toBe(true);
    expect(containsBytes(executorUpgraded.artifactBytes, compactBitmapU32Needle(0x0000_0001))).toBe(true);
    expect(configurationInvalidMatcher.artifactBytes).toHaveLength(0);
    expect(configurationInvalidMatcher.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `role` matcher in `configuration` data filter',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(executorInvalidMatcher.artifactBytes).toHaveLength(0);
    expect(executorInvalidMatcher.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `trigger` matcher in `executor` data filter',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns line-aware diagnostics for non-canonical trigger authority literals', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerAuthority {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    authority "alice@wonderland";
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: invalid trigger authority `alice@wonderland`: AccountId must use a canonical I105 literal',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects duplicate trigger control fields through the SDK package boundary', () => {
    const publicKey = 'ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey);

    if (account === null) {
      throw new Error('failed to construct canonical account literal for duplicate trigger test');
    }

    const duplicateCall = compileKotodamaStudioProgram(`
seiyaku DuplicateTriggerCall {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    call run;
    on time pre_commit;
  }
}
`);
    const duplicateOn = compileKotodamaStudioProgram(`
seiyaku DuplicateTriggerOn {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    on time pre_commit;
  }
}
`);
    const duplicateRepeats = compileKotodamaStudioProgram(`
seiyaku DuplicateTriggerRepeats {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    repeats 1;
    repeats 2;
  }
}
`);
    const duplicateAuthority = compileKotodamaStudioProgram(`
seiyaku DuplicateTriggerAuthority {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    authority "${account}";
    authority "${account}";
  }
}
`);

    expect(duplicateCall.artifactBytes).toHaveLength(0);
    expect(duplicateCall.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected duplicate `call` field but found Call'),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
    expect(duplicateOn.artifactBytes).toHaveLength(0);
    expect(duplicateOn.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected duplicate `on` field but found Ident("on")'),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(duplicateRepeats.artifactBytes).toHaveLength(0);
    expect(duplicateRepeats.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected duplicate `repeats` field but found Ident("repeats")'),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
    expect(duplicateAuthority.artifactBytes).toHaveLength(0);
    expect(duplicateAuthority.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected duplicate `authority` field but found Ident("authority")'),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
  });

  it('reports missing and unknown trigger fields through the SDK package boundary', () => {
    const missingCall = compileKotodamaStudioProgram(`
seiyaku MissingTriggerCall {
  kotoage fn run() {}

  register_trigger wake {
    on time pre_commit;
  }
}
`);
    const missingOn = compileKotodamaStudioProgram(`
seiyaku MissingTriggerOn {
  kotoage fn run() {}

  register_trigger wake {
    call run;
  }
}
`);
    const unknownField = compileKotodamaStudioProgram(`
seiyaku UnknownTriggerField {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    enabled true;
  }
}
`);

    expect(missingCall.artifactBytes).toHaveLength(0);
    expect(missingCall.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected trigger `call` field but found Ident("register_trigger")',
        ),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(missingOn.artifactBytes).toHaveLength(0);
    expect(missingOn.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected trigger `on` field but found Ident("register_trigger")',
        ),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(unknownField.artifactBytes).toHaveLength(0);
    expect(unknownField.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected trigger field (`call`, `on`, `repeats`, `authority`, `metadata`) but found Ident("enabled")',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('reports invalid trigger repeats through the SDK package boundary', () => {
    const negative = compileKotodamaStudioProgram(`
seiyaku RepeatsNegative {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    repeats -1;
  }
}
`);
    const overflow = compileKotodamaStudioProgram(`
seiyaku RepeatsOverflow {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    repeats 4294967296;
  }
}
`);
    const string = compileKotodamaStudioProgram(`
seiyaku RepeatsString {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    repeats "two";
  }
}
`);

    expect(negative.artifactBytes).toHaveLength(0);
    expect(negative.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected repeats expects a non-negative integer literal but found Minus',
        ),
        line: 8,
        column: 13,
      }),
    ]);
    expect(overflow.artifactBytes).toHaveLength(0);
    expect(overflow.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: repeats integer literal out of range'),
        line: 8,
        column: 13,
      }),
    ]);
    expect(string.artifactBytes).toHaveLength(0);
    expect(string.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected repeats expects a non-negative integer literal but found String("two")',
        ),
        line: 8,
        column: 13,
      }),
    ]);
  });

  it('reports invalid trigger schedules through the SDK package boundary', () => {
    const startNegative = compileKotodamaStudioProgram(`
seiyaku ScheduleStartNegative {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(-1, 1);
  }
}
`);
    const periodNegative = compileKotodamaStudioProgram(`
seiyaku SchedulePeriodNegative {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(1, -1);
  }
}
`);
    const startString = compileKotodamaStudioProgram(`
seiyaku ScheduleStartString {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule("now", 1);
  }
}
`);
    const periodString = compileKotodamaStudioProgram(`
seiyaku SchedulePeriodString {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(1, "later");
  }
}
`);
    const startDecimal = compileKotodamaStudioProgram(`
seiyaku ScheduleStartDecimal {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(1.2, 1);
  }
}
`);
    const u64Max = compileKotodamaStudioProgram(`
seiyaku ScheduleU64Max {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(18446744073709551615, 18446744073709551615);
  }
}
`);
    const u64Overflow = compileKotodamaStudioProgram(`
seiyaku ScheduleU64Overflow {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(18446744073709551616, 1);
  }
}
`);

    expect(startNegative.artifactBytes).toHaveLength(0);
    expect(startNegative.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected schedule start_ms expects a non-negative integer literal but found Minus',
        ),
        line: 7,
        column: 22,
      }),
    ]);
    expect(periodNegative.artifactBytes).toHaveLength(0);
    expect(periodNegative.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected schedule period_ms expects a non-negative integer literal but found Minus',
        ),
        line: 7,
        column: 25,
      }),
    ]);
    expect(startString.artifactBytes).toHaveLength(0);
    expect(startString.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected schedule start_ms expects a non-negative integer literal but found String("now")',
        ),
        line: 7,
        column: 22,
      }),
    ]);
    expect(periodString.artifactBytes).toHaveLength(0);
    expect(periodString.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected schedule period_ms expects a non-negative integer literal but found String("later")',
        ),
        line: 7,
        column: 25,
      }),
    ]);
    expect(startDecimal.artifactBytes).toHaveLength(0);
    expect(startDecimal.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected schedule start_ms expects a non-negative integer literal but found Decimal("1.2")',
        ),
        line: 7,
        column: 22,
      }),
    ]);
    expect(u64Max.diagnostics).toEqual([]);
    expect(u64Max.artifactBytes.length).toBeGreaterThan(0);
    expect(u64Overflow.artifactBytes).toHaveLength(0);
    expect(u64Overflow.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('numeric literal overflow at 7:22'),
        line: 7,
        column: 22,
      }),
    ]);
  });

  it('reports invalid trigger filter forms through the SDK package boundary', () => {
    const unknownFilter = compileKotodamaStudioProgram(`seiyaku UnknownFilter {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on oracle tick;
  }
}
`);
    const executeWrongKind = compileKotodamaStudioProgram(`seiyaku ExecuteWrongKind {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on execute account "wake";
  }
}
`);
    const timeWrongKind = compileKotodamaStudioProgram(`seiyaku TimeWrongKind {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time post_commit;
  }
}
`);
    const pipelineWrongKind = compileKotodamaStudioProgram(`seiyaku PipelineWrongKind {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on pipeline epoch;
  }
}
`);
    const dataWrongFamily = compileKotodamaStudioProgram(`seiyaku DataWrongFamily {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data wallet created {}
  }
}
`);

    expect(unknownFilter.artifactBytes).toHaveLength(0);
    expect(unknownFilter.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected trigger filter (`time`, `execute`, `data`, or `pipeline`) but found Ident("oracle")',
        ),
        line: 6,
        column: 8,
      }),
    ]);
    expect(executeWrongKind.artifactBytes).toHaveLength(0);
    expect(executeWrongKind.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected execute trigger <name> but found Ident("account")',
        ),
        line: 6,
        column: 16,
      }),
    ]);
    expect(timeWrongKind.artifactBytes).toHaveLength(0);
    expect(timeWrongKind.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected time filter (`pre_commit` or `schedule`) but found Ident("post_commit")',
        ),
        line: 6,
        column: 13,
      }),
    ]);
    expect(pipelineWrongKind.artifactBytes).toHaveLength(0);
    expect(pipelineWrongKind.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected pipeline filter (`transaction [approved]` or `block [approved]`) but found Ident("epoch")',
        ),
        line: 6,
        column: 17,
      }),
    ]);
    expect(dataWrongFamily.artifactBytes).toHaveLength(0);
    expect(dataWrongFamily.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected data family (`any`, `peer`, `domain`, `account`, `asset`, `asset_definition`, `nft`, `rwa`, `trigger`, `role`, `configuration`, or `executor`) but found Ident("wallet")',
        ),
        line: 6,
        column: 13,
      }),
    ]);
  });

  it('reports invalid trigger identifier operands through the SDK package boundary', () => {
    const executeIdNumber = compileKotodamaStudioProgram(`seiyaku ExecuteIdNumber {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on execute trigger 123;
  }
}
`);
    const executeIdWhitespace = compileKotodamaStudioProgram(`seiyaku ExecuteIdWhitespace {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on execute trigger "bad trigger";
  }
}
`);
    const executeIdEmpty = compileKotodamaStudioProgram(`seiyaku ExecuteIdEmpty {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on execute trigger "";
  }
}
`);
    const authorityNumber = compileKotodamaStudioProgram(`seiyaku AuthorityNumber {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    authority 123;
  }
}
`);
    const matcherValueNumber = compileKotodamaStudioProgram(`seiyaku MatcherValueNumber {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account created {
      account 123;
    }
  }
}
`);
    const matcherKeyString = compileKotodamaStudioProgram(`seiyaku MatcherKeyString {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account created {
      "account" "alice";
    }
  }
}
`);
    const metadataKeyNumber = compileKotodamaStudioProgram(`seiyaku MetadataKeyNumber {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      1: "x";
    }
  }
}
`);

    expect(executeIdNumber.artifactBytes).toHaveLength(0);
    expect(executeIdNumber.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected identifier or string literal but found Number(123)'),
        line: 6,
        column: 24,
      }),
    ]);
    expect(executeIdWhitespace.artifactBytes).toHaveLength(0);
    expect(executeIdWhitespace.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: invalid execute trigger id `bad trigger`: White space not allowed in `Name` constructs',
        ),
        line: 4,
        column: 3,
      }),
    ]);
    expect(executeIdEmpty.artifactBytes).toHaveLength(0);
    expect(executeIdEmpty.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('semantic error: invalid execute trigger id ``: Empty `Name`'),
        line: 4,
        column: 3,
      }),
    ]);
    expect(authorityNumber.artifactBytes).toHaveLength(0);
    expect(authorityNumber.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected identifier or string literal but found Number(123)'),
        line: 7,
        column: 15,
      }),
    ]);
    expect(matcherValueNumber.artifactBytes).toHaveLength(0);
    expect(matcherValueNumber.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected identifier or string literal but found Number(123)'),
        line: 7,
        column: 15,
      }),
    ]);
    expect(matcherKeyString.artifactBytes).toHaveLength(0);
    expect(matcherKeyString.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected identifier but found String("account")'),
        line: 7,
        column: 7,
      }),
    ]);
    expect(metadataKeyNumber.artifactBytes).toHaveLength(0);
    expect(metadataKeyNumber.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'parser error: {error}: expected metadata key (identifier or string literal) but found Number(1)',
        ),
        line: 8,
        column: 7,
      }),
    ]);
  });

  it('reports malformed trigger punctuation through the SDK package boundary', () => {
    const callMissingSemicolon = compileKotodamaStudioProgram(`seiyaku CallMissingSemicolon {
  kotoage fn run() {}

  register_trigger wake {
    call run
    on time pre_commit;
  }
}
`);
    const matcherMissingSemicolon = compileKotodamaStudioProgram(`seiyaku MatcherMissingSemicolon {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account created {
      account "alice"
    }
  }
}
`);
    const metadataMissingColon = compileKotodamaStudioProgram(`seiyaku MetadataMissingColon {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      tag "x";
    }
  }
}
`);
    const metadataMissingSemicolon = compileKotodamaStudioProgram(`seiyaku MetadataMissingSemicolon {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      tag: "x"
    }
  }
}
`);
    const dataMissingBlock = compileKotodamaStudioProgram(`seiyaku DataMissingBlock {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account created;
  }
}
`);
    const metadataNoBlock = compileKotodamaStudioProgram(`seiyaku MetadataNoBlock {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata;
  }
}
`);
    const scheduleNoParen = compileKotodamaStudioProgram(`seiyaku ScheduleNoParen {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule;
  }
}
`);
    const scheduleMissingComma = compileKotodamaStudioProgram(`seiyaku ScheduleMissingComma {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(1 2);
  }
}
`);
    const scheduleMissingRParen = compileKotodamaStudioProgram(`seiyaku ScheduleMissingRParen {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time schedule(1, 2;
  }
}
`);
    const metadataValueComma = compileKotodamaStudioProgram(`seiyaku MetadataValueComma {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      tag: "x",
    }
  }
}
`);

    expect(callMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(callMissingSemicolon.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Semicolon but found Ident("on")'),
        line: 6,
        column: 5,
      }),
    ]);
    expect(matcherMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(matcherMissingSemicolon.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Semicolon but found RBrace'),
        line: 8,
        column: 5,
      }),
    ]);
    expect(metadataMissingColon.artifactBytes).toHaveLength(0);
    expect(metadataMissingColon.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Colon but found String("x")'),
        line: 8,
        column: 11,
      }),
    ]);
    expect(metadataMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(metadataMissingSemicolon.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Semicolon but found RBrace'),
        line: 9,
        column: 5,
      }),
    ]);
    expect(dataMissingBlock.artifactBytes).toHaveLength(0);
    expect(dataMissingBlock.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected LBrace but found Semicolon'),
        line: 6,
        column: 28,
      }),
    ]);
    expect(metadataNoBlock.artifactBytes).toHaveLength(0);
    expect(metadataNoBlock.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected LBrace but found Semicolon'),
        line: 7,
        column: 13,
      }),
    ]);
    expect(scheduleNoParen.artifactBytes).toHaveLength(0);
    expect(scheduleNoParen.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected LParen but found Semicolon'),
        line: 6,
        column: 21,
      }),
    ]);
    expect(scheduleMissingComma.artifactBytes).toHaveLength(0);
    expect(scheduleMissingComma.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected RParen but found Number(2)'),
        line: 6,
        column: 24,
      }),
    ]);
    expect(scheduleMissingRParen.artifactBytes).toHaveLength(0);
    expect(scheduleMissingRParen.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected RParen but found Semicolon'),
        line: 6,
        column: 26,
      }),
    ]);
    expect(metadataValueComma.artifactBytes).toHaveLength(0);
    expect(metadataValueComma.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: {error}: expected Semicolon but found Comma'),
        line: 8,
        column: 15,
      }),
    ]);
  });

  it('replaces earlier duplicate trigger metadata blocks through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DuplicateTriggerMetadata {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      tag: "first";
    }
    metadata {
      tag: "second";
    }
  }
}
`);
    const artifactText = new TextDecoder().decode(compiled.artifactBytes);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(artifactText).not.toContain('first');
    expect(artifactText).toContain('second');
  });

  it('mirrors Rust trigger metadata semantic diagnostics through the SDK package boundary', () => {
    const compileMetadata = (body: string) => compileKotodamaStudioProgram(`
seiyaku InvalidTriggerMetadata {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on time pre_commit;
    metadata {
      ${body}
    }
  }
}
`);
    const emptyKey = compileMetadata('"": 1;');
    const whitespaceKey = compileMetadata('" tag": 1;');
    const reservedKey = compileMetadata('"bad$key": 1;');
    const duplicateKey = compileMetadata('tag: "a"; tag: "b";');
    const jsonCallNumber = compileMetadata('tag: json(1);');
    const jsonCallDecimal = compileMetadata('tag: json(1.5);');
    const invalidJsonLiteral = compileMetadata('tag: json("{");');
    const decimalMetadata = compileMetadata('ratio: 1.5;');
    const jsonMacroMetadata = compileMetadata('tag: json![1, 2];');
    const computedMetadata = compileMetadata('tag: 1 + 2;');
    const negativeMetadata = compileMetadata('tag: -1;');
    const negativeDecimalMetadata = compileMetadata('tag: -1.5;');
    const decimalComputedMetadata = compileMetadata('tag: 1.5 + 2;');
    const tupleMetadata = compileMetadata('tag: (1, 2);');
    const nameCallValue = compileMetadata('tag: name("x");');

    expect(emptyKey.artifactBytes).toHaveLength(0);
    expect(emptyKey.diagnostics[0]?.message).toBe('semantic error: invalid trigger metadata key ``: Empty `Name`');
    expect(whitespaceKey.artifactBytes).toHaveLength(0);
    expect(whitespaceKey.diagnostics[0]?.message).toBe('semantic error: invalid trigger metadata key ` tag`: White space not allowed in `Name` constructs');
    expect(reservedKey.artifactBytes).toHaveLength(0);
    expect(reservedKey.diagnostics[0]?.message).toBe('semantic error: invalid trigger metadata key `bad$key`: The `@` character is reserved for scoped alias/public-key constructs, `#` for alias separators (for example `name#domain.dataspace`), and `$` — for `nft$domain`.');
    expect(duplicateKey.artifactBytes).toHaveLength(0);
    expect(duplicateKey.diagnostics[0]?.message).toBe('semantic error: duplicate trigger metadata key `tag`');
    expect(jsonCallNumber.artifactBytes).toHaveLength(0);
    expect(jsonCallNumber.diagnostics[0]?.message).toBe('semantic error: json(...) metadata values must be a string literal');
    expect(jsonCallDecimal.artifactBytes).toHaveLength(0);
    expect(jsonCallDecimal.diagnostics[0]?.message).toBe('semantic error: json(...) metadata values must be a string literal');
    expect(invalidJsonLiteral.artifactBytes).toHaveLength(0);
    expect(invalidJsonLiteral.diagnostics[0]?.message).toBe(
      'semantic error: invalid json metadata literal: JSON error: unexpected end of input at byte 1 (line 1, col 2)'
    );
    expect(decimalMetadata.diagnostics).toEqual([]);
    expect(decimalMetadata.artifactBytes.length).toBeGreaterThan(0);
    expect(jsonMacroMetadata.diagnostics).toEqual([]);
    expect(jsonMacroMetadata.artifactBytes.length).toBeGreaterThan(0);
    expect(computedMetadata.artifactBytes).toHaveLength(0);
    expect(computedMetadata.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
    expect(negativeMetadata.artifactBytes).toHaveLength(0);
    expect(negativeMetadata.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
    expect(negativeDecimalMetadata.artifactBytes).toHaveLength(0);
    expect(negativeDecimalMetadata.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
    expect(decimalComputedMetadata.artifactBytes).toHaveLength(0);
    expect(decimalComputedMetadata.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
    expect(tupleMetadata.artifactBytes).toHaveLength(0);
    expect(tupleMetadata.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
    expect(nameCallValue.artifactBytes).toHaveLength(0);
    expect(nameCallValue.diagnostics[0]?.message).toBe('semantic error: trigger metadata values must be JSON literals');
  });

  it('rejects duplicate data trigger matchers through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DuplicateMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset_definition "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
      asset_definition "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
    }
  }
}
`);
    const unsupportedMatcher = compileKotodamaStudioProgram(`
seiyaku UnsupportedMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data account created {
      asset_definition "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
    }
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has duplicate `asset_definition` matcher in `asset` data filter',
        ),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
    expect(unsupportedMatcher.artifactBytes).toHaveLength(0);
    expect(unsupportedMatcher.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` does not support `asset_definition` matcher in `account` data filter',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('reports invalid data trigger matcher literals through the SDK package boundary', () => {
    const account = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    const testnetAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(
      'ed01200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      0x0171,
    )!;
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidMatcherLiteral {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset_definition "not-an-asset-def";
    }
  }
}
`);
    const invalidAssetMissingAccount = compileKotodamaStudioProgram(`
seiyaku InvalidAssetMatcherMissingAccount {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "not-asset";
    }
  }
}
`);
    const invalidAssetDefinitionInAsset = compileKotodamaStudioProgram(`
seiyaku InvalidAssetDefinitionInAssetMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "bad#${account}";
    }
  }
}
`);
    const invalidAssetAccount = compileKotodamaStudioProgram(`
seiyaku InvalidAssetAccountMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "62Fk4FPcMuLvW5QjDGNF2a4jAmjM#ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
  }
}
`);
    const invalidAssetNetworkAccount = compileKotodamaStudioProgram(`
seiyaku InvalidAssetNetworkAccountMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "62Fk4FPcMuLvW5QjDGNF2a4jAmjM#${testnetAccount}";
    }
  }
}
`);
    const invalidAssetScopeValue = compileKotodamaStudioProgram(`
seiyaku InvalidAssetScopeValueMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data asset added {
      asset "62Fk4FPcMuLvW5QjDGNF2a4jAmjM#${account}#dataspace:x";
    }
  }
}
`);
    const invalidPeerBeforeDuplicate = compileKotodamaStudioProgram(`
seiyaku InvalidPeerMatcherBeforeDuplicate {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data peer added {
      peer "ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      peer "ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
  }
}
`);
    const invalidTriggerName = compileKotodamaStudioProgram(`
seiyaku InvalidTriggerMatcherLiteral {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data trigger created {
      trigger "not a trigger";
    }
  }
}
`);
    const invalidNftFormat = compileKotodamaStudioProgram(`
seiyaku InvalidNftMatcherFormat {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data nft created {
      nft "not-an-nft";
    }
  }
}
`);
    const invalidNftName = compileKotodamaStudioProgram(`
seiyaku InvalidNftMatcherName {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data nft created {
      nft "bad nft$wonderland";
    }
  }
}
`);
    const invalidRwaHash = compileKotodamaStudioProgram(`
seiyaku InvalidRwaMatcherHash {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa created {
      rwa "0000$wonderland";
    }
  }
}
`);
    const invalidRwaDomain = compileKotodamaStudioProgram(`
seiyaku InvalidRwaMatcherDomain {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data rwa created {
      rwa "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff$bad domain";
    }
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `asset_definition` matcher literal `not-an-asset-def` in `asset` data filter: Asset Definition ID must be valid Base58',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAssetMissingAccount.artifactBytes).toHaveLength(0);
    expect(invalidAssetMissingAccount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `asset` matcher literal `not-asset` in `asset` data filter: Asset balance bucket literal must include an account id',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAssetDefinitionInAsset.artifactBytes).toHaveLength(0);
    expect(invalidAssetDefinitionInAsset.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          `semantic error: trigger \`wake\` has invalid \`asset\` matcher literal \`bad#${account}\` in \`asset\` data filter: Asset Definition ID must contain exactly 21 decoded bytes`,
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAssetAccount.artifactBytes).toHaveLength(0);
    expect(invalidAssetAccount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `asset` matcher literal `62Fk4FPcMuLvW5QjDGNF2a4jAmjM#ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` in `asset` data filter: Asset ID account is invalid',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAssetNetworkAccount.artifactBytes).toHaveLength(0);
    expect(invalidAssetNetworkAccount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(
          /semantic error: trigger `wake` has invalid `asset` matcher literal `62Fk4FPcMuLvW5QjDGNF2a4jAmjM#test.*` in `asset` data filter: Asset ID account is invalid/
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAssetScopeValue.artifactBytes).toHaveLength(0);
    expect(invalidAssetScopeValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          `semantic error: trigger \`wake\` has invalid \`asset\` matcher literal \`62Fk4FPcMuLvW5QjDGNF2a4jAmjM#${account}#dataspace:x\` in \`asset\` data filter: Asset ID dataspace scope must be a u64`,
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidPeerBeforeDuplicate.artifactBytes).toHaveLength(0);
    expect(invalidPeerBeforeDuplicate.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `peer` matcher literal `ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` in `peer` data filter: Non-canonical multihash hex',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidTriggerName.artifactBytes).toHaveLength(0);
    expect(invalidTriggerName.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `trigger` matcher literal `not a trigger` in `trigger` data filter: White space not allowed in `Name` constructs',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNftFormat.artifactBytes).toHaveLength(0);
    expect(invalidNftFormat.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `nft` matcher literal `not-an-nft` in `nft` data filter: Non Fungible Asset ID should have format `name$domain` or `name$domain.dataspace`',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNftName.artifactBytes).toHaveLength(0);
    expect(invalidNftName.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `nft` matcher literal `bad nft$wonderland` in `nft` data filter: Failed to parse `name` part in `name$domain`',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidRwaHash.artifactBytes).toHaveLength(0);
    expect(invalidRwaHash.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `rwa` matcher literal `0000$wonderland` in `rwa` data filter: Failed to parse `hash` part in `hash$domain`',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidRwaDomain.artifactBytes).toHaveLength(0);
    expect(invalidRwaDomain.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: trigger `wake` has invalid `rwa` matcher literal `ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff$bad domain` in `rwa` data filter: Failed to parse `domain` part in `hash$domain`',
        ),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('uses Rust default Map<int, int> typing when Map::new lacks an explicit local map type', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalMapType {
  view fn run() -> int {
    let values = Map::new();
    values[1] = 42;
    return values[1];
  }
}
`);
    const keyMismatch = compileKotodamaStudioProgram(`
seiyaku LocalMapTypeMismatch {
  fn helper() {
    let values = Map::new();
    values[name("score")] = 42;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(keyMismatch.artifactBytes).toHaveLength(0);
    expect(keyMismatch.diagnostics[0]?.message).toBe('semantic error: type annotation mismatch: expected int, got Name');
  });

  it('accepts inferred local map aliases without requiring immediate indexed use', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalMapUse {
  view fn broken() -> int {
    let values: Map<Name, int> = Map::new();
    let copy = values;
    return 1;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('returns line-aware diagnostics when a view entrypoint uses mutating map ensure', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ViewEnsure {
  view fn broken() -> int {
    let values: Map<Name, int> = Map::new();
    return values.ensure(name("alice"), 7);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('view entrypoints cannot use mutating map helper `ensure`'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects trigger payload helpers in public and view entrypoints through the SDK package boundary', () => {
    const publicTriggerEvent = compileKotodamaStudioProgram(`
seiyaku PayloadGuard {
  kotoage fn run() {
    let event = trigger_event();
    info(1);
  }
}
`);
    const viewMethodGetter = compileKotodamaStudioProgram(`
seiyaku PayloadViewGuard {
  view fn amount() -> int {
    let payload = json!{ amount: 7 };
    return payload.get_int(name("amount"));
  }
}
`);
    const publicDirectGetter = compileKotodamaStudioProgram(`
seiyaku DirectPayloadGuard {
  kotoage fn run() {
    let amount = json_get_int_direct(json!{ amount: 7 }, name("amount"));
    info(amount);
  }
}
`);

    expect(publicTriggerEvent.artifactBytes).toHaveLength(0);
    expect(publicTriggerEvent.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('public and view entrypoints cannot use `trigger_event` here'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(viewMethodGetter.artifactBytes).toHaveLength(0);
    expect(viewMethodGetter.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('public and view entrypoints cannot use `get_int` here'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(publicDirectGetter.artifactBytes).toHaveLength(0);
    expect(publicDirectGetter.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('public and view entrypoints cannot use `json_get_int_direct` here'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts non-mutating map reads in view entrypoints through the SDK package boundary', () => {
    const getOr = compileKotodamaStudioProgram(`
seiyaku ViewGetOr {
  view fn amount() -> int {
    let balances: Map<int, int> = Map::new();
    return balances.get_or(7, 9);
  }
}
`);
    const getOrDefault = compileKotodamaStudioProgram(`
seiyaku ViewGetOrDefault {
  view fn amount() -> int {
    let balances: Map<int, int> = Map::new();
    return get_or_default(balances, 7, 9);
  }
}
`);

    expect(getOr.diagnostics).toEqual([]);
    expect(getOr.artifactBytes.length).toBeGreaterThan(0);
    expect(getOrDefault.diagnostics).toEqual([]);
    expect(getOrDefault.artifactBytes.length).toBeGreaterThan(0);
  });

  it('returns line-aware diagnostics when a view entrypoint mutates a state map', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ViewStateMapMutation {
  state Balances: Map<int, int>;

  view fn broken() -> int {
    Balances[7] = 9;
    return 1;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('view function `broken` cannot perform durable state mutation'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns line-aware diagnostics when a view entrypoint calls a mutating helper', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ViewEffect {
  state int Total;

  fn helper() {
    Total = 1;
  }

  view fn broken() -> int {
    helper();
    return Total;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('cannot call `helper` because `helper` performs durable state mutation'),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects transitive instruction emission through the SDK package boundary', () => {
    const view = compileKotodamaStudioProgram(`
seiyaku ViewInstructionEffect {
  fn helper() {
    execute_instruction(norito_bytes("0x0102"));
  }

  view fn inspect() -> int {
    helper();
    return 1;
  }
}
`);
    const publicEntrypoint = compileKotodamaStudioProgram(`
seiyaku PublicInstructionEffect {
  fn helper() {
    execute_instruction(norito_bytes("0x0102"));
  }

  kotoage fn run() {
    helper();
  }
}
`);

    expect(view.artifactBytes).toHaveLength(0);
    expect(view.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'view function `inspect` cannot call `helper` because `helper` performs instruction emission',
        ),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
    expect(publicEntrypoint.artifactBytes).toHaveLength(0);
    expect(publicEntrypoint.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'public function `run` calls privileged operations but is missing `permission(...)`',
        ),
      }),
    ]);
  });

  it('returns diagnostics for native escrow side effects without public permissions', () => {
    const viewEscrow = compileKotodamaStudioProgram(`
seiyaku ViewEscrowEffect {
  view fn inspect() -> int {
    escrow_accept(name("aitai_offer"));
    return 1;
  }
}
`);
    const publicEscrow = compileKotodamaStudioProgram(`
seiyaku PublicEscrowEffect {
  fn cancel() {
    escrow_cancel(name("aitai_offer"));
  }

  kotoage fn run() {
    cancel();
  }
}
`);

    expect(viewEscrow.artifactBytes).toHaveLength(0);
    expect(viewEscrow.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('view function `inspect` cannot perform host side effects'),
        line: 3,
        column: expect.any(Number),
      }),
    ]);
    expect(publicEscrow.artifactBytes).toHaveLength(0);
    expect(publicEscrow.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('public function `run` calls privileged operations'),
      }),
    ]);
  });

  it('accepts upstream permission modifiers on non-public functions through the SDK package boundary', () => {
    const helperPermission = compileKotodamaStudioProgram(`
seiyaku HelperPermissionModifier {
  fn helper() permission(Admin) {}

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const viewPermission = compileKotodamaStudioProgram(`
seiyaku ViewPermissionModifier {
  view fn inspect() permission(Admin) {}

  kotoage fn run() permission(Admin) {}
}
`);
    const duplicateHelper = compileKotodamaStudioProgram(`
seiyaku DuplicateHelperPermission {
  fn helper() permission(Admin) permission(User) {}

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const duplicatePublic = compileKotodamaStudioProgram(`
seiyaku DuplicatePublicPermission {
  kotoage fn run() permission(Admin) permission(User) {}
}
`);

    expect(helperPermission.diagnostics).toEqual([]);
    expect(helperPermission.artifactBytes.length).toBeGreaterThan(0);
    expect(viewPermission.diagnostics).toEqual([]);
    expect(viewPermission.artifactBytes.length).toBeGreaterThan(0);
    expect(duplicateHelper.artifactBytes).toHaveLength(0);
    expect(duplicateHelper.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: duplicate permission modifier'),
      }),
    ]);
    expect(duplicatePublic.artifactBytes).toHaveLength(0);
    expect(duplicatePublic.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('parser error: duplicate permission modifier'),
      }),
    ]);
  });

  it('returns semantic diagnostics when a local shadows a state declaration', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateShadow {
  state int counter;

  fn helper() {
    let counter = 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E_STATE_SHADOWED'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics when loop bindings shadow state declarations', () => {
    const cases = [
      `
seiyaku StateShadowMapKey {
  state int counter;
  state Values: Map<int, int>;

  kotoage fn run() permission(Admin) {
    for (counter, value) in Values.take(1) {
      let x = value;
    }
  }
}
`,
      `
seiyaku StateShadowMapValue {
  state int counter;
  state Values: Map<int, int>;

  kotoage fn run() permission(Admin) {
    for (key, counter) in Values.take(1) {
      let x = key;
    }
  }
}
`,
      `
seiyaku StateShadowRangeVar {
  state int counter;

  kotoage fn run() permission(Admin) {
    for counter in range(2) {
      let x = counter;
    }
  }
}
`,
    ];

    for (const source of cases) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('E_STATE_SHADOWED'),
          line: expect.any(Number),
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('returns semantic diagnostics when state parameters receive local maps', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateParamHandle {
  state Balances: Map<Name, int>;

  fn ensure_balance(state Map<Name, int> balances, key: Name) -> int {
    return balances.ensure(key, 0);
  }

  kotoage fn run(key: Name) -> int permission(Admin) {
    let balances: Map<Name, int> = Map::new();
    return ensure_balance(balances, key);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('requires a durable state handle argument'),
        line: 11,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects state parameters on public entrypoints through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PublicStateParam {
  kotoage fn run(state Map<Name, int> balances) -> int {
    return 1;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'state parameter `balances` is only supported on internal helper functions',
        ),
        line: 3,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts mixed Rust state parameter annotations through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateParamAnnotations {
  state Balances: Map<Name, int>;
  state Owners: Map<int, AccountId>;

  fn read(state Map<Name, int> balances, key: Name, owners: state Map<int, AccountId>) -> int {
    return balances.get_or(key, 0);
  }

  kotoage fn run(key: Name) -> int permission(Admin) {
    return read(Balances, key, Owners);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport.map((entry) => entry.function_name)).toEqual([
      'run',
      'read',
      '__entrypoint_impl__run',
    ]);
  });

  it('rejects first-class state map values through the reusable SDK', () => {
    const cases = [
      {
        source: `
seiyaku StateMapAlias {
  state Values: Map<int, int>;

  kotoage fn run() permission(Admin) {
    let values = Values;
  }
}
`,
        message: 'E_STATE_MAP_ALIAS: state maps are not first-class',
      },
      {
        source: `
seiyaku StateMapReassign {
  state Values: Map<int, int>;

  kotoage fn run() permission(Admin) {
    Values = Map::new();
  }
}
`,
        message: 'E_STATE_MAP_ALIAS: state maps cannot be reassigned',
      },
      {
        source: `
seiyaku StateMapUserArg {
  state Values: Map<int, int>;

  fn read(values: Map<int, int>) -> int {
    return values[0];
  }

  kotoage fn run() -> int permission(Admin) {
    return read(Values);
  }
}
`,
        message: 'E_STATE_MAP_ALIAS: state maps cannot be passed to user-defined functions',
      },
    ];

    for (const { source, message } of cases) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining(message),
          line: expect.any(Number),
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('rejects aggregate state helper parameters through the reusable SDK', () => {
    const structParam = compileKotodamaStudioProgram(`
seiyaku StateStructParam {
  struct Ledger { counter: int }

  fn read(state Ledger ledger) -> int {
    return ledger.counter;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const tupleParam = compileKotodamaStudioProgram(`
seiyaku StateTupleParam {
  fn read(state (int, int) value) -> int {
    return value.0;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    for (const compiled of [structParam, tupleParam]) {
      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('aggregate state handles are not supported yet'),
          line: expect.any(Number),
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('lowers scalar state parameters through the reusable SDK durable-handle ABI', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ScalarStateParam {
  state int Counter;

  fn read(state int value) -> int {
    return value;
  }

  kotoage fn run() -> int permission(Admin) {
    Counter = 7;
    return read(Counter);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
    }))).toEqual([
      {
        function_name: 'run',
        pc_start: 0,
        pc_end: 364,
        bytecode_bytes: 364,
        frame_bytes: 24,
      },
      {
        function_name: 'read',
        pc_start: 364,
        pc_end: 660,
        bytecode_bytes: 296,
        frame_bytes: 32,
      },
    ]);
  });

  it('passes nested durable scalar state fields through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NestedScalarStateParam {
  state int Counter;
  state pair: (int, bool);

  struct Ledger {
    counter: int,
    enabled: bool,
  }

  state ledger: Ledger;

  fn read(state int value) -> int {
    return value;
  }

  fn check(state bool value) -> bool {
    return value;
  }

  kotoage fn run() -> int permission(Admin) {
    Counter = 3;
    pair = (5, true);
    ledger = Ledger(7, true);
    assert(check(pair.1));
    assert(check(ledger.enabled));
    return read(Counter) + read(pair.0) + read(ledger.counter);
  }
}
`);
    const localSnapshot = compileKotodamaStudioProgram(`
seiyaku LocalScalarStateParamSnapshot {
  struct Ledger {
    counter: int,
  }

  state ledger: Ledger;

  fn read(state int value) -> int {
    return value;
  }

  kotoage fn run() -> int permission(Admin) {
    ledger = Ledger(7);
    let snapshot = ledger;
    return read(snapshot.counter);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(localSnapshot.artifactBytes).toHaveLength(0);
    expect(localSnapshot.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('state parameter `value` requires a durable state handle argument'),
        line: expect.any(Number),
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors upstream scalar state-parameter assignment codegen through the SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ScalarStateParamAssign {
  state int Counter;

  fn bump(state int value) {
    value = value + 1;
  }

  kotoage fn run() -> int permission(Admin) {
    Counter = 7;
    bump(Counter);
    return Counter;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport.map((entry) => ({
      function_name: entry.function_name,
      pc_start: entry.pc_start,
      pc_end: entry.pc_end,
      bytecode_bytes: entry.bytecode_bytes,
      frame_bytes: entry.frame_bytes,
    }))).toEqual([
      {
        function_name: 'run',
        pc_start: 0,
        pc_end: 364,
        bytecode_bytes: 364,
        frame_bytes: 32,
      },
      {
        function_name: 'bump',
        pc_start: 364,
        pc_end: 656,
        bytecode_bytes: 292,
        frame_bytes: 40,
      },
    ]);
    expect(toHexLiteral(readArtifactCode(compiled.artifactBytes).slice(496, 528))).toBe(
      '0x000a172000170a20e000006053000060000a1820000017200117172017180901'
    );
  });

  for (const [label, declarations] of [
    [
      'inferred',
      `let path = name("session");
    let stored = state_get(path);`,
    ],
    [
      'declared',
      `let path: Name = name("session");
    let stored: Blob = state_get(path);`,
    ],
  ] as const) {
    it(`emits direct host state helper paths for ${label} Name locals through the SDK`, () => {
      const compiled = compileKotodamaStudioProgram(`
seiyaku HostStateHelpers {
  kotoage fn run() permission(Admin) {
    ${declarations}
    state_set(path, stored);
    state_del(path);
  }
}
`);

      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.budgetReport.map((entry) => ({
        function_name: entry.function_name,
        pc_start: entry.pc_start,
        pc_end: entry.pc_end,
        bytecode_bytes: entry.bytecode_bytes,
        frame_bytes: entry.frame_bytes,
      }))).toEqual([
        {
          function_name: 'run',
          pc_start: 0,
          pc_end: 356,
          bytecode_bytes: 356,
          frame_bytes: 24,
        },
      ]);
      const code = readArtifactCode(compiled.artifactBytes);
      expect(containsBytes(code, syscallNeedle(0x50))).toBe(true);
      expect(containsBytes(code, syscallNeedle(0x51))).toBe(true);
      expect(containsBytes(code, syscallNeedle(0x52))).toBe(true);
      expect(containsBytes(code, syscallNeedle(0x5c))).toBe(false);
    });
  }

  it('reports state_get as bytes through the SDK package boundary', () => {
    const validBytesAnnotation = compileKotodamaStudioProgram(`
seiyaku StateGetBytesAnnotation {
  kotoage fn run() permission(Admin) {
    let path = name("session");
    let stored: bytes = state_get(path);
    state_set(path, stored);
  }
}
`);
    const invalidAccountAnnotation = compileKotodamaStudioProgram(`
seiyaku StateGetTypeDiagnostic {
  kotoage fn run() permission(Admin) {
    let bad: AccountId = state_get(name("session"));
  }
}
`);

    expect(validBytesAnnotation.diagnostics).toEqual([]);
    expect(invalidAccountAnnotation.artifactBytes).toHaveLength(0);
    expect(invalidAccountAnnotation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got bytes'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('reports JSON blob getters as bytes through the SDK package boundary', () => {
    const validBytesAnnotations = compileKotodamaStudioProgram(`
seiyaku JsonBlobGetterBytesAnnotation {
  fn helper() {
    let payload = json!{ proof: "0102" };
    let proof: bytes = payload.get_blob_hex(name("proof"));
    let direct: bytes = json_get_blob_hex_direct(payload, name("proof"));
    info(tlv_len(proof));
    info(tlv_len(direct));
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidMethodAnnotation = compileKotodamaStudioProgram(`
seiyaku JsonBlobGetterMethodTypeDiagnostic {
  fn helper() {
    let payload = json!{ proof: "0102" };
    let bad: AccountId = payload.get_blob_hex(name("proof"));
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidDirectAnnotation = compileKotodamaStudioProgram(`
seiyaku JsonBlobGetterDirectTypeDiagnostic {
  fn helper() {
    let payload = json!{ proof: "0102" };
    let bad: AccountId = json_get_blob_hex_direct(payload, name("proof"));
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);

    expect(validBytesAnnotations.diagnostics).toEqual([]);
    for (const compiled of [invalidMethodAnnotation, invalidDirectAnnotation]) {
      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('type annotation mismatch: expected AccountId, got bytes'),
          line: 5,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('keeps scalar state handles distinct from same-block value caches through the SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ScalarStateParamCachedAssign {
  state int Counter;

  fn bump(state int value) {
    value = value + 1;
  }

  kotoage fn run() -> int permission(Admin) {
    let seed = 7;
    Counter = seed;
    bump(Counter);
    return Counter;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
  });

  it('returns semantic diagnostics for unsupported durable map key types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DurableMapKey {
  state Values: Map<bool, int>;

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('state Map key type `bool` is not supported'),
        line: 3,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for unsupported durable scalar and struct field types', () => {
    const scalarState = compileKotodamaStudioProgram(`
seiyaku StateString {
  state string label;

  kotoage fn run() permission(Admin) {}
}
`);
    const structFieldState = compileKotodamaStudioProgram(`
seiyaku StateStructString {
  struct Label { value: string }

  state Label label;

  kotoage fn run() permission(Admin) {}
}
`);

    for (const compiled of [scalarState, structFieldState]) {
      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: 'semantic error: state type `string` is not supported for durable storage; use int, bool, Json, Blob, or pointer types',
          line: expect.any(Number),
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('accepts struct-valued durable state maps through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StructDurableMapValues {
  struct Request {
    status: int,
    alias_blob: Blob,
    requested_by_actor_id: Blob,
    requested_by_actor: Json
  }

  state Requests: Map<Name, Request>;

  kotoage fn create_request(proposal_id: Name,
                            alias_literal: Blob,
                            requested_by_actor_id: Blob,
                            requested_by_actor: Json) permission(Admin) {
    Requests[proposal_id] = Request(
      1,
      alias_literal,
      requested_by_actor_id,
      requested_by_actor
    );
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    expect(compiled.manifest?.states).toEqual([
      {
        name: 'Requests',
        type_name: 'map<Name, Request{status: int, alias_blob: Blob, requested_by_actor_id: Blob, requested_by_actor: Json}>',
      },
    ]);
  });

  it('returns semantic diagnostics for invalid assert argument types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssertShape {
  kotoage fn run() permission(Admin) {
    assert(true, false);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('assert expects (bool) or (bool, string|int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts Rust int-like wide numeric builtin arguments through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku WideNumericIntLikeBuiltins {
  kotoage fn run(amount: Amount, balance: Balance, exact: fixed_u128) permission(Admin) {
    assert(true, amount);
    require(true, exact);
    set_trigger_enabled(name("wake"), balance);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('ABORT');
    expect(rendered).toContain('NUMERIC_TO_INT');
    expect(rendered).toContain('SET_TRIGGER_ENABLED');
  });

  it('lowers upstream require assertions through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RequireAssertion {
  kotoage fn run() permission(Admin) {
    require(1 == 1, 7);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('ABORT');
  });

  it('returns semantic diagnostics for invalid require argument types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RequireShape {
  kotoage fn run() permission(Admin) {
    require(true, false);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('require expects (bool) or (bool, string|int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('parses upstream call statement sugar through the SDK package boundary', () => {
    const valid = compileKotodamaStudioProgram(`
seiyaku CallStatement {
  kotoage fn run() permission(Admin) {
    call require(1 == 1, 7);
  }
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidCallStatement {
  kotoage fn run() permission(Admin) {
    call require;
  }
}
`);
    const validHostCalls = compileKotodamaStudioProgram(`
seiyaku CallStatementHostCalls {
  kotoage fn run() permission(Admin) {
    call transfer_asset(authority(), authority(), asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1);
    call set_account_detail(authority(), name("status"), json!{ value: "ok" });
  }
}
`);
    const invalidTransfer = compileKotodamaStudioProgram(`
seiyaku InvalidCallStatementTransfer {
  kotoage fn run() permission(Admin) {
    call transfer_asset(authority(), authority(), name("rose"), 1);
  }
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(valid)).toContain('ABORT');
    expect(validHostCalls.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(validHostCalls)).toContain('TRANSFER_ASSET');
    expect(buildRenderedSourceFromCompiled(validHostCalls)).toContain('SET_ACCOUNT_DETAIL');
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('call expects a function call expression'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidTransfer.artifactBytes).toHaveLength(0);
    expect(invalidTransfer.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('transfer_asset expects (AccountId, AccountId, AssetDefinitionId, numeric)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for tuple equality', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TupleEquality {
  kotoage fn run() permission(Admin) {
    let a = (1, 2);
    let b = (1, 2);
    let same = a == b;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('equality is not supported for type (int, int)'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts Rust string and Blob bytes equality through the reusable SDK', () => {
    const stringEquality = compileKotodamaStudioProgram(`
seiyaku StringEquality {
  kotoage fn run() permission(Admin) {
    let same = "hi" == "hi";
    assert(same);
  }
}
`);
    const bytesBlobEquality = compileKotodamaStudioProgram(`
seiyaku BytesBlobEquality {
  kotoage fn run() permission(Admin) {
    let b: bytes = blob("hi");
    let c: Blob = blob("hi");
    let same = b == c;
    assert(same);
  }
}
`);
    const blobBytesEquality = compileKotodamaStudioProgram(`
seiyaku BlobBytesEquality {
  kotoage fn run() permission(Admin) {
    let c: Blob = blob("hi");
    let b: bytes = blob("hi");
    let same = c == b;
    assert(same);
  }
}
`);

    for (const compiled of [stringEquality, bytesBlobEquality, blobBytesEquality]) {
      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    }
  });

  it('supports Rust tuple-pattern let destructuring through the reusable SDK', () => {
    const tuplePattern = compileKotodamaStudioProgram(`
seiyaku TuplePattern {
  fn pair() -> (int, int) {
    return (2, 3);
  }

  kotoage fn run() -> int permission(Admin) {
    let (a, b) = pair();
    return a + b;
  }
}
`);
    const structPattern = compileKotodamaStudioProgram(`
seiyaku StructPattern {
  struct Pair {
    left: int,
    right: int,
  }

  fn make_pair() -> Pair {
    return Pair(5, 7);
  }

  kotoage fn run() -> int permission(Admin) {
    let (left, right) = make_pair();
    return left + right;
  }
}
`);

    expect(tuplePattern.diagnostics).toEqual([]);
    expect(tuplePattern.artifactBytes.length).toBeGreaterThan(0);
    expect(structPattern.diagnostics).toEqual([]);
    expect(structPattern.artifactBytes.length).toBeGreaterThan(0);
  });

  it('mirrors Rust tuple-pattern let diagnostics through the reusable SDK', () => {
    const nonAggregate = compileKotodamaStudioProgram(`
seiyaku TuplePatternNonAggregate {
  kotoage fn run() permission(Admin) {
    let (a, b) = 1;
  }
}
`);
    const tupleArity = compileKotodamaStudioProgram(`
seiyaku TuplePatternArity {
  kotoage fn run() permission(Admin) {
    let (a, b, c) = (1, 2);
  }
}
`);
    const structArity = compileKotodamaStudioProgram(`
seiyaku StructPatternArity {
  struct Pair { left: int, right: int }

  kotoage fn run() permission(Admin) {
    let (left) = Pair(1, 2);
  }
}
`);
    const emptyPattern = compileKotodamaStudioProgram(`
seiyaku EmptyTuplePattern {
  kotoage fn run() permission(Admin) {
    let () = ();
  }
}
`);
    const trailingCommaPattern = compileKotodamaStudioProgram(`
seiyaku TrailingCommaTuplePattern {
  kotoage fn run() permission(Admin) {
    let (value,) = (1);
  }
}
`);

    expect(nonAggregate.artifactBytes).toHaveLength(0);
    expect(nonAggregate.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('tuple destructuring expects a tuple or struct'),
      }),
    ]);
    expect(tupleArity.artifactBytes).toHaveLength(0);
    expect(tupleArity.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('tuple destructuring expects 2 bindings, got 3'),
      }),
    ]);
    expect(structArity.artifactBytes).toHaveLength(0);
    expect(structArity.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('struct destructuring expects 2 bindings, got 1'),
      }),
    ]);
    expect(emptyPattern.artifactBytes).toHaveLength(0);
    expect(emptyPattern.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/parser error: .*expected identifier.*RParen/),
      }),
    ]);
    expect(trailingCommaPattern.artifactBytes).toHaveLength(0);
    expect(trailingCommaPattern.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/parser error: .*expected identifier.*RParen/),
      }),
    ]);
  });

  it('mirrors Rust opaque generic type semantics through the reusable SDK', () => {
    const helperParam = compileKotodamaStudioProgram(`
fn helper(x: Foo<int>) {}
fn main() {}
`);
    const localMismatch = compileKotodamaStudioProgram(`
fn main() {
  let x: Foo<int> = 1;
}
`);
    const returnMismatch = compileKotodamaStudioProgram(`
fn helper() -> Foo<int> {
  return 1;
}
fn main() {}
`);
    const stateGeneric = compileKotodamaStudioProgram(`
state value: Foo<int>;
fn main() {}
`);
    const mapGenericValue = compileKotodamaStudioProgram(`
fn main() {
  let m: Map<int, Foo<int>> = Map::new();
  let x = m[1];
}
`);
    const mapWrongArity = compileKotodamaStudioProgram(`
fn main() {
  let m: Map<int> = Map::new();
}
`);
    const nonMapGenericNoArgs = compileKotodamaStudioProgram(`
fn main() {
  let x: Foo<> = 1;
}
`);

    expect(helperParam.diagnostics).toEqual([]);
    expect(helperParam.artifactBytes.length).toBeGreaterThan(64);
    expect(localMismatch.artifactBytes).toHaveLength(0);
    expect(localMismatch.diagnostics[0]?.message).toBe(
      'semantic error: type annotation mismatch: expected Foo, got int',
    );
    expect(returnMismatch.artifactBytes).toHaveLength(0);
    expect(returnMismatch.diagnostics[0]?.message).toBe(
      'semantic error: return type mismatch: type annotation mismatch: expected Foo, got int',
    );
    expect(stateGeneric.artifactBytes).toHaveLength(0);
    expect(stateGeneric.diagnostics[0]?.message).toBe(
      'semantic error: state type `Foo` is not supported for durable storage; use int, bool, Json, Blob, or pointer types',
    );
    expect(mapGenericValue.artifactBytes).toHaveLength(0);
    expect(mapGenericValue.diagnostics[0]?.message).toBe(
      'semantic error: in-memory Map value type `Foo` is not supported; use int, bool, string, Blob, bytes, Json, or pointer types',
    );
    expect(mapWrongArity.artifactBytes).toHaveLength(0);
    expect(mapWrongArity.diagnostics[0]?.message).toBe('semantic error: Map expects two type parameters');
    expect(nonMapGenericNoArgs.artifactBytes).toHaveLength(0);
    expect(nonMapGenericNoArgs.diagnostics[0]?.message).toBe(
      'semantic error: type annotation mismatch: expected Foo, got int',
    );
  });

  it('mirrors Rust unresolved opaque assignability through the reusable SDK', () => {
    const opaqueReturn = compileKotodamaStudioProgram(`
fn id(x: Foo) -> Bar {
  return x;
}
fn main() {}
`);
    const genericOpaqueReturn = compileKotodamaStudioProgram(`
fn id(x: Foo<int>) -> Bar<string> {
  return x;
}
fn main() {}
`);
    const opaqueLocal = compileKotodamaStudioProgram(`
fn helper(x: Foo) {
  let y: Bar = x;
}
fn main() {}
`);
    const declaredStructMismatch = compileKotodamaStudioProgram(`
struct Bar { value: int }
fn helper(x: Foo) -> Bar {
  return x;
}
fn main() {}
`);

    for (const compiled of [opaqueReturn, genericOpaqueReturn, opaqueLocal]) {
      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.artifactBytes.length).toBeGreaterThan(64);
    }
    expect(declaredStructMismatch.artifactBytes).toHaveLength(0);
    expect(declaredStructMismatch.diagnostics[0]?.message).toBe(
      'semantic error: return type mismatch: type annotation mismatch: expected struct Bar, got Foo',
    );
  });

  it('returns semantic diagnostics for unsupported in-memory map word types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalMapWordType {
  kotoage fn run() permission(Admin) {
    let values: Map<int, (int, int)> = Map::new();
    let pair = values[1];
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('in-memory Map value type `(int, int)` is not supported'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('enforces Rust on-chain map key policy through the SDK package boundary', () => {
    const localBytesMap = compileKotodamaStudioProgram(`
seiyaku LocalBytesMapPolicy {
  kotoage fn run() permission(Admin) {
    let values: Map<bytes, bytes> = Map::new();
    values[norito_bytes("0x0102")] = norito_bytes("0x0304");
    for (key, value) in values #[bounded(1)] {
      info(tlv_len(key) + tlv_len(value));
    }
  }
}
`);
    const localStringMap = compileKotodamaStudioProgram(`
seiyaku LocalStringMapPolicy {
  kotoage fn run() permission(Admin) {
    let values: Map<String, int> = Map::new();
    values["alpha"] = 4;
  }
}
`);
    const returnBytesMap = compileKotodamaStudioProgram(`
seiyaku ReturnBytesMapPolicy {
  fn helper() -> Map<bytes, int> {
    return Map::new();
  }

  kotoage fn run() -> int permission(Admin) {
    return 1;
  }
}
`);

    expect(localBytesMap.artifactBytes).toHaveLength(0);
    expect(localBytesMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: [
          'on-chain profile forbids map with key type `bytes` in binding `values` in `run`. Supported key types: int, AccountId, AssetDefinitionId, AssetId, NftId, DomainId, Name, DataSpaceId, AxtDescriptor, AssetHandle, ProofBlob, SoracloudRequest, SoracloudResponse.',
          'on-chain profile forbids map with key type `bytes` in map assignment in `run`. Supported key types: int, AccountId, AssetDefinitionId, AssetId, NftId, DomainId, Name, DataSpaceId, AxtDescriptor, AssetHandle, ProofBlob, SoracloudRequest, SoracloudResponse.',
          'on-chain profile forbids map with key type `bytes` in map iteration in `run`. Supported key types: int, AccountId, AssetDefinitionId, AssetId, NftId, DomainId, Name, DataSpaceId, AxtDescriptor, AssetHandle, ProofBlob, SoracloudRequest, SoracloudResponse.',
        ].join('\n'),
        line: 1,
        column: 1,
      }),
    ]);
    expect(localStringMap.artifactBytes).toHaveLength(0);
    expect(localStringMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'on-chain profile forbids map with key type `string` in binding `values` in `run`',
        ),
        line: 1,
        column: 1,
      }),
    ]);
    expect(returnBytesMap.artifactBytes).toHaveLength(0);
    expect(returnBytesMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: [
          'on-chain profile forbids map with key type `bytes` in return in `helper`. Supported key types: int, AccountId, AssetDefinitionId, AssetId, NftId, DomainId, Name, DataSpaceId, AxtDescriptor, AssetHandle, ProofBlob, SoracloudRequest, SoracloudResponse.',
          'on-chain profile forbids map with key type `bytes` in function `helper` return type. Supported key types: int, AccountId, AssetDefinitionId, AssetId, NftId, DomainId, Name, DataSpaceId, AxtDescriptor, AssetHandle, ProofBlob, SoracloudRequest, SoracloudResponse.',
        ].join('\n'),
        line: 1,
        column: 1,
      }),
    ]);
  });

  it('returns semantic diagnostics for loop control outside loops', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LoopControl {
  kotoage fn run() permission(Admin) {
    continue;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E_CONTINUE_OUTSIDE_LOOP'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid expression operand types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ExpressionTypes {
  fn helper(who: AccountId) {
    let next = who + 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Add expects int operands'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid condition types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ConditionTypes {
  fn helper() {
    while 1 {
      break;
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('while condition must be bool'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid loop count types', () => {
    const invalidRangeCount = compileKotodamaStudioProgram(`
seiyaku LoopCountTypes {
  fn helper() {
    for i in range(name("limit")) {
      let value = i;
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidRepeatCount = compileKotodamaStudioProgram(`
seiyaku RepeatCountTypes {
  fn helper() {
    for (let i = 0; i < name("limit"); i = i + 1) {
      let value = i;
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidRangeCount.artifactBytes).toHaveLength(0);
    expect(invalidRangeCount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('for range count must be int'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidRepeatCount.artifactBytes).toHaveLength(0);
    expect(invalidRepeatCount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('repeat count must be int'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports Rust-style for loops through the reusable SDK', () => {
    const sumLoop = compileKotodamaStudioProgram(`
seiyaku RustStyleForSum {
  fn sum(limit: int) -> int {
    let total = 0;
    for let i = 0; i < limit; i = i + 1 {
      total = total + i;
    }
    return total;
  }

  kotoage fn run() -> int permission(Admin) {
    return sum(4);
  }
}
`);
    const initBindingEscapes = compileKotodamaStudioProgram(`
seiyaku RustStyleForInitScope {
  kotoage fn run() -> int permission(Admin) {
    for let i = 0; i < 1; i = i + 1 {
      let body_value = i;
    }
    return i;
  }
}
`);

    expect(sumLoop.diagnostics).toEqual([]);
    expect(sumLoop.artifactBytes.length).toBeGreaterThan(64);
    expect(initBindingEscapes.diagnostics).toEqual([]);
    expect(initBindingEscapes.artifactBytes.length).toBeGreaterThan(64);
  });

  it('returns Rust-shaped diagnostics for Rust-style for loop scoping', () => {
    const stepBindingIsNotInBody = compileKotodamaStudioProgram(`
seiyaku RustStyleForStepScope {
  fn helper() -> int {
    for let i = 0; i < 1; let step_value = 1 {
      let body_value = step_value;
    }
    return 0;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const bodyBindingDoesNotEscape = compileKotodamaStudioProgram(`
seiyaku RustStyleForBodyScope {
  fn helper() -> int {
    for let i = 0; i < 1; i = i + 1 {
      let body_value = i;
    }
    return body_value;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const aggregateInitializer = compileKotodamaStudioProgram(`
seiyaku RustStyleForAggregateInit {
  fn helper() {
    for let pair = (1, 2); pair.0 < 3; pair = (pair.0 + 1, pair.1) {
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const aggregateStep = compileKotodamaStudioProgram(`
seiyaku RustStyleForAggregateStep {
  fn helper() {
    for let i = 0; i < 1; let pair = (1, 2) {
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const nonBoolCondition = compileKotodamaStudioProgram(`
seiyaku RustStyleForCondition {
  fn helper() {
    for let i = 0; 1; i = i + 1 {
    }
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(stepBindingIsNotInBody.artifactBytes).toHaveLength(0);
    expect(stepBindingIsNotInBody.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('undefined variable step_value'),
      }),
    ]);
    expect(bodyBindingDoesNotEscape.artifactBytes).toHaveLength(0);
    expect(bodyBindingDoesNotEscape.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('undefined variable body_value'),
      }),
    ]);
    expect(aggregateInitializer.artifactBytes).toHaveLength(0);
    expect(aggregateInitializer.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E0005: for-loop initializer must be a simple let or expression'),
      }),
    ]);
    expect(aggregateStep.artifactBytes).toHaveLength(0);
    expect(aggregateStep.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E0006: for-loop step must be a simple let or expression'),
      }),
    ]);
    expect(nonBoolCondition.artifactBytes).toHaveLength(0);
    expect(nonBoolCondition.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('for condition must be bool'),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid conditional expression types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ConditionalTypes {
  fn helper(flag: bool) {
    let value = flag ? 2 : name!("key");
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('conditional branches must have the same type'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid helper call arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HelperCallTypes {
  fn helper(owner: AccountId) -> int {
    return 1;
  }

  fn caller() {
    let value = helper(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got int'),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid constructor call arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ConstructorTypes {
  struct Pair {
    count: int,
    owner: AccountId,
  }

  fn helper() {
    let pair = Pair(1, 2);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got int'),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid pointer constructor arguments through SDK exact metadata', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PointerConstructorTypes {
  fn helper(owner: AccountId) {
    let key = name(owner);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('name expects string, Name, or Blob'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);

    const missingArg = compileKotodamaStudioProgram(`
seiyaku PointerConstructorArity {
  fn helper() {
    let owner = account_id();
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(missingArg.artifactBytes).toHaveLength(0);
    expect(missingArg.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('account_id expects one argument'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts string local bindings as pointer constructor inputs through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PointerConstructorStringBinding {
  fn helper() -> Name {
    let raw = "pool";
    return name(raw);
  }

  kotoage fn run() -> Name {
    return helper();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'run',
        params: [],
        return_type: 'Name',
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid local assignment types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LocalAssignmentTypes {
  fn helper(owner: AccountId) {
    let next = owner;
    next = 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('preserves actual bool semantics behind int annotations through the SDK boundary', () => {
    const localInfo = compileKotodamaStudioProgram(`
seiyaku LocalBoolInfo {
  fn helper() {
    let value: int = true;
    info(value);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const localAssert = compileKotodamaStudioProgram(`
seiyaku LocalBoolAssert {
  fn helper() {
    let value: int = true;
    assert(value);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const paramInfo = compileKotodamaStudioProgram(`
seiyaku ParamBoolInfo {
  fn helper(flag: bool) {
    let value: int = flag;
    info(value);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const paramAssert = compileKotodamaStudioProgram(`
seiyaku ParamBoolAssert {
  fn helper(flag: bool) {
    let value: int = flag;
    assert(value);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const constInfo = compileKotodamaStudioProgram(`
seiyaku ConstBoolInfo {
  const FLAG: int = true;

  fn helper() {
    info(FLAG);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const constReturn = compileKotodamaStudioProgram(`
seiyaku ConstBoolReturn {
  const FLAG: int = true;

  fn helper() -> bool {
    return FLAG;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(localInfo.artifactBytes).toHaveLength(0);
    expect(localInfo.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('info expects (string|int)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(localAssert.diagnostics).toEqual([]);
    expect(localAssert.artifactBytes.length).toBeGreaterThan(64);
    expect(paramInfo.artifactBytes).toHaveLength(0);
    expect(paramInfo.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('info expects (string|int)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(paramAssert.diagnostics).toEqual([]);
    expect(paramAssert.artifactBytes.length).toBeGreaterThan(64);
    expect(constInfo.artifactBytes).toHaveLength(0);
    expect(constInfo.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('info expects (string|int)'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(constReturn.diagnostics).toEqual([]);
    expect(constReturn.artifactBytes.length).toBeGreaterThan(64);
  });

  it('returns semantic diagnostics for invalid map assignment types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MapAssignmentTypes {
  fn helper() {
    let owners: Map<Name, AccountId> = Map::new();
    owners[name!("alice")] = 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid return types', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ReturnTypes {
  fn helper() -> AccountId {
    return 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('return type mismatch: type annotation mismatch: expected AccountId, got int'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust unit and zero-tuple return semantics through the SDK package boundary', () => {
    const namedUnit = compileKotodamaStudioProgram(`
seiyaku NamedUnitReturn {
  fn helper() -> unit {
    return;
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const tupleUnit = compileKotodamaStudioProgram(`
seiyaku TupleUnitReturn {
  fn helper() -> () {
    return ();
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidNamedValue = compileKotodamaStudioProgram(`
seiyaku NamedUnitReturnValue {
  fn helper() -> unit {
    return 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const zeroTupleLocal = compileKotodamaStudioProgram(`
seiyaku ZeroTupleLocal {
  fn helper() {
    let value: () = ();
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidTupleLocalFromUnitCall = compileKotodamaStudioProgram(`
seiyaku TupleLocalFromUnitCall {
  fn helper() -> unit {
    return;
  }

  kotoage fn run() permission(Admin) {
    let value: () = helper();
  }
}
`);
    const invalidNamedTupleValue = compileKotodamaStudioProgram(`
seiyaku NamedUnitReturnTupleValue {
  fn helper() -> unit {
    return ();
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidTupleMissingValue = compileKotodamaStudioProgram(`
seiyaku TupleUnitMissingValue {
  fn helper() -> () {
    return;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidTupleValue = compileKotodamaStudioProgram(`
seiyaku TupleUnitReturnValue {
  fn helper() -> () {
    return 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(namedUnit.diagnostics).toEqual([]);
    expect(tupleUnit.diagnostics).toEqual([]);
    expect(zeroTupleLocal.diagnostics).toEqual([]);
    expect(invalidTupleLocalFromUnitCall.artifactBytes).toHaveLength(0);
    expect(invalidTupleLocalFromUnitCall.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected (), got ()'),
      }),
    ]);
    expect(invalidNamedValue.artifactBytes).toHaveLength(0);
    expect(invalidNamedValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('return type mismatch: unexpected value'),
      }),
    ]);
    expect(invalidNamedTupleValue.artifactBytes).toHaveLength(0);
    expect(invalidNamedTupleValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('return type mismatch: unexpected value'),
      }),
    ]);
    expect(invalidTupleMissingValue.artifactBytes).toHaveLength(0);
    expect(invalidTupleMissingValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('return type mismatch: expected value'),
      }),
    ]);
    expect(invalidTupleValue.artifactBytes).toHaveLength(0);
    expect(invalidTupleValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('return type mismatch: type annotation mismatch: expected (), got int'),
      }),
    ]);
  });

  it('treats no-return helper calls as semantic unit expressions through the SDK package boundary', () => {
    const inferredVoidLocal = compileKotodamaStudioProgram(`
seiyaku InferredVoidLocal {
  fn helper() {
    return;
  }

  kotoage fn run() permission(Admin) {
    let value = helper();
    info(1);
  }
}
`);
    const invalidVoidLocalUse = compileKotodamaStudioProgram(`
seiyaku InvalidVoidLocalUse {
  fn helper() {
    return;
  }

  kotoage fn run() permission(Admin) {
    let value = helper();
    info(value);
  }
}
`);
    const invalidTupleLocalFromVoidCall = compileKotodamaStudioProgram(`
seiyaku TupleLocalFromVoidCall {
  fn helper() {
    return;
  }

  kotoage fn run() permission(Admin) {
    let value: () = helper();
  }
}
`);
    const invalidReturnVoidHelper = compileKotodamaStudioProgram(`
seiyaku ReturnVoidHelper {
  fn helper() {
    return;
  }

  fn wrapper() {
    return helper();
  }

  kotoage fn run() permission(Admin) {
    wrapper();
  }
}
`);

    expect(inferredVoidLocal.diagnostics).toEqual([]);
    expect(invalidVoidLocalUse.artifactBytes).toHaveLength(0);
    expect(invalidVoidLocalUse.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('info expects (string|int)'),
      }),
    ]);
    expect(invalidTupleLocalFromVoidCall.artifactBytes).toHaveLength(0);
    expect(invalidTupleLocalFromVoidCall.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected (), got ()'),
      }),
    ]);
    expect(invalidReturnVoidHelper.artifactBytes).toHaveLength(0);
    expect(invalidReturnVoidHelper.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('returning a value requires a declared return type'),
      }),
    ]);
  });

  it('returns Rust-shaped diagnostics for return values without declared return types through the SDK package boundary', () => {
    const direct = compileKotodamaStudioProgram(`
seiyaku UnexpectedDirectReturnValue {
  kotoage fn run() {
    return 1;
  }
}
`);
    const nested = compileKotodamaStudioProgram(`
seiyaku UnexpectedNestedReturnValue {
  kotoage fn run() {
    if true {
      return 1;
    }
  }
}
`);

    expect(direct.artifactBytes).toHaveLength(0);
    expect(direct.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('returning a value requires a declared return type'),
      }),
    ]);
    expect(nested.artifactBytes).toHaveLength(0);
    expect(nested.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('returning a value requires a declared return type'),
      }),
    ]);
  });

  it('returns semantic diagnostics for undefined variables', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku UndefinedVariables {
  fn helper() {
    let value = missing + 1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('undefined variable missing'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid const initializers', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ConstInitializers {
  const TWO = ONE;
  const ONE = 1;

  fn helper() {
    let value = TWO;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('const `ONE` is undefined or not yet declared'),
        line: 3,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts literal and previous-const initializers', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ConstInitializerSuccess {
  const ONE = 1;
  const TWO: int = ONE;
  const RAW: String = "pool";

  fn helper() {
    let value: int = TWO;
    let key = name(RAW);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(64);
  });

  it('returns semantic diagnostics for invalid member expressions', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MemberExpressions {
  struct Pair {
    a: int,
  }

  fn helper() {
    let pair = Pair(1);
    let value = pair.b;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining("unknown field 'b' on struct Pair (available: a)"),
        line: 9,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid indexed reads', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku IndexedReads {
  fn helper() {
    let value = 1;
    let item = value[name!("key")];
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('indexing not supported on this type'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust invalid field assignment target diagnostics through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku FieldAssignment {
  kotoage fn run() permission(Admin) {
    let pair = (1, 2);
    pair.0 = 3;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('assignment target must be a variable or map index'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust non-map indexed assignment diagnostics through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NonMapAssignment {
  kotoage fn run() permission(Admin) {
    let value = 1;
    value[0] = 2;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('map assignment expects Map<K,V> target, got int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid builtin arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BuiltinArguments {
  fn helper() {
    let value = isqrt("x");
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('isqrt expects (int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic arity diagnostics for legacy host-call statements through the SDK package boundary', () => {
    for (const [source, expected] of [
      [
        `
seiyaku LegacyInfoNoArgs {
  kotoage fn main() permission(Admin) {
    info();
  }
}
`,
        'info expects (string|int)',
      ],
      [
        `
seiyaku LegacyTransferNoArgs {
  kotoage fn main() permission(Admin) {
    transfer_asset();
  }
}
`,
        'transfer_asset expects (AccountId, AccountId, AssetDefinitionId, numeric)',
      ],
      [
        `
seiyaku LegacyMintNoArgs {
  kotoage fn main() permission(Admin) {
    mint_asset();
  }
}
`,
        'mint_asset expects (AccountId, AssetDefinitionId, numeric)',
      ],
      [
        `
seiyaku LegacyBurnNoArgs {
  kotoage fn main() permission(Admin) {
    burn_asset();
  }
}
`,
        'burn_asset expects (AccountId, AssetDefinitionId, numeric)',
      ],
      [
        `
seiyaku LegacySetDetailNoArgs {
  kotoage fn main() permission(Admin) {
    set_account_detail();
  }
}
`,
        'set_account_detail expects (AccountId, Name, Json)',
      ],
    ] as const) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining(expected),
          line: 4,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('returns semantic diagnostics for invalid block_height arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BlockHeightArguments {
  fn helper() {
    let height = block_height(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('block_height expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid no-arg runtime helper calls', () => {
    const invalidTriggerEvent = compileKotodamaStudioProgram(`
seiyaku RuntimeHelperArity {
  fn helper() {
    let event = trigger_event(1);
  }

  kotoage fn run() {}
}
`);
    const invalidCreateNfts = compileKotodamaStudioProgram(`
seiyaku CreateNftsArity {
  kotoage fn run() {
    create_nfts_for_all_users(1);
  }
}
`);
    const invalidSysvarAuthority = compileKotodamaStudioProgram(`
seiyaku SysvarAuthorityArity {
  fn helper() {
    let caller = sysvar_authority(1);
  }

  kotoage fn run() {}
}
`);

    expect(invalidTriggerEvent.artifactBytes).toHaveLength(0);
    expect(invalidTriggerEvent.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('trigger_event expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidSysvarAuthority.artifactBytes).toHaveLength(0);
    expect(invalidSysvarAuthority.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('sysvar_authority expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidCreateNfts.artifactBytes).toHaveLength(0);
    expect(invalidCreateNfts.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('create_nfts_for_all_users expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid extended query helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku QueryExecuteNoritoArguments {
  fn helper() {
    let response = query_execute_norito(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidVrf = compileKotodamaStudioProgram(`
seiyaku VrfEpochSeedArguments {
  fn helper() {
    let seed = vrf_epoch_seed(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidTypedQuery = compileKotodamaStudioProgram(`
seiyaku TypedQueryArguments {
  fn helper() {
    let account = query_get_account(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('query_execute_norito expects (Blob|bytes) pointer to NoritoBytes QueryRequest'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidVrf.artifactBytes).toHaveLength(0);
    expect(invalidVrf.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('vrf_epoch_seed expects (Blob|bytes) pointer to NoritoBytes VrfEpochSeedRequest'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidTypedQuery.artifactBytes).toHaveLength(0);
    expect(invalidTypedQuery.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('query_get_account expects (AccountId|Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid assert_eq arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssertEqArguments {
  fn helper() {
    assert_eq(true, 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('assert_eq expects two int args'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream JSON getter method arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku JsonGetterMethodArguments {
  fn helper() {
    let payload = json!{ amount: 7 };
    let item = payload.get_numeric(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_numeric expects (Json, Name)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream blob JSON getter method arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BlobGetterMethodArguments {
  fn helper() {
    let payload = json!{ proof: "010203" };
    let item = payload.get_blob_hex(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_blob_hex expects (Json, Name)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream JSON object builder arguments', () => {
    const invalidObjectArity = compileKotodamaStudioProgram(`
seiyaku JsonObjectBuilderArity {
  fn helper() {
    let payload = json_object(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidSetIntKey = compileKotodamaStudioProgram(`
seiyaku JsonSetIntKey {
  fn helper() {
    let payload = json_object();
    let next = json_set_int(payload, 1, 7);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidSetIntValue = compileKotodamaStudioProgram(`
seiyaku JsonSetIntValue {
  fn helper() {
    let payload = json_object();
    let next = json_set_int(payload, name("bad"), json("{}"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidSetAccountValue = compileKotodamaStudioProgram(`
seiyaku JsonSetAccountValue {
  fn helper() {
    let payload = json_object();
    let next = json_set_account_id(payload, name("owner"), 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidObjectArity.artifactBytes).toHaveLength(0);
    expect(invalidObjectArity.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('json_object expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidSetIntKey.artifactBytes).toHaveLength(0);
    expect(invalidSetIntKey.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('json_set_int expects (Json, Name, int)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidSetIntValue.artifactBytes).toHaveLength(0);
    expect(invalidSetIntValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('json_set_int expects (Json, Name, int)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidSetAccountValue.artifactBytes).toHaveLength(0);
    expect(invalidSetAccountValue.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('json_set_account_id expects (Json, Name, AccountId)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream path helper arguments', () => {
    const invalidBase = compileKotodamaStudioProgram(`
seiyaku PathHelperBase {
  fn helper() {
    let payload = json_object();
    let item = payload.path(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidKey = compileKotodamaStudioProgram(`
seiyaku PathHelperKey {
  fn helper() {
    let item = name("base").path(name("segment"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidBase.artifactBytes).toHaveLength(0);
    expect(invalidBase.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('path expects (Name, int|Blob|bytes)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidKey.artifactBytes).toHaveLength(0);
    expect(invalidKey.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('path expects (Name, int|Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream schema helper arguments', () => {
    const invalidEncode = compileKotodamaStudioProgram(`
seiyaku SchemaEncodeValue {
  fn helper() {
    let payload = encode_schema(name("example.schema"), 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidDecode = compileKotodamaStudioProgram(`
seiyaku SchemaDecodeName {
  fn helper() {
    let payload = decode_schema(1, norito_bytes("0x0102"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidInfo = compileKotodamaStudioProgram(`
seiyaku SchemaInfoName {
  fn helper() {
    let info_json = schema_info(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidEncode.artifactBytes).toHaveLength(0);
    expect(invalidEncode.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('encode_schema expects (Name, Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidDecode.artifactBytes).toHaveLength(0);
    expect(invalidDecode.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('decode_schema expects (Name, Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidInfo.artifactBytes).toHaveLength(0);
    expect(invalidInfo.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('schema_info expects (Name)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream hash helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HashHelperArgument {
  fn helper() {
    let digest = keccak256_hash(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('keccak256_hash expects (Blob|bytes) argument pointing to INPUT TLV'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid namespaced ZK helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ZkNamespaceArgument {
  fn helper() {
    zk::verify_unshield(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('zk_verify_unshield expects (Blob|bytes) where the argument is a pointer to NoritoBytes TLV in INPUT'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid pubkgen and valcom arguments', () => {
    const invalidPubkgen = compileKotodamaStudioProgram(`
seiyaku InvalidPubkgen {
  fn helper() {
    let value = pubkgen(name("seed"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidValcom = compileKotodamaStudioProgram(`
seiyaku InvalidValcom {
  fn helper() {
    let value = valcom(1, name("blind"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidPubkgen.artifactBytes).toHaveLength(0);
    expect(invalidPubkgen.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('pubkgen expects one int arg'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidValcom.artifactBytes).toHaveLength(0);
    expect(invalidValcom.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('valcom expects two int args'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid poseidon6 arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidPoseidon6 {
  fn helper() {
    let value = poseidon6(1, 2, 3, 4, 5, name("six"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('poseidon6 expects six int args'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream encode and decode helper arguments', () => {
    const invalidEncode = compileKotodamaStudioProgram(`
seiyaku EncodeJsonArgument {
  fn helper() {
    let bytes = encode_json(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidDecode = compileKotodamaStudioProgram(`
seiyaku DecodeIntArgument {
  fn helper() {
    let value = decode_int(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidNameDecode = compileKotodamaStudioProgram(`
seiyaku NameDecodeArgument {
  fn helper() {
    let value = name_decode(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidTlvEq = compileKotodamaStudioProgram(`
seiyaku TlvEqArgument {
  fn helper() {
    let value = tlv_eq(1, name("probe"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidEncode.artifactBytes).toHaveLength(0);
    expect(invalidEncode.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('encode_json expects (Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidDecode.artifactBytes).toHaveLength(0);
    expect(invalidDecode.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('decode_int expects (Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNameDecode.artifactBytes).toHaveLength(0);
    expect(invalidNameDecode.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('name_decode expects (Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidTlvEq.artifactBytes).toHaveLength(0);
    expect(invalidTlvEq.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('tlv_eq expects (pointer-ABI, pointer-ABI)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream pointer/TLV helper arguments', () => {
    const invalidTlvLen = compileKotodamaStudioProgram(`
seiyaku InvalidTlvLenArgument {
  fn helper() {
    let size = tlv_len(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidPointerToNorito = compileKotodamaStudioProgram(`
seiyaku InvalidPointerToNoritoArgument {
  fn helper() {
    let bytes = pointer_to_norito(json!{ ok: true });
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidTlvLen.artifactBytes).toHaveLength(0);
    expect(invalidTlvLen.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('tlv_len expects a pointer-ABI type, Json, or Blob|bytes argument'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidPointerToNorito.artifactBytes).toHaveLength(0);
    expect(invalidPointerToNorito.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('pointer_to_norito expects a pointer-ABI type or Blob|bytes argument'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid direct durable state helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateDelArgument {
  fn helper() {
    state_del(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidStateKeys = compileKotodamaStudioProgram(`
seiyaku StateKeysArgument {
  fn helper() {
    let keys = state_keys(name("Orders"), 0, blob("bad"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('state_del expects (Name)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidStateKeys.artifactBytes).toHaveLength(0);
    expect(invalidStateKeys.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('state_keys expects (Name, int offset, int limit)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream VRF helper arguments', () => {
    const invalidVrf = compileKotodamaStudioProgram(`
seiyaku VrfVariantArgument {
  fn helper() {
    let payload = blob("0x010203");
    let proof = vrf_verify(payload, payload, payload, name("variant"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidBatch = compileKotodamaStudioProgram(`
seiyaku VrfBatchArgument {
  fn helper() {
    let proof = vrf_verify_batch(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidVrf.artifactBytes).toHaveLength(0);
    expect(invalidVrf.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('vrf_verify expects (Blob|bytes, Blob|bytes, Blob|bytes, int variant)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidBatch.artifactBytes).toHaveLength(0);
    expect(invalidBatch.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('vrf_verify_batch expects (Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream signature verification helper arguments', () => {
    const invalidSm2Distid = compileKotodamaStudioProgram(`
seiyaku Sm2VerifyDistid {
  fn helper() {
    let payload = blob("0x010203");
    let ok = sm2_verify(payload, payload, payload, 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidSignatureScheme = compileKotodamaStudioProgram(`
seiyaku VerifySignatureScheme {
  fn helper() {
    let payload = blob("0x010203");
    let ok = verify_signature(payload, payload, payload, name("scheme"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidSm2Distid.artifactBytes).toHaveLength(0);
    expect(invalidSm2Distid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('sm2_verify optional distid must be provided as Blob|bytes pointer'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidSignatureScheme.artifactBytes).toHaveLength(0);
    expect(invalidSignatureScheme.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('verify_signature expects scheme code as int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream SM4 helper arguments', () => {
    const invalidGcm = compileKotodamaStudioProgram(`
seiyaku Sm4GcmArgument {
  fn helper() {
    let payload = blob("0x010203");
    let sealed = sm4_gcm_seal(payload, payload, payload, 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidCcmTag = compileKotodamaStudioProgram(`
seiyaku Sm4CcmTagArgument {
  fn helper() {
    let payload = blob("0x010203");
    let sealed = sm4_ccm_seal(payload, payload, payload, payload, name("tag"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidGcm.artifactBytes).toHaveLength(0);
    expect(invalidGcm.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('sm4_gcm_seal expects (Blob|bytes, Blob|bytes, Blob|bytes, Blob|bytes)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidCcmTag.artifactBytes).toHaveLength(0);
    expect(invalidCcmTag.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('sm4_ccm_seal optional tag length must be int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid upstream map enumeration arguments', () => {
    const invalidMap = compileKotodamaStudioProgram(`
seiyaku MapEnumerationMap {
  fn helper() {
    let values: Map<Name, int> = Map::new();
    let item = keys_take2(values, 0, 0);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidWhich = compileKotodamaStudioProgram(`
seiyaku MapEnumerationWhich {
  fn helper() {
    let values: Map<int, int> = Map::new();
    let item = keys_values_take2(values, 0, name("which"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidMap.artifactBytes).toHaveLength(0);
    expect(invalidMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('keys_take2 expects Map<int,int> as first arg, got map<Name, int>'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidWhich.artifactBytes).toHaveLength(0);
    expect(invalidWhich.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('keys_values_take2 expects (Map<int,int>, int, int)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for unsupported map foreach bounds and mutations', () => {
    const unbounded = compileKotodamaStudioProgram(`
seiyaku UnboundedMapForeach {
  fn scan() -> int {
    let values: Map<int, int> = Map::new();
    let total = 0;
    for (key, value) in values {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const tooWide = compileKotodamaStudioProgram(`
seiyaku TooWideMapForeach {
  fn scan() -> int {
    let values: Map<int, int> = Map::new();
    let total = 0;
    for (key, value) in values #[bounded(2)] {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const localRangeStart = compileKotodamaStudioProgram(`
seiyaku LocalRangeStartMapForeach {
  fn scan() -> int {
    let values: Map<int, int> = Map::new();
    let total = 0;
    for (key, value) in values.range(1, 2) {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const dynamicLocal = compileKotodamaStudioProgram(`
seiyaku DynamicLocalMapForeach {
  fn scan(n: int) -> int {
    let values: Map<int, int> = Map::new();
    let total = 0;
    for (key, value) in values.take(n) {
      total = total + key + value;
    }
    return total;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const dynamicStateWrongBound = compileKotodamaStudioProgram(`
seiyaku DynamicStateWrongBound {
  state Values: Map<int, int>;

  kotoage fn run(bound: Name) permission(Admin) {
    for (key, value) in Values.take(bound) {
      info(key + value);
    }
  }
}
`);
    const nonIntStateKey = compileKotodamaStudioProgram(`
seiyaku NonIntStateMapForeach {
  state Values: Map<Name, int>;

  kotoage fn run() permission(Admin) {
    let total = 0;
    for (key, value) in Values #[bounded(1)] {
      total = total + value;
    }
    info(total);
  }
}
`);
    const nestedNonIntStateKey = compileKotodamaStudioProgram(`
seiyaku NestedNonIntStateMapForeach {
  struct Holder { values: Map<Name, int>; }
  state Holder holder;

  kotoage fn run() permission(Admin) {
    for (key, value) in holder.values #[bounded(1)] {
      info(value);
    }
  }
}
`);
    const mutation = compileKotodamaStudioProgram(`
seiyaku MutatingMapForeach {
  fn scan() -> int {
    let values: Map<int, int> = Map::new();
    values[1] = 2;
    for (key, value) in values #[bounded(1)] {
      values[key] = value + 1;
    }
    return values[1];
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(unbounded.artifactBytes).toHaveLength(0);
    expect(unbounded.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E_UNBOUNDED_ITERATION'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(tooWide.artifactBytes).toHaveLength(0);
    expect(tooWide.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E_MAP_BOUNDS'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(localRangeStart.artifactBytes).toHaveLength(0);
    expect(localRangeStart.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('starting at index 0'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(dynamicLocal.artifactBytes).toHaveLength(0);
    expect(dynamicLocal.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('dynamic bounds on in-memory Map iteration are unsupported'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(dynamicStateWrongBound.artifactBytes).toHaveLength(0);
    expect(dynamicStateWrongBound.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('`.take(n)` requires an integer bound'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
    expect(nonIntStateKey.artifactBytes).toHaveLength(0);
    expect(nonIntStateKey.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('durable state map iteration supports Map<int, *> keys only'),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
    expect(nestedNonIntStateKey.artifactBytes).toHaveLength(0);
    expect(nestedNonIntStateKey.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('durable state map iteration supports Map<int, *> keys only'),
        line: 7,
        column: expect.any(Number),
      }),
    ]);
    expect(mutation.artifactBytes).toHaveLength(0);
    expect(mutation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('E_ITER_MUTATION'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust bounded map attribute parser diagnostics through the SDK package boundary', () => {
    const compileBounded = (attribute: string) => compileKotodamaStudioProgram(`
seiyaku BoundedAttributeDiagnostics {
  state Values: Map<int, int>;

  kotoage fn run() permission(Admin) {
    for key in Values ${attribute} {
      info(key);
    }
  }
}
`);
    const badName = compileBounded('#[limit(1)]');
    const badIdentifier = compileBounded('#[123(1)]');
    const badValue = compileBounded('#[bounded("1")]');
    const missingRightParen = compileBounded('#[bounded(1]');
    const missingRightBracket = compileBounded('#[bounded(1) {');

    expect(badName.artifactBytes).toHaveLength(0);
    expect(badName.diagnostics[0]?.message).toBe('parser error: {error}: expected expected attribute `bounded` but found Ident("limit")');
    expect(badIdentifier.artifactBytes).toHaveLength(0);
    expect(badIdentifier.diagnostics[0]?.message).toBe('parser error: {error}: expected expected attribute identifier but found Number(123)');
    expect(badValue.artifactBytes).toHaveLength(0);
    expect(badValue.diagnostics[0]?.message).toBe('parser error: {error}: expected `bounded(n)` expects a non-negative integer literal but found String("1")');
    expect(missingRightParen.artifactBytes).toHaveLength(0);
    expect(missingRightParen.diagnostics[0]?.message).toBe('parser error: {error}: expected RParen but found RBracket');
    expect(missingRightBracket.artifactBytes).toHaveLength(0);
    expect(missingRightBracket.diagnostics[0]?.message).toBe('parser error: {error}: expected RBracket but found LBrace');
  });

  it('returns semantic diagnostics for invalid map helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MapHelperArguments {
  fn helper() {
    let values: Map<Name, int> = Map::new();
    let item = values.get_or(1, 0);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected Name, got int'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects upstream-removed free and method helper spellings', () => {
    const removedFreeMap = compileKotodamaStudioProgram(`
seiyaku RemovedFreeMap {
  fn helper() {
    let values: Map<Name, int> = Map::new();
    let key = name("score");
    let seen = contains(values, key);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const removedMethodMap = compileKotodamaStudioProgram(`
seiyaku RemovedMethodMap {
  fn helper() {
    let values: Map<Name, int> = Map::new();
    let key = name("score");
    let inserted = values.get_or_insert_default(key, 7);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const removedFreeJson = compileKotodamaStudioProgram(`
seiyaku RemovedFreeJson {
  fn helper() {
    let payload = json!{ amount: 7 };
    let amount = json_get_int(payload, name("amount"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const removedMethodJson = compileKotodamaStudioProgram(`
seiyaku RemovedMethodJson {
  fn helper() {
    let payload = json!{ amount: 7 };
    let amount = payload.json_get_int(name("amount"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const removedStdMap = compileKotodamaStudioProgram(`
seiyaku RemovedStdMap {
  fn helper() {
    let values: Map<int, int> = Map::new();
    let seen = std::map::contains(values, 1);
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const removedHostPath = compileKotodamaStudioProgram(`
seiyaku RemovedHostPath {
  fn helper() -> Name {
    return host::path(name("x"), 1);
  }
}
`);

    expect(removedFreeMap.artifactBytes).toHaveLength(0);
    expect(removedFreeMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `contains(...)` was removed; use `map.contains(key)` but found Ident("contains")',
      }),
    ]);
    expect(removedMethodMap.artifactBytes).toHaveLength(0);
    expect(removedMethodMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `map.get_or_insert_default(key, default)` was removed; use `map.ensure(key, default)` but found Ident("get_or_insert_default")',
      }),
    ]);
    expect(removedFreeJson.artifactBytes).toHaveLength(0);
    expect(removedFreeJson.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `get_int(...)` was removed as a free helper; use `json.get_int(key)` but found Ident("json_get_int")',
      }),
    ]);
    expect(removedMethodJson.artifactBytes).toHaveLength(0);
    expect(removedMethodJson.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `json.json_get_int(key)` was removed; use `json.get_int(key)` but found Ident("json_get_int")',
      }),
    ]);
    expect(removedStdMap.artifactBytes).toHaveLength(0);
    expect(removedStdMap.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `contains(...)` was removed; use `map.contains(key)` but found Ident("std")',
      }),
    ]);
    expect(removedHostPath.artifactBytes).toHaveLength(0);
    expect(removedHostPath.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected `path(...)` was removed as a free helper; use `base.path(segment)` but found Ident("host")',
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid get_or_default arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku GetOrDefaultArguments {
  fn helper() {
    let values: Map<Name, int> = Map::new();
    let item = get_or_default(values, name("score"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_or_default expects (Map<K,V>, K, V)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns line-aware diagnostics for get_or on pointer-valued state maps without an explicit default', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PointerMapDefault {
  state Accounts: Map<Name, AccountId>;

  view fn broken(key: Name) -> int {
    let owner = Accounts.get_or(key);
    return 1;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('explicit default'),
        line: 6,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid host helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HostHelperArguments {
  fn helper() {
    execute_instruction(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('execute_instruction expects (Blob|bytes) where the argument is a pointer to NoritoBytes TLV in INPUT'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid call_contract arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidCallContract {
  kotoage fn run() permission(Admin) {
    let payload = json!{ amount: 1 };
    let response = call_contract(json_object(), "settle", payload);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('call_contract expects (String|Blob, String|Blob, Json)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects invalid String ABI coercions from the SDK package boundary', () => {
    const invalidJsonAssignment = compileKotodamaStudioProgram(`
seiyaku InvalidStringJson {
  fn helper() {
    let payload: Json = "plain";
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidDynamicName = compileKotodamaStudioProgram(`
seiyaku InvalidDynamicStringConstructor {
  fn label(raw: String) -> String {
    return raw;
  }

  fn helper(raw: String) {
    let key = name(label(raw));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidJsonAssignment.artifactBytes).toHaveLength(0);
    expect(invalidJsonAssignment.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected Json, got string'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidDynamicName.artifactBytes).toHaveLength(0);
    expect(invalidDynamicName.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('name expects a string literal; pass a literal or Blob|bytes payload'),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts literal String helper returns in pointer constructors through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku LiteralStringPointerConstructors {
  fn asset_literal() -> String {
    return "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
  }

  fn domain_literal() -> String {
    let domain_name = "wonderland.universal";
    return domain_name;
  }

  fn pass(raw: String) -> String {
    return raw;
  }

  fn asset_from_param(raw: String) -> AssetDefinitionId {
    return asset_definition(raw);
  }

  kotoage fn run() permission(Admin) {
    let owner = account_id(pass("merchant@paynet"));
    let asset = asset_definition(asset_literal());
    let second_asset = asset_from_param("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    let domain_id = domain(domain_literal());
    let key = name(pass("memo"));
    let payload = json(pass("{\\"ok\\":true}"));
    mint_asset(owner, asset, 1);
    burn_asset(owner, second_asset, 1);
    register_domain(domain_id);
    set_account_detail(owner, key, payload);
  }
}
`, { mode: 'test' });
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x22))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x23))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x10))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x1a))).toBe(true);
    expect(renderedSourceText).toContain('MINT_ASSET');
    expect(renderedSourceText).toContain('REGISTER_DOMAIN');
  });

  it('mirrors Rust helper-derived String constructor validation edge cases through the SDK package boundary', () => {
    const helperDerivedInvalid = compileKotodamaStudioProgram(`
seiyaku HelperDerivedInvalidStrings {
  fn bad_asset() -> String {
    return "rose#wonderland";
  }

  fn bad_domain() -> String {
    let raw = "wonderland";
    return raw;
  }

  fn bad_account() -> String {
    return "merchant";
  }

  fn bad_name() -> String {
    return "bad name";
  }

  fn pass(raw: String) -> String {
    return raw;
  }

  fn asset_from_param(raw: String) -> AssetDefinitionId {
    return asset_definition(raw);
  }

  kotoage fn run() permission(Admin) {
    let raw_asset = bad_asset();
    let raw_domain = bad_domain();
    let raw_json = pass("hello");
    let second_asset = asset_from_param("rose#wonderland");
    mint_asset(account_id(bad_account()), asset_definition(raw_asset), 1);
    burn_asset(authority(), second_asset, 1);
    register_domain(domain(raw_domain));
    set_account_detail(account_id(bad_account()), name(bad_name()), json(raw_json));
  }
}
`, { mode: 'test' });
    const invalidNameLocal = compileKotodamaStudioProgram(`
fn main() {
  let raw: String = "bad name";
  set_account_detail(authority(), name(raw), json("{}"));
}
`);
    const renderedSourceText = buildRenderedSourceFromCompiled(helperDerivedInvalid);

    expect(helperDerivedInvalid.diagnostics).toEqual([]);
    expect(renderedSourceText).toContain('MINT_ASSET');
    expect(renderedSourceText).toContain('REGISTER_DOMAIN');
    expect(renderedSourceText).toContain('SET_ACCOUNT_DETAIL');
    expect(invalidNameLocal.artifactBytes).toHaveLength(0);
    expect(invalidNameLocal.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('invalid Name literal `bad name`'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns diagnostics for invalid setvl arguments', () => {
    const dynamic = compileKotodamaStudioProgram(`
seiyaku DynamicSetvl {
  fn helper(value: int) {
    setvl(value);
  }

  kotoage fn run() permission(Admin) {
    helper(8);
  }
}
`);
    const outOfRange = compileKotodamaStudioProgram(`
seiyaku OutOfRangeSetvl {
  fn helper() {
    setvl(256);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(dynamic.artifactBytes).toHaveLength(0);
    expect(dynamic.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('setvl expects a literal int in range 0..=255'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(outOfRange.artifactBytes).toHaveLength(0);
    expect(outOfRange.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('setvl value must be in range 0..=255, got 256'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid execute_query payloads', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ExecuteQueryPayload {
  fn helper() {
    let result = execute_query(norito_bytes(1));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('execute_query expects norito_bytes(string or Blob|bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic arity diagnostics for execute_query let bindings through the SDK package boundary', () => {
    for (const source of [
      `
seiyaku ExecuteQueryNoArgs {
  fn helper() {
    let result = execute_query();
  }

  kotoage fn run() permission(Admin) {}
}
`,
      `
seiyaku ExecuteQueryWrongType {
  fn helper() {
    let result = execute_query(1);
  }

  kotoage fn run() permission(Admin) {}
}
`,
      `
seiyaku ExecuteQueryTooManyArgs {
  fn helper() {
    let result = execute_query(norito_bytes("00"), norito_bytes("00"));
  }

  kotoage fn run() permission(Admin) {}
}
`,
    ] as const) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining(
            'execute_query expects (Blob|bytes) where the argument is a pointer to NoritoBytes TLV in INPUT',
          ),
          line: 4,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('types execute_query results as bytes instead of Json', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ExecuteQueryResultBytes {
  fn helper() {
    let result = execute_query(norito_bytes("0x00"));
    let amount = result.get_int(name("amount"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const validBytesAnnotation = compileKotodamaStudioProgram(`
seiyaku ExecuteQueryBytesAnnotation {
  fn helper() {
    let result: bytes = execute_query(norito_bytes("0x00"));
    info(tlv_len(result));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidAccountAnnotation = compileKotodamaStudioProgram(`
seiyaku ExecuteQueryTypeDiagnostic {
  fn helper() {
    let bad: AccountId = execute_query(norito_bytes("0x00"));
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_int expects (Json, Name)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(validBytesAnnotation.diagnostics).toEqual([]);
    expect(invalidAccountAnnotation.artifactBytes).toHaveLength(0);
    expect(invalidAccountAnnotation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('type annotation mismatch: expected AccountId, got bytes'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('compiles expression-form execute_query through the SDK package boundary', () => {
    const valid = compileKotodamaStudioProgram(`
seiyaku ExecuteQueryExpression {
  fn helper() -> Blob {
    return execute_query(norito_bytes("0x00"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalid = compileKotodamaStudioProgram(`
seiyaku InvalidExecuteQueryExpression {
  fn helper() -> Blob {
    return execute_query(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(valid)).toContain('SMARTCONTRACT_EXECUTE_QUERY');
    expect(invalid.artifactBytes).toHaveLength(0);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'execute_query expects (Blob|bytes) where the argument is a pointer to NoritoBytes TLV in INPUT',
        ),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns Rust-shaped diagnostics for test-only helpers outside test functions', () => {
    const cases = [
      {
        name: 'invoke_entrypoint',
        statement: 'let out = invoke_entrypoint("run", json("{}"));',
      },
      {
        name: 'invoke_entrypoint_as',
        statement: 'let out = invoke_entrypoint_as("issuer", "run", json("{}"));',
      },
      {
        name: 'expect_reject_as',
        statement: 'expect_reject_as("issuer", "run", json("{}"));',
      },
      {
        name: 'actor_account',
        statement: 'let acct = actor_account("issuer");',
      },
      {
        name: 'actor_public_key',
        statement: 'let pk = actor_public_key("issuer");',
      },
      {
        name: 'actor_sign',
        statement: 'let sig = actor_sign("issuer", blob("0x00"));',
      },
    ];

    for (const { name, statement } of cases) {
      const compiled = compileKotodamaStudioProgram(`
seiyaku TestOnlyHelper {
  fn helper() {
    ${statement}
  }

  kotoage fn run() permission(Admin) {}
}
`);

      expect(compiled.artifactBytes, name).toHaveLength(0);
      expect(compiled.diagnostics, name).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining(`\`${name}\` is only available inside #[test] Kotodama functions`),
          line: 4,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('validates test-only helper argument shapes through the SDK package boundary', () => {
    const cases = [
      {
        name: 'invoke payload',
        statement: 'let out = invoke_entrypoint("run", name("payload"));',
        expected: 'invoke_entrypoint expects a Json payload as its second argument',
      },
      {
        name: 'actor literal',
        statement: 'let acct = actor_account(1);',
        expected: 'actor_account requires a literal actor alias such as "issuer" or name("issuer")',
      },
      {
        name: 'actor sign payload',
        statement: 'let sig = actor_sign("issuer", name("message"));',
        expected: 'actor_sign expects the message as Blob|bytes',
      },
      {
        name: 'actor public key arity',
        statement: 'let pk = actor_public_key("issuer", "extra");',
        expected: 'actor_public_key expects (string|Name literal actor)',
      },
    ];

    for (const { name, statement, expected } of cases) {
      const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidTestOnlyHelperShape {
  kotoage fn run() permission(Admin) {}

  #[test]
  fn smoke() {
    ${statement}
  }
}
`, { mode: 'test' });

      expect(compiled.artifactBytes, name).toHaveLength(0);
      expect(compiled.diagnostics, name).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining(expected),
          line: 7,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('strips upstream Rust test functions through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StrippedTests {
  kotoage fn run() permission(Admin) {
    info("run");
  }

  #[test(fixture="seeded")]
  fn smoke() {
    let out = invoke_entrypoint("run", json("{}"));
    let acct = actor_account("issuer");
    let pk = actor_public_key("issuer");
    let sig = actor_sign("issuer", b"demo");
    expect_reject_as("issuer", "run", json("{\\"count\\":-1}"));
  }

  #[テスト]
  fn unicode_smoke() {
    let out = invoke_entrypoint("run", json("{}"));
  }
}
`);
    const invalidOption = compileKotodamaStudioProgram(`
seiyaku InvalidTestAttribute {
  kotoage fn run() permission(Admin) {}

  #[test(seed="demo")]
  fn smoke() {}
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints.map((entrypoint) => entrypoint.name)).toEqual(['run']);
    expect(new TextDecoder().decode(compiled.artifactBytes)).not.toContain('smoke');
    expect(invalidOption.artifactBytes).toHaveLength(0);
    expect(invalidOption.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unknown test attribute option `seed`'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects malformed Rust test function declarations through the SDK package boundary', () => {
    const cases = [
      {
        name: 'params',
        source: `
seiyaku TestWithParams {
  #[test]
  fn smoke(count: int) {}

  kotoage fn run() permission(Admin) {}
}
`,
        expected: 'semantic error: test function `smoke` must not declare parameters',
      },
      {
        name: 'return type',
        source: `
seiyaku TestWithReturn {
  #[test]
  fn smoke() -> int {
    return 1;
  }

  kotoage fn run() permission(Admin) {}
}
`,
        expected: 'semantic error: test function `smoke` must not declare a return type',
      },
      {
        name: 'explicit unit return',
        source: `
seiyaku TestWithUnitReturn {
  #[test]
  fn smoke() -> () {}

  kotoage fn run() permission(Admin) {}
}
`,
        expected: 'semantic error: test function `smoke` must not declare a return type',
      },
      {
        name: 'entrypoint visibility',
        source: `
seiyaku TestWithEntrypointVisibility {
  #[test]
  kotoage fn smoke() permission(Admin) {}

  kotoage fn run() permission(Admin) {}
}
`,
        expected: 'semantic error: test function `smoke` must be declared as a local `fn`',
      },
      {
        name: 'permission modifier',
        source: `
seiyaku TestWithPermission {
  #[test]
  fn smoke() permission(Admin) {}

  kotoage fn run() permission(Admin) {}
}
`,
        expected: 'semantic error: test function `smoke` cannot declare a permission modifier',
      },
    ];

    for (const { name, source, expected } of cases) {
      for (const compiled of [
        compileKotodamaStudioProgram(source),
        compileKotodamaStudioProgram(source, { mode: 'test' }),
      ]) {
        expect(compiled.artifactBytes, name).toHaveLength(0);
        expect(compiled.diagnostics, name).toEqual([
          expect.objectContaining({
            severity: 'error',
            message: expected,
          }),
        ]);
      }
    }
  });

  it('rejects expect_reject_as value use through shared SDK metadata', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TestOnlyVoidStaticValueTypes {
  kotoage fn run() permission(Admin) {
    assert(false);
  }

  #[test]
  fn smoke() {
    let bad = expect_reject_as("issuer", "run", json("{}"));
  }
}
`, { mode: 'test' });

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/expect_reject_as.*does not return a value/),
      }),
    ]);
  });

  it('supports private test helper syscalls in SDK test mode', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TestModeHelpers {
  kotoage fn run(count: int) -> int {
    return count + 1;
  }

  #[test]
  fn smoke() {
    let next = invoke_entrypoint_as("issuer", "run", json("{\\"count\\":7}"));
    let acct = actor_account("issuer");
    let pk = actor_public_key(name("issuer"));
    let sig = actor_sign("issuer", b"message");
    expect_reject_as("issuer", "run", json("{\\"count\\":-1}"));
    let held = (next, acct, pk, sig);
  }
}
`, { mode: 'test' });
    const source = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0001))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0002))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0003))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0004))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0005))).toBe(true);
    expect(compiled.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
    expect(source).toContain('KOTO_TEST_ACTOR_ACCOUNT');
    expect(source).toContain('KOTO_TEST_EXPECT_REJECT_AS');
  });

  it('keeps test-only helpers scoped in SDK test mode through the package boundary', () => {
    const nonTestHelper = compileKotodamaStudioProgram(`
seiyaku TestModeScope {
  kotoage fn run() {
    let acct = actor_account("issuer");
  }
}
`, { mode: 'test' });
    const dynamicTarget = compileKotodamaStudioProgram(`
seiyaku DynamicDirectInvoke {
  kotoage fn run() {}

  #[test]
  fn smoke() {
    let target = "run";
    invoke_entrypoint(target, json("{}"));
  }
}
`, { mode: 'test' });

    expect(nonTestHelper.artifactBytes).toHaveLength(0);
    expect(nonTestHelper.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('`actor_account` is only available inside #[test] Kotodama functions'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(dynamicTarget.artifactBytes).toHaveLength(0);
    expect(dynamicTarget.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('invoke_entrypoint requires a literal entrypoint name'),
        line: 8,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust invoke_entrypoint_as return-pointer flags through the SDK package boundary', () => {
    const amount = compileKotodamaStudioProgram(`
seiyaku InvokeAsAmountFlag {
  kotoage fn run() -> Amount {
    let amount: Amount = 7;
    return amount;
  }

  #[test]
  fn smoke() {
    let held = invoke_entrypoint_as("issuer", "run", json("{}"));
  }
}
`, { mode: 'test' });
    const json = compileKotodamaStudioProgram(`
seiyaku InvokeAsJsonFlag {
  kotoage fn run() -> Json {
    return json("{}");
  }

  #[test]
  fn smoke() {
    let held = invoke_entrypoint_as("issuer", "run", json("{}"));
  }
}
`, { mode: 'test' });
    const name = compileKotodamaStudioProgram(`
seiyaku InvokeAsNameFlag {
  kotoage fn run() -> Name {
    return name("ok");
  }

  #[test]
  fn smoke() {
    let held = invoke_entrypoint_as("issuer", "run", json("{}"));
  }
}
`, { mode: 'test' });

    expect(amount.diagnostics).toEqual([]);
    expect(json.diagnostics).toEqual([]);
    expect(name.diagnostics).toEqual([]);
    expect(containsBytes(amount.artifactBytes, invokeEntrypointAsFlagNeedle(0))).toBe(true);
    expect(containsBytes(json.artifactBytes, invokeEntrypointAsFlagNeedle(1))).toBe(true);
    expect(containsBytes(name.artifactBytes, invokeEntrypointAsFlagNeedle(1))).toBe(true);
    expect(buildRenderedSourceFromCompiled(amount)).toContain('KOTO_TEST_INVOKE_ENTRYPOINT_AS');
  });

  it('mirrors Rust test runtime target diagnostics through the SDK package boundary', () => {
    const unknownDirect = compileKotodamaStudioProgram(`
seiyaku UnknownDirectInvoke {
  kotoage fn run() permission(Admin) {}

  #[test]
  fn smoke() {
    invoke_entrypoint("missing", json("{}"));
  }
}
`, { mode: 'test' });
    const privateDirect = compileKotodamaStudioProgram(`
seiyaku PrivateDirectInvoke {
  fn helper() {}

  kotoage fn run() permission(Admin) {}

  #[test]
  fn smoke() {
    invoke_entrypoint("helper", json("{}"));
  }
}
`, { mode: 'test' });
    const unknownInvokeAs = compileKotodamaStudioProgram(`
seiyaku UnknownInvokeAs {
  kotoage fn run() permission(Admin) {}

  #[test]
  fn smoke() {
    let value = invoke_entrypoint_as("issuer", "missing", json("{}"));
  }
}
`, { mode: 'test' });
    const privateRejectAs = compileKotodamaStudioProgram(`
seiyaku PrivateRejectAs {
  fn helper() {}

  kotoage fn run() permission(Admin) {}

  #[test]
  fn smoke() {
    expect_reject_as("issuer", "helper", json("{}"));
  }
}
`, { mode: 'test' });
    const tupleInvokeAs = compileKotodamaStudioProgram(`
seiyaku TupleInvokeAs {
  kotoage fn run() -> (int, int) {
    return (1, 2);
  }

  #[test]
  fn smoke() {
    let pair = invoke_entrypoint_as("issuer", "run", json("{}"));
  }
}
`, { mode: 'test' });

    expect(unknownDirect.artifactBytes).toHaveLength(0);
    expect(unknownDirect.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('semantic error: invoke_entrypoint targets unknown function `missing`'),
      }),
    ]);
    expect(privateDirect.artifactBytes).toHaveLength(0);
    expect(privateDirect.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: invoke_entrypoint may only target public/view/hajimari/kaizen entrypoints, got `helper`',
        ),
      }),
    ]);
    expect(unknownInvokeAs.artifactBytes).toHaveLength(0);
    expect(unknownInvokeAs.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('semantic error: unknown runtime entrypoint `missing`'),
      }),
    ]);
    expect(privateRejectAs.artifactBytes).toHaveLength(0);
    expect(privateRejectAs.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: runtime test helpers may only target public/view/hajimari/kaizen entrypoints, got `helper`',
        ),
      }),
    ]);
    expect(tupleInvokeAs.artifactBytes).toHaveLength(0);
    expect(tupleInvokeAs.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'semantic error: invoke_entrypoint_as does not yet support tuple-returning entrypoints (`run`)',
        ),
      }),
    ]);
  });

  it('supports direct invoke_entrypoint test payload overrides through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectInvoke {
  kotoage fn run(count: int) -> int {
    return count + 1;
  }

  #[test]
  fn smoke() {
    let next = invoke_entrypoint("run", json("{\\"count\\":7}"));
    assert_eq(next, 8);
  }
}
`, { mode: 'test' });
    const nameLiteral = compileKotodamaStudioProgram(`
seiyaku DirectNameInvoke {
  kotoage fn run(count: int) -> int {
    return count + 1;
  }

  #[test]
  fn smoke() {
    let next = invoke_entrypoint(name("run"), json("{\\"count\\":7}"));
    assert_eq(next, 8);
  }
}
`, { mode: 'test' });
    const source = buildRenderedSourceFromCompiled(compiled);
    const nameLiteralSource = buildRenderedSourceFromCompiled(nameLiteral);

    expect(compiled.diagnostics).toEqual([]);
    expect(nameLiteral.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0004))).toBe(false);
    expect(containsBytes(nameLiteral.artifactBytes, syscallxNeedle(0x00fe_0004))).toBe(false);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x50))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x51))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x52))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x57))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x58))).toBe(true);
    expect(compiled.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
    expect(containsBytes(nameLiteral.artifactBytes, syscallNeedle(0x50))).toBe(true);
    expect(containsBytes(nameLiteral.artifactBytes, syscallNeedle(0x57))).toBe(true);
    expect(nameLiteral.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
    expect(source).toContain('STATE_GET');
    expect(source).toContain('STATE_SET');
    expect(source).toContain('STATE_DEL');
    expect(source).toContain('JSON_ENCODE');
    expect(source).toContain('JSON_DECODE');
    expect(nameLiteralSource).toContain('STATE_GET');
    expect(nameLiteralSource).toContain('JSON_ENCODE');
  });

  it('supports direct invoke_entrypoint tuple returns through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectTupleInvoke {
  kotoage fn run(count: int) -> (int, int) {
    return (count, count + 1);
  }

  #[test]
  fn smoke() {
    let pair = invoke_entrypoint("run", json("{\\"count\\":7}"));
    assert_eq(pair.0, 7);
    assert_eq(pair.1, 8);
  }
}
`, { mode: 'test' });
    const source = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallxNeedle(0x00fe_0004))).toBe(false);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x50))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x51))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x52))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x57))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x58))).toBe(true);
    expect(compiled.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
    expect(source).toContain('STATE_SET');
    expect(source).toContain('JSON_DECODE');
  });

  it('reuses dead public pointer parameters in nested return helpers through the SDK package boundary', () => {
    const nameReturn = compileKotodamaStudioProgram(`
seiyaku PublicNameReturn {
  kotoage fn run(label: Name) -> int {
    return tlv_len(pointer_to_norito(label));
  }
}
`);
    const accountReturn = compileKotodamaStudioProgram(`
seiyaku PublicAccountReturn {
  kotoage fn run(id: AccountId) -> int {
    return tlv_len(pointer_to_norito(id));
  }
}
`);

    for (const compiled of [nameReturn, accountReturn]) {
      const implBudget = compiled.budgetReport.find((entry) => entry.function_name === '__entrypoint_impl__run');

      expect(compiled.diagnostics).toEqual([]);
      expect(compiled.artifactBytes).toHaveLength(997);
      expect(implBudget).toMatchObject({
        bytecode_bytes: 204,
        frame_bytes: 32,
      });
    }
  });

  it('reuses dead public parameters across private helper return branches through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku HelperReturnBranches {
  fn bump(x: int) -> int {
    return x + 1;
  }

  kotoage fn run(x: int) -> int {
    return bump(x) + bump(2);
  }
}
`);
    const implBudget = compiled.budgetReport.find((entry) => entry.function_name === '__entrypoint_impl__run');

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes).toHaveLength(1393);
    expect(implBudget).toMatchObject({
      bytecode_bytes: 516,
      frame_bytes: 40,
    });
  });

  it('passes single Json entrypoint payloads through whole via the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SingleJsonPayload {
  kotoage fn accept(payload: Json) -> bytes permission(Admin) {
    return call_contract("target.contract", "relay", payload);
  }
}
`, { mode: 'test' });
    const direct = compileKotodamaStudioProgram(`
seiyaku DirectSingleJsonPayload {
  kotoage fn accept(payload: Json) -> bytes permission(Admin) {
    return call_contract("target.contract", "relay", payload);
  }

  #[test]
  fn smoke() {
    let reply = invoke_entrypoint("accept", json("{\\"count\\":7}"));
    info(tlv_len(reply));
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const directRendered = buildRenderedSourceFromCompiled(direct);

    expect(compiled.diagnostics).toEqual([]);
    expect(direct.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x79))).toBe(false);
    expect(containsBytes(direct.artifactBytes, syscallNeedle(0x79))).toBe(false);
    expect(rendered).not.toContain('JSON_GET_JSON');
    expect(directRendered).not.toContain('JSON_GET_JSON');
    expect(rendered).toContain('CALL_CONTRACT');
    expect(directRendered).toContain('JSON_DECODE');
    expect(direct.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
  });

  it('rejects bool public entrypoint parameters through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BoolEntrypointParam {
  kotoage fn accept(flag: bool) -> int {
    if flag {
      return 1;
    }
    return 0;
  }
}
`);
    const direct = compileKotodamaStudioProgram(`
seiyaku DirectBoolEntrypointParam {
  kotoage fn accept(flag: bool) -> int {
    if flag {
      return 1;
    }
    return 0;
  }

  #[test]
  fn smoke() {
    let got = invoke_entrypoint("accept", json("{\\"flag\\":true}"));
    assert_eq(got, 1);
  }
}
`, { mode: 'test' });
    const mapParam = compileKotodamaStudioProgram(`
seiyaku MapEntrypointParam {
  kotoage fn accept(values: Map<Name, int>) permission(Admin) {}
}
`);
    const structParam = compileKotodamaStudioProgram(`
seiyaku StructEntrypointParam {
  struct User { value: int }

  kotoage fn accept(value: User) permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        message: 'entrypoint parameter `flag` uses unsupported public type Bool',
      }),
    ]);
    expect(direct.artifactBytes).toHaveLength(0);
    expect(direct.diagnostics).toEqual([
      expect.objectContaining({
        message: 'entrypoint parameter `flag` uses unsupported public type Bool',
      }),
    ]);
    expect(mapParam.diagnostics[0]?.message).toBe(
      'entrypoint parameter `values` uses unsupported public type Map(Name, Int)',
    );
    expect(structParam.diagnostics[0]?.message).toBe(
      'entrypoint parameter `value` uses unsupported public type Struct { name: "User", fields: [("value", Int)] }',
    );
  });

  it('mirrors aggregate durable state type parsing through the reusable SDK package boundary', () => {
    const tupleState = compileKotodamaStudioProgram(`
seiyaku TupleStateTypes {
  state Value: (int);
  state Values: Map<Name, (int)>;

  kotoage fn run() -> int {
    return 1;
  }
}
`);
    const structState = compileKotodamaStudioProgram(`
seiyaku StructStateTypes {
  struct User { value: int, flag: bool }

  state Current: User;
  state Users: Map<Name, User>;

  kotoage fn run() -> int {
    return 1;
  }
}
`);
    const nestedMapState = compileKotodamaStudioProgram(`
seiyaku NestedMapStateTypes {
  struct Holder { values: Map<Name, int>; }

  state Holder holder;

  kotoage fn run() -> int {
    return 1;
  }
}
`);
    const localTupleAnnotation = compileKotodamaStudioProgram(`
seiyaku LocalSingleTupleAnnotation {
  kotoage fn run() -> int {
    let value: (int) = 1;
    return value;
  }
}
`);
    const publicTupleParam = compileKotodamaStudioProgram(`
seiyaku PublicSingleTupleParam {
  kotoage fn run(value: (int)) permission(Admin) {}
}
`);
    const trailingCommaTuple = compileKotodamaStudioProgram(`
seiyaku TrailingCommaTupleState {
  state Value: (int,);

  kotoage fn run() -> int {
    return 1;
  }
}
`);

    expect(tupleState.diagnostics).toEqual([]);
    expect(tupleState.manifest?.states).toEqual([
      { name: 'Value', type_name: '(int)' },
      { name: 'Values', type_name: 'map<Name, (int)>' },
    ]);
    expect(structState.diagnostics).toEqual([]);
    expect(structState.manifest?.states).toEqual([
      { name: 'Current', type_name: 'User{value: int, flag: bool}' },
      { name: 'Users', type_name: 'map<Name, User{value: int, flag: bool}>' },
    ]);
    expect(nestedMapState.diagnostics).toEqual([]);
    expect(nestedMapState.manifest?.states).toEqual([
      { name: 'holder', type_name: 'Holder{values: map<Name, int>}' },
    ]);
    expect(localTupleAnnotation.artifactBytes).toHaveLength(0);
    expect(localTupleAnnotation.diagnostics[0]?.message).toBe(
      'semantic error: type annotation mismatch: expected (int), got int',
    );
    expect(publicTupleParam.artifactBytes).toHaveLength(0);
    expect(publicTupleParam.diagnostics[0]?.message).toBe(
      'entrypoint parameter `value` uses unsupported public type Tuple([Int])',
    );
    expect(trailingCommaTuple.artifactBytes).toHaveLength(0);
    expect(trailingCommaTuple.diagnostics[0]?.message).toBe(
      'parser error: expected identifier but found RParen',
    );
  });

  it('flattens scalar aggregate durable state reads and writes through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StructAndState {
  struct Pair { first: int, second: int }

  state Pair stored_pair;

  kotoage fn set_pair(a: int, b: int) {
    stored_pair = Pair(a, b);
  }

  view fn sum_pair() -> int {
    return stored_pair.first + stored_pair.second;
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const countNeedle = (needle: number[]): number => {
      let count = 0;
      for (let offset = 0; offset <= code.length - needle.length; offset += 1) {
        let matches = true;
        for (let index = 0; index < needle.length; index += 1) {
          if (code[offset + index] !== needle[index]) {
            matches = false;
            break;
          }
        }
        if (matches) count += 1;
      }
      return count;
    };
    const setPair = compiled.manifest?.entrypoints.find((entry) => entry.name === 'set_pair');
    const sumPair = compiled.manifest?.entrypoints.find((entry) => entry.name === 'sum_pair');

    expect(compiled.diagnostics).toEqual([]);
    expect(countNeedle(syscallNeedle(0x51))).toBeGreaterThanOrEqual(2);
    expect(countNeedle(syscallNeedle(0x50))).toBeGreaterThanOrEqual(2);
    expect(setPair?.write_keys).toEqual(['state:stored_pair_first', 'state:stored_pair_second']);
    expect(sumPair?.read_keys).toEqual(['state:stored_pair_first', 'state:stored_pair_second']);
    expect(compiled.manifest?.access_set_hints?.read_keys).toEqual([
      'state:stored_pair_first',
      'state:stored_pair_second',
    ]);
    expect(compiled.manifest?.access_set_hints?.write_keys).toEqual([
      'state:stored_pair_first',
      'state:stored_pair_second',
    ]);
  });

  it('wraps NftId Blob and numeric public entrypoint parameters through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku WrapperTypes {
  kotoage fn accept(nft: NftId, proof: Blob, amount: Amount) -> int permission(Admin) {
    info(tlv_len(pointer_to_norito(nft)));
    info(tlv_len(proof));
    let next: Amount = amount + 1;
    info(next);
    return 1;
  }
}
`);
    const direct = compileKotodamaStudioProgram(`
seiyaku DirectWrapperTypes {
  kotoage fn accept(nft: NftId, proof: Blob, amount: Amount) -> int permission(Admin) {
    info(tlv_len(pointer_to_norito(nft)));
    info(tlv_len(proof));
    let next: Amount = amount + 1;
    info(next);
    return 1;
  }

  #[test]
  fn smoke() {
    let ok = invoke_entrypoint("accept", json("{\\"nft\\":\\"n0$wonderland.universal\\",\\"proof\\":\\"010203\\",\\"amount\\":7}"));
    assert_eq(ok, 1);
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const directRendered = buildRenderedSourceFromCompiled(direct);

    expect(compiled.diagnostics).toEqual([]);
    expect(direct.diagnostics).toEqual([]);
    expect(rendered).toContain('JSON_GET_NFT_ID');
    expect(rendered).toContain('JSON_GET_BLOB_HEX');
    expect(rendered).toContain('JSON_GET_NUMERIC');
    expect(directRendered).toContain('JSON_GET_NFT_ID');
    expect(directRendered).toContain('JSON_GET_BLOB_HEX');
    expect(directRendered).toContain('JSON_GET_NUMERIC');
    expect(compiled.sourceMap.some((entry) => entry.function_name === '__entrypoint_impl__accept')).toBe(true);
    expect(direct.sourceMap.some((entry) => entry.function_name === 'smoke')).toBe(true);
  });

  it('ignores upstream Rust fixture declarations through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
koto_test { target: "contracts/demo.ko" }

fixture seeded {
  caller(account!("alice@wonderland"));
  grant_permission("register_domain");
}

seiyaku FixtureProduction {
  fixture local {
    caller(account!("bob@wonderland"));
    note(json!{ ok: true, nested: [1, 2] });
  }

  kotoage fn run() permission(Admin) {
    info("run");
  }

  #[test(fixture="local")]
  fn smoke() {
    let out = invoke_entrypoint("run", json("{}"));
  }
}

fixture cleanup {
  caller(account!("carol@wonderland"));
}
`);
    const invalidTarget = compileKotodamaStudioProgram(`
koto_test { source: "contracts/demo.ko" }

seiyaku InvalidKotoTest {
  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints.map((entrypoint) => entrypoint.name)).toEqual(['run']);
    expect(new TextDecoder().decode(compiled.artifactBytes)).not.toContain('smoke');
    expect(invalidTarget.artifactBytes).toHaveLength(0);
    expect(invalidTarget.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected target but found Colon',
        line: 2,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust auxiliary declaration parser diagnostics through the SDK package boundary', () => {
    const invalidKotoTestKey = compileKotodamaStudioProgram(`
koto_test { source: "contracts/demo.ko" }
fn run() {}
`);
    const invalidKotoTestTarget = compileKotodamaStudioProgram(`
koto_test { target: true }
fn run() {}
`);
    const invalidFixtureName = compileKotodamaStudioProgram(`
fixture call {}
fn run() {}
`);
    const invalidFixtureAction = compileKotodamaStudioProgram(`
fixture seeded {
  call }
fn run() {}
`);
    const invalidFixtureArgs = compileKotodamaStudioProgram(`
fixture seeded {
  action(1 2)
}
fn run() {}
`);
    const invalidKotobaKey = compileKotodamaStudioProgram(`
kotoba { true: { en: "Hello" } }
fn run() {}
`);
    const invalidKotobaText = compileKotodamaStudioProgram(`
kotoba { hello: { en: 1 } }
fn run() {}
`);

    expect(invalidKotoTestKey.artifactBytes).toHaveLength(0);
    expect(invalidKotoTestKey.diagnostics[0]?.message).toBe('parser error: {error}: expected target but found Colon');
    expect(invalidKotoTestTarget.artifactBytes).toHaveLength(0);
    expect(invalidKotoTestTarget.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier or string literal but found True');
    expect(invalidFixtureName.artifactBytes).toHaveLength(0);
    expect(invalidFixtureName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found Call');
    expect(invalidFixtureAction.artifactBytes).toHaveLength(0);
    expect(invalidFixtureAction.diagnostics[0]?.message).toBe('parser error: expected identifier but found Call');
    expect(invalidFixtureArgs.artifactBytes).toHaveLength(0);
    expect(invalidFixtureArgs.diagnostics[0]?.message).toBe('parser error: expected RParen but found Number(2)');
    expect(invalidKotobaKey.artifactBytes).toHaveLength(0);
    expect(invalidKotobaKey.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier or string literal but found True');
    expect(invalidKotobaText.artifactBytes).toHaveLength(0);
    expect(invalidKotobaText.diagnostics[0]?.message).toBe('parser error: {error}: expected string literal but found Number(1)');
  });

  it('supports upstream Rust byte string literals', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ByteStringLiterals {
  kotoage fn run() permission(Admin) {
    let escaped = norito_bytes(b"ab\\x41");
    let raw = br"ab\\n";
    let raw_hash = norito_bytes(rb#"a "quote""#);
    execute_instruction(escaped);
    execute_instruction(raw_hash);
    let result = execute_query(norito_bytes(raw));
    info(1);
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const literalEntries = readLiteralSectionEntries(compiled.artifactBytes);
    const hasLiteralPayload = (typeId: number, value: string) => literalEntries.some((entry) => (
      entry.typeId === typeId
      && entry.payload.toString() === encodeUtf8(value).toString()
    ));

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('SMARTCONTRACT_EXECUTE_INSTRUCTION');
    expect(rendered).toContain('SMARTCONTRACT_EXECUTE_QUERY');
    expect(hasLiteralPayload(9, 'abA')).toBe(true);
    expect(hasLiteralPayload(6, 'ab\\n')).toBe(true);
    expect(hasLiteralPayload(9, 'a "quote"')).toBe(true);
  });

  it('mirrors Rust lexer diagnostics for string and byte escapes', () => {
    const cases = [
      [
        'string unknown escape',
        'fn main() { let value = "\\q"; }',
        'parser error: unknown escape \\q at 1:25',
      ],
      [
        'byte unknown escape',
        'fn main() { let value = b"\\q"; }',
        'parser error: unknown escape \\q at 1:25',
      ],
      [
        'string invalid hex',
        'fn main() { let value = "\\xG1"; }',
        "parser error: invalid hex digit 'G' in escape at 1:25",
      ],
      [
        'byte invalid hex',
        'fn main() { let value = b"\\xG1"; }',
        "parser error: invalid hex digit 'G' in escape at 1:25",
      ],
      [
        'string empty unicode',
        'fn main() { let value = "\\u{}"; }',
        'parser error: empty unicode escape at 1:25',
      ],
      [
        'byte empty unicode',
        'fn main() { let value = b"\\u{}"; }',
        'parser error: empty unicode escape at 1:25',
      ],
      [
        'string unicode missing opener',
        'fn main() { let value = "\\u1234"; }',
        "parser error: {error}: unicode escape at 1:25 must start with '{'",
      ],
      [
        'byte unicode missing opener',
        'fn main() { let value = b"\\u1234"; }',
        "parser error: {error}: unicode escape at 1:25 must start with '{'",
      ],
      [
        'string newline',
        'fn main() { let value = "abc\n"; }',
        'parser error: unterminated string literal at 1:25: newline before closing quote',
      ],
      [
        'byte missing quote',
        'fn main() { let value = b"abc; }',
        'parser error: unterminated byte string literal at 1:25: missing closing quote',
      ],
      [
        'unexpected character',
        'fn main() { let value = @; }',
        "parser error: Unexpected character '@' at 1:25",
      ],
    ] as const;

    for (const [name, source, message] of cases) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes, name).toHaveLength(0);
      expect(compiled.diagnostics, name).toEqual([
        expect.objectContaining({
          severity: 'error',
          message,
          line: 1,
          column: 25,
        }),
      ]);
    }
  });

  it('skips Rust block comments through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
/* top-level comment */
seiyaku BlockComments {
  /* before entrypoint */
  kotoage fn run() -> int {
    let value = 1; /* trailing comment */
    /*
      multiline comment
    */
    return value;
  }
}
`);
    const unterminated = compileKotodamaStudioProgram('fn main() { /* missing terminator ');

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints.find((entry) => entry.name === 'run')?.return_type).toBe('int');
    expect(unterminated.artifactBytes).toHaveLength(0);
    expect(unterminated.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: unterminated block comment starting at 1:13',
        line: 1,
        column: 13,
      }),
    ]);
  });

  it('supports upstream Rust raw string literals', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RawStringLiterals {
  kotoage fn run() permission(Admin) {
    execute_instruction(norito_bytes(r"ab\\n"));
    execute_instruction(norito_bytes(r#"a "quote""#));
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const literalEntries = readLiteralSectionEntries(compiled.artifactBytes);
    const hasNoritoPayload = (value: string) => literalEntries.some((entry) => (
      entry.typeId === 9
      && entry.payload.toString() === encodeUtf8(value).toString()
    ));

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('SMARTCONTRACT_EXECUTE_INSTRUCTION');
    expect(hasNoritoPayload('ab\\n')).toBe(true);
    expect(hasNoritoPayload('a "quote"')).toBe(true);
  });

  it('rejects unterminated upstream Rust raw string literals', () => {
    const cases = [
      [
        'raw missing quote',
        'fn main() { let value = r#abc; }',
        'parser error: expected \'"\' after raw string prefix at 1:25',
      ],
      [
        'raw unterminated',
        'fn main() { let value = r#"abc; }',
        'parser error: unterminated raw string literal at 1:25: missing closing delimiter',
      ],
      [
        'raw hash unterminated',
        'fn main() { let value = r##"abc"#; }',
        'parser error: unterminated raw string literal at 1:25: missing closing delimiter',
      ],
      [
        'byte raw missing quote',
        'fn main() { let value = br#abc; }',
        'parser error: expected \'"\' after raw string prefix at 1:25',
      ],
      [
        'byte raw unterminated',
        'fn main() { let value = br#"abc; }',
        'parser error: unterminated raw string literal at 1:25: missing closing delimiter',
      ],
      [
        'reverse byte raw missing quote',
        'fn main() { let value = rb#abc; }',
        'parser error: expected \'"\' after raw string prefix at 1:25',
      ],
      [
        'reverse byte raw unterminated',
        'fn main() { let value = rb#"abc; }',
        'parser error: unterminated raw string literal at 1:25: missing closing delimiter',
      ],
    ] as const;

    for (const [name, source, message] of cases) {
      const compiled = compileKotodamaStudioProgram(source);

      expect(compiled.artifactBytes, name).toHaveLength(0);
      expect(compiled.diagnostics, name).toEqual([
        expect.objectContaining({
          severity: 'error',
          message,
          line: 1,
          column: 25,
        }),
      ]);
    }
  });

  it('supports upstream Rust hex and binary integer literals', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RadixIntegerLiterals {
  kotoage fn run() permission(Admin) {
    let hex = 0x2a;
    let binary = 0b1010_0000;
    info(hex + binary);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('DEBUG_LOG');
  });

  it('rejects upstream Rust radix integer literals without digits', () => {
    const hexadecimal = compileKotodamaStudioProgram(`
seiyaku InvalidHexIntegerLiteral {
  kotoage fn run() permission(Admin) {
    let value = 0x_;
    info(value);
  }
}
`);
    const binary = compileKotodamaStudioProgram(`
seiyaku InvalidBinaryIntegerLiteral {
  kotoage fn run() permission(Admin) {
    let value = 0b_;
    info(value);
  }
}
`);

    expect(hexadecimal.artifactBytes).toHaveLength(0);
    expect(hexadecimal.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected hexadecimal digits after 0x',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(binary.artifactBytes).toHaveLength(0);
    expect(binary.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected binary digits after 0b',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports upstream Rust i64 integer literal suffixes', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SuffixedIntegerLiterals {
  kotoage fn run() permission(Admin) {
    let decimal = 1i64;
    let hex = 0x2ai64;
    let binary = 0b10i64;
    info(decimal + hex + binary);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('DEBUG_LOG');
  });

  it('mirrors Rust signed i64 integer literal range through the SDK package boundary', () => {
    const valid = compileKotodamaStudioProgram(`
seiyaku I64LiteralBounds {
  kotoage fn run() permission(Admin) {
    let max = 9223372036854775807;
    let min = -9223372036854775808;
    info(1);
  }
}
`);
    const positiveOverflow = compileKotodamaStudioProgram(`
seiyaku I64PositiveOverflow {
  kotoage fn run() permission(Admin) {
    let value = 9223372036854775808;
    info(1);
  }
}
`);
    const negativeOverflow = compileKotodamaStudioProgram(`
seiyaku I64NegativeOverflow {
  kotoage fn run() permission(Admin) {
    let value = -9223372036854775809;
    info(1);
  }
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(valid.artifactBytes.length).toBeGreaterThan(0);
    expect(positiveOverflow.artifactBytes).toHaveLength(0);
    expect(positiveOverflow.diagnostics[0]?.message).toBe('parser error: {error}: integer literal out of range (max 9223372036854775807)');
    expect(negativeOverflow.artifactBytes).toHaveLength(0);
    expect(negativeOverflow.diagnostics[0]?.message).toBe('parser error: {error}: integer literal out of range (min -9223372036854775808)');
  });

  it('rejects unknown upstream Rust integer literal suffixes', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidIntegerLiteralSuffix {
  kotoage fn run() permission(Admin) {
    let value = 1i128;
    info(value);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unknown integer literal suffix `i128`'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects upstream Rust fractional decimal literals with direct diagnostics', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidDecimalLiteral {
  kotoage fn run() permission(Admin) {
    let value = 1.25;
    info(value);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('numeric literal `1.25` must be an unsigned integer (scale=0)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects upstream Rust all-zero fractional decimal literals through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidZeroFractionDecimal {
  kotoage fn run() permission(Admin) {
    let value = 1.000;
    info(value);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('numeric literal `1.000` must be an unsigned integer (scale=0)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('rejects upstream Rust decimal literals without fractional digits', () => {
    const missingField = compileKotodamaStudioProgram(`
seiyaku MissingDecimalFraction {
  kotoage fn run() permission(Admin) {
    let value = 1.;
    info(value);
  }
}
`);
    const underscoreField = compileKotodamaStudioProgram(`
seiyaku DecimalDotUnderscoreField {
  kotoage fn run() permission(Admin) {
    let value = 1._;
    info(value);
  }
}
`);
    const underscoreDigitField = compileKotodamaStudioProgram(`
seiyaku DecimalDotUnderscoreDigitField {
  kotoage fn run() permission(Admin) {
    let value = 1.__2;
    info(value);
  }
}
`);
    const doubleDot = compileKotodamaStudioProgram(`
seiyaku DecimalDoubleDot {
  kotoage fn run() permission(Admin) {
    let value = 1..2;
    info(value);
  }
}
`);
    const rightParen = compileKotodamaStudioProgram(`
seiyaku DecimalDotRightParen {
  kotoage fn run() permission(Admin) {
    info((1.));
  }
}
`);
    const oneLineMissingField = compileKotodamaStudioProgram('fn main() { let value = 1.; }');

    expect(missingField.artifactBytes).toHaveLength(0);
    expect(missingField.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: expected identifier or tuple index but found Semicolon',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(underscoreField.artifactBytes).toHaveLength(0);
    expect(underscoreField.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: "semantic error: unknown field '_' on type int",
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(underscoreDigitField.artifactBytes).toHaveLength(0);
    expect(underscoreDigitField.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: "semantic error: unknown field '__2' on type int",
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(doubleDot.artifactBytes).toHaveLength(0);
    expect(doubleDot.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: expected identifier or tuple index but found Dot',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(rightParen.artifactBytes).toHaveLength(0);
    expect(rightParen.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: expected identifier or tuple index but found RParen',
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(oneLineMissingField.artifactBytes).toHaveLength(0);
    expect(oneLineMissingField.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'parser error: {error}: expected identifier or tuple index but found Semicolon',
        line: 1,
        column: expect.any(Number),
      }),
    ]);
  });

  it('mirrors Rust expression-start parser diagnostics through the SDK package boundary', () => {
    const compileStatement = (statement: string) => compileKotodamaStudioProgram(`
seiyaku InvalidExpressionStart {
  kotoage fn run() permission(Admin) {
    ${statement}
  }
}
`);
    const semicolon = compileStatement('let value = ;');
    const lbrace = compileStatement('let value = {');
    const lbracket = compileStatement('let value = [;');
    const hash = compileStatement('let value = #;');
    const rbrace = compileStatement('let value = }');
    const oneLineSemicolon = compileKotodamaStudioProgram('fn main() { let value = ; }');
    const oneLineLBracket = compileKotodamaStudioProgram('fn main() { let value = [; }');
    const oneLineHash = compileKotodamaStudioProgram('fn main() { let value = #; }');
    const oneLineBangEqual = compileKotodamaStudioProgram('fn main() { let value = !=; }');
    const oneLineRBrace = compileKotodamaStudioProgram('fn main() { let value = }');
    const oneLineEof = compileKotodamaStudioProgram('fn main() { let value =');
    const oneLineBlockEof = compileKotodamaStudioProgram('fn main() {');
    const multiLineBlockEof = compileKotodamaStudioProgram('fn main() {\n  let value = 1;\n');

    expect(semicolon.artifactBytes).toHaveLength(0);
    expect(semicolon.diagnostics[0]?.message).toBe('parser error: expected expression but found Semicolon');
    expect(lbrace.artifactBytes).toHaveLength(0);
    expect(lbrace.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found LBrace');
    expect(lbracket.artifactBytes).toHaveLength(0);
    expect(lbracket.diagnostics[0]?.message).toBe('parser error: expected expression but found LBracket');
    expect(hash.artifactBytes).toHaveLength(0);
    expect(hash.diagnostics[0]?.message).toBe('parser error: expected expression but found Hash');
    expect(rbrace.artifactBytes).toHaveLength(0);
    expect(rbrace.diagnostics[0]?.message).toBe('parser error: expected expression but found RBrace');
    expect(oneLineSemicolon.artifactBytes).toHaveLength(0);
    expect(oneLineSemicolon.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found Semicolon');
    expect(oneLineLBracket.artifactBytes).toHaveLength(0);
    expect(oneLineLBracket.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found LBracket');
    expect(oneLineHash.artifactBytes).toHaveLength(0);
    expect(oneLineHash.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found Hash');
    expect(oneLineBangEqual.artifactBytes).toHaveLength(0);
    expect(oneLineBangEqual.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found BangEqual');
    expect(oneLineRBrace.artifactBytes).toHaveLength(0);
    expect(oneLineRBrace.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found RBrace');
    expect(oneLineEof.artifactBytes).toHaveLength(0);
    expect(oneLineEof.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found EOF');
    expect(oneLineBlockEof.artifactBytes).toHaveLength(0);
    expect(oneLineBlockEof.diagnostics[0]?.message).toBe('parser error: {error}: expected expression but found EOF');
    expect(multiLineBlockEof.artifactBytes).toHaveLength(0);
    expect(multiLineBlockEof.diagnostics[0]?.message).toBe('parser error: expected expression but found EOF');
  });

  it('mirrors Rust generic punctuation parser diagnostics through the SDK package boundary', () => {
    const compileStatement = (statement: string) => compileKotodamaStudioProgram(`
seiyaku InvalidPunctuation {
  kotoage fn run() permission(Admin) {
    ${statement}
  }
}
`);
    const missingEqual = compileStatement('let value 1;');
    const missingCallRParen = compileStatement('info(1;');
    const missingCallComma = compileStatement('min(1 2);');
    const bareIdentMissingSemicolon = compileStatement('value 1;');
    const indexedIdentMissingSemicolon = compileStatement('value[1] 2;');
    const pipeMissingSemicolon = compileStatement('let value = 1 | 2;');
    const ampersandMissingSemicolon = compileStatement('let value = 1 & 2;');
    const oneLineMissingEqual = compileKotodamaStudioProgram('fn main() { let value 1; }');
    const oneLineMissingCallRParen = compileKotodamaStudioProgram('fn main() { info(1; }');
    const oneLineMissingCallRParenAtEof = compileKotodamaStudioProgram('fn main() { info(1');
    const oneLineMissingCallComma = compileKotodamaStudioProgram('fn main() { min(1 2); }');
    const oneLineBareIdentMissingSemicolon = compileKotodamaStudioProgram('fn main() { value 1; }');
    const oneLineIndexedIdentMissingSemicolon = compileKotodamaStudioProgram('fn main() { value[1] 2; }');
    const oneLinePipeMissingSemicolon = compileKotodamaStudioProgram('fn main() { let value = 1 | 2; }');
    const oneLineAmpersandMissingSemicolon = compileKotodamaStudioProgram('fn main() { let value = 1 & 2; }');

    expect(missingEqual.artifactBytes).toHaveLength(0);
    expect(missingEqual.diagnostics[0]?.message).toBe('parser error: expected Equal but found Number(1)');
    expect(missingCallRParen.artifactBytes).toHaveLength(0);
    expect(missingCallRParen.diagnostics[0]?.message).toBe('parser error: expected RParen but found Semicolon');
    expect(missingCallComma.artifactBytes).toHaveLength(0);
    expect(missingCallComma.diagnostics[0]?.message).toBe('parser error: expected RParen but found Number(2)');
    expect(bareIdentMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(bareIdentMissingSemicolon.diagnostics[0]?.message).toBe('parser error: expected Semicolon but found Number(1)');
    expect(indexedIdentMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(indexedIdentMissingSemicolon.diagnostics[0]?.message).toBe('parser error: expected Semicolon but found Number(2)');
    expect(pipeMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(pipeMissingSemicolon.diagnostics[0]?.message).toBe('parser error: expected Semicolon but found Pipe');
    expect(ampersandMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(ampersandMissingSemicolon.diagnostics[0]?.message).toBe('parser error: expected Semicolon but found Ampersand');
    expect(oneLineMissingEqual.artifactBytes).toHaveLength(0);
    expect(oneLineMissingEqual.diagnostics[0]?.message).toBe('parser error: {error}: expected Equal but found Number(1)');
    expect(oneLineMissingCallRParen.artifactBytes).toHaveLength(0);
    expect(oneLineMissingCallRParen.diagnostics[0]?.message).toBe('parser error: {error}: expected RParen but found Semicolon');
    expect(oneLineMissingCallRParenAtEof.artifactBytes).toHaveLength(0);
    expect(oneLineMissingCallRParenAtEof.diagnostics[0]?.message).toBe('parser error: {error}: expected RParen but found EOF');
    expect(oneLineMissingCallComma.artifactBytes).toHaveLength(0);
    expect(oneLineMissingCallComma.diagnostics[0]?.message).toBe('parser error: {error}: expected RParen but found Number(2)');
    expect(oneLineBareIdentMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(oneLineBareIdentMissingSemicolon.diagnostics[0]?.message).toBe('parser error: {error}: expected Semicolon but found Number(1)');
    expect(oneLineIndexedIdentMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(oneLineIndexedIdentMissingSemicolon.diagnostics[0]?.message).toBe('parser error: {error}: expected Semicolon but found Number(2)');
    expect(oneLinePipeMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(oneLinePipeMissingSemicolon.diagnostics[0]?.message).toBe('parser error: {error}: expected Semicolon but found Pipe');
    expect(oneLineAmpersandMissingSemicolon.artifactBytes).toHaveLength(0);
    expect(oneLineAmpersandMissingSemicolon.diagnostics[0]?.message).toBe('parser error: {error}: expected Semicolon but found Ampersand');
    const operatorTailCases = [
      ['+=', 'PlusEqual'],
      ['-=', 'MinusEqual'],
      ['*=', 'StarEqual'],
      ['/=', 'SlashEqual'],
      ['%=', 'PercentEqual'],
      ['++', 'PlusPlus'],
    ] as const;
    for (const [operator, tokenName] of operatorTailCases) {
      const compiled = compileKotodamaStudioProgram(`fn main() { let value = 1 ${operator} 2; }`);

      expect(compiled.artifactBytes, operator).toHaveLength(0);
      expect(compiled.diagnostics[0]?.message, operator).toBe(`parser error: {error}: expected Semicolon but found ${tokenName}`);
    }
  });

  it('mirrors Rust declaration identifier parser diagnostics through the SDK package boundary', () => {
    const functionName = compileKotodamaStudioProgram(`
seiyaku InvalidFunctionName {
  kotoage fn 123() permission(Admin) {}
}
`);
    const seiyakuName = compileKotodamaStudioProgram(`
seiyaku 123 {
  kotoage fn run() permission(Admin) {}
}
`);
    const structName = compileKotodamaStudioProgram(`
seiyaku InvalidStructName {
  struct 123 { value: int; }
  kotoage fn run() permission(Admin) {}
}
`);
    const structField = compileKotodamaStudioProgram(`
seiyaku InvalidStructField {
  struct User { 123: int; }
  kotoage fn run() permission(Admin) {}
}
`);
    const permissionName = compileKotodamaStudioProgram(`
seiyaku InvalidPermissionName {
  kotoage fn run() permission("Admin") {}
}
`);
    const stateName = compileKotodamaStudioProgram(`
seiyaku InvalidStateName {
  state 123: int;
  kotoage fn run() permission(Admin) {}
}
`);
    const topLevelMissingParam = compileKotodamaStudioProgram('fn main(');
    const topLevelMissingParamAfterComma = compileKotodamaStudioProgram('fn main(value: int,');
    const topLevelTypeThenNameEof = compileKotodamaStudioProgram('fn main(int');
    const topLevelTypeThenComma = compileKotodamaStudioProgram('fn main(int,');
    const contractMissingParam = compileKotodamaStudioProgram('seiyaku Test { fn main(');
    const contractTypeThenNameEof = compileKotodamaStudioProgram('seiyaku Test { fn main(int');
    const contractTypeThenComma = compileKotodamaStudioProgram('seiyaku Test { fn main(int,');
    const bareDefaultParam = compileKotodamaStudioProgram('fn main(value) -> int { return value; }');
    const stateParamMissingTypeName = compileKotodamaStudioProgram('fn main(state value) {}');

    expect(functionName.artifactBytes).toHaveLength(0);
    expect(functionName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found Number(123)');
    expect(seiyakuName.artifactBytes).toHaveLength(0);
    expect(seiyakuName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found Number(123)');
    expect(structName.artifactBytes).toHaveLength(0);
    expect(structName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found Number(123)');
    expect(structField.artifactBytes).toHaveLength(0);
    expect(structField.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found Number(123)');
    expect(permissionName.artifactBytes).toHaveLength(0);
    expect(permissionName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found String("Admin")');
    expect(stateName.artifactBytes).toHaveLength(0);
    expect(stateName.diagnostics[0]?.message).toBe('parser error: expected identifier but found Number(123)');
    expect(topLevelMissingParam.artifactBytes).toHaveLength(0);
    expect(topLevelMissingParam.diagnostics[0]?.message).toBe('parser error: expected identifier but found EOF');
    expect(topLevelMissingParamAfterComma.artifactBytes).toHaveLength(0);
    expect(topLevelMissingParamAfterComma.diagnostics[0]?.message).toBe('parser error: expected identifier but found EOF');
    expect(topLevelTypeThenNameEof.artifactBytes).toHaveLength(0);
    expect(topLevelTypeThenNameEof.diagnostics[0]?.message).toBe('parser error: expected RParen but found EOF');
    expect(topLevelTypeThenComma.artifactBytes).toHaveLength(0);
    expect(topLevelTypeThenComma.diagnostics[0]?.message).toBe('parser error: expected identifier but found EOF');
    expect(contractMissingParam.artifactBytes).toHaveLength(0);
    expect(contractMissingParam.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found EOF');
    expect(contractTypeThenNameEof.artifactBytes).toHaveLength(0);
    expect(contractTypeThenNameEof.diagnostics[0]?.message).toBe('parser error: {error}: expected RParen but found EOF');
    expect(contractTypeThenComma.artifactBytes).toHaveLength(0);
    expect(contractTypeThenComma.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found EOF');
    expect(bareDefaultParam.artifactBytes.length).toBeGreaterThan(0);
    expect(bareDefaultParam.diagnostics).toEqual([]);
    expect(stateParamMissingTypeName.artifactBytes).toHaveLength(0);
    expect(stateParamMissingTypeName.diagnostics[0]?.message).toBe('parser error: {error}: expected identifier but found State');
  });

  it('mirrors Rust top-level item parser diagnostics through the SDK package boundary', () => {
    const topIdentifier = compileKotodamaStudioProgram('wat C {}\n');
    const topNumber = compileKotodamaStudioProgram('123\n');
    const contractIdentifier = compileKotodamaStudioProgram(`
seiyaku InvalidContractItem {
  wat C {}
}
`);
    const contractNumber = compileKotodamaStudioProgram(`
seiyaku InvalidContractItem {
  123
}
`);
    const missingFn = compileKotodamaStudioProgram(`
seiyaku InvalidContractItem {
  kotoage run() permission(Admin) {}
}
`);

    expect(topIdentifier.artifactBytes).toHaveLength(0);
    expect(topIdentifier.diagnostics[0]?.message).toBe('parser error: {error}: expected top-level item (fn, struct, state, seiyaku) but found Ident("wat")');
    expect(topNumber.artifactBytes).toHaveLength(0);
    expect(topNumber.diagnostics[0]?.message).toBe('parser error: expected top-level item (fn, struct, state, seiyaku) but found Number(123)');
    expect(contractIdentifier.artifactBytes).toHaveLength(0);
    expect(contractIdentifier.diagnostics[0]?.message).toBe('parser error: {error}: expected contract item (fn, struct, const, state, meta) but found Ident("wat")');
    expect(contractNumber.artifactBytes).toHaveLength(0);
    expect(contractNumber.diagnostics[0]?.message).toBe('parser error: expected contract item (fn, struct, const, state, meta) but found Number(123)');
    expect(missingFn.artifactBytes).toHaveLength(0);
    expect(missingFn.diagnostics[0]?.message).toBe('parser error: {error}: expected contract item (fn, struct, const, state, meta) but found Kotoage');
  });

  it('returns semantic diagnostics for invalid Iroha effect arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku EffectArguments {
  kotoage fn run() permission(Admin) {
    set_account_detail(authority(), 1, json!{ value: "ok" });
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('set_account_detail expects (AccountId, Name, Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid lifecycle helper arguments', () => {
    const invalidAccount = compileKotodamaStudioProgram(`
seiyaku InvalidRegisterAccount {
  kotoage fn run() permission(Admin) {
    register_account(name("bad"));
  }
}
`);
    const invalidAsset = compileKotodamaStudioProgram(`
seiyaku InvalidUnregisterAsset {
  kotoage fn run() permission(Admin) {
    unregister_asset(name("rose"));
  }
}
`);
    const invalidRegisterAsset = compileKotodamaStudioProgram(`
seiyaku InvalidRegisterAsset {
  kotoage fn run() permission(Admin) {
    register_asset(name("rose"), "ROSE", 1, 0);
  }
}
`);
    const invalidCreateNewAsset = compileKotodamaStudioProgram(`
seiyaku InvalidCreateNewAsset {
  kotoage fn run() permission(Admin) {
    create_new_asset(asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), json!{ symbol: "ROSE" }, 1, authority(), 0);
  }
}
`);

    expect(invalidAccount.artifactBytes).toHaveLength(0);
    expect(invalidAccount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('register_account expects (AccountId)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAsset.artifactBytes).toHaveLength(0);
    expect(invalidAsset.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unregister_asset expects (AssetDefinitionId)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidRegisterAsset.artifactBytes).toHaveLength(0);
    expect(invalidRegisterAsset.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('register_asset expects (AssetDefinitionId, string, int, int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidCreateNewAsset.artifactBytes).toHaveLength(0);
    expect(invalidCreateNewAsset.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('create_new_asset expects (AssetDefinitionId, string, int, AccountId, int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid role and permission helper arguments', () => {
    const invalidRole = compileKotodamaStudioProgram(`
seiyaku InvalidCreateRole {
  kotoage fn run() permission(Admin) {
    create_role(name("auditor"), name("read_blocks"));
  }
}
`);
    const invalidPermission = compileKotodamaStudioProgram(`
seiyaku InvalidGrantPermission {
  kotoage fn run() permission(Admin) {
    grant_permission(authority(), 1);
  }
}
`);

    expect(invalidRole.artifactBytes).toHaveLength(0);
    expect(invalidRole.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('create_role expects (Name, Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidPermission.artifactBytes).toHaveLength(0);
    expect(invalidPermission.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('grant/revoke_permission expects (AccountId, Name|Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid peer and trigger management helper arguments', () => {
    const invalidPeer = compileKotodamaStudioProgram(`
seiyaku InvalidRegisterPeer {
  kotoage fn run() permission(Admin) {
    register_peer(name("peer"));
  }
}
`);
    const invalidTrigger = compileKotodamaStudioProgram(`
seiyaku InvalidSetTriggerEnabled {
  kotoage fn run() permission(Admin) {
    set_trigger_enabled(name("wake"), json!{ enabled: true });
  }
}
`);

    expect(invalidPeer.artifactBytes).toHaveLength(0);
    expect(invalidPeer.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('register_peer expects (Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidTrigger.artifactBytes).toHaveLength(0);
    expect(invalidTrigger.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('set_trigger_enabled expects (Name, int)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid NFT host helper arguments', () => {
    const invalidMint = compileKotodamaStudioProgram(`
seiyaku InvalidNftMint {
  kotoage fn run() permission(Admin) {
    nft_mint_asset(name("bad"), authority());
  }
}
`);
    const invalidMetadata = compileKotodamaStudioProgram(`
seiyaku InvalidNftMetadata {
  kotoage fn run() permission(Admin) {
    let nft = nft_id("n0$wonderland.universal");
    nft_set_metadata(nft, 1, json!{ "meta": 1 });
  }
}
`);

    expect(invalidMint.artifactBytes).toHaveLength(0);
    expect(invalidMint.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('nft_mint_asset expects (NftId, AccountId)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidMetadata.artifactBytes).toHaveLength(0);
    expect(invalidMetadata.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('nft_set_metadata expects (NftId, Name, Json)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid transfer batch boundary arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TransferBatchBoundaryArguments {
  kotoage fn run() permission(Admin) {
    transfer_v1_batch_begin(1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('transfer_v1_batch_begin expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid transfer_batch arguments', () => {
    const empty = compileKotodamaStudioProgram(`
seiyaku EmptyTransferBatch {
  kotoage fn run() permission(Admin) {
    transfer_batch();
  }
}
`);
    const invalidEntry = compileKotodamaStudioProgram(`
seiyaku InvalidTransferBatchEntry {
  kotoage fn run() permission(Admin) {
    transfer_batch(authority());
  }
}
`);

    expect(empty.artifactBytes).toHaveLength(0);
    expect(empty.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('transfer_batch expects at least one entry'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidEntry.artifactBytes).toHaveLength(0);
    expect(invalidEntry.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('transfer_batch expects (AccountId, AccountId, AssetDefinitionId, numeric) tuple entries'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid AXT arguments', () => {
    const invalidBegin = compileKotodamaStudioProgram(`
seiyaku InvalidAxtBegin {
  kotoage fn run() permission(Admin) {
    axt_begin(norito_bytes("0x00"));
  }
}
`);
    const invalidTouch = compileKotodamaStudioProgram(`
seiyaku InvalidAxtTouch {
  kotoage fn run() permission(Admin) {
    axt_touch(dataspace_id("7"), 1);
  }
}
`);
    const invalidProof = compileKotodamaStudioProgram(`
seiyaku InvalidVerifyDsProof {
  kotoage fn run() permission(Admin) {
    verify_ds_proof(dataspace_id("7"), norito_bytes("0x00"));
  }
}
`);
    const invalidHandle = compileKotodamaStudioProgram(`
seiyaku InvalidUseAssetHandle {
  kotoage fn run() permission(Admin) {
    use_asset_handle(asset_handle(norito_bytes("0x00")), 1);
  }
}
`);
    const invalidCommit = compileKotodamaStudioProgram(`
seiyaku InvalidAxtCommit {
  kotoage fn run() permission(Admin) {
    axt_commit(1);
  }
}
`);

    expect(invalidBegin.artifactBytes).toHaveLength(0);
    expect(invalidBegin.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('axt_begin expects (AxtDescriptor)'),
      }),
    ]);
    expect(invalidTouch.artifactBytes).toHaveLength(0);
    expect(invalidTouch.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('axt_touch expects (DataSpaceId[, Blob|bytes manifest])'),
      }),
    ]);
    expect(invalidProof.artifactBytes).toHaveLength(0);
    expect(invalidProof.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('verify_ds_proof expects (DataSpaceId[, ProofBlob])'),
      }),
    ]);
    expect(invalidHandle.artifactBytes).toHaveLength(0);
    expect(invalidHandle.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('use_asset_handle expects (AssetHandle, Blob|bytes intent[, ProofBlob])'),
      }),
    ]);
    expect(invalidCommit.artifactBytes).toHaveLength(0);
    expect(invalidCommit.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('axt_commit expects no arguments'),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid native escrow arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku EscrowArguments {
  kotoage fn run() permission(Admin) {
    escrow_open_offer(name("aitai_offer"), name("rose"), 10);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('escrow_open_offer expects (Name, AssetDefinitionId, numeric[, Blob|bytes evidence_hashes])'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('emits native anonymous escrow syscall labels through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AnonymousEscrowBuiltins {
  kotoage fn run() permission(Admin) {
    let request = norito_bytes("00");
    let evidence = norito_bytes("01");
    anonymous_escrow_open_offer(request);
    anonymous_escrow_accept(name("aitai_offer"));
    anonymous_escrow_mark_payment_sent(name("aitai_offer"));
    anonymous_escrow_release(request);
    anonymous_escrow_cancel(request);
    anonymous_escrow_open_dispute(name("aitai_offer"), evidence);
    anonymous_escrow_resolve_dispute(request);
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).toBe(false);
    expect(rendered).toContain('ANONYMOUS_ESCROW_OPEN_OFFER');
    expect(rendered).toContain('ANONYMOUS_ESCROW_ACCEPT');
    expect(rendered).toContain('ANONYMOUS_ESCROW_MARK_PAYMENT_SENT');
    expect(rendered).toContain('ANONYMOUS_ESCROW_RELEASE');
    expect(rendered).toContain('ANONYMOUS_ESCROW_CANCEL');
    expect(rendered).toContain('ANONYMOUS_ESCROW_OPEN_DISPUTE');
    expect(rendered).toContain('ANONYMOUS_ESCROW_RESOLVE_DISPUTE');
  });

  it('emits Soracloud runtime syscall labels through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SoracloudBuiltins {
  kotoage fn run() permission(Admin) {
    let bytes = norito_bytes("00");
    let request = soracloud_request(bytes);
    let _read_state = soracloud_read_committed_state(request);
    let _mutation = soracloud_emit_state_mutation(request);
    let _mailbox = soracloud_emit_mailbox_message(request);
    let _journal = soracloud_append_journal(request);
    let _checkpoint = soracloud_publish_checkpoint(request);
    let _secret = soracloud_read_secret(request);
    let _credential = soracloud_read_credential(request);
    let _fetch = soracloud_egress_fetch(request);
    let _config = soracloud_read_config(request);
    let _secret_envelope = soracloud_read_secret_envelope(request);
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).toBe(false);
    expect(rendered).toContain('SORACLOUD_READ_COMMITTED_STATE');
    expect(rendered).toContain('SORACLOUD_EMIT_STATE_MUTATION');
    expect(rendered).toContain('SORACLOUD_EMIT_MAILBOX_MESSAGE');
    expect(rendered).toContain('SORACLOUD_APPEND_JOURNAL');
    expect(rendered).toContain('SORACLOUD_PUBLISH_CHECKPOINT');
    expect(rendered).toContain('SORACLOUD_READ_SECRET');
    expect(rendered).toContain('SORACLOUD_READ_CREDENTIAL');
    expect(rendered).toContain('SORACLOUD_EGRESS_FETCH');
    expect(rendered).toContain('SORACLOUD_READ_CONFIG');
    expect(rendered).toContain('SORACLOUD_READ_SECRET_ENVELOPE');
  });

  it('returns semantic diagnostics for invalid Soracloud request arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SoracloudArguments {
  kotoage fn run() permission(Admin) {
    let request = norito_bytes("00");
    let _response = soracloud_read_config(request);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('soracloud_read_config expects (SoracloudRequest)'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('emits account multisig administration syscall labels through the SDK package boundary', () => {
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountMultisigAdmin {
  kotoage fn run() permission(Admin) {
    let account = account_id("${account}");
    let signatory = json("\\"ed012059C8A4DA1EBB5380F74ABA51F502714652FDCCE9611FAFB9904E4A3C4D382774\\"");
    add_signatory(account, signatory);
    remove_signatory(account, signatory);
    set_account_quorum(account, 2);
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const entrypoint = compiled.manifest?.entrypoints[0];

    expect(compiled.diagnostics).toEqual([]);
    expect(entrypoint?.access_hints_complete).toBe(true);
    expect(entrypoint?.access_hints_skipped).toEqual([]);
    expect(entrypoint?.read_keys).toEqual(entrypoint?.write_keys);
    expect(entrypoint?.read_keys).toHaveLength(1);
    expect(entrypoint?.read_keys?.[0]).toMatch(/^account:/u);
    expect(rendered).toContain('ADD_SIGNATORY');
    expect(rendered).toContain('REMOVE_SIGNATORY');
    expect(rendered).toContain('SET_ACCOUNT_QUORUM');
  });

  it('returns semantic diagnostics for invalid account multisig administration arguments', () => {
    const invalidSignatory = compileKotodamaStudioProgram(`
seiyaku AccountAdminArguments {
  kotoage fn run(account: AccountId) permission(Admin) {
    add_signatory(account, name("not_json"));
  }
}
`);
    const invalidQuorum = compileKotodamaStudioProgram(`
seiyaku AccountAdminQuorumArguments {
  kotoage fn run(account: AccountId) permission(Admin) {
    set_account_quorum(account, json("{}"));
  }
}
`);

    expect(invalidSignatory.artifactBytes).toHaveLength(0);
    expect(invalidSignatory.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('add_signatory expects (AccountId, Json)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidQuorum.artifactBytes).toHaveLength(0);
    expect(invalidQuorum.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('set_account_quorum expects (AccountId, numeric)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid inline ZK builder arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InlineBuilderArguments {
  kotoage fn run() permission(Admin) {
    let bytes = build_submit_ballot_inline("election", 1, blob("0123456789abcdef0123456789abcdef"), "halo2", blob("proof"), blob("vk"));
    execute_instruction(bytes);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('build_submit_ballot_inline expects (string election_id, Blob|bytes ciphertext, Blob|bytes nullifier32, string backend, Blob|bytes proof, Blob|bytes vk)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns compile diagnostics for non-literal int-like inline unshield amounts', () => {
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const inputs32 = `0x${'00'.repeat(32)}`;
    const compiled = compileKotodamaStudioProgram(`
seiyaku DynamicUnshieldAmount {
  kotoage fn run(amount: Amount) permission(Admin) {
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    let bytes = build_unshield_inline(asset, authority(), amount, blob("0123456789abcdef0123456789abcdef"), "halo2", blob("proof"), blob("vk"));
    execute_instruction(bytes);
  }
}
`);
    const validConstAmount = compileKotodamaStudioProgram(`
const AMOUNT = 1;

seiyaku ConstUnshieldAmount {
  kotoage fn run() permission(Admin) {
    let bytes = build_unshield_inline(asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), account_id("${account}"), AMOUNT, blob("${inputs32}"), "halo2", blob("proof"), blob("vk"));
    execute_instruction(bytes);
  }
}
`);
    const invalidNegativeAmount = compileKotodamaStudioProgram(`
seiyaku NegativeUnshieldAmount {
  kotoage fn run() permission(Admin) {
    let bytes = build_unshield_inline(asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), account_id("${account}"), -1, blob("${inputs32}"), "halo2", blob("proof"), blob("vk"));
    execute_instruction(bytes);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('build_unshield_inline amount requires a compile-time integer literal'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
    expect(validConstAmount.diagnostics).toEqual([]);
    expect(validConstAmount.artifactBytes.length).toBeGreaterThan(0);
    expect(invalidNegativeAmount.artifactBytes).toHaveLength(0);
    expect(invalidNegativeAmount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('semantic error: build_unshield_inline requires non-negative amount'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics for invalid trigger declarations', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerDeclarations {
  kotoage fn run() {}

  trigger wake {
    call run;
    on time schedule(0, 0);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('trigger `wake` schedule period_ms must be non-zero'),
        line: 5,
        column: expect.any(Number),
      }),
    ]);
  });

  it('returns semantic diagnostics when not all return paths produce a value', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MissingReturn {
  view fn broken(flag: bool) -> int {
    if flag {
      return 1;
    }
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('not all paths return a value'),
      }),
    ]);
  });

  it('returns line-aware diagnostics when execute_instruction is used as a value', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InstructionValue {
  kotoage fn broken() -> int permission(Admin) {
    let payload = execute_instruction(norito_bytes("0x0102"));
    return 1;
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('does not return a value'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('accepts upstream-style contract meta blocks', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MetaDemo {
  meta {
    abi: 1,
    zk: true,
    cycles: 200000,
  }

  kotoage fn main() permission(Admin) {
    let h = poseidon2(1, 2);
    info(h);
    set_account_detail(authority(), name!("probe"), json!{ result: "ok" });
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.features_bitmap).toBe(1);
    expect(new DataView(compiled.artifactBytes.buffer, compiled.artifactBytes.byteOffset, compiled.artifactBytes.byteLength).getBigUint64(8, true)).toBe(200000n);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'main',
        kind: PUBLIC_MANIFEST_KIND,
        permission: 'Admin',
      }),
    ]);
  });

  it('mirrors contract meta header aliases and default cycle handling through the SDK package boundary', () => {
    const defaultCycles = compileKotodamaStudioProgram(`
seiyaku DefaultCycles {
  meta {
    max_cycles: 0,
  }

  hajimari() {
    info("ready");
  }
}
`);
    const aliases = compileKotodamaStudioProgram(`
seiyaku MetaAliases {
  meta {
    abi: 1,
    cycles: 200000,
    vector: true,
    vl: 8,
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);
    const defaultCyclesView = new DataView(
      defaultCycles.artifactBytes.buffer,
      defaultCycles.artifactBytes.byteOffset,
      defaultCycles.artifactBytes.byteLength,
    );
    const aliasesView = new DataView(
      aliases.artifactBytes.buffer,
      aliases.artifactBytes.byteOffset,
      aliases.artifactBytes.byteLength,
    );

    expect(defaultCycles.diagnostics).toEqual([]);
    expect(defaultCyclesView.getBigUint64(8, true)).toBe(1_000_000n);
    expect(aliases.diagnostics).toEqual([]);
    expect(aliasesView.getBigUint64(8, true)).toBe(200000n);
    expect(aliases.manifest?.features_bitmap).toBe(2);
    expect(aliases.artifactBytes[6]).toBe(2);
    expect(aliases.artifactBytes[7]).toBe(8);
  });

  it('accepts string contract meta feature lists through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MetaStringFeatures {
  meta {
    features: ["zk", "simd"],
    vl: 8,
  }

  kotoage fn main() permission(Admin) {
    setvl(8);
    let h = poseidon2(1, 2);
    info(h);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.features_bitmap).toBe(3);
    expect(compiled.artifactBytes[6]).toBe(3);
    expect(compiled.artifactBytes[7]).toBe(8);
  });

  it('returns Rust-shaped contract meta parser diagnostics through the SDK package boundary', () => {
    const badParamType = compileKotodamaStudioProgram(`
seiyaku ParamNumberType {
  kotoage fn run(value: 123) permission(Admin) {}
}
`);
    const unknownMetaKey = compileKotodamaStudioProgram(`
seiyaku MetaUnknown {
  meta { unknown: 1; }
  kotoage fn run() permission(Admin) {}
}
`);
    const badMetaKey = compileKotodamaStudioProgram(`
seiyaku MetaNumberKey {
  meta { 123: 1; }
  kotoage fn run() permission(Admin) {}
}
`);
    const numericBoolean = compileKotodamaStudioProgram(`
seiyaku MetaNumericBoolean {
  meta { vector: 1; }
  kotoage fn run() permission(Admin) {}
}
`);
    const stringBoolean = compileKotodamaStudioProgram(`
seiyaku MetaStringBoolean {
  meta { vector: "x"; }
  kotoage fn run() permission(Admin) {}
}
`);
    const badFeatureItem = compileKotodamaStudioProgram(`
seiyaku MetaBadFeatureItem {
  meta { features: [1]; }
  kotoage fn run() permission(Admin) {}
}
`);
    const trailingFeatureComma = compileKotodamaStudioProgram(`
seiyaku MetaTrailingFeatureComma {
  meta { features: [vector,]; }
  kotoage fn run() permission(Admin) {}
}
`);
    const unknownFeature = compileKotodamaStudioProgram(`
seiyaku MetaUnknownFeature {
  meta { features: [vector, bad]; }
  kotoage fn run() permission(Admin) {}
}
`);
    const invalidAbi = compileKotodamaStudioProgram(`
seiyaku MetaInvalidAbi {
  meta { abi: 2; }
  kotoage fn run() permission(Admin) {}
}
`);
    const negativeCycles = compileKotodamaStudioProgram(`
seiyaku MetaNegativeCycles {
  meta { cycles: -1; }
  kotoage fn run() permission(Admin) {}
}
`);

    expect(badParamType.diagnostics[0]?.message).toBe(
      'parser error: {error}: expected identifier but found Number(123)',
    );
    expect(badMetaKey.diagnostics[0]?.message).toBe(
      'parser error: {error}: expected identifier but found Number(123)',
    );
    expect(unknownMetaKey.diagnostics[0]?.message).toBe(
      "parser error: unknown meta numeric key 'unknown'",
    );
    expect(numericBoolean.diagnostics[0]?.message).toBe(
      "parser error: unknown meta numeric key 'vector'",
    );
    expect(stringBoolean.diagnostics[0]?.message).toBe(
      'parser error: {error}: expected number, boolean, or string list but found String("x")',
    );
    expect(badFeatureItem.diagnostics[0]?.message).toBe(
      'parser error: {error}: expected string literal or identifier but found Number(1)',
    );
    expect(trailingFeatureComma.diagnostics[0]?.message).toBe(
      'parser error: {error}: expected string literal or identifier but found RBracket',
    );
    expect(unknownFeature.diagnostics[0]?.message).toBe(
      "parser error: unknown feature 'bad' in meta features list",
    );
    expect(invalidAbi.diagnostics[0]?.message).toBe(
      "parser error: meta key 'abi' value 2 is not supported in the first release (expected 1)",
    );
    expect(negativeCycles.diagnostics[0]?.message).toBe(
      "parser error: meta key 'cycles' value -1 must be non-negative",
    );
  });

  it('mirrors duplicate contract meta key behavior through the SDK package boundary', () => {
    const scalarLastWins = compileKotodamaStudioProgram(`
seiyaku DuplicateScalarMeta {
  meta {
    cycles: 100,
    cycles: 200,
    vl: 4,
    vl: 8,
    vector: false,
    vector: true,
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);
    const multipleMetaBlocks = compileKotodamaStudioProgram(`
seiyaku MultipleMetaBlocks {
  meta {
    cycles: 100,
    features: [],
  }
  meta {
    vl: 8,
    features: [vector],
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);
    const emptyThenVectorFeatures = compileKotodamaStudioProgram(`
seiyaku EmptyThenVectorFeatures {
  meta {
    features: [],
    features: [vector],
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);
    const repeatedNonEmptyFeatures = compileKotodamaStudioProgram(`
seiyaku RepeatedNonEmptyFeatures {
  meta {
    features: [vector],
    features: [],
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);

    expect(scalarLastWins.diagnostics).toEqual([]);
    expect(new DataView(
      scalarLastWins.artifactBytes.buffer,
      scalarLastWins.artifactBytes.byteOffset,
      scalarLastWins.artifactBytes.byteLength,
    ).getBigUint64(8, true)).toBe(200n);
    expect(scalarLastWins.artifactBytes[7]).toBe(8);
    expect(scalarLastWins.manifest?.features_bitmap).toBe(2);
    expect(multipleMetaBlocks.diagnostics).toEqual([]);
    expect(new DataView(
      multipleMetaBlocks.artifactBytes.buffer,
      multipleMetaBlocks.artifactBytes.byteOffset,
      multipleMetaBlocks.artifactBytes.byteLength,
    ).getBigUint64(8, true)).toBe(100n);
    expect(multipleMetaBlocks.artifactBytes[7]).toBe(8);
    expect(multipleMetaBlocks.manifest?.features_bitmap).toBe(2);
    expect(emptyThenVectorFeatures.diagnostics).toEqual([]);
    expect(emptyThenVectorFeatures.manifest?.features_bitmap).toBe(2);
    expect(repeatedNonEmptyFeatures.diagnostics[0]?.message).toBe(
      "parser error: duplicate meta key 'features'",
    );
  });

  it('emits upstream kotoba localization metadata through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
kotoba {
  "E0002": { ja: "後", en: "after" }
}

seiyaku KotobaDemo {
  kotoba {
    E0001: { ja: "準備", en: "ready" }
  }

  kotoage fn run() {
    info("ready");
  }
}
`);
    const duplicateId = compileKotodamaStudioProgram(`
seiyaku DuplicateKotoba {
  kotoba {
    E0001: { en: "ready" },
    E0001: { en: "again" },
  }

  hajimari() {
    info("ready");
  }
}
`);
    const duplicateLang = compileKotodamaStudioProgram(`
seiyaku DuplicateKotobaLang {
  kotoba {
    E0001: { en: "ready", en: "again" }
  }

  hajimari() {
    info("ready");
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.kotoba).toEqual([
      {
        msg_id: 'E0001',
        translations: [
          { lang: 'en', text: 'ready' },
          { lang: 'ja', text: '準備' },
        ],
      },
      {
        msg_id: 'E0002',
        translations: [
          { lang: 'en', text: 'after' },
          { lang: 'ja', text: '後' },
        ],
      },
    ]);
    expect(containsBytes(compiled.artifactBytes, Array.from(encodeUtf8('E0001')))).toBe(true);
    expect(containsBytes(compiled.artifactBytes, Array.from(encodeUtf8('準備')))).toBe(true);
    expect(duplicateId.artifactBytes).toHaveLength(0);
    expect(duplicateId.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('duplicate kotoba key `E0001`'),
      }),
    ]);
    expect(duplicateLang.artifactBytes).toHaveLength(0);
    expect(duplicateLang.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('repeats language `en`'),
      }),
    ]);
  });

  it('returns diagnostics for invalid explicit contract meta feature requests', () => {
    const unusedVector = compileKotodamaStudioProgram(`
seiyaku UnusedVectorFeature {
  meta {
    vector: true,
  }

  hajimari() {
    info("ready");
  }
}
`);
    const forbiddenVector = compileKotodamaStudioProgram(`
seiyaku ForbiddenVectorFeature {
  meta {
    vector: false,
  }

  kotoage fn main() {
    setvl(8);
  }
}
`);

    expect(unusedVector.artifactBytes).toHaveLength(0);
    expect(unusedVector.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('meta requests vector but no vector opcodes are emitted'),
      }),
    ]);
    expect(forbiddenVector.artifactBytes).toHaveLength(0);
    expect(forbiddenVector.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('meta disables vector but vector opcodes are emitted'),
      }),
    ]);
  });

  it('supports upstream-style json! object, array, and string macros', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku JsonMacroDemo {
  kotoage fn main() permission(Admin) {
    set_account_detail(authority(), name!("cursor"), json!{ query: "sc_dummy", cursor: 1, flags: [true, false, null] });
    set_account_detail(authority(), name!("noop"), json!("1"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'main',
        permission: 'Admin',
      }),
    ]);
  });

  it('supports upstream-style domain builtins and domain! macros', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DomainOps {
  kotoage fn run() permission(Admin) {
    let domain_id = domain!("wonder.universal");
    let domain_name = name("wonder.universal");
    register_domain(domain_id);
    transfer_domain(authority(), domain_id, authority());
    transfer_domain(authority(), domain_name, authority());
    unregister_domain(domain_id);
  }
}
`);
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'run',
        permission: 'Admin',
      }),
    ]);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x12))).toBe(true);
    expect(renderedSourceText).toContain('TRANSFER_DOMAIN');
  });

  it('rejects static DomainId literals without dataspace through the SDK package boundary', () => {
    const invalidConstructor = compileKotodamaStudioProgram(`
seiyaku InvalidDomainConstructor {
  kotoage fn run() permission(Admin) {
    let domain_id = domain("wonderland");
    info(1);
  }
}
`);
    const invalidTransferName = compileKotodamaStudioProgram(`
seiyaku InvalidDomainTransferName {
  kotoage fn run() permission(Admin) {
    let domain_name = name("wonderland");
    transfer_domain(authority(), domain_name, authority());
  }
}
`, { mode: 'test' });
    const invalidPaddedConstructor = compileKotodamaStudioProgram(`
seiyaku InvalidPaddedDomainConstructor {
  kotoage fn run() permission(Admin) {
    let domain_id = domain_id(" wonderland.public ");
    info(1);
  }
}
`);
    const invalidTriggerMatcher = compileKotodamaStudioProgram(`
seiyaku InvalidDomainTriggerMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain created {
      domain "wonderland";
    }
  }
}
`);
    const invalidPaddedTriggerMatcher = compileKotodamaStudioProgram(`
seiyaku InvalidPaddedDomainTriggerMatcher {
  kotoage fn run() {}

  register_trigger wake {
    call run;
    on data domain created {
      domain " wonderland.public ";
    }
  }
}
`);
    const validRuntimeName = compileKotodamaStudioProgram(`
seiyaku ValidRuntimeDomainName {
  kotoage fn run(domain_name: Name) permission(Admin) {
    transfer_domain(authority(), domain_name, authority());
  }
}
`, { mode: 'test' });

    expect(invalidConstructor.artifactBytes).toHaveLength(0);
    expect(invalidConstructor.diagnostics).toHaveLength(1);
    expect(invalidConstructor.diagnostics[0]?.message).toContain('invalid DomainId literal `wonderland`');
    expect(invalidTransferName.artifactBytes).toHaveLength(0);
    expect(invalidTransferName.diagnostics).toHaveLength(1);
    expect(invalidTransferName.diagnostics[0]?.message).toContain('invalid DomainId literal `wonderland`');
    expect(invalidPaddedConstructor.artifactBytes).toHaveLength(0);
    expect(invalidPaddedConstructor.diagnostics).toHaveLength(1);
    expect(invalidPaddedConstructor.diagnostics[0]?.message).toContain(
      'invalid DomainId literal ` wonderland.public `: domain id must not contain leading or trailing whitespace',
    );
    expect(invalidTriggerMatcher.artifactBytes).toHaveLength(0);
    expect(invalidTriggerMatcher.diagnostics).toHaveLength(1);
    expect(invalidTriggerMatcher.diagnostics[0]?.message).toContain(
      'trigger `wake` has invalid `domain` matcher literal `wonderland` in `domain` data filter: domain id must use `domain.dataspace` format',
    );
    expect(invalidTriggerMatcher.diagnostics[0]?.line).toBe(8);
    expect(invalidPaddedTriggerMatcher.artifactBytes).toHaveLength(0);
    expect(invalidPaddedTriggerMatcher.diagnostics).toHaveLength(1);
    expect(invalidPaddedTriggerMatcher.diagnostics[0]?.message).toContain(
      'trigger `wake` has invalid `domain` matcher literal ` wonderland.public ` in `domain` data filter: domain id must not contain leading or trailing whitespace',
    );
    expect(validRuntimeName.diagnostics).toEqual([]);
    expect(containsBytes(validRuntimeName.artifactBytes, syscallNeedle(0x12))).toBe(true);
  });

  it('rejects non-address AssetDefinitionId literals through the SDK package boundary', () => {
    const invalidHostCall = compileKotodamaStudioProgram(`
seiyaku InvalidAssetDefinitionHostCall {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition("rose#wonderland"), 1);
  }
}
`);
    const invalidUnusedLocal = compileKotodamaStudioProgram(`
seiyaku InvalidAssetDefinitionLocal {
  kotoage fn run() permission(Admin) {
    let asset = asset_definition("rose#wonderland");
    info(1);
  }
}
`);
    const valid = compileKotodamaStudioProgram(`
seiyaku ValidAssetDefinitionAddress {
  kotoage fn run() permission(Admin) {
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    mint_asset(authority(), asset, 1);
  }
}
`);

    expect(invalidHostCall.artifactBytes).toHaveLength(0);
    expect(invalidHostCall.diagnostics).toHaveLength(1);
    expect(invalidHostCall.diagnostics[0]?.message).toContain('invalid AssetDefinitionId literal `rose#wonderland`');
    expect(invalidUnusedLocal.artifactBytes).toHaveLength(0);
    expect(invalidUnusedLocal.diagnostics).toHaveLength(1);
    expect(invalidUnusedLocal.diagnostics[0]?.message).toContain('invalid AssetDefinitionId literal `rose#wonderland`');
    expect(valid.diagnostics).toEqual([]);
    expect(containsBytes(valid.artifactBytes, syscallNeedle(0x22))).toBe(true);
  });

  it('mirrors Rust json macro key parsing through the SDK package boundary', () => {
    const invalidReservedKey = compileKotodamaStudioProgram(`
seiyaku InvalidJsonReservedKey {
  kotoage fn run() {
    let payload = json!{ meta: "ok" };
    info(1);
  }
}
`);
    const invalidThisKey = compileKotodamaStudioProgram(`
seiyaku InvalidJsonThisKey {
  kotoage fn run() {
    let payload = json!{ this: 1 };
    info(1);
  }
}
`);
    const invalidFnKey = compileKotodamaStudioProgram(`
seiyaku InvalidJsonFnKey {
  kotoage fn run() {
    let payload = json!{ fn: 1 };
    info(1);
  }
}
`);
    const invalidReturnKey = compileKotodamaStudioProgram(`
seiyaku InvalidJsonReturnKey {
  kotoage fn run() {
    let payload = json!{ return: 1 };
    info(1);
  }
}
`);
    const invalidDuplicateKey = compileKotodamaStudioProgram(`
seiyaku InvalidJsonDuplicateKey {
  kotoage fn run() {
    let payload = json!{ foo: 1, foo: 2 };
    info(1);
  }
}
`);
    const invalidTrailingObjectComma = compileKotodamaStudioProgram(`
seiyaku InvalidJsonTrailingObjectComma {
  kotoage fn run() {
    let payload = json!{ ok: true, };
    info(1);
  }
}
`);
    const invalidTrailingArrayComma = compileKotodamaStudioProgram(`
seiyaku InvalidJsonTrailingArrayComma {
  kotoage fn run() {
    let payload = json![1, 2, ];
    info(1);
  }
}
`);
    const invalidNegativeBoolean = compileKotodamaStudioProgram(`
seiyaku InvalidJsonNegativeBoolean {
  kotoage fn run() {
    let payload = json!{ ok: -true };
    info(1);
  }
}
`);
    const invalidBangWithoutParen = compileKotodamaStudioProgram(`
seiyaku InvalidJsonBangWithoutParen {
  kotoage fn run() {
    let payload = json!42;
    info(1);
  }
}
`);
    const invalidBangStringWithoutParen = compileKotodamaStudioProgram(`
seiyaku InvalidJsonBangStringWithoutParen {
  kotoage fn run() {
    let payload = json!"x";
    info(1);
  }
}
`);
    const invalidPositiveOverflow = compileKotodamaStudioProgram(`
seiyaku InvalidJsonPositiveOverflow {
  kotoage fn run() {
    let payload = json!{ value: 9223372036854775808 };
    info(1);
  }
}
`);
    const invalidNegativeOverflow = compileKotodamaStudioProgram(`
seiyaku InvalidJsonNegativeOverflow {
  kotoage fn run() {
    let payload = json!{ value: -9223372036854775809 };
    info(1);
  }
}
`);
    const invalidDecimal = compileKotodamaStudioProgram(`
seiyaku InvalidJsonDecimal {
  kotoage fn run() {
    let payload = json!{ value: 1.5 };
    info(1);
  }
}
`);
    const invalidNegativeDecimal = compileKotodamaStudioProgram(`
seiyaku InvalidJsonNegativeDecimal {
  kotoage fn run() {
    let payload = json!{ value: -1.5 };
    info(1);
  }
}
`);
    const validI64Bounds = compileKotodamaStudioProgram(`
seiyaku ValidJsonI64Bounds {
  kotoage fn run() {
    let payload = json!{ min: -9223372036854775808, max: 9223372036854775807 };
    info(1);
  }
}
`);
    const validQuotedReservedKey = compileKotodamaStudioProgram(`
seiyaku ValidJsonQuotedReservedKey {
  kotoage fn run() {
    let payload = json!{ "meta": "ok", null: 1 };
    info(1);
  }
}
`);

    expect(invalidReservedKey.artifactBytes).toHaveLength(0);
    expect(invalidReservedKey.diagnostics).toHaveLength(1);
    expect(invalidReservedKey.diagnostics[0]?.message).toBe('parser error: {error}: expected json! object keys must be identifiers or string literals but found Meta');
    expect(invalidThisKey.diagnostics[0]?.message).toBe('parser error: {error}: expected json! object keys must be identifiers or string literals but found This');
    expect(invalidFnKey.diagnostics[0]?.message).toBe('parser error: {error}: expected json! object keys must be identifiers or string literals but found Fn');
    expect(invalidReturnKey.diagnostics[0]?.message).toBe('parser error: {error}: expected json! object keys must be identifiers or string literals but found Return');
    expect(invalidDuplicateKey.artifactBytes).toHaveLength(0);
    expect(invalidDuplicateKey.diagnostics).toHaveLength(1);
    expect(invalidDuplicateKey.diagnostics[0]?.message).toContain('duplicate key in `json!{}` object literal');
    expect(invalidTrailingObjectComma.diagnostics[0]?.message).toBe('parser error: {error}: expected json! object keys must be identifiers or string literals but found RBrace');
    expect(invalidTrailingArrayComma.diagnostics[0]?.message).toBe('parser error: {error}: expected unsupported value in `json!{}` macro but found RBracket');
    expect(invalidNegativeBoolean.diagnostics[0]?.message).toBe("parser error: {error}: expected expected number after '-' in json! literal but found True");
    expect(invalidBangWithoutParen.diagnostics[0]?.message).toBe('parser error: expected LParen but found Number(42)');
    expect(invalidBangStringWithoutParen.diagnostics[0]?.message).toBe('parser error: expected LParen but found String("x")');
    expect(invalidPositiveOverflow.diagnostics[0]?.message).toBe('parser error: {error}: integer literal out of range (max 9223372036854775807)');
    expect(invalidNegativeOverflow.diagnostics[0]?.message).toBe('parser error: {error}: integer literal out of range (min -9223372036854775808)');
    expect(invalidDecimal.diagnostics[0]?.message).toBe('parser error: {error}: expected unsupported value in `json!{}` macro but found Decimal("1.5")');
    expect(invalidNegativeDecimal.diagnostics[0]?.message).toBe('parser error: {error}: expected expected number after \'-\' in json! literal but found Decimal("1.5")');
    expect(validQuotedReservedKey.diagnostics).toEqual([]);
    expect(validI64Bounds.diagnostics).toEqual([]);
  });

  it('mirrors Rust prelude macro parser diagnostics through the SDK package boundary', () => {
    const unknownMacro = compileKotodamaStudioProgram(`
seiyaku UnknownPreludeMacro {
  kotoage fn run() {
    let value = foo!("x");
    info(1);
  }
}
`);
    const invalidArgCount = compileKotodamaStudioProgram(`
seiyaku InvalidPreludeMacroArgCount {
  kotoage fn run() {
    let value = name!("a", "b");
    info(1);
  }
}
`);
    const invalidArgType = compileKotodamaStudioProgram(`
seiyaku InvalidPreludeMacroArgType {
  kotoage fn run() {
    let value = name!(1);
    info(1);
  }
}
`);
    const invalidNoParen = compileKotodamaStudioProgram(`
seiyaku InvalidPreludeMacroNoParen {
  kotoage fn run() {
    let value = name!"x";
    info(1);
  }
}
`);
    const valid = compileKotodamaStudioProgram(`
seiyaku ValidPreludeMacro {
  kotoage fn run() {
    let value = name!("x");
    info(1);
  }
}
`);

    expect(unknownMacro.diagnostics[0]?.message).toBe('parser error: {error}: expected unknown macro; supported prelude macros: account!, account_id!, asset_definition!, asset_id!, domain!, domain_id!, name!, json!, nft_id!, blob!, norito_bytes! but found Ident("foo")');
    expect(invalidArgCount.diagnostics[0]?.message).toBe('parser error: {error}: expected prelude macro expects a single string literal argument but found Ident("name")');
    expect(invalidArgType.diagnostics[0]?.message).toBe('parser error: {error}: expected prelude macro expects a string literal argument but found Ident("name")');
    expect(invalidNoParen.diagnostics[0]?.message).toBe('parser error: {error}: expected LParen but found String("x")');
    expect(valid.diagnostics).toEqual([]);
  });

  it('injects first-release prelude helpers through the SDK package boundary', () => {
    const amountHelpers = compileKotodamaStudioProgram(`
seiyaku PreludeAmountHelpers {
  kotoage fn fee_quote() -> int {
    return checked_sub_amount(checked_add_amount(bps_fee(10000, 25), 10), 5);
  }
}
`);
    const ownerHelper = compileKotodamaStudioProgram(`
seiyaku PreludeOwnerHelper {
  kotoage fn run(owner: AccountId) permission(Admin) {
    require_owner(owner);
  }
}
`);
    const signedJsonHelpers = compileKotodamaStudioProgram(`
seiyaku PreludeSignedJsonHelpers {
  kotoage fn amount(payload: bytes) -> int {
    let decoded = verify_signed_json(payload, payload, payload, 0);
    return require_json_int(decoded, name("amount"));
  }
}
`);

    expect(amountHelpers.diagnostics).toEqual([]);
    expect(amountHelpers.artifactBytes.length).toBeGreaterThan(0);
    expect(amountHelpers.manifest?.entrypoints.find((entry) => entry.name === 'fee_quote')?.return_type).toBe('int');
    expect(ownerHelper.diagnostics).toEqual([]);
    expect(ownerHelper.artifactBytes.length).toBeGreaterThan(0);
    expect(signedJsonHelpers.diagnostics).toEqual([]);
    expect(signedJsonHelpers.manifest?.entrypoints.find((entry) => entry.name === 'amount')?.return_type).toBe('int');
  });

  it('keeps user-defined prelude helper names authoritative through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PreludeUserOverride {
  fn checked_sub_amount(left: int, right: int) -> int {
    return 7;
  }

  kotoage fn fee_quote() -> int {
    return checked_sub_amount(1, 2);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.artifactBytes.length).toBeGreaterThan(0);
    expect(compiled.manifest?.entrypoints.find((entry) => entry.name === 'fee_quote')?.return_type).toBe('int');
  });

  it('treats json constructor strings as raw JSON through the SDK package boundary', () => {
    const valid = compileKotodamaStudioProgram(`
fn main() {
  let raw_object: String = "{\\"ok\\":true}";
  let raw_blob = blob("0x7b7d");
  let raw_norito = norito_bytes("0x7b7d");
  set_account_detail(authority(), name("object"), json(raw_object));
  set_account_detail(authority(), name("string"), json("\\"ok\\""));
  set_account_detail(authority(), name("blob"), json(raw_blob));
  set_account_detail(authority(), name("norito"), json(raw_norito));
}
`);
    const invalidDirect = compileKotodamaStudioProgram(`
fn main() {
  let payload = json("hello");
}
`);
    const invalidLocal = compileKotodamaStudioProgram(`
fn main() {
  let raw: String = "hello";
  set_account_detail(authority(), name("raw"), json(raw));
}
`);
    const invalidConst = compileKotodamaStudioProgram(`
const RAW: String = "hello";
fn main() {
  set_account_detail(authority(), name("raw"), json(RAW));
}
`);
    const invalidMacro = compileKotodamaStudioProgram(`
fn main() {
  set_account_detail(authority(), name("raw"), json!("hello"));
}
`);

    expect(valid.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(valid)).toContain('JSON_DECODE');
    expect(invalidDirect.diagnostics[0]?.message).toContain('invalid JSON literal `hello`');
    expect(invalidLocal.diagnostics[0]?.message).toContain('invalid JSON literal `hello`');
    expect(invalidConst.diagnostics[0]?.message).toContain('invalid JSON literal `hello`');
    expect(invalidMacro.diagnostics[0]?.message).toContain('invalid JSON literal `hello`');
  });

  it('accepts NoritoBytes in blob constructors through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BlobFromNoritoBytes {
  kotoage fn run() permission(Admin) {
    let raw = norito_bytes("0x0102");
    let wrapped = blob(raw);
    info(tlv_len(wrapped));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
  });

  it('reports blob constructors and byte literals as bytes through the SDK package boundary', () => {
    const validBytesAnnotations = compileKotodamaStudioProgram(`
seiyaku BlobConstructorBytesAnnotation {
  fn helper() {
    let ctor: bytes = blob("0x00");
    let macro_bytes: bytes = blob!("0x01");
    let literal: bytes = b"ab";
    let alias: Blob = blob("0x02");
    info(tlv_len(ctor) + tlv_len(macro_bytes) + tlv_len(literal) + tlv_len(alias));
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidConstructorAnnotation = compileKotodamaStudioProgram(`
seiyaku BlobConstructorTypeDiagnostic {
  fn helper() {
    let bad: AccountId = blob("0x00");
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);
    const invalidLiteralAnnotation = compileKotodamaStudioProgram(`
seiyaku ByteLiteralTypeDiagnostic {
  fn helper() {
    let bad: AccountId = b"ab";
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);

    expect(validBytesAnnotations.diagnostics).toEqual([]);
    for (const compiled of [invalidConstructorAnnotation, invalidLiteralAnnotation]) {
      expect(compiled.artifactBytes).toHaveLength(0);
      expect(compiled.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('type annotation mismatch: expected AccountId, got bytes'),
          line: 4,
          column: expect.any(Number),
        }),
      ]);
    }
  });

  it('accepts inline NoritoBytes in DomainId and NftId constructors through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PointerConstructorsFromInlineNorito {
  state DomainId LastDomain;
  state NftId LastNft;

  kotoage fn run() permission(Admin) {
    let domain_from_inline: DomainId = domain_id(norito_bytes("0x0102"));
    let nft_from_inline: NftId = nft_id(norito_bytes("0x0304"));
    let raw = norito_bytes("0x0506");
    let domain_from_local: DomainId = domain_id(raw);
    LastDomain = domain_from_inline;
    LastDomain = domain_from_local;
    LastNft = nft_from_inline;
    info(tlv_len(pointer_to_norito(domain_from_inline)) + tlv_len(pointer_to_norito(nft_from_inline)));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(compiled.artifactBytes, syscallNeedle(0x5e))).toBe(true);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('POINTER_FROM_NORITO');
    expect(compiled.manifest?.states).toEqual([
      { name: 'LastDomain', type_name: 'DomainId' },
      { name: 'LastNft', type_name: 'NftId' },
    ]);
  });

  it('supports upstream trigger/runtime helper builtins that were missing from the expanded parity corpus', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TriggerHelpers {
  kotoage fn run() {
    create_nfts_for_all_users();
    set_execution_depth(111);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'run',
        permission: null,
      }),
    ]);
  });

  it('supports upstream transfer V1 batch boundary helpers', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TransferBatchBoundaries {
  kotoage fn run() permission(Admin) {
    transfer_v1_batch_begin();
    transfer_v1_batch_end();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);
    expect(renderedSourceText).toContain('TRANSFER_V1_BATCH_BEGIN');
    expect(renderedSourceText).toContain('TRANSFER_V1_BATCH_END');
  });

  it('supports upstream transfer_batch tuple entries', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TransferBatch {
  kotoage fn run() permission(Admin) {
    let asset = asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    transfer_batch(
      (authority(), authority(), asset, 7),
      (authority(), authority(), asset, 3)
    );
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);
    expect(renderedSourceText).toContain('TRANSFER_V1_BATCH_BEGIN');
    expect(renderedSourceText).toContain('TRANSFER_ASSET');
    expect(renderedSourceText).toContain('TRANSFER_V1_BATCH_END');
  });

  it('supports upstream AXT pointer constructors and syscalls', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AxtIntrinsics {
  kotoage fn run() permission(Admin) {
    let ds = dataspace_id("7");
    let desc = axt_descriptor(norito_bytes("0x00"));
    let handle = asset_handle(norito_bytes("0x00"));
    let proof = proof_blob(norito_bytes("0x00"));
    axt_begin(desc);
    axt_touch(ds, norito_bytes("manifest"));
    axt_touch(ds);
    verify_ds_proof(ds, proof);
    verify_ds_proof(ds);
    use_asset_handle(handle, norito_bytes("intent"), proof);
    use_asset_handle(handle, norito_bytes("intent"));
    axt_commit();
  }
}
`, { mode: 'test' });

    expect(compiled.diagnostics).toEqual([]);
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);
    expect(renderedSourceText).toContain('AXT_BEGIN');
    expect(renderedSourceText).toContain('AXT_TOUCH');
    expect(renderedSourceText).toContain('VERIFY_DS_PROOF');
    expect(renderedSourceText).toContain('USE_ASSET_HANDLE');
    expect(renderedSourceText).toContain('AXT_COMMIT');
    const runBudget = compiled.budgetReport.find((entry) => entry.function_name === 'run');
    expect({
      bytecode_bytes: runBudget?.bytecode_bytes,
      frame_bytes: runBudget?.frame_bytes,
    }).toEqual({
      bytecode_bytes: 1172,
      frame_bytes: 48,
    });
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).toBe(false);
    expect(compiled.manifest?.entrypoints[0]?.access_hints_skipped).toEqual([
      'opaque ISI access is not compiler-resolved',
    ]);
    expect(readU32LE(compiled.artifactBytes, 21)).toBe(231);
    expect(compiled.artifactBytes).toHaveLength(1697);
    const code = readArtifactCode(compiled.artifactBytes);
    expect(containsBytes(code, ivmWordNeedle(0x20, 12, 10, 0))).toBe(false);
    expect(containsBytes(code, ivmWordNeedle(0x20, 13, 10, 0))).toBe(false);
    expect(containsBytes(code, ivmWordNeedle(0x20, 10, 12, 0))).toBe(false);
  });

  it('supports AXT pointer durable state keys and values through the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AxtState {
  state HandlesByDescriptor: Map<AxtDescriptor, AssetHandle>;
  state ScoresByProof: Map<ProofBlob, int>;
  state LastDescriptor: AxtDescriptor;
  state LastHandle: AssetHandle;
  state LastProof: ProofBlob;

  kotoage fn run() permission(Admin) {
    let desc = axt_descriptor(norito_bytes("0x00"));
    let handle = asset_handle(norito_bytes("0x00"));
    let proof = proof_blob(norito_bytes("0x00"));
    HandlesByDescriptor[desc] = handle;
    ScoresByProof[proof] = 7;
    LastDescriptor = desc;
    LastHandle = HandlesByDescriptor[desc];
    LastProof = proof;
    let _score = ScoresByProof.get_or(proof, 0);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const renderedSourceText = buildRenderedSourceFromCompiled(compiled);
    expect(renderedSourceText).toContain('STATE_GET');
    expect(renderedSourceText).toContain('STATE_SET');
    expect(renderedSourceText).toContain('BUILD_PATH_KEY_NORITO');
    expect(renderedSourceText).toContain('POINTER_TO_NORITO');
    expect(renderedSourceText).toContain('POINTER_FROM_NORITO');
  });

  it('rejects invalid static DataSpaceId and AXT pointer literal strings through the SDK package boundary', () => {
    const encodedDataspace7 =
      '0x4e52543000003d41714fe9a3947921daca6132402f7a000900000000000000c5b0dbe4c15a440602080700000000000000';
    const validDataspace = compileKotodamaStudioProgram(`
seiyaku ValidDataSpaceIdPointer {
  kotoage fn run() permission(Admin) {
    let ds = dataspace_id("7");
    axt_touch(ds);
  }
}
`, { mode: 'test' });
    const validEncodedDataspace = compileKotodamaStudioProgram(`
seiyaku ValidEncodedDataSpaceIdPointer {
  kotoage fn run() permission(Admin) {
    axt_touch(dataspace_id("${encodedDataspace7}"));
  }
}
`, { mode: 'test' });
    const validBlobLikeAxt = compileKotodamaStudioProgram(`
seiyaku ValidAxtBlobLikePointers {
  kotoage fn run() permission(Admin) {
    let desc = axt_descriptor(norito_bytes("0x00"));
    let handle = asset_handle(norito_bytes("0x00"));
    let proof = proof_blob(norito_bytes("0x00"));
    axt_begin(desc);
    verify_ds_proof(dataspace_id("7"), proof);
    use_asset_handle(handle, norito_bytes("intent"));
  }
}
`, { mode: 'test' });
    const invalidDataspace = compileKotodamaStudioProgram(`
seiyaku InvalidDataSpaceIdPointer {
  kotoage fn run() permission(Admin) {
    let ds = dataspace_id("x");
    axt_touch(ds);
  }
}
`);
    const invalidDescriptor = compileKotodamaStudioProgram(`
seiyaku InvalidAxtDescriptorPointer {
  kotoage fn run() permission(Admin) {
    let desc = axt_descriptor("0x00");
    axt_begin(desc);
  }
}
`);
    const invalidHandle = compileKotodamaStudioProgram(`
seiyaku InvalidAssetHandlePointer {
  kotoage fn run() permission(Admin) {
    let handle = asset_handle("0x00");
    use_asset_handle(handle, norito_bytes("intent"));
  }
}
`);
    const invalidProof = compileKotodamaStudioProgram(`
seiyaku InvalidProofBlobPointer {
  kotoage fn run() permission(Admin) {
    let proof = proof_blob("0x00");
    verify_ds_proof(dataspace_id("7"), proof);
  }
}
`);

    expect(validDataspace.diagnostics).toEqual([]);
    const dataspaceEntry = readLiteralSectionEntries(validDataspace.artifactBytes).find((entry) => entry.typeId === 0x000a);
    expect(dataspaceEntry?.payload).toHaveLength(49);
    expect(new TextDecoder().decode(dataspaceEntry?.payload.slice(0, 4))).toBe('NRT0');
    expect(Array.from(dataspaceEntry?.payload ?? [])).toEqual(
      Array.from(hexToBytes(encodedDataspace7.slice(2)))
    );
    expect(validEncodedDataspace.diagnostics).toEqual([]);
    const encodedDataspaceEntry = readLiteralSectionEntries(validEncodedDataspace.artifactBytes).find((entry) => entry.typeId === 0x000a);
    expect(Array.from(encodedDataspaceEntry?.payload ?? [])).toEqual(
      Array.from(hexToBytes(encodedDataspace7.slice(2)))
    );
    expect(validBlobLikeAxt.diagnostics).toEqual([]);
    expect(invalidDataspace.artifactBytes).toHaveLength(0);
    expect(invalidDataspace.diagnostics[0]?.message).toContain('invalid DataSpaceId literal `x`: cannot decode');
    expect(invalidDescriptor.artifactBytes).toHaveLength(0);
    expect(invalidDescriptor.diagnostics[0]?.message).toContain('invalid AxtDescriptor literal `0x00`: cannot decode');
    expect(invalidHandle.artifactBytes).toHaveLength(0);
    expect(invalidHandle.diagnostics[0]?.message).toContain('invalid AssetHandle literal `0x00`: cannot decode');
    expect(invalidProof.artifactBytes).toHaveLength(0);
    expect(invalidProof.diagnostics[0]?.message).toContain('invalid ProofBlob literal `0x00`: cannot decode');
  });

  it('supports upstream AssetId pointer constructors and state map metadata', () => {
    const assetDefinition = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const assetId = `${assetDefinition}#${account}`;
    const scopedAssetId = `${assetId}#dataspace:7`;
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetIdPointers {
  state AssetId LastAsset;
  state Assets: Map<AssetId, AssetId>;

  kotoage fn run() permission(Admin) {
    let asset: AssetId = asset_id(${JSON.stringify(assetId)});
    let scoped: AssetId = asset_id!(${JSON.stringify(scopedAssetId)});
    let raw = norito_bytes("00");
    let from_bytes: AssetId = asset_id(raw);
    LastAsset = scoped;
    Assets[asset] = scoped;
    let stored = Assets[asset];
    LastAsset = stored;
    Assets[from_bytes] = scoped;
    info(1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(readLiteralSectionEntries(compiled.artifactBytes).some((entry) => entry.typeId === 7)).toBe(true);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('POINTER_FROM_NORITO');
    expect(compiled.manifest?.states).toEqual([
      { name: 'LastAsset', type_name: 'AssetId' },
      { name: 'Assets', type_name: 'map<AssetId, AssetId>' },
    ]);
  });

  it('rejects invalid upstream AssetId constructor arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidAssetIdPointer {
  kotoage fn run() permission(Admin) {
    let asset = asset_id(1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('asset_id expects string, matching pointer type, or Blob|bytes (NoritoBytes)'),
      }),
    ]);

    const assetDefinition = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const testnetAccount = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY, 0x0171)!;
    const invalidCases: Array<[string, RegExp]> = [
      [
        'not-asset',
        /semantic error: invalid AssetId literal `not-asset`: Asset balance bucket literal must include an account id/,
      ],
      [
        `bad#${account}`,
        /semantic error: invalid AssetId literal `bad#.*`: Asset Definition ID must contain exactly 21 decoded bytes/,
      ],
      [
        `${assetDefinition}#ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
        /semantic error: invalid AssetId literal `.*#ed0120aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`: Asset ID account is invalid/,
      ],
      [
        `${assetDefinition}#${testnetAccount}`,
        /semantic error: invalid AssetId literal `.*#test.*`: Asset ID account is invalid/,
      ],
      [
        `${assetDefinition}#${account}#bad`,
        /semantic error: invalid AssetId literal `.*#bad`: Asset ID scope must use `dataspace:<id>` when present/,
      ],
      [
        `${assetDefinition}#${account}#dataspace:x`,
        /semantic error: invalid AssetId literal `.*#dataspace:x`: Asset ID dataspace scope must be a u64/,
      ],
    ];

    for (const [literal, expectedMessage] of invalidCases) {
      const invalidLiteral = compileKotodamaStudioProgram(`
seiyaku InvalidAssetIdPointerLiteral {
  kotoage fn run() permission(Admin) {
    let asset = asset_id(${JSON.stringify(literal)});
  }
}
`);

      expect(invalidLiteral.artifactBytes).toHaveLength(0);
      expect(invalidLiteral.diagnostics).toEqual([
        expect.objectContaining({
          message: expect.stringMatching(expectedMessage),
        }),
      ]);
    }
  });

  it('rejects Json arguments for non-Json pointer constructors through the SDK package boundary', () => {
    const invalidAccount = compileKotodamaStudioProgram(`
seiyaku InvalidJsonPointerConstructor {
  fn helper() {
    let account = account_id(json!{ owner: "alice" });
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const validJson = compileKotodamaStudioProgram(`
seiyaku ValidJsonPointerConstructor {
  fn helper() {
    let payload = json(json!{ owner: "alice" });
    info(1);
  }

  kotoage fn run() permission(Admin) {
    helper();
  }
}
`);

    expect(invalidAccount.artifactBytes).toHaveLength(0);
    expect(invalidAccount.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('account_id expects string, matching pointer type, or Blob|bytes (NoritoBytes)'),
      }),
    ]);
    expect(validJson.diagnostics).toEqual([]);
  });

  it('supports upstream NftId pointer state and map metadata', () => {
    const nftId = 'n0$wonderland.universal';
    const compiled = compileKotodamaStudioProgram(`
seiyaku NftIdPointers {
  state NftId LastNft;
  state Nfts: Map<NftId, NftId>;

  kotoage fn run() permission(Admin) {
    let nft: NftId = nft_id!(${JSON.stringify(nftId)});
    let raw = norito_bytes!("00");
    let from_bytes: NftId = nft_id(raw);
    LastNft = nft;
    Nfts[nft] = nft;
    let current = LastNft;
    let stored = Nfts[nft];
    LastNft = stored;
    Nfts[from_bytes] = current;
    info(1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(readLiteralSectionEntries(compiled.artifactBytes).some((entry) => entry.typeId === 5)).toBe(true);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('POINTER_FROM_NORITO');
    expect(compiled.manifest?.states).toEqual([
      { name: 'LastNft', type_name: 'NftId' },
      { name: 'Nfts', type_name: 'map<NftId, NftId>' },
    ]);
  });

  it('supports the upstream block_height sysvar builtin', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku BlockHeightSysvar {
  view fn height() -> int {
    return block_height();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'height',
        kind: VIEW_MANIFEST_KIND,
        return_type: 'int',
      }),
    ]);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('system 0x10021 ; SYSVAR_BLOCK_HEIGHT');
  });

  it('supports extended runtime sysvar helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RuntimeSysvars {
  view fn time() -> int {
    return block_time_ms();
  }

  view fn chain() -> bytes {
    return chain_id();
  }

  view fn contract() -> bytes {
    return contract_address();
  }

  view fn current_entrypoint() -> bytes {
    return entrypoint();
  }

  view fn caller() -> AccountId {
    return sysvar_authority();
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints.map((entry) => [entry.name, entry.return_type])).toEqual([
      ['time', 'int'],
      ['chain', 'bytes'],
      ['contract', 'bytes'],
      ['current_entrypoint', 'bytes'],
      ['caller', 'AccountId'],
    ]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('system 0x10022 ; SYSVAR_BLOCK_TIME_MS');
    expect(rendered).toContain('system 0x10020 ; SYSVAR_CHAIN_ID');
    expect(rendered).toContain('system 0x10024 ; SYSVAR_CONTRACT_ADDRESS');
    expect(rendered).toContain('system 0x10025 ; SYSVAR_ENTRYPOINT');
    expect(rendered).toContain('system 0x10023 ; SYSVAR_AUTHORITY');
  });

  it('supports extended Norito query execution through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ExtendedQuery {
  view fn query() -> bytes {
    let response = query_execute_norito(norito_bytes(b"query"));
    return response;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      name: 'query',
      kind: VIEW_MANIFEST_KIND,
      return_type: 'bytes',
    }));
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('system 0x10000 ; QUERY_EXECUTE_NORITO');
  });

  it('supports typed direct query helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku TypedQueryHelpers {
  view fn read() -> bytes {
    let account = query_get_account(sysvar_authority());
    let asset = query_get_asset(norito_bytes(b"asset"));
    let definition = query_get_asset_definition(asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"));
    let domain = query_get_domain(domain("wonderland.universal"));
    let nft = query_get_nft(nft_id("n0$wonderland.universal"));
    let parameter = query_get_parameter(name("block.max_transactions"));
    let manifest = query_get_contract_manifest(norito_bytes(b"hash"));
    let instance = query_get_contract_instance(name("router::universal"));
    info(tlv_len(account));
    info(tlv_len(asset));
    info(tlv_len(definition));
    info(tlv_len(domain));
    info(tlv_len(nft));
    info(tlv_len(parameter));
    info(tlv_len(manifest));
    return instance;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('system 0x10001 ; QUERY_GET_ACCOUNT');
    expect(rendered).toContain('system 0x10002 ; QUERY_GET_ASSET');
    expect(rendered).toContain('system 0x10003 ; QUERY_GET_ASSET_DEFINITION');
    expect(rendered).toContain('system 0x10004 ; QUERY_GET_DOMAIN');
    expect(rendered).toContain('system 0x10005 ; QUERY_GET_NFT');
    expect(rendered).toContain('system 0x10006 ; QUERY_GET_PARAMETER');
    expect(rendered).toContain('system 0x10007 ; QUERY_GET_CONTRACT_MANIFEST');
    expect(rendered).toContain('system 0x10008 ; QUERY_GET_CONTRACT_INSTANCE');
  });

  it('derives exact access hints for static typed direct query keys through the reusable SDK', () => {
    const publicKey = 'ed01200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey);
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';

    expect(account).not.toBeNull();
    const asset = `${assetDefinition}#${account}`;
    const compiled = compileKotodamaStudioProgram(`
seiyaku TypedQueryAccess {
  view fn read() -> bytes {
    let account = query_get_account(sysvar_authority());
    let asset = query_get_asset(asset_id("${asset}"));
    let definition = query_get_asset_definition(asset_definition("${assetDefinition}"));
    let domain = query_get_domain(domain("wonderland.universal"));
    let nft = query_get_nft(nft_id("n0$wonderland.universal"));
    info(tlv_len(account));
    info(tlv_len(asset));
    info(tlv_len(definition));
    info(tlv_len(domain));
    return nft;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [
        'account:$authority',
        `asset:${asset}`,
        `account:${account}`,
        `asset_def:${assetDefinition}`,
        'domain:wonderland.universal',
        'nft',
        'nft:n0$wonderland.universal',
      ],
      write_keys: [],
      access_hints_complete: true,
      access_hints_skipped: [],
    }));
  });

  it('supports account balance query helpers through the reusable SDK', () => {
    const publicKey = 'ed01200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
    const account = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(publicKey);
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';

    expect(account).not.toBeNull();
    const compiled = compileKotodamaStudioProgram(`
seiyaku AccountBalanceQuery {
  view fn read() -> Balance {
    let account = account_id("${account}");
    let asset = asset_definition("${assetDefinition}");
    return get_account_balance(account, asset);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(compiled)).toContain('scall 0xf9 ; GET_ACCOUNT_BALANCE');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [
        `asset:${assetDefinition}#${account}`,
        `account:${account}`,
        `asset_def:${assetDefinition}`,
      ],
      write_keys: [],
      access_hints_complete: true,
      access_hints_skipped: [],
    }));
  });

  it('returns semantic diagnostics for invalid account balance query arguments', () => {
    const invalidAccount = compileKotodamaStudioProgram(`
seiyaku AccountBalanceInvalidAccount {
  view fn read() -> Balance {
    return get_account_balance(name("not_account"), asset_definition("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"));
  }
}
`);
    const invalidAsset = compileKotodamaStudioProgram(`
seiyaku AccountBalanceInvalidAsset {
  view fn read(account: AccountId) -> Balance {
    return get_account_balance(account, name("not_asset"));
  }
}
`);

    expect(invalidAccount.artifactBytes).toHaveLength(0);
    expect(invalidAccount.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_account_balance expects (AccountId, AssetDefinitionId)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidAsset.artifactBytes).toHaveLength(0);
    expect(invalidAsset.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_account_balance expects (AccountId, AssetDefinitionId)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports generic public input helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PublicInputHelper {
  view fn read() -> bytes {
    return get_public_input(name("proof_payload"));
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(rendered).toContain('scall 0xf1 ; GET_PUBLIC_INPUT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid public input helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidPublicInputHelper {
  view fn read() -> bytes {
    return get_public_input(1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_public_input expects (Name)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports ABI debug helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DebugHelpers {
  view fn inspect() -> int {
    debug_print(42);
    debug_log(json!{ status: "ok" });
    debug_log(blob("hello"));
    debug_log(norito_bytes("00"));
    return 1;
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0x00 ; DEBUG_PRINT');
    expect(rendered).toContain('scall 0x03 ; DEBUG_LOG');
    expect(rendered).not.toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid debug helper arguments', () => {
    const invalidPrint = compileKotodamaStudioProgram(`
seiyaku InvalidDebugPrint {
  fn run() {
    debug_print(name("not_int"));
  }
}
`);
    const invalidLog = compileKotodamaStudioProgram(`
seiyaku InvalidDebugLog {
  fn run() {
    debug_log(name("not_payload"));
  }
}
`);

    expect(invalidPrint.artifactBytes).toHaveLength(0);
    expect(invalidPrint.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('debug_print expects (int value)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidLog.artifactBytes).toHaveLength(0);
    expect(invalidLog.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('debug_log expects (Json|Blob|bytes payload)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports privacy and output helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku PrivacyOutputHelpers {
  kotoage fn run() permission(Admin) {
    let secret = get_private_input(0);
    use_nullifier(secret);
    commit_output();
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xfd ; GET_PRIVATE_INPUT');
    expect(rendered).toContain('scall 0xfb ; USE_NULLIFIER');
    expect(rendered).toContain('scall 0xfe ; COMMIT_OUTPUT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_complete: false,
      access_hints_skipped: ['opaque ISI access is not compiler-resolved'],
    }));
  });

  it('returns semantic diagnostics for invalid privacy and output helper arguments', () => {
    const invalidPrivateInput = compileKotodamaStudioProgram(`
seiyaku InvalidPrivateInput {
  fn run() {
    let _secret = get_private_input(name("not_index"));
  }
}
`);
    const invalidNullifier = compileKotodamaStudioProgram(`
seiyaku InvalidNullifier {
  fn run() {
    use_nullifier(name("not_nullifier"));
  }
}
`);
    const invalidCommitOutput = compileKotodamaStudioProgram(`
seiyaku InvalidCommitOutput {
  fn run() {
    commit_output(1);
  }
}
`);

    expect(invalidPrivateInput.artifactBytes).toHaveLength(0);
    expect(invalidPrivateInput.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_private_input expects (int index)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidNullifier.artifactBytes).toHaveLength(0);
    expect(invalidNullifier.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('use_nullifier expects (int nullifier)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
    expect(invalidCommitOutput.artifactBytes).toHaveLength(0);
    expect(invalidCommitOutput.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('commit_output expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports smart-contract lifecycle helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku SmartContractLifecycleHelpers {
  kotoage fn run() permission(Admin) {
    let request = norito_bytes("00");
    deactivate_contract_instance(request);
    remove_smart_contract_bytes(request);
    register_smart_contract_code(request);
    register_smart_contract_bytes(request);
    activate_contract_instance(request);
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0x43 ; DEACTIVATE_CONTRACT_INSTANCE');
    expect(rendered).toContain('scall 0x44 ; REMOVE_SMART_CONTRACT_BYTES');
    expect(rendered).toContain('scall 0x45 ; REGISTER_SMART_CONTRACT_CODE');
    expect(rendered).toContain('scall 0x46 ; REGISTER_SMART_CONTRACT_BYTES');
    expect(rendered).toContain('scall 0x47 ; ACTIVATE_CONTRACT_INSTANCE');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_complete: false,
      access_hints_skipped: ['opaque ISI access is not compiler-resolved'],
    }));
  });

  it('returns semantic diagnostics for invalid smart-contract lifecycle helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidSmartContractLifecycle {
  fn run() {
    register_smart_contract_code(name("not_request"));
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'register_smart_contract_code expects (Blob|bytes) pointer to NoritoBytes lifecycle request',
        ),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports FASTPQ batch apply helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku FastpqBatchApplyHelper {
  kotoage fn run() permission(Admin) {
    let batch = norito_bytes("00");
    transfer_v1_batch_apply(batch);
  }
}
`, { mode: 'test' });
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(rendered).toContain('scall 0x2b ; TRANSFER_V1_BATCH_APPLY');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_complete: false,
      access_hints_skipped: ['opaque ISI access is not compiler-resolved'],
    }));
  });

  it('returns semantic diagnostics for invalid FASTPQ batch apply helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidFastpqBatchApplyHelper {
  fn run() {
    transfer_v1_batch_apply(name("not_batch"));
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'transfer_v1_batch_apply expects (Blob|bytes) Norito TransferAssetBatch',
        ),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports prove_execution helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ProveExecutionHelper {
  view fn proof() -> bytes {
    return prove_execution();
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xf4 ; PROVE_EXECUTION');
    expect(rendered).not.toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid prove_execution helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidProveExecutionHelper {
  fn run() {
    let _proof = prove_execution(1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('prove_execution expects no arguments'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports grow_heap helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku GrowHeapHelper {
  view fn grow() -> int {
    return grow_heap(4096);
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xf5 ; GROW_HEAP');
    expect(rendered).not.toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid grow_heap helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidGrowHeapHelper {
  fn run() {
    let _limit = grow_heap(name("not_bytes"));
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('grow_heap expects (int bytes)'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports raw memory allocation and Merkle helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku RawMemoryMerkleHelpers {
  view fn merkle() -> int {
    let out = alloc(2048);
    let root = alloc(32);
    let path_len = get_merkle_path(out, out, root);
    let compact_len = get_merkle_compact(out, out, 16, root);
    let register_len = get_register_merkle_compact(10, out, 8, root);
    return path_len + compact_len + register_len;
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xf0 ; ALLOC');
    expect(rendered).toContain('scall 0xf7 ; GET_MERKLE_PATH');
    expect(rendered).toContain('scall 0xfa ; GET_MERKLE_COMPACT');
    expect(rendered).toContain('scall 0xff ; GET_REGISTER_MERKLE_COMPACT');
    expect(rendered).not.toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid raw memory Merkle helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidRawMemoryMerkleHelpers {
  fn run() {
    let _path = get_merkle_path(name("address"), 1);
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('get_merkle_path expects'),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports generic verify_proof helper through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku VerifyProofHelper {
  view fn check() -> int {
    let envelope = norito_bytes("00");
    if verify_proof(envelope) {
      return 1;
    }
    return 0;
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(rendered).toContain('scall 0xe0 ; INPUT_PUBLISH_TLV');
    expect(rendered).toContain('scall 0xf6 ; VERIFY_PROOF');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid generic verify_proof helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidVerifyProofHelper {
  fn run() {
    let _ok = verify_proof(name("not_envelope"));
  }
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'verify_proof expects (Blob|bytes) pointer to NoritoBytes OpenVerifyEnvelope',
        ),
        line: 4,
        column: expect.any(Number),
      }),
    ]);
  });

  it('supports read-only ZK and VRF Norito helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku ZkVrfReadHelpers {
  view fn read() -> bytes {
    let roots = zk_roots_get(norito_bytes(b"roots"));
    let tally = zk_vote_get_tally(norito_bytes(b"tally"));
    let seed = vrf_epoch_seed(norito_bytes(b"seed"));
    info(tlv_len(roots));
    info(tlv_len(tally));
    return seed;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('scall 0x64 ; ZK_ROOTS_GET');
    expect(rendered).toContain('scall 0x65 ; ZK_VOTE_GET_TALLY');
    expect(rendered).toContain('scall 0x7e ; VRF_EPOCH_SEED');
  });

  it('derives exact access hints for static ZK read requests through the reusable SDK', () => {
    const assetDefinition = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
    const rootsRequest = encodeZkRootsGetRequestLiteral(assetDefinition, 4);
    const tallyRequest = encodeZkVoteGetTallyRequestLiteral('election-1');
    const compiled = compileKotodamaStudioProgram(`
seiyaku ZkReadAccess {
  view fn read() -> bytes {
    let roots = zk_roots_get(norito_bytes("${rootsRequest}"));
    let tally = zk_vote_get_tally(norito_bytes("${tallyRequest}"));
    info(tlv_len(roots));
    return tally;
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [
        `zk_asset:${assetDefinition}`,
        'zk:election:election-1:tally',
      ],
      write_keys: [],
      access_hints_complete: true,
      access_hints_skipped: [],
    }));
  });

  it('derives exact access hints for static direct ZK instruction payloads through the reusable SDK', () => {
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}`;
    const createElection = encodeCreateElectionInstructionLiteral('election-direct');
    const submitBallot = encodeSubmitBallotInstructionLiteral('election-direct');
    const finalizeElection = encodeFinalizeElectionInstructionLiteral('election-direct');
    const unshield = encodeUnshieldInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      publicKey: SAMPLE_ED25519_PUBLIC_KEY,
      amount: 42n,
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku ZkInstructionAccess {
  kotoage fn create_election_run() permission(Admin) {
    execute_instruction(norito_bytes("${createElection}"));
  }

  kotoage fn submit_ballot_run() permission(Admin) {
    execute_instruction(norito_bytes("${submitBallot}"));
  }

  kotoage fn finalize_election_run() permission(Admin) {
    execute_instruction(norito_bytes("${finalizeElection}"));
  }

  kotoage fn unshield_run() permission(Admin) {
    execute_instruction(norito_bytes("${unshield}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'create_election_run',
        read_keys: [],
        write_keys: ['zk:election:election-direct'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'submit_ballot_run',
        read_keys: [],
        write_keys: [
          'zk:election:election-direct:ciphertexts',
          'zk:election:election-direct:nullifiers',
        ],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'finalize_election_run',
        read_keys: [],
        write_keys: ['zk:election:election-direct:tally'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'unshield_run',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset_def.detail:${definitionLiteral}:zk.unshield.last`,
          `zk_asset:${definitionLiteral}`,
        ],
        write_keys: [
          `asset:${assetLiteral}`,
          `asset_def.detail:${definitionLiteral}:zk.unshield.last`,
          `zk_asset:${definitionLiteral}`,
        ],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives ZK access from compact static direct instruction payloads through the reusable SDK', () => {
    const flags = TEST_NORITO_HEADER_FLAG_COMPACT_LEN;
    const accountLiteral = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY)!;
    const definitionLiteral = makeCanonicalAssetDefinitionLiteral(SAMPLE_ASSET_DEFINITION_BYTES);
    const assetLiteral = `${definitionLiteral}#${accountLiteral}`;
    const createElection = encodeCreateElectionInstructionLiteral('election-compact', { flags, outerFlags: flags });
    const submitBallot = encodeSubmitBallotInstructionLiteral('election-compact', { flags, outerFlags: flags });
    const finalizeElection = encodeFinalizeElectionInstructionLiteral('election-compact', { flags, outerFlags: flags });
    const unshield = encodeUnshieldInstructionLiteral({
      definitionBytes: SAMPLE_ASSET_DEFINITION_BYTES,
      publicKey: SAMPLE_ED25519_PUBLIC_KEY,
      amount: 42n,
      flags,
      outerFlags: flags,
    });

    const compiled = compileKotodamaStudioProgram(`
seiyaku CompactZkInstructionAccess {
  kotoage fn create_election_run() permission(Admin) {
    execute_instruction(norito_bytes("${createElection}"));
  }

  kotoage fn submit_ballot_run() permission(Admin) {
    execute_instruction(norito_bytes("${submitBallot}"));
  }

  kotoage fn finalize_election_run() permission(Admin) {
    execute_instruction(norito_bytes("${finalizeElection}"));
  }

  kotoage fn unshield_run() permission(Admin) {
    execute_instruction(norito_bytes("${unshield}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual([
      expect.objectContaining({
        name: 'create_election_run',
        read_keys: [],
        write_keys: ['zk:election:election-compact'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'submit_ballot_run',
        read_keys: [],
        write_keys: [
          'zk:election:election-compact:ciphertexts',
          'zk:election:election-compact:nullifiers',
        ],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'finalize_election_run',
        read_keys: [],
        write_keys: ['zk:election:election-compact:tally'],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
      expect.objectContaining({
        name: 'unshield_run',
        read_keys: [
          `asset:${assetLiteral}`,
          `account:${accountLiteral}`,
          `asset_def:${definitionLiteral}`,
          `asset_def.detail:${definitionLiteral}:zk.unshield.last`,
          `zk_asset:${definitionLiteral}`,
        ],
        write_keys: [
          `asset:${assetLiteral}`,
          `asset_def.detail:${definitionLiteral}:zk.unshield.last`,
          `zk_asset:${definitionLiteral}`,
        ],
        access_hints_complete: true,
        access_hints_skipped: [],
      }),
    ]);
  });

  it('derives aggregate access for inline ZK instruction builders through the SDK package boundary', () => {
    const sourceName = 'zk_vote_and_unshield.ko';
    const compiled = compileKotodamaStudioProgram(readUpstreamKotodamaSample(sourceName), { sourceName });
    const assetDefinition = '6pEP9RjNoZ7beWkT3pLfKoM1dyfi';
    const account = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
    const asset = `${assetDefinition}#${account}`;

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_complete: true,
    }));
    expect(compiled.manifest?.access_set_hints).toEqual({
      read_keys: [
        `account:${account}`,
        `asset:${asset}`,
        `asset_def.detail:${assetDefinition}:zk.unshield.last`,
        `asset_def:${assetDefinition}`,
        'zk:election:election-1:ciphertexts',
        'zk:election:election-1:nullifiers',
        `zk_asset:${assetDefinition}`,
      ],
      write_keys: [
        `asset:${asset}`,
        `asset_def.detail:${assetDefinition}:zk.unshield.last`,
        'zk:election:election-1:ciphertexts',
        'zk:election:election-1:nullifiers',
        `zk_asset:${assetDefinition}`,
      ],
      dynamic_reads: [],
      dynamic_writes: [],
    });
  });

  it('emits inline ZK InstructionBox literals through the SDK package boundary', () => {
    const sourceName = 'zk_vote_and_unshield.ko';
    const compiled = compileKotodamaStudioProgram(readUpstreamKotodamaSample(sourceName), { sourceName });
    const entries = readLiteralSectionEntries(compiled.artifactBytes);

    expect(compiled.diagnostics).toEqual([]);
    expect(entries.some((entry) => Buffer.from(entry.payload).toString('utf8').includes('kotodama:build_'))).toBe(false);
    expect(entries[2]?.typeId).toBe(9);
    expect(entries[2]?.payload).toHaveLength(522);
    expect(Buffer.from(entries[2]!.payload).toString('utf8').startsWith('4e525430')).toBe(true);
    expect(entries[4]?.typeId).toBe(9);
    expect(entries[4]?.payload).toHaveLength(261);
    expect(Buffer.from(entries[4]!.payload.subarray(0, 4)).toString('ascii')).toBe('NRT0');
    expect(entries[5]?.typeId).toBe(9);
    expect(entries[5]?.payload).toHaveLength(832);
    expect(Buffer.from(entries[5]!.payload).toString('utf8').startsWith('4e525430')).toBe(true);
    expect(entries[7]?.typeId).toBe(9);
    expect(entries[7]?.payload).toHaveLength(416);
    expect(Buffer.from(entries[7]!.payload.subarray(0, 4)).toString('ascii')).toBe('NRT0');
    expect(entries[12]?.typeId).toBe(1);
    expect(entries[13]?.typeId).toBe(2);
  });

  it('keeps ZK vote and unshield budget rows Rust-shaped through the SDK package boundary', () => {
    const sourceName = 'zk_vote_and_unshield.ko';
    const compiled = compileKotodamaStudioProgram(readUpstreamKotodamaSample(sourceName), { sourceName });

    expect(compiled.diagnostics).toEqual([]);
    expect(
      compiled.budgetReport.map((entry) => ({
        function_name: entry.function_name,
        pc_start: entry.pc_start,
        pc_end: entry.pc_end,
        bytecode_bytes: entry.bytecode_bytes,
        bytecode_words: entry.bytecode_words,
        frame_bytes: entry.frame_bytes,
      })),
    ).toEqual([
      { function_name: 'demo', pc_start: 0, pc_end: 1088, bytecode_bytes: 1088, bytecode_words: 272, frame_bytes: 80 },
      { function_name: 'verify_and_submit_ballot', pc_start: 1088, pc_end: 1356, bytecode_bytes: 268, bytecode_words: 67, frame_bytes: 40 },
      { function_name: 'verify_and_unshield', pc_start: 1356, pc_end: 1832, bytecode_bytes: 476, bytecode_words: 119, frame_bytes: 40 },
    ]);
  });

  it('derives empty access hints for static log payloads through the reusable SDK', () => {
    const log = encodeLogInstructionLiteral(2, 'ready');
    const compiled = compileKotodamaStudioProgram(`
seiyaku LogInstructionAccess {
  kotoage fn log_run() permission(Admin) {
    execute_instruction(norito_bytes("${log}"));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      name: 'log_run',
      read_keys: [],
      write_keys: [],
      access_hints_complete: null,
      access_hints_skipped: [],
    }));
  });

  it('supports durable state introspection helpers through the reusable SDK', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku StateIntrospection {
  kotoage fn run() permission(Admin) {
    let prefix = name("Orders");
    let keys = state_keys(prefix, 0, 2);
    let present = state_has(prefix);
    let len = state_len(prefix);
    let count = state_count(prefix);
    info(tlv_len(keys));
    if present {
      info(len);
    }
    info(count);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    expect(rendered).toContain('system 0x10030 ; STATE_KEYS');
    expect(rendered).toContain('system 0x10031 ; STATE_HAS');
    expect(rendered).toContain('system 0x10032 ; STATE_LEN');
    expect(rendered).toContain('system 0x10033 ; STATE_COUNT');
  });

  it('preserves upstream numeric aliases and emits Numeric syscalls from the SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericAliases {
  fn parsed_amount() -> Amount {
    let payload = json!{ amount: 7 };
    let amount: Amount = payload.get_numeric(name("amount"));
    let next: Amount = amount + 1;
    return next;
  }

  view fn amount(value: Amount) -> Amount {
    return value + 1;
  }

  kotoage fn run() permission(Admin) {
    let amount: Amount = parsed_amount();
    let next: Amount = amount + 1;
    if next > amount {
      info(next);
    }
  }
}
`);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.entrypoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'amount',
          return_type: 'Amount',
        }),
      ])
    );
    expect(rendered).toContain('JSON_GET_NUMERIC');
    expect(rendered).toContain('NUMERIC_FROM_INT');
    expect(rendered).toContain('NUMERIC_ADD');
    expect(rendered).toContain('NUMERIC_GT');
  });

  it('rejects invalid upstream numeric alias operations from the SDK package boundary', () => {
    const mixedAliases = compileKotodamaStudioProgram(`
seiyaku MixedAliases {
  fn helper(amount: Amount, balance: Balance) {
    let bad = amount + balance;
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const negativeAlias = compileKotodamaStudioProgram(`
seiyaku NegativeAlias {
  fn helper() {
    let amount: Amount = -1;
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(mixedAliases.artifactBytes).toHaveLength(0);
    expect(mixedAliases.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Add expects int operands'),
      }),
    ]);
    expect(negativeAlias.artifactBytes).toHaveLength(0);
    expect(negativeAlias.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('numeric alias literals must be unsigned'),
      }),
    ]);
  });

  it('supports direct codec and numeric helpers through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DirectCodecNumericHelpers {
  fn direct_helpers() -> int {
    let amount: Amount = json_get_numeric_direct(json!{ amount: 7 }, name("amount"));
    let sum: Amount = numeric_add_direct(amount, amount);
    let diff: Amount = numeric_sub_direct(sum, amount);
    let product: Amount = numeric_mul_direct(diff, amount);
    let quotient: Amount = numeric_div_direct(product, amount);
    let remainder: Amount = numeric_rem_direct(product, amount);
    let negated: Amount = numeric_neg_direct(remainder);
    let same = numeric_eq_direct(sum, sum);
    let different = numeric_ne_direct(sum, diff);
    let lower = numeric_lt_direct(diff, sum);
    let lower_or_equal = numeric_le_direct(diff, sum);
    let greater = numeric_gt_direct(sum, diff);
    let greater_or_equal = numeric_ge_direct(sum, diff);
    let nested = json_get_json_direct(json!{ nested: { ok: true } }, name("nested"));
    let label = json_get_name_direct(json!{ label: "ExampleName" }, name("label"));
    let owner = json_get_account_id_direct(json!{ owner: "alice@wonderland" }, name("owner"));
    let asset = json_get_asset_definition_id_direct(json!{ asset: "rose#wonderland" }, name("asset"));
    let nft = json_get_nft_id_direct(json!{ nft: "n0$wonderland.universal" }, name("nft"));
    let blob = json_get_blob_hex_direct(json!{ blob: "0102" }, name("blob"));
    let with_count = json_set_int_direct(json!{ count: 0 }, name("count"), json_get_int_direct(json!{ count: 3 }, name("count")));
    let with_owner = json_set_account_id_direct(with_count, name("owner"), owner);
    let path = build_path_key_norito_direct(label, blob);
    let schema = schema_info_direct(path);
    let encoded = encode_schema_direct(name("example.schema"), with_owner);
    let decoded = decode_schema_direct(name("example.schema"), encoded);
    if same && different && lower && lower_or_equal && greater && greater_or_equal {
      return numeric_to_int_direct(negated);
    }
    return json_get_int_direct(decoded, name("count"));
  }

  kotoage fn run() permission(Admin) {
    info(direct_helpers());
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const rendered = buildRenderedSourceFromCompiled(compiled);
    const directHelperLabels = [
      'JSON_GET_I64_DIRECT',
      'JSON_GET_JSON_DIRECT',
      'JSON_GET_NAME_DIRECT',
      'JSON_GET_ACCOUNT_ID_DIRECT',
      'JSON_GET_NFT_ID_DIRECT',
      'JSON_GET_BLOB_HEX_DIRECT',
      'JSON_GET_NUMERIC_DIRECT',
      'JSON_GET_ASSET_DEFINITION_ID_DIRECT',
      'JSON_SET_I64_DIRECT',
      'JSON_SET_ACCOUNT_ID_DIRECT',
      'BUILD_PATH_KEY_NORITO_DIRECT',
      'SCHEMA_INFO_DIRECT',
      'SCHEMA_ENCODE_DIRECT',
      'SCHEMA_DECODE_DIRECT',
      'NUMERIC_TO_INT_DIRECT',
      'NUMERIC_ADD_DIRECT',
      'NUMERIC_SUB_DIRECT',
      'NUMERIC_MUL_DIRECT',
      'NUMERIC_DIV_DIRECT',
      'NUMERIC_REM_DIRECT',
      'NUMERIC_NEG_DIRECT',
      'NUMERIC_EQ_DIRECT',
      'NUMERIC_NE_DIRECT',
      'NUMERIC_LT_DIRECT',
      'NUMERIC_LE_DIRECT',
      'NUMERIC_GT_DIRECT',
      'NUMERIC_GE_DIRECT',
    ];

    expect(compiled.diagnostics).toEqual([]);
    for (const syscall of [
      0x84,
      0x85,
      0x86,
      0x87,
      0x88,
      0x89,
      0x8a,
      0x8b,
      0x8c,
      0x8d,
      0x8e,
      0x8f,
      0xd0,
      0xd1,
      0xd2,
      0xd3,
      0xd4,
      0xd5,
      0xd6,
      0xd7,
      0xd8,
      0xd9,
      0xda,
      0xdb,
      0xdc,
      0xdd,
      0xde,
    ]) {
      expect(containsBytes(code, syscallNeedle(syscall))).toBe(true);
    }
    for (const label of directHelperLabels) {
      expect(rendered).toContain(label);
    }
    expect(containsBytes(code, syscallNeedle(0xe0))).toBe(false);
    expect(rendered).not.toContain('INPUT_PUBLISH_TLV');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid direct codec and numeric helper arguments', () => {
    const invalidJson = compileKotodamaStudioProgram(`
seiyaku InvalidDirectJsonHelper {
  fn helper() -> int {
    return json_get_int_direct(name("payload"), name("count"));
  }

  kotoage fn run() permission(Admin) {}
}
`);
    const invalidNumeric = compileKotodamaStudioProgram(`
seiyaku InvalidDirectNumericHelper {
  fn helper() {
    let bad = numeric_add_direct(1, 2);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(invalidJson.artifactBytes).toHaveLength(0);
    expect(invalidJson.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('json_get_int_direct expects (Json, Name)'),
      }),
    ]);
    expect(invalidNumeric.artifactBytes).toHaveLength(0);
    expect(invalidNumeric.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('numeric_add_direct expects compatible wide numeric operands'),
      }),
    ]);
  });

  it('supports regular numeric negation through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericNegHelper {
  view fn read() -> Amount {
    let value: Amount = 7;
    return numeric_neg(value);
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(code, syscallNeedle(0xe0))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0x70))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0xd8))).toBe(false);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('NUMERIC_NEG');
    expect(rendered).not.toContain('NUMERIC_NEG_DIRECT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid regular numeric negation arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidNumericNegHelper {
  fn helper() {
    let bad = numeric_neg(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('numeric_neg expects (Amount|Balance|fixed_u128)'),
      }),
    ]);
  });

  it('supports regular numeric to int conversion through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericToIntHelper {
  view fn read() -> int {
    let value: Amount = 7;
    return numeric_to_int(value);
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(code, syscallNeedle(0xe0))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0x6a))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0xd2))).toBe(false);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('NUMERIC_TO_INT');
    expect(rendered).not.toContain('NUMERIC_TO_INT_DIRECT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid regular numeric to int arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidNumericToIntHelper {
  fn helper() {
    let bad = numeric_to_int(1);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('numeric_to_int expects (Amount|Balance|fixed_u128)'),
      }),
    ]);
  });

  it('supports regular numeric binary helpers through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericBinaryHelpers {
  view fn compute() -> Amount {
    let left: Amount = 7;
    let right: Amount = 3;
    return numeric_add(left, numeric_rem(left, right));
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(code, syscallNeedle(0xe0))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0x6b))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0x6f))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0xd3))).toBe(false);
    expect(containsBytes(code, syscallNeedle(0xd7))).toBe(false);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('NUMERIC_ADD');
    expect(rendered).toContain('NUMERIC_REM');
    expect(rendered).not.toContain('NUMERIC_ADD_DIRECT');
    expect(rendered).not.toContain('NUMERIC_REM_DIRECT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('supports regular numeric comparison helpers through the reusable SDK package boundary', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku NumericCompareHelpers {
  view fn compare() -> int {
    let left: Amount = 7;
    let right: Amount = 3;
    if numeric_ge(left, right) {
      return 1;
    }
    return 0;
  }
}
`);
    const code = readArtifactCode(compiled.artifactBytes);
    const rendered = buildRenderedSourceFromCompiled(compiled);

    expect(compiled.diagnostics).toEqual([]);
    expect(containsBytes(code, syscallNeedle(0xe0))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0x76))).toBe(true);
    expect(containsBytes(code, syscallNeedle(0xde))).toBe(false);
    expect(rendered).toContain('INPUT_PUBLISH_TLV');
    expect(rendered).toContain('NUMERIC_GE');
    expect(rendered).not.toContain('NUMERIC_GE_DIRECT');
    expect(compiled.manifest?.entrypoints[0]).toEqual(expect.objectContaining({
      read_keys: [],
      write_keys: [],
      access_hints_skipped: [],
    }));
    expect(compiled.manifest?.entrypoints[0]?.access_hints_complete).not.toBe(false);
  });

  it('returns semantic diagnostics for invalid regular numeric binary helper arguments', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku InvalidNumericBinaryHelper {
  fn helper() {
    let value: Amount = 7;
    let bad = numeric_add(1, value);
  }

  kotoage fn run() permission(Admin) {}
}
`);

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('numeric_add expects compatible wide numeric operands'),
      }),
    ]);
  });

  it('matches current upstream subscription permissions and compiles escrow and zk sample contracts', () => {
    const subscriptionSamples = [
      'subscription_billing_trigger.ko',
      'subscription_usage_recorder.ko',
    ];
    for (const sourceName of subscriptionSamples) {
      const compiled = compileKotodamaStudioProgram(readUpstreamKotodamaSample(sourceName), { sourceName });
      expect(compiled.diagnostics, sourceName).toEqual([
        expect.objectContaining({
          message: 'semantic error: public function `run` calls privileged operations but is missing `permission(...)`',
        }),
      ]);
    }

    const sampleNames = [
      'threshold_escrow.ko',
      'zk_vote_and_unshield.ko',
    ];

    const compiledBySample = new Map(sampleNames.map((sourceName) => {
      const compiled = compileKotodamaStudioProgram(readUpstreamKotodamaSample(sourceName), { sourceName });
      expect(compiled.diagnostics, sourceName).toEqual([]);
      return [sourceName, compiled] as const;
    }));

    const billingCompiled = compileKotodamaStudioProgram(`
seiyaku SubscriptionBilling {
  kotoage fn run() permission(Admin) {
    subscription_bill();
  }
}
`);
    const usageCompiled = compileKotodamaStudioProgram(`
seiyaku SubscriptionUsageRecorder {
  kotoage fn run() permission(Admin) {
    subscription_record_usage();
  }
}
`);
    expect(billingCompiled.diagnostics).toEqual([]);
    expect(usageCompiled.diagnostics).toEqual([]);
    expect(buildRenderedSourceFromCompiled(billingCompiled)).toContain('SUBSCRIPTION_BILL');
    expect(buildRenderedSourceFromCompiled(usageCompiled)).toContain('SUBSCRIPTION_RECORD_USAGE');

    const zkSourceText = buildRenderedSourceFromCompiled(compiledBySample.get('zk_vote_and_unshield.ko')!);
    expect(zkSourceText).toContain('ZK_VOTE_VERIFY_BALLOT');
    expect(zkSourceText).toContain('ZK_VERIFY_UNSHIELD');
    expect(zkSourceText).toContain('SMARTCONTRACT_EXECUTE_INSTRUCTION');
  });

  it('emits direct debug entries for no-argument public entrypoints', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku WrappedEntrypoint {
  kotoage fn run() permission(Admin) {
    set_account_detail(authority(), name!("probe"), json!("\\"ok\\""));
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.sourceMap).toEqual([
      expect.objectContaining({
        function_name: 'run',
        pc_start: 0,
        line: 3,
        column: 14,
      }),
    ]);
    expect(compiled.budgetReport).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'run',
        pc_start: 0,
        bytecode_bytes: expect.any(Number),
      }),
    ]));
  });

  it('tracks direct budget rows for the smallest no-argument trigger helpers', () => {
    const createCompiled = compileKotodamaStudioProgram(`
seiyaku CreateNftForEveryUser {
  kotoage fn run() {
    create_nfts_for_all_users();
  }
}
`);
    const createRun = createCompiled.budgetReport.find((entry) => entry.function_name === 'run');
    expect(createCompiled.diagnostics).toEqual([]);
    expect(createRun).toEqual(expect.objectContaining({
      pc_start: 0,
      bytecode_bytes: expect.any(Number),
      frame_bytes: expect.any(Number),
    }));

    const catCompiled = compileKotodamaStudioProgram(`
seiyaku TriggerCatAndMouse {
  kotoage fn run() {
    set_execution_depth(111);
  }
}
`);
    const catRun = catCompiled.budgetReport.find((entry) => entry.function_name === 'run');
    expect(catCompiled.diagnostics).toEqual([]);
    expect(catRun).toEqual(expect.objectContaining({
      pc_start: 0,
      bytecode_bytes: expect.any(Number),
      frame_bytes: expect.any(Number),
    }));
  });

  it('tracks direct budget rows for zero-amount authority mint triggers', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku MintRoseTrigger {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("66owaQmAQMuHxPzxUN3bqZ6FJfDa"), 0);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'run',
        pc_start: 0,
        bytecode_bytes: expect.any(Number),
      }),
    ]));
  });

  it('omits embedded DBG1 metadata from chain artifact bytes by default', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku DebugSection {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const sectionMagic = new TextDecoder().decode(compiled.artifactBytes.slice(17, 21));
    const contractPayloadLength = readU32LE(compiled.artifactBytes, 21);
    const nextSectionOffset = 17 + 8 + contractPayloadLength;
    const nextSectionMagic = new TextDecoder().decode(compiled.artifactBytes.slice(nextSectionOffset, nextSectionOffset + 4));

    expect(sectionMagic).toBe('CNTR');
    expect(nextSectionMagic).not.toBe('DBG1');
    expect(compiled.sourceMap).toHaveLength(1);
    expect(compiled.budgetReport).toHaveLength(1);
  });

  it('encodes wrapped impl returns with the upstream jalr opcode', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku WrappedReturn {
  kotoage fn run(amount: int) permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), amount);
  }
}
`);

    expect(compiled.diagnostics).toEqual([]);

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });
    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });

    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });

    expect(view).not.toBeNull();
    expect(view?.rendered_source_text).toContain('jalr r0, r1, 0');
  });

  it('reuses the temp register window across repeated host-call statements', () => {
    const single = compileKotodamaStudioProgram(`
seiyaku MintOnce {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1);
  }
}
`);
    const repeated = compileKotodamaStudioProgram(`
seiyaku MintMany {
  kotoage fn run() permission(Admin) {
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 1);
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 2);
    mint_asset(authority(), asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM"), 3);
  }
}
`);

    const singleRun = single.budgetReport.find((entry) => entry.function_name === 'run');
    const repeatedRun = repeated.budgetReport.find((entry) => entry.function_name === 'run');

    expect(single.diagnostics).toEqual([]);
    expect(repeated.diagnostics).toEqual([]);
    expect(singleRun).toEqual(expect.objectContaining({
      frame_bytes: expect.any(Number),
    }));
    expect(repeatedRun).toEqual(expect.objectContaining({
      frame_bytes: singleRun?.frame_bytes,
      bytecode_bytes: expect.any(Number),
    }));
    expect(repeatedRun?.bytecode_bytes).toBeGreaterThan(singleRun?.bytecode_bytes ?? 0);
  });

  it('reclaims dead local registers between statements before later asset operations', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetOps {
  kotoage fn execute() permission(Admin) {
    let alice = authority();
    let bob = authority();
    let coin = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    mint_asset(alice, coin, 1000);
    transfer_asset(alice, bob, coin, 500);
    burn_asset(bob, coin, 100);
  }
}
`, {
      sourceName: 'crates/kotodama_lang/src/samples/asset_ops.ko',
    });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.budgetReport.find((entry) => entry.function_name === 'execute')).toEqual(
      expect.objectContaining({
        bytecode_bytes: expect.any(Number),
        frame_bytes: expect.any(Number),
        jump_span_words: expect.any(Number),
      })
    );
  });

  it('emits direct debug rows for statement-form asset builtins', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AssetOps {
  kotoage fn execute() permission(Admin) {
    let alice = authority();
    let bob = authority();
    let coin = asset_definition!("62Fk4FPcMuLvW5QjDGNF2a4jAmjM");
    mint_asset(alice, coin, 1000);
    transfer_asset(alice, bob, coin, 500);
    burn_asset(bob, coin, 100);
  }
}
`, {
      sourceName: 'crates/kotodama_lang/src/samples/asset_ops.ko',
    });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.sourceMap.find((entry) => entry.function_name === 'execute')).toEqual(expect.objectContaining({
      function_name: 'execute',
      pc_start: 0,
      source_path: 'crates/kotodama_lang/src/samples/asset_ops.ko',
      line: 3,
      column: 14,
    }));
    expect(compiled.budgetReport.find((entry) => entry.function_name === 'execute')).toEqual(expect.objectContaining({
      function_name: 'execute',
      pc_start: 0,
      bytecode_bytes: expect.any(Number),
      jump_range_risk: false,
      source_path: 'crates/kotodama_lang/src/samples/asset_ops.ko',
      line: 3,
      column: 14,
    }));
  });

  it('compiles authority-probe-style published local pointer flows deterministically', () => {
    const compiled = compileKotodamaStudioProgram(`
seiyaku AuthorityProbe {
  meta { abi_version: 1 }

  kotoage fn main() permission(Admin) {
    let caller = authority();
    let alice = account!("sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB");
    let key = name!("authority_probe");

    if (caller == alice) {
      set_account_detail(caller, key, json!{ match: "alice" });
      return;
    }

    set_account_detail(caller, key, json!{ match: "other" });
  }
}
`, {
      sourceName: 'authority_probe.ko',
    });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.sourceMap.find((entry) => entry.function_name === 'main')).toEqual(expect.objectContaining({
      function_name: 'main',
      pc_start: 0,
      source_path: 'authority_probe.ko',
      line: 5,
      column: 14,
    }));
    expect(compiled.budgetReport.find((entry) => entry.function_name === 'main')).toEqual(expect.objectContaining({
      function_name: 'main',
      pc_start: 0,
      bytecode_bytes: expect.any(Number),
      jump_range_risk: false,
      source_path: 'authority_probe.ko',
      line: 5,
      column: 14,
    }));

    const registerBytesInstruction = makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: compiled.codeHashHex,
            code: encodeBase64(compiled.artifactBytes),
          },
        },
      },
    });
    const manifestInstruction = makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest: compiled.manifest,
          },
        },
      },
    });
    const view = buildLocalContractCodeView({
      instruction: registerBytesInstruction,
      relatedInstructions: [manifestInstruction],
    });
    expect(view?.rendered_source_text).not.toContain('JSON_GET_ACCOUNT_ID');
    expect(view?.rendered_source_text).not.toContain('NAME_DECODE');

    const literalEntries = readLiteralSectionEntries(compiled.artifactBytes);
    expect(literalEntries.map((entry) => ({ typeId: entry.typeId, length: entry.payload.length }))).toEqual([
      { typeId: 1, length: 119 },
      { typeId: 3, length: 56 },
      { typeId: 4, length: 59 },
      { typeId: 4, length: 59 },
    ]);
    expect(Buffer.from(literalEntries[0]!.payload).toString('hex')).toContain('000000004a210000000000000001');
    expect(Buffer.from(literalEntries[1]!.payload).toString('hex')).toContain(Buffer.from(encodeUtf8('authority_probe')).toString('hex'));
    expect(Buffer.from(literalEntries[2]!.payload).toString('hex')).toContain(Buffer.from(encodeUtf8('{"match":"alice"}')).toString('hex'));
    expect(Buffer.from(literalEntries[3]!.payload).toString('hex')).toContain(Buffer.from(encodeUtf8('{"match":"other"}')).toString('hex'));
  });

  it('returns line-aware diagnostics for invalid Studio source', () => {
    const compiled = compileKotodamaStudioProgram('seiyaku Demo { @ }');

    expect(compiled.artifactBytes).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unexpected character'),
        line: 1,
        column: expect.any(Number),
      }),
    ]);
  });
});
