<template>
  <BaseContentBlock
    :title="$t('domains.domains')"
    class="domains-list-page"
  >
    <BaseTable
      v-model:cursor="cursor"
      v-model:page-size="limit"
      :loading="isLoading"
      pagination-mode="cursor"
      :cursor-pagination="domainsPagination"
      :items="domains"
      :row-key="domainRowKey"
      container-class="domains-list-page__container"
    >
      <template #header>
        <div
          class="domains-list-page__row"
          role="presentation"
        >
          <span class="h-sm cell" role="columnheader">{{ $t('name') }}</span>
          <span class="h-sm" role="columnheader">{{ $t('domains.ownedBy') }}</span>
          <span class="h-sm" role="columnheader">{{ $t('domains.totalAccounts') }}</span>
          <span class="h-sm" role="columnheader">{{ $t('domains.totalAssets') }}</span>
        </div>
      </template>

      <template #row="{ item }">
        <div
          class="domains-list-page__row"
          role="presentation"
        >
          <div class="cell" role="cell">
            <BaseLink :to="`/domains/${item.id}`">
              {{ item.id }}
            </BaseLink>
          </div>

          <div role="cell">
            <BaseHash
              :hash="item.owned_by.toString()"
              :link="`/accounts/${item.owned_by}`"
              :type="hashType"
              copy
            />
          </div>

          <span class="row-text-monospace" role="cell">{{ item.accounts }}</span>
          <span class="row-text-monospace" role="cell">{{ item.assets + item.nfts }}</span>
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
import { computed } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Domain } from '@/shared/api/schemas';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', sm: 'medium', xxs: 'two-line' });

const { cursor, limit } = useCursorListRouteQuery();
const listParams = computed(() => ({ cursor: cursor.value, limit: limit.value }));

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(listParams.value),
      payload: listParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchDomains(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const domainsPagination = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data : null
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
