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
import { firstRouteQueryValue } from '@/shared/lib/route-query';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';

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

const CURSOR_LIMITS = new Set([10, 20, 50, 100]);
const { route, cursor, limit, updateListQuery } = useCursorListRouteQuery();
const listLimit = computed({
  get: () => limit.value,
  set: (value: number) => {
    const normalized = CURSOR_LIMITS.has(value) ? value : 10;
    updateListQuery(
      { limit: normalized, page: null, per_page: null },
      { history: 'replace' }
    ).catch(() => undefined);
  },
});

function deriveTabFromRoute(): TabAssetsList {
  const currentRoute = router.currentRoute.value;
  if (currentRoute.name === 'rwas') return 'rwa';
  if (currentRoute.name === 'nfts') return 'nft';
  const view = currentRoute.query.view;
  if (currentRoute.name === 'assets' && view === 'holders') return 'holders';
  return 'assets';
}

const initialTab = deriveTabFromRoute();
const initialDomain = firstRouteQueryValue(route.query.domain) ?? '';
const initialOwner = firstRouteQueryValue(route.query.owner) ?? '';

const assetFilters = reactive({
  domain: initialTab === 'assets' ? initialDomain : '',
  owner: initialTab === 'assets' ? initialOwner : '',
});
const nftFilters = reactive({
  domain: initialTab === 'nft' ? initialDomain : '',
  owner: initialTab === 'nft' ? initialOwner : '',
});
const rwaFilters = reactive({
  domain: initialTab === 'rwa' ? initialDomain : '',
  owner: initialTab === 'rwa' ? initialOwner : '',
});
const holderFilter = ref(initialTab === 'holders' ? firstRouteQueryValue(route.query.holder) ?? '' : '');
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
const holderFilterState = computed(() =>
  parseOptionalFilter(holderFilter.value, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedHolderFilter = computed<string | undefined>(() => holderFilterState.value.value);
const holderFilterError = computed(() => holderFilterState.value.error);

const assetsTab = ref<TabAssetsList>(initialTab);
let syncingFiltersFromRoute = false;

function syncFiltersFromRoute() {
  const activeTab = deriveTabFromRoute();
  const domain = firstRouteQueryValue(route.query.domain) ?? '';
  const owner = firstRouteQueryValue(route.query.owner) ?? '';
  const holder = firstRouteQueryValue(route.query.holder) ?? '';

  syncingFiltersFromRoute = true;
  assetsTab.value = activeTab;
  if (activeTab === 'assets') {
    assetFilters.domain = domain;
    assetFilters.owner = owner;
  } else if (activeTab === 'nft') {
    nftFilters.domain = domain;
    nftFilters.owner = owner;
  } else if (activeTab === 'rwa') {
    rwaFilters.domain = domain;
    rwaFilters.owner = owner;
  } else {
    holderFilter.value = holder;
  }
  syncingFiltersFromRoute = false;
}

watch(
  () => [
    router.currentRoute.value.name,
    router.currentRoute.value.query.view,
    route.query.domain,
    route.query.owner,
    route.query.holder,
  ] as const,
  syncFiltersFromRoute,
  { flush: 'sync' }
);

function normalizedFilterForRoute(raw: string, normalized?: string): string | null {
  return normalized ?? (raw.trim() || null);
}

const filterBoundCursor = computed(() => {
  const routeDomain = firstRouteQueryValue(route.query.domain) ?? '';
  const routeOwner = firstRouteQueryValue(route.query.owner);
  const routeHolder = firstRouteQueryValue(route.query.holder);

  if (assetsTab.value === 'holders') {
    const holder = normalizedFilterForRoute(holderFilter.value, parsedHolderFilter.value);
    return holder === routeHolder ? cursor.value : null;
  }

  const filters = assetsTab.value === 'assets' ? assetFilters : assetsTab.value === 'nft' ? nftFilters : rwaFilters;
  const owner = assetsTab.value === 'assets'
    ? normalizedFilterForRoute(filters.owner, parsedOwnerFilter.value)
    : assetsTab.value === 'nft'
      ? normalizedFilterForRoute(filters.owner, parsedNftOwnerFilter.value)
      : normalizedFilterForRoute(filters.owner, parsedRwaOwnerFilter.value);
  return filters.domain.trim() === routeDomain && owner === routeOwner ? cursor.value : null;
});

function filtersForTab(tab: TabAssetsList): LocationQueryRaw {
  const query: LocationQueryRaw = {};
  if (listLimit.value !== 10) query.limit = String(listLimit.value);

  if (tab === 'holders') {
    query.view = 'holders';
    const holder = normalizedFilterForRoute(holderFilter.value, parsedHolderFilter.value);
    if (holder) query.holder = holder;
    return query;
  }

  const filters = tab === 'assets' ? assetFilters : tab === 'nft' ? nftFilters : rwaFilters;
  const owner = tab === 'assets'
    ? normalizedFilterForRoute(filters.owner, parsedOwnerFilter.value)
    : tab === 'nft'
      ? normalizedFilterForRoute(filters.owner, parsedNftOwnerFilter.value)
      : normalizedFilterForRoute(filters.owner, parsedRwaOwnerFilter.value);
  const domain = filters.domain.trim();
  if (domain) query.domain = domain;
  if (owner) query.owner = owner;
  return query;
}

watch(assetsTab, () => {
  if (assetsTab.value === deriveTabFromRoute()) return;

  const path = assetsTab.value === 'rwa' ? '/rwas' : assetsTab.value === 'nft' ? '/nfts' : '/assets';
  navigation.push({ path, query: filtersForTab(assetsTab.value) }).catch(() => {});
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
  cursor: filterBoundCursor.value,
  limit: listLimit.value,
  domain: assetFilters.domain.trim() || undefined,
  owned_by: parsedOwnerFilter.value,
}));
const assetsScope = useParamScope(
  () => {
    if (
      assetsTab.value !== 'assets'
      || deriveTabFromRoute() !== 'assets'
      || ownerFilterError.value
    ) return null;

    return {
      key: JSON.stringify({
        cursor: assetDefinitionParams.value.cursor,
        limit: assetDefinitionParams.value.limit,
        domain: assetFilters.domain.trim() || null,
        owned_by: parsedOwnerFilter.value?.toString() ?? null,
      }),
      payload: assetDefinitionParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinitions(payload))
);

const isAssetDefinitionsLoading = computed(() => !!assetsScope.value?.expose.isLoading);
const assetDefinitionsPagination = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsScope.value.expose.data.data
    : null
);
const assetDefinitions = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsScope.value.expose.data.data.items : []
);
const assetDefinitionRowKey = (item: AssetDefinition) => item.id.toString();

const assetInstancesParams = computed(() => ({
  cursor: filterBoundCursor.value,
  limit: listLimit.value,
  owned_by: parsedHolderFilter.value,
}));

const assetsInstancesScope = useParamScope(
  () => {
    if (assetsTab.value !== 'holders' || deriveTabFromRoute() !== 'holders' || !parsedHolderFilter.value) return null;

    return {
      key: JSON.stringify({
        cursor: assetInstancesParams.value.cursor,
        limit: assetInstancesParams.value.limit,
        owned_by: parsedHolderFilter.value?.toString() ?? null,
      }),
      payload: assetInstancesParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssets(payload))
);

const isAssetInstancesLoading = computed(() => !!assetsInstancesScope.value?.expose.isLoading);
const assetInstancesPagination = computed(() =>
  assetsInstancesScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsInstancesScope.value.expose.data.data
    : null
);
const assetInstances = computed(() =>
  assetsInstancesScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsInstancesScope.value.expose.data.data.items : []
);
const assetInstanceRowKey = (item: Asset) => item.id;

const nftParams = computed(() => ({
  cursor: filterBoundCursor.value,
  limit: listLimit.value,
  domain: nftFilters.domain.trim() || undefined,
  owned_by: parsedNftOwnerFilter.value,
}));

const NFTsScope = useParamScope(
  () => {
    if (
      assetsTab.value !== 'nft'
      || deriveTabFromRoute() !== 'nft'
      || nftOwnerFilterError.value
    ) return null;

    return {
      key: JSON.stringify({
        cursor: nftParams.value.cursor,
        limit: nftParams.value.limit,
        domain: nftFilters.domain.trim() || null,
        owned_by: parsedNftOwnerFilter.value?.toString() ?? null,
      }),
      payload: nftParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchNFTs(payload))
);

const isNFTsLoading = computed(() => !!NFTsScope.value?.expose.isLoading);
const NFTsPagination = computed(() =>
  NFTsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? NFTsScope.value.expose.data.data
    : null
);
const NFTs = computed(() =>
  NFTsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? NFTsScope.value.expose.data.data.items : []
);
const nftRowKey = (item: NFT) => item.id.toString();

const rwaParams = computed(() => ({
  cursor: filterBoundCursor.value,
  limit: listLimit.value,
  domain: rwaFilters.domain.trim() || undefined,
  owned_by: parsedRwaOwnerFilter.value,
}));

const rwasScope = useParamScope(
  () => {
    if (
      assetsTab.value !== 'rwa'
      || deriveTabFromRoute() !== 'rwa'
      || rwaOwnerFilterError.value
    ) return null;

    return {
      key: JSON.stringify({
        cursor: rwaParams.value.cursor,
        limit: rwaParams.value.limit,
        domain: rwaFilters.domain.trim() || null,
        owned_by: parsedRwaOwnerFilter.value?.toString() ?? null,
      }),
      payload: rwaParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchRwas(payload))
);

const isRwasLoading = computed(() => !!rwasScope.value?.expose.isLoading);
const rwasPagination = computed(() =>
  rwasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? rwasScope.value.expose.data.data : null
);
const rwas = computed(() =>
  rwasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? rwasScope.value.expose.data.data.items : []
);
const rwaRowKey = (item: RWA) => item.id;

watch(
  [() => assetFilters.domain, () => assetFilters.owner],
  () => {
    if (syncingFiltersFromRoute || assetsTab.value !== 'assets') return;
    updateListQuery({
      domain: assetFilters.domain.trim() || null,
      owner: normalizedFilterForRoute(assetFilters.owner, parsedOwnerFilter.value),
      holder: null,
      page: null,
      per_page: null,
    }).catch(() => undefined);
  },
  { flush: 'sync' }
);

watch(
  holderFilter,
  () => {
    if (syncingFiltersFromRoute || assetsTab.value !== 'holders') return;
    updateListQuery({
      domain: null,
      owner: null,
      holder: normalizedFilterForRoute(holderFilter.value, parsedHolderFilter.value),
      page: null,
      per_page: null,
    }).catch(() => undefined);
  },
  { flush: 'sync' }
);

watch(
  [() => nftFilters.domain, () => nftFilters.owner],
  () => {
    if (syncingFiltersFromRoute || assetsTab.value !== 'nft') return;
    updateListQuery({
      domain: nftFilters.domain.trim() || null,
      owner: normalizedFilterForRoute(nftFilters.owner, parsedNftOwnerFilter.value),
      holder: null,
      page: null,
      per_page: null,
    }).catch(() => undefined);
  },
  { flush: 'sync' }
);

watch(
  [() => rwaFilters.domain, () => rwaFilters.owner],
  () => {
    if (syncingFiltersFromRoute || assetsTab.value !== 'rwa') return;
    updateListQuery({
      domain: rwaFilters.domain.trim() || null,
      owner: normalizedFilterForRoute(rwaFilters.owner, parsedRwaOwnerFilter.value),
      holder: null,
      page: null,
      per_page: null,
    }).catch(() => undefined);
  },
  { flush: 'sync' }
);
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
        v-model:cursor="cursor"
        v-model:page-size="listLimit"
        :loading="isAssetDefinitionsLoading"
        pagination-mode="cursor"
        :cursor-pagination="assetDefinitionsPagination"
        :items="assetDefinitions"
        :row-key="assetDefinitionRowKey"
        container-class="assets-list-page__container"
      >
        <template #header>
          <div
            class="assets-list-page__row"
            role="presentation"
          >
            <span class="h-sm cell" role="columnheader">{{ $t('sorafs.columns.alias') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('id') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('mintable') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            class="assets-list-page__row"
            role="presentation"
          >
            <div class="cell" role="cell">
              <BaseLink
                v-if="item.alias"
                :to="`/assets/${encodeURIComponent(item.id.toString())}`"
              >
                {{ item.alias }}
              </BaseLink>
              <span v-else>-</span>
            </div>

            <div class="cell" role="cell">
              <BaseHash
                :hash="item.id.toString()"
                :link="`/assets/${encodeURIComponent(item.id.toString())}`"
                :type="hashType"
                copy
              />
            </div>

            <span class="cell row-text" role="cell">
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
        v-model:cursor="cursor"
        v-model:page-size="listLimit"
        :loading="isAssetInstancesLoading"
        pagination-mode="cursor"
        :cursor-pagination="assetInstancesPagination"
        :items="assetInstances"
        :row-key="assetInstanceRowKey"
        container-class="assets-list-page__container"
        :breakpoint="1200"
      >
        <template #header>
          <div
            class="assets-instances-list-page__row"
            role="presentation"
          >
            <span class="h-sm cell" role="columnheader">{{ $t('sorafs.columns.alias') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('id') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('accountId') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('value') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            class="assets-instances-list-page__row"
            role="presentation"
          >
            <div class="cell" role="cell">
              <BaseLink
                v-if="item.asset_alias"
                :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
              >
                {{ item.asset_alias }}
              </BaseLink>
              <span v-else>-</span>
            </div>

            <div class="cell" role="cell">
              <BaseHash
                :hash="item.definition_id.toString()"
                :link="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="cell" role="cell">
              <BaseHash
                :hash="item.account_id.toString()"
                :link="`/accounts/${item.account_id.toString()}`"
                :type="hashType"
                copy
              />
            </div>

            <span class="row-text-monospace cell" role="cell">{{ item.value.toString() }}</span>
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
        v-model:cursor="cursor"
        v-model:page-size="listLimit"
        :loading="isRwasLoading"
        pagination-mode="cursor"
        :cursor-pagination="rwasPagination"
        :items="rwas"
        :row-key="rwaRowKey"
        container-class="rwas-list-page__container"
        :breakpoint="1200"
      >
        <template #header>
          <div
            class="rwas-list-page__row"
            role="presentation"
          >
            <span class="h-sm cell" role="columnheader">{{ $t('id') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('domain') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('assets.ownedBy') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('value') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('assets.heldQuantity') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            class="rwas-list-page__row"
            role="presentation"
          >
            <div class="cell" role="cell">
              <BaseHash
                :hash="item.id"
                :link="`/rwas/${encodeURIComponent(item.id)}`"
                :type="hashType"
                copy
              />
            </div>

            <div class="cell" role="cell">
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

            <div class="cell" role="cell">
              <BaseHash
                :hash="item.owned_by.toString()"
                :link="`/accounts/${item.owned_by}`"
                :type="hashType"
                copy
              />
            </div>

            <span class="row-text-monospace cell" role="cell">{{ item.quantity.toString() }}</span>
            <span class="row-text-monospace cell" role="cell">{{ item.held_quantity.toString() }}</span>
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
        v-model:cursor="cursor"
        v-model:page-size="listLimit"
        :loading="isNFTsLoading"
        pagination-mode="cursor"
        :cursor-pagination="NFTsPagination"
        :items="NFTs"
        :row-key="nftRowKey"
        container-class="nfts-list-page__container"
      >
        <template #header>
          <div
            class="nfts-list-page__row"
            role="presentation"
          >
            <span class="h-sm cell" role="columnheader">{{ $t('name') }}</span>
            <span class="h-sm cell" role="columnheader">{{ $t('assets.ownedBy') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            class="nfts-list-page__row"
            role="presentation"
          >
            <div class="cell" role="cell">
              <BaseLink :to="`/nfts/${encodeURIComponent(item.id.toString())}`">
                {{ item.id.toString() }}
              </BaseLink>
            </div>

            <div class="cell" role="cell">
              <BaseHash
                :hash="item.owned_by.toString()"
                :link="`/accounts/${item.owned_by}`"
                :type="hashType"
                copy
              />
            </div>
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
