import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ref, reactive, computed, nextTick } from 'vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const hoisted = vi.hoisted(() => ({
  sampleStatus: {
    leader_index: 3,
    view_change_index: 1,
    highest_qc: { height: 100, view: 5, subject_block_hash: '0xabc' },
    locked_qc: { height: 99, view: 4, subject_block_hash: null },
    tx_queue: { depth: 2, capacity: 10, saturated: false },
    epoch: { length_blocks: 0, commit_deadline_offset: 0, reveal_deadline_offset: 0 },
    membership: { height: 100, view: 5, epoch: 0, view_hash: '0xdef' },
    prf: { height: 100, view: 5, epoch_seed: 'feed' },
    gossip_fallback_total: 0,
    bg_post_inline_post_total: 0,
    bg_post_inline_broadcast_total: 0,
    block_created_dropped_by_lock_total: 0,
    block_created_hint_mismatch_total: 0,
    block_created_proposal_mismatch_total: 0,
    settlement: {
      dvp: {
        success_total: 0,
        failure_total: 0,
        final_state_totals: {},
        failure_reasons: {},
        last_event: null,
      },
      pvp: {
        success_total: 0,
        failure_total: 0,
        final_state_totals: {},
        failure_reasons: {},
        last_event: null,
      },
    },
    pacemaker_backpressure_deferrals_total: 0,
    rbc_retry_attempts_total: 0,
    rbc_retry_abort_total: 0,
    rbc_store: {
      sessions: 0,
      bytes: 0,
      pressure_level: 0,
      backpressure_deferrals_total: 0,
      evictions_total: 0,
      recent_evictions: [],
    },
    da_reschedule_total: 0,
    view_change_proof_accepted_total: 0,
    view_change_proof_stale_total: 0,
    view_change_proof_rejected_total: 0,
    view_change_suggest_total: 0,
    view_change_install_total: 0,
    collectors_targeted_current: 3,
    collectors_targeted_last_per_block: 4,
    redundant_sends_total: 1,
    vrf_penalty_epoch: 1,
    vrf_committed_no_reveal_total: 0,
    vrf_no_participation_total: 0,
    vrf_late_reveals_total: 0,
    consensus_penalties_applied_total: 0,
    consensus_penalties_pending: 0,
    vrf_penalties_applied_total: 0,
    vrf_penalties_pending: 0,
    lane_governance_sealed_total: 0,
    lane_governance_sealed_aliases: [],
    lane_governance: [
      {
        lane_id: 1,
        alias: 'alpha',
        governance: null,
        manifest_required: false,
        manifest_ready: true,
        manifest_path: null,
        validator_ids: [],
        quorum: null,
        protected_namespaces: [],
        runtime_upgrade: null,
        privacy_commitments: [],
      },
    ],
    nexus_fee: {
      charged_total: 0,
      charged_via_payer_total: 0,
      charged_via_sponsor_total: 0,
      sponsor_disabled_total: 0,
      sponsor_cap_exceeded_total: 0,
      config_errors_total: 0,
      transfer_failures_total: 0,
      last_amount: null,
      last_asset_id: null,
      last_payer: null,
      last_payer_id: null,
      last_error: null,
    },
    nexus_staking: { lanes: [] },
    npos_election: null,
  },
  streamPayload: {
    leader_index: 4,
    view_change_index: 2,
    highest_qc: { height: 101, view: 6, subject_block_hash: '0xbeef' },
    locked_qc: { height: 100, view: 5, subject_block_hash: '0xabc' },
    tx_queue: { depth: 5, capacity: 10, saturated: true },
    epoch: { length_blocks: 0, commit_deadline_offset: 0, reveal_deadline_offset: 0 },
    membership: { height: 101, view: 6, epoch: 0, view_hash: '0xbeef' },
    prf: { height: 101, view: 6, epoch_seed: 'dead' },
    gossip_fallback_total: 1,
    bg_post_inline_post_total: 1,
    bg_post_inline_broadcast_total: 2,
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
          observed_at_ms: 181000,
          settlement_id: 'dvp-1',
          plan: { order: 'process_delivery_first', atomicity: 'commit_first_leg' },
          outcome: 'Success',
          failure_reason: null,
          final_state: 'delivery_and_payment',
          legs: { delivery_committed: true, payment_committed: true },
        },
      },
      pvp: {
        success_total: 0,
        failure_total: 1,
        final_state_totals: { none: 1 },
        failure_reasons: { timeout: 1 },
        last_event: {
          observed_at_ms: 191000,
          settlement_id: 'pvp-2',
          plan: { order: 'process_payment_first', atomicity: 'commit_second_leg' },
          outcome: 'Failure',
          failure_reason: 'timeout',
          final_state: 'none',
          legs: { primary_committed: false, counter_committed: false },
          fx_window_ms: null,
        },
      },
    },
    pacemaker_backpressure_deferrals_total: 1,
    rbc_retry_attempts_total: 0,
    rbc_retry_abort_total: 0,
    rbc_store: {
      sessions: 1,
      bytes: 256,
      pressure_level: 2,
      backpressure_deferrals_total: 0,
      evictions_total: 0,
      recent_evictions: [{ block_hash: '0xcafe', height: 100, view: 5 }],
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
    vrf_penalty_epoch: 2,
    vrf_committed_no_reveal_total: 1,
    vrf_no_participation_total: 0,
    vrf_late_reveals_total: 0,
    consensus_penalties_applied_total: 1,
    consensus_penalties_pending: 0,
    vrf_penalties_applied_total: 2,
    vrf_penalties_pending: 0,
    lane_governance_sealed_total: 1,
    lane_governance_sealed_aliases: ['lane-x'],
    lane_governance: [
      {
        lane_id: 2,
        alias: 'beta',
        governance: 'voting',
        manifest_required: true,
        manifest_ready: false,
        manifest_path: '/tmp/beta',
        validator_ids: ['val-2'],
        quorum: 5,
        protected_namespaces: ['ns2'],
        runtime_upgrade: {
          allow: true,
          require_metadata: true,
          metadata_key: 'upgrade',
          allowed_ids: ['op-1'],
        },
        privacy_commitments: [],
      },
    ],
    nexus_fee: {
      charged_total: 2,
      charged_via_payer_total: 1,
      charged_via_sponsor_total: 1,
      sponsor_disabled_total: 0,
      sponsor_cap_exceeded_total: 0,
      config_errors_total: 0,
      transfer_failures_total: 0,
      last_amount: '11',
      last_asset_id: 'xor#sora',
      last_payer: 'sponsor',
      last_payer_id: 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB',
      last_error: null,
    },
    nexus_staking: { lanes: [{ lane_id: 1, bonded: '5', pending_unbond: '1', slash_total: 0 }] },
    npos_election: null,
  },
  apiMocks: {
    fetchStatus: null as ReturnType<typeof vi.fn> | null,
  },
}));

const streamState = {
  data: ref(null as any),
  status: ref('CONNECTING'),
};

vi.mock('@/shared/api', () => {
  hoisted.apiMocks.fetchStatus = vi.fn().mockResolvedValue({
    status: SUCCESSFUL_FETCHING,
    data: hoisted.sampleStatus,
  });
  return {
    fetchSumeragiStatus: hoisted.apiMocks.fetchStatus,
    streamSumeragiStatus: vi.fn(() => streamState),
  };
});

vi.mock('@/shared/utils/setup-async-data', () => {
  return {
    setupAsyncData: <T,>(fn: () => Promise<T>) => {
      const raw = ref<T>();
      const isLoading = ref(true);
      const run = async () => {
        const result = await fn();
        raw.value = result;
        isLoading.value = false;
      };
      run();
      return reactive({
        data: computed(() => raw.value),
        isLoading,
        refetch: () => {
          isLoading.value = true;
          run();
        },
      });
    },
  };
});

import { useSumeragiStatus, __resetSumeragiStatusForTests } from './useSumeragiStatus';

describe('useSumeragiStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetSumeragiStatusForTests();
    streamState.data.value = null;
    streamState.status.value = 'CONNECTING';
    hoisted.apiMocks.fetchStatus?.mockClear().mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: hoisted.sampleStatus,
    });
  });

  afterEach(() => {
    __resetSumeragiStatusForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('hydrates the snapshot from the initial HTTP response', async () => {
    const { status, isLoading, lastUpdatedAtMs } = useSumeragiStatus();
    await flushAll();
    expect(status.value).toEqual(hoisted.sampleStatus);
    expect(lastUpdatedAtMs.value).not.toBeNull();
    expect(isLoading.value).toBe(false);
  });

  it('updates the snapshot when the SSE stream emits a payload', async () => {
    const { status } = useSumeragiStatus();
    await flushAll();
    streamState.data.value = hoisted.streamPayload;
    await nextTick();
    expect(status.value).toEqual(hoisted.streamPayload);
  });

  it('polls the snapshot endpoint while the SSE stream is closed', async () => {
    streamState.status.value = 'CLOSED';
    useSumeragiStatus();
    await flushAll();
    hoisted.apiMocks.fetchStatus?.mockClear();

    vi.advanceTimersByTime(10_000);
    await flushAll();

    expect(hoisted.apiMocks.fetchStatus).toHaveBeenCalled();
  });

  it('does not poll the snapshot endpoint while the SSE stream is open', async () => {
    streamState.status.value = 'OPEN';
    useSumeragiStatus();
    await flushAll();
    hoisted.apiMocks.fetchStatus?.mockClear();

    vi.advanceTimersByTime(10_000);
    await flushAll();

    expect(hoisted.apiMocks.fetchStatus).not.toHaveBeenCalled();
  });
});

async function flushAll() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
