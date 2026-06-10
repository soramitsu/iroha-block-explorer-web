import type { KotodamaStudioMetadata } from './kotodama-studio-document';
import type { KotodamaStudioWorkspaceSummary } from './kotodama-studio-source';

export const KOTODAMA_STUDIO_GRAPH_DOCUMENT_VERSION = 2;

export type KotodamaStudioGraphTemplateId =
  | 'stablecoin'
  | 'threshold_escrow'
  | 'asset_ops'
  | 'subscription'
  | 'irohaswap_reduced';

export type KotodamaStudioGraphNodeKind =
  | 'state'
  | 'map_state'
  | 'helper'
  | 'entrypoint'
  | 'trigger'
  | 'guard'
  | 'branch'
  | 'loop'
  | 'formula'
  | 'assign_state'
  | 'map_write'
  | 'effect'
  | 'return'
  | 'note';

export type KotodamaStudioGraphDiagnosticSeverity = 'error' | 'warning';

export type KotodamaStudioGraphValueType =
  | 'flow'
  | 'void'
  | 'unknown'
  | 'int'
  | 'bool'
  | 'AccountId'
  | 'AssetDefinitionId'
  | 'DomainId'
  | 'Name'
  | 'Json'
  | 'Blob'
  | 'NoritoBytes'
  | `Map<${string}, ${string}>`;

export interface KotodamaStudioGraphPort {
  id: string
  direction: 'input' | 'output'
  label: string
  valueType: KotodamaStudioGraphValueType
  role: 'flow' | 'value' | 'param' | 'state' | 'effect'
}

export interface KotodamaStudioGraphParam {
  name: string
  valueType: KotodamaStudioGraphValueType
}

export interface KotodamaStudioGraphNodeData {
  title: string
  detail: string
  kind: KotodamaStudioGraphNodeKind
  config: Record<string, string>
  ports: KotodamaStudioGraphPort[]
}

export interface KotodamaStudioGraphNode {
  id: string
  type: 'kotodamaGraph'
  position: {
    x: number
    y: number
  }
  data: KotodamaStudioGraphNodeData
}

export interface KotodamaStudioGraphEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface KotodamaStudioGraphDocumentV2 {
  version: 2
  updatedAt: string
  metadata: KotodamaStudioMetadata
  legacy?: KotodamaStudioGraphLegacyImportRecord | null
  graph: {
    nodes: KotodamaStudioGraphNode[]
    edges: KotodamaStudioGraphEdge[]
  }
}

export interface KotodamaStudioGraphSourceRange {
  nodeId: string
  startLine: number
  endLine: number
}

export interface KotodamaStudioGraphSourceOutput {
  source: string
  summary: KotodamaStudioWorkspaceSummary
  ranges: KotodamaStudioGraphSourceRange[]
}

export interface KotodamaStudioGraphDiagnostic {
  code: string
  severity: KotodamaStudioGraphDiagnosticSeverity
  message: string
  nodeId: string | null
  field?: string
}

export interface KotodamaStudioGraphLegacyImportRecord {
  sourceVersion: number | string
  importedAt: string
  workspaceState: Record<string, unknown> | null
  workflow: Record<string, unknown> | null
  notes: string[]
}

export interface KotodamaStudioGraphConfigField {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  options?: Array<{ label: string, value: string }>
}

export interface KotodamaStudioGraphPaletteItem {
  kind: KotodamaStudioGraphNodeKind
  label: string
  group: 'Declarations' | 'Logic' | 'Values' | 'Iroha Effects'
}

export const KOTODAMA_STUDIO_GRAPH_PALETTE: KotodamaStudioGraphPaletteItem[] = [
  { group: 'Declarations', kind: 'state', label: 'State' },
  { group: 'Declarations', kind: 'map_state', label: 'Map state' },
  { group: 'Declarations', kind: 'helper', label: 'Helper function' },
  { group: 'Declarations', kind: 'entrypoint', label: 'Public entrypoint' },
  { group: 'Declarations', kind: 'trigger', label: 'Trigger' },
  { group: 'Logic', kind: 'guard', label: 'Guard/assert' },
  { group: 'Logic', kind: 'branch', label: 'If/else branch' },
  { group: 'Logic', kind: 'loop', label: 'While loop' },
  { group: 'Logic', kind: 'formula', label: 'Formula' },
  { group: 'Logic', kind: 'assign_state', label: 'Set state' },
  { group: 'Logic', kind: 'map_write', label: 'Set map value' },
  { group: 'Logic', kind: 'return', label: 'Return' },
  { group: 'Iroha Effects', kind: 'effect', label: 'Iroha effect' },
  { group: 'Values', kind: 'note', label: 'Note' },
];

export const KOTODAMA_STUDIO_GRAPH_CONFIG_FIELDS: Record<KotodamaStudioGraphNodeKind, KotodamaStudioGraphConfigField[]> = {
  state: [
    { key: 'name', label: 'State name', kind: 'text' },
    {
      key: 'valueType',
      label: 'Type',
      kind: 'select',
      options: [
        { label: 'int', value: 'int' },
        { label: 'bool', value: 'bool' },
        { label: 'AccountId', value: 'AccountId' },
        { label: 'AssetDefinitionId', value: 'AssetDefinitionId' },
        { label: 'DomainId', value: 'DomainId' },
        { label: 'Name', value: 'Name' },
        { label: 'Json', value: 'Json' },
        { label: 'Blob', value: 'Blob' },
        { label: 'NoritoBytes', value: 'NoritoBytes' },
      ],
    },
  ],
  map_state: [
    { key: 'name', label: 'Map name', kind: 'text' },
    { key: 'keyType', label: 'Key type', kind: 'text' },
    { key: 'valueType', label: 'Value type', kind: 'text' },
  ],
  helper: [
    { key: 'name', label: 'Function name', kind: 'text' },
    { key: 'params', label: 'Parameters', kind: 'textarea' },
    { key: 'returnType', label: 'Return type', kind: 'text' },
  ],
  entrypoint: [
    { key: 'name', label: 'Entrypoint name', kind: 'text' },
    { key: 'params', label: 'Parameters', kind: 'textarea' },
    { key: 'returnType', label: 'Return type', kind: 'text' },
    { key: 'permission', label: 'Permission', kind: 'text' },
  ],
  trigger: [
    { key: 'id', label: 'Trigger id', kind: 'text' },
    { key: 'entrypoint', label: 'Entrypoint', kind: 'text' },
    {
      key: 'mode',
      label: 'Mode',
      kind: 'select',
      options: [
        { label: 'Pre-commit', value: 'pre_commit' },
        { label: 'Manual', value: 'manual' },
        { label: 'Schedule', value: 'schedule' },
      ],
    },
    { key: 'startMs', label: 'Schedule start ms', kind: 'text' },
    { key: 'periodMs', label: 'Schedule period ms', kind: 'text' },
  ],
  guard: [
    { key: 'condition', label: 'Condition', kind: 'textarea' },
    { key: 'message', label: 'Failure message', kind: 'text' },
  ],
  branch: [
    { key: 'condition', label: 'Condition', kind: 'textarea' },
  ],
  loop: [
    { key: 'condition', label: 'Loop while', kind: 'textarea' },
  ],
  formula: [
    { key: 'name', label: 'Local name', kind: 'text' },
    {
      key: 'valueType',
      label: 'Output type',
      kind: 'select',
      options: [
        { label: 'Infer from expression', value: '' },
        { label: 'int', value: 'int' },
        { label: 'bool', value: 'bool' },
        { label: 'AccountId', value: 'AccountId' },
        { label: 'AssetDefinitionId', value: 'AssetDefinitionId' },
        { label: 'DomainId', value: 'DomainId' },
        { label: 'Name', value: 'Name' },
        { label: 'Json', value: 'Json' },
        { label: 'Blob', value: 'Blob' },
        { label: 'NoritoBytes', value: 'NoritoBytes' },
      ],
    },
    { key: 'expression', label: 'Expression', kind: 'textarea' },
    { key: 'left', label: 'Formula left operand', kind: 'text' },
    {
      key: 'operator',
      label: 'Formula operator',
      kind: 'select',
      options: [
        { label: 'Custom expression', value: '' },
        { label: '+', value: '+' },
        { label: '-', value: '-' },
        { label: '*', value: '*' },
        { label: '/', value: '/' },
        { label: '==', value: '==' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: '&&', value: '&&' },
        { label: '||', value: '||' },
      ],
    },
    { key: 'right', label: 'Formula right operand', kind: 'text' },
  ],
  assign_state: [
    { key: 'target', label: 'State name', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'textarea' },
  ],
  map_write: [
    { key: 'target', label: 'Map name', kind: 'text' },
    { key: 'key', label: 'Key', kind: 'textarea' },
    { key: 'value', label: 'Value', kind: 'textarea' },
  ],
  effect: [
    {
      key: 'effect',
      label: 'Effect',
      kind: 'select',
      options: [
        { label: 'info', value: 'info' },
        { label: 'transfer_asset', value: 'transfer_asset' },
        { label: 'mint_asset', value: 'mint_asset' },
        { label: 'burn_asset', value: 'burn_asset' },
        { label: 'set_account_detail', value: 'set_account_detail' },
        { label: 'execute_query', value: 'execute_query' },
        { label: 'execute_instruction', value: 'execute_instruction' },
        { label: 'call function', value: 'call_function' },
        { label: 'custom statement', value: 'custom' },
      ],
    },
    { key: 'args', label: 'Arguments', kind: 'textarea' },
    { key: 'from', label: 'From account', kind: 'text' },
    { key: 'to', label: 'To account', kind: 'text' },
    { key: 'account', label: 'Account', kind: 'text' },
    { key: 'assetDefinition', label: 'Asset definition', kind: 'text' },
    { key: 'amount', label: 'Amount', kind: 'text' },
    { key: 'detailKey', label: 'Detail key', kind: 'text' },
    { key: 'detailValue', label: 'Detail value', kind: 'text' },
    { key: 'queryPayload', label: 'Query payload', kind: 'text' },
    { key: 'instructionPayload', label: 'Instruction payload', kind: 'text' },
    { key: 'callName', label: 'Function name', kind: 'text' },
    { key: 'callArgs', label: 'Function arguments', kind: 'text' },
    { key: 'statement', label: 'Custom statement', kind: 'textarea' },
  ],
  return: [
    { key: 'value', label: 'Return value', kind: 'textarea' },
  ],
  note: [
    { key: 'body', label: 'Note', kind: 'textarea' },
  ],
};

const BODY_NODE_KINDS = new Set<KotodamaStudioGraphNodeKind>([
  'guard',
  'branch',
  'loop',
  'formula',
  'assign_state',
  'map_write',
  'effect',
  'return',
  'note',
]);

const DECLARATION_NODE_KINDS = new Set<KotodamaStudioGraphNodeKind>([
  'state',
  'map_state',
  'helper',
  'entrypoint',
  'trigger',
]);

function defaultMetadata(): KotodamaStudioMetadata {
  return {
    title: 'GraphFirstContract',
    dataspace: 'universal',
    authority: 'operator@studio.main',
    chainId: 'wonderland',
    description: 'A deployable Kotodama contract built from a typed graph.',
  };
}

function graphNode(
  id: string,
  kind: KotodamaStudioGraphNodeKind,
  title: string,
  detail: string,
  x: number,
  y: number,
  config: Record<string, string> = {}
): KotodamaStudioGraphNode {
  const defaults = defaultNodeData(kind);
  const expandedConfig = expandStructuredConfig(kind, { ...defaults.config, ...config });
  return withGraphNodePorts({
    id,
    type: 'kotodamaGraph',
    position: { x, y },
    data: {
      title,
      detail,
      kind,
      config: expandedConfig,
      ports: [],
    },
  });
}

function graphEdge(source: string, target: string, label = 'next'): KotodamaStudioGraphEdge {
  return {
    id: `edge-${source}-${target}-${label || 'next'}`,
    source,
    target,
    label,
  };
}

function cloneGraphDocument(document: KotodamaStudioGraphDocumentV2): KotodamaStudioGraphDocumentV2 {
  return {
    version: 2,
    updatedAt: document.updatedAt,
    metadata: { ...document.metadata },
    legacy: document.legacy ? cloneLegacyImportRecord(document.legacy) : null,
    graph: {
      nodes: document.graph.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          config: { ...node.data.config },
          ports: node.data.ports.map((port) => ({ ...port })),
        },
      })),
      edges: document.graph.edges.map((edge) => ({ ...edge })),
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cloneRecord(value: Record<string, unknown> | null): Record<string, unknown> | null {
  return value ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : null;
}

function cloneLegacyImportRecord(value: KotodamaStudioGraphLegacyImportRecord): KotodamaStudioGraphLegacyImportRecord {
  return {
    sourceVersion: value.sourceVersion,
    importedAt: value.importedAt,
    workspaceState: cloneRecord(value.workspaceState),
    workflow: cloneRecord(value.workflow),
    notes: [...value.notes],
  };
}

function readLegacyImportRecord(value: unknown): KotodamaStudioGraphLegacyImportRecord | null {
  const record = readRecord(value);
  if (!record) return null;
  return {
    sourceVersion: typeof record.sourceVersion === 'number' || typeof record.sourceVersion === 'string' ? record.sourceVersion : 'unknown',
    importedAt: readString(record.importedAt, new Date(0).toISOString()),
    workspaceState: cloneRecord(readRecord(record.workspaceState)),
    workflow: cloneRecord(readRecord(record.workflow)),
    notes: Array.isArray(record.notes)
      ? record.notes.map((note) => readString(note)).filter(Boolean)
      : [],
  };
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readPosition(value: unknown, fallback: { x: number, y: number }): { x: number, y: number } {
  const record = readRecord(value);
  const x = typeof record?.x === 'number' && Number.isFinite(record.x) ? record.x : fallback.x;
  const y = typeof record?.y === 'number' && Number.isFinite(record.y) ? record.y : fallback.y;
  return { x, y };
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^([^A-Za-z_])/, '_$1')
    .replace(/^_+$/, '');
  return normalized.length > 0 ? normalized : fallback;
}

function quoteString(value: string): string {
  return JSON.stringify(value);
}

function normalizeStatement(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
}

function expandStructuredConfig(kind: KotodamaStudioGraphNodeKind, config: Record<string, string>): Record<string, string> {
  const next = { ...config };
  if (kind === 'effect' && next.args) {
    const args = splitArguments(next.args);
    if (next.effect === 'transfer_asset') {
      next.from ||= args[0] ?? '';
      next.to ||= args[1] ?? '';
      next.assetDefinition ||= args[2] ?? '';
      next.amount ||= args[3] ?? '';
    } else if (next.effect === 'mint_asset' || next.effect === 'burn_asset') {
      next.account ||= args[0] ?? '';
      next.assetDefinition ||= args[1] ?? '';
      next.amount ||= args[2] ?? '';
    } else if (next.effect === 'set_account_detail') {
      next.account ||= args[0] ?? '';
      next.detailKey ||= args[1] ?? '';
      next.detailValue ||= args[2] ?? '';
    } else if (next.effect === 'call_function') {
      const callMatch = /^(?<name>[A-Za-z_][A-Za-z0-9_]*)\((?<args>.*)\)$/u.exec(args[0] ?? '');
      next.callName ||= callMatch?.groups?.name ?? '';
      next.callArgs ||= callMatch?.groups?.args ?? '';
    } else if (next.effect === 'execute_query') {
      next.queryPayload ||= args[0] ?? '';
    } else if (next.effect === 'execute_instruction') {
      next.instructionPayload ||= args[0] ?? '';
    }
  }

  if (kind === 'formula' && next.expression && !next.operator) {
    const match = /^(?<left>.+?)\s*(?<operator>==|!=|>=|<=|&&|\|\||[+\-*/<>])\s*(?<right>.+)$/u.exec(next.expression);
    if (match?.groups) {
      next.left ||= match.groups.left.trim();
      next.operator ||= match.groups.operator;
      next.right ||= match.groups.right.trim();
    }
  }

  return next;
}

function readMetadata(value: unknown): KotodamaStudioMetadata {
  const fallback = defaultMetadata();
  const record = readRecord(value);
  return {
    title: readString(record?.title, fallback.title),
    dataspace: readString(record?.dataspace, fallback.dataspace),
    authority: readString(record?.authority, fallback.authority),
    chainId: readString(record?.chainId, fallback.chainId),
    description: readString(record?.description, fallback.description),
  };
}

function normalizeGraphNode(value: unknown, index: number): KotodamaStudioGraphNode {
  const record = readRecord(value);
  const data = readRecord(record?.data);
  const rawKind = readString(data?.kind, 'note') as KotodamaStudioGraphNodeKind;
  const kind = [...BODY_NODE_KINDS, ...DECLARATION_NODE_KINDS].includes(rawKind) ? rawKind : 'note';
  const configRecord = readRecord(data?.config);
  const defaults = defaultNodeData(kind);
  const expandedConfig = expandStructuredConfig(kind, {
    ...defaults.config,
    ...Object.fromEntries(
      Object.entries(configRecord ?? {}).map(([key, item]) => [key, typeof item === 'string' ? item : String(item ?? '')])
    ),
  });

  return withGraphNodePorts({
    id: readString(record?.id, `${kind}-${index + 1}`),
    type: 'kotodamaGraph',
    position: readPosition(record?.position, { x: 80 + (index % 4) * 280, y: 80 + Math.floor(index / 4) * 180 }),
    data: {
      title: readString(data?.title, defaults.title),
      detail: readString(data?.detail, defaults.detail),
      kind,
      config: expandedConfig,
      ports: [],
    },
  });
}

function normalizeGraphEdge(value: unknown, index: number): KotodamaStudioGraphEdge {
  const record = readRecord(value);
  return {
    id: readString(record?.id, `edge-${index + 1}`),
    source: readString(record?.source),
    target: readString(record?.target),
    label: readString(record?.label, 'next'),
  };
}

function typedPort(
  id: string,
  direction: KotodamaStudioGraphPort['direction'],
  label: string,
  valueType: KotodamaStudioGraphValueType,
  role: KotodamaStudioGraphPort['role']
): KotodamaStudioGraphPort {
  return { id, direction, label, valueType, role };
}

function normalizeValueType(value: string, fallback: KotodamaStudioGraphValueType = 'unknown'): KotodamaStudioGraphValueType {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed === 'int' ||
    trimmed === 'bool' ||
    trimmed === 'AccountId' ||
    trimmed === 'AssetDefinitionId' ||
    trimmed === 'DomainId' ||
    trimmed === 'Name' ||
    trimmed === 'Json' ||
    trimmed === 'Blob' ||
    trimmed === 'NoritoBytes' ||
    trimmed === 'void' ||
    trimmed === 'flow') {
    return trimmed;
  }
  if (/^Map<[^,>]+,\s*[^>]+>$/u.test(trimmed)) return trimmed as KotodamaStudioGraphValueType;
  return fallback;
}

export function parseKotodamaStudioGraphParams(value: string): KotodamaStudioGraphParam[] {
  return value
    .split(/[\n,]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colonMatch = /^(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?<type>[A-Za-z][A-Za-z0-9_]*(?:<[^>]+>)?)$/u.exec(part);
      if (colonMatch?.groups) {
        return {
          name: colonMatch.groups.name,
          valueType: normalizeValueType(colonMatch.groups.type),
        };
      }

      const typeFirstMatch = /^(?<type>[A-Za-z][A-Za-z0-9_]*(?:<[^>]+>)?)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)$/u.exec(part);
      if (typeFirstMatch?.groups) {
        return {
          name: typeFirstMatch.groups.name,
          valueType: normalizeValueType(typeFirstMatch.groups.type),
        };
      }

      return null;
    })
    .filter((param): param is KotodamaStudioGraphParam => param !== null);
}

function formatKotodamaStudioGraphParams(params: KotodamaStudioGraphParam[]): string {
  return params.map((param) => `${param.name}: ${param.valueType}`).join(', ');
}

function parseStructuredParams(node: KotodamaStudioGraphNode): KotodamaStudioGraphParam[] {
  const structured = readString(node.data.config.paramsJson);
  if (structured) {
    try {
      const parsed = JSON.parse(structured) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            const record = readRecord(item);
            const name = normalizeIdentifier(readString(record?.name), '');
            const valueType = normalizeValueType(readString(record?.valueType));
            return name ? { name, valueType } : null;
          })
          .filter((param): param is KotodamaStudioGraphParam => param !== null);
      }
    } catch {
      return [];
    }
  }

  return parseKotodamaStudioGraphParams(config(node, 'params'));
}

function renderParams(node: KotodamaStudioGraphNode): string {
  const params = parseStructuredParams(node);
  return params.length > 0 ? formatKotodamaStudioGraphParams(params) : splitParams(config(node, 'params'));
}

function formulaExpression(node: KotodamaStudioGraphNode): string {
  const left = config(node, 'left');
  const operator = config(node, 'operator');
  const right = config(node, 'right');
  if (left && operator && right) return `${left} ${operator} ${right}`;
  return config(node, 'expression', '0');
}

function mapType(keyType: string, valueType: string): KotodamaStudioGraphValueType {
  return `Map<${normalizeValueType(keyType, 'unknown')}, ${normalizeValueType(valueType, 'unknown')}>`;
}

function typeFromLiteralOrIdentifier(
  expression: string,
  env: Map<string, KotodamaStudioGraphValueType>,
  mapStates: Map<string, { keyType: KotodamaStudioGraphValueType, valueType: KotodamaStudioGraphValueType }>,
  functionReturns: Map<string, KotodamaStudioGraphValueType>
): KotodamaStudioGraphValueType {
  const trimmed = expression.trim();
  if (!trimmed) return 'unknown';
  if (trimmed === 'true' || trimmed === 'false') return 'bool';
  if (/^-?\d+(?:_\d+)*$/u.test(trimmed)) return 'int';
  if (/^(?:!|\(.+\)|.+\s(?:==|!=|>=|<=|>|<|&&|\|\|)\s.+)/u.test(trimmed)) return 'bool';
  if (/^(?:authority\(\)|account!\()/u.test(trimmed)) return 'AccountId';
  if (/^asset_definition!\(/u.test(trimmed)) return 'AssetDefinitionId';
  if (/^domain!\(/u.test(trimmed)) return 'DomainId';
  if (/^name!\(/u.test(trimmed)) return 'Name';
  if (/^(?:json!\(|\{|\[)/u.test(trimmed)) return 'Json';
  if (/^(?:blob!\(|0x[0-9a-f]+)/iu.test(trimmed)) return 'Blob';
  if (/^norito_bytes\(/u.test(trimmed)) return 'NoritoBytes';

  const ternaryMatch = /^.+\?\s*(?<left>.+)\s*:\s*(?<right>.+)$/u.exec(trimmed);
  if (ternaryMatch?.groups) {
    const leftType = typeFromLiteralOrIdentifier(ternaryMatch.groups.left, env, mapStates, functionReturns);
    const rightType = typeFromLiteralOrIdentifier(ternaryMatch.groups.right, env, mapStates, functionReturns);
    return leftType === rightType ? leftType : 'unknown';
  }

  const callMatch = /^(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(/u.exec(trimmed);
  if (callMatch?.groups) {
    return functionReturns.get(callMatch.groups.name) ?? 'unknown';
  }

  const mapReadMatch = /^(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\[/u.exec(trimmed);
  if (mapReadMatch?.groups) {
    return mapStates.get(mapReadMatch.groups.name)?.valueType ?? 'unknown';
  }

  if (/[+\-*/%]/u.test(trimmed)) return 'int';
  return env.get(trimmed) ?? 'unknown';
}

function splitArguments(value: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (!quote) {
      if (char === '(' || char === '[' || char === '{') depth++;
      if (char === ')' || char === ']' || char === '}') depth--;
      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function effectArgs(node: KotodamaStudioGraphNode): string[] {
  const effect = config(node, 'effect', 'info');
  const args = config(node, 'args');
  const hasStructuredArgs = [
    'from',
    'to',
    'account',
    'assetDefinition',
    'amount',
    'detailKey',
    'detailValue',
    'queryPayload',
    'instructionPayload',
    'callName',
    'callArgs',
  ].some((key) => config(node, key));
  if (args && !hasStructuredArgs) return splitArguments(args);
  if (effect === 'transfer_asset') {
    return [config(node, 'from'), config(node, 'to'), config(node, 'assetDefinition'), config(node, 'amount')].filter(Boolean);
  }
  if (effect === 'mint_asset' || effect === 'burn_asset') {
    return [config(node, 'account'), config(node, 'assetDefinition'), config(node, 'amount')].filter(Boolean);
  }
  if (effect === 'set_account_detail') {
    return [config(node, 'account'), config(node, 'detailKey'), config(node, 'detailValue')].filter(Boolean);
  }
  if (effect === 'call_function') {
    const callName = config(node, 'callName');
    return callName ? [`${callName}(${config(node, 'callArgs')})`] : [];
  }
  return [];
}

function expressionTypeForNode(
  document: KotodamaStudioGraphDocumentV2,
  node: KotodamaStudioGraphNode,
  expression: string
): KotodamaStudioGraphValueType {
  const env = buildTypeEnvironment(document, node.id);
  return typeFromLiteralOrIdentifier(expression, env.values, env.mapStates, env.functionReturns);
}

export function deriveKotodamaStudioGraphPorts(
  document: KotodamaStudioGraphDocumentV2 | null,
  node: KotodamaStudioGraphNode
): KotodamaStudioGraphPort[] {
  const ports: KotodamaStudioGraphPort[] = [];
  const kind = node.data.kind;
  const flowInputKinds = new Set<KotodamaStudioGraphNodeKind>(['guard', 'branch', 'loop', 'formula', 'assign_state', 'map_write', 'effect', 'return', 'note']);
  const flowOutputKinds = new Set<KotodamaStudioGraphNodeKind>(['helper', 'entrypoint', 'guard', 'branch', 'loop', 'formula', 'assign_state', 'map_write', 'effect', 'note']);

  if (flowInputKinds.has(kind)) ports.push(typedPort('flow-in', 'input', 'flow in', 'flow', 'flow'));
  if (flowOutputKinds.has(kind)) {
    if (kind === 'branch') {
      ports.push(typedPort('then', 'output', 'then', 'flow', 'flow'));
      ports.push(typedPort('else', 'output', 'else', 'flow', 'flow'));
      ports.push(typedPort('next', 'output', 'next', 'flow', 'flow'));
    } else if (kind === 'loop') {
      ports.push(typedPort('body', 'output', 'body', 'flow', 'flow'));
      ports.push(typedPort('next', 'output', 'next', 'flow', 'flow'));
    } else {
      ports.push(typedPort('next', 'output', 'next', 'flow', 'flow'));
    }
  }

  if (kind === 'state') {
    ports.push(typedPort('value', 'output', config(node, 'name', 'state'), normalizeValueType(config(node, 'valueType', 'int')), 'state'));
  } else if (kind === 'map_state') {
    ports.push(typedPort('map', 'output', config(node, 'name', 'MapState'), mapType(config(node, 'keyType', 'Name'), config(node, 'valueType', 'int')), 'state'));
  } else if (kind === 'entrypoint' || kind === 'helper') {
    for (const param of parseStructuredParams(node)) {
      ports.push(typedPort(`param-${param.name}`, 'output', param.name, param.valueType, 'param'));
    }
    const returnType = normalizeValueType(config(node, 'returnType'), 'void');
    if (returnType !== 'void') ports.push(typedPort('return', 'output', 'return', returnType, 'value'));
  } else if (kind === 'formula') {
    const configured = normalizeValueType(config(node, 'valueType'), 'unknown');
    const inferred = configured === 'unknown' && document ? expressionTypeForNode(document, node, formulaExpression(node)) : configured;
    ports.push(typedPort('value', 'output', normalizeIdentifier(config(node, 'name'), 'value'), inferred, 'value'));
  } else if (kind === 'guard' || kind === 'branch' || kind === 'loop') {
    ports.push(typedPort('condition', 'input', 'condition', 'bool', 'value'));
  } else if (kind === 'assign_state') {
    const targetType = document ? buildStateTypeMap(document).get(normalizeIdentifier(config(node, 'target'), '')) ?? 'unknown' : 'unknown';
    ports.push(typedPort('value', 'input', config(node, 'target', 'state value'), targetType, 'value'));
  } else if (kind === 'map_write') {
    const target = document ? buildMapStateTypeMap(document).get(normalizeIdentifier(config(node, 'target'), '')) : null;
    ports.push(typedPort('key', 'input', 'key', target?.keyType ?? 'unknown', 'value'));
    ports.push(typedPort('value', 'input', 'value', target?.valueType ?? 'unknown', 'value'));
  } else if (kind === 'effect') {
    const effect = config(node, 'effect', 'info');
    const effectPorts: Record<string, KotodamaStudioGraphValueType[]> = {
      transfer_asset: ['AccountId', 'AccountId', 'AssetDefinitionId', 'int'],
      mint_asset: ['AccountId', 'AssetDefinitionId', 'int'],
      burn_asset: ['AccountId', 'AssetDefinitionId', 'int'],
      set_account_detail: ['AccountId', 'Name', 'Json'],
      execute_query: ['NoritoBytes'],
      execute_instruction: ['NoritoBytes'],
    };
    for (const [index, valueType] of (effectPorts[effect] ?? []).entries()) {
      ports.push(typedPort(`arg-${index + 1}`, 'input', `arg ${index + 1}`, valueType, 'effect'));
    }
  } else if (kind === 'return') {
    ports.push(typedPort('value', 'input', 'return value', document ? expectedReturnTypeForNode(document, node.id) : 'unknown', 'value'));
  }

  return ports;
}

function withGraphNodePorts(node: KotodamaStudioGraphNode, document: KotodamaStudioGraphDocumentV2 | null = null): KotodamaStudioGraphNode {
  return {
    ...node,
    data: {
      ...node.data,
      config: { ...node.data.config },
      ports: deriveKotodamaStudioGraphPorts(document, node),
    },
  };
}

export function defaultNodeData(kind: KotodamaStudioGraphNodeKind): KotodamaStudioGraphNodeData {
  switch (kind) {
    case 'state':
      return { kind, title: 'State field', detail: 'Durable scalar value', config: { name: 'counter', valueType: 'int' }, ports: [] };
    case 'map_state':
      return { kind, title: 'Map state', detail: 'Durable keyed value', config: { name: 'Ledger', keyType: 'Name', valueType: 'int' }, ports: [] };
    case 'helper':
      return { kind, title: 'Helper function', detail: 'Reusable internal logic', config: { name: 'helper', params: '', returnType: '' }, ports: [] };
    case 'entrypoint':
      return { kind, title: 'Public entrypoint', detail: 'Callable contract action', config: { name: 'run', params: '', returnType: '', permission: 'Admin' }, ports: [] };
    case 'trigger':
      return { kind, title: 'Trigger', detail: 'Schedules or reacts to an entrypoint', config: { id: 'trigger_1', entrypoint: 'run', mode: 'pre_commit', startMs: '0', periodMs: '60000' }, ports: [] };
    case 'guard':
      return { kind, title: 'Guard', detail: 'Stop when a condition fails', config: { condition: 'amount > 0', message: 'invalid amount' }, ports: [] };
    case 'branch':
      return { kind, title: 'Branch', detail: 'Route logic by condition', config: { condition: 'value > 0' }, ports: [] };
    case 'loop':
      return { kind, title: 'Loop', detail: 'Repeat while true', config: { condition: 'i < limit' }, ports: [] };
    case 'formula':
      return { kind, title: 'Formula', detail: 'Create a local value', config: { name: 'value', valueType: '', expression: 'amount * price', left: '', operator: '', right: '' }, ports: [] };
    case 'assign_state':
      return { kind, title: 'Set state', detail: 'Write a durable scalar', config: { target: 'counter', value: 'counter + 1' }, ports: [] };
    case 'map_write':
      return { kind, title: 'Set map value', detail: 'Write durable keyed state', config: { target: 'Ledger', key: 'pool', value: 'amount' }, ports: [] };
    case 'effect':
      return { kind, title: 'Iroha effect', detail: 'Execute a chain side effect', config: { effect: 'info', args: '"hello"', statement: '', from: '', to: '', account: '', assetDefinition: '', amount: '', detailKey: '', detailValue: '', queryPayload: '', instructionPayload: '', callName: '', callArgs: '' }, ports: [] };
    case 'return':
      return { kind, title: 'Return', detail: 'Finish with a value', config: { value: '' }, ports: [] };
    case 'note':
      return { kind, title: 'Note', detail: 'Design note', config: { body: 'Explain this step.' }, ports: [] };
  }
}

export function createKotodamaStudioGraphNode(
  kind: KotodamaStudioGraphNodeKind,
  index: number,
  position: { x: number, y: number }
): KotodamaStudioGraphNode {
  const data = defaultNodeData(kind);
  return withGraphNodePorts({
    id: `${kind}-${index}`,
    type: 'kotodamaGraph',
    position,
    data: {
      ...data,
      config: { ...data.config },
      ports: [],
    },
  });
}

export function createEmptyKotodamaStudioGraphDocument(): KotodamaStudioGraphDocumentV2 {
  return createKotodamaStudioGraphTemplate('stablecoin');
}

export function createKotodamaStudioGraphTemplate(templateId: KotodamaStudioGraphTemplateId): KotodamaStudioGraphDocumentV2 {
  return refreshKotodamaStudioGraphPorts(createKotodamaStudioGraphTemplateDraft(templateId));
}

function createKotodamaStudioGraphTemplateDraft(templateId: KotodamaStudioGraphTemplateId): KotodamaStudioGraphDocumentV2 {
  const updatedAt = new Date(0).toISOString();

  if (templateId === 'asset_ops') {
    return {
      version: 2,
      updatedAt,
      metadata: {
        title: 'AssetOps',
        dataspace: 'universal',
        authority: 'operator@studio.main',
        chainId: 'wonderland',
        description: 'Mint, transfer, and burn one asset definition.',
      },
      graph: {
        nodes: [
          graphNode('entry-execute', 'entrypoint', 'execute', 'Public asset operation entrypoint', 80, 120, { name: 'execute', params: '', returnType: '', permission: 'Admin' }),
          graphNode('let-alice', 'formula', 'Authority as alice', 'Cache the caller account', 380, 60, { name: 'alice', expression: 'authority()' }),
          graphNode('let-bob', 'formula', 'Authority as bob', 'Demo recipient account', 680, 60, { name: 'bob', expression: 'authority()' }),
          graphNode('let-coin', 'formula', 'Asset definition', 'Typed asset pointer', 980, 60, { name: 'coin', expression: 'asset_definition!("6pEP9RjNoZ7beWkT3pLfKoM1dyfi")' }),
          graphNode('mint', 'effect', 'Mint asset', 'Mint initial balance', 380, 250, { effect: 'mint_asset', args: 'alice, coin, 1000' }),
          graphNode('transfer', 'effect', 'Transfer asset', 'Move part of the balance', 680, 250, { effect: 'transfer_asset', args: 'alice, bob, coin, 500' }),
          graphNode('burn', 'effect', 'Burn asset', 'Remove a portion from supply', 980, 250, { effect: 'burn_asset', args: 'bob, coin, 100' }),
        ],
        edges: [
          graphEdge('entry-execute', 'let-alice'),
          graphEdge('let-alice', 'let-bob'),
          graphEdge('let-bob', 'let-coin'),
          graphEdge('let-coin', 'mint'),
          graphEdge('mint', 'transfer'),
          graphEdge('transfer', 'burn'),
        ],
      },
    };
  }

  if (templateId === 'subscription') {
    return {
      version: 2,
      updatedAt,
      metadata: {
        title: 'SubscriptionBilling',
        dataspace: 'stream',
        authority: 'billing@stream.main',
        chainId: 'wonderland',
        description: 'Schedule a recurring subscription charge.',
      },
      graph: {
        nodes: [
          graphNode('state-renewals', 'state', 'renewals', 'Number of renewal attempts', 80, 60, { name: 'renewals', valueType: 'int' }),
          graphNode('entry-bill', 'entrypoint', 'bill', 'Charge the customer and update state', 80, 260, { name: 'bill', params: '', returnType: '', permission: 'Billing' }),
          graphNode('charge', 'effect', 'Charge customer', 'Transfer billing asset', 390, 260, { effect: 'transfer_asset', args: 'account!("customer@stream.main"), account!("treasury@stream.main"), asset_definition!("6pEP9RjNoZ7beWkT3pLfKoM1dyfi"), 10' }),
          graphNode('renew', 'assign_state', 'Record renewal', 'Update renewal counter', 700, 260, { target: 'renewals', value: '2' }),
          graphNode('trigger-monthly', 'trigger', 'Monthly trigger', 'Runs the billing entrypoint', 80, 470, { id: 'bill_monthly', entrypoint: 'bill', mode: 'schedule', startMs: '0', periodMs: '2592000000' }),
        ],
        edges: [
          graphEdge('entry-bill', 'charge'),
          graphEdge('charge', 'renew'),
        ],
      },
    };
  }

  if (templateId === 'threshold_escrow') {
    return {
      version: 2,
      updatedAt,
      metadata: {
        title: 'ThresholdEscrow',
        dataspace: 'escrow',
        authority: 'operator@escrow.main',
        chainId: 'wonderland',
        description: 'Open, fund, release, and refund a threshold escrow.',
      },
      graph: {
        nodes: [
          graphNode('state-payer', 'state', 'payer_account', 'Escrow payer', 80, 40, { name: 'payer_account', valueType: 'AccountId' }),
          graphNode('state-recipient', 'state', 'recipient_account', 'Escrow recipient', 310, 40, { name: 'recipient_account', valueType: 'AccountId' }),
          graphNode('state-escrow-account', 'state', 'escrow_account_id', 'Escrow account', 540, 40, { name: 'escrow_account_id', valueType: 'AccountId' }),
          graphNode('state-asset', 'state', 'escrow_asset_definition', 'Escrow asset', 770, 40, { name: 'escrow_asset_definition', valueType: 'AssetDefinitionId' }),
          graphNode('state-target', 'state', 'target_amount_value', 'Funding target', 1000, 40, { name: 'target_amount_value', valueType: 'int' }),
          graphNode('state-funded', 'state', 'funded_amount_value', 'Funded amount', 1230, 40, { name: 'funded_amount_value', valueType: 'int' }),
          graphNode('state-open', 'state', 'is_open', 'Open flag', 1460, 40, { name: 'is_open', valueType: 'bool' }),
          graphNode('state-released', 'state', 'is_released', 'Released flag', 1690, 40, { name: 'is_released', valueType: 'bool' }),
          graphNode('state-refunded', 'state', 'is_refunded', 'Refunded flag', 1920, 40, { name: 'is_refunded', valueType: 'bool' }),
          graphNode('helper-open', 'helper', 'assert_open', 'Shared open-state guard', 80, 230, { name: 'assert_open', params: '', returnType: '' }),
          graphNode('guard-open', 'guard', 'Escrow is open', 'Require open escrow', 370, 230, { condition: 'is_open', message: 'escrow is not open' }),
          graphNode('guard-not-released', 'guard', 'Not released', 'Prevent double release', 660, 230, { condition: '!is_released', message: 'escrow already released' }),
          graphNode('guard-not-refunded', 'guard', 'Not refunded', 'Prevent double refund', 950, 230, { condition: '!is_refunded', message: 'escrow already refunded' }),
          graphNode('helper-payer', 'helper', 'assert_payer', 'Caller must be payer', 80, 420, { name: 'assert_payer', params: '', returnType: '' }),
          graphNode('guard-payer', 'guard', 'Only payer', 'Authority matches payer', 370, 420, { condition: 'authority() == payer_account', message: 'only payer may call this entrypoint' }),
          graphNode('entry-open', 'entrypoint', 'open_escrow', 'Initialize escrow terms', 80, 650, { name: 'open_escrow', params: 'recipient: AccountId, escrow_account: AccountId, asset_definition: AssetDefinitionId, target_amount: int', returnType: '', permission: 'Admin' }),
          graphNode('guard-target', 'guard', 'Target positive', 'Require a positive funding target', 390, 650, { condition: 'target_amount > 0', message: 'target_amount must be positive' }),
          graphNode('set-payer', 'assign_state', 'Set payer', 'Store payer authority', 700, 650, { target: 'payer_account', value: 'authority()' }),
          graphNode('set-recipient', 'assign_state', 'Set recipient', 'Store recipient', 1010, 650, { target: 'recipient_account', value: 'recipient' }),
          graphNode('set-escrow-account', 'assign_state', 'Set escrow account', 'Store escrow account', 1320, 650, { target: 'escrow_account_id', value: 'escrow_account' }),
          graphNode('set-asset', 'assign_state', 'Set asset', 'Store asset definition', 1630, 650, { target: 'escrow_asset_definition', value: 'asset_definition' }),
          graphNode('set-target', 'assign_state', 'Set target', 'Store target amount', 1940, 650, { target: 'target_amount_value', value: 'target_amount' }),
          graphNode('set-funded-zero', 'assign_state', 'Clear funded', 'Reset funding', 2250, 650, { target: 'funded_amount_value', value: '0' }),
          graphNode('set-open', 'assign_state', 'Mark open', 'Open the escrow', 2560, 650, { target: 'is_open', value: 'true' }),
          graphNode('set-released-false', 'assign_state', 'Clear released', 'Reset release flag', 2870, 650, { target: 'is_released', value: 'false' }),
          graphNode('set-refunded-false', 'assign_state', 'Clear refunded', 'Reset refund flag', 3180, 650, { target: 'is_refunded', value: 'false' }),
          graphNode('entry-deposit', 'entrypoint', 'deposit', 'Fund escrow', 80, 920, { name: 'deposit', params: 'amount: int', returnType: '', permission: 'Admin' }),
          graphNode('call-open', 'effect', 'Assert open', 'Use shared guard', 390, 920, { effect: 'call_function', args: 'assert_open()' }),
          graphNode('call-payer', 'effect', 'Assert payer', 'Use payer guard', 700, 920, { effect: 'call_function', args: 'assert_payer()' }),
          graphNode('guard-amount', 'guard', 'Positive deposit', 'Require positive amount', 1010, 920, { condition: 'amount > 0', message: 'amount must be positive' }),
          graphNode('next-funded', 'formula', 'Next funded', 'Compute post-deposit amount', 1320, 920, { name: 'next_funded', expression: 'funded_amount_value + amount' }),
          graphNode('guard-target-max', 'guard', 'Within target', 'Avoid overfunding', 1630, 920, { condition: 'next_funded <= target_amount_value', message: 'deposit exceeds target_amount' }),
          graphNode('deposit-transfer', 'effect', 'Transfer deposit', 'Move funds into escrow', 1940, 920, { effect: 'transfer_asset', args: 'payer_account, escrow_account_id, escrow_asset_definition, amount' }),
          graphNode('set-funded-next', 'assign_state', 'Update funded', 'Store funded total', 2250, 920, { target: 'funded_amount_value', value: 'next_funded' }),
          graphNode('entry-release', 'entrypoint', 'release_if_ready', 'Release when fully funded', 80, 1190, { name: 'release_if_ready', params: '', returnType: '', permission: 'Admin' }),
          graphNode('release-open', 'effect', 'Assert open', 'Use shared guard', 390, 1190, { effect: 'call_function', args: 'assert_open()' }),
          graphNode('release-ready', 'guard', 'Fully funded', 'Require target funded', 700, 1190, { condition: 'funded_amount_value == target_amount_value', message: 'escrow is not fully funded' }),
          graphNode('release-transfer', 'effect', 'Release funds', 'Move escrow to recipient', 1010, 1190, { effect: 'transfer_asset', args: 'escrow_account_id, recipient_account, escrow_asset_definition, funded_amount_value' }),
          graphNode('release-close', 'assign_state', 'Close escrow', 'Mark no longer open', 1320, 1190, { target: 'is_open', value: 'false' }),
          graphNode('release-flag', 'assign_state', 'Mark released', 'Set release flag', 1630, 1190, { target: 'is_released', value: 'true' }),
        ],
        edges: [
          graphEdge('helper-open', 'guard-open'),
          graphEdge('guard-open', 'guard-not-released'),
          graphEdge('guard-not-released', 'guard-not-refunded'),
          graphEdge('helper-payer', 'guard-payer'),
          graphEdge('entry-open', 'guard-target'),
          graphEdge('guard-target', 'set-payer'),
          graphEdge('set-payer', 'set-recipient'),
          graphEdge('set-recipient', 'set-escrow-account'),
          graphEdge('set-escrow-account', 'set-asset'),
          graphEdge('set-asset', 'set-target'),
          graphEdge('set-target', 'set-funded-zero'),
          graphEdge('set-funded-zero', 'set-open'),
          graphEdge('set-open', 'set-released-false'),
          graphEdge('set-released-false', 'set-refunded-false'),
          graphEdge('entry-deposit', 'call-open'),
          graphEdge('call-open', 'call-payer'),
          graphEdge('call-payer', 'guard-amount'),
          graphEdge('guard-amount', 'next-funded'),
          graphEdge('next-funded', 'guard-target-max'),
          graphEdge('guard-target-max', 'deposit-transfer'),
          graphEdge('deposit-transfer', 'set-funded-next'),
          graphEdge('entry-release', 'release-open'),
          graphEdge('release-open', 'release-ready'),
          graphEdge('release-ready', 'release-transfer'),
          graphEdge('release-transfer', 'release-close'),
          graphEdge('release-close', 'release-flag'),
        ],
      },
    };
  }

  if (templateId === 'irohaswap_reduced') {
    return {
      version: 2,
      updatedAt,
      metadata: {
        title: 'IrohaSwapLite',
        dataspace: 'dex',
        authority: 'operator@dex.main',
        chainId: 'wonderland',
        description: 'Reduced XYK pool graph for pool setup and swaps.',
      },
      graph: {
        nodes: [
          graphNode('map-asset-a', 'map_state', 'PoolAssetA', 'Pool asset A', 80, 40, { name: 'PoolAssetA', keyType: 'Name', valueType: 'AssetDefinitionId' }),
          graphNode('map-asset-b', 'map_state', 'PoolAssetB', 'Pool asset B', 330, 40, { name: 'PoolAssetB', keyType: 'Name', valueType: 'AssetDefinitionId' }),
          graphNode('map-account', 'map_state', 'PoolAccount', 'Pool account', 580, 40, { name: 'PoolAccount', keyType: 'Name', valueType: 'AccountId' }),
          graphNode('map-reserve-a', 'map_state', 'ReserveA', 'Reserve A', 830, 40, { name: 'ReserveA', keyType: 'Name', valueType: 'int' }),
          graphNode('map-reserve-b', 'map_state', 'ReserveB', 'Reserve B', 1080, 40, { name: 'ReserveB', keyType: 'Name', valueType: 'int' }),
          graphNode('entry-init-pool', 'entrypoint', 'init_pool', 'Create a new pool', 80, 260, { name: 'init_pool', params: 'pool: Name, asset_a: AssetDefinitionId, asset_b: AssetDefinitionId, pool_account: AccountId', returnType: '', permission: 'Admin' }),
          graphNode('guard-assets-different', 'guard', 'Assets differ', 'Pool cannot use same asset twice', 400, 260, { condition: 'asset_a != asset_b', message: 'identical assets' }),
          graphNode('write-asset-a', 'map_write', 'Store asset A', 'PoolAssetA[pool]', 720, 260, { target: 'PoolAssetA', key: 'pool', value: 'asset_a' }),
          graphNode('write-asset-b', 'map_write', 'Store asset B', 'PoolAssetB[pool]', 1040, 260, { target: 'PoolAssetB', key: 'pool', value: 'asset_b' }),
          graphNode('write-account', 'map_write', 'Store pool account', 'PoolAccount[pool]', 1360, 260, { target: 'PoolAccount', key: 'pool', value: 'pool_account' }),
          graphNode('write-ra', 'map_write', 'Zero reserve A', 'ReserveA[pool]', 1680, 260, { target: 'ReserveA', key: 'pool', value: '0' }),
          graphNode('write-rb', 'map_write', 'Zero reserve B', 'ReserveB[pool]', 2000, 260, { target: 'ReserveB', key: 'pool', value: '0' }),
          graphNode('entry-swap', 'entrypoint', 'swap', 'Swap one side of the pool', 80, 560, { name: 'swap', params: 'trader: AccountId, pool: Name, input_asset: AssetDefinitionId, amount_in: int, min_output: int', returnType: 'int', permission: 'Admin' }),
          graphNode('guard-amount-in', 'guard', 'Positive input', 'Reject empty swaps', 400, 560, { condition: 'amount_in > 0', message: 'invalid amount' }),
          graphNode('let-asset-a', 'formula', 'Load asset A', 'Read pool metadata', 720, 560, { name: 'asset_a', expression: 'PoolAssetA[pool]' }),
          graphNode('let-asset-b', 'formula', 'Load asset B', 'Read pool metadata', 1040, 560, { name: 'asset_b', expression: 'PoolAssetB[pool]' }),
          graphNode('let-pool-account', 'formula', 'Load pool account', 'Read pool account', 1360, 560, { name: 'pool_account', expression: 'PoolAccount[pool]' }),
          graphNode('let-reserve-a', 'formula', 'Reserve A', 'Read reserve A', 1680, 560, { name: 'reserve_a', expression: 'ReserveA[pool]' }),
          graphNode('let-reserve-b', 'formula', 'Reserve B', 'Read reserve B', 2000, 560, { name: 'reserve_b', expression: 'ReserveB[pool]' }),
          graphNode('let-is-a', 'formula', 'Input side', 'Check side', 2320, 560, { name: 'is_a_in', expression: 'input_asset == asset_a' }),
          graphNode('let-effective', 'formula', 'Fee-adjusted input', '0.3 percent fee', 2640, 560, { name: 'effective', expression: '(amount_in * 997) / 1000' }),
          graphNode('let-out', 'formula', 'Output quote', 'Reduced quote expression', 2960, 560, { name: 'out', expression: 'is_a_in ? ((reserve_b * effective) / (reserve_a + effective)) : ((reserve_a * effective) / (reserve_b + effective))' }),
          graphNode('guard-slippage', 'guard', 'Slippage guard', 'Require min output', 3280, 560, { condition: 'out >= min_output', message: 'slippage' }),
          graphNode('branch-side', 'branch', 'Which side?', 'Update reserves by input side', 3600, 560, { condition: 'is_a_in' }),
          graphNode('write-a-in', 'map_write', 'Add reserve A', 'A input path', 3920, 460, { target: 'ReserveA', key: 'pool', value: 'reserve_a + amount_in' }),
          graphNode('write-b-out', 'map_write', 'Remove reserve B', 'A input path', 4240, 460, { target: 'ReserveB', key: 'pool', value: 'reserve_b - out' }),
          graphNode('transfer-a-in', 'effect', 'Transfer A in', 'Trader pays A', 4560, 460, { effect: 'transfer_asset', args: 'trader, pool_account, asset_a, amount_in' }),
          graphNode('transfer-b-out', 'effect', 'Transfer B out', 'Pool pays B', 4880, 460, { effect: 'transfer_asset', args: 'pool_account, trader, asset_b, out' }),
          graphNode('write-b-in', 'map_write', 'Add reserve B', 'B input path', 3920, 720, { target: 'ReserveB', key: 'pool', value: 'reserve_b + amount_in' }),
          graphNode('write-a-out', 'map_write', 'Remove reserve A', 'B input path', 4240, 720, { target: 'ReserveA', key: 'pool', value: 'reserve_a - out' }),
          graphNode('transfer-b-in', 'effect', 'Transfer B in', 'Trader pays B', 4560, 720, { effect: 'transfer_asset', args: 'trader, pool_account, asset_b, amount_in' }),
          graphNode('transfer-a-out', 'effect', 'Transfer A out', 'Pool pays A', 4880, 720, { effect: 'transfer_asset', args: 'pool_account, trader, asset_a, out' }),
          graphNode('return-out', 'return', 'Return output', 'Expose swap result', 5200, 560, { value: 'out' }),
        ],
        edges: [
          graphEdge('entry-init-pool', 'guard-assets-different'),
          graphEdge('guard-assets-different', 'write-asset-a'),
          graphEdge('write-asset-a', 'write-asset-b'),
          graphEdge('write-asset-b', 'write-account'),
          graphEdge('write-account', 'write-ra'),
          graphEdge('write-ra', 'write-rb'),
          graphEdge('entry-swap', 'guard-amount-in'),
          graphEdge('guard-amount-in', 'let-asset-a'),
          graphEdge('let-asset-a', 'let-asset-b'),
          graphEdge('let-asset-b', 'let-pool-account'),
          graphEdge('let-pool-account', 'let-reserve-a'),
          graphEdge('let-reserve-a', 'let-reserve-b'),
          graphEdge('let-reserve-b', 'let-is-a'),
          graphEdge('let-is-a', 'let-effective'),
          graphEdge('let-effective', 'let-out'),
          graphEdge('let-out', 'guard-slippage'),
          graphEdge('guard-slippage', 'branch-side'),
          graphEdge('branch-side', 'write-a-in', 'then'),
          graphEdge('write-a-in', 'write-b-out'),
          graphEdge('write-b-out', 'transfer-a-in'),
          graphEdge('transfer-a-in', 'transfer-b-out'),
          graphEdge('branch-side', 'write-b-in', 'else'),
          graphEdge('write-b-in', 'write-a-out'),
          graphEdge('write-a-out', 'transfer-b-in'),
          graphEdge('transfer-b-in', 'transfer-a-out'),
          graphEdge('branch-side', 'return-out', 'next'),
        ],
      },
    };
  }

  return {
    version: 2,
    updatedAt,
    metadata: {
      title: 'StablecoinSimple',
      dataspace: 'stable',
      authority: 'operator@stable.main',
      chainId: 'wonderland',
      description: 'Mint stable assets when collateral ratio checks pass.',
    },
    graph: {
      nodes: [
        graphNode('entry-mintable', 'entrypoint', 'mintable_amount', 'Return collateral-limited mint amount', 80, 120, { name: 'mintable_amount', params: 'collateral_amount: int, price: int, target_ratio_bps: int', returnType: 'int', permission: '' }),
        graphNode('value', 'formula', 'Collateral value', 'collateral_amount * price', 420, 120, { name: 'value', expression: 'collateral_amount * price' }),
        graphNode('max-mint', 'formula', 'Max mint', 'Target-ratio limited amount', 760, 120, { name: 'max_mint', expression: '(value * 10000) / target_ratio_bps' }),
        graphNode('return-max', 'return', 'Return max mint', 'Expose computed amount', 1100, 120, { value: 'max_mint' }),
        graphNode('entry-mint-stable', 'entrypoint', 'mint_stable', 'Lock collateral and mint stable asset', 80, 390, { name: 'mint_stable', params: 'user: AccountId, vault_account: AccountId, collateral_asset: AssetDefinitionId, stable_asset: AssetDefinitionId, collateral_amount: int, price: int, min_ratio_bps: int, mint_amount: int', returnType: '', permission: 'Admin' }),
        graphNode('move-collateral', 'effect', 'Move collateral', 'Transfer collateral into vault', 420, 390, { effect: 'transfer_asset', args: 'user, vault_account, collateral_asset, collateral_amount' }),
        graphNode('stable-value', 'formula', 'Collateral value', 'Compute collateral value', 760, 390, { name: 'value', expression: 'collateral_amount * price' }),
        graphNode('post-ratio', 'formula', 'Post ratio', 'Basis-point collateral ratio', 1100, 390, { name: 'post_ratio', expression: '(value * 10000) / mint_amount' }),
        graphNode('ratio-ok', 'guard', 'Ratio check', 'Require minimum collateral ratio', 1440, 390, { condition: 'post_ratio >= min_ratio_bps', message: 'insufficient collateral' }),
        graphNode('mint-stable', 'effect', 'Mint stable', 'Mint stablecoin to user', 1780, 390, { effect: 'mint_asset', args: 'user, stable_asset, mint_amount' }),
      ],
      edges: [
        graphEdge('entry-mintable', 'value'),
        graphEdge('value', 'max-mint'),
        graphEdge('max-mint', 'return-max'),
        graphEdge('entry-mint-stable', 'move-collateral'),
        graphEdge('move-collateral', 'stable-value'),
        graphEdge('stable-value', 'post-ratio'),
        graphEdge('post-ratio', 'ratio-ok'),
        graphEdge('ratio-ok', 'mint-stable'),
      ],
    },
  };
}

export function normalizeKotodamaStudioGraphDocument(value: unknown): KotodamaStudioGraphDocumentV2 {
  const record = readRecord(value);
  if (record?.version === 2) {
    const graph = readRecord(record.graph);
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes.map(normalizeGraphNode) : [];
    const edges = Array.isArray(graph?.edges)
      ? graph.edges
        .map(normalizeGraphEdge)
        .filter((edge) => edge.source.length > 0 && edge.target.length > 0)
      : [];
    const nodeIds = new Set(nodes.map((node) => node.id));

    return refreshKotodamaStudioGraphPorts({
      version: 2,
      updatedAt: readString(record.updatedAt, new Date(0).toISOString()),
      metadata: readMetadata(record.metadata),
      legacy: readLegacyImportRecord(record.legacy),
      graph: {
        nodes,
        edges: edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
      },
    });
  }

  return normalizeKotodamaStudioGraphDocumentFromV1(value);
}

export function normalizeKotodamaStudioGraphDocumentFromV1(value: unknown): KotodamaStudioGraphDocumentV2 {
  const record = readRecord(value);
  const metadata = readMetadata(record?.metadata);
  const workflow = readRecord(record?.workflow);
  const rawNodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const legacyNodes = rawNodes.map((node, index) => {
    const nodeRecord = readRecord(node);
    const data = readRecord(nodeRecord?.data);
    return {
      id: readString(nodeRecord?.id, `legacy-${index + 1}`),
      title: readString(data?.title, `Legacy step ${index + 1}`),
      caption: readString(data?.caption),
      category: readString(data?.category, 'logic'),
      binding: readString(data?.binding),
      position: readPosition(nodeRecord?.position, { x: 120 + index * 280, y: 260 }),
    };
  });
  const firstBinding = legacyNodes.find((node) => node.binding.length > 0)?.binding;
  const entrypointName = normalizeIdentifier(firstBinding || legacyNodes.find((node) => node.category === 'contract')?.title || 'legacy_main', 'legacy_main');
  const convertedNodes: KotodamaStudioGraphNode[] = [
    graphNode('entry-legacy', 'entrypoint', entrypointName, 'Converted from a Studio v1 document', 80, 120, {
      name: entrypointName,
      params: '',
      returnType: '',
      permission: '',
    }),
  ];
  const convertedEdges: KotodamaStudioGraphEdge[] = [];
  let previousBodyNodeId = 'entry-legacy';

  for (const [index, legacyNode] of legacyNodes.entries()) {
    if (legacyNode.category === 'trigger') {
      convertedNodes.push(graphNode(`trigger-${index + 1}`, 'trigger', legacyNode.title, legacyNode.caption || 'Converted v1 trigger', legacyNode.position.x, legacyNode.position.y, {
        id: normalizeIdentifier(legacyNode.title, `trigger_${index + 1}`),
        entrypoint: entrypointName,
        mode: 'pre_commit',
        startMs: '0',
        periodMs: '60000',
      }));
      continue;
    }

    const bodyNodeId = `legacy-note-${index + 1}`;
    convertedNodes.push(graphNode(bodyNodeId, 'effect', legacyNode.title, legacyNode.caption || 'Converted v1 workflow step', legacyNode.position.x, legacyNode.position.y, {
      effect: 'info',
      args: quoteString(`${legacyNode.category}: ${legacyNode.title}`),
      statement: '',
    }));
    convertedEdges.push(graphEdge(previousBodyNodeId, bodyNodeId));
    previousBodyNodeId = bodyNodeId;
  }

  return refreshKotodamaStudioGraphPorts({
    version: 2,
    updatedAt: readString(record?.updatedAt, new Date(0).toISOString()),
    metadata,
    legacy: {
      sourceVersion: typeof record?.version === 'number' || typeof record?.version === 'string' ? record.version : 1,
      importedAt: readString(record?.updatedAt, new Date(0).toISOString()),
      workspaceState: cloneRecord(readRecord(record?.workspaceState)),
      workflow: cloneRecord(workflow),
      notes: [
        'Converted from Studio v1. Original Blockly workspace and storyboard workflow are preserved here for legacy reference.',
        'Generated graph nodes preserve metadata and workflow intent where possible; exact Blockly block semantics may need manual review.',
      ],
    },
    graph: {
      nodes: convertedNodes,
      edges: convertedEdges,
    },
  });
}

export function parseKotodamaStudioGraphDocument(raw: string): KotodamaStudioGraphDocumentV2 {
  return normalizeKotodamaStudioGraphDocument(JSON.parse(raw));
}

export function stringifyKotodamaStudioGraphDocument(document: KotodamaStudioGraphDocumentV2): string {
  return JSON.stringify(document, null, 2);
}

function sortedNodes(nodes: KotodamaStudioGraphNode[]): KotodamaStudioGraphNode[] {
  return [...nodes].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id));
}

function config(node: KotodamaStudioGraphNode, key: string, fallback = ''): string {
  return readString(node.data.config[key], fallback);
}

function splitParams(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(', ');
}

class SourceWriter {
  private readonly lines: string[] = [];
  private readonly rangeByNodeId = new Map<string, KotodamaStudioGraphSourceRange>();

  get currentLine(): number {
    return this.lines.length + 1;
  }

  write(line = '', nodeId: string | null = null): void {
    const lineNumber = this.currentLine;
    this.lines.push(line);
    if (!nodeId) return;
    const current = this.rangeByNodeId.get(nodeId);
    if (current) {
      current.endLine = lineNumber;
      return;
    }
    this.rangeByNodeId.set(nodeId, {
      nodeId,
      startLine: lineNumber,
      endLine: lineNumber,
    });
  }

  toOutput(): { source: string, ranges: KotodamaStudioGraphSourceRange[] } {
    return {
      source: this.lines.join('\n'),
      ranges: [...this.rangeByNodeId.values()],
    };
  }
}

function buildEdgesBySource(edges: KotodamaStudioGraphEdge[]): Map<string, KotodamaStudioGraphEdge[]> {
  const bySource = new Map<string, KotodamaStudioGraphEdge[]>();
  for (const edge of edges) {
    bySource.set(edge.source, [...(bySource.get(edge.source) ?? []), edge]);
  }
  for (const [source, sourceEdges] of bySource) {
    bySource.set(source, [...sourceEdges].sort((left, right) => left.label.localeCompare(right.label) || left.target.localeCompare(right.target)));
  }
  return bySource;
}

function preferredNextEdge(edges: KotodamaStudioGraphEdge[]): KotodamaStudioGraphEdge | null {
  return edges.find((edge) => ['next', 'body', ''].includes(edge.label.trim().toLowerCase())) ?? edges[0] ?? null;
}

function branchEdge(edges: KotodamaStudioGraphEdge[], labels: string[]): KotodamaStudioGraphEdge | null {
  const labelSet = new Set(labels);
  return edges.find((edge) => labelSet.has(edge.label.trim().toLowerCase())) ?? null;
}

function renderEffect(node: KotodamaStudioGraphNode): string {
  const effect = config(node, 'effect', 'info');
  const args = effectArgs(node).join(', ');
  const statement = config(node, 'statement');

  if (effect === 'custom') return normalizeStatement(statement);
  if (effect === 'call_function') {
    const callName = config(node, 'callName');
    if (callName) return normalizeStatement(`${normalizeIdentifier(callName, 'helper')}(${config(node, 'callArgs')})`);
    return normalizeStatement(args);
  }
  if (effect === 'info') return `info(${args || quoteString(node.data.title)});`;
  if (effect === 'execute_query') return `let query_result = execute_query(norito_bytes(${config(node, 'queryPayload') || args || quoteString('FindAccounts')}));`;
  if (effect === 'execute_instruction') return `execute_instruction(norito_bytes(${config(node, 'instructionPayload') || args || quoteString('')}));`;
  if (effect === 'set_account_detail') return `set_account_detail(${args});`;
  return `${effect}(${args});`;
}

function renderBodyNode(
  node: KotodamaStudioGraphNode,
  indent: string,
  writer: SourceWriter,
  nodesById: Map<string, KotodamaStudioGraphNode>,
  edgesBySource: Map<string, KotodamaStudioGraphEdge[]>,
  visited: Set<string>
): void {
  if (visited.has(node.id)) {
    writer.write(`${indent}// skipped recursive graph edge to ${node.id}`, node.id);
    return;
  }
  visited.add(node.id);

  const outgoing = edgesBySource.get(node.id) ?? [];
  if (node.data.kind === 'branch') {
    const thenEdge = branchEdge(outgoing, ['then', 'true', 'yes']);
    const elseEdge = branchEdge(outgoing, ['else', 'false', 'no']);
    const nextEdge = branchEdge(outgoing, ['next', '']);
    writer.write(`${indent}if (${config(node, 'condition', 'true')}) {`, node.id);
    if (thenEdge && nodesById.has(thenEdge.target)) {
      renderBodyChain(thenEdge.target, `${indent}  `, writer, nodesById, edgesBySource, new Set(visited));
    }
    writer.write(`${indent}} else {`, node.id);
    if (elseEdge && nodesById.has(elseEdge.target)) {
      renderBodyChain(elseEdge.target, `${indent}  `, writer, nodesById, edgesBySource, new Set(visited));
    }
    writer.write(`${indent}}`, node.id);
    if (nextEdge && nodesById.has(nextEdge.target)) {
      renderBodyChain(nextEdge.target, indent, writer, nodesById, edgesBySource, visited);
    }
    return;
  }

  if (node.data.kind === 'loop') {
    const bodyEdge = branchEdge(outgoing, ['body', 'then', 'next', '']);
    writer.write(`${indent}while (${config(node, 'condition', 'true')}) {`, node.id);
    if (bodyEdge && nodesById.has(bodyEdge.target)) {
      renderBodyChain(bodyEdge.target, `${indent}  `, writer, nodesById, edgesBySource, new Set(visited));
    }
    writer.write(`${indent}}`, node.id);
    return;
  }

  switch (node.data.kind) {
    case 'guard':
      writer.write(`${indent}assert(${config(node, 'condition', 'true')}, ${quoteString(config(node, 'message', 'assertion failed'))});`, node.id);
      break;
    case 'formula':
      writer.write(`${indent}let ${normalizeIdentifier(config(node, 'name'), 'value')} = ${formulaExpression(node)};`, node.id);
      break;
    case 'assign_state':
      writer.write(`${indent}${normalizeIdentifier(config(node, 'target'), 'state_value')} = ${config(node, 'value', '0')};`, node.id);
      break;
    case 'map_write':
      writer.write(`${indent}${normalizeIdentifier(config(node, 'target'), 'MapState')}[${config(node, 'key', 'name!("key")')}] = ${config(node, 'value', '0')};`, node.id);
      break;
    case 'effect':
      writer.write(`${indent}${renderEffect(node)}`, node.id);
      break;
    case 'return': {
      const value = config(node, 'value');
      writer.write(value ? `${indent}return ${value};` : `${indent}return;`, node.id);
      break;
    }
    case 'note':
      writer.write(`${indent}// ${config(node, 'body', node.data.detail)}`, node.id);
      break;
    default:
      break;
  }

  const nextEdge = preferredNextEdge(outgoing);
  if (nextEdge && nodesById.has(nextEdge.target)) {
    renderBodyChain(nextEdge.target, indent, writer, nodesById, edgesBySource, visited);
  }
}

function renderBodyChain(
  startNodeId: string,
  indent: string,
  writer: SourceWriter,
  nodesById: Map<string, KotodamaStudioGraphNode>,
  edgesBySource: Map<string, KotodamaStudioGraphEdge[]>,
  visited: Set<string>
): void {
  const node = nodesById.get(startNodeId);
  if (!node || !BODY_NODE_KINDS.has(node.data.kind)) return;
  renderBodyNode(node, indent, writer, nodesById, edgesBySource, visited);
}

function renderFunction(
  node: KotodamaStudioGraphNode,
  writer: SourceWriter,
  nodesById: Map<string, KotodamaStudioGraphNode>,
  edgesBySource: Map<string, KotodamaStudioGraphEdge[]>
): void {
  const name = normalizeIdentifier(config(node, 'name'), node.data.kind === 'entrypoint' ? 'run' : 'helper');
  const params = renderParams(node);
  const returnType = config(node, 'returnType');
  const returnSuffix = returnType ? ` -> ${returnType}` : '';
  const permission = config(node, 'permission');
  const permissionSuffix = node.data.kind === 'entrypoint' && permission ? ` permission(${permission})` : '';

  const prefix = node.data.kind === 'entrypoint' ? 'kotoage fn' : 'fn';
  writer.write(`  ${prefix} ${name}(${params})${returnSuffix}${permissionSuffix} {`, node.id);

  const startEdge = preferredNextEdge(edgesBySource.get(node.id) ?? []);
  if (startEdge && nodesById.has(startEdge.target)) {
    renderBodyChain(startEdge.target, '    ', writer, nodesById, edgesBySource, new Set([node.id]));
  } else if (returnType) {
    writer.write('    return 0;', node.id);
  } else {
    writer.write('    info("No graph steps connected yet.");', node.id);
  }

  writer.write('  }', node.id);
}

function renderTrigger(node: KotodamaStudioGraphNode, writer: SourceWriter): void {
  const id = normalizeIdentifier(config(node, 'id'), 'trigger_1');
  const entrypoint = normalizeIdentifier(config(node, 'entrypoint'), 'run');
  const mode = config(node, 'mode', 'pre_commit');
  const onClause = mode === 'schedule'
    ? `    on time schedule(${config(node, 'startMs', '0')}, ${config(node, 'periodMs', '60000')});`
    : mode === 'manual'
      ? `    execute trigger ${id};`
      : '    on time pre_commit;';

  writer.write(`  register_trigger ${id} {`, node.id);
  writer.write(`    call ${entrypoint};`, node.id);
  writer.write(onClause, node.id);
  writer.write('  }', node.id);
}

export function buildKotodamaStudioGraphSource(document: KotodamaStudioGraphDocumentV2): KotodamaStudioGraphSourceOutput {
  const writer = new SourceWriter();
  const nodes = sortedNodes(document.graph.nodes);
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const edgesBySource = buildEdgesBySource(document.graph.edges);
  const stateNodes = nodes.filter((node) => node.data.kind === 'state' || node.data.kind === 'map_state');
  const helperNodes = nodes.filter((node) => node.data.kind === 'helper');
  const entrypointNodes = nodes.filter((node) => node.data.kind === 'entrypoint');
  const triggerNodes = nodes.filter((node) => node.data.kind === 'trigger');

  writer.write(`// dataspace: ${document.metadata.dataspace || 'universal'}`);
  writer.write(`// chain_id: ${document.metadata.chainId}`);
  writer.write(`// authority: ${document.metadata.authority}`);
  writer.write(`// description: ${document.metadata.description || 'Made in Kotodama Studio.'}`);
  writer.write('');
  writer.write(`seiyaku ${normalizeIdentifier(document.metadata.title, 'GraphFirstContract')} {`);

  for (const node of stateNodes) {
    if (node.data.kind === 'map_state') {
      writer.write(`  state ${normalizeIdentifier(config(node, 'name'), 'MapState')}: Map<${config(node, 'keyType', 'Name')}, ${config(node, 'valueType', 'int')}>;`, node.id);
    } else {
      writer.write(`  state ${config(node, 'valueType', 'int')} ${normalizeIdentifier(config(node, 'name'), 'state_value')};`, node.id);
    }
  }
  if (stateNodes.length > 0) writer.write('');

  for (const node of helperNodes) {
    renderFunction(node, writer, nodesById, edgesBySource);
    writer.write('');
  }

  if (entrypointNodes.length === 0) {
    writer.write('  kotoage fn run() {');
    writer.write('    info("Connect graph steps to build a contract.");');
    writer.write('  }');
  } else {
    for (const node of entrypointNodes) {
      renderFunction(node, writer, nodesById, edgesBySource);
      writer.write('');
    }
  }

  for (const node of triggerNodes) {
    renderTrigger(node, writer);
    writer.write('');
  }

  writer.write('}');
  const output = writer.toOutput();

  return {
    source: output.source,
    ranges: output.ranges,
    summary: {
      states: stateNodes.map((node) => normalizeIdentifier(config(node, 'name'), node.id)),
      entrypoints: entrypointNodes.map((node) => ({
        name: normalizeIdentifier(config(node, 'name'), 'run'),
        kind: 'kotoage',
        permission: config(node, 'permission') || null,
      })),
      triggers: triggerNodes.map((node) => ({
        id: normalizeIdentifier(config(node, 'id'), node.id),
        entrypoint: normalizeIdentifier(config(node, 'entrypoint'), 'run'),
        mode: (config(node, 'mode', 'pre_commit') as 'manual' | 'pre_commit' | 'schedule'),
      })),
    },
  };
}

function duplicateValues(values: Array<{ value: string, nodeId: string }>): Array<{ value: string, nodeIds: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const item of values) {
    if (!item.value) continue;
    grouped.set(item.value, [...(grouped.get(item.value) ?? []), item.nodeId]);
  }
  return [...grouped.entries()]
    .filter(([, nodeIds]) => nodeIds.length > 1)
    .map(([value, nodeIds]) => ({ value, nodeIds }));
}

function buildStateTypeMap(document: KotodamaStudioGraphDocumentV2): Map<string, KotodamaStudioGraphValueType> {
  const map = new Map<string, KotodamaStudioGraphValueType>();
  for (const node of document.graph.nodes) {
    if (node.data.kind !== 'state') continue;
    map.set(normalizeIdentifier(config(node, 'name'), ''), normalizeValueType(config(node, 'valueType', 'int')));
  }
  return map;
}

function buildMapStateTypeMap(document: KotodamaStudioGraphDocumentV2): Map<string, { keyType: KotodamaStudioGraphValueType, valueType: KotodamaStudioGraphValueType }> {
  const map = new Map<string, { keyType: KotodamaStudioGraphValueType, valueType: KotodamaStudioGraphValueType }>();
  for (const node of document.graph.nodes) {
    if (node.data.kind !== 'map_state') continue;
    map.set(normalizeIdentifier(config(node, 'name'), ''), {
      keyType: normalizeValueType(config(node, 'keyType', 'Name')),
      valueType: normalizeValueType(config(node, 'valueType', 'int')),
    });
  }
  return map;
}

function buildFunctionReturnMap(document: KotodamaStudioGraphDocumentV2): Map<string, KotodamaStudioGraphValueType> {
  const map = new Map<string, KotodamaStudioGraphValueType>();
  for (const node of document.graph.nodes) {
    if (node.data.kind !== 'entrypoint' && node.data.kind !== 'helper') continue;
    map.set(normalizeIdentifier(config(node, 'name'), ''), normalizeValueType(config(node, 'returnType'), 'void'));
  }
  return map;
}

function buildBodyOwnerMap(document: KotodamaStudioGraphDocumentV2): Map<string, string> {
  const nodesById = new Map(document.graph.nodes.map((node) => [node.id, node] as const));
  const edgesBySource = buildEdgesBySource(document.graph.edges);
  const owners = new Map<string, string>();

  const visit = (ownerId: string, nodeId: string, seen: Set<string>) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node || !BODY_NODE_KINDS.has(node.data.kind)) return;
    if (!owners.has(nodeId)) owners.set(nodeId, ownerId);
    for (const edge of edgesBySource.get(nodeId) ?? []) {
      visit(ownerId, edge.target, seen);
    }
  };

  for (const root of document.graph.nodes) {
    if (root.data.kind !== 'entrypoint' && root.data.kind !== 'helper') continue;
    for (const edge of edgesBySource.get(root.id) ?? []) {
      visit(root.id, edge.target, new Set([root.id]));
    }
  }

  return owners;
}

function expectedReturnTypeForNode(document: KotodamaStudioGraphDocumentV2, nodeId: string): KotodamaStudioGraphValueType {
  const ownerId = buildBodyOwnerMap(document).get(nodeId);
  const owner = ownerId ? document.graph.nodes.find((node) => node.id === ownerId) : null;
  return owner ? normalizeValueType(config(owner, 'returnType'), 'void') : 'unknown';
}

function buildTypeEnvironment(document: KotodamaStudioGraphDocumentV2, nodeId: string): {
  values: Map<string, KotodamaStudioGraphValueType>
  mapStates: Map<string, { keyType: KotodamaStudioGraphValueType, valueType: KotodamaStudioGraphValueType }>
  functionReturns: Map<string, KotodamaStudioGraphValueType>
} {
  const values = buildStateTypeMap(document);
  const mapStates = buildMapStateTypeMap(document);
  const functionReturns = buildFunctionReturnMap(document);
  const ownerId = buildBodyOwnerMap(document).get(nodeId);
  const owner = ownerId ? document.graph.nodes.find((node) => node.id === ownerId) : null;

  if (owner) {
    for (const param of parseStructuredParams(owner)) {
      values.set(param.name, param.valueType);
    }
  }

  for (const node of document.graph.nodes) {
    if (node.data.kind !== 'formula') continue;
    const name = normalizeIdentifier(config(node, 'name'), '');
    if (!name) continue;
    const configured = normalizeValueType(config(node, 'valueType'), 'unknown');
    if (configured !== 'unknown') {
      values.set(name, configured);
    }
  }

  return { values, mapStates, functionReturns };
}

function areTypesCompatible(expected: KotodamaStudioGraphValueType, actual: KotodamaStudioGraphValueType): boolean {
  if (expected === 'unknown' || actual === 'unknown') return true;
  if (expected === actual) return true;
  if (expected === 'Json' && (actual === 'Name' || actual === 'int' || actual === 'bool')) return true;
  return false;
}

function labelAllowsSource(label: string, sourceKind: KotodamaStudioGraphNodeKind): boolean {
  const normalized = label.trim().toLowerCase() || 'next';
  if (sourceKind === 'branch') return ['then', 'else', 'next', 'true', 'false', 'yes', 'no'].includes(normalized);
  if (sourceKind === 'loop') return ['body', 'next'].includes(normalized);
  return ['next', 'body'].includes(normalized);
}

function bodyKind(kind: KotodamaStudioGraphNodeKind | undefined): boolean {
  return kind ? BODY_NODE_KINDS.has(kind) : false;
}

export function isValidKotodamaStudioGraphConnection(
  document: KotodamaStudioGraphDocumentV2,
  connection: Pick<KotodamaStudioGraphEdge, 'source' | 'target'> & Partial<Pick<KotodamaStudioGraphEdge, 'id' | 'label'>>
): boolean {
  const source = document.graph.nodes.find((node) => node.id === connection.source);
  const target = document.graph.nodes.find((node) => node.id === connection.target);
  if (!source || !target || source.id === target.id) return false;
  if (!bodyKind(target.data.kind)) return false;
  if (!['entrypoint', 'helper', 'guard', 'branch', 'loop', 'formula', 'assign_state', 'map_write', 'effect', 'note'].includes(source.data.kind)) return false;
  if (source.data.kind === 'return') return false;
  const label = connection.label ?? (source.data.kind === 'branch' ? 'then' : source.data.kind === 'loop' ? 'body' : 'next');
  if (!labelAllowsSource(label, source.data.kind)) return false;
  if (document.graph.edges.some((edge) =>
    edge.source === source.id &&
    edge.target === target.id &&
    (!connection.id || edge.id !== connection.id)
  )) return false;
  const outgoing = document.graph.edges.filter((edge) => edge.source === source.id && (!connection.id || edge.id !== connection.id));
  if (source.data.kind === 'branch') {
    if (outgoing.length >= 3) return false;
    return !outgoing.some((edge) => (edge.label.trim().toLowerCase() || 'next') === (label.trim().toLowerCase() || 'next'));
  }
  if (source.data.kind === 'loop') {
    if (outgoing.length >= 2) return false;
    return !outgoing.some((edge) => (edge.label.trim().toLowerCase() || 'next') === (label.trim().toLowerCase() || 'next'));
  }
  return outgoing.length < 1;
}

export function validateKotodamaStudioGraphDocument(document: KotodamaStudioGraphDocumentV2): KotodamaStudioGraphDiagnostic[] {
  const diagnostics: KotodamaStudioGraphDiagnostic[] = [];
  const nodes = document.graph.nodes;
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const scalarStates = buildStateTypeMap(document);
  const mapStates = buildMapStateTypeMap(document);
  const functionNames = nodes
    .filter((node) => node.data.kind === 'helper' || node.data.kind === 'entrypoint')
    .map((node) => ({ value: normalizeIdentifier(config(node, 'name'), ''), nodeId: node.id }));
  const stateNames = nodes
    .filter((node) => node.data.kind === 'state' || node.data.kind === 'map_state')
    .map((node) => ({ value: normalizeIdentifier(config(node, 'name'), ''), nodeId: node.id }));
  const entrypointNames = new Set(
    nodes
      .filter((node) => node.data.kind === 'entrypoint')
      .map((node) => normalizeIdentifier(config(node, 'name'), ''))
      .filter((name) => name.length > 0)
  );

  if (!normalizeIdentifier(document.metadata.title, '')) {
    diagnostics.push({ code: 'contract_missing_title', severity: 'error', message: 'Contract title must be a valid identifier.', nodeId: null });
  }

  for (const duplicate of duplicateValues(functionNames)) {
    for (const nodeId of duplicate.nodeIds) {
      diagnostics.push({ code: 'duplicate_function', severity: 'error', message: `Function or entrypoint "${duplicate.value}" is defined more than once.`, nodeId });
    }
  }

  for (const duplicate of duplicateValues(stateNames)) {
    for (const nodeId of duplicate.nodeIds) {
      diagnostics.push({ code: 'duplicate_state', severity: 'error', message: `State "${duplicate.value}" is defined more than once.`, nodeId });
    }
  }

  for (const edge of document.graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      diagnostics.push({ code: 'invalid_edge', severity: 'error', message: `Link "${edge.id}" points to a missing graph node.`, nodeId: null });
      continue;
    }
    if (!isValidKotodamaStudioGraphConnection(document, edge)) {
      const source = nodesById.get(edge.source);
      diagnostics.push({
        code: 'invalid_connection',
        severity: 'error',
        message: source?.data.kind === 'branch' || source?.data.kind === 'loop'
          ? `Link "${edge.id}" has an invalid or duplicate "${edge.label}" flow port.`
          : `Link "${edge.id}" violates the typed flow-port rules.`,
        nodeId: edge.source,
      });
    }
  }

  for (const node of nodes) {
    if (node.data.kind === 'entrypoint' || node.data.kind === 'helper') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'function_missing_name', severity: 'error', message: 'Function nodes need a valid name.', nodeId: node.id });
      }
    }

    if (node.data.kind === 'state' || node.data.kind === 'map_state') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'state_missing_name', severity: 'error', message: 'State nodes need a valid name.', nodeId: node.id });
      }
    }

    if (node.data.kind === 'trigger') {
      const target = normalizeIdentifier(config(node, 'entrypoint'), '');
      if (!target || !entrypointNames.has(target)) {
        diagnostics.push({ code: 'trigger_invalid_entrypoint', severity: 'error', message: 'Trigger must target an existing public entrypoint.', nodeId: node.id });
      }
      if (config(node, 'mode') === 'schedule') {
        const period = Number.parseInt(config(node, 'periodMs'), 10);
        if (!Number.isFinite(period) || period <= 0) {
          diagnostics.push({ code: 'trigger_invalid_period', severity: 'error', message: 'Scheduled triggers need a positive period in milliseconds.', nodeId: node.id });
        }
      }
    }

    if ((node.data.kind === 'guard' || node.data.kind === 'branch' || node.data.kind === 'loop') && !config(node, 'condition')) {
      diagnostics.push({ code: 'condition_missing', severity: 'error', message: 'Logic nodes need a condition.', nodeId: node.id, field: 'condition' });
    } else if (node.data.kind === 'guard' || node.data.kind === 'branch' || node.data.kind === 'loop') {
      const conditionType = expressionTypeForNode(document, node, config(node, 'condition'));
      if (!areTypesCompatible('bool', conditionType)) {
        diagnostics.push({ code: 'condition_type_mismatch', severity: 'error', message: `Condition must be bool, but the graph infers ${conditionType}.`, nodeId: node.id, field: 'condition' });
      }
    }

    if (node.data.kind === 'formula') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'formula_missing_name', severity: 'error', message: 'Formula nodes need a local variable name.', nodeId: node.id, field: 'name' });
      }
      if (!formulaExpression(node)) {
        diagnostics.push({ code: 'formula_missing_expression', severity: 'error', message: 'Formula nodes need an expression.', nodeId: node.id, field: 'expression' });
      }
      const configuredType = normalizeValueType(config(node, 'valueType'), 'unknown');
      if (configuredType !== 'unknown') {
        const inferredType = expressionTypeForNode(document, node, formulaExpression(node));
        if (!areTypesCompatible(configuredType, inferredType)) {
          diagnostics.push({ code: 'formula_type_mismatch', severity: 'error', message: `Formula is declared as ${configuredType}, but the expression looks like ${inferredType}.`, nodeId: node.id, field: 'valueType' });
        }
      }
    }

    if (node.data.kind === 'assign_state') {
      const target = normalizeIdentifier(config(node, 'target'), '');
      const expected = scalarStates.get(target);
      if (!target || !expected) {
        diagnostics.push({ code: 'state_target_missing', severity: 'error', message: 'Set-state nodes must target an existing scalar state.', nodeId: node.id, field: 'target' });
      } else {
        const actual = expressionTypeForNode(document, node, config(node, 'value'));
        if (!areTypesCompatible(expected, actual)) {
          diagnostics.push({ code: 'state_value_type_mismatch', severity: 'error', message: `State "${target}" expects ${expected}, but this value looks like ${actual}.`, nodeId: node.id, field: 'value' });
        }
      }
    }

    if (node.data.kind === 'map_write') {
      const target = normalizeIdentifier(config(node, 'target'), '');
      const expected = mapStates.get(target);
      if (!target || !expected) {
        diagnostics.push({ code: 'map_target_missing', severity: 'error', message: 'Map-write nodes must target an existing map state.', nodeId: node.id, field: 'target' });
      } else {
        const keyType = expressionTypeForNode(document, node, config(node, 'key'));
        const valueType = expressionTypeForNode(document, node, config(node, 'value'));
        if (!areTypesCompatible(expected.keyType, keyType)) {
          diagnostics.push({ code: 'map_key_type_mismatch', severity: 'error', message: `Map "${target}" keys expect ${expected.keyType}, but this key looks like ${keyType}.`, nodeId: node.id, field: 'key' });
        }
        if (!areTypesCompatible(expected.valueType, valueType)) {
          diagnostics.push({ code: 'map_value_type_mismatch', severity: 'error', message: `Map "${target}" values expect ${expected.valueType}, but this value looks like ${valueType}.`, nodeId: node.id, field: 'value' });
        }
      }
    }

    if (node.data.kind === 'effect') {
      const effect = config(node, 'effect', 'info');
      const args = effectArgs(node);
      if (effect !== 'custom' && effect !== 'info' && args.length === 0) {
        diagnostics.push({ code: 'effect_missing_args', severity: 'error', message: `${effect} needs arguments.`, nodeId: node.id, field: 'args' });
      }
      if (effect === 'custom' && !config(node, 'statement')) {
        diagnostics.push({ code: 'effect_missing_statement', severity: 'error', message: 'Custom effects need a statement.', nodeId: node.id, field: 'statement' });
      }

      const expectedArgs: Record<string, KotodamaStudioGraphValueType[]> = {
        transfer_asset: ['AccountId', 'AccountId', 'AssetDefinitionId', 'int'],
        mint_asset: ['AccountId', 'AssetDefinitionId', 'int'],
        burn_asset: ['AccountId', 'AssetDefinitionId', 'int'],
        set_account_detail: ['AccountId', 'Name', 'Json'],
        execute_query: ['NoritoBytes'],
        execute_instruction: ['NoritoBytes'],
      };
      const expected = expectedArgs[effect] ?? [];
      if (expected.length > 0 && args.length > 0 && args.length !== expected.length) {
        diagnostics.push({ code: 'effect_arg_count_mismatch', severity: 'error', message: `${effect} expects ${expected.length} typed arguments.`, nodeId: node.id, field: 'args' });
      }
      for (const [index, expectedType] of expected.entries()) {
        const actualType = args[index] ? expressionTypeForNode(document, node, args[index]!) : 'unknown';
        if (!areTypesCompatible(expectedType, actualType)) {
          diagnostics.push({ code: 'effect_arg_type_mismatch', severity: 'error', message: `${effect} argument ${index + 1} expects ${expectedType}, but this value looks like ${actualType}.`, nodeId: node.id, field: 'args' });
        }
      }
    }

    if (node.data.kind === 'return') {
      const expected = expectedReturnTypeForNode(document, node.id);
      const value = config(node, 'value');
      if (expected === 'void' && value) {
        diagnostics.push({ code: 'return_void_value', severity: 'error', message: 'This function does not declare a return type, so the return node must be empty.', nodeId: node.id, field: 'value' });
      } else if (expected !== 'void' && !value) {
        diagnostics.push({ code: 'return_missing_value', severity: 'error', message: `This function returns ${expected}; the return node needs a value.`, nodeId: node.id, field: 'value' });
      } else if (expected !== 'void') {
        const actual = expressionTypeForNode(document, node, value);
        if (!areTypesCompatible(expected, actual)) {
          diagnostics.push({ code: 'return_type_mismatch', severity: 'error', message: `Return expects ${expected}, but this value looks like ${actual}.`, nodeId: node.id, field: 'value' });
        }
      }
    }
  }

  return diagnostics;
}

export function findKotodamaStudioGraphNodeForLine(
  ranges: KotodamaStudioGraphSourceRange[],
  line: number | undefined
): string | null {
  if (!line) return null;
  const direct = [...ranges]
    .filter((range) => line >= range.startLine && line <= range.endLine)
    .sort((left, right) =>
      (left.endLine - left.startLine) - (right.endLine - right.startLine) ||
      right.startLine - left.startLine
    )[0];
  if (direct) return direct.nodeId;
  const previous = [...ranges]
    .filter((range) => range.startLine <= line)
    .sort((left, right) => right.startLine - left.startLine)[0];
  return previous?.nodeId ?? null;
}

export function updateKotodamaStudioGraphNode(
  document: KotodamaStudioGraphDocumentV2,
  nodeId: string,
  updater: (node: KotodamaStudioGraphNode) => KotodamaStudioGraphNode
): KotodamaStudioGraphDocumentV2 {
  return refreshKotodamaStudioGraphPorts({
    ...document,
    updatedAt: new Date().toISOString(),
    metadata: { ...document.metadata },
    legacy: document.legacy ? cloneLegacyImportRecord(document.legacy) : null,
    graph: {
      nodes: document.graph.nodes.map((node) => node.id === nodeId ? updater({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          config: { ...node.data.config },
          ports: node.data.ports.map((port) => ({ ...port })),
        },
      }) : node),
      edges: document.graph.edges.map((edge) => ({ ...edge })),
    },
  });
}

export function refreshKotodamaStudioGraphPorts(document: KotodamaStudioGraphDocumentV2): KotodamaStudioGraphDocumentV2 {
  const nextDocument: KotodamaStudioGraphDocumentV2 = {
    ...document,
    metadata: { ...document.metadata },
    legacy: document.legacy ? cloneLegacyImportRecord(document.legacy) : null,
    graph: {
      edges: document.graph.edges.map((edge) => ({ ...edge })),
      nodes: [],
    },
  };
  nextDocument.graph.nodes = document.graph.nodes.map((node) => withGraphNodePorts(node, nextDocument));
  return nextDocument;
}

export function cloneKotodamaStudioGraphDocument(document: KotodamaStudioGraphDocumentV2): KotodamaStudioGraphDocumentV2 {
  return refreshKotodamaStudioGraphPorts(cloneGraphDocument(document));
}
