import type {
  KotodamaStudioDocument,
  KotodamaStudioWorkflowEdge,
  KotodamaStudioWorkflowNode,
  KotodamaStudioWorkflowNodeData,
} from './kotodama-studio-document';

export type KotodamaStudioWorkflow = KotodamaStudioDocument['workflow'];
export type KotodamaStudioWorkflowNodeCategory = KotodamaStudioWorkflowNodeData['category'];

export interface KotodamaStudioWorkflowConnectionCandidate {
  source: string | null | undefined
  target: string | null | undefined
  currentEdgeId?: string | null
}

export interface KotodamaStudioWorkflowSanitizationResult {
  workflow: KotodamaStudioWorkflow
  droppedEdgeCount: number
}

export interface KotodamaStudioWorkflowBindingReconciliationResult {
  workflow: KotodamaStudioWorkflow
  clearedBindingCount: number
}

export interface KotodamaStudioWorkflowNodePlacementOptions {
  columnSpacing: number
  columns: number
  originX: number
  originY: number
  rowSpacing: number
}

export const KOTODAMA_STUDIO_WORKFLOW_INCOMING_LIMITS: Record<KotodamaStudioWorkflowNodeCategory, number> = {
  trigger: 0,
  data: 1,
  contract: 1,
  logic: 1,
  output: 1,
};

export const KOTODAMA_STUDIO_WORKFLOW_OUTGOING_LIMITS: Record<KotodamaStudioWorkflowNodeCategory, number> = {
  trigger: 1,
  data: 1,
  contract: 1,
  logic: 2,
  output: 0,
};

const WORKFLOW_NODE_ID_PATTERN = /^(trigger|data|contract|logic|output)-(\d+)$/;

function cloneNode(node: KotodamaStudioWorkflowNode): KotodamaStudioWorkflowNode {
  return {
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      config: { ...node.data.config },
    },
  };
}

function cloneEdge(edge: KotodamaStudioWorkflowEdge): KotodamaStudioWorkflowEdge {
  return { ...edge };
}

function buildNodeIndex(nodes: KotodamaStudioWorkflowNode[]) {
  return new Map(nodes.map((node) => [node.id, node] as const));
}

export function getNextKotodamaStudioWorkflowNodeId(
  workflow: KotodamaStudioWorkflow,
  category: KotodamaStudioWorkflowNodeCategory
): string {
  const highestSuffix = workflow.nodes.reduce((maxSuffix, node) => {
    const match = WORKFLOW_NODE_ID_PATTERN.exec(node.id);
    if (!match || match[1] !== category) return maxSuffix;
    const suffix = Number.parseInt(match[2] ?? '', 10);
    return Number.isFinite(suffix) ? Math.max(maxSuffix, suffix) : maxSuffix;
  }, 0);

  return `${category}-${highestSuffix + 1}`;
}

export function getNextKotodamaStudioWorkflowNodePosition(
  workflow: KotodamaStudioWorkflow,
  options: KotodamaStudioWorkflowNodePlacementOptions
): { x: number, y: number } {
  const occupiedSlots = new Set(
    workflow.nodes.map((node) => {
      const column = Math.max(0, Math.round((node.position.x - options.originX) / options.columnSpacing));
      const row = Math.max(0, Math.round((node.position.y - options.originY) / options.rowSpacing));
      return `${column}:${row}`;
    })
  );

  let slotIndex = 0;
  while (occupiedSlots.has(`${slotIndex % options.columns}:${Math.floor(slotIndex / options.columns)}`)) {
    slotIndex += 1;
  }

  return {
    x: options.originX + (slotIndex % options.columns) * options.columnSpacing,
    y: options.originY + Math.floor(slotIndex / options.columns) * options.rowSpacing,
  };
}

export function isValidKotodamaStudioWorkflowConnection(
  workflow: KotodamaStudioWorkflow,
  candidate: KotodamaStudioWorkflowConnectionCandidate
): boolean {
  if (!candidate.source || !candidate.target) return false;
  if (candidate.source === candidate.target) return false;

  const nodeIndex = buildNodeIndex(workflow.nodes);
  const sourceNode = nodeIndex.get(candidate.source);
  const targetNode = nodeIndex.get(candidate.target);
  if (!sourceNode || !targetNode) return false;

  const sourceCategory = sourceNode.data.category;
  const targetCategory = targetNode.data.category;

  if (sourceCategory === 'output' || targetCategory === 'trigger') return false;

  const existingEdges = workflow.edges.filter((edge) => edge.id !== candidate.currentEdgeId);
  if (existingEdges.some((edge) => edge.source === candidate.source && edge.target === candidate.target)) {
    return false;
  }

  const nextOutgoingCount = existingEdges.filter((edge) => edge.source === candidate.source).length + 1;
  const nextIncomingCount = existingEdges.filter((edge) => edge.target === candidate.target).length + 1;

  return nextOutgoingCount <= KOTODAMA_STUDIO_WORKFLOW_OUTGOING_LIMITS[sourceCategory]
    && nextIncomingCount <= KOTODAMA_STUDIO_WORKFLOW_INCOMING_LIMITS[targetCategory];
}

export function sanitizeKotodamaStudioWorkflow(
  workflow: KotodamaStudioWorkflow
): KotodamaStudioWorkflowSanitizationResult {
  const sanitizedNodes = workflow.nodes.map(cloneNode);
  const sanitizedEdges: KotodamaStudioWorkflowEdge[] = [];
  let droppedEdgeCount = 0;

  for (const edge of workflow.edges) {
    const clonedEdge = cloneEdge(edge);
    const nextWorkflow: KotodamaStudioWorkflow = {
      nodes: sanitizedNodes,
      edges: sanitizedEdges,
    };

    if (
      isValidKotodamaStudioWorkflowConnection(nextWorkflow, {
        source: clonedEdge.source,
        target: clonedEdge.target,
        currentEdgeId: clonedEdge.id,
      })
    ) {
      sanitizedEdges.push(clonedEdge);
    } else {
      droppedEdgeCount += 1;
    }
  }

  return {
    workflow: {
      nodes: sanitizedNodes,
      edges: sanitizedEdges,
    },
    droppedEdgeCount,
  };
}

export function reconcileKotodamaStudioWorkflowBindings(
  workflow: KotodamaStudioWorkflow,
  validEntrypointNames: string[]
): KotodamaStudioWorkflowBindingReconciliationResult {
  const validBindings = new Set(
    validEntrypointNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
  );

  let clearedBindingCount = 0;
  const nodes = workflow.nodes.map((node) => {
    const nextNode = cloneNode(node);

    if (
      nextNode.data.category === 'contract'
      && nextNode.data.binding
      && !validBindings.has(nextNode.data.binding)
    ) {
      nextNode.data.binding = null;
      clearedBindingCount += 1;
    }

    return nextNode;
  });

  return {
    workflow: {
      nodes,
      edges: workflow.edges.map(cloneEdge),
    },
    clearedBindingCount,
  };
}
