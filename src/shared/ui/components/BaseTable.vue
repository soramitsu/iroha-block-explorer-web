<template>
  <div
    class="base-table"
    :role="rendersDesktopRows ? 'table' : undefined"
    :aria-busy="props.loading"
  >
    <BaseResourceState
      v-if="props.error"
      :snapshot="{ status: 'error', problem: props.error }"
      @retry="emit('retry')"
    />
    <div
      v-if="$slots.header && rendersDesktopRows && !isEmpty"
      role="rowgroup"
    >
      <div
        class="content-row"
        role="row"
      >
        <slot name="header" />
      </div>
    </div>
    <div
      v-else-if="showInitialLoading"
      class="content-row content-row_empty"
      role="status"
      aria-live="polite"
    >
      <BaseLoading />
    </div>
    <div
      v-else-if="isEmpty && !props.error"
      class="content-row content-row_empty row-text"
      role="status"
    >
      {{ $t('noData') }}
    </div>

    <div
      v-if="showRefreshLoading"
      class="base-table__refresh-indicator"
      aria-hidden="true"
    >
      <BaseLoading />
    </div>

    <div
      :class="containerClass"
      :role="rendersDesktopRows ? 'rowgroup' : 'list'"
    >
      <template
        v-for="(item, i) in props.items"
        :key="props.rowKey ? props.rowKey(item, i) : i"
      >
        <div
          v-if="rendersDesktopRows"
          class="content-row content-row--with-hover"
          role="row"
          :tabindex="props.rowPointer ? 0 : undefined"
          :style="{ cursor: props.rowPointer ? 'pointer' : 'default' }"
          @click="emit('click:row', item)"
          @keydown.enter="emit('click:row', item)"
          @keydown.space.prevent="emit('click:row', item)"
        >
          <slot
            name="row"
            :item
          />
        </div>

        <div
          v-else
          class="base-table__mobile-card"
          role="listitem"
        >
          <slot
            name="mobile-card"
            :item
          />
        </div>
      </template>
    </div>

    <BaseCursorPagination
      v-if="!props.disablePagination && props.paginationMode === 'cursor'"
      v-model:cursor="cursor"
      v-model:page-size="pageSize"
      :pagination="props.cursorPagination"
      :items="props.items.length"
    />
    <BasePagination
      v-else-if="!props.disablePagination"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total-items="props.total"
      :reversed="props.reversed"
      :items="props.items.length"
      :payload-pagination
      :pagination-breakpoint
    />
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, useSlots } from 'vue';
import { useWindowSize } from '@vueuse/core';
import BaseLoading from './BaseLoading.vue';
import BaseResourceState from './BaseResourceState.vue';
import type { ApiProblem } from '@/shared/utils/resource-state';
import BasePagination from '@/shared/ui/components/BasePagination.vue';
import BaseCursorPagination from '@/shared/ui/components/BaseCursorPagination.vue';
import type { CollectionContinuation, Pagination } from '@/shared/api/schemas';

interface Props {
  loading: boolean
  error?: ApiProblem | null
  total?: number
  payloadPagination?: Pagination | null
  cursorPagination?: CollectionContinuation | null
  paginationMode?: 'numbered' | 'cursor'
  disablePagination?: boolean
  paginationBreakpoint?: number
  items: T[]
  rowKey?: (item: T, index: number) => string | number
  containerClass: string
  breakpoint?: number
  reversed?: boolean
  rowPointer?: boolean
}

const emit = defineEmits<{
  'click:row': [data: T]
  retry: []
}>();

const props = withDefaults(defineProps<Props>(), {
  breakpoint: 1200,
  error: null,
  disablePagination: false,
  rowPointer: false,
  rowKey: undefined,
  total: 0,
  payloadPagination: null,
  cursorPagination: null,
  paginationMode: 'numbered',
  paginationBreakpoint: 960,
});

const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 10 });
const cursor = defineModel<string | null>('cursor', { default: null });

const { width } = useWindowSize();
const slots = useSlots();

const isEmpty = computed(() => props.items.length === 0);
const showInitialLoading = computed(() => props.loading && props.items.length === 0);
const showRefreshLoading = computed(() => props.loading && props.items.length > 0);
const rendersDesktopRows = computed(() => width.value >= props.breakpoint || !slots['mobile-card']);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-table {
  display: grid;
  grid-auto-rows: auto;
  position: relative;

  &__refresh-indicator {
    position: absolute;
    top: size(1.25);
    right: size(1.5);
    pointer-events: none;
    opacity: 0.75;

    .base-loading {
      width: size(3.5);
      height: size(3.5);
    }
  }

  &__mobile-card {
    border-top: 1px solid theme-color('border-primary');

    @include sm {
      &:nth-child(2n - 1) {
        border-right: 1px solid theme-color('border-primary');
      }
    }

    @include lg {
      border-right: none;
    }
  }
}
</style>
