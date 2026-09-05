<template>
  <div class="zk-registry-page">
    <BaseContentBlock :title="$t('zkRegistry.proofs.title')">
      <p class="zk-registry-page__note">
        {{ $t('zkRegistry.proofs.snapshotNote') }}
      </p>

      <form class="zk-registry-page__filters" data-testid="zk-proof-filters" @submit.prevent="applyProofFilters">
        <label>
          <span>{{ $t('zkRegistry.filters.backend') }}</span>
          <input
            v-model="proofDraft.backend"
            type="text"
            autocomplete="off"
            :placeholder="$t('zkRegistry.filters.backendPlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.status') }}</span>
          <select v-model="proofDraft.status">
            <option value="all">
              {{ $t('zkRegistry.filters.allStatuses') }}
            </option>
            <option v-for="status in proofStatusOptions" :key="status" :value="status">
              {{ formatZkStatus(status) }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.tag') }}</span>
          <input
            v-model="proofDraft.hasTag"
            type="text"
            maxlength="4"
            autocomplete="off"
            :placeholder="$t('zkRegistry.filters.tagPlaceholder')"
            :aria-invalid="proofTagIsValid ? undefined : 'true'"
          />
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.order') }}</span>
          <select v-model="proofDraft.order">
            <option value="desc">
              {{ $t('zkRegistry.filters.newest') }}
            </option>
            <option value="asc">
              {{ $t('zkRegistry.filters.oldest') }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.bridgeOnly') }}</span>
          <select v-model="proofDraft.bridgeOnly">
            <option :value="false">
              {{ $t('zkRegistry.filters.allProofs') }}
            </option>
            <option :value="true">
              {{ $t('zkRegistry.filters.bridgeProofs') }}
            </option>
          </select>
        </label>
        <BaseButton bordered native-type="submit" :disabled="!proofTagIsValid" data-testid="zk-proof-apply">
          {{ $t('zkRegistry.filters.apply') }}
        </BaseButton>
      </form>

      <p v-if="!proofTagIsValid" class="zk-registry-page__error" role="alert">
        {{ $t('zkRegistry.filters.tagInvalid') }}
      </p>

      <div class="zk-registry-page__summary">
        <DataField :title="$t('zkRegistry.proofs.filteredCount')" :value="proofCount ?? '—'" monospace />
        <DataField :title="$t('zkRegistry.proofs.currentPage')" :value="proofPage" monospace />
        <DataField :title="$t('zkRegistry.proofs.visibleRows')" :value="proofRows.length" monospace />
      </div>

      <p v-if="proofError" class="zk-registry-page__error" role="alert">
        {{ $t('zkRegistry.errors.proofs') }}
      </p>

      <BaseTable
        v-model:page="proofPage"
        v-model:page-size="proofLimit"
        :items="proofRows"
        :loading="proofLoading"
        :total="proofCount ?? 0"
        :payload-pagination="proofPagination"
        :row-key="proofRowKey"
        container-class="zk-registry-page__table"
        row-pointer
        @click:row="selectProof"
      >
        <template #header>
          <div
            class="zk-registry-page__row zk-registry-page__row--proof zk-registry-page__row--header"
            role="presentation"
          >
            <span role="columnheader">{{ $t('zkRegistry.columns.backend') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.proofHash') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.status') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.height') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.verifyingKey') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.bridge') }}</span>
          </div>
        </template>
        <template #row="{ item }">
          <div
            :class="[
              'zk-registry-page__row',
              'zk-registry-page__row--proof',
              selectedProof?.backend === item.backend && selectedProof?.hash === item.hash
                ? 'zk-registry-page__row--selected'
                : null,
            ]"
            role="presentation"
          >
            <span class="row-text-monospace" role="cell">{{ item.backend }}</span>
            <BaseHash role="cell" :hash="item.hash" :type="hashType" copy />
            <span
              :class="['zk-registry-page__status', `zk-registry-page__status--${item.status.toLowerCase()}`]"
              role="cell"
            >
              {{ formatZkStatus(item.status) }}
            </span>
            <span class="row-text-monospace" role="cell">{{ item.verified_at_height ?? '—' }}</span>
            <span class="row-text-monospace" role="cell">
              {{ item.vk_ref ? `${item.vk_ref.backend}:${item.vk_ref.name}` : '—' }}
            </span>
            <span class="row-text" role="cell">
              {{ item.bridge ? item.bridge.payload.kind : '—' }}
            </span>
          </div>
        </template>
        <template #mobile-card="{ item }">
          <button type="button" class="zk-registry-page__mobile-card" @click="selectProof(item)">
            <DataField :title="$t('zkRegistry.columns.backend')" :value="item.backend" monospace />
            <DataField :title="$t('zkRegistry.columns.proofHash')" :hash="item.hash" type="short" copy />
            <DataField :title="$t('zkRegistry.columns.status')" :value="formatZkStatus(item.status)" />
            <DataField :title="$t('zkRegistry.columns.height')" :value="item.verified_at_height ?? '—'" monospace />
          </button>
        </template>
      </BaseTable>
    </BaseContentBlock>

    <BaseContentBlock v-if="selectedProof" :title="$t('zkRegistry.proofs.detailTitle')" data-testid="zk-proof-detail">
      <BaseLoading v-if="proofDetailLoading" />
      <p v-else-if="proofDetailError" class="zk-registry-page__error" role="alert">
        {{ $t('zkRegistry.errors.proofDetail') }}
      </p>
      <template v-else-if="proofDetail">
        <div class="zk-registry-page__detail-grid">
          <DataField :title="$t('zkRegistry.columns.backend')" :value="proofDetail.backend" monospace />
          <DataField :title="$t('zkRegistry.columns.proofHash')" :hash="proofDetail.proof_hash" copy />
          <DataField :title="$t('zkRegistry.columns.status')" :value="formatZkStatus(proofDetail.status)" />
          <DataField
            :title="$t('zkRegistry.columns.height')"
            :value="proofDetail.verified_at_height ?? '—'"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.columns.verifyingKey')"
            :value="proofDetail.vk_ref ? `${proofDetail.vk_ref.backend}:${proofDetail.vk_ref.name}` : '—'"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.proofs.vkCommitment')"
            :hash="proofDetail.vk_commitment ?? undefined"
            :value="proofDetail.vk_commitment ?? '—'"
            copy
          />
        </div>
        <div v-if="proofDetail.bridge" class="zk-registry-page__json">
          <h3>{{ $t('zkRegistry.proofs.bridgeDetail') }}</h3>
          <BaseJson :value="proofDetail.bridge" full />
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('zkRegistry.verifyingKeys.title')">
      <p class="zk-registry-page__note">
        {{ $t('zkRegistry.verifyingKeys.snapshotNote') }}
      </p>

      <form class="zk-registry-page__filters" data-testid="zk-vk-filters" @submit.prevent="applyVerifyingKeyFilters">
        <label>
          <span>{{ $t('zkRegistry.filters.backend') }}</span>
          <input
            v-model="verifyingKeyDraft.backend"
            type="text"
            autocomplete="off"
            :placeholder="$t('zkRegistry.filters.backendPlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.status') }}</span>
          <select v-model="verifyingKeyDraft.status">
            <option value="all">
              {{ $t('zkRegistry.filters.allStatuses') }}
            </option>
            <option v-for="status in verifyingKeyStatusOptions" :key="status" :value="status">
              {{ formatZkStatus(status) }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.name') }}</span>
          <input
            v-model="verifyingKeyDraft.nameContains"
            type="text"
            autocomplete="off"
            :placeholder="$t('zkRegistry.filters.namePlaceholder')"
          />
        </label>
        <label>
          <span>{{ $t('zkRegistry.filters.order') }}</span>
          <select v-model="verifyingKeyDraft.order">
            <option value="asc">
              {{ $t('zkRegistry.filters.nameAscending') }}
            </option>
            <option value="desc">
              {{ $t('zkRegistry.filters.nameDescending') }}
            </option>
          </select>
        </label>
        <label>
          <span>{{ $t('table.rowsPerPage') }}</span>
          <select v-model.number="verifyingKeyLimit">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <BaseButton bordered native-type="submit" data-testid="zk-vk-apply">
          {{ $t('zkRegistry.filters.apply') }}
        </BaseButton>
      </form>

      <p v-if="verifyingKeyError" class="zk-registry-page__error" role="alert">
        {{ $t('zkRegistry.errors.verifyingKeys') }}
      </p>

      <BaseTable
        :items="verifyingKeyRows"
        :loading="verifyingKeyLoading"
        :row-key="verifyingKeyRowKey"
        :disable-pagination="true"
        container-class="zk-registry-page__table"
        row-pointer
        @click:row="selectVerifyingKey"
      >
        <template #header>
          <div
            class="zk-registry-page__row zk-registry-page__row--vk zk-registry-page__row--header"
            role="presentation"
          >
            <span role="columnheader">{{ $t('zkRegistry.columns.backend') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.name') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.status') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.circuit') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.namespace') }}</span>
            <span role="columnheader">{{ $t('zkRegistry.columns.activation') }}</span>
          </div>
        </template>
        <template #row="{ item }">
          <div
            :class="[
              'zk-registry-page__row',
              'zk-registry-page__row--vk',
              selectedVerifyingKey?.backend === item.id.backend && selectedVerifyingKey?.name === item.id.name
                ? 'zk-registry-page__row--selected'
                : null,
            ]"
            role="presentation"
          >
            <span class="row-text-monospace" role="cell">{{ item.id.backend }}</span>
            <span class="row-text-monospace" role="cell">{{ item.id.name }}</span>
            <span
              :class="['zk-registry-page__status', `zk-registry-page__status--${item.record.status.toLowerCase()}`]"
              role="cell"
            >
              {{ formatZkStatus(item.record.status) }}
            </span>
            <span class="row-text" role="cell">{{ item.record.circuit_id }}</span>
            <span class="row-text" role="cell">{{ item.record.namespace }}</span>
            <span class="row-text-monospace" role="cell">{{ item.record.activation_height ?? '—' }}</span>
          </div>
        </template>
        <template #mobile-card="{ item }">
          <button type="button" class="zk-registry-page__mobile-card" @click="selectVerifyingKey(item)">
            <DataField :title="$t('zkRegistry.columns.backend')" :value="item.id.backend" monospace />
            <DataField :title="$t('zkRegistry.columns.name')" :value="item.id.name" monospace />
            <DataField :title="$t('zkRegistry.columns.status')" :value="formatZkStatus(item.record.status)" />
            <DataField :title="$t('zkRegistry.columns.circuit')" :value="item.record.circuit_id" />
          </button>
        </template>
      </BaseTable>

      <nav class="zk-registry-page__offset-pagination" :aria-label="$t('zkRegistry.verifyingKeys.pagination')">
        <BaseButton line :disabled="verifyingKeyPage === 1" data-testid="zk-vk-previous" @click="verifyingKeyPage -= 1">
          {{ $t('zkRegistry.verifyingKeys.previous') }}
        </BaseButton>
        <span>{{ $t('zkRegistry.verifyingKeys.page', [verifyingKeyPage]) }}</span>
        <BaseButton line :disabled="!verifyingKeyCanAdvance" data-testid="zk-vk-next" @click="verifyingKeyPage += 1">
          {{ $t('zkRegistry.verifyingKeys.next') }}
        </BaseButton>
      </nav>
    </BaseContentBlock>

    <BaseContentBlock
      v-if="selectedVerifyingKey"
      :title="$t('zkRegistry.verifyingKeys.detailTitle')"
      data-testid="zk-vk-detail"
    >
      <BaseLoading v-if="verifyingKeyDetailLoading" />
      <p v-else-if="verifyingKeyDetailError" class="zk-registry-page__error" role="alert">
        {{ $t('zkRegistry.errors.verifyingKeyDetail') }}
      </p>
      <template v-else-if="verifyingKeyDetail">
        <div class="zk-registry-page__detail-grid">
          <DataField :title="$t('zkRegistry.columns.backend')" :value="verifyingKeyDetail.id.backend" monospace />
          <DataField :title="$t('zkRegistry.columns.name')" :value="verifyingKeyDetail.id.name" monospace />
          <DataField
            :title="$t('zkRegistry.columns.status')"
            :value="formatZkStatus(verifyingKeyDetail.record.status)"
          />
          <DataField :title="$t('zkRegistry.columns.circuit')" :value="verifyingKeyDetail.record.circuit_id" />
          <DataField :title="$t('zkRegistry.columns.namespace')" :value="verifyingKeyDetail.record.namespace" />
          <DataField :title="$t('zkRegistry.verifyingKeys.curve')" :value="verifyingKeyDetail.record.curve" />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.commitment')"
            :hash="verifyingKeyDetail.record.commitment"
            copy
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.schemaHash')"
            :hash="verifyingKeyDetail.record.public_inputs_schema_hash"
            copy
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.keyBytes')"
            :value="verifyingKeyDetail.record.vk_len"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.maxProofBytes')"
            :value="verifyingKeyDetail.record.max_proof_bytes"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.activation')"
            :value="verifyingKeyDetail.record.activation_height ?? '—'"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.withdrawal')"
            :value="verifyingKeyDetail.record.withdraw_height ?? '—'"
            monospace
          />
          <DataField
            :title="$t('zkRegistry.verifyingKeys.noritoArchive')"
            :hash="verifyingKeyDetail.record_norito_base64"
            type="short"
            copy
          />
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import type {
  ZkProofFilterParams,
  ZkProofRegistryItem,
  ZkProofStatus,
  ZkVerifyingKeyId,
  ZkVerifyingKeyListItem,
  ZkVerifyingKeyStatus,
} from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { buildOffsetPagination } from '@/shared/lib/pagination';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';

defineOptions({ name: 'ZkRegistry' });

const { t } = useI18n();
const hashType = useAdaptiveHash({ xs: 'short', xxs: 'short' }, 'medium');
const proofStatusOptions: ZkProofStatus[] = ['Submitted', 'Verified', 'Rejected'];
const verifyingKeyStatusOptions: ZkVerifyingKeyStatus[] = ['Active', 'Proposed', 'Withdrawn'];
const ZK_STATUS_MESSAGE_KEYS = {
  Submitted: 'zkRegistry.status.submitted',
  Verified: 'zkRegistry.status.verified',
  Rejected: 'zkRegistry.status.rejected',
  Active: 'zkRegistry.status.active',
  Proposed: 'zkRegistry.status.proposed',
  Withdrawn: 'zkRegistry.status.withdrawn',
} as const satisfies Record<ZkProofStatus | ZkVerifyingKeyStatus, string>;

function formatZkStatus(status: ZkProofStatus | ZkVerifyingKeyStatus): string {
  return t(ZK_STATUS_MESSAGE_KEYS[status]);
}

const proofDraft = reactive({
  backend: '',
  status: 'all' as 'all' | ZkProofStatus,
  bridgeOnly: false,
  hasTag: '',
  order: 'desc' as 'asc' | 'desc',
});
const proofApplied = reactive({ ...proofDraft });
const proofPage = ref(1);
const proofLimit = ref(20);
const selectedProof = ref<{ backend: string; hash: string } | null>(null);
const proofTagIsValid = computed(() => {
  const value = proofDraft.hasTag;
  return value.length === 0 || /^[\x21-\x7e]{4}$/u.test(value);
});

function applyProofFilters() {
  if (!proofTagIsValid.value) return;
  Object.assign(proofApplied, proofDraft);
  proofPage.value = 1;
  selectedProof.value = null;
}

watch(proofLimit, () => {
  proofPage.value = 1;
});

const proofBaseFilters = computed<ZkProofFilterParams>(() => ({
  backend: proofApplied.backend.trim() || undefined,
  status: proofApplied.status === 'all' ? undefined : proofApplied.status,
  bridge_only: proofApplied.bridgeOnly || undefined,
  has_tag: proofApplied.hasTag || undefined,
}));
const proofListQuery = computed(() => ({
  ...proofBaseFilters.value,
  limit: proofLimit.value,
  offset: (proofPage.value - 1) * proofLimit.value,
  order: proofApplied.order,
}));

const proofListScope = useParamScope(
  () => ({ key: `proofs:${JSON.stringify(proofListQuery.value)}`, payload: proofListQuery.value }),
  ({ payload }) => setupAsyncData(() => http.fetchZkProofs(payload))
);
const proofCountScope = useParamScope(
  () => ({ key: `proof-count:${JSON.stringify(proofBaseFilters.value)}`, payload: proofBaseFilters.value }),
  ({ payload }) => setupAsyncData(() => http.fetchZkProofCount(payload))
);
const proofListResult = computed(() => proofListScope.value?.expose.data ?? null);
const proofCountResult = computed(() => proofCountScope.value?.expose.data ?? null);
const proofRows = computed(() =>
  proofListResult.value?.status === SUCCESSFUL_FETCHING ? proofListResult.value.data : []
);
const proofCount = computed(() =>
  proofCountResult.value?.status === SUCCESSFUL_FETCHING ? proofCountResult.value.data.count : null
);
const proofLoading = computed(() =>
  Boolean(proofListScope.value?.expose.isLoading || proofCountScope.value?.expose.isLoading)
);
const proofError = computed(
  () =>
    Boolean(proofListScope.value?.expose.error || proofCountScope.value?.expose.error) ||
    Boolean(proofListResult.value && proofListResult.value.status !== SUCCESSFUL_FETCHING) ||
    Boolean(proofCountResult.value && proofCountResult.value.status !== SUCCESSFUL_FETCHING)
);
const proofPagination = computed(() => {
  if (proofCount.value === null) return null;
  return buildOffsetPagination(proofCount.value, proofLimit.value, (proofPage.value - 1) * proofLimit.value);
});
const proofRowKey = (item: ZkProofRegistryItem) => `${item.backend}:${item.hash}`;

function selectProof(item: ZkProofRegistryItem) {
  selectedProof.value = { backend: item.backend, hash: item.hash };
}

const proofDetailScope = useParamScope(
  () => {
    if (!selectedProof.value) return null;
    return {
      key: `proof:${selectedProof.value.backend}:${selectedProof.value.hash}`,
      payload: selectedProof.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchZkProof(payload.backend, payload.hash))
);
const proofDetailResult = computed(() => proofDetailScope.value?.expose.data ?? null);
const proofDetail = computed(() =>
  proofDetailResult.value?.status === SUCCESSFUL_FETCHING ? proofDetailResult.value.data : null
);
const proofDetailLoading = computed(() => Boolean(proofDetailScope.value?.expose.isLoading));
const proofDetailError = computed(
  () =>
    Boolean(proofDetailScope.value?.expose.error) ||
    Boolean(proofDetailResult.value && proofDetailResult.value.status !== SUCCESSFUL_FETCHING)
);

const verifyingKeyDraft = reactive({
  backend: '',
  status: 'all' as 'all' | ZkVerifyingKeyStatus,
  nameContains: '',
  order: 'asc' as 'asc' | 'desc',
});
const verifyingKeyApplied = reactive({ ...verifyingKeyDraft });
const verifyingKeyPage = ref(1);
const verifyingKeyLimit = ref(25);
const selectedVerifyingKey = ref<ZkVerifyingKeyId | null>(null);

function applyVerifyingKeyFilters() {
  Object.assign(verifyingKeyApplied, verifyingKeyDraft);
  verifyingKeyPage.value = 1;
  selectedVerifyingKey.value = null;
}

watch(verifyingKeyLimit, () => {
  verifyingKeyPage.value = 1;
});

const verifyingKeyQuery = computed(() => ({
  backend: verifyingKeyApplied.backend.trim() || undefined,
  status: verifyingKeyApplied.status === 'all' ? undefined : verifyingKeyApplied.status,
  name_contains: verifyingKeyApplied.nameContains.trim() || undefined,
  order: verifyingKeyApplied.order,
  limit: verifyingKeyLimit.value,
  offset: (verifyingKeyPage.value - 1) * verifyingKeyLimit.value,
}));
const verifyingKeyListScope = useParamScope(
  () => ({ key: `vk:${JSON.stringify(verifyingKeyQuery.value)}`, payload: verifyingKeyQuery.value }),
  ({ payload }) => setupAsyncData(() => http.fetchZkVerifyingKeys(payload))
);
const verifyingKeyListResult = computed(() => verifyingKeyListScope.value?.expose.data ?? null);
const verifyingKeyRows = computed(() =>
  verifyingKeyListResult.value?.status === SUCCESSFUL_FETCHING ? verifyingKeyListResult.value.data : []
);
const verifyingKeyLoading = computed(() => Boolean(verifyingKeyListScope.value?.expose.isLoading));
const verifyingKeyError = computed(
  () =>
    Boolean(verifyingKeyListScope.value?.expose.error) ||
    Boolean(verifyingKeyListResult.value && verifyingKeyListResult.value.status !== SUCCESSFUL_FETCHING)
);
const verifyingKeyCanAdvance = computed(
  () =>
    verifyingKeyRows.value.length === verifyingKeyLimit.value && verifyingKeyPage.value * verifyingKeyLimit.value < 500
);
const verifyingKeyRowKey = (item: ZkVerifyingKeyListItem) => `${item.id.backend}:${item.id.name}`;

function selectVerifyingKey(item: ZkVerifyingKeyListItem) {
  selectedVerifyingKey.value = item.id;
}

const verifyingKeyDetailScope = useParamScope(
  () => {
    if (!selectedVerifyingKey.value) return null;
    return {
      key: `vk-detail:${selectedVerifyingKey.value.backend}:${selectedVerifyingKey.value.name}`,
      payload: selectedVerifyingKey.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchZkVerifyingKey(payload.backend, payload.name))
);
const verifyingKeyDetailResult = computed(() => verifyingKeyDetailScope.value?.expose.data ?? null);
const verifyingKeyDetail = computed(() =>
  verifyingKeyDetailResult.value?.status === SUCCESSFUL_FETCHING ? verifyingKeyDetailResult.value.data : null
);
const verifyingKeyDetailLoading = computed(() => Boolean(verifyingKeyDetailScope.value?.expose.isLoading));
const verifyingKeyDetailError = computed(
  () =>
    Boolean(verifyingKeyDetailScope.value?.expose.error) ||
    Boolean(verifyingKeyDetailResult.value && verifyingKeyDetailResult.value.status !== SUCCESSFUL_FETCHING)
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.zk-registry-page {
  display: grid;
  gap: size(3);

  &__note,
  &__error {
    margin: size(2) size(2) 0;

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__note {
    color: theme-color('content-secondary');
  }

  &__error {
    color: theme-color('error');
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: size(2);
    margin: size(2);

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }

    label {
      display: grid;
      gap: size(0.75);
      min-width: 170px;
      color: theme-color('content-secondary');
    }

    input,
    select {
      min-height: 42px;
      padding: size(1) size(1.25);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: theme-color('surface');
      color: theme-color('content-primary');
    }
  }

  &__summary,
  &__detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(2);
    margin: size(2);
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    background: theme-color('surface');

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__mobile-card {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: size(2);
    padding: size(2);
    border: 0;
    color: inherit;
    background: transparent;
    text-align: start;
    cursor: pointer;
  }

  &__row {
    display: grid;
    gap: size(1.5);
    align-items: center;

    &--proof,
    &--vk {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    &--header {
      color: theme-color('content-secondary');
      font-weight: 600;
    }

    &--selected {
      color: theme-color('content-primary');
    }
  }

  &__status {
    justify-self: start;
    padding: size(0.5) size(1.25);
    border-radius: size(2);
    font-size: size(1.5);
    font-weight: 600;

    &--verified,
    &--active {
      color: theme-color('success');
      background: color-mix(in srgb, theme-color('success') 15%, transparent);
    }

    &--rejected,
    &--withdrawn {
      color: theme-color('error');
      background: color-mix(in srgb, theme-color('error') 15%, transparent);
    }

    &--submitted,
    &--proposed {
      color: theme-color('warning');
      background: color-mix(in srgb, theme-color('warning') 15%, transparent);
    }
  }

  &__json {
    margin: size(2);

    @include sm {
      margin-inline: size(3);
    }

    @include lg {
      margin-inline: size(4);
    }
  }

  &__offset-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: size(2);
    margin: size(2) size(3);
    color: theme-color('content-secondary');
  }
}
</style>
