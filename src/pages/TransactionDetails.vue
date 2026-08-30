<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import invariant from 'tiny-invariant';
import TimeIcon from '@/shared/ui/icons/clock.svg';
import { TransactionStatus } from '@/entities/transaction';
import { getLocalTime, getUTCTime } from '@/shared/lib/time';
import { parseMetadata } from '@/shared/ui/utils/json';
import InstructionsTable from '@/shared/ui/components/InstructionsTable.vue';
import ContextTooltip from '@/shared/ui/components/ContextTooltip.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const router = useRouter();

const transactionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', lg: 'full' }, 'medium');
const signatureHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' }, 'medium');
const instructionHashType = useAdaptiveHash({ xxl: 'full', xl: 'full' });
const accountIdHashType = useAdaptiveHash({ xxl: 'full', xl: 'full', xxs: 'short' }, 'medium');

const txHash = computed(() => {
  const hash = router.currentRoute.value.params['hash'];

  invariant(typeof hash === 'string', 'Expected string');

  return hash;
});

const transactionScope = useParamScope(txHash, (value) => setupAsyncData(() => http.fetchTransaction(value)));

const isTransactionLoading = computed(() => transactionScope.value.expose.isLoading);
const transaction = computed(() =>
  transactionScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? transactionScope.value.expose.data.data
    : undefined
);
</script>

<template>
  <div class="transaction-details">
    <BaseContentBlock
      class="transaction-details__metrics"
      :title="$t('transactions.transactionDetails')"
    >
      <template #default>
        <div
          v-if="isTransactionLoading"
          class="transaction-details__info_loading"
        >
          <BaseLoading />
        </div>
        <div v-else-if="transaction">
          <div class="transaction-details__info">
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.transactionHash')"
                :hash="transaction.hash"
                :type="transactionHashType"
                copy
              />

              <div class="transaction-details__info-row-time">
                <span class="h-sm">{{ $t('transactions.timestamp') }}</span>
                <div class="transaction-details__info-row-time-date row-text">
                  <TimeIcon />
                  <time :datetime="transaction.created_at.toISOString()">{{
                    getLocalTime(transaction.created_at)
                  }}</time>
                  <ContextTooltip :message="getUTCTime(transaction.created_at)" />
                </div>
              </div>
            </div>
            <div class="transaction-details__info-row">
              <div class="transaction-details__info-row-status">
                <span class="h-sm">{{ $t('transactions.status') }}</span>
                <TransactionStatus
                  :committed="transaction.status === 'Committed'"
                  type="label"
                />
              </div>

              <DataField
                v-if="transaction.rejection_reason"
                :title="$t('transactions.rejectedReason')"
                :value="transaction.rejection_reason.json"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.authority')"
                :hash="transaction.authority"
                :type="accountIdHashType"
                :link="`/accounts/${transaction.authority}`"
                copy
              />

              <DataField
                :title="$t('transactions.nonce')"
                :value="transaction.nonce"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.block')"
                :value="transaction.block"
                :link="`/blocks/${transaction.block}`"
                monospace
              />

              <DataField
                :title="$t('transactions.metadata')"
                :value="parseMetadata(transaction.metadata)"
              />
            </div>
            <div class="transaction-details__info-row">
              <DataField
                :title="$t('transactions.signature')"
                :hash="transaction.signature"
                :type="signatureHashType"
              />
            </div>
          </div>
        </div>
      </template>
    </BaseContentBlock>
    <BaseContentBlock
      class="transaction-details__transactions"
      :title="transaction?.executable === 'Wasm' ? $t('transactions.smartContract') : $t('transactions.instructions')"
    >
      <template #default>
        <div
          v-if="transaction && transaction.executable === 'Wasm'"
          class="transaction-details__transactions-wasm"
        >
          <span class="row-text">{{ $t('transactions.transactionContainsWasm') }}</span>
        </div>
        <div v-else>
          <InstructionsTable
            show-value
            :hash-type="instructionHashType"
            :filter-by="{ kind: 'transaction', value: txHash }"
          />
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transaction-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__info {
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-row {
      display: flex;
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);

      @include xxs {
        flex-direction: column;
        justify-content: left;
        gap: size(2);
      }

      @include md {
        flex-direction: row;
        align-items: center;
        gap: size(8);
      }

      &-time {
        display: flex;
        flex-direction: column;
        gap: size(1);

        &-date {
          display: flex;
          position: relative;
          gap: size(1);

          &:hover .context-tooltip {
            display: flex;

            @include sm {
              top: size(-1);
              left: size(34);
            }

            @include lg {
              top: size(-4.5);
              left: size(4);
            }

            @include xl {
              top: size(-1);
              left: size(34);
            }
          }

          svg {
            width: 16px;
            height: 16px;
          }
        }
      }

      &-status {
        display: flex;
        flex-direction: column;
        gap: size(1);
      }
    }
  }

  &__transactions {
    & > hr {
      display: none;
    }

    &-wasm {
      padding: 0 size(4);
    }
  }
}
</style>
