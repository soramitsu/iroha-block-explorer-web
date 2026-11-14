import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { appendSearchParams } from '@/shared/api/query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'vue';
import { nextTick, ref } from 'vue';
import { jsonResponse, testResponse } from '../../../tests/fixtures/http-response';
import nativeLogFixture from '../../../tests/fixtures/taira-ce5-log-instruction.json';
import stateFinality from '../../../tests/fixtures/taira-state-finality.json';
import batchTransactions from '../../../tests/fixtures/taira-batch-transactions.json';
import type * as ApiIndexModule from './index';

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
const SAMPLE_LEDGER_HASH = 'ab'.repeat(32);
const REAL_TAIRA_HASH = 'hash:66BF60AB1C762607F02BBDFC834E2D832243EF413D0C24BBFF8EE3D00A2830DB#DB6C';
const REAL_TAIRA_HEX = '66bf60ab1c762607f02bbdfc834e2d832243ef413d0c24bbff8ee3d00a2830db';
const TORII_API_VERSION_HEADER = 'x-iroha-api-version';

const eventSourceStore = vi.hoisted(() => ({
  instances: [] as Array<{ source: unknown; data: Ref<string | null>; status: Ref<string> }>,
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

async function inspectFixtureIdentity(baseUrl: string, networkId: string) {
  const { ToriiBrowserClient } = await import('@iroha/iroha-js/torii-browser');
  const { NetworkId } = await import('@iroha/iroha-js/canonical-request');
  // The canonical account/key pair is the upstream native address fixture.
  const publicKey = '68f4b6017d0f876a55c80a82b8388a54aad264d367269e2de8be079c935b5f96';
  const inspectFetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
    jsonResponse({
      ...JSON.parse(String(init?.body)),
      canonical_hex: `0x02000120${publicKey}`,
      controller: { kind: 'single', algorithm: 'ed25519', public_key_hex: publicKey },
    })
  );
  const client = new ToriiBrowserClient(baseUrl, { networkId: NetworkId.parse(networkId), fetchImpl: inspectFetch });
  const identity = await client.inspectAccountIdentity(SAMPLE_I105);
  expect(new URL(String(inspectFetch.mock.calls[0][0])).pathname).toBe(
    `${new URL(baseUrl).pathname.replace(/\/+$/u, '')}/v1/accounts/inspect`
  );
  const init = inspectFetch.mock.calls[0][1];
  expect(init?.credentials).toBe('omit');
  expect(init?.redirect).toBe('error');
  expect(new Headers(init?.headers).has('X-Iroha-Account')).toBe(false);
  return identity;
}

/** Inspect the actual canonical POST query sent by the SDK. */
function queryValue(spy: { mock: { calls: unknown[][] } }, index: number, name: string): string | null {
  const options = spy.mock.calls[index]?.[1] as RequestInit;
  expect(options.method).toBe('POST');
  const query = JSON.parse(String(options.body));
  expect(Object.keys(query).every((key) => ['filter', 'limit', 'cursor'].includes(key))).toBe(true);
  if (name === 'limit' || name === 'cursor') return query[name] === undefined ? null : String(query[name]);
  const visit = (filter: { op: string; args: unknown[] } | undefined): unknown => {
    if (!filter) return undefined;
    if (filter.op === 'eq' && filter.args[0] === name) return filter.args[1];
    if (filter.op === 'and') {
      for (const child of filter.args) {
        const value = visit(child as { op: string; args: unknown[] });
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
  // Node's native storage file is shared by concurrent workers. Keep endpoint
  // fixtures local to this test so another suite cannot switch the API's node.
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => { entries.delete(key); },
    setItem: (key: string, value: string) => { entries.set(key, value); },
  } satisfies Storage);
});

afterEach(() => {
  global.fetch = nativeFetch;
  vi.unstubAllGlobals();
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
    window.localStorage.setItem('torii_base_url', 'https://saved-node.example');
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
    const api = await importApiModule({ VITE_API_URL: 'https://build-default.example' });
    expect(api.getToriiBaseUrl()).toBe('https://taira.sora.org');
    await api.fetchBlocks({ limit: 10 });
    expect(api.setRouteScopedToriiBaseUrl('https://scoped.example')).toBeNull();
    await api.fetchBlocks({ limit: 10 });
    for (const override of [() => api.setToriiBaseUrl('https://manual.example'), () => api.resetToriiBaseUrl()]) {
      expect(override).toThrow('locked by runtime configuration');
      await api.fetchBlocks({ limit: 10 });
    }
    expect(requests).toHaveLength(4);
    expect(requests.every((url) => url === 'https://taira.sora.org/v1/explorer/blocks/query')).toBe(true);
    expect(api.buildToriiWsUrl('/v1/telemetry/live')).toBe('wss://taira.sora.org/v1/telemetry/live');
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
  it('buildToriiUrl preserves an explicitly canonical /v1 Torii pathname', async () => {
    const { buildToriiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    expect(buildToriiUrl('/v1/telemetry/live')).toBe('https://torii.example/v1/telemetry/live');
    expect(buildToriiUrl('/v1/gov/capabilities')).toBe('https://torii.example/v1/gov/capabilities');
    expect(buildToriiUrl('/v1/soracloud/status')).toBe('https://torii.example/v1/soracloud/status');
    expect(buildToriiUrl('/v1/nexus/public_lanes/0/validators')).toBe(
      'https://torii.example/v1/nexus/public_lanes/0/validators'
    );
  });

  it('resolveApiUrl uses only the exact canonical route supplied by the caller', async () => {
    const { resolveApiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    expect(resolveApiUrl('/v1/assets/definitions')).toBe('https://torii.example/v1/assets/definitions');
    expect(resolveApiUrl('/v1/contracts/code/abcd/contract-view')).toBe(
      'https://torii.example/v1/contracts/code/abcd/contract-view'
    );
    expect(resolveApiUrl('/v1/gov/capabilities')).toBe('https://torii.example/v1/gov/capabilities');
    expect(resolveApiUrl('/v1/zk/proofs')).toBe('https://torii.example/v1/zk/proofs');
    expect(resolveApiUrl('/v1/telemetry/peers-info')).toBe('https://torii.example/v1/telemetry/peers-info');
    expect(resolveApiUrl('/v1/vpn/profile')).toBe('https://torii.example/v1/vpn/profile');
    expect(resolveApiUrl('/v1/soracloud/status')).toBe('https://torii.example/v1/soracloud/status');
    expect(resolveApiUrl('/v1/sorafs/pin')).toBe('https://torii.example/v1/sorafs/pin');
    expect(resolveApiUrl('/v1/nexus/dataspaces/accounts/alice%40wonderland/summary')).toBe(
      'https://torii.example/v1/nexus/dataspaces/accounts/alice%40wonderland/summary'
    );
  });

  it('buildToriiWsUrl mirrors the Torii origin protocol', async () => {
    const secureModule = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    expect(secureModule.buildToriiWsUrl('/v1/events/ws')).toBe('wss://torii.example/v1/events/ws');

    const insecureModule = await importApiModule({ VITE_API_URL: 'http://torii.example:8080' });
    expect(insecureModule.buildToriiWsUrl('/v1/events/ws')).toBe('ws://torii.example:8080/v1/events/ws');
  });

  it('streamTelemetryMetrics uses the v1 telemetry SSE path', async () => {
    const { streamTelemetryMetrics } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccounts({ limit: 10 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(validAccountId);
      expect(result.data.items[0]?.i105_address).toBe(validAccountId);
    }
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccounts({ cursor: 'cursor-1', limit: 2 })).rejects.toThrow('cursor did not advance');
  });

  it('returns an upstream cursor-page error without fabricating an empty page', async () => {
    global.fetch = vi.fn().mockImplementation(() => testResponse('cursor backend unavailable', { status: 503 })) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    const result = await fetchAccounts({ limit: 2 });

    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status === UNKNOWN_ERROR) expect(result.error.message).toContain('cursor backend unavailable');
    expect(result).not.toHaveProperty('data');
  });

  it('fetchAccount preserves and binds canonical i105 selectors', async () => {
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

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccount(SAMPLE_I105);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105)}`);
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

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org' });
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

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org' });
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

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    for (const assetId of [`${SAMPLE_ASSET_ID}#dataspace:007`, `${SAMPLE_ASSET_ID}#dataspace:18446744073709551616`]) {
      await expect(fetchAssets({ limit: 1, asset_id: assetId })).rejects.toThrow();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid owner/account selectors before issuing Explorer requests', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(api.fetchAccount('not an account')).rejects.toThrow(/Account ID/u);
    const requests = [
      () => api.fetchDomains({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchAssets({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchAssetDefinitions({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchNFTs({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchRwas({ limit: 1, owned_by: 'not an account' }),
    ];
    for (const request of requests) {
      await expect(request()).rejects.toThrow(/Account selector/u);
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

    const { fetchAsset } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

  it('refuses invalid and conflicting home filters before transport', async () => {
    global.fetch = vi.fn();
    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    for (const dataspace of ['', '0', '01', '18446744073709551616', ' 8648377547929788715']) {
      await expect(fetchAssetDefinitions({ dataspace })).rejects.toThrow();
    }
    await expect(fetchAssetDefinitions({ domain: 'issuer.main', dataspace: '8648377547929788715' })).rejects.toThrow(
      'either a domain or a dataspace'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetchAccount surfaces detail rejections without adding unsupported format queries or retrying', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse('invalid explorer account request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccount(SAMPLE_I105);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(UNKNOWN_ERROR);
  });
});

describe('Account read-only surface API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

  it('requests exact effective permissions with limit/offset and preserves JSON payload values', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          next_cursor: null,
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

  it('requests indexed account history with an exact asset selector and preserves amount strings', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      testResponse(
        JSON.stringify({
          next_cursor: null,
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
      testResponse(JSON.stringify({ next_cursor: null, items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
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

  it('signs Connect-approved I105 identities using canonical ASCII transport headers', async () => {
    runtimeConfigState.value = { networkId: `hash:${'AB'.repeat(32)}#B99E` };
    const fetchSpy = vi.fn(async () => testResponse('missing', { status: 404 }));
    global.fetch = fetchSpy as any;
    const sign = vi.fn(async () => new Uint8Array(64).fill(7));
    const { fetchMultisigProposals, fetchMultisigSpec, getToriiBaseUrl } = await importApiModule(toriiEnv);
    const auth = {
      authAccountId: SAMPLE_I105,
      sign,
      nativeIdentity: await inspectFixtureIdentity(getToriiBaseUrl(), String(runtimeConfigState.value.networkId)),
    };
    expect((await fetchMultisigSpec(SAMPLE_ACCOUNT_ALIAS, auth)).status).toBe(NOT_FOUND);
    expect((await fetchMultisigProposals(SAMPLE_I105, { limit: 20 }, auth)).status).toBe(NOT_FOUND);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const headers = new Headers((fetchSpy.mock.calls[0] as unknown as [unknown, RequestInit])[1].headers);
    expect(headers.get('X-Iroha-Account')).toMatch(/^[\x20-\x7e]+$/u);
    expect(headers.get('X-Iroha-Signature')).toBeTruthy();
  });

  it.each([''])(
    'signs private collections and proofs at base prefix %s and returns to anonymous reads after disconnect',
    async (prefix) => {
      const networkId = `hash:${'AB'.repeat(32)}#B99E`;
      runtimeConfigState.value = { networkId };
      const fetchSpy = vi.fn(async (url: unknown, _init?: RequestInit) =>
        String(url).endsWith('/proof')
          ? testResponse('hidden', { status: 404 })
          : jsonResponse({ items: [], next_cursor: null })
      );
      global.fetch = fetchSpy as any;
      const api = await importApiModule({ VITE_API_URL: `https://torii.example${prefix}` });
      const { activateExplorerReadSession, disconnectExplorerReadSession } = await import(
        '@/shared/lib/explorer-read-auth'
      );
      const sign = vi.fn(async (_input: unknown) => new Uint8Array(64).fill(7));
      const nativeIdentity = await inspectFixtureIdentity(api.getToriiBaseUrl(), networkId);
      activateExplorerReadSession({
        baseUrl: api.getToriiBaseUrl(),
        networkId,
        auth: { authAccountId: SAMPLE_I105, sign, nativeIdentity },
        close: vi.fn(),
      });
      try {
        expect((await api.fetchTransactions({ limit: 1 })).status).toBe(SUCCESSFUL_FETCHING);
        expect((await api.fetchTransactionProof(SAMPLE_LEDGER_HASH)).status).toBe(NOT_FOUND);
        expect(sign).toHaveBeenCalledTimes(2);
        expect(sign.mock.calls.map(([request]) => (request as { path: string }).path)).toEqual([
          `${prefix}/v1/explorer/transactions/query`,
          `${prefix}/v1/explorer/transactions/${SAMPLE_LEDGER_HASH}/proof`,
        ]);
        for (const [, init] of fetchSpy.mock.calls) {
          expect(new Headers(init?.headers).get('X-Iroha-Signature')).toBeTruthy();
          expect(init?.credentials).toBe('omit');
          expect(init?.redirect).toBe('error');
        }
        disconnectExplorerReadSession();
        await api.fetchTransactions({ limit: 1 });
        expect(sign).toHaveBeenCalledTimes(2);
        expect(new Headers(fetchSpy.mock.calls[2]?.[1]?.headers).has('X-Iroha-Account')).toBe(false);
      } finally {
        disconnectExplorerReadSession();
      }
    }
  );

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
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
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
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

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
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

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
            kind: 'Log',
            transaction_status: 'Committed',
            created_at: '2026-03-05T06:00:01Z',
            box: nativeLogFixture.box,
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
      expect(result.data.items[0]?.kind).toBe('Log');
    }
  });
});

describe('Nexus dataspaces API helpers', () => {
  it('fetchNexusDataspacesAccountSummary requests Torii nexus endpoint and parses response', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        account: SAMPLE_I105,
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
      VITE_API_URL: 'https://torii.example',
    });
    const result = await fetchNexusDataspacesAccountSummary(SAMPLE_I105);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toBe(
      `https://torii.example/v1/nexus/dataspaces/accounts/${encodeURIComponent(SAMPLE_I105)}/summary`
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
        dataspace_catalog: [{ lane_id: 0, dataspace_id: 0, alias: 'universal' }],
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
      VITE_API_URL: 'https://torii.example',
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

  it('fetchNexusPublicStatus preserves full-width u64 originals in backlog and catalogue', async () => {
    const body =
      '{"blocks":18,"txs_approved":18,"txs_rejected":0,"queue_size":0,"teu_dataspace_backlog":[{"lane_id":8,"dataspace_id":8648377547929788715,"fault_tolerance":1,"backlog":0,"age_slots":0,"virtual_finish":0,"tx_served":0,"alias":"bpng","description":null}],"dataspace_catalog":[{"lane_id":8,"dataspace_id":8648377547929788715,"alias":"bpng"},{"lane_id":9,"dataspace_id":18446744073709551615,"alias":"maximum"}]}';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        testResponse(body, { status: 200, headers: { 'content-type': 'application/json' } })
      ) as any;
    const { fetchNexusPublicStatus } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchNexusPublicStatus();
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.teu_dataspace_backlog[0]?.dataspace_id).toBe('8648377547929788715');
      expect(result.data.dataspace_catalog.map((entry) => entry.dataspace_id)).toEqual([
        '8648377547929788715',
        '18446744073709551615',
      ]);
    }
  });

  it('fetchNexusPublicStatus rejects duplicate identity fields rather than choosing one', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(testResponse('{"blocks":18,"blocks":19}', { status: 200 })) as any;
    const { fetchNexusPublicStatus } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    await expect(fetchNexusPublicStatus()).rejects.toThrow(/duplicate/i);
  });

  it('fetchNexusPublicStatus returns not-found when /status is unavailable', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });
    global.fetch = fetchSpy as any;

    const { fetchNexusPublicStatus } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });
    const result = await fetchNexusPublicStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/status');
    expect(result.status).toBe(NOT_FOUND);
  });
});

describe('Instruction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
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

  it('preserves the current native opaque envelope through the SDK collection boundary', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => jsonResponse({ next_cursor: null, items: [nativeLogFixture] }));
    global.fetch = fetchSpy as any;
    const { fetchInstructions } = await importApiModule(toriiEnv);
    const result = await fetchInstructions({ limit: 10, transaction_hash: nativeLogFixture.transaction_hash });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) throw new Error('Native instruction response was rejected');
    expect(result.data.nextCursor).toBeNull();
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].box).toEqual({
      encoded: nativeLogFixture.box.instruction,
      framed_sha256: `0x${nativeLogFixture.box.framed_sha256}`,
      wire_id: nativeLogFixture.box.wire_id,
      json: null,
    });
  });

  it('refuses retired decoded wire payloads rather than fabricating native instruction bytes', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({
        next_cursor: null,
        items: [
          {
            ...nativeLogFixture,
            box: {
              encoded: '0x01',
              framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
              json: { kind: 'Log', payload: {} },
            },
          },
        ],
      })
    ) as any;
    const { fetchInstructions } = await importApiModule(toriiEnv);
    await expect(
      fetchInstructions({ limit: 10, transaction_hash: nativeLogFixture.transaction_hash })
    ).rejects.toThrow();
  });
});

describe('Transaction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
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

  it('fetchTransactions returns the captured Batch row of Taira block 12340', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => jsonResponse(batchTransactions.block_12340_page));
    global.fetch = fetchSpy as any;
    const { fetchTransactions } = await importApiModule(toriiEnv);
    const result = await fetchTransactions({ limit: 10, block: 12340 });

    expect(queryValue(fetchSpy, 0, 'block')).toBe('12340');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) throw new Error('The Batch transaction page was rejected');
    expect(result.data.items.map(({ block, executable, status }) => ({ block, executable, status }))).toEqual([
      { block: 12340, executable: 'Batch', status: 'Committed' },
    ]);
    expect(result.data.nextCursor).toBeNull();
  });

  it('fetchTransaction returns a captured contract-call Batch detail with canonical identity binding', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => jsonResponse(batchTransactions.batch_detail));
    global.fetch = fetchSpy as any;
    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction(batchTransactions.batch_detail.hash);

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe(
      '/v1/explorer/transactions/9fceeafec84a5589aae0eeeec079e5810d6a383af068d57a2578899a7a46a195'
    );
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status !== SUCCESSFUL_FETCHING) throw new Error('The Batch transaction detail was rejected');
    expect(result.data.hash).toBe(batchTransactions.batch_detail.hash);
    expect(result.data.executable).toBe('Batch');
    expect(result.data.executable_payload).toEqual({ item_count: 1, instruction_count: 0, contract_call_count: 1 });
    await expect(fetchTransaction(SAMPLE_LEDGER_HASH)).rejects.toThrow(
      'Torii transaction response identity does not match the request'
    );
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
        hash: SAMPLE_LEDGER_HASH,
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
    await fetchTransaction(SAMPLE_LEDGER_HASH);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/transactions/${SAMPLE_LEDGER_HASH}`);
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
    expect(
      fetchSpy.mock.calls.every(
        (call) => ((call[1] as RequestInit).headers as Record<string, string>).Accept === 'application/json'
      )
    ).toBe(true);
  });

  it.each([401, 403, 503])(
    'keeps transaction-evidence HTTP %i errors readable without displaying Norito bytes',
    async (status) => {
      global.fetch = vi.fn(async () =>
        testResponse('NRT0\0\u0001binary error body', {
          status,
          headers: {
            'content-type': 'application/x-norito',
            'x-iroha-reject-code': 'canonical_authentication_required',
          },
        })
      ) as any;
      const { fetchTransactionProof } = await importApiModule(toriiEnv);
      const result = await fetchTransactionProof('cf'.repeat(31) + 'ef');
      expect(result.status).toBe(UNKNOWN_ERROR);
      if (result.status !== UNKNOWN_ERROR) throw new Error('expected HTTP evidence error');
      expect(result.error).toMatchObject({ status, rejectCode: 'canonical_authentication_required' });
      expect(result.error.message).toContain(`HTTP ${status}`);
      expect(result.error.message).not.toContain('NRT0');
      expect(result.error.message).not.toContain('binary error body');
      if (status === 401) expect(result.error.message).toContain('requires authenticated access');
    }
  );

  it('keeps a missing or inaccessible selective proof explicitly not-found', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(() =>
        testResponse('missing', { status: 404, headers: { 'content-type': 'text/plain' } })
      ) as any;
    const { fetchTransactionProof } = await importApiModule(toriiEnv);

    const result = await fetchTransactionProof(SAMPLE_LEDGER_HASH);

    expect(result.status).toBe(NOT_FOUND);
  });

  it('fetchInstructionDetail relies on the canonical response without a retired address-format query', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      jsonResponse({
        authority: sampleAuthority,
        created_at: '2026-03-10T12:00:00Z',
        kind: 'Log',
        box: nativeLogFixture.box,
        transaction_hash: SAMPLE_LEDGER_HASH,
        transaction_status: 'Committed',
        block: 42,
        index: 0,
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchInstructionDetail } = await importApiModule(toriiEnv);
    await fetchInstructionDetail(SAMPLE_LEDGER_HASH, 0);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/instructions/${SAMPLE_LEDGER_HASH}/0`);
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
    await fetchInstructionContractView(SAMPLE_LEDGER_HASH, 1);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/instructions/${SAMPLE_LEDGER_HASH}/1/contract-view`);
    expect(firstCall.searchParams.get('address_format')).toBeNull();
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
    const result = await fetchTransaction(SAMPLE_LEDGER_HASH);

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
    const result = await fetchTransaction(SAMPLE_LEDGER_HASH);

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
    const result = await fetchTransaction(SAMPLE_LEDGER_HASH);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(NOT_FOUND);
  });
});

describe('Validated ledger hash API selectors', () => {
  const env = { VITE_API_URL: 'https://torii.example' };

  it.each([
    ['transaction', (api: ApiModule) => api.fetchTransaction(REAL_TAIRA_HASH), `/transactions/${REAL_TAIRA_HEX}`],
    ['block hash', (api: ApiModule) => api.fetchBlock(REAL_TAIRA_HASH), `/blocks/${REAL_TAIRA_HEX}`],
    [
      'instruction',
      (api: ApiModule) => api.fetchInstructionDetail(REAL_TAIRA_HASH, 2),
      `/instructions/${REAL_TAIRA_HEX}/2`,
    ],
    [
      'contract view',
      (api: ApiModule) => api.fetchInstructionContractView(REAL_TAIRA_HASH, 2),
      `/instructions/${REAL_TAIRA_HEX}/2/contract-view`,
    ],
    ['numeric height', (api: ApiModule) => api.fetchBlock(9), '/blocks/9'],
    ['string height', (api: ApiModule) => api.fetchBlock('9'), '/blocks/9'],
    ['numeric-looking hash', (api: ApiModule) => api.fetchBlock('11'.repeat(32)), `/blocks/${'11'.repeat(32)}`],
  ])('projects %s into the exact selector accepted by Torii', async (_label, request, suffix) => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL) => testResponse('missing', { status: 404 }));
    global.fetch = fetchSpy;
    const api = await importApiModule(env);
    await request(api);
    const url = fetchSpy.mock.calls[0]?.[0] as unknown as URL;
    expect(url.pathname).toBe(`/v1/explorer${suffix}`);
    expect(url.hash).toBe('');
  });

  it.each(['fetchInstructions', 'fetchLatestInstructions'] as const)(
    'preserves filters and paging in %s while projecting the validated hash',
    async (method) => {
      const fetchSpy = vi.fn(async () => jsonResponse({ next_cursor: null, items: [] }));
      global.fetch = fetchSpy;
      const api = await importApiModule(env);
      await api[method]({ transaction_hash: REAL_TAIRA_HASH, block: 9, kind: 'Log', limit: 5, cursor: 'next-page' });
      expect(queryValue(fetchSpy, 0, 'transaction_hash')).toBe(REAL_TAIRA_HEX);
      expect(queryValue(fetchSpy, 0, 'block')).toBe('9');
      expect(queryValue(fetchSpy, 0, 'kind')).toBe('Log');
      expect(queryValue(fetchSpy, 0, 'limit')).toBe('5');
      expect(queryValue(fetchSpy, 0, 'cursor')).toBe('next-page');
    }
  );
});
