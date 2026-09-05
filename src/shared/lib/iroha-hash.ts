const HASH_HEX_PATTERN = /^[0-9a-fA-F]{64}$/u;
const HASH_LITERAL_PATTERN = /^hash:([0-9a-fA-F]{64})#([0-9a-fA-F]{4})$/u;

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
