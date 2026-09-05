import { describe, expect, it } from 'vitest';
import { ToriiBrowserStreamGapError } from '@iroha/iroha-js/torii-browser';
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

const canonicalAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const participantAlias = 'treasury@banking.retail';
const contractAddress = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const contractAlias = 'router::universal';
const problemMessages = { invalidListResponse: 'localized invalid list response' };

function event(eventId: string): ContractEvent {
  return {
    event_id: eventId,
    schema_version: 1,
    provenance: 'emitted',
    tx_hash_hex: 'a'.repeat(64),
    block_height: 12,
    block_hash_hex: 'b'.repeat(64),
    result_ok: true,
    contract_address: contractAddress,
    module: 'router',
    event_kind: 'swap',
  };
}

describe('contract explorer route state', () => {
  it('parses only authoritative URL-addressable tabs and defaults unknown values to activity', () => {
    expect(parseContractExplorerTab('activity')).toBe('activity');
    expect(parseContractExplorerTab(['events'])).toBe('events');
    expect(parseContractExplorerTab('deployments')).toBe('activity');
    expect(parseContractExplorerTab('unknown')).toBe('activity');
  });

  it('maps exact activity filters and pagination to Torii parameters', () => {
    expect(
      parseContractActivitySearchParams(
        {
          authority: canonicalAccountId,
          contract_address: contractAddress,
          contract_alias: contractAlias,
          contract_entrypoint: 'swap',
          since_timestamp_ms: '0',
          until_timestamp_ms: '200',
          result_ok: 'false',
        },
        3,
        20
      )
    ).toEqual({
      ok: true,
      value: {
        page: 3,
        per_page: 20,
        authority: canonicalAccountId,
        contract_address: contractAddress,
        contract_alias: contractAlias,
        contract_entrypoint: 'swap',
        since_timestamp_ms: 0,
        until_timestamp_ms: 200,
        result_ok: false,
      },
    });
  });

  it.each([
    [{ authority: ' padded' }, { code: 'nonEmpty', params: { field: 'authority' } }],
    [
      { authority: participantAlias },
      {
        code: 'canonicalAccountId',
        params: { field: 'authority', standard: 'I105' },
      },
    ],
    [
      { result_ok: 'yes' },
      {
        code: 'booleanValue',
        params: { field: 'result_ok', trueValue: 'true', falseValue: 'false' },
      },
    ],
    [
      { since_timestamp_ms: '01' },
      {
        code: 'canonicalInteger',
        params: { field: 'since_timestamp_ms' },
      },
    ],
    [
      { since_timestamp_ms: '20', until_timestamp_ms: '10' },
      {
        code: 'timestampOrder',
        params: { sinceField: 'since_timestamp_ms', untilField: 'until_timestamp_ms' },
      },
    ],
    [
      { contract_alias: ['one', 'two'] },
      {
        code: 'providedOnce',
        params: { field: 'contract_alias' },
      },
    ],
    [
      { contract_address: null },
      {
        code: 'stringValue',
        params: { field: 'contract_address' },
      },
    ],
    [
      { contract_address: `tairac${contractAddress.slice('irohac'.length)}` },
      {
        code: 'canonicalContractAddress',
        params: { field: 'contract_address', standard: 'irohac Bech32m V1' },
      },
    ],
    [
      { contract_alias: 'router' },
      {
        code: 'canonicalContractAlias',
        params: { field: 'contract_alias' },
      },
    ],
    [
      { contract_entrypoint: 'null' },
      {
        code: 'noritoStringValue',
        params: { field: 'contract_entrypoint' },
      },
    ],
  ])('returns a locale-neutral issue for invalid or ambiguous filters %#', (query, issue) => {
    const parsed = parseContractActivitySearchParams(query, 1, 10);
    expect(parsed).toEqual({ ok: false, issues: [issue] });
  });

  it('retains every issue as typed data without constructing display prose', () => {
    expect(
      parseContractActivitySearchParams(
        {
          authority: participantAlias,
          result_ok: 'yes',
          since_timestamp_ms: '9007199254740992',
        },
        1,
        10
      )
    ).toEqual({
      ok: false,
      issues: [
        { code: 'safeIntegerRange', params: { field: 'since_timestamp_ms' } },
        { code: 'canonicalAccountId', params: { field: 'authority', standard: 'I105' } },
        {
          code: 'booleanValue',
          params: { field: 'result_ok', trueValue: 'true', falseValue: 'false' },
        },
      ],
    });
  });

  it('maps all event-only filters and strips pagination for the live stream', () => {
    const parsed = parseContractEventSearchParams(
      {
        module: 'router',
        event_kind: 'swap_filled',
        participant: participantAlias,
        asset_id: 'usd#issuer.main',
        provenance: 'derived',
        result_ok: 'true',
      },
      2,
      50
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(contractEventFiltersFromSearchParams(parsed.value)).toEqual({
      authority: undefined,
      contract_address: undefined,
      contract_alias: undefined,
      module: 'router',
      event_kind: 'swap_filled',
      participant: participantAlias,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      since_timestamp_ms: undefined,
      until_timestamp_ms: undefined,
      result_ok: true,
    });
  });

  it.each(['null', 'NULL', 'true', '123', '1e3'])(
    'rejects an event selector Torii would scalar-coerce before DTO decoding: %s',
    (module) => {
      expect(parseContractEventSearchParams({ module }, 1, 10)).toEqual({
        ok: false,
        issues: [{ code: 'noritoStringValue', params: { field: 'module' } }],
      });
    }
  );

  it('rejects an event provenance outside the route contract', () => {
    const parsed = parseContractEventSearchParams({ provenance: 'synthetic' }, 1, 10);
    expect(parsed).toEqual({
      ok: false,
      issues: [
        {
          code: 'provenanceValue',
          params: { field: 'provenance', emittedValue: 'emitted', derivedValue: 'derived' },
        },
      ],
    });
  });
});

describe('contract list resource states', () => {
  it('unwraps non-empty exact results and retains refresh metadata', () => {
    expect(
      unwrapContractListSnapshot(
        {
          status: 'ready',
          data: {
            status: 'ok',
            data: { items: [event('one')], total: 1, has_more: false, count_mode: 'exact' as const },
          },
          isRefreshing: true,
          refreshError: { kind: 'network', message: 'refresh failed' },
        },
        problemMessages
      )
    ).toMatchObject({
      status: 'ready',
      isRefreshing: true,
      refreshError: { kind: 'network' },
      data: { total: 1 },
    });
  });

  it('turns successful empty lists into an explicit not-found state', () => {
    expect(
      unwrapContractListSnapshot(
        {
          status: 'ready',
          data: {
            status: 'ok',
            data: { items: [], total: 0, has_more: false, count_mode: 'exact' as const },
          },
          isRefreshing: false,
          refreshError: null,
        },
        problemMessages
      )
    ).toEqual({ status: 'not-found' });
  });

  it('keeps an empty out-of-range page ready so pagination can return to available rows', () => {
    expect(
      unwrapContractListSnapshot(
        {
          status: 'ready',
          data: {
            status: 'ok',
            data: { items: [], total: 7, has_more: false, count_mode: 'exact' as const },
          },
          isRefreshing: false,
          refreshError: null,
        },
        problemMessages
      )
    ).toMatchObject({
      status: 'ready',
      data: { items: [], total: 7 },
    });
  });

  it('gives route validation errors precedence over network state', () => {
    expect(
      unwrapContractListSnapshot(
        { status: 'initial-loading' },
        {
          ...problemMessages,
          validationError: 'localized invalid bookmark',
        }
      )
    ).toEqual({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'localized invalid bookmark' },
    });
  });

  it('requires the caller-provided localized invalid-list message', () => {
    expect(
      unwrapContractListSnapshot(
        {
          status: 'ready',
          data: { status: 'unexpected' },
          isRefreshing: false,
          refreshError: null,
        },
        problemMessages
      )
    ).toEqual({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'localized invalid list response' },
    });
  });
});

describe('contract explorer semantic links and live state', () => {
  it('only emits links for recognized account and asset selectors', () => {
    expect(contractAccountPath(canonicalAccountId)).toBe(`/accounts/${encodeURIComponent(canonicalAccountId)}`);
    expect(contractAccountPath(participantAlias)).toBeNull();
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
    const state = contractStreamStaleState(
      new ToriiBrowserStreamGapError('events were lost', {
        code: 'stream_lagged',
        droppedMessages: 4,
        replayAvailable: false,
      })
    );
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
