<template>
  <div class="base-table">
    <div
      v-if="$slots.header && width >= props.breakpoint && !isEmpty"
      class="content-row"
    >
      <slot name="header" />
    </div>
    <div
      v-else-if="showInitialLoading"
      class="content-row content-row_empty"
    >
      <BaseLoading />
    </div>
    <div
      v-else-if="isEmpty"
      class="content-row content-row_empty row-text"
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

    <div :class="containerClass">
      <template
        v-for="(item, i) in props.items"
        :key="props.rowKey ? props.rowKey(item, i) : i"
      >
        <div
          v-if="width >= props.breakpoint || !$slots['mobile-card']"
          class="content-row content-row--with-hover"
          :style="{ cursor: props.rowPointer ? 'pointer' : 'default' }"
          @click="emit('click:row', item)"
        >
          <slot
            name="row"
            :item
          />
        </div>

        <div
          v-else
          class="base-table__mobile-card"
        >
          <slot
            name="mobile-card"
            :item
          />
        </div>
      </template>
    </div>

    <BasePagination
      v-if="!props.disablePagination"
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
import { computed } from 'vue';
import { useWindowSize } from '@vueuse/core';
import BaseLoading from './BaseLoading.vue';
import BasePagination from '@/shared/ui/components/BasePagination.vue';
import type { Pagination } from '@/shared/api/schemas';

interface Props {
  loading: boolean
  total?: number
  payloadPagination?: Pagination | null
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
}>();

const props = withDefaults(defineProps<Props>(), {
  breakpoint: 1200,
  disablePagination: false,
  rowPointer: false,
  rowKey: undefined,
  total: 0,
  payloadPagination: null,
  paginationBreakpoint: 960,
});

const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 10 });

const { width } = useWindowSize();

const isEmpty = computed(() => props.items.length === 0);
const showInitialLoading = computed(() => props.loading && props.items.length === 0);
const showRefreshLoading = computed(() => props.loading && props.items.length > 0);
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
