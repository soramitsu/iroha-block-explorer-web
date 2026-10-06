import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('application bootstrap', () => {
  const bpngConfig = {
    toriiBaseUrl: 'https://taira.sora.org',
    toriiForceBaseUrl: true,
    networkId: `hash:${'AB'.repeat(32)}#B99E`,
    networkPrefix: 369,
  };
  const savedEndpoint = 'https://saved-other-testnet.example';
  let events: string[];
  let storage: Map<string, string>;
  let mount: ReturnType<typeof vi.fn>;
  let setToriiBaseUrlFromConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    events = [];
    storage = new Map([['torii_base_url', savedEndpoint]]);
    mount = vi.fn(() => events.push('mount'));
    setToriiBaseUrlFromConfig = vi.fn(() => events.push('apply-config'));
    const root = document.createElement('div');
    root.id = 'app';
    document.body.replaceChildren(root);
    vi.stubGlobal('window', {
      location: { hostname: 'explorer-bpng.soramitsu.io' },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('vue', () => ({ createApp: () => ({ use: vi.fn(), mount }) }));
    vi.doMock('@/shared/api', () => {
      events.push('api-import');
      return { setToriiBaseUrlFromConfig };
    });
    vi.doMock('./App.vue', () => {
      events.push('app-import');
      return { default: {} };
    });
    vi.doMock('./router', () => {
      events.push('router-import');
      return { default: {} };
    });
    vi.doMock('@/shared/lib/localization', () => ({
      ensureLocaleLoaded: vi.fn(),
      i18n: { global: { locale: { value: 'en' } } },
    }));
  });

  afterEach(async () => {
    // main.ts starts bootstrap without exporting its promise. Finish its import
    // chain before replacing mocks or per-test state, even when an assertion fails.
    await vi.dynamicImportSettled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.doUnmock('vue');
    vi.doUnmock('@/shared/api');
    vi.doUnmock('./App.vue');
    vi.doUnmock('./router');
    vi.doUnmock('@/shared/lib/localization');
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('applies the forced Taira URL before importing API consumers or mounting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => bpngConfig }));

    await import('./main');
    await vi.dynamicImportSettled();
    expect(mount).toHaveBeenCalledWith('#app');

    expect(setToriiBaseUrlFromConfig).toHaveBeenCalledExactlyOnceWith('https://taira.sora.org', { force: true });
    expect(events.slice(0, 2)).toEqual(['api-import', 'apply-config']);
    expect(events.indexOf('app-import')).toBeGreaterThan(events.indexOf('apply-config'));
    expect(events.indexOf('router-import')).toBeGreaterThan(events.indexOf('apply-config'));
    expect(events.at(-1)).toBe('mount');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('waits for a deferred API import before loading consumers and mounting', async () => {
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    vi.doMock('@/shared/api', async () => {
      entered.resolve(undefined);
      await release.promise;
      events.push('api-import');
      return { setToriiBaseUrlFromConfig };
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => bpngConfig }));

    await import('./main');
    try {
      await entered.promise;
      expect(events).toEqual([]);
      expect(mount).not.toHaveBeenCalled();
    } finally {
      release.resolve(undefined);
    }
    await vi.dynamicImportSettled();

    expect(setToriiBaseUrlFromConfig).toHaveBeenCalledExactlyOnceWith('https://taira.sora.org', { force: true });
    expect(events.slice(0, 2)).toEqual(['api-import', 'apply-config']);
    expect(events.indexOf('app-import')).toBeGreaterThan(events.indexOf('apply-config'));
    expect(events.indexOf('router-import')).toBeGreaterThan(events.indexOf('apply-config'));
    expect(mount).toHaveBeenCalledExactlyOnceWith('#app');
    expect(events.at(-1)).toBe('mount');
  });

  it.each([
    ['malformed JSON', { ok: true, json: async () => { throw new SyntaxError('private-config-body'); } }],
    ['invalid NetworkId', { ok: true, json: async () => ({ ...bpngConfig, networkId: 'private-config-body' }) }],
    ['missing prefix', { ok: true, json: async () => ({ ...bpngConfig, networkPrefix: undefined }) }],
    ['wrong prefix', { ok: true, json: async () => ({ ...bpngConfig, networkPrefix: 0 }) }],
    ['unforced profile', { ok: true, json: async () => ({ ...bpngConfig, toriiForceBaseUrl: false }) }],
    ['missing BPNG config', { ok: false, status: 404 }],
    ['unavailable config', { ok: false, status: 503 }],
  ])('shows a safe error for %s without loading the stored endpoint', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await import('./main');
    await vi.dynamicImportSettled();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();

    expect(document.body.textContent).toContain('Explorer could not start');
    expect(document.body.textContent).not.toContain('private-config-body');
    expect(document.body.textContent).not.toContain(savedEndpoint);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-config-body');
    expect(console.error).toHaveBeenCalledWith(
      '[bootstrap] Explorer initialization failed. Check deployment configuration and connectivity.'
    );
    expect(events).toEqual([]);
    expect(setToriiBaseUrlFromConfig).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(storage.get('torii_base_url')).toBe(savedEndpoint);
  });

  it('rejects a generic profile without its selected prefix before importing consumers', async () => {
    window.location.hostname = 'explorer.example';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...bpngConfig, networkPrefix: undefined }),
    }));

    await import('./main');
    await vi.dynamicImportSettled();

    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(events).toEqual([]);
    expect(mount).not.toHaveBeenCalled();
  });

  it('retries the config request explicitly and starts only after a valid forced profile', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('private-transport-details'))
      .mockResolvedValueOnce({ ok: true, json: async () => bpngConfig });
    vi.stubGlobal('fetch', fetchMock);

    await import('./main');
    await vi.dynamicImportSettled();
    expect(document.querySelector('button')).not.toBeNull();
    expect(events).toEqual([]);
    const retry = document.querySelector('button') as HTMLButtonElement;
    retry.click();
    expect(retry.disabled).toBe(true);
    await vi.dynamicImportSettled();
    expect(mount).toHaveBeenCalledOnce();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/config.json', '/config.json']);
    expect(setToriiBaseUrlFromConfig).toHaveBeenCalledExactlyOnceWith('https://taira.sora.org', { force: true });
    expect(events.slice(0, 2)).toEqual(['api-import', 'apply-config']);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-transport-details');
  });

  it('keeps a retry available after another failed configuration load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await import('./main');
    await vi.dynamicImportSettled();
    expect(document.querySelector('button')).not.toBeNull();
    const firstRetry = document.querySelector('button') as HTMLButtonElement;
    firstRetry.click();
    await vi.dynamicImportSettled();
    expect(document.querySelector('button')).not.toBe(firstRetry);

    expect((document.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
    expect(events).toEqual([]);
    expect(mount).not.toHaveBeenCalled();
  });

  it('retries a downstream configuration failure without refetching valid runtime configuration', async () => {
    setToriiBaseUrlFromConfig.mockImplementationOnce(() => { throw new Error('private-api-config'); })
      .mockImplementation(() => events.push('apply-config'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => bpngConfig });
    vi.stubGlobal('fetch', fetchMock);
    await import('./main');
    await vi.dynamicImportSettled();
    expect(mount).not.toHaveBeenCalled();
    (document.querySelector('button') as HTMLButtonElement).click();
    await vi.dynamicImportSettled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(setToriiBaseUrlFromConfig).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledExactlyOnceWith('#app');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-api-config');
  });
});
