export type FreshnessTone = 'fresh' | 'delayed' | 'stale' | 'unknown';

export const SAMPLE_FRESH_MS = 15_000;
export const SAMPLE_DELAYED_MS = 60_000;

export function classifySampleFreshness(lastSampleAtMs: number | null, nowMs: number = Date.now()): FreshnessTone {
  if (lastSampleAtMs === null || !Number.isFinite(lastSampleAtMs)) return 'unknown';

  const ageMs = Math.max(0, nowMs - lastSampleAtMs);
  if (ageMs <= SAMPLE_FRESH_MS) return 'fresh';
  if (ageMs <= SAMPLE_DELAYED_MS) return 'delayed';
  return 'stale';
}
