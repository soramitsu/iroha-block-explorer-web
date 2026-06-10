<template>
  <BaseContentBlock
    :title="$t('domains.domains')"
    class="domains-list-page"
  >
    <BaseTable
      v-model:page="listState.page"
      v-model:page-size="listState.per_page"
      :loading="isLoading"
      :total="totalDomains"
      :items="domains"
      :row-key="domainRowKey"
      container-class="domains-list-page__container"
    >
      <template #header>
        <div class="domains-list-page__row">
          <span class="h-sm cell">{{ $t('name') }}</span>
          <span class="h-sm">{{ $t('domains.ownedBy') }}</span>
          <span class="h-sm">{{ $t('domains.totalAccounts') }}</span>
          <span class="h-sm">{{ $t('domains.totalAssets') }}</span>
        </div>
      </template>

      <template #row="{ item }">
        <div class="domains-list-page__row">
          <BaseLink
            :to="`/domains/${item.id}`"
            class="cell"
          >
            {{ item.id }}
          </BaseLink>

          <BaseHash
            :hash="item.owned_by.toString()"
            :link="`/accounts/${item.owned_by}`"
            :type="hashType"
            copy
          />

          <span class="row-text-monospace">{{ item.accounts }}</span>
          <span class="row-text-monospace">{{ item.assets + item.nfts }}</span>
        </div>
      </template>

      <template #mobile-card="{ item }">
        <div class="domains-list-page__mobile-card">
          <div class="domains-list-page__mobile-row">
            <span class="h-sm domains-list-page__mobile-label">{{ $t('name') }}</span>

            <BaseLink :to="`/domains/${item.id}`">
              {{ item.id }}
            </BaseLink>
          </div>

          <div class="domains-list-page__mobile-row">
            <span class="h-sm domains-list-page__mobile-label">{{ $t('domains.ownedBy') }}</span>
            <BaseHash
              :hash="item.owned_by.toString()"
              :link="`/accounts/${item.owned_by}`"
              :type="hashType"
              copy
            />
          </div>

          <div class="domains-list-page__mobile-row">
            <span class="h-sm domains-list-page__mobile-label">{{ $t('domains.totalAccounts') }}</span>
            <span class="row-text-monospace">{{ item.accounts }}</span>
          </div>
          <div class="domains-list-page__mobile-row">
            <span class="h-sm domains-list-page__mobile-label">{{ $t('domains.totalAssets') }}</span>
            <span class="row-text-monospace">{{ item.assets + item.nfts }}</span>
          </div>
        </div>
      </template>
    </BaseTable>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import * as http from '@/shared/api';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import { computed, reactive, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Domain } from '@/shared/api/schemas';

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', sm: 'medium', xxs: 'two-line' });

const listState = reactive({
  page: 1,
  per_page: 10,
});

watch(
  () => listState.per_page,
  () => {
    listState.page = 1;
  }
);

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(listState),
      payload: listState,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchDomains(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const totalDomains = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination.total_items : 0
);
const domains = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);

const domainRowKey = (item: Domain) => item.id;
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.domains-list-page {
  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 0.7fr 2.2fr 0.4fr 0.4fr;
  }

  &__mobile-card {
    padding: size(2) size(3);
  }

  &__mobile-row {
    display: flex;
    align-items: center;
  }

  &__mobile-label {
    text-align: left;
    width: size(12);
    padding: size(1);
  }

  &__container {
    display: grid;
    grid-template-columns: 1fr;

    @include md {
      grid-template-columns: 1fr 1fr;
    }

    @include lg {
      grid-template-columns: 1fr;
    }
  }

  hr {
    display: none;
  }
}
</style>
