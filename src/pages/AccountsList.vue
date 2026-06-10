<template>
  <BaseContentBlock
    :title="$t('accounts.accounts')"
    class="accounts-list-page"
  >
    <div class="accounts-list-page__filters">
      <label>
        <span class="label">{{ $t('accounts.filters.domainLabel') }}</span>
        <input
          v-model="domainFilter"
          type="text"
          :placeholder="$t('accounts.filters.domainPlaceholder')"
        >
      </label>
      <label>
        <span class="label">{{ $t('accounts.filters.assetLabel') }}</span>
        <input
          v-model="assetFilter"
          type="text"
          :placeholder="$t('accounts.filters.assetPlaceholder')"
        >
        <small
          v-if="assetFilterError"
          class="accounts-list-page__filters-error"
        >
          {{ assetFilterError }}
        </small>
      </label>
    </div>

    <BaseTable
      v-model:page="pagination.page"
      v-model:page-size="pagination.per_page"
      :loading="isLoading"
      :total="totalAccounts"
      :items="accounts"
      :row-key="accountRowKey"
      container-class="accounts-list-page__container"
      row-pointer
      @click:row="handleRowClick"
    >
      <template #header>
        <div class="accounts-list-page__row">
          <span class="h-sm cell">{{ $t('accounts.address') }}</span>
          <span class="h-sm">{{ $t('domains.domains') }}</span>
          <span class="h-sm">{{ $t('assets.assets') }}</span>
        </div>
      </template>

      <template #row="{ item }">
        <div class="accounts-list-page__row">
          <BaseHash
            :hash="accountDisplayId(item)"
            :link="accountLink(item)"
            :type="hashType"
            copy
            class="cell"
          />

          <span class="row-text-monospace">{{ item.owned_domains }}</span>
          <span class="row-text-monospace">{{ item.owned_assets + item.owned_nfts }}</span>
        </div>
      </template>

      <template #mobile-card="{ item }">
        <div class="accounts-list-page__mobile-card">
          <div class="accounts-list-page__mobile-row">
            <span class="h-sm accounts-list-page__mobile-row-label">{{ $t('accounts.address') }}</span>
            <BaseHash
              :hash="accountDisplayId(item)"
              :link="accountLink(item)"
              :type="hashType"
              class="accounts-list-page__mobile-row-id"
              copy
            />
          </div>

          <div class="accounts-list-page__mobile-row">
            <span class="h-sm accounts-list-page__mobile-row-label">{{ $t('domains.domains') }}</span>
            <span class="row-text-monospace">{{ item.owned_domains }}</span>
          </div>

          <div class="accounts-list-page__mobile-row">
            <span class="h-sm accounts-list-page__mobile-row-label">{{ $t('assets.assets') }}</span>
            <span class="row-text-monospace">{{ item.owned_assets + item.owned_nfts }}</span>
          </div>
        </div>
      </template>
    </BaseTable>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import * as http from '@/shared/api';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import { computed, reactive, ref, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useI18n } from 'vue-i18n';
import type { Account } from '@/shared/api/schemas';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { getPreferredAccountId } from '@/shared/lib/account-id';
import { normalizeAssetDefinitionSelectorLiteral } from '@/shared/lib/asset-definition-literal';
import { parseOptionalFilterCatching } from '@/shared/lib/optional-filter';

const navigation = useScopedExplorerNavigation();
const { t } = useI18n();

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', xs: 'two-line', xxs: 'two-line' }, 'medium');

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

const domainFilter = ref('');
const assetFilter = ref('');
function parseAssetSelector(value: string): string {
  const normalized = normalizeAssetDefinitionSelectorLiteral(value);
  if (!normalized) throw new Error('invalid asset selector');
  return normalized;
}
const assetFilterState = computed(() =>
  parseOptionalFilterCatching(assetFilter.value, parseAssetSelector, t('accounts.filters.assetInvalid'))
);
const parsedAssetFilter = computed<string | undefined>(() => assetFilterState.value.value);
const assetFilterError = computed(() => assetFilterState.value.error);

watch([domainFilter, assetFilter], () => {
  pagination.page = 1;
});

const accountQuery = computed(() => ({
  page: pagination.page,
  per_page: pagination.per_page,
  domain: domainFilter.value.trim() || undefined,
  with_asset: parsedAssetFilter.value,
}));

const scope = useParamScope(
  () => ({
    key: JSON.stringify({
      page: accountQuery.value.page,
      per_page: accountQuery.value.per_page,
      domain: accountQuery.value.domain ?? null,
      with_asset: accountQuery.value.with_asset?.toString() ?? null,
    }),
    payload: accountQuery.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchAccounts(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const totalAccounts = computed(() =>
  scope.value.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination.total_items : 0
);
const accounts = computed(() =>
  scope.value.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);
const accountDisplayId = (item: Account) => getPreferredAccountId(item);
const accountLink = (item: Account) => `/accounts/${encodeURIComponent(accountDisplayId(item))}`;
const accountRowKey = (item: Account) => accountDisplayId(item);

function handleRowClick(account: Account) {
  navigation.push(accountLink(account)).catch(() => {});
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.accounts-list-page {
  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(2);
    margin-bottom: size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      min-width: 220px;

      .label {
        font-size: size(1.5);
        color: theme-color('content-tertiary');
      }

      input {
        padding: size(1.25);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }

    &-error {
      color: theme-color('error');
      font-size: size(1.3);
    }
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 2.5fr 0.5fr 0.5fr;
  }

  &__mobile-card {
    padding: size(2) size(4);
  }

  &__mobile-row {
    display: flex;
    align-items: center;

    &-label {
      text-align: left;
      width: size(12);
      padding: size(1);
      margin-right: size(1);
    }

    &-id {
      @include xxs {
        width: 53vw;
      }
      @include xs {
        width: auto;
      }
    }
  }

  &__container {
    display: grid;
    grid-template-columns: 1fr;
  }

  hr {
    display: none;
  }
}
</style>
