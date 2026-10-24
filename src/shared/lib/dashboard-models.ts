/**
 * View models that turn chain analytics into chart data. Unknown values stay
 * `null` so charts draw them as unknown, never as zero.
 */
import type { ActivityBucket, BlockSample, DayHourHeatmap, DurationBin, SlotCoverage } from './chain-analytics';
import { isTimedSample } from './chain-analytics';
import { formatDurationTick } from './chart-scale';
import type { ColumnDatum, TimeSeriesPoint } from '@/shared/ui/dashboard/types';
import type { NodeStatusSnapshot } from '@/shared/api/schemas';

export type CoverageMessageKey = 'scanning' | 'incomplete' | 'genesis' | 'complete';

/**
 * Which sentence describes the block window: still reading, stopped short
 * (a page failed), the whole chain because it is shorter than the window, or
 * the full window.
 */
export function coverageMessageKey(
  coverage: { loaded: number; target: number; complete: boolean },
  state: { scanning: boolean; reachedGenesis: boolean }
): CoverageMessageKey {
  if (!coverage.complete) return state.scanning ? 'scanning' : 'incomplete';
  if (state.reachedGenesis && coverage.loaded < coverage.target) return 'genesis';
  return 'complete';
}

/** Accept only a listed window size from a route query value. */
export function parseWindowParam(raw: unknown, allowed: readonly number[], fallback: number): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== 'string' || !/^[1-9]\d{0,5}$/.test(text)) return fallback;
  const value = Number(text);
  return allowed.includes(value) ? value : fallback;
}

/** Newest `maxBars` blocks as committed/rejected stacks; unreadable bodies stay unknown. */
export function perBlockColumns(
  samples: readonly BlockSample[],
  maxBars: number,
  title: (height: number) => string
): ColumnDatum[] {
  return samples.slice(-Math.max(1, maxBars)).map((sample) => ({
    key: sample.height,
    label: title(sample.height),
    tick: `#${sample.height}`,
    values: isTimedSample(sample)
      ? {
          committed: sample.transactionsTotal - sample.transactionsRejected,
          rejected: sample.transactionsRejected,
        }
      : null,
  }));
}

/** Label a duration bin as `1s–2s`, or `≥1d` for the open-ended bin. */
export function durationBinLabel(bin: DurationBin): string {
  return bin.endMs === null
    ? `≥${formatDurationTick(bin.startMs)}`
    : `${formatDurationTick(bin.startMs)}–${formatDurationTick(bin.endMs)}`;
}

export function histogramColumns(bins: readonly DurationBin[]): ColumnDatum[] {
  return bins.map((bin) => ({
    key: bin.startMs,
    label: durationBinLabel(bin),
    tick: bin.endMs === null ? `≥${formatDurationTick(bin.startMs)}` : formatDurationTick(bin.startMs),
    values: { count: bin.count },
  }));
}

export function throughputPoints(buckets: readonly ActivityBucket[]): TimeSeriesPoint[] {
  return buckets.map((bucket) => ({
    startMs: bucket.startMs,
    endMs: bucket.endMs,
    coverage: bucket.coverage,
    values: {
      committed: bucket.transactionsTotal - bucket.transactionsRejected,
      rejected: bucket.transactionsRejected,
    },
  }));
}

export interface LaneMeterModel {
  laneId: number
  alias: string | null
  committed: number
  capacity: number
}

/** Latest slot envelope per lane, named by the catalogue's lane alias when present. */
export function laneMeters(status: NodeStatusSnapshot | null): LaneMeterModel[] {
  if (!status) return [];
  const aliases = new Map<number, string>();
  for (const entry of status.dataspace_catalog) {
    const alias = (entry as { lane_alias?: unknown }).lane_alias;
    if (typeof alias === 'string' && alias.trim() && !aliases.has(entry.lane_id)) aliases.set(entry.lane_id, alias);
  }
  return [...status.teu_lane_commit]
    .sort((left, right) => left.lane_id - right.lane_id)
    .map((lane) => ({
      laneId: lane.lane_id,
      alias: aliases.get(lane.lane_id) ?? null,
      committed: lane.committed,
      capacity: lane.capacity,
    }));
}

/** Count items by a key, largest first, folding everything past `limit` into one remainder. */
export function rankCounts<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  limit: number
): { ranked: Array<{ key: string; count: number }>; remainder: { keys: number; count: number } } {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  const ranked = sorted.slice(0, Math.max(0, limit));
  const rest = sorted.slice(ranked.length);
  return { ranked, remainder: { keys: rest.length, count: rest.reduce((sum, entry) => sum + entry.count, 0) } };
}

/**
 * Transactions per local hour of day summed over the days read. An hour no day
 * observed stays unknown rather than zero; an hour some day observed only in
 * part, or not at all, is a lower bound and carries `partialNote`.
 */
export function hourOfDayColumns(
  heatmap: DayHourHeatmap,
  title: (hour: number) => string,
  partialNote: string
): ColumnDatum[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const cells = heatmap.cells.filter((cell) => cell.hour === hour);
    const observed = cells.filter((cell) => cell.coverage !== 'none');
    const partial = observed.length > 0 && cells.some((cell) => cell.coverage !== 'full');
    return {
      key: hour,
      label: title(hour),
      tick: String(hour).padStart(2, '0'),
      values: observed.length > 0 ? { transactions: observed.reduce((sum, cell) => sum + cell.transactions, 0) } : null,
      ...(partial ? { partial: true, note: partialNote } : {}),
    };
  });
}

/**
 * Footnote for table rows marked `*` (partly observed, a lower bound) or `—`
 * (unknown); empty when no row carries a marker.
 */
export function coverageFootnote(
  coverages: readonly SlotCoverage[],
  labels: { partial: string, unknown: string }
): string {
  return [
    coverages.includes('partial') ? `* ${labels.partial}` : '',
    coverages.includes('none') ? `— ${labels.unknown}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Count non-negative integers into ordered buckets given by inclusive lower
 * edges (`[0, 1, 2, 3, 6]` yields 0, 1, 2, 3–5, 6+).
 */
export function countIntoBuckets(values: readonly number[], lowerEdges: readonly number[]): ColumnDatum[] {
  if (lowerEdges.length === 0 || lowerEdges.some((edge, index) => index > 0 && edge <= lowerEdges[index - 1]!)) {
    throw new RangeError('Bucket edges must be strictly increasing');
  }
  const counts = lowerEdges.map(() => 0);
  for (const value of values) {
    if (!Number.isFinite(value) || value < lowerEdges[0]!) continue;
    let index = lowerEdges.length - 1;
    while (index > 0 && value < lowerEdges[index]!) index -= 1;
    counts[index]! += 1;
  }
  return lowerEdges.map((edge, index) => {
    const next = lowerEdges[index + 1];
    const label = next === undefined ? `${edge}+` : next - 1 === edge ? String(edge) : `${edge}–${next - 1}`;
    return { key: edge, label, tick: label, values: { count: counts[index]! } };
  });
}
