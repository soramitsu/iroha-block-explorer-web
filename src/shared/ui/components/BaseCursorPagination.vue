<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ArrowIcon from '@/shared/ui/icons/arrow.svg';
import BaseDropdown from '@/shared/ui/components/BaseDropdown.vue';
import type { CollectionContinuation } from '@/shared/api/schemas';

const props = withDefaults(
  defineProps<{
    pagination?: CollectionContinuation | null
    items: number
  }>(),
  { pagination: null }
);

const cursor = defineModel<string | null>('cursor', { default: null });
const pageSize = defineModel<number>('pageSize', { default: 10 });
const { t } = useI18n();

const sizeOptions = [10, 20, 50, 100].map((value) => ({ label: String(value), value }));
const selectedPageSize = computed({
  get: () => pageSize.value,
  set: (value: string | number) => {
    const next = Number(value);
    if (!Number.isSafeInteger(next) || !sizeOptions.some((option) => option.value === next)) return;
    pageSize.value = next;
  },
});
const visitedCursors = ref(new Set<string>());
const knownSuccessors = new Map<string, string>();
watch(
  cursor,
  (value) => {
    if (value === null) {
      visitedCursors.value = new Set();
      knownSuccessors.clear();
      return;
    }
    visitedCursors.value.add(value);
  },
  { immediate: true }
);
const canReturnToStart = computed(() => cursor.value !== null);
const repeatsVisitedCursor = computed(() => {
  const nextCursor = props.pagination?.nextCursor;
  if (nextCursor === null || nextCursor === undefined || !visitedCursors.value.has(nextCursor)) return false;
  return cursor.value === null || knownSuccessors.get(cursor.value) !== nextCursor;
});
const canGoNext = computed(
  () =>
    Boolean(props.pagination?.nextCursor) &&
    !repeatsVisitedCursor.value
);

function goToStart() {
  if (!canReturnToStart.value) return;
  cursor.value = null;
}

function goNext() {
  const nextCursor = props.pagination?.nextCursor;
  if (!canGoNext.value || nextCursor === null || nextCursor === undefined) return;
  if (cursor.value !== null) knownSuccessors.set(cursor.value, nextCursor);
  cursor.value = nextCursor;
}
</script>

<template>
  <nav
    class="base-cursor-pagination"
    aria-label="Cursor pagination"
  >
    <div class="base-cursor-pagination__summary">
      <span data-testid="cursor-page-summary">{{ t('table.cursorPage', [props.items]) }}</span>
      <span
        v-if="repeatsVisitedCursor"
        role="alert"
        data-testid="cursor-repeat-error"
      >{{ t('table.cursorRepeated') }}</span>
      <BaseDropdown
        v-model="selectedPageSize"
        :items="sizeOptions"
        :field-label="$t('table.rowsPerPage')"
        width="175px"
        reversed
      />
    </div>

    <div class="base-cursor-pagination__arrows">
      <button
        type="button"
        data-testid="cursor-first"
        aria-label="First cursor page"
        :aria-disabled="!canReturnToStart"
        :disabled="!canReturnToStart"
        @click="goToStart"
      >
        <ArrowIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="cursor-next"
        aria-label="Next cursor page"
        :aria-disabled="!canGoNext"
        :disabled="!canGoNext"
        @click="goNext"
      >
        <ArrowIcon aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-cursor-pagination {
  z-index: 0;
  padding: size(2) size(2) 0 size(2);
  display: grid;
  grid-template-columns: auto;
  align-items: center;
  justify-items: center;
  gap: size(2);
  align-self: end;
  border-top: 1px solid theme-color('border-primary');

  @include sm {
    grid-template-columns: auto auto;
    justify-content: space-between;
    padding: size(3) size(4) 0 size(4);
  }

  &__summary {
    display: flex;
    align-items: center;
    gap: size(3);
    @include tpg-s4;
    color: theme-color('content-quaternary');
  }

  &__arrows {
    display: flex;
    gap: size(0.5);

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: size(3.5);
      height: size(3.5);
      padding: size(0.75);
      color: theme-color('content-secondary');
      background: theme-color('background');
      border: 1px solid theme-color('border-primary');
      border-radius: 999px;
      cursor: pointer;

      &[data-testid='cursor-first'] svg {
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
