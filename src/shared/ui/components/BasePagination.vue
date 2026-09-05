<script setup lang="ts">
import ArrowIcon from '@/shared/ui/icons/arrow.svg';
import BaseDropdown from '@/shared/ui/components/BaseDropdown.vue';
import { computed } from 'vue';
import { useWindowSize } from '@vueuse/core';
import type { Pagination } from '@/shared/api/schemas';
import { usePagination } from '@/shared/ui/composables/usePagination';
import { useI18n } from 'vue-i18n';

const { width } = useWindowSize();

const props = withDefaults(
  defineProps<{
    totalItems?: number;
    reversed?: boolean;
    payloadPagination?: Pagination | null;
    paginationBreakpoint?: number;
    maxFetchSize?: number | null;
    items: number;
  }>(),
  {
    reversed: false,
    paginationBreakpoint: 960,
    payloadPagination: null,
    totalItems: 0,
    maxFetchSize: null,
  }
);

const isLengthBiggerThanPerPage = computed(() => props.totalItems % pageSize.value > 0);

const totalPages = computed(() => {
  if (!props.reversed) {
    const exactPages = Math.ceil(props.totalItems / pageSize.value);
    if (props.maxFetchSize === null) return exactPages;
    return Math.min(exactPages, Math.floor(props.maxFetchSize / pageSize.value));
  }

  if (!props.payloadPagination) return 0;

  if (isLengthBiggerThanPerPage.value) {
    if (props.items < pageSize.value) return props.payloadPagination.total_pages;

    return props.payloadPagination.total_pages - 1;
  }

  return props.payloadPagination.total_pages;
});

const activePage = computed(() => {
  if (!props.payloadPagination) return 0;

  if (props.reversed && props.payloadPagination.page === 0) {
    return totalPages.value;
  }

  if (isLengthBiggerThanPerPage.value && props.items > pageSize.value) {
    return props.payloadPagination.page - 1;
  }

  return props.payloadPagination.page;
});

const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 10 });

const isMobile = computed(() => width.value < props.paginationBreakpoint);

const { t } = useI18n();

const { displayRange, numbers } = usePagination({
  items: computed(() => props.items),
  reversed: props.reversed,
  totalItems: computed(() => props.totalItems),
  totalPages,
  page,
  pageSize,
  activePage,
  isMobile,
});

const segmentInfo = computed(() => {
  const from = props.reversed ? Math.min(displayRange.value.start, displayRange.value.end) : displayRange.value.start;
  const to = props.reversed ? Math.max(displayRange.value.start, displayRange.value.end) : displayRange.value.end;

  return t('table.pageOf', [from, to, displayRange.value.total]);
});
const sizeOptions = [
  {
    label: '10',
    value: 10,
  },
  {
    label: '20',
    value: 20,
  },
  {
    label: '50',
    value: 50,
  },
  {
    label: '100',
    value: 100,
  },
];

function setPage(i: number) {
  if (props.reversed && totalPages.value === i) page.value = 0;
  else if (i !== page.value) page.value = i;
}

const displayNumbers = computed(() => {
  if (!props.reversed) return numbers.value;
  return [...numbers.value].toReversed();
});

const currentPageNumber = computed(() => {
  if (props.reversed) return activePage.value;
  return page.value;
});

const canGoPrev = computed(() => currentPageNumber.value > 1);
const canGoNext = computed(() => currentPageNumber.value < totalPages.value);
const shouldShowPageControls = computed(() => numbers.value.length > 1 || currentPageNumber.value > totalPages.value);
const fetchWindowLimited = computed(() => props.maxFetchSize !== null && props.totalItems > props.maxFetchSize);

function goPrev() {
  if (!canGoPrev.value) return;
  setPage(currentPageNumber.value - 1);
}

function goNext() {
  if (!canGoNext.value) return;
  setPage(currentPageNumber.value + 1);
}

function isPageActive(item: string | number) {
  if (activePage.value === Number(item) || item === page.value) return true;

  return null;
}

const shouldShowDropdown = computed(
  () => (props.reversed && props.totalItems > 19) || (!props.reversed && props.totalItems > 10)
);
</script>

<template>
  <nav class="base-pagination" :aria-label="$t('accessibility.pagination')">
    <p v-if="fetchWindowLimited" class="base-pagination__limit" data-test="fetch-window-limit">
      {{ $t('table.fetchWindowLimit', { maxFetchSize: props.maxFetchSize }) }}
    </p>
    <div v-if="props.totalItems" class="base-pagination__item">
      <div class="base-pagination__segment-info">
        {{ segmentInfo }}
      </div>

      <BaseDropdown
        v-if="shouldShowDropdown"
        v-model="pageSize"
        :items="sizeOptions"
        :field-label="$t('table.rowsPerPage')"
        width="175px"
        reversed
      />
    </div>

    <div v-if="shouldShowPageControls" class="base-pagination__item">
      <div class="base-pagination__item-numbers">
        <template v-for="(item, i) in displayNumbers" :key="`${i}-${item}`">
          <button
            v-if="Number.isInteger(item)"
            type="button"
            class="base-pagination__item-numbers-number"
            :data-active="isPageActive(item)"
            :aria-current="isPageActive(item) ? 'page' : undefined"
            :aria-label="$t('accessibility.pageNumber', { page: item })"
            @click="setPage(Number(item))"
          >
            {{ item }}
          </button>
          <span v-else class="base-pagination__item-numbers-number" data-ellipsis aria-hidden="true">
            {{ item }}
          </span>
        </template>
      </div>

      <div class="base-pagination__arrows">
        <button
          type="button"
          data-testid="prev"
          :aria-label="$t('accessibility.previousPage')"
          :aria-disabled="!canGoPrev"
          :disabled="!canGoPrev"
          @click="goPrev"
        >
          <ArrowIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="next"
          :aria-label="$t('accessibility.nextPage')"
          :aria-disabled="!canGoNext"
          :disabled="!canGoNext"
          @click="goNext"
        >
          <ArrowIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-pagination {
  z-index: 0;
  padding: size(2) size(2) 0 size(2);
  display: grid;
  grid-template-columns: auto;
  align-items: center;
  justify-items: center;
  grid-gap: size(2);
  align-self: end;
  border-top: 1px solid theme-color('border-primary');

  &__limit {
    grid-column: 1 / -1;
    margin: 0;
    color: theme-color('content-secondary');
    @include tpg-s5;
  }

  @include sm {
    grid-template-columns: auto auto;
    justify-content: space-between;
    padding: size(3) size(4) 0 size(4);
  }

  &__item {
    display: flex;
    align-items: center;

    &-numbers {
      display: flex;
      align-items: center;
      margin-left: auto;
      user-select: none;

      &-number {
        padding: 0;
        border: 0;
        font: inherit;
        background: transparent;
        @include tpg-s5-bold;
        color: theme-color('content-secondary');
        min-width: size(3);
        height: size(3);
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: size(0.5);
        cursor: pointer;
        transition: all 180ms ease;

        @include xs {
          min-width: size(3.5);
          height: size(3.5);
        }

        &[data-ellipsis] {
          color: theme-color('content-tertiary');
          cursor: default;
          min-width: auto;
          height: auto;
          margin-right: size(0.25);
          padding: 0 size(0.25);
        }

        &:hover:not([data-active]):not([data-ellipsis]) {
          color: theme-color('content-primary');
          background: theme-color('background-hover');
        }

        &[data-active] {
          color: theme-color('primary');
          background: color-mix(in srgb, theme-color('primary') 14%, transparent);
          cursor: default;
        }
      }
    }
  }

  &__segment-info {
    @include tpg-s4;
    color: theme-color('content-quaternary');
    margin-right: size(1);
    user-select: none;

    @include sm {
      margin-right: size(3);
    }
  }

  &__arrows {
    display: flex;
    gap: size(0.5);

    & > button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: size(3.5);
      width: size(3.5);
      padding: size(0.75);
      color: theme-color('content-secondary');
      background: theme-color('background');
      border: 1px solid theme-color('border-primary');
      border-radius: 999px;
      cursor: pointer;
      transition: all 180ms ease;

      &[data-testid='prev'] svg {
        transform: rotateY(180deg);
      }

      &:hover:not(:disabled) {
        color: theme-color('content-primary');
        background: theme-color('background-hover');
      }

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }

      svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    }
  }
}
</style>
