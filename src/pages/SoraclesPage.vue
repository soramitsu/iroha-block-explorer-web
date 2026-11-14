<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { DefiOracleAttestationLatestParamsSchema, type DefiOracleAttestationLatestParams } from '@/shared/api/schemas';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';

defineOptions({ name: 'SoraclesPage' });

const fieldLabels = {
  feedId: 'feed_id',
  domain: 'domain',
  subjectId: 'subject_id',
  status: 'status',
} as const;
const domainOptions = [
  { value: 1, label: '1 · perps_market' },
  { value: 2, label: '2 · options_series' },
  { value: 3, label: '3 · options_shout' },
  { value: 4, label: '4 · cover_policy' },
] as const;

const feedsResource = setupAsyncData(() => http.fetchSoracleFeeds());
const feeds = computed(() => (feedsResource.data?.status === SUCCESSFUL_FETCHING ? feedsResource.data.data : []));
const selectedFeedId = ref('');
const selectedFeed = computed(() => feeds.value.find((feed) => feed.feed_id[0] === selectedFeedId.value) ?? null);

watch(
  feeds,
  (currentFeeds) => {
    if (currentFeeds.some((feed) => feed.feed_id[0] === selectedFeedId.value)) return;
    selectedFeedId.value = currentFeeds[0]?.feed_id[0] ?? '';
  },
  { immediate: true }
);

const historyScope = useParamScope(
  () => {
    if (!selectedFeedId.value) return null;
    return { key: selectedFeedId.value, payload: selectedFeedId.value };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSoracleFeedHistory(payload))
);
const historyResource = computed(() => historyScope.value?.expose ?? null);
const history = computed(() =>
  historyResource.value?.data?.status === SUCCESSFUL_FETCHING ? historyResource.value.data.data : []
);

const draft = reactive({
  domain: 1 as 1 | 2 | 3 | 4,
  subjectId: '',
  status: '',
});
const showDraftError = ref(false);
const parsedDraft = computed<DefiOracleAttestationLatestParams | null>(() => {
  if (!/^(?:0|[1-9]\d*)$/u.test(draft.subjectId)) return null;

  let status: number | undefined;
  if (draft.status !== '') {
    if (!/^(?:0|[1-9]\d*)$/u.test(draft.status)) return null;
    status = Number(draft.status);
    if (!Number.isSafeInteger(status)) return null;
  }

  const parsed = DefiOracleAttestationLatestParamsSchema.safeParse({
    domain: draft.domain,
    subject_id: draft.subjectId,
    status,
  });
  return parsed.success ? parsed.data : null;
});
const appliedAttestationQuery = ref<DefiOracleAttestationLatestParams | null>(null);
const attestationScope = useParamScope(
  () => {
    if (!appliedAttestationQuery.value) return null;
    return {
      key: JSON.stringify(appliedAttestationQuery.value),
      payload: appliedAttestationQuery.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchLatestDefiOracleAttestation(payload))
);
const attestationResource = computed(() => attestationScope.value?.expose ?? null);
const attestation = computed(() =>
  attestationResource.value?.data?.status === SUCCESSFUL_FETCHING ? attestationResource.value.data.data : null
);

function queryLatestAttestation() {
  showDraftError.value = parsedDraft.value === null;
  if (!parsedDraft.value) {
    appliedAttestationQuery.value = null;
    return;
  }
  const nextKey = JSON.stringify(parsedDraft.value);
  const currentKey = appliedAttestationQuery.value ? JSON.stringify(appliedAttestationQuery.value) : null;
  if (nextKey === currentKey) {
    attestationResource.value?.refetch();
    return;
  }
  appliedAttestationQuery.value = parsedDraft.value;
}
</script>

<template>
  <div class="soracles-page">
    <BaseContentBlock :title="$t('soracles.title')">
      <BaseResourceState
        :snapshot="feedsResource.snapshot"
        :error-label="$t('soracles.loadError')"
        @retry="feedsResource.refetch()"
      >
        <div class="soracles-page__content" data-test="soracles-feeds">
          <p class="row-text">
            {{ $t('soracles.description') }}
          </p>
          <h3>{{ $t('soracles.feeds') }}</h3>
          <template v-if="feeds.length > 0">
            <label class="soracles-page__field">
              <span class="label"
                ><code>{{ fieldLabels.feedId }}</code></span
              >
              <select v-model="selectedFeedId" :aria-label="$t('soracles.selectFeed')" data-test="soracle-feed-select">
                <option v-for="feed in feeds" :key="feed.feed_id[0]" :value="feed.feed_id[0]">
                  {{ feed.feed_id[0] }}
                </option>
              </select>
            </label>
            <BaseJson v-if="selectedFeed" :value="selectedFeed" full />
          </template>
          <p v-else class="row-text">
            {{ $t('noData') }}
          </p>
        </div>
      </BaseResourceState>
    </BaseContentBlock>

    <BaseContentBlock v-if="selectedFeedId && historyResource" :title="$t('soracles.history')">
      <BaseResourceState
        :snapshot="historyResource.snapshot"
        :error-label="$t('soracles.historyError')"
        @retry="historyResource.refetch()"
      >
        <BaseJson v-if="history.length > 0" :value="history" full data-test="soracle-history" />
        <p v-else class="row-text">
          {{ $t('noData') }}
        </p>
      </BaseResourceState>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('soracles.attestation')">
      <form class="soracles-page__query" data-test="soracle-attestation-form" @submit.prevent="queryLatestAttestation">
        <label class="soracles-page__field">
          <span class="label"
            ><code>{{ fieldLabels.domain }}</code></span
          >
          <select v-model="draft.domain" data-test="soracle-domain">
            <option v-for="option in domainOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="soracles-page__field">
          <span class="label"
            ><code>{{ fieldLabels.subjectId }}</code></span
          >
          <input v-model="draft.subjectId" inputmode="numeric" autocomplete="off" data-test="soracle-subject-id" />
        </label>
        <label class="soracles-page__field">
          <span class="label"
            ><code>{{ fieldLabels.status }}</code></span
          >
          <input v-model="draft.status" inputmode="numeric" autocomplete="off" data-test="soracle-status" />
        </label>
        <BaseButton native-type="submit" bordered data-test="soracle-query">
          {{ $t('search') }}
        </BaseButton>
      </form>
      <p v-if="showDraftError" class="soracles-page__error row-text" role="alert">
        {{ $t('searchUnsupported') }}
      </p>

      <BaseResourceState
        v-if="appliedAttestationQuery && attestationResource"
        :snapshot="attestationResource.snapshot"
        :error-label="$t('soracles.attestationError')"
        @retry="attestationResource.refetch()"
      >
        <BaseJson v-if="attestation" :value="attestation" full data-test="soracle-attestation" />
      </BaseResourceState>
    </BaseContentBlock>
  </div>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.soracles-page {
  display: grid;
  gap: size(3);

  &__content {
    display: grid;
    gap: size(2);
  }

  &__query {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: size(2);
    padding: size(2);
  }

  &__field {
    display: grid;
    gap: size(1);
    min-width: min(100%, size(24));

    input,
    select {
      min-height: size(5);
    }
  }

  &__error {
    color: theme-color('error');
    margin: 0 size(2) size(2);
  }
}
</style>
