<template>
  <BaseContentBlock
    :title="$t('blocks.blocks')"
    class="blocks-list-page"
  >
    <div
      v-if="pendingRefresh"
      class="blocks-list-page__pending content-row"
      data-test="pending-refresh"
    >
      <span class="row-text">{{ $t('table.newDataAvailable') }}</span>
      <BaseButton
        bordered
        data-test="pending-refresh-load"
        @click="applyPendingRefresh"
      >
        {{ $t('table.load') }}
      </BaseButton>
    </div>
    <BaseTable
      v-model:cursor="cursor"
      v-model:page-size="limit"
      :loading="isLoading"
      :error="scope?.expose.error"
      pagination-mode="cursor"
      :cursor-pagination="payloadPagination"
      :items="blocks"
      :row-key="blockRowKey"
      container-class="blocks-list-page__container"
      @retry="scope?.expose.refetch()"
    >
      <template #header>
        <div
          class="blocks-list-page__row"
          role="presentation"
        >
          <span
            class="h-sm cell"
            role="columnheader"
            :aria-label="$t('transactions.status')"
          />
          <span class="h-sm cell" role="columnheader">{{ $t('blocks.height') }}</span>
          <span class="h-sm cell" role="columnheader">{{ $t('blocks.age') }}</span>
          <span class="h-sm cell" role="columnheader">{{ $t('blocks.hash') }}</span>
          <span class="h-sm cell" role="columnheader">{{ $t('transactions.transactions') }}</span>
        </div>
      </template>

      <template #row="{ item }">
        <div
          class="blocks-list-page__row"
          role="presentation"
        >
          <span class="row-text" role="cell">{{ item.transactions_hash ? '◉' : 'O' }}</span>
          <div class="cell" role="cell">
            <BaseLink
              :to="`/blocks/${item.height}`"
              monospace
            >
              {{ item.height }}
            </BaseLink>
          </div>

          <div class="blocks-list-page__row-time cell" role="cell">
            <TimeStamp
              :value="item.created_at"
              inverted
            />
          </div>

          <div class="cell" role="cell">
            <BaseHash
              :hash="item.hash"
              :link="`/blocks/${item.hash}`"
              :type="hashType"
              copy
            />
          </div>

          <div class="cell row-text-monospace" role="cell">
            {{ $t('blocks.totalAndRejectedTransactions', [item.transactions_total, item.transactions_rejected]) }}
          </div>
        </div>
      </template>

      <template #mobile-card="{ item }">
        <div class="blocks-list-page__mobile-card">
          <span
            class="row-text"
            :style="{ 'margin-left': '8px' }"
          >{{ item.transactions_hash ? '◉' : 'O' }}</span>
          <div class="blocks-list-page__mobile-row">
            <span class="h-sm blocks-list-page__mobile-label">{{ $t('blocks.height') }}</span>

            <BaseLink :to="`/blocks/${item.height}`">
              {{ item.height }}
            </BaseLink>
          </div>

          <div class="blocks-list-page__mobile-row">
            <span class="h-sm blocks-list-page__mobile-label">{{ $t('blocks.age') }}</span>
            <TimeStamp
              class="blocks-list-page__mobile-row-time"
              :value="item.created_at"
              inverted
            />
          </div>

          <div class="blocks-list-page__mobile-row">
            <span class="h-sm blocks-list-page__mobile-label">{{ $t('blocks.hash') }}</span>

            <BaseHash
              :hash="item.hash"
              :link="`/blocks/${item.height}`"
              :type="hashType"
              copy
            />
          </div>

          <div class="blocks-list-page__mobile-row">
            <span class="h-sm blocks-list-page__mobile-label">{{ $t('transactions.transactions') }}</span>
            <span class="row-text-monospace">{{
              $t('blocks.totalAndRejectedTransactions', [item.transactions_total, item.transactions_rejected])
            }}</span>
          </div>
        </div>
      </template>
    </BaseTable>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import * as http from '@/shared/api';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import { computed, ref, watch } from 'vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useBlockStream } from '@/shared/ui/composables/useBlockStream';
import type { Block } from '@/shared/api/schemas';
import { useWindowScroll } from '@vueuse/core';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';

const hashType = useAdaptiveHash({ xxl: 'full', xl: 'full', xxs: 'short' }, 'medium');

const { cursor, limit } = useCursorListRouteQuery();
const listParams = computed(() => ({ cursor: cursor.value, limit: limit.value }));

const { y: windowScrollY } = useWindowScroll();
const isScrolledDown = computed(() => windowScrollY.value > 80);
const pendingRefresh = ref(false);

let refetchLatestBlocks: (() => void) | null = null;
const blockStream = useBlockStream(() => {
  if (cursor.value) return;
  if (isScrolledDown.value) {
    pendingRefresh.value = true;
    return;
  }
  refetchLatestBlocks?.();
});

const scope = useParamScope(
  () => {
    return {
      key: JSON.stringify(listParams.value),
      payload: listParams.value,
    };
  },
  ({ payload }) =>
    setupAsyncData(() => http.fetchBlocks(payload), {
      interval: !payload.cursor ? 5000 : undefined,
      pollWhen: () =>
        windowScrollY.value <= 80 &&
        (!blockStream.isSupported || !blockStream.isStreaming.value),
    })
);

refetchLatestBlocks = () => scope.value?.expose.refetch?.();

const isLoading = computed(() => scope.value?.expose.isLoading);
const payloadPagination = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data : undefined
);
const blocks = computed(() =>
  scope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? scope.value.expose.data.data.items : []
);

const blockRowKey = (item: Block) => item.height;

const latestBlockProbe = setupAsyncData(() => http.fetchBlocks({ limit: 1 }), {
  interval: 10_000,
  immediate: false,
  pollWhen: () =>
    isScrolledDown.value &&
    !cursor.value &&
    (!blockStream.isSupported || !blockStream.isStreaming.value),
  onError: () => {
    // Background probe while scrolling should not spam toasts; the main table fetch handles errors.
  },
});

const latestRemoteHeight = computed(() => {
  const response = latestBlockProbe.data;
  if (response?.status !== SUCCESSFUL_FETCHING) return undefined;
  return response.data.items[0]?.height;
});

const maxDisplayedHeight = computed(() => {
  if (!blocks.value.length) return undefined;
  return blocks.value.reduce((max, block) => (block.height > max ? block.height : max), blocks.value[0].height);
});

watch(
  () => [latestRemoteHeight.value, maxDisplayedHeight.value, isScrolledDown.value, cursor.value] as const,
  ([remoteHeight, localHeight, scrolledDown, cursor]) => {
    if (!scrolledDown || cursor) {
      pendingRefresh.value = false;
      return;
    }
    if (remoteHeight === undefined || localHeight === undefined) return;
    pendingRefresh.value = remoteHeight > localHeight;
  },
  { immediate: true }
);

watch(
  () => [isScrolledDown.value, cursor.value] as const,
  ([scrolledDown, cursor], previous) => {
    const [prevScrolledDown, prevCursor] = previous ?? [false, cursor];
    if (cursor) {
      pendingRefresh.value = false;
      return;
    }

    if (scrolledDown) {
      if (blockStream.isSupported && blockStream.isStreaming.value) return;
      if (!prevScrolledDown || prevCursor !== cursor) {
        latestBlockProbe.refetch();
      }
      return;
    }

    if (pendingRefresh.value) {
      pendingRefresh.value = false;
      scope.value?.expose.refetch?.();
    }
  },
  { immediate: true }
);

async function applyPendingRefresh() {
  pendingRefresh.value = false;
  // Make the refresh action intentional and avoid inserting rows above the viewport.
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0 });
  }
  await scope.value?.expose.refetch?.();
}

watch(
  () => blocks.value,
  (items) => {
    if (!blockStream.isSupported) return;
    if (!items.length) return;
    const maxHeight = Math.max(...items.map((block) => block.height));
    blockStream.connectFrom(maxHeight + 1);
  },
  { immediate: true }
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.blocks-list-page {
  &__pending {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(2);
    padding: size(1.5) size(4);
    border-bottom: 1px solid theme-color('border-primary');
    background: color-mix(in srgb, theme-color('surface') 70%, transparent);
  }

  &__row {
    width: 100%;
    display: grid;
    justify-content: start;
    @include lg {
      grid-template-columns: 20px 130px 260px 300px 1fr;
    }
    @include xl {
      grid-template-columns: 20px 130px 260px 640px 1fr;
    }

    &-time {
      position: relative;

      &:hover .context-tooltip {
        display: flex;
        bottom: size(3);
        left: size(8);
      }
    }
  }

  &__mobile-card {
    padding: size(2) 0 size(2) size(3);
  }

  &__mobile-row {
    display: flex;
    align-items: center;

    &-time {
      position: relative;

      @include sm {
        width: 58%;
      }

      &:hover .context-tooltip {
        display: flex;
        bottom: size(3);
        left: size(6);
      }
    }
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
</style>
