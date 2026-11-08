<template>
  <nav
    class="navigation-menu"
    :class="{ 'navigation-menu--inline': layout === 'inline' }"
    :aria-label="$t('ux.navigation')"
  >
    <section
      v-for="group in navigationGroups"
      :key="group.id"
      class="navigation-menu__group"
    >
      <h2 class="navigation-menu__label">
        {{ $t(group.i18nKey) }}
      </h2>
      <ul>
        <li
          v-for="item in group.items"
          :key="item.to"
        >
          <BaseLink
            :to="item.to"
            :class="{ 'navigation-menu__active': item.names.includes(String(route.name)) }"
            :aria-current="item.names.includes(String(route.name)) ? 'page' : undefined"
          >
            {{ $t(item.i18nKey) }}
          </BaseLink>
        </li>
      </ul>
    </section>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { navigationGroups } from '@/shared/config';
import BaseLink from '@/shared/ui/components/BaseLink.vue';

const route = useRoute();
withDefaults(defineProps<{ layout?: 'sidebar' | 'inline' }>(), { layout: 'sidebar' });
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.navigation-menu {
  display: grid;
  gap: 20px;
  padding: 20px 12px;
  ul { padding: 0; margin: 0; list-style: none; }
  &__label {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding: 8px 12px; min-height: 44px;
    font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0.06em;
    color: theme-color('content-secondary'); text-transform: uppercase;
  }
  .base-link {
    display: flex; align-items: center; min-height: 44px; padding: 10px 12px;
    border-radius: 8px; color: theme-color('content-secondary');
    font: inherit; font-size: 13px; text-decoration: none; line-height: 1.45;
    &:hover { background: theme-color('background-hover'); color: theme-color('content-primary'); }
  }
  .base-link.navigation-menu__active {
    color: theme-color('primary'); background: theme-color('primary-background'); font-weight: 600;
  }
  &--inline {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 8px; min-width: 0;
    .navigation-menu__group, ul { display: contents; }
    .navigation-menu__label { display: none; }
    li { min-width: 0; max-width: 100%; }
    .base-link { justify-content: center; text-align: center; overflow-wrap: anywhere; }
  }
}
</style>
