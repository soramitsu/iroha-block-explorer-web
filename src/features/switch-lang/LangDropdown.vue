<template>
  <BaseButton
    ref="trigger"
    class="lang-dropdown__button"
    bordered
    aria-label="lang dropdown"
    :pressed="dropdown.isOpen.value"
    role="combobox"
    aria-autocomplete="list"
    aria-haspopup="listbox"
    :aria-expanded="dropdown.isOpen.value"
    aria-controls="window_listbox"
    @click="dropdown.toggle"
  >
    <LangIcon class="lang-dropdown__lang-icon" />
    <span class="lang-dropdown__code">{{ language }}</span>
    <ArrowIcon
      class="lang-dropdown__arrow-icon"
      :style="{ transform: `rotate(${arrowIconRotateValue}turn)` }"
    />
  </BaseButton>

  <Teleport
    v-if="dropdown.isOpen.value"
    to="body"
  >
    <BaseDropdownWindow
      ref="dropdownWindow"
      v-model:model-value="language"
      class="lang-dropdown__window"
      :style="dropdownStyle"
      :items="langOptions"
      :ignore-click-outside="['.lang-dropdown__button']"
      size="lg"
      @update:model-value="dropdown.toggle()"
    />
  </Teleport>
</template>

<script setup lang="ts">
import LangIcon from '@/shared/ui/icons/lang.svg';
import ArrowIcon from '@/shared/ui/icons/arrow.svg';
import { useLangDropdown } from '@/shared/ui/composables/header-portal';
import BaseDropdownWindow from '@/shared/ui/components/BaseDropdownWindow.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { langOptions } from '@/shared/config';
import { useApplicationLanguage } from '@/shared/ui/composables/useApplicationLanguage';
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';

const dropdown = useLangDropdown();

const { language } = useApplicationLanguage();

const arrowIconRotateValue = computed(() => (dropdown.isOpen.value ? 0.75 : 0.25));
const trigger = ref<InstanceType<typeof BaseButton> | null>(null);
const dropdownWindow = ref<InstanceType<typeof BaseDropdownWindow> | null>(null);
const dropdownStyle = ref<CSSProperties>({});
let resizeObserver: ResizeObserver | null = null;

function getTriggerElement(): HTMLElement | null {
  const el = trigger.value?.$el;
  return el instanceof HTMLElement ? el : null;
}

function getDropdownElement(): HTMLElement | null {
  const el = dropdownWindow.value?.$el;
  return el instanceof HTMLElement ? el : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function updateDropdownPosition() {
  if (!dropdown.isOpen.value || typeof window === 'undefined') return;
  const triggerEl = getTriggerElement();
  const dropdownEl = getDropdownElement();
  if (!triggerEl || !dropdownEl) return;

  const rect = triggerEl.getBoundingClientRect();
  const dropdownRect = dropdownEl.getBoundingClientRect();
  const dropdownWidth = dropdownRect.width || dropdownEl.offsetWidth || 0;
  const top = Math.max(8, rect.bottom + 8);
  const maxLeft = Math.max(8, window.innerWidth - dropdownWidth - 8);
  const isRtl = typeof document !== 'undefined' && document.dir === 'rtl';
  const preferredLeft = isRtl ? rect.left : rect.right - dropdownWidth;
  const left = clamp(preferredLeft, 8, maxLeft);

  dropdownStyle.value = {
    position: 'fixed',
    zIndex: 200,
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: 'calc(100vw - 16px)',
  };
}

function connectResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return;
  const triggerEl = getTriggerElement();
  const dropdownEl = getDropdownElement();
  if (!triggerEl || !dropdownEl) return;

  resizeObserver = new ResizeObserver(() => {
    updateDropdownPosition();
  });

  resizeObserver.observe(triggerEl);
  resizeObserver.observe(dropdownEl);
}

function disconnectResizeObserver() {
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  resizeObserver = null;
}

watch(
  () => dropdown.isOpen.value,
  async (isOpen) => {
    if (!isOpen) {
      disconnectResizeObserver();
      return;
    }
    await nextTick();
    updateDropdownPosition();
    connectResizeObserver();
  }
);

useEventListener(window, 'resize', () => {
  updateDropdownPosition();
});

useEventListener(window, 'scroll', () => {
  updateDropdownPosition();
}, true);

onBeforeUnmount(() => {
  disconnectResizeObserver();
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.lang-dropdown {
  &__button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: size(1.5);

    @include md {
      padding: size(1.5) size(2);
    }
  }

  &__lang-icon {
    width: size(2);
    height: size(2);
  }

  &__arrow-icon {
    width: size(1);
    height: size(1);
    margin-inline-start: size(0.5);
    transform: rotateZ(90deg);

    display: none;

    @include xl {
      display: block;
    }
  }

  &__code {
    display: none;
    margin-inline-start: size(1);
    text-transform: uppercase;

    @include xl {
      display: block;
    }
  }

  &__window {
    min-width: size(22);
  }
}
</style>
