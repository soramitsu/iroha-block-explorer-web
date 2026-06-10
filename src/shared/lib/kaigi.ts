import type { KaigiRelayHealthSnapshot, KaigiRelaySummary } from '@/shared/api/schemas';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface KaigiRelayStatusCounts {
  healthy: number
  degraded: number
  unavailable: number
  unknown: number
  total: number
}

export function countKaigiRelayStatuses(relays: KaigiRelaySummary[]): KaigiRelayStatusCounts {
  const counts: KaigiRelayStatusCounts = {
    healthy: 0,
    degraded: 0,
    unavailable: 0,
    unknown: 0,
    total: relays.length,
  };

  for (const relay of relays) {
    switch (relay.status) {
      case 'Healthy':
        counts.healthy += 1;
        break;
      case 'Degraded':
        counts.degraded += 1;
        break;
      case 'Unavailable':
        counts.unavailable += 1;
        break;
      default:
        counts.unknown += 1;
        break;
    }
  }

  return counts;
}

export interface KaigiRelayOverview {
  healthy_total: number
  degraded_total: number
  unavailable_total: number
  unknown_total: number
  reports_total: number
  registrations_total: number
  failovers_total: number
}

export function computeKaigiRelayOverview(args: {
  relays: KaigiRelaySummary[]
  snapshot: KaigiRelayHealthSnapshot | null
}): KaigiRelayOverview | null {
  const relays = args.relays;
  const snapshot = args.snapshot;

  if (relays.length === 0 && !snapshot) return null;

  const statusCounts = countKaigiRelayStatuses(relays);
  const reportedRelays = relays.reduce((acc, relay) => acc + (relay.reported_at_ms !== null ? 1 : 0), 0);
  const reports_total_raw = snapshot?.reports_total ?? 0;
  const registrations_total_raw = snapshot?.registrations_total ?? 0;
  const totals = resolveRelayOverviewTotals(relays, snapshot, statusCounts);
  const reports_total = floorSnapshotCounter(relays.length, reports_total_raw, reportedRelays);
  const registrations_total = floorSnapshotCounter(relays.length, registrations_total_raw, relays.length);

  return {
    ...totals,
    reports_total,
    registrations_total,
    failovers_total: snapshot?.failovers_total ?? 0,
  };
}

function resolveRelayOverviewTotals(
  relays: KaigiRelaySummary[],
  snapshot: KaigiRelayHealthSnapshot | null,
  statusCounts: KaigiRelayStatusCounts
) {
  if (relays.length > 0) {
    return {
      healthy_total: statusCounts.healthy,
      degraded_total: statusCounts.degraded,
      unavailable_total: statusCounts.unavailable,
      unknown_total: statusCounts.unknown,
    };
  }

  return {
    healthy_total: snapshot?.healthy_total ?? 0,
    degraded_total: snapshot?.degraded_total ?? 0,
    unavailable_total: snapshot?.unavailable_total ?? 0,
    unknown_total: 0,
  };
}

function floorSnapshotCounter(relayCount: number, snapshotValue: number, minimumValue: number): number {
  if (relayCount === 0) return snapshotValue;

  // The Torii health snapshot totals may be derived from process-local telemetry counters.
  // If counters are missing/reset while relays exist, keep the UI from showing misleading zeros.
  return Math.max(snapshotValue, minimumValue);
}

export interface KaigiRelayEvent {
  kind: string
  domain: string
  relay: string
  timestamp: Date
  payload: Record<string, unknown>
}

/**
 * Parse KAIGI relay telemetry events coming from Torii's `/v1/kaigi/relays/events` SSE stream.
 *
 * Upstream Torii currently sends a flat payload like:
 * `{ kind, domain, relay_id, ... }`
 */
export function parseKaigiRelayEvent(raw: string, receivedAt: Date = new Date()): KaigiRelayEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const kind =
    typeof parsed.kind === 'string'
      ? parsed.kind
      : '';

  const domain =
    typeof parsed.domain === 'string'
      ? parsed.domain
      : '';

  const relay =
    typeof parsed.relay_id === 'string'
      ? parsed.relay_id
      : '';

  if (!kind || !domain || !relay) return null;

  let timestamp = receivedAt;

  const reportedAtMs = parsed.reported_at_ms;
  if (typeof reportedAtMs === 'number' && Number.isFinite(reportedAtMs)) {
    const date = new Date(reportedAtMs);
    if (!Number.isNaN(date.getTime())) timestamp = date;
  } else {
    const timestampRaw = parsed.timestamp;
    if (typeof timestampRaw === 'string' || typeof timestampRaw === 'number') {
      const date = new Date(timestampRaw);
      if (!Number.isNaN(date.getTime())) timestamp = date;
    }
  }

  const payload = parsed as Record<string, unknown>;

  return {
    kind,
    domain,
    relay,
    timestamp,
    payload,
  };
}
