<template>
  <BaseContentBlock
    :title="$t('contracts.title')"
    class="smart-contracts-page"
  >
    <p class="smart-contracts-page__hint">
      {{ $t('contracts.hint') }}
    </p>

    <BaseTable
      v-model:page="pagination.page"
      v-model:page-size="pagination.per_page"
      :loading="isLoading"
      :total="totalDeployments"
      :items="deployments"
      :row-key="deploymentRowKey"
      container-class="smart-contracts-page__container"
      row-pointer
      @click:row="handleRowClick"
    >
      <template #header>
        <div class="smart-contracts-page__row">
          <span class="h-sm">{{ $t('contracts.columns.address') }}</span>
          <span class="h-sm">{{ $t('contracts.columns.codeHash') }}</span>
          <span class="h-sm">{{ $t('contracts.columns.deployer') }}</span>
          <span class="h-sm">{{ $t('contracts.columns.block') }}</span>
          <span class="h-sm">{{ $t('contracts.columns.createdAt') }}</span>
          <span class="h-sm">{{ $t('contracts.columns.transaction') }}</span>
        </div>
      </template>

      <template #row="{ item }">
        <div class="smart-contracts-page__row">
          <BaseHash
            :hash="item.contractAddress"
            :type="addressHashType"
            copy
          />
          <BaseHash
            :hash="item.codeHash ?? '—'"
            :type="hashType"
            :copy="Boolean(item.codeHash)"
          />
          <BaseHash
            :hash="item.authority"
            :link="accountLink(item.authority)"
            :type="hashType"
            copy
          />
          <BaseLink :to="`/blocks/${item.block}`">
            {{ item.block }}
          </BaseLink>
          <time :datetime="item.createdAt.toISOString()">
            {{ defaultFormat(item.createdAt) }}
          </time>
          <BaseHash
            :hash="item.transactionHash"
            :link="transactionLink(item.transactionHash)"
            :type="hashType"
            copy
          />
        </div>
      </template>

      <template #mobile-card="{ item }">
        <div class="smart-contracts-page__mobile-card">
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.address') }}</span>
            <BaseHash
              :hash="item.contractAddress"
              :type="addressHashType"
              copy
            />
          </div>
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.codeHash') }}</span>
            <BaseHash
              :hash="item.codeHash ?? '—'"
              :type="hashType"
              :copy="Boolean(item.codeHash)"
            />
          </div>
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.deployer') }}</span>
            <BaseHash
              :hash="item.authority"
              :link="accountLink(item.authority)"
              :type="hashType"
              copy
            />
          </div>
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.block') }}</span>
            <BaseLink :to="`/blocks/${item.block}`">
              {{ item.block }}
            </BaseLink>
          </div>
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.createdAt') }}</span>
            <time :datetime="item.createdAt.toISOString()">
              {{ defaultFormat(item.createdAt) }}
            </time>
          </div>
          <div class="smart-contracts-page__mobile-row">
            <span class="h-sm smart-contracts-page__mobile-label">{{ $t('contracts.columns.transaction') }}</span>
            <BaseHash
              :hash="item.transactionHash"
              :link="transactionLink(item.transactionHash)"
              :type="hashType"
              copy
            />
          </div>
        </div>
      </template>
    </BaseTable>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { extractSmartContractDeployment, type SmartContractDeployment } from '@/shared/lib/smart-contracts';
import { defaultFormat } from '@/shared/lib/time';

const navigation = useScopedExplorerNavigation();

const pagination = reactive({
  page: 1,
  per_page: 10,
});

watch(
  () => pagination.per_page,
  () => {
    pagination.page = 1;
  }
);

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'medium', xs: 'two-line', xxs: 'two-line' }, 'short');
const addressHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'medium', md: 'short' }, 'two-line');

const instructionQuery = computed(() => ({
  page: pagination.page,
  per_page: pagination.per_page,
  kind: 'ActivateContractInstance',
}));

const scope = useParamScope(
  () => ({
    key: JSON.stringify(instructionQuery.value),
    payload: instructionQuery.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchInstructions(payload))
);

const isLoading = computed(() => scope.value.expose.isLoading);
const totalDeployments = computed(() =>
  scope.value.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination.total_items : 0
);
const deployments = computed(() => {
  if (scope.value.expose.data?.status !== SUCCESSFUL_FETCHING) return [];
  return scope.value.expose.data.data.items.flatMap((instruction) => {
    const deployment = extractSmartContractDeployment(instruction);
    return deployment ? [deployment] : [];
  });
});

function deploymentRowKey(item: SmartContractDeployment) {
  return `${item.transactionHash}:${item.index}`;
}

function transactionLink(transactionHash: string) {
  return `/transactions/${encodeURIComponent(transactionHash)}`;
}

function accountLink(accountId: string) {
  return `/accounts/${encodeURIComponent(accountId)}`;
}

function handleRowClick(item: SmartContractDeployment) {
  navigation.push(transactionLink(item.transactionHash)).catch(() => {});
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.smart-contracts-page {
  &__hint {
    padding: 0 size(2);
    margin: 0 0 size(2);
    color: theme-color('content-secondary');

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 2.1fr 1.2fr 1.5fr 0.5fr 1fr 1.2fr;
    gap: size(1);
    align-items: center;
  }

  &__container {
    display: grid;
    grid-template-columns: 1fr;
  }

  &__mobile-card {
    padding: size(2) size(4);
    display: grid;
    gap: size(1);
  }

  &__mobile-row {
    display: grid;
    gap: size(0.5);
  }

  &__mobile-label {
    color: theme-color('content-tertiary');
  }
}
</style>
