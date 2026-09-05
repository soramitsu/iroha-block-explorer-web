import { describe, expect, it } from 'vitest';
import { classifySampleFreshness, SAMPLE_DELAYED_MS, SAMPLE_FRESH_MS } from './freshness';

describe('classifySampleFreshness', () => {
  const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0);

  it('returns unknown when sample timestamp is missing or invalid', () => {
    expect(classifySampleFreshness(null, nowMs)).toBe('unknown');
    expect(classifySampleFreshness(Number.NaN, nowMs)).toBe('unknown');
    expect(classifySampleFreshness(Number.POSITIVE_INFINITY, nowMs)).toBe('unknown');
  });

  it('returns fresh when age is within the fresh threshold', () => {
    expect(classifySampleFreshness(nowMs, nowMs)).toBe('fresh');
    expect(classifySampleFreshness(nowMs - SAMPLE_FRESH_MS, nowMs)).toBe('fresh');
  });

  it('returns delayed when age exceeds fresh threshold but stays within delayed threshold', () => {
    expect(classifySampleFreshness(nowMs - SAMPLE_FRESH_MS - 1, nowMs)).toBe('delayed');
    expect(classifySampleFreshness(nowMs - SAMPLE_DELAYED_MS, nowMs)).toBe('delayed');
  });

  it('returns stale when age exceeds delayed threshold', () => {
    expect(classifySampleFreshness(nowMs - SAMPLE_DELAYED_MS - 1, nowMs)).toBe('stale');
  });

  it('clamps future samples to fresh', () => {
    expect(classifySampleFreshness(nowMs + 5_000, nowMs)).toBe('fresh');
  });
});
