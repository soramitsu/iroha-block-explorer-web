import { expect, test } from 'vitest';
import { Instruction } from '@/shared/api/schemas';

test('Instruction schema accepts confidential shield payloads with flexible boxes', () => {
  expect(
    Instruction.parse({
      authority: 'testuAlice',
      kind: 'Shield',
      box: {
        encoded: '0x1234',
        json: {
          Shield: {
            asset: 'xor#universal',
            note_commitment: 'aa'.repeat(32),
          },
        },
      },
      transaction_hash: 'ab'.repeat(32),
      transaction_status: 'Committed',
      block: 1,
      created_at: new Date().toISOString(),
    }).kind
  ).toBe('Shield');
});

test('Instruction schema normalizes live r#box payloads', () => {
  const instruction = Instruction.parse({
    authority: 'testuAlice',
    kind: 'Transfer',
    'r#box': {
      encoded: '0x1234',
      json: {
        kind: 'Transfer',
        payload: {
          value: {
            object: '1000',
          },
        },
      },
    },
    transaction_hash: 'cd'.repeat(32),
    transaction_status: 'Committed',
    block: 2,
    created_at: new Date().toISOString(),
  });

  expect(instruction.box.json.kind).toBe('Transfer');
});
