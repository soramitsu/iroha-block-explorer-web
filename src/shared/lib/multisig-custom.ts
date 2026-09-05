import { noritoDecodeInstruction } from '@iroha/iroha-js/browser';
import { z } from 'zod';
import { AccountIdSchema } from '@/shared/api/schemas';
import { normalizeDomainIdLiteral } from '@/shared/lib/rwa-id';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';

const MULTISIG_VARIANTS = ['Register', 'Propose', 'Approve', 'Cancel', 'InvalidateOutstanding'] as const;

export type MultisigVariant = (typeof MULTISIG_VARIANTS)[number];

export interface MultisigCustomEnvelope {
  variant: MultisigVariant;
  account: string;
  instructions: string[];
  transaction_ttl_ms: number | null;
}

export interface DecodedMultisigInstruction {
  index: number;
  kind: string | null;
  instruction: unknown | null;
}

export interface MultisigCustomDisplayPayload {
  multisig: {
    variant: MultisigVariant;
    account: string;
    transaction_ttl_ms: number | null;
    instructions_count: number;
    decoded_instructions: DecodedMultisigInstruction[];
  };
  raw_payload: unknown;
}

type AnyRecord = Record<string, unknown>;

const ExactAccountIdSchema = z.string().refine((value) => AccountIdSchema.safeParse(value).data === value);
const DomainIdSchema = z.string().refine((value) => normalizeDomainIdLiteral(value) === value);
const SafePositiveIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const CanonicalHashLiteralSchema = z
  .string()
  .regex(/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u)
  .refine((value) => normalizeIrohaHash32(value) !== null);
const EncodedInstructionSchema = z.string().refine((value) => decodeBase64ToBytes(value) !== null);
const MultisigRegisterSchema = z
  .object({
    account: ExactAccountIdSchema,
    home_domain: DomainIdSchema.nullable(),
    spec: z
      .object({
        signatories: z.record(ExactAccountIdSchema, z.number().int().min(0).max(0xff)),
        quorum: z.number().int().min(1).max(0xffff),
        transaction_ttl_ms: SafePositiveIntegerSchema,
      })
      .strict(),
  })
  .strict();
const MultisigProposeSchema = z
  .object({
    account: ExactAccountIdSchema,
    instructions: z.array(EncodedInstructionSchema),
    transaction_ttl_ms: SafePositiveIntegerSchema.nullable(),
  })
  .strict();
const MultisigDecisionSchema = z
  .object({
    account: ExactAccountIdSchema,
    instructions_hash: CanonicalHashLiteralSchema,
  })
  .strict();
const MultisigInvalidateOutstandingSchema = z
  .object({
    account: ExactAccountIdSchema,
  })
  .strict();
const MultisigValueSchema = z.union([
  z.object({ Register: MultisigRegisterSchema }).strict(),
  z.object({ Propose: MultisigProposeSchema }).strict(),
  z.object({ Approve: MultisigDecisionSchema }).strict(),
  z.object({ Cancel: MultisigDecisionSchema }).strict(),
  z.object({ InvalidateOutstanding: MultisigInvalidateOutstandingSchema }).strict(),
]);
const ExplorerCustomPayloadSchema = z
  .object({
    variant: z.literal('Custom'),
    value: MultisigValueSchema,
  })
  .strict();

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null;
}

function decodeBase64ToBytes(raw: string): Uint8Array | null {
  if (!raw || raw.trim() !== raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
    return null;
  }

  try {
    const binary = atob(raw);
    if (!binary || btoa(binary) !== raw) return null;

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readDecodedInstructionKind(instruction: unknown): string | null {
  const instructionRecord = asRecord(instruction);
  if (!instructionRecord) return null;

  const variants = Object.keys(instructionRecord);
  return variants.length === 1 ? (variants[0] ?? null) : null;
}

function decodeNestedInstruction(encoded: string, index: number): DecodedMultisigInstruction {
  const bytes = decodeBase64ToBytes(encoded);
  if (!bytes) {
    return {
      index,
      kind: null,
      instruction: null,
    };
  }

  try {
    const instruction = noritoDecodeInstruction(bytes);
    return {
      index,
      kind: readDecodedInstructionKind(instruction),
      instruction,
    };
  } catch {
    return {
      index,
      kind: null,
      instruction: null,
    };
  }
}

export function readMultisigCustomEnvelope(payload: unknown): MultisigCustomEnvelope | null {
  const parsed = ExplorerCustomPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [variant, body] = Object.entries(parsed.data.value)[0] as [
    MultisigVariant,
    { account: string; instructions?: string[]; transaction_ttl_ms?: number | null },
  ];
  return {
    variant,
    account: body.account,
    instructions: body.instructions ?? [],
    transaction_ttl_ms: body.transaction_ttl_ms ?? null,
  };
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
