import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import type * as ApiIndexModule from './index';
import { appendSearchParams } from '@/shared/api/query';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { AccountAddress } from '@iroha/iroha-js/browser';
import { publicKeyFromPrivate, signEd25519 } from '@iroha/iroha-js/crypto';
import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const SAMPLE_I105_MODERN = 'sorauﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76';
const SAMPLE_I105_TEST_MODERN = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ACCOUNT_ALIAS = 'treasury@banking.retail';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_DEFINITION_ID_ALT = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105}`;
const SAMPLE_RWA_ID = `${'00'.repeat(31)}01$commodities.main`;
const SAMPLE_PARENT_RWA_ID = `${'ff'.repeat(32)}$commodities.main`;
const SAMPLE_FRAMED_INSTRUCTION_SHA256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const SAMPLE_NETWORK_ID = 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0';
const SAMPLE_TRANSACTION_HASH = 'ab'.repeat(32);
const SAMPLE_TRANSACTION_HASH_ALT = 'cd'.repeat(32);
const SAMPLE_ORACLE_PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SAMPLE_ORACLE_SIGNER_PUBLIC_KEY = Array.from(publicKeyFromPrivate(SAMPLE_ORACLE_PRIVATE_KEY));
const SAMPLE_ORACLE_PROVIDER = AccountAddress.fromAccount({
  publicKey: SAMPLE_ORACLE_SIGNER_PUBLIC_KEY,
  algorithm: 'ed25519',
}).toI105();
const compactJsonBytes = (source: string): number[] => Array.from(new TextEncoder().encode(source));
const signOraclePayload = (payload: readonly number[]): number[] =>
  Array.from(signEd25519(Uint8Array.from(payload), SAMPLE_ORACLE_PRIVATE_KEY));
const TORII_API_VERSION_HEADER = 'x-iroha-api-version';
const HISTORY_PAGINATION = {
  limit: 10,
  snapshot_height: 42,
  snapshot_hash: 'ab'.repeat(32),
  next_cursor: null,
  has_more: false,
} as const;

const eventSourceStore = vi.hoisted(() => ({
  instances: [] as Array<{ source: unknown; data: Ref<string | null>; status: Ref<string>; open: ReturnType<typeof vi.fn> }>,
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

const payloads = vi.hoisted(() => ({
  sumeragiStatus: {
    leader_index: 2,
    view_change_index: 7,
    highest_qc: { height: 10, view: 4, subject_block_hash: '0xaaa' },
    locked_qc: { height: 9, view: 3, subject_block_hash: null },
    tx_queue: { depth: 3, capacity: 10, saturated: false },
    epoch: { length_blocks: 0, commit_deadline_offset: 0, reveal_deadline_offset: 0 },
    membership: { height: 10, view: 3, epoch: 0, view_hash: '0xbb' },
    prf: { height: 10, view: 3, epoch_seed: 'feed' },
    gossip_fallback_total: 1,
    bg_post_inline_post_total: 5,
    bg_post_inline_broadcast_total: 6,
    block_created_dropped_by_lock_total: 0,
    block_created_hint_mismatch_total: 0,
    block_created_proposal_mismatch_total: 0,
    settlement: {
      dvp: {
        success_total: 1,
        failure_total: 0,
        final_state_totals: { both: 1 },
        failure_reasons: {},
        last_event: {
          observed_at_ms: 171000,
          settlement_id: 'dvp-1',
          plan: { order: 'process_delivery_first', atomicity: 'commit_first_leg' },
          outcome: 'Success',
          failure_reason: null,
          final_state: 'delivery_and_payment',
          legs: { delivery_committed: true, payment_committed: false },
        },
      },
      pvp: {
        success_total: 2,
        failure_total: 1,
        final_state_totals: { both: 2 },
        failure_reasons: { timeout: 1 },
        last_event: {
          observed_at_ms: 181000,
          settlement_id: 'pvp-1',
          plan: { order: 'process_payment_first', atomicity: 'commit_second_leg' },
          outcome: 'Failure',
          failure_reason: 'timeout',
          final_state: 'primary_only',
          legs: { primary_committed: true, counter_committed: false },
          fx_window_ms: 1200,
        },
      },
    },
    pacemaker_backpressure_deferrals_total: 0,
    rbc_retry_attempts_total: 0,
    rbc_retry_abort_total: 0,
    rbc_store: {
      sessions: 2,
      bytes: 1024,
      pressure_level: 1,
      backpressure_deferrals_total: 1,
      evictions_total: 1,
      recent_evictions: [{ block_hash: '0xabc', height: 9, view: 3 }],
    },
    da_reschedule_total: 0,
    view_change_proof_accepted_total: 0,
    view_change_proof_stale_total: 0,
    view_change_proof_rejected_total: 0,
    view_change_suggest_total: 0,
    view_change_install_total: 0,
    collectors_targeted_current: 4,
    collectors_targeted_last_per_block: 6,
    redundant_sends_total: 1,
    vrf_penalty_epoch: 1,
    vrf_committed_no_reveal_total: 1,
    vrf_no_participation_total: 0,
    vrf_late_reveals_total: 0,
    consensus_penalties_applied_total: 1,
    consensus_penalties_pending: 2,
    vrf_penalties_applied_total: 3,
    vrf_penalties_pending: 4,
    lane_governance_sealed_total: 1,
    lane_governance_sealed_aliases: ['sealed-lane'],
    lane_governance: [
      {
        lane_id: 0,
        alias: 'default',
        governance: 'manual',
        manifest_required: true,
        manifest_ready: false,
        manifest_path: '/tmp/manifest',
        validator_ids: ['val-1'],
        quorum: 4,
        protected_namespaces: ['ns1'],
        runtime_upgrade: {
          allow: true,
          require_metadata: false,
          metadata_key: null,
          allowed_ids: [],
        },
        privacy_commitments: [
          {
            id: 1,
            scheme: 'merkle',
            merkle: { root: '0x1234', max_depth: 4 },
            snark: null,
          },
        ],
      },
    ],
    nexus_fee: {
      charged_total: 3,
      charged_via_payer_total: 2,
      charged_via_sponsor_total: 1,
      sponsor_disabled_total: 0,
      sponsor_cap_exceeded_total: 0,
      config_errors_total: 0,
      transfer_failures_total: 1,
      last_amount: '10.5',
      last_asset_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa#sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
      last_payer: 'payer',
      last_payer_id: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
      last_error: null,
    },
    nexus_staking: {
      lanes: [
        {
          lane_id: 0,
          bonded: '10',
          pending_unbond: '2',
          slash_total: 1,
        },
      ],
    },
    npos_election: {
      epoch: 9,
      snapshot_height: 10,
      seed: 'deadbeef',
      candidates_total: 5,
      validator_set_hash: '0xhash',
      validator_set: ['ed0120...'],
      params: {
        max_validators: 7,
        min_self_bond: 1,
        min_nomination_bond: 1,
        max_nominator_concentration_pct: 30,
        seat_band_pct: 5,
        max_entity_correlation_pct: 10,
        finality_margin_blocks: 8,
      },
      rejection_reason: null,
      tie_break: [{ peer_id: 'ed0120...', score: '00ff' }],
    },
  },
  sumeragiTelemetry: {
    availability: {
      total_votes_ingested: 12,
      collectors: [
        { collector_idx: 0, peer_id: 'ed0120...', votes_ingested: 5 },
        { collector_idx: 1, peer_id: 'ed0999...', votes_ingested: 7 },
      ],
    },
    qc_latency_ms: [
      { kind: 'availability', last_ms: 120 },
      { kind: 'commit', last_ms: 95 },
    ],
    rbc_backlog: { pending_sessions: 1, total_missing_chunks: 3, max_missing_chunks: 2 },
    vrf: {
      found: true,
      epoch: 42,
      finalized: true,
      seed_hex: 'cafebabe',
      epoch_length: 3600,
      commit_deadline_offset: 120,
      reveal_deadline_offset: 160,
      roster_len: 7,
      updated_at_height: 999,
      participants_total: 7,
      commitments_total: 7,
      reveals_total: 7,
      late_reveals_total: 0,
      committed_no_reveal: [],
      no_participation: [],
      late_reveals: [],
    },
  },
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

describe('SDK response test adapter', () => {
  it('exposes successful JSON as a same-realm byte stream without changing the payload', async () => {
    const source = new Response(JSON.stringify({ value: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const response = (await normalizeSdkMockResponse(source)) as unknown as SdkReadableResponse;
    const first = await response.body.getReader().read();

    expect(first.done).toBe(false);
    expect(first.value).toBeInstanceOf(Uint8Array);
    expect(await response.json()).toEqual({ value: 'ok' });
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  it('adapts minimal successful response doubles used by collection tests', async () => {
    const source = {
      ok: true,
      json: async () => ({ items: [] }),
    } as Response;

    const response = (await normalizeSdkMockResponse(source)) as unknown as SdkReadableResponse;
    const reader = response.body.getReader();

    expect((await reader.read()).value).toBeInstanceOf(Uint8Array);
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(await response.json()).toEqual({ items: [] });
  });

  it('leaves non-success responses intact for the SDK HTTP-error path', async () => {
    const source = new Response('unavailable', { status: 503 });
    await expect(normalizeSdkMockResponse(source)).resolves.toBe(source);
  });
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
  it('buildToriiUrl preserves an explicitly canonical /v1 Torii pathname', async () => {
    const { buildToriiUrl } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    expect(buildToriiUrl('/v1/telemetry/live')).toBe('https://torii.example/v1/telemetry/live');
    expect(buildToriiUrl('/v1/gov/capabilities')).toBe('https://torii.example/v1/gov/capabilities');
    expect(buildToriiUrl('/v1/soracloud/status')).toBe('https://torii.example/v1/soracloud/status');
    expect(buildToriiUrl('/v1/nexus/public_lanes/0/validators')).toBe(
      'https://torii.example/v1/nexus/public_lanes/0/validators'
    );
  });

  it.each([
    'telemetry/live',
    '/telemetry/live',
    '/v2/explorer/accounts',
    '/v3/telemetry/live',
    '/V1/telemetry/live',
    '/v1/',
    '/v1/telemetry/live/',
    '/v1//telemetry/live',
    '/v1/telemetry/../live',
    '/v1/telemetry/live?limit=10',
    '/v1/telemetry/live#latest',
    '/v1/telemetry\\live',
    '/v1/telemetry/live now',
  ])('rejects a non-canonical Torii API pathname instead of rewriting it: %s', async (path) => {
    const { buildToriiUrl, normalizeToriiBaseUrl, resolveApiUrl } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    expect(() => buildToriiUrl(path)).toThrow('Torii API path must be an exact canonical /v1 pathname');
    expect(() => resolveApiUrl(path)).toThrow('Torii API path must be an exact canonical /v1 pathname');
    expect(normalizeToriiBaseUrl('https://retired.example/v2/explorer')).toBeNull();
    expect(normalizeToriiBaseUrl('https://noncanonical.example/V1/explorer')).toBeNull();
  });

  it.each([
    'abc',
    '/v1/explorer',
    'ftp://torii.example',
    'https://user:secret@torii.example',
    'https://torii.example/v1',
    'https://torii.example/v1/explorer',
    'https://torii.example/custom',
    'https://torii.example?network=other',
    'https://torii.example/#fragment',
  ])('rejects an inexact Torii base URL: %s', async (invalidUrl) => {
    const { normalizeToriiBaseUrl } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    expect(normalizeToriiBaseUrl(invalidUrl)).toBeNull();
  });

  it.each(['relative/torii', 'https://torii.example/v1/explorer'])(
    'fails module initialization for invalid explicit build-time Torii origin %s',
    async (invalidUrl) => {
      await expect(importApiModule({ VITE_API_URL: invalidUrl })).rejects.toThrow(
        'VITE_API_URL must be an absolute credential-free HTTP(S) Torii origin'
      );
    }
  );

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

  it('does not expose retired address-format preference state', async () => {
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    expect(module).not.toHaveProperty('getToriiAddressFormatPreference');
    expect(module).not.toHaveProperty('useToriiAddressFormatPreference');
  });

  it('setToriiBaseUrl overrides Torii and explorer bases', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://alt-node.example:8080');
    expect(module.buildToriiUrl('/v1/telemetry/live')).toBe('https://alt-node.example:8080/v1/telemetry/live');
    expect(module.resolveApiUrl('/v1/explorer/accounts')).toBe('https://alt-node.example:8080/v1/explorer/accounts');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://alt-node.example:8080');
    }
    module.resetToriiBaseUrl();
  });

  it('setToriiBaseUrl can skip persistence', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://persisted-node.example:8080');

    module.setToriiBaseUrl('https://volatile-node.example:8080', { persist: false });

    expect(module.getToriiBaseUrl()).toBe('https://volatile-node.example:8080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://persisted-node.example:8080');
    }
  });

  it.each([
    'abc',
    'ftp://torii.example',
    'https://user:secret@torii.example',
    'https://torii.example/v1/explorer',
    'https://torii.example?network=other',
    'https://torii.example/#fragment',
  ])('rejects invalid interactive Torii URL %s without changing active or stored state', async (invalidUrl) => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://saved.example:8080');

    expect(() => module.setToriiBaseUrl(invalidUrl)).toThrow('Torii base URL must be an absolute');
    expect(module.getToriiBaseUrl()).toBe('https://saved.example:8080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://saved.example:8080');
    }
  });

  it('clears an invalid stored node instead of resolving it against the configured origin', async () => {
    const storage = window.localStorage as any;
    storage.setItem('torii_base_url', 'relative-node');

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    expect(module.getToriiBaseUrl()).toBe('https://torii.example');
    expect(storage.getItem('torii_base_url')).toBeNull();
  });

  it('setToriiBaseUrlFromConfig preserves stored user node selections by default', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://stored-node.example:8080');

    module.setToriiBaseUrlFromConfig('https://configured-node.example:18080');

    expect(module.getToriiBaseUrl()).toBe('https://stored-node.example:8080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://stored-node.example:8080');
    }
  });

  it('setToriiBaseUrlFromConfig can force-clear stale stored node selections', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://stored-node.example:8080');

    module.setToriiBaseUrlFromConfig('https://configured-node.example:18080', { force: true });

    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:18080');
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBeNull();
    }
  });

  it('keeps a forced runtime Torii origin immutable across global, reset, scope, and failover paths', async () => {
    runtimeConfigState.value = {
      toriiForceBaseUrl: true,
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://other-network.example'],
    };
    const module = await importApiModule({ VITE_API_URL: 'https://bootstrap.example' });
    module.setToriiBaseUrlFromConfig('https://taira.sora.org', { force: true });

    expect(module.isToriiBaseUrlForced()).toBe(true);
    expect(() => module.setToriiBaseUrl('https://other-network.example')).toThrow(
      'Torii base URL is locked by runtime configuration'
    );
    expect(() => module.resetToriiBaseUrl()).toThrow('Torii base URL is locked by runtime configuration');
    expect(module.setRouteScopedToriiBaseUrl('https://other-network.example')).toBeNull();
    expect(await module.retryToriiFailover()).toBe(false);
    expect(module.getToriiBaseUrl()).toBe('https://taira.sora.org');
  });

  it('route-scoped override changes effective base without mutating configured node persistence', async () => {
    const storage = window.localStorage as any;
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://configured-node.example:8080');
    expect(module.getConfiguredToriiBaseUrl()).toBe('https://configured-node.example:8080');
    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:8080');

    const scoped = module.setRouteScopedToriiBaseUrl('https://public-node.example:18080');
    expect(scoped).toBe('https://public-node.example:18080');
    expect(module.getConfiguredToriiBaseUrl()).toBe('https://configured-node.example:8080');
    expect(module.getToriiBaseUrl()).toBe('https://public-node.example:18080');
    expect(module.resolveApiUrl('/v1/explorer/accounts')).toBe(
      'https://public-node.example:18080/v1/explorer/accounts'
    );
    if (storage && typeof storage.getItem === 'function') {
      expect(storage.getItem('torii_base_url')).toBe('https://configured-node.example:8080');
    }

    module.setRouteScopedToriiBaseUrl(null);
    expect(module.getToriiBaseUrl()).toBe('https://configured-node.example:8080');
  });

  it('fetch helpers resolve requests against scoped node while torii scope override is active', async () => {
    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://configured-node.example:8080');
    module.setRouteScopedToriiBaseUrl('https://public-node.example:18080');

    const fetchSpy = vi.fn(
      async (input: unknown) =>
        new Response(
          JSON.stringify({
            pagination: { limit: 1, next_cursor: null, has_more: false },
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
        return new Response('not found', { status: 404 });
      }
      attempts += 1;
      if (attempts === 1) return new Response('bad gateway', { status: 502 });
      return new Response(
        JSON.stringify({
          pagination: { limit: 1, next_cursor: null, has_more: false },
          items: [
            {
              id: SAMPLE_I105,
              network_prefix: 0,
              metadata: {},
              owned_assets: 0,
              owned_nfts: 0,
              owned_domains: 0,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const availability = module.useToriiAvailability();
    const result = await module.fetchAccounts({ limit: 1 });

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
        return new Response('not found', { status: 404 });
      }
      attempts += 1;
      if (attempts === 1) throw new Error('simulated network error');
      return new Response(
        JSON.stringify({
          pagination: { limit: 1, next_cursor: null, has_more: false },
          items: [
            {
              id: SAMPLE_I105,
              network_prefix: 0,
              metadata: {},
              owned_assets: 0,
              owned_nfts: 0,
              owned_domains: 0,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    module.setToriiBaseUrl('https://torii.example', { persist: false });
    const result = await module.fetchAccounts({ limit: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('propagates caller aborts through the timeout layer without retrying or degrading node health', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 2,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 2000,
    };
    const fetchSpy = vi.fn(pendingFetchUntilAbort);
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const availability = module.useToriiAvailability();
    const controller = new AbortController();
    const request = module.fetchAccountQr(SAMPLE_I105, controller.signal);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(availability.state.value).toBe('healthy');
    expect(availability.failureCount.value).toBe(0);
  });

  it('refuses a pre-aborted QR request before any fetch attempt', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 2,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 2000,
    };
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const controller = new AbortController();
    controller.abort();

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(module.fetchAccountQr(SAMPLE_I105, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('interrupts a transient-response retry delay when the caller aborts', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 2,
      toriiRequestRetryBaseDelayMs: 2000,
      toriiRequestTimeoutMs: 5000,
    };
    const fetchSpy = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }));
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const controller = new AbortController();
    const request = module.fetchAccountQr(SAMPLE_I105, controller.signal);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('still retries genuine request timeouts under the configured transport policy', async () => {
    runtimeConfigState.value = {
      toriiRequestRetryCount: 1,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 5,
    };
    const fetchSpy = vi.fn(pendingFetchUntilAbort);
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(module.fetchAccountQr(SAMPLE_I105)).rejects.toThrow('Request timed out after 5ms');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    { toriiFailoverEnabled: false },
    { toriiForceBaseUrl: true, toriiFailoverEnabled: true },
  ])('tracks outages and recovery while node switching is disabled: %j', async (config) => {
    runtimeConfigState.value = {
      ...config,
      toriiFailoverNodes: ['https://backup.example'],
      toriiFailoverFailureThreshold: 1,
      toriiRequestRetryCount: 0,
    };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pagination: { ...HISTORY_PAGINATION, limit: 1 },
        items: [],
      }), { headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const availability = module.useToriiAvailability();

    await module.fetchTransactions({ limit: 1 });

    expect(availability.state.value).toBe('outage');
    expect(availability.failureCount.value).toBe(1);
    expect(availability.lastError.value).toBe('HTTP 502');
    expect(module.getToriiBaseUrl()).toBe('https://torii.example');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect((await module.fetchTransactions({ limit: 1 })).status).toBe(SUCCESSFUL_FETCHING);
    expect(availability.state.value).toBe('healthy');
    expect(availability.failureCount.value).toBe(0);
    expect(availability.lastError.value).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('auto-failovers to a healthy runtime candidate after repeated transient failures', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://backup.example'],
      toriiFailoverFailureThreshold: 5,
      toriiFailoverWindowMs: 60_000,
      toriiFailoverProbeTimeoutMs: 1_500,
      toriiFailoverPersistSwitch: true,
    };

    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url.startsWith('https://torii.example/v1/explorer/transactions')) {
        return new Response('bad gateway', { status: 502 });
      }
      if (url === 'https://backup.example/v1/explorer/health') {
        return new Response(
          JSON.stringify({
            head_height: 12,
            head_created_at: '2026-08-30T00:00:00Z',
            sampled_at: '2026-08-30T00:00:01Z',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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
    };

    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://lagging.example/v1/explorer/health') {
        return new Response(
          JSON.stringify({
            head_height: 10,
            head_created_at: '2026-03-05T00:00:00Z',
            sampled_at: '2026-03-05T00:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url === 'https://fresh.example/v1/explorer/health') {
        return new Response(
          JSON.stringify({
            head_height: 120,
            head_created_at: '2026-03-05T06:00:00Z',
            sampled_at: '2026-03-05T06:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const switched = await module.retryToriiFailover();
    const healthCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === 'https://fresh.example/v1/explorer/health'
    );

    expect(switched).toBe(true);
    expect(module.getToriiBaseUrl()).toBe('https://fresh.example');
    expect(healthCall?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
      },
    });
    expect((healthCall?.[1]?.headers as Record<string, string>)[TORII_API_VERSION_HEADER]).toBeUndefined();
  });

  it('uses only exact configured failover URLs and never probes the operator peer status route', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['backup.example', 'https://configured.example'],
      toriiFailoverProbeTimeoutMs: 500,
    };
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://configured.example/v1/explorer/health') {
        return new Response(
          JSON.stringify({
            head_height: 1,
            head_created_at: null,
            sampled_at: '2026-08-30T00:00:00Z',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    expect(await module.retryToriiFailover()).toBe(true);

    const urls = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(urls).toEqual(['https://configured.example/v1/explorer/health']);
    expect(urls).not.toContain('https://torii.example/status/peers');
  });

  it('rejects malformed and non-JSON 2xx health probes', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://malformed.example', 'https://html.example'],
      toriiFailoverProbeTimeoutMs: 500,
    };
    global.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://malformed.example')) {
        return new Response(JSON.stringify({ head_height: 4 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('<html>healthy</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    expect(await module.retryToriiFailover()).toBe(false);
    expect(module.getToriiBaseUrl()).toBe('https://torii.example');
  });

  it('does not invent failover candidates when none are configured', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: [],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
    };

    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const switched = await module.retryToriiFailover();
    const callUrls = fetchSpy.mock.calls.map(([input]) => (input instanceof URL ? input.toString() : String(input)));

    expect(switched).toBe(false);
    expect(callUrls).toEqual([]);
  });

  it('reports outage when manual failover cannot find a healthy node', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: ['https://unhealthy.example'],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
    };

    global.fetch = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://unhealthy.example/v1/explorer/health') {
        return new Response('bad gateway', { status: 502 });
      }
      return new Response('not found', { status: 404 });
    }) as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const availability = module.useToriiAvailability();
    const switched = await module.retryToriiFailover();

    expect(switched).toBe(false);
    expect(availability.state.value).toBe('outage');
    expect(availability.lastError.value).toContain('No healthy failover target');
  });

  it('streamTelemetryMetrics uses the v1 telemetry SSE path', async () => {
    const { streamTelemetryMetrics } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const stream = streamTelemetryMetrics();

    expect(stream.status.value).toBe('CONNECTING');
    const source = eventSourceStore.instances[0]?.source as { value?: string } | undefined;
    expect(source?.value).toBe('https://torii.example/v1/telemetry/live');
    stream.reconnect();
    expect(eventSourceStore.instances[0]?.open).toHaveBeenCalledOnce();
  });
});

describe('Explorer accounts API helpers', () => {
  it('fetchAccounts keeps filtered requests on /v1/explorer/accounts', async () => {
    const validAccountId = SAMPLE_I105;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 10, next_cursor: null, has_more: false },
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccounts({ limit: 10, domain: 'wonderland.universal' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const firstOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/accounts');
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.get('domain')).toBe('wonderland.universal');
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 10, next_cursor: null, has_more: false },
        items: [],
      }),
    });
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 10, next_cursor: null, has_more: false },
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccounts({ limit: 10 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(validAccountId);
      expect(result.data.items[0]).not.toHaveProperty('i105_address');
    }
  });

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

  it('adapts every world-backed collection to cursor and limit without retired page parameters', async () => {
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input as URL;
      return {
        ok: true,
        json: async () => ({
          pagination: {
            limit: Number(url.searchParams.get('limit')),
            next_cursor: null,
            has_more: false,
          },
          items: [],
        }),
      };
    });
    global.fetch = fetchSpy as any;

    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    await api.fetchAccounts({ limit: 10, domain: 'wonderland.universal' });
    await api.fetchDomains({ limit: 10, owned_by: SAMPLE_I105 });
    await api.fetchAssets({ limit: 10 });
    await api.fetchNFTs({ limit: 10, domain: 'wonderland.universal', owned_by: SAMPLE_I105 });
    await api.fetchRwas({ limit: 10, domain: 'wonderland.universal', owned_by: SAMPLE_I105 });
    await api.fetchAssetDefinitions({ limit: 10, owning_domain: 'wonderland.universal' });

    const urls = fetchSpy.mock.calls.map(([input]) => input as URL);
    expect(urls.map((url) => url.pathname)).toEqual([
      '/v1/explorer/accounts',
      '/v1/explorer/domains',
      '/v1/explorer/assets',
      '/v1/explorer/nfts',
      '/v1/explorer/rwas',
      '/v1/explorer/asset-definitions',
    ]);
    for (const url of urls) {
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.has('per_page')).toBe(false);
    }
    expect(urls[5]?.searchParams.get('owning_domain')).toBe('wonderland.universal');
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pagination: { limit: 2, next_cursor: 'cursor-1', has_more: true },
          items: [account(SAMPLE_I105), account(SAMPLE_I105_ALT)],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pagination: { limit: 2, next_cursor: null, has_more: false },
          items: [account(SAMPLE_I105_ALT), account(SAMPLE_I105)],
        }),
      });
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const first = await fetchAccounts({ limit: 2 });
    expect(first.status).toBe(SUCCESSFUL_FETCHING);
    if (first.status !== SUCCESSFUL_FETCHING) throw new Error('expected first cursor page');
    const second = await fetchAccounts({ cursor: first.data.pagination.next_cursor, limit: 2 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    const secondUrl = fetchSpy.mock.calls[1]?.[0] as URL;
    expect(firstUrl.searchParams.get('limit')).toBe('2');
    expect(firstUrl.searchParams.has('cursor')).toBe(false);
    expect(secondUrl.searchParams.get('limit')).toBe('2');
    expect(secondUrl.searchParams.get('cursor')).toBe('cursor-1');
    expect(first.data.pagination).toEqual({ limit: 2, next_cursor: 'cursor-1', has_more: true });
    expect(Object.keys(first.data.pagination)).not.toContain('total_items');
    expect(second.status).toBe(SUCCESSFUL_FETCHING);
    if (second.status === SUCCESSFUL_FETCHING) {
      expect(second.data.pagination).toEqual({ limit: 2, next_cursor: null, has_more: false });
      expect(second.data.items.map((item) => item.id)).toEqual([SAMPLE_I105_ALT, SAMPLE_I105]);
    }
  });

  it('rejects a cursor response that repeats the request cursor', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 2, next_cursor: 'cursor-1', has_more: true },
        items: [],
      }),
    }) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccounts({ cursor: 'cursor-1', limit: 2 })).rejects.toThrow('cursor did not advance');
  });

  it.each([
    { next_cursor: null, has_more: true },
    { next_cursor: 'cursor-1', has_more: false },
  ])('rejects inconsistent continuation metadata: %o', async (pagination) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pagination: { limit: 2, ...pagination }, items: [] }),
    }) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAccounts({ limit: 2 })).rejects.toThrow('has_more must match next_cursor availability');
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 2, cursor: 'not=padded' }])(
    'rejects invalid cursor pagination before issuing a request: %o',
    async (params) => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;
      const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

      await expect(fetchAccounts(params)).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('returns an upstream cursor-page error without fabricating an empty page', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('cursor backend unavailable', { status: 503 })) as any;
    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    const result = await fetchAccounts({ limit: 2 });

    expect(result.status).toBe(UNKNOWN_ERROR);
    if (result.status === UNKNOWN_ERROR) expect(result.error.message).toBe('cursor backend unavailable');
    expect(result).not.toHaveProperty('data');
  });

  it('fetchAccount URL-encodes the exact canonical i105 ID', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105,
        network_prefix: 753,
        metadata: {},
        owned_assets: 0,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
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
      expect(result.data).not.toHaveProperty('i105_address');
    }
  });

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

  it('fetchAccount preserves incoming i105 route params without rewriting the prefix', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105_TEST_MODERN,
        network_prefix: 369,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAccount(SAMPLE_I105_TEST_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_TEST_MODERN)}`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_TEST_MODERN);
      expect(result.data).not.toHaveProperty('i105_address');
    }
  });

  it('fetchAccount also preserves sora-prefixed ids on Taira Torii bases', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105_MODERN,
        network_prefix: 753,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org' });
    const result = await fetchAccount(SAMPLE_I105_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_MODERN);
      expect(result.data).not.toHaveProperty('i105_address');
    }
  });

  it('preserves testnet account filters before calling explorer list endpoints', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 10, next_cursor: null, has_more: false },
        items: [
          {
            id: `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105_TEST_MODERN}`,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_TEST_MODERN,
            value: '25000',
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAssets({ limit: 10, owned_by: SAMPLE_I105_TEST_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets');
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.get('owned_by')).toBe(SAMPLE_I105_TEST_MODERN);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('25000');
    }
  });

  it('also preserves sora-prefixed account filters for Taira Torii bases', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 10, next_cursor: null, has_more: false },
        items: [
          {
            id: `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105_MODERN}`,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_MODERN,
            value: '25000',
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org' });
    const result = await fetchAssets({ limit: 10, owned_by: SAMPLE_I105_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets');
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.get('owned_by')).toBe(SAMPLE_I105_MODERN);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('25000');
    }
  });

  it('keeps definition filters on the cursor-native Explorer assets route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 5, next_cursor: null, has_more: false },
        items: [
          {
            id: SAMPLE_ASSET_ID,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105,
            value: '77',
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAssets({ limit: 5, definition: SAMPLE_ASSET_DEFINITION_ID });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.get('definition')).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.pagination).toEqual({ limit: 5, next_cursor: null, has_more: false });
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.id).toBe(SAMPLE_ASSET_ID);
      expect(result.data.items[0]?.value.toString()).toBe('77');
    }
  });

  it('forwards a canonical scoped asset_id and parses the current Explorer asset DTO', async () => {
    const scopedAssetId = `${SAMPLE_ASSET_ID}#dataspace:7`;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 1, next_cursor: null, has_more: false },
        items: [
          {
            id: scopedAssetId,
            definition_id: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105,
            value: '91',
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAssets({ limit: 1, asset_id: scopedAssetId });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/assets');
    expect(firstCall.searchParams.get('asset_id')).toBe(scopedAssetId);
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

    const requests = [
      () => api.fetchAccount('not an account'),
      () => api.fetchDomains({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchAssets({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchAssetDefinitions({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchNFTs({ limit: 1, owned_by: 'not an account' }),
      () => api.fetchRwas({ limit: 1, owned_by: 'not an account' }),
    ];
    for (const request of requests) {
      await expect(request()).rejects.toThrow(/Account ID/u);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchAsset consumes the authoritative minimal Explorer asset detail', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_ASSET_ID,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_I105,
        value: '123.5',
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAsset } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAsset(SAMPLE_ASSET_ID);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/assets/${encodeURIComponent(SAMPLE_ASSET_ID)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.value.toString()).toBe('123.5');
      expect(result.data.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
    }
  });

  it('fetchAsset rejects the obsolete quantity field instead of adapting it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_ASSET_ID,
        definition_id: SAMPLE_ASSET_DEFINITION_ID,
        account_id: SAMPLE_I105,
        quantity: '123.5',
      }),
    }) as any;

    const { fetchAsset } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAsset(SAMPLE_ASSET_ID)).rejects.toThrow();
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

    await expect(fetchAsset(SAMPLE_ASSET_ID)).rejects.toThrow('response id does not match the requested asset ID');
  });

  it('fetchAssetDefinitions uses the minimal cursor-native Explorer DTO', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 5, next_cursor: null, has_more: false },
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const result = await fetchAssetDefinitions({ limit: 5 });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/asset-definitions');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.has('offset')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.pagination).toEqual({ limit: 5, next_cursor: null, has_more: false });
      expect(result.data.items[0]?.owning_domain).toBe('issuer.main');
      expect(result.data.items[0]?.total_quantity.toString()).toBe('11');
      expect(Object.hasOwn(result.data.items[0] ?? {}, 'alias')).toBe(false);
    }
  });

  it('rejects incomplete Explorer asset-definition items instead of applying full-route defaults', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 1, next_cursor: null, has_more: false },
        items: [
          {
            id: SAMPLE_ASSET_DEFINITION_ID,
            owning_domain: null,
            mintable: 'Infinitely',
            logo: null,
            metadata: {},
            owned_by: SAMPLE_I105,
            assets: 0,
            locked_quantity: null,
            circulating_quantity: null,
          },
        ],
      }),
    }) as any;

    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAssetDefinitions({ limit: 1 })).rejects.toThrow(/missing or unsupported fields/u);
  });

  it('fetchAssetDefinition prefers the v1 asset-definition detail route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_ASSET_DEFINITION_ID,
        owning_domain: null,
        alias: SAMPLE_ASSET_ALIAS,
        alias_binding: {
          alias: SAMPLE_ASSET_ALIAS,
          status: 'permanent',
          bound_at_ms: 1_700_000_000_000,
        },
        balance_scope_policy: 'Global',
        confidential_policy: { mode: 'transparent' },
        name: 'usd',
        description: null,
        mintable: 'Infinitely',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        spec: { scale: 18 },
        total_quantity: '11',
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example' });
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

  it('fetchAssetDefinition binds both canonical-id and alias selectors to the response identity', async () => {
    const detail = {
      id: SAMPLE_ASSET_DEFINITION_ID,
      owning_domain: null,
      alias: SAMPLE_ASSET_ALIAS,
      alias_binding: {
        alias: SAMPLE_ASSET_ALIAS,
        status: 'permanent',
        bound_at_ms: 1_700_000_000_000,
      },
      balance_scope_policy: 'Global',
      confidential_policy: { mode: 'transparent' },
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

  it('preserves the exact case of an on-chain asset-definition alias selector', async () => {
    const mixedCaseAlias = 'USD#Issuer.Main';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_ASSET_DEFINITION_ID,
        owning_domain: null,
        alias: mixedCaseAlias,
        alias_binding: {
          alias: mixedCaseAlias,
          status: 'permanent',
          bound_at_ms: 1_700_000_000_000,
        },
        balance_scope_policy: 'Global',
        confidential_policy: { mode: 'transparent' },
        name: 'usd',
        description: null,
        mintable: 'Infinitely',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        spec: { scale: 18 },
        total_quantity: '11',
      }),
    });
    global.fetch = fetchSpy as any;
    const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(fetchAssetDefinition(mixedCaseAlias)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: { alias: mixedCaseAlias },
    });
    expect((fetchSpy.mock.calls[0]?.[0] as URL).pathname).toBe(
      `/v1/assets/definitions/${encodeURIComponent(mixedCaseAlias)}`
    );
  });

  it.each([
    {
      requested: SAMPLE_ASSET_DEFINITION_ID,
      responseId: SAMPLE_ASSET_DEFINITION_ID_ALT,
      responseAlias: 'eur#issuer.main',
    },
    { requested: SAMPLE_ASSET_ALIAS, responseId: SAMPLE_ASSET_DEFINITION_ID_ALT, responseAlias: 'eur#issuer.main' },
  ])(
    'fetchAssetDefinition rejects a different resource for selector $requested',
    async ({ requested, responseId, responseAlias }) => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: responseId,
          owning_domain: null,
          alias: responseAlias,
          alias_binding: {
            alias: responseAlias,
            status: 'permanent',
            bound_at_ms: 1_700_000_000_000,
          },
          balance_scope_policy: 'Global',
          confidential_policy: { mode: 'transparent' },
          name: 'eur',
          description: null,
          mintable: 'Infinitely',
          logo: null,
          metadata: {},
          owned_by: SAMPLE_I105,
          spec: { scale: 18 },
          total_quantity: '11',
        }),
      }) as any;
      const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example' });

      await expect(fetchAssetDefinition(requested)).rejects.toThrow(
        'asset definition response identity does not match the requested resource'
      );
    }
  );

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

  it.each(['econometrics', 'snapshot'] as const)('rejects %s data for a different asset definition', async (kind) => {
    const distribution = {
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
      lorenz: [],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        kind === 'econometrics'
          ? {
              definition_id: SAMPLE_ASSET_DEFINITION_ID_ALT,
              computed_at_ms: 1_700_000_000_000,
              velocity_windows: [],
              issuance_windows: [],
              issuance_series: [],
            }
          : {
              definition_id: SAMPLE_ASSET_DEFINITION_ID_ALT,
              computed_at_ms: 1_700_000_000_000,
              holders_total: 0,
              total_supply: '0',
              top_holders: [],
              distribution,
            },
    }) as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });
    const request =
      kind === 'econometrics'
        ? api.fetchAssetDefinitionEconometrics(SAMPLE_ASSET_DEFINITION_ID)
        : api.fetchAssetDefinitionSnapshot(SAMPLE_ASSET_DEFINITION_ID);

    await expect(request).rejects.toThrow('response identity does not match the requested resource');
  });

  it('rejects alias analytics selectors before issuing canonical-id-only requests', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule({ VITE_API_URL: 'https://torii.example' });

    await expect(api.fetchAssetDefinitionEconometrics(SAMPLE_ASSET_ALIAS)).rejects.toThrow();
    await expect(api.fetchAssetDefinitionSnapshot(SAMPLE_ASSET_ALIAS)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchAccount surfaces detail rejections without adding unsupported format queries or retrying', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('invalid explorer account request', {
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
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ name: 'CanTransfer', payload: { maximum: '100000000000000000001' } }],
          total: 41,
          has_more: false,
          count_mode: 'exact',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const { fetchAccountPermissions } = await importApiModule(toriiEnv);
    const result = await fetchAccountPermissions(SAMPLE_I105, { page: 3, per_page: 20 });

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_I105)}/permissions`);
    expect(requestUrl.searchParams.get('limit')).toBe('20');
    expect(requestUrl.searchParams.get('offset')).toBe('40');
    expect(requestUrl.searchParams.get('count_mode')).toBe('exact');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.payload).toEqual({ maximum: '100000000000000000001' });
    }
  });

  it.each([401, 403])('returns an explicit permission-denied result for HTTP %s', async (status) => {
    global.fetch = vi.fn().mockResolvedValue(new Response('private dataspace permission denied', { status })) as any;

    const { fetchAccountPermissions } = await importApiModule(toriiEnv);
    const result = await fetchAccountPermissions(SAMPLE_I105, { page: 1, per_page: 10 });

    expect(result.status).toBe('permission-denied');
    if (result.status === 'permission-denied') {
      expect(result.error.message).toContain('private dataspace');
    }
  });

  it('requests indexed account history with an exact asset selector and preserves amount strings', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
          total: 11,
          has_more: false,
          count_mode: 'exact',
          indexed_height: 77,
          indexed_block_hash: 'cd'.repeat(32),
          query_source: 'account_history_index',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    global.fetch = fetchSpy as any;

    const { fetchAccountHistory } = await importApiModule(toriiEnv);
    const result = await fetchAccountHistory(SAMPLE_I105, {
      page: 2,
      per_page: 10,
      asset_id: SAMPLE_ASSET_ALIAS,
    });

    const requestUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestUrl.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_I105)}/history`);
    expect(requestUrl.searchParams.get('limit')).toBe('10');
    expect(requestUrl.searchParams.get('offset')).toBe('10');
    expect(requestUrl.searchParams.get('count_mode')).toBe('exact');
    expect(requestUrl.searchParams.get('asset_id')).toBe(SAMPLE_ASSET_ALIAS);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.amount).toBe('99999999999999999999.000001');
      expect(result.data.query_source).toBe('account_history_index');
    }
  });

  it('accepts a multi-route account-history fanout envelope without index metadata', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          total: 0,
          has_more: false,
          count_mode: 'exact',
          query_source: 'account_history_fanout',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as any;

    const { fetchAccountHistory } = await importApiModule(toriiEnv);
    const result = await fetchAccountHistory(SAMPLE_I105, {
      page: 1,
      per_page: 10,
    });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.query_source).toBe('account_history_fanout');
      expect('indexed_height' in result.data).toBe(false);
      expect(result.data.total).toBe(0);
    }
  });

  it('rejects exact account responses whose rows contradict the requested offset window', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 1, has_more: true, count_mode: 'exact' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            total: 1,
            has_more: true,
            count_mode: 'exact',
            query_source: 'account_history_fanout',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    global.fetch = fetchSpy as any;

    const { fetchAccountHistory, fetchAccountPermissions } = await importApiModule(toriiEnv);

    await expect(fetchAccountPermissions(SAMPLE_I105, { page: 1, per_page: 10 })).rejects.toThrow(
      'exact pagination requires 1'
    );
    await expect(fetchAccountHistory(SAMPLE_I105, { page: 1, per_page: 10 })).rejects.toThrow(
      'exact pagination requires 1'
    );
  });

  it('rejects invalid account read request DTOs before issuing a request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { fetchAccountHistory, fetchAccountPermissions } = await importApiModule(toriiEnv);

    await expect(fetchAccountPermissions(SAMPLE_I105, { page: 0, per_page: 10 })).rejects.toThrow();
    await expect(
      fetchAccountHistory(SAMPLE_I105, { page: 51, per_page: 10, asset_id: SAMPLE_ASSET_ALIAS })
    ).rejects.toThrow();
    await expect(
      fetchAccountHistory(SAMPLE_I105, { page: 1, per_page: 10, asset_id: ' usd#issuer.main' })
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses canonical signed multisig selectors for IDs and aliases without mutation controls', async () => {
    runtimeConfigState.value = { networkId: SAMPLE_NETWORK_ID };
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname === '/v1/multisig/spec') {
        return new Response(
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
      return new Response(
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
    const auth = { authAccountId: SAMPLE_I105, sign };

    const { fetchMultisigProposals, fetchMultisigSpec } = await importApiModule(toriiEnv);
    const spec = await fetchMultisigSpec(SAMPLE_ACCOUNT_ALIAS, auth);
    const proposals = await fetchMultisigProposals(
      SAMPLE_I105,
      { status: ['COLLECTING_SIGNATURES'], cursor: 'Y3Vyc29yLTE', limit: 20 },
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
      cursor: 'Y3Vyc29yLTE',
      limit: 20,
    });
  });

  it('rejects invalid multisig query DTOs before signing or issuing a request', async () => {
    runtimeConfigState.value = { networkId: SAMPLE_NETWORK_ID };
    const fetchSpy = vi.fn();
    const sign = vi.fn(async () => new Uint8Array(64).fill(7));
    global.fetch = fetchSpy as any;
    const { fetchMultisigProposals } = await importApiModule(toriiEnv);
    const auth = { authAccountId: SAMPLE_I105, sign };

    await expect(
      fetchMultisigProposals(SAMPLE_I105, { status: ['FINALIZED', 'FINALIZED'], cursor: null, limit: 20 }, auth)
    ).rejects.toThrow();
    await expect(fetchMultisigProposals(SAMPLE_I105, { cursor: 'padded=', limit: 20 }, auth)).rejects.toThrow();
    await expect(fetchMultisigProposals(SAMPLE_I105, { cursor: null, limit: 101 }, auth)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never replays a canonical signed multisig POST after a transient response', async () => {
    runtimeConfigState.value = {
      networkId: SAMPLE_NETWORK_ID,
      toriiRequestRetryCount: 2,
      toriiRequestRetryBaseDelayMs: 0,
      toriiRequestTimeoutMs: 2_000,
    };
    const fetchSpy = vi.fn().mockResolvedValue(new Response('temporarily unavailable', { status: 503 }));
    global.fetch = fetchSpy as any;
    const sign = vi.fn(async () => new Uint8Array(64).fill(7));

    const { fetchMultisigSpec } = await importApiModule(toriiEnv);
    const result = await fetchMultisigSpec(SAMPLE_ACCOUNT_ALIAS, {
      authAccountId: SAMPLE_I105,
      sign,
    });

    expect(result.status).toBe(UNKNOWN_ERROR);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Explorer domain and NFT API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const nftId = 'cool-cat$gallery.main';

  it('fetchDomains parses exact cursor items', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 1, next_cursor: null, has_more: false },
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchDomains } = await importApiModule(toriiEnv);
    const result = await fetchDomains({ limit: 1, owned_by: SAMPLE_I105 });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/domains');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe('gallery.main');
      expect(result.data.items[0]?.nfts).toBe(3);
    }
  });

  it('fetchDomain parses the same exact DTO on the detail route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'gallery.main',
        logo: null,
        metadata: {},
        owned_by: SAMPLE_I105,
        accounts: 1,
        assets: 2,
        nfts: 3,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchDomain } = await importApiModule(toriiEnv);
    const result = await fetchDomain('gallery.main');

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/domains/gallery.main');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
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

  it('fetchNFTs parses canonical fully-qualified NFT cursor items', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 1, next_cursor: null, has_more: false },
        items: [{ id: nftId, owned_by: SAMPLE_I105, metadata: { rarity: 'legendary' } }],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchNFTs } = await importApiModule(toriiEnv);
    const result = await fetchNFTs({ limit: 1, domain: 'gallery.main' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/nfts');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(nftId);
    }
  });

  it('fetchNFTById parses the same exact DTO on the detail route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: nftId, owned_by: SAMPLE_I105, metadata: {} }),
    });
    global.fetch = fetchSpy as any;

    const { fetchNFTById } = await importApiModule(toriiEnv);
    const result = await fetchNFTById(nftId);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/nfts/${encodeURIComponent(nftId)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('fetchNFTById rejects a valid detail response for a different NFT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'rare-cat$gallery.main', owned_by: SAMPLE_I105, metadata: {} }),
    }) as any;
    const { fetchNFTById } = await importApiModule(toriiEnv);

    await expect(fetchNFTById(nftId)).rejects.toThrow('NFT response identity does not match the requested resource');
  });

  it('rejects noncanonical domain and NFT detail selectors before a request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule(toriiEnv);

    await expect(api.fetchDomain('Gallery.main')).rejects.toThrow('canonical domain.dataspace');
    await expect(api.fetchNFTById('cool-cat$Gallery.main')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Explorer RWA API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };

  it('fetchRwas keeps owner/domain filters on /v1/explorer/rwas', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { limit: 5, next_cursor: null, has_more: false },
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchRwas } = await importApiModule(toriiEnv);
    const result = await fetchRwas({ limit: 5, owned_by: SAMPLE_I105, domain: 'commodities.main' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/rwas');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.get('owned_by')).toBe(SAMPLE_I105);
    expect(firstCall.searchParams.get('domain')).toBe('commodities.main');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.quantity.toString()).toBe('10.5');
      expect(result.data.items[0]?.metadata).toEqual({ origin: 'AE' });
      expect(result.data.items[0]?.parents[0]?.quantity.toString()).toBe('5');
    }
  });

  it('fetchRwaById URL-encodes canonical identifiers and preserves required nullable status', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
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

  it('rejects a noncanonical RWA detail selector before a request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { fetchRwaById } = await importApiModule(toriiEnv);

    await expect(fetchRwaById(SAMPLE_RWA_ID.toUpperCase())).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('fetchBlocks sends only cursor pagination and preserves the immutable snapshot', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: {
          ...HISTORY_PAGINATION,
          limit: 2,
          next_cursor: 'bmV4dA',
          has_more: true,
        },
        items: [],
      }),
    }) as any;

    const { fetchBlocks } = await importApiModule(toriiEnv);
    const result = await fetchBlocks({ cursor: 'Y3VycmVudA', limit: 2 });

    const url = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe('/v1/explorer/blocks');
    expect(url.searchParams.get('cursor')).toBe('Y3VycmVudA');
    expect(url.searchParams.get('limit')).toBe('2');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('per_page')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.pagination.snapshot_hash).toBe(HISTORY_PAGINATION.snapshot_hash);
    }
  });

  it('fetchBlocks rejects a non-advancing history cursor', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: {
          ...HISTORY_PAGINATION,
          next_cursor: 'c2FtZQ',
          has_more: true,
        },
        items: [],
      }),
    }) as any;

    const { fetchBlocks } = await importApiModule(toriiEnv);
    await expect(fetchBlocks({ cursor: 'c2FtZQ', limit: 10 })).rejects.toThrow('cursor did not advance');
  });

  it("fetchBlocks rejects a cursor above Torii's 192-byte history ceiling before requesting", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchBlocks } = await importApiModule(toriiEnv);
    await expect(fetchBlocks({ cursor: 'h'.repeat(193), limit: 10 })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchBlock binds both height and canonical-hash selectors to the returned block', async () => {
    const blockPayload = {
      hash: SAMPLE_TRANSACTION_HASH,
      height: 42,
      created_at: '2026-03-05T06:00:00Z',
      prev_block_hash: null,
      transactions_hash: null,
      transactions_rejected: 0,
      transactions_total: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => blockPayload });
    global.fetch = fetchSpy as any;
    const { fetchBlock } = await importApiModule(toriiEnv);

    await expect(fetchBlock(42)).resolves.toMatchObject({ status: SUCCESSFUL_FETCHING });
    await expect(fetchBlock('42')).resolves.toMatchObject({ status: SUCCESSFUL_FETCHING });
    await expect(fetchBlock(`0x${SAMPLE_TRANSACTION_HASH.toUpperCase()}`)).resolves.toMatchObject({
      status: SUCCESSFUL_FETCHING,
    });
    expect(fetchSpy.mock.calls.map((call) => (call[0] as URL).pathname)).toEqual([
      '/v1/explorer/blocks/42',
      '/v1/explorer/blocks/42',
      `/v1/explorer/blocks/${SAMPLE_TRANSACTION_HASH}`,
    ]);
  });

  it.each([
    { selector: 42, hash: SAMPLE_TRANSACTION_HASH, height: 43 },
    { selector: '42', hash: SAMPLE_TRANSACTION_HASH, height: 43 },
    { selector: SAMPLE_TRANSACTION_HASH, hash: SAMPLE_TRANSACTION_HASH_ALT, height: 42 },
  ])(
    'fetchBlock rejects a valid response that does not match selector $selector',
    async ({ selector, hash, height }) => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hash,
          height,
          created_at: '2026-03-05T06:00:00Z',
          prev_block_hash: null,
          transactions_hash: null,
          transactions_rejected: 0,
          transactions_total: 0,
        }),
      }) as any;
      const { fetchBlock } = await importApiModule(toriiEnv);

      await expect(fetchBlock(selector)).rejects.toThrow(
        'block response identity does not match the requested resource'
      );
    }
  );

  it.each([0, -1, 1.5, '0', '042', '9007199254740992', 'not-a-hash'])(
    'fetchBlock rejects invalid selector %s before a request',
    async (selector) => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;
      const { fetchBlock } = await importApiModule(toriiEnv);

      await expect(fetchBlock(selector)).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('fetchExplorerHealth parses head probe payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        head_height: 42,
        head_created_at: '2026-03-05T06:00:00Z',
        sampled_at: '2026-03-05T06:00:02Z',
      }),
    }) as any;

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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sampled_at: '2026-03-05T06:00:02Z',
        pagination: { ...HISTORY_PAGINATION, limit: 5 },
        items: [
          {
            authority: SAMPLE_I105,
            hash: 'a1'.repeat(32),
            block: 10,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      }),
    }) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ limit: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/transactions/latest');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.hash).toBe('a1'.repeat(32));
    }
  });

  it('fetchLatestTransactions preserves halfwidth authorities from Torii', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sampled_at: '2026-03-05T06:00:02Z',
        pagination: { ...HISTORY_PAGINATION, limit: 5 },
        items: [
          {
            authority: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
            hash: 'a2'.repeat(32),
            block: 11,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      }),
    }) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ limit: 5 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.authority).toBe('sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE');
    }
  });

  it('fetchLatestInstructions uses the lightweight latest endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sampled_at: '2026-03-05T06:00:02Z',
        pagination: { ...HISTORY_PAGINATION, limit: 5 },
        items: [
          {
            authority: SAMPLE_I105,
            block: 10,
            transaction_hash: 'ab'.repeat(32),
            index: 0,
            kind: 'Mint',
            transaction_status: 'Committed',
            created_at: '2026-03-05T06:00:01Z',
            box: {
              encoded: '0x01',
              framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
              json: {
                kind: 'Mint',
                payload: {
                  variant: 'Asset',
                  value: {
                    object: '1',
                    destination: SAMPLE_ASSET_ID,
                  },
                },
                wire_id: 'iroha_data_model::isi::MintBox',
                encoded: '01',
              },
            },
          },
        ],
      }),
    }) as any;

    const { fetchLatestInstructions } = await importApiModule(toriiEnv);
    const result = await fetchLatestInstructions({ limit: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/latest');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.kind).toBe('Mint');
    }
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

  it('sends the exact latest-attestation query and binds its key and optional status', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(serializeAttestation(attestation), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchLatestDefiOracleAttestation } = await importApiModule(toriiEnv);

    const result = await fetchLatestDefiOracleAttestation({ domain: 1, subject_id: '42', status: 7 });
    const url = fetchSpy.mock.calls[0]?.[0] as URL;

    expect(url.pathname).toBe('/v1/soracles/defi/attestations/latest');
    expect(Object.fromEntries(url.searchParams)).toEqual({ domain: '1', subject_id: '42', status: '7' });
    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: { key: { domain: 1, subject_id: '42' }, oracle_slot: '10', attestation_hash: attestationHash },
    });
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

    const result = await fetchLatestDefiOracleAttestation({ domain: 4, subject_id: maxU64, status: 7 });
    const url = fetchSpy.mock.calls[0]?.[0] as URL;

    expect(url.searchParams.get('subject_id')).toBe(maxU64);
    expect(result).toMatchObject({
      status: SUCCESSFUL_FETCHING,
      data: { key: { subject_id: maxU64 }, oracle_slot: maxU64, attestation_hash: maxU64 },
    });
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
      'DeFi oracle attestation response identity does not match the requested key'
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

describe('Nexus dataspaces API helpers', () => {
  it('fetchNexusDataspacesAccountSummary requests Torii nexus endpoint and parses response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
            accounts: [SAMPLE_I105],
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
      }),
    });
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

  it.each(['not an account', SAMPLE_ACCOUNT_ALIAS])(
    'rejects a noncanonical or alias account ID before issuing a Nexus request: %s',
    async (invalidId) => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const { fetchNexusDataspacesAccountSummary } = await importApiModule({
        VITE_API_URL: 'https://torii.example',
      });

      await expect(fetchNexusDataspacesAccountSummary(invalidId)).rejects.toThrow(
        'Account ID must be an exact canonical halfwidth i105 literal'
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it.each([
    { account: SAMPLE_I105_ALT, account_id: SAMPLE_I105_ALT },
    { account: SAMPLE_I105, account_id: SAMPLE_I105_ALT },
  ])('rejects a Nexus summary with an unbound account identity: %o', async (identity) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...identity,
        uaid: null,
        totals: {
          dataspaces: 0,
          accounts_bound: 0,
          portfolio_accounts: 0,
          portfolio_positions: 0,
          manifests_total: 0,
          manifests_active: 0,
          consensus_entries: 0,
          consensus_tx_count: 0,
          consensus_chunks_total: 0,
          consensus_rbc_bytes_total: 0,
          consensus_teu_total: 0,
        },
        dataspaces: [],
      }),
    }) as any;
    const { fetchNexusDataspacesAccountSummary } = await importApiModule({
      VITE_API_URL: 'https://torii.example',
    });

    await expect(fetchNexusDataspacesAccountSummary(SAMPLE_I105)).rejects.toThrow(
      'Nexus dataspaces account summary response identity does not match the requested resource'
    );
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

describe('Instruction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const sampleAccountId = SAMPLE_I105;
  const sampleAssetId = SAMPLE_ASSET_ID;

  it('fetchInstructions forwards account and asset filters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: HISTORY_PAGINATION,
        items: [],
      }),
    });
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
    expect(firstCall.toString()).toContain('/v1/explorer/instructions?');
    expect(firstCall.searchParams.get('account')).toBe(sampleAccountId);
    expect(firstCall.searchParams.get('asset_id')).toBe(sampleAssetId);
    expect(firstCall.searchParams.get('kind')).toBe('Transfer');
    expect(firstCall.searchParams.get('transaction_status')).toBe('committed');
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetchInstructions parses payloads using the box field name', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: HISTORY_PAGINATION,
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
                encoded: '01',
              },
            },
            transaction_hash: 'ab'.repeat(32),
            transaction_status: 'Committed',
            block: 1,
            index: 0,
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructions } = await importApiModule(toriiEnv);
    const result = await fetchInstructions({ limit: 10, transaction_hash: 'ab'.repeat(32) });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/instructions');
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
  const toriiEnv = { VITE_API_URL: 'https://torii.example' };
  const sampleAuthority = SAMPLE_I105_ALT;
  const sampleAssetId = SAMPLE_ASSET_ID;

  it('fetchTransactions forwards asset filters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: HISTORY_PAGINATION,
        items: [],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchTransactions } = await importApiModule(toriiEnv);
    await fetchTransactions({
      limit: 10,
      authority: sampleAuthority,
      status: 'Committed',
      asset_id: sampleAssetId,
    });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/transactions?');
    expect(firstCall.searchParams.get('asset_id')).toBe(sampleAssetId);
    expect(firstCall.searchParams.get('authority')).toBe(sampleAuthority);
    expect(firstCall.searchParams.get('status')).toBe('committed');
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.has('page')).toBe(false);
    expect(firstCall.searchParams.has('per_page')).toBe(false);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it('fetchTransaction relies on the canonical response without a retired address-format query', async () => {
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/instructions')) {
        return {
          ok: true,
          json: async () => ({
            pagination: HISTORY_PAGINATION,
            items: [],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          authority: sampleAuthority,
          hash: SAMPLE_TRANSACTION_HASH,
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
      };
    });
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    await fetchTransaction(`0x${SAMPLE_TRANSACTION_HASH.toUpperCase()}`);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/transactions/${SAMPLE_TRANSACTION_HASH}`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
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

  it('fetches state-root and persisted-QC evidence from their exact ledger routes', async () => {
    const commitQc = {
      phase: 'Commit',
      subject_block_hash: 'hash:block',
      parent_state_root: 'hash:parent',
      post_state_root: 'hash:state',
      height: 42,
      view: 7,
      epoch: 3,
      mode_tag: 'sumeragi-v2',
      highest_qc: null,
      validator_set_hash: 'hash:validators',
      validator_set_hash_version: 1,
      validator_set: ['peer-a'],
      aggregate: { signers_bitmap: '01', bls_aggregate_signature: 'cafe' },
    };
    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const common = { height: 42, block_hash: 'hash:block', state_root: 'hash:state' };
      return new Response(
        JSON.stringify(
          url.pathname.includes('state-proof')
            ? { ...common, commit_qc: commitQc }
            : { ...common, source: 'commit_qc', commit_qc: commitQc }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    global.fetch = fetchSpy as any;

    const { fetchLedgerStateProof, fetchLedgerStateRoot } = await importApiModule(toriiEnv);
    const [root, stateProof] = await Promise.all([fetchLedgerStateRoot(42), fetchLedgerStateProof(42)]);

    expect(root.status).toBe(SUCCESSFUL_FETCHING);
    expect(stateProof.status).toBe(SUCCESSFUL_FETCHING);
    expect(fetchSpy.mock.calls.map((call) => (call[0] as URL).pathname).sort()).toEqual([
      '/v1/ledger/state-proof/42',
      '/v1/ledger/state/42',
    ]);
    expect(
      fetchSpy.mock.calls.every(
        (call) => ((call[1] as RequestInit).headers as Record<string, string>).Accept === 'application/json'
      )
    ).toBe(true);
  });

  it('reports the canonical SDK path verification separately from request binding', async () => {
    const module = await importApiModule(toriiEnv);
    const { ToriiBrowserClient } = await import('@iroha/iroha-js/torii-browser');
    const decoded = {
      block_height: '42',
      block_hash: 'not-a-valid-hash',
      executed_block_wire_hash: 'not-a-valid-hash',
      entry_hash: 'not-a-valid-hash',
      entry_commitment: { root: 'not-a-valid-root', leaf_count: '1' },
      entry_proof: {
        leaf: 'not-a-valid-hash',
        proof: { leaf_index: 0, audit_path: [] },
      },
      result_commitment: { root: 'not-a-valid-root', leaf_count: '1' },
      result_proof: {
        leaf: 'not-a-valid-hash',
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
      expect(result.data.pathVerification.valid).toBe(false);
      expect(result.data.pathVerification.entry_proof_valid).toBe(false);
    }
    proofSpy.mockRestore();
  });

  it('keeps a missing canonical block proof explicitly not-found', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } })) as any;
    const { fetchLedgerBlockProof } = await importApiModule(toriiEnv);

    const result = await fetchLedgerBlockProof(42, 'a'.repeat(64));

    expect(result.status).toBe(NOT_FOUND);
  });

  it('fetchInstructionDetail relies on the canonical response without a retired address-format query', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authority: sampleAuthority,
        created_at: '2026-03-10T12:00:00Z',
        kind: 'Log',
        box: {
          encoded: '0x01',
          framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
          json: {
            kind: 'Log',
            wire_id: 'Log',
            encoded: '01',
            payload: {
              value: { level: 'DEBUG', msg: 'hello' },
              variant: 'Log',
            },
          },
        },
        transaction_hash: SAMPLE_TRANSACTION_HASH,
        transaction_status: 'Committed',
        block: 42,
        index: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructionDetail } = await importApiModule(toriiEnv);
    await fetchInstructionDetail(`0x${SAMPLE_TRANSACTION_HASH.toUpperCase()}`, 0);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/instructions/${SAMPLE_TRANSACTION_HASH}/0`);
    expect(firstCall.searchParams.has('address_format')).toBe(false);
  });

  it.each([
    { transactionHash: SAMPLE_TRANSACTION_HASH_ALT, index: 0 },
    { transactionHash: SAMPLE_TRANSACTION_HASH, index: 1 },
  ])('fetchInstructionDetail rejects a different response identity: %o', async ({ transactionHash, index }) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authority: sampleAuthority,
        created_at: '2026-03-10T12:00:00Z',
        kind: 'Log',
        box: {
          encoded: '0x01',
          framed_sha256: SAMPLE_FRAMED_INSTRUCTION_SHA256,
          json: {
            kind: 'Log',
            wire_id: 'Log',
            encoded: '01',
            payload: { value: { level: 'DEBUG', msg: 'hello' }, variant: 'Log' },
          },
        },
        transaction_hash: transactionHash,
        transaction_status: 'Committed',
        block: 42,
        index,
      }),
    }) as any;
    const { fetchInstructionDetail } = await importApiModule(toriiEnv);

    await expect(fetchInstructionDetail(SAMPLE_TRANSACTION_HASH, 0)).rejects.toThrow(
      'instruction response identity does not match the requested resource'
    );
  });

  it('fetchInstructionContractView keeps the request on the explorer API without address-format params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code_hash: 'aa'.repeat(32),
        byte_len: 64,
        permissions: [],
        entrypoints: [],
        warnings: [],
        rendered_source_kind: 'pseudo_source',
        rendered_source_text: 'contract Demo {}',
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructionContractView } = await importApiModule(toriiEnv);
    await fetchInstructionContractView(`0x${SAMPLE_TRANSACTION_HASH.toUpperCase()}`, 1);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/instructions/${SAMPLE_TRANSACTION_HASH}/1/contract-view`);
    expect(firstCall.searchParams.get('address_format')).toBeNull();
  });

  it.each([
    { label: 'detail hash', request: (api: typeof ApiIndexModule) => api.fetchInstructionDetail('bad-hash', 0) },
    {
      label: 'detail index',
      request: (api: typeof ApiIndexModule) => api.fetchInstructionDetail(SAMPLE_TRANSACTION_HASH, -1),
    },
    {
      label: 'contract hash',
      request: (api: typeof ApiIndexModule) => api.fetchInstructionContractView('bad-hash', 0),
    },
    {
      label: 'contract index',
      request: (api: typeof ApiIndexModule) => api.fetchInstructionContractView(SAMPLE_TRANSACTION_HASH, 0x1_0000_0000),
    },
  ])('rejects an invalid instruction $label before a request', async ({ request }) => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const api = await importApiModule(toriiEnv);

    await expect(request(api)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchTransaction returns request rejections without retrying or adding retired query parameters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('invalid explorer transaction request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction(SAMPLE_TRANSACTION_HASH);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.has('address_format')).toBe(false);
    expect(result.status).toBe(UNKNOWN_ERROR);
  });

  it.each(['not-a-hash', '0xmissing'])('fetchTransaction rejects malformed hash %s before a request', async (hash) => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);

    await expect(fetchTransaction(hash)).rejects.toThrow('canonical Iroha 32-byte hash');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchTransaction returns a missing canonical response without retrying', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('missing', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;
    const { fetchTransaction } = await importApiModule(toriiEnv);

    const result = await fetchTransaction(SAMPLE_TRANSACTION_HASH);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(NOT_FOUND);
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
