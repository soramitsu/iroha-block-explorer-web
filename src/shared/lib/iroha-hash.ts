const HASH_HEX_PATTERN = /^[0-9a-fA-F]{64}$/u;
const HASH_LITERAL_PATTERN = /^hash:([0-9a-fA-F]{64})#([0-9a-fA-F]{4})$/u;
const CANONICAL_HASH_LITERAL_PATTERN = /^hash:([0-9A-F]{64})#([0-9A-F]{4})$/u;

function hashLiteralChecksum(body: string): string {
  let crc = 0xffff;
  for (const character of `hash:${body.toUpperCase()}`) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Check one exact canonical Iroha 32-byte hash literal without normalizing it.
 *
 * Canonical literals retain their uppercase body and CRC-16/CCITT-FALSE
 * checksum exactly, and the underlying hash must carry Iroha's marker bit.
 */
export function isCanonicalIrohaHashLiteral32(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const literal = CANONICAL_HASH_LITERAL_PATTERN.exec(value);
  const body = literal?.[1];
  const checksum = literal?.[2];
  if (!body || !checksum) return false;
  if (hashLiteralChecksum(body) !== checksum) return false;
  return (Number.parseInt(body.slice(-2), 16) & 1) === 1;
}

/**
 * Normalize one Iroha 32-byte hash to lowercase hex.
 *
 * Raw hex, `0x`-prefixed hex, and checksum-valid `hash:<HEX>#<CRC>` literals
 * are accepted. Values without Iroha's hash marker bit fail closed.
 */
export function normalizeIrohaHash32(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  const literal = HASH_LITERAL_PATTERN.exec(normalized);

  let body: string;
  if (literal) {
    const literalBody = literal[1];
    const checksum = literal[2];
    if (!literalBody || !checksum || hashLiteralChecksum(literalBody) !== checksum.toUpperCase()) {
      return null;
    }
    body = literalBody;
  } else {
    body = normalized.startsWith('0x') || normalized.startsWith('0X')
      ? normalized.slice(2)
      : normalized;
    if (!HASH_HEX_PATTERN.test(body)) return null;
  }

  const hex = body.toLowerCase();
  return (Number.parseInt(hex.slice(-2), 16) & 1) === 1 ? hex : null;
}

/** Validate a ledger hash before projecting it to Torii's raw-hex selector. */
export function requireIrohaHash32(value: unknown): string {
  const normalized = normalizeIrohaHash32(value);
  if (!normalized) throw new TypeError('Expected a valid 32-byte Iroha hash with its marker bit and, for literals, checksum');
  return normalized;
}
