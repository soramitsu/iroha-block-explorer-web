import type { KotodamaStudioWorkspaceSummary } from './kotodama-studio-source';

export const KOTODAMA_STUDIO_GRAPH_DOCUMENT_VERSION = 2;

export interface KotodamaStudioMetadata {
  title: string
  dataspace: string
  authority: string
  chainId: string
  description: string
}

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

export type KotodamaStudioTranslate = (
  key: string,
  params?: Readonly<Record<string, string | number>>
) => string;

const untranslatedStudioKey: KotodamaStudioTranslate = (key) => key;

export interface KotodamaStudioGraphConfigField {
  key: string
  labelKey: string
  kind: 'text' | 'textarea' | 'select'
  options?: Array<{ labelKey?: string, value: string }>
}

export interface KotodamaStudioGraphPaletteItem {
  kind: KotodamaStudioGraphNodeKind
  labelKey: string
  group: 'declarations' | 'logic' | 'values' | 'irohaEffects'
}

export const KOTODAMA_STUDIO_GRAPH_PALETTE: KotodamaStudioGraphPaletteItem[] = [
  { group: 'declarations', kind: 'state', labelKey: 'studio.graph.palette.state' },
  { group: 'declarations', kind: 'map_state', labelKey: 'studio.graph.palette.mapState' },
  { group: 'declarations', kind: 'helper', labelKey: 'studio.graph.palette.helper' },
  { group: 'declarations', kind: 'entrypoint', labelKey: 'studio.graph.palette.entrypoint' },
  { group: 'declarations', kind: 'trigger', labelKey: 'studio.graph.palette.trigger' },
  { group: 'logic', kind: 'guard', labelKey: 'studio.graph.palette.guard' },
  { group: 'logic', kind: 'branch', labelKey: 'studio.graph.palette.branch' },
  { group: 'logic', kind: 'loop', labelKey: 'studio.graph.palette.loop' },
  { group: 'logic', kind: 'formula', labelKey: 'studio.graph.palette.formula' },
  { group: 'logic', kind: 'assign_state', labelKey: 'studio.graph.palette.assignState' },
  { group: 'logic', kind: 'map_write', labelKey: 'studio.graph.palette.mapWrite' },
  { group: 'logic', kind: 'return', labelKey: 'studio.graph.palette.return' },
  { group: 'irohaEffects', kind: 'effect', labelKey: 'studio.graph.palette.effect' },
  { group: 'values', kind: 'note', labelKey: 'studio.graph.palette.note' },
];

export const KOTODAMA_STUDIO_GRAPH_CONFIG_FIELDS: Record<KotodamaStudioGraphNodeKind, KotodamaStudioGraphConfigField[]> = {
  state: [
    { key: 'name', labelKey: 'studio.graph.fields.stateName', kind: 'text' },
    {
      key: 'valueType',
      labelKey: 'studio.graph.fields.type',
      kind: 'select',
      options: [
        { value: 'int' },
        { value: 'bool' },
        { value: 'AccountId' },
        { value: 'AssetDefinitionId' },
        { value: 'DomainId' },
        { value: 'Name' },
        { value: 'Json' },
        { value: 'Blob' },
        { value: 'NoritoBytes' },
      ],
    },
  ],
  map_state: [
    { key: 'name', labelKey: 'studio.graph.fields.mapName', kind: 'text' },
    { key: 'keyType', labelKey: 'studio.graph.fields.keyType', kind: 'text' },
    { key: 'valueType', labelKey: 'studio.graph.fields.valueType', kind: 'text' },
  ],
  helper: [
    { key: 'name', labelKey: 'studio.graph.fields.functionName', kind: 'text' },
    { key: 'params', labelKey: 'studio.graph.fields.parameters', kind: 'textarea' },
    { key: 'returnType', labelKey: 'studio.graph.fields.returnType', kind: 'text' },
  ],
  entrypoint: [
    { key: 'name', labelKey: 'studio.graph.fields.entrypointName', kind: 'text' },
    { key: 'params', labelKey: 'studio.graph.fields.parameters', kind: 'textarea' },
    { key: 'returnType', labelKey: 'studio.graph.fields.returnType', kind: 'text' },
    { key: 'permission', labelKey: 'studio.graph.fields.permission', kind: 'text' },
  ],
  trigger: [
    { key: 'id', labelKey: 'studio.graph.fields.triggerId', kind: 'text' },
    { key: 'entrypoint', labelKey: 'studio.graph.fields.entrypoint', kind: 'text' },
    {
      key: 'mode',
      labelKey: 'studio.graph.fields.mode',
      kind: 'select',
      options: [
        { labelKey: 'studio.graph.options.preCommit', value: 'pre_commit' },
        { labelKey: 'studio.graph.options.manual', value: 'manual' },
        { labelKey: 'studio.graph.options.schedule', value: 'schedule' },
      ],
    },
    { key: 'startMs', labelKey: 'studio.graph.fields.scheduleStartMs', kind: 'text' },
    { key: 'periodMs', labelKey: 'studio.graph.fields.schedulePeriodMs', kind: 'text' },
  ],
  guard: [
    { key: 'condition', labelKey: 'studio.graph.fields.condition', kind: 'textarea' },
    { key: 'message', labelKey: 'studio.graph.fields.failureMessage', kind: 'text' },
  ],
  branch: [
    { key: 'condition', labelKey: 'studio.graph.fields.condition', kind: 'textarea' },
  ],
  loop: [
    { key: 'condition', labelKey: 'studio.graph.fields.loopWhile', kind: 'textarea' },
  ],
  formula: [
    { key: 'name', labelKey: 'studio.graph.fields.localName', kind: 'text' },
    {
      key: 'valueType',
      labelKey: 'studio.graph.fields.outputType',
      kind: 'select',
      options: [
        { labelKey: 'studio.graph.options.inferFromExpression', value: '' },
        { value: 'int' },
        { value: 'bool' },
        { value: 'AccountId' },
        { value: 'AssetDefinitionId' },
        { value: 'DomainId' },
        { value: 'Name' },
        { value: 'Json' },
        { value: 'Blob' },
        { value: 'NoritoBytes' },
      ],
    },
    { key: 'expression', labelKey: 'studio.graph.fields.expression', kind: 'textarea' },
    { key: 'left', labelKey: 'studio.graph.fields.formulaLeft', kind: 'text' },
    {
      key: 'operator',
      labelKey: 'studio.graph.fields.formulaOperator',
      kind: 'select',
      options: [
        { labelKey: 'studio.graph.options.customExpression', value: '' },
        { value: '+' },
        { value: '-' },
        { value: '*' },
        { value: '/' },
        { value: '==' },
        { value: '!=' },
        { value: '>' },
        { value: '>=' },
        { value: '<' },
        { value: '<=' },
        { value: '&&' },
        { value: '||' },
      ],
    },
    { key: 'right', labelKey: 'studio.graph.fields.formulaRight', kind: 'text' },
  ],
  assign_state: [
    { key: 'target', labelKey: 'studio.graph.fields.stateName', kind: 'text' },
    { key: 'value', labelKey: 'studio.graph.fields.value', kind: 'textarea' },
  ],
  map_write: [
    { key: 'target', labelKey: 'studio.graph.fields.mapName', kind: 'text' },
    { key: 'key', labelKey: 'studio.graph.fields.key', kind: 'textarea' },
    { key: 'value', labelKey: 'studio.graph.fields.value', kind: 'textarea' },
  ],
  effect: [
    {
      key: 'effect',
      labelKey: 'studio.graph.fields.effect',
      kind: 'select',
      options: [
        { value: 'info' },
        { value: 'transfer_asset' },
        { value: 'mint_asset' },
        { value: 'burn_asset' },
        { value: 'set_account_detail' },
        { value: 'execute_query' },
        { value: 'execute_instruction' },
        { labelKey: 'studio.graph.options.callFunction', value: 'call_function' },
        { labelKey: 'studio.graph.options.customStatement', value: 'custom' },
      ],
    },
    { key: 'args', labelKey: 'studio.graph.fields.arguments', kind: 'textarea' },
    { key: 'from', labelKey: 'studio.graph.fields.fromAccount', kind: 'text' },
    { key: 'to', labelKey: 'studio.graph.fields.toAccount', kind: 'text' },
    { key: 'account', labelKey: 'studio.graph.fields.account', kind: 'text' },
    { key: 'assetDefinition', labelKey: 'studio.graph.fields.assetDefinition', kind: 'text' },
    { key: 'amount', labelKey: 'studio.graph.fields.amount', kind: 'text' },
    { key: 'detailKey', labelKey: 'studio.graph.fields.detailKey', kind: 'text' },
    { key: 'detailValue', labelKey: 'studio.graph.fields.detailValue', kind: 'text' },
    { key: 'queryPayload', labelKey: 'studio.graph.fields.queryPayload', kind: 'text' },
    { key: 'instructionPayload', labelKey: 'studio.graph.fields.instructionPayload', kind: 'text' },
    { key: 'callName', labelKey: 'studio.graph.fields.functionName', kind: 'text' },
    { key: 'callArgs', labelKey: 'studio.graph.fields.functionArguments', kind: 'text' },
    { key: 'statement', labelKey: 'studio.graph.fields.customStatement', kind: 'textarea' },
  ],
  return: [
    { key: 'value', labelKey: 'studio.graph.fields.returnValue', kind: 'textarea' },
  ],
  note: [
    { key: 'body', labelKey: 'studio.graph.fields.note', kind: 'textarea' },
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

function defaultMetadata(translate: KotodamaStudioTranslate = untranslatedStudioKey): KotodamaStudioMetadata {
  return {
    title: 'GraphFirstContract',
    dataspace: 'universal',
    authority: 'operator@studio.main',
    chainId: 'wonderland',
    description: translate('studio.graph.defaultMetadataDescription'),
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

function readMetadata(
  value: unknown,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioMetadata {
  const fallback = defaultMetadata(translate);
  const record = readRecord(value);
  return {
    title: readString(record?.title, fallback.title),
    dataspace: readString(record?.dataspace, fallback.dataspace),
    authority: readString(record?.authority, fallback.authority),
    chainId: readString(record?.chainId, fallback.chainId),
    description: readString(record?.description, fallback.description),
  };
}

function normalizeGraphNode(
  value: unknown,
  index: number,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphNode {
  const record = readRecord(value);
  const data = readRecord(record?.data);
  const rawKind = readString(data?.kind, 'note') as KotodamaStudioGraphNodeKind;
  const kind = [...BODY_NODE_KINDS, ...DECLARATION_NODE_KINDS].includes(rawKind) ? rawKind : 'note';
  const configRecord = readRecord(data?.config);
  const defaults = defaultNodeData(kind, translate);
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

  if (flowInputKinds.has(kind)) ports.push(typedPort('flow-in', 'input', 'flow-in', 'flow', 'flow'));
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
    ports.push(typedPort('value', 'input', config(node, 'target', 'value'), targetType, 'value'));
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
      ports.push(typedPort(`arg-${index + 1}`, 'input', `arg-${index + 1}`, valueType, 'effect'));
    }
  } else if (kind === 'return') {
    ports.push(typedPort('value', 'input', 'return', document ? expectedReturnTypeForNode(document, node.id) : 'unknown', 'value'));
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

export function defaultNodeData(
  kind: KotodamaStudioGraphNodeKind,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphNodeData {
  const copy = (part: 'title' | 'detail') => translate(`studio.graph.defaultNodes.${kind}.${part}`);
  switch (kind) {
    case 'state':
      return { kind, title: copy('title'), detail: copy('detail'), config: { name: 'counter', valueType: 'int' }, ports: [] };
    case 'map_state':
      return { kind, title: copy('title'), detail: copy('detail'), config: { name: 'Ledger', keyType: 'Name', valueType: 'int' }, ports: [] };
    case 'helper':
      return { kind, title: copy('title'), detail: copy('detail'), config: { name: 'helper', params: '', returnType: '' }, ports: [] };
    case 'entrypoint':
      return { kind, title: copy('title'), detail: copy('detail'), config: { name: 'run', params: '', returnType: '', permission: 'Admin' }, ports: [] };
    case 'trigger':
      return { kind, title: copy('title'), detail: copy('detail'), config: { id: 'trigger_1', entrypoint: 'run', mode: 'pre_commit', startMs: '0', periodMs: '60000' }, ports: [] };
    case 'guard':
      return { kind, title: copy('title'), detail: copy('detail'), config: { condition: 'amount > 0', message: translate('studio.graph.defaultNodes.guard.failureMessage') }, ports: [] };
    case 'branch':
      return { kind, title: copy('title'), detail: copy('detail'), config: { condition: 'value > 0' }, ports: [] };
    case 'loop':
      return { kind, title: copy('title'), detail: copy('detail'), config: { condition: 'i < limit' }, ports: [] };
    case 'formula':
      return { kind, title: copy('title'), detail: copy('detail'), config: { name: 'value', valueType: '', expression: 'amount * price', left: '', operator: '', right: '' }, ports: [] };
    case 'assign_state':
      return { kind, title: copy('title'), detail: copy('detail'), config: { target: 'counter', value: 'counter + 1' }, ports: [] };
    case 'map_write':
      return { kind, title: copy('title'), detail: copy('detail'), config: { target: 'Ledger', key: 'pool', value: 'amount' }, ports: [] };
    case 'effect':
      return { kind, title: copy('title'), detail: copy('detail'), config: { effect: 'info', args: JSON.stringify(translate('studio.graph.defaultNodes.effect.message')), statement: '', from: '', to: '', account: '', assetDefinition: '', amount: '', detailKey: '', detailValue: '', queryPayload: '', instructionPayload: '', callName: '', callArgs: '' }, ports: [] };
    case 'return':
      return { kind, title: copy('title'), detail: copy('detail'), config: { value: '' }, ports: [] };
    case 'note':
      return { kind, title: copy('title'), detail: copy('detail'), config: { body: translate('studio.graph.defaultNodes.note.body') }, ports: [] };
  }
}

export function createKotodamaStudioGraphNode(
  kind: KotodamaStudioGraphNodeKind,
  index: number,
  position: { x: number, y: number },
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphNode {
  const data = defaultNodeData(kind, translate);
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

export function createEmptyKotodamaStudioGraphDocument(
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphDocumentV2 {
  return createKotodamaStudioGraphTemplate('stablecoin', translate);
}

export function createKotodamaStudioGraphTemplate(
  templateId: KotodamaStudioGraphTemplateId,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphDocumentV2 {
  return refreshKotodamaStudioGraphPorts(createKotodamaStudioGraphTemplateDraft(templateId, translate));
}

function createKotodamaStudioGraphTemplateDraft(
  templateId: KotodamaStudioGraphTemplateId,
  translate: KotodamaStudioTranslate
): KotodamaStudioGraphDocumentV2 {
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
        description: translate('studio.graph.templateDescriptions.assetOps'),
      },
      graph: {
        nodes: [
          graphNode('entry-execute', 'entrypoint', translate('studio.graph.templateNodes.asset_ops.entry_execute.title'), translate('studio.graph.templateNodes.asset_ops.entry_execute.detail'), 80, 120, { name: 'execute', params: '', returnType: '', permission: 'Admin' }),
          graphNode('let-alice', 'formula', translate('studio.graph.templateNodes.asset_ops.let_alice.title'), translate('studio.graph.templateNodes.asset_ops.let_alice.detail'), 380, 60, { name: 'alice', expression: 'authority()' }),
          graphNode('let-bob', 'formula', translate('studio.graph.templateNodes.asset_ops.let_bob.title'), translate('studio.graph.templateNodes.asset_ops.let_bob.detail'), 680, 60, { name: 'bob', expression: 'authority()' }),
          graphNode('let-coin', 'formula', translate('studio.graph.templateNodes.asset_ops.let_coin.title'), translate('studio.graph.templateNodes.asset_ops.let_coin.detail'), 980, 60, { name: 'coin', expression: 'asset_definition!("6pEP9RjNoZ7beWkT3pLfKoM1dyfi")' }),
          graphNode('mint', 'effect', translate('studio.graph.templateNodes.asset_ops.mint.title'), translate('studio.graph.templateNodes.asset_ops.mint.detail'), 380, 250, { effect: 'mint_asset', args: 'alice, coin, 1000' }),
          graphNode('transfer', 'effect', translate('studio.graph.templateNodes.asset_ops.transfer.title'), translate('studio.graph.templateNodes.asset_ops.transfer.detail'), 680, 250, { effect: 'transfer_asset', args: 'alice, bob, coin, 500' }),
          graphNode('burn', 'effect', translate('studio.graph.templateNodes.asset_ops.burn.title'), translate('studio.graph.templateNodes.asset_ops.burn.detail'), 980, 250, { effect: 'burn_asset', args: 'bob, coin, 100' }),
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
        description: translate('studio.graph.templateDescriptions.subscription'),
      },
      graph: {
        nodes: [
          graphNode('state-renewals', 'state', translate('studio.graph.templateNodes.subscription.state_renewals.title'), translate('studio.graph.templateNodes.subscription.state_renewals.detail'), 80, 60, { name: 'renewals', valueType: 'int' }),
          graphNode('entry-bill', 'entrypoint', translate('studio.graph.templateNodes.subscription.entry_bill.title'), translate('studio.graph.templateNodes.subscription.entry_bill.detail'), 80, 260, { name: 'bill', params: '', returnType: '', permission: 'Billing' }),
          graphNode('charge', 'effect', translate('studio.graph.templateNodes.subscription.charge.title'), translate('studio.graph.templateNodes.subscription.charge.detail'), 390, 260, { effect: 'transfer_asset', args: 'account!("customer@stream.main"), account!("treasury@stream.main"), asset_definition!("6pEP9RjNoZ7beWkT3pLfKoM1dyfi"), 10' }),
          graphNode('renew', 'assign_state', translate('studio.graph.templateNodes.subscription.renew.title'), translate('studio.graph.templateNodes.subscription.renew.detail'), 700, 260, { target: 'renewals', value: '2' }),
          graphNode('trigger-monthly', 'trigger', translate('studio.graph.templateNodes.subscription.trigger_monthly.title'), translate('studio.graph.templateNodes.subscription.trigger_monthly.detail'), 80, 470, { id: 'bill_monthly', entrypoint: 'bill', mode: 'schedule', startMs: '0', periodMs: '2592000000' }),
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
        description: translate('studio.graph.templateDescriptions.thresholdEscrow'),
      },
      graph: {
        nodes: [
          graphNode('state-payer', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_payer.title'), translate('studio.graph.templateNodes.threshold_escrow.state_payer.detail'), 80, 40, { name: 'payer_account', valueType: 'AccountId' }),
          graphNode('state-recipient', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_recipient.title'), translate('studio.graph.templateNodes.threshold_escrow.state_recipient.detail'), 310, 40, { name: 'recipient_account', valueType: 'AccountId' }),
          graphNode('state-escrow-account', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_escrow_account.title'), translate('studio.graph.templateNodes.threshold_escrow.state_escrow_account.detail'), 540, 40, { name: 'escrow_account_id', valueType: 'AccountId' }),
          graphNode('state-asset', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_asset.title'), translate('studio.graph.templateNodes.threshold_escrow.state_asset.detail'), 770, 40, { name: 'escrow_asset_definition', valueType: 'AssetDefinitionId' }),
          graphNode('state-target', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_target.title'), translate('studio.graph.templateNodes.threshold_escrow.state_target.detail'), 1000, 40, { name: 'target_amount_value', valueType: 'int' }),
          graphNode('state-funded', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_funded.title'), translate('studio.graph.templateNodes.threshold_escrow.state_funded.detail'), 1230, 40, { name: 'funded_amount_value', valueType: 'int' }),
          graphNode('state-open', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_open.title'), translate('studio.graph.templateNodes.threshold_escrow.state_open.detail'), 1460, 40, { name: 'is_open', valueType: 'bool' }),
          graphNode('state-released', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_released.title'), translate('studio.graph.templateNodes.threshold_escrow.state_released.detail'), 1690, 40, { name: 'is_released', valueType: 'bool' }),
          graphNode('state-refunded', 'state', translate('studio.graph.templateNodes.threshold_escrow.state_refunded.title'), translate('studio.graph.templateNodes.threshold_escrow.state_refunded.detail'), 1920, 40, { name: 'is_refunded', valueType: 'bool' }),
          graphNode('helper-open', 'helper', translate('studio.graph.templateNodes.threshold_escrow.helper_open.title'), translate('studio.graph.templateNodes.threshold_escrow.helper_open.detail'), 80, 230, { name: 'assert_open', params: '', returnType: '' }),
graphNode('guard-open', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_open.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_open.detail'), 370, 230, { condition: 'is_open', message: translate('studio.graph.templateNodes.threshold_escrow.guard_open.failureMessage') }),
          graphNode('guard-not-released', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_not_released.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_not_released.detail'), 660, 230, { condition: '!is_released', message: translate('studio.graph.templateNodes.threshold_escrow.guard_not_released.failureMessage') }),
          graphNode('guard-not-refunded', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_not_refunded.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_not_refunded.detail'), 950, 230, { condition: '!is_refunded', message: translate('studio.graph.templateNodes.threshold_escrow.guard_not_refunded.failureMessage') }),
          graphNode('helper-payer', 'helper', translate('studio.graph.templateNodes.threshold_escrow.helper_payer.title'), translate('studio.graph.templateNodes.threshold_escrow.helper_payer.detail'), 80, 420, { name: 'assert_payer', params: '', returnType: '' }),
          graphNode('guard-payer', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_payer.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_payer.detail'), 370, 420, { condition: 'authority() == payer_account', message: translate('studio.graph.templateNodes.threshold_escrow.guard_payer.failureMessage') }),
          graphNode('entry-open', 'entrypoint', translate('studio.graph.templateNodes.threshold_escrow.entry_open.title'), translate('studio.graph.templateNodes.threshold_escrow.entry_open.detail'), 80, 650, { name: 'open_escrow', params: 'recipient: AccountId, escrow_account: AccountId, asset_definition: AssetDefinitionId, target_amount: int', returnType: '', permission: 'Admin' }),
          graphNode('guard-target', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_target.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_target.detail'), 390, 650, { condition: 'target_amount > 0', message: translate('studio.graph.templateNodes.threshold_escrow.guard_target.failureMessage') }),
          graphNode('set-payer', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_payer.title'), translate('studio.graph.templateNodes.threshold_escrow.set_payer.detail'), 700, 650, { target: 'payer_account', value: 'authority()' }),
          graphNode('set-recipient', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_recipient.title'), translate('studio.graph.templateNodes.threshold_escrow.set_recipient.detail'), 1010, 650, { target: 'recipient_account', value: 'recipient' }),
          graphNode('set-escrow-account', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_escrow_account.title'), translate('studio.graph.templateNodes.threshold_escrow.set_escrow_account.detail'), 1320, 650, { target: 'escrow_account_id', value: 'escrow_account' }),
          graphNode('set-asset', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_asset.title'), translate('studio.graph.templateNodes.threshold_escrow.set_asset.detail'), 1630, 650, { target: 'escrow_asset_definition', value: 'asset_definition' }),
          graphNode('set-target', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_target.title'), translate('studio.graph.templateNodes.threshold_escrow.set_target.detail'), 1940, 650, { target: 'target_amount_value', value: 'target_amount' }),
          graphNode('set-funded-zero', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_funded_zero.title'), translate('studio.graph.templateNodes.threshold_escrow.set_funded_zero.detail'), 2250, 650, { target: 'funded_amount_value', value: '0' }),
          graphNode('set-open', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_open.title'), translate('studio.graph.templateNodes.threshold_escrow.set_open.detail'), 2560, 650, { target: 'is_open', value: 'true' }),
          graphNode('set-released-false', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_released_false.title'), translate('studio.graph.templateNodes.threshold_escrow.set_released_false.detail'), 2870, 650, { target: 'is_released', value: 'false' }),
          graphNode('set-refunded-false', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_refunded_false.title'), translate('studio.graph.templateNodes.threshold_escrow.set_refunded_false.detail'), 3180, 650, { target: 'is_refunded', value: 'false' }),
          graphNode('entry-deposit', 'entrypoint', translate('studio.graph.templateNodes.threshold_escrow.entry_deposit.title'), translate('studio.graph.templateNodes.threshold_escrow.entry_deposit.detail'), 80, 920, { name: 'deposit', params: 'amount: int', returnType: '', permission: 'Admin' }),
          graphNode('call-open', 'effect', translate('studio.graph.templateNodes.threshold_escrow.call_open.title'), translate('studio.graph.templateNodes.threshold_escrow.call_open.detail'), 390, 920, { effect: 'call_function', args: 'assert_open()' }),
          graphNode('call-payer', 'effect', translate('studio.graph.templateNodes.threshold_escrow.call_payer.title'), translate('studio.graph.templateNodes.threshold_escrow.call_payer.detail'), 700, 920, { effect: 'call_function', args: 'assert_payer()' }),
          graphNode('guard-amount', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_amount.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_amount.detail'), 1010, 920, { condition: 'amount > 0', message: translate('studio.graph.templateNodes.threshold_escrow.guard_amount.failureMessage') }),
          graphNode('next-funded', 'formula', translate('studio.graph.templateNodes.threshold_escrow.next_funded.title'), translate('studio.graph.templateNodes.threshold_escrow.next_funded.detail'), 1320, 920, { name: 'next_funded', expression: 'funded_amount_value + amount' }),
          graphNode('guard-target-max', 'guard', translate('studio.graph.templateNodes.threshold_escrow.guard_target_max.title'), translate('studio.graph.templateNodes.threshold_escrow.guard_target_max.detail'), 1630, 920, { condition: 'next_funded <= target_amount_value', message: translate('studio.graph.templateNodes.threshold_escrow.guard_target_max.failureMessage') }),
          graphNode('deposit-transfer', 'effect', translate('studio.graph.templateNodes.threshold_escrow.deposit_transfer.title'), translate('studio.graph.templateNodes.threshold_escrow.deposit_transfer.detail'), 1940, 920, { effect: 'transfer_asset', args: 'payer_account, escrow_account_id, escrow_asset_definition, amount' }),
          graphNode('set-funded-next', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.set_funded_next.title'), translate('studio.graph.templateNodes.threshold_escrow.set_funded_next.detail'), 2250, 920, { target: 'funded_amount_value', value: 'next_funded' }),
          graphNode('entry-release', 'entrypoint', translate('studio.graph.templateNodes.threshold_escrow.entry_release.title'), translate('studio.graph.templateNodes.threshold_escrow.entry_release.detail'), 80, 1190, { name: 'release_if_ready', params: '', returnType: '', permission: 'Admin' }),
          graphNode('release-open', 'effect', translate('studio.graph.templateNodes.threshold_escrow.release_open.title'), translate('studio.graph.templateNodes.threshold_escrow.release_open.detail'), 390, 1190, { effect: 'call_function', args: 'assert_open()' }),
          graphNode('release-ready', 'guard', translate('studio.graph.templateNodes.threshold_escrow.release_ready.title'), translate('studio.graph.templateNodes.threshold_escrow.release_ready.detail'), 700, 1190, { condition: 'funded_amount_value == target_amount_value', message: translate('studio.graph.templateNodes.threshold_escrow.release_ready.failureMessage') }),
          graphNode('release-transfer', 'effect', translate('studio.graph.templateNodes.threshold_escrow.release_transfer.title'), translate('studio.graph.templateNodes.threshold_escrow.release_transfer.detail'), 1010, 1190, { effect: 'transfer_asset', args: 'escrow_account_id, recipient_account, escrow_asset_definition, funded_amount_value' }),
          graphNode('release-close', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.release_close.title'), translate('studio.graph.templateNodes.threshold_escrow.release_close.detail'), 1320, 1190, { target: 'is_open', value: 'false' }),
          graphNode('release-flag', 'assign_state', translate('studio.graph.templateNodes.threshold_escrow.release_flag.title'), translate('studio.graph.templateNodes.threshold_escrow.release_flag.detail'), 1630, 1190, { target: 'is_released', value: 'true' }),
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
        description: translate('studio.graph.templateDescriptions.irohaSwapReduced'),
      },
      graph: {
        nodes: [
          graphNode('map-asset-a', 'map_state', translate('studio.graph.templateNodes.irohaswap_reduced.map_asset_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.map_asset_a.detail'), 80, 40, { name: 'PoolAssetA', keyType: 'Name', valueType: 'AssetDefinitionId' }),
          graphNode('map-asset-b', 'map_state', translate('studio.graph.templateNodes.irohaswap_reduced.map_asset_b.title'), translate('studio.graph.templateNodes.irohaswap_reduced.map_asset_b.detail'), 330, 40, { name: 'PoolAssetB', keyType: 'Name', valueType: 'AssetDefinitionId' }),
          graphNode('map-account', 'map_state', translate('studio.graph.templateNodes.irohaswap_reduced.map_account.title'), translate('studio.graph.templateNodes.irohaswap_reduced.map_account.detail'), 580, 40, { name: 'PoolAccount', keyType: 'Name', valueType: 'AccountId' }),
          graphNode('map-reserve-a', 'map_state', translate('studio.graph.templateNodes.irohaswap_reduced.map_reserve_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.map_reserve_a.detail'), 830, 40, { name: 'ReserveA', keyType: 'Name', valueType: 'int' }),
          graphNode('map-reserve-b', 'map_state', translate('studio.graph.templateNodes.irohaswap_reduced.map_reserve_b.title'), translate('studio.graph.templateNodes.irohaswap_reduced.map_reserve_b.detail'), 1080, 40, { name: 'ReserveB', keyType: 'Name', valueType: 'int' }),
          graphNode('entry-init-pool', 'entrypoint', translate('studio.graph.templateNodes.irohaswap_reduced.entry_init_pool.title'), translate('studio.graph.templateNodes.irohaswap_reduced.entry_init_pool.detail'), 80, 260, { name: 'init_pool', params: 'pool: Name, asset_a: AssetDefinitionId, asset_b: AssetDefinitionId, pool_account: AccountId', returnType: '', permission: 'Admin' }),
          graphNode('guard-assets-different', 'guard', translate('studio.graph.templateNodes.irohaswap_reduced.guard_assets_different.title'), translate('studio.graph.templateNodes.irohaswap_reduced.guard_assets_different.detail'), 400, 260, { condition: 'asset_a != asset_b', message: translate('studio.graph.templateNodes.irohaswap_reduced.guard_assets_different.failureMessage') }),
          graphNode('write-asset-a', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_asset_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_asset_a.detail'), 720, 260, { target: 'PoolAssetA', key: 'pool', value: 'asset_a' }),
          graphNode('write-asset-b', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_asset_b.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_asset_b.detail'), 1040, 260, { target: 'PoolAssetB', key: 'pool', value: 'asset_b' }),
          graphNode('write-account', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_account.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_account.detail'), 1360, 260, { target: 'PoolAccount', key: 'pool', value: 'pool_account' }),
          graphNode('write-ra', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_ra.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_ra.detail'), 1680, 260, { target: 'ReserveA', key: 'pool', value: '0' }),
          graphNode('write-rb', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_rb.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_rb.detail'), 2000, 260, { target: 'ReserveB', key: 'pool', value: '0' }),
          graphNode('entry-swap', 'entrypoint', translate('studio.graph.templateNodes.irohaswap_reduced.entry_swap.title'), translate('studio.graph.templateNodes.irohaswap_reduced.entry_swap.detail'), 80, 560, { name: 'swap', params: 'trader: AccountId, pool: Name, input_asset: AssetDefinitionId, amount_in: int, min_output: int', returnType: 'int', permission: 'Admin' }),
          graphNode('guard-amount-in', 'guard', translate('studio.graph.templateNodes.irohaswap_reduced.guard_amount_in.title'), translate('studio.graph.templateNodes.irohaswap_reduced.guard_amount_in.detail'), 400, 560, { condition: 'amount_in > 0', message: translate('studio.graph.templateNodes.irohaswap_reduced.guard_amount_in.failureMessage') }),
          graphNode('let-asset-a', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_asset_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_asset_a.detail'), 720, 560, { name: 'asset_a', expression: 'PoolAssetA[pool]' }),
          graphNode('let-asset-b', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_asset_b.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_asset_b.detail'), 1040, 560, { name: 'asset_b', expression: 'PoolAssetB[pool]' }),
          graphNode('let-pool-account', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_pool_account.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_pool_account.detail'), 1360, 560, { name: 'pool_account', expression: 'PoolAccount[pool]' }),
          graphNode('let-reserve-a', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_reserve_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_reserve_a.detail'), 1680, 560, { name: 'reserve_a', expression: 'ReserveA[pool]' }),
          graphNode('let-reserve-b', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_reserve_b.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_reserve_b.detail'), 2000, 560, { name: 'reserve_b', expression: 'ReserveB[pool]' }),
          graphNode('let-is-a', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_is_a.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_is_a.detail'), 2320, 560, { name: 'is_a_in', expression: 'input_asset == asset_a' }),
          graphNode('let-effective', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_effective.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_effective.detail'), 2640, 560, { name: 'effective', expression: '(amount_in * 997) / 1000' }),
          graphNode('let-out', 'formula', translate('studio.graph.templateNodes.irohaswap_reduced.let_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.let_out.detail'), 2960, 560, { name: 'out', expression: 'is_a_in ? ((reserve_b * effective) / (reserve_a + effective)) : ((reserve_a * effective) / (reserve_b + effective))' }),
          graphNode('guard-slippage', 'guard', translate('studio.graph.templateNodes.irohaswap_reduced.guard_slippage.title'), translate('studio.graph.templateNodes.irohaswap_reduced.guard_slippage.detail'), 3280, 560, { condition: 'out >= min_output', message: translate('studio.graph.templateNodes.irohaswap_reduced.guard_slippage.failureMessage') }),
          graphNode('branch-side', 'branch', translate('studio.graph.templateNodes.irohaswap_reduced.branch_side.title'), translate('studio.graph.templateNodes.irohaswap_reduced.branch_side.detail'), 3600, 560, { condition: 'is_a_in' }),
          graphNode('write-a-in', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_a_in.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_a_in.detail'), 3920, 460, { target: 'ReserveA', key: 'pool', value: 'reserve_a + amount_in' }),
          graphNode('write-b-out', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_b_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_b_out.detail'), 4240, 460, { target: 'ReserveB', key: 'pool', value: 'reserve_b - out' }),
          graphNode('transfer-a-in', 'effect', translate('studio.graph.templateNodes.irohaswap_reduced.transfer_a_in.title'), translate('studio.graph.templateNodes.irohaswap_reduced.transfer_a_in.detail'), 4560, 460, { effect: 'transfer_asset', args: 'trader, pool_account, asset_a, amount_in' }),
          graphNode('transfer-b-out', 'effect', translate('studio.graph.templateNodes.irohaswap_reduced.transfer_b_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.transfer_b_out.detail'), 4880, 460, { effect: 'transfer_asset', args: 'pool_account, trader, asset_b, out' }),
          graphNode('write-b-in', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_b_in.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_b_in.detail'), 3920, 720, { target: 'ReserveB', key: 'pool', value: 'reserve_b + amount_in' }),
          graphNode('write-a-out', 'map_write', translate('studio.graph.templateNodes.irohaswap_reduced.write_a_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.write_a_out.detail'), 4240, 720, { target: 'ReserveA', key: 'pool', value: 'reserve_a - out' }),
          graphNode('transfer-b-in', 'effect', translate('studio.graph.templateNodes.irohaswap_reduced.transfer_b_in.title'), translate('studio.graph.templateNodes.irohaswap_reduced.transfer_b_in.detail'), 4560, 720, { effect: 'transfer_asset', args: 'trader, pool_account, asset_b, amount_in' }),
          graphNode('transfer-a-out', 'effect', translate('studio.graph.templateNodes.irohaswap_reduced.transfer_a_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.transfer_a_out.detail'), 4880, 720, { effect: 'transfer_asset', args: 'pool_account, trader, asset_a, out' }),
          graphNode('return-out', 'return', translate('studio.graph.templateNodes.irohaswap_reduced.return_out.title'), translate('studio.graph.templateNodes.irohaswap_reduced.return_out.detail'), 5200, 560, { value: 'out' }),
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
      description: translate('studio.graph.templateDescriptions.stablecoin'),
    },
    graph: {
      nodes: [
        graphNode('entry-mintable', 'entrypoint', translate('studio.graph.templateNodes.stablecoin.entry_mintable.title'), translate('studio.graph.templateNodes.stablecoin.entry_mintable.detail'), 80, 120, { name: 'mintable_amount', params: 'collateral_amount: int, price: int, target_ratio_bps: int', returnType: 'int', permission: '' }),
        graphNode('value', 'formula', translate('studio.graph.templateNodes.stablecoin.value.title'), translate('studio.graph.templateNodes.stablecoin.value.detail'), 420, 120, { name: 'value', expression: 'collateral_amount * price' }),
        graphNode('max-mint', 'formula', translate('studio.graph.templateNodes.stablecoin.max_mint.title'), translate('studio.graph.templateNodes.stablecoin.max_mint.detail'), 760, 120, { name: 'max_mint', expression: '(value * 10000) / target_ratio_bps' }),
        graphNode('return-max', 'return', translate('studio.graph.templateNodes.stablecoin.return_max.title'), translate('studio.graph.templateNodes.stablecoin.return_max.detail'), 1100, 120, { value: 'max_mint' }),
        graphNode('entry-mint-stable', 'entrypoint', translate('studio.graph.templateNodes.stablecoin.entry_mint_stable.title'), translate('studio.graph.templateNodes.stablecoin.entry_mint_stable.detail'), 80, 390, { name: 'mint_stable', params: 'user: AccountId, vault_account: AccountId, collateral_asset: AssetDefinitionId, stable_asset: AssetDefinitionId, collateral_amount: int, price: int, min_ratio_bps: int, mint_amount: int', returnType: '', permission: 'Admin' }),
        graphNode('move-collateral', 'effect', translate('studio.graph.templateNodes.stablecoin.move_collateral.title'), translate('studio.graph.templateNodes.stablecoin.move_collateral.detail'), 420, 390, { effect: 'transfer_asset', args: 'user, vault_account, collateral_asset, collateral_amount' }),
        graphNode('stable-value', 'formula', translate('studio.graph.templateNodes.stablecoin.stable_value.title'), translate('studio.graph.templateNodes.stablecoin.stable_value.detail'), 760, 390, { name: 'value', expression: 'collateral_amount * price' }),
        graphNode('post-ratio', 'formula', translate('studio.graph.templateNodes.stablecoin.post_ratio.title'), translate('studio.graph.templateNodes.stablecoin.post_ratio.detail'), 1100, 390, { name: 'post_ratio', expression: '(value * 10000) / mint_amount' }),
        graphNode('ratio-ok', 'guard', translate('studio.graph.templateNodes.stablecoin.ratio_ok.title'), translate('studio.graph.templateNodes.stablecoin.ratio_ok.detail'), 1440, 390, { condition: 'post_ratio >= min_ratio_bps', message: translate('studio.graph.templateNodes.stablecoin.ratio_ok.failureMessage') }),
        graphNode('mint-stable', 'effect', translate('studio.graph.templateNodes.stablecoin.mint_stable.title'), translate('studio.graph.templateNodes.stablecoin.mint_stable.detail'), 1780, 390, { effect: 'mint_asset', args: 'user, stable_asset, mint_amount' }),
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

export function normalizeKotodamaStudioGraphDocument(
  value: unknown,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphDocumentV2 {
  const record = readRecord(value);
  if (record?.version === 2) {
    const graph = readRecord(record.graph);
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes.map((node, index) => normalizeGraphNode(node, index, translate)) : [];
    const edges = Array.isArray(graph?.edges)
      ? graph.edges
        .map(normalizeGraphEdge)
        .filter((edge) => edge.source.length > 0 && edge.target.length > 0)
      : [];
    const nodeIds = new Set(nodes.map((node) => node.id));

    return refreshKotodamaStudioGraphPorts({
      version: 2,
      updatedAt: readString(record.updatedAt, new Date(0).toISOString()),
      metadata: readMetadata(record.metadata, translate),
      graph: {
        nodes,
        edges: edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
      },
    });
  }

  throw new Error('Studio graph document must use version 2');
}

function invalidImportedGraphDocument(path: string, expectation: string): never {
  throw new TypeError(`Studio graph document ${path} ${expectation}`);
}

function requireImportedRecord(value: unknown, path: string): Record<string, unknown> {
  const record = readRecord(value);
  if (!record) invalidImportedGraphDocument(path, 'must be an object');
  return record;
}

function requireImportedKeys(record: Record<string, unknown>, path: string, expectedKeys: readonly string[]): void {
  const expected = new Set(expectedKeys);
  const unexpected = Object.keys(record).filter((key) => !expected.has(key));
  if (unexpected.length > 0) {
    invalidImportedGraphDocument(path, `contains unsupported fields: ${unexpected.sort().join(', ')}`);
  }
  const missing = expectedKeys.filter((key) => !Object.hasOwn(record, key));
  if (missing.length > 0) {
    invalidImportedGraphDocument(path, `is missing required fields: ${missing.join(', ')}`);
  }
}

function requireImportedString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  options: { nonEmpty?: boolean } = {}
): string {
  const value = record[key];
  if (typeof value !== 'string') invalidImportedGraphDocument(`${path}.${key}`, 'must be a string');
  if (options.nonEmpty && value.trim().length === 0) {
    invalidImportedGraphDocument(`${path}.${key}`, 'must not be empty');
  }
  return value;
}

function parseImportedMetadata(value: unknown): KotodamaStudioMetadata {
  const path = 'metadata';
  const record = requireImportedRecord(value, path);
  requireImportedKeys(record, path, ['title', 'dataspace', 'authority', 'chainId', 'description']);
  return {
    title: requireImportedString(record, 'title', path),
    dataspace: requireImportedString(record, 'dataspace', path),
    authority: requireImportedString(record, 'authority', path),
    chainId: requireImportedString(record, 'chainId', path),
    description: requireImportedString(record, 'description', path),
  };
}

function parseImportedPosition(value: unknown, path: string): KotodamaStudioGraphNode['position'] {
  const record = requireImportedRecord(value, path);
  requireImportedKeys(record, path, ['x', 'y']);
  const x = record.x;
  const y = record.y;
  if (typeof x !== 'number' || !Number.isFinite(x)) invalidImportedGraphDocument(`${path}.x`, 'must be finite');
  if (typeof y !== 'number' || !Number.isFinite(y)) invalidImportedGraphDocument(`${path}.y`, 'must be finite');
  return { x, y };
}

const IMPORTED_PORT_DIRECTIONS = new Set<KotodamaStudioGraphPort['direction']>(['input', 'output']);
const IMPORTED_PORT_ROLES = new Set<KotodamaStudioGraphPort['role']>(['flow', 'value', 'param', 'state', 'effect']);
const IMPORTED_VALUE_TYPES = new Set<KotodamaStudioGraphValueType>([
  'flow',
  'void',
  'unknown',
  'int',
  'bool',
  'AccountId',
  'AssetDefinitionId',
  'DomainId',
  'Name',
  'Json',
  'Blob',
  'NoritoBytes',
]);

function isImportedValueType(value: string): value is KotodamaStudioGraphValueType {
  return IMPORTED_VALUE_TYPES.has(value as KotodamaStudioGraphValueType) || /^Map<[^,>]+,\s*[^>]+>$/u.test(value);
}

function parseImportedPort(value: unknown, nodeIndex: number, portIndex: number): KotodamaStudioGraphPort {
  const path = `graph.nodes[${nodeIndex}].data.ports[${portIndex}]`;
  const record = requireImportedRecord(value, path);
  requireImportedKeys(record, path, ['id', 'direction', 'label', 'valueType', 'role']);
  const id = requireImportedString(record, 'id', path, { nonEmpty: true });
  const direction = requireImportedString(record, 'direction', path);
  const label = requireImportedString(record, 'label', path);
  const valueType = requireImportedString(record, 'valueType', path);
  const role = requireImportedString(record, 'role', path);
  if (!IMPORTED_PORT_DIRECTIONS.has(direction as KotodamaStudioGraphPort['direction'])) {
    invalidImportedGraphDocument(`${path}.direction`, 'must be input or output');
  }
  if (!isImportedValueType(valueType)) invalidImportedGraphDocument(`${path}.valueType`, 'is unsupported');
  if (!IMPORTED_PORT_ROLES.has(role as KotodamaStudioGraphPort['role'])) {
    invalidImportedGraphDocument(`${path}.role`, 'is unsupported');
  }
  return {
    id,
    direction: direction as KotodamaStudioGraphPort['direction'],
    label,
    valueType,
    role: role as KotodamaStudioGraphPort['role'],
  };
}

function parseImportedNode(value: unknown, index: number): KotodamaStudioGraphNode {
  const path = `graph.nodes[${index}]`;
  const record = requireImportedRecord(value, path);
  requireImportedKeys(record, path, ['id', 'type', 'position', 'data']);
  const id = requireImportedString(record, 'id', path, { nonEmpty: true });
  if (record.type !== 'kotodamaGraph') {
    invalidImportedGraphDocument(`${path}.type`, 'must be kotodamaGraph');
  }

  const dataPath = `${path}.data`;
  const data = requireImportedRecord(record.data, dataPath);
  requireImportedKeys(data, dataPath, ['title', 'detail', 'kind', 'config', 'ports']);
  const kind = requireImportedString(data, 'kind', dataPath);
  if (![...BODY_NODE_KINDS, ...DECLARATION_NODE_KINDS].includes(kind as KotodamaStudioGraphNodeKind)) {
    invalidImportedGraphDocument(`${dataPath}.kind`, 'is unsupported');
  }

  const configPath = `${dataPath}.config`;
  const config = requireImportedRecord(data.config, configPath);
  const importedConfig: Record<string, string> = {};
  for (const [key, configValue] of Object.entries(config)) {
    if (key.trim().length === 0) invalidImportedGraphDocument(configPath, 'contains an empty field name');
    if (typeof configValue !== 'string') {
      invalidImportedGraphDocument(`${configPath}.${key}`, 'must be a string');
    }
    importedConfig[key] = configValue;
  }

  if (!Array.isArray(data.ports)) invalidImportedGraphDocument(`${dataPath}.ports`, 'must be an array');
  return {
    id,
    type: 'kotodamaGraph',
    position: parseImportedPosition(record.position, `${path}.position`),
    data: {
      title: requireImportedString(data, 'title', dataPath),
      detail: requireImportedString(data, 'detail', dataPath),
      kind: kind as KotodamaStudioGraphNodeKind,
      config: importedConfig,
      ports: data.ports.map((port, portIndex) => parseImportedPort(port, index, portIndex)),
    },
  };
}

function parseImportedEdge(value: unknown, index: number): KotodamaStudioGraphEdge {
  const path = `graph.edges[${index}]`;
  const record = requireImportedRecord(value, path);
  requireImportedKeys(record, path, ['id', 'source', 'target', 'label']);
  return {
    id: requireImportedString(record, 'id', path, { nonEmpty: true }),
    source: requireImportedString(record, 'source', path, { nonEmpty: true }),
    target: requireImportedString(record, 'target', path, { nonEmpty: true }),
    label: requireImportedString(record, 'label', path),
  };
}

function requireUniqueImportedIds(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) invalidImportedGraphDocument(path, `contains duplicate id: ${value}`);
    seen.add(value);
  }
}

function parseImportedGraphDocument(value: unknown): KotodamaStudioGraphDocumentV2 {
  const record = requireImportedRecord(value, 'root');
  if (record.version !== KOTODAMA_STUDIO_GRAPH_DOCUMENT_VERSION) {
    throw new Error('Studio graph document must use version 2');
  }
  requireImportedKeys(record, 'root', ['version', 'updatedAt', 'metadata', 'graph']);
  const updatedAt = requireImportedString(record, 'updatedAt', 'root', { nonEmpty: true });
  if (!Number.isFinite(Date.parse(updatedAt))) invalidImportedGraphDocument('root.updatedAt', 'must be a timestamp');

  const graph = requireImportedRecord(record.graph, 'graph');
  requireImportedKeys(graph, 'graph', ['nodes', 'edges']);
  if (!Array.isArray(graph.nodes)) invalidImportedGraphDocument('graph.nodes', 'must be an array');
  if (!Array.isArray(graph.edges)) invalidImportedGraphDocument('graph.edges', 'must be an array');

  const nodes = graph.nodes.map(parseImportedNode);
  const edges = graph.edges.map(parseImportedEdge);
  requireUniqueImportedIds(nodes.map((node) => node.id), 'graph.nodes');
  requireUniqueImportedIds(edges.map((edge) => edge.id), 'graph.edges');
  const nodeIds = new Set(nodes.map((node) => node.id));
  edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source)) {
      invalidImportedGraphDocument(`graph.edges[${index}].source`, `references unknown node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      invalidImportedGraphDocument(`graph.edges[${index}].target`, `references unknown node: ${edge.target}`);
    }
  });

  return {
    version: KOTODAMA_STUDIO_GRAPH_DOCUMENT_VERSION,
    updatedAt,
    metadata: parseImportedMetadata(record.metadata),
    graph: { nodes, edges },
  };
}

export function parseKotodamaStudioGraphDocument(raw: string): KotodamaStudioGraphDocumentV2 {
  return refreshKotodamaStudioGraphPorts(parseImportedGraphDocument(JSON.parse(raw)));
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

export function validateKotodamaStudioGraphDocument(
  document: KotodamaStudioGraphDocumentV2,
  translate: KotodamaStudioTranslate = untranslatedStudioKey
): KotodamaStudioGraphDiagnostic[] {
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
    diagnostics.push({ code: 'contract_missing_title', severity: 'error', message: translate('studio.graph.diagnostics.contractMissingTitle'), nodeId: null });
  }

  for (const duplicate of duplicateValues(functionNames)) {
    for (const nodeId of duplicate.nodeIds) {
      diagnostics.push({ code: 'duplicate_function', severity: 'error', message: translate('studio.graph.diagnostics.duplicateFunction', { name: duplicate.value }), nodeId });
    }
  }

  for (const duplicate of duplicateValues(stateNames)) {
    for (const nodeId of duplicate.nodeIds) {
      diagnostics.push({ code: 'duplicate_state', severity: 'error', message: translate('studio.graph.diagnostics.duplicateState', { name: duplicate.value }), nodeId });
    }
  }

  for (const edge of document.graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      diagnostics.push({ code: 'invalid_edge', severity: 'error', message: translate('studio.graph.diagnostics.invalidEdge', { id: edge.id }), nodeId: null });
      continue;
    }
    if (!isValidKotodamaStudioGraphConnection(document, edge)) {
      const source = nodesById.get(edge.source);
      diagnostics.push({
        code: 'invalid_connection',
        severity: 'error',
        message: source?.data.kind === 'branch' || source?.data.kind === 'loop'
          ? translate('studio.graph.diagnostics.invalidFlowPort', { id: edge.id, label: edge.label })
          : translate('studio.graph.diagnostics.invalidTypedConnection', { id: edge.id }),
        nodeId: edge.source,
      });
    }
  }

  for (const node of nodes) {
    if (node.data.kind === 'entrypoint' || node.data.kind === 'helper') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'function_missing_name', severity: 'error', message: translate('studio.graph.diagnostics.functionMissingName'), nodeId: node.id });
      }
    }

    if (node.data.kind === 'state' || node.data.kind === 'map_state') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'state_missing_name', severity: 'error', message: translate('studio.graph.diagnostics.stateMissingName'), nodeId: node.id });
      }
    }

    if (node.data.kind === 'trigger') {
      const target = normalizeIdentifier(config(node, 'entrypoint'), '');
      if (!target || !entrypointNames.has(target)) {
        diagnostics.push({ code: 'trigger_invalid_entrypoint', severity: 'error', message: translate('studio.graph.diagnostics.triggerInvalidEntrypoint'), nodeId: node.id });
      }
      if (config(node, 'mode') === 'schedule') {
        const period = Number.parseInt(config(node, 'periodMs'), 10);
        if (!Number.isFinite(period) || period <= 0) {
          diagnostics.push({ code: 'trigger_invalid_period', severity: 'error', message: translate('studio.graph.diagnostics.triggerInvalidPeriod'), nodeId: node.id });
        }
      }
    }

    if ((node.data.kind === 'guard' || node.data.kind === 'branch' || node.data.kind === 'loop') && !config(node, 'condition')) {
      diagnostics.push({ code: 'condition_missing', severity: 'error', message: translate('studio.graph.diagnostics.conditionMissing'), nodeId: node.id, field: 'condition' });
    } else if (node.data.kind === 'guard' || node.data.kind === 'branch' || node.data.kind === 'loop') {
      const conditionType = expressionTypeForNode(document, node, config(node, 'condition'));
      if (!areTypesCompatible('bool', conditionType)) {
        diagnostics.push({ code: 'condition_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.conditionTypeMismatch', { actual: conditionType }), nodeId: node.id, field: 'condition' });
      }
    }

    if (node.data.kind === 'formula') {
      if (!normalizeIdentifier(config(node, 'name'), '')) {
        diagnostics.push({ code: 'formula_missing_name', severity: 'error', message: translate('studio.graph.diagnostics.formulaMissingName'), nodeId: node.id, field: 'name' });
      }
      if (!formulaExpression(node)) {
        diagnostics.push({ code: 'formula_missing_expression', severity: 'error', message: translate('studio.graph.diagnostics.formulaMissingExpression'), nodeId: node.id, field: 'expression' });
      }
      const configuredType = normalizeValueType(config(node, 'valueType'), 'unknown');
      if (configuredType !== 'unknown') {
        const inferredType = expressionTypeForNode(document, node, formulaExpression(node));
        if (!areTypesCompatible(configuredType, inferredType)) {
          diagnostics.push({ code: 'formula_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.formulaTypeMismatch', { expected: configuredType, actual: inferredType }), nodeId: node.id, field: 'valueType' });
        }
      }
    }

    if (node.data.kind === 'assign_state') {
      const target = normalizeIdentifier(config(node, 'target'), '');
      const expected = scalarStates.get(target);
      if (!target || !expected) {
        diagnostics.push({ code: 'state_target_missing', severity: 'error', message: translate('studio.graph.diagnostics.stateTargetMissing'), nodeId: node.id, field: 'target' });
      } else {
        const actual = expressionTypeForNode(document, node, config(node, 'value'));
        if (!areTypesCompatible(expected, actual)) {
          diagnostics.push({ code: 'state_value_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.stateValueTypeMismatch', { name: target, expected, actual }), nodeId: node.id, field: 'value' });
        }
      }
    }

    if (node.data.kind === 'map_write') {
      const target = normalizeIdentifier(config(node, 'target'), '');
      const expected = mapStates.get(target);
      if (!target || !expected) {
        diagnostics.push({ code: 'map_target_missing', severity: 'error', message: translate('studio.graph.diagnostics.mapTargetMissing'), nodeId: node.id, field: 'target' });
      } else {
        const keyType = expressionTypeForNode(document, node, config(node, 'key'));
        const valueType = expressionTypeForNode(document, node, config(node, 'value'));
        if (!areTypesCompatible(expected.keyType, keyType)) {
          diagnostics.push({ code: 'map_key_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.mapKeyTypeMismatch', { name: target, expected: expected.keyType, actual: keyType }), nodeId: node.id, field: 'key' });
        }
        if (!areTypesCompatible(expected.valueType, valueType)) {
          diagnostics.push({ code: 'map_value_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.mapValueTypeMismatch', { name: target, expected: expected.valueType, actual: valueType }), nodeId: node.id, field: 'value' });
        }
      }
    }

    if (node.data.kind === 'effect') {
      const effect = config(node, 'effect', 'info');
      const args = effectArgs(node);
      if (effect !== 'custom' && effect !== 'info' && args.length === 0) {
        diagnostics.push({ code: 'effect_missing_args', severity: 'error', message: translate('studio.graph.diagnostics.effectMissingArgs', { effect }), nodeId: node.id, field: 'args' });
      }
      if (effect === 'custom' && !config(node, 'statement')) {
        diagnostics.push({ code: 'effect_missing_statement', severity: 'error', message: translate('studio.graph.diagnostics.effectMissingStatement'), nodeId: node.id, field: 'statement' });
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
        diagnostics.push({ code: 'effect_arg_count_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.effectArgCountMismatch', { effect, count: expected.length }), nodeId: node.id, field: 'args' });
      }
      for (const [index, expectedType] of expected.entries()) {
        const actualType = args[index] ? expressionTypeForNode(document, node, args[index]!) : 'unknown';
        if (!areTypesCompatible(expectedType, actualType)) {
          diagnostics.push({ code: 'effect_arg_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.effectArgTypeMismatch', { effect, index: index + 1, expected: expectedType, actual: actualType }), nodeId: node.id, field: 'args' });
        }
      }
    }

    if (node.data.kind === 'return') {
      const expected = expectedReturnTypeForNode(document, node.id);
      const value = config(node, 'value');
      if (expected === 'void' && value) {
        diagnostics.push({ code: 'return_void_value', severity: 'error', message: translate('studio.graph.diagnostics.returnVoidValue'), nodeId: node.id, field: 'value' });
      } else if (expected !== 'void' && !value) {
        diagnostics.push({ code: 'return_missing_value', severity: 'error', message: translate('studio.graph.diagnostics.returnMissingValue', { expected }), nodeId: node.id, field: 'value' });
      } else if (expected !== 'void') {
        const actual = expressionTypeForNode(document, node, value);
        if (!areTypesCompatible(expected, actual)) {
          diagnostics.push({ code: 'return_type_mismatch', severity: 'error', message: translate('studio.graph.diagnostics.returnTypeMismatch', { expected, actual }), nodeId: node.id, field: 'value' });
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
