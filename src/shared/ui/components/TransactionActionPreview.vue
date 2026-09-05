<script setup lang="ts">
import { computed } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { fetchInstructions, getToriiBaseUrl } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { buildInstructionPresentation } from '@/shared/lib/instruction-presentation';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import InstructionSemanticCard from '@/shared/ui/components/InstructionSemanticCard.vue';

const props = defineProps<{
  transactionHash: string
  rejected: boolean
}>();
const scope = useParamScope(
  () => props.transactionHash,
  (transactionHash) => setupAsyncData(async () => {
    const response = await fetchInstructions({ transaction_hash: transactionHash, cursor: null, limit: 3 });
    if (response.status === SUCCESSFUL_FETCHING && response.data.items.some((item) => item.transaction_hash !== transactionHash)) {
      throw new TypeError('Instruction evidence does not match the requested transaction');
    }
    return response;
  })
);
const page = computed(() => scope.value.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data : null);
const previews = computed(() => page.value?.items.map((instruction) => ({
  index: instruction.index,
  presentation: buildInstructionPresentation(instruction),
})) ?? []);
</script>

<template>
  <section
    class="transaction-action-preview"
    data-test="transaction-action-preview"
  >
    <h3>{{ $t('ux.transaction.requestedActions') }}</h3>
    <p
      v-if="rejected"
      data-test="transaction-rejected-actions"
    >
      {{ $t('ux.transaction.rejectedActions') }}
    </p>
    <BaseResourceState
      :snapshot="scope.expose.snapshot"
      :loading-label="$t('ux.collection.loading')"
      :not-found-label="$t('ux.transaction.actionsEmpty')"
      :error-label="$t('ux.collection.error', { node: getToriiBaseUrl() })"
      :retry-label="$t('ux.collection.retry')"
      @retry="scope.expose.refetch()"
    >
      <template #refresh-error>
        {{ $t('ux.collection.stale', { node: getToriiBaseUrl() }) }}
      </template>
      <div
        v-if="previews.length"
        class="transaction-action-preview__actions"
      >
        <template
          v-for="item in previews"
          :key="item.index"
        >
          <InstructionSemanticCard
            v-if="item.presentation"
            :presentation="item.presentation"
            compact
          />
          <p
            v-else
            data-test="transaction-action-unavailable"
          >
            {{ $t('ux.transaction.actionsUnavailable') }}
          </p>
        </template>
      </div>
      <p
        v-else
        data-test="transaction-action-empty"
      >
        {{ $t('ux.transaction.actionsEmpty') }}
      </p>
      <p
        v-if="page?.pagination.has_more"
        data-test="transaction-more-actions"
      >
        {{ $t('ux.transaction.moreActions') }}
      </p>
    </BaseResourceState>
    <a href="#transaction-instructions">{{ $t('ux.transaction.allInstructions') }}</a>
  </section>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.transaction-action-preview {
  margin: size(3) 0;
  padding: size(3) 0;
  border-block: 1px solid theme-color('border-primary');
  h3 { margin: 0 0 size(2); }
  p { margin: size(1.5) 0; }
  a { color: theme-color('primary'); display: inline-flex; align-items: center; min-height: 44px; }
  &__actions { display: grid; gap: size(2); }
}
</style>
