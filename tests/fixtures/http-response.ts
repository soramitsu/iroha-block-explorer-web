/** Real Fetch responses whose byte streams belong to the test's browser realm. */
export function testResponse(body: string | Uint8Array | null, init?: ResponseInit): Response {
  const bytes =
    body === null ? null : Uint8Array.from(typeof body === 'string' ? new TextEncoder().encode(body) : body);
  const stream =
    bytes === null
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        });
  return new Response(stream, init);
}

/** Encode the fixture through the same byte-stream boundary used by HTTP JSON. */
export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  return testResponse(JSON.stringify(value), { ...init, headers });
}
