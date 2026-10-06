import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../../tests/fixtures/http-response';

const captured = vi.hoisted(() => ({ fetch: undefined as typeof fetch | undefined }));

vi.mock('@iroha/iroha-js/torii-browser', async importOriginal => {
  const sdk = await importOriginal<typeof import('@iroha/iroha-js/torii-browser')>();
  return {
    ...sdk,
    ToriiBrowserClient: class extends sdk.ToriiBrowserClient {
      constructor(...args: ConstructorParameters<typeof sdk.ToriiBrowserClient>) {
        super(...args);
        captured.fetch = args[1]?.fetchImpl as typeof fetch;
      }
    },
  };
});

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => ({ toriiBaseUrl: 'https://taira.sora.org', toriiForceBaseUrl: true, toriiRequestRetryCount: 0 }),
}));

let api: typeof import('./index');
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  captured.fetch = undefined;
  fetchMock.mockResolvedValue(jsonResponse({
    items: [], next_cursor: null,
  }));
  api = await import('./index');
  await api.fetchBlocks({ limit: 10 });
  expect(captured.fetch).toBeTypeOf('function');
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SDK transport health reporting', () => {
  it.each(['init', 'request'] as const)('does not classify a cancelled %s signal as a Torii outage', async source => {
    const caller = new AbortController();
    caller.abort();
    const pending = source === 'init'
      ? captured.fetch!('https://taira.sora.org/v1/explorer/blocks', { signal: caller.signal })
      : captured.fetch!(new Request('https://taira.sora.org/v1/explorer/blocks', { signal: caller.signal }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.useToriiAvailability().state.value).toBe('healthy');
    expect(api.useToriiAvailability().failureCount.value).toBe(0);
  });

  it('continues to record genuine Fetch transport failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('network fetch failed'));
    await expect(captured.fetch!('https://taira.sora.org/v1/explorer/blocks')).rejects.toBeInstanceOf(TypeError);
    expect(api.useToriiAvailability().failureCount.value).toBe(1);
    expect(api.useToriiAvailability().state.value).toBe('outage');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows cold connections beyond five seconds but bounds the default request at twenty seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => await new Promise(() => {}));
    const pending = captured.fetch!('https://taira.sora.org/v1/explorer/blocks');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'RequestTimeoutError' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api.useToriiAvailability().failureCount.value).toBe(1);
  });

  it('keeps the original twenty-second deadline through delayed headers and body consumption', async () => {
    vi.useFakeTimers();
    const headers = Promise.withResolvers<Response>();
    const cancel = vi.fn();
    fetchMock.mockReturnValue(headers.promise);
    const pending = captured.fetch!('https://taira.sora.org/v1/explorer/blocks');
    await vi.advanceTimersByTimeAsync(12_000);
    headers.resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    const response = await pending;
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'RequestTimeoutError' });
    await vi.advanceTimersByTimeAsync(7999);
    expect(cancel).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still honors caller cancellation immediately during a slow connection', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => await new Promise(() => {}));
    const caller = new AbortController();
    const reason = new Error('navigation cancelled this request');
    const pending = captured.fetch!('https://taira.sora.org/v1/explorer/blocks', { signal: caller.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(7000);
    caller.abort(reason);
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api.useToriiAvailability().failureCount.value).toBe(0);
    expect(api.useToriiAvailability().state.value).toBe('healthy');
  });
});
