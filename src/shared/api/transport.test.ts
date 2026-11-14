// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRetryToriiRead, fetchToriiWithDeadline, RequestTimeoutError } from './transport';

const policy = { timeoutMs: 1_000, retryCount: 2, retryBaseDelayMs: 10 };
const url = 'https://taira.example.invalid/v1/explorer/accounts';
const fetchMock = vi.fn<typeof fetch>();

function request(init: RequestInit = {}, overrides: Partial<typeof policy> = {}) {
  return fetchToriiWithDeadline(url, init, { ...policy, ...overrides });
}

function stalled(onCancel = vi.fn()) {
  return new Response(new ReadableStream<Uint8Array>({ cancel: onCancel }));
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Torii request cancellation and deadline', () => {
  it('does not start an already cancelled request', async () => {
    const caller = new AbortController();
    const reason = new Error('explicit cancellation');
    caller.abort(reason);
    await expect(request({ signal: caller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts the real fetch and rejects even when a custom fetch ignores its signal', async () => {
    fetchMock.mockImplementation(async () => await new Promise(() => {}));
    const caller = new AbortController();
    const pending = request({ signal: caller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a late response after the caller has stopped waiting', async () => {
    const gate = Promise.withResolvers<Response>();
    const cancelled = vi.fn();
    fetchMock.mockReturnValue(gate.promise);
    const caller = new AbortController();
    const pending = request({ signal: caller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await rejected;
    gate.resolve(stalled(cancelled));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the Request signal when init does not override it', async () => {
    fetchMock.mockResolvedValue(stalled());
    const caller = new AbortController();
    const response = await fetchToriiWithDeadline(new Request(url, { signal: caller.signal }), {}, policy);
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('uses an explicit init signal in preference to the Request signal', async () => {
    const original = new AbortController();
    original.abort();
    const override = new AbortController();
    fetchMock.mockResolvedValue(stalled());
    const response = await fetchToriiWithDeadline(
      new Request(url, { signal: original.signal }),
      { signal: override.signal },
      policy
    );
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    override.abort();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('permits an explicit null signal to detach the Request signal', async () => {
    const original = new AbortController();
    original.abort();
    fetchMock.mockResolvedValue(new Response('done'));
    const response = await fetchToriiWithDeadline(
      new Request(url, { signal: original.signal }),
      { signal: null },
      policy
    );
    expect(await response.text()).toBe('done');
  });

  it('cancels a pending body read as soon as the caller aborts', async () => {
    const cancelled = vi.fn();
    fetchMock.mockResolvedValue(stalled(cancelled));
    const caller = new AbortController();
    const response = await request({ signal: caller.signal });
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await rejected;
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('times out a fetch that never returns headers without replaying it', async () => {
    fetchMock.mockImplementation(async () => await new Promise(() => {}));
    const rejected = expect(request()).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(policy.timeoutMs);
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the same deadline active after headers through body consumption', async () => {
    const cancelled = vi.fn();
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 700);
      });
      return stalled(cancelled);
    });
    const pending = request();
    await vi.advanceTimersByTimeAsync(700);
    const response = await pending;
    const rejected = expect(response.json()).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(300);
    await rejected;
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes every retry delay in one total deadline', async () => {
    fetchMock.mockImplementation(async () => new Response('busy', { status: 503 }));
    const rejected = expect(request({}, { retryCount: 5, retryBaseDelayMs: 2_000 })).rejects.toBeInstanceOf(
      RequestTimeoutError
    );
    await vi.advanceTimersByTimeAsync(policy.timeoutMs);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not start another attempt when cancelled during retry backoff', async () => {
    fetchMock.mockImplementation(async () => new Response('busy', { status: 503 }));
    const caller = new AbortController();
    const rejected = expect(request({ signal: caller.signal }, { retryBaseDelayMs: 100 })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(50);
    caller.abort();
    await rejected;
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the underlying request when the consumer cancels the body', async () => {
    const cancelled = vi.fn();
    fetchMock.mockResolvedValue(stalled(cancelled));
    const response = await request();
    await response.body?.cancel('consumer done');
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledWith('consumer done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the deadline and caller listener on body completion', async () => {
    fetchMock.mockResolvedValue(new Response('done'));
    const caller = new AbortController();
    const response = await request({ signal: caller.signal });
    expect(await response.text()).toBe('done');
    caller.abort();
    await vi.runAllTimersAsync();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Torii bounded read retries', () => {
  it.each([502, 503, 504, 522, 524])('cancels HTTP %i body before retrying an anonymous read', async (status) => {
    const cancelled = vi.fn();
    fetchMock
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelled }), { status }))
      .mockResolvedValueOnce(new Response('{"items":[]}'));
    const pending = request({ headers: { Accept: 'application/json' } }).then((response) => response.json());
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('bounds retries of Fetch TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('network fetch failed'));
    const rejected = expect(request()).rejects.toBeInstanceOf(TypeError);
    await vi.runAllTimersAsync();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(policy.retryCount + 1);
  });

  it.each([
    new Error('application failure'),
    new DOMException('cancelled', 'AbortError'),
    new SyntaxError('schema failure'),
  ])('does not retry $name failures', async (error) => {
    fetchMock.mockRejectedValue(error);
    await expect(request()).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404, 409, 429, 500])('does not retry HTTP %i', async (status) => {
    fetchMock.mockResolvedValue(new Response('error', { status }));
    const response = await request();
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const oneShotRequests: RequestInit[] = [
    { method: 'POST', body: 'same-body' },
    { method: 'PUT' },
    { redirect: 'error' },
    { credentials: 'include' },
    { headers: { Authorization: 'Bearer test-only' } },
    { headers: { 'X-Iroha-Nonce': 'test-only' } },
    { headers: { 'X-Iroha-Account': 'test-only' } },
    { headers: { 'X-Iroha-Operator': 'test-only' } },
    { headers: { 'Idempotency-Key': 'test-only' } },
    { headers: { Cookie: 'test-only' } },
    { headers: { 'X-API-Key': 'test-only' } },
    { headers: { 'X-API-Token': 'test-only' } },
  ];
  it.each(oneShotRequests)('does not replay a one-shot or authenticated request: %j', async (init) => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 503 }));
    const response = await request(init);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('busy');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(init.body);
  });

  it('inspects the effective Request method and headers', () => {
    expect(canRetryToriiRead(new Request(url, { headers: { Authorization: 'test-only' } }), {})).toBe(false);
    expect(canRetryToriiRead(new Request(url, { method: 'POST', body: 'test-only' }), {})).toBe(false);
    expect(canRetryToriiRead(url, { method: 'HEAD' })).toBe(true);
  });

  it('never replays a response after a body-stream failure', async () => {
    const failure = new TypeError('stream disconnected');
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(failure);
          },
        })
      )
    );
    const response = await request();
    await expect(response.text()).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never replays a response after JSON parsing fails', async () => {
    fetchMock.mockResolvedValue(new Response('malformed-json'));
    const response = await request();
    await expect(response.json()).rejects.toBeInstanceOf(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unbounded runtime policy before issuing any request', async () => {
    for (const change of [
      { timeoutMs: 0 },
      { timeoutMs: Infinity },
      { retryCount: 6 },
      { retryCount: 1.5 },
      { retryBaseDelayMs: 30_001 },
    ]) {
      await expect(request({}, change)).rejects.toBeInstanceOf(TypeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Response semantics', () => {
  it('preserves status, headers, URL, redirect metadata and cloning', async () => {
    const original = new Response('body', {
      status: 201,
      statusText: 'Created',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'preserved' },
    });
    Object.defineProperties(original, { url: { value: url }, redirected: { value: true }, type: { value: 'cors' } });
    fetchMock.mockResolvedValue(original);
    const response = await request();
    const clone = response.clone();
    for (const value of [response, clone]) {
      expect(value.status).toBe(201);
      expect(value.statusText).toBe('Created');
      expect(value.url).toBe(url);
      expect(value.redirected).toBe(true);
      expect(value.type).toBe('cors');
      expect(value.headers.get('X-Test')).toBe('preserved');
    }
    expect(await Promise.all([response.text(), clone.text()])).toEqual(['body', 'body']);
  });

  it('completes an empty 204 response immediately', async () => {
    const original = new Response(null, { status: 204 });
    fetchMock.mockResolvedValue(original);
    const caller = new AbortController();
    expect(await request({ signal: caller.signal })).toBe(original);
    caller.abort();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
