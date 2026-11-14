import { normalizeAccountIdLiteral } from './account-literal';
import { blake3 } from '@noble/hashes/blake3.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const ASSET_DEFINITION_ADDRESS_VERSION = 1;
const ASSET_DEFINITION_ADDRESS_LEN = 21;
const ASSET_DEFINITION_UUID_VERSION_INDEX = 7;
const ASSET_DEFINITION_UUID_VARIANT_INDEX = 9;
const MAX_UINT64 = (1n << 64n) - 1n;
const DATASPACE_SCOPE_RE = /^dataspace:(0|[1-9]\d*)$/u;
const BIDI_CONTROL_RE = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

const BASE58_VALUE_BY_CHAR = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));

export interface AssetDefinitionAliasLiteral {
  literal: string;
  name: string;
  domain: string | null;
  dataspace: string;
}

export interface AssetIdLiteral {
  literal: string;
  definitionId: string;
  accountId: string;
  scope: string | null;
}

function containsControlCharacters(value: string): boolean {
  return /\p{Cc}/u.test(value);
}

function isIrohaNameSegment(value: string, forbidDot: boolean): boolean {
  const normalized = value.normalize('NFC');
  return (
    value.length > 0 &&
    new TextEncoder().encode(value).length <= 255 &&
    normalized === value &&
    !/[\s@#$]/u.test(value) &&
    !containsControlCharacters(value) &&
    !BIDI_CONTROL_RE.test(value) &&
    (!forbidDot || !value.includes('.'))
  );
}

/** Validate an on-chain alias without rewriting its case or stored Unicode spelling. */
export function isAssetDefinitionAliasLiteral(value: string): boolean {
  if (!value || value.trim() !== value || containsControlCharacters(value)) return false;
  const separator = value.indexOf('#');
  if (separator <= 0 || separator !== value.lastIndexOf('#') || separator === value.length - 1) return false;

  const name = value.slice(0, separator);
  const scope = value.slice(separator + 1);
  const dotCount = [...scope].filter((char) => char === '.').length;
  if (!isIrohaNameSegment(name, false) || dotCount > 1) return false;
  if (dotCount === 0) return isIrohaNameSegment(scope, true);

  const [domain, dataspace] = scope.split('.');
  return isIrohaNameSegment(domain ?? '', true) && isIrohaNameSegment(dataspace ?? '', true);
}

function normalizeAliasSegment(segment: string, forbidDot: boolean): string | null {
  return isIrohaNameSegment(segment, forbidDot) ? segment : null;
}

function decodeBase58(value: string): Uint8Array | null {
  if (!BASE58_RE.test(value)) return null;

  const bytes: number[] = [0];
  for (const char of value) {
    const digit = BASE58_VALUE_BY_CHAR.get(char);
    if (digit === undefined) return null;

    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index]! * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeroCount = 0;
  while (leadingZeroCount < value.length && value[leadingZeroCount] === '1') {
    leadingZeroCount += 1;
  }

  const out = new Uint8Array(leadingZeroCount + bytes.length);
  for (let index = 0; index < leadingZeroCount; index += 1) {
    out[index] = 0;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    out[out.length - 1 - index] = bytes[index]!;
  }
  return out;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function normalizeAssetDefinitionIdLiteral(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed !== value) return null;
  if (trimmed.includes(':') || trimmed.includes('#') || trimmed.includes('@') || trimmed.includes('$')) return null;

  const decoded = decodeBase58(trimmed);
  if (!decoded || decoded.length !== ASSET_DEFINITION_ADDRESS_LEN) return null;
  if (decoded[0] !== ASSET_DEFINITION_ADDRESS_VERSION) return null;
  if (decoded[ASSET_DEFINITION_UUID_VERSION_INDEX]! >> 4 !== 0b0100) return null;
  if ((decoded[ASSET_DEFINITION_UUID_VARIANT_INDEX]! & 0b1100_0000) !== 0b1000_0000) return null;
  if (!bytesEqual(decoded.subarray(17), blake3(decoded.subarray(0, 17)).subarray(0, 4))) return null;
  return trimmed;
}

export function parseAssetDefinitionAliasLiteral(value: string): AssetDefinitionAliasLiteral | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed !== value) return null;
  if (containsControlCharacters(trimmed)) return null;

  const [namePart, right] = trimmed.split('#');
  if (!namePart || !right) return null;
  if (trimmed.indexOf('#') !== trimmed.lastIndexOf('#')) return null;
  if (right.includes('@')) return null;

  const name = normalizeAliasSegment(namePart, false);
  if (!name) return null;

  const dotCount = [...right].filter((char) => char === '.').length;
  if (dotCount > 1) return null;

  if (dotCount === 1) {
    const [domainPart, dataspacePart] = right.split('.');
    const domain = normalizeAliasSegment(domainPart ?? '', true);
    const dataspace = normalizeAliasSegment(dataspacePart ?? '', true);
    if (!domain || !dataspace) return null;
    return {
      literal: `${name}#${domain}.${dataspace}`,
      name,
      domain,
      dataspace,
    };
  }

  const dataspace = normalizeAliasSegment(right, true);
  if (!dataspace) return null;
  return {
    literal: `${name}#${dataspace}`,
    name,
    domain: null,
    dataspace,
  };
}

export function normalizeAssetDefinitionAliasLiteral(value: string): string | null {
  return parseAssetDefinitionAliasLiteral(value)?.literal ?? null;
}

export function normalizeAssetDefinitionSelectorLiteral(value: string): string | null {
  const id = normalizeAssetDefinitionIdLiteral(value);
  if (id) return id;
  return normalizeAssetDefinitionAliasLiteral(value);
}

export function parseAssetIdLiteral(value: string): AssetIdLiteral | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed !== value) return null;

  const parts = trimmed.split('#');
  if (parts.length < 2 || parts.length > 3) return null;

  const definitionId = normalizeAssetDefinitionIdLiteral(parts[0] ?? '');
  const accountId = normalizeAccountIdLiteral(parts[1] ?? '');
  if (!definitionId || !accountId) return null;

  const scope = parts[2] ?? null;
  if (scope) {
    const match = DATASPACE_SCOPE_RE.exec(scope);
    if (!match || BigInt(match[1]!) > MAX_UINT64) return null;
  }

  return {
    literal: scope ? `${definitionId}#${accountId}#${scope}` : `${definitionId}#${accountId}`,
    definitionId,
    accountId,
    scope,
  };
}

export function normalizeAssetIdLiteral(value: string): string | null {
  return parseAssetIdLiteral(value)?.literal ?? null;
}

export function extractAssetDefinitionIdFromAssetIdLiteral(value: string): string | null {
  return parseAssetIdLiteral(value)?.definitionId ?? null;
}
