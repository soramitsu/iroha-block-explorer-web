const NORITO_HEADER_SIZE = 40;
const NORITO_MAX_PADDING_BYTES = 64;
const CONTENT_CID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function sorafsEpochToDate(epoch: number): Date {
  return new Date(epoch * 1000);
}

export function sorafsSuccessorLabel(successor?: { digest_hex?: string } | null): string {
  if (!successor?.digest_hex) return '—';
  const digest = successor.digest_hex;
  if (digest.length <= 10) return digest;
  return `${digest.slice(0, 10)}…`;
}

function readU64LEAsNumber(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 8 > bytes.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const value = view.getBigUint64(0, true);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function decodeBase64Bytes(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (typeof atob === 'function') {
    try {
      const decoded = atob(trimmed);
      const out = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i += 1) out[i] = decoded.charCodeAt(i);
      return out;
    } catch {
      // fall through to Buffer
    }
  }

  if (typeof Buffer !== 'undefined') {
    try {
      return Uint8Array.from(Buffer.from(trimmed, 'base64'));
    } catch {
      return null;
    }
  }

  return null;
}

function decodeNoritoArchivePayload(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < NORITO_HEADER_SIZE) return null;
  if (bytes[0] !== 0x4e || bytes[1] !== 0x52 || bytes[2] !== 0x54 || bytes[3] !== 0x30) return null;
  if (bytes[22] !== 0) return null;

  const declaredLength = readU64LEAsNumber(bytes, 23);
  if (declaredLength === null) return null;

  const paddingLength = bytes.length - NORITO_HEADER_SIZE - declaredLength;
  if (paddingLength < 0 || paddingLength > NORITO_MAX_PADDING_BYTES) return null;

  for (let i = 0; i < paddingLength; i += 1) {
    if (bytes[NORITO_HEADER_SIZE + i] !== 0) return null;
  }

  const payloadStart = NORITO_HEADER_SIZE + paddingLength;
  return bytes.slice(payloadStart, payloadStart + declaredLength);
}

function readLengthPrefixedField(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array, nextOffset: number } | null {
  const length = readU64LEAsNumber(bytes, offset);
  if (length === null) return null;

  const start = offset + 8;
  const end = start + length;
  if (end > bytes.length) return null;

  return {
    value: bytes.slice(start, end),
    nextOffset: end,
  };
}

function normalizeAbsoluteBaseUrl(value: string | null | undefined, fallbackOrigin?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = fallbackOrigin ? new URL(trimmed, fallbackOrigin) : new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function encodeSorafsContentCid(bytes: Uint8Array): string {
  if (!bytes.length) return 'b';

  let acc = 0;
  let bits = 0;
  let output = 'b';

  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += CONTENT_CID_ALPHABET[(acc >> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += CONTENT_CID_ALPHABET[(acc << (5 - bits)) & 0x1f];
  }

  return output;
}

export function decodeSorafsContentCid(value: string): Uint8Array | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith('b')) return null;

  const encoded = trimmed.slice(1);
  if (!encoded) return new Uint8Array();

  const output: number[] = [];
  let acc = 0;
  let bits = 0;

  for (const char of encoded) {
    const index = CONTENT_CID_ALPHABET.indexOf(char);
    if (index < 0) return null;

    acc = (acc << 5) | index;
    bits += 5;

    while (bits >= 8) {
      output.push((acc >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;

  return Uint8Array.from(output);
}

export function sorafsContentCidToHex(value: string): string | null {
  const bytes = decodeSorafsContentCid(value);
  if (!bytes) return null;

  return Array.from(bytes, (entry) => entry.toString(16).padStart(2, '0')).join('');
}

export function sorafsManifestBase64ToRootCid(manifestB64: string): string | null {
  const manifestBytes = decodeBase64Bytes(manifestB64);
  if (!manifestBytes) return null;

  const payload = decodeNoritoArchivePayload(manifestBytes);
  if (!payload) return null;

  const versionField = readLengthPrefixedField(payload, 0);
  if (!versionField) return null;

  const rootCidField = readLengthPrefixedField(payload, versionField.nextOffset);
  if (!rootCidField) return null;

  const rootCidBytes = readLengthPrefixedField(rootCidField.value, 0);
  if (!rootCidBytes || rootCidBytes.nextOffset !== rootCidField.value.length) return null;

  return encodeSorafsContentCid(rootCidBytes.value);
}

export function sorafsFilePathLabel(path: readonly string[]): string {
  return path.length > 0 ? path.join('/') : '/';
}

export function resolveSorafsPublicBaseUrl(options: {
  configuredBaseUrl?: string | null
  toriiBaseUrl?: string | null
  windowOrigin?: string | null
} = {}): string | null {
  const fallbackOrigin = options.windowOrigin?.trim() || undefined;

  return (
    normalizeAbsoluteBaseUrl(options.configuredBaseUrl, fallbackOrigin) ??
    normalizeAbsoluteBaseUrl(options.toriiBaseUrl, fallbackOrigin) ??
    normalizeAbsoluteBaseUrl(options.windowOrigin, fallbackOrigin)
  );
}

export function buildSorafsPublicFileUrl(rootCid: string, path: readonly string[], publicBaseUrl: string): string {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const base = publicBaseUrl.replace(/\/+$/, '');
  return encodedPath ? `${base}/sorafs/cid/${rootCid}/${encodedPath}` : `${base}/sorafs/cid/${rootCid}/`;
}
