import { z } from 'zod/v4';
import type { Instruction, TransactionStatus } from '@/shared/api/schemas';
import { isEncodedAssetLiteral, normalizeLooseAccountLiteral } from './account-literal';

export type TraceSeedType = 'account' | 'transaction';

export interface TraceSeed {
  type: TraceSeedType
  value: string
}

export interface ManualLabel {
  tag: string
  risky: boolean
}

export interface RiskSignals {
  score: number
  flags: string[]
}

export interface TraceNode {
  id: string
  depth: number
  inDegree: number
  outDegree: number
  eventCount: number
  firstSeenMs: number | null
  lastSeenMs: number | null
  minGapMs: number | null
  risk: RiskSignals
  manualLabel: ManualLabel | null
}

export interface TraceEdge {
  id: string
  source: string
  target: string
  count: number
  variants: string[]
  assetIds: string[]
  latestSeenMs: number
}

export interface TraceEvent {
  id: string
  source: string
  target: string
  variant: string
  assetId: string | null
  authority: string
  transactionHash: string
  instructionIndex: number
  transactionStatus: TransactionStatus
  block: number
  createdAtMs: number
}

export interface TraceCursor {
  accountId: string
  depth: number
  block: number
  page: number
  exhausted: boolean
}

export interface TraceNodePosition {
  x: number
  y: number
}

export interface TraceBundle {
  format: 'iroha-trace-bundle'
  version: 1
  exported_at: string
  torii_base_url: string
  seed: TraceSeed
  filters: {
    committed_only: boolean
    transfer_variants: 'all'
  }
  graph: {
    nodes: TraceNode[]
    edges: TraceEdge[]
    events: TraceEvent[]
  }
  cursors: TraceCursor[]
  labels: Record<string, ManualLabel>
  csv: {
    nodes: string
    edges: string
    events: string
  }
}

export interface ParsedTransferEdge {
  source: string
  target: string
  variant: string
  assetId: string | null
}

function asRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function parseAccountFromAssetLiteral(raw: string): string | null {
  const trimmed = normalizeWhitespace(raw);
  if (!trimmed) return null;
  if (!trimmed.includes('#')) {
    if (/^norito:/i.test(trimmed)) return null;
    return normalizeLooseAccountLiteral(trimmed);
  }
  const parts = trimmed.split('#');
  for (let idx = parts.length - 1; idx >= 0; idx -= 1) {
    const part = parts[idx]?.trim();
    if (!part) continue;
    const normalized = normalizeLooseAccountLiteral(part);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeAccountObjectId(raw: Record<string, unknown>): string | null {
  if (typeof raw.id !== 'string') return null;

  const trimmed = normalizeWhitespace(raw.id);
  if (!trimmed) return null;
  if (!/^norito:/i.test(trimmed)) return normalizeLooseAccountLiteral(trimmed);

  const markers = [raw.type, raw.kind, raw.object_type, raw.entity].filter((value): value is string => typeof value === 'string');
  if (markers.some((marker) => marker.toLowerCase().includes('account'))) {
    return normalizeLooseAccountLiteral(trimmed);
  }

  return null;
}

export function normalizeAccountLiteral(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = normalizeWhitespace(raw);
    if (!trimmed) return null;
    const normalized = normalizeLooseAccountLiteral(trimmed);
    if (normalized) return normalized;
    if (trimmed.includes('#')) {
      const fromAssetLiteral = parseAccountFromAssetLiteral(trimmed);
      if (fromAssetLiteral) return fromAssetLiteral;
    }
    return null;
  }
  if (!asRecord(raw)) return null;

  if (typeof raw.account_id === 'string') return normalizeAccountLiteral(raw.account_id);
  if (typeof raw.account === 'string') return normalizeAccountLiteral(raw.account);
  if (typeof raw.owner === 'string') return normalizeAccountLiteral(raw.owner);
  return normalizeAccountObjectId(raw);
}

function extractAssetIdHint(payload: Record<string, unknown>): string | null {
  const direct = readTrimmedString(payload, ['asset_id', 'asset', 'asset_definition', 'definition_id']);
  if (direct) return direct;

  const objectValue = readTrimmedString(payload, ['object']);
  if (objectValue && (objectValue.includes('#') || isEncodedAssetLiteral(objectValue))) {
    return objectValue;
  }

  const sourceValue = readTrimmedString(payload, ['source', 'from']);
  if (sourceValue && sourceValue.includes('#')) return sourceValue;

  return readNestedRecordId(payload, ['asset', 'object']);
}

function readTrimmedString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readNestedRecordId(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (!asRecord(value) || typeof value.id !== 'string' || !value.id.trim()) continue;
    return value.id.trim();
  }
  return null;
}

function readAccountPair(payload: Record<string, unknown>): { source: string | null, target: string | null } {
  const source = normalizeAccountLiteral(payload.source ?? payload.from ?? payload.sender ?? payload.owner);
  const target = normalizeAccountLiteral(
    payload.destination ?? payload.to ?? payload.receiver ?? payload.account ?? payload.recipient
  );
  return { source, target };
}

function collectBatchEntries(
  payload: Record<string, unknown>,
  variant: string,
  out: ParsedTransferEdge[]
) {
  if (!Array.isArray(payload.entries)) return;
  for (const entry of payload.entries) {
    if (!asRecord(entry)) continue;
    const { source, target } = readAccountPair(entry);
    if (!source || !target) continue;
    out.push({
      source,
      target,
      variant,
      assetId: extractAssetIdHint(entry),
    });
  }
}

export function extractTransferEdgesFromPayload(
  payload: unknown,
  options?: { authority?: string, fallbackVariant?: string }
): ParsedTransferEdge[] {
  const edges: ParsedTransferEdge[] = [];
  const dedupe = new Set<string>();

  const visit = (value: unknown, variantHint: string) => {
    if (!asRecord(value)) return;

    const variant = typeof value.variant === 'string' && value.variant.trim()
      ? value.variant.trim()
      : variantHint;
    const normalizedVariant = variant || options?.fallbackVariant || 'Transfer';

    collectBatchEntries(value, normalizedVariant, edges);

    const pair = readAccountPair(value);
    const source = pair.source ?? normalizeAccountLiteral(options?.authority ?? null);
    const target = pair.target;
    if (source && target) {
      edges.push({
        source,
        target,
        variant: normalizedVariant,
        assetId: extractAssetIdHint(value),
      });
    }

    if (asRecord(value.value)) {
      visit(value.value, normalizedVariant);
    }
    if (asRecord(value.payload)) {
      visit(value.payload, normalizedVariant);
    }
    if (asRecord(value.object)) {
      visit(value.object, normalizedVariant);
    }
  };

  visit(payload, options?.fallbackVariant ?? 'Transfer');

  const unique: ParsedTransferEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}|${edge.target}|${edge.variant}|${edge.assetId ?? ''}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    unique.push(edge);
  }
  return unique;
}

export function extractTransferEdgesFromInstruction(instruction: Instruction): ParsedTransferEdge[] {
  return extractTransferEdgesFromPayload(instruction.box.json.payload, {
    authority: instruction.authority,
    fallbackVariant: instruction.kind,
  });
}

export function instructionToTraceEvents(instruction: Instruction): TraceEvent[] {
  const edges = extractTransferEdgesFromInstruction(instruction);
  return edges.map((edge, edgeIndex) => ({
    id: `${instruction.transaction_hash}:${instruction.index}:${edgeIndex}:${edge.source}:${edge.target}`,
    source: edge.source,
    target: edge.target,
    variant: edge.variant,
    assetId: edge.assetId,
    authority: instruction.authority,
    transactionHash: instruction.transaction_hash,
    instructionIndex: instruction.index,
    transactionStatus: instruction.transaction_status,
    block: instruction.block,
    createdAtMs: instruction.created_at.getTime(),
  }));
}

export function computeRiskSignals(
  node: Pick<TraceNode, 'inDegree' | 'outDegree' | 'eventCount' | 'minGapMs'>,
  manualLabel: ManualLabel | null
): RiskSignals {
  const flags: string[] = [];
  let score = 0;

  if (node.outDegree >= 25) {
    score += 22;
    flags.push('high_fan_out');
  }
  if (node.inDegree >= 25) {
    score += 22;
    flags.push('high_fan_in');
  }
  if (node.outDegree >= 10 && node.inDegree >= 10) {
    score += 18;
    flags.push('hub_activity');
  }
  if (node.eventCount >= 200) {
    score += 14;
    flags.push('high_activity');
  }
  if (node.minGapMs !== null && node.minGapMs < 60_000) {
    score += 14;
    flags.push('rapid_hops');
  }
  if (manualLabel?.risky) {
    score += 30;
    flags.push('manual_risky_label');
  }

  return {
    score: Math.min(100, score),
    flags,
  };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildTraceLayout(nodes: readonly TraceNode[]): Record<string, TraceNodePosition> {
  const out: Record<string, TraceNodePosition> = {};
  for (const node of nodes) {
    const h1 = hashString(node.id);
    const h2 = hashString(`${node.id}:jitter`);
    const angle = (h1 / 0xffffffff) * Math.PI * 2;
    const jitter = (h2 / 0xffffffff) * 0.7;
    const radius = Math.max(1, node.depth + 1) + Math.min(2.5, Math.log10(node.eventCount + 1)) + jitter;
    out[node.id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }
  return out;
}

export function findShortestPath(source: string, target: string, edges: readonly TraceEdge[]): string[] | null {
  if (source === target) return [source];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }
  const visited = new Set<string>([source]);
  const queue: Array<{ id: string, path: string[] }> = [{ id: source, path: [source] }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const next = adjacency.get(current.id) ?? [];
    for (const nextId of next) {
      if (visited.has(nextId)) continue;
      const nextPath = [...current.path, nextId];
      if (nextId === target) return nextPath;
      visited.add(nextId);
      queue.push({ id: nextId, path: nextPath });
    }
  }
  return null;
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const header = columns.map(escapeCsvCell).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(','));
  return [header, ...lines].join('\n');
}

export function buildTraceCsv(
  nodes: readonly TraceNode[],
  edges: readonly TraceEdge[],
  events: readonly TraceEvent[]
): { nodes: string, edges: string, events: string } {
  const nodesCsv = toCsv(
    ['id', 'depth', 'in_degree', 'out_degree', 'event_count', 'risk_score', 'risk_flags', 'manual_label'],
    nodes.map((node) => ({
      id: node.id,
      depth: node.depth,
      in_degree: node.inDegree,
      out_degree: node.outDegree,
      event_count: node.eventCount,
      risk_score: node.risk.score,
      risk_flags: node.risk.flags.join('|'),
      manual_label: node.manualLabel?.tag ?? '',
    }))
  );

  const edgesCsv = toCsv(
    ['id', 'source', 'target', 'count', 'variants', 'asset_ids', 'latest_seen_ms'],
    edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      count: edge.count,
      variants: edge.variants.join('|'),
      asset_ids: edge.assetIds.join('|'),
      latest_seen_ms: edge.latestSeenMs,
    }))
  );

  const eventsCsv = toCsv(
    [
      'id',
      'transaction_hash',
      'instruction_index',
      'source',
      'target',
      'variant',
      'asset_id',
      'authority',
      'status',
      'block',
      'created_at_ms',
    ],
    events.map((event) => ({
      id: event.id,
      transaction_hash: event.transactionHash,
      instruction_index: event.instructionIndex,
      source: event.source,
      target: event.target,
      variant: event.variant,
      asset_id: event.assetId ?? '',
      authority: event.authority,
      status: event.transactionStatus,
      block: event.block,
      created_at_ms: event.createdAtMs,
    }))
  );

  return { nodes: nodesCsv, edges: edgesCsv, events: eventsCsv };
}

const ManualLabelSchema = z.object({
  tag: z.string(),
  risky: z.boolean(),
});

const RiskSignalsSchema = z.object({
  score: z.number(),
  flags: z.string().array(),
});

const TraceNodeSchema: z.ZodType<TraceNode> = z.object({
  id: z.string(),
  depth: z.number(),
  inDegree: z.number(),
  outDegree: z.number(),
  eventCount: z.number(),
  firstSeenMs: z.number().nullable(),
  lastSeenMs: z.number().nullable(),
  minGapMs: z.number().nullable(),
  risk: RiskSignalsSchema,
  manualLabel: ManualLabelSchema.nullable(),
});

const TraceEdgeSchema: z.ZodType<TraceEdge> = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  count: z.number(),
  variants: z.string().array(),
  assetIds: z.string().array(),
  latestSeenMs: z.number(),
});

const TraceEventSchema: z.ZodType<TraceEvent> = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  variant: z.string(),
  assetId: z.string().nullable(),
  authority: z.string(),
  transactionHash: z.string(),
  instructionIndex: z.number(),
  transactionStatus: z.enum(['Committed', 'Rejected']),
  block: z.number(),
  createdAtMs: z.number(),
});

const TraceCursorSchema: z.ZodType<TraceCursor> = z.object({
  accountId: z.string(),
  depth: z.number(),
  block: z.number(),
  page: z.number(),
  exhausted: z.boolean(),
});

const TraceSeedSchema: z.ZodType<TraceSeed> = z.object({
  type: z.enum(['account', 'transaction']),
  value: z.string(),
});

const TraceBundleSchema: z.ZodType<TraceBundle> = z.object({
  format: z.literal('iroha-trace-bundle'),
  version: z.literal(1),
  exported_at: z.string(),
  torii_base_url: z.string(),
  seed: TraceSeedSchema,
  filters: z.object({
    committed_only: z.boolean(),
    transfer_variants: z.literal('all'),
  }),
  graph: z.object({
    nodes: TraceNodeSchema.array(),
    edges: TraceEdgeSchema.array(),
    events: TraceEventSchema.array(),
  }),
  cursors: TraceCursorSchema.array(),
  labels: z.record(z.string(), ManualLabelSchema),
  csv: z.object({
    nodes: z.string(),
    edges: z.string(),
    events: z.string(),
  }),
});

export function parseTraceBundle(raw: unknown): TraceBundle {
  return TraceBundleSchema.parse(raw);
}

export function stringifyTraceBundle(bundle: TraceBundle): string {
  return JSON.stringify(bundle, null, 2);
}
