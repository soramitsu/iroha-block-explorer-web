<script setup lang="ts">
import { computed, watch } from 'vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as http from '@/shared/api';
import type { AccountHistoryItem } from '@/shared/api/schemas';
import { firstRouteQueryValue } from '@/shared/lib/route-query';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';

const props = defineProps<{
  accountId: string
}>();

const { route, cursor, limit, updateListQuery } = useCursorListRouteQuery({
  cursorKey: 'activity_cursor',
  limitKey: 'activity_limit',
});

const assetFilter = computed({
  get: () => firstRouteQueryValue(route.query.activity_asset) ?? '',
  set: (value: string) => {
    updateListQuery({ activity_asset: value.trim() || null }).catch(() => {});
  },
});

const historyResource = setupAsyncData(() =>
  http.fetchAccountHistory(props.accountId, {
    cursor: cursor.value,
    limit: limit.value,
    asset_id: assetFilter.value || undefined,
  })
);

watch(
  [() => props.accountId, cursor, limit, assetFilter],
  () => {
    historyResource.refetch();
  }
);

const apiResult = computed(() => historyResource.data);
const history = computed(() =>
  apiResult.value?.status === SUCCESSFUL_FETCHING ? apiResult.value.data : null
);
const permissionDenied = computed(() => apiResult.value?.status === 'permission-denied');
const historyItems = computed(() => history.value?.items ?? []);
const rowKey = (item: AccountHistoryItem) => item.id;
</script>

<template>
  <BaseContentBlock
    title="Account activity"
    class="account-activity"
  >
    <template #default>
      <p
        class="account-activity__notice row-text"
        data-test="activity-visibility-notice"
      >
        Visibility is limited to routes readable by this unsigned Explorer request. Activity in private
        dataspaces can be omitted by Torii. Every row keeps its server-provided source and direction.
      </p>

      <div
        v-if="historyResource.isLoading && !apiResult"
        class="account-activity__state"
        role="status"
      >
        <BaseLoading />
        <span>Loading account activity…</span>
      </div>

      <div
        v-else-if="permissionDenied"
        class="account-activity__state"
        role="alert"
        data-test="activity-permission-denied"
      >
        <span>Torii denied access to this account history.</span>
        <BaseButton
          bordered
          @click="historyResource.refetch"
        >
          Retry
        </BaseButton>
      </div>

      <div
        v-else-if="historyResource.notFound"
        class="account-activity__state row-text"
        role="status"
      >
        No indexed history is available for this account.
      </div>

      <div
        v-else-if="historyResource.error"
        class="account-activity__state"
        role="alert"
        data-test="activity-error"
      >
        <span>Account history could not be loaded: {{ historyResource.error.message }}</span>
        <BaseButton
          bordered
          @click="historyResource.refetch"
        >
          Retry
        </BaseButton>
      </div>

      <template v-else-if="history">
        <label class="account-activity__filter">
          <span>Asset ID, definition ID, or active alias</span>
          <input
            v-model.lazy="assetFilter"
            data-test="activity-asset-filter"
            type="text"
            placeholder="Exact asset selector"
          >
        </label>

        <div
          v-if="historyItems.length === 0"
          class="account-activity__state row-text"
          role="status"
          data-test="activity-empty"
        >
          No account activity matches this view.
        </div>

        <BaseTable
          v-else
          v-model:cursor="cursor"
          v-model:page-size="limit"
          pagination-mode="cursor"
          :loading="historyResource.isLoading"
          :cursor-pagination="history"
          :items="historyItems"
          :row-key
          container-class="account-activity__rows"
          :breakpoint="1180"
        >
          <template #header>
            <div
              class="account-activity__row account-activity__row_header"
              role="presentation"
            >
              <span role="columnheader">Activity</span>
              <span role="columnheader">Source / direction</span>
              <span role="columnheader">Entities</span>
              <span role="columnheader">Value / status</span>
            </div>
          </template>

          <template #row="{ item }">
            <div
              class="account-activity__row"
              role="presentation"
            >
              <div role="cell">
                <strong>{{ item.type }}</strong>
                <code>{{ item.id }}</code>
                <span>{{ item.timestamp_ms === undefined ? 'Timestamp not provided' : `${item.timestamp_ms} ms` }}</span>
              </div>
              <div role="cell">
                <span>{{ item.source }}</span>
                <span>{{ item.direction }}</span>
              </div>
              <div role="cell">
                <BaseLink
                  v-if="item.counterparty_account_id"
                  :to="`/accounts/${encodeURIComponent(item.counterparty_account_id)}`"
                  monospace
                >
                  {{ item.counterparty_account_id }}
                </BaseLink>
                <BaseLink
                  v-if="item.asset_definition_id"
                  :to="`/assets/${encodeURIComponent(item.asset_definition_id)}`"
                  monospace
                >
                  {{ item.asset_definition_id }}
                </BaseLink>
                <code v-if="item.asset_id">{{ item.asset_id }}</code>
                <code v-if="item.operation_id">{{ item.operation_id }}</code>
              </div>
              <div role="cell">
                <span
                  v-if="item.amount !== undefined"
                  class="row-text-monospace"
                >{{ item.amount }}</span>
                <span>{{ item.status }}</span>
                <span v-if="item.result_ok !== undefined">result_ok: {{ String(item.result_ok) }}</span>
                <BaseLink
                  v-if="item.tx_hash"
                  :to="`/transactions/${encodeURIComponent(item.tx_hash)}`"
                  monospace
                >
                  {{ item.tx_hash }}
                </BaseLink>
              </div>
            </div>
          </template>

          <template #mobile-card="{ item }">
            <div class="account-activity__mobile-card row-text">
              <strong>{{ item.type }}</strong>
              <code>{{ item.id }}</code>
              <span>{{ item.source }} · {{ item.direction }} · {{ item.status }}</span>
              <span v-if="item.amount !== undefined">Amount: {{ item.amount }}</span>
              <BaseLink
                v-if="item.counterparty_account_id"
                :to="`/accounts/${encodeURIComponent(item.counterparty_account_id)}`"
                monospace
              >
                {{ item.counterparty_account_id }}
              </BaseLink>
              <BaseLink
                v-if="item.tx_hash"
                :to="`/transactions/${encodeURIComponent(item.tx_hash)}`"
                monospace
              >
                {{ item.tx_hash }}
              </BaseLink>
            </div>
          </template>
        </BaseTable>
      </template>
    </template>
  </BaseContentBlock>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.account-activity {
  &__notice,
  &__provenance,
  &__filter,
  &__state {
    margin: size(2) size(4);
  }

  &__notice {
    padding: size(2);
    border-inline-start: 3px solid theme-color('primary');
    background: theme-color('background-hover');
  }

  &__state {
    min-height: size(12);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: size(2);
  }

  &__provenance {
    display: flex;
    flex-wrap: wrap;
    gap: size(1) size(3);

    code {
      overflow-wrap: anywhere;
    }
  }

  &__filter {
    display: grid;
    gap: size(1);
    max-width: size(62);

    input {
      min-width: 0;
      padding: size(1.5) size(2);
      border: 1px solid theme-color('border-primary');
      border-radius: size(2);
      color: theme-color('content-primary');
      background: theme-color('background');
    }
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(12rem, 1.25fr) minmax(9rem, 0.8fr) minmax(13rem, 1.4fr) minmax(11rem, 1fr);
    gap: size(2);
    padding: size(2) size(4);

    &_header {
      @include tpg-s4;
    }

    > div {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: size(0.5);
      overflow-wrap: anywhere;
    }

    code {
      font-family: 'JetBrainsMono', monospace;
      font-size: size(1.5);
    }
  }

  &__mobile-card {
    display: flex;
    flex-direction: column;
    gap: size(1);
    padding: size(2) size(4);
    overflow-wrap: anywhere;
  }
}
</style>
