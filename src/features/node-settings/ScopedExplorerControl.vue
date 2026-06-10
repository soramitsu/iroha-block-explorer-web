<template>
  <div class="scoped-explorer-control">
    <BaseButton
      variant="secondary"
      size="sm"
      class="scoped-explorer-control__button"
      :pressed="dropdown.isOpen.value"
      data-test="scoped-explorer-control-button"
      @click="dropdown.toggle"
    >
      <span class="scoped-explorer-control__label">
        {{ $t('scopedExplorer.activeNode', { node: activeNodeLabel }) }}
      </span>
    </BaseButton>

    <Teleport
      v-if="dropdown.isOpen.value"
      :to="`#${PORTAL_ID}`"
    >
      <div
        ref="dropdownTarget"
        class="scoped-explorer-control__dropdown"
      >
        <span class="h-sm">{{ $t('scopedExplorer.title') }}</span>
        <span class="scoped-explorer-control__meta">
          {{ $t('scopedExplorer.dataspaceContext', { lane: currentScope?.dataspaceLaneId, dataspace: currentScope?.dataspaceId }) }}
        </span>

        <div
          v-if="nodes.length"
          class="scoped-explorer-control__nodes"
        >
          <button
            v-for="node in nodes"
            :key="node.url"
            type="button"
            class="scoped-explorer-control__node"
            :data-active="node.url === currentScope?.torii || null"
            @click="switchNode(node)"
          >
            <span class="scoped-explorer-control__node-label">{{ node.label }}</span>
            <span class="scoped-explorer-control__node-url">{{ node.url }}</span>
          </button>
        </div>
        <p
          v-else
          class="scoped-explorer-control__empty row-text"
        >
          {{ $t('scopedExplorer.noNodes') }}
        </p>

        <div class="scoped-explorer-control__actions">
          <BaseButton
            size="sm"
            variant="secondary"
            @click="exitScopedExplorer"
          >
            {{ $t('scopedExplorer.exitToDataspace') }}
          </BaseButton>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { useNodeSettingsDropdown } from '@/shared/ui/composables/header-portal';
import { PORTAL_ID } from '@/shared/ui/consts';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import {
  getConfiguredToriiBaseUrl,
  setRouteScopedToriiBaseUrl,
} from '@/shared/api';
import {
  listDataspacePublicNodes,
  upsertDataspacePublicNode,
  type DataspacePublicNodeEntry,
} from '@/shared/lib/dataspace-public-nodes';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import {
  toExplorerScopeQuery,
  type ExplorerRouteScope,
} from '@/shared/lib/explorer-scope';

const dropdown = useNodeSettingsDropdown();
const dropdownTarget = ref<HTMLElement | null>(null);

const { scope, pushGlobal, router } = useScopedExplorerNavigation();

const currentScope = computed(() => scope.value);
const scopedContext = computed(() => {
  if (!currentScope.value) return null;
  return {
    registryNode: getConfiguredToriiBaseUrl(),
    laneId: currentScope.value.dataspaceLaneId,
    dataspaceId: currentScope.value.dataspaceId,
  };
});

const nodes = ref<DataspacePublicNodeEntry[]>([]);

function deriveNodeLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url;
  }
}

function refreshNodes() {
  const context = scopedContext.value;
  const scopedValue = currentScope.value;
  if (!context || !scopedValue) {
    nodes.value = [];
    return;
  }

  const saved = listDataspacePublicNodes(context);
  const activeExists = saved.some((entry) => entry.url === scopedValue.torii);
  nodes.value = activeExists
    ? saved
    : [{ label: deriveNodeLabel(scopedValue.torii), url: scopedValue.torii, source: 'manual' }, ...saved];
}

watch(
  () => [
    currentScope.value?.torii ?? '',
    currentScope.value?.dataspaceLaneId ?? '',
    currentScope.value?.dataspaceId ?? '',
    getConfiguredToriiBaseUrl(),
  ],
  () => {
    refreshNodes();
  },
  { immediate: true }
);

onClickOutside(
  dropdownTarget,
  () => {
    if (dropdown.isOpen.value) dropdown.toggle();
  },
  {
    ignore: ['.scoped-explorer-control__button'],
  }
);

const activeNodeLabel = computed(() => {
  const scopedValue = currentScope.value;
  if (!scopedValue) return '-';
  const matched = nodes.value.find((item) => item.url === scopedValue.torii);
  return matched?.label ?? deriveNodeLabel(scopedValue.torii);
});

function replaceScope(nextScope: ExplorerRouteScope) {
  setRouteScopedToriiBaseUrl(nextScope.torii);
  const currentRoute = router.currentRoute.value;
  router.replace({
    path: currentRoute.path,
    query: {
      ...currentRoute.query,
      ...toExplorerScopeQuery(nextScope),
    },
    hash: currentRoute.hash,
  }).catch(() => {});
}

function switchNode(node: DataspacePublicNodeEntry) {
  const scopedValue = currentScope.value;
  const context = scopedContext.value;
  if (!scopedValue || !context) return;

  upsertDataspacePublicNode(context, {
    label: node.label,
    url: node.url,
  });

  replaceScope({
    ...scopedValue,
    torii: node.url,
  });
  refreshNodes();
  dropdown.toggle();
}

function exitScopedExplorer() {
  const scopedValue = currentScope.value;
  if (!scopedValue) return;
  const result = pushGlobal({
    name: 'dataspaces-details',
    params: {
      laneId: scopedValue.dataspaceLaneId,
      dataspaceId: scopedValue.dataspaceId,
    },
  });
  if (result && typeof result.catch === 'function') {
    result.catch(() => {});
  }
  dropdown.toggle();
}
</script>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.scoped-explorer-control {
  min-width: 0;
  width: auto;

  &__button {
    width: auto;
    max-width: 100%;
    min-width: 0;
    padding: size(1.25) size(1.5);
  }

  &__label {
    display: block;
    max-width: size(22);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__dropdown {
    width: size(66);
    background: theme-color('surface');
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    box-shadow: theme-shadow('row');
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__meta {
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__nodes {
    display: flex;
    flex-direction: column;
    gap: size(1);
    max-height: size(32);
    overflow: auto;
  }

  &__node {
    appearance: none;
    width: 100%;
    text-align: left;
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    background: theme-color('surface-variant');
    color: theme-color('content-primary');
    padding: size(1) size(1.25);
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    cursor: pointer;

    &[data-active] {
      border-color: color-mix(in srgb, theme-color('primary') 55%, theme-color('border-primary'));
      box-shadow: 0 0 0 1px color-mix(in srgb, theme-color('primary') 35%, transparent) inset;
    }
  }

  &__node-label {
    @include tpg-s3;
    color: theme-color('content-primary');
  }

  &__node-url {
    @include tpg-s4;
    color: theme-color('content-secondary');
    word-break: break-all;
  }

  &__empty {
    padding: size(1) 0;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
