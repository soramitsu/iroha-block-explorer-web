import { describe, expect, it } from 'vitest';
import {
  ContractActivity,
  ContractActivitySearchParamsSchema,
  ContractActivityResponse,
  ContractAddressSchema,
  ContractAliasSchema,
  ContractEvent,
  ContractEventFiltersSchema,
  ContractEventSearchParamsSchema,
  ContractEventResponse,
} from './schemas';

const contractAddress = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const contractAlias = 'router::universal';
const transactionHash = 'ab'.repeat(32);
const blockHash = 'cd'.repeat(32);
const activity = {
  entrypoint_hash: transactionHash,
  result_ok: true,
  contract_address: contractAddress,
  contract_alias: contractAlias,
  contract_payload: { nested: { amount: 10 }, flags: [true, false] },
};

const event = {
  event_id: `${transactionHash}:0`,
  schema_version: 1,
  provenance: 'emitted',
  tx_hash_hex: transactionHash,
  block_height: 4,
  block_hash_hex: blockHash,
  result_ok: true,
  contract_address: contractAddress,
  contract_alias: contractAlias,
  module: 'router',
  event_kind: 'swap',
  payload: { amount: 10 },
};

describe('contract request schemas', () => {
  it('accepts exact current activity and event filters', () => {
    expect(
      ContractActivitySearchParamsSchema.parse({
        page: 3,
        per_page: 20,
        contract_address: contractAddress,
        contract_alias: contractAlias,
        since_timestamp_ms: 100,
        until_timestamp_ms: 200,
      })
    ).toMatchObject({ page: 3, per_page: 20, contract_address: contractAddress });
    expect(ContractEventFiltersSchema.parse({ module: 'router', provenance: 'emitted' })).toEqual({
      module: 'router',
      provenance: 'emitted',
    });
  });

  it.each([
    { page: 0, per_page: 20 },
    { page: 1, per_page: 501 },
    { page: 26, per_page: 20 },
    { page: Number.MAX_SAFE_INTEGER, per_page: 2 },
    { page: 1, per_page: 20, module: 'router' },
    { page: 1, per_page: 20, contract_alias: ' router' },
    { page: 1, per_page: 20, since_timestamp_ms: 201, until_timestamp_ms: 200 },
  ])('rejects invalid or route-inapplicable activity input %#', (params) => {
    expect(() => ContractActivitySearchParamsSchema.parse(params)).toThrow();
  });

  it.each([
    { page: 1, per_page: 20, provenance: 'synthetic' },
    { page: 1, per_page: 20, event_kind: '' },
    { page: 1, per_page: 20, module: 'null' },
    { page: 1, per_page: 20, participant: 'TRUE' },
    { page: 1, per_page: 20, asset_id: '1e3' },
    { page: 1, per_page: 20, unexpected: true },
    { page: 1, per_page: 20, since_timestamp_ms: -1 },
  ])('rejects malformed event history input %#', (params) => {
    expect(() => ContractEventSearchParamsSchema.parse(params)).toThrow();
  });
});

describe('contract identifier schemas', () => {
  it('accepts exact current addresses and scoped aliases', () => {
    expect(ContractAddressSchema.parse(contractAddress)).toBe(contractAddress);
    expect(ContractAliasSchema.parse(contractAlias)).toBe(contractAlias);
    expect(ContractAliasSchema.parse('router::defi.universal')).toBe('router::defi.universal');
  });

  it.each([
    'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw',
    'irohac1router',
    `${contractAddress.slice(0, -1)}q`,
    contractAddress.toUpperCase(),
  ])('rejects a non-canonical contract address %#', (value) => {
    expect(() => ContractAddressSchema.parse(value)).toThrow();
  });

  it.each(['router', 'router::', ' router::universal', 'router::defi.universal.extra', 'router:::universal'])(
    'rejects a non-canonical contract alias %#',
    (value) => {
      expect(() => ContractAliasSchema.parse(value)).toThrow();
    }
  );
});

describe('contract activity schemas', () => {
  it('preserves decoded JSON payloads from the authoritative projection', () => {
    expect(ContractActivity.parse(activity).contract_payload).toEqual(activity.contract_payload);
  });

  it('accepts only exact counted-list envelopes with a total', () => {
    expect(
      ContractActivityResponse.parse({
        items: [activity],
        total: 1,
        has_more: false,
        count_mode: 'exact',
      }).total
    ).toBe(1);
    expect(() =>
      ContractActivityResponse.parse({
        items: [],
        has_more: false,
        count_mode: 'bounded',
      })
    ).toThrow();
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
    [{ ...event, schema_version: 2 }],
    [{ ...event, tx_hash_hex: transactionHash.toUpperCase() }],
    [{ ...event, contract_address: `tairac${contractAddress.slice('irohac'.length)}` }],
    [{ ...event, contract_alias: 'router' }],
    [{ ...event, numeric_fields: [] }],
  ])('rejects malformed event projections %#', (payload) => {
    expect(() => ContractEvent.parse(payload)).toThrow();
  });

  it('requires exact event history totals', () => {
    expect(
      ContractEventResponse.parse({
        items: [event],
        total: 1,
        has_more: false,
        count_mode: 'exact',
      }).items
    ).toHaveLength(1);
    expect(() =>
      ContractEventResponse.parse({
        items: [],
        has_more: false,
        count_mode: 'exact',
      })
    ).toThrow();
  });
});
