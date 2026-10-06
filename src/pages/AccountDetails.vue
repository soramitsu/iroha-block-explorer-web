<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import { AccountSelectorSchema } from '@/shared/api/schemas';
import type { Asset, Domain, NFT, RWA } from '@/shared/api/schemas';
import { parseMetadata } from '@/shared/ui/utils/json';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import type { TabAccountTransactions } from '@/features/filter/transactions/model';
import { ACCOUNT_TRANSACTIONS_OPTIONS } from '@/features/filter/transactions/model';
import TransactionsTable from '@/shared/ui/components/TransactionsTable.vue';
import InstructionsTable from '@/shared/ui/components/InstructionsTable.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { TabItem } from '@/features/filter';
import { useI18n } from 'vue-i18n';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useClipboard } from '@vueuse/core';
import { useNotifications } from '@/shared/ui/composables/notifications';
import CopyIcon from '@/shared/ui/icons/copy.svg';
import QRCode from 'qrcode';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { getAssetDefinitionDisplayName } from '@/shared/lib/asset-definition-id';
import { getDisplayedAccountId } from '@/shared/lib/account-id';
import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';
import { mergeRouteQuery, parseRouteEnum } from '@/shared/lib/route-query';
import AccountActivityView from '@/pages/account/AccountActivityView.vue';
import AccountPermissionsView from '@/pages/account/AccountPermissionsView.vue';
import AccountMultisigWorkspace from '@/pages/account/AccountMultisigWorkspace.vue';

const { t } = useI18n();
const router = useRouter();
const navigation = useScopedExplorerNavigation();
const clipboard = useClipboard();
const notifications = useNotifications();

type AccountAssetsTab = 'assets' | 'nft' | 'rwa';
type AccountViewTab = 'overview' | 'activity' | 'permissions' | 'multisig';

const ACCOUNT_VIEW_OPTIONS: TabItem<AccountViewTab>[] = [
  { label: 'Overview', value: 'overview' },
  { label: 'Activity', value: 'activity' },
  { label: 'Effective permissions', value: 'permissions' },
  { label: 'Multisig', value: 'multisig' },
];
const ACCOUNT_VIEW_VALUES = new Set<AccountViewTab>(ACCOUNT_VIEW_OPTIONS.map((item) => item.value));
const accountView = computed<AccountViewTab>({
  get: () => parseRouteEnum(router.currentRoute.value.query.tab, ACCOUNT_VIEW_VALUES, 'overview'),
  set: (value) => {
    router.push({
      query: mergeRouteQuery(
        router.currentRoute.value.query,
        { tab: value },
        { tab: 'overview' }
      ),
    }).catch(() => {});
  },
});

const ACCOUNT_ASSETS_OPTIONS: TabItem<AccountAssetsTab>[] = [
  { i18nKey: 'assets.numerics', value: 'assets' },
  { i18nKey: 'assets.nfts', value: 'nft' },
  { i18nKey: 'assets.rwas', value: 'rwa' },
];

const accountSelector = computed(() => {
  const id = router.currentRoute.value.params['id'];

  return AccountSelectorSchema.parse(id);
});

const accountScope = useParamScope(
  () => {
    return {
      key: accountSelector.value,
      payload: accountSelector.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAccount(payload))
);

const accountSnapshot = computed(() => accountScope.value.expose.snapshot);
const account = computed(() =>
  accountScope.value.expose.data?.status === SUCCESSFUL_FETCHING ? accountScope.value?.expose.data.data : undefined
);
const routedAccountLiteral = computed(() => normalizeAccountIdLiteral(accountSelector.value));
const displayAccountId = computed(() => {
  const baseUrl = http.getToriiBaseUrl();
  if (routedAccountLiteral.value) return getDisplayedAccountId(routedAccountLiteral.value, baseUrl);
  if (account.value?.i105_address) return getDisplayedAccountId(account.value.i105_address, baseUrl);
  return getDisplayedAccountId(accountSelector.value, baseUrl);
});
const displayI105Address = computed(() => {
  const i105 = account.value?.i105_address?.trim();
  if (!i105) return null;
  if (routedAccountLiteral.value) return getDisplayedAccountId(routedAccountLiteral.value, http.getToriiBaseUrl());
  return getDisplayedAccountId(i105, http.getToriiBaseUrl());
});
const accountFilterId = computed(() => displayI105Address.value ?? displayAccountId.value);

const domainsListState = reactive({
  cursor: null as string | null,
  limit: 10,
  owned_by: computed(() => accountFilterId.value),
});

watch(
  () => domainsListState.limit,
  () => {
    domainsListState.cursor = null;
  }
);

const domainsScope = useParamScope(
  () => {
    if (!account.value?.owned_domains) return null;

    return {
      key: JSON.stringify(domainsListState),
      payload: domainsListState,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchDomains(payload))
);

const isDomainsLoading = computed(() => !!domainsScope.value?.expose.isLoading);
const domainsPagination = computed(() =>
  domainsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? domainsScope.value.expose.data.data
    : null
);
const domains = computed(() =>
  domainsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? domainsScope.value.expose.data.data.items : []
);
const accountDomainRowKey = (item: Domain) => item.id;

const assetsTab = ref<AccountAssetsTab>('assets');
const isNumericAssetsSelected = computed(() => assetsTab.value === 'assets');
const isNftsSelected = computed(() => assetsTab.value === 'nft');
const isRwasSelected = computed(() => assetsTab.value === 'rwa');

const assetsListState = reactive({
  cursor: null as string | null,
  limit: 10,
  owned_by: computed(() => accountFilterId.value),
});

watch([() => assetsListState.limit, () => assetsTab.value], () => {
  assetsListState.cursor = null;
});

watch(accountFilterId, () => {
  domainsListState.cursor = null;
  assetsListState.cursor = null;
});

const assetsScope = useParamScope(
  () => {
    if (!isNumericAssetsSelected.value || !account.value?.owned_assets) return null;

    return {
      key: JSON.stringify(assetsListState),
      payload: assetsListState,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssets(payload))
);

const isAssetsLoading = computed(() => !!assetsScope.value?.expose.isLoading);
const assetsPagination = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsScope.value.expose.data.data
    : null
);
const assets = computed(() =>
  assetsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsScope.value.expose.data.data.items : []
);
const accountAssetRowKey = (item: Asset) => item.id;
const accountAssetDefinitionName = (asset: Asset) => getAssetDefinitionDisplayName(asset);

const NFTsScope = useParamScope(
  () => {
    if (!isNftsSelected.value || !account.value?.owned_nfts) return null;

    return {
      key: JSON.stringify(assetsListState),
      payload: assetsListState,
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
const nfts = computed(() =>
  NFTsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? NFTsScope.value.expose.data.data.items : []
);
const accountNftRowKey = (item: NFT) => item.id.toString();

const rwasScope = useParamScope(
  () => {
    if (!isRwasSelected.value || !account.value) return null;

    return {
      key: JSON.stringify(assetsListState),
      payload: assetsListState,
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
const accountRwaRowKey = (item: RWA) => item.id;
const isRwasListEmpty = computed(
  () =>
    isRwasSelected.value &&
    !isRwasLoading.value &&
    rwasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING &&
    assetsListState.cursor === null &&
    rwas.value.length === 0 &&
    rwasPagination.value?.nextCursor === null
);

const transactionsTab = ref<TabAccountTransactions>('transactions');
const shouldShowInstructions = computed(() => transactionsTab.value === 'instructions');
const traceRoute = computed(() => ({
  name: 'tracing-workspace',
  query: {
    seed_type: 'account',
    seed_value: accountFilterId.value,
  },
}));

watch(
  () => transactionsTab.value,
  (nextTab) => {
    if (nextTab !== 'tracing') return;
    navigation.push(traceRoute.value).catch(() => {});
    transactionsTab.value = 'transactions';
  }
);

const addressDetails = computed(() => {
  if (!account.value) return null;
  return {
    networkPrefix: account.value.network_prefix,
  };
});
const shouldShowAccountIdField = computed(
  () => displayI105Address.value === null || displayI105Address.value !== displayAccountId.value
);

const i105Qr = ref<string | null>(null);
const qrGenerationFailed = ref(false);

watch(
  () => displayI105Address.value,
  async (i105) => {
    if (!i105 || typeof window === 'undefined') {
      i105Qr.value = null;
      qrGenerationFailed.value = false;
      return;
    }

    try {
      i105Qr.value = await QRCode.toDataURL(i105, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
      });
      qrGenerationFailed.value = false;
    } catch {
      i105Qr.value = null;
      qrGenerationFailed.value = true;
    }
  },
  { immediate: true }
);

async function copyAddress(value?: string) {
  if (!value) return;
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }

  await clipboard.copy(value);
  notifications.success(t('clipboard.success'));
}

const assetsSection = computed(() => {
  if (isNumericAssetsSelected.value)
    return {
      title: t('accounts.accountAssets'),
      isZero: !account.value?.owned_assets,
      zeroTitle: t('accounts.accountDoesntHaveAnyAssets'),
    };

  if (isNftsSelected.value)
    return {
      title: t('accounts.accountNFTs'),
      isZero: !account.value?.owned_nfts,
      zeroTitle: t('accounts.accountDoesntHaveAnyNFTs'),
    };

  return {
    title: t('assets.rwas'),
    isZero: isRwasListEmpty.value,
    zeroTitle: t('noData'),
  };
});
</script>

<template>
  <div class="account-details-page">
    <BaseTabs
      v-model="accountView"
      :items="ACCOUNT_VIEW_OPTIONS"
      class="account-details-page__tabs"
    />

    <div
      v-if="accountView === 'overview'"
      class="account-details"
      data-test="account-overview"
    >
      <div class="account-details__personal">
        <BaseContentBlock
          :title="$t('accounts.accountInformation')"
          class="account-details__personal-information"
        >
          <template #default>
            <BaseResourceState
              :snapshot="accountSnapshot"
              loading-label="Loading account"
              not-found-label="Account not found"
              error-label="Account could not be loaded"
              retry-label="Retry account"
              @retry="accountScope.expose.refetch()"
            >
              <div v-if="account">
                <div class="account-details__personal-information-row">
                  <DataField
                    v-if="shouldShowAccountIdField"
                    :title="$t('accounts.accountId')"
                    :hash="displayAccountId"
                    copy
                    type="full"
                  />

                  <DataField
                    :title="$t('metadata')"
                    :metadata="{ display: 'short' }"
                    :value="parseMetadata(account.metadata)"
                  />
                </div>

                <div
                  v-if="addressDetails && displayI105Address"
                  class="account-details__address-card"
                >
                  <div class="account-details__address-heading">
                    <span class="h-sm">{{ $t('accounts.accountAddressFormats') }}</span>
                  </div>

                  <div class="account-details__address-grid">
                    <div class="account-details__address-field">
                      <div class="account-details__address-field-header">
                        <span class="h-sm">{{
                          $t('accounts.accountAddressI105Label', { prefix: addressDetails.networkPrefix })
                        }}</span>
                        <button
                          type="button"
                          class="account-details__address-copy"
                          aria-label="Copy I105 address"
                          @click.stop="copyAddress(displayI105Address)"
                        >
                          <CopyIcon aria-hidden="true" />
                        </button>
                      </div>
                      <p class="account-details__address-value row-text-monospace">
                        {{ displayI105Address }}
                      </p>
                    </div>

                    <div class="account-details__address-qr">
                      <img
                        v-if="i105Qr"
                        :src="i105Qr"
                        :alt="$t('accounts.accountAddressQrAlt')"
                      >
                      <span
                        v-else-if="qrGenerationFailed"
                        class="row-text"
                      >
                        {{ $t('accounts.accountAddressQrError') }}
                      </span>
                      <span class="account-details__address-qr-caption">
                        {{ $t('accounts.accountAddressQrCaption') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </BaseResourceState>
          </template>
        </BaseContentBlock>

        <BaseContentBlock
          v-if="account"
          :title="assetsSection.title"
          class="account-details__personal-owned"
        >
          <template #header-action>
            <BaseTabs
              v-model="assetsTab"
              :items="ACCOUNT_ASSETS_OPTIONS"
            />
          </template>
          <template #default>
            <span
              v-if="assetsSection.isZero"
              class="account-details__personal-owned_empty row-text"
            >{{
              assetsSection.zeroTitle
            }}</span>
            <BaseTable
              v-else-if="isNumericAssetsSelected"
              v-model:cursor="assetsListState.cursor"
              v-model:page-size="assetsListState.limit"
              :loading="isAssetsLoading"
              pagination-mode="cursor"
              :cursor-pagination="assetsPagination"
              :items="assets"
              :row-key="accountAssetRowKey"
              container-class="account-details__personal-owned-list"
              :breakpoint="960"
            >
              <template #header>
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <span class="h-sm" role="columnheader">{{ $t('name') }}</span>
                  <span class="h-sm" role="columnheader">{{ $t('value') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <div role="cell">
                    <BaseLink
                      :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`"
                      monospace
                    >
                      {{ accountAssetDefinitionName(item) }}
                    </BaseLink>
                  </div>
                  <span class="row-text-monospace" role="cell">{{ item.value }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="account-details__personal-owned-mobile-list-row">
                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('name') }}</span>
                    <BaseLink :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`">
                      {{ accountAssetDefinitionName(item) }}
                    </BaseLink>
                  </div>

                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('value') }}</span>
                    <span class="row-text-monospace">{{ item.value }}</span>
                  </div>
                </div>
              </template>
            </BaseTable>
            <BaseTable
              v-else-if="isNftsSelected"
              v-model:cursor="assetsListState.cursor"
              v-model:page-size="assetsListState.limit"
              :loading="isNFTsLoading"
              pagination-mode="cursor"
              :cursor-pagination="NFTsPagination"
              :items="nfts"
              :row-key="accountNftRowKey"
              container-class="account-details__personal-owned-nft-list"
              :breakpoint="960"
            >
              <template #header>
                <div
                  class="account-details__personal-owned-nft-list-row"
                  role="presentation"
                >
                  <span class="h-sm" role="columnheader">{{ $t('name') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div
                  class="account-details__personal-owned-nft-list-row"
                  role="presentation"
                >
                  <div role="cell">
                    <BaseLink
                      :to="`/nfts/${encodeURIComponent(item.id.toString())}`"
                      monospace
                    >
                      {{ item.id.toString() }}
                    </BaseLink>
                  </div>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="account-details__personal-owned-nft-mobile-list-row">
                  <div class="account-details__personal-owned-nft-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('name') }}</span>
                    <BaseLink :to="`/nfts/${encodeURIComponent(item.id.toString())}`">
                      {{ item.id.toString() }}
                    </BaseLink>
                  </div>
                </div>
              </template>
            </BaseTable>
            <BaseTable
              v-else
              v-model:cursor="assetsListState.cursor"
              v-model:page-size="assetsListState.limit"
              :loading="isRwasLoading"
              pagination-mode="cursor"
              :cursor-pagination="rwasPagination"
              :items="rwas"
              :row-key="accountRwaRowKey"
              container-class="account-details__personal-owned-list"
              :breakpoint="960"
            >
              <template #header>
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <span class="h-sm" role="columnheader">{{ $t('id') }}</span>
                  <span class="h-sm" role="columnheader">{{ $t('value') }}</span>
                  <span class="h-sm" role="columnheader">{{ $t('assets.heldQuantity') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <div role="cell">
                    <BaseLink
                      :to="`/rwas/${encodeURIComponent(item.id)}`"
                      monospace
                    >
                      {{ item.id }}
                    </BaseLink>
                  </div>
                  <span class="row-text-monospace" role="cell">{{ item.quantity.toString() }}</span>
                  <span class="row-text-monospace" role="cell">{{ item.held_quantity.toString() }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="account-details__personal-owned-mobile-list-row">
                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('id') }}</span>
                    <BaseLink :to="`/rwas/${encodeURIComponent(item.id)}`">
                      {{ item.id }}
                    </BaseLink>
                  </div>

                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('value') }}</span>
                    <span class="row-text-monospace">{{ item.quantity.toString() }}</span>
                  </div>

                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('assets.heldQuantity') }}</span>
                    <span class="row-text-monospace">{{ item.held_quantity.toString() }}</span>
                  </div>
                </div>
              </template>
            </BaseTable>
          </template>
        </BaseContentBlock>

        <BaseContentBlock
          v-if="account"
          :title="$t('accounts.accountDomains')"
          class="account-details__personal-owned"
        >
          <template #default>
            <span
              v-if="!account?.owned_domains"
              class="account-details__personal-owned_empty row-text"
            >{{
              $t('accounts.accountDoesntHaveAnyDomains')
            }}</span>
            <BaseTable
              v-else
              v-model:cursor="domainsListState.cursor"
              v-model:page-size="domainsListState.limit"
              :loading="isDomainsLoading"
              pagination-mode="cursor"
              :cursor-pagination="domainsPagination"
              :items="domains"
              :row-key="accountDomainRowKey"
              container-class="account-details__personal-owned-list"
              :breakpoint="960"
            >
              <template #header>
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <span class="h-sm" role="columnheader">{{ $t('id') }}</span>
                  <span class="h-sm" role="columnheader">{{ $t('assets.assets') }}</span>
                  <span class="h-sm" role="columnheader">{{ $t('accounts.accounts') }}</span>
                </div>
              </template>

              <template #row="{ item }">
                <div
                  class="account-details__personal-owned-list-row"
                  role="presentation"
                >
                  <div role="cell">
                    <BaseLink
                      :to="`/domains/${item.id}`"
                      monospace
                    >
                      {{ item.id }}
                    </BaseLink>
                  </div>
                  <span class="row-text-monospace" role="cell">{{ item.assets }}</span>
                  <span class="row-text-monospace" role="cell">{{ item.accounts }}</span>
                </div>
              </template>

              <template #mobile-card="{ item }">
                <div class="account-details__personal-owned-mobile-list-row">
                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('id') }}</span>
                    <BaseLink :to="`/domains/${item.id}`">
                      {{ item.id }}
                    </BaseLink>
                  </div>

                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('assets.assets') }}</span>
                    <span class="row-text-monospace">{{ item.assets }}</span>
                  </div>

                  <div class="account-details__personal-owned-mobile-list-row-data row-text">
                    <span class="h-sm">{{ $t('accounts.accounts') }}</span>
                    <span class="row-text-monospace">{{ item.accounts }}</span>
                  </div>
                </div>
              </template>
            </BaseTable>
          </template>
        </BaseContentBlock>
      </div>
    </div>

    <div
      v-else-if="accountView === 'activity'"
      class="account-details-page__view"
      data-test="account-activity"
    >
      <AccountActivityView :account-id="accountFilterId" />
      <div class="account-details__transactions account-details__transactions_activity">
        <BaseContentBlock :title="$t('accounts.accountTransactions')">
          <template #header-action>
            <BaseTabs
              v-model="transactionsTab"
              :items="ACCOUNT_TRANSACTIONS_OPTIONS"
            />
          </template>
          <template #default>
            <div class="account-details__transactions-table account-details__transactions-table_short">
              <TransactionsTable
                v-if="!shouldShowInstructions"
                :filter-by="{ kind: 'authority', value: displayAccountId }"
                hash-type="short"
                show-block
              />
              <InstructionsTable
                v-else
                hash-type="short"
                :filter-by="{ kind: 'authority', value: displayAccountId }"
              />
            </div>
          </template>
        </BaseContentBlock>
      </div>
    </div>

    <AccountPermissionsView
      v-else-if="accountView === 'permissions'"
      :account-id="accountFilterId"
      class="account-details-page__view"
      data-test="account-permissions"
    />

    <AccountMultisigWorkspace
      v-else
      :account-id="accountFilterId"
      class="account-details-page__view"
      data-test="account-multisig"
    />
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.account-details-page {
  display: flex;
  flex-direction: column;
  gap: size(2);

  @include xxs {
    padding: 0 size(3);
  }

  &__tabs {
    align-self: flex-start;
  }

  &__view {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: size(2);

    .account-details__transactions {
      width: 100%;
    }
  }
}

.account-details {
  display: flex;

  @include xxs {
    gap: size(2);
    padding: 0 size(3);
    flex-direction: column;
  }

  @include lg {
    flex-direction: row;
  }

  &__personal {
    display: flex;
    flex-direction: column;
    gap: size(2);
    min-width: 0;

    @include xxs {
      width: 100%;
    }

    @include lg {
      width: 100%;
    }

    @include xl {
      width: 100%;
    }

    @include xxl {
      width: 100%;
    }

    &-information {
      &_loading {
        margin-top: size(1);
        display: flex;
        justify-content: center;
        align-items: center;
      }

      &-row {
        margin-top: size(2);
        padding: 0 size(2) 0 size(4);

        & > div:not(:first-child) {
          margin-top: size(2);
        }
      }
    }

    &-owned {
      .base-content-block__body:has(.account-details__personal-owned_empty) {
        padding: size(0) size(4) size(4);
      }

      .base-table > .content-row {
        display: flex;
      }

      .content-row {
        padding: 0 size(4);
      }

      hr {
        display: none;
      }

      &-list,
      &-nft-list {
        display: grid;

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
            grid-template-columns: 25vw 25vw 25vw;
          }

          @include lg {
            grid-template-columns: size(25) size(18) size(18);
          }
          @include xl {
            grid-template-columns: size(35) size(20) size(20);
          }
        }
      }

      &-nft-list-row {
        grid-template-columns: 1fr;
      }

      &-mobile-list,
      &-nft-mobile-list {
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
  }

  &__address-card {
    margin-top: size(3);
    display: flex;
    flex-direction: column;
    gap: size(2);
    padding: 0 size(2) size(2) size(4);
  }

  &__address-heading {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__address-grid {
    display: grid;
    gap: size(2);

    @include sm {
      grid-template-columns: repeat(auto-fit, minmax(size(20), 1fr));
    }
  }

  &__address-field {
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__address-field-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: size(1);
  }

  &__address-copy {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: theme-color('content-quaternary');
    transition: color 200ms ease-in-out;

    &:hover {
      color: theme-color('content-tertiary');
    }

    svg {
      width: size(3);
      height: size(3);
    }
  }

  &__address-value {
    word-break: break-all;
  }

  &__address-qr {
    border: 1px dashed theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-height: size(25);

    img {
      width: 100%;
      max-width: size(30);
      height: auto;
    }
  }

  &__address-qr-caption {
    margin-top: size(1);
    color: theme-color('content-tertiary');
    @include tpg-s4;
  }

  &__transactions {
    margin-bottom: size(2);
    min-width: 0;

    .base-content-block__header {
      display: flex;

      @include xxs {
        flex-direction: column;
        gap: size(2);
        padding: size(2) size(4);
      }

      @include sm {
        flex-direction: row;
        gap: 0;
      }
    }

    @include xxs {
      width: 100%;
    }
    @include lg {
      width: 48%;
    }
    @include xl {
      width: size(80);
    }
    @include xxl {
      width: size(95);
    }

    hr {
      display: none;
    }

    &-table {
      &_short {
        .content-row {
          height: auto;
          width: 100%;
          max-width: 100%;
        }
        & > .content-row {
          height: auto;
        }

        .transactions-table__columns {
          @include sm {
            flex-direction: column;
          }
          @include md {
            flex-direction: row;
          }
          @include lg {
            flex-direction: column;
          }
        }

        .transactions-table__column {
          &-hash {
            @include sm {
              width: 100%;
            }
          }
          &-block {
            width: size(16);
          }
        }

        .transactions-table__container .content-row {
          @include lg {
            height: 48px;
          }
        }
      }
    }
  }
}
</style>
