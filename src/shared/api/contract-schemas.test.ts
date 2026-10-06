import { describe, expect, it } from 'vitest';
import {
  ContractActivity,
  ContractActivityResponse,
  ContractEvent,
  ContractEventResponse,
} from './schemas';

const activity = {
  entrypoint_hash: 'tx-hash',
  result_ok: true,
  contract_address: 'tairac1router',
  contract_payload: { nested: { amount: 10 }, flags: [true, false] },
};

const event = {
  event_id: 'tx-hash:0',
  schema_version: 1,
  provenance: 'emitted',
  tx_hash_hex: 'tx-hash',
  block_height: 4,
  block_hash_hex: 'block-hash',
  result_ok: true,
  contract_address: 'tairac1router',
  module: 'router',
  event_kind: 'swap',
  payload: { amount: 10 },
};

describe('contract activity schemas', () => {
  it('preserves decoded JSON payloads from the authoritative projection', () => {
    expect(ContractActivity.parse(activity).contract_payload).toEqual(activity.contract_payload);
  });

  it.each([null, 'opaque-contract-continuation'])('accepts native activity collections with cursor %s and no fabricated total', (nextCursor) => {
    const parsed = ContractActivityResponse.parse({ items: [activity], nextCursor });
    expect(parsed).toEqual({ items: [activity], nextCursor });
    expect(parsed).not.toHaveProperty('total');
    expect(() => ContractActivityResponse.parse({ items: [], total: 0, has_more: false, count_mode: 'exact' })).toThrow();
  });

  it('rejects camelCase aliases instead of decoding a second shape', () => {
    expect(() => ContractActivity.parse({ ...activity, contractPayload: {} })).toThrow();
  });
});

describe('contract event schemas', () => {
  it('decodes provenance and payload without losing structured data', () => {
    const parsed = ContractEvent.parse(event);
    expect(parsed.provenance).toBe('emitted');
    expect(parsed.payload).toEqual({ amount: 10 });
  });

  it.each([
    [{ ...event, provenance: 'synthetic' }],
    [{ ...event, block_height: -1 }],
    [{ ...event, schema_version: 1.5 }],
  ])('rejects malformed event projections %#', (payload) => {
    expect(() => ContractEvent.parse(payload)).toThrow();
  });

  it('uses the native event continuation without exact-count metadata', () => {
    const parsed = ContractEventResponse.parse({ items: [event], nextCursor: null });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBeNull();
    expect(parsed).not.toHaveProperty('total');
    expect(() => ContractEventResponse.parse({ items: [], total: 0, has_more: false, count_mode: 'exact' })).toThrow();
    expect(() => ContractEventResponse.parse({ items: [], nextCursor: 7 })).toThrow();
  });
});
