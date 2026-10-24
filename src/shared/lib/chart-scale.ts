/**
 * Scales, ticks and number/duration formatting shared by dashboard charts.
 * Every function is pure so axis behaviour is testable without rendering.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from './chain-analytics';

export interface LinearScale {
  (value: number): number
  domain: readonly [number, number]
  range: readonly [number, number]
  invert: (position: number) => number
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  scale.invert = (position: number) => (r1 === r0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span);
  return scale;
}

/** Round a raw step to 1, 2 or 5 × 10^k. */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export interface NiceAxis {
  domain: [number, number]
  ticks: number[]
}

/**
 * A zero-based axis for non-negative magnitudes. The domain top is rounded up
 * to a whole step so the tallest mark never touches the frame.
 */
export function niceZeroBasedAxis(max: number, targetTicks = 4, minStep = 1): NiceAxis {
  const top = Number.isFinite(max) && max > 0 ? max : 0;
  const step = Math.max(minStep, niceStep(top / Math.max(1, targetTicks)));
  const ceiling = Math.max(step, Math.ceil(top / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= ceiling + step / 2; value += step) ticks.push(Number(value.toPrecision(12)));
  return { domain: [0, ceiling], ticks };
}

const groupedInteger = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** 1,284 / 12.9K / 4.2M — grouped below ten thousand, compact above. */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 10_000) {
    return Number.isInteger(value) ? groupedInteger.format(value) : oneDecimal.format(value);
  }
  return compact.format(value);
}

/** Percent with adaptive precision: 0%, 0.4%, 12%, 100%. */
export function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const percent = ratio * 100;
  if (percent === 0 || percent >= 10) return `${Math.round(percent)}%`;
  return `${percent.toFixed(percent < 1 ? 2 : 1).replace(/\.?0+$/, '')}%`;
}

/** Readable duration: 850 ms, 3.9 s, 45 s, 4m 12s, 2h 05m, 3d 4h. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < SECOND_MS) return `${Math.round(ms)} ms`;
  if (ms < 10 * SECOND_MS) return `${(ms / SECOND_MS).toFixed(1).replace(/\.0$/, '')} s`;
  if (ms < MINUTE_MS) return `${Math.round(ms / SECOND_MS)} s`;
  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);
    const seconds = Math.floor((ms % MINUTE_MS) / SECOND_MS);
    return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/** Compact axis label for a duration tick: 100ms, 1s, 10s, 1m, 10m, 1h, 6h, 1d, 7d. */
export function formatDurationTick(ms: number): string {
  if (ms < SECOND_MS) return `${ms}ms`;
  if (ms < MINUTE_MS) return `${ms / SECOND_MS}s`;
  if (ms < HOUR_MS) return `${ms / MINUTE_MS}m`;
  if (ms < DAY_MS) return `${ms / HOUR_MS}h`;
  return `${ms / DAY_MS}d`;
}

/** Bucket-aligned wall-clock ticks, at most `targetTicks + 1` of them. */
export function timeTicks(startMs: number, endMs: number, targetTicks = 5): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const steps = [
    MINUTE_MS,
    5 * MINUTE_MS,
    15 * MINUTE_MS,
    30 * MINUTE_MS,
    HOUR_MS,
    3 * HOUR_MS,
    6 * HOUR_MS,
    12 * HOUR_MS,
    DAY_MS,
    2 * DAY_MS,
    7 * DAY_MS,
  ];
  const span = endMs - startMs;
  const step = steps.find((candidate) => span / candidate <= Math.max(1, targetTicks)) ?? steps[steps.length - 1]!;
  // Align to the step in local time so ticks land on readable clock values.
  const offset = new Date(startMs).getTimezoneOffset() * MINUTE_MS;
  const first = Math.ceil((startMs - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (let tick = first; tick <= endMs; tick += step) ticks.push(tick);
  return ticks;
}

/** Label wall-clock ticks: clock time inside one day, dates otherwise. */
export function formatTimeTick(ms: number, spanMs: number, locale = 'en-US'): string {
  const clock: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (spanMs <= DAY_MS) return new Intl.DateTimeFormat(locale, clock).format(ms);
  if (spanMs <= 3 * DAY_MS) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', hourCycle: 'h23' }).format(ms);
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(ms);
}
