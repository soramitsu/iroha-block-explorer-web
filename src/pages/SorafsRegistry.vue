<template>
  <div class="sorafs-registry-page">
    <BaseContentBlock :title="$t('sorafs.registryTitle')">
      <template #header-action>
        <BaseButton bordered data-testid="sorafs-refresh-snapshot" @click="refreshSnapshot">
          {{ $t('dataspaces.refresh') }}
        </BaseButton>
      </template>

      <div v-if="pinResponse" class="sorafs-registry-page__snapshot" data-testid="sorafs-finalized-snapshot">
        <DataField :title="$t('sorafs.attestation.height')" :value="pinResponse.finalized_cursor.height" monospace />
        <DataField :title="$t('sorafs.attestation.hash')" :hash="pinResponse.finalized_cursor.block_hash" copy />
        <DataField :title="$t('sorafs.manifestsTitle')" :value="pinResponse.charged_usage.manifest_count" monospace />
        <DataField title="content_bytes" :value="pinResponse.charged_usage.content_bytes" monospace />
      </div>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('sorafs.manifestsTitle')">
      <div class="sorafs-registry-page__filters">
        <label>
          <span class="label">{{ $t('sorafs.filters.status') }}</span>
          <select v-model="statusFilter">
            <option value="all">
              {{ $t('sorafs.filters.statusAll') }}
            </option>
            <option v-for="state in manifestStatusOptions" :key="state" :value="state">
              {{ $t(`sorafs.manifestStatus.${state}`) }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="pinError" class="sorafs-registry-page__error row-text" role="alert">
        {{ $t('transactions.unknownError') }}
      </div>

      <BaseTable
        v-model:cursor="afterDigest"
        v-model:page-size="limit"
        :loading="isManifestsLoading"
        pagination-mode="cursor"
        :cursor-pagination="pinPagination"
        :items="manifests"
        :row-key="manifestRowKey"
        container-class="sorafs-registry-page__table"
        row-pointer
        @click:row="selectManifest"
      >
        <template #header>
          <div class="sorafs-registry-page__row sorafs-registry-page__row--header" role="presentation">
            <span role="columnheader">{{ $t('sorafs.columns.digest') }}</span>
            <span role="columnheader">{{ $t('sorafs.columns.status') }}</span>
            <span role="columnheader">{{ $t('sorafs.columns.submittedBy') }}</span>
            <span role="columnheader">approved_epoch</span>
            <span role="columnheader">{{ $t('sorafs.detail.contentLength') }}</span>
            <span role="columnheader">retention_epoch</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            :class="[
              'sorafs-registry-page__row',
              selectedDigest === item.digest ? 'sorafs-registry-page__row--selected' : null,
            ]"
            role="presentation"
          >
            <BaseHash role="cell" :hash="item.digest" type="medium" copy />
            <span :class="['sorafs-status-pill', `sorafs-status-pill--${item.status.state}`]" role="cell">
              {{ $t(`sorafs.manifestStatus.${item.status.state}`) }}
            </span>
            <BaseLink role="cell" :to="`/accounts/${encodeURIComponent(item.submitted_by)}`" monospace>
              {{ item.submitted_by }}
            </BaseLink>
            <span class="row-text-monospace" role="cell">{{ item.approved_epoch ?? '—' }}</span>
            <span class="row-text-monospace" role="cell">{{ item.content_length }}</span>
            <span class="row-text-monospace" role="cell">{{ item.retention_epoch }}</span>
          </div>
        </template>
      </BaseTable>
    </BaseContentBlock>

    <BaseContentBlock v-if="selectedDigest" :title="$t('sorafs.detail.title')" data-testid="sorafs-manifest-detail">
      <BaseLoading v-if="isManifestLoading" />
      <div v-else-if="manifestError" class="sorafs-registry-page__error row-text" role="alert">
        {{ $t('transactions.unknownError') }}
      </div>
      <template v-else-if="selectedManifest">
        <div class="sorafs-registry-page__detail-grid">
          <DataField :title="$t('sorafs.columns.digest')" :hash="selectedManifest.digest" copy />
          <DataField :title="$t('sorafs.detail.rootCid')" :value="selectedManifest.root_cid" monospace />
          <DataField
            :title="$t('sorafs.columns.status')"
            :value="$t(`sorafs.manifestStatus.${selectedManifest.status.state}`)"
          />
          <DataField
            :title="$t('sorafs.detail.submittedBy')"
            :hash="selectedManifest.submitted_by"
            :link="`/accounts/${encodeURIComponent(selectedManifest.submitted_by)}`"
          />
          <DataField :title="$t('sorafs.detail.submittedEpoch')" :value="selectedManifest.submitted_epoch" monospace />
          <DataField title="approved_epoch" :value="selectedManifest.approved_epoch ?? '—'" monospace />
          <DataField :title="$t('sorafs.detail.contentLength')" :value="selectedManifest.content_length" monospace />
          <DataField title="retention_epoch" :value="selectedManifest.policy.retention_epoch" monospace />
          <DataField title="storage_class" :value="selectedManifest.policy.storage_class" />
          <DataField title="min_replicas" :value="selectedManifest.policy.min_replicas" monospace />
          <DataField
            :title="$t('sorafs.detail.chunkProfile')"
            :value="`${selectedManifest.chunker.namespace}.${selectedManifest.chunker.name}@${selectedManifest.chunker.semver}`"
            monospace
          />
          <DataField :title="$t('sorafs.columns.successor')" :value="selectedManifest.successor_of ?? '—'" monospace />
          <DataField
            :title="$t('sorafs.columns.alias')"
            :value="selectedManifest.alias ? `${selectedManifest.alias.namespace}.${selectedManifest.alias.name}` : '—'"
            monospace
          />
          <DataField title="retirement_reason" :value="selectedManifest.retirement_reason ?? '—'" />
        </div>

        <div class="sorafs-registry-page__commitments">
          <DataField title="chunk_digest_sha3_256" :hash="selectedManifest.chunk_digest_sha3_256" copy />
          <DataField title="por_root" :hash="selectedManifest.por_root" copy />
          <DataField
            title="council_envelope_digest"
            :hash="selectedManifest.council_envelope_digest ?? undefined"
            :value="selectedManifest.council_envelope_digest ?? '—'"
            copy
          />
        </div>

        <div class="sorafs-registry-page__metadata">
          <h3>{{ $t('sorafs.detail.metadata') }}</h3>
          <BaseJson :value="selectedManifest.metadata" />
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import type { CursorPagination, SorafsManifestState, SorafsPinManifestSummary } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';

const manifestStatusOptions: SorafsManifestState[] = ['pending', 'approved', 'retired'];
const afterDigest = ref<string | null>(null);
const limit = ref(10);
const statusFilter = ref<'all' | SorafsManifestState>('all');
const finalizedAnchor = ref<{ height: number; blockHash: string } | null>(null);
const hasNavigatedSnapshot = ref(false);
const selectedDigest = ref<string | null>(null);

watch(afterDigest, (value) => {
  if (value !== null) hasNavigatedSnapshot.value = true;
});

watch([limit, statusFilter], () => {
  afterDigest.value = null;
  finalizedAnchor.value = null;
  hasNavigatedSnapshot.value = false;
  selectedDigest.value = null;
});

const pinQuery = computed(() => ({
  limit: limit.value,
  after_digest_hex: afterDigest.value ?? undefined,
  status: statusFilter.value === 'all' ? undefined : statusFilter.value,
  expected_finalized_height:
    hasNavigatedSnapshot.value && finalizedAnchor.value ? finalizedAnchor.value.height : undefined,
  expected_finalized_block_hash_hex:
    hasNavigatedSnapshot.value && finalizedAnchor.value ? finalizedAnchor.value.blockHash : undefined,
}));

const pinScope = useParamScope(
  () => ({ key: JSON.stringify(pinQuery.value), payload: pinQuery.value }),
  ({ payload }) => setupAsyncData(() => http.fetchSorafsPinRegistry(payload))
);
const pinResult = computed(() => pinScope.value?.expose.data ?? null);
const pinResponse = computed(() => (pinResult.value?.status === SUCCESSFUL_FETCHING ? pinResult.value.data : null));
const isManifestsLoading = computed(() => !!pinScope.value?.expose.isLoading);
const pinError = computed(() => !!pinResult.value && pinResult.value.status !== SUCCESSFUL_FETCHING);
const manifests = computed(() => pinResponse.value?.manifests ?? []);
const pinPagination = computed<CursorPagination | null>(() => {
  if (!pinResponse.value) return null;
  return {
    limit: limit.value,
    next_cursor: pinResponse.value.next_after_digest ?? null,
    has_more: pinResponse.value.has_more,
  };
});

watch(
  pinResponse,
  (response) => {
    if (!response) return;
    finalizedAnchor.value = {
      height: response.finalized_cursor.height,
      blockHash: response.finalized_cursor.block_hash,
    };
    if (selectedDigest.value && !response.manifests.some((item) => item.digest === selectedDigest.value)) {
      selectedDigest.value = null;
    }
  },
  { immediate: true }
);

const manifestScope = useParamScope(
  () => {
    if (!selectedDigest.value || !finalizedAnchor.value) return null;
    return {
      key: `${selectedDigest.value}:${finalizedAnchor.value.height}:${finalizedAnchor.value.blockHash}`,
      payload: {
        digest: selectedDigest.value,
        height: finalizedAnchor.value.height,
        blockHash: finalizedAnchor.value.blockHash,
      },
    };
  },
  ({ payload }) =>
    setupAsyncData(() =>
      http.fetchSorafsPinManifest(payload.digest, {
        expected_finalized_height: payload.height,
        expected_finalized_block_hash_hex: payload.blockHash,
      })
    )
);
const manifestResult = computed(() => manifestScope.value?.expose.data ?? null);
const selectedManifest = computed(() =>
  manifestResult.value?.status === SUCCESSFUL_FETCHING ? manifestResult.value.data.manifest : null
);
const isManifestLoading = computed(() => !!manifestScope.value?.expose.isLoading);
const manifestError = computed(() => !!manifestResult.value && manifestResult.value.status !== SUCCESSFUL_FETCHING);

const manifestRowKey = (item: SorafsPinManifestSummary) => item.digest;
const selectManifest = (item: SorafsPinManifestSummary) => {
  selectedDigest.value = item.digest;
};

async function refreshSnapshot() {
  const queryWillChange = afterDigest.value !== null || finalizedAnchor.value !== null || hasNavigatedSnapshot.value;
  afterDigest.value = null;
  finalizedAnchor.value = null;
  hasNavigatedSnapshot.value = false;
  selectedDigest.value = null;
  if (!queryWillChange) {
    await nextTick();
    await pinScope.value?.expose.refetch();
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.sorafs-registry-page {
  display: grid;
  gap: size(4);

  &__intro,
  &__filters,
  &__snapshot,
  &__detail-grid,
  &__commitments,
  &__metadata,
  &__error {
    padding: 0 size(2);

    @include sm {
      padding: 0 size(4);
    }
  }

  &__snapshot,
  &__detail-grid,
  &__commitments {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: size(3);
    margin-top: size(3);
  }

  &__filters {
    margin-bottom: size(3);

    label {
      display: grid;
      gap: size(1);
      max-width: 260px;
    }

    select {
      min-height: size(5);
      padding: size(1) size(2);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      color: theme-color('content-primary');
      background: theme-color('background');
    }
  }

  &__error {
    color: theme-color('error');
    margin-bottom: size(2);
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) minmax(90px, 0.6fr) minmax(180px, 1.4fr) repeat(3, minmax(100px, 0.7fr));
    align-items: center;
    gap: size(2);
    padding: size(2) size(4);

    &--header {
      color: theme-color('content-tertiary');
    }

    &--selected {
      background: color-mix(in srgb, theme-color('primary') 9%, transparent);
    }
  }

  &__metadata {
    margin-top: size(4);
  }
}

.sorafs-status-pill {
  width: fit-content;
  padding: size(0.5) size(1.25);
  border-radius: 999px;
  text-transform: capitalize;
  background: theme-color('surface-variant');

  &--approved {
    color: theme-color('success');
  }

  &--retired {
    color: theme-color('content-tertiary');
  }
}
</style>
