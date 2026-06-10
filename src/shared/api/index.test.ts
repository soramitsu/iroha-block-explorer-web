import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import type * as ApiIndexModule from './index';
import { appendSearchParams } from '@/shared/api/query';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
const SAMPLE_I105_MODERN = 'sorauﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76';
const SAMPLE_I105_TEST_MODERN = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ACCOUNT_ALIAS = 'treasury@banking.retail';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105}`;
const TORII_API_VERSION_HEADER = 'x-iroha-api-version';
const TORII_API_VERSION = '1.1';

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

    const fetchSpy = vi.fn(
      async (input: unknown) =>
        new Response(
          JSON.stringify({
            pagination: { page: 1, per_page: 1, total_pages: 1, total_items: 0 },
            items: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    global.fetch = fetchSpy as any;

    const result = await module.fetchAccounts({ page: 1, per_page: 1 });
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
          pagination: { page: 1, per_page: 1, total_pages: 1, total_items: 1 },
          items: [
            {
              id: SAMPLE_I105,
              compressed_address: '34mSYnCXkCzHXm31UDHh7SJfGvC4QPEhwim8z7sys2iHqXpCwCQkjL8KHvkFLSs1vZdJcb37r',
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

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const availability = module.useToriiAvailability();
    const result = await module.fetchAccounts({ page: 1, per_page: 1 });

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
          pagination: { page: 1, per_page: 1, total_pages: 1, total_items: 1 },
          items: [
            {
              id: SAMPLE_I105,
              compressed_address: '34mSYnCXkCzHXm31UDHh7SJfGvC4QPEhwim8z7sys2iHqXpCwCQkjL8KHvkFLSs1vZdJcb37r',
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

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    module.setToriiBaseUrl('https://torii.example', { persist: false });
    const result = await module.fetchAccounts({ page: 1, per_page: 1 });

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

    const fetchSpy = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url.startsWith('https://torii.example/v1/explorer/transactions')) {
        return new Response('bad gateway', { status: 502 });
      }
      if (url === 'https://torii.example/peers') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'https://backup.example/v1/explorer/health') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const availability = module.useToriiAvailability();

    for (let idx = 0; idx < 5; idx += 1) {
      await module.fetchTransactions({ page: 1, per_page: 1 });
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
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
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

    const module = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const switched = await module.retryToriiFailover();
    const peerCall = fetchSpy.mock.calls.find(([input]) => String(input) === 'https://torii.example/peers');
    const healthCall = fetchSpy.mock.calls.find(([input]) => String(input) === 'https://fresh.example/v1/explorer/health');

    expect(switched).toBe(true);
    expect(module.getToriiBaseUrl()).toBe('https://fresh.example');
    expect(peerCall?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
      },
    });
    expect(healthCall?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
      },
    });
  });

  it('does not auto-probe built-in preset nodes during failover', async () => {
    runtimeConfigState.value = {
      toriiFailoverEnabled: true,
      toriiFailoverNodes: [],
      toriiFailoverProbeTimeoutMs: 500,
      toriiFailoverPersistSwitch: true,
      toriiFailoverMaxPeerCandidates: 4,
    };

    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url === 'https://torii.example/peers') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
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
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'https://unhealthy.example/v1/explorer/health') {
        return new Response('bad gateway', { status: 502 });
      }
      return new Response('not found', { status: 404 });
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 1 },
        items: [
          {
            id: validAccountId,
            compressed_address: '34mSYnCXkCzHXm31UDHh7SJfGvC4QPEhwim8z7sys2iHqXpCwCQkjL8KHvkFLSs1vZdJcb37r',
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ page: 1, per_page: 10, domain: 'wonderland' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    const firstOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/accounts');
    expect(firstCall.searchParams.get('page')).toBe('1');
    expect(firstCall.searchParams.get('per_page')).toBe('10');
    expect(firstCall.searchParams.get('domain')).toBe('wonderland');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(firstOptions).toMatchObject({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
      },
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
  });

  it('can omit the Torii API version header from runtime config', async () => {
    runtimeConfigState.value = { toriiApiVersionHeaderEnabled: false };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
        items: [],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ page: 1, per_page: 10 });

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

  it('fetchAccounts accepts nullable optional address fields from Torii account listings', async () => {
    const validAccountId = SAMPLE_I105;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 1 },
        items: [
          {
            id: validAccountId,
            compressed_address: null,
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

    const { fetchAccounts } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccounts({ page: 1, per_page: 10 });

    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.id).toBe(validAccountId);
      expect(result.data.items[0]?.i105_address).toBe(validAccountId);
    }
  });

  it('fetchAccount URL-encodes account selectors and returns canonical i105 data', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105,
        compressed_address: 'sora5AbCDeFG1234XYZ9876qwerty',
        network_prefix: 753,
        metadata: {},
        owned_assets: 0,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/accounts/treasury%40banking.retail');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105);
      expect(result.data.i105_address).toBe(SAMPLE_I105);
    }
  });

  it('fetchAccount preserves incoming i105 route params without rewriting the prefix', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105_TEST_MODERN,
        compressed_address: null,
        network_prefix: 369,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_I105_TEST_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_TEST_MODERN)}`);
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_TEST_MODERN);
      expect(result.data.i105_address).toBe(SAMPLE_I105_TEST_MODERN);
    }
  });

  it('fetchAccount also preserves sora-prefixed ids on Taira Torii bases', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_I105_MODERN,
        compressed_address: null,
        network_prefix: 753,
        metadata: {},
        owned_assets: 1,
        owned_nfts: 0,
        owned_domains: 0,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org/v1/explorer' });
    const result = await fetchAccount(SAMPLE_I105_MODERN);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/explorer/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}`);
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_I105_MODERN);
      expect(result.data.i105_address).toBe(SAMPLE_I105_MODERN);
    }
  });

  it('preserves testnet account filters before calling explorer list endpoints', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            asset: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_TEST_MODERN,
            asset_name: null,
            asset_alias: null,
            quantity: '25000',
            scope: 'global',
          },
        ],
        total: 1,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssets({ page: 1, per_page: 10, owned_by: SAMPLE_I105_TEST_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_I105_TEST_MODERN)}/assets`);
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.get('offset')).toBe('0');
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
        items: [
          {
            asset: SAMPLE_ASSET_DEFINITION_ID,
            account_id: SAMPLE_I105_MODERN,
            asset_name: null,
            asset_alias: null,
            quantity: '25000',
            scope: 'global',
          },
        ],
        total: 1,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://taira.sora.org/v1/explorer' });
    const result = await fetchAssets({ page: 1, per_page: 10, owned_by: SAMPLE_I105_MODERN });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}/assets`);
    expect(firstCall.searchParams.get('limit')).toBe('10');
    expect(firstCall.searchParams.get('offset')).toBe('0');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.value.toString()).toBe('25000');
    }
  });

  it('uses the per-definition holders route when filtering assets by definition', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            asset: SAMPLE_ASSET_DEFINITION_ID,
            asset_alias: SAMPLE_ASSET_ALIAS,
            account_id: SAMPLE_I105,
            quantity: '77',
            scope: 'global',
          },
        ],
        total: 1,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssets } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssets({ page: 2, per_page: 5, definition: SAMPLE_ASSET_DEFINITION_ID });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/assets/${encodeURIComponent(SAMPLE_ASSET_DEFINITION_ID)}/holders`);
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.get('offset')).toBe('5');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.pagination.page).toBe(2);
      expect(result.data.items[0]?.definition_id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.items[0]?.asset_alias).toBe(SAMPLE_ASSET_ALIAS);
      expect(result.data.items[0]?.value.toString()).toBe('77');
    }
  });

  it('fetchAssetDefinitions uses the v1 asset-definitions route and adapts iterable pagination', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: SAMPLE_ASSET_DEFINITION_ID,
            alias: SAMPLE_ASSET_ALIAS,
            name: 'usd',
            mintable: 'Infinitely',
            metadata: {},
            owned_by: SAMPLE_I105,
          },
        ],
        total: 11,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinitions } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssetDefinitions({ page: 2, per_page: 5 });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/assets/definitions');
    expect(firstCall.searchParams.get('limit')).toBe('5');
    expect(firstCall.searchParams.get('offset')).toBe('5');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.pagination.page).toBe(2);
      expect(result.data.pagination.per_page).toBe(5);
      expect(result.data.pagination.total_pages).toBe(3);
      expect(result.data.pagination.total_items).toBe(11);
      expect(result.data.items[0]?.alias).toBe(SAMPLE_ASSET_ALIAS);
    }
  });

  it('fetchAssetDefinition prefers the v1 asset-definition detail route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: SAMPLE_ASSET_DEFINITION_ID,
        alias: SAMPLE_ASSET_ALIAS,
        name: 'usd',
        mintable: 'Infinitely',
        metadata: {},
        owned_by: SAMPLE_I105,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchAssetDefinition } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAssetDefinition(SAMPLE_ASSET_DEFINITION_ID);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe(`/v1/assets/definitions/${encodeURIComponent(SAMPLE_ASSET_DEFINITION_ID)}`);
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe(SAMPLE_ASSET_DEFINITION_ID);
      expect(result.data.alias).toBe(SAMPLE_ASSET_ALIAS);
    }
  });

  it('fetchAccount does not retry alternate address formats on format rejections', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('address_format `i105` must be `ih58` or `compressed`', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchAccount } = await importApiModule({ VITE_API_URL: 'https://torii.example/v1/explorer' });
    const result = await fetchAccount(SAMPLE_ACCOUNT_ALIAS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(UNKNOWN_ERROR);
  });
});

describe('Explorer RWA API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchRwas keeps owner/domain filters on /v1/explorer/rwas', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 2, per_page: 5, total_pages: 3, total_items: 12 },
        items: [
          {
            id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities',
            owned_by: SAMPLE_I105,
            quantity: '10.5',
            held_quantity: '1',
            primary_reference: 'vault-cert-001',
            status: 'active',
            is_frozen: false,
            metadata: { origin: 'AE' },
            parents: [
              {
                rwa: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210$commodities',
                quantity: '5',
              },
            ],
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchRwas } = await importApiModule(toriiEnv);
    const result = await fetchRwas({ page: 2, per_page: 5, owned_by: SAMPLE_I105, domain: 'commodities' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/rwas');
    expect(firstCall.searchParams.get('page')).toBe('2');
    expect(firstCall.searchParams.get('per_page')).toBe('5');
    expect(firstCall.searchParams.get('owned_by')).toBe(SAMPLE_I105);
    expect(firstCall.searchParams.get('domain')).toBe('commodities');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items[0]?.quantity.toString()).toBe('10.5');
      expect(result.data.items[0]?.metadata).toEqual({ origin: 'AE' });
      expect(result.data.items[0]?.parents[0]?.quantity.toString()).toBe('5');
    }
  });

  it('fetchRwaById URL-encodes rwa identifiers and accepts null metadata', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'lot-001$commodities',
        owned_by: SAMPLE_I105,
        quantity: '2',
        held_quantity: '0',
        primary_reference: 'vault-cert-002',
        status: null,
        is_frozen: true,
        metadata: null,
        parents: [
          {
            rwa: 'parent-002$commodities',
            quantity: '2',
          },
        ],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchRwaById } = await importApiModule(toriiEnv);
    const result = await fetchRwaById('lot-001$commodities');

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.pathname).toBe('/v1/explorer/rwas/lot-001%24commodities');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.id).toBe('lot-001$commodities');
      expect(result.data.metadata).toEqual({});
      expect(result.data.status).toBeNull();
      expect(result.data.is_frozen).toBe(true);
      expect(result.data.parents[0]?.rwa).toBe('parent-002$commodities');
    }
  });
});

describe('Explorer latest/health API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

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
      }),
    }) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ per_page: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/transactions/latest');
    expect(firstCall.searchParams.get('per_page')).toBe('5');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.hash).toBe('0xabc');
    }
  });

  it('fetchLatestTransactions preserves halfwidth authorities from Torii', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sampled_at: '2026-03-05T06:00:02Z',
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
      }),
    }) as any;

    const { fetchLatestTransactions } = await importApiModule(toriiEnv);
    const result = await fetchLatestTransactions({ per_page: 5 });

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
      }),
    }) as any;

    const { fetchLatestInstructions } = await importApiModule(toriiEnv);
    const result = await fetchLatestInstructions({ per_page: 5 });

    const firstCall = (global.fetch as any).mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/latest');
    expect(firstCall.searchParams.get('per_page')).toBe('5');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.kind).toBe('Mint');
    }
  });
});

describe('Sumeragi telemetry API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchSumeragiStatus returns the parsed snapshot', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payloads.sumeragiStatus,
    });
    global.fetch = fetchSpy as any;

    const { fetchSumeragiStatus } = await importApiModule(toriiEnv);
    const result = await fetchSumeragiStatus();

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.toString()).toBe('https://torii.example/v1/sumeragi/status');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toEqual(payloads.sumeragiStatus);
    }
  });

  it('fetchSumeragiTelemetry returns the parsed payload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payloads.sumeragiTelemetry,
    });
    global.fetch = fetchSpy as any;

    const { fetchSumeragiTelemetry } = await importApiModule(toriiEnv);
    const result = await fetchSumeragiTelemetry();

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall).toBeInstanceOf(URL);
    expect(firstCall.toString()).toBe('https://torii.example/v1/sumeragi/telemetry');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toEqual(payloads.sumeragiTelemetry);
    }
  });

  it('streamSumeragiStatus parses SSE payloads', async () => {
    const { streamSumeragiStatus } = await importApiModule({
      ...toriiEnv,
      VITE_SUMERAGI_STATUS_STREAM_ENABLED: 'true',
    });
    const stream = streamSumeragiStatus();

    expect(eventSourceStore.instances).toHaveLength(1);
    const [instance] = eventSourceStore.instances;
    expect((instance.source as { value?: string }).value).toBe('https://torii.example/v1/sumeragi/status/sse');
    instance.data.value = JSON.stringify(payloads.sumeragiStatus);
    await nextTick();
    expect(stream.data.value).toEqual(payloads.sumeragiStatus);
  });

  it('streamSumeragiStatus is disabled by default for nodes without SSE support', async () => {
    const { streamSumeragiStatus } = await importApiModule(toriiEnv);
    const stream = streamSumeragiStatus();

    expect(eventSourceStore.instances).toHaveLength(0);
    expect(stream.status.value).toBe('CLOSED');
    expect(stream.data.value).toBeNull();
  });
});

describe('Telemetry API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchOnlinePeers returns online peer IDs from the Torii root endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['ed0120A@10.0.0.1:1337', 'ed0120B@10.0.0.2:1337'],
    });
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
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
      },
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBe('ed0120A@10.0.0.1:1337');
    }
  });

  it('fetchTelemetryPropagation returns parsed propagation samples', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          block: 101,
          first_seen_at_ms: 1000,
          last_seen_at_ms: 1040,
          spread_ms: 40,
          peers_reported: 3,
        },
      ],
    });
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchNexusDataspacesAccountSummary } = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });
    const result = await fetchNexusDataspacesAccountSummary(SAMPLE_ACCOUNT_ALIAS, { address_format: 'i105' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toBe(
      'https://torii.example/v1/nexus/dataspaces/accounts/treasury%40banking.retail/summary?address_format=i105'
    );
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.dataspaces[0]?.dataspace_alias).toBe('core');
      expect(result.data.totals.consensus_tx_count).toBe(3);
    }
  });

  it('fetchNexusPublicStatus parses root /status payloads', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
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
      }),
    });
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
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
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

describe('Connect API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('fetchConnectStatus requests the Torii connect status endpoint and parses the response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        sessions_total: 4,
        sessions_active: 2,
        per_ip_sessions: [{ ip: '127.0.0.1', sessions: 1 }],
        buffered_sessions: 1,
        total_buffer_bytes: 128,
        dedupe_size: 8,
        policy: {
          ws_max_sessions: 128,
          ws_per_ip_max_sessions: 4,
          ws_rate_per_ip_per_min: 120,
          session_ttl_ms: 300000,
          frame_max_bytes: 64000,
          session_buffer_max_bytes: 262144,
          relay_enabled: true,
          relay_strategy: 'broadcast',
          relay_effective_strategy: 'broadcast',
          relay_p2p_attached: true,
          heartbeat_interval_ms: 30000,
          heartbeat_miss_tolerance: 3,
          heartbeat_min_interval_ms: 5000,
        },
        frames_in_total: 12,
        frames_out_total: 9,
        ciphertext_total: 21,
        dedupe_drops_total: 0,
        buffer_drops_total: 0,
        plaintext_control_drops_total: 0,
        monotonic_drops_total: 0,
        sequence_violation_closes_total: 0,
        role_direction_mismatch_total: 0,
        ping_miss_total: 0,
        p2p_rebroadcasts_total: 2,
        p2p_rebroadcast_skipped_total: 1,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchConnectStatus } = await importApiModule(toriiEnv);
    const result = await fetchConnectStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/v1/connect/status');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data?.enabled).toBe(true);
      expect(result.data?.policy.relay_strategy).toBe('broadcast');
      expect(result.data?.per_ip_sessions[0]?.sessions).toBe(1);
    }
  });

  it('fetchConnectStatus treats a missing endpoint as disabled instead of as a hard error', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });
    global.fetch = fetchSpy as any;

    const { fetchConnectStatus } = await importApiModule(toriiEnv);
    const result = await fetchConnectStatus();

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe('https://torii.example/v1/connect/status');
    expect(result).toEqual({ status: SUCCESSFUL_FETCHING, data: null });
  });

  it('createConnectSession posts the caller-provided sid to the Torii connect session endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          sid: 'session-1',
          wallet_uri: 'iroha://connect?sid=session-1&role=wallet',
          app_uri: 'iroha://connect?sid=session-1&role=app',
          token_app: 'token-app',
          token_wallet: 'token-wallet',
          token_relay: 'token-relay',
        }),
    });
    global.fetch = fetchSpy as any;

    const { createConnectSession } = await importApiModule(toriiEnv);
    const result = await createConnectSession({ sid: 'session-1', node: 'taira.sora.org' });

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).toString()).toBe('https://torii.example/v1/connect/session');
    expect(requestInit).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({
      sid: 'session-1',
      node: 'taira.sora.org',
    });
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.wallet_uri).toContain('role=wallet');
      expect(result.data.token_app).toBe('token-app');
      expect(result.data.token_relay).toBe('token-relay');
    }
  });
});

describe('Ministry agenda submission helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };

  it('draftMinistryAgendaProposal posts the Ministry draft request and parses the signable response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
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
      [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
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
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
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
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('', {
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
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
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
      [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
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
      .mockResolvedValueOnce(
        new Response('', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
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

    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toContain(
      '/v1/pipeline/transactions/status?hash='
    );
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchSorafsCidLookup } = await importApiModule(toriiEnv);
    const result = await fetchSorafsCidLookup(
      'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi'
    );

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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
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
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            service_name: 'web_portal',
            current_version: '2.0.0',
            config_generation: 3,
            config_entry_count: 1,
            configs: [],
          }),
        };
      }

      if (pathname.endsWith('/service/secret/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            service_name: 'web_portal',
            current_version: '2.0.0',
            secret_generation: 1,
            secret_entry_count: 0,
            secrets: [],
          }),
        };
      }

      if (pathname.endsWith('/training/job/status')) {
        return {
          ok: true,
          json: async () => ({
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
          }),
        };
      }

      if (pathname.endsWith('/model/weight/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            model: {
              service_name: 'trainer',
              model_name: 'llm-demo',
              current_version: 'v1',
              version_count: 1,
              versions: [],
            },
          }),
        };
      }

      if (pathname.endsWith('/model/artifact/status')) {
        return {
          ok: true,
          json: async () => ({
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
          }),
        };
      }

      if (pathname.endsWith('/model/upload/status') || pathname.endsWith('/model/compile/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            bundle: { model_id: 'model-1' },
            uploaded_chunk_count: 1,
            chunk_ordinals: [0],
            compile_profile: pathname.endsWith('/model/compile/status') ? { backend: 'cuda' } : null,
            artifact: null,
          }),
        };
      }

      if (pathname.endsWith('/model/run-status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            session: { session_id: 'session-1' },
            checkpoint_count: 0,
            checkpoints: [],
          }),
        };
      }

      if (pathname.endsWith('/hf/status')) {
        return {
          ok: true,
          json: async () => ({
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
          }),
        };
      }

      if (pathname.endsWith('/model-host/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            validator_account_id: null,
            active_host_count: 1,
            hosts: [],
          }),
        };
      }

      if (pathname.endsWith('/agent/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            apartment_count: 1,
            event_count: 2,
            apartments: [],
          }),
        };
      }

      if (pathname.endsWith('/agent/mailbox/status')) {
        return {
          ok: true,
          json: async () => ({
            schema_version: 1,
            apartment_name: 'tenant-a',
            status: 'Running',
            pending_message_count: 0,
            event_count: 0,
            messages: [],
          }),
        };
      }

      if (pathname.endsWith('/agent/autonomy/status')) {
        return {
          ok: true,
          json: async () => ({
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
          }),
        };
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schema_version: 1,
        validator_account_id: null,
        active_host_count: 0,
        hosts: [],
      }),
    });
    global.fetch = fetchSpy as any;

    const module = await importApiModule({
      VITE_API_URL: 'https://torii.example/v1/explorer',
    });

    const hostResult = await module.fetchSoracloudModelHostStatus();
    expect(hostResult.status).toBe(SUCCESSFUL_FETCHING);
    expect((fetchSpy.mock.calls[0]?.[0] as URL).toString()).toBe(
      'https://torii.example/v1/soracloud/model-host/status'
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schema_version: 1,
        apartment_count: 0,
        event_count: 0,
        apartments: [],
      }),
    });
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 0, total_items: 0 },
        items: [],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructions } = await importApiModule(toriiEnv);
    await fetchInstructions({
      page: 1,
      per_page: 10,
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
    expect(firstCall.searchParams.get('transaction_status')).toBe('Committed');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
  });

  it('fetchInstructions parses payloads using the box field name', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 1 },
        items: [
          {
            authority: SAMPLE_I105,
            created_at: '2026-02-11T12:00:00.000Z',
            kind: 'Log',
            box: {
              encoded: '0x01',
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructions } = await importApiModule(toriiEnv);
    const result = await fetchInstructions({ page: 1, per_page: 10, transaction_hash: '0xabc' });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/instructions');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(SUCCESSFUL_FETCHING);
    if (result.status === SUCCESSFUL_FETCHING) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].box.encoded).toBe('0x01');
      expect(result.data.items[0].box.json.kind).toBe('Log');
    }
  });
});

describe('Transaction API helpers', () => {
  const toriiEnv = { VITE_API_URL: 'https://torii.example/v1/explorer' };
  const sampleAuthority = SAMPLE_I105_ALT;
  const sampleAssetId = SAMPLE_ASSET_ID;

  it('fetchTransactions forwards asset filters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pagination: { page: 1, per_page: 10, total_pages: 0, total_items: 0 },
        items: [],
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchTransactions } = await importApiModule(toriiEnv);
    await fetchTransactions({
      page: 1,
      per_page: 10,
      authority: sampleAuthority,
      status: 'Committed',
      asset_id: sampleAssetId,
    });

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.toString()).toContain('/v1/explorer/transactions?');
    expect(firstCall.searchParams.get('asset_id')).toBe(sampleAssetId);
    expect(firstCall.searchParams.get('authority')).toBe(sampleAuthority);
    expect(firstCall.searchParams.get('status')).toBe('Committed');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
  });

  it('fetchTransaction requests i105 address formatting', async () => {
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/instructions')) {
        return {
          ok: true,
          json: async () => ({
            pagination: { page: 1, per_page: 10, total_pages: 1, total_items: 0 },
            items: [],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          authority: sampleAuthority,
          hash: '0xdeadbeef',
          block: 42,
          created_at: '2026-03-10T12:00:00Z',
          executable: 'Instructions',
          status: 'Committed',
          rejection_reason: null,
          metadata: {},
          nonce: null,
          signature: '0xsig',
          time_to_live: null,
        }),
      };
    });
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    await fetchTransaction('0xdeadbeef');

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/transactions/0xdeadbeef');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
  });

  it('fetchInstructionDetail requests i105 address formatting', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authority: sampleAuthority,
        created_at: '2026-03-10T12:00:00Z',
        kind: 'Log',
        box: {
          encoded: '',
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructionDetail } = await importApiModule(toriiEnv);
    await fetchInstructionDetail('0xdeadbeef', 0);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/0xdeadbeef/0');
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
  });

  it('fetchInstructionContractView keeps the request on the explorer API without address-format params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchInstructionContractView } = await importApiModule(toriiEnv);
    await fetchInstructionContractView('0xdeadbeef', 1);

    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.pathname).toBe('/v1/explorer/instructions/0xdeadbeef/1/contract-view');
    expect(firstCall.searchParams.get('address_format')).toBeNull();
  });

  it('submitVerifiedContractSource sends JSON to the Torii contracts endpoint and parses mismatch responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
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

  it('submitContractDeployRequest posts direct deploy payloads to Torii and parses the response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        contract_address: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
        dataspace: 'party',
        deploy_nonce: 9,
        tx_hash_hex: 'aa'.repeat(32),
        code_hash_hex: 'bb'.repeat(32),
        abi_hash_hex: 'cc'.repeat(32),
      })
    );
    global.fetch = fetchSpy as any;

    const { submitContractDeployRequest } = await importApiModule(toriiEnv);
    const result = await submitContractDeployRequest({
      authority: SAMPLE_I105,
      private_key: 'ed25519:priv',
      code_b64: 'YmluYXJ5',
      dataspace: 'party',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.contract_address).toBe('tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7');
      expect(result.data.deploy_nonce).toBe(9);
    }

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect((requestUrl as URL).pathname).toBe('/v1/contracts/deploy');
    expect((requestInit as RequestInit)?.method).toBe('POST');
    expect(JSON.parse(String((requestInit as RequestInit)?.body))).toEqual({
      authority: SAMPLE_I105,
      private_key: 'ed25519:priv',
      code_b64: 'YmluYXJ5',
      dataspace: 'party',
    });
  });

  it('fetchTransaction does not retry alternate address formats on format rejections', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('address_format `i105` must be `ih58` or `compressed`', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })
    );
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    const result = await fetchTransaction('0xdeadbeef');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(firstCall.searchParams.get('address_format')).toBe('i105');
    expect(result.status).toBe(UNKNOWN_ERROR);
  });

  it('ignores stale compressed preference storage and still requests i105 formatting', async () => {
    const storage = window.localStorage as any;
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem('torii_address_format_preference_v2', JSON.stringify({ 'https://torii.example': 'compressed' }));
    }
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authority: sampleAuthority,
        hash: '0xdeadbeef',
        block: 42,
        created_at: '2026-03-10T12:00:00Z',
        executable: 'Instructions',
        status: 'Committed',
        rejection_reason: null,
        metadata: {},
        nonce: null,
        signature: '0xsig',
        time_to_live: null,
      }),
    });
    global.fetch = fetchSpy as any;

    const { fetchTransaction } = await importApiModule(toriiEnv);
    await fetchTransaction('0xreloaded');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const transactionCall = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(transactionCall.searchParams.get('address_format')).toBe('i105');
  });

  it('fetchTransaction does not retry with alternate formats for unrelated 400 responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('invalid hash', {
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

  it('fetchTransaction does not retry with alternate formats when the response is not a format rejection', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('missing', {
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
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('soranet_vpn_sessions_total 4\n', {
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
      [TORII_API_VERSION_HEADER]: TORII_API_VERSION,
    });
    expect(result).toEqual({
      status: SUCCESSFUL_FETCHING,
      data: 'soranet_vpn_sessions_total 4\n',
    });
  });

  it('fetchToriiMetricsText transforms non-OK raw metrics responses into an error result', async () => {
    runtimeConfigState.value = { toriiRequestRetryCount: 0, toriiRequestRetryBaseDelayMs: 0 };

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('node unavailable', {
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

    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'));
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 3 }),
      });
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
