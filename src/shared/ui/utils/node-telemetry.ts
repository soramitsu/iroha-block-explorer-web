import type { PeerInfo, PeerStatus } from '@/shared/api/schemas';
import { formatNumber } from './formatters';

export function formatQueueUsage(
  queueSize: number | null | undefined,
  queueCapacity: number | null | undefined
): string {
  if (queueCapacity === null || queueCapacity === undefined) {
    if (queueSize === null || queueSize === undefined) return '-';
    return formatNumber(queueSize);
  }

  const sizeLabel = queueSize === null || queueSize === undefined ? '-' : formatNumber(queueSize);
  return `${sizeLabel} / ${formatNumber(queueCapacity)}`;
}

export function formatBlockDelta(bestBlock: number | null | undefined, peerBlock: number | null | undefined): string | null {
  if (bestBlock === null || bestBlock === undefined) return null;
  if (peerBlock === null || peerBlock === undefined) return null;

  const delta = peerBlock - bestBlock;
  if (delta === 0) return null;

  return delta > 0 ? `+${delta}` : `${delta}`;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function calculateQueueFillPercent(
  queueSize: number | null | undefined,
  queueCapacity: number | null | undefined
): number | null {
  if (!isFiniteNumber(queueSize) || !isFiniteNumber(queueCapacity) || queueCapacity <= 0) {
    return null;
  }

  const rawPercent = (queueSize / queueCapacity) * 100;
  if (!Number.isFinite(rawPercent)) return null;

  return Math.min(100, Math.max(0, Math.round(rawPercent)));
}

export function formatLatencyMs(latencyMs: number | null | undefined): string {
  if (!isFiniteNumber(latencyMs)) return '—';
  if (latencyMs < 1000) return `${formatNumber(Math.round(latencyMs))} ms`;
  if (latencyMs < 60_000) return `${(latencyMs / 1000).toFixed(2)} s`;
  return `${(latencyMs / 60_000).toFixed(1)} m`;
}

export function calculatePercentile(values: Array<number | null | undefined>, percentile: number): number | null {
  const samples = values.filter(isFiniteNumber).sort((first, second) => first - second);
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0];

  const clamped = Math.min(100, Math.max(0, percentile));
  const rank = (clamped / 100) * (samples.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) return samples[lower];

  const weight = rank - lower;
  const low = samples[lower];
  const high = samples[upper];
  return low + (high - low) * weight;
}

export function calculatePropagationSpread(
  blocks: Array<number | null | undefined>,
  averageBlockTimeMs: number | null | undefined
): { spreadBlocks: number, estimatedMs: number | null } {
  const heights = blocks.filter(isFiniteNumber);
  if (heights.length === 0) {
    return { spreadBlocks: 0, estimatedMs: null };
  }

  const spreadBlocks = Math.max(0, Math.max(...heights) - Math.min(...heights));
  const estimatedMs = isFiniteNumber(averageBlockTimeMs) && averageBlockTimeMs >= 0
    ? spreadBlocks * averageBlockTimeMs
    : null;

  return { spreadBlocks, estimatedMs };
}

export function buildSparklinePoints(values: Array<number | null | undefined>, width = 100, height = 40): string {
  if (width <= 0 || height <= 0) return '';

  const samples = values.filter(isFiniteNumber);
  if (samples.length === 0) return '';

  const formatPoint = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;

  if (samples.length === 1) {
    const centered = height / 2;
    return `${formatPoint(0, centered)} ${formatPoint(width, centered)}`;
  }

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min;
  const step = width / (samples.length - 1);

  return samples
    .map((value, index) => {
      const x = step * index;
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
      return formatPoint(x, y);
    })
    .join(' ');
}

export function projectGeoPoint(
  lat: number | null | undefined,
  lon: number | null | undefined,
  viewport: { width?: number, height?: number } = {}
): { x: number, y: number } | null {
  const width = viewport.width ?? 100;
  const height = viewport.height ?? 52;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || width <= 0 || height <= 0) return null;

  const clampedLat = Math.min(85, Math.max(-85, lat));
  const clampedLon = Math.min(180, Math.max(-180, lon));
  const x = ((clampedLon + 180) / 360) * width;
  const y = ((90 - clampedLat) / 180) * height;

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
  };
}

export interface NodeBoardPeer {
  info: PeerInfo | null
  status: PeerStatus | null
}

export interface NodeBoardRow {
  key: string
  url: string
  peerId: string | null
  connected: boolean
  telemetryUnsupported: boolean
  locationLabel: string
  locationLat: number | null
  locationLon: number | null
  block: number | null
  blockDelta: string | null
  pingMs: number | null
  avgPingMs: number | null
  p95PingMs: number | null
  queueUsage: string
  queueFillPercent: number | null
  propagationMs: number | null
}

function resolveNodeBoardIdentity(peer: NodeBoardPeer, index: number) {
  return {
    key: peer.info?.url ?? peer.status?.url ?? `node-${index}`,
    url: peer.info?.url ?? peer.status?.url ?? '',
    peerId: peer.info?.config?.public_key ?? null,
    connected: Boolean(peer.info?.connected),
    telemetryUnsupported: Boolean(peer.info?.telemetry_unsupported),
  };
}

function resolveNodeBoardLocation(info: PeerInfo | null) {
  return {
    locationLabel: info?.location ? `${info.location.city}, ${info.location.country}` : 'Unknown',
    locationLat: info?.location?.lat ?? null,
    locationLon: info?.location?.lon ?? null,
  };
}

function resolveNodeBoardLatency(status: PeerStatus | null) {
  return {
    pingMs: status?.status_rtt?.ms ?? status?.commit_time?.ms ?? null,
    avgPingMs: status?.status_rtt_avg?.ms ?? status?.avg_commit_time?.ms ?? null,
    p95PingMs: status?.status_rtt_p95?.ms ?? null,
  };
}

function resolveNodeBoardPropagation(
  status: PeerStatus | null,
  bestBlock: number | null | undefined,
  averageBlockTimeMs: number | null | undefined
) {
  const block = status?.block ?? null;
  const blockDelta = formatBlockDelta(bestBlock, status?.block);
  const blockDistance = status && bestBlock !== null && bestBlock !== undefined ? Math.abs(status.block - bestBlock) : null;
  const derivedPropagationMs = blockDistance !== null && averageBlockTimeMs !== null && averageBlockTimeMs !== undefined
    ? blockDistance * averageBlockTimeMs
    : null;

  return {
    block,
    blockDelta,
    propagationMs: status?.propagation_time?.ms ?? derivedPropagationMs,
  };
}

export function buildNodeBoardRow(
  peer: NodeBoardPeer,
  args: {
    index: number
    bestBlock: number | null | undefined
    averageBlockTimeMs: number | null | undefined
  }
): NodeBoardRow {
  return {
    ...resolveNodeBoardIdentity(peer, args.index),
    ...resolveNodeBoardLocation(peer.info),
    ...resolveNodeBoardPropagation(peer.status, args.bestBlock, args.averageBlockTimeMs),
    ...resolveNodeBoardLatency(peer.status),
    queueUsage: formatQueueUsage(peer.status?.queue_size, peer.info?.config?.queue_capacity),
    queueFillPercent: calculateQueueFillPercent(peer.status?.queue_size, peer.info?.config?.queue_capacity),
  };
}

export function compareNodeBoardRows(left: NodeBoardRow, right: NodeBoardRow): number {
  if (left.telemetryUnsupported !== right.telemetryUnsupported) {
    return left.telemetryUnsupported ? 1 : -1;
  }
  if (left.connected !== right.connected) return left.connected ? -1 : 1;
  if ((right.block ?? -1) !== (left.block ?? -1)) return (right.block ?? -1) - (left.block ?? -1);
  if ((left.pingMs ?? Number.POSITIVE_INFINITY) !== (right.pingMs ?? Number.POSITIVE_INFINITY)) {
    return (left.pingMs ?? Number.POSITIVE_INFINITY) - (right.pingMs ?? Number.POSITIVE_INFINITY);
  }
  return left.url.localeCompare(right.url);
}
