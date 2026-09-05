import { describe, expect, it, vi } from 'vitest';
import { NOT_FOUND, UNKNOWN_ERROR } from '@/shared/api/consts';
import { transformErrorResponse } from './transform-error-response';

describe('transformErrorResponse', () => {
  it('maps 404 responses to the shared not-found sentinel without reading the body', async () => {
    const response = new Response('missing', { status: 404 });
    const textSpy = vi.spyOn(response, 'text');

    await expect(transformErrorResponse(response)).resolves.toEqual({ status: NOT_FOUND });
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('wraps non-404 responses as unknown errors using the response body text', async () => {
    const response = new Response('upstream exploded', { status: 500 });

    const result = await transformErrorResponse(response);

    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status !== UNKNOWN_ERROR) throw new Error('expected unknown error response');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('upstream exploded');
  });
});
