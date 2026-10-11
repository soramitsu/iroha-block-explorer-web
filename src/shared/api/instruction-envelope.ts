import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod/v4';

/** Native Explorer bytes remain opaque: verifying their digest does not decode Norito. */
export const NativeInstructionEnvelope = z.object({
  wire_id: z.string().min(1),
  framed_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  instruction: z.string().min(1),
}).strict().superRefine((envelope, context) => {
  const bytes = Buffer.from(envelope.instruction, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== envelope.instruction) {
    context.addIssue({ code: 'custom', path: ['instruction'], message: 'Instruction must be canonical padded base64' });
    return;
  }
  if (bytesToHex(sha256(bytes)) !== envelope.framed_sha256) {
    context.addIssue({ code: 'custom', path: ['framed_sha256'], message: 'Instruction frame digest does not match its bytes' });
  }
});
