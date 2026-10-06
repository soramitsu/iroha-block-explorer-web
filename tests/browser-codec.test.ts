import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToriiBrowserClient } from '@iroha/iroha-js/torii-browser';
import { jsonResponse } from './fixtures/http-response';

afterEach(() => vi.restoreAllMocks());

describe('package-owned browser HTTP client startup', () => {
  it('reads an Explorer collection without codec initialization or asset downloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      items: [{ height: '7' }], next_cursor: null,
    }));
    const client = new ToriiBrowserClient('https://taira.sora.org', { fetchImpl });
    const page = await client.explorerBlocks.list({ limit: 1 });
    expect(page.items).toEqual([{ height: '7' }]);
    expect(page.nextCursor).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/explorer/blocks/query');
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ limit: 1 });
  });

  it('imports and constructs a fresh HTTP client without network requests', async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { ToriiBrowserClient: BrowserClient } = await import('@iroha/iroha-js/torii-browser');
    const client = new BrowserClient('https://taira.sora.org');
    expect(client.explorerBlocks).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
