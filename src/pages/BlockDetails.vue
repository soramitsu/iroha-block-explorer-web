<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { getLocalTime, getUTCTime } from '@/shared/lib/time';
import ArrowIcon from '@soramitsu-ui/icons/icomoon/arrows-chevron-left-rounded-24.svg';
import invariant from 'tiny-invariant';
import TransactionsTable from '@/shared/ui/components/TransactionsTable.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { useTelemetryMetrics } from '@/shared/ui/composables/useTelemetryMetrics';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

const router = useRouter();
const navigation = useScopedExplorerNavigation();

const metricsHashType = useAdaptiveHash({ sm: 'short', xs: 'short', xxs: 'short' }, 'full');

const blockHeightOrHash = computed(() => {
  const heightOrHash = router.currentRoute.value.params['heightOrHash'];

  invariant(typeof heightOrHash === 'string', 'Expected string or number');

  return Number(heightOrHash) || heightOrHash;
});

const blockScope = useParamScope(blockHeightOrHash, (value) => setupAsyncData(() => http.fetchBlock(value)));

const blockSnapshot = computed(() => blockScope.value.expose.snapshot);
const block = computed(() => {
  if (blockScope.value?.expose.data?.status === SUCCESSFUL_FETCHING) return blockScope.value.expose.data.data;

  return null;
});
const isBlockEmpty = computed(() => !block.value?.transactions_hash);

const { metrics } = useTelemetryMetrics();

const totalBlocks = computed(() => metrics.value?.block ?? 0);
const isNextBlockExists = computed(() => block.value && block.value.height < totalBlocks.value);
const isPreviousBlockExists = computed(() => block.value && block.value.height > 1);

function handlePreviousBlockClick() {
  if (!block.value) return;

  navigation.push({ name: 'blocks-details', params: { heightOrHash: block.value.height - 1 } }).catch(() => {});
}

function handleNextBlockClick() {
  if (!block.value) return;

  navigation.push({ name: 'blocks-details', params: { heightOrHash: block.value.height + 1 } }).catch(() => {});
}

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full' });
</script>

<template>
  <div class="block-details">
    <BaseContentBlock class="block-details__metrics">
      <template #header>
        <div class="block-details__metrics-header">
          <button
            v-if="isPreviousBlockExists"
            type="button"
            class="block-details__metrics-header-navigation"
            aria-label="Previous block"
            data-testid="prevBlock"
            @click="handlePreviousBlockClick"
          >
            <ArrowIcon aria-hidden="true" />
          </button>
          <span class="block-details__metrics-header-block">{{ $t('blocks.block', [blockHeightOrHash]) }}</span>
          <button
            v-if="isNextBlockExists"
            type="button"
            class="block-details__metrics-header-navigation"
            aria-label="Next block"
            data-testid="nextBlock"
            @click="handleNextBlockClick"
          >
            <ArrowIcon aria-hidden="true" />
          </button>
        </div>
      </template>
      <template #default>
        <BaseResourceState
          :snapshot="blockSnapshot"
          loading-label="Loading block"
          :not-found-label="$t('blocks.blockNotAvailableYet')"
          :error-label="$t('blocks.unknownError')"
          :retry-label="$t('transactions.retryInstruction')"
          @retry="blockScope.expose.refetch()"
        >
          <div
            v-if="block"
            class="block-details__metrics-data"
          >
            <div class="block-details__metrics-data-row">
              <DataField
                :title="$t('blocks.blockHash')"
                :hash="block.hash"
                :type="metricsHashType"
                copy
              />

              <DataField
                v-if="block.prev_block_hash"
                :title="$t('blocks.parentBlockHash')"
                :hash="block.prev_block_hash"
                :type="metricsHashType"
                :link="`/blocks/${encodeURIComponent(block.prev_block_hash)}`"
                copy
              />

              <DataField
                class="block-details__metrics-data-row-date"
                :title="$t('blocks.createdAt')"
                :value="getLocalTime(block.created_at)"
                copy
                :tooltip="getUTCTime(block.created_at)"
              />

              <DataField
                :title="$t('blocks.totalTransactions')"
                :value="block.transactions_total"
                copy
                monospace
              />

              <DataField
                :title="$t('blocks.rejectedTransactions')"
                :value="block.transactions_rejected"
                monospace
                copy
              />

              <DataField
                :title="$t('blocks.merkleRootHash')"
                :value="block.transactions_hash"
                :type="metricsHashType"
              />
            </div>
          </div>
        </BaseResourceState>
      </template>
    </BaseContentBlock>
    <BaseContentBlock
      v-if="block"
      :title="$t('blocks.blockTransactions')"
      class="block-details__transactions"
    >
      <template #default>
        <TransactionsTable
          v-if="block && !isBlockEmpty"
          show-authority
          :filter-by="{ kind: 'block', value: block.height }"
          :hash-type
        />
        <span
          v-else-if="isBlockEmpty"
          class="block-details__transactions_empty row-text"
        >{{
          $t('blocks.thisBlockIsEmpty')
        }}</span>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.block-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__metrics {
    .base-content-block__header {
      &:has([data-testid='prevBlock']) {
        padding: 0 size(3);
      }

      padding: 0 size(4);
    }

    &-header {
      display: flex;
      align-items: center;
      color: theme-color('content-primary');
      @include tpg-h2();

      svg {
        height: size(4);
        width: size(4);
        fill: theme-color('content-quaternary');
      }

      &-navigation {
        display: inline-flex;
        padding: size(1);
        border: 0;
        border-radius: size(1);
        background: transparent;
        cursor: pointer;

        &:focus-visible {
          outline: 2px solid theme-color('primary');
          outline-offset: 2px;
        }
      }

      [data-testid='nextBlock'] {
        transform: rotateY(180deg);
      }

      &-block {
        user-select: none;
        cursor: default;
      }
    }

    &-data {
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);

      &-row {
        display: grid;
        gap: size(2);

        &-date .context-tooltip {
          left: size(31);
        }
      }

      .base-link {
        @include tpg-s3;
      }
    }
  }

  &__transactions hr {
    display: none;
  }

  &__transactions_empty {
    display: block;
    padding-inline: size(4);
  }
}
</style>
