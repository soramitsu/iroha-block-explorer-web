<template>
  <nav class="navigation-menu">
    <BaseButton
      v-for="item in translatedMenu"
      :key="item.to"
      :to="item.to"
      :class="{ 'base-button_active': item.names.includes(String(router.currentRoute.value.name)) }"
    >
      {{ item.label }}
    </BaseButton>
  </nav>
</template>

<script setup lang="ts">
import { menu } from '@/shared/config';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const router = useRouter();
const { t } = useI18n();

const translatedMenu = computed(() => menu.map((item) => ({ ...item, label: t(item.i18nKey) })));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.navigation-menu {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: size(1);
  min-width: 0;
}
</style>
