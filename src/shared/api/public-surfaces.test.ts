import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';
import { publicKeyFromPrivate, signEd25519 } from '@iroha/iroha-js/crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'vue';
import { ref } from 'vue';
import type * as ApiIndexModule from './index';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_DEFINITION_ID_ALT = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_NETWORK_ID = 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0';
const SAMPLE_TRANSACTION_HASH_ALT = 'cd'.repeat(32);
const SAMPLE_ORACLE_PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SAMPLE_ORACLE_SIGNER_PUBLIC_KEY = Array.from(publicKeyFromPrivate(SAMPLE_ORACLE_PRIVATE_KEY));
const SAMPLE_ORACLE_PROVIDER = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const compactJsonBytes = (source: string): number[] => Array.from(new TextEncoder().encode(source));
const signOraclePayload = (payload: readonly number[]): number[] =>
  Array.from(signEd25519(Uint8Array.from(payload), SAMPLE_ORACLE_PRIVATE_KEY));

const eventSourceStore = vi.hoisted(() => ({
  instances: [] as Array<{
    source: unknown;
    data: Ref<string | null>;
    status: Ref<string>;
    open: ReturnType<typeof vi.fn>;
  }>,
}));

const runtimeConfigState = vi.hoisted((): { value: Record<string, unknown> } => ({
  value: {},
}));

vi.mock('@vueuse/core', () => {
  return {
    useEventSource: vi.fn((source: unknown) => {
      const entry = { source, data: ref<string | null>(null), status: ref('CONNECTING'), open: vi.fn() };
      eventSourceStore.instances.push(entry);
      return { data: entry.data, status: entry.status, open: entry.open };
    }),
  };
});

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => runtimeConfigState.value,
}));

type ApiEnv = Partial<Record<'VITE_API_URL', string>>;
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

const nativeFetch = global.fetch;
const nativeFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

interface MockByteReadResult {
  done: boolean;
  value: Uint8Array | undefined;
}

interface MockByteReader {
  read: () => Promise<MockByteReadResult>;
  cancel: (reason?: unknown) => Promise<void>;
  releaseLock: () => void;
}

interface MockByteStreamBody {
  getReader: () => MockByteReader;
}

interface SdkReadableResponse {
  body: MockByteStreamBody;
  headers: Headers;
  json: () => Promise<unknown>;
}

function responseStatus(response: Response): number {
  if (typeof response.status === 'number') return response.status;
  return response.ok ? 200 : 0;
}

async function readMockResponseText(response: Response): Promise<string> {
  if (typeof response.text === 'function') return await response.text();
  if (typeof response.json === 'function') return JSON.stringify(await response.json());
  return '';
}

function byteStreamBody(text: string): MockByteStreamBody {
  const encoded = new TextEncoder().encode(text);
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);

  return {
    getReader() {
      let complete = false;
      return {
        async read(): Promise<MockByteReadResult> {
          if (complete) return { done: true, value: undefined };
          complete = true;
          return { done: false, value: new Uint8Array(bytes) };
        },
        async cancel() {
          complete = true;
        },
        releaseLock() {},
      };
    },
  };
}

function sdkReadableResponse(source: Response, text: string): Response {
  const status = responseStatus(source);
  const response = {
    body: byteStreamBody(text),
    bodyUsed: false,
    headers: source.headers ?? new Headers(),
    ok: status >= 200 && status < 300,
    redirected: source.redirected ?? false,
    status,
    statusText: source.statusText ?? '',
    type: source.type ?? 'basic',
    url: source.url ?? '',
    async arrayBuffer() {
      const encoded = new TextEncoder().encode(text);
      return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    },
    async blob() {
      return new Blob([text]);
    },
    clone() {
      return sdkReadableResponse(source, text);
    },
    async formData() {
      throw new TypeError('Mock response body is JSON, not form data');
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
  return response as unknown as Response;
}

async function normalizeSdkMockResponse(response: Response): Promise<Response> {
  const status = responseStatus(response);
  if (status < 200 || status >= 300 || status === 204) return response;
  return sdkReadableResponse(response, await readMockResponseText(response));
}

function wrapTestFetch(fetchImpl: typeof fetch): typeof fetch {
  return vi.fn(async (...args: Parameters<typeof fetch>) => {
    const response = await fetchImpl(...args);
    return await normalizeSdkMockResponse(response);
  }) as typeof fetch;
}

let activeFetch = nativeFetch;

function pendingFetchUntilAbort(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal;
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) {
      reject(new Error('expected an abortable request signal'));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

beforeEach(() => {
  activeFetch = nativeFetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: nativeFetchDescriptor?.enumerable ?? true,
    get: () => activeFetch,
    set: (fetchImpl: typeof fetch) => {
      activeFetch = wrapTestFetch(fetchImpl);
    },
  });
  eventSourceStore.instances.length = 0;
  runtimeConfigState.value = {};
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') localStorage.clear();
});

afterEach(() => {
  if (nativeFetchDescriptor) {
    Object.defineProperty(globalThis, 'fetch', nativeFetchDescriptor);
  } else {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      enumerable: true,
      value: nativeFetch,
      writable: true,
    });
  }
});
describe('API url builders', () => {
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
});
describe('Explorer accounts API helpers', () => {
  it('fetchAccountQr uses the authoritative account QR route and strict Torii DTO', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canonical_id: SAMPLE_I105,
          literal: SAMPLE_I105,
          network_prefix: 753,
          error_correction: 'M',
          modules: 192,
          qr_version: 8,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const { fetchAccountQr } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccountQr(SAMPLE_I105);

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe(
      `/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105)}/qr`
    );
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toMatchObject({
        canonicalId: SAMPLE_I105,
        literal: SAMPLE_I105,
        networkPrefix: 753,
        errorCorrection: 'M',
        modules: 192,
        qrVersion: 8,
      });
    }
  });

  it('fetchAccountQr rejects a valid QR response for a different account', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canonical_id: SAMPLE_I105_ALT,
          literal: SAMPLE_I105_ALT,
          network_prefix: 753,
          error_correction: 'M',
          modules: 192,
          qr_version: 8,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;

    const { fetchAccountQr } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccountQr(SAMPLE_I105)).rejects.toThrow('canonical_id does not match the requested account ID');
  });

  it('fetchAccountQr rejects an inexact first-release QR contract', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canonical_id: SAMPLE_I105,
          literal: SAMPLE_I105_ALT,
          network_prefix: 753,
          error_correction: 'L',
          modules: 256,
          qr_version: 8,
          svg: '<svg/>',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;

    const { fetchAccountQr } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccountQr(SAMPLE_I105)).rejects.toThrow();
  });

  it('fetchConfidentialAssetTransitions reads the exact public route and binds its canonical identity', async () => {
    const payload = {
      asset_id: SAMPLE_ASSET_DEFINITION_ID,
      block_height: 1_050,
      current_mode: 'Convertible',
      effective_mode: 'Convertible',
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: {
        transition_id: 'CD'.repeat(32),
        previous_mode: 'Convertible',
        new_mode: 'ShieldedOnly',
        effective_height: 1_200,
        conversion_window: 200,
        window_open_height: 1_000,
      },
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchConfidentialAssetTransitions } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    const result = await fetchConfidentialAssetTransitions(SAMPLE_ASSET_DEFINITION_ID);

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe(
      `/v1/confidential/assets/${SAMPLE_ASSET_DEFINITION_ID}/transitions`
    );
    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: {
        asset_id: SAMPLE_ASSET_DEFINITION_ID,
        block_height: '1050',
        current_mode: 'Convertible',
        pending_transition: { window_open_height: '1000' },
      },
    });
  });

  it('fetchConfidentialAssetTransitions preserves full-width u64 fields without rounding', async () => {
    const maxU64 = '18446744073709551615';
    const payload = JSON.stringify({
      asset_id: SAMPLE_ASSET_DEFINITION_ID,
      block_height: '__MAX_U64__',
      current_mode: 'Convertible',
      effective_mode: 'ShieldedOnly',
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: {
        transition_id: 'CD'.repeat(32),
        previous_mode: 'Convertible',
        new_mode: 'ShieldedOnly',
        effective_height: '__MAX_U64__',
        conversion_window: 1,
        window_open_height: '18446744073709551614',
      },
    })
      .replaceAll('"__MAX_U64__"', maxU64)
      .replace('"18446744073709551614"', '18446744073709551614');
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(payload, { status: 200, headers: { 'content-type': 'application/json' } })
      ) as any;
    const { fetchConfidentialAssetTransitions } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    const result = await fetchConfidentialAssetTransitions(SAMPLE_ASSET_DEFINITION_ID);

    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: {
        block_height: maxU64,
        pending_transition: {
          effective_height: maxU64,
          window_open_height: '18446744073709551614',
        },
      },
    });
  });

  it('fetchConfidentialAssetTransitions rejects a different definition identity', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset_id: SAMPLE_ASSET_DEFINITION_ID_ALT,
          block_height: 10,
          current_mode: 'TransparentOnly',
          effective_mode: 'TransparentOnly',
          vk_set_hash: null,
          poseidon_params_id: null,
          pedersen_params_id: null,
          pending_transition: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;
    const { fetchConfidentialAssetTransitions } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    await expect(fetchConfidentialAssetTransitions(SAMPLE_ASSET_DEFINITION_ID)).rejects.toThrow(
      'confidential asset policy response identity does not match the requested resource'
    );
  });

  it('fetchConfidentialAssetTransitions rejects aliases before issuing its canonical-id-only request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { fetchConfidentialAssetTransitions } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    await expect(fetchConfidentialAssetTransitions(SAMPLE_ASSET_ALIAS)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchConfidentialAssetTransitions rejects retired transition DTO fields', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset_id: SAMPLE_ASSET_DEFINITION_ID,
          definition_id: SAMPLE_ASSET_DEFINITION_ID,
          block_height: 10,
          current_mode: 'TransparentOnly',
          effective_mode: 'TransparentOnly',
          vk_set_hash: null,
          poseidon_params_id: null,
          pedersen_params_id: null,
          pending_transition: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;
    const { fetchConfidentialAssetTransitions } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    await expect(fetchConfidentialAssetTransitions(SAMPLE_ASSET_DEFINITION_ID)).rejects.toThrow();
  });
});
describe('Explorer latest/health API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const systemParameters = {
    sumeragi: {
      block_cadence_ms: 1000,
      max_clock_drift_ms: 50,
      key_activation_lead_blocks: 10,
      key_overlap_grace_blocks: 5,
      key_expiry_grace_blocks: 2,
      key_require_hsm: false,
      key_allowed_algorithms: ['ed25519'],
      key_allowed_hsm_providers: [],
    },
    block: { max_transactions: 512 },
    transaction: {
      max_signatures: 16,
      max_instructions: 4096,
      ivm_bytecode_size: 1048576,
      max_tx_bytes: 4194304,
      max_decompressed_bytes: 8388608,
      max_metadata_depth: 64,
      max_time_to_live_ms: 86400000,
      require_height_ttl: true,
      require_sequence: true,
    },
    executor: {
      fuel: 55000000,
      memory: 1048576,
      execution_depth: 3,
      max_output_items: 4096,
      max_output_bytes: 8388608,
    },
    smart_contract: {
      fuel: 55000000,
      memory: 1048576,
      execution_depth: 3,
      max_output_items: 4096,
      max_output_bytes: 8388608,
    },
  };

  it('fetchSystemParameters reads and strictly parses the exact public /v1/parameters snapshot', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(systemParameters), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchSystemParameters } = await importApiModule(toriiEnv);
    const result = await fetchSystemParameters();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe('/v1/parameters');
    expect(result).toMatchObject({ status: SUCCESSFUL_FETCHING, data: systemParameters });
  });

  it('fetchSystemParameters rejects retired or unknown response fields', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...systemParameters, legacy_limits: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as any;

    const { fetchSystemParameters } = await importApiModule(toriiEnv);
    await expect(fetchSystemParameters()).rejects.toThrow();
  });
});

describe('Soracles public API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const hash = `hash:${'AB'.repeat(32)}#B99E`;
  const feed = {
    feed_id: ['price_xor_usd'],
    feed_config_version: [1],
    providers: [SAMPLE_I105],
    connector_id: 'http-bin',
    connector_version: 2,
    cadence_slots: 5,
    aggregation: { aggregation_rule: 'MedianMad', value: 300 },
    outlier_policy: { outlier_policy: 'Mad', value: 350 },
    min_signers: 1,
    committee_size: 1,
    risk_class: { risk_class: 'Medium', value: null },
    max_observers: 4,
    max_value_len: 128,
    max_error_rate_bps: 250,
    dispute_window_slots: 10,
    replay_window_slots: 4,
  };
  const event = {
    feed_id: ['price_xor_usd'],
    feed_config_version: [1],
    slot: 10,
    request_hash: hash,
    outcome: { result: 'Missing', detail: null },
  };
  const record = {
    event,
    recorded_at_ms: 1_700_000_000_123,
    evidence_hashes: [hash],
  };
  const attestationHash = deriveDefiOracleAttestationHash({
    domain: 1,
    subjectId: '42',
    oracleSlot: '10',
    statusFlags: 7,
    sourceEvents: [{ feedId: 'price_xor_usd', slot: '10', requestHash: hash, field: 'price' }],
  });
  const attestationPayload = compactJsonBytes(
    `{"domain":1,"market_id":42,"mark_price_bps":100,"index_price_bps":99,"confidence_bps":1,"oracle_slot":10,"status_flags":7,"attestation_hash":${attestationHash},"price":100}`
  );
  const attestation = {
    key: { domain: 1, subject_id: 42 },
    provider: SAMPLE_ORACLE_PROVIDER,
    oracle_slot: 10,
    status_flags: 7,
    attestation_hash: '__ATTESTATION_HASH__',
    oracle_payload: attestationPayload,
    oracle_signature: signOraclePayload(attestationPayload),
    signer_public_key: SAMPLE_ORACLE_SIGNER_PUBLIC_KEY,
    oracle_scheme: 1,
    source_events: [{ feed_id: ['price_xor_usd'], slot: 10, request_hash: hash, field: 'price' }],
  };
  const serializeAttestation = (value: unknown): string =>
    JSON.stringify(value).replaceAll('"__ATTESTATION_HASH__"', attestationHash);

  it('fetches and strictly parses the exact public feed registry', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([feed]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchSoracleFeeds } = await importApiModule(toriiEnv);

    const result = await fetchSoracleFeeds();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe('/v1/soracles/feeds');
    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: [{ feed_id: ['price_xor_usd'], cadence_slots: '5', dispute_window_slots: '10' }],
    });
  });

  it('rejects a successful Soracles body with a non-JSON media type', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([feed]), {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    ) as any;
    const { fetchSoracleFeeds } = await importApiModule(toriiEnv);

    await expect(fetchSoracleFeeds()).rejects.toThrow(/application\/json media type/u);
  });

  it('rejects invalid UTF-8 before interpreting Soracles JSON', async () => {
    activeFetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.of(0xff), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as typeof fetch;
    const { fetchSoracleFeeds } = await importApiModule(toriiEnv);

    await expect(fetchSoracleFeeds()).rejects.toThrow(/must be valid UTF-8/u);
  });

  it('rejects retired scalar feed newtypes and unknown feed fields', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ ...feed, feed_id: 'price_xor_usd', legacy_mode: true }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as any;
    const { fetchSoracleFeeds } = await importApiModule(toriiEnv);

    await expect(fetchSoracleFeeds()).rejects.toThrow();
  });

  it('rejects duplicate feed identities that cannot originate from the signed keyed registry', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([feed, feed]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as any;
    const { fetchSoracleFeeds } = await importApiModule(toriiEnv);

    await expect(fetchSoracleFeeds()).rejects.toThrow();
  });

  it('fetches exact feed history and binds every event to the requested feed', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([record]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchSoracleFeedHistory } = await importApiModule(toriiEnv);

    const result = await fetchSoracleFeedHistory('price_xor_usd');

    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe('/v1/soracles/feeds/price_xor_usd/history');
    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: [{ event: { feed_id: ['price_xor_usd'], slot: '10' }, recorded_at_ms: '1700000000123' }],
    });
  });

  it('preserves full-width retained history slots and timestamps', async () => {
    const maxU64 = '18446744073709551615';
    const raw = JSON.stringify({
      event: { ...event, slot: '__MAX_U64__' },
      recorded_at_ms: '__MAX_U64__',
      evidence_hashes: [hash],
    }).replaceAll('"__MAX_U64__"', maxU64);
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(`[${raw}]`, { status: 200, headers: { 'content-type': 'application/json' } })
      ) as any;
    const { fetchSoracleFeedHistory } = await importApiModule(toriiEnv);

    const result = await fetchSoracleFeedHistory('price_xor_usd');

    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: [{ event: { slot: maxU64 }, recorded_at_ms: maxU64 }],
    });
  });

  it('rejects noncanonical feed ids before I/O and mismatched history identities after parsing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ ...record, event: { ...event, feed_id: ['other_feed'] } }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchSoracleFeedHistory } = await importApiModule(toriiEnv);

    await expect(fetchSoracleFeedHistory(' price_xor_usd')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(fetchSoracleFeedHistory('price_xor_usd')).rejects.toThrow(
      'Soracles history response identity does not match the requested feed'
    );
  });

  it('sends the exact attestation query and fails closed without native provider binding', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(serializeAttestation(attestation), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchLatestDefiOracleAttestation } = await importApiModule(toriiEnv);

    await expect(fetchLatestDefiOracleAttestation({ domain: 1, subject_id: '42', status: 7 })).rejects.toThrow(
      'canonical Ed25519 provider controller'
    );
    const url = fetchSpy.mock.calls[0]?.[0] as URL;

    expect(url.pathname).toBe('/v1/soracles/defi/attestations/latest');
    expect(Object.fromEntries(url.searchParams)).toEqual({ domain: '1', subject_id: '42', status: '7' });
  });

  it('keeps maximum-u64 attestation identities exact in both query and response', async () => {
    const maxU64 = '18446744073709551615';
    const payload = compactJsonBytes(
      '{"domain":4,"policy_id":18446744073709551615,"observed_price":1,"oracle_slot":18446744073709551615,"status_flags":7,"attestation_hash":18446744073709551615}'
    );
    const raw = JSON.stringify({
      ...attestation,
      key: { domain: 4, subject_id: '__MAX_U64__' },
      oracle_slot: '__MAX_U64__',
      attestation_hash: '__MAX_U64__',
      oracle_payload: payload,
      oracle_signature: signOraclePayload(payload),
      source_events: [],
    }).replaceAll('"__MAX_U64__"', maxU64);
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchSpy as any;
    const { fetchLatestDefiOracleAttestation } = await importApiModule(toriiEnv);

    await expect(fetchLatestDefiOracleAttestation({ domain: 4, subject_id: maxU64, status: 7 })).rejects.toThrow(
      'canonical Ed25519 provider controller'
    );
    const url = fetchSpy.mock.calls[0]?.[0] as URL;

    expect(url.searchParams.get('subject_id')).toBe(maxU64);
  });

  it('rejects duplicate identity keys before schema binding', async () => {
    const raw = serializeAttestation(attestation).replace('"subject_id":42', '"subject_id":42,"subject_id":43');
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    const { fetchLatestDefiOracleAttestation } = await importApiModule(toriiEnv);

    await expect(fetchLatestDefiOracleAttestation({ domain: 1, subject_id: '42' })).rejects.toThrow(
      /duplicate object key/u
    );
  });

  it('rejects unsupported attestation queries before I/O and mismatched response identities', async () => {
    const mismatchedHash = deriveDefiOracleAttestationHash({
      domain: 1,
      subjectId: '42',
      oracleSlot: '10',
      statusFlags: 8,
      sourceEvents: [{ feedId: 'price_xor_usd', slot: '10', requestHash: hash, field: 'price' }],
    });
    const mismatchedPayload = compactJsonBytes(
      `{"domain":1,"market_id":42,"mark_price_bps":100,"index_price_bps":99,"confidence_bps":1,"oracle_slot":10,"status_flags":8,"attestation_hash":${mismatchedHash},"price":100}`
    );
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        serializeAttestation({
          ...attestation,
          status_flags: 8,
          attestation_hash: '__MISMATCHED_HASH__',
          oracle_payload: mismatchedPayload,
          oracle_signature: signOraclePayload(mismatchedPayload),
        }).replaceAll('"__MISMATCHED_HASH__"', mismatchedHash),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    global.fetch = fetchSpy as any;
    const { fetchLatestDefiOracleAttestation } = await importApiModule(toriiEnv);

    await expect(fetchLatestDefiOracleAttestation({ domain: 5, subject_id: '42' } as never)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(fetchLatestDefiOracleAttestation({ domain: 1, subject_id: '42', status: 7 })).rejects.toThrow(
      'canonical Ed25519 provider controller'
    );
  });
});

describe('VPN profile API helper', () => {
  it('reads and strictly parses the current public Torii VPN profile', async () => {
    const payload = {
      available: false,
      relay_endpoint: '',
      supported_exit_classes: ['standard', 'low-latency', 'high-security'],
      default_exit_class: 'standard',
      lease_secs: 3600,
      dns_push_interval_secs: 60,
      meter_family: 'soranet-v1',
      route_pushes: [],
      excluded_routes: [],
      dns_servers: [],
      tunnel_addresses: [],
      mtu_bytes: 1280,
      display_billing_label: 'standard · soranet-v1 · 1 XOR',
      operator_account_id: SAMPLE_I105,
      lease_fee: '1',
      settlement_grace_secs: 300,
      flow_label_bits: 24,
      padding_budget_ms: 250,
      relay_id_hex: '',
      relay_mldsa65_public_key_hex: '',
      descriptor_commit_hex: '',
      tls_server_name: '',
      relay_tls_spki_sha256_hex: '',
      relay_certificate_sha256_hex: '',
      directory_snapshot_digest_hex: '',
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    global.fetch = fetchSpy as any;

    const { fetchVpnProfile } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchVpnProfile();

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.toString()).toBe('https://torii.example/v1/vpn/profile');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.default_exit_class).toBe('standard');
      expect(result.data.lease_fee.toString()).toBe('1');
    }
  });

  it('rejects retired or partial VPN profile payloads instead of adapting them', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, relay_endpoint: 'relay.example:9443' }),
    }) as any;

    const { fetchVpnProfile } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    await expect(fetchVpnProfile()).rejects.toThrow();
  });
});

describe('Connect API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

  it('createConnectSession registers the exact NetworkId-bound preview without substituting identity fields', async () => {
    const { createConnectSession } = await importApiModule(toriiEnv);
    const [{ NetworkId }, { createConnectSessionPreview }] = await Promise.all([
      import('@iroha/iroha-js/browser'),
      import('@iroha/iroha-js/connect-browser'),
    ]);
    const preview = createConnectSessionPreview({
      networkId: NetworkId.parse(SAMPLE_NETWORK_ID),
      node: 'https://taira.sora.org',
      appKeyPair: {
        publicKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)),
        privateKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => 0x40 + index)),
      },
      nonce: Uint8Array.from(Array.from({ length: 16 }, (_, index) => 0xa0 + index)),
    });
    const tokenApp = 'a'.repeat(43);
    const tokenWallet = 'b'.repeat(43);
    const tokenManagement = 'c'.repeat(43);
    const tokenRelay = 'd'.repeat(43);
    const walletUri = new URL(preview.walletUri);
    walletUri.searchParams.set('token', tokenWallet);
    walletUri.searchParams.set('relay', tokenRelay);
    const appUri = new URL(preview.appUri);
    appUri.searchParams.set('token', tokenApp);
    appUri.searchParams.set('relay', tokenRelay);
    const responseBody = {
      sid: preview.sidBase64Url,
      network_id: SAMPLE_NETWORK_ID,
      app_pk: Buffer.from(preview.appKeyPair.publicKey).toString('base64url'),
      nonce: Buffer.from(preview.nonce).toString('base64url'),
      wallet_uri: walletUri.toString(),
      app_uri: appUri.toString(),
      token_app: tokenApp,
      token_wallet: tokenWallet,
      token_management: tokenManagement,
      token_relay: tokenRelay,
    };
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }));
    global.fetch = fetchSpy as any;

    const result = await createConnectSession(preview);

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).toString()).toBe('https://torii.example/v1/connect/session');
    expect(requestInit).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({
      sid: preview.sidBase64Url,
      network_id: SAMPLE_NETWORK_ID,
      app_pk: responseBody.app_pk,
      nonce: responseBody.nonce,
      node: 'https://taira.sora.org',
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.wallet_uri).toContain('role=wallet');
      expect(result.data.token_app).toBe(tokenApp);
      expect(result.data.token_relay).toBe(tokenRelay);
    }
  });

  it('never replays Connect session registration after a transport timeout', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 2,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 5,
    };
    const { createConnectSession } = await importApiModule(toriiEnv);
    const [{ NetworkId }, { createConnectSessionPreview }] = await Promise.all([
      import('@iroha/iroha-js/browser'),
      import('@iroha/iroha-js/connect-browser'),
    ]);
    const preview = createConnectSessionPreview({
      networkId: NetworkId.parse(SAMPLE_NETWORK_ID),
      node: 'https://taira.sora.org',
      appKeyPair: {
        publicKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)),
        privateKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => 0x40 + index)),
      },
      nonce: Uint8Array.from(Array.from({ length: 16 }, (_, index) => 0xa0 + index)),
    });
    const fetchSpy = vi.fn(pendingFetchUntilAbort);
    global.fetch = fetchSpy as any;

    const result = await createConnectSession(preview);

    expect(result.status).toBe(UNKNOWN_ERROR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SoraFS API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

  it('normalizes only canonical finalized keyset parameters', async () => {
    const { normalizeSorafsPinRegistryParams } = await importApiModule(toriiEnv);
    const digest = '19'.repeat(32);
    const blockHash = 'ab'.repeat(32);

    expect(
      normalizeSorafsPinRegistryParams({
        limit: 50,
        max_bytes: 64 * 1024,
        after_digest_hex: digest,
        expected_finalized_height: 42,
        expected_finalized_block_hash_hex: blockHash,
        status: 'approved',
      })
    ).toEqual({
      limit: 50,
      max_bytes: 64 * 1024,
      after_digest_hex: digest,
      expected_finalized_height: 42,
      expected_finalized_block_hash_hex: blockHash,
      status: 'approved',
    });
    expect(() => normalizeSorafsPinRegistryParams({ limit: 257 })).toThrow('between 1 and 256');
    expect(() => normalizeSorafsPinRegistryParams({ after_digest_hex: '0'.repeat(64) })).toThrow('non-zero');
    expect(() => normalizeSorafsPinRegistryParams({ expected_finalized_height: 42 })).toThrow('supplied together');
    expect(() =>
      normalizeSorafsPinRegistryParams({
        expected_finalized_height: 0,
        expected_finalized_block_hash_hex: blockHash,
      })
    ).toThrow('positive safe integer');
  });

  it('fetches native finalized pin pages with their exclusive digest cursor', async () => {
    const digestBytes = Array(32).fill(0x19);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        finalized_cursor: { height: 42, block_hash: Array(32).fill(0xab) },
        charged_usage: { manifest_count: 1, content_bytes: 4096 },
        manifests: [
          {
            digest: digestBytes,
            submitted_by: SAMPLE_I105,
            submitted_epoch: 3,
            approved_epoch: null,
            content_length: 4096,
            retention_epoch: 99,
            status: { status: 'Pending', value: null },
            successor_of: null,
          },
        ],
        has_more: true,
        next_after_digest: digestBytes,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchSorafsPinRegistry } = await importApiModule(toriiEnv);
    const result = await fetchSorafsPinRegistry({ limit: 10, status: 'pending' });

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe('/v1/sorafs/pin');
    expect(requestUrl.searchParams.get('limit')).toBe('10');
    expect(requestUrl.searchParams.get('status')).toBe('pending');
    expect(requestUrl.searchParams.has('offset')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.finalized_cursor.block_hash).toBe('ab'.repeat(32));
      expect(result.data.next_after_digest).toBe('19'.repeat(32));
    }
  });

  it.each([
    { responseHeight: 43, responseHashByte: 0xab },
    { responseHeight: 42, responseHashByte: 0xac },
  ])(
    'rejects a pin registry snapshot from a different finalized anchor: %#',
    async ({ responseHeight, responseHashByte }) => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          finalized_cursor: { height: responseHeight, block_hash: Array(32).fill(responseHashByte) },
          charged_usage: { manifest_count: 0, content_bytes: 0 },
          manifests: [],
          has_more: false,
          next_after_digest: null,
        }),
      }) as any;
      const { fetchSorafsPinRegistry } = await importApiModule(toriiEnv);

      await expect(
        fetchSorafsPinRegistry({
          expected_finalized_height: 42,
          expected_finalized_block_hash_hex: 'ab'.repeat(32),
        })
      ).rejects.toThrow('SoraFS pin registry snapshot response identity does not match the requested resource');
    }
  );

  it('fetches one exact pin manifest at a paired finalized anchor', async () => {
    const digest = '19'.repeat(32);
    const blockHash = 'ab'.repeat(32);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        finalized_cursor: { height: 42, block_hash: Array(32).fill(0xab) },
        manifest: {
          digest: Array(32).fill(0x19),
          root_cid: [1, 0x71, 0x1f, 32, ...Array(32).fill(0xcd)],
          chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
          chunk_digest_sha3_256: Array(32).fill(0x11),
          por_root: Array(32).fill(0x12),
          content_length: 4096,
          policy: { min_replicas: 3, storage_class: { type: 'Hot', value: null }, retention_epoch: 99 },
          submitted_by: SAMPLE_I105,
          submitted_epoch: 3,
          approved_epoch: null,
          alias: null,
          metadata: {},
          status: { status: 'Pending', value: null },
          council_envelope_digest: null,
        },
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchSorafsPinManifest, normalizeSorafsPinManifestRequest } = await importApiModule(toriiEnv);
    expect(() => normalizeSorafsPinManifestRequest('0'.repeat(64))).toThrow('non-zero');
    expect(() => normalizeSorafsPinManifestRequest(digest, { expected_finalized_height: 42 })).toThrow(
      'supplied together'
    );

    const result = await fetchSorafsPinManifest(digest, {
      expected_finalized_height: 42,
      expected_finalized_block_hash_hex: blockHash,
    });
    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe(`/v1/sorafs/pin/${digest}`);
    expect(requestUrl.searchParams.get('expected_finalized_height')).toBe('42');
    expect(requestUrl.searchParams.get('expected_finalized_block_hash_hex')).toBe(blockHash);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it.each([
    { responseHeight: 43, responseHashByte: 0xab },
    { responseHeight: 42, responseHashByte: 0xac },
  ])('rejects a pin manifest from a different finalized anchor: %#', async ({ responseHeight, responseHashByte }) => {
    const digest = '19'.repeat(32);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        finalized_cursor: { height: responseHeight, block_hash: Array(32).fill(responseHashByte) },
        manifest: {
          digest: Array(32).fill(0x19),
          root_cid: [1, 0x71, 0x1f, 32, ...Array(32).fill(0xcd)],
          chunker: {
            profile_id: 1,
            namespace: 'sorafs',
            name: 'sf1',
            semver: '1.0.0',
            multihash_code: 31,
          },
          chunk_digest_sha3_256: Array(32).fill(0x11),
          por_root: Array(32).fill(0x12),
          content_length: 4096,
          policy: { min_replicas: 3, storage_class: { type: 'Hot', value: null }, retention_epoch: 99 },
          submitted_by: SAMPLE_I105,
          submitted_epoch: 3,
          approved_epoch: null,
          alias: null,
          metadata: {},
          status: { status: 'Pending', value: null },
          council_envelope_digest: null,
        },
      }),
    }) as any;
    const { fetchSorafsPinManifest } = await importApiModule(toriiEnv);

    await expect(
      fetchSorafsPinManifest(digest, {
        expected_finalized_height: 42,
        expected_finalized_block_hash_hex: 'ab'.repeat(32),
      })
    ).rejects.toThrow('SoraFS pin manifest response identity does not match the requested resource');
  });

  it('rejects a valid SoraFS manifest response for a different digest', async () => {
    const requestedDigest = '19'.repeat(32);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        finalized_cursor: { height: 42, block_hash: Array(32).fill(0xab) },
        manifest: {
          digest: Array(32).fill(0x1a),
          root_cid: [1, 0x71, 0x1f, 32, ...Array(32).fill(0xcd)],
          chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
          chunk_digest_sha3_256: Array(32).fill(0x11),
          por_root: Array(32).fill(0x12),
          content_length: 4096,
          policy: { min_replicas: 3, storage_class: { type: 'Hot', value: null }, retention_epoch: 99 },
          submitted_by: SAMPLE_I105,
          submitted_epoch: 3,
          approved_epoch: null,
          alias: null,
          metadata: {},
          status: { status: 'Pending', value: null },
          council_envelope_digest: null,
        },
      }),
    }) as any;
    const { fetchSorafsPinManifest } = await importApiModule(toriiEnv);

    await expect(fetchSorafsPinManifest(requestedDigest)).rejects.toThrow(
      'SoraFS pin manifest response identity does not match the requested resource'
    );
  });
});

describe('current ZK registry API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const proofHash = 'ab'.repeat(32);
  const verifyingKeyRecord = {
    version: 1,
    circuit_id: 'transfer-v1',
    owner_manifest_id: null,
    namespace: 'core',
    backend: 'Halo2IpaPasta',
    curve: 'pallas',
    public_inputs_schema_hash: '11'.repeat(32),
    commitment: '22'.repeat(32),
    vk_len: 128,
    max_proof_bytes: 4096,
    gas_schedule_id: 'default',
    metadata_uri_cid: null,
    vk_bytes_cid: 'bafy-vk',
    activation_height: 10,
    withdraw_height: null,
    status: 'Active',
    key: { backend: 'halo2/ipa', bytes_b64: 'AQIDBA==' },
  } as const;

  it('fetchZkProofs sends every current list filter and parses bridge proof metadata strictly', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            backend: 'halo2/ipa',
            hash: proofHash,
            status: 'Verified',
            verified_at_height: 44,
            vk_ref: { backend: 'halo2/ipa', name: 'transfer-v1' },
            vk_commitment: 'cd'.repeat(32),
            bridge: {
              binding: { kind: 'verifier_manifest', hash: '01'.repeat(32) },
              commitment: '02'.repeat(32),
              size_bytes: 256,
              range: { start_height: 20, end_height: 30 },
              payload: {
                kind: 'transparent_zk',
                backend: 'halo2/ipa',
                proof_len_bytes: 128,
                recursion_depth: 2,
              },
            },
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;
    const { fetchZkProofs } = await importApiModule(toriiEnv);

    const result = await fetchZkProofs({
      backend: 'halo2/ipa',
      status: 'Verified',
      bridge_only: true,
      bridge_start_from_height: 20,
      bridge_end_until_height: 30,
      has_tag: 'PROF',
      verified_from_height: 40,
      verified_until_height: 50,
      limit: 25,
      offset: 50,
      order: 'desc',
    });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data[0]?.bridge?.payload.kind).toBe('transparent_zk');
    }
    const url = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe('/v1/zk/proofs');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      backend: 'halo2/ipa',
      status: 'Verified',
      bridge_only: 'true',
      bridge_start_from_height: '20',
      bridge_end_until_height: '30',
      has_tag: 'PROF',
      verified_from_height: '40',
      verified_until_height: '50',
      limit: '25',
      offset: '50',
      order: 'desc',
    });
  });

  it('fetchZkProofs supports ids-only snapshots and rejects non-canonical query windows before fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ backend: 'halo2/ipa', hash: proofHash }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchZkProofs } = await importApiModule(toriiEnv);

    const result = await fetchZkProofs({ ids_only: true, limit: 1, offset: 99_999 });
    expect(result).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: [{ backend: 'halo2/ipa', hash: proofHash }],
    });

    for (const params of [
      { limit: 0 },
      { limit: 201 },
      { limit: 2, offset: 99_999 },
      { verified_from_height: 5, verified_until_height: 4 },
      { bridge_start_from_height: 5, bridge_end_until_height: 4 },
      { has_tag: 'éé' },
      { status: 'verified' },
      { retired_page: 1 },
    ]) {
      await expect(fetchZkProofs(params as any)).rejects.toThrow();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fetchZkProofCount accepts only current proof filters and rejects list controls', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchZkProofCount } = await importApiModule(toriiEnv);

    const result = await fetchZkProofCount({ backend: 'halo2/ipa', status: 'Submitted', bridge_only: false });
    expect(result).toEqual({ status: SUCCESSFUL_FETCHING, data: { count: 7 } });
    const url = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(url.toString()).toBe(
      'https://torii.example/v1/zk/proofs/count?backend=halo2%2Fipa&status=Submitted&bridge_only=false'
    );

    for (const params of [{ limit: 1 }, { offset: 0 }, { order: 'asc' }, { ids_only: false }, { has_tag: 'AB C' }]) {
      await expect(fetchZkProofCount(params as any)).rejects.toThrow();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fetchZkProof canonicalizes an accepted 0x hash and rejects malformed lookup identities', async () => {
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            backend: 'halo2/ipa',
            proof_hash: proofHash,
            status: 'Submitted',
            vk_ref: null,
            vk_commitment: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    global.fetch = fetchSpy as any;
    const { fetchZkProof } = await importApiModule(toriiEnv);

    const result = await fetchZkProof('halo2/ipa', `0x${proofHash.toUpperCase()}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      `https://torii.example/v1/zk/proof/halo2%2Fipa/${proofHash}`
    );

    await expect(fetchZkProof('halo2/ipa', 'abcd')).rejects.toThrow();
    await expect(fetchZkProof('', proofHash)).rejects.toThrow();
    await expect(fetchZkProof('halo2/ipa', SAMPLE_TRANSACTION_HASH_ALT)).rejects.toThrow(
      'ZK proof response identity does not match the requested resource'
    );
    await expect(fetchZkProof('plonk/kzg', proofHash)).rejects.toThrow(
      'ZK proof response identity does not match the requested resource'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('fetchZkVerifyingKeys parses current rows and IDs while enforcing the app-query budget', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: { backend: 'halo2/ipa', name: 'transfer-v1' },
              record: verifyingKeyRecord,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ backend: 'halo2/ipa', name: 'transfer-v1' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    global.fetch = fetchSpy as any;
    const { fetchZkVerifyingKeys } = await importApiModule(toriiEnv);

    const rows = await fetchZkVerifyingKeys({
      backend: 'halo2/ipa',
      status: 'Active',
      name_contains: 'transfer',
      limit: 50,
      offset: 100,
      order: 'asc',
    });
    expect(rows.status).toBe(SUCCESSFUL_FETCHING);
    const url = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(Object.fromEntries(url.searchParams)).toEqual({
      backend: 'halo2/ipa',
      status: 'Active',
      name_contains: 'transfer',
      limit: '50',
      offset: '100',
      order: 'asc',
    });

    const ids = await fetchZkVerifyingKeys({ ids_only: true, limit: 1 });
    expect(ids).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: [{ backend: 'halo2/ipa', name: 'transfer-v1' }],
    });

    for (const params of [
      { limit: 0 },
      { limit: 501 },
      { limit: 2, offset: 499 },
      { status: 'active' },
      { order: 'sideways' },
      { backend: 'halo2/ipa/../vk' },
      { retired_page: 1 },
    ]) {
      await expect(fetchZkVerifyingKeys(params as any)).rejects.toThrow();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('fetchZkVerifyingKey encodes its portable id and requires the canonical Norito archive', async () => {
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: { backend: 'halo2/ipa', name: 'transfer-v1' },
            record: verifyingKeyRecord,
            record_norito_base64: 'Tk9SSVRP',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    global.fetch = fetchSpy as any;
    const { fetchZkVerifyingKey } = await importApiModule(toriiEnv);

    const result = await fetchZkVerifyingKey('halo2/ipa', 'transfer-v1');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      'https://torii.example/v1/zk/vk/halo2%2Fipa/transfer-v1'
    );

    await expect(fetchZkVerifyingKey('halo2/ipa', '.hidden')).rejects.toThrow();
    await expect(fetchZkVerifyingKey('halo2/ipa', 'VkTransfer')).rejects.toThrow();
    await expect(fetchZkVerifyingKey('halo2/ipa', 'transfer-v2')).rejects.toThrow(
      'ZK verifying key response identity does not match the requested resource'
    );
    await expect(fetchZkVerifyingKey('plonk/kzg', 'transfer-v1')).rejects.toThrow(
      'ZK verifying key response identity does not match the requested resource'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('canonical detail response identity binding', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const nftId = 'cat$gallery.main';
  const sampleAuthority = SAMPLE_I105;
  const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105}`;
  const SAMPLE_RWA_ID = `${'00'.repeat(31)}01$commodities.main`;
  const SAMPLE_PARENT_RWA_ID = `${'ff'.repeat(32)}$commodities.main`;
  const SAMPLE_TRANSACTION_HASH = 'ab'.repeat(32);

  it('fetchAccount rejects a valid detail response for a different account', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105_ALT,
        network_prefix: 753,
        metadata: {},
        owned_assets: 0,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    }) as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccount(SAMPLE_I105)).rejects.toThrow(
      'account response identity does not match the requested resource'
    );
  });

  it('fetchAsset rejects a valid detail response for a different asset', async () => {
    const alternateAssetId = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105_ALT}`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: alternateAssetId,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_I105_ALT,
        value: '123.5',
      }),
    }) as any;

    const { fetchAsset } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAsset(SAMPLE_ASSET_ID)).rejects.toThrow(
      'asset response identity does not match the requested resource'
    );
  });

  it('fetchAssetDefinition binds both canonical-id and alias selectors to the response identity', async () => {
    const detail = {
      id: SAMPLE_ASSET_DEFINITION_ID,
      owning_domain: null,
      owning_dataspace: null,
      alias: SAMPLE_ASSET_ALIAS,
      alias_binding: {
        alias: SAMPLE_ASSET_ALIAS,
        status: 'permanent',
        bound_at_ms: 1_700_000_000_000,
      },
      balance_scope_policy: 'Global',
      confidential_policy: {
        mode: 'TransparentOnly',
        vk_set_hash: null,
        poseidon_params_id: null,
        pedersen_params_id: null,
        pending_transition: null,
      },
      name: 'usd',
      description: null,
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: SAMPLE_I105,
      spec: { scale: 18 },
      total_quantity: '11',
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => detail });
    global.fetch = fetchSpy as any;
    const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAssetDefinition(SAMPLE_ASSET_DEFINITION_ID)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
    });
    await expect(fetchAssetDefinition(SAMPLE_ASSET_ALIAS)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
    });
    expect(fetchSpy.mock.calls.map((call) => (call[0] as URL).pathname)).toEqual([
      `/v1/assets/definitions/${encodeURIComponent(SAMPLE_ASSET_DEFINITION_ID)}`,
      `/v1/assets/definitions/${encodeURIComponent(SAMPLE_ASSET_ALIAS)}`,
    ]);
  });

  it('binds asset-definition econometrics and snapshot payloads to a canonical definition id', async () => {
    const snapshotDistribution = {
      gini: 0,
      hhi: 1,
      theil: 0,
      entropy: 0,
      entropy_normalized: 0,
      nakamoto_33: 1,
      nakamoto_51: 1,
      nakamoto_67: 1,
      top1: 1,
      top5: 1,
      top10: 1,
      median: null,
      p90: null,
      p99: null,
      lorenz: [
        { population: 0, share: 0 },
        { population: 1, share: 1 },
      ],
    };
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input as URL;
      return {
        ok: true,
        json: async () =>
          url.pathname.endsWith('/econometrics')
            ? {
                definition_id: SAMPLE_ASSET_DEFINITION_ID,
                computed_at_ms: 1_700_000_000_000,
                velocity_windows: [],
                issuance_windows: [],
                issuance_series: [],
              }
            : {
                definition_id: SAMPLE_ASSET_DEFINITION_ID,
                computed_at_ms: 1_700_000_000_000,
                holders_total: 0,
                total_supply: '0',
                top_holders: [],
                distribution: snapshotDistribution,
              },
      };
    });
    global.fetch = fetchSpy as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(api.fetchAssetDefinitionEconometrics(SAMPLE_ASSET_DEFINITION_ID)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
    });
    await expect(api.fetchAssetDefinitionSnapshot(SAMPLE_ASSET_DEFINITION_ID)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
    });
    expect(fetchSpy.mock.calls.map((call) => (call[0] as URL).pathname)).toEqual([
      `/v1/explorer/asset-definitions/${SAMPLE_ASSET_DEFINITION_ID}/econometrics`,
      `/v1/explorer/asset-definitions/${SAMPLE_ASSET_DEFINITION_ID}/snapshot`,
    ]);
  });

  it('rejects alias analytics selectors before issuing canonical-id-only requests', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(api.fetchAssetDefinitionEconometrics(SAMPLE_ASSET_ALIAS)).rejects.toThrow();
    await expect(api.fetchAssetDefinitionSnapshot(SAMPLE_ASSET_ALIAS)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchDomain rejects a valid detail response for a different canonical domain', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'archive.main',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        accounts: 1,
        assets: 2,
        nfts: 3,
      }),
    }) as any;
    const { fetchDomain } = await importApiModule(toriiEnv);

    await expect(fetchDomain('gallery.main')).rejects.toThrow(
      'domain response identity does not match the requested resource'
    );
  });

  it('fetchNFTById rejects a valid detail response for a different NFT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'rare-cat$gallery.main', owned_by: SAMPLE_I105, metadata: {} }),
    }) as any;
    const { fetchNFTById } = await importApiModule(toriiEnv);

    await expect(fetchNFTById(nftId)).rejects.toThrow('NFT response identity does not match the requested resource');
  });

  it('fetchRwaById rejects a valid detail response for a different RWA', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_PARENT_RWA_ID,
        owned_by: SAMPLE_I105,
        quantity: '2',
        held_quantity: '0',
        primary_reference: 'vault-cert-alt',
        status: null,
        is_frozen: false,
        metadata: {},
        parents: [],
      }),
    }) as any;
    const { fetchRwaById } = await importApiModule(toriiEnv);

    await expect(fetchRwaById(SAMPLE_RWA_ID)).rejects.toThrow(
      'RWA response identity does not match the requested resource'
    );
  });

  it('fetchTransaction rejects a valid detail response for a different transaction hash', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authority: sampleAuthority,
        hash: SAMPLE_TRANSACTION_HASH_ALT,
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
      }),
    }) as any;
    const { fetchTransaction } = await importApiModule(toriiEnv);

    await expect(fetchTransaction(SAMPLE_TRANSACTION_HASH)).rejects.toThrow(
      'transaction response identity does not match the requested resource'
    );
  });
});
