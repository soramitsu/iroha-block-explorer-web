import BigNumber from 'bignumber.js';

export function sum(values: readonly BigNumber[]): BigNumber {
  return values.reduce((acc, value) => acc.plus(value), new BigNumber(0));
}

export function sortAsc(values: readonly BigNumber[]): BigNumber[] {
  return [...values].sort((a, b) => a.comparedTo(b) ?? 0);
}

export function sortDesc(values: readonly BigNumber[]): BigNumber[] {
  return [...values].sort((a, b) => b.comparedTo(a) ?? 0);
}

export function median(values: readonly BigNumber[]): BigNumber | null {
  if (values.length === 0) return null;
  const sorted = sortAsc(values);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (!a || !b) return null;
  return a.plus(b).div(2);
}

export function quantile(values: readonly BigNumber[], q: number): BigNumber | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(q)) return null;
  const clamped = Math.min(1, Math.max(0, q));
  const sorted = sortAsc(values);
  const pos = (sorted.length - 1) * clamped;
  const base = Math.floor(pos);
  const rest = pos - base;
  const left = sorted[base];
  if (!left) return null;
  const right = sorted[base + 1];
  if (!right || rest === 0) return left;
  return left.plus(right.minus(left).times(rest));
}

/**
 * "Nearest-rank" quantile without interpolation.
 * For example: q=0.9 picks ceil(q*n)-th smallest value (1-indexed).
 */
export function nearestRankQuantile(values: readonly BigNumber[], q: number): BigNumber | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(q)) return null;
  const clamped = Math.min(1, Math.max(0, q));
  const sorted = sortAsc(values);
  const n = sorted.length;
  const rank = Math.max(1, Math.ceil(clamped * n));
  const idx = Math.min(n - 1, Math.max(0, rank - 1));
  return sorted[idx] ?? null;
}

/**
 * Gini coefficient for a non-negative distribution.
 *
 * Notes:
 * - If you exclude zero-balances (common for holder lists), Gini will look lower
 *   than the "all accounts incl. zeros" variant. Treat as "among holders".
 */
export function giniCoefficient(rawValues: readonly BigNumber[]): number {
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  const n = values.length;
  if (n === 0) return 0;

  const sorted = sortAsc(values);
  const total = sum(sorted);
  if (!total.isFinite() || total.isZero()) return 0;

  let weightedSum = new BigNumber(0);
  for (let idx = 0; idx < sorted.length; idx += 1) {
    const value = sorted[idx] ?? new BigNumber(0);
    weightedSum = weightedSum.plus(value.times(idx + 1));
  }

  const g = weightedSum
    .times(2)
    .div(total.times(n))
    .minus(new BigNumber(n + 1).div(n));

  // Clamp to avoid tiny negative/over-1 drift after float conversion.
  return Math.min(1, Math.max(0, g.toNumber()));
}

/**
 * Herfindahl-Hirschman Index (HHI): sum(share^2), range (1/n..1).
 */
export function herfindahlIndex(rawValues: readonly BigNumber[]): number {
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  if (values.length === 0) return 0;
  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return 0;

  let hhi = new BigNumber(0);
  for (const value of values) {
    const share = value.div(total);
    hhi = hhi.plus(share.pow(2));
  }

  return Math.min(1, Math.max(0, hhi.toNumber()));
}

/**
 * Concentration ratio: share of total held by top N holders.
 */
export function concentrationTopN(rawValues: readonly BigNumber[], n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  if (values.length === 0) return 0;
  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return 0;

  const top = sortDesc(values).slice(0, n);
  const topSum = sum(top);
  const ratio = topSum.div(total);
  return Math.min(1, Math.max(0, ratio.toNumber()));
}

/**
 * Nakamoto coefficient: minimal number of top holders required to reach `threshold` share.
 * Common thresholds: 0.33, 0.51, 0.67.
 */
export function nakamotoCoefficient(rawValues: readonly BigNumber[], threshold: number): number {
  if (!Number.isFinite(threshold)) return 0;
  const target = Math.min(1, Math.max(0, threshold));
  if (target <= 0) return 0;

  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  if (values.length === 0) return 0;
  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return 0;

  const sorted = sortDesc(values);
  const targetAmount = total.times(target);
  let acc = new BigNumber(0);
  for (let idx = 0; idx < sorted.length; idx += 1) {
    acc = acc.plus(sorted[idx] ?? 0);
    if (acc.gte(targetAmount)) return idx + 1;
  }
  return sorted.length;
}

function coerce(value: BigNumber.Value): BigNumber {
  return value instanceof BigNumber ? value : new BigNumber(value);
}

export function safeRatio(numerator: BigNumber.Value, denominator: BigNumber.Value): number | null {
  const n = coerce(numerator);
  const d = coerce(denominator);
  if (!n.isFinite() || !d.isFinite()) return null;
  if (d.isZero()) return null;
  return n.div(d).toNumber();
}

export function parseBigNumber(value: unknown): BigNumber | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new BigNumber(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new BigNumber(trimmed);
    return parsed.isFinite() ? parsed : null;
  }
  if (value instanceof BigNumber) return value;
  return null;
}

/**
 * Theil T index for a non-negative distribution.
 *
 * Computed as sum(p_i * ln(p_i * n)), where p_i is the share and n is sample size.
 */
export function theilIndexT(rawValues: readonly BigNumber[]): number {
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  const n = values.length;
  if (n <= 1) return 0;
  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return 0;

  let theil = 0;
  for (const value of values) {
    if (value.isZero()) continue;
    const share = value.div(total).toNumber();
    if (!Number.isFinite(share) || share <= 0) continue;
    theil += share * Math.log(share * n);
  }

  return Math.max(0, theil);
}

/**
 * Shannon entropy of shares: -sum(p_i ln p_i), in nats.
 */
export function shannonEntropy(rawValues: readonly BigNumber[]): number {
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  if (values.length === 0) return 0;
  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return 0;

  let entropy = 0;
  for (const value of values) {
    if (value.isZero()) continue;
    const share = value.div(total).toNumber();
    if (!Number.isFinite(share) || share <= 0) continue;
    entropy -= share * Math.log(share);
  }

  return Math.max(0, entropy);
}

/**
 * Normalized Shannon entropy: entropy / ln(k), where k is number of positive holders.
 */
export function normalizedEntropy(rawValues: readonly BigNumber[]): number {
  const positive = rawValues.filter((value) => value.isFinite() && value.gt(0));
  const k = positive.length;
  if (k <= 1) return 0;
  const denom = Math.log(k);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return Math.min(1, Math.max(0, shannonEntropy(positive) / denom));
}

export function effectiveNumberFromEntropy(entropy: number): number | null {
  if (!Number.isFinite(entropy) || entropy < 0) return null;
  const value = Math.exp(entropy);
  if (!Number.isFinite(value)) return null;
  return value;
}

export interface LorenzPoint { population: number, share: number }

/**
 * Lorenz curve points for a non-negative distribution (among provided values).
 * Returns `points + 1` points (including 0 and 1) with x=population share, y=value share.
 */
export function lorenzCurvePoints(rawValues: readonly BigNumber[], points = 20): LorenzPoint[] {
  const values = rawValues.filter((value) => value.isFinite() && value.gte(0));
  const n = values.length;
  if (n === 0) return [{ population: 0, share: 0 }, { population: 1, share: 1 }];

  const total = sum(values);
  if (!total.isFinite() || total.isZero()) return [{ population: 0, share: 0 }, { population: 1, share: 1 }];

  const sorted = sortAsc(values);
  const prefix: BigNumber[] = [new BigNumber(0)];
  for (const value of sorted) {
    prefix.push(prefix[prefix.length - 1]!.plus(value));
  }

  const safePoints = Number.isFinite(points) && points > 2 ? Math.floor(points) : 20;
  const out: LorenzPoint[] = [];
  for (let i = 0; i <= safePoints; i += 1) {
    const p = i / safePoints;
    const idx = p * n;
    const base = Math.floor(idx);
    const frac = idx - base;

    const baseSum = prefix[Math.min(base, n)] ?? new BigNumber(0);
    const interpolated =
      base < n && frac > 0 ? baseSum.plus((sorted[base] ?? new BigNumber(0)).times(frac)) : baseSum;

    out.push({
      population: p,
      share: Math.min(1, Math.max(0, interpolated.div(total).toNumber())),
    });
  }

  return out;
}
