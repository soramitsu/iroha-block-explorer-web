<template>
  <nav
    class="navigation-menu"
    :aria-label="$t('ux.navigation')"
  >
    <section
      v-for="group in navigationGroups"
      :key="group.id"
      class="navigation-menu__group"
    >
      <div
        v-if="group.id === 'explore'"
        class="navigation-menu__label"
      >
        {{ $t(group.i18nKey) }}
      </div>
      <button
        v-else
        type="button"
        class="navigation-menu__label navigation-menu__toggle"
        :aria-expanded="expanded.includes(group.id)"
        :aria-controls="`${id}-${group.id}`"
        @click="toggle(group.id)"
      >
        {{ $t(group.i18nKey) }}<span aria-hidden="true">{{ expanded.includes(group.id) ? '−' : '+' }}</span>
      </button>
      <ul
        v-show="group.id === 'explore' || expanded.includes(group.id)"
        :id="`${id}-${group.id}`"
      >
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
import { ref, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import { navigationGroups } from '@/shared/config';
import BaseLink from '@/shared/ui/components/BaseLink.vue';

const route = useRoute();
const id = useId();
const expanded = ref<string[]>([]);
watch(() => route.name, (name) => {
  const group = navigationGroups.find((entry) => entry.items.some((item) => item.names.includes(String(name))));
  if (group && !expanded.value.includes(group.id)) expanded.value.push(group.id);
}, { immediate: true });

function toggle(group: string) {
  expanded.value = expanded.value.includes(group)
    ? expanded.value.filter((entry) => entry !== group)
    : [...expanded.value, group];
}
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
  &__toggle { border: 0; background: transparent; cursor: pointer; }
  .base-link {
    display: flex; align-items: center; min-height: 44px; padding: 10px 12px;
    border-radius: 8px; color: theme-color('content-secondary');
    font: inherit; font-size: 13px; text-decoration: none; line-height: 1.45;
    &:hover { background: theme-color('background-hover'); color: theme-color('content-primary'); }
  }
  .base-link.navigation-menu__active {
    color: theme-color('primary'); background: theme-color('primary-background'); font-weight: 600;
  }
}
</style>
