import { computed, reactive } from 'vue';
import { useErrorHandlers } from '@/shared/ui/composables/useErrorHandlers';
import { useErrorRetry, useStaleState, useTask, wheneverFulfilled, wheneverRejected } from '@vue-kakuyaku/core';
import { useIntervalFn } from '@vueuse/core';

function errorDedupeKey(err: unknown): string {
  if (err instanceof Error) return `${err.name}:${err.message}`;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

export function setupAsyncData<K>(
  fn: () => Promise<K>,
  options?: {
    interval?: number
    immediate?: boolean
    onError?: (err: unknown) => void
    pollWhen?: () => boolean
  }
) {
  const { handleUnknownError } = useErrorHandlers();

  // Ensure all watchers are attached before the first run, so we don't miss
  // the initial pending/rejected transition and can keep stale data rendered.
  const shouldRunImmediately = options?.immediate ?? true;
  const { state, run } = useTask(() => fn(), { immediate: false });
  const staleState = useStaleState(state);

  const pollInterval = options?.interval;
  const shouldPoll = Boolean(pollInterval && Number.isFinite(pollInterval) && pollInterval > 0);
  // When polling is enabled, the next tick will retry after failures too, so a separate
  // error-retry loop would just duplicate requests.
  if (!shouldPoll) {
    useErrorRetry(state, run, { interval: 5000 });
  }

  // Keep toast notifications from spamming on recurring polling/retry failures.
  // We reset this marker on the next successful fulfilment.
  let lastNotifiedErrorKey: string | null = null;
  wheneverFulfilled(state, () => {
    lastNotifiedErrorKey = null;
  });

  wheneverRejected(state, (err) => {
    if (options?.onError) options.onError(err);
    else {
      const key = errorDedupeKey(err);
      if (lastNotifiedErrorKey === key) return;
      lastNotifiedErrorKey = key;
      handleUnknownError(err);
    }
  });

  if (shouldPoll) {
    useIntervalFn(
      () => {
        if (state.pending) return;
        if (options?.pollWhen && !options.pollWhen()) return;
        run();
      },
      pollInterval,
      // Keep polling active from startup, but never fire the callback immediately.
      // The initial fetch is controlled exclusively by `immediate`.
      { immediate: true, immediateCallback: false }
    );
  }

  if (shouldRunImmediately) run();

  const refetch = () => run();

  return reactive({
    isLoading: computed(() => state.pending),
    data: computed<K | undefined>(() => staleState.fulfilled?.value),
    refetch,
  });
}
