import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/taira-ce5-log-instruction.json';
import { Instruction, CollectionPage } from './schemas';
import { NativeInstructionEnvelope } from './instruction-envelope';
import { buildInstructionPresentation } from '@/shared/lib/instruction-presentation';
import { extractTransferEdgesFromInstruction } from '@/shared/lib/tracing';

describe('Native Explorer instruction envelope', () => {
  it('admits the exact ce5 Log response without inventing decoded semantic JSON', () => {
    const parsed = CollectionPage(Instruction).parse({ items: [fixture], nextCursor: null }).items[0]!;
    expect(parsed.kind).toBe('Log');
    expect(parsed.transaction_hash).toBe(fixture.transaction_hash);
    expect(parsed.box.encoded).toBe(fixture.box.instruction);
    expect(parsed.box.framed_sha256).toBe(`0x${fixture.box.framed_sha256}`);
    expect(parsed.box).toHaveProperty('wire_id', 'iroha.log');
    expect(parsed.box.json).toBeNull();
    expect(buildInstructionPresentation(parsed, 369)).toBeNull();
    expect(extractTransferEdgesFromInstruction(parsed)).toEqual([]);
  });

  it.each(['', 'not base64', fixture.box.instruction + '\n', fixture.box.instruction.replace(/=+$/u, '')])(
    'rejects noncanonical encoded bytes', (instruction) => {
      expect(() => NativeInstructionEnvelope.parse({ ...fixture.box, instruction })).toThrow();
    }
  );

  it.each(['0'.repeat(64), `0x${fixture.box.framed_sha256}`, fixture.box.framed_sha256.toUpperCase()])(
    'rejects an incorrect or noncanonical digest', (framed_sha256) => {
      expect(() => NativeInstructionEnvelope.parse({ ...fixture.box, framed_sha256 })).toThrow();
    }
  );

  it('refuses missing wire identity and mixed fabricated JSON', () => {
    expect(() => NativeInstructionEnvelope.parse({ ...fixture.box, wire_id: '' })).toThrow();
    expect(() => Instruction.parse({ ...fixture, box: { ...fixture.box, json: { kind: 'Log', payload: {} } } })).toThrow();
  });
});
