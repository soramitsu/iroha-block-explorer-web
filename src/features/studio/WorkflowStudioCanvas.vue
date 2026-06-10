<template>
  <div class="workflow-studio">
    <div class="workflow-studio__toolbar">
      <button
        v-for="option in palette"
        :key="option.type"
        type="button"
        class="workflow-studio__chip"
        @click="addNode(option)"
      >
        {{ option.label }}
      </button>
    </div>

    <div data-test="workflow-canvas" class="workflow-studio__canvas">
      <div ref="flowViewportEl" class="workflow-studio__viewport">
        <VueFlow
          :nodes
          :edges
          :node-types
          :is-valid-connection="isValidWorkflowConnection"
          class="workflow-studio__flow"
          :min-zoom="WORKFLOW_FIT_MIN_ZOOM"
          :max-zoom="WORKFLOW_MAX_ZOOM"
          @connect="handleConnect"
          @nodes-change="handleNodesChange"
          @edges-change="handleEdgesChange"
          @node-click="handleNodeClick"
          @pane-click="emit('select-node', null)"
        >
          <Background
            :gap="20"
            :size="1.2"
            pattern-color="rgba(217, 119, 6, 0.18)"
          />
          <MiniMap
            pannable
            zoomable
          />
          <Controls />
        </VueFlow>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  KotodamaStudioWorkflowEdge,
  KotodamaStudioWorkflowNode,
  KotodamaStudioWorkflowNodeData,
} from '@/shared/lib/kotodama-studio-document';
import {
  getNextKotodamaStudioWorkflowNodePosition,
  getNextKotodamaStudioWorkflowNodeId,
  isValidKotodamaStudioWorkflowConnection,
  sanitizeKotodamaStudioWorkflow,
} from '@/shared/lib/kotodama-studio-workflow';
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  VueFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeMouseEvent,
  useVueFlow,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import StudioFlowNode from './StudioFlowNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

interface Props {
  modelValue: {
    nodes: KotodamaStudioWorkflowNode[]
    edges: KotodamaStudioWorkflowEdge[]
  }
  linkedEntrypoints: string[]
}

interface PaletteNode {
  type: KotodamaStudioWorkflowNodeData['category']
  label: string
  caption: string
}

type WorkflowModelValue = Props['modelValue'];

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: Props['modelValue']]
  'select-node': [value: string | null]
}>();

const palette: PaletteNode[] = [
  { type: 'trigger', label: 'Add trigger', caption: 'Kick off a playful flow.' },
  { type: 'data', label: 'Add data', caption: 'Pull explorer data into the flow.' },
  { type: 'logic', label: 'Add branch', caption: 'Decide what happens next.' },
  { type: 'contract', label: 'Add contract', caption: 'Deploy or call a contract step.' },
  { type: 'output', label: 'Add output', caption: 'Show the final result.' },
];

const WORKFLOW_FIT_MIN_ZOOM = 0.55;
const WORKFLOW_MAX_ZOOM = 1.4;
const WORKFLOW_NODE_COLUMN_SPACING = 320;
const WORKFLOW_NODE_ROW_SPACING = 220;
const WORKFLOW_NODE_GRID_COLUMNS = 3;
const WORKFLOW_NODE_ORIGIN_X = 80;
const WORKFLOW_NODE_ORIGIN_Y = 80;
const WORKFLOW_EDGE_OPTIONS = {
  markerEnd: MarkerType.ArrowClosed,
  zIndex: 2,
};

const nodeTypes = {
  studio: markRaw(StudioFlowNode),
};

const flowViewportEl = ref<HTMLDivElement | null>(null);
const nodes = ref<Node<KotodamaStudioWorkflowNodeData>[]>([]);
const edges = ref<Edge[]>([]);
const addStudioEdge = addEdge as unknown as (edge: Connection | Edge, edges: Edge[]) => Edge[];
const applyStudioNodeChanges = applyNodeChanges as unknown as (
  changes: NodeChange[],
  nodes: Node<KotodamaStudioWorkflowNodeData>[]
) => Node<KotodamaStudioWorkflowNodeData>[];
const applyStudioEdgeChanges = applyEdgeChanges as unknown as (changes: EdgeChange[], edges: Edge[]) => Edge[];
const { fitView, updateNodeInternals } = useVueFlow();
let resizeObserver: ResizeObserver | null = null;
let fitFrame = 0;
let syncing = false;

function scheduleViewportFit(focusNodeIds: string[] = nodes.value.map((node) => node.id)) {
  if (typeof window === 'undefined') return;
  if (fitFrame) {
    window.cancelAnimationFrame(fitFrame);
  }

  fitFrame = window.requestAnimationFrame(async () => {
    fitFrame = 0;
    if (!nodes.value.length || focusNodeIds.length === 0) return;
    await nextTick();
    updateNodeInternals(nodes.value.map((node) => node.id));
    await fitView({
      duration: 0,
      padding: focusNodeIds.length === nodes.value.length ? 0.24 : 0.36,
      minZoom: WORKFLOW_FIT_MIN_ZOOM,
      maxZoom: WORKFLOW_MAX_ZOOM,
      nodes: focusNodeIds,
    });
  });
}

function isValidWorkflowConnection(connection: Connection | Edge) {
  return isValidKotodamaStudioWorkflowConnection(buildWorkflowModelValue(), {
    source: connection.source,
    target: connection.target,
    currentEdgeId: 'id' in connection ? connection.id : null,
  });
}

function toFlowNode(node: KotodamaStudioWorkflowNode): Node<KotodamaStudioWorkflowNodeData> {
  return {
    id: node.id,
    type: 'studio',
    position: node.position,
    data: { ...node.data },
  };
}

function toFlowEdge(edge: KotodamaStudioWorkflowEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    ...WORKFLOW_EDGE_OPTIONS,
  };
}

function syncFromProps() {
  const sanitizedWorkflow = sanitizeKotodamaStudioWorkflow(props.modelValue).workflow;
  if (workflowModelSignature(sanitizedWorkflow) === workflowModelSignature(buildWorkflowModelValue())) return;
  syncing = true;
  nodes.value = sanitizedWorkflow.nodes.map(toFlowNode);
  edges.value = sanitizedWorkflow.edges.map(toFlowEdge);
  syncing = false;
  scheduleViewportFit();
}

function buildWorkflowModelValue(
  nextNodes: Node<KotodamaStudioWorkflowNodeData>[] = nodes.value,
  nextEdges: Edge[] = edges.value
): WorkflowModelValue {
  return {
    nodes: nextNodes.map((node) => ({
      id: node.id,
      type: typeof node.type === 'string' ? node.type : 'studio',
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        title: node.data?.title ?? 'New node',
        caption: node.data?.caption ?? 'Describe this step.',
        category: node.data?.category ?? 'logic',
        binding: node.data?.binding ?? null,
        config: { ...(node.data?.config ?? {}) },
      },
    })),
    edges: nextEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : '',
    })),
  };
}

function workflowModelSignature(value: WorkflowModelValue): string {
  return JSON.stringify(value);
}

function defaultNodeConfig(option: PaletteNode): Record<string, string> {
  switch (option.type) {
    case 'trigger':
      return {
        mode: 'pre_commit',
        triggerId: nextTriggerIdLabel(),
      };
    case 'data':
      return {
        source: 'telemetry',
        scope: '',
      };
    case 'logic':
      return {
        condition: '',
        trueLabel: 'yes',
        falseLabel: 'no',
      };
    case 'contract':
      return {
        action: 'call',
      };
    case 'output':
      return {
        channel: 'dashboard',
        audience: '',
      };
  }
}

function nextTriggerIdLabel(): string {
  const triggerCount = nodes.value.filter((node) => node.data?.category === 'trigger').length;
  return `trigger_${triggerCount + 1}`;
}

function emitModelValue() {
  if (syncing) return;
  const nextModelValue = buildWorkflowModelValue();
  if (workflowModelSignature(nextModelValue) === workflowModelSignature(props.modelValue)) return;
  emit('update:modelValue', nextModelValue);
}

watch(
  () => props.modelValue,
  () => {
    syncFromProps();
  },
  { immediate: true, deep: true }
);

watch([nodes, edges], () => {
  emitModelValue();
}, { deep: true });

onMounted(() => {
  scheduleViewportFit();
  if (!flowViewportEl.value || typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver(() => {
    scheduleViewportFit();
  });
  resizeObserver.observe(flowViewportEl.value);
  if (flowViewportEl.value.parentElement) {
    resizeObserver.observe(flowViewportEl.value.parentElement);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (typeof window !== 'undefined' && fitFrame) {
    window.cancelAnimationFrame(fitFrame);
  }
});

function addNode(option: PaletteNode) {
  const defaultBinding = option.type === 'contract' ? props.linkedEntrypoints[0] ?? null : null;
  const workflow = buildWorkflowModelValue();
  const nextNodeId = getNextKotodamaStudioWorkflowNodeId(workflow, option.type);
  const nextNodePosition = getNextKotodamaStudioWorkflowNodePosition(workflow, {
    originX: WORKFLOW_NODE_ORIGIN_X,
    originY: WORKFLOW_NODE_ORIGIN_Y,
    columnSpacing: WORKFLOW_NODE_COLUMN_SPACING,
    rowSpacing: WORKFLOW_NODE_ROW_SPACING,
    columns: WORKFLOW_NODE_GRID_COLUMNS,
  });

  const nextNode: Node<KotodamaStudioWorkflowNodeData> = {
    id: nextNodeId,
    type: 'studio',
    position: nextNodePosition,
    data: {
      title: option.label.replace(/^Add /, ''),
      caption: option.caption,
      category: option.type,
      binding: defaultBinding,
      config: defaultNodeConfig(option),
    },
  };

  nodes.value = [
    ...nodes.value,
    nextNode,
  ];

  scheduleViewportFit([nextNode.id]);
  emit('select-node', nextNode.id);
}

function handleConnect(connection: Connection) {
  if (!connection.source || !connection.target) return;
  if (!isValidWorkflowConnection(connection)) return;

  edges.value = addStudioEdge({
    ...connection,
    id: `edge-${connection.source}-${connection.target}`,
    source: connection.source,
    target: connection.target,
    ...WORKFLOW_EDGE_OPTIONS,
  }, edges.value);
}

function handleNodesChange(changes: NodeChange[]) {
  nodes.value = applyStudioNodeChanges(changes, nodes.value);
}

function handleEdgesChange(changes: EdgeChange[]) {
  edges.value = applyStudioEdgeChanges(changes, edges.value);
}

function handleNodeClick(event: NodeMouseEvent) {
  emit('select-node', event.node.id);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.workflow-studio {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: size(1);
  font-family: var(--app-font-family, 'Sora'), sans-serif;

  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.75);
    padding: size(1);
    border-radius: size(2.5);
    background:
      linear-gradient(180deg, rgba(255, 251, 244, 0.94), rgba(242, 230, 208, 0.92));
    border: 1px solid rgba(117, 77, 44, 0.18);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      0 14px 28px rgba(72, 43, 24, 0.06);
  }

  &__chip {
    position: relative;
    border: 1px solid rgba(117, 77, 44, 0.16);
    border-radius: size(1.75);
    padding: size(0.75) size(1.25);
    background:
      linear-gradient(180deg, rgba(255, 249, 240, 0.98), rgba(246, 237, 220, 0.94));
    color: #3a271c;
    cursor: pointer;
    transition:
      transform 160ms ease,
      background-color 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;

    &::after {
      content: '';
      position: absolute;
      inset: size(0.25) auto size(0.25) size(0.25);
      width: 4px;
      border-radius: 999px;
      background: #c74b2a;
      opacity: 0.7;
    }

    &:hover {
      transform: translateY(-1px);
      border-color: rgba(199, 75, 42, 0.24);
      background: linear-gradient(180deg, rgba(255, 245, 234, 0.98), rgba(244, 230, 208, 0.96));
      box-shadow: 0 10px 18px rgba(72, 43, 24, 0.08);
    }
  }

  &__canvas {
    min-height: 420px;
    border-radius: size(4);
    overflow: hidden;
    display: grid;
    border: 1px solid rgba(117, 77, 44, 0.2);
    background:
      radial-gradient(circle at top left, rgba(199, 75, 42, 0.16), transparent 34%),
      linear-gradient(180deg, rgba(249, 241, 226, 0.98), rgba(241, 230, 210, 0.98));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.72),
      0 18px 36px rgba(72, 43, 24, 0.08);
  }

  &__viewport {
    min-height: 100%;
  }

  &__flow {
    min-height: 100%;
  }

  .vue-flow__background {
    opacity: 0.9;
  }

  .vue-flow__edge-path,
  .vue-flow__connection-path {
    stroke: #b34a32;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .vue-flow__edge-interaction {
    stroke-width: 18;
  }

  .vue-flow__edge.selected .vue-flow__edge-path {
    stroke: #8e341f;
  }

  .vue-flow__controls {
    box-shadow: 0 10px 22px rgba(72, 43, 24, 0.12);
    border-radius: size(2.25);
    overflow: hidden;
  }

  .vue-flow__controls-button {
    background: rgba(255, 251, 244, 0.94);
    border-bottom-color: rgba(117, 77, 44, 0.14);
    color: #3a271c;
  }

  .vue-flow__minimap {
    background: rgba(255, 250, 243, 0.88);
    border-radius: size(2.5);
    box-shadow: 0 12px 28px rgba(72, 43, 24, 0.08);
  }
}

html.dark .workflow-studio {
  &__toolbar {
    background: linear-gradient(180deg, rgba(57, 41, 33, 0.96), rgba(43, 31, 25, 0.94));
    border-color: rgba(244, 223, 188, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 14px 28px rgba(0, 0, 0, 0.18);
  }

  &__chip {
    background: linear-gradient(180deg, rgba(73, 53, 42, 0.98), rgba(58, 42, 35, 0.96));
    border-color: rgba(244, 223, 188, 0.08);
    color: #f6e6cf;
  }

  &__canvas {
    background:
      radial-gradient(circle at top left, rgba(199, 75, 42, 0.18), transparent 34%),
      linear-gradient(180deg, rgba(52, 38, 31, 0.96), rgba(39, 29, 25, 0.94));
    border-color: rgba(244, 223, 188, 0.08);
  }

  .vue-flow__controls-button {
    background: rgba(58, 42, 35, 0.96);
    color: #f6e6cf;
  }

  .vue-flow__minimap {
    background: rgba(52, 38, 31, 0.9);
  }
}
</style>
