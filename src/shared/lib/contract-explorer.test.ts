import { describe, expect, it } from 'vitest';
import { ToriiStreamGapError } from '@iroha/iroha-js/torii-browser';
import type { ContractEvent } from '@/shared/api/schemas';
import {
  appendLiveContractEvent,
  contractAccountPath,
  contractAssetPath,
  contractEventFiltersFromSearchParams,
  contractStreamStaleState,
  isAbortError,
  jsonRecord,
  parseContractActivitySearchParams,
  parseContractEventSearchParams,
  parseContractExplorerTab,
  unwrapContractListSnapshot,
} from './contract-explorer';

const accountAlias = 'treasury@banking.retail';

function event(eventId: string): ContractEvent {
  return {
    event_id: eventId,
    schema_version: 1,
    provenance: 'emitted',
    tx_hash_hex: `tx-${eventId}`,
    block_height: 12,
    block_hash_hex: 'block-hash',
    result_ok: true,
    contract_address: 'tairac1router',
    module: 'router',
    event_kind: 'swap',
  };
}

describe('contract explorer route state', () => {
  it('parses URL-addressable tabs and defaults unknown values to deployments', () => {
    expect(parseContractExplorerTab('activity')).toBe('activity');
    expect(parseContractExplorerTab(['events'])).toBe('events');
    expect(parseContractExplorerTab('unknown')).toBe('deployments');
  });

  it('maps exact activity filters and pagination to Torii parameters', () => {
    expect(parseContractActivitySearchParams({
      authority: accountAlias,
      contract_address: 'tairac1router',
      contract_alias: 'router',
      contract_entrypoint: 'swap',
      since_timestamp_ms: '0',
      until_timestamp_ms: '200',
      result_ok: 'false',
    }, 'opaque-next', 20)).toEqual({
      ok: true,
      value: {
        cursor: 'opaque-next',
        limit: 20,
        authority: accountAlias,
        contract_address: 'tairac1router',
        contract_alias: 'router',
        contract_entrypoint: 'swap',
        since_timestamp_ms: 0,
        until_timestamp_ms: 200,
        result_ok: false,
      },
    });
  });

  it.each([
    [{ authority: ' padded' }, 'authority'],
    [{ result_ok: 'yes' }, 'result_ok'],
    [{ since_timestamp_ms: '01' }, 'canonical non-negative integer'],
    [{ since_timestamp_ms: '20', until_timestamp_ms: '10' }, 'must not be greater'],
    [{ contract_alias: ['one', 'two'] }, 'provided once'],
    [{ contract_address: null }, 'must be a string value'],
  ])('rejects invalid or ambiguous activity query filters %#', (query, message) => {
    const parsed = parseContractActivitySearchParams(query, null, 10);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(message);
  });

  it('maps all event-only filters and strips pagination for the live stream', () => {
    const parsed = parseContractEventSearchParams({
      module: 'router',
      event_kind: 'swap_filled',
      participant: accountAlias,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      result_ok: 'true',
    }, 'event-next', 50);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(contractEventFiltersFromSearchParams(parsed.value)).toEqual({
      authority: undefined,
      contract_address: undefined,
      contract_alias: undefined,
      module: 'router',
      event_kind: 'swap_filled',
      participant: accountAlias,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      since_timestamp_ms: undefined,
      until_timestamp_ms: undefined,
      result_ok: true,
    });
  });

  it('rejects an event provenance outside the route contract', () => {
    const parsed = parseContractEventSearchParams({ provenance: 'synthetic' }, null, 10);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('provenance must be emitted or derived');
  });
});

describe('contract list resource states', () => {
  it('unwraps non-empty exact results and retains refresh metadata', () => {
    expect(unwrapContractListSnapshot({
      status: 'ready',
      data: {
        status: 'ok',
        data: { items: [event('one')], total: 1, has_more: false, count_mode: 'exact' as const },
      },
      isRefreshing: true,
      refreshError: { kind: 'network', message: 'refresh failed' },
    })).toMatchObject({
      status: 'ready',
      isRefreshing: true,
      refreshError: { kind: 'network' },
      data: { total: 1 },
    });
  });

  it('turns successful empty lists into an explicit not-found state', () => {
    expect(unwrapContractListSnapshot({
      status: 'ready',
      data: {
        status: 'ok',
        data: { items: [], total: 0, has_more: false, count_mode: 'exact' as const },
      },
      isRefreshing: false,
      refreshError: null,
    })).toEqual({ status: 'not-found' });
  });

  it('gives route validation errors precedence over network state', () => {
    expect(unwrapContractListSnapshot({ status: 'initial-loading' }, 'bad bookmark')).toEqual({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'bad bookmark' },
    });
  });
});

describe('contract explorer semantic links and live state', () => {
  it('only emits links for recognized account and asset selectors', () => {
    expect(contractAccountPath(accountAlias)).toBe('/accounts/treasury%40banking.retail');
    expect(contractAccountPath('not an account')).toBeNull();
    expect(contractAssetPath('usd#issuer.main')).toBe('/assets/usd%23issuer.main');
    expect(contractAssetPath('not an asset')).toBeNull();
  });

  it('deduplicates live events newest-first and applies the retention limit', () => {
    const items = appendLiveContractEvent([event('two'), event('one')], event('one'), 2);
    expect(items.map((item) => item.event_id)).toEqual(['one', 'two']);
    expect(appendLiveContractEvent(items, event('three'), 2).map((item) => item.event_id)).toEqual(['three', 'one']);
    expect(appendLiveContractEvent(items, event('three'), 0)).toEqual([]);
  });

  it('preserves typed stream-gap evidence and marks replay unavailable', () => {
    const state = contractStreamStaleState(new ToriiStreamGapError('events were lost', {
      code: 'stream_lagged',
      droppedMessages: 4,
      replayAvailable: false,
    }));
    expect(state).toEqual({
      status: 'stale',
      message: 'events were lost',
      code: 'stream_lagged',
      droppedMessages: 4,
      replayAvailable: false,
    });
    expect(contractStreamStaleState(new Error('network closed'))).toMatchObject({
      status: 'stale',
      message: 'network closed',
      replayAvailable: false,
    });
  });

  it('recognizes aborts and wraps primitive JSON for decoded rendering', () => {
    expect(isAbortError(new DOMException('stopped', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('failed'))).toBe(false);
    expect(jsonRecord({ amount: 10 })).toEqual({ amount: 10 });
    expect(jsonRecord('raw')).toEqual({ value: 'raw' });
  });
});
