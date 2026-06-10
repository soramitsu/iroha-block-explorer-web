<script setup lang="ts">
import * as http from '@/shared/api';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import { computed, reactive, ref, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import type { TabAssetsList } from '@/features/filter/assets/model';
import { ASSETS_LIST_OPTIONS } from '@/features/filter/assets/model';
import { useI18n } from 'vue-i18n';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import { useRouter, type LocationQueryRaw } from 'vue-router';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Asset, AssetDefinition, NFT, RWA } from '@/shared/api/schemas';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { getRwaDomain } from '@/shared/lib/rwa-id';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { parseOptionalFilter } from '@/shared/lib/optional-filter';

const { t } = useI18n();
const router = useRouter();
const navigation = useScopedExplorerNavigation();

const hashType = useAdaptiveHash(
  {
    md: 'short',
    sm: 'medium',
    xxs: 'two-line',
    xs: 'two-line',
  },
  'full'
);

const listState = reactive({
  page: 1,
  per_page: 10,
});

const assetFilters = reactive({
  domain: '',
  owner: '',
});
const nftFilters = reactive({
  domain: '',
  owner: '',
});
const rwaFilters = reactive({
  domain: '',
  owner: '',
});
const ownerFilterState = computed(() =>
  parseOptionalFilter(assetFilters.owner, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedOwnerFilter = computed<string | undefined>(() => ownerFilterState.value.value);
const ownerFilterError = computed(() => ownerFilterState.value.error);
const nftOwnerFilterState = computed(() =>
  parseOptionalFilter(nftFilters.owner, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedNftOwnerFilter = computed<string | undefined>(() => nftOwnerFilterState.value.value);
const nftOwnerFilterError = computed(() => nftOwnerFilterState.value.error);
const rwaOwnerFilterState = computed(() =>
  parseOptionalFilter(rwaFilters.owner, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedRwaOwnerFilter = computed<string | undefined>(() => rwaOwnerFilterState.value.value);
const rwaOwnerFilterError = computed(() => rwaOwnerFilterState.value.error);

function deriveTabFromRoute(): TabAssetsList {
  const route = router.currentRoute.value;
  if (route.name === 'rwas') return 'rwa';
  if (route.name === 'nfts') return 'nft';
  const view = route.query.view;
  if (route.name === 'assets' && view === 'holders') return 'holders';
  return 'assets';
}

const assetsTab = ref<TabAssetsList>(deriveTabFromRoute());

watch(
  () => [router.currentRoute.value.name, router.currentRoute.value.query.view] as const,
  () => {
    assetsTab.value = deriveTabFromRoute();
  }
);

watch(assetsTab, () => {
  if (assetsTab.value === deriveTabFromRoute()) return;

  if (assetsTab.value === 'rwa') {
    navigation.push('/rwas').catch(() => {});
    return;
  }

  if (assetsTab.value === 'nft') {
    navigation.push('/nfts').catch(() => {});
    return;
  }

  const query: LocationQueryRaw = { ...router.currentRoute.value.query };
  if (assetsTab.value === 'holders') query.view = 'holders';
  else delete query.view;
  navigation.push({ path: '/assets', query }).catch(() => {});
});

const tableTitle = computed(() => {
  switch (assetsTab.value) {
    case 'rwa':
      return t('assets.rwas');
    case 'nft':
      return t('assets.nfts');
    case 'holders':
      return t('assets.assetHolders');
    default:
      return t('assets.assets');
  }
});

const assetDefinitionParams = computed(() => ({
  page: listState.page,
  per_page: listState.per_page,
  domain: assetFilters.domain.trim() || undefined,
  owned_by: parsedOwnerFilter.value,
}));
const assetsScope = useParamScope(
  () => {
    if (assetsTab.value !== 'assets') return null;

    return {
      key: JSON.stringify({
        page: assetDefinitionParams.value.page,
        per_page: assetDefinitionParams.value.per_page,
        domain: assetFilters.domain.trim() || null,
        owned_by: parsedOwnerFilter.value?.toString() ?? null,
      }),
      payload: assetDefinitionParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinitions(payload))
);

const isAssetDefinitionsLoading = computed(() => !!assetsScope.value?.expose.isLoading);
const totalAssetDefinitions = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsScope.value.expose.data.data.pagination.total_items
    : 0
);
const assetDefinitions = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsScope.value.expose.data.data.items : []
);
const assetDefinitionRowKey = (item: AssetDefinition) => item.id.toString();

const holderFilter = ref('');
const holderFilterState = computed(() =>
  parseOptionalFilter(holderFilter.value, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedHolderFilter = computed<string | undefined>(() => holderFilterState.value.value);
const holderFilterError = computed(() => holderFilterState.value.error);

const assetInstancesParams = computed(() => ({
  page: listState.page,
  per_page: listState.per_page,
  owned_by: parsedHolderFilter.value,
}));

const assetsInstancesScope = useParamScope(
  () => {
    if (assetsTab.value !== 'holders' || !parsedHolderFilter.value) return null;

    return {
      key: JSON.stringify({
        page: assetInstancesParams.value.page,
        per_page: assetInstancesParams.value.per_page,
        owned_by: parsedHolderFilter.value?.toString() ?? null,
      }),
      payload: assetInstancesParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssets(payload))
);

const isAssetInstancesLoading = computed(() => !!assetsInstancesScope.value?.expose.isLoading);
const totalAssetInstances = computed(() =>
  assetsInstancesScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsInstancesScope.value.expose.data.data.pagination.total_items
    : 0
);
const assetInstances = computed(() =>
  assetsInstancesScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsInstancesScope.value.expose.data.data.items : []
);
const assetInstanceRowKey = (item: Asset) => item.id;

const nftParams = computed(() => ({
  page: listState.page,
  per_page: listState.per_page,
  domain: nftFilters.domain.trim() || undefined,
  owned_by: parsedNftOwnerFilter.value,
}));

const NFTsScope = useParamScope(
  () => {
    if (assetsTab.value !== 'nft') return null;

    return {
      key: JSON.stringify({
        page: nftParams.value.page,
        per_page: nftParams.value.per_page,
        domain: nftFilters.domain.trim() || null,
        owned_by: parsedNftOwnerFilter.value?.toString() ?? null,
      }),
      payload: nftParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchNFTs(payload))
);

const isNFTsLoading = computed(() => !!NFTsScope.value?.expose.isLoading);
const totalNFTs = computed(() =>
  NFTsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? NFTsScope.value.expose.data.data.pagination.total_items
    : 0
);
const NFTs = computed(() =>
  NFTsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? NFTsScope.value.expose.data.data.items : []
);
const nftRowKey = (item: NFT) => item.id.toString();

const rwaParams = computed(() => ({
  page: listState.page,
  per_page: listState.per_page,
  domain: rwaFilters.domain.trim() || undefined,
  owned_by: parsedRwaOwnerFilter.value,
}));

const rwasScope = useParamScope(
  () => {
    if (assetsTab.value !== 'rwa') return null;

    return {
      key: JSON.stringify({
        page: rwaParams.value.page,
        per_page: rwaParams.value.per_page,
        domain: rwaFilters.domain.trim() || null,
        owned_by: parsedRwaOwnerFilter.value?.toString() ?? null,
      }),
      payload: rwaParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchRwas(payload))
);

const isRwasLoading = computed(() => !!rwasScope.value?.expose.isLoading);
const totalRwas = computed(() =>
  rwasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? rwasScope.value.expose.data.data.pagination.total_items : 0
);
const rwas = computed(() =>
  rwasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? rwasScope.value.expose.data.data.items : []
);
const rwaRowKey = (item: RWA) => item.id;

watch([() => listState.per_page, () => assetsTab.value], () => {
  listState.page = 1;
});

watch([() => assetFilters.domain, parsedOwnerFilter], () => {
  if (assetsTab.value !== 'assets') return;
  listState.page = 1;
});

watch(parsedHolderFilter, () => {
  if (assetsTab.value !== 'holders') return;
  listState.page = 1;
});

watch([() => nftFilters.domain, parsedNftOwnerFilter], () => {
  if (assetsTab.value !== 'nft') return;
  listState.page = 1;
});

watch([() => rwaFilters.domain, parsedRwaOwnerFilter], () => {
  if (assetsTab.value !== 'rwa') return;
  listState.page = 1;
});
</script>

<template>
  <BaseContentBlock
    :title="tableTitle"
    class="assets-list-page"
  >
    <template #header-action>
      <BaseTabs
        v-model="assetsTab"
        :items="ASSETS_LIST_OPTIONS"
      />
    </template>
    <template v-if="assetsTab === 'assets'">
      <div class="assets-list-page__filters">
        <label>
          <span class="label">{{ $t('assets.filters.domainLabel') }}</span>
          <input
            v-model="assetFilters.domain"
            type="text"
            :placeholder="$t('assets.filters.domainPlaceholder')"
          >
        </label>
        <label>
          <span class="label">{{ $t('assets.filters.ownerLabel') }}</span>
          <input
            v-model="assetFilters.owner"
            type="text"
            :placeholder="$t('assets.filters.ownerPlaceholder')"
          >
          <small
            v-if="ownerFilterError"
            class="assets-list-page__filters-error"
          >
            {{ ownerFilterError }}
          </small>
        </label>
      </div>

      <BaseTable
        v-model:page="listState.page"
        v-model:page-size="listState.per_page"
        :loading="isAssetDefinitionsLoading"
        :total="totalAssetDefinitions"
        :items="assetDefinitions"
        :row-key="assetDefinitionRowKey"
        container-class="assets-list-page__container"
      >
        <template #header>
          <div class="assets-list-page__row">
            <span class="h-sm cell">{{ $t('sorafs.columns.alias') }}</span>
            <span class="h-sm cell">{{ $t('id') }}</span>
            <span class="h-sm cell">{{ $t('mintable') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div class="assets-list-page__row">
            <BaseLink
              v-if="item.alias"
              :to="`/assets/${encodeURIComponent(item.id.toString())}`"
              class="cell"
            >
              {{ item.alias }}
            </BaseLink>
            <span
              v-else
              class="cell"
            >-</span>

            <BaseHash
              :hash="item.id.toString()"
              :link="`/assets/${encodeURIComponent(item.id.toString())}`"
              :type="hashType"
              copy
              class="cell"
            />

            <span class="cell row-text">
              {{ item.mintable }}
            </span>
          </div>
        </template>

        <template #mobile-card="{ item }">
          <div class="assets-list-page__mobile-card">
            <div class="assets-list-page__mobile-row">
              <span class="h-sm assets-list-page__mobile-label">{{ $t('sorafs.columns.alias') }}</span>

              <BaseLink
                v-if="item.alias"
                :to="`/assets/${encodeURIComponent(item.id.toString())}`"
              >
                {{ item.alias }}
              </BaseLink>
              <span
                v-else
                class="row-text-monospace"
              >-</span>
            </div>

            <div class="assets-list-page__mobile-row">
              <span class="h-sm assets-list-page__mobile-label">{{ $t('id') }}</span>
              <BaseHash
                :hash="item.id.toString()"
                :link="`/assets/${encodeURIComponent(item.id.toString())}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="assets-list-page__mobile-row">
              <span class="h-sm assets-list-page__mobile-label">{{ $t('mintable') }}</span>
              <span class="row-text">{{ item.mintable }}</span>
            </div>
          </div>
        </template>
      </BaseTable>
    </template>

    <template v-else-if="assetsTab === 'holders'">
      <div class="assets-list-page__filters">
        <label>
          <span class="label">{{ $t('assets.filters.holderLabel') }}</span>
          <input
            v-model="holderFilter"
            type="text"
            :placeholder="$t('assets.filters.holderPlaceholder')"
          >
          <small
            v-if="holderFilterError"
            class="assets-list-page__filters-error"
          >
            {{ holderFilterError }}
          </small>
        </label>
      </div>

      <BaseTable
        v-model:page="listState.page"
        v-model:page-size="listState.per_page"
        :loading="isAssetInstancesLoading"
        :total="totalAssetInstances"
        :items="assetInstances"
        :row-key="assetInstanceRowKey"
        container-class="assets-list-page__container"
        :breakpoint="1200"
      >
        <template #header>
          <div class="assets-instances-list-page__row">
            <span class="h-sm cell">{{ $t('sorafs.columns.alias') }}</span>
            <span class="h-sm cell">{{ $t('id') }}</span>
            <span class="h-sm cell">{{ $t('accountId') }}</span>
            <span class="h-sm cell">{{ $t('value') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div class="assets-instances-list-page__row">
            <BaseLink
              v-if="item.asset_alias"
              :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
              class="cell"
            >
              {{ item.asset_alias }}
            </BaseLink>
            <span
              v-else
              class="cell"
            >-</span>

            <BaseHash
              :hash="item.definition_id.toString()"
              :link="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
              :type="hashType"
              copy
              class="cell"
            />

            <BaseHash
              :hash="item.account_id.toString()"
              :link="`/accounts/${item.account_id.toString()}`"
              :type="hashType"
              copy
              class="cell"
            />

            <span class="row-text-monospace cell">{{ item.value.toString() }}</span>
          </div>
        </template>

        <template #mobile-card="{ item }">
          <div class="assets-instances-list-page__mobile-card">
            <div class="assets-instances-list-page__mobile-row">
              <span class="h-sm assets-instances-list-page__mobile-label">{{ $t('sorafs.columns.alias') }}</span>
              <BaseLink
                v-if="item.asset_alias"
                :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
              >
                {{ item.asset_alias }}
              </BaseLink>
              <span
                v-else
                class="row-text-monospace"
              >-</span>
            </div>

            <div class="assets-instances-list-page__mobile-row">
              <span class="h-sm assets-instances-list-page__mobile-label">{{ $t('id') }}</span>
              <BaseHash
                :hash="item.definition_id.toString()"
                :link="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="assets-instances-list-page__mobile-row">
              <span class="h-sm assets-instances-list-page__mobile-label">{{ $t('accountId') }}</span>
              <BaseHash
                :hash="item.account_id.toString()"
                :link="`/accounts/${item.account_id.toString()}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="assets-instances-list-page__mobile-row">
              <span class="h-sm assets-instances-list-page__mobile-label">{{ $t('value') }}</span>
              <span class="row-text-monospace">{{ item.value.toString() }}</span>
            </div>
          </div>
        </template>
      </BaseTable>
    </template>

    <template v-else-if="assetsTab === 'rwa'">
      <div class="rwas-list-page__filters">
        <label>
          <span class="label">{{ $t('assets.filters.domainLabel') }}</span>
          <input
            v-model="rwaFilters.domain"
            type="text"
            :placeholder="$t('assets.filters.domainPlaceholder')"
          >
        </label>
        <label>
          <span class="label">{{ $t('assets.filters.ownerLabel') }}</span>
          <input
            v-model="rwaFilters.owner"
            type="text"
            :placeholder="$t('assets.filters.ownerPlaceholder')"
          >
          <small
            v-if="rwaOwnerFilterError"
            class="rwas-list-page__filters-error"
          >
            {{ rwaOwnerFilterError }}
          </small>
        </label>
      </div>

      <BaseTable
        v-model:page="listState.page"
        v-model:page-size="listState.per_page"
        :loading="isRwasLoading"
        :total="totalRwas"
        :items="rwas"
        :row-key="rwaRowKey"
        container-class="rwas-list-page__container"
        :breakpoint="1200"
      >
        <template #header>
          <div class="rwas-list-page__row">
            <span class="h-sm cell">{{ $t('id') }}</span>
            <span class="h-sm cell">{{ $t('domain') }}</span>
            <span class="h-sm cell">{{ $t('assets.ownedBy') }}</span>
            <span class="h-sm cell">{{ $t('value') }}</span>
            <span class="h-sm cell">{{ $t('assets.heldQuantity') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div class="rwas-list-page__row">
            <BaseHash
              :hash="item.id"
              :link="`/rwas/${encodeURIComponent(item.id)}`"
              :type="hashType"
              copy
              class="cell"
            />

            <BaseLink
              v-if="getRwaDomain(item.id)"
              :to="`/domains/${getRwaDomain(item.id)}`"
              class="cell"
            >
              {{ getRwaDomain(item.id) }}
            </BaseLink>
            <span
              v-else
              class="cell row-text-monospace"
            >-</span>

            <BaseHash
              :hash="item.owned_by.toString()"
              :link="`/accounts/${item.owned_by}`"
              :type="hashType"
              copy
              class="cell"
            />

            <span class="row-text-monospace cell">{{ item.quantity.toString() }}</span>
            <span class="row-text-monospace cell">{{ item.held_quantity.toString() }}</span>
          </div>
        </template>

        <template #mobile-card="{ item }">
          <div class="rwas-list-page__mobile-card">
            <div class="rwas-list-page__mobile-row">
              <span class="h-sm rwas-list-page__mobile-label">{{ $t('id') }}</span>
              <BaseHash
                :hash="item.id"
                :link="`/rwas/${encodeURIComponent(item.id)}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="rwas-list-page__mobile-row">
              <span class="h-sm rwas-list-page__mobile-label">{{ $t('domain') }}</span>
              <BaseLink
                v-if="getRwaDomain(item.id)"
                :to="`/domains/${getRwaDomain(item.id)}`"
              >
                {{ getRwaDomain(item.id) }}
              </BaseLink>
              <span
                v-else
                class="row-text-monospace"
              >-</span>
            </div>

            <div class="rwas-list-page__mobile-row">
              <span class="h-sm rwas-list-page__mobile-label">{{ $t('assets.ownedBy') }}</span>
              <BaseHash
                :hash="item.owned_by.toString()"
                :link="`/accounts/${item.owned_by}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="rwas-list-page__mobile-row">
              <span class="h-sm rwas-list-page__mobile-label">{{ $t('value') }}</span>
              <span class="row-text-monospace">{{ item.quantity.toString() }}</span>
            </div>

            <div class="rwas-list-page__mobile-row">
              <span class="h-sm rwas-list-page__mobile-label">{{ $t('assets.heldQuantity') }}</span>
              <span class="row-text-monospace">{{ item.held_quantity.toString() }}</span>
            </div>
          </div>
        </template>
      </BaseTable>
    </template>

    <template v-else>
      <div class="nfts-list-page__filters">
        <label>
          <span class="label">{{ $t('assets.filters.domainLabel') }}</span>
          <input
            v-model="nftFilters.domain"
            type="text"
            :placeholder="$t('assets.filters.domainPlaceholder')"
          >
        </label>
        <label>
          <span class="label">{{ $t('assets.filters.ownerLabel') }}</span>
          <input
            v-model="nftFilters.owner"
            type="text"
            :placeholder="$t('assets.filters.ownerPlaceholder')"
          >
          <small
            v-if="nftOwnerFilterError"
            class="nfts-list-page__filters-error"
          >
            {{ nftOwnerFilterError }}
          </small>
        </label>
      </div>

      <BaseTable
        v-model:page="listState.page"
        v-model:page-size="listState.per_page"
        :loading="isNFTsLoading"
        :total="totalNFTs"
        :items="NFTs"
        :row-key="nftRowKey"
        container-class="nfts-list-page__container"
      >
        <template #header>
          <div class="nfts-list-page__row">
            <span class="h-sm cell">{{ $t('name') }}</span>
            <span class="h-sm cell">{{ $t('assets.ownedBy') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div class="nfts-list-page__row">
            <BaseLink
              :to="`/nfts/${encodeURIComponent(item.id.toString())}`"
              class="cell"
            >
              {{ item.id.toString() }}
            </BaseLink>

            <BaseHash
              :hash="item.owned_by.toString()"
              :link="`/accounts/${item.owned_by}`"
              :type="hashType"
              class="cell"
              copy
            />
          </div>
        </template>

        <template #mobile-card="{ item }">
          <div class="nfts-list-page__mobile-card">
            <div class="nfts-list-page__mobile-row">
              <span class="h-sm nfts-list-page__mobile-label">{{ $t('name') }}</span>

              <BaseLink :to="`/nfts/${encodeURIComponent(item.id.toString())}`">
                {{ item.id.toString() }}
              </BaseLink>
            </div>

            <div class="nfts-list-page__mobile-row">
              <span class="h-sm nfts-list-page__mobile-label">{{ $t('assets.ownedBy') }}</span>

              <BaseHash
                :hash="item.owned_by.toString()"
                :link="`/accounts/${item.owned_by}`"
                :type="hashType"
                copy
              />
            </div>
          </div>
        </template>
      </BaseTable>
    </template>
  </BaseContentBlock>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.assets-list-page {
  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(4) size(2);

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
}

.assets-list-page,
.nfts-list-page,
.rwas-list-page {
  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    justify-content: start;
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
    margin-right: size(3);
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

.assets-instances-list-page {
  &__row {
    width: 100%;
    display: grid;
    justify-content: start;

    @include lg {
      grid-template-columns: size(30) size(40) size(55) size(15);
    }

    @include xl {
      grid-template-columns: size(35) size(45) size(60) size(15);
    }

    @include xxl {
      grid-template-columns: size(40) size(50) size(65) size(15);
    }
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
    margin-right: size(3);
  }
}

.nfts-list-page {
  &__row {
    grid-template-columns: 0.25fr 1fr;
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(4) size(2);

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

  &__filters-error {
    color: theme-color('error');
    font-size: size(1.3);
  }
}

.nfts-list-page__row {
  grid-template-columns: 0.25fr 1fr;
}

.rwas-list-page {
  &__row {
    @include lg {
      grid-template-columns: size(40) size(25) size(55) size(15) size(15);
    }

    @include xl {
      grid-template-columns: size(45) size(30) size(60) size(15) size(15);
    }

    @include xxl {
      grid-template-columns: size(50) size(35) size(65) size(15) size(15);
    }
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(4) size(2);

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

  &__filters-error {
    color: theme-color('error');
    font-size: size(1.3);
  }
}
</style>
