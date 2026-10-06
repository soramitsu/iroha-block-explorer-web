import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('runtime config', () => {
  const legacyNetworkId = '11'.repeat(32);
  const checkedNetworkId = `hash:${'AB'.repeat(32)}#B99E`;
  const configurationError = 'Explorer runtime configuration is unavailable or invalid.';
  const genericConfig = {
    toriiBaseUrl: 'https://taira.sora.org',
    toriiForceBaseUrl: true,
    networkId: checkedNetworkId,
    networkPrefix: 369,
  };
  const tairaConfig = {
    toriiBaseUrl: 'https://taira.sora.org',
    toriiForceBaseUrl: true,
    networkId: checkedNetworkId,
    networkPrefix: 369,
  };
  const cbsiConfig = {
    toriiBaseUrl: 'https://bokolo.soramitsu.io',
    toriiForceBaseUrl: true,
    networkId: checkedNetworkId,
    networkPrefix: 42, // Synthetic fixture; CBSI deployment must supply its authenticated prefix.
  };

  function useHost(hostname: string) {
    vi.stubGlobal('window', {
      location: { hostname },
      setTimeout: (handler: () => void, delay: number) => globalThis.setTimeout(handler, delay),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
    });
  }

  beforeEach(() => useHost('explorer.example'));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads and exposes valid config.json values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        toriiEconometricsEndpointsEnabled: true,
        toriiBaseUrl: 'https://torii.example',
        networkId: checkedNetworkId,
        networkPrefix: 369,
        kotodamaCompilerUrl: 'https://compiler.example',
        sorafsPublicBaseUrl: 'https://cdn.example',
        toriiFailoverEnabled: true,
        toriiFailoverNodes: ['https://nexus.mof3.sora.org:18080', 'https://testus.mof3.sora.org:18080'],
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
    expect(module.getRuntimeConfig().toriiEconometricsEndpointsEnabled).toBe(true);
    expect(module.getRuntimeConfig().toriiBaseUrl).toBe('https://torii.example');
    expect(module.getRuntimeConfig().networkId).toBe(checkedNetworkId);
    expect(module.getRuntimeConfig().kotodamaCompilerUrl).toBe('https://compiler.example');
    expect(module.getRuntimeConfig().sorafsPublicBaseUrl).toBe('https://cdn.example');
    expect(module.getRuntimeConfig().toriiFailoverEnabled).toBe(true);
    expect(module.getRuntimeConfig().toriiFailoverNodes).toEqual([
      'https://nexus.mof3.sora.org:18080',
      'https://testus.mof3.sora.org:18080',
    ]);
    expect(module.getRuntimeConfig().toriiFailoverFailureThreshold).toBe(5);
    expect(module.getRuntimeConfig().toriiRequestTimeoutMs).toBe(5000);
    expect(module.getRuntimeConfig().toriiRequestRetryCount).toBe(1);
    expect(module.getRuntimeConfig().toriiRequestRetryBaseDelayMs).toBe(200);
  });

  it('rejects missing configuration outside a pinned Taira host', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('rejects unknown public fields instead of retaining accidental secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        toriiBaseUrl: 'https://torii.example',
        operatorToken: 'must-not-be-public',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it.each([
    ['uppercase', 'AA'.repeat(32)],
    ['wrong length', '11'.repeat(31)],
    ['unmarked final byte', `${'11'.repeat(31)}10`],
  ])('rejects an invalid non-pinned %s NetworkId binding', async (_label, invalidNetworkId) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        toriiBaseUrl: 'https://torii.example',
        networkId: invalidNetworkId,
        networkPrefix: 369,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('rejects retired raw lowercase NetworkId outside a pinned Taira host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ networkId: legacyNetworkId, networkPrefix: 369 }),
    }));
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('accepts and preserves a checked v4 NetworkId outside a pinned Taira host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ networkId: checkedNetworkId, networkPrefix: 369 }),
    }));
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).resolves.toMatchObject({ networkId: checkedNetworkId });
    expect(module.getRuntimeConfig().networkId).toBe(checkedNetworkId);
  });

  it('rejects malformed JSON without exposing its body or using another config path', async () => {
    vi.stubEnv('BASE_URL', '/explorer/');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('private-response-content'); },
    });
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/explorer/config.json', expect.any(Object));
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it.each([400, 401, 403, 429, 500, 502, 503])('rejects HTTP %s without a config fallback', async (status) => {
    vi.stubEnv('BASE_URL', '/explorer/');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('rejects a missing subpath config without requesting another configuration location', async () => {
    vi.stubEnv('BASE_URL', '/explorer/');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/explorer/config.json']);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('rejects a network error and permits an explicit fresh retry at the same location', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('private-transport-details'))
      .mockResolvedValueOnce({ ok: true, json: async () => genericConfig });
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    expect(module.getRuntimeConfig()).toEqual({});
    await expect(module.loadRuntimeConfig()).resolves.toEqual(genericConfig);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/config.json', '/config.json']);
  });

  it('rejects timeout instead of starting with empty configuration', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('private-timeout-details')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    const rejectedLoad = expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
    await vi.advanceTimersByTimeAsync(1500);
    await rejectedLoad;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(module.getRuntimeConfig()).toEqual({});
  });

  it('shares and caches a successful configuration load', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => genericConfig });
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./runtime-config');

    await expect(Promise.all([module.loadRuntimeConfig(), module.loadRuntimeConfig()]))
      .resolves.toEqual([genericConfig, genericConfig]);
    await expect(module.loadRuntimeConfig()).resolves.toEqual(genericConfig);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe.each(['taira-explorer.sora.org', 'explorer-bpng.soramitsu.io'])('%s profile', (hostname) => {
    beforeEach(() => useHost(hostname));

    it('requires config even when it returns 404 and never retries another config path', async () => {
      vi.stubEnv('BASE_URL', '/explorer/');
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', fetchMock);
      const module = await import('./runtime-config');

      await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/explorer/config.json']);
      expect(module.getRuntimeConfig()).toEqual({});
    });

    it.each([
      ['missing prefix', { toriiBaseUrl: tairaConfig.toriiBaseUrl, toriiForceBaseUrl: true, networkId: checkedNetworkId }],
      ['invalid selected prefix 0', { ...tairaConfig, networkPrefix: 0 }],
      ['invalid selected prefix 1', { ...tairaConfig, networkPrefix: 1 }],
      ['invalid selected prefix 65535', { ...tairaConfig, networkPrefix: 65535 }],
      ['invalid selected prefix -1', { ...tairaConfig, networkPrefix: -1 }],
      ['invalid selected prefix 65536', { ...tairaConfig, networkPrefix: 65536 }],
      ['invalid selected prefix 369', { ...tairaConfig, networkPrefix: '369' }],
      ['invalid selected prefix null', { ...tairaConfig, networkPrefix: null }],
      ['invalid selected prefix 1.5', { ...tairaConfig, networkPrefix: 1.5 }],
      ['empty profile', {}],
      ['missing endpoint', { toriiForceBaseUrl: true, networkId: checkedNetworkId }],
      ['missing forced binding', { toriiBaseUrl: tairaConfig.toriiBaseUrl, networkId: checkedNetworkId }],
      ['unforced endpoint', { ...tairaConfig, toriiForceBaseUrl: false }],
      ['missing NetworkId', { toriiBaseUrl: tairaConfig.toriiBaseUrl, toriiForceBaseUrl: true }],
      ['raw lowercase NetworkId', { ...tairaConfig, networkId: legacyNetworkId }],
      ['raw uppercase NetworkId', { ...tairaConfig, networkId: 'AB'.repeat(32) }],
      ['lowercase literal body', { ...tairaConfig, networkId: `hash:${'ab'.repeat(32)}#B99E` }],
      ['lowercase literal checksum', { ...tairaConfig, networkId: `hash:${'AB'.repeat(32)}#b99E` }],
      ['invalid checksum', { ...tairaConfig, networkId: checkedNetworkId.replace(/B99E$/u, '0000') }],
      ['missing checksum', { ...tairaConfig, networkId: `hash:${'AB'.repeat(32)}` }],
      ['unmarked checked hash', { ...tairaConfig, networkId: `hash:${'10'.repeat(32)}#2B24` }],
      ['surrounding NetworkId whitespace', { ...tairaConfig, networkId: ` ${checkedNetworkId}` }],
      ['alternate endpoint', { ...tairaConfig, toriiBaseUrl: 'https://other-torii.example' }],
      ['relative endpoint', { ...tairaConfig, toriiBaseUrl: '/v1/explorer' }],
      ['same-origin proxy', { ...tairaConfig, toriiBaseUrl: `https://${hostname}` }],
      ['insecure endpoint', { ...tairaConfig, toriiBaseUrl: 'http://taira.sora.org' }],
      ['endpoint URL suffix', { ...tairaConfig, toriiBaseUrl: 'https://taira.sora.org/' }],
      ['endpoint API path', { ...tairaConfig, toriiBaseUrl: 'https://taira.sora.org/v1/explorer' }],
      ['endpoint whitespace', { ...tairaConfig, toriiBaseUrl: ' https://taira.sora.org' }],
      ['failover enabled', { ...tairaConfig, toriiFailoverEnabled: true }],
      ['failover disabled setting', { ...tairaConfig, toriiFailoverEnabled: false }],
      ['failover nodes', { ...tairaConfig, toriiFailoverNodes: [] }],
      ['optional settings', { ...tairaConfig, toriiRequestTimeoutMs: 5000 }],
    ])('rejects %s', async (_label, config) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => config });
      vi.stubGlobal('fetch', fetchMock);
      const module = await import('./runtime-config');

      await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(module.getRuntimeConfig()).toEqual({});
    });

    it('loads the exact complete direct Taira profile', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => tairaConfig }));
      const module = await import('./runtime-config');

      await expect(module.loadRuntimeConfig()).resolves.toEqual(tairaConfig);
      expect(module.getRuntimeConfig()).toEqual(tairaConfig);
      expect(module.getRuntimeConfig().networkId).toBe(checkedNetworkId);
    });
  });

  describe('bokolo-explorer.soramitsu.io profile', () => {
    beforeEach(() => useHost('bokolo-explorer.soramitsu.io'));

    it('loads only the direct CBSI Torii origin with an explicit checked identity and prefix', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => cbsiConfig }));
      const module = await import('./runtime-config');

      await expect(module.loadRuntimeConfig()).resolves.toEqual(cbsiConfig);
      expect(module.getRuntimeConfig().networkId).toBe(checkedNetworkId);
      expect(module.getRuntimeNetworkPrefix()).toBe(42);
    });

    it.each([
      ['missing config', null],
      ['missing endpoint', { toriiForceBaseUrl: true, networkId: checkedNetworkId, networkPrefix: 42 }],
      ['public Taira endpoint', { ...cbsiConfig, toriiBaseUrl: 'https://taira.sora.org' }],
      ['same-origin Explorer endpoint', { ...cbsiConfig, toriiBaseUrl: 'https://bokolo-explorer.soramitsu.io' }],
      ['relative endpoint', { ...cbsiConfig, toriiBaseUrl: '/v1/explorer' }],
      ['insecure endpoint', { ...cbsiConfig, toriiBaseUrl: 'http://bokolo.soramitsu.io' }],
      ['trailing slash', { ...cbsiConfig, toriiBaseUrl: 'https://bokolo.soramitsu.io/' }],
      ['unforced endpoint', { ...cbsiConfig, toriiForceBaseUrl: false }],
      ['missing identity', { ...cbsiConfig, networkId: undefined }],
      ['raw identity', { ...cbsiConfig, networkId: legacyNetworkId }],
      ['missing prefix', { ...cbsiConfig, networkPrefix: undefined }],
      ['string prefix', { ...cbsiConfig, networkPrefix: '42' }],
      ['extra failover setting', { ...cbsiConfig, toriiFailoverEnabled: true }],
      ['extra dataspace setting', { ...cbsiConfig, dataspaceId: 'cbsi' }],
    ])('rejects %s', async (_label, config) => {
      const fetchMock = vi.fn().mockResolvedValue(
        config === null ? { ok: false, status: 404 } : { ok: true, json: async () => config }
      );
      vi.stubGlobal('fetch', fetchMock);
      const module = await import('./runtime-config');

      await expect(module.loadRuntimeConfig()).rejects.toThrow(configurationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(module.getRuntimeConfig()).toEqual({});
    });
  });
});
