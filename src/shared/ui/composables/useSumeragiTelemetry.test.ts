import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ref, reactive, computed, nextTick } from 'vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const hoisted = vi.hoisted(() => ({
  sampleTelemetry: {
    availability: {
      total_votes_ingested: 10,
      collectors: [
        { collector_idx: 0, peer_id: 'ed0120', votes_ingested: 6 },
        { collector_idx: 1, peer_id: 'ed0456', votes_ingested: 4 },
      ],
    },
    qc_latency_ms: [
      { kind: 'availability', last_ms: 120 },
    ],
    rbc_backlog: { pending_sessions: 2, total_missing_chunks: 5, max_missing_chunks: 3 },
    vrf: {
      found: true,
      epoch: 12,
      finalized: true,
      seed_hex: 'cafebabe',
      epoch_length: 3600,
      commit_deadline_offset: 120,
      reveal_deadline_offset: 160,
      roster_len: 7,
      updated_at_height: 900,
      participants_total: 7,
      commitments_total: 7,
      reveals_total: 7,
      late_reveals_total: 0,
      committed_no_reveal: [],
      no_participation: [],
      late_reveals: [],
    },
  },
  refreshedTelemetry: {
    availability: {
      total_votes_ingested: 11,
      collectors: [{ collector_idx: 0, peer_id: 'ed0999', votes_ingested: 11 }],
    },
    qc_latency_ms: [{ kind: 'availability', last_ms: 90 }],
    rbc_backlog: { pending_sessions: 1, total_missing_chunks: 1, max_missing_chunks: 1 },
    vrf: {
      found: false,
      epoch: 13,
      finalized: false,
      seed_hex: null,
      epoch_length: 0,
      commit_deadline_offset: 0,
      reveal_deadline_offset: 0,
      roster_len: 0,
      updated_at_height: 0,
      participants_total: 0,
      commitments_total: 0,
      reveals_total: 0,
      late_reveals_total: 0,
      committed_no_reveal: [],
      no_participation: [],
      late_reveals: [],
    },
  },
  refetchSpy: vi.fn(),
}));

const fetchStore = vi.hoisted(() => ({
  mock: vi.fn(),
}));

vi.mock('@/shared/api', () => {
  return {
    fetchSumeragiTelemetry: fetchStore.mock,
  };
});

vi.mock('@/shared/utils/setup-async-data', () => {
  return {
    setupAsyncData: (fn: () => Promise<any>) => {
      const isLoading = ref(true);
      const raw = ref();
      const data = computed(() => raw.value);
      const run = () =>
        fn().then((result) => {
          raw.value = result;
          isLoading.value = false;
        });
      const refetch = () => {
        hoisted.refetchSpy();
        return run();
      };
      refetch();
      return reactive({ isLoading, data, refetch });
    },
  };
});

import { useSumeragiTelemetry, __resetSumeragiTelemetryForTests } from './useSumeragiTelemetry';

describe('useSumeragiTelemetry', () => {
beforeEach(() => {
  __resetSumeragiTelemetryForTests();
  hoisted.refetchSpy.mockClear();
  fetchStore.mock.mockReset();
  fetchStore.mock
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: hoisted.sampleTelemetry })
      .mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: hoisted.refreshedTelemetry });
});

  it('hydrates telemetry from the HTTP response', async () => {
    const { telemetry, isLoading } = useSumeragiTelemetry();
    await flushAsync();
    expect(telemetry.value).toEqual(hoisted.sampleTelemetry);
    expect(isLoading.value).toBe(false);
  });

  it('refresh invokes the underlying refetch handler', async () => {
    const { telemetry, refresh } = useSumeragiTelemetry();
    await flushAsync();
    await refresh();
    await flushAsync();
    expect(hoisted.refetchSpy).toHaveBeenCalled();
    expect(telemetry.value).toEqual(hoisted.refreshedTelemetry);
  });
});

async function flushAsync() {
  await Promise.resolve();
  await nextTick();
}
