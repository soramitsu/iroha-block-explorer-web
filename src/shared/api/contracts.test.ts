import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../../tests/fixtures/http-response';
import { ToriiBrowserClient } from '@iroha/iroha-js/torii-browser';
import {
  fetchContractActivity,
  fetchContractEvents,
  streamContractEvents,
} from './index';

const nativeFetch = globalThis.fetch;

const activity = {
  authority: 'treasury@banking.retail',
  timestamp_ms: 123,
  entrypoint_hash: 'entrypoint-hash',
  result_ok: true,
  contract_address: 'tairac1router',
  contract_alias: 'router',
  contract_entrypoint: 'swap',
  contract_payload: { amount_in: 100 },
  fee_payment: { payer: 'authority' },
};

const event = {
  event_id: 'entrypoint-hash:0',
  schema_version: 1,
  provenance: 'derived' as const,
  authority: 'treasury@banking.retail',
  timestamp_ms: 124,
  tx_hash_hex: 'entrypoint-hash',
  block_height: 9,
  block_hash_hex: 'block-hash',
  result_ok: false,
  contract_address: 'tairac1router',
  contract_alias: 'router',
  module: 'router',
  event_kind: 'swap_failed',
  participants: ['treasury@banking.retail'],
  asset_ids: ['usd#issuer.main'],
  numeric_fields: { amount_in: 100 },
  payload: { reason: 'slippage' },
  fee_payment: { payer: 'authority' },
};

function predicates(filter: { op: string, args: unknown[] }): unknown[][] {
  return filter.op === 'and'
    ? filter.args.flatMap((child) => predicates(child as { op: string, args: unknown[] }))
    : [[filter.op, ...filter.args]];
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = nativeFetch;
});

describe('contract route API wrappers', () => {
  it('requests contract activity through canonical predicates and opaque continuation', async () => {
    const spy = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [activity], next_cursor: 'next' }));
    globalThis.fetch = spy;
    const result = await fetchContractActivity({
      cursor: 'previous', limit: 20, authority: 'treasury@banking.retail',
      contract_address: 'tairac1router', contract_alias: 'router', contract_entrypoint: 'swap',
      since_timestamp_ms: 100, until_timestamp_ms: 200, result_ok: true,
    });
    expect(new URL(String(spy.mock.calls[0][0])).pathname).toBe('/v1/contracts/activity/query');
    expect(spy.mock.calls[0][1]?.method).toBe('POST');
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.limit).toBe(20);
    expect(body.cursor).toBe('previous');
    expect(Object.keys(body).sort()).toEqual(['cursor', 'filter', 'limit']);
    expect(predicates(body.filter)).toEqual([
      ['eq', 'authority', 'treasury@banking.retail'], ['eq', 'contract_address', 'tairac1router'],
      ['eq', 'contract_alias', 'router'], ['eq', 'contract_entrypoint', 'swap'], ['eq', 'result_ok', true],
      ['gte', 'timestamp_ms', 100], ['lte', 'timestamp_ms', 200],
    ]);
    expect(result).toEqual({ status: 'ok', data: { items: [activity], nextCursor: 'next' } });
  });

  it('requests event history with all authoritative selectors and no invented count', async () => {
    const spy = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [event], next_cursor: null }));
    globalThis.fetch = spy;
    const result = await fetchContractEvents({
      limit: 10, authority: 'treasury@banking.retail', contract_address: 'tairac1router',
      contract_alias: 'router', module: 'router', event_kind: 'swap_failed',
      participant: 'treasury@banking.retail', asset_id: 'usd#issuer.main', provenance: 'derived',
      since_timestamp_ms: 100, until_timestamp_ms: 200, result_ok: false,
    });
    expect(new URL(String(spy.mock.calls[0][0])).pathname).toBe('/v1/contracts/events/query');
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(Object.keys(body).sort()).toEqual(['filter', 'limit']);
    expect(predicates(body.filter)).toEqual([
      ['eq', 'authority', 'treasury@banking.retail'], ['eq', 'contract_address', 'tairac1router'],
      ['eq', 'contract_alias', 'router'], ['eq', 'module', 'router'], ['eq', 'event_kind', 'swap_failed'],
      ['eq', 'participants', 'treasury@banking.retail'], ['eq', 'asset_ids', 'usd#issuer.main'],
      ['eq', 'provenance', 'derived'], ['eq', 'result_ok', false],
      ['gte', 'timestamp_ms', 100], ['lte', 'timestamp_ms', 200],
    ]);
    expect(result).toEqual({ status: 'ok', data: { items: [event], nextCursor: null } });
  });

  it('rejects the retired exact-count envelope rather than fabricating a continuation', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [], total: 0, has_more: false, count_mode: 'exact' }));
    await expect(fetchContractActivity({ limit: 10 })).rejects.toThrow();
  });

  it('passes one AbortSignal-backed stream through the SDK and validates decoded events', async () => {
    const controller = new AbortController();
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'streamContractEvents').mockImplementation((async function* () {
      yield {
        event: 'contract_event',
        data: event,
        id: event.event_id,
        retry: null,
        raw: JSON.stringify(event),
      };
    }) as typeof ToriiBrowserClient.prototype.streamContractEvents);

    const iterator = streamContractEvents({
      module: 'router',
      event_kind: 'swap_failed',
      provenance: 'derived',
    }, controller.signal);
    const first = await iterator.next();

    expect(spy).toHaveBeenCalledWith({
      authority: undefined,
      contractAddress: undefined,
      contractAlias: undefined,
      module: 'router',
      eventKind: 'swap_failed',
      participant: undefined,
      assetId: undefined,
      provenance: 'derived',
      sinceTimestampMs: undefined,
      untilTimestampMs: undefined,
      resultOk: undefined,
      signal: controller.signal,
    });
    expect(first.done).toBe(false);
    expect(first.value?.data).toEqual(event);
  });

  it('terminates a stream item that does not satisfy the contract event schema', async () => {
    vi.spyOn(ToriiBrowserClient.prototype, 'streamContractEvents').mockImplementation((async function* () {
      yield { event: 'contract_event', data: { event_id: 'broken' }, id: null, raw: '{}' };
    }) as typeof ToriiBrowserClient.prototype.streamContractEvents);

    await expect(streamContractEvents({}).next()).rejects.toThrow();
  });

  it('uses one direct fetch and forwards the caller AbortSignal without reconnecting', async () => {
    const abortController = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const encoder = new TextEncoder();
    globalThis.fetch = vi.fn(async (_input, init) => {
      requestSignal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: contract_event\ndata: ${JSON.stringify(event)}\n\n`));
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
        },
      }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const iterator = streamContractEvents({ module: 'router' }, abortController.signal);
    expect((await iterator.next()).value?.data.event_id).toBe(event.event_id);
    expect(requestSignal).toBe(abortController.signal);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    abortController.abort(new DOMException('stopped', 'AbortError'));
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed live-stream connection', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('network unavailable');
    });

    await expect(streamContractEvents({ event_kind: 'swap' }).next()).rejects.toThrow('network unavailable');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
