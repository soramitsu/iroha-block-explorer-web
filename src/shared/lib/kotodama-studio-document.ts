import { sanitizeKotodamaStudioWorkflow } from './kotodama-studio-workflow';

export const KOTODAMA_STUDIO_DOCUMENT_VERSION = 1;

export interface KotodamaStudioMetadata {
  title: string
  dataspace: string
  authority: string
  chainId: string
  description: string
}

export interface KotodamaStudioWorkflowNodeData {
  title: string
  caption: string
  category: 'trigger' | 'data' | 'contract' | 'logic' | 'output'
  binding: string | null
  config: Record<string, string>
}

export interface KotodamaStudioWorkflowNode {
  id: string
  type: string
  position: {
    x: number
    y: number
  }
  data: KotodamaStudioWorkflowNodeData
}

export interface KotodamaStudioWorkflowEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface KotodamaStudioDocument {
  version: 1
  updatedAt: string
  metadata: KotodamaStudioMetadata
  workspaceState: Record<string, unknown> | null
  workflow: {
    nodes: KotodamaStudioWorkflowNode[]
    edges: KotodamaStudioWorkflowEdge[]
  }
}

export interface KotodamaStudioDocumentNormalizationResult {
  document: KotodamaStudioDocument
  droppedWorkflowEdgeCount: number
}

export function createEmptyKotodamaStudioDocument(): KotodamaStudioDocument {
  return {
    version: KOTODAMA_STUDIO_DOCUMENT_VERSION,
    updatedAt: new Date(0).toISOString(),
    metadata: {
      title: 'FriendlyRules',
      dataspace: 'universal',
      authority: 'operator@studio.main',
      chainId: 'wonderland',
      description: 'A playful contract made from colorful blocks.',
    },
    workspaceState: null,
    workflow: {
      nodes: [],
      edges: [],
    },
  };
}

function readString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNodeData(value: unknown): KotodamaStudioWorkflowNodeData {
  const record = readRecord(value);
  const category = record?.category;
  const configRecord = readRecord(record?.config);

  return {
    title: readString(record?.title, 'New node'),
    caption: readString(record?.caption, 'Describe this step.'),
    category:
      category === 'trigger' ||
      category === 'data' ||
      category === 'contract' ||
      category === 'logic' ||
      category === 'output'
        ? category
        : 'logic',
    binding: typeof record?.binding === 'string' && record.binding.trim().length > 0 ? record.binding.trim() : null,
    config: Object.fromEntries(
      Object.entries(configRecord ?? {}).map(([key, item]) => [key, typeof item === 'string' ? item : String(item ?? '')])
    ),
  };
}

function normalizeNode(value: unknown, index: number): KotodamaStudioWorkflowNode {
  const record = readRecord(value);
  const positionRecord = readRecord(record?.position);

  return {
    id: readString(record?.id, `node-${index + 1}`),
    type: readString(record?.type, 'studio'),
    position: {
      x: typeof positionRecord?.x === 'number' && Number.isFinite(positionRecord.x) ? positionRecord.x : index * 80,
      y: typeof positionRecord?.y === 'number' && Number.isFinite(positionRecord.y) ? positionRecord.y : index * 48,
    },
    data: normalizeNodeData(record?.data),
  };
}

function normalizeEdge(value: unknown, index: number): KotodamaStudioWorkflowEdge {
  const record = readRecord(value);

  return {
    id: readString(record?.id, `edge-${index + 1}`),
    source: readString(record?.source, ''),
    target: readString(record?.target, ''),
    label: typeof record?.label === 'string' ? record.label : '',
  };
}

export function normalizeKotodamaStudioDocument(value: unknown): KotodamaStudioDocument {
  return normalizeKotodamaStudioDocumentWithDiagnostics(value).document;
}

export function normalizeKotodamaStudioDocumentWithDiagnostics(value: unknown): KotodamaStudioDocumentNormalizationResult {
  const fallback = createEmptyKotodamaStudioDocument();
  const record = readRecord(value);
  const metadata = readRecord(record?.metadata);
  const workflow = readRecord(record?.workflow);
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes.map(normalizeNode) : fallback.workflow.nodes;
  const edges = Array.isArray(workflow?.edges) ? workflow.edges.map(normalizeEdge) : fallback.workflow.edges;
  const sanitizedWorkflow = sanitizeKotodamaStudioWorkflow({
    nodes,
    edges: edges.filter((edge) => edge.source.length > 0 && edge.target.length > 0),
  });

  return {
    document: {
      version: KOTODAMA_STUDIO_DOCUMENT_VERSION,
      updatedAt: typeof record?.updatedAt === 'string' && record.updatedAt.trim().length > 0
        ? record.updatedAt
        : fallback.updatedAt,
      metadata: {
        title: readString(metadata?.title, fallback.metadata.title),
        dataspace: readString(metadata?.dataspace, fallback.metadata.dataspace),
        authority: readString(metadata?.authority, fallback.metadata.authority),
        chainId: readString(metadata?.chainId, fallback.metadata.chainId),
        description: readString(metadata?.description, fallback.metadata.description),
      },
      workspaceState: readRecord(record?.workspaceState),
      workflow: sanitizedWorkflow.workflow,
    },
    droppedWorkflowEdgeCount: sanitizedWorkflow.droppedEdgeCount,
  };
}

export function parseKotodamaStudioDocument(raw: string): KotodamaStudioDocument {
  return parseKotodamaStudioDocumentWithDiagnostics(raw).document;
}

export function parseKotodamaStudioDocumentWithDiagnostics(raw: string): KotodamaStudioDocumentNormalizationResult {
  return normalizeKotodamaStudioDocumentWithDiagnostics(JSON.parse(raw));
}

export function stringifyKotodamaStudioDocument(document: KotodamaStudioDocument): string {
  return JSON.stringify(document, null, 2);
}
