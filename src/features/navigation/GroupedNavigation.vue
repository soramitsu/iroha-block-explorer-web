<template>
  <nav
    ref="root"
    class="grouped-nav"
    :aria-label="$t('navigation.menu')"
    data-test="grouped-navigation"
  >
    <ul class="grouped-nav__groups">
      <li
        v-for="group in groups"
        :key="group.key"
        class="grouped-nav__group"
      >
        <button
          :ref="(element) => setTrigger(group.key, element)"
          type="button"
          class="grouped-nav__trigger"
          :aria-expanded="open === group.key"
          :aria-controls="panelId(group.key)"
          :data-current="group.key === currentGroup?.key || null"
          :data-test="`nav-group-${group.key}`"
          @click="toggle(group.key)"
          @keydown="onTriggerKeydown($event, group.key)"
        >
          {{ $t(group.i18nKey) }}
          <span
            class="grouped-nav__chevron"
            aria-hidden="true"
          />
        </button>

        <div
          v-if="open === group.key"
          :id="panelId(group.key)"
          class="grouped-nav__panel"
          @keydown="onPanelKeydown($event, group.key)"
        >
          <p class="grouped-nav__hint">
            {{ $t(group.hintKey) }}
          </p>
          <ul class="grouped-nav__links">
            <li
              v-for="item in group.items"
              :key="item.to"
            >
              <RouterLink
                class="grouped-nav__link"
                :to="scoped(item.to)"
                :aria-current="isActive(item) ? 'page' : undefined"
                :data-active="isActive(item) || null"
                @click="close()"
              >
                {{ $t(item.i18nKey) }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <ul
      v-if="currentGroup"
      class="grouped-nav__quick"
      :aria-label="$t(currentGroup.i18nKey)"
    >
      <li
        v-for="item in currentGroup.items"
        :key="item.to"
      >
        <RouterLink
          class="grouped-nav__quick-link"
          :to="scoped(item.to)"
          :aria-current="isActive(item) ? 'page' : undefined"
          :data-active="isActive(item) || null"
        >
          {{ $t(item.i18nKey) }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, type ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import { onClickOutside } from '@vueuse/core';
import { menuGroups, type MenuGroup, type MenuItem } from '@/shared/config';
import { applyExplorerScopeToLocation } from '@/shared/lib/explorer-scope';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';

const groups = menuGroups;
const route = useRoute();
const scope = useCurrentExplorerScope();
const baseId = useId();
const root = ref<HTMLElement | null>(null);
const open = ref<MenuGroup['key'] | null>(null);
const triggers = new Map<MenuGroup['key'], HTMLElement>();

const currentGroup = computed(() =>
  groups.find((group) => group.items.some((item) => item.names.includes(String(route.name))))
);

function isActive(item: MenuItem) {
  return item.names.includes(String(route.name));
}

function scoped(to: string) {
  return applyExplorerScopeToLocation(to, scope.value);
}

function panelId(key: string) {
  return `${baseId}-${key}`;
}

function setTrigger(key: MenuGroup['key'], element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) triggers.set(key, element);
  else triggers.delete(key);
}

function close(returnFocus = false) {
  const key = open.value;
  open.value = null;
  if (returnFocus && key) triggers.get(key)?.focus();
}

function toggle(key: MenuGroup['key']) {
  open.value = open.value === key ? null : key;
}

function panelLinks(key: string): HTMLElement[] {
  const panel = document.getElementById(panelId(key));
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('a')) : [];
}

async function onTriggerKeydown(event: KeyboardEvent, key: MenuGroup['key']) {
  if (event.key === 'Escape') {
    close(true);
    return;
  }
  if (event.key !== 'ArrowDown') return;
  event.preventDefault();
  open.value = key;
  await nextTick();
  panelLinks(key)[0]?.focus();
}

function onPanelKeydown(event: KeyboardEvent, key: string) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close(true);
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const links = panelLinks(key);
  const index = links.indexOf(document.activeElement as HTMLElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  links[(index + step + links.length) % links.length]?.focus();
}

onClickOutside(root, () => close());
watch(() => route.fullPath, () => close());
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.grouped-nav {
  display: grid;
  gap: size(1);
  min-width: 0;

  &__groups {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__group {
    position: relative;
  }

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: size(1);
    padding: size(1.25) size(2);
    border: 1px solid transparent;
    border-radius: size(3);
    background: transparent;
    cursor: pointer;
    @include tpg-ch1;
    color: theme-color('content-secondary-bright');
    transition:
      color 200ms ease,
      box-shadow 200ms ease,
      background-color 200ms ease;

    &:hover,
    &[aria-expanded='true'] {
      color: theme-color('content-primary');
      background: theme-color('background');
      @include shadow-elevated-active;
    }

    &[data-current] {
      color: theme-color('content-primary');
      background: theme-color('background');
      @include shadow-elevated-active;
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, theme-color('primary') 50%, transparent);
      outline-offset: 2px;
    }
  }

  &__chevron {
    width: 7px;
    height: 7px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 160ms ease;

    [aria-expanded='true'] > & {
      transform: translateY(2px) rotate(-135deg);
    }
  }

  &__panel {
    position: absolute;
    z-index: 60;
    top: calc(100% + #{size(1)});
    inset-inline-start: 0;
    display: grid;
    gap: size(1);
    min-width: 240px;
    padding: size(1.5);
    border-radius: size(2.5);
    background: color-mix(in srgb, theme-color('surface') 96%, transparent);
    border: 1px solid color-mix(in srgb, theme-color('border-secondary') 60%, transparent);
    box-shadow: theme-shadow('dash-raised');
    backdrop-filter: blur(12px);
    animation: grouped-nav-open 140ms ease-out;
  }

  &__hint {
    padding: 0 size(1);
    @include tpg-s5;
    color: theme-color('content-tertiary');
  }

  &__links {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__link {
    display: block;
    padding: size(1) size(1.25);
    border-radius: size(1.5);
    text-decoration: none;
    @include tpg-s3;
    font-weight: 500;
    color: theme-color('content-primary');

    &:hover,
    &:focus-visible {
      outline: none;
      background: theme-color('dash-well');
      box-shadow: theme-shadow('dash-inset');
    }

    &[data-active] {
      color: theme-color('primary');
    }
  }

  &__quick {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.5) size(1.5);
    margin: 0;
    padding: 0 size(0.5);
    list-style: none;
  }

  &__quick-link {
    display: inline-block;
    padding: size(0.5) 0;
    border-bottom: 2px solid transparent;
    text-decoration: none;
    @include tpg-s4;
    color: theme-color('content-secondary');

    &:hover {
      color: theme-color('content-primary');
    }

    &[data-active] {
      color: theme-color('content-primary');
      border-bottom-color: theme-color('primary');
    }
  }
}

html:not(.dark) .grouped-nav__trigger {
  color: theme-color('content-secondary');

  &:hover,
  &[aria-expanded='true'],
  &[data-current] {
    border-color: color-mix(in srgb, theme-color('border-primary') 76%, white);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 98%, white),
      color-mix(in srgb, theme-color('surface-variant') 94%, white)
    );
    box-shadow:
      theme-shadow('elevated-1'),
      theme-shadow('elevated-2'),
      theme-shadow('elevated-3');
  }
}

@keyframes grouped-nav-open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
