<template>
  <div
    class="contract-graph-canvas"
    data-test="studio-graph-canvas"
  >
    <VueFlow
      :nodes
      :edges
      :node-types
      :is-valid-connection
      class="contract-graph-canvas__flow"
      :min-zoom="0.25"
      :max-zoom="1.35"
      @connect="handleConnect"
      @nodes-change="handleNodesChange"
      @edges-change="handleEdgesChange"
      @node-click="handleNodeClick"
      @pane-click="emit('update:selectedNodeId', null)"
    >
      <Background
        :gap="24"
        :size="1.2"
        pattern-color="rgba(83, 103, 122, 0.18)"
      />
      <MiniMap
        pannable
        zoomable
      />
      <Controls />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  VueFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseEvent,
  useVueFlow,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import {
  isValidKotodamaStudioGraphConnection,
  type KotodamaStudioGraphDiagnostic,
  type KotodamaStudioGraphDocumentV2,
  type KotodamaStudioGraphEdge,
  type KotodamaStudioGraphNode,
  type KotodamaStudioGraphNodeData,
  type KotodamaStudioGraphNodeKind,
} from '@/shared/lib/kotodama-studio-graph';
import KotodamaGraphNode from './KotodamaGraphNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

type GraphNodeData = KotodamaStudioGraphNodeData & {
  diagnostics?: KotodamaStudioGraphDiagnostic[]
};

interface Props {
  modelValue: KotodamaStudioGraphDocumentV2['graph']
  selectedNodeId: string | null
  diagnostics?: KotodamaStudioGraphDiagnostic[]
}

const props = withDefaults(defineProps<Props>(), {
  diagnostics: () => [],
});

const emit = defineEmits<{
  'update:modelValue': [value: KotodamaStudioGraphDocumentV2['graph']]
  'update:selectedNodeId': [value: string | null]
}>();

const nodeTypes = {
  kotodamaGraph: markRaw(KotodamaGraphNode),
};

const nodes = ref<Node<GraphNodeData>[]>([]);
const edges = ref<Edge[]>([]);
const addStudioEdge = addEdge as unknown as (edge: Connection | Edge, edges: Edge[]) => Edge[];
const applyStudioNodeChanges = applyNodeChanges as unknown as (
  changes: NodeChange[],
  nodes: Node<GraphNodeData>[]
) => Node<GraphNodeData>[];
const applyStudioEdgeChanges = applyEdgeChanges as unknown as (changes: EdgeChange[], edges: Edge[]) => Edge[];
const { fitView, updateNodeInternals } = useVueFlow();
let fitFrame = 0;
let syncing = false;
let syncVersion = 0;

function diagnosticsForNode(nodeId: string): KotodamaStudioGraphDiagnostic[] {
  return props.diagnostics.filter((diagnostic) => diagnostic.nodeId === nodeId);
}

function toFlowNode(node: KotodamaStudioGraphNode): Node<GraphNodeData> {
  return {
    id: node.id,
    type: 'kotodamaGraph',
    position: node.position,
    data: {
      ...node.data,
      config: { ...node.data.config },
      ports: node.data.ports.map((port) => ({ ...port })),
      diagnostics: diagnosticsForNode(node.id),
    },
  };
}

function toFlowEdge(edge: KotodamaStudioGraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    markerEnd: MarkerType.ArrowClosed,
    zIndex: 2,
  };
}

function buildGraphModel(
  nextNodes: Node<GraphNodeData>[] = nodes.value,
  nextEdges: Edge[] = edges.value
): KotodamaStudioGraphDocumentV2['graph'] {
  return {
    nodes: nextNodes.map((node) => {
      const data = node.data ?? {
        title: 'Untitled',
        detail: '',
        kind: 'note' as const,
        config: {},
        ports: [],
      };

      return {
        id: node.id,
        type: 'kotodamaGraph',
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        data: {
          title: data.title,
          detail: data.detail,
          kind: data.kind,
          config: { ...data.config },
          ports: data.ports.map((port) => ({ ...port })),
        },
      };
    }),
    edges: nextEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : '',
    })),
  };
}

function graphSignature(value: KotodamaStudioGraphDocumentV2['graph']): string {
  return JSON.stringify(value);
}

function syncFromProps() {
  const nextNodes = props.modelValue.nodes.map(toFlowNode);
  const nextEdges = props.modelValue.edges.map(toFlowEdge);
  const releaseSync = (shouldFit: boolean) => {
    const version = ++syncVersion;
    nextTick(() => {
      if (version !== syncVersion) return;
      syncing = false;
      if (shouldFit) scheduleFit();
    }).catch(() => undefined);
  };

  if (graphSignature(buildGraphModel(nextNodes, nextEdges)) === graphSignature(buildGraphModel())) {
    syncing = true;
    nodes.value = nextNodes;
    releaseSync(false);
    return;
  }

  syncing = true;
  nodes.value = nextNodes;
  edges.value = nextEdges;
  releaseSync(true);
}

function emitModelValue() {
  if (syncing) return;
  const nextModel = buildGraphModel();
  if (graphSignature(nextModel) === graphSignature(props.modelValue)) return;
  emit('update:modelValue', nextModel);
}

function kindFor(nodeId: string | null | undefined): KotodamaStudioGraphNodeKind | null {
  if (!nodeId) return null;
  return nodes.value.find((node) => node.id === nodeId)?.data?.kind ?? null;
}

function isBodyKind(kind: KotodamaStudioGraphNodeKind | null): boolean {
  return kind === 'guard' ||
    kind === 'branch' ||
    kind === 'loop' ||
    kind === 'formula' ||
    kind === 'assign_state' ||
    kind === 'map_write' ||
    kind === 'effect' ||
    kind === 'return' ||
    kind === 'note';
}

function isValidConnection(connection: Connection | Edge): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  return isValidKotodamaStudioGraphConnection({
    version: 2,
    updatedAt: new Date(0).toISOString(),
    metadata: {
      title: 'Graph',
      dataspace: 'universal',
      authority: 'operator@studio.main',
      chainId: 'wonderland',
      description: '',
    },
    legacy: null,
    graph: buildGraphModel(),
  }, {
    id: 'id' in connection ? connection.id : undefined,
    source: connection.source,
    target: connection.target,
    label: 'label' in connection && typeof connection.label === 'string' ? connection.label : nextEdgeLabel(connection.source),
  });
}

function nextEdgeLabel(source: string): string {
  if (kindFor(source) !== 'branch') return 'next';
  const labels = new Set(edges.value.filter((edge) => edge.source === source).map((edge) => String(edge.label).toLowerCase()));
  if (!labels.has('then')) return 'then';
  if (!labels.has('else')) return 'else';
  return 'next';
}

function scheduleFit() {
  if (typeof window === 'undefined') return;
  if (fitFrame) window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(async () => {
    fitFrame = 0;
    await nextTick();
    if (!nodes.value.length) return;
    updateNodeInternals(nodes.value.map((node) => node.id));
    await fitView({
      duration: 0,
      padding: 0.24,
      minZoom: 0.25,
      maxZoom: 1.1,
    });
  });
}

watch(
  () => [props.modelValue, props.diagnostics],
  () => {
    syncFromProps();
  },
  { immediate: true, deep: true }
);

watch([nodes, edges], () => {
  emitModelValue();
}, { deep: true });

onMounted(() => {
  scheduleFit();
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && fitFrame) window.cancelAnimationFrame(fitFrame);
});

function handleConnect(connection: Connection) {
  if (!isValidConnection(connection)) return;
  const label = nextEdgeLabel(connection.source ?? '');
  edges.value = addStudioEdge({
    ...connection,
    id: `edge-${connection.source}-${connection.target}-${label}`,
    source: connection.source,
    target: connection.target,
    label,
    markerEnd: MarkerType.ArrowClosed,
    zIndex: 2,
  }, edges.value);
}

function handleNodesChange(changes: NodeChange[]) {
  if (syncing) return;
  const persistedChanges = changes.filter((change) => change.type === 'position' || change.type === 'remove');
  if (!persistedChanges.length) return;
  nodes.value = applyStudioNodeChanges(persistedChanges, nodes.value);
}

function handleEdgesChange(changes: EdgeChange[]) {
  if (syncing) return;
  const persistedChanges = changes.filter((change) => change.type === 'remove');
  if (!persistedChanges.length) return;
  edges.value = applyStudioEdgeChanges(persistedChanges, edges.value);
}

function handleNodeClick(event: NodeMouseEvent) {
  emit('update:selectedNodeId', event.node.id);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.contract-graph-canvas {
  min-height: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  border-radius: size(1.25);
  background:
    radial-gradient(circle at 10% 0%, rgba(55, 97, 129, 0.12), transparent 32%),
    linear-gradient(180deg, rgba(252, 249, 244, 0.98), rgba(242, 237, 228, 0.98));

  &__flow {
    min-height: 680px;
    height: 100%;
  }

  .vue-flow__background {
    opacity: 0.95;
  }

  .vue-flow__edge-path,
  .vue-flow__connection-path {
    stroke: #50677e;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .vue-flow__edge-textbg {
    fill: rgba(255, 252, 246, 0.92);
  }

  .vue-flow__edge-text {
    fill: #2f3f4f;
    font-size: 11px;
    font-weight: 700;
  }

  .vue-flow__edge-interaction {
    stroke-width: 18;
  }

  .vue-flow__controls {
    border-radius: size(1);
    overflow: hidden;
    box-shadow: 0 14px 24px rgba(42, 38, 34, 0.12);
  }

  .vue-flow__controls-button {
    background: rgba(255, 252, 246, 0.96);
    color: #2b2520;
    border-bottom-color: rgba(81, 72, 63, 0.12);
  }

  .vue-flow__minimap {
    background: rgba(255, 252, 246, 0.9);
    border-radius: size(1);
    box-shadow: 0 14px 28px rgba(42, 38, 34, 0.12);
  }
}

html.dark .contract-graph-canvas {
  background:
    radial-gradient(circle at 10% 0%, rgba(75, 113, 143, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(37, 32, 29, 0.98), rgba(27, 24, 22, 0.98));

  .vue-flow__edge-path,
  .vue-flow__connection-path {
    stroke: #9bb7cd;
  }

  .vue-flow__edge-textbg {
    fill: rgba(33, 29, 26, 0.94);
  }

  .vue-flow__edge-text {
    fill: #e7d7c5;
  }

  .vue-flow__controls-button,
  .vue-flow__minimap {
    background: rgba(45, 39, 35, 0.94);
    color: #f8ead9;
  }
}
</style>
