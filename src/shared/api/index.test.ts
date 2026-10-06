import stateFinality from '../../../tests/fixtures/taira-state-finality.json';
import { jsonResponse, testResponse } from '../../../tests/fixtures/http-response';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import type * as ApiIndexModule from './index';
import { appendSearchParams } from '@/shared/api/query';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const SAMPLE_I105_MODERN = 'sorauﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76';
const SAMPLE_I105_TEST_MODERN = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ACCOUNT_ALIAS = 'treasury@banking.retail';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105}`;
const SAMPLE_RWA_ID = `${'00'.repeat(31)}01$commodities.main`;
const SAMPLE_PARENT_RWA_ID = `${'ff'.repeat(32)}$commodities.main`;
const SAMPLE_FRAMED_INSTRUCTION_SHA256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const TORII_API_VERSION_HEADER = 'x-iroha-api-version';

const eventSourceStore = vi.hoisted(() => ({
  instances: [] as Array<{ source: unknown, data: Ref<string | null>, status: Ref<string> }>,
}));

const runtimeConfigState = vi.hoisted((): { value: Record<string, unknown> } => ({
  value: {},
}));

vi.mock('@vueuse/core', () => {
  return {
    useEventSource: vi.fn((source: unknown) => {
      const entry = { source, data: ref<string | null>(null), status: ref('CONNECTING') };
      eventSourceStore.instances.push(entry);
      return { data: entry.data, status: entry.status };
    }),
  };
});

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => runtimeConfigState.value,
}));



type ApiEnv = Partial<
  Record<'VITE_API_URL' | 'VITE_SUMERAGI_STATUS_STREAM_ENABLED' | 'VITE_ZK_PROVER_REPORTS_ENABLED', string>
>;
type ApiModule = typeof ApiIndexModule;

async function importApiModule(env?: ApiEnv): Promise<ApiModule> {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) vi.stubEnv(key, value);
    });
  }
  return await import('./index');
}

/** Inspect the actual canonical POST query sent by the SDK. */
function queryValue(spy: { mock: { calls: unknown[][] } }, index: number, name: string): string | null {
  const options = spy.mock.calls[index]?.[1] as RequestInit;
  expect(options.method).toBe('POST');
  const query = JSON.parse(String(options.body));
  expect(Object.keys(query).every((key) => ['filter', 'limit', 'cursor'].includes(key))).toBe(true);
  if (name === 'limit' || name === 'cursor') return query[name] === undefined ? null : String(query[name]);
  const visit = (filter: { op: string, args: unknown[] } | undefined): unknown => {
    if (!filter) return undefined;
    if (filter.op === 'eq' && filter.args[0] === name) return filter.args[1];
    if (filter.op === 'and') {
      for (const child of filter.args) {
        const value = visit(child as { op: string, args: unknown[] });
        if (value !== undefined) return value;
      }
    }
    return undefined;
  };
  const value = visit(query.filter);
  return value === undefined ? null : String(value);
}

const nativeFetch = global.fetch;

beforeEach(() => {
  eventSourceStore.instances.length = 0;
  runtimeConfigState.value = {};
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') localStorage.clear();
});

afterEach(() => {
  global.fetch = nativeFetch;
});

describe('appendSearchParams', () => {
  it('serializes numeric and boolean parameters without dropping zero-ish values', () => {
    const url = new URL('https://example.com/v1/explorer/assets');
    appendSearchParams(url, {
      page: 0,
      per_page: 25,
      include_rejected: false,
      owned_by: { toString: () => SAMPLE_I105 },
      domain: 'wonderland',
      empty: '',
      whitespace: '   ',
      unset: undefined,
      alsoUnset: null,
    });

    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.get('per_page')).toBe('25');
    expect(url.searchParams.get('include_rejected')).toBe('false');
    expect(url.searchParams.get('owned_by')).toBe(SAMPLE_I105);
    expect(url.searchParams.get('domain')).toBe('wonderland');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(url.searchParams.has('whitespace')).toBe(false);
    expect(url.searchParams.has('unset')).toBe(false);
    expect(url.searchParams.has('alsoUnset')).toBe(false);
  });

  it('leaves the URL untouched when params are omitted', () => {
    const url = new URL('https://example.com/v1/explorer/assets');
    appendSearchParams(url);
    expect(url.toString()).toBe('https://example.com/v1/explorer/assets');
  });
});

describe('API url builders', () => {
  it('keeps actual requests on forced Taira after manual, scoped and reset attempts', async () => {
    runtimeConfigState.value = { toriiBaseUrl: 'https://taira.sora.org', toriiForceBaseUrl: true };
    localStorage.setItem('torii_base_url', 'https://saved-node.example');
    const requests: string[] = [];
    global.fetch = vi.fn(async (input: unknown) => {
      requests.push(String(input));
      return testResponse(
        JSON.stringify({
          items: [],
          next_cursor: null,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }) as typeof fetch;
    const api = await importApiModule({ VITE_API_URL: 'https://build-default.example/v1/explorer' });
    expect(api.getToriiBaseUrl()).toBe('https://taira.sora.org');
    await api.fetchBlocks({ limit: 10 });
    for (const override of [
      () => api.setToriiBaseUrl('https://manual.example'),
      () => api.setRouteScopedToriiBaseUrl('https://scoped.example'),
      () => api.setToriiBaseUrlFromConfig('https://substituted.example', { force: true }),
      () => api.resetToriiBaseUrl(),
    ]) {
      override();
      await api.fetchBlocks({ limit: 10 });
    }
    expect(requests).toHaveLength(5);
    expect(requests.every((url) => url === 'https://taira.sora.org/v1/explorer/blocks/query')).toBe(true);
    expect(api.buildToriiWsUrl('/telemetry/metrics')).toBe('wss://taira.sora.org/v1/telemetry/metrics');
  });

  it('never discovers or contacts failover peers when forced Taira requests fail', async () => {
    runtimeConfigState.value = {
      toriiBaseUrl: 'https://taira.sora.org',
      toriiForceBaseUrl: true,
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://backup.example'],
      toriiFailoverFailureThreshold: 1,
      toriiRequestRetryCount: 0,
    };
    const requests: string[] = [];
    global.fetch = vi.fn(async (input: unknown) => {
      requests.push(String(input));
      return testResponse('unavailable', { status: 503 });
    }) as typeof fetch;
    const api = await importApiModule();
    for (let attempt = 0; attempt < 6; attempt += 1) await api.fetchBlocks({ limit: 1 });
    expect(await api.retryToriiFailover()).toBe(false);
    await nextTick();
    expect(requests).toHaveLength(6);
    expect(requests.every((url) => url === 'https://taira.sora.org/v1/explorer/blocks/query')).toBe(true);
  });

  it('buildToriiUrl normalizes Torii app paths to the current /v1 API', async () => {
    const { buildToriiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    expect(buildToriiUrl('/telemetry/metrics')).toBe('https://torii.example/v1/telemetry/metrics');
    expect(buildToriiUrl('telemetry/metrics')).toBe('https://torii.example/v1/telemetry/metrics');
    expect(buildToriiUrl('/gov/council/current')).toBe('https://torii.example/v1/gov/council/current');
    expect(buildToriiUrl('/soracloud/status')).toBe('https://torii.example/v1/soracloud/status');
    expect(buildToriiUrl('/nexus/public_lanes/0/validators')).toBe(
      'https://torii.example/v1/nexus/public_lanes/0/validators'
    );
    expect(buildToriiUrl('/v2/zk/prover/reports')).toBe('https://torii.example/v1/zk/prover/reports');
  });

  it('resolveApiUrl keeps explorer endpoints on the /v1/explorer base', async () => {
    const { resolveApiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    expect(resolveApiUrl('/accounts')).toBe('https://torii.example/v1/explorer/accounts');
    expect(resolveApiUrl('assets')).toBe('https://torii.example/v1/explorer/assets');
  });

  it('resolveApiUrl routes Torii-prefixed paths directly to the correct Torii API version', async () => {
    const { resolveApiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    expect(resolveApiUrl('/v1/assets/definitions')).toBe('https://torii.example/v1/assets/definitions');
    expect(resolveApiUrl('/contracts/code/abcd/contract-view')).toBe(
      'https://torii.example/v1/contracts/code/abcd/contract-view'
    );
    expect(resolveApiUrl('/gov/council')).toBe('https://torii.example/v1/gov/council');
    expect(resolveApiUrl('zk/telemetry')).toBe('https://torii.example/v1/zk/telemetry');
    expect(resolveApiUrl('/telemetry/peers-info')).toBe('https://torii.example/v1/telemetry/peers-info');
    expect(resolveApiUrl('/sumeragi/status')).toBe('https://torii.example/v1/sumeragi/status');
    expect(resolveApiUrl('/kaigi/relays')).toBe('https://torii.example/v1/kaigi/relays');
    expect(resolveApiUrl('/soracloud/status')).toBe('https://torii.example/v1/soracloud/status');
    expect(resolveApiUrl('/sorafs/aliases')).toBe('https://torii.example/v1/sorafs/aliases');
    expect(resolveApiUrl('/nexus/dataspaces/accounts/alice%40wonderland/summary')).toBe(
      'https://torii.example/v1/nexus/dataspaces/accounts/alice%40wonderland/summary'
    );
  });

  it('buildToriiWsUrl mirrors the Torii origin protocol', async () => {
    const secureModule = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    expect(secureModule.buildToriiWsUrl('/telemetry/metrics')).toBe('wss://torii.example/v1/telemetry/metrics');

    const insecureModule = await importApiModule({ VITE_API_URL: 'http://torii.example:8080/v1/explorer' });
    expect(insecureModule.buildToriiWsUrl('/telemetry/metrics')).toBe('ws://torii.example:8080/v1/telemetry/metrics');
  });

  it('does not expose retired address-format preference state', async () => {
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    expect(module).not.toHaveProperty('getToriiAddressFormatPreference');
    expect(module).not.toHaveProperty('useToriiAddressFormatPreference');
  });

  it('setToriiBaseUrl overrides Torii and explorer bases', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://alt-node.example:8080/v1/explorer');
    expect(module.buildToriiUrl('/telemetry/metrics')).toBe('https://alt-node.example:8080/v1/telemetry/metrics');
    expect(module.resolveApiUrl('/accounts')).toBe('https://alt-node.example:8080/v1/explorer/accounts');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://alt-node.example:8080');
    }
    module.resetToriiBaseUrl();
  });

  it('setToriiBaseUrl can skip persistence', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://persisted-node.example:8080');

    module.setToriiBaseUrl('https://volatile-node.example:8080', { persist: false });

    expect(module.getToriiBaseUrl()).toBe('https://volatile-node.example:8080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://persisted-node.example:8080');
    }
  });

  it('setToriiBaseUrlFromConfig preserves stored user node selections by default', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://stored-node.example:8080');

    module.setToriiBaseUrlFromConfig('https://configured-node.example:18080');

    expect(module.getToriiBaseUrl()).toBe('https://stored-node.example:8080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://stored-node.example:8080');
    }
  });

  it('setToriiBaseUrlFromConfig can force-clear stale stored node selections', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://stored-node.example:8080');

    module.setToriiBaseUrlFromConfig('https://configured-node.example:18080', { force: true });

    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:18080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBeNull();
    }
  });

  it('route-scoped override changes effective base without mutating configured node persistence', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://configured-node.example:8080');
    expect(module.getConfiguredToriiBaseUrl()).toBe('https://configured-node.example:8080');
    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:8080');

    const scoped = module.setRouteScopedToriiBaseUrl('https://public-node.example:18080/v1/explorer');
    expect(scoped).toBe('https://public-node.example:18080');
    expect(module.getConfiguredToriiBaseUrl()).toBe('https://configured-node.example:8080');
    expect(module.getToriiBaseUrl()).toBe('https://public-node.example:18080');
    expect(module.resolveApiUrl('/accounts')).toBe('https://public-node.example:18080/v1/explorer/accounts');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://configured-node.example:8080');
    }

    module.setRouteScopedToriiBaseUrl(null);
    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:8080');
  });

  it('fetch helpers resolve requests against scoped node while torii scope override is active', async () => {
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://configured-node.example:8080');
    module.setRouteScopedToriiBaseUrl('https://public-node.example:18080');

    const fetchSpy = vi.fn(async (input: unknown) =>
      testResponse(
        JSON.stringify({
          next_cursor: null,
          items: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const result = await module.fetchAccounts({ limit: 1 });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    const requestedUrl = fetchSpy.mock.calls[0]?.[0];
    const requestedUrlString = requestedUrl instanceof URL ? requestedUrl.toString() : String(requestedUrl);
    expect(requestedUrlString).toContain('https://public-node.example:18080/v1/explorer/accounts');

    module.setRouteScopedToriiBaseUrl(null);
  });

  it('retries transient GET failures once before succeeding', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 1,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 2000,
    };
    let attempts = 0;
    global.fetch = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (!url.startsWith('https://torii.example/v1/explorer/accounts')) {
        return testResponse('not found', { status: 404 });
      }
      attempts += 1;
      if (attempts === 1) return testResponse('bad gateway', { status: 502 });
      return testResponse(
        JSON.stringify({
              id: SAMPLE_I105,
              network_prefix: 0,
              metadata: {},
              owned_assets: 0,
              owned_nfts: 0,
              owned_domains: 0,
            }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const availability = module.useToriiAvailability();
    const result = await module.fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    expect(availability.failureCount.value).toBe(0);
    expect(availability.state.value).toBe('healthy');
  });

  it('retries network errors once before succeeding', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 1,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 2000,
    };
    let attempts = 0;
    global.fetch = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (!url.startsWith('https://torii.example/v1/explorer/accounts')) {
        return testResponse('not found', { status: 404 });
      }
      attempts += 1;
      if (attempts === 1) throw new TypeError('simulated network error');
      return testResponse(
        JSON.stringify({
              id: SAMPLE_I105,
              network_prefix: 0,
              metadata: {},
              owned_assets: 0,
              owned_nfts: 0,
              owned_domains: 0,
            }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://torii.example', { persist: false });
    const result = await module.fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('auto-failovers to a healthy runtime candidate after repeated transient failures', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://backup.example'],
      toriiFailoverFailureThreshold: 5,
      toriiFailoverWindowMs: 60_000,
      toriiFailoverProbeTimeoutMs: 1_500,
      toriiFailoverPersistSwitch: true,
      toriiFailoverMaxPeerCandidates: 8,
    };

    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url.startsWith('https://torii.example/v1/explorer/transactions')) {
        return testResponse('bad gateway', { status: 502 });
      }
      if (url === 'https://torii.example/peers') {
        return testResponse(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'https://backup.example/v1/explorer/health') {
        return testResponse(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return testResponse('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const availability = module.useToriiAvailability();

    for (let idx = 0; idx < 5; idx += 1) {
      await module.fetchTransactions({ limit: 1 });
    }
    for (let idx = 0; idx < 10 && module.getToriiBaseUrl() !== 'https://backup.example'; idx += 1) {
      await nextTick();
      await Promise.resolve();
    }

    expect(module.getToriiBaseUrl()).toBe('https://backup.example');
    expect(availability.state.value).toBe('healthy');
    expect(availability.failureCount.value).toBe(0);
    expect(availability.lastSwitch.value?.to).toBe('https://backup.example');
  });

  it('prefers the freshest healthy failover candidate', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://lagging.example', 'https://fresh.example'],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
      toriiFailoverMaxPeerCandidates: 4,
    };

    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://torii.example/peers') {
        return testResponse(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'https://lagging.example/v1/explorer/health') {
        return testResponse(
          JSON.stringify({
            head_height: 10,
            head_created_at: '2026-03-05T00:00:00Z',
            sampled_at: '2026-03-05T00:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url === 'https://fresh.example/v1/explorer/health') {
        return testResponse(
          JSON.stringify({
            head_height: 120,
            head_created_at: '2026-03-05T06:00:00Z',
            sampled_at: '2026-03-05T06:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return testResponse('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const switched = await module.retryToriiFailover();
    const peerCall = fetchSpy.mock.calls.find(([input]) => String(input) === 'https://torii.example/peers');
    const healthCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === 'https://fresh.example/v1/explorer/health'
    );

    expect(switched).toBe(true);
    expect(module.getToriiBaseUrl()).toBe('https://fresh.example');
    expect(peerCall?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
      },
    });
    expect(healthCall?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
      },
    });
    expect((peerCall?.[1]?.headers as Record<string, string>)[TORII_API_VERSION_HEADER]).toBeUndefined();
    expect((healthCall?.[1]?.headers as Record<string, string>)[TORII_API_VERSION_HEADER]).toBeUndefined();
  });

  it('does not auto-probe built-in preset nodes during failover', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: [],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
      toriiFailoverMaxPeerCandidates: 4,
    };

    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://torii.example/peers') {
        return testResponse(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return testResponse('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const switched = await module.retryToriiFailover();
    const callUrls = fetchSpy.mock.calls.map(([input]) => (input instanceof URL ? input.toString() : String(input)));

    expect(switched).toBe(false);
    expect(callUrls).not.toContain('https://nexus.mof3.sora.org:18080/v1/explorer/health');
    expect(callUrls).not.toContain('https://testus.mof3.sora.org:18080/v1/explorer/health');
  });

  it('reports outage when manual failover cannot find a healthy node', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://unhealthy.example'],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
      toriiFailoverMaxPeerCandidates: 4,
    };

    global.fetch = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://torii.example/peers') {
        return testResponse(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'https://unhealthy.example/v1/explorer/health') {
        return testResponse('bad gateway', { status: 502 });
      }
      return testResponse('not found', { status: 404 });
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const availability = module.useToriiAvailability();
    const switched = await module.retryToriiFailover();

    expect(switched).toBe(false);
    expect(availability.state.value).toBe('outage');
    expect(availability.lastError.value).toContain('No healthy failover target');
  });

  it('streamTelemetryMetrics uses the v1 telemetry SSE path', async () => {
    const { streamTelemetryMetrics } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const stream = streamTelemetryMetrics();

    expect(stream.status.value).toBe('CONNECTING');
    const source = eventSourceStore.instances[0]?.source as { value?: string } | undefined;
    expect(source?.value).toBe('https://torii.example/v1/telemetry/live');
  });
});

describe('Explorer accounts API helpers', () => {
  it('fetchAccounts keeps filtered requests on /v1/explorer/accounts', async () => {
    const validAccountId = SAMPLE_I105;
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: validAccountId,
            network_prefix: 0,
            metadata: {},
            owned_assets: 0,
            owned_nfts: 0,
            owned_domains: 0,
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ limit: 10, domain: 'wonderland' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const firstOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/accounts/query');
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('10');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(queryValue(fetchSpy, 0, 'domain')).toBe('wonderland');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(firstOptions).toMatchObject({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    expect((firstOptions.headers as Record<string, string>)[TORII_API_VERSION_HEADER]).toBeUndefined();
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('does not revive the retired Torii API version header from legacy runtime config', async () => {
    runtimeConfigState.value = { toriiApiVersionHeaderEnabled: true };
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ limit: 10 });

    const firstOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstOptions).toMatchObject({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    expect((firstOptions.headers as Record<string, string>)[TORII_API_VERSION_HEADER]).toBeUndefined();
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('fetchAccounts accepts the exact required account fields from Torii listings', async () => {
    const validAccountId = SAMPLE_I105;
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: validAccountId,
            network_prefix: 753,
            metadata: {},
            owned_assets: 0,
            owned_nfts: 0,
            owned_domains: 0,
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ limit: 10 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(validAccountId);
      expect(result.data.items[0]?.i105_address).toBe(validAccountId);
    }
  });

  it('adapts every world-backed collection to cursor and limit without retired page parameters', async () => {
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input as URL;
      return jsonResponse({
        next_cursor: null,
        items: [],
      });
    });
    global.fetch = fetchSpy as any;

    const api = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    await api.fetchAccounts({ limit: 10, domain: 'wonderland' });
    await api.fetchDomains({ limit: 10, owned_by: SAMPLE_I105 });
    await api.fetchAssets({ limit: 10 });
    await api.fetchNFTs({ limit: 10, domain: 'wonderland', owned_by: SAMPLE_I105 });
    await api.fetchRwas({ limit: 10, domain: 'wonderland', owned_by: SAMPLE_I105 });
    await api.fetchAssetDefinitions({ limit: 10, domain: 'wonderland' });

    const urls = fetchSpy.mock.calls.map(([input]) => input as URL);
    expect(urls.map((url) => url.pathname)).toEqual([
      '/v1/explorer/accounts/query',
      '/v1/explorer/domains/query',
      '/v1/explorer/assets/query',
      '/v1/explorer/nfts/query',
      '/v1/explorer/rwas/query',
      '/v1/explorer/asset-definitions/query',
    ]);
    for (const [index, url] of urls.entries()) {
      expect(queryValue(fetchSpy, index, 'limit')).toBe('10');
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.has('per_page')).toBe(false);
    }
    expect(queryValue(fetchSpy, 5, 'owning_domain')).toBe('wonderland');
    expect(urls[5]?.searchParams.has('domain')).toBe(false);
  });

  it('fetches consecutive cursor pages without inventing totals or numbered metadata', async () => {
    const account = (id: string) => ({
      id,
      network_prefix: 0,
      metadata: {},
      owned_assets: 0,
      owned_nfts: 0,
      owned_domains: 0,
    });
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse({
          next_cursor: 'cursor-1',
          items: [account(SAMPLE_I105), account(SAMPLE_I105_ALT)],
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          next_cursor: null,
          items: [account(SAMPLE_I105_ALT), account(SAMPLE_I105)],
        })
      );
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const first = await fetchAccounts({ limit: 2 });
    expect(first.status).toBe(SUCCESSFUL_FETCHING);
    if (first.status !== SUCCESSFUL_FETCHING) throw new Error('expected first cursor page');
    const second = await fetchAccounts({ cursor: first.data.nextCursor, limit: 2 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    const secondUrl = fetchSpy.mock.calls[1]?.[0] as URL;
    expect(firstUrl.search).toBe('');
    expect(secondUrl.search).toBe('');
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('2');
    expect(queryValue(fetchSpy, 0, 'cursor')).toBeNull();
    expect(queryValue(fetchSpy, 1, 'limit')).toBe('2');
    expect(queryValue(fetchSpy, 1, 'cursor')).toBe('cursor-1');
    expect(first.data).toMatchObject({ nextCursor: 'cursor-1' });
    expect(Object.keys(first.data)).not.toContain('total');
    expect(second.status).toBe(SUCCESSFUL_FETCHING);
    if (second.status === SUCCESSFUL_FETCHING) {
      expect(second.data).toMatchObject({ nextCursor: null });
      expect(second.data.items.map((item) => item.id)).toEqual([SAMPLE_I105_ALT, SAMPLE_I105]);
    }
  });

  it('rejects a cursor response that repeats the request cursor', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: 'cursor-1',
        items: [],
      })
    ) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    await expect(fetchAccounts({ cursor: 'cursor-1', limit: 2 })).rejects.toThrow('cursor did not advance');
  });

  it.each([
    { items: [], pagination: { limit: 2, next_cursor: null, has_more: false } },
    { items: [], next_cursor: '' },
    { items: [], next_cursor: null, total: 0 },
  ])('rejects retired or invalid collection metadata: %o', async (page) => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(page)) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    await expect(fetchAccounts({ limit: 2 })).rejects.toThrow();
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 2, cursor: 'not=padded' }])(
    'rejects invalid cursor pagination before issuing a request: %o',
    async (params) => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;
      const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

      await expect(fetchAccounts(params)).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('returns an upstream cursor-page error without fabricating an empty page', async () => {
    global.fetch = vi.fn().mockImplementation(() => testResponse('cursor backend unavailable', { status: 503 })) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    const result = await fetchAccounts({ limit: 2 });

    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status === UNKNOWN_ERROR) expect(result.error.message).toContain('cursor backend unavailable');
    expect(result).not.toHaveProperty('data');
  });

  it('fetchAccount URL-encodes account selectors and returns canonical i105 data', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_I105,
        network_prefix: 753,
        metadata: {},
        owned_assets: 0,
        owned_nfts: 0,
        owned_domains: 0,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/accounts/treasury%40banking.retail');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105);
      expect(result.data.i105_address).toBe(SAMPLE_I105);
    }
  });

  it('fetchAccount preserves incoming i105 route params without rewriting the prefix', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_I105_TEST_MODERN,
        network_prefix: 369,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_I105_TEST_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_TEST_MODERN)}`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_TEST_MODERN);
      expect(result.data.i105_address).toBe(SAMPLE_I105_TEST_MODERN);
    }
  });

  it('fetchAccount also preserves sora-prefixed ids on Taira Torii bases', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_I105_MODERN,
        network_prefix: 753,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org/v1/explorer' });
    const result = await fetchAccount(SAMPLE_I105_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_MODERN);
      expect(result.data.i105_address).toBe(SAMPLE_I105_MODERN);
    }
  });

  it('preserves testnet account filters before calling explorer list endpoints', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105_TEST_MODERN}`,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_TEST_MODERN,
            asset_name: 'usd',
            asset_alias: SAMPLE_ASSET_ALIAS,
            value: '25000',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssets({ limit: 10, owned_by: SAMPLE_I105_TEST_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets/query');
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('10');
    expect(queryValue(fetchSpy, 0, 'account_id')).toBe(SAMPLE_I105_TEST_MODERN);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('25000');
    }
  });

  it('also preserves sora-prefixed account filters for Taira Torii bases', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105_MODERN}`,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_MODERN,
            asset_name: 'usd',
            asset_alias: SAMPLE_ASSET_ALIAS,
            value: '25000',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org/v1/explorer' });
    const result = await fetchAssets({ limit: 10, owned_by: SAMPLE_I105_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets/query');
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('10');
    expect(queryValue(fetchSpy, 0, 'account_id')).toBe(SAMPLE_I105_MODERN);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('25000');
    }
  });

  it('keeps definition filters on the cursor-native Explorer assets route', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: SAMPLE_ASSET_ID,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105,
            asset_name: 'usd',
            asset_alias: SAMPLE_ASSET_ALIAS,
            value: '77',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssets({ limit: 5, definition: SAMPLE_ASSET_DEFINITION_ID });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets/query');
    expect(queryValue(vi.mocked(global.fetch), 0, 'limit')).toBe('5');
    expect(queryValue(fetchSpy, 0, 'definition_id')).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toMatchObject({ nextCursor: null });
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.id).toBe(SAMPLE_ASSET_ID);
      expect(result.data.items[0]?.value.toString()).toBe('77');
    }
  });

  it('forwards a canonical scoped asset_id and parses the current Explorer asset DTO', async () => {
    const scopedAssetId = `${SAMPLE_ASSET_ID}#dataspace:7`;
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: scopedAssetId,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105,
            asset_name: 'usd',
            asset_alias: SAMPLE_ASSET_ALIAS,
            value: '91',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssets({ limit: 1, asset_id: scopedAssetId });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets/query');
    expect(queryValue(fetchSpy, 0, 'id')).toBe(scopedAssetId);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(scopedAssetId);
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('91');
    }
  });

  it('rejects a non-canonical asset_id before issuing an Explorer request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    for (const assetId of [`${SAMPLE_ASSET_ID}#dataspace:007`, `${SAMPLE_ASSET_ID}#dataspace:18446744073709551616`]) {
      await expect(fetchAssets({ limit: 1, asset_id: assetId })).rejects.toThrow();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid owner/account selectors before issuing Explorer requests', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    const requests = [
      api.fetchAccount('not an account'),
      api.fetchDomains({ limit: 1, owned_by: 'not an account' }),
      api.fetchAssets({ limit: 1, owned_by: 'not an account' }),
      api.fetchAssetDefinitions({ limit: 1, owned_by: 'not an account' }),
      api.fetchNFTs({ limit: 1, owned_by: 'not an account' }),
      api.fetchRwas({ limit: 1, owned_by: 'not an account' }),
    ];
    for (const request of requests) {
      await expect(request).rejects.toThrow(/Account selector/u);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchAsset consumes the authoritative Explorer detail value and alias fields', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_ASSET_ID,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_I105,
        asset_name: 'usd',
        asset_alias: SAMPLE_ASSET_ALIAS,
        value: '123.5',
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAsset } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAsset(SAMPLE_ASSET_ID);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/assets/${encodeURIComponent(SAMPLE_ASSET_ID)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.value.toString()).toBe('123.5');
      expect(result.data.asset_name).toBe('usd');
      expect(result.data.asset_alias).toBe(SAMPLE_ASSET_ALIAS);
    }
  });

  it('fetchAssetDefinitions uses the cursor-native Explorer route', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: SAMPLE_ASSET_DEFINITION_ID,
            owning_domain: 'issuer.main',
            mintable: 'Infinitely',
            logo: null,
            metadata: {},
            owned_by: SAMPLE_I105,
            assets: 1,
            total_quantity: '11',
            locked_quantity: null,
            circulating_quantity: null,
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssetDefinitions({ limit: 5 });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/asset-definitions/query');
    expect(queryValue(vi.mocked(global.fetch), 0, 'limit')).toBe('5');
    expect(firstCall.searchParams.has('offset')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toMatchObject({ nextCursor: null });
      expect(result.data.items[0]?.owning_domain).toBe('issuer.main');
      expect(result.data.items[0]?.total_quantity.toString()).toBe('11');
      expect(result.data.items[0]?.alias).toBeNull();
    }
  });

  it('rejects incomplete Explorer asset-definition items instead of applying full-route defaults', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: SAMPLE_ASSET_DEFINITION_ID,
            owning_domain: null,
            name: 'usd',
            description: null,
            alias: null,
            mintable: 'Infinitely',
            logo: null,
            metadata: {},
            owned_by: SAMPLE_I105,
            assets: 0,
            locked_quantity: null,
            circulating_quantity: null,
          },
        ],
      })
    ) as any;

    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    await expect(fetchAssetDefinitions({ limit: 1 })).rejects.toThrow(/missing or unsupported fields/u);
  });

  it('fetchAssetDefinition prefers the v1 asset-definition detail route', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_ASSET_DEFINITION_ID,
        owning_domain: null,
        alias: SAMPLE_ASSET_ALIAS,
        alias_binding: {
          alias: SAMPLE_ASSET_ALIAS,
          status: 'permanent',
          bound_at_ms: 1_700_000_000_000,
        },
        name: 'usd',
        description: null,
        mintable: 'Infinitely',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        total_quantity: '11',
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssetDefinition(SAMPLE_ASSET_DEFINITION_ID);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/assets/definitions/${encodeURIComponent(SAMPLE_ASSET_DEFINITION_ID)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.alias).toBe(SAMPLE_ASSET_ALIAS);
      expect(result.data.alias_binding?.alias).toBe(SAMPLE_ASSET_ALIAS);
      expect(result.data.owning_domain).toBeNull();
      expect(result.data.total_quantity.toString()).toBe('11');
    }
  });

  it('fetchAccount surfaces detail rejections without adding unsupported format queries or retrying', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('invalid explorer account request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(UNKNOWN_ERROR);
  });
});

describe('Account read-only surface API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('requests exact effective permissions with limit/offset and preserves JSON payload values', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({ next_cursor: null,
          items: [{ name: 'CanTransfer', payload: { maximum: '100000000000000000001' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const { fetchAccountPermissions } = await importApiModule(toriiEnv);
    const result = await fetchAccountPermissions(SAMPLE_ACCOUNT_ALIAS, { cursor: 'opaque-permissions', limit: 20 });

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_ACCOUNT_ALIAS)}/permissions/query`);
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('20');
    expect(queryValue(fetchSpy, 0, 'cursor')).toBe('opaque-permissions');
    expect(requestUrl.searchParams.has('count_mode')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.payload).toEqual({ maximum: '100000000000000000001' });
    }
  });

  it.each([401, 403])('returns an explicit permission-denied result for HTTP %s', async (status) => {
    global.fetch = vi
      .fn()
      .mockImplementation(() => testResponse('private dataspace permission denied', { status })) as any;

    const { fetchAccountPermissions } = await importApiModule(toriiEnv);
    const result = await fetchAccountPermissions(SAMPLE_I105, { limit: 10 });

    expect(result.status).toBe('permission-denied');
    if (result.status === 'permission-denied') {
      expect(result.error.message).toContain('private dataspace');
    }
  });

  it('requests indexed account history with an exact asset selector and preserves amount strings', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({ next_cursor: null,
          items: [
            {
              id: 'history:1',
              source: 'asset_transfer',
              type: 'TRANSFER',
              timestamp_ms: 1_700_000_000_000,
              status: 'Committed',
              result_ok: true,
              direction: 'outgoing',
              account_id: SAMPLE_I105,
              counterparty_account_id: SAMPLE_I105_ALT,
              asset_id: SAMPLE_ASSET_ID,
              asset_definition_id: SAMPLE_ASSET_DEFINITION_ID,
              amount: '99999999999999999999.000001',
              tx_hash: 'ab'.repeat(32),
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const { fetchAccountHistory } = await importApiModule(toriiEnv);
    const result = await fetchAccountHistory(SAMPLE_I105, {
      cursor: 'opaque-history',
      limit: 10,
      asset_id: SAMPLE_ASSET_ALIAS,
    });

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_I105)}/history/query`);
    expect(queryValue(fetchSpy, 0, 'limit')).toBe('10');
    expect(queryValue(fetchSpy, 0, 'cursor')).toBe('opaque-history');
    expect(requestUrl.searchParams.has('count_mode')).toBe(false);
    expect(queryValue(fetchSpy, 0, 'asset_id')).toBe(SAMPLE_ASSET_ALIAS);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.amount).toBe('99999999999999999999.000001');
      expect(result.data.nextCursor).toBeNull();
    }
  });

  it('accepts a multi-route account-history fanout envelope without index metadata', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({ next_cursor: null,
          items: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;

    const { fetchAccountHistory } = await importApiModule(toriiEnv);
    const result = await fetchAccountHistory(SAMPLE_I105, {
      limit: 10,
    });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.nextCursor).toBeNull();
      expect('indexed_height' in result.data).toBe(false);
      expect('total' in result.data).toBe(false);
    }
  });

  it('rejects I105 canonical auth without a native verifier before signing or fetching', async () => {
    runtimeConfigState.value = { networkId: `hash:${'AB'.repeat(32)}#B99E` };
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const sign = vi.fn(async () => new Uint8Array(64).fill(7));
    const auth = { authAccountId: SAMPLE_I105, sign };
    const { fetchMultisigProposals, fetchMultisigSpec } = await importApiModule(toriiEnv);

    await expect(fetchMultisigSpec(SAMPLE_ACCOUNT_ALIAS, auth)).rejects.toThrow(/canonical I105/u);
    await expect(fetchMultisigProposals(SAMPLE_I105, { limit: 20 }, auth)).rejects.toThrow(/canonical I105/u);
    expect(sign).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses supported ASCII alias auth for signed multisig ID and alias selectors', async () => {
    runtimeConfigState.value = { networkId: `hash:${'AB'.repeat(32)}#B99E` };
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname === '/v1/multisig/spec') {
        return testResponse(
          JSON.stringify({
            resolved_multisig_account_id: SAMPLE_I105,
            spec: {
              signatories: { [SAMPLE_I105]: 2, [SAMPLE_I105_ALT]: 1 },
              quorum: 2,
              transaction_ttl_ms: 60_000,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      expect(url.pathname).toBe('/v1/multisig/proposals/query');
      return testResponse(
        JSON.stringify({
          resolved_multisig_account_id: SAMPLE_I105,
          proposals: [],
          next_cursor: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    global.fetch = fetchSpy as any;
    const sign = vi.fn(async () => new Uint8Array(64).fill(7));
    const auth = { authAccountId: SAMPLE_ACCOUNT_ALIAS, sign };

    const { fetchMultisigProposals, fetchMultisigSpec } = await importApiModule(toriiEnv);
    const spec = await fetchMultisigSpec(SAMPLE_ACCOUNT_ALIAS, auth);
    const proposals = await fetchMultisigProposals(
      SAMPLE_I105,
      { status: ['COLLECTING_SIGNATURES'], cursor: 'cursor_1', limit: 20 },
      auth
    );

    expect(spec.status).toBe(SUCCESSFUL_FETCHING);
    expect(proposals.status).toBe(SUCCESSFUL_FETCHING);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const specInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const proposalsInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(specInit.method).toBe('POST');
    expect(JSON.parse(String(specInit.body))).toEqual({ multisig_account_alias: SAMPLE_ACCOUNT_ALIAS });
    expect(JSON.parse(String(proposalsInit.body))).toEqual({
      multisig_account_id: SAMPLE_I105,
      status: ['COLLECTING_SIGNATURES'],
      cursor: 'cursor_1',
      limit: 20,
    });
  });
});

describe('Explorer domain and NFT API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };
  const nftId = 'cool-cat$gallery.main';

  it('fetchDomains parses exact cursor items', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: 'gallery.main',
            logo: null,
            metadata: { category: 'art' },
            owned_by: SAMPLE_I105,
            accounts: 1,
            assets: 2,
            nfts: 3,
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchDomains } = await importApiModule(toriiEnv);
    const result = await fetchDomains({ limit: 1, owned_by: SAMPLE_I105 });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/domains/query');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe('gallery.main');
      expect(result.data.items[0]?.nfts).toBe(3);
    }
  });

  it('fetchDomain parses the same exact DTO on the detail route', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: 'gallery.main',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        accounts: 1,
        assets: 2,
        nfts: 3,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchDomain } = await importApiModule(toriiEnv);
    const result = await fetchDomain('gallery.main');

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/domains/gallery.main');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('fetchNFTs parses canonical fully-qualified NFT cursor items', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [{ id: nftId, owned_by: SAMPLE_I105, metadata: { rarity: 'legendary' } }],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchNFTs } = await importApiModule(toriiEnv);
    const result = await fetchNFTs({ limit: 1, domain: 'gallery.main' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/nfts/query');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(nftId);
    }
  });

  it('fetchNFTById parses the same exact DTO on the detail route', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => jsonResponse({ id: nftId, owned_by: SAMPLE_I105, metadata: {} }));
    global.fetch = fetchSpy as any;

    const { fetchNFTById } = await importApiModule(toriiEnv);
    const result = await fetchNFTById(nftId);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/nfts/${encodeURIComponent(nftId)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });
});

describe('Explorer RWA API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchRwas keeps owner/domain filters on /v1/explorer/rwas', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            id: SAMPLE_RWA_ID,
            owned_by: SAMPLE_I105,
            quantity: '10.5',
            held_quantity: '1',
            primary_reference: 'vault-cert-001',
            status: 'active',
            is_frozen: false,
            metadata: { origin: 'AE' },
            parents: [
              {
                rwa: SAMPLE_PARENT_RWA_ID,
                quantity: '5',
              },
            ],
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchRwas } = await importApiModule(toriiEnv);
    const result = await fetchRwas({ limit: 5, owned_by: SAMPLE_I105, domain: 'commodities.main' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/rwas/query');
    expect(queryValue(vi.mocked(global.fetch), 0, 'limit')).toBe('5');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(queryValue(fetchSpy, 0, 'owned_by')).toBe(SAMPLE_I105);
    expect(queryValue(fetchSpy, 0, 'domain')).toBe('commodities.main');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.quantity.toString()).toBe('10.5');
      expect(result.data.items[0]?.metadata).toEqual({ origin: 'AE' });
      expect(result.data.items[0]?.parents[0]?.quantity.toString()).toBe('5');
    }
  });

  it('fetchRwaById URL-encodes canonical identifiers and preserves required nullable status', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        id: SAMPLE_RWA_ID,
        owned_by: SAMPLE_I105,
        quantity: '2',
        held_quantity: '0',
        primary_reference: 'vault-cert-002',
        status: null,
        is_frozen: true,
        metadata: {},
        parents: [
          {
            rwa: SAMPLE_PARENT_RWA_ID,
            quantity: '2',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchRwaById } = await importApiModule(toriiEnv);
    const result = await fetchRwaById(SAMPLE_RWA_ID);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe(`/v1/explorer/rwas/${encodeURIComponent(SAMPLE_RWA_ID)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_RWA_ID);
      expect(result.data.metadata).toEqual({});
      expect(result.data.status).toBeNull();
      expect(result.data.is_frozen).toBe(true);
      expect(result.data.parents[0]?.rwa).toBe(SAMPLE_PARENT_RWA_ID);
    }
  });
});

describe('Explorer latest/health API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchExplorerHealth parses head probe payload', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        head_height: 42,
        head_created_at: '2026-03-05T06:00:00Z',
        sampled_at: '2026-03-05T06:00:02Z',
      })
    ) as any;

    const { fetchExplorerHealth } = await importApiModule(toriiEnv);
    const result = await fetchExplorerHealth();

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toBe('https://torii.example/v1/explorer/health');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.head_height).toBe(42);
      expect(result.data.head_created_at?.toISOString()).toBe('2026-03-05T06:00:00.000Z');
    }
  });

  it('fetchLatestTransactions uses the lightweight latest endpoint', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            authority: SAMPLE_I105,
            hash: '0xabc',
            block: 10,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      })
    ) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ limit: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/transactions/latest/query');
    expect(queryValue(vi.mocked(global.fetch), 0, 'limit')).toBe('5');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.hash).toBe('0xabc');
    }
  });

  it('fetchLatestTransactions preserves halfwidth authorities from Torii', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            authority: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
            hash: '0xhalfwidth',
            block: 11,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      })
    ) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ limit: 5 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.authority).toBe('sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE');
    }
  });

  it('fetchLatestInstructions uses the lightweight latest endpoint', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            authority: SAMPLE_I105,
            block: 10,
            transaction_hash: '0xabc',
            index: 0,
            kind: 'Mint',
            transaction_status: 'Committed',
            created_at: '2026-03-05T06:00:01Z',
            box: {
              encoded: '',
              framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
              json: {
                kind: 'Mint',
                payload: {
                  object: 'xor#wonderland',
                  destination_id: SAMPLE_I105,
                  amount: '1',
                },
              },
            },
          },
        ],
      })
    ) as any;

    const { fetchLatestInstructions } = await importApiModule(toriiEnv);
    const result = await fetchLatestInstructions({ limit: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/latest/query');
    expect(queryValue(vi.mocked(global.fetch), 0, 'limit')).toBe('5');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.kind).toBe('Mint');
    }
  });
});

describe('Sumeragi telemetry API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fails closed instead of requesting operator-only authoritative status', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchSumeragiStatus } = await importApiModule(toriiEnv);
    const result = await fetchSumeragiStatus();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: UNKNOWN_ERROR });
    expect(result.status === UNKNOWN_ERROR ? result.error.message : '').toMatch(/operator-signed/u);
  });

  it('fails closed instead of requesting the removed aggregate telemetry endpoint', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchSumeragiTelemetry } = await importApiModule(toriiEnv);
    const result = await fetchSumeragiTelemetry();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: UNKNOWN_ERROR });
    expect(result.status === UNKNOWN_ERROR ? result.error.message : '').toMatch(/was removed/u);
  });

  it('keeps the validator-handshake status stream closed in the public Explorer', async () => {
    const { streamSumeragiStatus } = await importApiModule({
      ...toriiEnv,
      VITE_SUMERAGI_STATUS_STREAM_ENABLED: 'true',
    });
    const stream = streamSumeragiStatus();

    expect(eventSourceStore.instances).toHaveLength(0);
    expect(stream.status.value).toBe('CLOSED');
    expect(stream.data.value).toBeNull();
  });
});

describe('operator-only Kaigi API helpers', () => {
  it('fail closed without dispatching unsigned public-browser requests', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { fetchKaigiRelays, fetchKaigiRelayDetail, fetchKaigiRelayHealthSnapshot } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });

    const results = await Promise.all([
      fetchKaigiRelays(),
      fetchKaigiRelayDetail('relay@kaigi'),
      fetchKaigiRelayHealthSnapshot(),
    ]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result).toMatchObject({ status: UNKNOWN_ERROR });
      expect(result.status === UNKNOWN_ERROR ? result.error.message : '').toMatch(/operator-signed/u);
    }
  });
});

describe('Telemetry API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchOnlinePeers returns online peer IDs from the Torii root endpoint', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => jsonResponse(['ed0120A@10.0.0.1:1337', 'ed0120B@10.0.0.2:1337']));
    global.fetch = fetchSpy as any;

    const { fetchOnlinePeers } = await importApiModule(toriiEnv);
    const result = await fetchOnlinePeers();

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const firstOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.toString()).toBe('https://torii.example/peers');
    expect(firstOptions).toMatchObject({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBe('ed0120A@10.0.0.1:1337');
    }
  });

  it('fetchTelemetryPropagation returns parsed propagation samples', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse([
        {
          block: 101,
          first_seen_at_ms: 1000,
          last_seen_at_ms: 1040,
          spread_ms: 40,
          peers_reported: 3,
        },
      ])
    );
    global.fetch = fetchSpy as any;

    const { fetchTelemetryPropagation } = await importApiModule(toriiEnv);
    const result = await fetchTelemetryPropagation();

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.toString()).toBe('https://torii.example/v1/telemetry/propagation');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data[0]?.spread_ms).toBe(40);
    }
  });
});

describe('Nexus dataspaces API helpers', () => {
  it('fetchNexusDataspacesAccountSummary requests Torii nexus endpoint and parses response', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        account: SAMPLE_ACCOUNT_ALIAS,
        account_id: SAMPLE_I105,
        uaid: 'uaid:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        totals: {
          dataspaces: 1,
          accounts_bound: 1,
          portfolio_accounts: 1,
          portfolio_positions: 2,
          manifests_total: 1,
          manifests_active: 1,
          consensus_entries: 1,
          consensus_tx_count: 3,
          consensus_chunks_total: 6,
          consensus_rbc_bytes_total: 600,
          consensus_teu_total: 300,
        },
        dataspaces: [
          {
            dataspace_id: 7,
            dataspace_alias: 'core',
            accounts: [SAMPLE_ACCOUNT_ALIAS],
            portfolio: { accounts: 1, positions: 2, asset_definitions: 2 },
            manifest: {
              present: true,
              status: 'Active',
              active: true,
              issued_ms: 1700000000000,
              activation_epoch: 100,
              expiry_epoch: null,
              activated_epoch: 101,
              expired_epoch: null,
              revoked_epoch: null,
              revoked_reason: null,
              entries: 1,
            },
            consensus: {
              entries: 1,
              lane_ids: [0],
              tx_count: 3,
              total_chunks: 6,
              rbc_bytes_total: 600,
              teu_total: 300,
              last_block_height: 123,
              last_block_hash: '0xabc',
              details: [
                {
                  block_height: 123,
                  lane_id: 0,
                  dataspace_id: 7,
                  tx_count: 3,
                  total_chunks: 6,
                  rbc_bytes_total: 600,
                  teu_total: 300,
                  block_hash: '0xabc',
                },
              ],
            },
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchNexusDataspacesAccountSummary } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });
    const result = await fetchNexusDataspacesAccountSummary(SAMPLE_ACCOUNT_ALIAS);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toBe(
      'https://torii.example/v1/nexus/dataspaces/accounts/treasury%40banking.retail/summary'
    );
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.dataspaces[0]?.dataspace_alias).toBe('core');
      expect(result.data.totals.consensus_tx_count).toBe(3);
    }
  });

  it('fetchNexusPublicStatus parses root /status payloads', async () => {
    const fetchSpy = vi.fn().mockImplementationOnce(() =>
      jsonResponse({
        blocks: 43,
        txs_approved: 52,
        txs_rejected: 0,
        queue_size: 0,
        teu_dataspace_backlog: [
          {
            lane_id: 0,
            dataspace_id: 0,
            fault_tolerance: 1,
            backlog: 0,
            age_slots: 0,
            virtual_finish: 0,
            tx_served: 1,
            alias: 'universal',
            description: 'Single-lane data space',
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchNexusPublicStatus } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });
    const result = await fetchNexusPublicStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/status');
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.blocks).toBe(43);
      expect(result.data.txs_approved).toBe(52);
      expect(result.data.teu_dataspace_backlog[0]?.alias).toBe('universal');
    }
  });

  it('fetchNexusPublicStatus returns not-found when /status is unavailable', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });
    global.fetch = fetchSpy as any;

    const { fetchNexusPublicStatus } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });
    const result = await fetchNexusPublicStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/status');
    expect(result.status).toBe(NOT_FOUND);
  });
});

describe('Ministry agenda submission helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('draftMinistryAgendaProposal posts the Ministry draft request and parses the signable response', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          ok: true,
          agenda_proposal_id: 'AC-2026-001',
          authority: SAMPLE_I105,
          tx_instructions: [{ kind: 'Custom' }],
          signable_transaction_b64: 'AQID',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    global.fetch = fetchSpy as any;

    const { draftMinistryAgendaProposal } = await importApiModule(toriiEnv);
    const result = await draftMinistryAgendaProposal({
      proposal: { proposal_id: 'AC-2026-001' },
      authority: SAMPLE_I105,
    });

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).toString()).toBe('https://torii.example/v1/ministry/agenda/proposals/draft');
    expect((requestInit as RequestInit).method).toBe('POST');
    expect((requestInit as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({
      proposal: { proposal_id: 'AC-2026-001' },
      authority: SAMPLE_I105,
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.authority).toBe(SAMPLE_I105);
      expect(result.data.signable_transaction_b64).toBe('AQID');
    }
  });

  it('draftMinistryAgendaProposal surfaces duplicate proposal conflicts with the existing record', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          found: true,
          record: {
            proposal: { proposal_id: 'AC-2026-001' },
            authority: SAMPLE_I105,
            submitted_tx_hash_hex: `hash:${'ab'.repeat(32)}#cdef`,
            submitted_height: 42,
          },
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    global.fetch = fetchSpy as any;

    const { draftMinistryAgendaProposal } = await importApiModule(toriiEnv);
    const result = await draftMinistryAgendaProposal({
      proposal: { proposal_id: 'AC-2026-001' },
      authority: SAMPLE_I105,
    });

    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.data.found).toBe(true);
      expect(result.data.record?.submitted_tx_hash_hex).toBe('ab'.repeat(32));
    }
  });

  it('getMinistryAgendaProposal returns a found=false payload when the record endpoint returns 404', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { getMinistryAgendaProposal } = await importApiModule(toriiEnv);
    const result = await getMinistryAgendaProposal('AC-2026-001');

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      'https://torii.example/v1/ministry/agenda/proposals/AC-2026-001'
    );
    expect(result).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: {
        found: false,
        record: null,
      },
    });
  });

  it('submitSignedTransaction posts Norito bytes to the pipeline endpoint and parses the receipt', async () => {
    const signedTransaction = new Uint8Array([1, 2, 3, 4]);
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          payload: {
            tx_hash: `0x${'cd'.repeat(32)}`,
            submitted_at_ms: 1_770_000_000_000,
            submitted_at_height: 55,
            signer: SAMPLE_I105,
          },
          signature: 'ed25519:sig',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    global.fetch = fetchSpy as any;

    const { submitSignedTransaction } = await importApiModule(toriiEnv);
    const result = await submitSignedTransaction(signedTransaction);

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).toString()).toBe('https://torii.example/v1/pipeline/transactions');
    expect((requestInit as RequestInit).method).toBe('POST');
    expect((requestInit as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/x-norito',
    });
    expect((requestInit as RequestInit).body).toBe(signedTransaction as any);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.payload.tx_hash).toBe('cd'.repeat(32));
      expect(result.data.payload.submitted_at_height).toBe(55);
    }
  });

  it('fetchPipelineTransactionStatus returns null on 404 and parses terminal payloads when present', async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(() =>
        testResponse('', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        })
      )
      .mockImplementationOnce(() =>
        testResponse(
          JSON.stringify({
            hash: `hash:${'ef'.repeat(32)}#0123`,
            status: {
              kind: 'Committed',
              block_height: 77,
              rejection_reason: null,
            },
            scope: 'auto',
            resolved_from: 'local',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    global.fetch = fetchSpy as any;

    const { fetchPipelineTransactionStatus } = await importApiModule(toriiEnv);
    const missing = await fetchPipelineTransactionStatus('ab'.repeat(32));
    const found = await fetchPipelineTransactionStatus('ef'.repeat(32), 'global');

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toContain('/v1/pipeline/transactions/status?hash=');
    expect((fetchSpy.mock.calls[1]?.[0] as URL).searchParams.get('scope')).toBe('global');
    expect(missing).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: null,
    });
    expect(found.status).toBe(SUCCESSFUL_FETCHING);
    if (found.status === SUCCESSFUL_FETCHING) {
      expect(found.data?.hash).toBe('ef'.repeat(32));
      expect(found.data?.status.kind).toBe('Committed');
    }
  });
});

describe('SoraFS API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchSorafsCidLookup requests the Torii CID lookup endpoint and parses moderation details', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        content_cid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
        manifest_digest_hex: '19'.repeat(32),
        manifest_id_hex: 'aa'.repeat(32),
        index_document: 'index.html',
        files: [
          {
            path: ['index.html'],
            offset: 0,
            size: 455,
            first_chunk: 0,
            chunk_count: 1,
          },
        ],
        moderation: {
          status: 'local_blocked',
          public_links_enabled: false,
          matches: [
            {
              scope: 'local',
              match_kind: 'cid',
              pack_id: null,
              policy_tier: 'emergency',
              reason: 'operator quarantine',
              jurisdiction: 'US',
              issued_at: '2026-04-06T00:00:00Z',
              expires_at: '2026-04-07T00:00:00Z',
              review_due_at: '2026-04-06T12:00:00Z',
              issued_by_proposal_id: null,
              review_reference: null,
              governance_reference: null,
              pack_manifest_cid: null,
              merkle_root: null,
            },
          ],
        },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchSorafsCidLookup } = await importApiModule(toriiEnv);
    const result = await fetchSorafsCidLookup('bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi');

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      'https://torii.example/v1/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi'
    );
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.moderation?.status).toBe('local_blocked');
      expect(result.data.moderation?.matches[0]?.policy_tier).toBe('emergency');
    }
  });
});

describe('Soracloud API helpers', () => {
  it('fetchSoracloudStatus requests Torii soracloud status and parses the response', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        schema_version: 1,
        service_health: {
          mode: 'embedded_runtime_manager',
          status: 'healthy',
          message: 'runtime healthy',
          observed_height: 123,
          observed_block_hash: '0xblock',
          state_dir: '/tmp/soracloud/runtime',
          service_revisions: 4,
          healthy_service_revisions: 3,
          hydrating_service_revisions: 1,
          degraded_service_revisions: 0,
          unavailable_service_revisions: 0,
          apartments: 2,
          running_apartments: 1,
          expired_apartments: 1,
        },
        routing: {
          nexus_enabled: true,
          lane_count: 4,
          dataspace_count: 8,
          routing_rules: 12,
          default_lane_id: 0,
          default_dataspace_id: 0,
        },
        resource_pressure: {
          queue_active: 2,
          queue_queued: 5,
          queue_capacity: 32,
          queue_saturated: false,
          high_load_threshold: 16,
          high_load: false,
          runtime: {
            enabled: true,
            state_dir: '/tmp/soracloud/runtime',
            observed_height: 123,
            service_revisions: 4,
            apartments: 2,
            max_load_factor_bps: 9150,
            reported_pending_mailbox_messages: 7,
            authoritative_pending_mailbox_messages: 9,
            bundle_cache_misses: 1,
            artifact_cache_misses: 3,
          },
        },
        failed_admissions: {
          available: true,
          total: 11,
          governance_manifest_rejected: 4,
          sorafs_provider_rejected: 7,
        },
        runtime_manager: {
          available: true,
          state_dir: '/tmp/soracloud/runtime',
          snapshot: {},
        },
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 2,
          services: [],
          recent_audit_events: [],
        },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchSoracloudStatus } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });
    const result = await fetchSoracloudStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/v1/soracloud/status');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.service_health.status).toBe('healthy');
      expect(result.data.control_plane.service_count).toBe(1);
    }
  });

  it('fetchSoracloud inspector helpers route to the expected Torii status endpoints', async () => {
    const fetchSpy = vi.fn(async (input: URL) => {
      const pathname = input.pathname;

      if (pathname.endsWith('/service/config/status')) {
        return jsonResponse({
          schema_version: 1,
          service_name: 'web_portal',
          current_version: '2.0.0',
          config_generation: 3,
          config_entry_count: 1,
          configs: [],
        });
      }

      if (pathname.endsWith('/service/secret/status')) {
        return jsonResponse({
          schema_version: 1,
          service_name: 'web_portal',
          current_version: '2.0.0',
          secret_generation: 1,
          secret_entry_count: 0,
          secrets: [],
        });
      }

      if (pathname.endsWith('/training/job/status')) {
        return jsonResponse({
          schema_version: 1,
          job: {
            service_name: 'trainer',
            model_name: 'llm-demo',
            job_id: 'job-1',
            status: 'Running',
            worker_group_size: 1,
            target_steps: 10,
            completed_steps: 2,
            checkpoint_interval_steps: 5,
            last_checkpoint_step: null,
            checkpoint_count: 0,
            retry_count: 0,
            max_retries: 3,
            step_compute_units: 1,
            compute_budget_units: 10,
            compute_consumed_units: 2,
            compute_remaining_units: 8,
            storage_budget_bytes: 100,
            storage_consumed_bytes: 20,
            storage_remaining_bytes: 80,
            latest_metrics_hash: null,
            last_failure_reason: null,
            created_sequence: 1,
            updated_sequence: 2,
          },
        });
      }

      if (pathname.endsWith('/model/weight/status')) {
        return jsonResponse({
          schema_version: 1,
          model: {
            service_name: 'trainer',
            model_name: 'llm-demo',
            current_version: 'v1',
            version_count: 1,
            versions: [],
          },
        });
      }

      if (pathname.endsWith('/model/artifact/status')) {
        return jsonResponse({
          schema_version: 1,
          service_name: 'trainer',
          model_name: 'llm-demo',
          artifact_count: 1,
          artifact: {
            service_name: 'trainer',
            model_name: 'llm-demo',
            artifact_id: 'artifact-1',
            training_job_id: 'job-1',
            weight_version: null,
            weight_artifact_hash: '0xartifact',
            dataset_ref: 'dataset://demo',
            training_config_hash: '0xconfig',
            reproducibility_hash: '0xrepro',
            provenance_attestation_hash: '0xprov',
            registered_sequence: 10,
            consumed_by_version: null,
            private_bundle_root: null,
            compile_profile_hash: null,
            chunk_manifest_root: null,
            privacy_mode: null,
          },
          artifacts: [],
        });
      }

      if (pathname.endsWith('/model/upload/status') || pathname.endsWith('/model/compile/status')) {
        return jsonResponse({
          schema_version: 1,
          bundle: { model_id: 'model-1' },
          uploaded_chunk_count: 1,
          chunk_ordinals: [0],
          compile_profile: pathname.endsWith('/model/compile/status') ? { backend: 'cuda' } : null,
          artifact: null,
        });
      }

      if (pathname.endsWith('/model/run-status')) {
        return jsonResponse({
          schema_version: 1,
          session: { session_id: 'session-1' },
          checkpoint_count: 0,
          checkpoints: [],
        });
      }

      if (pathname.endsWith('/hf/status')) {
        return jsonResponse({
          schema_version: 1,
          source: { repo_id: 'org/model' },
          runtime_projection: null,
          pool: null,
          member: null,
          placement: null,
          latest_audit_event: null,
          audit_event_count: 0,
          storage_base_fee_nanos: '1',
          compute_reservation_fee_nanos: '2',
          eligible_host_count: 1,
          warm_host_count: 0,
          importer_pending: false,
        });
      }

      if (pathname.endsWith('/model-host/status')) {
        return jsonResponse({
          schema_version: 1,
          validator_account_id: null,
          active_host_count: 1,
          hosts: [],
        });
      }

      if (pathname.endsWith('/agent/status')) {
        return jsonResponse({
          schema_version: 1,
          apartment_count: 1,
          event_count: 2,
          apartments: [],
        });
      }

      if (pathname.endsWith('/agent/mailbox/status')) {
        return jsonResponse({
          schema_version: 1,
          apartment_name: 'tenant-a',
          status: 'Running',
          pending_message_count: 0,
          event_count: 0,
          messages: [],
        });
      }

      if (pathname.endsWith('/agent/autonomy/status')) {
        return jsonResponse({
          apartment_name: 'tenant-a',
          sequence: 1,
          status: 'Running',
          lease_expires_sequence: 2,
          lease_remaining_ticks: 3,
          manifest_hash: '0xmanifest',
          revoked_policy_capability_count: 0,
          budget_ceiling_units: 10,
          budget_remaining_units: 5,
          allowlist_count: 0,
          run_count: 0,
          process_generation: 1,
          process_started_sequence: 1,
          last_active_sequence: 1,
          last_checkpoint_sequence: null,
          checkpoint_count: 0,
          persistent_state_total_bytes: 0,
          persistent_state_key_count: 0,
          allowlist: [],
          recent_runs: [],
          runtime_recent_runs: [],
        });
      }

      throw new Error(`Unexpected Soracloud URL: ${input.toString()}`);
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });

    await module.fetchSoracloudServiceConfigStatus({ service_name: 'web_portal', config_name: 'ui/theme' });
    await module.fetchSoracloudServiceSecretStatus({ service_name: 'web_portal', secret_name: 'jwt/signing-key' });
    await module.fetchSoracloudTrainingJobStatus({ service_name: 'trainer', job_id: 'job-1' });
    await module.fetchSoracloudModelWeightStatus({ service_name: 'trainer', model_name: 'llm-demo' });
    await module.fetchSoracloudModelArtifactStatus({
      service_name: 'trainer',
      model_name: 'llm-demo',
      training_job_id: 'job-1',
      weight_version: 'v1',
    });
    await module.fetchSoracloudUploadedModelStatus({
      service_name: 'trainer',
      weight_version: 'v1',
      model_id: 'model-1',
      bundle_root: '0xbundle',
    });
    await module.fetchSoracloudPrivateCompileStatus({
      service_name: 'trainer',
      weight_version: 'v1',
      model_name: 'llm-demo',
      compile_profile_hash: '0xprofile',
    });
    await module.fetchSoracloudPrivateInferenceStatus({ session_id: 'session-1' });
    await module.fetchSoracloudHfSharedLeaseStatus({
      repo_id: 'org/model',
      revision: 'main',
      storage_class: 'hot',
      lease_term_ms: 60_000,
      account_id: SAMPLE_ACCOUNT_ALIAS,
    });
    await module.fetchSoracloudModelHostStatus({ account_id: SAMPLE_ACCOUNT_ALIAS });
    await module.fetchSoracloudAgentStatus({ apartment_name: 'tenant-a' });
    await module.fetchSoracloudAgentMailboxStatus({ apartment_name: 'tenant-a' });
    await module.fetchSoracloudAgentAutonomyStatus({ apartment_name: 'tenant-a' });

    const urls = fetchSpy.mock.calls.map(([input]) => (input as URL).toString());
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/service/config/status?service_name=web_portal&config_name=ui%2Ftheme'
    );
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/service/secret/status?service_name=web_portal&secret_name=jwt%2Fsigning-key'
    );
    expect(urls).toContain('https://torii.example/v1/soracloud/training/job/status?service_name=trainer&job_id=job-1');
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/model/weight/status?service_name=trainer&model_name=llm-demo'
    );
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/model/artifact/status?service_name=trainer&model_name=llm-demo&training_job_id=job-1&weight_version=v1'
    );
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/model/upload/status?service_name=trainer&weight_version=v1&model_id=model-1&bundle_root=0xbundle'
    );
    expect(urls).toContain(
      'https://torii.example/v1/soracloud/model/compile/status?service_name=trainer&weight_version=v1&model_name=llm-demo&compile_profile_hash=0xprofile'
    );
    expect(urls).toContain('https://torii.example/v1/soracloud/model/run-status?session_id=session-1');
    expect(urls).toContain(
      `https://torii.example/v1/soracloud/hf/status?repo_id=org%2Fmodel&revision=main&storage_class=hot&lease_term_ms=60000&account_id=${encodeURIComponent(SAMPLE_ACCOUNT_ALIAS)}`
    );
    expect(urls).toContain(
      `https://torii.example/v1/soracloud/model-host/status?account_id=${encodeURIComponent(SAMPLE_ACCOUNT_ALIAS)}`
    );
    expect(urls).toContain('https://torii.example/v1/soracloud/agent/status?apartment_name=tenant-a');
    expect(urls).toContain('https://torii.example/v1/soracloud/agent/mailbox/status?apartment_name=tenant-a');
    expect(urls).toContain('https://torii.example/v1/soracloud/agent/autonomy/status?apartment_name=tenant-a');
  });

  it('fetchSoracloud host and agent helpers allow empty filters', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        schema_version: 1,
        validator_account_id: null,
        active_host_count: 0,
        hosts: [],
      })
    );
    global.fetch = fetchSpy as any;

    const module = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });

    const hostResult = await module.fetchSoracloudModelHostStatus();
    expect(hostResult.status).toBe(SUCCESSFUL_FETCHING);
    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      'https://torii.example/v1/soracloud/model-host/status'
    );

    fetchSpy.mockImplementationOnce(() =>
      jsonResponse({
        schema_version: 1,
        apartment_count: 0,
        event_count: 0,
        apartments: [],
      })
    );
    const agentResult = await module.fetchSoracloudAgentStatus();
    expect(agentResult.status).toBe(SUCCESSFUL_FETCHING);
    expect((fetchSpy.mock.calls[1]?.[0] as URL).toString()).toBe('https://torii.example/v1/soracloud/agent/status');
  });
});

describe('Instruction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };
  const sampleAccountId = SAMPLE_ACCOUNT_ALIAS;
  const sampleAssetId = SAMPLE_ASSET_ID;

  it('fetchInstructions forwards account and asset filters', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchInstructions } = await importApiModule(toriiEnv);
    await fetchInstructions({
      limit: 10,
      account: sampleAccountId,
      asset_id: sampleAssetId,
      kind: 'Transfer',
      transaction_status: 'Committed',
    });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/instructions/query');
    expect(queryValue(fetchSpy, 0, 'account')).toBe(sampleAccountId);
    expect(queryValue(fetchSpy, 0, 'asset_id')).toBe(sampleAssetId);
    expect(queryValue(fetchSpy, 0, 'kind')).toBe('Transfer');
    expect(queryValue(fetchSpy, 0, 'transaction_status')).toBe('Committed');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetchInstructions parses payloads using the box field name', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            authority: SAMPLE_I105,
            created_at: '2026-02-11T12:00:00.000Z',
            kind: 'Log',
            box: {
              encoded: '0x01',
              framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
              json: {
                kind: 'Log',
                payload: {
                  value: { level: 'DEBUG', msg: 'hello' },
                  variant: 'Log',
                },
                wire_id: 'iroha_data_model::isi::transparent::Log',
              },
            },
            transaction_hash: '0xabc',
            transaction_status: 'Committed',
            block: 1,
            index: 0,
          },
        ],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchInstructions } = await importApiModule(toriiEnv);
    const result = await fetchInstructions({ limit: 10, transaction_hash: '0xabc' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/instructions/query');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].box.encoded).toBe('0x01');
      expect(result.data.items[0].box.framed_sha256).toBe(SAMPLE_FRAMED_INSTRUCTION_SHA256);
      expect(result.data.items[0].box.json.kind).toBe('Log');
    }
  });
});

describe('Transaction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };
  const sampleAuthority = SAMPLE_I105_ALT;
  const sampleAssetId = SAMPLE_ASSET_ID;

  it('fetchTransactions forwards asset filters', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [],
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransactions } = await importApiModule(toriiEnv);
    await fetchTransactions({ limit: 10, authority: sampleAuthority, status: 'Committed', asset_id: sampleAssetId });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/transactions/query');
    expect(queryValue(fetchSpy, 0, 'asset_id')).toBe(sampleAssetId);
    expect(queryValue(fetchSpy, 0, 'authority')).toBe(sampleAuthority);
    expect(queryValue(fetchSpy, 0, 'status')).toBe('Committed');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetchTransaction relies on the canonical response without a retired address-format query', async () => {
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/instructions')) {
        return jsonResponse({
          next_cursor: null,
          items: [],
        });
      }

      return jsonResponse({
        authority: sampleAuthority,
        hash: '0xdeadbeef',
        block: 42,
        created_at: '2026-03-10T12:00:00Z',
        executable: 'Instructions',
        status: 'Committed',
        rejection_reason: null,
        executable_payload: { instruction_count: 0 },
        metadata: {},
        nonce: null,
        signature: '0xsig',
        time_to_live: null,
      });
    });
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    await fetchTransaction('0xdeadbeef');

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/transactions/0xdeadbeef');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetches the current state-finality carrier from both exact ledger routes', async () => {
    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => jsonResponse(stateFinality));
    global.fetch = fetchSpy as any;
    const { fetchLedgerStateProof, fetchLedgerStateRoot } = await importApiModule(toriiEnv);
    const [root, stateProof] = await Promise.all([fetchLedgerStateRoot(12), fetchLedgerStateProof(12)]);

    expect(root).toEqual({ status: SUCCESSFUL_FETCHING, data: stateFinality });
    expect(stateProof).toEqual(root);
    expect(fetchSpy.mock.calls.map((call) => (call[0] as URL).pathname).sort()).toEqual([
      '/v1/ledger/state-proof/12',
      '/v1/ledger/state/12',
    ]);
    expect(fetchSpy.mock.calls.every(
      (call) => ((call[1] as RequestInit).headers as Record<string, string>).Accept === 'application/json'
    )).toBe(true);
  });

  it.each([401, 403, 503])('keeps block-evidence HTTP %i errors readable without displaying Norito bytes', async (status) => {
    global.fetch = vi.fn(async () => testResponse('NRT0\0\u0001binary error body', {
      status,
      headers: { 'content-type': 'application/x-norito', 'x-iroha-reject-code': 'canonical_authentication_required' },
    })) as any;
    const { fetchLedgerBlockProof } = await importApiModule(toriiEnv);
    const result = await fetchLedgerBlockProof(12, 'cf'.repeat(31) + 'ef');
    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status !== UNKNOWN_ERROR) throw new Error('expected HTTP evidence error');
    expect(result.error).toMatchObject({ status, rejectCode: 'canonical_authentication_required' });
    expect(result.error.message).toContain(`HTTP ${status}`);
    expect(result.error.message).not.toContain('NRT0');
    expect(result.error.message).not.toContain('binary error body');
    if (status === 401) expect(result.error.message).toContain('requires authenticated access');
  });

  it('does not self-anchor a canonical SDK block proof in the browser', async () => {
    const module = await importApiModule(toriiEnv);
    const { ToriiBrowserClient } = await import('@iroha/iroha-js/torii-browser');
    const decoded = {
      block_height: '42',
      block_hash: 'b'.repeat(64),
      executed_block_wire_hash: 'c'.repeat(64),
      entry_hash: 'not-a-valid-hash',
      entry_commitment: { root: 'not-a-valid-root', leaf_count: '1' },
      entry_proof: {
        leaf: 'not-a-valid-hash',
        proof: { leaf_index: 0, audit_path: [] },
      },
      result_commitment: { root: 'd'.repeat(64), leaf_count: '1' },
      result_proof: {
        leaf: 'e'.repeat(64),
        proof: { leaf_index: 0, audit_path: [] },
      },
      fastpq_transcripts: {},
    };
    const proofSpy = vi.spyOn(ToriiBrowserClient.prototype, 'getLedgerBlockProof').mockResolvedValue(decoded as any);

    const result = await module.fetchLedgerBlockProof(42, 'a'.repeat(64));

    expect(proofSpy).toHaveBeenCalledWith(42, 'a'.repeat(64));
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.proof).toBe(decoded);
      expect(result.data.pathVerification).toBeNull();
    }
    proofSpy.mockRestore();
  });

  it('keeps a missing canonical block proof explicitly not-found', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(() =>
        testResponse('missing', { status: 404, headers: { 'content-type': 'text/plain' } })
      ) as any;
    const { fetchLedgerBlockProof } = await importApiModule(toriiEnv);

    const result = await fetchLedgerBlockProof(42, 'a'.repeat(64));

    expect(result.status).toBe(NOT_FOUND);
  });

  it('fetchInstructionDetail relies on the canonical response without a retired address-format query', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        authority: sampleAuthority,
        created_at: '2026-03-10T12:00:00Z',
        kind: 'Log',
        box: {
          encoded: '',
          framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
          json: {
            kind: 'Log',
            payload: {
              value: { level: 'DEBUG', msg: 'hello' },
              variant: 'Log',
            },
          },
        },
        transaction_hash: '0xdeadbeef',
        transaction_status: 'Committed',
        block: 42,
        index: 0,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchInstructionDetail } = await importApiModule(toriiEnv);
    await fetchInstructionDetail('0xdeadbeef', 0);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/0xdeadbeef/0');
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetchInstructionContractView keeps the request on the explorer API without address-format params', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        code_hash: 'aa'.repeat(32),
        declared_code_hash: null,
        abi_hash: null,
        compiler_fingerprint: null,
        byte_len: 64,
        permissions: [],
        access_hints: null,
        entrypoints: [],
        analysis: null,
        warnings: [],
        rendered_source_kind: 'pseudo_source',
        rendered_source_text: 'contract Demo {}',
        verified_source_ref: null,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchInstructionContractView } = await importApiModule(toriiEnv);
    await fetchInstructionContractView('0xdeadbeef', 1);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/0xdeadbeef/1/contract-view');
    expect(firstCall.searchParams.get('address_format')).toBeNull();
  });

  it('submitVerifiedContractSource sends JSON to the Torii contracts endpoint and parses mismatch responses', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          job_id: 'job-1',
          code_hash: 'aa'.repeat(32),
          status: 'mismatch',
          submitted_at: '2026-03-28T00:00:00Z',
          completed_at: '2026-03-28T00:00:01Z',
          message: 'compiled source does not match the requested code hash',
          actual_code_hash: 'bb'.repeat(32),
          verified_source_ref: null,
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    global.fetch = fetchSpy as any;

    const { submitVerifiedContractSource } = await importApiModule(toriiEnv);
    const result = await submitVerifiedContractSource('aa'.repeat(32), {
      language: 'kotodama',
      source_name: 'demo.ko',
      source_text: 'kotoage fn main() {}',
    });

    expect(result.ok).toBe(false);
    expect(result.data?.status).toBe('mismatch');
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).pathname).toBe(`/v1/contracts/code/${'aa'.repeat(32)}/verified-source/jobs`);
    expect((requestInit as RequestInit)?.method).toBe('POST');
    expect((requestInit as RequestInit)?.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('fetchTransaction returns request rejections without retrying or adding retired query parameters', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('invalid explorer transaction request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction('0xdeadbeef');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(UNKNOWN_ERROR);
  });

  it('fetchTransaction returns unrelated 400 responses without retrying', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('invalid hash', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction('not-a-hash');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).not.toBe(SUCCESSFUL_FETCHING);
  });

  it('fetchTransaction returns a missing response without retrying', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('missing', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction('0xmissing');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(NOT_FOUND);
  });
});

describe('Torii metrics helpers', () => {
  it('fetchToriiMetricsText requests raw /metrics text from the selected node base', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('soranet_vpn_sessions_total 4\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchToriiMetricsText } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchToriiMetricsText();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/metrics');
    expect(requestInit.headers).toMatchObject({
      Accept: 'text/plain',
    });
    expect(result).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: 'soranet_vpn_sessions_total 4\n',
    });
  });

  it('fetchToriiMetricsText transforms non-OK raw metrics responses into an error result', async () => {
    runtimeConfigState.value = { toriiRequestRetryCount: 0, toriiRequestRetryBaseDelayMs: 0 };

    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('node unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchToriiMetricsText } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchToriiMetricsText();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status === UNKNOWN_ERROR) {
      expect(result.error.message).toBe('node unavailable');
    }
  });

  it('fetchToriiMetricsText retries network failures and then rethrows the final error', async () => {
    runtimeConfigState.value = { toriiRequestRetryCount: 1, toriiRequestRetryBaseDelayMs: 0 };

    const fetchSpy = vi.fn().mockRejectedValue(new TypeError('offline'));
    global.fetch = fetchSpy as any;

    const { fetchToriiMetricsText } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });

    await expect(fetchToriiMetricsText()).rejects.toThrow('offline');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('ZK prover report helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('returns empty report payloads by default when prover report API is disabled', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchZkProverReports, fetchZkProverReportCount } = await importApiModule(toriiEnv);

    const reportsResult = await fetchZkProverReports({ limit: 10, offset: 0, order: 'desc', status: 'all' });
    const countResult = await fetchZkProverReportCount({ status: 'all' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reportsResult.status).toBe(SUCCESSFUL_FETCHING);
    if (reportsResult.status === SUCCESSFUL_FETCHING) {
      expect(reportsResult.data).toEqual([]);
    }
    expect(countResult.status).toBe(SUCCESSFUL_FETCHING);
    if (countResult.status === SUCCESSFUL_FETCHING) {
      expect(countResult.data.count).toBe(0);
    }
  });

  it('calls prover report endpoints when explicitly enabled', async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse([]))
      .mockImplementationOnce(() => jsonResponse({ count: 3 }));
    global.fetch = fetchSpy as any;

    const { fetchZkProverReports, fetchZkProverReportCount } = await importApiModule({
      ...toriiEnv,
      VITE_ZK_PROVER_REPORTS_ENABLED: 'true',
    });

    const reportsResult = await fetchZkProverReports({ limit: 10, offset: 0, order: 'desc', status: 'all' });
    const countResult = await fetchZkProverReportCount({ status: 'all' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const secondCall = fetchSpy.mock.calls[1]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/zk/prover/reports?');
    expect(secondCall.toString()).toContain('/v1/zk/prover/reports/count');
    expect(reportsResult.status).toBe(SUCCESSFUL_FETCHING);
    expect(countResult.status).toBe(SUCCESSFUL_FETCHING);
  });
});
