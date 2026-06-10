import type { RWA } from '@/shared/api/schemas';

export interface RwaProvenanceNode {
  id: string
  rwa: RWA | null
  depth: number
  column: number
  row: number
  x: number
  y: number
  isRoot: boolean
  isPlaceholder: boolean
}

export interface RwaProvenanceEdge {
  id: string
  source: string
  target: string
  quantity: string
}

export interface RwaProvenanceGraph {
  width: number
  height: number
  nodeWidth: number
  nodeHeight: number
  nodes: RwaProvenanceNode[]
  edges: RwaProvenanceEdge[]
}

export interface RwaProvenanceBundle {
  root: RWA
  graph: RwaProvenanceGraph
  missingAncestorIds: string[]
  truncated: boolean
}

export interface RwaProvenanceOptions {
  maxNodes?: number
}

export type FetchRwaRecord = (id: string) => Promise<RWA>;

const DEFAULT_MAX_NODES = 48;
const NODE_WIDTH = 272;
const NODE_HEIGHT = 132;
const COLUMN_GAP = 88;
const ROW_GAP = 44;
const GRAPH_PADDING = 24;

function sortById(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function createPlaceholderRecord(id: string): RwaProvenanceNode {
  return {
    id,
    rwa: null,
    depth: 0,
    column: 0,
    row: 0,
    x: 0,
    y: 0,
    isRoot: false,
    isPlaceholder: true,
  };
}

function buildRwaProvenanceGraph(
  rootId: string,
  records: ReadonlyMap<string, RWA>,
  placeholderIds: ReadonlySet<string>
): RwaProvenanceGraph {
  const depthById = new Map<string, number>([[rootId, 0]]);
  const reachableIds = new Set<string>([rootId]);

  const visit = (id: string, depth: number) => {
    const knownDepth = depthById.get(id);
    if (knownDepth === undefined || depth > knownDepth) {
      depthById.set(id, depth);
    }
    reachableIds.add(id);

    const rwa = records.get(id);
    if (!rwa) return;

    for (const parent of rwa.parents) {
      visit(parent.rwa, depth + 1);
    }
  };

  visit(rootId, 0);

  for (const id of placeholderIds) {
    reachableIds.add(id);
    if (!depthById.has(id)) {
      depthById.set(id, 1);
    }
  }

  const maxDepth = Math.max(...depthById.values(), 0);
  const rowsByDepth = new Map<number, string[]>();

  for (const id of sortById(reachableIds)) {
    const depth = depthById.get(id) ?? 0;
    const bucket = rowsByDepth.get(depth);
    if (bucket) {
      bucket.push(id);
    } else {
      rowsByDepth.set(depth, [id]);
    }
  }

  const maxRows = Math.max(...[...rowsByDepth.values()].map((items) => items.length), 1);
  const width = GRAPH_PADDING * 2 + (maxDepth + 1) * NODE_WIDTH + maxDepth * COLUMN_GAP;
  const height = GRAPH_PADDING * 2 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;

  const nodes: RwaProvenanceNode[] = [];
  const nodesById = new Map<string, RwaProvenanceNode>();

  for (const depth of [...rowsByDepth.keys()].sort((left, right) => right - left)) {
    const ids = rowsByDepth.get(depth) ?? [];
    const column = maxDepth - depth;

    ids.forEach((id, row) => {
      const x = GRAPH_PADDING + column * (NODE_WIDTH + COLUMN_GAP);
      const y = GRAPH_PADDING + row * (NODE_HEIGHT + ROW_GAP);
      const node = {
        ...createPlaceholderRecord(id),
        id,
        rwa: records.get(id) ?? null,
        depth,
        column,
        row,
        x,
        y,
        isRoot: id === rootId,
        isPlaceholder: !records.has(id),
      } satisfies RwaProvenanceNode;
      nodes.push(node);
      nodesById.set(id, node);
    });
  }

  const edges: RwaProvenanceEdge[] = [];
  const edgeIds = new Set<string>();

  for (const child of records.values()) {
    if (!reachableIds.has(child.id)) continue;
    for (const parent of child.parents) {
      if (!reachableIds.has(parent.rwa)) continue;
      const edgeId = `${parent.rwa}->${child.id}:${parent.quantity.toString()}`;
      if (edgeIds.has(edgeId)) continue;
      if (!nodesById.has(parent.rwa) || !nodesById.has(child.id)) continue;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source: parent.rwa,
        target: child.id,
        quantity: parent.quantity.toString(),
      });
    }
  }

  return {
    width,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    nodes,
    edges,
  };
}

export async function fetchRwaProvenanceBundle(
  rootId: string,
  fetchRwa: FetchRwaRecord,
  options?: RwaProvenanceOptions
): Promise<RwaProvenanceBundle> {
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const root = await fetchRwa(rootId);
  const records = new Map<string, RWA>([[root.id, root]]);
  const missingAncestorIds = new Set<string>();
  const queued = new Set<string>();
  const queue = root.parents.map((parent) => parent.rwa);
  let truncated = false;

  for (const id of queue) {
    queued.add(id);
  }

  while (queue.length) {
    const id = queue.shift()!;
    queued.delete(id);
    if (records.has(id) || missingAncestorIds.has(id)) continue;

    if (records.size >= maxNodes) {
      truncated = true;
      missingAncestorIds.add(id);
      continue;
    }

    try {
      const rwa = await fetchRwa(id);
      records.set(rwa.id, rwa);
      for (const parent of rwa.parents) {
        if (records.has(parent.rwa) || queued.has(parent.rwa) || missingAncestorIds.has(parent.rwa)) continue;
        queue.push(parent.rwa);
        queued.add(parent.rwa);
      }
    } catch {
      missingAncestorIds.add(id);
    }
  }

  return {
    root,
    graph: buildRwaProvenanceGraph(root.id, records, missingAncestorIds),
    missingAncestorIds: sortById(missingAncestorIds),
    truncated,
  };
}
