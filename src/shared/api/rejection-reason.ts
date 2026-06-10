const textDecoder = new TextDecoder();

class NoritoReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  remaining(): number {
    return this.bytes.length - this.offset;
  }

  readU8(): number {
    if (this.remaining() < 1) throw new Error('NoritoReader: unexpected EOF while reading u8');
    return this.bytes[this.offset++]!;
  }

  readU32LE(): number {
    if (this.remaining() < 4) throw new Error('NoritoReader: unexpected EOF while reading u32');
    const b0 = this.bytes[this.offset++]!;
    const b1 = this.bytes[this.offset++]!;
    const b2 = this.bytes[this.offset++]!;
    const b3 = this.bytes[this.offset++]!;
     
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  readU64LEAsNumber(): number {
    if (this.remaining() < 8) throw new Error('NoritoReader: unexpected EOF while reading u64');
    let value = 0n;
    for (let i = 0; i < 8; i += 1) {
      value |= BigInt(this.bytes[this.offset + i]!) << BigInt(8 * i);
    }
    this.offset += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`NoritoReader: u64 too large for JS number: ${value.toString()}`);
    }
    return Number(value);
  }

  readBytes(length: number): Uint8Array {
    if (length < 0) throw new Error('NoritoReader: negative length');
    if (this.remaining() < length) throw new Error('NoritoReader: unexpected EOF while reading bytes');
    const start = this.offset;
    this.offset += length;
    return this.bytes.slice(start, start + length);
  }

  readLenPrefixedBytesU64(): Uint8Array {
    const len = this.readU64LEAsNumber();
    return this.readBytes(len);
  }
}

function decodeHexBytes(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!hex || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function decodeBase64Bytes(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Browser + Vitest(jsdom) friendly: atob exists; Node-only Buffer would work too,
  // but this keeps the helper environment-agnostic.
  if (typeof atob !== 'function') return null;
  try {
    const bin = atob(trimmed);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function decodeNoritoArchivePayload(bytes: Uint8Array): { payload: Uint8Array, flags: number } | null {
  // Header format: see ../i23/norito.md and ../i23/crates/norito/README.md
  if (bytes.length < 40) return null;
  if (bytes[0] !== 0x4e || bytes[1] !== 0x52 || bytes[2] !== 0x54 || bytes[3] !== 0x30) return null; // NRT0

  const compression = bytes[22]!;
  if (compression !== 0) return null; // zstd not supported here

  const lenView = new NoritoReader(bytes.slice(23, 31));
  const declaredLen = lenView.readU64LEAsNumber();
  const flags = bytes[39]!;
  const payload = bytes.slice(40);
  if (payload.length !== declaredLen) return null;
  return { payload, flags };
}

function decodeNoritoString(bytes: Uint8Array): string | null {
  try {
    const r = new NoritoReader(bytes);
    const len = r.readU64LEAsNumber();
    const strBytes = r.readBytes(len);
    return textDecoder.decode(strBytes);
  } catch {
    return null;
  }
}

function decodeName(bytes: Uint8Array): string | null {
  // In Iroha data model Name is a string-like type. Under the current canonical layout
  // it is encoded as `[len:u64][utf8_bytes]`.
  return decodeNoritoString(bytes);
}

function decodeDomainId(bytes: Uint8Array): string | null {
  try {
    const r = new NoritoReader(bytes);
    const nameField = r.readLenPrefixedBytesU64();
    return decodeName(nameField);
  } catch {
    return null;
  }
}

function decodePublicKey(bytes: Uint8Array): string | null {
  // iroha_crypto::PublicKey serializes as a normalized multihash string.
  return decodeNoritoString(bytes);
}

function decodeAccountControllerSingle(bytes: Uint8Array): string | null {
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    if (tag !== 0) return null; // AccountController::Single(PublicKey)
    const publicKeyField = r.readLenPrefixedBytesU64();
    return decodePublicKey(publicKeyField);
  } catch {
    return null;
  }
}

function decodeAccountId(bytes: Uint8Array): string | null {
  // Current AccountId wire shape is just AccountController.
  const direct = decodeAccountControllerSingle(bytes);
  if (direct) return direct;

  return decodeAsciiTailLiteral(bytes);
}

function decodeIdBox(bytes: Uint8Array): string | null {
  // IdBox encodes as `[variant_tag:u32][variant_payload]`.
  // The variant payload is length-prefixed for box-like ids.
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    const payload = r.readLenPrefixedBytesU64();
    switch (tag) {
      case 0:
        return decodeDomainId(payload);
      case 1:
        return decodeAccountId(payload);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function decodeAsciiTailLiteral(bytes: Uint8Array): string | null {
  let end = bytes.length - 1;
  while (end >= 0) {
    const value = bytes[end]!;
    if (value >= 0x20 && value <= 0x7e) break;
    end -= 1;
  }
  if (end < 0) return null;

  let start = end;
  while (start >= 0) {
    const value = bytes[start]!;
    if (!(value >= 0x20 && value <= 0x7e)) break;
    start -= 1;
  }

  const literalBytes = bytes.slice(start + 1, end + 1);
  if (literalBytes.length < 2) return null;
  return textDecoder.decode(literalBytes);
}

type Decoded =
  | { ok: true, message: string }
  | { ok: false, error: string };

function decodeRepetitionError(bytes: Uint8Array): Decoded {
  try {
    const r = new NoritoReader(bytes);
    // InstructionType tag is present first, but variant numbering may vary across
    // backend revisions, so keep the message stable and focus on the repeated id.
    r.readU32LE();
    const idBytes = r.readBytes(r.remaining());
    const id = decodeIdBox(idBytes) ?? decodeAsciiTailLiteral(idBytes);
    return id
      ? { ok: true, message: `Repeated instruction for id: ${id}` }
      : { ok: true, message: 'Repeated instruction' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown decode error' };
  }
}

function decodeFindError(bytes: Uint8Array): Decoded {
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    switch (tag) {
      case 3: {
        const accountBytes = r.readLenPrefixedBytesU64();
        const account = decodeAccountId(accountBytes);
        return account
          ? { ok: true, message: `Failed to find account: ${account}` }
          : { ok: true, message: 'Failed to find account' };
      }
      case 4: {
        const domainBytes = r.readLenPrefixedBytesU64();
        const domain = decodeDomainId(domainBytes);
        return domain
          ? { ok: true, message: `Failed to find domain: ${domain}` }
          : { ok: true, message: 'Failed to find domain' };
      }
      case 5: {
        const nameBytes = r.readLenPrefixedBytesU64();
        const name = decodeName(nameBytes);
        return name
          ? { ok: true, message: `Failed to find metadata key: ${name}` }
          : { ok: true, message: 'Failed to find metadata key' };
      }
      case 12: {
        const keyBytes = r.readLenPrefixedBytesU64();
        const key = decodePublicKey(keyBytes);
        return key
          ? { ok: true, message: `Failed to find public key: ${key}` }
          : { ok: true, message: 'Failed to find public key' };
      }
      default:
        return { ok: true, message: `FindError(${tag})` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown decode error' };
  }
}

function decodeInstructionExecutionError(bytes: Uint8Array): Decoded {
  // ../i23/crates/iroha_data_model/src/isi/mod.rs: InstructionExecutionError
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    switch (tag) {
      case 3: {
        const findBytes = r.readLenPrefixedBytesU64();
        return decodeFindError(findBytes);
      }
      case 2: {
        const msgBytes = r.readLenPrefixedBytesU64();
        const msg = decodeNoritoString(msgBytes);
        return msg ? { ok: true, message: msg } : { ok: true, message: 'Conversion error' };
      }
      case 4: {
        const repetitionBytes = r.readLenPrefixedBytesU64();
        return decodeRepetitionError(repetitionBytes);
      }
      default:
        return { ok: true, message: `InstructionExecutionError(${tag})` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown decode error' };
  }
}

function decodeValidationFail(bytes: Uint8Array): Decoded {
  // ../i23/crates/iroha_data_model/src/executor.rs: ValidationFail
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    switch (tag) {
      case 0: {
        const msgBytes = r.readLenPrefixedBytesU64();
        const msg = decodeNoritoString(msgBytes);
        return msg ? { ok: true, message: msg } : { ok: true, message: 'Not permitted' };
      }
      case 2: {
        // InstructionFailed(InstructionExecutionError)
        const errBytes = r.readLenPrefixedBytesU64();
        const decoded = decodeInstructionExecutionError(errBytes);
        if (decoded.ok) return { ok: true, message: `Instruction failed: ${decoded.message}` };
        return decoded;
      }
      case 3: {
        // QueryFailed(QueryExecutionFail) - not decoded yet; at least show the tag.
        return { ok: true, message: 'Query failed' };
      }
      case 5:
        return { ok: true, message: 'Operation is too complex' };
      default:
        return { ok: true, message: `ValidationFail(${tag})` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown decode error' };
  }
}

function decodeTransactionRejectionReasonPayload(bytes: Uint8Array): Decoded {
  // ../i23/crates/iroha_data_model/src/transaction/error.rs: TransactionRejectionReason
  try {
    const r = new NoritoReader(bytes);
    const tag = r.readU32LE();
    switch (tag) {
      case 0: {
        const findBytes = r.readLenPrefixedBytesU64();
        const decoded = decodeFindError(findBytes);
        if (decoded.ok) return decoded;
        return decoded;
      }
      case 1: {
        const limitBytes = r.readLenPrefixedBytesU64();
        // TransactionLimitError is transparent over the inner reason string in JSON,
        // but on-wire it's a struct with a single String field.
        const limitReader = new NoritoReader(limitBytes);
        const reasonField = limitReader.readLenPrefixedBytesU64();
        const msg = decodeNoritoString(reasonField);
        return msg ? { ok: true, message: msg } : { ok: true, message: 'Transaction limit check failed' };
      }
      case 2: {
        const validationBytes = r.readLenPrefixedBytesU64();
        const decoded = decodeValidationFail(validationBytes);
        if (decoded.ok) return { ok: true, message: `Validation failed: ${decoded.message}` };
        return decoded;
      }
      case 3: {
        // InstructionExecution(InstructionExecutionFail) - decode only reason string when possible.
        const failBytes = r.readLenPrefixedBytesU64();
        const failReader = new NoritoReader(failBytes);
        // instruction: InstructionBox (opaque, skip)
        failReader.readLenPrefixedBytesU64();
        const reasonField = failReader.readLenPrefixedBytesU64();
        const msg = decodeNoritoString(reasonField);
        return msg ? { ok: true, message: msg } : { ok: true, message: 'Instruction execution failed' };
      }
      case 4: {
        // IvmExecution(IvmExecutionFail) - transparent string wrapper (struct with one String field)
        const ivmBytes = r.readLenPrefixedBytesU64();
        const ivmReader = new NoritoReader(ivmBytes);
        const reasonField = ivmReader.readLenPrefixedBytesU64();
        const msg = decodeNoritoString(reasonField);
        return msg ? { ok: true, message: msg } : { ok: true, message: 'IVM execution failed' };
      }
      case 5:
        return { ok: true, message: 'Trigger execution failed' };
      default:
        return { ok: true, message: `TransactionRejectionReason(${tag})` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown decode error' };
  }
}

export function formatTransactionRejectionReason(reason: { encoded: string, json: unknown }): string {
  const bytes = decodeHexBytes(reason.encoded);
  if (bytes) {
    const decoded = decodeTransactionRejectionReasonPayload(bytes);
    if (decoded.ok) return decoded.message;
  }

  if (typeof reason.json === 'string') {
    const noritoBytes = decodeBase64Bytes(reason.json);
    if (noritoBytes) {
      const archive = decodeNoritoArchivePayload(noritoBytes);
      if (archive && archive.flags === 0) {
        const decoded = decodeTransactionRejectionReasonPayload(archive.payload);
        if (decoded.ok) return decoded.message;
      }
    }

    return reason.json;
  }

  try {
    return JSON.stringify(reason.json);
  } catch {
    return String(reason.json);
  }
}
