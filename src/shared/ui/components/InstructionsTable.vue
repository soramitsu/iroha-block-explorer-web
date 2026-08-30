<script setup lang="ts">
import { defaultFormat } from '@/shared/lib/time';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import TransactionStatus from '@/entities/transaction/TransactionStatus.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import type { Instruction, InstructionsSearchParams } from '@/shared/api/schemas';
import type { AccountId } from '@iroha/core/data-model';
import { useI18n } from 'vue-i18n';
import {
  type filterTransactionsModel as ftm,
  InstructionTypeFilter,
  TransactionStatusFilter,
} from '@/features/filter/transactions';
import {
  ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS,
  INSTRUCTIONS_ADAPTIVE_OPTIONS,
} from '@/features/filter/transactions/adaptive-options';
import { computed, reactive, watch } from 'vue';
import * as http from '@/shared/api';
import { objectOmit } from '@vueuse/shared';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const { t } = useI18n();
const props = defineProps<{
  showValue?: boolean
  hashType: HashType
  filterBy: { kind: 'authority', value: AccountId } | { kind: 'transaction', value: string }
}>();

function isBase64EncodedWasm(item: Instruction) {
  return item.kind === 'Upgrade';
}

function getInstructionPayloadValue(item: Instruction) {
  // TODO: display every instruction differently
  return item.box.json[item.kind] ?? item.box.json.payload ?? item.box.json;
}

function getInstructionPayloadEntity(item: Instruction) {
  if (isBase64EncodedWasm(item)) return t('transactions.object');

  const value = getInstructionPayloadValue(item);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (Object.keys(value)[0] ?? item.kind)
    : item.kind;
}

const isOnAccountPage = computed(() => props.filterBy.kind === 'authority');
const shouldShowKind = computed(() => listState.kind === 'All');

const listState = reactive({
  transaction_status: null,
  authority: computed(() => (props.filterBy.kind === 'authority' ? props.filterBy.value.toString() : '')),
  transaction_hash: computed(() => (props.filterBy.kind === 'transaction' ? props.filterBy.value : '')),
  kind: 'All' as ftm.TabInstructions,
  page: 1,
  per_page: 10,
});

const searchParams = computed<InstructionsSearchParams>(() => {
  if (isOnAccountPage.value) {
    return {
      ...objectOmit(listState, shouldShowKind.value ? ['kind'] : []),
      transaction_status: listState.transaction_status ?? undefined,
    };
  }

  return {
    ...objectOmit(listState, shouldShowKind.value ? ['kind', 'transaction_status'] : ['transaction_status']),
  };
});

watch([() => listState.kind, () => listState.transaction_status, () => listState.per_page], () => {
  listState.page = 1;
});

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(searchParams.value),
      payload: searchParams.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchInstructions(payload))
);

const isLoading = computed(() => scope.value?.expose.isLoading);
const totalItems = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.pagination.total_items : 0
);
const items = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value?.expose.data.data.items : []
);
</script>

<template>
  <div
    class="instructions-table"
    :class="{ 'instructions-table_short': !props.showValue }"
  >
    <div class="instructions-table__filters content-row">
      <InstructionTypeFilter
        v-model="listState.kind"
        :adaptive-options="isOnAccountPage ? ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS : INSTRUCTIONS_ADAPTIVE_OPTIONS"
      />
      <TransactionStatusFilter
        v-if="isOnAccountPage"
        v-model="listState.transaction_status"
      />
    </div>

    <BaseTable
      v-model:page="listState.page"
      v-model:page-size="listState.per_page"
      :loading="isLoading"
      :total="totalItems"
      :items
      container-class="instructions-table__container"
      :pagination-breakpoint="1441"
    >
      <template #row="{ item }">
        <div class="instructions-table__row">
          <TransactionStatus
            type="tooltip"
            class="instructions-table__icon"
            :committed="item.transaction_status === 'Committed'"
          />

          <div class="instructions-table__column">
            <div class="instructions-table__label">
              {{ $t('transactions.transactionID') }}
            </div>

            <BaseHash
              :hash="item.transaction_hash"
              :type="hashType"
              :link="`/transactions/${item.transaction_hash}`"
              copy
            />

            <time
              class="instructions-table__time row-text-monospace"
              :datetime="item.created_at.toISOString()"
            >
              {{ defaultFormat(item.created_at) }}
            </time>
          </div>

          <div class="instructions-table__columns">
            <div
              v-if="shouldShowKind"
              class="instructions-table__column"
            >
              <div class="instructions-table__label">
                {{ $t('kind') }}
              </div>

              <span class="row-text">{{ item.kind }}</span>
            </div>

            <div class="instructions-table__column">
              <div class="instructions-table__label">
                {{ $t('entity') }}
              </div>

              <span class="row-text">{{ getInstructionPayloadEntity(item) }}</span>
            </div>

            <div class="instructions-table__column-block">
              <div class="instructions-table__label">
                {{ $t('transactions.block') }}
              </div>

              <BaseLink
                :to="`/blocks/${item.block}`"
                monospace
              >
                {{ item.block }}
              </BaseLink>
            </div>
          </div>

          <div
            v-if="props.showValue"
            class="instructions-table__column-value"
          >
            <div class="instructions-table__label">
              {{ $t('value') }}
            </div>

            <BaseJson
              v-if="!isBase64EncodedWasm(item)"
              :value="getInstructionPayloadValue(item)"
            />
            <span
              v-else
              class="row-text"
            >{{ $t('transactions.displayingIsntSupported') }}</span>
          </div>
        </div>
      </template>
    </BaseTable>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.instructions-table {
  &_short {
    .content-row {
      height: auto;

      @include xxs {
        width: 90vw;
      }

      @include lg {
        width: 46vw;
        height: size(12) !important;
      }

      @include xl {
        width: auto;
      }
    }
    & > .content-row {
      @include lg {
        height: size(6) !important;
      }
    }

    .instructions-table__columns {
      @include lg {
        flex-direction: column;
        gap: size(2);
      }
    }
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 80px;
    margin: size(1) 0;

    @include xxs {
      grid-template-columns: 1fr 1fr;
      margin: size(2) 0;
      grid-gap: size(2);
      display: flex;
      flex-direction: column;
    }

    @include sm {
      display: grid;
      grid-template-columns: 32px 0.9fr 0.6fr;
      grid-gap: size(2);
      align-items: center;
    }

    @include lg {
      grid-template-columns: 32px 0.8fr 0.9fr;
    }

    @include xl {
      grid-template-columns: 32px 1.4fr 1fr;
    }
  }

  &__container {
    display: grid;
    .content-row {
      padding: 0 size(4);

      height: auto;
    }
  }

  &__filters {
    padding: size(2) size(4);
    display: flex;
    flex-direction: column;
    gap: size(1);

    @include sm {
      flex-direction: row;
    }
  }

  &__icon {
    display: none;

    @include sm {
      display: grid;
    }
  }

  &__label {
    width: size(6);
    color: theme-color('content-quaternary');
    @include tpg-s3;
  }

  &__time {
    color: theme-color('content-primary');
    grid-column: 1 / -1;
  }

  &__columns {
    display: flex;
    gap: size(3);
    flex-direction: column;

    @include md {
      flex-direction: row;
    }

    @include xl {
      flex-direction: column;
      gap: size(2);
    }

    .instructions-table__column {
      width: size(22);

      &-block {
        width: size(10);
        display: flex;
        gap: size(1);
        align-items: center;
      }
    }
  }

  &__column {
    display: grid;
    grid-gap: size(1) size(1);
    margin-bottom: auto;

    @include xs {
      grid-template-columns: auto 1fr;
      margin: auto 0;
    }

    @include sm {
      grid-gap: size(1);
    }

    &-value {
      display: flex;
      gap: size(2);

      span {
        word-break: break-all;
      }

      @include xxs {
        width: 75vw;
      }

      @include sm {
        width: 82vw;
      }

      @include md {
        width: 85vw;
      }

      @include lg {
        width: 80vw;
      }

      @include xl {
        width: 75vw;
      }
    }
  }
}
</style>
