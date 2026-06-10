const MULTISIG_VARIANTS = ['Register', 'Propose', 'Approve'] as const;

export type MultisigVariant = (typeof MULTISIG_VARIANTS)[number];

export interface MultisigCustomEnvelope {
  variant: MultisigVariant
  account: string
  instructions: string[]
  transaction_ttl_ms: number | null
}

export interface DecodedMultisigInstruction {
  index: number
  kind: string | null
  wire_id: string | null
  preview: string | null
}

export interface MultisigCustomDisplayPayload {
  multisig: {
    variant: MultisigVariant
    account: string
    transaction_ttl_ms: number | null
    instructions_count: number
    decoded_instructions: DecodedMultisigInstruction[]
  }
  raw_payload: unknown
}

type AnyRecord = Record<string, unknown>;

const MULTISIG_VARIANT_SET = new Set<string>(MULTISIG_VARIANTS);
const PREVIEW_LENGTH = 120;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null;
}

function normalizeTtl(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMultisigVariantEntry(container: AnyRecord): { variant: MultisigVariant, body: AnyRecord } | null {
  const entries = Object.entries(container);
  if (entries.length !== 1) return null;

  const [variant, body] = entries[0];
  if (!MULTISIG_VARIANT_SET.has(variant)) return null;

  const bodyRecord = asRecord(body);
  if (!bodyRecord || typeof bodyRecord.account !== 'string') return null;

  return {
    variant: variant as MultisigVariant,
    body: bodyRecord,
  };
}

function extractEnvelope(entry: { variant: MultisigVariant, body: AnyRecord }): MultisigCustomEnvelope {
  const rawInstructions = Array.isArray(entry.body.instructions)
    ? entry.body.instructions.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    variant: entry.variant,
    account: entry.body.account as string,
    instructions: rawInstructions,
    transaction_ttl_ms: normalizeTtl(entry.body.transaction_ttl_ms),
  };
}

function toPascalCase(raw: string): string {
  return raw
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`)
    .join('');
}

function decodeBase64ToBytes(raw: string): Uint8Array | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (typeof atob === 'function') {
      const binary = atob(trimmed);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
  } catch {
    // ignore
  }

  const bufferFactory = (globalThis as { Buffer?: { from: (input: string, encoding: string) => Uint8Array } }).Buffer;
  if (!bufferFactory) return null;

  try {
    return new Uint8Array(bufferFactory.from(trimmed, 'base64'));
  } catch {
    return null;
  }
}

function decodeBytesToText(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  let output = '';
  for (const value of bytes) {
    output += String.fromCharCode(value);
  }
  return output;
}

function extractInstructionWireId(decodedText: string): string | null {
  const canonicalMatch = decodedText.match(/iroha_data_model::isi::[A-Za-z0-9_:]+/);
  if (canonicalMatch) return canonicalMatch[0];

  const shortMatch = decodedText.match(/iroha\.[a-z_]+/i);
  if (shortMatch) return shortMatch[0].toLowerCase();

  return null;
}

function extractInstructionKind(wireId: string | null): string | null {
  if (!wireId) return null;

  if (wireId.includes('::')) {
    const segments = wireId.split('::').filter(Boolean);
    const last = segments.at(-1);
    return last ?? null;
  }

  if (wireId.startsWith('iroha.')) {
    return toPascalCase(wireId.slice('iroha.'.length));
  }

  return null;
}

function extractPreview(decodedText: string): string | null {
  const printable = decodedText.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!printable) return null;

  if (printable.length <= PREVIEW_LENGTH) return printable;
  return `${printable.slice(0, PREVIEW_LENGTH - 3)}...`;
}

function decodeNestedInstruction(encoded: string, index: number): DecodedMultisigInstruction {
  const bytes = decodeBase64ToBytes(encoded);
  if (!bytes) {
    return {
      index,
      kind: null,
      wire_id: null,
      preview: null,
    };
  }

  const decodedText = decodeBytesToText(bytes);
  const wireId = extractInstructionWireId(decodedText);

  return {
    index,
    kind: extractInstructionKind(wireId),
    wire_id: wireId,
    preview: extractPreview(decodedText),
  };
}

export function readMultisigCustomEnvelope(payload: unknown): MultisigCustomEnvelope | null {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return null;

  const directEntry = readMultisigVariantEntry(payloadRecord);
  if (directEntry) return extractEnvelope(directEntry);

  const nestedValue = asRecord(payloadRecord.value);
  if (!nestedValue) return null;

  const nestedEntry = readMultisigVariantEntry(nestedValue);
  if (!nestedEntry) return null;

  return extractEnvelope(nestedEntry);
}

export function buildMultisigCustomDisplayPayload(payload: unknown): MultisigCustomDisplayPayload | null {
  const envelope = readMultisigCustomEnvelope(payload);
  if (!envelope) return null;

  return {
    multisig: {
      variant: envelope.variant,
      account: envelope.account,
      transaction_ttl_ms: envelope.transaction_ttl_ms,
      instructions_count: envelope.instructions.length,
      decoded_instructions: envelope.instructions.map((encoded, index) => decodeNestedInstruction(encoded, index)),
    },
    raw_payload: payload,
  };
}
