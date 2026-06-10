<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as http from '@/shared/api';
import type { Instruction, TransactionStatus } from '@/shared/api/schemas';
import { formatTransactionRejectionReason } from '@/shared/api/rejection-reason';
import { normalizeLooseAccountLiteral } from '@/shared/lib/account-literal';
import { useNotifications } from '@/shared/ui/composables/notifications';
import TraceGraphWebGL from '@/shared/ui/components/TraceGraphWebGL.vue';
import {
  buildTraceCsv,
  buildTraceLayout,
  computeRiskSignals,
  findShortestPath,
  instructionToTraceEvents,
  parseTraceBundle,
  stringifyTraceBundle,
  type ManualLabel,
  type TraceBundle,
  type TraceCursor,
  type TraceEdge,
  type TraceEvent,
  type TraceNode,
  type TraceSeed,
} from '@/shared/lib/tracing';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

const route = useRoute();
const navigation = useScopedExplorerNavigation();
const { t } = useI18n();
const notifications = useNotifications();

const SCAN_PAGE_SIZE = 200;

interface GraphNodeContextPayload {
  nodeId: string | null
  x: number
  y: number
  width: number
  height: number
}

interface DirectionalFlow {
  edgeId: string
  accountId: string
  count: number
  latestSeenMs: number
  variants: string[]
}

type TraceStatusFilter = 'all' | TransactionStatus;

interface TraceTransactionState {
  hash: string
  status: TransactionStatus
  authority: string
  latestBlock: number
  firstSeenMs: number
  latestSeenMs: number
  instructionCount: number
  eventCount: number
  participants: string[]
  variants: string[]
  assetIds: string[]
}

interface RejectionReasonGroup {
  reason: string
  count: number
  hashes: string[]
  authorities: string[]
}

const nodesMap = reactive(new Map<string, TraceNode>());
const edgesMap = reactive(new Map<string, TraceEdge>());
const eventsMap = reactive(new Map<string, TraceEvent>());
const allEventsMap = reactive(new Map<string, TraceEvent>());
const transactionStatesMap = reactive(new Map<string, TraceTransactionState>());
const rejectionReasonByHash = reactive(new Map<string, string>());
const cursors = ref<TraceCursor[]>([]);
const manualLabels = reactive<Record<string, ManualLabel>>({});
const queuedAccountIds = new Set<string>();
const completedAccountIds = new Set<string>();
const seenInstructionKeys = new Set<string>();
const rejectionReasonLookupsInFlight = new Set<string>();
const expandedNodeIds = reactive(new Set<string>());
const rootAccountId = ref<string | null>(null);

const nodes = ref<TraceNode[]>([]);
const edges = ref<TraceEdge[]>([]);
const events = ref<TraceEvent[]>([]);

const seedDraft = reactive({
  type: 'account' as 'account' | 'transaction',
  value: '',
});

const state = reactive({
  loadingSeed: false,
  running: false,
  paused: true,
  initialized: false,
  latestBlock: 0,
  requests: 0,
  scannedInstructions: 0,
  discoveredEvents: 0,
  error: '',
});

const workspaceTab = ref<'graph' | 'import'>('graph');
const selectedNodeId = ref<string | null>(null);
const graphViewportResetNonce = ref(0);
const graphNodeMenu = reactive({
  open: false,
  left: 0,
  top: 0,
});
const pathStart = ref('');
const pathEnd = ref('');
const pathResult = ref<string[] | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const transactionStatusFilter = ref<TraceStatusFilter>('all');
const transactionHashFilter = ref('');
const rejectedReasonLookupError = ref('');
const rejectedReasonLookupCount = ref(0);

const labelsStorageKey = computed(() => `trace_labels_v2:${encodeURIComponent(http.getToriiBaseUrl())}`);
const activeSeed = computed<TraceSeed | null>(() => {
  const rawType = route.query.seed_type;
  const rawValue = route.query.seed_value;
  if (typeof rawType !== 'string' || typeof rawValue !== 'string') return null;
  if (rawType !== 'account' && rawType !== 'transaction') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const normalizedValue = rawType === 'account' ? normalizeLooseAccountLiteral(trimmed) : trimmed;
  if (!normalizedValue) return null;

  return {
    type: rawType,
    value: normalizedValue,
  };
});

const rankedNodes = computed(() =>
  [...nodes.value].sort(
    (left, right) =>
      right.risk.score - left.risk.score ||
      right.eventCount - left.eventCount ||
      left.id.localeCompare(right.id)
  )
);
const recentEvents = computed(() =>
  [...allEventsMap.values()].sort((left, right) => right.createdAtMs - left.createdAtMs || left.id.localeCompare(right.id))
);
const layout = computed(() => buildTraceLayout(nodes.value));
const nodeProminenceById = computed(() => {
  const ranked = rankedNodes.value;
  const out = new Map<string, number>();
  const rankedWindow = Math.min(60, ranked.length);

  for (let index = 0; index < ranked.length; index += 1) {
    const node = ranked[index];
    const rankWeight = rankedWindow <= 1 || index >= rankedWindow
      ? 0
      : 1 - index / (rankedWindow - 1);
    const activityWeight = Math.min(1, Math.log10(node.eventCount + 1) / 3);
    const riskWeight = Math.min(1, node.risk.score / 100);
    const prominence = Math.max(0.08, rankWeight * 0.75 + activityWeight * 0.15 + riskWeight * 0.1);
    out.set(node.id, prominence);
  }

  return out;
});

const renderNodes = computed(() =>
  nodes.value.map((node) => {
    const position = layout.value[node.id] ?? { x: 0, y: 0 };
    return {
      id: node.id,
      x: position.x,
      y: position.y,
      riskScore: node.risk.score,
      prominence: nodeProminenceById.value.get(node.id) ?? 0.08,
    };
  })
);

const renderEdges = computed(() =>
  edges.value
    .map((edge) => {
      const source = layout.value[edge.source];
      const target = layout.value[edge.target];
      if (!source || !target) return null;
      const selected = selectedNodeId.value;
      const flow: 'incoming' | 'outgoing' | 'neutral' = !selected
        ? 'neutral'
        : edge.source === selected
          ? 'outgoing'
          : edge.target === selected
            ? 'incoming'
            : 'neutral';
      return {
        id: edge.id,
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        flow,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)
);

const selectedNode = computed(() => (selectedNodeId.value ? nodesMap.get(selectedNodeId.value) ?? null : null));
const selectedNodeLabel = computed(() =>
  selectedNodeId.value ? manualLabels[selectedNodeId.value] ?? { tag: '', risky: false } : { tag: '', risky: false }
);
const selectedNodeIsExpanded = computed(() =>
  selectedNodeId.value ? expandedNodeIds.has(selectedNodeId.value) : false
);
const selectedNodeExpandActionLabel = computed(() => {
  if (!selectedNodeId.value) return 'Expand';
  if (rootAccountId.value === selectedNodeId.value) return selectedNodeIsExpanded.value ? 'Expanded' : 'Expand';
  return selectedNodeIsExpanded.value ? 'Collapse' : 'Expand';
});
const controlsLocked = computed(() => state.loadingSeed);
const selectedNodeExpandDisabled = computed(
  () =>
    !selectedNodeId.value ||
    controlsLocked.value ||
    (rootAccountId.value === selectedNodeId.value && selectedNodeIsExpanded.value)
);
const normalizedTransactionHashFilter = computed(() => transactionHashFilter.value.trim().toLowerCase());
const transactionStatusFilterOptions = computed(() => [
  { label: t('transactions.all'), value: 'all' as const },
  { label: t('transactions.committed'), value: 'Committed' as const },
  { label: t('transactions.rejected'), value: 'Rejected' as const },
]);
const filteredTransactionStates = computed(() =>
  [...transactionStatesMap.values()]
    .filter((transaction) => {
      if (transactionStatusFilter.value !== 'all' && transaction.status !== transactionStatusFilter.value) return false;
      if (
        normalizedTransactionHashFilter.value
        && !transaction.hash.toLowerCase().includes(normalizedTransactionHashFilter.value)
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        right.latestSeenMs - left.latestSeenMs ||
        right.latestBlock - left.latestBlock ||
        left.hash.localeCompare(right.hash)
    )
);
const displayEvents = computed(() =>
  recentEvents.value
    .filter((event) => {
      if (transactionStatusFilter.value !== 'all' && event.transactionStatus !== transactionStatusFilter.value) return false;
      if (normalizedTransactionHashFilter.value && !event.transactionHash.toLowerCase().includes(normalizedTransactionHashFilter.value)) {
        return false;
      }
      return true;
    })
    .slice(0, 300)
);
const rejectedReasonLookupInProgress = computed(() => rejectedReasonLookupCount.value > 0);
const rejectedReasonGroups = computed<RejectionReasonGroup[]>(() => {
  const groups = new Map<string, RejectionReasonGroup>();
  const rejectedTransactions = Array.from(transactionStatesMap.values()).filter((transaction) => transaction.status === 'Rejected');

  for (const transaction of rejectedTransactions) {
    const reason = rejectionReasonByHash.get(transaction.hash) ?? 'Unavailable';
    const existing = groups.get(reason);
    if (existing) {
      existing.count += 1;
      pushUniqueValue(existing.hashes, transaction.hash);
      pushUniqueValue(existing.authorities, transaction.authority);
      continue;
    }
    groups.set(reason, {
      reason,
      count: 1,
      hashes: [transaction.hash],
      authorities: transaction.authority ? [transaction.authority] : [],
    });
  }

  return Array.from(groups.values()).sort(
    (left, right) => right.count - left.count || left.reason.localeCompare(right.reason)
  );
});

const WORKSPACE_TABS = [
  { i18nKey: 'tracing.graphTab', value: 'graph' },
  { i18nKey: 'tracing.importTab', value: 'import' },
];

function refreshGraphSnapshots() {
  const usesExpansionFilter = expandedNodeIds.size > 0;
  if (!usesExpansionFilter) {
    nodes.value = Array.from(nodesMap.values());
    edges.value = Array.from(edgesMap.values());
    events.value = Array.from(eventsMap.values());
    return;
  }

  const visibleNodeIds = new Set<string>(expandedNodeIds);
  const visibleEdges: TraceEdge[] = [];

  for (const edge of edgesMap.values()) {
    if (!expandedNodeIds.has(edge.source) && !expandedNodeIds.has(edge.target)) continue;
    visibleEdges.push(edge);
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  nodes.value = Array.from(nodesMap.values()).filter((node) => visibleNodeIds.has(node.id));
  edges.value = visibleEdges;
  events.value = Array.from(eventsMap.values()).filter(
    (event) => expandedNodeIds.has(event.source) || expandedNodeIds.has(event.target)
  );
}

function collectDirectionalFlows(nodeId: string | null, direction: 'incoming' | 'outgoing'): DirectionalFlow[] {
  if (!nodeId) return [];

  const matches = Array.from(edgesMap.values())
    .filter((edge) => (direction === 'incoming' ? edge.target === nodeId : edge.source === nodeId))
    .map((edge) => ({
      edgeId: edge.id,
      accountId: direction === 'incoming' ? edge.source : edge.target,
      count: edge.count,
      latestSeenMs: edge.latestSeenMs,
      variants: edge.variants,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.latestSeenMs - left.latestSeenMs ||
        left.accountId.localeCompare(right.accountId)
    );

  return matches.slice(0, 12);
}

const selectedNodeIncomingFlows = computed(() => collectDirectionalFlows(selectedNodeId.value, 'incoming'));
const selectedNodeOutgoingFlows = computed(() => collectDirectionalFlows(selectedNodeId.value, 'outgoing'));

function clampNodeMenuPosition(anchor: GraphNodeContextPayload): { left: number, top: number } {
  const menuWidth = 330;
  const menuHeight = 260;
  const padding = 8;
  const maxLeft = Math.max(padding, anchor.width - menuWidth - padding);
  const maxTop = Math.max(padding, anchor.height - menuHeight - padding);

  const left = Math.min(maxLeft, Math.max(padding, anchor.x - menuWidth / 2));
  const preferredTop = anchor.y - menuHeight - 12;
  const fallbackTop = anchor.y + 12;
  const top = preferredTop >= padding ? preferredTop : Math.min(maxTop, Math.max(padding, fallbackTop));

  return { left, top };
}

function hideGraphNodeMenu() {
  graphNodeMenu.open = false;
}

function showGraphNodeMenu(anchor: GraphNodeContextPayload) {
  if (!anchor.nodeId) {
    hideGraphNodeMenu();
    return;
  }
  const { left, top } = clampNodeMenuPosition(anchor);
  graphNodeMenu.left = left;
  graphNodeMenu.top = top;
  graphNodeMenu.open = true;
}

function loadLabelsFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(labelsStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, ManualLabel>;
    for (const [accountId, label] of Object.entries(parsed)) {
      if (!label || typeof label.tag !== 'string' || typeof label.risky !== 'boolean') continue;
      manualLabels[accountId] = { tag: label.tag, risky: label.risky };
    }
  } catch {
    // ignore malformed local values
  }
}

function saveLabelsToStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(labelsStorageKey.value, JSON.stringify(manualLabels));
  } catch {
    // ignore storage failures
  }
}

function pushUniqueValue(target: string[], value: string | null | undefined) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function upsertTransactionStateFromInstruction(instruction: Instruction, traceEvents: readonly TraceEvent[]) {
  const instructionKey = `${instruction.transaction_hash}:${instruction.index}`;
  if (seenInstructionKeys.has(instructionKey)) return;
  seenInstructionKeys.add(instructionKey);

  const existing = transactionStatesMap.get(instruction.transaction_hash);
  if (existing) {
    if (instruction.transaction_status === 'Rejected') existing.status = 'Rejected';
    existing.latestBlock = Math.max(existing.latestBlock, instruction.block);
    existing.latestSeenMs = Math.max(existing.latestSeenMs, instruction.created_at.getTime());
    existing.firstSeenMs = Math.min(existing.firstSeenMs, instruction.created_at.getTime());
    existing.instructionCount += 1;
    existing.eventCount += traceEvents.length;
    pushUniqueValue(existing.variants, instruction.kind);
    for (const event of traceEvents) {
      pushUniqueValue(existing.participants, event.source);
      pushUniqueValue(existing.participants, event.target);
      pushUniqueValue(existing.variants, event.variant);
      pushUniqueValue(existing.assetIds, event.assetId ?? null);
    }
    return;
  }

  const created: TraceTransactionState = {
    hash: instruction.transaction_hash,
    status: instruction.transaction_status,
    authority: instruction.authority,
    latestBlock: instruction.block,
    firstSeenMs: instruction.created_at.getTime(),
    latestSeenMs: instruction.created_at.getTime(),
    instructionCount: 1,
    eventCount: traceEvents.length,
    participants: [],
    variants: [instruction.kind],
    assetIds: [],
  };
  for (const event of traceEvents) {
    pushUniqueValue(created.participants, event.source);
    pushUniqueValue(created.participants, event.target);
    pushUniqueValue(created.variants, event.variant);
    pushUniqueValue(created.assetIds, event.assetId ?? null);
  }
  transactionStatesMap.set(created.hash, created);
}

function rebuildTransactionStatesFromEvents(eventsToLoad: readonly TraceEvent[]) {
  transactionStatesMap.clear();
  seenInstructionKeys.clear();

  for (const event of eventsToLoad) {
    const instructionKey = `${event.transactionHash}:${event.instructionIndex}`;
    const existing = transactionStatesMap.get(event.transactionHash);
    if (existing) {
      if (event.transactionStatus === 'Rejected') existing.status = 'Rejected';
      existing.latestBlock = Math.max(existing.latestBlock, event.block);
      existing.latestSeenMs = Math.max(existing.latestSeenMs, event.createdAtMs);
      existing.firstSeenMs = Math.min(existing.firstSeenMs, event.createdAtMs);
      if (!seenInstructionKeys.has(instructionKey)) {
        seenInstructionKeys.add(instructionKey);
        existing.instructionCount += 1;
      }
      existing.eventCount += 1;
      pushUniqueValue(existing.participants, event.source);
      pushUniqueValue(existing.participants, event.target);
      pushUniqueValue(existing.variants, event.variant);
      pushUniqueValue(existing.assetIds, event.assetId ?? null);
      continue;
    }

    transactionStatesMap.set(event.transactionHash, {
      hash: event.transactionHash,
      status: event.transactionStatus,
      authority: event.authority,
      latestBlock: event.block,
      firstSeenMs: event.createdAtMs,
      latestSeenMs: event.createdAtMs,
      instructionCount: 1,
      eventCount: 1,
      participants: [event.source, event.target],
      variants: [event.variant],
      assetIds: event.assetId ? [event.assetId] : [],
    });
    seenInstructionKeys.add(instructionKey);
  }
}

function hasOpaqueRejectionTag(message: string): boolean {
  return /(?:InstructionExecutionError|ValidationFail|FindError|TransactionRejectionReason)\(\d+\)/.test(message);
}

function decodeTransactionRejectionReason(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Unavailable';
  const reason = value as { message?: unknown, encoded?: unknown, json?: unknown };
  const toriiMessage = typeof reason.message === 'string' ? reason.message.trim() : '';
  const encoded = typeof reason.encoded === 'string' ? reason.encoded : '';
  const decodedFallback = formatTransactionRejectionReason({ encoded, json: reason.json ?? null }).trim();

  if (toriiMessage.length > 0 && !hasOpaqueRejectionTag(toriiMessage)) return toriiMessage;
  if (decodedFallback.length > 0) return decodedFallback;
  if (toriiMessage.length > 0) return toriiMessage;
  return 'Unavailable';
}

async function hydrateRejectedReasons() {
  const rejectedHashes = Array.from(transactionStatesMap.values())
    .filter((transaction) => transaction.status === 'Rejected')
    .map((transaction) => transaction.hash);

  if (rejectedHashes.length === 0) return;

  await Promise.all(
    rejectedHashes.map(async (hash) => {
      if (rejectionReasonByHash.has(hash) || rejectionReasonLookupsInFlight.has(hash)) return;
      rejectionReasonLookupsInFlight.add(hash);
      rejectedReasonLookupCount.value += 1;
      try {
        const response = await http.fetchTransaction(hash);
        if (response.status !== SUCCESSFUL_FETCHING) {
          rejectionReasonByHash.set(hash, 'Unavailable');
          rejectedReasonLookupError.value = 'Some rejection details are unavailable.';
          return;
        }
        const reason = decodeTransactionRejectionReason(response.data.rejection_reason);
        rejectionReasonByHash.set(hash, reason);
      } catch {
        rejectionReasonByHash.set(hash, 'Unavailable');
        rejectedReasonLookupError.value = 'Some rejection details are unavailable.';
      } finally {
        rejectionReasonLookupsInFlight.delete(hash);
        rejectedReasonLookupCount.value = Math.max(0, rejectedReasonLookupCount.value - 1);
      }
    })
  );
}

function reportTracingAsyncError(message: string, error: unknown) {
  console.error(message, error);
  state.error = t('tracing.fetchError');
  state.paused = true;
  state.running = false;
  notifications.error(t('tracing.fetchError'));
}

function triggerHydrateRejectedReasons() {
  hydrateRejectedReasons().catch((error) => {
    console.error('[TracingWorkspace] Failed to hydrate rejection reasons', error);
    rejectedReasonLookupError.value = 'Some rejection details are unavailable.';
  });
}

function resetGraphState() {
  nodesMap.clear();
  edgesMap.clear();
  eventsMap.clear();
  allEventsMap.clear();
  transactionStatesMap.clear();
  rejectionReasonByHash.clear();
  cursors.value = [];
  queuedAccountIds.clear();
  completedAccountIds.clear();
  seenInstructionKeys.clear();
  rejectionReasonLookupsInFlight.clear();
  expandedNodeIds.clear();
  rootAccountId.value = null;
  nodes.value = [];
  edges.value = [];
  events.value = [];
  selectedNodeId.value = null;
  hideGraphNodeMenu();
  pathResult.value = null;
  state.requests = 0;
  state.scannedInstructions = 0;
  state.discoveredEvents = 0;
  transactionStatusFilter.value = 'all';
  transactionHashFilter.value = '';
  rejectedReasonLookupError.value = '';
  rejectedReasonLookupCount.value = 0;
  state.error = '';
}

function upsertNode(accountId: string, depth: number, seenAtMs: number): TraceNode {
  const existing = nodesMap.get(accountId);
  if (existing) {
    if (depth < existing.depth) existing.depth = depth;
    existing.firstSeenMs = existing.firstSeenMs === null ? seenAtMs : Math.min(existing.firstSeenMs, seenAtMs);
    if (existing.lastSeenMs !== null) {
      const gap = Math.abs(seenAtMs - existing.lastSeenMs);
      existing.minGapMs = existing.minGapMs === null ? gap : Math.min(existing.minGapMs, gap);
    }
    existing.lastSeenMs = seenAtMs;
    existing.eventCount += 1;
    existing.manualLabel = manualLabels[accountId] ?? null;
    existing.risk = computeRiskSignals(existing, existing.manualLabel);
    return existing;
  }

  const created: TraceNode = {
    id: accountId,
    depth,
    inDegree: 0,
    outDegree: 0,
    eventCount: 1,
    firstSeenMs: seenAtMs,
    lastSeenMs: seenAtMs,
    minGapMs: null,
    risk: { score: 0, flags: [] },
    manualLabel: manualLabels[accountId] ?? null,
  };
  created.risk = computeRiskSignals(created, created.manualLabel);
  nodesMap.set(accountId, created);
  return created;
}

function updateNodeRisk(accountId: string) {
  const node = nodesMap.get(accountId);
  if (!node) return;
  node.manualLabel = manualLabels[accountId] ?? null;
  node.risk = computeRiskSignals(node, node.manualLabel);
}

function markCursorCompleted(cursor: TraceCursor) {
  cursor.exhausted = true;
  queuedAccountIds.delete(cursor.accountId);
  completedAccountIds.add(cursor.accountId);
}

function syncCursorSetsFromState() {
  queuedAccountIds.clear();
  completedAccountIds.clear();
  for (const cursor of cursors.value) {
    if (cursor.exhausted) {
      completedAccountIds.add(cursor.accountId);
    } else {
      queuedAccountIds.add(cursor.accountId);
    }
  }
}

function enqueueAccount(accountId: string, depth: number) {
  const normalized = normalizeLooseAccountLiteral(accountId);
  if (!normalized) return;
  if (completedAccountIds.has(normalized)) return;
  const existing = cursors.value.find((cursor) => cursor.accountId === normalized);
  if (existing) {
    if (!existing.exhausted && depth < existing.depth) existing.depth = depth;
    return;
  }
  if (queuedAccountIds.has(normalized)) return;
  cursors.value.push({
    accountId: normalized,
    depth,
    block: Math.max(1, state.latestBlock),
    page: 1,
    exhausted: false,
  });
  queuedAccountIds.add(normalized);
}

function ingestTraceEvent(event: TraceEvent, depthHint: number, _scannedAccountId: string | null) {
  if (allEventsMap.has(event.id)) return;
  allEventsMap.set(event.id, event);
  if (event.transactionStatus !== 'Committed') return;
  if (eventsMap.has(event.id)) return;

  eventsMap.set(event.id, event);
  state.discoveredEvents += 1;

  const sourceNode = upsertNode(event.source, depthHint, event.createdAtMs);
  const targetNode = upsertNode(event.target, depthHint + 1, event.createdAtMs);
  sourceNode.outDegree += 1;
  targetNode.inDegree += 1;
  updateNodeRisk(sourceNode.id);
  updateNodeRisk(targetNode.id);

  const edgeId = `${event.source}->${event.target}`;
  const existingEdge = edgesMap.get(edgeId);
  if (existingEdge) {
    existingEdge.count += 1;
    if (event.assetId) {
      if (!existingEdge.assetIds.includes(event.assetId)) existingEdge.assetIds.push(event.assetId);
    }
    if (!existingEdge.variants.includes(event.variant)) existingEdge.variants.push(event.variant);
    existingEdge.latestSeenMs = Math.max(existingEdge.latestSeenMs, event.createdAtMs);
  } else {
    edgesMap.set(edgeId, {
      id: edgeId,
      source: event.source,
      target: event.target,
      count: 1,
      variants: [event.variant],
      assetIds: event.assetId ? [event.assetId] : [],
      latestSeenMs: event.createdAtMs,
    });
  }

}

async function fetchLatestBlockHeight() {
  const blocks = await http.fetchBlocks({ page: 1, per_page: 1 });
  if (blocks.status !== SUCCESSFUL_FETCHING) return 0;
  const latest = blocks.data.items[0];
  return latest?.height ?? 0;
}

async function ingestTransactionSeed(seedHash: string) {
  const txResponse = await http.fetchTransaction(seedHash);
  if (txResponse.status === SUCCESSFUL_FETCHING) {
    enqueueAccount(txResponse.data.authority, 0);
  }

  let page = 1;
  let totalPages = 1;
  do {
    const response = await http.fetchInstructions({
      page,
      per_page: SCAN_PAGE_SIZE,
      transaction_hash: seedHash,
      kind: 'Transfer',
    });
    if (response.status !== SUCCESSFUL_FETCHING) break;
    totalPages = response.data.pagination.total_pages;
    for (const instruction of response.data.items) {
      const traceEvents = instructionToTraceEvents(instruction);
      upsertTransactionStateFromInstruction(instruction, traceEvents);
      for (const event of traceEvents) ingestTraceEvent(event, 0, null);
    }
    await hydrateRejectedReasons();
    refreshGraphSnapshots();
    page += 1;
  } while (page <= totalPages);
}

async function bootstrapFromSeed(seed: TraceSeed) {
  state.loadingSeed = true;
  state.error = '';
  state.paused = true;
  state.running = false;
  resetGraphState();

  try {
    state.latestBlock = await fetchLatestBlockHeight();
    if (state.latestBlock <= 0) {
      state.error = t('tracing.noBlocks');
      return;
    }

    if (seed.type === 'account') {
      const resolvedAccount = await http.fetchAccount(seed.value);
      const canonicalSeed = resolvedAccount.status === SUCCESSFUL_FETCHING
        ? resolvedAccount.data.i105_address
        : seed.value;
      rootAccountId.value = canonicalSeed;
      expandedNodeIds.add(canonicalSeed);
      enqueueAccount(canonicalSeed, 0);
      upsertNode(canonicalSeed, 0, Date.now());
      refreshGraphSnapshots();
    } else {
      await ingestTransactionSeed(seed.value);
      refreshGraphSnapshots();
    }

    state.paused = false;
    triggerScanLoop();
  } finally {
    state.initialized = true;
    state.loadingSeed = false;
  }
}

function waitForScanYield() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function scanCursor(cursor: TraceCursor): Promise<void> {
  if (cursor.exhausted || cursor.block < 1) {
    markCursorCompleted(cursor);
    return;
  }

  const response = await http.fetchInstructions({
    page: cursor.page,
    per_page: SCAN_PAGE_SIZE,
    account: cursor.accountId,
    block: cursor.block,
    kind: 'Transfer',
  });
  state.requests += 1;
  if (response.status !== SUCCESSFUL_FETCHING) {
    state.error = t('tracing.fetchError');
    state.paused = true;
    markCursorCompleted(cursor);
    return;
  }

  for (const instruction of response.data.items) {
    state.scannedInstructions += 1;
    const traceEvents = instructionToTraceEvents(instruction);
    upsertTransactionStateFromInstruction(instruction, traceEvents);
    for (const event of traceEvents) {
      ingestTraceEvent(event, cursor.depth, cursor.accountId);
    }
  }
  await hydrateRejectedReasons();
  refreshGraphSnapshots();

  if (cursor.page < response.data.pagination.total_pages) {
    cursor.page += 1;
  } else {
    cursor.page = 1;
    cursor.block -= 1;
  }

  if (cursor.block < 1) {
    markCursorCompleted(cursor);
  }
}

async function runScanLoop() {
  if (state.running || state.paused) return;
  state.running = true;
  while (!state.paused) {
    const cursor = cursors.value.find((item) => !item.exhausted);
    if (!cursor) break;
    await scanCursor(cursor);
    await waitForScanYield();
  }
  state.running = false;
}

function triggerScanLoop() {
  runScanLoop().catch((error) => {
    reportTracingAsyncError('[TracingWorkspace] Scan loop failed', error);
  });
}

function triggerBootstrapFromSeed(seed: TraceSeed) {
  bootstrapFromSeed(seed).catch((error) => {
    reportTracingAsyncError('[TracingWorkspace] Failed to bootstrap from seed', error);
  });
}

function toggleScan() {
  if (state.running) {
    state.paused = true;
    return;
  }
  state.paused = false;
  triggerScanLoop();
}

function clearTrace() {
  state.paused = true;
  state.running = false;
  resetGraphState();
}

function handleSelectNode(nodeId: string | null) {
  selectedNodeId.value = nodeId;
  if (!nodeId) hideGraphNodeMenu();
}

function handleGraphNodeContext(anchor: GraphNodeContextPayload) {
  selectedNodeId.value = anchor.nodeId;
  showGraphNodeMenu(anchor);
}

function handleGraphViewportInteraction() {
  hideGraphNodeMenu();
}

function resetGraphViewport() {
  graphViewportResetNonce.value += 1;
}

function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId;
  hideGraphNodeMenu();
}

function toggleSelectedNodeExpansion() {
  const nodeId = selectedNodeId.value;
  if (!nodeId) return;
  toggleNodeExpansion(nodeId);
}

function toggleNodeExpansion(nodeId: string) {
  const isRootNode = rootAccountId.value === nodeId;
  const isExpanded = expandedNodeIds.has(nodeId);

  if (isExpanded && !isRootNode) {
    expandedNodeIds.delete(nodeId);
    refreshGraphSnapshots();
    return;
  }

  if (!isExpanded) expandedNodeIds.add(nodeId);
  const depth = nodesMap.get(nodeId)?.depth ?? 0;
  enqueueAccount(nodeId, depth);
  refreshGraphSnapshots();
  state.paused = false;
  triggerScanLoop();
}

function openSeedFromDraft() {
  const value = seedDraft.value.trim();
  if (!value) return;
  const normalizedValue = seedDraft.type === 'account' ? normalizeLooseAccountLiteral(value) : value;
  if (!normalizedValue) {
    state.error = t('searchUnsupported');
    return;
  }
  state.error = '';
  navigation.replace({
    name: 'tracing-workspace',
    query: {
      seed_type: seedDraft.type,
      seed_value: normalizedValue,
    },
  }).catch(() => {});
}

function updateManualLabel(label: ManualLabel) {
  if (!selectedNodeId.value) return;
  manualLabels[selectedNodeId.value] = { ...label };
  updateNodeRisk(selectedNodeId.value);
  saveLabelsToStorage();
}

function clearManualLabel() {
  if (!selectedNodeId.value) return;
  delete manualLabels[selectedNodeId.value];
  updateNodeRisk(selectedNodeId.value);
  saveLabelsToStorage();
}

function runPathSearch() {
  pathResult.value = findShortestPath(pathStart.value.trim(), pathEnd.value.trim(), edges.value);
}

function formatParticipants(accounts: readonly string[]): string {
  if (accounts.length === 0) return '-';
  if (accounts.length <= 3) return accounts.join(', ');
  return `${accounts.slice(0, 3).join(', ')} +${accounts.length - 3}`;
}

function statusBadgeClass(status: TransactionStatus) {
  return status === 'Rejected'
    ? 'tracing-page__status-badge tracing-page__status-badge--rejected'
    : 'tracing-page__status-badge tracing-page__status-badge--committed';
}

function formatStatusLabel(status: TransactionStatus): string {
  return status === 'Rejected' ? t('transactions.rejected') : t('transactions.committed');
}

function focusTransaction(hash: string) {
  transactionHashFilter.value = hash;
}

function clearTransactionFilters() {
  transactionStatusFilter.value = 'all';
  transactionHashFilter.value = '';
}

function triggerBundleImport() {
  importInput.value?.click();
}

async function importBundleFromFile(file: File) {
  const text = await file.text();
  const raw = JSON.parse(text);
  const bundle = parseTraceBundle(raw);
  applyBundle(bundle);
}

function applyBundle(bundle: TraceBundle) {
  state.paused = true;
  state.running = false;
  resetGraphState();

  Object.keys(manualLabels).forEach((key) => {
    delete manualLabels[key];
  });
  for (const [accountId, label] of Object.entries(bundle.labels)) {
    manualLabels[accountId] = label;
  }
  saveLabelsToStorage();

  for (const node of bundle.graph.nodes) nodesMap.set(node.id, node);
  for (const edge of bundle.graph.edges) edgesMap.set(edge.id, edge);
  for (const event of bundle.graph.events) {
    eventsMap.set(event.id, event);
    allEventsMap.set(event.id, event);
  }
  rebuildTransactionStatesFromEvents(bundle.graph.events);
  triggerHydrateRejectedReasons();
  if (bundle.seed.type === 'account') {
    rootAccountId.value = bundle.seed.value;
    expandedNodeIds.add(bundle.seed.value);
  }
  cursors.value = bundle.cursors.map((cursor) => ({ ...cursor }));
  syncCursorSetsFromState();
  refreshGraphSnapshots();
  state.latestBlock = Math.max(1, ...cursors.value.map((cursor) => cursor.block), state.latestBlock);
  state.discoveredEvents = bundle.graph.events.length;

  seedDraft.type = bundle.seed.type;
  seedDraft.value = bundle.seed.value;
  navigation.replace({
    name: 'tracing-workspace',
    query: {
      seed_type: bundle.seed.type,
      seed_value: bundle.seed.value,
    },
  }).catch(() => {});

  state.paused = false;
  triggerScanLoop();
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBundle() {
  const allNodes = Array.from(nodesMap.values());
  const allEdges = Array.from(edgesMap.values());
  const allEvents = Array.from(eventsMap.values());
  const csv = buildTraceCsv(allNodes, allEdges, allEvents);
  const labelsSnapshot = Object.fromEntries(Object.entries(manualLabels));
  const seed = activeSeed.value ?? {
    type: seedDraft.type,
    value: seedDraft.value.trim() || 'unseeded',
  };

  const bundle: TraceBundle = {
    format: 'iroha-trace-bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    torii_base_url: http.getToriiBaseUrl(),
    seed,
    filters: {
      committed_only: true,
      transfer_variants: 'all',
    },
    graph: {
      nodes: allNodes,
      edges: allEdges,
      events: allEvents,
    },
    cursors: cursors.value.map((cursor) => ({ ...cursor })),
    labels: labelsSnapshot,
    csv,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadTextFile(`trace-bundle-${timestamp}.json`, stringifyTraceBundle(bundle), 'application/json;charset=utf-8');
  downloadTextFile(`trace-nodes-${timestamp}.csv`, csv.nodes, 'text/csv;charset=utf-8');
  downloadTextFile(`trace-edges-${timestamp}.csv`, csv.edges, 'text/csv;charset=utf-8');
  downloadTextFile(`trace-events-${timestamp}.csv`, csv.events, 'text/csv;charset=utf-8');
  notifications.success(t('tracing.bundleExported'));
}

async function onImportInputChanged(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;
  try {
    await importBundleFromFile(file);
    notifications.success(t('tracing.bundleImported'));
  } catch {
    notifications.error(t('tracing.importError'));
  } finally {
    if (target) target.value = '';
  }
}

function formatRelativeAge(timestampMs: number): string {
  const delta = Math.max(0, Date.now() - timestampMs);
  if (delta < 1_000) return 'now';
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

loadLabelsFromStorage();

watch(
  () => activeSeed.value,
  (seed, previousSeed) => {
    if (!seed) return;
    if (previousSeed && seed.type === previousSeed.type && seed.value === previousSeed.value) return;
    seedDraft.type = seed.type;
    seedDraft.value = seed.value;
    triggerBootstrapFromSeed(seed);
  },
  { immediate: true }
);
</script>

<template>
  <div class="tracing-page">
    <BaseContentBlock
      :title="$t('tracing.title')"
      class="tracing-page__block"
    >
      <template #header-action>
        <div class="tracing-page__actions">
          <BaseButton
            bordered
            :disabled="!state.initialized || controlsLocked"
            @click="toggleScan"
          >
            {{ state.running ? $t('tracing.pause') : $t('tracing.resume') }}
          </BaseButton>
          <BaseButton
            bordered
            :disabled="controlsLocked"
            @click="clearTrace"
          >
            {{ $t('tracing.clear') }}
          </BaseButton>
          <BaseButton
            bordered
            :disabled="controlsLocked || (nodes.length === 0 && events.length === 0)"
            @click="exportBundle"
          >
            {{ $t('tracing.exportBundle') }}
          </BaseButton>
          <BaseButton
            bordered
            @click="triggerBundleImport"
          >
            {{ $t('tracing.importBundle') }}
          </BaseButton>
          <input
            ref="importInput"
            class="tracing-page__hidden-input"
            type="file"
            accept="application/json"
            @change="onImportInputChanged"
          >
        </div>
      </template>

      <div class="tracing-page__seed">
        <select
          v-model="seedDraft.type"
          data-test="trace-seed-type"
        >
          <option value="account">
            {{ $t('tracing.seedAccount') }}
          </option>
          <option value="transaction">
            {{ $t('tracing.seedTransaction') }}
          </option>
        </select>
        <input
          v-model="seedDraft.value"
          :placeholder="$t('tracing.seedPlaceholder')"
          data-test="trace-seed-value"
          @keyup.enter="openSeedFromDraft"
        >
        <BaseButton
          bordered
          @click="openSeedFromDraft"
        >
          {{ $t('tracing.startTrace') }}
        </BaseButton>
      </div>

      <div class="tracing-page__status row-text-monospace">
        <span>{{ $t('tracing.latestBlock') }}: {{ state.latestBlock || '-' }}</span>
        <span>{{ $t('tracing.requests') }}: {{ state.requests }}</span>
        <span>{{ $t('tracing.instructionsScanned') }}: {{ state.scannedInstructions }}</span>
        <span>{{ $t('tracing.eventsDiscovered') }}: {{ state.discoveredEvents }}</span>
        <span>{{ $t('tracing.activeCursors') }}: {{ cursors.filter((item) => !item.exhausted).length }}</span>
      </div>

      <div
        v-if="state.loadingSeed"
        class="tracing-page__loading"
      >
        <BaseLoading />
      </div>

      <div
        v-if="state.error"
        class="tracing-page__error row-text"
      >
        {{ state.error }}
      </div>

      <BaseTabs
        v-model="workspaceTab"
        :items="WORKSPACE_TABS"
      />

      <div
        v-if="workspaceTab === 'graph'"
        class="tracing-page__workspace"
      >
        <div class="tracing-page__graph">
          <div class="tracing-page__graph-actions">
            <BaseButton
              bordered
              data-test="trace-reset-viewport"
              :disabled="controlsLocked || renderNodes.length === 0"
              @click="resetGraphViewport"
            >
              {{ $t('settings.reset') }}
            </BaseButton>
          </div>

          <div class="tracing-page__graph-canvas">
            <TraceGraphWebGL
              :nodes="renderNodes"
              :edges="renderEdges"
              :selected-node-id
              :viewport-reset-nonce="graphViewportResetNonce"
              @select-node="handleSelectNode"
              @node-context="handleGraphNodeContext"
              @viewport-interaction="handleGraphViewportInteraction"
            />

            <div
              v-if="graphNodeMenu.open && selectedNode"
              class="tracing-page__node-menu"
              data-test="trace-node-menu"
              :style="{
                left: `${graphNodeMenu.left}px`,
                top: `${graphNodeMenu.top}px`,
              }"
            >
              <div class="tracing-page__node-menu-header">
                <BaseHash
                  :hash="selectedNode.id"
                  type="short"
                  :link="`/accounts/${selectedNode.id}`"
                  copy
                />
                <BaseButton
                  bordered
                  data-test="trace-node-menu-expand"
                  :disabled="selectedNodeExpandDisabled"
                  @click="toggleSelectedNodeExpansion"
                >
                  {{ selectedNodeExpandActionLabel }}
                </BaseButton>
              </div>

              <div class="tracing-page__node-menu-flows">
                <section class="tracing-page__node-menu-group">
                  <span class="h-sm">Inflow</span>
                  <ul
                    v-if="selectedNodeIncomingFlows.length"
                    class="tracing-page__node-menu-list"
                    data-test="trace-node-menu-inflows"
                  >
                    <li
                      v-for="flow in selectedNodeIncomingFlows"
                      :key="flow.edgeId"
                      class="tracing-page__node-menu-item"
                    >
                      <button
                        type="button"
                        class="tracing-page__node-menu-link tracing-page__node-menu-link--incoming row-text-monospace"
                        @click="selectNode(flow.accountId)"
                      >
                        {{ flow.accountId }}
                      </button>
                      <span class="row-text-monospace">x{{ flow.count }}</span>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="row-text"
                  >
                    No inflows yet
                  </p>
                </section>

                <section class="tracing-page__node-menu-group">
                  <span class="h-sm">Outflow</span>
                  <ul
                    v-if="selectedNodeOutgoingFlows.length"
                    class="tracing-page__node-menu-list"
                    data-test="trace-node-menu-outflows"
                  >
                    <li
                      v-for="flow in selectedNodeOutgoingFlows"
                      :key="flow.edgeId"
                      class="tracing-page__node-menu-item"
                    >
                      <button
                        type="button"
                        class="tracing-page__node-menu-link tracing-page__node-menu-link--outgoing row-text-monospace"
                        @click="selectNode(flow.accountId)"
                      >
                        {{ flow.accountId }}
                      </button>
                      <span class="row-text-monospace">x{{ flow.count }}</span>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="row-text"
                  >
                    No outflows yet
                  </p>
                </section>
              </div>
            </div>
          </div>

          <div class="tracing-page__path">
            <span class="h-sm">{{ $t('tracing.shortestPath') }}</span>
            <div class="tracing-page__path-controls">
              <input
                v-model="pathStart"
                :placeholder="$t('tracing.pathStart')"
              >
              <input
                v-model="pathEnd"
                :placeholder="$t('tracing.pathEnd')"
              >
              <BaseButton
                bordered
                @click="runPathSearch"
              >
                {{ $t('tracing.findPath') }}
              </BaseButton>
            </div>
            <p
              v-if="pathResult"
              class="row-text-monospace"
            >
              {{ pathResult.join(' -> ') }}
            </p>
          </div>
        </div>

        <div class="tracing-page__panel">
          <div class="tracing-page__section">
            <span class="h-sm">{{ $t('tracing.selectedNode') }}</span>
            <div v-if="selectedNode">
              <BaseHash
                :hash="selectedNode.id"
                type="short"
                :link="`/accounts/${selectedNode.id}`"
                copy
              />
              <p class="row-text">
                {{ $t('tracing.riskScore') }}: {{ selectedNode.risk.score }}
              </p>
              <p class="row-text">
                {{ $t('tracing.riskFlags') }}: {{ selectedNode.risk.flags.join(', ') || '-' }}
              </p>
              <div class="tracing-page__label-editor">
                <input
                  :value="selectedNodeLabel.tag"
                  :placeholder="$t('tracing.labelTag')"
                  @input="(event) => updateManualLabel({ tag: (event.target as HTMLInputElement).value, risky: selectedNodeLabel.risky })"
                >
                <label class="row-text">
                  <input
                    type="checkbox"
                    :checked="selectedNodeLabel.risky"
                    @change="(event) => updateManualLabel({ tag: selectedNodeLabel.tag, risky: (event.target as HTMLInputElement).checked })"
                  >
                  {{ $t('tracing.labelRisky') }}
                </label>
                <BaseButton
                  bordered
                  @click="clearManualLabel"
                >
                  {{ $t('tracing.clearLabel') }}
                </BaseButton>
              </div>
            </div>
            <p
              v-else
              class="row-text"
            >
              {{ $t('tracing.noNodeSelected') }}
            </p>
          </div>

          <div class="tracing-page__section">
            <span class="h-sm">{{ $t('transactions.transactions') }}</span>
            <div class="tracing-page__transaction-filters">
              <select
                v-model="transactionStatusFilter"
                data-test="trace-status-filter"
              >
                <option
                  v-for="option in transactionStatusFilterOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <input
                v-model="transactionHashFilter"
                :placeholder="$t('transactions.transactionHash')"
                data-test="trace-hash-filter"
              >
              <BaseButton
                bordered
                :disabled="transactionStatusFilter === 'all' && transactionHashFilter.trim().length === 0"
                @click="clearTransactionFilters"
              >
                {{ $t('settings.reset') }}
              </BaseButton>
            </div>

            <ul
              v-if="filteredTransactionStates.length"
              class="tracing-page__list"
              data-test="trace-transaction-list"
            >
              <li
                v-for="transaction in filteredTransactionStates.slice(0, 200)"
                :key="transaction.hash"
                class="tracing-page__event-item tracing-page__transaction-item"
              >
                <div class="tracing-page__transaction-row">
                  <BaseHash
                    :hash="transaction.hash"
                    type="short"
                    :link="`/transactions/${transaction.hash}`"
                    copy
                  />
                  <span :class="statusBadgeClass(transaction.status)">
                    {{ formatStatusLabel(transaction.status) }}
                  </span>
                </div>
                <div class="row-text">
                  #{{ transaction.latestBlock }} · {{ formatRelativeAge(transaction.latestSeenMs) }}
                </div>
                <div class="row-text">
                  Instructions: {{ transaction.instructionCount }} · Events: {{ transaction.eventCount }}
                </div>
                <div class="row-text-monospace">
                  {{ formatParticipants(transaction.participants) }}
                </div>
                <div class="tracing-page__transaction-actions">
                  <button
                    type="button"
                    class="tracing-page__inline-link row-text"
                    data-test="trace-focus-transaction"
                    @click="focusTransaction(transaction.hash)"
                  >
                    {{ $t('transactions.transactionHash') }}
                  </button>
                </div>
              </li>
            </ul>
            <p
              v-else
              class="row-text"
            >
              No transactions match current filter.
            </p>
          </div>

          <div class="tracing-page__section">
            <span class="h-sm">{{ $t('transactions.rejectedReason') }}</span>
            <div
              v-if="rejectedReasonLookupInProgress"
              class="row-text"
            >
              Loading rejection details...
            </div>
            <div
              v-if="rejectedReasonLookupError"
              class="tracing-page__warning row-text"
            >
              {{ rejectedReasonLookupError }}
            </div>
            <ul
              v-if="rejectedReasonGroups.length"
              class="tracing-page__list"
              data-test="trace-rejection-groups"
            >
              <li
                v-for="group in rejectedReasonGroups"
                :key="group.reason"
                class="tracing-page__event-item tracing-page__rejection-group"
              >
                <p class="row-text">
                  {{ group.reason }}
                </p>
                <p class="row-text">
                  Transactions: {{ group.count }}
                </p>
                <p class="row-text-monospace">
                  Authorities: {{ formatParticipants(group.authorities) }}
                </p>
                <div class="tracing-page__hash-list">
                  <BaseHash
                    v-for="hash in group.hashes.slice(0, 8)"
                    :key="hash"
                    :hash
                    type="short"
                    :link="`/transactions/${hash}`"
                    copy
                  />
                </div>
              </li>
            </ul>
            <p
              v-else
              class="row-text"
            >
              No rejected transactions in current trace.
            </p>
          </div>

          <div class="tracing-page__section">
            <span class="h-sm">{{ $t('tracing.recentEvents') }}</span>
            <ul class="tracing-page__list">
              <li
                v-for="event in displayEvents"
                :key="event.id"
                class="tracing-page__event-item"
              >
                <div class="tracing-page__event-header">
                  <BaseHash
                    :hash="event.transactionHash"
                    type="short"
                    :link="`/transactions/${event.transactionHash}`"
                    copy
                  />
                  <span :class="statusBadgeClass(event.transactionStatus)">
                    {{ formatStatusLabel(event.transactionStatus) }}
                  </span>
                </div>
                <div class="row-text-monospace">
                  {{ event.source }} -> {{ event.target }}
                </div>
                <div class="row-text">
                  {{ event.variant }} · #{{ event.block }} · idx {{ event.instructionIndex }} · {{ formatRelativeAge(event.createdAtMs) }}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div
        v-else
        class="tracing-page__import"
      >
        <p class="row-text">
          {{ $t('tracing.importHint') }}
        </p>
        <BaseButton
          bordered
          @click="triggerBundleImport"
        >
          {{ $t('tracing.importBundle') }}
        </BaseButton>
      </div>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.tracing-page {
  display: flex;
  flex-direction: column;
  padding: 0 size(3) size(3);

  &__block {
    hr {
      display: none;
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
  }

  &__hidden-input {
    display: none;
  }

  &__seed {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    margin: size(2) size(4);

    select,
    input {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
      padding: size(1) size(1.5);
    }

    input {
      min-width: size(40);
      max-width: 100%;
      flex: 1;
    }
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    padding: 0 size(4) size(1.5);
  }

  &__loading {
    display: flex;
    justify-content: center;
    padding: size(2);
  }

  &__error {
    color: theme-color('error');
    padding: 0 size(4) size(2);
  }

  &__warning {
    color: theme-color('warning');
  }

  &__workspace {
    display: grid;
    gap: size(2);
    margin-top: size(2);

    @include xl {
      grid-template-columns: minmax(0, 2fr) minmax(size(42), 1fr);
    }
  }

  &__graph {
    display: flex;
    flex-direction: column;
    gap: size(2);
    min-width: 0;
  }

  &__graph-canvas {
    position: relative;
  }

  &__node-menu {
    position: absolute;
    z-index: 3;
    width: min(size(46), calc(100% - size(2)));
    border: 1px solid color-mix(in srgb, theme-color('primary') 48%, theme-color('border-primary'));
    border-radius: size(1.5);
    background: color-mix(in srgb, theme-color('surface') 90%, rgb(2 10 18 / 88%));
    backdrop-filter: blur(6px);
    box-shadow: 0 size(2) size(5) rgb(0 0 0 / 45%);
    padding: size(1.5);
    display: flex;
    flex-direction: column;
    gap: size(1.25);
  }

  &__node-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(1);
    flex-wrap: wrap;
  }

  &__node-menu-flows {
    display: grid;
    gap: size(1.25);

    @include md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__node-menu-group {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: size(0.75);
  }

  &__node-menu-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    max-height: size(16);
    overflow: auto;
  }

  &__node-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(0.75);
  }

  &__node-menu-link {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    background: transparent;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: size(0.5);
    max-width: 100%;
    min-width: 0;
    padding: size(0.5) size(0.75);
    text-align: left;
    transition: border-color 0.18s ease, transform 0.18s ease;

    &:hover {
      border-color: theme-color('primary');
      transform: translateX(size(0.25));
    }

    &::before {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: size(1.5);
      font-size: size(1.25);
      line-height: 1;
      opacity: 0.85;
    }

    &--incoming {
      border-color: rgb(44 159 214 / 52%);
      background: linear-gradient(90deg, rgb(44 159 214 / 20%), transparent 65%);

      &::before {
        content: '←';
      }
    }

    &--outgoing {
      border-color: rgb(230 132 54 / 52%);
      background: linear-gradient(90deg, rgb(230 132 54 / 20%), transparent 65%);

      &::before {
        content: '→';
      }
    }
  }

  &__graph-actions {
    display: flex;
    justify-content: flex-end;
  }

  &__path {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__path-controls {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);

    input {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
      padding: size(1);
      min-width: size(24);
      flex: 1;
    }
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: size(2);
    min-width: 0;
  }

  &__section {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1);
    min-width: 0;
  }

  &__transaction-filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);

    select,
    input {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
      padding: size(0.75) size(1);
    }

    input {
      min-width: size(22);
      flex: 1;
    }
  }

  &__label-editor {
    display: flex;
    flex-direction: column;
    gap: size(1);

    input {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
      padding: size(1);
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
    max-height: size(40);
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__list-item,
  &__event-item {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(1);
  }

  &__event-header,
  &__transaction-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(1);
    flex-wrap: wrap;
  }

  &__status-badge {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(0.25) size(0.75);
    font-size: size(1.25);
    line-height: 1.3;
  }

  &__status-badge--committed {
    border-color: rgb(57 177 106 / 64%);
    color: rgb(133 241 177);
    background: rgb(26 112 65 / 24%);
  }

  &__status-badge--rejected {
    border-color: rgb(228 94 102 / 64%);
    color: rgb(255 155 160);
    background: rgb(128 37 45 / 28%);
  }

  &__transaction-item {
    display: flex;
    flex-direction: column;
    gap: size(0.75);
  }

  &__rejection-group {
    display: flex;
    flex-direction: column;
    gap: size(0.75);
  }

  &__transaction-actions {
    display: flex;
    justify-content: flex-end;
  }

  &__inline-link {
    border: none;
    background: none;
    color: theme-color('primary');
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: size(0.25);
  }

  &__hash-list {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.5) size(1);
  }

  &__list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;

    &[data-expanded='true'] {
      border-color: theme-color('primary');
    }

    &[data-selected='true'] {
      border-color: theme-color('primary');
      box-shadow: 0 0 0 1px color-mix(in srgb, theme-color('primary') 40%, transparent);
    }
  }

  &__import {
    margin-top: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(1.5);
    flex-wrap: wrap;
  }
}
</style>
