<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, type LocationQueryRaw } from 'vue-router';
import { useClipboard } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { formatNumber, formatTimestamp } from '@/shared/ui/utils/formatters';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import LatestBlock from '@/entities/telemetry/LatestBlock.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import ContextTooltip from '@/shared/ui/components/ContextTooltip.vue';
import { usePeersTelemetry } from '@/shared/ui/composables/usePeersTelemetry';
import { useSumeragiStatus } from '@/shared/ui/composables/useSumeragiStatus';
import { useSumeragiTelemetry } from '@/shared/ui/composables/useSumeragiTelemetry';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import {
  buildNodeBoardRow,
  buildSparklinePoints,
  calculatePercentile,
  calculatePropagationSpread,
  compareNodeBoardRows,
  formatBlockDelta,
  formatLatencyMs,
  formatQueueUsage,
  type NodeBoardRow,
  projectGeoPoint,
} from '@/shared/ui/utils/node-telemetry';

const hashType = useAdaptiveHash({ xxs: 'short' }, 'medium');
const route = useRoute();
const { replace } = useScopedExplorerNavigation();
const clipboard = useClipboard();
const notifications = useNotifications();
const { t } = useI18n();

const {
  metrics,
  streamStatus: peersStreamStatus,
  peers,
  propagation,
  recentEvents,
  peerDataSource,
  lastPeerSampleAtMs,
  fallbackPeersCount,
  isMetricsLoading,
  isPeersLoading: isPeersTableLoading,
} = usePeersTelemetry();

const peersStreamStatusKey = computed(() => {
  switch (peersStreamStatus.value) {
    case 'OPEN':
      return 'telemetry.statusConnected';
    case 'CONNECTING':
      return 'telemetry.statusConnecting';
    default:
      return 'telemetry.statusDisconnected';
  }
});

const peerRowKey = (
  item: { info: { url: string } | null, status: { url: string } | null },
  index: number
) => item.info?.url ?? item.status?.url ?? index;

const {
  status: sumeragiStatus,
  lastUpdatedAtMs: sumeragiLastUpdatedAtMs,
  isLoading: isSumeragiStatusLoading,
  streamStatus: sumeragiStreamStatus,
} = useSumeragiStatus();

const {
  telemetry: sumeragiTelemetry,
  isLoading: isSumeragiTelemetryLoading,
  refresh: refreshSumeragiTelemetry,
} = useSumeragiTelemetry();

const consensusStreamStatusKey = computed(() => {
  switch (sumeragiStreamStatus.value) {
    case 'OPEN':
      return 'telemetry.statusConnected';
    case 'POLLING':
      return 'telemetry.statusPolling';
    case 'CLOSED':
      return 'telemetry.statusDisconnected';
    default:
      return 'telemetry.statusConnecting';
  }
});

type TrustSourceTone = 'success' | 'warning' | 'error' | 'muted';
type TrustSampleTone = 'fresh' | 'delayed' | 'stale' | 'unknown';

const SAMPLE_FRESH_MS = 15_000;
const SAMPLE_DELAYED_MS = 60_000;
const SAMPLE_FRESH_SECONDS = Math.floor(SAMPLE_FRESH_MS / 1000);
const SAMPLE_DELAYED_SECONDS = Math.floor(SAMPLE_DELAYED_MS / 1000);
const absoluteSampleFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const sampleClockMs = ref(Date.now());
let sampleClockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  sampleClockTimer = setInterval(() => {
    sampleClockMs.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (!sampleClockTimer) return;
  clearInterval(sampleClockTimer);
  sampleClockTimer = null;
});

const formatSampleAge = (lastSampleAtMs: number | null) => {
  if (lastSampleAtMs === null) return '—';

  const ageMs = Math.max(0, sampleClockMs.value - lastSampleAtMs);
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
};

const formatSampleAbsoluteTime = (lastSampleAtMs: number | null) => {
  if (lastSampleAtMs === null || !Number.isFinite(lastSampleAtMs)) return '—';
  return absoluteSampleFormatter.format(new Date(lastSampleAtMs));
};

const resolveSampleTone = (lastSampleAtMs: number | null): TrustSampleTone => {
  if (lastSampleAtMs === null) return 'unknown';

  const ageMs = Math.max(0, sampleClockMs.value - lastSampleAtMs);
  if (ageMs <= SAMPLE_FRESH_MS) return 'fresh';
  if (ageMs <= SAMPLE_DELAYED_MS) return 'delayed';
  return 'stale';
};

const sampleToneLabelKey: Record<TrustSampleTone, string> = {
  fresh: 'telemetry.dataFresh',
  delayed: 'telemetry.dataDelayed',
  stale: 'telemetry.dataStale',
  unknown: 'telemetry.dataUnknown',
};

const peersSourceLabelKey = computed(() => {
  switch (peerDataSource.value) {
    case 'LIVE_SSE':
      return 'telemetry.dataSourceLiveSse';
    case 'SNAPSHOT':
      return 'telemetry.dataSourceSnapshot';
    case 'FALLBACK':
      return 'telemetry.dataSourceFallbackPeers';
    case 'MIXED':
      return 'telemetry.dataSourceMixed';
    default:
      return 'telemetry.dataSourceUnavailable';
  }
});

const peersSourceTone = computed<TrustSourceTone>(() => {
  switch (peerDataSource.value) {
    case 'LIVE_SSE':
      return 'success';
    case 'SNAPSHOT':
    case 'MIXED':
      return 'warning';
    case 'FALLBACK':
      return 'error';
    default:
      return 'muted';
  }
});

const peersSampleTone = computed(() => resolveSampleTone(lastPeerSampleAtMs.value));
const peersSampleAgeLabel = computed(() => formatSampleAge(lastPeerSampleAtMs.value));
const peersSampleLabelKey = computed(() => sampleToneLabelKey[peersSampleTone.value]);
const showFallbackPeersCount = computed(
  () => (peerDataSource.value === 'FALLBACK' || peerDataSource.value === 'MIXED') && fallbackPeersCount.value > 0
);
const showFallbackPeersWarning = computed(
  () => peerDataSource.value === 'FALLBACK' || peerDataSource.value === 'MIXED'
);

const consensusSourceLabelKey = computed(() => {
  switch (sumeragiStreamStatus.value) {
    case 'OPEN':
      return 'telemetry.dataSourceLiveSse';
    case 'POLLING':
      return 'telemetry.dataSourceSnapshot';
    case 'CONNECTING':
      return 'telemetry.statusConnecting';
    default:
      return 'telemetry.dataSourceUnavailable';
  }
});

const consensusSourceTone = computed<TrustSourceTone>(() => {
  switch (sumeragiStreamStatus.value) {
    case 'OPEN':
      return 'success';
    case 'POLLING':
      return 'warning';
    case 'CLOSED':
      return 'error';
    default:
      return 'muted';
  }
});

const consensusSampleTone = computed(() => resolveSampleTone(sumeragiLastUpdatedAtMs.value));
const consensusSampleAgeLabel = computed(() => formatSampleAge(sumeragiLastUpdatedAtMs.value));
const consensusSampleLabelKey = computed(() => sampleToneLabelKey[consensusSampleTone.value]);

interface ConsensusCard { key: string, label: string, value: string, meta?: string | null }

const consensusCards = computed<ConsensusCard[]>(() => {
  const snapshot = sumeragiStatus.value;
  if (!snapshot) return [];

  const formatQc = (qc: { height: number, view: number }) => {
    return `#${formatNumber(qc.height)} · v${formatNumber(qc.view)}`;
  };

  const formatPair = (first: number | null | undefined, second: number | null | undefined) => {
    const firstLabel = first === null || first === undefined ? '—' : formatNumber(first);
    const secondLabel = second === null || second === undefined ? '—' : formatNumber(second);
    return `${firstLabel} / ${secondLabel}`;
  };

  return [
    {
      key: 'leader',
      label: 'telemetry.leaderIndex',
      value: `#${formatNumber(snapshot.leader_index)}`,
    },
    {
      key: 'viewChange',
      label: 'telemetry.viewChangeIndex',
      value: `v${formatNumber(snapshot.view_change_index)}`,
    },
    {
      key: 'highest',
      label: 'telemetry.highestQc',
      value: formatQc(snapshot.highest_qc),
    },
    {
      key: 'locked',
      label: 'telemetry.lockedQc',
      value: formatQc(snapshot.locked_qc),
    },
    {
      key: 'queue',
      label: 'telemetry.txQueue',
      value: `${formatNumber(snapshot.tx_queue.depth)} / ${formatNumber(snapshot.tx_queue.capacity)}`,
      meta: snapshot.tx_queue.saturated ? 'telemetry.txQueueSaturated' : null,
    },
    {
      key: 'pacemaker',
      label: 'telemetry.pacemakerDeferrals',
      value: formatNumber(snapshot.pacemaker_backpressure_deferrals_total),
    },
    {
      key: 'gossip',
      label: 'telemetry.gossipFallback',
      value: formatNumber(snapshot.gossip_fallback_total),
    },
    {
      key: 'bgInline',
      label: 'telemetry.inlinePosts',
      value: formatPair(snapshot.bg_post_inline_post_total, snapshot.bg_post_inline_broadcast_total),
    },
    {
      key: 'rbc',
      label: 'telemetry.rbcRetries',
      value: `${formatNumber(snapshot.rbc_retry_attempts_total)} / ${formatNumber(snapshot.rbc_retry_abort_total)}`,
    },
    {
      key: 'da',
      label: 'telemetry.daReschedules',
      value: formatNumber(snapshot.da_reschedule_total),
    },
    {
      key: 'collectors',
      label: 'telemetry.collectorsTargeted',
      value: formatPair(snapshot.collectors_targeted_current, snapshot.collectors_targeted_last_per_block),
    },
    {
      key: 'redundant',
      label: 'telemetry.redundantSends',
      value: formatNumber(snapshot.redundant_sends_total ?? 0),
    },
  ];
});

const rbcStats = computed(() => {
  const backlog = sumeragiTelemetry.value?.rbc_backlog;
  if (!backlog) return [];
  return [
    { key: 'pending', label: 'telemetry.pendingSessions', value: formatNumber(backlog.pending_sessions) },
    { key: 'missing', label: 'telemetry.totalMissingChunks', value: formatNumber(backlog.total_missing_chunks) },
    { key: 'maxMissing', label: 'telemetry.maxMissingChunks', value: formatNumber(backlog.max_missing_chunks) },
  ];
});

const availabilityCollectors = computed(() => sumeragiTelemetry.value?.availability.collectors ?? []);
const qcLatencyRows = computed(() => sumeragiTelemetry.value?.qc_latency_ms ?? []);
const vrfSummary = computed(() => sumeragiTelemetry.value?.vrf ?? null);

const viewChangeProofs = computed(() => {
  const snapshot = sumeragiStatus.value;
  if (!snapshot) return [];
  return [
    { key: 'accepted', label: 'telemetry.viewChangeAccepted', value: snapshot.view_change_proof_accepted_total },
    { key: 'stale', label: 'telemetry.viewChangeStale', value: snapshot.view_change_proof_stale_total },
    { key: 'rejected', label: 'telemetry.viewChangeRejected', value: snapshot.view_change_proof_rejected_total },
    { key: 'suggest', label: 'telemetry.viewChangeSuggested', value: snapshot.view_change_suggest_total },
    { key: 'install', label: 'telemetry.viewChangeInstalled', value: snapshot.view_change_install_total },
  ];
});

const vrfPenaltyStats = computed(() => {
  const snapshot = sumeragiStatus.value;
  if (!snapshot) return null;
  return {
    epoch: snapshot.vrf_penalty_epoch,
    committedNoReveal: snapshot.vrf_committed_no_reveal_total,
    noParticipation: snapshot.vrf_no_participation_total,
    lateReveals: snapshot.vrf_late_reveals_total,
  };
});

const penaltyStats = computed(() => {
  const snapshot = sumeragiStatus.value;
  if (!snapshot) return null;
  return {
    consensusApplied: snapshot.consensus_penalties_applied_total,
    consensusPending: snapshot.consensus_penalties_pending,
    vrfApplied: snapshot.vrf_penalties_applied_total,
    vrfPending: snapshot.vrf_penalties_pending,
  };
});

const rbcStoreStats = computed(() => {
  const store = sumeragiStatus.value?.rbc_store;
  if (!store) return null;
  return {
    sessions: store.sessions,
    bytes: store.bytes,
    pressure: store.pressure_level,
    backpressureDeferrals: store.backpressure_deferrals_total,
    evictions: store.evictions_total,
    recentEvictions: store.recent_evictions,
  };
});

const settlementSides = computed(() => {
  const settlement = sumeragiStatus.value?.settlement;
  if (!settlement) return [];
  return [
    { key: 'dvp', label: 'telemetry.dvp', data: settlement.dvp },
    { key: 'pvp', label: 'telemetry.pvp', data: settlement.pvp },
  ];
});

const nexusFee = computed(() => sumeragiStatus.value?.nexus_fee ?? null);
const nexusStaking = computed(() => sumeragiStatus.value?.nexus_staking ?? null);
const nposElection = computed(() => sumeragiStatus.value?.npos_election ?? null);
const laneGovernance = computed(() => sumeragiStatus.value?.lane_governance ?? []);
const sealedLaneAliases = computed(() => sumeragiStatus.value?.lane_governance_sealed_aliases ?? []);

const networkBestBlock = computed(() => metrics.value?.block ?? null);
const averageBlockTimeMs = computed(() => metrics.value?.avg_block_time?.ms ?? null);

const nodeBoardRows = computed<NodeBoardRow[]>(() => {
  return peers.value
    .map((peer, index) =>
      buildNodeBoardRow(peer, {
        index,
        bestBlock: networkBestBlock.value,
        averageBlockTimeMs: averageBlockTimeMs.value,
      })
    )
    .sort(compareNodeBoardRows);
});

const propagationSamples = computed(() => propagation.value);
const latestPropagationSample = computed(() =>
  propagationSamples.value.length ? propagationSamples.value[propagationSamples.value.length - 1] : null
);

const liveTelemetryStats = computed(() => {
  const rows = nodeBoardRows.value.filter((row) => !row.telemetryUnsupported);
  const fallbackPeerCount = Math.max(metrics.value?.peers ?? 0, 0);
  const hasPeerRows = rows.length > 0;
  const gossipConnectedPeerIds = new Set(
    peers.value
      .flatMap((peer) => peer.info?.connected_peers ?? [])
      .map((peerId) => peerId.trim())
      .filter((peerId) => peerId.length > 0)
  );
  const knownPeerIds = new Set(rows.map((row) => row.peerId).filter((peerId): peerId is string => Boolean(peerId)));
  const gossipPeerShortfall = Array.from(gossipConnectedPeerIds).filter((peerId) => !knownPeerIds.has(peerId)).length;
  const spread = calculatePropagationSpread(rows.map((row) => row.block), averageBlockTimeMs.value);
  const medianPingMs = calculatePercentile(rows.map((row) => row.pingMs), 50);
  const p95PingMs = calculatePercentile(rows.map((row) => row.p95PingMs ?? row.pingMs), 95);
  const medianQueuePercent = calculatePercentile(rows.map((row) => row.queueFillPercent), 50);
  const laggingNodes = rows.filter((row) => row.block !== null && networkBestBlock.value !== null && row.block < networkBestBlock.value).length;
  const latestPropagationMs = latestPropagationSample.value?.spread_ms ?? null;
  const connectedNodes = rows.filter((row) => row.connected).length;
  const reportingNodes = rows.filter((row) => row.block !== null).length;
  const gossipEstimatedTotal = rows.length + gossipPeerShortfall;
  const gossipEstimatedOnline = connectedNodes + gossipPeerShortfall;
  const totalNodes = hasPeerRows ? Math.max(rows.length, gossipEstimatedTotal, fallbackPeerCount) : fallbackPeerCount;
  const onlineNodes = hasPeerRows ? Math.min(totalNodes, Math.max(connectedNodes, gossipEstimatedOnline)) : fallbackPeerCount;

  return {
    totalNodes,
    onlineNodes,
    reportingNodes: hasPeerRows ? reportingNodes : fallbackPeerCount,
    laggingNodes,
    propagationBlocks: spread.spreadBlocks,
    propagationMs: latestPropagationMs ?? spread.estimatedMs,
    medianPingMs,
    p95PingMs,
    medianQueuePercent,
  };
});

type PulseFilterMode = 'ALL' | 'ONLINE' | 'LAGGING' | 'UNSUPPORTED';
interface PulseFilterOption { key: PulseFilterMode, labelKey: string, count: number }

interface TelemetryOpsPersistedState {
  filter?: PulseFilterMode
  pin?: string | null
  compare?: string | null
  drawer?: boolean
  eventId?: number | null
  search?: string
}

const telemetryOpsStorageKey = 'iroha.telemetry.ops.v2';
const telemetryEventDrawerId = 'telemetry-pulse-events-drawer';
const telemetryEventSearchInputId = 'telemetry-pulse-events-search';
const telemetryOpsQueryKeys = {
  filter: 'pf',
  pin: 'pp',
  compare: 'pc',
  drawer: 'pd',
  eventId: 'pe',
  search: 'ps',
} as const;
const managedTelemetryOpsQueryKeys = Object.values(telemetryOpsQueryKeys);

const readQueryParam = (value: unknown): string | null => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
};

const readBooleanQueryParam = (value: unknown): boolean | null => {
  const raw = readQueryParam(value);
  if (raw === null) return null;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  return null;
};

const readNumberQueryParam = (value: unknown): number | null => {
  const raw = readQueryParam(value);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const readPulseFilterMode = (value: unknown): PulseFilterMode | null => {
  const raw = readQueryParam(value);
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  if (normalized === 'ALL' || normalized === 'ONLINE' || normalized === 'LAGGING' || normalized === 'UNSUPPORTED') {
    return normalized;
  }
  return null;
};

const readPersistedTelemetryOpsState = (): TelemetryOpsPersistedState => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(telemetryOpsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TelemetryOpsPersistedState;
    return {
      filter: parsed.filter,
      pin: typeof parsed.pin === 'string' ? parsed.pin : null,
      compare: typeof parsed.compare === 'string' ? parsed.compare : null,
      drawer: Boolean(parsed.drawer),
      eventId: typeof parsed.eventId === 'number' ? parsed.eventId : null,
      search: typeof parsed.search === 'string' ? parsed.search : '',
    };
  } catch {
    return {};
  }
};

const persistedTelemetryOpsState = readPersistedTelemetryOpsState();

const pulseFilterMode = ref<PulseFilterMode>(
  readPulseFilterMode(route.query[telemetryOpsQueryKeys.filter]) ?? persistedTelemetryOpsState.filter ?? 'ALL'
);
const pinnedNodeKey = ref<string | null>(
  readQueryParam(route.query[telemetryOpsQueryKeys.pin]) ?? persistedTelemetryOpsState.pin ?? null
);
const compareNodeKey = ref<string | null>(
  readQueryParam(route.query[telemetryOpsQueryKeys.compare]) ?? persistedTelemetryOpsState.compare ?? null
);
const isTelemetryEventDrawerOpen = ref<boolean>(
  readBooleanQueryParam(route.query[telemetryOpsQueryKeys.drawer]) ?? persistedTelemetryOpsState.drawer ?? false
);
const selectedTelemetryEventId = ref<number | null>(
  readNumberQueryParam(route.query[telemetryOpsQueryKeys.eventId]) ?? persistedTelemetryOpsState.eventId ?? null
);
const telemetryEventSearchQuery = ref<string>(
  readQueryParam(route.query[telemetryOpsQueryKeys.search]) ?? persistedTelemetryOpsState.search ?? ''
);

const filteredNodeBoardRows = computed(() => {
  switch (pulseFilterMode.value) {
    case 'ONLINE':
      return nodeBoardRows.value.filter((row) => row.connected && !row.telemetryUnsupported);
    case 'LAGGING': {
      const bestBlock = networkBestBlock.value;
      if (bestBlock === null) return [];
      return nodeBoardRows.value.filter(
        (row) => !row.telemetryUnsupported && row.block !== null && row.block < bestBlock
      );
    }
    case 'UNSUPPORTED':
      return nodeBoardRows.value.filter((row) => row.telemetryUnsupported);
    default:
      return nodeBoardRows.value;
  }
});

const pulseFilterOptions = computed<PulseFilterOption[]>(() => {
  const bestBlock = networkBestBlock.value;
  const onlineCount = nodeBoardRows.value.filter((row) => row.connected && !row.telemetryUnsupported).length;
  const laggingCount = bestBlock === null
    ? 0
    : nodeBoardRows.value.filter((row) => !row.telemetryUnsupported && row.block !== null && row.block < bestBlock).length;
  const unsupportedCount = nodeBoardRows.value.filter((row) => row.telemetryUnsupported).length;

  return [
    { key: 'ALL', labelKey: 'telemetry.filterAllNodes', count: nodeBoardRows.value.length },
    { key: 'ONLINE', labelKey: 'telemetry.filterOnlineNodes', count: onlineCount },
    { key: 'LAGGING', labelKey: 'telemetry.filterLaggingNodes', count: laggingCount },
    { key: 'UNSUPPORTED', labelKey: 'telemetry.filterUnsupportedNodes', count: unsupportedCount },
  ];
});

const nodePulseRows = computed(() => filteredNodeBoardRows.value.slice(0, 12));
const nodeMapRows = computed(() => nodePulseRows.value.filter((row) => !row.telemetryUnsupported));
const pulseViewMode = ref<'graphs' | 'map'>('graphs');
type NodeMapPoint = NodeBoardRow & { x: number, y: number };
const MAP_WIDTH = 100;
const MAP_HEIGHT = 52;
const historyWindowOptions = [24, 48, 96] as const;
const historyStorageLimit = 128;
const mapMinScale = 1;
const mapMaxScale = 3;

const nodeMapPoints = computed<NodeMapPoint[]>(() =>
  nodeMapRows.value
    .map((row) => {
      const point = projectGeoPoint(row.locationLat, row.locationLon, { width: MAP_WIDTH, height: MAP_HEIGHT });
      if (!point) return null;
      return {
        ...row,
        x: point.x,
        y: point.y,
      };
    })
    .filter((row): row is NodeMapPoint => row !== null)
);
const connectedMapPointsCount = computed(
  () => nodeMapPoints.value.filter((node) => node.connected).length
);
const disconnectedMapPointsCount = computed(
  () => nodeMapPoints.value.filter((node) => !node.connected).length
);

const mapSvg = ref<SVGSVGElement | null>(null);
const mapScale = ref(mapMinScale);
const mapOffsetX = ref(0);
const mapOffsetY = ref(0);
const mapHoverNodeKey = ref<string | null>(null);
const selectedMapNodeKey = ref<string | null>(null);
const mapDragState = ref<{
  pointerId: number
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
} | null>(null);

const clampMapOffset = (offsetX: number, offsetY: number, scale = mapScale.value) => {
  const maxX = ((scale - 1) * MAP_WIDTH) / 2;
  const maxY = ((scale - 1) * MAP_HEIGHT) / 2;
  if (maxX <= 0 || maxY <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.min(maxX, Math.max(-maxX, offsetX)),
    y: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
};

const setMapScale = (nextScale: number) => {
  const clampedScale = Math.min(mapMaxScale, Math.max(mapMinScale, Number(nextScale.toFixed(2))));
  mapScale.value = clampedScale;
  const clampedOffset = clampMapOffset(mapOffsetX.value, mapOffsetY.value, clampedScale);
  mapOffsetX.value = clampedOffset.x;
  mapOffsetY.value = clampedOffset.y;
};

const zoomMap = (step: number) => {
  setMapScale(mapScale.value + step);
};

const resetMapView = () => {
  mapScale.value = mapMinScale;
  mapOffsetX.value = 0;
  mapOffsetY.value = 0;
  mapDragState.value = null;
};

const onMapWheel = (event: WheelEvent) => {
  event.preventDefault();
  zoomMap(event.deltaY < 0 ? 0.2 : -0.2);
};

const onMapPointerDown = (event: PointerEvent) => {
  if (mapScale.value <= mapMinScale) return;
  const svgElement = event.currentTarget as SVGSVGElement | null;
  svgElement?.setPointerCapture?.(event.pointerId);
  mapDragState.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startOffsetX: mapOffsetX.value,
    startOffsetY: mapOffsetY.value,
  };
};

const onMapPointerMove = (event: PointerEvent) => {
  if (!mapDragState.value || mapDragState.value.pointerId !== event.pointerId) return;
  const rect = mapSvg.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;

  const deltaX = event.clientX - mapDragState.value.startClientX;
  const deltaY = event.clientY - mapDragState.value.startClientY;
  const deltaXUnits = (deltaX * MAP_WIDTH) / rect.width;
  const deltaYUnits = (deltaY * MAP_HEIGHT) / rect.height;
  const clampedOffset = clampMapOffset(
    mapDragState.value.startOffsetX + deltaXUnits,
    mapDragState.value.startOffsetY + deltaYUnits
  );
  mapOffsetX.value = clampedOffset.x;
  mapOffsetY.value = clampedOffset.y;
};

const onMapPointerUp = (event: PointerEvent) => {
  if (mapDragState.value?.pointerId !== event.pointerId) return;
  const svgElement = event.currentTarget as SVGSVGElement | null;
  svgElement?.releasePointerCapture?.(event.pointerId);
  mapDragState.value = null;
};

const onMapKeyPan = (event: KeyboardEvent) => {
  const step = event.shiftKey ? 4 : 2;
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomMap(0.2);
    return;
  }
  if (event.key === '-') {
    event.preventDefault();
    zoomMap(-0.2);
    return;
  }
  if (event.key === '0') {
    event.preventDefault();
    resetMapView();
    return;
  }
  if (mapScale.value <= mapMinScale) return;

  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const candidateX = mapOffsetX.value + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0);
  const candidateY = mapOffsetY.value + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0);
  const clamped = clampMapOffset(candidateX, candidateY);
  mapOffsetX.value = clamped.x;
  mapOffsetY.value = clamped.y;
};

const mapTransform = computed(
  () =>
    `translate(${mapOffsetX.value} ${mapOffsetY.value}) translate(${MAP_WIDTH / 2} ${MAP_HEIGHT / 2}) scale(${mapScale.value}) translate(${-MAP_WIDTH / 2} ${-MAP_HEIGHT / 2})`
);

const onMapNodeHover = (nodeKey: string | null) => {
  mapHoverNodeKey.value = nodeKey;
};

const toggleMapNodeSelection = (nodeKey: string) => {
  selectedMapNodeKey.value = selectedMapNodeKey.value === nodeKey ? null : nodeKey;
};

watch(nodeMapPoints, (points) => {
  if (!points.some((point) => point.key === selectedMapNodeKey.value)) {
    selectedMapNodeKey.value = null;
  }
  if (!points.some((point) => point.key === mapHoverNodeKey.value)) {
    mapHoverNodeKey.value = null;
  }
});

const activeMapNode = computed<NodeMapPoint | null>(() => {
  const activeKey = mapHoverNodeKey.value ?? selectedMapNodeKey.value;
  if (!activeKey) return null;
  return nodeMapPoints.value.find((node) => node.key === activeKey) ?? null;
});

const mapProjectPoint = (x: number, y: number) => ({
  x: ((x - MAP_WIDTH / 2) * mapScale.value) + (MAP_WIDTH / 2) + mapOffsetX.value,
  y: ((y - MAP_HEIGHT / 2) * mapScale.value) + (MAP_HEIGHT / 2) + mapOffsetY.value,
});

const activeMapNodePosition = computed(() => {
  if (!activeMapNode.value) return null;
  const projected = mapProjectPoint(activeMapNode.value.x, activeMapNode.value.y);
  return {
    x: Math.min(96, Math.max(4, projected.x)),
    y: Math.min(94, Math.max(6, projected.y)),
  };
});

const pinnedNode = computed<NodeBoardRow | null>(() =>
  nodeBoardRows.value.find((node) => node.key === pinnedNodeKey.value) ?? null
);
const compareNode = computed<NodeBoardRow | null>(() =>
  nodeBoardRows.value.find((node) => node.key === compareNodeKey.value) ?? null
);
const showNodeComparison = computed(() => Boolean(pinnedNode.value && compareNode.value));

const formatNodeBlockValue = (node: NodeBoardRow | null) => {
  if (!node || node.block === null) return '—';
  if (!node.blockDelta) return `#${formatNumber(node.block)}`;
  return `#${formatNumber(node.block)} (${node.blockDelta})`;
};

const formatNodeQueuePercentValue = (node: NodeBoardRow | null) => {
  if (!node) return '—';
  if (node.queueFillPercent === null) return node.queueUsage;
  return `${node.queueUsage} (${formatNumber(node.queueFillPercent)}%)`;
};

interface NodeComparisonRow {
  key: string
  labelKey: string
  pinnedValue: string
  compareValue: string
}

const nodeComparisonRows = computed<NodeComparisonRow[]>(() => {
  if (!pinnedNode.value || !compareNode.value) return [];
  return [
    {
      key: 'block',
      labelKey: 'telemetry.block',
      pinnedValue: formatNodeBlockValue(pinnedNode.value),
      compareValue: formatNodeBlockValue(compareNode.value),
    },
    {
      key: 'rtt',
      labelKey: 'telemetry.pingP95',
      pinnedValue: formatLatencyMs(pinnedNode.value.p95PingMs ?? pinnedNode.value.pingMs),
      compareValue: formatLatencyMs(compareNode.value.p95PingMs ?? compareNode.value.pingMs),
    },
    {
      key: 'propagation',
      labelKey: 'telemetry.estimatedPropagation',
      pinnedValue: formatLatencyMs(pinnedNode.value.propagationMs),
      compareValue: formatLatencyMs(compareNode.value.propagationMs),
    },
    {
      key: 'queue',
      labelKey: 'telemetry.queue',
      pinnedValue: formatNodeQueuePercentValue(pinnedNode.value),
      compareValue: formatNodeQueuePercentValue(compareNode.value),
    },
    {
      key: 'location',
      labelKey: 'telemetry.location',
      pinnedValue: pinnedNode.value.locationLabel,
      compareValue: compareNode.value.locationLabel,
    },
  ];
});

const togglePinnedNode = (nodeKey: string) => {
  if (pinnedNodeKey.value === nodeKey) {
    pinnedNodeKey.value = null;
    compareNodeKey.value = null;
    return;
  }
  pinnedNodeKey.value = nodeKey;
  if (compareNodeKey.value === nodeKey) compareNodeKey.value = null;
};

const canCompareNode = (nodeKey: string) => Boolean(pinnedNodeKey.value && pinnedNodeKey.value !== nodeKey);

const toggleCompareNode = (nodeKey: string) => {
  if (!canCompareNode(nodeKey)) return;
  compareNodeKey.value = compareNodeKey.value === nodeKey ? null : nodeKey;
};

watch(nodeBoardRows, (rows) => {
  const rowKeys = new Set(rows.map((row) => row.key));
  if (pinnedNodeKey.value && !rowKeys.has(pinnedNodeKey.value)) {
    pinnedNodeKey.value = null;
  }
  if (compareNodeKey.value && !rowKeys.has(compareNodeKey.value)) {
    compareNodeKey.value = null;
  }
  if (pinnedNodeKey.value && compareNodeKey.value === pinnedNodeKey.value) {
    compareNodeKey.value = null;
  }
});

watch(pinnedNodeKey, (nextPinnedNodeKey) => {
  if (!nextPinnedNodeKey || compareNodeKey.value === nextPinnedNodeKey) {
    compareNodeKey.value = null;
  }
});

const telemetryEvents = computed(() => recentEvents.value.slice(0, 40));
const normalizedTelemetryEventSearch = computed(() => telemetryEventSearchQuery.value.trim().toLowerCase());

const telemetryEventKindLabelKey = {
  snapshot_peers_info: 'telemetry.eventSnapshotPeersInfo',
  snapshot_propagation: 'telemetry.eventSnapshotPropagation',
  fallback_peers: 'telemetry.eventFallbackPeers',
  sse_first: 'telemetry.eventSseFirst',
  sse_peer_info: 'telemetry.eventSsePeerInfo',
  sse_peer_status: 'telemetry.eventSsePeerStatus',
  sse_propagation: 'telemetry.eventSsePropagation',
  sse_network_status: 'telemetry.eventSseNetworkStatus',
} as const;

const resolveTelemetryEventLabelKey = (kind: string) =>
  telemetryEventKindLabelKey[kind as keyof typeof telemetryEventKindLabelKey] ?? 'telemetry.eventUnknown';

const summarizeTelemetryEventPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.url === 'string') return record.url;
  if (typeof record.block === 'number') return `#${formatNumber(record.block)}`;
  if (typeof record.count === 'number') return `${formatNumber(record.count)} rows`;
  return '';
};

const telemetryEventSearchPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload).toLowerCase();
  } catch {
    return String(payload).toLowerCase();
  }
};

const telemetryEventSearchIndex = computed(() =>
  telemetryEvents.value.map((event) => ({
    event,
    labelKey: resolveTelemetryEventLabelKey(event.kind),
    summary: summarizeTelemetryEventPayload(event.payload).toLowerCase(),
    payload: telemetryEventSearchPayload(event.payload),
  }))
);

const filteredTelemetryEvents = computed(() => {
  if (!normalizedTelemetryEventSearch.value) return telemetryEventSearchIndex.value.map((entry) => entry.event);

  return telemetryEventSearchIndex.value.filter((entry) => {
    const label = t(entry.labelKey).toLowerCase();
    return label.includes(normalizedTelemetryEventSearch.value)
      || entry.summary.includes(normalizedTelemetryEventSearch.value)
      || entry.payload.includes(normalizedTelemetryEventSearch.value);
  }).map((entry) => entry.event);
});

const telemetryEventMatchCountLabel = computed(() =>
  `${formatNumber(filteredTelemetryEvents.value.length)} / ${formatNumber(telemetryEvents.value.length)}`
);

const selectedTelemetryEvent = computed(() => {
  if (filteredTelemetryEvents.value.length === 0) return null;
  return filteredTelemetryEvents.value.find((event) => event.id === selectedTelemetryEventId.value)
    ?? filteredTelemetryEvents.value[0];
});

const selectedTelemetryEventPayload = computed(() => {
  if (!selectedTelemetryEvent.value) return '';
  try {
    return JSON.stringify(selectedTelemetryEvent.value.payload, null, 2);
  } catch {
    return String(selectedTelemetryEvent.value.payload);
  }
});

const telemetryEventOptionId = (eventId: number) => `telemetry-event-option-${eventId}`;
const selectedTelemetryEventOptionId = computed(() => (
  selectedTelemetryEventId.value === null
    ? undefined
    : telemetryEventOptionId(selectedTelemetryEventId.value)
));

const focusTelemetryEventOption = (eventId: number) => {
  if (typeof document === 'undefined') return;
  const candidate = document.getElementById(telemetryEventOptionId(eventId));
  if (candidate instanceof HTMLButtonElement) {
    candidate.focus();
  }
};

const selectTelemetryEvent = (eventId: number) => {
  selectedTelemetryEventId.value = eventId;
};

const moveSelectedTelemetryEvent = (offset: -1 | 1) => {
  const events = filteredTelemetryEvents.value;
  if (!events.length) return;

  const currentIndex = events.findIndex((event) => event.id === selectedTelemetryEventId.value);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (baseIndex + offset + events.length) % events.length;
  const nextEventId = events[nextIndex].id;

  selectedTelemetryEventId.value = nextEventId;
  focusTelemetryEventOption(nextEventId);
};

const selectTelemetryEventBoundary = (boundary: 'first' | 'last') => {
  const events = filteredTelemetryEvents.value;
  if (!events.length) return;

  const nextEventId = boundary === 'first'
    ? events[0].id
    : events[events.length - 1].id;

  selectedTelemetryEventId.value = nextEventId;
  focusTelemetryEventOption(nextEventId);
};

const clearTelemetryEventSearch = () => {
  telemetryEventSearchQuery.value = '';
};

const focusTelemetryEventSearchInput = () => {
  if (typeof document === 'undefined') return;
  const candidate = document.getElementById(telemetryEventSearchInputId);
  if (candidate && typeof (candidate as HTMLElement).focus === 'function') {
    (candidate as HTMLElement).focus();
  }
};

const toIsoTimestamp = (timestampMs: number | null) => {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return '';
  return new Date(timestampMs).toISOString();
};

const copySelectedTelemetryEvent = async () => {
  if (!selectedTelemetryEvent.value) return;
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }
  await clipboard.copy(selectedTelemetryEventPayload.value);
  notifications.success(t('clipboard.success'));
};

const copyTelemetryOpsLink = async () => {
  if (!clipboard.isSupported) {
    notifications.error(t('clipboard.error'));
    return;
  }
  if (typeof window === 'undefined') return;
  await clipboard.copy(window.location.href);
  notifications.success(t('clipboard.success'));
};

const exportTelemetryEvents = () => {
  if (typeof window === 'undefined' || filteredTelemetryEvents.value.length === 0) return;

  const exportedEvents = filteredTelemetryEvents.value.map((event) => ({
    ...event,
    received_at_iso: toIsoTimestamp(event.receivedAtMs),
  }));
  const fileContents = JSON.stringify(exportedEvents, null, 2);
  const fileBlob = new Blob([fileContents], { type: 'application/json;charset=utf-8' });
  const fileUrl = URL.createObjectURL(fileBlob);
  const fileName = `telemetry-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(fileUrl);
  notifications.success(t('telemetry.eventsExported'));
};

const toggleTelemetryEventDrawer = () => {
  isTelemetryEventDrawerOpen.value = !isTelemetryEventDrawerOpen.value;
  if (!isTelemetryEventDrawerOpen.value) return;

  if (filteredTelemetryEvents.value.length > 0 && selectedTelemetryEventId.value === null) {
    selectedTelemetryEventId.value = filteredTelemetryEvents.value[0].id;
  }
  nextTick(() => {
    focusTelemetryEventSearchInput();
  });
};

watch(filteredTelemetryEvents, (events) => {
  if (!events.length) {
    selectedTelemetryEventId.value = null;
    return;
  }
  if (selectedTelemetryEventId.value === null || !events.some((event) => event.id === selectedTelemetryEventId.value)) {
    selectedTelemetryEventId.value = events[0].id;
  }
}, { immediate: true });

const isApplyingTelemetryOpsQuery = ref(false);
const telemetryOpsStateLoadedFromRoute = computed(() =>
  managedTelemetryOpsQueryKeys.some((key) => readQueryParam(route.query[key]) !== null)
);

watch(
  () => route.query,
  (query) => {
    if (!managedTelemetryOpsQueryKeys.some((key) => readQueryParam(query[key]) !== null)) return;

    isApplyingTelemetryOpsQuery.value = true;
    pulseFilterMode.value = readPulseFilterMode(query[telemetryOpsQueryKeys.filter]) ?? 'ALL';
    pinnedNodeKey.value = readQueryParam(query[telemetryOpsQueryKeys.pin]);
    compareNodeKey.value = readQueryParam(query[telemetryOpsQueryKeys.compare]);
    isTelemetryEventDrawerOpen.value = readBooleanQueryParam(query[telemetryOpsQueryKeys.drawer]) ?? false;
    selectedTelemetryEventId.value = readNumberQueryParam(query[telemetryOpsQueryKeys.eventId]);
    telemetryEventSearchQuery.value = readQueryParam(query[telemetryOpsQueryKeys.search]) ?? '';
    isApplyingTelemetryOpsQuery.value = false;
  }
);

watch(
  [pulseFilterMode, pinnedNodeKey, compareNodeKey, isTelemetryEventDrawerOpen, selectedTelemetryEventId, telemetryEventSearchQuery],
  () => {
    if (isApplyingTelemetryOpsQuery.value) return;

    const nextQuery: LocationQueryRaw = { ...route.query };
    const normalizedSearchQuery = telemetryEventSearchQuery.value.trim();
    const nextFilter = pulseFilterMode.value === 'ALL' ? null : pulseFilterMode.value.toLowerCase();
    const nextDrawer = isTelemetryEventDrawerOpen.value ? '1' : null;
    const nextEventId = selectedTelemetryEventId.value === null ? null : String(selectedTelemetryEventId.value);

    nextQuery[telemetryOpsQueryKeys.filter] = nextFilter;
    nextQuery[telemetryOpsQueryKeys.pin] = pinnedNodeKey.value;
    nextQuery[telemetryOpsQueryKeys.compare] = compareNodeKey.value;
    nextQuery[telemetryOpsQueryKeys.drawer] = nextDrawer;
    nextQuery[telemetryOpsQueryKeys.eventId] = nextEventId;
    nextQuery[telemetryOpsQueryKeys.search] = normalizedSearchQuery || null;

    managedTelemetryOpsQueryKeys.forEach((key) => {
      if (nextQuery[key] === null || nextQuery[key] === undefined || nextQuery[key] === '') {
        delete nextQuery[key];
      }
    });

    const queryChanged = managedTelemetryOpsQueryKeys.some((key) => readQueryParam(route.query[key]) !== readQueryParam(nextQuery[key]));
    if (!queryChanged) return;

    replace({ query: nextQuery }).catch(() => undefined);
  }
);

watch(
  [pulseFilterMode, pinnedNodeKey, compareNodeKey, isTelemetryEventDrawerOpen, selectedTelemetryEventId, telemetryEventSearchQuery],
  () => {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage as Partial<Storage>;
    if (typeof storage.setItem !== 'function') return;
    const persistedState: TelemetryOpsPersistedState = {
      filter: pulseFilterMode.value,
      pin: pinnedNodeKey.value,
      compare: compareNodeKey.value,
      drawer: isTelemetryEventDrawerOpen.value,
      eventId: selectedTelemetryEventId.value,
      search: telemetryEventSearchQuery.value.trim(),
    };
    try {
      storage.setItem(telemetryOpsStorageKey, JSON.stringify(persistedState));
    } catch {
      // Ignore storage write failures (private mode / quota / disabled storage).
    }
  }
);

if (!telemetryOpsStateLoadedFromRoute.value) {
  isApplyingTelemetryOpsQuery.value = true;
  pulseFilterMode.value = persistedTelemetryOpsState.filter ?? pulseFilterMode.value;
  pinnedNodeKey.value = persistedTelemetryOpsState.pin ?? pinnedNodeKey.value;
  compareNodeKey.value = persistedTelemetryOpsState.compare ?? compareNodeKey.value;
  isTelemetryEventDrawerOpen.value = persistedTelemetryOpsState.drawer ?? isTelemetryEventDrawerOpen.value;
  selectedTelemetryEventId.value = persistedTelemetryOpsState.eventId ?? selectedTelemetryEventId.value;
  telemetryEventSearchQuery.value = persistedTelemetryOpsState.search ?? telemetryEventSearchQuery.value;
  isApplyingTelemetryOpsQuery.value = false;
}

const pingHistory = ref<number[]>([]);
const propagationHistory = ref<number[]>([]);
const queuePressureHistory = ref<number[]>([]);
const lastPropagationBlock = ref<number | null>(null);
const historyWindow = ref<(typeof historyWindowOptions)[number]>(48);

watch(
  [nodeBoardRows, averageBlockTimeMs, propagationSamples],
  ([rows, blockTimeMs, propagationSeries]) => {
    const activeRows = rows.filter((row) => !row.telemetryUnsupported);

    const pingSample = calculatePercentile(activeRows.map((row) => row.pingMs), 50);
    if (pingSample !== null) {
      pingHistory.value = [...pingHistory.value, pingSample].slice(-historyStorageLimit);
    }

    const queueSample = calculatePercentile(activeRows.map((row) => row.queueFillPercent), 50);
    if (queueSample !== null) {
      queuePressureHistory.value = [...queuePressureHistory.value, queueSample].slice(-historyStorageLimit);
    }

    const latestPropagation = propagationSeries.length
      ? propagationSeries[propagationSeries.length - 1]
      : null;
    if (latestPropagation && latestPropagation.block !== lastPropagationBlock.value) {
      propagationHistory.value = [...propagationHistory.value, latestPropagation.spread_ms].slice(-historyStorageLimit);
      lastPropagationBlock.value = latestPropagation.block;
      return;
    }

    const rowsWithHeight = activeRows.filter((row) => row.block !== null);
    if (!latestPropagation && rowsWithHeight.length) {
      const spread = calculatePropagationSpread(rowsWithHeight.map((row) => row.block), blockTimeMs);
      const fallbackPropagationSample = spread.estimatedMs ?? spread.spreadBlocks;
      propagationHistory.value = [...propagationHistory.value, fallbackPropagationSample].slice(-historyStorageLimit);
    }
  },
  { immediate: true }
);

const pingSparklinePoints = computed(() => buildSparklinePoints(
  pingHistory.value.slice(-historyWindow.value),
  100,
  36
));
const propagationSparklinePoints = computed(() => buildSparklinePoints(
  propagationHistory.value.slice(-historyWindow.value),
  100,
  36
));
const queueSparklinePoints = computed(() => buildSparklinePoints(
  queuePressureHistory.value.slice(-historyWindow.value),
  100,
  36
));

const propagationSummary = computed(() => {
  if (liveTelemetryStats.value.propagationMs !== null) {
    return formatLatencyMs(liveTelemetryStats.value.propagationMs);
  }
  return `${formatNumber(liveTelemetryStats.value.propagationBlocks)} blks`;
});

const propagationSummaryMeta = computed(() => {
  if (liveTelemetryStats.value.propagationMs !== null) return null;
  return `${formatNumber(liveTelemetryStats.value.propagationBlocks)} blks`;
});

const formatIndexList = (values: number[]) => (values.length ? values.join(', ') : '—');

interface BlockProducerRow {
  index: number
  peerId: string
  isLeader: boolean
}

const blockProducerRows = computed<BlockProducerRow[]>(() => {
  const validators = nposElection.value?.validator_set ?? [];
  if (validators.length === 0) return [];

  const leaderIndex = sumeragiStatus.value?.leader_index ?? 0;
  const normalizedLeaderIndex = leaderIndex % validators.length;

  return validators.map((peerId, index) => ({
    index,
    peerId,
    isLeader: index === normalizedLeaderIndex,
  }));
});

const currentBlockProducer = computed(() =>
  blockProducerRows.value.find((producer) => producer.isLeader) ?? null
);

const sumeragiChainSnapshot = computed(() => {
  const snapshot = sumeragiStatus.value;
  if (!snapshot) return null;
  return {
    height: snapshot.membership.height,
    view: snapshot.membership.view,
    epoch: snapshot.membership.epoch,
    viewHash: snapshot.membership.view_hash,
  };
});
</script>

<template>
  <div class="nodes-telemetry-page">
    <BaseLoading
      v-if="isMetricsLoading"
      class="nodes-telemetry-page_loading"
    />
    <div
      v-else-if="metrics"
      class="nodes-telemetry-page__stats"
    >
      <div class="nodes-telemetry-page__stats-stat">
        <BaseLink
          :to="`/blocks/${metrics.block}`"
          class="nodes-telemetry-page__stats-stat-value"
          custom-font
        >
          #{{ formatNumber(metrics.block) }}
        </BaseLink>
        <span class="nodes-telemetry-page__stats-stat-label">{{ $t('telemetry.bestBlock') }}</span>
      </div>
      <div class="nodes-telemetry-page__stats-stat">
        <BaseLink
          v-if="metrics.finalized_block"
          custom-font
          :to="`/blocks/${metrics.finalized_block}`"
          class="nodes-telemetry-page__stats-stat-value"
        >
          #{{ formatNumber(metrics.finalized_block) }}
        </BaseLink>
        <span v-else>Unknown</span>
        <span class="nodes-telemetry-page__stats-stat-label">{{ $t('telemetry.finalizedBlock') }}</span>
      </div>
      <div class="nodes-telemetry-page__stats-stat">
        <span
          v-if="metrics.avg_block_time"
          class="nodes-telemetry-page__stats-stat-value"
        >~~{{ metrics.avg_block_time.ms / 1000 }}s</span>
        <span
          v-else
          class="nodes-telemetry-page__stats-stat-value"
        >-</span>
        <span class="nodes-telemetry-page__stats-stat-label">{{ $t('telemetry.averageBlockTime') }}</span>
      </div>
      <div class="nodes-telemetry-page__stats-stat">
        <span
          v-if="metrics.avg_commit_time"
          class="nodes-telemetry-page__stats-stat-value"
        >~~{{ metrics.avg_commit_time.ms / 1000 }}s</span>
        <span
          v-else
          class="nodes-telemetry-page__stats-stat-value"
        >-</span>
        <span class="nodes-telemetry-page__stats-stat-label">{{ $t('telemetry.averageBlockCommitTime') }}</span>
      </div>
      <div class="nodes-telemetry-page__stats-stat">
        <div class="nodes-telemetry-page__stats-stat-value nodes-telemetry-page__stats-stat-last-block">
          <div v-if="metrics.block_created_at">
            <LatestBlock :date="metrics.block_created_at" />
            <span>s</span>
          </div>
          <div v-else>
            Unknown
          </div>
        </div>
        <span class="nodes-telemetry-page__stats-stat-label">{{ $t('telemetry.lastBlock') }}</span>
      </div>
    </div>

    <BaseContentBlock
      :title="$t('telemetry.networkPulse')"
      class="nodes-telemetry-page__section nodes-telemetry-page__ethstats"
    >
      <template #header-action>
        <div class="nodes-telemetry-page__trust-badges">
          <span
            class="nodes-telemetry-page__stream-indicator"
            :data-status="peersStreamStatus"
          >
            {{ $t(peersStreamStatusKey) }}
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="peersSourceTone"
          >
            {{ $t('telemetry.dataTrustSource') }}: {{ $t(peersSourceLabelKey) }}
            <span
              v-if="showFallbackPeersCount"
              class="nodes-telemetry-page__trust-chip-meta"
            >
              ({{ formatNumber(fallbackPeersCount) }})
            </span>
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="peersSampleTone"
          >
            {{ $t('telemetry.dataTrustSampleAge') }}: {{ peersSampleAgeLabel }}
            <span class="nodes-telemetry-page__trust-chip-meta">({{ $t(peersSampleLabelKey) }})</span>
          </span>
        </div>
      </template>
      <div class="nodes-telemetry-page__section-body">
        <span class="row-text nodes-telemetry-page__trust-note">
          {{ $t('telemetry.dataFreshnessScale', [SAMPLE_FRESH_SECONDS, SAMPLE_DELAYED_SECONDS]) }}
        </span>
        <div class="nodes-telemetry-page__ethstats-console">
          <div class="nodes-telemetry-page__ethstats-filters">
            <button
              v-for="option in pulseFilterOptions"
              :key="option.key"
              type="button"
              :data-active="pulseFilterMode === option.key"
              :aria-pressed="pulseFilterMode === option.key"
              :data-test="`pulse-filter-${option.key.toLowerCase()}`"
              @click="pulseFilterMode = option.key"
            >
              {{ $t(option.labelKey) }}
              <span class="nodes-telemetry-page__ethstats-filter-count">({{ formatNumber(option.count) }})</span>
            </button>
          </div>
          <button
            type="button"
            class="nodes-telemetry-page__ethstats-events-toggle"
            :data-open="isTelemetryEventDrawerOpen"
            :aria-expanded="isTelemetryEventDrawerOpen"
            :aria-controls="telemetryEventDrawerId"
            data-test="pulse-toggle-events"
            @click="toggleTelemetryEventDrawer"
          >
            {{ $t('telemetry.rawEvents') }}
            <span class="nodes-telemetry-page__ethstats-filter-count">({{ formatNumber(telemetryEvents.length) }})</span>
          </button>
        </div>
        <div class="nodes-telemetry-page__ethstats-kpis">
          <div class="nodes-telemetry-page__ethstats-kpi">
            <span class="nodes-telemetry-page__ethstats-kpi-label">{{ $t('telemetry.liveNodes') }}</span>
            <span class="nodes-telemetry-page__ethstats-kpi-value">
              {{ formatNumber(liveTelemetryStats.onlineNodes) }} / {{ formatNumber(liveTelemetryStats.totalNodes) }}
            </span>
          </div>
          <div class="nodes-telemetry-page__ethstats-kpi">
            <span class="nodes-telemetry-page__ethstats-kpi-label">{{ $t('telemetry.reportingNodes') }}</span>
            <span class="nodes-telemetry-page__ethstats-kpi-value">
              {{ formatNumber(liveTelemetryStats.reportingNodes) }}
            </span>
          </div>
          <div class="nodes-telemetry-page__ethstats-kpi">
            <span class="nodes-telemetry-page__ethstats-kpi-label">{{ $t('telemetry.propagationSpread') }}</span>
            <span class="nodes-telemetry-page__ethstats-kpi-value">
              {{ propagationSummary }}
              <span
                v-if="propagationSummaryMeta"
                class="nodes-telemetry-page__ethstats-kpi-meta"
              >
                ({{ propagationSummaryMeta }})
              </span>
            </span>
          </div>
          <div class="nodes-telemetry-page__ethstats-kpi">
            <span class="nodes-telemetry-page__ethstats-kpi-label">{{ $t('telemetry.pingP95') }}</span>
            <span class="nodes-telemetry-page__ethstats-kpi-value">{{ formatLatencyMs(liveTelemetryStats.p95PingMs) }}</span>
          </div>
          <div class="nodes-telemetry-page__ethstats-kpi">
            <span class="nodes-telemetry-page__ethstats-kpi-label">{{ $t('telemetry.laggingNodes') }}</span>
            <span class="nodes-telemetry-page__ethstats-kpi-value">{{ formatNumber(liveTelemetryStats.laggingNodes) }}</span>
          </div>
        </div>

        <div class="nodes-telemetry-page__ethstats-view-toggle">
          <button
            type="button"
            :data-active="pulseViewMode === 'graphs'"
            @click="pulseViewMode = 'graphs'"
          >
            {{ $t('telemetry.graphView') }}
          </button>
          <button
            type="button"
            :data-active="pulseViewMode === 'map'"
            @click="pulseViewMode = 'map'"
          >
            {{ $t('telemetry.mapView') }}
          </button>
        </div>

        <div class="nodes-telemetry-page__ethstats-history-window">
          <button
            v-for="windowSize in historyWindowOptions"
            :key="windowSize"
            type="button"
            :data-active="historyWindow === windowSize"
            @click="historyWindow = windowSize"
          >
            {{ windowSize }}
          </button>
        </div>

        <div
          v-if="pulseViewMode === 'graphs'"
          class="nodes-telemetry-page__ethstats-graphs"
        >
          <div class="nodes-telemetry-page__ethstats-graph">
            <div class="nodes-telemetry-page__ethstats-graph-header">
              <span class="h-sm">{{ $t('telemetry.pingMedian') }}</span>
              <span class="row-text-monospace">{{ formatLatencyMs(liveTelemetryStats.medianPingMs) }}</span>
            </div>
            <svg
              v-if="pingSparklinePoints"
              viewBox="0 0 100 36"
              preserveAspectRatio="none"
            >
              <polyline
                :points="pingSparklinePoints"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span
              v-else
              class="row-text"
            >—</span>
          </div>
          <div class="nodes-telemetry-page__ethstats-graph">
            <div class="nodes-telemetry-page__ethstats-graph-header">
              <span class="h-sm">{{ $t('telemetry.propagationSpread') }}</span>
              <span class="row-text-monospace">{{ propagationSummary }}</span>
            </div>
            <svg
              v-if="propagationSparklinePoints"
              viewBox="0 0 100 36"
              preserveAspectRatio="none"
            >
              <polyline
                :points="propagationSparklinePoints"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span
              v-else
              class="row-text"
            >—</span>
          </div>
          <div class="nodes-telemetry-page__ethstats-graph">
            <div class="nodes-telemetry-page__ethstats-graph-header">
              <span class="h-sm">{{ $t('telemetry.queueMedian') }}</span>
              <span class="row-text-monospace">
                <template v-if="liveTelemetryStats.medianQueuePercent !== null">
                  {{ formatNumber(Math.round(liveTelemetryStats.medianQueuePercent)) }}%
                </template>
                <template v-else>—</template>
              </span>
            </div>
            <svg
              v-if="queueSparklinePoints"
              viewBox="0 0 100 36"
              preserveAspectRatio="none"
            >
              <polyline
                :points="queueSparklinePoints"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span
              v-else
              class="row-text"
            >—</span>
          </div>
        </div>
        <div
          v-else
          class="nodes-telemetry-page__ethstats-map"
        >
          <div class="nodes-telemetry-page__ethstats-map-controls">
            <button
              type="button"
              @click="zoomMap(0.2)"
            >
              +
            </button>
            <button
              type="button"
              @click="zoomMap(-0.2)"
            >
              -
            </button>
            <button
              type="button"
              @click="resetMapView"
            >
              1x
            </button>
          </div>
          <svg
            v-if="nodeMapPoints.length"
            ref="mapSvg"
            viewBox="0 0 100 52"
            preserveAspectRatio="none"
            tabindex="0"
            role="img"
            :aria-label="$t('telemetry.networkPulse')"
            @wheel.prevent="onMapWheel"
            @pointerdown="onMapPointerDown"
            @pointermove="onMapPointerMove"
            @pointerup="onMapPointerUp"
            @pointercancel="onMapPointerUp"
            @pointerleave="onMapPointerUp"
            @keydown="onMapKeyPan"
          >
            <defs>
              <linearGradient
                id="pulseMapBackground"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stop-color="#3b82f6"
                  stop-opacity="0.25"
                />
                <stop
                  offset="100%"
                  stop-color="#22c55e"
                  stop-opacity="0.15"
                />
              </linearGradient>
            </defs>
            <rect
              x="0"
              y="0"
              width="100"
              height="52"
              fill="url(#pulseMapBackground)"
              rx="2"
            />
            <g :transform="mapTransform">
              <circle
                v-for="node in nodeMapPoints"
                :key="node.key"
                :cx="node.x"
                :cy="node.y"
                :r="selectedMapNodeKey === node.key ? 2.25 : node.connected ? 1.8 : 1.2"
                :class="[
                  'nodes-telemetry-page__ethstats-map-point',
                  node.connected ? 'nodes-telemetry-page__ethstats-map-point--connected' : '',
                  selectedMapNodeKey === node.key ? 'nodes-telemetry-page__ethstats-map-point--selected' : ''
                ]"
                :aria-label="`${node.url} · ${$t(node.connected ? 'telemetry.statusConnected' : 'telemetry.statusDisconnected')}`"
                role="button"
                tabindex="0"
                @mouseenter="onMapNodeHover(node.key)"
                @mouseleave="onMapNodeHover(null)"
                @focus="onMapNodeHover(node.key)"
                @blur="onMapNodeHover(null)"
                @click="toggleMapNodeSelection(node.key)"
                @keydown.enter.prevent="toggleMapNodeSelection(node.key)"
                @keydown.space.prevent="toggleMapNodeSelection(node.key)"
              />
            </g>
          </svg>
          <span
            v-else
            class="row-text"
          >{{ $t('telemetry.noNodeMapData') }}</span>
          <div
            v-if="activeMapNode && activeMapNodePosition"
            class="nodes-telemetry-page__ethstats-map-tooltip"
            :style="{ left: `${activeMapNodePosition.x}%`, top: `${activeMapNodePosition.y}%` }"
          >
            <span class="row-text-monospace">{{ activeMapNode.url }}</span>
            <span class="row-text">{{ activeMapNode.locationLabel }}</span>
            <span class="row-text-monospace">
              RTT: {{ formatLatencyMs(activeMapNode.pingMs) }} / {{ formatLatencyMs(activeMapNode.p95PingMs) }}
            </span>
            <span class="row-text-monospace">
              Δprop: {{ formatLatencyMs(activeMapNode.propagationMs) }}
            </span>
          </div>
          <div class="nodes-telemetry-page__ethstats-map-legend">
            <span>{{ $t('telemetry.mapLegendConnected') }}: {{ formatNumber(connectedMapPointsCount) }}</span>
            <span>{{ $t('telemetry.mapLegendDisconnected') }}: {{ formatNumber(disconnectedMapPointsCount) }}</span>
          </div>
        </div>

        <span class="row-text nodes-telemetry-page__ethstats-note">{{ $t('telemetry.ethstatsDerivedFromCommit') }}</span>

        <div
          v-if="showNodeComparison && pinnedNode && compareNode"
          class="nodes-telemetry-page__ethstats-compare"
          data-test="pulse-compare-panel"
        >
          <div class="nodes-telemetry-page__ethstats-compare-head">
            <span class="h-sm">{{ $t('telemetry.nodeCompareTitle') }}</span>
            <span class="row-text">{{ $t('telemetry.nodeCompareHint') }}</span>
          </div>
          <div class="nodes-telemetry-page__ethstats-compare-columns">
            <div class="nodes-telemetry-page__ethstats-compare-column nodes-telemetry-page__ethstats-compare-column--label">
              <span class="h-sm">{{ $t('telemetry.metric') }}</span>
              <span
                v-for="row in nodeComparisonRows"
                :key="`label-${row.key}`"
                class="row-text"
              >{{ $t(row.labelKey) }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-compare-column">
              <span class="h-sm">{{ $t('telemetry.pinnedNode') }}</span>
              <BaseHash
                :hash="pinnedNode.url"
                :link="pinnedNode.url"
                type="short"
                copy
              />
              <span
                v-for="row in nodeComparisonRows"
                :key="`pinned-${row.key}`"
                class="row-text-monospace"
              >{{ row.pinnedValue }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-compare-column">
              <span class="h-sm">{{ $t('telemetry.compareNode') }}</span>
              <BaseHash
                :hash="compareNode.url"
                :link="compareNode.url"
                type="short"
                copy
              />
              <span
                v-for="row in nodeComparisonRows"
                :key="`compare-${row.key}`"
                class="row-text-monospace"
              >{{ row.compareValue }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="nodePulseRows.length"
          class="nodes-telemetry-page__ethstats-node-grid"
        >
          <div
            v-for="node in nodePulseRows"
            :key="node.key"
            class="nodes-telemetry-page__ethstats-node"
            :data-selected="selectedMapNodeKey === node.key"
            :data-pinned="pinnedNodeKey === node.key"
            :data-compare="compareNodeKey === node.key"
          >
            <div class="nodes-telemetry-page__ethstats-node-head">
              <span
                class="nodes-telemetry-page__ethstats-node-status"
                :data-connected="node.connected"
              >◉</span>
              <BaseHash
                :hash="node.url"
                :link="node.url"
                :type="hashType"
                copy
              />
            </div>
            <div class="nodes-telemetry-page__ethstats-node-actions">
              <span
                v-if="node.telemetryUnsupported"
                class="nodes-telemetry-page__ethstats-node-chip"
              >{{ $t('telemetry.filterUnsupportedNodes') }}</span>
              <button
                type="button"
                :data-test="`pulse-pin-node-${node.key}`"
                :data-active="pinnedNodeKey === node.key"
                :aria-pressed="pinnedNodeKey === node.key"
                @click="togglePinnedNode(node.key)"
              >
                {{ pinnedNodeKey === node.key ? $t('telemetry.unpinNode') : $t('telemetry.pinNode') }}
              </button>
              <button
                type="button"
                :data-test="`pulse-compare-node-${node.key}`"
                :data-active="compareNodeKey === node.key"
                :aria-pressed="compareNodeKey === node.key"
                :disabled="!canCompareNode(node.key)"
                @click="toggleCompareNode(node.key)"
              >
                {{ compareNodeKey === node.key ? $t('telemetry.clearCompare') : $t('telemetry.compareNode') }}
              </button>
            </div>
            <span class="row-text nodes-telemetry-page__ethstats-node-location">{{ node.locationLabel }}</span>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.block') }}</span>
              <span class="row-text-monospace">
                <template v-if="node.block !== null">#{{ formatNumber(node.block) }}</template>
                <template v-else>—</template>
                <span v-if="node.blockDelta"> ({{ node.blockDelta }})</span>
              </span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.pingFromCommit') }}</span>
              <span class="row-text-monospace">{{ formatLatencyMs(node.pingMs) }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.pingP95') }}</span>
              <span class="row-text-monospace">{{ formatLatencyMs(node.p95PingMs) }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.avgCommitTime') }}</span>
              <span class="row-text-monospace">{{ formatLatencyMs(node.avgPingMs) }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.estimatedPropagation') }}</span>
              <span class="row-text-monospace">{{ formatLatencyMs(node.propagationMs) }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-grid-row">
              <span>{{ $t('telemetry.queue') }}</span>
              <span class="row-text-monospace">{{ node.queueUsage }}</span>
            </div>
            <div class="nodes-telemetry-page__ethstats-node-queue-track">
              <span :style="{ width: `${node.queueFillPercent ?? 0}%` }" />
            </div>
          </div>
        </div>
        <span
          v-else
          class="row-text nodes-telemetry-page__ethstats-empty"
        >{{ $t(pulseFilterMode === 'ALL' ? 'telemetry.noNodeTelemetry' : 'telemetry.noFilteredNodes') }}</span>

        <div
          v-if="isTelemetryEventDrawerOpen"
          :id="telemetryEventDrawerId"
          class="nodes-telemetry-page__ethstats-events"
          role="region"
          :aria-label="$t('telemetry.rawEvents')"
          data-test="pulse-events-drawer"
        >
          <div class="nodes-telemetry-page__ethstats-events-toolbar">
            <label
              :for="telemetryEventSearchInputId"
              class="row-text nodes-telemetry-page__ethstats-events-search-label"
            >{{ $t('telemetry.searchEvents') }}</label>
            <input
              :id="telemetryEventSearchInputId"
              v-model="telemetryEventSearchQuery"
              type="search"
              class="nodes-telemetry-page__ethstats-events-search"
              :placeholder="$t('telemetry.searchEventsPlaceholder')"
              @keydown.esc.stop.prevent="clearTelemetryEventSearch"
            >
            <div class="nodes-telemetry-page__ethstats-events-actions">
              <span
                class="row-text-monospace nodes-telemetry-page__ethstats-events-count"
                data-test="pulse-events-count"
              >
                {{ telemetryEventMatchCountLabel }}
              </span>
              <button
                type="button"
                data-test="pulse-copy-link"
                @click="copyTelemetryOpsLink"
              >
                {{ $t('transactions.copyInstructionLink') }}
              </button>
              <button
                type="button"
                :disabled="!selectedTelemetryEvent"
                @click="copySelectedTelemetryEvent"
              >
                {{ $t('telemetry.copyEventJson') }}
              </button>
              <button
                type="button"
                :disabled="filteredTelemetryEvents.length === 0"
                @click="exportTelemetryEvents"
              >
                {{ $t('telemetry.exportEvents') }}
              </button>
            </div>
          </div>
          <div
            class="nodes-telemetry-page__ethstats-events-list"
            role="listbox"
            :aria-label="$t('telemetry.rawEvents')"
            :aria-activedescendant="selectedTelemetryEventOptionId"
            tabindex="0"
            @keydown.down.prevent="moveSelectedTelemetryEvent(1)"
            @keydown.up.prevent="moveSelectedTelemetryEvent(-1)"
            @keydown.home.prevent="selectTelemetryEventBoundary('first')"
            @keydown.end.prevent="selectTelemetryEventBoundary('last')"
          >
            <button
              v-for="event in filteredTelemetryEvents"
              :id="telemetryEventOptionId(event.id)"
              :key="event.id"
              type="button"
              role="option"
              :data-active="selectedTelemetryEventId === event.id"
              :aria-selected="selectedTelemetryEventId === event.id"
              :data-test="`pulse-event-${event.id}`"
              @click="selectTelemetryEvent(event.id)"
            >
              <span class="h-sm">{{ $t(resolveTelemetryEventLabelKey(event.kind)) }}</span>
              <span class="row-text-monospace">{{ formatSampleAge(event.receivedAtMs) }}</span>
              <time
                class="row-text-monospace nodes-telemetry-page__ethstats-events-absolute-time"
                :datetime="toIsoTimestamp(event.receivedAtMs)"
              >{{ formatSampleAbsoluteTime(event.receivedAtMs) }}</time>
              <span
                v-if="summarizeTelemetryEventPayload(event.payload)"
                class="row-text-monospace nodes-telemetry-page__ethstats-events-summary"
              >{{ summarizeTelemetryEventPayload(event.payload) }}</span>
            </button>
            <span
              v-if="filteredTelemetryEvents.length === 0"
              class="row-text nodes-telemetry-page__ethstats-empty"
            >{{ $t('telemetry.noEvents') }}</span>
          </div>
          <div
            v-if="selectedTelemetryEvent"
            class="nodes-telemetry-page__ethstats-events-detail"
          >
            <div class="nodes-telemetry-page__ethstats-events-detail-head">
              <span class="h-sm">{{ $t(resolveTelemetryEventLabelKey(selectedTelemetryEvent.kind)) }}</span>
              <div class="nodes-telemetry-page__ethstats-events-detail-meta">
                <span class="row-text-monospace">{{ formatSampleAge(selectedTelemetryEvent.receivedAtMs) }}</span>
                <time
                  class="row-text-monospace"
                  :datetime="toIsoTimestamp(selectedTelemetryEvent.receivedAtMs)"
                >{{ formatSampleAbsoluteTime(selectedTelemetryEvent.receivedAtMs) }}</time>
              </div>
            </div>
            <pre>{{ selectedTelemetryEventPayload }}</pre>
          </div>
        </div>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.sumeragiConsensus')"
      class="nodes-telemetry-page__section"
    >
      <template #header-action>
        <div class="nodes-telemetry-page__trust-badges">
          <span
            class="nodes-telemetry-page__stream-indicator"
            :data-status="sumeragiStreamStatus"
          >
            {{ $t(consensusStreamStatusKey) }}
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="consensusSourceTone"
          >
            {{ $t('telemetry.dataTrustSource') }}: {{ $t(consensusSourceLabelKey) }}
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="consensusSampleTone"
          >
            {{ $t('telemetry.dataTrustSampleAge') }}: {{ consensusSampleAgeLabel }}
            <span class="nodes-telemetry-page__trust-chip-meta">({{ $t(consensusSampleLabelKey) }})</span>
          </span>
        </div>
      </template>
      <div class="nodes-telemetry-page__section-body">
        <BaseLoading
          v-if="isSumeragiStatusLoading"
          class="nodes-telemetry-page_loading"
        />
        <template v-else-if="sumeragiStatus">
          <div class="nodes-telemetry-page__consensus-grid">
            <div
              v-for="card in consensusCards"
              :key="card.key"
              class="nodes-telemetry-page__consensus-card"
              :data-saturated="card.key === 'queue' && sumeragiStatus.tx_queue.saturated"
            >
              <span class="nodes-telemetry-page__consensus-card-value">{{ card.value }}</span>
              <span class="nodes-telemetry-page__consensus-card-label">{{ $t(card.label) }}</span>
              <span
                v-if="card.meta"
                class="nodes-telemetry-page__consensus-card-meta"
              >{{ $t(card.meta) }}</span>
            </div>
          </div>

          <div
            v-if="sumeragiChainSnapshot"
            class="nodes-telemetry-page__sumeragi-chain"
          >
            <div class="nodes-telemetry-page__sumeragi-chain-head">
              <span class="h-sm">{{ $t('telemetry.sumeragiChain') }}</span>
              <span class="nodes-telemetry-page__sumeragi-chain-chip">
                {{ $t('telemetry.viewChangeIndex') }} v{{ formatNumber(sumeragiChainSnapshot.view) }}
              </span>
            </div>
            <div class="nodes-telemetry-page__sumeragi-chain-grid">
              <div class="nodes-telemetry-page__sumeragi-chain-card">
                <span class="nodes-telemetry-page__sumeragi-chain-label">{{ $t('telemetry.snapshotHeight') }}</span>
                <span class="nodes-telemetry-page__sumeragi-chain-value">#{{ formatNumber(sumeragiChainSnapshot.height) }}</span>
              </div>
              <div class="nodes-telemetry-page__sumeragi-chain-card">
                <span class="nodes-telemetry-page__sumeragi-chain-label">{{ $t('telemetry.epoch') }}</span>
                <span class="nodes-telemetry-page__sumeragi-chain-value">#{{ formatNumber(sumeragiChainSnapshot.epoch) }}</span>
              </div>
              <div class="nodes-telemetry-page__sumeragi-chain-card nodes-telemetry-page__sumeragi-chain-card--hash">
                <span class="nodes-telemetry-page__sumeragi-chain-label">{{ $t('telemetry.membershipViewHash') }}</span>
                <BaseHash
                  v-if="sumeragiChainSnapshot.viewHash"
                  :hash="sumeragiChainSnapshot.viewHash"
                  type="short"
                  copy
                />
                <span
                  v-else
                  class="row-text"
                >—</span>
              </div>
            </div>
          </div>

          <div
            v-if="viewChangeProofs.length || penaltyStats"
            class="nodes-telemetry-page__consensus-details"
          >
            <div
              v-if="viewChangeProofs.length"
              class="nodes-telemetry-page__view-change"
            >
              <span class="h-sm">{{ $t('telemetry.viewChangeProofs') }}</span>
              <div class="nodes-telemetry-page__view-change-grid">
                <div
                  v-for="entry in viewChangeProofs"
                  :key="entry.key"
                  class="nodes-telemetry-page__view-change-item"
                >
                  <span class="nodes-telemetry-page__view-change-label">{{ $t(entry.label) }}</span>
                  <span class="nodes-telemetry-page__view-change-value">{{ formatNumber(entry.value) }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="penaltyStats"
              class="nodes-telemetry-page__penalties"
            >
              <span class="h-sm">{{ $t('telemetry.penalties') }}</span>
              <div class="nodes-telemetry-page__penalties-grid">
                <div class="nodes-telemetry-page__penalties-row">
                  <span>{{ $t('telemetry.consensusPenaltiesApplied') }}</span>
                  <span class="row-text-monospace">{{ formatNumber(penaltyStats.consensusApplied) }}</span>
                </div>
                <div class="nodes-telemetry-page__penalties-row">
                  <span>{{ $t('telemetry.consensusPenaltiesPending') }}</span>
                  <span class="row-text-monospace">{{ formatNumber(penaltyStats.consensusPending) }}</span>
                </div>
                <div class="nodes-telemetry-page__penalties-row">
                  <span>{{ $t('telemetry.vrfPenaltiesApplied') }}</span>
                  <span class="row-text-monospace">{{ formatNumber(penaltyStats.vrfApplied) }}</span>
                </div>
                <div class="nodes-telemetry-page__penalties-row">
                  <span>{{ $t('telemetry.vrfPenaltiesPending') }}</span>
                  <span class="row-text-monospace">{{ formatNumber(penaltyStats.vrfPending) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="nodes-telemetry-page__prf">
            <span class="h-sm">{{ $t('telemetry.prfSeed') }}</span>
            <BaseHash
              v-if="sumeragiStatus.prf.epoch_seed"
              :hash="sumeragiStatus.prf.epoch_seed"
              type="short"
              copy
            />
            <span
              v-else
              class="row-text"
            >—</span>
          </div>
        </template>
        <span
          v-else
          class="row-text"
        >{{ $t('telemetry.telemetryUnavailable') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.vrfAndRbc')"
      class="nodes-telemetry-page__section"
    >
      <template #header-action>
        <BaseButton
          size="xs"
          variant="secondary"
          @click="refreshSumeragiTelemetry"
        >
          {{ $t('telemetry.refreshTelemetry') }}
        </BaseButton>
      </template>
      <div class="nodes-telemetry-page__section-body">
        <BaseLoading
          v-if="isSumeragiTelemetryLoading"
          class="nodes-telemetry-page_loading"
        />
        <template v-else-if="sumeragiTelemetry">
          <div
            v-if="rbcStats.length"
            class="nodes-telemetry-page__rbc-grid"
          >
            <div
              v-for="stat in rbcStats"
              :key="stat.key"
              class="nodes-telemetry-page__rbc-card"
            >
              <span class="nodes-telemetry-page__rbc-card-value">{{ stat.value }}</span>
              <span class="nodes-telemetry-page__rbc-card-label">{{ $t(stat.label) }}</span>
            </div>
          </div>

          <div
            v-if="rbcStoreStats"
            class="nodes-telemetry-page__rbc-store"
          >
            <div class="nodes-telemetry-page__rbc-grid nodes-telemetry-page__rbc-store-grid">
              <div class="nodes-telemetry-page__rbc-card">
                <span class="nodes-telemetry-page__rbc-card-value">{{ formatNumber(rbcStoreStats.sessions) }}</span>
                <span class="nodes-telemetry-page__rbc-card-label">{{ $t('telemetry.rbcStoreSessions') }}</span>
              </div>
              <div class="nodes-telemetry-page__rbc-card">
                <span class="nodes-telemetry-page__rbc-card-value">{{ formatNumber(rbcStoreStats.bytes) }} B</span>
                <span class="nodes-telemetry-page__rbc-card-label">{{ $t('telemetry.rbcStoreBytes') }}</span>
              </div>
              <div class="nodes-telemetry-page__rbc-card">
                <span class="nodes-telemetry-page__rbc-card-value">{{ formatNumber(rbcStoreStats.pressure) }}</span>
                <span class="nodes-telemetry-page__rbc-card-label">{{ $t('telemetry.rbcStorePressure') }}</span>
              </div>
              <div class="nodes-telemetry-page__rbc-card">
                <span class="nodes-telemetry-page__rbc-card-value">{{ formatNumber(rbcStoreStats.backpressureDeferrals) }}</span>
                <span class="nodes-telemetry-page__rbc-card-label">{{ $t('telemetry.backpressureDeferrals') }}</span>
              </div>
              <div class="nodes-telemetry-page__rbc-card">
                <span class="nodes-telemetry-page__rbc-card-value">{{ formatNumber(rbcStoreStats.evictions) }}</span>
                <span class="nodes-telemetry-page__rbc-card-label">{{ $t('telemetry.rbcEvictions') }}</span>
              </div>
            </div>
            <div class="nodes-telemetry-page__rbc-evictions">
              <span class="h-sm">{{ $t('telemetry.recentEvictions') }}</span>
              <ul class="nodes-telemetry-page__rbc-evictions-list">
                <li
                  v-for="eviction in rbcStoreStats.recentEvictions"
                  :key="`${eviction.block_hash}-${eviction.height}-${eviction.view}`"
                  class="nodes-telemetry-page__rbc-evictions-item"
                >
                  <BaseHash
                    :hash="eviction.block_hash"
                    type="short"
                    class="row-text-monospace"
                  />
                  <span class="row-text">#{{ formatNumber(eviction.height) }} · v{{ formatNumber(eviction.view) }}</span>
                </li>
                <li
                  v-if="rbcStoreStats.recentEvictions.length === 0"
                  class="row-text nodes-telemetry-page__rbc-evictions-empty"
                >
                  {{ $t('telemetry.noRbcEvictions') }}
                </li>
              </ul>
            </div>
          </div>

          <div class="nodes-telemetry-page__vrf-grid">
            <div
              v-if="vrfSummary"
              class="nodes-telemetry-page__vrf-summary"
            >
              <div>
                <span class="h-sm">{{ $t('telemetry.epoch') }}</span>
                <span class="nodes-telemetry-page__vrf-value">#{{ formatNumber(vrfSummary.epoch) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.finalized') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ vrfSummary.finalized ? $t('telemetry.finalizedYes') : $t('telemetry.finalizedNo') }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.seed') }}</span>
                <BaseHash
                  v-if="vrfSummary.seed_hex"
                  :hash="vrfSummary.seed_hex"
                  type="short"
                  copy
                />
                <span
                  v-else
                  class="row-text"
                >—</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.participants') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfSummary.participants_total) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.commitments') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfSummary.commitments_total) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.reveals') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfSummary.reveals_total) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.lateReveals') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfSummary.late_reveals_total) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.committedNoReveal') }}</span>
                <span class="row-text">{{ formatIndexList(vrfSummary.committed_no_reveal) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.noParticipation') }}</span>
                <span class="row-text">{{ formatIndexList(vrfSummary.no_participation) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.lateRevealsDetails') }}</span>
                <ul class="nodes-telemetry-page__late-reveals">
                  <li
                    v-for="entry in vrfSummary.late_reveals"
                    :key="`${entry.signer}-${entry.noted_at_height}`"
                  >
                    {{ $t('telemetry.lateRevealEntry', [entry.signer, formatNumber(entry.noted_at_height)]) }}
                  </li>
                  <li v-if="vrfSummary.late_reveals.length === 0">
                    —
                  </li>
                </ul>
              </div>
            </div>

            <div
              v-if="vrfPenaltyStats"
              class="nodes-telemetry-page__vrf-penalties"
            >
              <div>
                <span class="h-sm">{{ $t('telemetry.vrfPenaltyEpoch') }}</span>
                <span class="nodes-telemetry-page__vrf-value">#{{ formatNumber(vrfPenaltyStats.epoch) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.committedNoReveal') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfPenaltyStats.committedNoReveal) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.noParticipation') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfPenaltyStats.noParticipation) }}</span>
              </div>
              <div>
                <span class="h-sm">{{ $t('telemetry.vrfLateReveals') }}</span>
                <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(vrfPenaltyStats.lateReveals) }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="qcLatencyRows.length"
            class="nodes-telemetry-page__qc-latency"
          >
            <div class="nodes-telemetry-page__qc-latency-row nodes-telemetry-page__qc-latency-row--header">
              <span>{{ $t('telemetry.kind') }}</span>
              <span>{{ $t('telemetry.lastLatency') }}</span>
            </div>
            <div
              v-for="row in qcLatencyRows"
              :key="row.kind"
              class="nodes-telemetry-page__qc-latency-row"
            >
              <span>{{ row.kind }}</span>
              <span>{{ formatNumber(row.last_ms) }} ms</span>
            </div>
          </div>
        </template>
        <span
          v-else
          class="row-text"
        >{{ $t('telemetry.telemetryUnavailable') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.settlementAndNexus')"
      class="nodes-telemetry-page__section"
    >
      <div class="nodes-telemetry-page__section-body">
        <BaseLoading
          v-if="isSumeragiStatusLoading"
          class="nodes-telemetry-page_loading"
        />
        <template v-else-if="sumeragiStatus">
          <div
            v-if="settlementSides.length"
            class="nodes-telemetry-page__settlement"
          >
            <div
              v-for="side in settlementSides"
              :key="side.key"
              class="nodes-telemetry-page__settlement-card"
            >
              <div class="nodes-telemetry-page__settlement-header">
                <span class="h-sm">{{ $t(side.label) }}</span>
                <span class="row-text">{{ $t('telemetry.successTotal') }}: {{ formatNumber(side.data.success_total) }}</span>
                <span class="row-text">{{ $t('telemetry.failureTotal') }}: {{ formatNumber(side.data.failure_total) }}</span>
              </div>
              <div class="nodes-telemetry-page__settlement-list">
                <span class="h-sm">{{ $t('telemetry.finalStates') }}</span>
                <ul>
                  <li
                    v-for="(value, key) in side.data.final_state_totals"
                    :key="`${side.key}-state-${key}`"
                  >
                    {{ key }} — {{ formatNumber(value) }}
                  </li>
                  <li
                    v-if="Object.keys(side.data.final_state_totals).length === 0"
                    class="row-text"
                  >
                    {{ $t('telemetry.noData') }}
                  </li>
                </ul>
              </div>
              <div class="nodes-telemetry-page__settlement-list">
                <span class="h-sm">{{ $t('telemetry.failureReasons') }}</span>
                <ul>
                  <li
                    v-for="(value, key) in side.data.failure_reasons"
                    :key="`${side.key}-reason-${key}`"
                  >
                    {{ key }} — {{ formatNumber(value) }}
                  </li>
                  <li
                    v-if="Object.keys(side.data.failure_reasons).length === 0"
                    class="row-text"
                  >
                    {{ $t('telemetry.noData') }}
                  </li>
                </ul>
              </div>
              <div class="nodes-telemetry-page__settlement-last">
                <span class="h-sm">{{ $t('telemetry.lastEvent') }}</span>
                <template v-if="side.data.last_event">
                  <div class="nodes-telemetry-page__settlement-last-grid">
                    <span class="row-text">{{ $t('telemetry.settlementOutcome') }}: {{ side.data.last_event.outcome }}</span>
                    <span class="row-text">{{ $t('telemetry.settlementFinalState') }}: {{ side.data.last_event.final_state }}</span>
                    <span class="row-text">
                      {{ $t('telemetry.settlementPlan') }}:
                      {{ side.data.last_event.plan.order }} · {{ side.data.last_event.plan.atomicity }}
                    </span>
                    <span
                      v-if="side.data.last_event.settlement_id"
                      class="row-text"
                    >
                      {{ $t('telemetry.settlementId') }}: {{ side.data.last_event.settlement_id }}
                    </span>
                    <span class="row-text">
                      {{ $t('telemetry.settlementLegs') }}:
                      <template v-if="'delivery_committed' in side.data.last_event.legs">
                        {{ $t('telemetry.deliveryPaymentLegs', [
                          side.data.last_event.legs.delivery_committed ? $t('telemetry.committedYes') : $t('telemetry.committedNo'),
                          side.data.last_event.legs.payment_committed ? $t('telemetry.committedYes') : $t('telemetry.committedNo'),
                        ]) }}
                      </template>
                      <template v-else>
                        {{ $t('telemetry.primaryCounterLegs', [
                          side.data.last_event.legs.primary_committed ? $t('telemetry.committedYes') : $t('telemetry.committedNo'),
                          side.data.last_event.legs.counter_committed ? $t('telemetry.committedYes') : $t('telemetry.committedNo'),
                        ]) }}
                      </template>
                    </span>
                    <span
                      v-if="'fx_window_ms' in side.data.last_event && side.data.last_event.fx_window_ms !== null"
                      class="row-text"
                    >
                      {{ $t('telemetry.fxWindowMs') }}: {{ formatNumber(side.data.last_event.fx_window_ms) }} ms
                    </span>
                  </div>
                </template>
                <span
                  v-else
                  class="row-text"
                >{{ $t('telemetry.noSettlementEvents') }}</span>
              </div>
            </div>
          </div>

          <div class="nodes-telemetry-page__nexus">
            <div
              v-if="nexusFee"
              class="nodes-telemetry-page__nexus-fee"
            >
              <span class="h-sm">{{ $t('telemetry.nexusFee') }}</span>
              <div class="nodes-telemetry-page__nexus-fee-grid">
                <span>{{ $t('telemetry.chargedTotal') }}: {{ formatNumber(nexusFee.charged_total) }}</span>
                <span>{{ $t('telemetry.chargedViaPayer') }}: {{ formatNumber(nexusFee.charged_via_payer_total) }}</span>
                <span>{{ $t('telemetry.chargedViaSponsor') }}: {{ formatNumber(nexusFee.charged_via_sponsor_total) }}</span>
                <span>{{ $t('telemetry.sponsorDisabled') }}: {{ formatNumber(nexusFee.sponsor_disabled_total) }}</span>
                <span>{{ $t('telemetry.sponsorCapExceeded') }}: {{ formatNumber(nexusFee.sponsor_cap_exceeded_total) }}</span>
                <span>{{ $t('telemetry.configErrors') }}: {{ formatNumber(nexusFee.config_errors_total) }}</span>
                <span>{{ $t('telemetry.transferFailures') }}: {{ formatNumber(nexusFee.transfer_failures_total) }}</span>
                <span>
                  {{ $t('telemetry.lastAmount') }}:
                  {{ nexusFee.last_amount ?? '—' }}
                </span>
                <span>{{ $t('telemetry.lastAsset') }}: {{ nexusFee.last_asset_id ?? '—' }}</span>
                <span>{{ $t('telemetry.lastPayer') }}: {{ nexusFee.last_payer ?? '—' }}</span>
                <span>{{ $t('telemetry.lastPayerId') }}: {{ nexusFee.last_payer_id ?? '—' }}</span>
                <span>{{ $t('telemetry.lastError') }}: {{ nexusFee.last_error ?? '—' }}</span>
              </div>
            </div>

            <div class="nodes-telemetry-page__nexus-staking">
              <span class="h-sm">{{ $t('telemetry.nexusStaking') }}</span>
              <div
                v-if="nexusStaking?.lanes.length"
                class="nodes-telemetry-page__nexus-staking-table"
              >
                <div class="nodes-telemetry-page__nexus-staking-row nodes-telemetry-page__nexus-staking-row--header">
                  <span>{{ $t('telemetry.lane') }}</span>
                  <span>{{ $t('telemetry.bonded') }}</span>
                  <span>{{ $t('telemetry.pendingUnbond') }}</span>
                  <span>{{ $t('telemetry.slashTotal') }}</span>
                </div>
                <div
                  v-for="lane in nexusStaking?.lanes"
                  :key="lane.lane_id"
                  class="nodes-telemetry-page__nexus-staking-row"
                >
                  <span class="row-text">#{{ formatNumber(lane.lane_id) }}</span>
                  <span class="row-text">{{ lane.bonded }}</span>
                  <span class="row-text">{{ lane.pending_unbond }}</span>
                  <span class="row-text">{{ formatNumber(lane.slash_total) }}</span>
                </div>
              </div>
              <span
                v-else
                class="row-text nodes-telemetry-page__nexus-staking-empty"
              >{{ $t('telemetry.noStakingLanes') }}</span>
            </div>
          </div>
        </template>
        <span
          v-else
          class="row-text"
        >{{ $t('telemetry.telemetryUnavailable') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.nposElection')"
      class="nodes-telemetry-page__section"
    >
      <div class="nodes-telemetry-page__section-body">
        <BaseLoading
          v-if="isSumeragiStatusLoading"
          class="nodes-telemetry-page_loading"
        />
        <template v-else-if="nposElection">
          <div class="nodes-telemetry-page__npos-grid">
            <div>
              <span class="h-sm">{{ $t('telemetry.epoch') }}</span>
              <span class="nodes-telemetry-page__vrf-value">#{{ formatNumber(nposElection.epoch) }}</span>
            </div>
            <div>
              <span class="h-sm">{{ $t('telemetry.snapshotHeight') }}</span>
              <span class="nodes-telemetry-page__vrf-value">#{{ formatNumber(nposElection.snapshot_height) }}</span>
            </div>
            <div>
              <span class="h-sm">{{ $t('telemetry.candidates') }}</span>
              <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(nposElection.candidates_total) }}</span>
            </div>
            <div>
              <span class="h-sm">{{ $t('telemetry.validatorSet') }}</span>
              <span class="nodes-telemetry-page__vrf-value">{{ formatNumber(nposElection.validator_set.length) }}</span>
            </div>
            <div>
              <span class="h-sm">{{ $t('telemetry.validatorSetHash') }}</span>
              <BaseHash
                :hash="nposElection.validator_set_hash"
                type="short"
                copy
              />
            </div>
            <div>
              <span class="h-sm">{{ $t('telemetry.seed') }}</span>
              <BaseHash
                :hash="nposElection.seed"
                type="short"
                copy
              />
            </div>
          </div>
          <div
            v-if="blockProducerRows.length"
            class="nodes-telemetry-page__npos-producers"
          >
            <div class="nodes-telemetry-page__npos-producers-head">
              <span class="h-sm">{{ $t('telemetry.blockProducers') }}</span>
              <div class="nodes-telemetry-page__npos-producers-chips">
                <span class="nodes-telemetry-page__npos-producers-chip">
                  {{ $t('telemetry.validatorSet') }}: {{ formatNumber(blockProducerRows.length) }}
                </span>
                <span class="nodes-telemetry-page__npos-producers-chip">
                  {{ $t('telemetry.leaderIndex') }}: #{{ formatNumber(sumeragiStatus?.leader_index ?? 0) }}
                </span>
              </div>
            </div>
            <div class="nodes-telemetry-page__npos-producers-table-wrap">
              <div class="nodes-telemetry-page__npos-producers-table">
                <div class="nodes-telemetry-page__npos-producers-row nodes-telemetry-page__npos-producers-row--header">
                  <span>{{ $t('telemetry.producerIndex') }}</span>
                  <span>{{ $t('telemetry.publicKey') }}</span>
                </div>
                <div
                  v-for="producer in blockProducerRows"
                  :key="`${producer.index}-${producer.peerId}`"
                  class="nodes-telemetry-page__npos-producers-row"
                  :data-leader="producer.isLeader"
                >
                  <span class="row-text-monospace nodes-telemetry-page__npos-producers-index">#{{ formatNumber(producer.index) }}</span>
                  <div class="nodes-telemetry-page__npos-producers-peer">
                    <BaseHash
                      :hash="producer.peerId"
                      type="short"
                      copy
                      class="nodes-telemetry-page__npos-producers-hash"
                    />
                    <span
                      v-if="producer.isLeader"
                      class="nodes-telemetry-page__npos-producers-leader"
                    >{{ $t('telemetry.currentProducer') }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-if="currentBlockProducer"
              class="nodes-telemetry-page__npos-current-producer"
            >
              <span class="h-sm">{{ $t('telemetry.currentProducer') }}</span>
              <span class="nodes-telemetry-page__npos-producers-chip">#{{ formatNumber(currentBlockProducer.index) }}</span>
              <BaseHash
                :hash="currentBlockProducer.peerId"
                type="short"
                copy
              />
            </div>
          </div>
          <div class="nodes-telemetry-page__npos-params">
            <span class="h-sm">{{ $t('telemetry.params') }}</span>
            <div class="nodes-telemetry-page__npos-params-grid">
              <span>{{ $t('telemetry.maxValidators') }}: {{ formatNumber(nposElection.params.max_validators) }}</span>
              <span>{{ $t('telemetry.minSelfBond') }}: {{ formatNumber(nposElection.params.min_self_bond) }}</span>
              <span>{{ $t('telemetry.minNominationBond') }}: {{ formatNumber(nposElection.params.min_nomination_bond) }}</span>
              <span>{{ $t('telemetry.maxNominatorConcentration') }}: {{ formatNumber(nposElection.params.max_nominator_concentration_pct) }}%</span>
              <span>{{ $t('telemetry.seatBand') }}: {{ formatNumber(nposElection.params.seat_band_pct) }}%</span>
              <span>{{ $t('telemetry.maxEntityCorrelation') }}: {{ formatNumber(nposElection.params.max_entity_correlation_pct) }}%</span>
              <span>{{ $t('telemetry.finalityMarginBlocks') }}: {{ formatNumber(nposElection.params.finality_margin_blocks) }}</span>
            </div>
          </div>
          <div
            v-if="nposElection.rejection_reason"
            class="nodes-telemetry-page__npos-rejection row-text"
          >
            {{ $t('telemetry.rejectionReason') }}: {{ nposElection.rejection_reason }}
          </div>
          <div
            v-if="nposElection.tie_break.length"
            class="nodes-telemetry-page__npos-tie-break"
          >
            <span class="h-sm">{{ $t('telemetry.tieBreak') }}</span>
            <ul class="nodes-telemetry-page__npos-tie-break-list">
              <li
                v-for="entry in nposElection.tie_break"
                :key="entry.peer_id"
              >
                <BaseHash
                  :hash="entry.peer_id"
                  type="short"
                  class="row-text-monospace"
                />
                <span class="row-text">{{ entry.score }}</span>
              </li>
            </ul>
          </div>
        </template>
        <span
          v-else
          class="row-text"
        >{{ $t('telemetry.noElectionSnapshot') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.laneGovernance')"
      class="nodes-telemetry-page__section"
    >
      <div class="nodes-telemetry-page__section-body">
        <BaseLoading
          v-if="isSumeragiStatusLoading"
          class="nodes-telemetry-page_loading"
        />
        <template v-else-if="sumeragiStatus">
          <div class="nodes-telemetry-page__lane-governance-summary">
            <span class="h-sm">{{ $t('telemetry.sealedLanes') }}</span>
            <span class="row-text">
              {{ formatNumber(sumeragiStatus.lane_governance_sealed_total) }}
              <span v-if="sealedLaneAliases.length">({{ sealedLaneAliases.join(', ') }})</span>
            </span>
          </div>
          <div
            v-if="laneGovernance.length"
            class="nodes-telemetry-page__lane-governance-table"
          >
            <div class="nodes-telemetry-page__lane-governance-row nodes-telemetry-page__lane-governance-row--header">
              <span>{{ $t('telemetry.laneAlias') }}</span>
              <span>{{ $t('telemetry.governance') }}</span>
              <span>{{ $t('telemetry.manifestRequired') }}</span>
              <span>{{ $t('telemetry.manifestReady') }}</span>
              <span>{{ $t('telemetry.runtimeUpgrade') }}</span>
              <span>{{ $t('telemetry.privacyCommitments') }}</span>
            </div>
            <div
              v-for="lane in laneGovernance"
              :key="lane.lane_id"
              class="nodes-telemetry-page__lane-governance-row"
            >
              <span class="row-text">{{ lane.alias }} (#{{ formatNumber(lane.lane_id) }})</span>
              <span class="row-text">{{ lane.governance ?? '—' }}</span>
              <span class="row-text">{{ lane.manifest_required ? $t('telemetry.committedYes') : $t('telemetry.committedNo') }}</span>
              <span class="row-text">{{ lane.manifest_ready ? $t('telemetry.committedYes') : $t('telemetry.committedNo') }}</span>
              <span class="row-text">
                <template v-if="lane.runtime_upgrade">
                  {{ lane.runtime_upgrade.allow ? $t('telemetry.runtimeUpgradeAllowed') : $t('telemetry.runtimeUpgradeBlocked') }}
                </template>
                <template v-else>—</template>
              </span>
              <span class="row-text">{{ lane.privacy_commitments.length }}</span>
            </div>
          </div>
          <span
            v-else
            class="row-text nodes-telemetry-page__lane-governance-empty"
          >{{ $t('telemetry.noLaneGovernance') }}</span>
        </template>
        <span
          v-else
          class="row-text"
        >{{ $t('telemetry.telemetryUnavailable') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.availabilityCollectors')"
      class="nodes-telemetry-page__section"
    >
      <div class="nodes-telemetry-page__collectors">
        <div class="nodes-telemetry-page__collectors-row nodes-telemetry-page__collectors-row--header">
          <span>{{ $t('telemetry.collector') }}</span>
          <span>{{ $t('telemetry.peer') }}</span>
          <span>{{ $t('telemetry.votesIngested') }}</span>
        </div>
        <template v-if="availabilityCollectors.length">
          <div
            v-for="collector in availabilityCollectors"
            :key="collector.collector_idx"
            class="nodes-telemetry-page__collectors-row"
          >
            <span class="row-text">#{{ formatNumber(collector.collector_idx) }}</span>
            <BaseHash
              :hash="collector.peer_id"
              type="short"
              class="row-text-monospace"
            />
            <span class="row-text">{{ formatNumber(collector.votes_ingested) }}</span>
          </div>
        </template>
        <span
          v-else
          class="row-text nodes-telemetry-page__collectors-empty"
        >{{ $t('telemetry.noCollectorTelemetry') }}</span>
      </div>
    </BaseContentBlock>

    <BaseContentBlock
      :title="$t('telemetry.nodes')"
      class="nodes-telemetry-page__list"
    >
      <template #header-action>
        <div class="nodes-telemetry-page__trust-badges">
          <span
            class="nodes-telemetry-page__stream-indicator"
            :data-status="peersStreamStatus"
          >
            {{ $t(peersStreamStatusKey) }}
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="peersSourceTone"
          >
            {{ $t('telemetry.dataTrustSource') }}: {{ $t(peersSourceLabelKey) }}
            <span
              v-if="showFallbackPeersCount"
              class="nodes-telemetry-page__trust-chip-meta"
            >
              ({{ formatNumber(fallbackPeersCount) }})
            </span>
          </span>
          <span
            class="nodes-telemetry-page__trust-chip"
            :data-tone="peersSampleTone"
          >
            {{ $t('telemetry.dataTrustSampleAge') }}: {{ peersSampleAgeLabel }}
            <span class="nodes-telemetry-page__trust-chip-meta">({{ $t(peersSampleLabelKey) }})</span>
          </span>
        </div>
      </template>
      <BaseTable
        disable-pagination
        :loading="isPeersTableLoading"
        :items="peers"
        :row-key="peerRowKey"
        container-class="nodes-telemetry-page__list-container"
        :breakpoint="1440"
      >
        <template #header>
          <div class="nodes-telemetry-page__list-row">
            <span class="h-sm cell" />
            <span class="h-sm cell">{{ $t('telemetry.publicUrl') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.location') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.publicKey') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.connectedPeers') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.blocksGossiping') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.tnxsGossiping') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.block') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.commitTime') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.avgCommitTime') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.queue') }}</span>
            <span class="h-sm cell">{{ $t('telemetry.uptime') }}</span>
          </div>
        </template>

        <template #row="{ item }">
          <div
            v-if="item.info && item.info.telemetry_unsupported"
            class="nodes-telemetry-page__list-row_unsupported row-text cell"
          >
            <BaseLink :to="item.info.url">
              {{ item.info.url }}
            </BaseLink>
            - {{ $t('telemetry.peerDoesntProvideTelemetry') }}
          </div>
          <div
            v-else-if="item.info && item.status"
            class="nodes-telemetry-page__list-row"
          >
            <span
              class="nodes-telemetry-page__list-row-status row-text cell"
              :data-connected="item.info.connected"
            >◉</span>

            <BaseHash
              :hash="item.info.url"
              :link="item.info.url"
              copy
              class="cell"
              type="medium"
            />

            <div
              class="row-text cell nodes-telemetry-page__list-row-location"
              :class="{ 'nodes-telemetry-page__list-row-value_empty': !item.info.location }"
            >
              <template v-if="item.info.location">
                <span>{{ item.info.location.country }}</span>
                <span class="nodes-telemetry-page__list-row-location-city">{{ item.info.location.city }}</span>
              </template>
              <span v-else>Unknown</span>
            </div>

            <BaseHash
              v-if="item.info.config"
              :hash="item.info.config.public_key"
              type="medium"
              copy
              class="row-text-monospace cell"
            />
            <span
              v-else
              class="row-text cell"
            >Unknown</span>

            <span class="row-text-monospace cell">
              {{ item.info.connected_peers ? formatNumber(item.info.connected_peers.length) : '-' }}
            </span>

            <div
              v-if="item.info.config && item.info.config.network_block_gossip_size"
              class="nodes-telemetry-page__list-row-gossip row-text-monospace cell"
            >
              <span>{{ item.info.config.network_block_gossip_size }}</span>
              <ContextTooltip
                v-if="item.info.config.network_block_gossip_period?.ms"
                :message="
                  $t('telemetry.networkGossipDetails', [
                    item.info.config.network_block_gossip_size,
                    item.info.config.network_block_gossip_period.ms,
                  ])
                "
              />
            </div>
            <span
              v-else
              class="row-text cell"
            >-</span>

            <div
              v-if="item.info.config && item.info.config.network_tx_gossip_size"
              class="nodes-telemetry-page__list-row-gossip row-text-monospace cell"
            >
              <span>{{ item.info.config.network_tx_gossip_size }}</span>
              <ContextTooltip
                v-if="item.info.config.network_tx_gossip_period?.ms"
                :message="
                  $t('telemetry.networkGossipDetails', [
                    item.info.config.network_tx_gossip_size,
                    item.info.config.network_tx_gossip_period.ms,
                  ])
                "
              />
            </div>
            <span
              v-else
              class="row-text cell"
            >-</span>

            <div class="cell nodes-telemetry-page__list-row-block">
              <BaseLink
                monospace
                :to="`/blocks/${item.status.block}`"
              >
                {{ formatNumber(item.status.block) }}
              </BaseLink>
              <span
                v-if="formatBlockDelta(metrics?.block ?? null, item.status.block) !== null"
                class="nodes-telemetry-page__list-row-block-delta"
              >
                ({{ formatBlockDelta(metrics?.block ?? null, item.status.block) }})
              </span>
            </div>

            <span class="row-text-monospace cell">{{ formatTimestamp(item.status.commit_time.ms) }}</span>
            <span class="row-text-monospace cell">
              {{ item.status.avg_commit_time ? formatTimestamp(item.status.avg_commit_time.ms) : '-' }}
            </span>
            <span class="row-text-monospace cell">
              {{ formatQueueUsage(item.status.queue_size, item.info.config?.queue_capacity) }}
            </span>
            <span class="row-text-monospace cell">{{ formatTimestamp(item.status.uptime.ms) }}</span>
          </div>
          <div
            v-else-if="item.info"
            class="nodes-telemetry-page__list-row"
          >
            <span
              class="nodes-telemetry-page__list-row-status row-text cell"
              :data-connected="item.info.connected"
            >◉</span>

            <BaseHash
              :hash="item.info.url"
              :link="item.info.url"
              copy
              class="cell"
              type="medium"
            />

            <div
              class="row-text cell nodes-telemetry-page__list-row-location"
              :class="{ 'nodes-telemetry-page__list-row-value_empty': !item.info.location }"
            >
              <template v-if="item.info.location">
                <span>{{ item.info.location.country }}</span>
                <span class="nodes-telemetry-page__list-row-location-city">{{ item.info.location.city }}</span>
              </template>
              <span v-else>Unknown</span>
            </div>

            <BaseHash
              v-if="item.info.config"
              :hash="item.info.config.public_key"
              type="medium"
              copy
              class="row-text-monospace cell"
            />
            <span
              v-else
              class="row-text cell"
            >Unknown</span>

            <span class="row-text-monospace cell">
              {{ item.info.connected_peers ? formatNumber(item.info.connected_peers.length) : '-' }}
            </span>

            <div
              v-if="item.info.config && item.info.config.network_block_gossip_size"
              class="nodes-telemetry-page__list-row-gossip row-text-monospace cell"
            >
              <span>{{ item.info.config.network_block_gossip_size }}</span>
              <ContextTooltip
                v-if="item.info.config.network_block_gossip_period?.ms"
                :message="
                  $t('telemetry.networkGossipDetails', [
                    item.info.config.network_block_gossip_size,
                    item.info.config.network_block_gossip_period.ms,
                  ])
                "
              />
            </div>
            <span
              v-else
              class="row-text cell"
            >-</span>

            <div
              v-if="item.info.config && item.info.config.network_tx_gossip_size"
              class="nodes-telemetry-page__list-row-gossip row-text-monospace cell"
            >
              <span>{{ item.info.config.network_tx_gossip_size }}</span>
              <ContextTooltip
                v-if="item.info.config.network_tx_gossip_period?.ms"
                :message="
                  $t('telemetry.networkGossipDetails', [
                    item.info.config.network_tx_gossip_size,
                    item.info.config.network_tx_gossip_period.ms,
                  ])
                "
              />
            </div>
            <span
              v-else
              class="row-text cell"
            >-</span>

            <span class="row-text-monospace cell">-</span>
            <span class="row-text-monospace cell">-</span>
            <span class="row-text-monospace cell">-</span>
            <span class="row-text-monospace cell">
              {{ formatQueueUsage(null, item.info.config?.queue_capacity) }}
            </span>
            <span class="row-text-monospace cell">-</span>
          </div>
          <div
            v-else-if="item.status"
            class="nodes-telemetry-page__list-row"
          >
            <span class="nodes-telemetry-page__list-row-status row-text cell">◉</span>
            <span class="row-text cell">{{ item.status.url }}</span>
            <span class="row-text cell">Unknown</span>
            <span class="row-text cell">Unknown</span>
            <span class="row-text cell">-</span>
            <span class="row-text cell">-</span>
            <span class="row-text cell">-</span>

            <div class="cell nodes-telemetry-page__list-row-block">
              <BaseLink
                monospace
                :to="`/blocks/${item.status.block}`"
              >
                {{ formatNumber(item.status.block) }}
              </BaseLink>
              <span
                v-if="formatBlockDelta(metrics?.block ?? null, item.status.block) !== null"
                class="nodes-telemetry-page__list-row-block-delta"
              >
                ({{ formatBlockDelta(metrics?.block ?? null, item.status.block) }})
              </span>
            </div>

            <span class="row-text-monospace cell">{{ formatTimestamp(item.status.commit_time.ms) }}</span>
            <span class="row-text-monospace cell">
              {{ item.status.avg_commit_time ? formatTimestamp(item.status.avg_commit_time.ms) : '-' }}
            </span>
            <span class="row-text-monospace cell">{{ formatQueueUsage(item.status.queue_size, null) }}</span>
            <span class="row-text-monospace cell">{{ formatTimestamp(item.status.uptime.ms) }}</span>
          </div>
        </template>

        <template #mobile-card="{ item }">
          <div class="nodes-telemetry-page__list-mobile-card">
            <div
              v-if="item.info?.telemetry_unsupported"
              class="row-text"
            >
              <BaseLink :to="item.info.url">
                {{ item.info.url }}
              </BaseLink>
              - {{ $t('telemetry.peerDoesntProvideTelemetry') }}
            </div>
            <div v-else-if="item.info && item.status">
              <div class="nodes-telemetry-page__list-mobile-row">
                <span
                  class="nodes-telemetry-page__list-mobile-row-status"
                  :data-connected="item.info.connected"
                >◉</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.publicUrl') }}</span>
                <BaseHash
                  :hash="item.info.url"
                  :link="item.info.url"
                  copy
                  :type="hashType"
                />
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.location') }}</span>
                <span
                  class="row-text"
                  :class="{ 'nodes-telemetry-page__list-mobile-row-value_empty': !item.info.location }"
                >{{ item.info.location ? `${item.info.location.city}, ${item.info.location.country}` : 'Unknown' }}</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.publicKey') }}</span>
                <BaseHash
                  v-if="item.info.config"
                  :hash="item.info.config.public_key"
                  :type="hashType"
                  copy
                  class="row-text-monospace"
                />
                <span
                  v-else
                  class="row-text"
                >Unknown</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.connectedPeers') }}</span>
                <span class="row-text-monospace">
                  {{ item.info.connected_peers ? formatNumber(item.info.connected_peers.length) : '-' }}
                </span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row row-text">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{
                  $t('telemetry.blocksGossiping')
                }}</span>
                <span v-if="item.info.config">{{
                  $t('telemetry.blocksGossipStats', [
                    item.info.config.network_block_gossip_size ?? 0,
                    item.info.config.network_block_gossip_period?.ms ?? 0,
                  ])
                }}</span>
                <span v-else>Unknown</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row row-text">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{
                  $t('telemetry.tnxsGossiping')
                }}</span>
                <span v-if="item.info.config">{{
                  $t('telemetry.blocksGossipStats', [
                    item.info.config.network_tx_gossip_size ?? 0,
                    item.info.config.network_tx_gossip_period?.ms ?? 0,
                  ])
                }}</span>
                <span v-else>Unknown</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.block') }}</span>
                <div class="nodes-telemetry-page__list-row-block">
                  <BaseLink
                    monospace
                    :to="`/blocks/${item.status.block}`"
                  >
                    {{ formatNumber(item.status.block) }}
                  </BaseLink>
                  <span
                    v-if="formatBlockDelta(metrics?.block ?? null, item.status.block) !== null"
                    class="nodes-telemetry-page__list-row-block-delta"
                  >
                    ({{ formatBlockDelta(metrics?.block ?? null, item.status.block) }})
                  </span>
                </div>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.commitTime') }}</span>
                <span class="row-text-monospace">{{ formatTimestamp(item.status.commit_time.ms) }}</span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.avgCommitTime') }}</span>
                <span class="row-text-monospace">
                  {{
                    item.status.avg_commit_time
                      ? formatTimestamp(item.status.avg_commit_time.ms)
                      : 'Unknown'
                  }}
                </span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.queue') }}</span>
                <span class="row-text-monospace">
                  {{ formatQueueUsage(item.status.queue_size, item.info.config?.queue_capacity) }}
                </span>
              </div>

              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.uptime') }}</span>
                <span class="row-text-monospace">{{ formatTimestamp(item.status.uptime.ms) }}</span>
              </div>
            </div>
            <div v-else-if="item.info">
              <div class="nodes-telemetry-page__list-mobile-row">
                <span
                  class="nodes-telemetry-page__list-mobile-row-status"
                  :data-connected="item.info.connected"
                >◉</span>
              </div>
              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.publicUrl') }}</span>
                <BaseHash
                  :hash="item.info.url"
                  :link="item.info.url"
                  copy
                  :type="hashType"
                />
              </div>
              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.location') }}</span>
                <span
                  class="row-text"
                  :class="{ 'nodes-telemetry-page__list-mobile-row-value_empty': !item.info.location }"
                >{{ item.info.location ? `${item.info.location.city}, ${item.info.location.country}` : 'Unknown' }}</span>
              </div>
            </div>
            <div v-else-if="item.status">
              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.publicUrl') }}</span>
                <span class="row-text">{{ item.status.url }}</span>
              </div>
              <div class="nodes-telemetry-page__list-mobile-row">
                <span class="h-sm nodes-telemetry-page__list-mobile-row-label">{{ $t('telemetry.block') }}</span>
                <div class="nodes-telemetry-page__list-row-block">
                  <BaseLink :to="`/blocks/${item.status.block}`">
                    {{ formatNumber(item.status.block) }}
                  </BaseLink>
                  <span
                    v-if="formatBlockDelta(metrics?.block ?? null, item.status.block) !== null"
                    class="nodes-telemetry-page__list-row-block-delta"
                  >
                    ({{ formatBlockDelta(metrics?.block ?? null, item.status.block) }})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </BaseTable>
      <span
        v-if="showFallbackPeersWarning"
        class="row-text nodes-telemetry-page__trust-warning"
      >{{ $t('telemetry.peerFallbackNotice') }}</span>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.nodes-telemetry-page {
  display: flex;
  justify-items: center;
  flex-direction: column;

  &_loading {
    height: size(16);
  }

  &__section {
    margin-bottom: size(4);
  }

  &__section-body {
    padding: size(3) size(4) size(4) size(4);
    display: flex;
    flex-direction: column;
    gap: size(3);
  }

  &__stream-indicator {
    @include tpg-s4;
    color: theme-color('content-secondary');
    &[data-status='OPEN'] {
      color: theme-color('success');
    }
    &[data-status='POLLING'] {
      color: theme-color('warning');
    }
    &[data-status='CLOSED'] {
      color: theme-color('error');
    }
  }

  &__trust-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: size(1);
  }

  &__trust-chip {
    @include tpg-s5;
    display: inline-flex;
    align-items: center;
    gap: size(0.5);
    border: 1px solid theme-color('border-primary');
    border-radius: size(8);
    padding: size(0.5) size(1.2);
    color: theme-color('content-secondary');
    background: color-mix(in srgb, theme-color('surface') 90%, theme-color('primary') 10%);

    &[data-tone='success'],
    &[data-tone='fresh'] {
      color: theme-color('success');
      border-color: color-mix(in srgb, theme-color('success') 35%, theme-color('border-primary') 65%);
    }

    &[data-tone='warning'],
    &[data-tone='delayed'] {
      color: theme-color('warning');
      border-color: color-mix(in srgb, theme-color('warning') 35%, theme-color('border-primary') 65%);
    }

    &[data-tone='error'],
    &[data-tone='stale'] {
      color: theme-color('error');
      border-color: color-mix(in srgb, theme-color('error') 35%, theme-color('border-primary') 65%);
    }
  }

  &__trust-chip-meta {
    color: theme-color('content-quaternary');
  }

  &__trust-note {
    color: theme-color('content-tertiary');
  }

  &__trust-warning {
    border: 1px solid color-mix(in srgb, theme-color('warning') 35%, theme-color('border-primary') 65%);
    border-radius: size(1.5);
    padding: size(1) size(1.25);
    background: color-mix(in srgb, theme-color('warning') 8%, theme-color('surface') 92%);
    color: theme-color('warning');
  }

  &__ethstats {
    .content-block__header {
      align-items: center;
      gap: size(1.5);
    }
  }

  &__ethstats-console {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: size(1);
  }

  &__ethstats-filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.75);

    button {
      border: 1px solid color-mix(in srgb, theme-color('primary') 40%, theme-color('border-primary') 60%);
      border-radius: size(99);
      padding: size(0.65) size(1.1);
      background: linear-gradient(
        130deg,
        color-mix(in srgb, theme-color('primary') 12%, theme-color('surface') 88%),
        color-mix(in srgb, theme-color('surface') 75%, transparent)
      );
      color: theme-color('content-secondary');
      cursor: pointer;
      @include tpg-s4;

      &[data-active='true'] {
        color: theme-color('content-primary');
        border-color: color-mix(in srgb, theme-color('success') 40%, theme-color('primary') 60%);
        box-shadow: 0 0 size(1.2) color-mix(in srgb, theme-color('primary') 30%, transparent);
      }
    }
  }

  &__ethstats-filter-count {
    color: theme-color('content-quaternary');
    margin-left: size(0.3);
  }

  &__ethstats-events-toggle {
    border: 1px solid color-mix(in srgb, theme-color('success') 32%, theme-color('border-primary') 68%);
    border-radius: size(99);
    padding: size(0.65) size(1.2);
    background: linear-gradient(
      120deg,
      color-mix(in srgb, theme-color('success') 10%, theme-color('surface') 90%),
      color-mix(in srgb, theme-color('primary') 8%, theme-color('surface') 92%)
    );
    color: theme-color('content-secondary');
    cursor: pointer;
    @include tpg-s4;

    &[data-open='true'] {
      color: theme-color('content-primary');
      border-color: color-mix(in srgb, theme-color('success') 55%, theme-color('border-primary') 45%);
      box-shadow: 0 0 size(1.5) color-mix(in srgb, theme-color('success') 26%, transparent);
    }
  }

  &__ethstats-kpis {
    display: grid;
    gap: size(1.5);

    @include md {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @include xxl {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  &__ethstats-kpi {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(1.5);
    background: linear-gradient(
      160deg,
      color-mix(in srgb, theme-color('primary') 9%, theme-color('surface') 91%),
      theme-color('surface')
    );
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__ethstats-kpi-label {
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__ethstats-kpi-value {
    color: theme-color('content-primary');
    @include tpg-h3;
    display: flex;
    align-items: baseline;
    gap: size(0.5);
  }

  &__ethstats-kpi-meta {
    @include tpg-s5;
    color: theme-color('content-quaternary');
  }

  &__ethstats-view-toggle {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    overflow: hidden;

    button {
      border: 0;
      background: transparent;
      color: theme-color('content-secondary');
      padding: size(1) size(1.5);
      @include tpg-s4;
      cursor: pointer;
      transition: background-color 180ms ease;

      &[data-active='true'] {
        background: color-mix(in srgb, theme-color('primary') 14%, transparent);
        color: theme-color('content-primary');
      }
    }
  }

  &__ethstats-history-window {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    overflow: hidden;

    button {
      border: 0;
      background: transparent;
      color: theme-color('content-secondary');
      padding: size(0.75) size(1.25);
      @include tpg-s4;
      cursor: pointer;

      &[data-active='true'] {
        background: color-mix(in srgb, theme-color('primary') 14%, transparent);
        color: theme-color('content-primary');
      }
    }
  }

  &__ethstats-graphs {
    display: grid;
    gap: size(1.5);

    @include lg {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  &__ethstats-graph {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(1.5);
    display: flex;
    flex-direction: column;
    gap: size(1);
    background: theme-color('surface-variant');

    svg {
      width: 100%;
      height: size(6);
      stroke: theme-color('primary');
      stroke-width: 2;
      fill: none;
    }
  }

  &__ethstats-graph-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: size(1);
  }

  &__ethstats-map {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(1.5);
    display: flex;
    flex-direction: column;
    gap: size(1);
    background: theme-color('surface-variant');
    position: relative;
    overflow: hidden;

    svg {
      width: 100%;
      height: size(16);
      touch-action: none;
      user-select: none;
      border-radius: size(1.5);
    }
  }

  &__ethstats-map-controls {
    display: inline-flex;
    gap: size(0.5);
    align-self: flex-end;

    button {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: color-mix(in srgb, theme-color('surface') 70%, transparent);
      color: theme-color('content-primary');
      min-width: size(3);
      height: size(3);
      cursor: pointer;
      @include tpg-s4;
    }
  }

  &__ethstats-map-point {
    fill: theme-color('debug');
    stroke: color-mix(in srgb, theme-color('surface') 65%, transparent);
    stroke-width: 0.4;
    opacity: 0.85;
    transition: opacity 180ms ease;
    cursor: pointer;

    &--connected {
      fill: theme-color('success');
      opacity: 1;
    }

    &--selected {
      stroke: theme-color('primary');
      stroke-width: 0.7;
      opacity: 1;
    }
  }

  &__ethstats-map-tooltip {
    position: absolute;
    transform: translate(-50%, -110%);
    border: 1px solid theme-color('border-primary');
    background: color-mix(in srgb, theme-color('surface') 90%, transparent);
    box-shadow: 0 size(0.5) size(1.5) rgba(0, 0, 0, 0.16);
    border-radius: size(1.5);
    padding: size(1) size(1.25);
    display: flex;
    flex-direction: column;
    gap: size(0.25);
    pointer-events: none;
    max-width: min(size(42), 88%);
    backdrop-filter: blur(6px);
  }

  &__ethstats-map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: size(1.5);
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__ethstats-note {
    color: theme-color('content-quaternary');
  }

  &__ethstats-compare {
    border: 1px solid color-mix(in srgb, theme-color('primary') 45%, theme-color('border-primary') 55%);
    border-radius: size(2);
    background: linear-gradient(
      140deg,
      color-mix(in srgb, theme-color('primary') 13%, theme-color('surface') 87%),
      color-mix(in srgb, theme-color('success') 10%, theme-color('surface') 90%)
    );
    box-shadow: inset 0 0 0 size(0.15) color-mix(in srgb, theme-color('primary') 26%, transparent);
    padding: size(1.5);
    display: grid;
    gap: size(1.25);
  }

  &__ethstats-compare-head {
    display: flex;
    justify-content: space-between;
    gap: size(1);
    flex-wrap: wrap;
  }

  &__ethstats-compare-columns {
    display: grid;
    gap: size(1);

    @include md {
      grid-template-columns: minmax(size(10), 1fr) repeat(2, minmax(size(14), 1fr));
    }
  }

  &__ethstats-compare-column {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1.5);
    padding: size(1) size(1.2);
    background: color-mix(in srgb, theme-color('surface') 86%, transparent);
    display: grid;
    gap: size(0.6);
    align-content: start;

    &--label {
      color: theme-color('content-secondary');
    }
  }

  &__ethstats-node-grid {
    display: grid;
    gap: size(1.5);

    @include lg {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @include xxl {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  &__ethstats-node {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(1.5);
    display: flex;
    flex-direction: column;
    gap: size(0.75);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, theme-color('surface-variant') 80%, theme-color('surface') 20%),
      theme-color('surface')
    );

    &[data-selected='true'] {
      border-color: theme-color('primary');
      box-shadow: 0 0 0 size(0.25) color-mix(in srgb, theme-color('primary') 22%, transparent);
    }

    &[data-pinned='true'] {
      border-color: color-mix(in srgb, theme-color('success') 48%, theme-color('border-primary') 52%);
      box-shadow: 0 0 0 size(0.25) color-mix(in srgb, theme-color('success') 25%, transparent);
    }

    &[data-compare='true'] {
      border-color: color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary') 55%);
    }
  }

  &__ethstats-node-head {
    display: flex;
    align-items: center;
    gap: size(1);
  }

  &__ethstats-node-actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.65);

    button {
      border: 1px solid theme-color('border-primary');
      border-radius: size(99);
      padding: size(0.45) size(0.9);
      background: color-mix(in srgb, theme-color('surface') 84%, transparent);
      color: theme-color('content-secondary');
      @include tpg-s5;
      cursor: pointer;

      &[data-active='true'] {
        color: theme-color('content-primary');
        border-color: color-mix(in srgb, theme-color('primary') 46%, theme-color('border-primary') 54%);
      }

      &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    }
  }

  &__ethstats-node-chip {
    border: 1px solid color-mix(in srgb, theme-color('warning') 35%, theme-color('border-primary') 65%);
    border-radius: size(99);
    padding: size(0.35) size(0.8);
    color: theme-color('warning');
    @include tpg-s5;
  }

  &__ethstats-node-status {
    color: theme-color('debug');

    &[data-connected='true'] {
      color: theme-color('success');
    }
  }

  &__ethstats-node-location {
    color: theme-color('content-secondary');
  }

  &__ethstats-node-grid-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: size(1);
  }

  &__ethstats-node-queue-track {
    width: 100%;
    height: size(0.75);
    border-radius: size(2);
    background: color-mix(in srgb, theme-color('border-primary') 45%, transparent);
    overflow: hidden;

    span {
      display: block;
      height: 100%;
      min-width: size(0.25);
      border-radius: inherit;
      background: linear-gradient(
        90deg,
        theme-color('primary'),
        color-mix(in srgb, theme-color('success') 80%, theme-color('primary') 20%)
      );
      transition: width 250ms ease;
    }
  }

  &__ethstats-empty {
    display: block;
    padding-inline: size(4);
    color: theme-color('content-quaternary');
    font-style: italic;
  }

  &__ethstats-events {
    display: grid;
    gap: size(1.25);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(1.25);
    background: color-mix(in srgb, theme-color('surface-variant') 70%, theme-color('surface') 30%);

    @include lg {
      grid-template-columns: minmax(size(16), 1fr) minmax(size(24), 1.4fr);
    }
  }

  &__ethstats-events-toolbar {
    display: grid;
    gap: size(0.65);
    grid-column: 1 / -1;

    @include lg {
      grid-template-columns: minmax(size(14), 1fr) auto;
      align-items: end;
    }
  }

  &__ethstats-events-search-label {
    color: theme-color('content-secondary');
  }

  &__ethstats-events-search {
    width: 100%;
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(0.55) size(0.75);
    background: color-mix(in srgb, theme-color('surface') 92%, transparent);
    color: theme-color('content-primary');
    @include tpg-s4;
  }

  &__ethstats-events-actions {
    display: flex;
    align-items: center;
    gap: size(0.55);
    flex-wrap: wrap;

    button {
      border: 1px solid theme-color('border-primary');
      border-radius: size(99);
      padding: size(0.45) size(0.9);
      background: color-mix(in srgb, theme-color('surface') 84%, transparent);
      color: theme-color('content-secondary');
      @include tpg-s5;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  &__ethstats-events-count {
    padding: size(0.2) size(0.55);
    border: 1px solid theme-color('border-primary');
    border-radius: size(99);
    color: theme-color('content-tertiary');
    background: color-mix(in srgb, theme-color('surface') 84%, transparent);
  }

  &__ethstats-events-list {
    display: grid;
    gap: size(0.6);
    max-height: size(36);
    overflow: auto;

    &:focus-visible {
      outline: none;
      border-radius: size(1.25);
      box-shadow:
        0 0 0 1px color-mix(in srgb, theme-color('primary') 78%, transparent),
        0 0 size(1.2) color-mix(in srgb, theme-color('primary') 42%, transparent);
    }

    button {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1.2);
      padding: size(0.8) size(1);
      background: color-mix(in srgb, theme-color('surface') 92%, transparent);
      display: grid;
      gap: size(0.35);
      justify-items: start;
      text-align: left;
      cursor: pointer;
      color: theme-color('content-secondary');

      &[data-active='true'] {
        border-color: color-mix(in srgb, theme-color('primary') 44%, theme-color('border-primary') 56%);
        background: color-mix(in srgb, theme-color('primary') 12%, theme-color('surface') 88%);
        color: theme-color('content-primary');
      }

      &:focus-visible {
        outline: none;
        border-color: color-mix(in srgb, theme-color('primary') 78%, theme-color('border-primary') 22%);
        box-shadow:
          0 0 0 1px color-mix(in srgb, theme-color('primary') 52%, transparent),
          0 0 size(0.95) color-mix(in srgb, theme-color('primary') 32%, transparent);
      }
    }
  }

  &__ethstats-events-summary {
    color: theme-color('content-quaternary');
  }

  &__ethstats-events-absolute-time {
    color: theme-color('content-quaternary');
  }

  &__ethstats-events-detail {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1.5);
    padding: size(1.1);
    background: color-mix(in srgb, theme-color('surface') 88%, transparent);
    min-width: 0;

    pre {
      margin: 0;
      max-height: size(34);
      overflow: auto;
      padding: size(1);
      border-radius: size(1);
      background: color-mix(in srgb, theme-color('surface-variant') 85%, theme-color('surface') 15%);
      @include tpg-s5;
      color: theme-color('content-secondary');
      white-space: pre-wrap;
      word-break: break-word;
    }
  }

  &__ethstats-events-detail-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: size(1);
    margin-bottom: size(0.75);
  }

  &__ethstats-events-detail-meta {
    display: grid;
    gap: size(0.2);
    justify-items: end;
  }

  &__consensus-grid {
    display: grid;
    gap: size(2);

    @include xxs {
      grid-template-columns: 1fr;
    }

    @include lg {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  &__consensus-card {
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    display: flex;
    flex-direction: column;
    gap: size(0.5);

    &[data-saturated='true'] {
      border-color: theme-color('error');
    }

    &-value {
      @include tpg-h3;
      color: theme-color('content-primary');
    }

    &-label {
      @include tpg-s4;
      color: theme-color('content-secondary');
    }

    &-meta {
      @include tpg-s5;
      color: theme-color('content-quaternary');
    }
  }

  &__consensus-details {
    display: grid;
    gap: size(2);

    @include lg {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__sumeragi-chain {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
    background: linear-gradient(
      165deg,
      color-mix(in srgb, theme-color('primary') 10%, theme-color('surface') 90%),
      theme-color('surface')
    );
  }

  &__sumeragi-chain-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: size(1);
    flex-wrap: wrap;
  }

  &__sumeragi-chain-chip {
    @include tpg-s5;
    color: theme-color('content-secondary');
    border: 1px solid theme-color('border-primary');
    border-radius: size(99);
    padding: size(0.375) size(0.9);
    background: color-mix(in srgb, theme-color('surface') 86%, transparent);
  }

  &__sumeragi-chain-grid {
    display: grid;
    gap: size(1);

    @include md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__sumeragi-chain-card {
    display: flex;
    flex-direction: column;
    gap: size(1);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1.5);
    padding: size(1.2) size(1.4);
    background: color-mix(in srgb, theme-color('surface-variant') 65%, theme-color('surface') 35%);

    &--hash {
      @include md {
        grid-column: 1 / -1;
      }
    }
  }

  &__sumeragi-chain-label {
    @include tpg-s4;
    color: theme-color('content-secondary');
  }

  &__sumeragi-chain-value {
    @include tpg-h4;
    color: theme-color('content-primary');
  }

  &__view-change,
  &__penalties {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__view-change-grid {
    display: grid;
    gap: size(1);

    @include sm {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__view-change-item {
    display: flex;
    justify-content: space-between;
  }

  &__view-change-label {
    color: theme-color('content-secondary');
  }

  &__view-change-value {
    @include tpg-h4;
    color: theme-color('content-primary');
  }

  &__penalties-grid {
    display: grid;
    gap: size(1);
  }

  &__penalties-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: size(1) 0;
    border-bottom: 1px solid theme-color('border-primary');

    &:last-child {
      border-bottom: none;
    }
  }

  &__prf {
    display: flex;
    align-items: center;
    gap: size(2);
  }

  &__rbc-grid {
    display: grid;
    gap: size(2);

    @include md {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__rbc-card {
    padding: size(2);
    border-radius: size(2);
    background: theme-color('surface-variant');

    &-value {
      display: block;
      color: theme-color('content-primary');
      @include tpg-h3;
    }

    &-label {
      color: theme-color('content-secondary');
      @include tpg-s4;
    }
  }

  &__rbc-store {
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__rbc-store-grid {
    @include md {
      grid-template-columns: repeat(3, 1fr);
    }

    @include xl {
      grid-template-columns: repeat(5, 1fr);
    }
  }

  &__rbc-evictions {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__rbc-evictions-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__rbc-evictions-item {
    display: flex;
    align-items: center;
    gap: size(1);
  }

  &__rbc-evictions-empty {
    display: block;
    padding-inline: size(4);
    color: theme-color('content-quaternary');
    font-style: italic;
  }

  &__vrf-grid {
    display: grid;
    gap: size(3);

    @include lg {
      grid-template-columns: 2fr 1fr;
    }
  }

  &__vrf-summary,
  &__vrf-penalties {
    display: grid;
    gap: size(1.5);
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__vrf-value {
    display: block;
    color: theme-color('content-primary');
    @include tpg-h3;
  }

  &__late-reveals {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  &__qc-latency {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__qc-latency-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: size(1.5) size(2);
    border-bottom: 1px solid theme-color('border-primary');

    &--header {
      background: theme-color('surface-variant');
      font-weight: 600;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__settlement {
    display: grid;
    gap: size(2);

    @include lg {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__settlement-card {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__settlement-header {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__settlement-list ul {
    margin: 0;
    padding-left: size(2);
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__settlement-last {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__settlement-last-grid {
    display: grid;
    gap: size(0.5);
  }

  &__nexus {
    display: grid;
    gap: size(2);

    @include lg {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__nexus-fee {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__nexus-fee-grid {
    display: grid;
    gap: size(0.75);

    @include sm {
      grid-template-columns: repeat(2, 1fr);
    }

    @include xl {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__nexus-staking {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__nexus-staking-table {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__nexus-staking-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: size(1);
    padding: size(1.25) size(1.5);
    border-bottom: 1px solid theme-color('border-primary');

    &--header {
      background: theme-color('surface-variant');
      font-weight: 600;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__nexus-staking-empty {
    display: block;
    padding-inline: size(4);
    color: theme-color('content-quaternary');
    font-style: italic;
  }

  &__npos-grid {
    display: grid;
    gap: size(1.5);

    @include lg {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__npos-params {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__npos-params-grid {
    display: grid;
    gap: size(0.75);

    @include md {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__npos-rejection {
    color: theme-color('content-secondary');
  }

  &__npos-producers {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.25);
    background: linear-gradient(
      170deg,
      color-mix(in srgb, theme-color('success') 9%, theme-color('surface') 91%),
      theme-color('surface')
    );
  }

  &__npos-producers-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: size(1);
    flex-wrap: wrap;
  }

  &__npos-producers-chips {
    display: flex;
    align-items: center;
    gap: size(0.75);
    flex-wrap: wrap;
  }

  &__npos-producers-chip {
    @include tpg-s5;
    color: theme-color('content-secondary');
    border: 1px solid theme-color('border-primary');
    border-radius: size(99);
    padding: size(0.35) size(0.8);
    background: color-mix(in srgb, theme-color('surface') 86%, transparent);
  }

  &__npos-producers-table-wrap {
    overflow-x: auto;
    border-radius: size(2);
  }

  &__npos-producers-table {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    min-width: size(42);
  }

  &__npos-producers-row {
    display: grid;
    grid-template-columns: size(10) 1fr;
    gap: size(1);
    padding: size(1) size(1.25);
    border-bottom: 1px solid theme-color('border-primary');

    &[data-leader='true'] {
      background: color-mix(in srgb, theme-color('primary') 12%, transparent);
      box-shadow: inset size(0.3) 0 0 color-mix(in srgb, theme-color('success') 70%, transparent);
    }

    &--header {
      background: theme-color('surface-variant');
      font-weight: 600;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__npos-producers-index {
    white-space: nowrap;
  }

  &__npos-producers-peer {
    display: flex;
    align-items: center;
    gap: size(1);
    min-width: 0;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  &__npos-producers-hash {
    min-width: 0;
  }

  &__npos-producers-leader {
    @include tpg-s5;
    color: theme-color('success');
    white-space: nowrap;
    border: 1px solid color-mix(in srgb, theme-color('success') 38%, transparent);
    border-radius: size(99);
    padding: size(0.2) size(0.7);
    background: color-mix(in srgb, theme-color('success') 16%, transparent);
  }

  &__npos-current-producer {
    display: flex;
    align-items: center;
    gap: size(1.25);
    flex-wrap: wrap;
  }

  &__npos-tie-break {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__npos-tie-break-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: size(0.75);
  }

  &__lane-governance-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: size(1.5);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__lane-governance-table {
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__lane-governance-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: size(1);
    padding: size(1.25) size(1.5);
    border-bottom: 1px solid theme-color('border-primary');

    &--header {
      background: theme-color('surface-variant');
      font-weight: 600;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__lane-governance-empty {
    display: block;
    padding-inline: size(4);
    color: theme-color('content-quaternary');
    font-style: italic;
  }

  &__collectors {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__collectors-row {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: size(1);
    padding: size(1.5) size(2);
    border-bottom: 1px solid theme-color('border-primary');

    &--header {
      background: theme-color('surface-variant');
      font-weight: 600;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__collectors-empty {
    padding: size(2);
    font-style: italic;
    color: theme-color('content-quaternary');
  }

  &__stats {
    width: 100%;
    margin-top: size(2);
    margin-bottom: size(4);
    display: grid;

    @include xxs {
      grid-template-columns: 1fr 1fr;
      justify-content: center;
      gap: size(2);
    }
    @include xl {
      height: size(10);
      grid-template-columns: repeat(5, 1fr);
    }

    &-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: size(1);

      &-value {
        display: flex;
        justify-content: center;
        width: 100%;
        color: theme-color('content-primary');
        @include tpg-h2-mono();

        @include sm {
          @include tpg-h1-mono();
        }

        @include lg {
          @include tpg-d1-mono();
        }
      }
      &-last-block > div {
        display: flex;
      }

      &-label {
        text-align: center;
        color: theme-color('content-quaternary');
        @include tpg-s3();

        @include lg {
          @include tpg-s4();
        }
      }

      &:last-child {
        @include xxs {
          grid-column: 1 / -1;
          justify-self: center;
        }
        @include xl {
          grid-column: 5;
          justify-self: stretch;
        }
      }
    }
  }

  &__list {
    &-row {
      width: 100%;
      display: grid;
      align-items: center;
      @include xl {
        grid-template-columns:
          size(4) size(28) size(14) size(36) size(8) size(12) size(12) 0.8fr size(10) size(16) size(10)
          size(9);
      }
      @include xxl {
        grid-template-columns:
          size(4) size(28) size(18) size(36) size(8) size(12) size(12) 0.8fr size(16) size(23) size(10)
          size(9);
      }

      &-location {
        display: flex;
        flex-direction: column;
        gap: size(0.25);
      }

      &-location-city {
        @include tpg-s5;
        color: theme-color('content-secondary');
      }

      &-block {
        display: flex;
        align-items: center;
        gap: size(1);
      }

      &-block-delta {
        @include tpg-s5;
        color: theme-color('content-quaternary');
      }

      &-value_empty {
        font-style: italic;
        color: theme-color('content-quaternary');
      }

      &_unsupported {
        @include lg {
          grid-template-columns: 1fr;
        }
      }

      &-gossip {
        position: relative;

        &:hover .context-tooltip {
          display: flex;
          bottom: size(3.5);
          right: size(-2);
          height: size(6);
        }
      }

      &-status[data-connected='true'] {
        color: theme-color('success');
      }
      &-status {
        color: theme-color('debug');
      }
    }

    &-mobile-card {
      border-bottom: 1px solid theme-color('border-primary');
      padding: size(2) size(3);
    }

    &-mobile-row {
      display: flex;
      align-items: center;

      &-status[data-connected='true'] {
        color: theme-color('success');
      }
      &-status {
        margin-left: size(1);
        color: theme-color('debug');
      }

      &-label {
        text-align: left;
        width: size(20);
        padding: size(1);
      }

      &-value_empty {
        font-style: italic;
        color: theme-color('content-quaternary');
      }

      &-connection-success {
        color: theme-color('success');
      }

      &-connection-error {
        color: theme-color('error');
      }
    }

    &-container {
      display: grid;
      grid-template-columns: 1fr;

      @include md {
        grid-template-columns: 1fr 1fr;
      }

      @include xl {
        grid-template-columns: 1fr;
      }

      .content-row:last-child {
        border-bottom: 1px solid theme-color('border-primary');
      }
    }

    hr {
      display: none;
    }
  }
}
</style>
