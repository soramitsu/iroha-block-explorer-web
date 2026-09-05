import { blake3 } from '@noble/hashes/blake3.js';
import { normalizeIrohaHash32 } from './iroha-hash';

const DOMAIN_SEPARATOR = new TextEncoder().encode('defi-oracle-attestation-v1');
const CANONICAL_HASH_LITERAL = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const CANONICAL_U64 = /^(?:0|[1-9]\d*)$/u;
const MAX_U32 = 0xffff_ffff;
const MAX_U64 = (1n << 64n) - 1n;
const POSITIVE_I64_MASK = (1n << 63n) - 1n;

export interface DefiOracleAttestationHashSource {
  feedId: string;
  slot: string;
  requestHash: string;
  field: string;
}

export interface DefiOracleAttestationHashInput {
  domain: number;
  subjectId: string;
  oracleSlot: string;
  statusFlags: number;
  sourceEvents: readonly DefiOracleAttestationHashSource[];
}

function encodeU32LittleEndian(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U32) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function encodeU64LittleEndian(value: string, label: string): Uint8Array {
  if (!CANONICAL_U64.test(value)) {
    throw new RangeError(`${label} must be a canonical unsigned 64-bit decimal integer`);
  }
  const integer = BigInt(value);
  if (integer > MAX_U64) {
    throw new RangeError(`${label} must be a canonical unsigned 64-bit decimal integer`);
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, integer, true);
  return bytes;
}

function decodeCanonicalHash(value: string): Uint8Array {
  if (!CANONICAL_HASH_LITERAL.test(value)) {
    throw new TypeError('requestHash must be canonical Norito Hash text');
  }
  const hex = normalizeIrohaHash32(value);
  if (hex === null) {
    throw new TypeError('requestHash must be a checksum-valid marked Iroha Hash');
  }
  return Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

/** Mirror signed-Iroha's deterministic hash for source-backed DeFi oracle attestations. */
export function deriveDefiOracleAttestationHash(input: DefiOracleAttestationHashInput): string {
  const encoder = new TextEncoder();
  const hasher = blake3.create();
  hasher.update(DOMAIN_SEPARATOR);
  hasher.update(encodeU32LittleEndian(input.domain, 'domain'));
  hasher.update(encodeU64LittleEndian(input.subjectId, 'subjectId'));
  hasher.update(encodeU64LittleEndian(input.oracleSlot, 'oracleSlot'));
  hasher.update(encodeU32LittleEndian(input.statusFlags, 'statusFlags'));
  for (const [index, source] of input.sourceEvents.entries()) {
    hasher.update(encoder.encode(source.feedId));
    hasher.update(encodeU64LittleEndian(source.slot, `sourceEvents[${index}].slot`));
    hasher.update(decodeCanonicalHash(source.requestHash));
    hasher.update(encoder.encode(source.field));
  }

  const digest = hasher.digest();
  const truncated = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, true);
  const positive = truncated & POSITIVE_I64_MASK;
  return (positive === 0n ? 1n : positive).toString(10);
}
