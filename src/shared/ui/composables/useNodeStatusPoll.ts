import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useDocumentVisibility } from '@vueuse/core';
import { fetchNodeStatus } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { NodeStatusSnapshot } from '@/shared/api/schemas';

export const NODE_STATUS_POLL_MS = 10_000;

/**
 * Poll the reporting peer's `/status` while the page is visible. Each sample
 * records the local time it arrived so ages never compare two clocks.
 */
export function useNodeStatusPoll(intervalMs = NODE_STATUS_POLL_MS, fetchStatus = fetchNodeStatus) {
  const status = shallowRef<NodeStatusSnapshot | null>(null);
  const receivedAtMs = ref<number | null>(null);
  const error = ref<Error | null>(null);
  const visibility = useDocumentVisibility();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  let inFlight = false;

  async function poll() {
    if (inFlight || !active) return;
    inFlight = true;
    try {
      const result = await fetchStatus();
      if (!active) return;
      if (result.status === SUCCESSFUL_FETCHING) {
        status.value = result.data;
        receivedAtMs.value = Date.now();
        error.value = null;
      } else {
        error.value = 'error' in result ? result.error : new Error('Node status is unavailable');
      }
    } catch (failure) {
      if (active) error.value = failure instanceof Error ? failure : new Error(String(failure));
    } finally {
      inFlight = false;
      schedule();
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (active && visibility.value !== 'hidden') timer = setTimeout(poll, intervalMs);
  }

  watch(
    visibility,
    (state) => {
      if (state === 'hidden') {
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        poll();
      }
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    active = false;
    if (timer) clearTimeout(timer);
  });

  return {
    status,
    receivedAtMs,
    error,
    isLoading: computed(() => status.value === null && error.value === null),
    refresh: poll,
  };
}
