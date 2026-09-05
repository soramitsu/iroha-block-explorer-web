import { computed, reactive, ref, shallowRef } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import {
  apiProblemFromError,
  resourceResultProblem,
  resourceResultStatus,
  type ApiProblem,
  type ResourceSnapshot,
} from '@/shared/utils/resource-state';

export function setupAsyncData<K>(
  fn: () => Promise<K>,
  options?: {
    interval?: number
    immediate?: boolean
    onError?: (err: unknown) => void
    pollWhen?: () => boolean
  }
) {
  const shouldRunImmediately = options?.immediate ?? true;
  const data = shallowRef<K>();
  const pending = ref(false);
  const snapshot = shallowRef<ResourceSnapshot<K>>({ status: 'idle' });
  let requestGeneration = 0;

  async function run(): Promise<K | undefined> {
    const generation = ++requestGeneration;
    pending.value = true;
    snapshot.value = data.value === undefined
      ? { status: 'initial-loading' }
      : { status: 'ready', data: data.value, isRefreshing: true, refreshError: null };

    try {
      const value = await fn();
      if (generation !== requestGeneration) return value;

      const resultStatus = resourceResultStatus(value);
      if (resultStatus === 'not-found') {
        data.value = undefined;
        snapshot.value = { status: 'not-found' };
        return value;
      }
      if (resultStatus === 'error') {
        const problem = resourceResultProblem(value);
        if (data.value === undefined) snapshot.value = { status: 'error', problem };
        else snapshot.value = { status: 'ready', data: data.value, isRefreshing: false, refreshError: problem };
        options?.onError?.(problem);
        return value;
      }

      data.value = value;
      snapshot.value = { status: 'ready', data: value, isRefreshing: false, refreshError: null };
      return value;
    } catch (error) {
      if (generation !== requestGeneration) return undefined;
      const problem = apiProblemFromError(error);
      if (data.value === undefined) snapshot.value = { status: 'error', problem };
      else snapshot.value = { status: 'ready', data: data.value, isRefreshing: false, refreshError: problem };
      options?.onError?.(problem);
      return undefined;
    } finally {
      if (generation === requestGeneration) pending.value = false;
    }
  }

  const pollInterval = options?.interval;
  const shouldPoll = Boolean(pollInterval && Number.isFinite(pollInterval) && pollInterval > 0);
  if (shouldPoll) {
    useIntervalFn(
      () => {
        if (pending.value) return;
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

  return reactive({
    isLoading: computed(() => pending.value),
    data: computed<K | undefined>(() => data.value),
    snapshot: computed<ResourceSnapshot<K>>(() => snapshot.value),
    error: computed<ApiProblem | null>(() => {
      const current = snapshot.value;
      if (current.status === 'error') return current.problem;
      if (current.status === 'ready') return current.refreshError;
      return null;
    }),
    notFound: computed(() => snapshot.value.status === 'not-found'),
    refetch: run,
  });
}
