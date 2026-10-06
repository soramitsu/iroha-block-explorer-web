<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import type { Account, AccountSearchParams, AssetDefinition, NFT } from '@/shared/api/schemas';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import { parseMetadata } from '@/shared/ui/utils/json';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import invariant from 'tiny-invariant';
import type { TabAssets } from '@/features/filter/assets/model';
import { ASSETS_OPTIONS } from '@/features/filter/assets/model';
import { useI18n } from 'vue-i18n';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { getPreferredAccountId } from '@/shared/lib/account-id';
import { normalizeAssetDefinitionSelectorLiteral } from '@/shared/lib/asset-definition-literal';
import { getAssetDefinitionDisplayName } from '@/shared/lib/asset-definition-id';
import { parseOptionalFilterCatching } from '@/shared/lib/optional-filter';

const { t } = useI18n();
const router = useRouter();

const accountHashType = useAdaptiveHash({ xs: 'short', xxs: 'short' }, 'medium');
const domainAccountsHashType = useAdaptiveHash({ sm: 'short', xs: 'two-line', xxs: 'two-line' }, 'medium');

const domainId = computed(() => {
  const id = router.currentRoute.value.params['id'];

  invariant(typeof id === 'string', 'Expected string');

  return id;
});

const domainScope = useParamScope(domainId, (value) => setupAsyncData(() => http.fetchDomain(value)));

const domainSnapshot = computed(() => domainScope.value.expose.snapshot);
const domain = computed(() =>
  domainScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? domainScope.value.expose.data.data : undefined
);
const domainAssets = computed(() => domain.value?.assets ?? 0);
const domainNFTs = computed(() => domain.value?.nfts ?? 0);
const domainAccounts = computed(() => domain.value?.accounts ?? 0);

const assetsTab = ref<TabAssets>('assets');
const isCryptoAssetsSelected = computed(() => assetsTab.value === 'assets');

const assetsListState = reactive({
  cursor: null as string | null,
  limit: 10,
  domain: domainId.value,
});

watch([() => assetsListState.limit, () => assetsTab.value], () => {
  assetsListState.cursor = null;
});

watch(
  domainId,
  (next) => {
    assetsListState.domain = next;
    assetsListState.cursor = null;
  }
);

const assetsListScope = useParamScope(
  () => {
    if (!isCryptoAssetsSelected.value || !domainAssets.value) return null;

    return {
      key: JSON.stringify(assetsListState),
      payload: assetsListState,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinitions(payload))
);

const isAssetsListLoading = computed(() => !!assetsListScope.value?.expose.isLoading);
const assets = computed(() =>
  assetsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsListScope.value.expose.data.data.items : []
);
const assetsPagination = computed(() =>
  assetsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsListScope.value.expose.data.data
    : null
);
const assetDefinitionRowKey = (item: AssetDefinition) => item.id.toString();
const domainAssetDefinitionName = (assetDefinition: AssetDefinition) => getAssetDefinitionDisplayName(assetDefinition);

const NFTsListScope = useParamScope(
  () => {
    if (isCryptoAssetsSelected.value || !domainNFTs.value) return null;

    return {
      key: JSON.stringify(assetsListState),
      payload: assetsListState,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchNFTs(payload))
);

const isNFTsListLoading = computed(() => !!NFTsListScope.value?.expose.isLoading);
const NFTs = computed(() =>
  NFTsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? NFTsListScope.value.expose.data.data.items : []
);
const NFTsPagination = computed(() =>
  NFTsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? NFTsListScope.value.expose.data.data
    : null
);
const nftRowKey = (item: NFT) => item.id.toString();
const nftDisplayName = (item: NFT) => item.id.split('$')[0] ?? item.id;

const accountsListState = reactive({
  cursor: null as string | null,
  limit: 10,
  domain: domainId.value,
});
const accountAssetFilter = ref('');
function parseAssetSelector(value: string): string {
  const normalized = normalizeAssetDefinitionSelectorLiteral(value);
  if (!normalized) throw new Error('invalid asset selector');
  return normalized;
}
const accountAssetFilterState = computed(() =>
  parseOptionalFilterCatching(accountAssetFilter.value, parseAssetSelector, t('accounts.filters.assetInvalid'))
);
const parsedAccountAssetFilter = computed<string | undefined>(() => accountAssetFilterState.value.value);
const accountAssetFilterError = computed(() => accountAssetFilterState.value.error);

watch(
  () => accountsListState.limit,
  () => {
    accountsListState.cursor = null;
  }
);

watch(accountAssetFilter, () => {
  accountsListState.cursor = null;
});

watch(
  domainId,
  (next) => {
    accountsListState.domain = next;
    accountsListState.cursor = null;
  }
);

const accountsListScope = useParamScope(
  () => {
    if (!domainAccounts.value || accountAssetFilterError.value) return null;

    const payload: AccountSearchParams = {
      cursor: accountsListState.cursor,
      limit: accountsListState.limit,
      domain: accountsListState.domain,
      ...(parsedAccountAssetFilter.value ? { with_asset: parsedAccountAssetFilter.value } : {}),
    };

    return {
      key: JSON.stringify({
        ...accountsListState,
        with_asset: parsedAccountAssetFilter.value?.toString(),
      }),
      payload,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAccounts(payload))
);

const isAccountsListLoading = computed(() => !!accountsListScope.value?.expose.isLoading);
const accounts = computed(() =>
  accountsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? accountsListScope.value.expose.data.data.items
    : []
);
const accountsPagination = computed(() =>
  accountsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? accountsListScope.value.expose.data.data
    : null
);
const accountDisplayId = (item: Account) => getPreferredAccountId(item);
const accountLink = (item: Account) => `/accounts/${encodeURIComponent(accountDisplayId(item))}`;
const accountRowKey = (item: Account) => accountDisplayId(item);

const domainAssetsSection = computed(() => {
  if (isCryptoAssetsSelected.value)
    return {
      title: t('domains.domainAssets'),
      isZero: !domainAssets.value,
      zeroTitle: t('domains.domainDoesntHaveAnyAssets'),
    };

  return {
    title: t('domains.domainNFTs'),
    isZero: !domainNFTs.value,
    zeroTitle: t('domains.domainDoesntHaveAnyNFTs'),
  };
});
</script>

<template>
  <div class="domain-details">
    <div class="domain-details__native">
      <BaseContentBlock
        :title="$t('domain')"
        class="domain-details__native-information"
      >
        <template #default>
          <BaseResourceState
            :snapshot="domainSnapshot"
            loading-label="Loading domain"
            not-found-label="Domain not found"
            error-label="Domain could not be loaded"
            retry-label="Retry domain"
            @retry="domainScope.expose.refetch()"
          >
            <div v-if="domain">
              <div class="domain-details__native-information-row">
                <DataField
                  :title="$t('domains.domainId')"
                  :hash="domainId"
                />

                <DataField
                  :title="$t('domains.ownedBy')"
                  :hash="domain.owned_by.toString()"
                  copy
                  :link="`/accounts/${domain.owned_by}`"
                  :type="accountHashType"
                />

                <DataField
                  :title="$t('metadata')"
                  :value="parseMetadata(domain.metadata)"
                  :metadata="{ display: 'short' }"
                />
              </div>
            </div>
          </BaseResourceState>
        </template>
      </BaseContentBlock>

      <BaseContentBlock
        v-if="domain"
        :title="domainAssetsSection.title"
        class="domain-details__native-assets"
      >
        <template #header-action>
          <BaseTabs
            v-model="assetsTab"
            :items="ASSETS_OPTIONS"
          />
        </template>
        <template #default>
          <span
            v-if="domainAssetsSection.isZero"
            class="domain-details__native-assets_empty row-text"
          >
            {{ domainAssetsSection.zeroTitle }}
          </span>
          <BaseTable
            v-else-if="isCryptoAssetsSelected"
            v-model:cursor="assetsListState.cursor"
            v-model:page-size="assetsListState.limit"
            :loading="isAssetsListLoading"
            pagination-mode="cursor"
            :cursor-pagination="assetsPagination"
            :items="assets"
            :row-key="assetDefinitionRowKey"
            container-class="domain-details__native-assets-list"
            :breakpoint="960"
          >
            <template #header>
              <div
                class="domain-details__native-assets-list-row"
                role="presentation"
              >
                <span class="h-sm" role="columnheader">{{ $t('name') }}</span>
                <span class="h-sm" role="columnheader">{{ $t('mintable') }}</span>
              </div>
            </template>

            <template #row="{ item }">
              <div
                class="domain-details__native-assets-list-row"
                role="presentation"
              >
                <div role="cell">
                  <BaseLink :to="`/assets/${encodeURIComponent(item.id.toString())}`">
                    {{ domainAssetDefinitionName(item) }}
                  </BaseLink>
                </div>
                <span class="row-text" role="cell">{{ item.mintable }}</span>
              </div>
            </template>

            <template #mobile-card="{ item }">
              <div class="domain-details__native-assets-mobile-list-row">
                <div class="domain-details__native-assets-mobile-list-row-data row-text">
                  <span class="h-sm">{{ $t('name') }}</span>
                  <BaseLink :to="`/assets/${encodeURIComponent(item.id.toString())}`">
                    {{ domainAssetDefinitionName(item) }}
                  </BaseLink>
                </div>

                <div class="domain-details__native-assets-mobile-list-row-data row-text">
                  <span class="h-sm">{{ $t('mintable') }}</span>
                  <span>{{ item.mintable }}</span>
                </div>
              </div>
            </template>
          </BaseTable>
          <BaseTable
            v-else
            v-model:cursor="assetsListState.cursor"
            v-model:page-size="assetsListState.limit"
            :loading="isNFTsListLoading"
            pagination-mode="cursor"
            :cursor-pagination="NFTsPagination"
            :items="NFTs"
            :row-key="nftRowKey"
            container-class="domain-details__native-assets-list"
            :breakpoint="960"
          >
            <template #header>
              <div
                class="domain-details__native-nfts-list-row"
                role="presentation"
              >
                <span class="h-sm" role="columnheader">{{ $t('name') }}</span>
              </div>
            </template>

            <template #row="{ item }">
              <div
                class="domain-details__native-nfts-list-row"
                role="presentation"
              >
                <div role="cell">
                  <BaseLink :to="`/nfts/${encodeURIComponent(item.id.toString())}`">
                    {{ nftDisplayName(item) }}
                  </BaseLink>
                </div>
              </div>
            </template>

            <template #mobile-card="{ item }">
              <div class="domain-details__native-nfts-mobile-list-row">
                <div class="domain-details__native-nfts-mobile-list-row-data row-text">
                  <span class="h-sm">{{ $t('name') }}</span>
                  <BaseLink :to="`/nfts/${encodeURIComponent(item.id.toString())}`">
                    {{ nftDisplayName(item) }}
                  </BaseLink>
                </div>
              </div>
            </template>
          </BaseTable>
        </template>
      </BaseContentBlock>
    </div>

    <div
      v-if="domain"
      class="domain-details__accounts"
    >
      <BaseContentBlock :title="$t('domains.domainAccounts')">
        <template #default>
          <div class="domain-details__accounts-filters">
            <label>
              <span class="label">{{ $t('accounts.filters.assetLabel') }}</span>
              <input
                v-model="accountAssetFilter"
                type="text"
                :placeholder="$t('accounts.filters.assetPlaceholder')"
              >
              <small
                v-if="accountAssetFilterError"
                class="domain-details__accounts-error"
              >
                {{ accountAssetFilterError }}
              </small>
            </label>
          </div>
          <span
            v-if="!domainAccounts"
            class="domain-details__accounts_empty row-text"
          >
            {{ $t('domains.domainDoesntHaveAnyAccounts') }}
          </span>
          <BaseTable
            v-else
            v-model:cursor="accountsListState.cursor"
            v-model:page-size="accountsListState.limit"
            :loading="isAccountsListLoading"
            pagination-mode="cursor"
            :cursor-pagination="accountsPagination"
            :items="accounts"
            :row-key="accountRowKey"
            container-class="domain-details__accounts-container"
            :breakpoint="960"
          >
            <template #header>
              <div
                class="domain-details__accounts-row"
                role="presentation"
              >
                <span class="h-sm" role="columnheader">{{ $t('accounts.accountId') }}</span>
              </div>
            </template>

            <template #row="{ item }">
              <div
                class="domain-details__accounts-row"
                role="presentation"
              >
                <div role="cell">
                  <BaseHash
                    :hash="accountDisplayId(item)"
                    :link="accountLink(item)"
                    :type="domainAccountsHashType"
                    copy
                  />
                </div>
              </div>
            </template>

            <template #mobile-card="{ item }">
              <div class="domain-details__accounts-mobile-card">
                <div class="domain-details__accounts-mobile-row">
                  <span class="h-sm domain-details__accounts-mobile-label">{{ $t('accounts.accountId') }}</span>
                  <BaseHash
                    :hash="accountDisplayId(item)"
                    :link="accountLink(item)"
                    :type="domainAccountsHashType"
                    copy
                  />
                </div>
              </div>
            </template>
          </BaseTable>
        </template>
      </BaseContentBlock>
    </div>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.domain-details {
  display: flex;

  @include xxs {
    gap: size(2);
    padding: 0 size(3);
    flex-direction: column;
  }

  @include lg {
    flex-direction: row;
  }

  &__native {
    display: flex;
    flex-direction: column;

    @include xxs {
      width: 85vw;
    }

    @include lg {
      width: 60%;
    }

    @include xl {
      width: calc(size(45) + 20vw);
    }
    @include xxl {
      width: calc(size(70) + 10vw);
    }
    &-information {
      margin-bottom: size(2);

      &_loading {
        margin-top: size(1);
        display: flex;
        justify-content: center;
        align-items: center;
      }

      &-row {
        margin-top: size(2);
        padding: 0 size(2) 0 size(4);

        display: flex;
        flex-direction: column;
        gap: size(2);
      }
    }

    &-assets {
      .base-content-block__body:has(.domain-details__native-assets_empty) {
        padding: size(0) size(4) size(4);
      }

      .base-table > .content-row {
        display: flex;
      }

      .content-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        padding: 0 size(4);
      }

      hr {
        display: none;
      }
    }

    &-assets-list,
    &-nfts-list {
      display: grid;

      @include sm {
        .base-table__mobile-card:nth-last-child(2) {
          border-bottom: 1px solid theme-color('border-primary');
        }
      }

      @include xxs {
        grid-template-columns: 1fr;
      }

      @include sm {
        grid-template-columns: 1fr 1fr;
      }

      @include md {
        grid-template-columns: 1fr;
      }

      &-row {
        display: grid;

        @include md {
          grid-template-columns: size(35) size(20);
        }
      }
    }

    &-nfts-list {
      grid-template-columns: 1fr;
    }

    &-assets-mobile-list,
    &-nfts-mobile-list {
      &-row {
        display: flex;
        flex-direction: column;
        padding: size(2) size(4);
        @include xxs {
          width: 100%;
        }
        @include sm {
          width: 45vw;
        }

        &-data {
          display: flex;
          align-items: center;
          margin-top: size(2);

          span:first-child {
            width: size(10);
          }
        }
      }
    }
  }

  &__accounts {
    .base-content-block__body:has(.domain-details__accounts_empty) {
      padding: size(0) size(4) size(4);
    }

    hr {
      display: none;
    }

    @include xxs {
      width: 85vw;
    }

    @include lg {
      width: 60%;
    }
    @include xl {
      width: calc(size(45) + 20vw);
    }
    @include xxl {
      width: calc(size(60) + 10vw);
    }

    &-filters {
      display: flex;
      flex-wrap: wrap;
      gap: size(2);
      margin-bottom: size(2);

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
    }

  &-error {
    color: theme-color('error');
    font-size: size(1.3);
  }

    .content-row {
      padding: 0 size(4);
    }

    &-row {
      width: 100%;
    }

    &-mobile-card {
      padding: size(2) size(4);
    }

    &-mobile-row {
      display: flex;
      align-items: center;

      .base-hash {
        word-break: break-all;
      }
    }

    &-mobile-label {
      width: size(12);
    }
  }
}
</style>
