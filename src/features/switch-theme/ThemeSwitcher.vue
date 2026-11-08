<template>
  <BaseButton
    :pressed="isDark"
    class="app-theme-switcher"
    :aria-label="$t('accessibility.themeSwitcher')"
    :aria-pressed="isDark"
    bordered
    rounded
    @click="toggleTheme"
  >
    <svg
      v-if="isDark"
      data-theme-icon="dark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 15.8A8 8 0 0 1 8.2 5a8 8 0 1 0 10.8 10.8Z" />
      <path d="m17 2 .8 2.2L20 5l-2.2.8L17 8l-.8-2.2L14 5l2.2-.8L17 2Z" />
      <path d="M21 9v3m-1.5-1.5h3" />
    </svg>
    <svg
      v-else
      data-theme-icon="light"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="4"
      />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  </BaseButton>
</template>

<script setup lang="ts">
import { useDark } from '@vueuse/core';
import BaseButton from '@/shared/ui/components/BaseButton.vue';

const isDark = useDark();
let isTransitionActive = false;

function toggleTheme() {
  if (isTransitionActive) return;

  isDark.value = !isDark.value;
  const list = document.body.classList;
  list.add('theme-transition');
  isTransitionActive = true;

  setTimeout(() => {
    list.remove('theme-transition');
    isTransitionActive = false;
  }, 300);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

body.theme-transition * {
  transition-property: background, color, fill, border;
  transition-duration: 300ms;
  transition-timing-function: ease-in-out;
  box-shadow: none !important;
}

.app-theme-switcher {
  min-width: 44px;
  min-height: 44px;

  svg {
    display: block;
    width: 24px;
    height: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  body.theme-transition * {
    transition-duration: 0ms !important;
  }
}

</style>
