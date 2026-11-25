import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
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
  // Polling starts one interval after setup, whether or not `immediate` runs.
  let lastRunAt = Date.now();

  async function run(): Promise<K | undefined> {
    const generation = ++requestGeneration;
    lastRunAt = Date.now();
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
  if (pollInterval !== undefined && Number.isFinite(pollInterval) && pollInterval > 0) {
    // Nobody sees a hidden page, so it sends Torii no polls. When the page is
    // shown again it refreshes at once if a poll came due meanwhile.
    const visibility = useDocumentVisibility();
    const poll = () => {
      if (pending.value) return;
      if (options?.pollWhen && !options.pollWhen()) return;
      run();
    };
    const poller = useIntervalFn(
      poll,
      pollInterval,
      // Never fire the callback immediately: the initial fetch is controlled
      // exclusively by `immediate`.
      { immediate: visibility.value !== 'hidden', immediateCallback: false }
    );
    watch(visibility, (state) => {
      if (state === 'hidden') {
        poller.pause();
        return;
      }
      if (Date.now() - lastRunAt >= pollInterval) poll();
      poller.resume();
    });
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
