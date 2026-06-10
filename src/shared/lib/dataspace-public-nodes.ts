import { normalizeToriiBaseUrl } from '@/shared/api';

export type DataspacePublicNodeSource = 'manual';

export interface DataspacePublicNodeEntry {
  label: string
  url: string
  source: DataspacePublicNodeSource
}

interface DataspacePublicNodesStore {
  version: 1
  items: Record<string, DataspacePublicNodeEntry[]>
}

export interface DataspacePublicNodesScope {
  registryNode: string
  laneId: string | number
  dataspaceId: string | number
}

const STORAGE_KEY = 'iroha.dataspace.public-nodes.v2';
const STORE_VERSION = 1;

const TEST_ENV_REGISTRIES = [
  'https://torii.soramitsu.io',
  'https://torii-sbp.soramitsu.io',
  'https://torii-aed.soramitsu.io',
] as const;

const TEST_ENV_CUSTOM_DATASPACE_IDS = ['10', '11', '12'] as const;

const TEST_ENV_DEFAULT_NODE_INPUTS: Array<Pick<DataspacePublicNodeEntry, 'label' | 'url'>> = [
  { label: 'SBP private Torii', url: 'https://torii-sbp.soramitsu.io' },
  { label: 'CBUAE private Torii', url: 'https://torii-aed.soramitsu.io' },
];

const DEFAULT_PUBLIC_NODES_BY_SCOPE: Record<string, Array<Pick<DataspacePublicNodeEntry, 'label' | 'url'>>> = (() => {
  const entries: Record<string, Array<Pick<DataspacePublicNodeEntry, 'label' | 'url'>>> = {};

  for (const registryNode of TEST_ENV_REGISTRIES) {
    for (const dataspaceId of TEST_ENV_CUSTOM_DATASPACE_IDS) {
      entries[`${registryNode}|0|${dataspaceId}`] = TEST_ENV_DEFAULT_NODE_INPUTS;
    }
  }

  return entries;
})();

function readStore(): DataspacePublicNodesStore {
  if (typeof window === 'undefined') {
    return { version: STORE_VERSION, items: {} };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: STORE_VERSION, items: {} };
    const parsed = JSON.parse(raw) as Partial<DataspacePublicNodesStore>;
    if (parsed.version !== STORE_VERSION || !parsed.items || typeof parsed.items !== 'object') {
      return { version: STORE_VERSION, items: {} };
    }
    return {
      version: STORE_VERSION,
      items: parsed.items,
    };
  } catch {
    return { version: STORE_VERSION, items: {} };
  }
}

function writeStore(store: DataspacePublicNodesStore) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

function normalizeScope(scope: DataspacePublicNodesScope): string {
  const registry = normalizeToriiBaseUrl(scope.registryNode, null) ?? scope.registryNode.trim();
  const laneId = String(scope.laneId).trim();
  const dataspaceId = String(scope.dataspaceId).trim();
  return `${registry}|${laneId}|${dataspaceId}`;
}

function sanitizeEntry(input: Pick<DataspacePublicNodeEntry, 'label' | 'url'>): DataspacePublicNodeEntry | null {
  const normalizedUrl = normalizeToriiBaseUrl(input.url, null);
  if (!normalizedUrl) return null;

  const trimmedLabel = input.label.trim();
  return {
    label: trimmedLabel.length > 0 ? trimmedLabel : normalizedUrl,
    url: normalizedUrl,
    source: 'manual',
  };
}

function defaultEntriesForScope(scope: DataspacePublicNodesScope): DataspacePublicNodeEntry[] {
  const key = normalizeScope(scope);
  const defaults = DEFAULT_PUBLIC_NODES_BY_SCOPE[key] ?? [];
  return defaults
    .map((entry) => sanitizeEntry(entry))
    .filter((entry): entry is DataspacePublicNodeEntry => entry !== null);
}

export function listDataspacePublicNodes(scope: DataspacePublicNodesScope): DataspacePublicNodeEntry[] {
  const store = readStore();
  const key = normalizeScope(scope);
  const hasStoredEntries = Object.prototype.hasOwnProperty.call(store.items, key);
  const entries = hasStoredEntries ? store.items[key] ?? [] : defaultEntriesForScope(scope);

  return entries
    .map((entry) => sanitizeEntry(entry))
    .filter((entry): entry is DataspacePublicNodeEntry => entry !== null);
}

export function upsertDataspacePublicNode(
  scope: DataspacePublicNodesScope,
  input: Pick<DataspacePublicNodeEntry, 'label' | 'url'>
): DataspacePublicNodeEntry[] {
  const sanitized = sanitizeEntry(input);
  if (!sanitized) return listDataspacePublicNodes(scope);

  const store = readStore();
  const key = normalizeScope(scope);
  const current = listDataspacePublicNodes(scope);
  const existingIndex = current.findIndex((entry) => entry.url === sanitized.url);
  const next = existingIndex >= 0
    ? current.map((entry, index) => (index === existingIndex ? sanitized : entry))
    : [...current, sanitized];

  store.items[key] = next;
  writeStore(store);
  return next;
}

export function removeDataspacePublicNode(scope: DataspacePublicNodesScope, rawUrl: string): DataspacePublicNodeEntry[] {
  const normalizedUrl = normalizeToriiBaseUrl(rawUrl, null);
  const store = readStore();
  const key = normalizeScope(scope);
  const current = listDataspacePublicNodes(scope);
  const next = normalizedUrl ? current.filter((entry) => entry.url !== normalizedUrl) : current;
  store.items[key] = next;
  writeStore(store);
  return next;
}
