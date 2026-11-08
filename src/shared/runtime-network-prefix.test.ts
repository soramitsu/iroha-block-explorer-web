import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('runtime network prefix boundary', () => {
  it('rejects startup without a browser configuration context', async () => {
    vi.stubGlobal('window', undefined);
    const config = await import('./runtime-config');
    await expect(config.loadRuntimeConfig()).rejects.toThrow('configuration is unavailable or invalid');
    expect(() => config.getRuntimeNetworkPrefix()).toThrow('network prefix is unavailable or invalid');
  });

  it.each([0, 369, 65535])('exposes generic profile prefix %s unchanged', async networkPrefix => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ networkPrefix }) }));
    const config = await import('./runtime-config');
    await config.loadRuntimeConfig();
    expect(config.getRuntimeNetworkPrefix()).toBe(networkPrefix);
  });

  it('rejects absent prefix before instruction UI can start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const config = await import('./runtime-config');
    await expect(config.loadRuntimeConfig()).rejects.toThrow('configuration is unavailable or invalid');
    expect(() => config.getRuntimeNetworkPrefix()).toThrow('network prefix is unavailable or invalid');
  });

  it.each([-1, 65536, '369', 1.5, null])('rejects malformed generic prefix %s at configuration loading', async networkPrefix => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ networkPrefix }) }));
    const config = await import('./runtime-config');
    await expect(config.loadRuntimeConfig()).rejects.toThrow('configuration is unavailable or invalid');
    expect(() => config.getRuntimeNetworkPrefix()).toThrow('network prefix is unavailable or invalid');
  });
});
