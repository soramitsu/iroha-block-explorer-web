<template>
  <div class="base-tabs">
    <button
      v-if="adaptiveIndexStart !== 0"
      type="button"
      class="base-tabs__arrow"
      data-testid="prev"
      :aria-label="$t('accessibility.previousTabs')"
      @click="handleArrowPrevClick"
    >
      <ArrowIcon aria-hidden="true" />
    </button>

    <div
      class="base-tabs__list"
      role="tablist"
      :aria-label="$t('accessibility.tabOptions')"
    >
      <button
        v-for="(item, index) in adaptiveOptions"
        :key="item.value"
        type="button"
        class="base-tabs__tab"
        :class="{ 'base-tabs__tab--active': item.value === model }"
        role="tab"
        :aria-selected="item.value === model"
        :tabindex="item.value === rovingValue ? 0 : -1"
        @click="model = item.value"
        @keydown="handleTabKeydown($event, index)"
      >
        {{ item.label }}
      </button>
    </div>

    <button
      v-if="adaptiveIndexEnd < props.items.length"
      type="button"
      class="base-tabs__arrow"
      data-testid="next"
      :aria-label="$t('accessibility.nextTabs')"
      @click="handleArrowNextClick"
    >
      <ArrowIcon aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useVModel, useWindowSize } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import type { AdaptiveOptions } from '@/shared/ui/utils/adaptive-options';
import { applyAdaptiveOptions } from '@/shared/ui/utils/adaptive-options';
import ArrowIcon from '@soramitsu-ui/icons/icomoon/arrows-chevron-left-rounded-24.svg';
import { useI18n } from 'vue-i18n';
import type { TabItem } from '@/features/filter';

const { t } = useI18n();

interface Props {
  items: TabItem[]
  modelValue: string
  adaptiveOptions?: AdaptiveOptions
}

type Emits = (e: 'update:modelValue', value: string) => void;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { width } = useWindowSize();

const adaptiveIndexStart = ref(0);
const adaptiveIndexEnd = ref(0);
const diff = ref(0);
const model = useVModel(props, 'modelValue', emit);

const adaptiveOptions = computed(() => {
  return props.items
    .slice(adaptiveIndexStart.value, adaptiveIndexEnd.value)
    .map((i) => ({ ...i, label: i.label ?? t(i.i18nKey) }));
});

const rovingValue = computed(() => {
  const selected = adaptiveOptions.value.find((item) => item.value === model.value);
  return selected?.value ?? adaptiveOptions.value[0]?.value;
});

function handleArrowNextClick() {
  const maxStart = Math.max(0, props.items.length - 1);
  adaptiveIndexStart.value = Math.min(adaptiveIndexStart.value + diff.value, maxStart);
  adaptiveIndexEnd.value = Math.min(adaptiveIndexStart.value + diff.value, props.items.length);
}

function handleArrowPrevClick() {
  adaptiveIndexStart.value = Math.max(0, adaptiveIndexStart.value - diff.value);
  adaptiveIndexEnd.value = Math.min(adaptiveIndexStart.value + diff.value, props.items.length);
}

function handleTabKeydown(event: KeyboardEvent, index: number) {
  const tabCount = adaptiveOptions.value.length;
  if (tabCount === 0) return;

  const tabList = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
  const inheritedDirection = tabList?.closest('[dir]')?.getAttribute('dir');
  const isRtl = (inheritedDirection ?? document.documentElement.dir) === 'rtl';
  let targetIndex: number | null = null;

  if (event.key === 'Home') targetIndex = 0;
  else if (event.key === 'End') targetIndex = tabCount - 1;
  else if (event.key === 'ArrowRight') targetIndex = index + (isRtl ? -1 : 1);
  else if (event.key === 'ArrowLeft') targetIndex = index + (isRtl ? 1 : -1);

  if (targetIndex === null) return;
  event.preventDefault();
  const wrappedIndex = (targetIndex + tabCount) % tabCount;
  const target = adaptiveOptions.value[wrappedIndex];
  if (!target) return;
  model.value = target.value;
  tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[wrappedIndex]?.focus();
}

watch(
  [width, () => props.items.length],
  () => {
    diff.value = Math.max(
      1,
      applyAdaptiveOptions(width.value, props.adaptiveOptions ?? props.items.length)
    );
    const maxStart = Math.max(0, props.items.length - 1);
    adaptiveIndexStart.value = Math.min(adaptiveIndexStart.value, maxStart);
    adaptiveIndexEnd.value = Math.min(adaptiveIndexStart.value + diff.value, props.items.length);
  },
  { immediate: true }
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-tabs {
  display: flex;
  min-width: 0;
  max-width: 100%;
  grid-gap: size(0.5);
  grid-auto-flow: column;
  width: fit-content;
  align-items: center;
  padding: size(0.5);
  border-radius: size(2);
  background: theme-color('background');

  border: 1px solid theme-color('border-secondary');

  &__list {
    display: flex;
    min-width: 0;
    overflow-x: auto;
    grid-auto-flow: column;
    grid-gap: size(0.5);
    align-items: center;
  }

  &__arrow {
    padding: 0;
    border: 0;
    border-radius: 8px;
    flex: 0 0 44px;
    font: inherit;
    color: theme-color('primary');
    background: theme-color('primary-background');
    width: 44px;
    height: 44px;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    margin-inline-start: 4px;
    cursor: pointer;

    &:last-child {
      transform: rotateY(180deg);
      margin-inline-end: 4px;
    }

    svg {
      fill: theme-color('primary');
      width: size(2);
      height: size(2);
    }
  }

  &__tab {
    border: 0;
    min-height: 44px;
    min-width: 44px;
    flex: 0 0 auto;
    padding: size(0.5) size(1);
    border-radius: 8px;
    font: inherit;
    background: transparent;
    @include tpg-s4;
    cursor: pointer;
    user-select: none;
    transition: background-color 120ms, color 120ms;
    color: theme-color('content-quaternary');

    &:hover {
      background: theme-color('background-hover');
    }

    &--active {
      background: theme-color('primary-background');
      color: theme-color('primary');

      &:hover {
        background: theme-color('primary-background');
      }
    }
  }
}
</style>
