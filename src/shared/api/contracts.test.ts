import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToriiBrowserClient } from '@iroha/iroha-js/torii-browser';
import { fetchContractActivity, fetchContractEvents, streamContractEvents } from './index';

const nativeFetch = globalThis.fetch;
const authority = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const contractAddress = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const contractAlias = 'router::universal';
const transactionHash = 'ab'.repeat(32);
const blockHash = 'cd'.repeat(32);

function sdkJsonResponse(payload: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let consumed = false;

  return {
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) return { done: true, value: undefined };
            consumed = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
          async cancel() {
            consumed = true;
          },
          releaseLock() {},
        };
      },
    },
    headers: new Headers({ 'content-type': 'application/json' }),
    ok: true,
    redirected: false,
    status: 200,
  } as unknown as Response;
}

const activity = {
  authority,
  timestamp_ms: 123,
  entrypoint_hash: transactionHash,
  result_ok: true,
  contract_address: contractAddress,
  contract_alias: contractAlias,
  contract_entrypoint: 'swap',
  contract_payload: { amount_in: 100 },
  fee_payment: { payer: 'authority' },
};

const event = {
  event_id: `${transactionHash}:0`,
  schema_version: 1,
  provenance: 'derived' as const,
  authority,
  timestamp_ms: 124,
  tx_hash_hex: transactionHash,
  block_height: 9,
  block_hash_hex: blockHash,
  result_ok: false,
  contract_address: contractAddress,
  contract_alias: contractAlias,
  module: 'router',
  event_kind: 'swap_failed',
  participants: [authority],
  asset_ids: ['usd#issuer.main'],
  numeric_fields: { amount_in: 100 },
  payload: { reason: 'slippage' },
  fee_payment: { payer: 'authority' },
};

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = nativeFetch;
});

describe('contract route API wrappers', () => {
  it('requests exact contract activity with route-specific limit/offset filters', async () => {
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'listContractActivity').mockResolvedValue({
      items: [activity],
      total: 41,
      has_more: false,
      count_mode: 'exact',
    });

    const result = await fetchContractActivity({
      page: 3,
      per_page: 20,
      authority,
      contract_address: contractAddress,
      contract_alias: contractAlias,
      contract_entrypoint: 'swap',
      since_timestamp_ms: 100,
      until_timestamp_ms: 200,
      result_ok: true,
    });

    expect(spy).toHaveBeenCalledWith({
      limit: 20,
      offset: 40,
      countMode: 'exact',
      authority,
      contractAddress,
      contractAlias,
      contractEntrypoint: 'swap',
      sinceTimestampMs: 100,
      untilTimestampMs: 200,
      resultOk: true,
    });
    expect(result).toEqual({
      status: 'ok',
      data: { items: [activity], total: 41, has_more: false, count_mode: 'exact' },
    });
  });

  it('requests exact event history with every authoritative event filter', async () => {
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'listContractEvents').mockResolvedValue({
      items: [event],
      total: 11,
      has_more: false,
      count_mode: 'exact',
    });

    const result = await fetchContractEvents({
      page: 2,
      per_page: 10,
      authority,
      contract_address: contractAddress,
      contract_alias: contractAlias,
      module: 'router',
      event_kind: 'swap_failed',
      participant: authority,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      since_timestamp_ms: 100,
      until_timestamp_ms: 200,
      result_ok: false,
    });

    expect(spy).toHaveBeenCalledWith({
      limit: 10,
      offset: 10,
      countMode: 'exact',
      authority,
      contractAddress,
      contractAlias,
      module: 'router',
      eventKind: 'swap_failed',
      participant: authority,
      assetId: 'usd#issuer.main',
      provenance: 'derived',
      sinceTimestampMs: 100,
      untilTimestampMs: 200,
      resultOk: false,
    });
    expect(result.status).toBe('ok');
  });

  it('serializes the authoritative activity fields onto the current Torii route', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        sdkJsonResponse({ items: [activity], total: 1, has_more: false, count_mode: 'exact' })
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    await fetchContractActivity({
      page: 1,
      per_page: 10,
      authority,
      contract_address: contractAddress,
      contract_alias: contractAlias,
      contract_entrypoint: 'swap',
      since_timestamp_ms: 100,
      until_timestamp_ms: 200,
      result_ok: true,
    });

    const input = fetchSpy.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe('/v1/contracts/activity');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '10',
      offset: '0',
      count_mode: 'exact',
      authority,
      contract_address: contractAddress,
      contract_alias: contractAlias,
      contract_entrypoint: 'swap',
      since_timestamp_ms: '100',
      until_timestamp_ms: '200',
      result_ok: 'true',
    });
  });

  it('rejects a bounded payload because exact pagination requires total', async () => {
    vi.spyOn(ToriiBrowserClient.prototype, 'listContractActivity').mockResolvedValue({
      items: [],
      has_more: false,
      count_mode: 'bounded',
    });

    await expect(fetchContractActivity({ page: 1, per_page: 10 })).rejects.toThrow();
  });

  it.each([
    [{ items: Array.from({ length: 11 }, () => activity), total: 11, has_more: false, count_mode: 'exact' as const }],
    [{ items: [activity], total: 0, has_more: false, count_mode: 'exact' as const }],
    [{ items: [activity], total: 2, has_more: false, count_mode: 'exact' as const }],
  ])('rejects contract activity metadata that contradicts the exact request window %#', async (payload) => {
    vi.spyOn(ToriiBrowserClient.prototype, 'listContractActivity').mockResolvedValue(payload);

    await expect(fetchContractActivity({ page: 1, per_page: 10 })).rejects.toThrow();
  });

  it('accepts an empty page beyond the exact total and its false has_more value', async () => {
    vi.spyOn(ToriiBrowserClient.prototype, 'listContractEvents').mockResolvedValue({
      items: [],
      total: 1,
      has_more: false,
      count_mode: 'exact',
    });

    await expect(fetchContractEvents({ page: 2, per_page: 10 })).resolves.toMatchObject({
      status: 'ok',
      data: { items: [], total: 1, has_more: false },
    });
  });

  it.each([
    { page: 0, per_page: 10 },
    { page: 26, per_page: 20 },
    { page: 1, per_page: 501 },
    { page: 1, per_page: 10, contract_alias: ' router::universal' },
    { page: 1, per_page: 10, since_timestamp_ms: 201, until_timestamp_ms: 200 },
    { page: 1, per_page: 10, unexpected: true },
  ])('rejects invalid activity request input before invoking the SDK %#', async (params) => {
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'listContractActivity');

    await expect(fetchContractActivity(params as Parameters<typeof fetchContractActivity>[0])).rejects.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    { page: 0, per_page: 10 },
    { page: 51, per_page: 10 },
    { page: 1, per_page: 10, provenance: 'synthetic' },
    { page: 1, per_page: 10, module: ' router' },
    { page: 1, per_page: 10, module: 'null' },
    { page: 1, per_page: 10, participant: '123' },
    { page: 1, per_page: 10, since_timestamp_ms: -1 },
    { page: 1, per_page: 10, unexpected: true },
  ])('rejects invalid event-history request input before invoking the SDK %#', async (params) => {
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'listContractEvents');

    await expect(fetchContractEvents(params as Parameters<typeof fetchContractEvents>[0])).rejects.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it('passes one AbortSignal-backed stream through the SDK and validates decoded events', async () => {
    const controller = new AbortController();
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'streamContractEvents').mockImplementation(async function* () {
      yield {
        event: 'contract_event',
        data: event,
        id: event.event_id,
        retry: null,
        raw: JSON.stringify(event),
      };
    } as typeof ToriiBrowserClient.prototype.streamContractEvents);

    const iterator = streamContractEvents(
      {
        module: 'router',
        event_kind: 'swap_failed',
        provenance: 'derived',
      },
      controller.signal
    );
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
    vi.spyOn(ToriiBrowserClient.prototype, 'streamContractEvents').mockImplementation(async function* () {
      yield { event: 'contract_event', data: { event_id: 'broken' }, id: null, raw: '{}' };
    } as typeof ToriiBrowserClient.prototype.streamContractEvents);

    await expect(streamContractEvents({}).next()).rejects.toThrow();
  });

  it.each([
    { provenance: 'synthetic' },
    { module: ' router' },
    { since_timestamp_ms: 20, until_timestamp_ms: 10 },
    { unexpected: true },
  ])('rejects invalid live filters before opening a stream %#', async (filters) => {
    const spy = vi.spyOn(ToriiBrowserClient.prototype, 'streamContractEvents');

    await expect(streamContractEvents(filters as Parameters<typeof streamContractEvents>[0]).next()).rejects.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it('uses one direct fetch and forwards the caller AbortSignal without reconnecting', async () => {
    const abortController = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const encoder = new TextEncoder();
    globalThis.fetch = vi.fn(async (_input, init) => {
      requestSignal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`event: contract_event\ndata: ${JSON.stringify(event)}\n\n`));
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }
      );
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
