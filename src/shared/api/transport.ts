/** Deadline and caller cancellation cover the request and returned byte stream.
 * Retrying is limited to uncredentialed, unsigned GET/HEAD requests, before a
 * response is handed to its consumer. Body errors never replay a request. */
export interface ToriiRequestPolicy {
  timeoutMs: number;
  retryCount: number;
  retryBaseDelayMs: number;
}
export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}
const RETRY_STATUSES = new Set([502, 503, 504, 522, 524]);

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}
function cancelBody(response: Response, reason?: unknown): void {
  if (response.body) response.body.cancel(reason).catch(() => {});
}

/** Inspect the effective request before deciding whether replay is safe. */
export function canRetryToriiRead(input: RequestInfo | URL, init: RequestInit): boolean {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
  if (
    !['GET', 'HEAD'].includes(method) ||
    [init.body, request?.body].some((body) => body !== undefined && body !== null) ||
    (init.redirect ?? request?.redirect) === 'error' ||
    (init.credentials ?? request?.credentials) === 'include'
  )
    return false;
  return hasReplayableHeaders(new Headers(init.headers ?? request?.headers));
}

function hasReplayableHeaders(headers: Headers): boolean {
  let replayable = true;
  headers.forEach((_value, name) => {
    if (
      ['authorization', 'proxy-authorization', 'cookie', 'idempotency-key'].includes(name) ||
      name.startsWith('x-iroha-') ||
      ['x-api-key', 'x-api-token'].includes(name)
    )
      replayable = false;
  });
  return replayable;
}

function validatePolicy(policy: ToriiRequestPolicy): void {
  for (const [name, value, minimum, maximum] of [
    ['timeoutMs', policy.timeoutMs, 1, 300_000],
    ['retryCount', policy.retryCount, 0, 5],
    ['retryBaseDelayMs', policy.retryBaseDelayMs, 0, 30_000],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new TypeError(`Invalid Torii request policy ${name}`);
    }
  }
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Even a custom fetch which ignores its signal cannot outlive cancellation;
 * the real fetch still receives the combined signal and is actually aborted. */
function requestHeaders(input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    let settled = false;
    const onAbort = () => {
      settled = true;
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw abortReason(signal);
        return fetch(input, { ...init, signal });
      })
      .then(
        (response) => {
          signal.removeEventListener('abort', onAbort);
          if (settled || signal.aborted) {
            cancelBody(response, abortReason(signal));
            return;
          }
          settled = true;
          resolve(response);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          if (settled) return;
          settled = true;
          reject(signal.aborted ? abortReason(signal) : error);
        }
      );
  });
}

function retainResponseMetadata(target: Response, source: Response): Response {
  Object.defineProperties(target, {
    url: { value: source.url },
    redirected: { value: source.redirected },
    type: { value: source.type },
    clone: { value: () => retainResponseMetadata(Response.prototype.clone.call(target), source) },
  });
  return target;
}

function deadlineResponse(response: Response, controller: AbortController, cleanup: () => void): Response {
  if (!response.body) {
    cleanup();
    return response;
  }
  const reader = response.body.getReader();
  const signal = controller.signal;
  let ended = false;
  let output: ReadableStreamDefaultController<Uint8Array>;
  const finish = () => {
    if (ended) return;
    ended = true;
    signal.removeEventListener('abort', onAbort);
    cleanup();
  };
  const cancelReader = (reason: unknown) => {
    reader.cancel(reason).catch(() => {});
  };
  const onAbort = () => {
    if (ended) return;
    const reason = abortReason(signal);
    output.error(reason);
    finish();
    cancelReader(reason);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      output = streamController;
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    },
    async pull() {
      if (ended) return;
      try {
        const result = await reader.read();
        if (ended) return;
        if (signal.aborted) {
          onAbort();
          return;
        }
        if (result.done) {
          output.close();
          finish();
        } else output.enqueue(result.value);
      } catch (error) {
        if (ended) return;
        output.error(signal.aborted ? abortReason(signal) : error);
        finish();
        cancelReader(error);
      }
    },
    cancel(reason) {
      if (ended) return;
      finish();
      controller.abort(reason);
      cancelReader(reason);
    },
  });
  return retainResponseMetadata(
    new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
    response
  );
}

/** One deadline bounds all attempts, backoff, and the final response body. */
export async function fetchToriiWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit,
  policy: ToriiRequestPolicy
): Promise<Response> {
  validatePolicy(policy);
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const caller = init.signal === undefined ? request?.signal : init.signal;
  if (caller?.aborted) throw abortReason(caller);
  const retries = canRetryToriiRead(input, init) ? policy.retryCount : 0;
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(caller ? abortReason(caller) : undefined);
  caller?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new RequestTimeoutError(policy.timeoutMs)), policy.timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    caller?.removeEventListener('abort', onCallerAbort);
  };
  try {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await requestHeaders(input, init, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        // Fetch transport failures are TypeError. HTTP/auth/schema/programming
        // failures and caller AbortError are terminal, never generic retries.
        if (!(error instanceof TypeError) || attempt >= retries) throw error;
        await waitForRetry(policy.retryBaseDelayMs * (attempt + 1), controller.signal);
        continue;
      }
      if (controller.signal.aborted) {
        cancelBody(response, abortReason(controller.signal));
        throw abortReason(controller.signal);
      }
      if (attempt < retries && RETRY_STATUSES.has(response.status)) {
        cancelBody(response);
        await waitForRetry(policy.retryBaseDelayMs * (attempt + 1), controller.signal);
        continue;
      }
      return deadlineResponse(response, controller, cleanup);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
}
