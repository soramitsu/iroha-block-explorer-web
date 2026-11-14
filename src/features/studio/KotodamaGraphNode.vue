<template>
  <div
    class="kotodama-graph-node"
    :class="[
      `kotodama-graph-node--${data.kind}`,
      {
        'kotodama-graph-node--selected': selected,
        'kotodama-graph-node--error': diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
        'kotodama-graph-node--warning': diagnostics.some((diagnostic) => diagnostic.severity === 'warning'),
      },
    ]"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="kotodama-graph-node__handle"
    />

    <div class="kotodama-graph-node__header">
      <span class="kotodama-graph-node__kind">{{ kindLabel }}</span>
      <span
        v-if="diagnostics.length"
        class="kotodama-graph-node__status"
      >
        {{ diagnostics.some((diagnostic) => diagnostic.severity === 'error')
          ? $t('studio.graph.severity.error')
          : $t('studio.graph.severity.warning') }}
      </span>
    </div>

    <strong>{{ data.title }}</strong>
    <p>{{ data.detail }}</p>

    <div
      v-if="badges.length"
      class="kotodama-graph-node__badges"
    >
      <span
        v-for="badge in badges"
        :key="badge"
      >
        {{ badge }}
      </span>
    </div>

    <Handle
      type="source"
      :position="Position.Right"
      class="kotodama-graph-node__handle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { KotodamaStudioGraphDiagnostic, KotodamaStudioGraphNodeData } from '@/shared/lib/kotodama-studio-graph';

type GraphNodeData = KotodamaStudioGraphNodeData & {
  diagnostics?: KotodamaStudioGraphDiagnostic[]
};

const props = defineProps<NodeProps<GraphNodeData>>();
const { t } = useI18n();

const diagnostics = computed(() => props.data.diagnostics ?? []);

const kindLabelKeys: Record<KotodamaStudioGraphNodeData['kind'], string> = {
  state: 'studio.graph.palette.state',
  map_state: 'studio.graph.palette.mapState',
  helper: 'studio.graph.palette.helper',
  entrypoint: 'studio.graph.palette.entrypoint',
  trigger: 'studio.graph.palette.trigger',
  guard: 'studio.graph.palette.guard',
  branch: 'studio.graph.palette.branch',
  loop: 'studio.graph.palette.loop',
  formula: 'studio.graph.palette.formula',
  assign_state: 'studio.graph.palette.assignState',
  map_write: 'studio.graph.palette.mapWrite',
  effect: 'studio.graph.palette.effect',
  return: 'studio.graph.palette.return',
  note: 'studio.graph.palette.note',
};

const kindLabel = computed(() => t(kindLabelKeys[props.data.kind]));

const badges = computed(() => {
  const config = props.data.config;
  switch (props.data.kind) {
    case 'state':
      return [config.name, config.valueType].filter(Boolean);
    case 'map_state':
      return [config.name, `Map<${config.keyType ?? 'Name'}, ${config.valueType ?? 'int'}>`].filter(Boolean);
    case 'entrypoint':
      return [config.name, config.permission ? t('studio.graph.badges.permission', { permission: config.permission }) : '', config.returnType ? `-> ${config.returnType}` : ''].filter(Boolean);
    case 'helper':
      return [config.name, config.returnType ? `-> ${config.returnType}` : ''].filter(Boolean);
    case 'trigger':
      return [config.id, config.mode, config.entrypoint ? t('studio.graph.badges.call', { entrypoint: config.entrypoint }) : ''].filter(Boolean);
    case 'effect':
      return [config.effect].filter(Boolean);
    case 'formula':
      return [config.name].filter(Boolean);
    case 'guard':
    case 'branch':
    case 'loop':
      return [config.condition].filter(Boolean).slice(0, 1);
    case 'assign_state':
    case 'map_write':
      return [config.target].filter(Boolean);
    case 'return':
      return [config.value ? t('studio.graph.badges.value') : t('studio.graph.badges.void')];
    case 'note':
      return [];
    default:
      return [];
  }
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.kotodama-graph-node {
  --graph-node-accent: #4f6b8a;
  position: relative;
  display: grid;
  gap: size(0.55);
  min-width: 260px;
  max-width: 340px;
  padding: size(1.15) size(1.25);
  border: 1px solid color-mix(in srgb, var(--graph-node-accent) 30%, rgba(42, 38, 34, 0.18));
  border-radius: size(1.25);
  background: theme-color('surface');
  box-shadow: none;
  color: #271f19;
  font-family: var(--app-font-family, 'Sora'), sans-serif;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(0.75);
  }

  &__kind,
  &__status {
    width: fit-content;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  &__kind {
    color: var(--graph-node-accent);
  }

  &__status {
    color: #9a341d;
  }

  strong {
    @include tpg-h4;
    color: #241c17;
    font-family: var(--app-font-family, 'Sora'), sans-serif;
  }

  p {
    @include tpg-s4;
    color: #685447;
    margin: 0;
  }

  &__badges {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.35);

    span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: 999px;
      padding: size(0.25) size(0.6);
      color: #40352d;
      background: color-mix(in srgb, var(--graph-node-accent) 10%, rgba(255, 255, 255, 0.7));
      border: 1px solid color-mix(in srgb, var(--graph-node-accent) 16%, rgba(116, 96, 78, 0.12));
      font-size: 11px;
    }
  }

  &__handle.vue-flow__handle {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 252, 246, 0.96);
    background: var(--graph-node-accent);
    box-shadow: none;
  }

  &__handle.vue-flow__handle-left {
    left: -4px;
  }

  &__handle.vue-flow__handle-right {
    right: -4px;
  }

  &--state,
  &--map_state {
    --graph-node-accent: #8a6a2f;
  }

  &--entrypoint,
  &--helper {
    --graph-node-accent: #315f86;
  }

  &--trigger {
    --graph-node-accent: #5d7a42;
  }

  &--guard,
  &--branch,
  &--loop {
    --graph-node-accent: #7a5440;
  }

  &--effect {
    --graph-node-accent: #b7472c;
  }

  &--return {
    --graph-node-accent: #5c4b84;
  }

  &--selected {
    box-shadow: none;
  }

  &--error {
    border-color: rgba(153, 42, 35, 0.55);
  }

  &--warning:not(&--error) {
    border-color: rgba(168, 106, 43, 0.5);
  }
}

html.dark .kotodama-graph-node {
  background: theme-color('surface');
  color: #f8ead9;
  border-color: color-mix(in srgb, var(--graph-node-accent) 40%, rgba(255, 255, 255, 0.1));
  box-shadow: none;

  strong {
    color: #fff2de;
  }

  p {
    color: #d9c6b4;
  }

  .kotodama-graph-node__badges span {
    color: #f5e1cb;
    background: color-mix(in srgb, var(--graph-node-accent) 20%, rgba(255, 255, 255, 0.05));
    border-color: color-mix(in srgb, var(--graph-node-accent) 28%, rgba(255, 255, 255, 0.08));
  }
}
</style>
