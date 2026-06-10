<template>
  <BaseButton
    :pressed="menuDropdown.isOpen.value"
    class="mobile-menu"
    aria-label="mobile menu"
    bordered
    rounded
    @click="menuDropdown.toggle"
  >
    <DotsIcon />
  </BaseButton>

  <Teleport
    v-if="menuDropdown.isOpen.value"
    :to="`#${PORTAL_ID}`"
  >
    <BaseDropdownWindow
      v-model="routeModel"
      size="lg"
      :ignore-click-outside="['.mobile-menu']"
      :items
    />
  </Teleport>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import DotsIcon from '@soramitsu-ui/icons/icomoon/basic-more-vertical-24.svg';
import { useDark } from '@vueuse/core';
import { useLangDropdown, useMenuDropdown, useNodeSettingsDropdown } from '@/shared/ui/composables/header-portal';
import { menu } from '@/shared/config';
import BaseDropdownWindow from '@/shared/ui/components/BaseDropdownWindow.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { useI18n } from 'vue-i18n';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

const { t } = useI18n();

const ACTION_NODE_SETTINGS = '__action:node-settings';
const ACTION_LANGUAGE = '__action:language';
const ACTION_THEME = '__action:theme';

const menuDropdown = useMenuDropdown();
const langDropdown = useLangDropdown();
const nodeSettingsDropdown = useNodeSettingsDropdown();

const links = computed(() => menu.map((item) => ({ label: t(item.i18nKey), value: item.to })));
const items = computed(() => [
  ...links.value,
  { label: t('settings.nodeSelector'), value: ACTION_NODE_SETTINGS },
  { label: t('settings.language'), value: ACTION_LANGUAGE },
  { label: t('settings.theme'), value: ACTION_THEME },
]);
const route = useRoute();
const navigation = useScopedExplorerNavigation();

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

const routeModel = computed({
  get: () => route.path,
  set: (to) => {
    switch (to) {
      case ACTION_NODE_SETTINGS: {
        nodeSettingsDropdown.toggle();
        return;
      }
      case ACTION_LANGUAGE: {
        langDropdown.toggle();
        return;
      }
      case ACTION_THEME: {
        toggleTheme();
        menuDropdown.toggle();
        return;
      }
      default:
        break;
    }

    navigation.push(to).catch(() => {});
    menuDropdown.toggle();
  },
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.mobile-menu {
  svg {
    margin: -4px;
    fill: theme-color('content-quaternary');
  }

  &:hover {
    svg {
      fill: theme-color('content-primary');
    }
  }

  // #SEARCH: return it when functionality is ready
  // &__search {
  //   margin: 8px;

  //   @include sm {
  //     display: none !important;
  //   }
  // }
}
</style>
