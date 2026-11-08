/**
 * Chain analytics over bounded windows of committed block summaries.
 *
 * Inputs come from authoritative explorer feeds. Nothing here invents blocks,
 * timestamps or totals: missing heights stay gaps, and a block whose body the
 * node could not read keeps unknown counts instead of zeros.
 */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface BlockSample {
  height: number
  /** `null` when the node reported the block body as unavailable. */
  createdAtMs: number | null
  transactionsTotal: number
  transactionsRejected: number
}

/** A sample whose body was readable, so its counts and time are authoritative. */
export function isTimedSample(sample: BlockSample): sample is BlockSample & { createdAtMs: number } {
  return sample.createdAtMs !== null && Number.isFinite(sample.createdAtMs);
}

/** Merge feed pages by height (incoming wins), oldest first, keeping the `limit` newest heights. */
export function mergeBlockSamples(
  current: readonly BlockSample[],
  incoming: readonly BlockSample[],
  limit: number
): BlockSample[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Sample limit must be a positive integer');
  const byHeight = new Map<number, BlockSample>();
  for (const sample of current) byHeight.set(sample.height, sample);
  for (const sample of incoming) byHeight.set(sample.height, sample);
  const merged = [...byHeight.values()].sort((a, b) => a.height - b.height);
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

/** Heights inside the sampled range that the window does not contain. */
export function countMissingHeights(samples: readonly BlockSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0]!.height;
  const last = samples[samples.length - 1]!.height;
  return last - first + 1 - new Set(samples.map((sample) => sample.height)).size;
}

export interface BlockInterval {
  height: number
  intervalMs: number
}

/**
 * Time between each block and its direct predecessor. Heights whose
 * predecessor is absent or untimed are skipped rather than bridged. Iroha
 * commits no empty blocks, so long intervals are idle time, not slowness.
 */
export function blockIntervals(samples: readonly BlockSample[]): BlockInterval[] {
  const ordered = [...samples].sort((a, b) => a.height - b.height);
  const intervals: BlockInterval[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.height !== previous.height + 1) continue;
    if (!isTimedSample(previous) || !isTimedSample(current)) continue;
    // Leader clocks may disagree by a few milliseconds; never report negative time.
    intervals.push({ height: current.height, intervalMs: Math.max(0, current.createdAtMs - previous.createdAtMs) });
  }
  return intervals;
}

/** Linear-interpolation quantile (type 7) of an ascending array. */
export function quantileSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0 || !Number.isFinite(q)) return null;
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(position);
  const lower = sorted[base]!;
  const upper = sorted[base + 1];
  return upper === undefined ? lower : lower + (upper - lower) * (position - base);
}

export interface DistributionSummary {
  count: number
  min: number
  max: number
  mean: number
  median: number
  p90: number
  p95: number
}

export function summarizeDistribution(values: readonly number[]): DistributionSummary | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const total = finite.reduce((sum, value) => sum + value, 0);
  return {
    count: finite.length,
    min: finite[0]!,
    max: finite[finite.length - 1]!,
    mean: total / finite.length,
    median: quantileSorted(finite, 0.5)!,
    p90: quantileSorted(finite, 0.9)!,
    p95: quantileSorted(finite, 0.95)!,
  };
}

/** Human 1-2-5 style duration edges; the last bin is open-ended. */
export const DURATION_BIN_EDGES_MS: readonly number[] = [
  0,
  SECOND_MS,
  2 * SECOND_MS,
  5 * SECOND_MS,
  10 * SECOND_MS,
  20 * SECOND_MS,
  30 * SECOND_MS,
  MINUTE_MS,
  2 * MINUTE_MS,
  5 * MINUTE_MS,
  10 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  2 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
];

export interface DurationBin {
  startMs: number
  /** Exclusive upper edge; `null` for the open-ended last bin. */
  endMs: number | null
  count: number
}

/**
 * Histogram over fixed human duration edges. Leading and trailing empty bins
 * are trimmed; empty bins between populated ones stay so gaps remain visible.
 */
export function durationHistogram(values: readonly number[], edges: readonly number[] = DURATION_BIN_EDGES_MS): DurationBin[] {
  if (edges.length < 2 || edges.some((edge, index) => index > 0 && edge <= edges[index - 1]!)) {
    throw new RangeError('Duration edges must be strictly increasing');
  }
  const bins: DurationBin[] = edges.map((startMs, index) => ({
    startMs,
    endMs: edges[index + 1] ?? null,
    count: 0,
  }));
  for (const value of values) {
    if (!Number.isFinite(value) || value < edges[0]!) continue;
    let index = bins.length - 1;
    while (index > 0 && value < bins[index]!.startMs) index -= 1;
    bins[index]!.count += 1;
  }
  const first = bins.findIndex((bin) => bin.count > 0);
  if (first === -1) return [];
  let last = bins.length - 1;
  while (bins[last]!.count === 0) last -= 1;
  return bins.slice(first, last + 1);
}

/** How much of a time slot the window observed. */
export type SlotCoverage = 'full' | 'partial' | 'none';

/** A closed wall-clock interval, in milliseconds. */
export interface TimeSpan {
  startMs: number
  endMs: number
}

/**
 * Wall-clock spans the window observed completely. No block exists between
 * two adjacent readable heights, so that stretch is fully known; an unreadable
 * body or a missing height leaves its surroundings unobserved apart from the
 * instants of the readable blocks themselves. The newest readable block is
 * observed through `headReadAtMs`, when the head was last read, provided no
 * unreadable block follows it.
 */
export function observedSpans(samples: readonly BlockSample[], headReadAtMs: number | null): TimeSpan[] {
  const ordered = [...samples].sort((a, b) => a.height - b.height);
  const raw: TimeSpan[] = [];
  ordered.forEach((sample, index) => {
    if (!isTimedSample(sample)) return;
    raw.push({ startMs: sample.createdAtMs, endMs: sample.createdAtMs });
    const next = ordered[index + 1];
    if (next && next.height === sample.height + 1 && isTimedSample(next)) {
      raw.push({ startMs: Math.min(sample.createdAtMs, next.createdAtMs), endMs: Math.max(sample.createdAtMs, next.createdAtMs) });
    }
  });
  const newest = ordered[ordered.length - 1];
  if (newest && isTimedSample(newest) && headReadAtMs !== null && Number.isFinite(headReadAtMs)) {
    raw.push({ startMs: newest.createdAtMs, endMs: Math.max(newest.createdAtMs, headReadAtMs) });
  }
  raw.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: TimeSpan[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last && span.startMs <= last.endMs) last.endMs = Math.max(last.endMs, span.endMs);
    else merged.push({ ...span });
  }
  return merged;
}

/** The parts of `spans` inside `[startMs, endMs]`. */
export function clipSpans(spans: readonly TimeSpan[], startMs: number, endMs: number): TimeSpan[] {
  return spans.flatMap((span) => {
    const clipped = { startMs: Math.max(span.startMs, startMs), endMs: Math.min(span.endMs, endMs) };
    return clipped.startMs <= clipped.endMs ? [clipped] : [];
  });
}

/** Coverage of the half-open slot `[startMs, endMs)` by observed spans. */
export function spanCoverage(startMs: number, endMs: number, spans: readonly TimeSpan[]): SlotCoverage {
  let touched = false;
  for (const span of spans) {
    if (span.startMs <= startMs && span.endMs >= endMs - 1) return 'full';
    if (span.startMs < endMs && span.endMs >= startMs) touched = true;
  }
  return touched ? 'partial' : 'none';
}

export interface ActivityBucket {
  startMs: number
  endMs: number
  blocks: number
  transactionsTotal: number
  transactionsRejected: number
  /** Only `full` buckets are measured zeros; others are lower bounds or unknown. */
  coverage: SlotCoverage
}

/** Nice bucket widths for wall-clock activity series. */
export const BUCKET_SIZES_MS: readonly number[] = [
  MINUTE_MS,
  5 * MINUTE_MS,
  10 * MINUTE_MS,
  15 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
];

const MAX_ACTIVITY_BUCKETS = 2000;

/** Smallest nice bucket width that keeps `spanMs` within `targetBuckets` buckets. */
export function chooseBucketMs(spanMs: number, targetBuckets = 48): number {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return BUCKET_SIZES_MS[0]!;
  const target = Math.max(1, Math.floor(targetBuckets));
  return BUCKET_SIZES_MS.find((size) => spanMs / size <= target) ?? BUCKET_SIZES_MS[BUCKET_SIZES_MS.length - 1]!;
}

/**
 * Wall-clock buckets aligned to multiples of `bucketMs` from the first to the
 * last observed span. Each bucket carries its coverage, so a zero is a
 * measured zero only where the bucket was fully observed.
 */
export function bucketBlocksByTime(
  samples: readonly BlockSample[],
  bucketMs: number,
  spans: readonly TimeSpan[]
): ActivityBucket[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) throw new RangeError('Bucket width must be positive');
  if (spans.length === 0) return [];
  const rangeStart = spans[0]!.startMs;
  const rangeEnd = spans[spans.length - 1]!.endMs;
  const firstStart = Math.floor(rangeStart / bucketMs) * bucketMs;
  const count = Math.floor((rangeEnd - firstStart) / bucketMs) + 1;
  if (count > MAX_ACTIVITY_BUCKETS) throw new RangeError('Too many activity buckets for the requested width');

  const buckets: ActivityBucket[] = Array.from({ length: count }, (_, index) => {
    const startMs = firstStart + index * bucketMs;
    const endMs = startMs + bucketMs;
    return {
      startMs,
      endMs,
      blocks: 0,
      transactionsTotal: 0,
      transactionsRejected: 0,
      coverage: spanCoverage(startMs, endMs, spans),
    };
  });
  for (const sample of samples) {
    if (!isTimedSample(sample) || sample.createdAtMs < rangeStart || sample.createdAtMs > rangeEnd) continue;
    const bucket = buckets[Math.floor((sample.createdAtMs - firstStart) / bucketMs)];
    if (!bucket) continue;
    bucket.blocks += 1;
    bucket.transactionsTotal += sample.transactionsTotal;
    bucket.transactionsRejected += sample.transactionsRejected;
  }
  return buckets;
}

export type HeatmapTimeZone = 'local' | 'utc';

export interface HeatmapCell {
  dayIndex: number
  hour: number
  startMs: number
  blocks: number
  transactions: number
  /** `none` where nothing was observed (no data, not zero); `partial` where only part was. */
  coverage: SlotCoverage
}

export interface DayHourHeatmap {
  /** Midnight of each calendar day, oldest first. */
  days: number[]
  cells: HeatmapCell[]
  maxTransactions: number
}

function startOfDay(ms: number, timeZone: HeatmapTimeZone): number {
  const date = new Date(ms);
  return timeZone === 'utc'
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function hourStart(dayStartMs: number, hour: number, timeZone: HeatmapTimeZone): number {
  const day = new Date(dayStartMs);
  return timeZone === 'utc'
    ? Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour)
    : new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).getTime();
}

function nextDay(dayStartMs: number, timeZone: HeatmapTimeZone): number {
  const day = new Date(dayStartMs);
  return timeZone === 'utc'
    ? Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)
    : new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
}

/**
 * Calendar-day × hour activity grid for the most recent `maxDays` days of the
 * observed spans. Each hour carries its coverage, so an unobserved hour never
 * reads as an idle one.
 */
export function dayHourHeatmap(
  samples: readonly BlockSample[],
  options: { spans: readonly TimeSpan[]; maxDays?: number; timeZone?: HeatmapTimeZone }
): DayHourHeatmap {
  const timeZone = options.timeZone ?? 'local';
  const maxDays = Math.max(1, Math.floor(options.maxDays ?? 7));
  const { spans } = options;
  if (spans.length === 0) return { days: [], cells: [], maxTransactions: 0 };
  const rangeStart = spans[0]!.startMs;
  const rangeEnd = spans[spans.length - 1]!.endMs;

  const days = [startOfDay(rangeEnd, timeZone)];
  const firstObservedDay = startOfDay(rangeStart, timeZone);
  while (days.length < maxDays && days[0]! > firstObservedDay) {
    const previous = new Date(days[0]!);
    days.unshift(
      timeZone === 'utc'
        ? Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate() - 1)
        : new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 1).getTime()
    );
  }

  const cells: HeatmapCell[] = [];
  const index = new Map<string, HeatmapCell>();
  days.forEach((dayStartMs, dayIndex) => {
    const dayEnd = nextDay(dayStartMs, timeZone);
    for (let hour = 0; hour < 24; hour += 1) {
      const startMs = hourStart(dayStartMs, hour, timeZone);
      // A skipped daylight-saving hour normalizes into the next hour; keep it unobserved.
      const endMs = Math.min(hourStart(dayStartMs, hour + 1, timeZone), dayEnd);
      const valid = startMs < endMs && startMs >= dayStartMs;
      const cell: HeatmapCell = {
        dayIndex,
        hour,
        startMs,
        blocks: 0,
        transactions: 0,
        coverage: valid ? spanCoverage(startMs, endMs, spans) : 'none',
      };
      cells.push(cell);
      if (valid) index.set(`${dayIndex}:${hour}`, cell);
    }
  });

  for (const sample of samples) {
    if (!isTimedSample(sample)) continue;
    const dayIndex = days.indexOf(startOfDay(sample.createdAtMs, timeZone));
    if (dayIndex === -1) continue;
    const date = new Date(sample.createdAtMs);
    const hour = timeZone === 'utc' ? date.getUTCHours() : date.getHours();
    const cell = index.get(`${dayIndex}:${hour}`);
    if (!cell) continue;
    cell.blocks += 1;
    cell.transactions += sample.transactionsTotal;
  }

  return {
    days,
    cells,
    maxTransactions: cells.reduce((max, cell) => Math.max(max, cell.transactions), 0),
  };
}

export interface WindowSummary {
  blocks: number
  timedBlocks: number
  missingHeights: number
  fromHeight: number | null
  toHeight: number | null
  transactionsTotal: number
  transactionsRejected: number
  /** Rejected share of transactions, `null` when the window holds none. */
  rejectionRate: number | null
  meanTransactionsPerBlock: number | null
  /** Visible transactions per readable block (block fill). */
  transactionsPerBlock: DistributionSummary | null
  busiestBlock: BlockSample | null
  /** Wall-clock time between the oldest and newest timed block. */
  spanMs: number | null
}

export function summarizeWindow(samples: readonly BlockSample[]): WindowSummary {
  const ordered = [...samples].sort((a, b) => a.height - b.height);
  const timed = ordered.filter(isTimedSample);
  const transactionsTotal = timed.reduce((sum, sample) => sum + sample.transactionsTotal, 0);
  const transactionsRejected = timed.reduce((sum, sample) => sum + sample.transactionsRejected, 0);
  const latestHeight = ordered[ordered.length - 1]?.height;
  const spanMs = timed.length >= 2 ? timed[timed.length - 1]!.createdAtMs - timed[0]!.createdAtMs : null;

  let busiestBlock: BlockSample | null = null;
  for (const sample of timed) {
    if (!busiestBlock || sample.transactionsTotal > busiestBlock.transactionsTotal) busiestBlock = sample;
  }

  return {
    blocks: ordered.length,
    timedBlocks: timed.length,
    missingHeights: countMissingHeights(ordered),
    fromHeight: ordered[0]?.height ?? null,
    toHeight: latestHeight ?? null,
    transactionsTotal,
    transactionsRejected,
    rejectionRate: transactionsTotal > 0 ? transactionsRejected / transactionsTotal : null,
    meanTransactionsPerBlock: timed.length > 0 ? transactionsTotal / timed.length : null,
    transactionsPerBlock: summarizeDistribution(timed.map((sample) => sample.transactionsTotal)),
    busiestBlock,
    spanMs,
  };
}

export interface RecentActivity {
  /** Minute buckets over the trailing span, each with its own coverage. */
  buckets: ActivityBucket[]
  transactions: number
  /** Time inside the span the window actually observed. */
  observedMs: number
  /** `null` until some time is observed. */
  perMinute: number | null
  /** The whole span was observed, so `transactions` is exact rather than a lower bound. */
  complete: boolean
}

/**
 * Activity over the trailing `spanMs` before `endMs`, from observed spans.
 * Iroha commits no empty blocks, so an observed quiet minute is a measured
 * zero; unobserved minutes stay unknown and the total becomes a lower bound.
 */
export function recentActivity(
  samples: readonly BlockSample[],
  { spans, endMs, spanMs = HOUR_MS }: { spans: readonly TimeSpan[]; endMs: number; spanMs?: number }
): RecentActivity {
  const startMs = endMs - spanMs;
  const clipped = clipSpans(spans, startMs, endMs);
  const observedMs = clipped.reduce((sum, span) => sum + (span.endMs - span.startMs), 0);
  const recent = samples.filter((sample) => isTimedSample(sample) && sample.createdAtMs >= startMs && sample.createdAtMs <= endMs);
  const transactions = recent.reduce((sum, sample) => sum + sample.transactionsTotal, 0);
  return {
    buckets: clipped.length > 0 ? bucketBlocksByTime(recent, MINUTE_MS, clipped) : [],
    transactions,
    observedMs,
    perMinute: observedMs > 0 ? (transactions / observedMs) * MINUTE_MS : null,
    complete: clipped.length === 1 && clipped[0]!.startMs <= startMs && clipped[0]!.endMs >= endMs,
  };
}

/** The busiest wall-clock minute in the window, `null` without timed blocks. */
export function peakMinute(samples: readonly BlockSample[]): { startMs: number; transactions: number } | null {
  const minutes = new Map<number, number>();
  for (const sample of samples) {
    if (!isTimedSample(sample)) continue;
    const startMs = Math.floor(sample.createdAtMs / MINUTE_MS) * MINUTE_MS;
    minutes.set(startMs, (minutes.get(startMs) ?? 0) + sample.transactionsTotal);
  }
  let peak: { startMs: number; transactions: number } | null = null;
  for (const [startMs, transactions] of minutes) {
    if (!peak || transactions > peak.transactions || (transactions === peak.transactions && startMs > peak.startMs)) {
      peak = { startMs, transactions };
    }
  }
  return peak;
}

export interface InclusionLatencies {
  /** Block creation minus the transaction's own creation time, for matched transactions. */
  values: number[]
  /** Transactions whose block lies outside the window or was unreadable. */
  unmatched: number
  /** Matched transactions created after their block: the signer's clock runs ahead. */
  clockAhead: number
}

/**
 * Wait from transaction creation to the block that carried it. Creation time
 * is the signer's own clock, so skew can make a value negative; those are
 * counted separately and never folded into the distribution.
 */
export function inclusionLatencies(
  transactions: readonly { block: number; createdAtMs: number | null }[],
  samples: readonly BlockSample[]
): InclusionLatencies {
  const blockTimes = new Map<number, number>();
  for (const sample of samples) if (isTimedSample(sample)) blockTimes.set(sample.height, sample.createdAtMs);
  const values: number[] = [];
  let unmatched = 0;
  let clockAhead = 0;
  for (const transaction of transactions) {
    const blockAt = blockTimes.get(transaction.block);
    if (blockAt === undefined || transaction.createdAtMs === null || !Number.isFinite(transaction.createdAtMs)) {
      unmatched += 1;
    } else if (blockAt < transaction.createdAtMs) {
      clockAhead += 1;
    } else {
      values.push(blockAt - transaction.createdAtMs);
    }
  }
  return { values, unmatched, clockAhead };
}

/**
 * Liveness as seen by the one Torii peer the Explorer reads. `delayed` is a
 * suspected delay at that peer, never a claim about the whole network.
 */
export type ChainActivityState = 'producing' | 'pending' | 'idle' | 'delayed' | 'stale' | 'unknown';

/** A block within this window counts as current production. */
export const PRODUCING_WINDOW_MS = MINUTE_MS;
/** Work queued longer than this without a block suggests a delay. */
export const DELAYED_QUEUE_AGE_MS = MINUTE_MS;
/** A status sample older than this can no longer describe the present. */
export const STATUS_STALE_MS = 30 * SECOND_MS;

/**
 * Classify liveness from one peer's status sample. Ages use the peer's own
 * `time_since_last_block_ms` plus local time elapsed since the sample
 * arrived, so client clock skew never enters. Iroha commits no empty blocks:
 * a quiet peer with no queued or in-flight work is idle, not delayed.
 */
export function classifyChainActivity(input: {
  nowMs: number
  /** Local clock time the status sample arrived; `null` before the first sample. */
  receivedAtMs: number | null
  timeSinceLastBlockMs: number | null
  queueDepth: number | null
  queueInflight: number | null
  oldestQueuedAgeMs: number | null
}): ChainActivityState {
  if (input.receivedAtMs === null || !Number.isFinite(input.receivedAtMs)) return 'unknown';
  const elapsedMs = Math.max(0, input.nowMs - input.receivedAtMs);
  if (elapsedMs > STATUS_STALE_MS) return 'stale';
  if (input.timeSinceLastBlockMs === null || !Number.isFinite(input.timeSinceLastBlockMs)) return 'unknown';

  const waiting = (input.queueDepth ?? 0) > 0 || (input.queueInflight ?? 0) > 0;
  if (waiting && input.oldestQueuedAgeMs !== null && input.oldestQueuedAgeMs + elapsedMs > DELAYED_QUEUE_AGE_MS) {
    return 'delayed';
  }
  if (input.timeSinceLastBlockMs + elapsedMs <= PRODUCING_WINDOW_MS) return 'producing';
  if (waiting) return 'pending';
  if (input.queueDepth === 0 && input.queueInflight === 0) return 'idle';
  return 'unknown';
}
