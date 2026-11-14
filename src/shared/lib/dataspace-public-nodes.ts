import { normalizeToriiBaseUrl } from '@/shared/api';

export type DataspacePublicNodeSource = 'manual';

export interface DataspacePublicNodeEntry {
  label: string;
  url: string;
  source: DataspacePublicNodeSource;
}

interface DataspacePublicNodesStore {
  version: 1;
  items: Record<string, DataspacePublicNodeEntry[]>;
}

export interface DataspacePublicNodesScope {
  registryNode: string;
  laneId: string | number;
  dataspaceId: string | number;
}

const STORAGE_KEY = 'iroha.dataspace.public-nodes.v2';
const STORE_VERSION = 1;

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
  const registry = normalizeToriiBaseUrl(scope.registryNode);
  if (!registry) throw new Error('Dataspace registry node must be an exact absolute Torii base URL');
  const laneId = String(scope.laneId).trim();
  const dataspaceId = String(scope.dataspaceId).trim();
  return `${registry}|${laneId}|${dataspaceId}`;
}

function sanitizeEntry(input: Pick<DataspacePublicNodeEntry, 'label' | 'url'>): DataspacePublicNodeEntry | null {
  const normalizedUrl = normalizeToriiBaseUrl(input.url);
  if (!normalizedUrl) return null;

  const trimmedLabel = input.label.trim();
  return {
    label: trimmedLabel.length > 0 ? trimmedLabel : normalizedUrl,
    url: normalizedUrl,
    source: 'manual',
  };
}

export function listDataspacePublicNodes(scope: DataspacePublicNodesScope): DataspacePublicNodeEntry[] {
  const store = readStore();
  const key = normalizeScope(scope);
  const entries = store.items[key] ?? [];

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
  const next =
    existingIndex >= 0
      ? current.map((entry, index) => (index === existingIndex ? sanitized : entry))
      : [...current, sanitized];

  store.items[key] = next;
  writeStore(store);
  return next;
}

export function removeDataspacePublicNode(
  scope: DataspacePublicNodesScope,
  rawUrl: string
): DataspacePublicNodeEntry[] {
  const normalizedUrl = normalizeToriiBaseUrl(rawUrl);
  const store = readStore();
  const key = normalizeScope(scope);
  const current = listDataspacePublicNodes(scope);
  const next = normalizedUrl ? current.filter((entry) => entry.url !== normalizedUrl) : current;
  store.items[key] = next;
  writeStore(store);
  return next;
}
