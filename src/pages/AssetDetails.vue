<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, reactive, ref, watch } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { AssetDefinitionSelectorSchema } from '@/shared/api/schemas';
import { parseMetadata } from '@/shared/ui/utils/json';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { getAssetDefinitionDisplayName } from '@/shared/lib/asset-definition-id';
import { useI18n } from 'vue-i18n';
import type { Asset, AssetSearchParams } from '@/shared/api/schemas';
import { parseOptionalFilter } from '@/shared/lib/optional-filter';

const router = useRouter();

const hashType = useAdaptiveHash({ md: 'medium', sm: 'medium', xs: 'medium', xxs: 'short' }, 'full');
const accountIdType = useAdaptiveHash({ md: 'short', xs: 'short', xxs: 'two-line' }, 'medium');
const { t } = useI18n();

const assetDefinitionSelector = computed(() => {
  const id = router.currentRoute.value.params['id'];

  return AssetDefinitionSelectorSchema.parse(id);
});

const assetScope = useParamScope(
  () => {
    return {
      key: assetDefinitionSelector.value,
      payload: assetDefinitionSelector.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssetDefinition(payload))
);

const assetSnapshot = computed(() => assetScope.value.expose.snapshot);
const asset = computed(() =>
  assetScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetScope.value.expose.data.data : undefined
);
const assetDefinitionId = computed(() => asset.value?.id ?? assetDefinitionSelector.value);
const assetDefinitionName = computed(() => getAssetDefinitionDisplayName(asset.value ?? assetDefinitionSelector.value));
const assetDefinitionDomain = computed(() => asset.value?.owning_domain ?? null);

const listState = reactive({
  cursor: null as string | null,
  limit: 10,
});
const holderFilter = ref('');
const holderFilterState = computed(() =>
  parseOptionalFilter(holderFilter.value, normalizeAccountSelectorLiteral, t('searchUnsupported'))
);
const parsedHolderFilter = computed<string | undefined>(() => holderFilterState.value.value);
const holderFilterError = computed(() => holderFilterState.value.error);

watch(
  () => listState.limit,
  () => {
    listState.cursor = null;
  }
);

watch(assetDefinitionSelector, () => {
  listState.cursor = null;
});

watch(holderFilter, () => {
  listState.cursor = null;
});

const assetsListScope = useParamScope(
  () => {
    if (!asset.value || holderFilterError.value) return null;

    const payload: AssetSearchParams = {
      cursor: listState.cursor,
      limit: listState.limit,
      definition: assetDefinitionId.value,
      ...(parsedHolderFilter.value ? { owned_by: parsedHolderFilter.value } : {}),
    };

    return {
      key: JSON.stringify({
        cursor: listState.cursor,
        limit: listState.limit,
        definition: assetDefinitionId.value,
        owned_by: parsedHolderFilter.value ?? null,
      }),
      payload,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchAssets(payload))
);

const isLoadingAssets = computed(() => !!assetsListScope.value?.expose.isLoading);
const assetsPagination = computed(() =>
  assetsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? assetsListScope.value.expose.data.data
    : null
);
const assets = computed(() =>
  assetsListScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? assetsListScope.value.expose.data.data.items : []
);
const isInitialTerminalEmptyAssetsPage = computed(() =>
  listState.cursor === null
  && !holderFilter.value.trim()
  && !isLoadingAssets.value
  && assets.value.length === 0
  && assetsPagination.value?.nextCursor === null
);

const assetInstanceRowKey = (item: Asset) => item.id;
const assetInstanceDefinitionName = (item: Asset) => getAssetDefinitionDisplayName(item);
</script>

<template>
  <div class="asset-details">
    <BaseContentBlock :title="$t('assets.asset', [assetDefinitionName])" class="asset-details__information">
      <template #header-action>
        <BaseButton line :to="`/econometrics?asset=${encodeURIComponent(assetDefinitionId.toString())}`">
          {{ $t('econometrics.nav') }}
        </BaseButton>
      </template>

      <template #default>
        <BaseResourceState
          :snapshot="assetSnapshot"
          loading-label="Loading asset definition"
          not-found-label="Asset definition not found"
          error-label="Asset definition could not be loaded"
          retry-label="Retry asset definition"
          @retry="assetScope.expose.refetch()"
        >
          <div v-if="asset">
            <DataField
              :title="$t('assets.ownedBy')"
              :hash="asset.owned_by.toString()"
              copy
              :link="`/accounts/${asset.owned_by}`"
              :type="hashType"
              class="asset-details__information-owner"
            />
            <div class="asset-details__information-data">
              <DataField
                :title="$t('domain')"
                :value="assetDefinitionDomain ?? '-'"
                :link="assetDefinitionDomain ? `/domains/${assetDefinitionDomain}` : undefined"
              />
              <DataField :title="$t('mintable')" :value="asset.mintable" />
              <DataField
                :title="$t('metadata')"
                :metadata="{ display: 'short' }"
                :value="parseMetadata(asset.metadata)"
              />
            </div>
          </div>
        </BaseResourceState>
      </template>
    </BaseContentBlock>

    <BaseContentBlock v-if="asset" :title="$t('assets.assetHolders')" class="asset-details__assets-table">
      <template #default>
        <div class="asset-details__filters">
          <label>
            <span class="label">{{ $t('assets.filters.holderLabel') }}</span>
            <input v-model="holderFilter" type="text" :placeholder="$t('assets.filters.holderPlaceholder')" />
            <small v-if="holderFilterError" class="asset-details__filters-error">
              {{ holderFilterError }}
            </small>
          </label>
        </div>
        <span
          v-if="isInitialTerminalEmptyAssetsPage"
          class="asset-details__assets-table_empty row-text"
          >{{ $t('assets.assetDoesntContainAnyInstances') }}</span
        >
        <BaseTable
          v-else
          v-model:cursor="listState.cursor"
          v-model:page-size="listState.limit"
          :loading="isLoadingAssets"
          pagination-mode="cursor"
          :cursor-pagination="assetsPagination"
          :items="assets"
          :row-key="assetInstanceRowKey"
          container-class="asset-details__assets-table-list"
          :breakpoint="1200"
        >
          <template #header>
            <div class="asset-details__assets-table-list-row" role="presentation">
              <span class="h-sm" role="columnheader">{{ $t('name') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('domain') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('accountId') }}</span>
              <span class="h-sm" role="columnheader">{{ $t('value') }}</span>
            </div>
          </template>

          <template #row="{ item }">
            <div class="asset-details__assets-table-list-row" role="presentation">
              <div class="row-text" role="cell">
                <BaseLink :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`">
                  {{ assetInstanceDefinitionName(item) }}
                </BaseLink>
              </div>

              <div class="row-text" role="cell">
                <BaseLink v-if="assetDefinitionDomain" :to="`/domains/${assetDefinitionDomain}`">
                  {{ assetDefinitionDomain }}
                </BaseLink>
                <span v-else class="row-text-monospace">-</span>
              </div>

              <div class="row-text" role="cell">
                <BaseHash
                  :type="accountIdType"
                  :hash="item.account_id.toString()"
                  :link="`/accounts/${item.account_id.toString()}`"
                  copy
                />
              </div>

              <span class="row-text-monospace" role="cell">
                {{ item.value }}
              </span>
            </div>
          </template>

          <template #mobile-card="{ item }">
            <div class="asset-details__assets-table-mobile-list-row">
              <div class="asset-details__assets-table-mobile-list-row-data row-text">
                <span class="h-sm">{{ $t('name') }}</span>
                <BaseLink :to="`/assets/${encodeURIComponent(item.definition_id.toString())}`">
                  {{ assetInstanceDefinitionName(item) }}
                </BaseLink>
              </div>

              <div class="asset-details__assets-table-mobile-list-row-data row-text">
                <span class="h-sm">{{ $t('domain') }}</span>
                <BaseLink v-if="assetDefinitionDomain" :to="`/domains/${assetDefinitionDomain}`">
                  {{ assetDefinitionDomain }}
                </BaseLink>
                <span v-else class="row-text-monospace">-</span>
              </div>

              <div class="asset-details__assets-table-mobile-list-row-data row-text">
                <span class="h-sm">{{ $t('accountId') }}</span>
                <BaseHash
                  :type="accountIdType"
                  :hash="item.account_id.toString()"
                  :link="`/accounts/${item.account_id.toString()}`"
                  copy
                />
              </div>

              <div class="asset-details__assets-table-mobile-list-row-data row-text">
                <span class="h-sm">{{ $t('value') }}</span>
                <span class="row-text-monospace">{{ item.value }}</span>
              </div>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.asset-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__information {
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-owner {
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);
    }
    &-data {
      display: grid;
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);
      gap: size(2);
      grid-template-columns: 1fr;

      @include xxs {
        grid-template-columns: 1fr;
      }

      @include sm {
        grid-template-columns: 1.2fr 0.8fr 1fr;
      }
      @include md {
        grid-template-columns: 1fr 1fr 1fr;
      }
    }
  }

  &__assets-table {
    .base-content-block__body:has(.asset-details__assets-table_empty) {
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

    &-list {
      display: grid;

      @include xxs {
        grid-template-columns: 1fr;
      }

      @include md {
        grid-template-columns: 1fr 1fr;
      }

      @include lg {
        grid-template-columns: 1fr;
      }

      &-row {
        display: grid;

        @include lg {
          grid-template-columns: size(25) size(35) size(50) size(10);
        }

        @include xl {
          grid-template-columns: size(35) size(40) size(55) size(15);
        }

        @include xxl {
          grid-template-columns: size(40) size(45) size(60) size(15);
        }
      }
    }

    .base-table__mobile-card {
      @include xxs {
        border-right: none;
      }
      @include md {
        border: 1px solid theme-color('border-primary');
      }
    }

    &-mobile-list {
      &-row {
        display: flex;
        flex-direction: column;
        padding: size(2) size(4);
        @include xxs {
          width: 100%;
        }
        @include sm {
          width: 90vw;
        }
        @include md {
          width: 45vw;
        }

        &-data {
          display: flex;
          align-items: center;
          margin-top: size(2);

          span:first-child {
            @include xxs {
              width: size(14);
            }
            @include xs {
              width: size(16);
            }
            @include sm {
              width: size(14);
            }
          }
        }
      }
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
