import { describe, it, expect, vi, afterEach } from 'vitest';

describe('runtime config', () => {
  const networkId = 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('loads and exposes valid config.json values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        networkId,
        toriiBaseUrl: 'https://torii.example',
        kotodamaCompilerUrl: 'https://compiler.example',
        toriiFailoverEnabled: true,
        toriiFailoverNodes: ['https://torii-backup-1.example', 'https://torii-backup-2.example'],
        toriiFailoverFailureThreshold: 5,
        toriiRequestTimeoutMs: 5000,
        toriiRequestRetryCount: 1,
        toriiRequestRetryBaseDelayMs: 200,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await module.loadRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledWith('/config.json', expect.any(Object));
    expect(module.getRuntimeConfig().networkId).toBe(networkId);
    expect(module.getRuntimeConfig().toriiBaseUrl).toBe('https://torii.example');
    expect(module.getRuntimeConfig().kotodamaCompilerUrl).toBe('https://compiler.example');
    expect(module.getRuntimeConfig().toriiFailoverEnabled).toBe(true);
    expect(module.getRuntimeConfig().toriiFailoverNodes).toEqual([
      'https://torii-backup-1.example',
      'https://torii-backup-2.example',
    ]);
    expect(module.getRuntimeConfig().toriiFailoverFailureThreshold).toBe(5);
    expect(module.getRuntimeConfig().toriiRequestTimeoutMs).toBe(5000);
    expect(module.getRuntimeConfig().toriiRequestRetryCount).toBe(1);
    expect(module.getRuntimeConfig().toriiRequestRetryBaseDelayMs).toBe(200);
  });

  it('allows a missing config only when runtime config is explicitly optional for development', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await module.loadRuntimeConfig({ required: false });
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it.each([
    {
      name: 'missing response',
      response: { ok: false, status: 404, json: async () => ({}) },
      message: 'HTTP 404',
    },
    {
      name: 'malformed JSON',
      response: { ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } },
      message: 'bad JSON',
    },
    {
      name: 'invalid contract',
      response: { ok: true, status: 200, json: async () => ({ toriiBaseUrl: 'not-a-url' }) },
      message: 'Runtime config is invalid',
    },
    {
      name: 'missing required identity',
      response: { ok: true, status: 200, json: async () => ({ toriiBaseUrl: 'https://torii.example' }) },
      message: 'requires exact networkId and toriiBaseUrl',
    },
  ])('fails closed for required production config: $name', async ({ response, message }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response) as any);
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig({ required: true })).rejects.toThrow(message);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('loads only the deployment-scoped config path for a subpath build', async () => {
    vi.stubEnv('BASE_URL', '/explorer-iroha2/');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await module.loadRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/explorer-iroha2/config.json', expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalledWith('/config.json', expect.any(Object));
  });

  it.each(['operatorToken', 'toriiFailoverMaxPeerCandidates', 'toriiEconometricsEndpointsEnabled'])(
    'rejects retired or unknown public field %s instead of retaining it',
    async (unknownField) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          toriiBaseUrl: 'https://torii.example',
          [unknownField]: unknownField === 'operatorToken' ? 'must-not-be-public' : 16,
        }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const module = await import('./runtime-config');

      await module.loadRuntimeConfig();
      expect(module.getRuntimeConfig()).toEqual({});
    }
  );

  it.each([
    'backup.example',
    'ftp://backup.example',
    'https://user:secret@backup.example',
    'https://backup.example/v1/explorer',
    'https://backup.example?network=other',
  ])('rejects an inexact failover base URL: %s', async (invalidUrl) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ toriiFailoverNodes: [invalidUrl] }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await module.loadRuntimeConfig();
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it.each(['taira', 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#0000'])(
    'rejects a non-canonical or incorrectly checksummed NetworkId: %s',
    async (invalidNetworkId) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ networkId: invalidNetworkId }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const module = await import('./runtime-config');

      await module.loadRuntimeConfig();
      expect(module.getRuntimeConfig()).toEqual({});
    }
  );
});
