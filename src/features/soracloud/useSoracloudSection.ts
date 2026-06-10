import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { soracloudResultErrorMessage } from '@/shared/lib/soracloud';
import type { SoracloudSectionState } from './types';

export const SORACLOUD_POLL_INTERVAL_MS = 30_000;

export type SoracloudFetchResult<T> = { status: typeof SUCCESSFUL_FETCHING, data: T } | ErrorResponse;

export function createSoracloudSection<Query, Data>(options: {
  initialQuery: Query | null
  immediate?: boolean
  isReady: (query: Query | null) => boolean
  load: (query: Query) => Promise<SoracloudFetchResult<Data>>
  errorKey?: string
  notFoundKey?: string
}): SoracloudSectionState<Query, Data> {
  const { t } = useI18n();
  const toriiBaseUrl = computed(() => http.getToriiBaseUrl());
  const activeQuery = ref<Query | null>(options.initialQuery);
  const error = ref<string | null>(null);

  const request = setupAsyncData(async () => {
    const query = activeQuery.value;
    if (!query || !options.isReady(query)) {
      throw new Error(t('soracloud.queryIdle'));
    }

    const result = await options.load(query);
    if (result.status === SUCCESSFUL_FETCHING) {
      error.value = null;
      return result.data;
    }

    const message = soracloudResultErrorMessage(
      result,
      t(options.errorKey ?? 'soracloud.sectionLoadFailed'),
      options.notFoundKey ? t(options.notFoundKey) : undefined
    );
    error.value = message;
    throw new Error(message);
  }, {
    interval: SORACLOUD_POLL_INTERVAL_MS,
    immediate: options.immediate,
    pollWhen: () => options.isReady(activeQuery.value),
    onError: () => undefined,
  });

  const ready = computed(() => options.isReady(activeQuery.value));
  const queryKey = computed(() => JSON.stringify(activeQuery.value ?? null));

  watch(ready, (nextReady, previousReady) => {
    if (!nextReady) {
      error.value = null;
      return;
    }

    if (!previousReady && !options.immediate) {
      request.refetch();
    }
  });

  watch([toriiBaseUrl, queryKey], ([nextBase, nextKey], [previousBase, previousKey]) => {
    if (!ready.value) return;
    if (nextBase === previousBase && nextKey === previousKey) return;
    request.refetch();
  });

  function apply(query: Query) {
    error.value = null;
    if (!options.isReady(query)) return false;

    const nextKey = JSON.stringify(query);
    if (nextKey === queryKey.value && ready.value) {
      request.refetch();
    } else {
      activeQuery.value = query;
    }

    return true;
  }

  return reactive({
    activeQuery,
    error,
    ready,
    isLoading: computed(() => request.isLoading),
    data: computed(() => request.data as Data | undefined),
    refetch: request.refetch,
    apply,
  }) as SoracloudSectionState<Query, Data>;
}
