<template>
  <div class="dashboard-shell">
    <header class="dashboard-shell__head">
      <div class="dashboard-shell__titles">
        <p class="dashboard-shell__eyebrow">
          {{ $t('dashboards.nav') }}
        </p>
        <h1 class="dashboard-shell__title">
          {{ title }}
        </h1>
        <p class="dashboard-shell__subtitle">
          {{ subtitle }}
        </p>
      </div>

      <nav
        class="dashboard-shell__tabs"
        :aria-label="$t('dashboards.tabs.label')"
      >
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          class="dashboard-shell__tab"
          :to="tab.to"
          :aria-current="tab.name === active ? 'page' : undefined"
          :data-active="tab.name === active || null"
        >
          <span
            class="dashboard-shell__tab-led"
            aria-hidden="true"
          />
          {{ $t(tab.labelKey) }}
        </RouterLink>
      </nav>

      <div
        v-if="$slots.controls"
        class="dashboard-shell__controls"
      >
        <slot name="controls" />
      </div>
    </header>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { applyExplorerScopeToLocation } from '@/shared/lib/explorer-scope';
import { useCurrentExplorerScope } from '@/shared/ui/composables/useExplorerScopeNavigation';

export type DashboardName = 'network' | 'activity' | 'ledger';

defineProps<{
  active: DashboardName
  title: string
  subtitle: string
}>();

const scope = useCurrentExplorerScope();

const tabs = computed(() =>
  (['network', 'activity', 'ledger'] as const).map((name) => ({
    name,
    labelKey: `dashboards.tabs.${name}`,
    to: applyExplorerScopeToLocation({ name: `dashboard-${name}` }, scope.value),
  }))
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dashboard-shell {
  display: grid;
  gap: size(2.5);
  min-width: 0;

  &__head {
    @include dash-raised-surface(size(3));
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: size(2);
    padding: size(2.5) size(2);

    @include sm {
      padding: size(3);
    }

    @include lg {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'titles controls'
        'tabs tabs';
      align-items: start;
    }
  }

  &__titles {
    display: grid;
    gap: size(0.75);

    @include lg {
      grid-area: titles;
    }
  }

  &__eyebrow {
    @include tpg-s5-bold;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: theme-color('chart-accent');
  }

  &__title {
    @include tpg-h1;
    font-weight: 700;
    color: theme-color('content-primary');

    @include md {
      @include tpg-d2;
      font-weight: 700;
    }
  }

  &__subtitle {
    @include tpg-s3;
    color: theme-color('content-secondary');
    max-width: 68ch;
  }

  &__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    padding: size(0.75);
    border-radius: size(2.5);
    background: theme-color('dash-chassis');
    box-shadow: theme-shadow('dash-inset');
    width: fit-content;
    max-width: 100%;

    @include lg {
      grid-area: tabs;
    }
  }

  &__tab {
    @include dash-key-surface(size(2));
    display: inline-flex;
    align-items: center;
    gap: size(1);
    padding: size(1) size(2);
    text-decoration: none;
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-secondary');
    transition:
      box-shadow 160ms ease,
      color 160ms ease;

    &:hover {
      color: theme-color('content-primary');
    }

    &[data-active] {
      color: theme-color('content-primary');
      background: theme-color('dash-well');
      box-shadow: theme-shadow('dash-inset-deep');
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, theme-color('chart-accent') 60%, transparent);
      outline-offset: 2px;
    }
  }

  &__tab-led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: theme-color('dash-led-off');

    [data-active] > & {
      background: theme-color('chart-accent');
      box-shadow: 0 0 8px color-mix(in srgb, theme-color('chart-accent') 80%, transparent);
    }
  }

  &__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1.5);

    @include lg {
      grid-area: controls;
      justify-content: flex-end;
    }
  }
}
</style>
