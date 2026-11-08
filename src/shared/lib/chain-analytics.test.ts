import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  SECOND_MS,
  bucketBlocksByTime,
  chooseBucketMs,
  classifyChainActivity,
  blockIntervals,
  countMissingHeights,
  dayHourHeatmap,
  durationHistogram,
  isTimedSample,
  mergeBlockSamples,
  quantileSorted,
  clipSpans,
  observedSpans,
  spanCoverage,
  summarizeDistribution,
  summarizeWindow,
  recentActivity,
  peakMinute,
  inclusionLatencies,
  type BlockSample,
} from './chain-analytics';

const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);

function sample(height: number, createdAtMs: number | null, total = 1, rejected = 0): BlockSample {
  return { height, createdAtMs, transactionsTotal: total, transactionsRejected: rejected };
}

describe('chain analytics: isTimedSample', () => {
  it('accepts finite timestamps and rejects unavailable bodies', () => {
    expect(isTimedSample(sample(1, T0))).toBe(true);
    expect(isTimedSample(sample(1, null))).toBe(false);
    expect(isTimedSample(sample(1, Number.NaN))).toBe(false);
  });
});

describe('chain analytics: mergeBlockSamples', () => {
  it('orders by height and lets incoming pages replace stale rows', () => {
    const merged = mergeBlockSamples([sample(3, T0, 1), sample(1, T0, 1)], [sample(3, T0, 9), sample(2, T0, 2)], 10);
    expect(merged.map((row) => row.height)).toEqual([1, 2, 3]);
    expect(merged[2]!.transactionsTotal).toBe(9);
  });

  it('keeps only the newest heights when the window overflows', () => {
    const merged = mergeBlockSamples([sample(1, T0), sample(2, T0)], [sample(3, T0), sample(4, T0)], 3);
    expect(merged.map((row) => row.height)).toEqual([2, 3, 4]);
  });

  it('rejects a non-positive limit', () => {
    expect(() => mergeBlockSamples([], [], 0)).toThrow(RangeError);
    expect(() => mergeBlockSamples([], [], 1.5)).toThrow(RangeError);
  });
});

describe('chain analytics: countMissingHeights', () => {
  it('counts holes inside the sampled range only', () => {
    expect(countMissingHeights([sample(10, T0), sample(13, T0), sample(14, T0)])).toBe(2);
    expect(countMissingHeights([sample(10, T0), sample(11, T0)])).toBe(0);
    expect(countMissingHeights([sample(10, T0)])).toBe(0);
  });
});

describe('chain analytics: blockIntervals', () => {
  it('measures consecutive heights regardless of input order', () => {
    const intervals = blockIntervals([sample(3, T0 + 5000), sample(1, T0), sample(2, T0 + 2000)]);
    expect(intervals).toEqual([
      { height: 2, intervalMs: 2000 },
      { height: 3, intervalMs: 3000 },
    ]);
  });

  it('skips heights whose predecessor is missing or untimed', () => {
    const intervals = blockIntervals([sample(1, T0), sample(3, T0 + 9000), sample(4, null), sample(5, T0 + 20_000)]);
    expect(intervals).toEqual([]);
  });

  it('clamps clock skew to zero instead of reporting negative time', () => {
    expect(blockIntervals([sample(1, T0 + 10), sample(2, T0)])).toEqual([{ height: 2, intervalMs: 0 }]);
  });
});

describe('chain analytics: quantileSorted and summarizeDistribution', () => {
  it('interpolates between neighbours', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([10], 0.9)).toBe(10);
    expect(quantileSorted([], 0.5)).toBeNull();
    expect(quantileSorted([1, 2], Number.NaN)).toBeNull();
  });

  it('summarizes finite values and ignores non-finite ones', () => {
    expect(summarizeDistribution([5, 1, Number.NaN, 3])).toEqual({
      count: 3,
      min: 1,
      max: 5,
      mean: 3,
      median: 3,
      p90: 4.6,
      p95: 4.8,
    });
    expect(summarizeDistribution([])).toBeNull();
  });
});

describe('chain analytics: durationHistogram', () => {
  it('places values on human edges and trims empty ends', () => {
    const bins = durationHistogram([1500, 1900, 7 * SECOND_MS, 90 * MINUTE_MS]);
    expect(bins[0]).toEqual({ startMs: SECOND_MS, endMs: 2 * SECOND_MS, count: 2 });
    expect(bins.find((bin) => bin.startMs === 5 * SECOND_MS)?.count).toBe(1);
    // Empty bins between populated ones remain so gaps stay visible.
    expect(bins.find((bin) => bin.startMs === MINUTE_MS)?.count).toBe(0);
    expect(bins[bins.length - 1]).toEqual({ startMs: HOUR_MS, endMs: 2 * HOUR_MS, count: 1 });
  });

  it('puts very long gaps in the open-ended last bin', () => {
    const bins = durationHistogram([3 * DAY_MS]);
    expect(bins).toEqual([{ startMs: DAY_MS, endMs: null, count: 1 }]);
  });

  it('returns nothing for empty input and rejects unordered edges', () => {
    expect(durationHistogram([])).toEqual([]);
    expect(() => durationHistogram([1], [0, 5, 5])).toThrow(RangeError);
  });
});

describe('chain analytics: observedSpans', () => {
  it('observes stretches between adjacent readable heights and the head read', () => {
    const spans = observedSpans([sample(1, T0), sample(2, T0 + MINUTE_MS), sample(3, T0 + 2 * MINUTE_MS)], T0 + 5 * MINUTE_MS);
    expect(spans).toEqual([{ startMs: T0, endMs: T0 + 5 * MINUTE_MS }]);
  });

  it('leaves the surroundings of an unreadable block unobserved', () => {
    const spans = observedSpans([sample(1, T0), sample(2, null), sample(3, T0 + 2 * HOUR_MS)], T0 + 3 * HOUR_MS);
    expect(spans).toEqual([
      { startMs: T0, endMs: T0 },
      { startMs: T0 + 2 * HOUR_MS, endMs: T0 + 3 * HOUR_MS },
    ]);
  });

  it('does not extend through a missing height or past an unreadable head', () => {
    expect(observedSpans([sample(1, T0), sample(3, T0 + HOUR_MS)], null)).toEqual([
      { startMs: T0, endMs: T0 },
      { startMs: T0 + HOUR_MS, endMs: T0 + HOUR_MS },
    ]);
    expect(observedSpans([sample(1, T0), sample(2, null)], T0 + HOUR_MS)).toEqual([{ startMs: T0, endMs: T0 }]);
    expect(observedSpans([], T0)).toEqual([]);
  });
});

describe('chain analytics: clipSpans', () => {
  it('keeps only the parts of spans inside the window', () => {
    const spans = [
      { startMs: 0, endMs: 100 },
      { startMs: 150, endMs: 400 },
      { startMs: 500, endMs: 600 },
    ];
    expect(clipSpans(spans, 50, 450)).toEqual([
      { startMs: 50, endMs: 100 },
      { startMs: 150, endMs: 400 },
    ]);
    expect(clipSpans(spans, 410, 490)).toEqual([]);
  });
});

describe('chain analytics: spanCoverage', () => {
  const spans = [
    { startMs: 100, endMs: 300 },
    { startMs: 500, endMs: 500 },
  ];

  it('separates fully observed, touched and unobserved slots', () => {
    expect(spanCoverage(100, 200, spans)).toBe('full');
    expect(spanCoverage(250, 350, spans)).toBe('partial');
    expect(spanCoverage(450, 550, spans)).toBe('partial');
    expect(spanCoverage(350, 450, spans)).toBe('none');
  });

  it('treats the slot end as exclusive', () => {
    expect(spanCoverage(200, 301, spans)).toBe('full');
    expect(spanCoverage(200, 302, spans)).toBe('partial');
  });
});

describe('chain analytics: chooseBucketMs', () => {
  it('picks the smallest nice width within the target bucket count', () => {
    expect(chooseBucketMs(30 * MINUTE_MS, 48)).toBe(MINUTE_MS);
    expect(chooseBucketMs(6 * HOUR_MS, 48)).toBe(10 * MINUTE_MS);
    expect(chooseBucketMs(3 * DAY_MS, 48)).toBe(2 * HOUR_MS);
  });

  it('falls back to the smallest width for empty spans and caps huge spans', () => {
    expect(chooseBucketMs(0)).toBe(MINUTE_MS);
    expect(chooseBucketMs(10_000 * DAY_MS, 10)).toBe(7 * DAY_MS);
  });
});

describe('chain analytics: bucketBlocksByTime', () => {
  it('fills aligned buckets, marking only fully observed ones as measured', () => {
    const samples = [sample(1, T0 + 10 * SECOND_MS, 3, 1), sample(2, T0 + 50 * SECOND_MS, 2), sample(3, T0 + 3 * MINUTE_MS, 4)];
    const buckets = bucketBlocksByTime(samples, MINUTE_MS, observedSpans(samples, T0 + 3 * MINUTE_MS + 30 * SECOND_MS));
    expect(buckets.map((bucket) => [bucket.blocks, bucket.transactionsTotal, bucket.transactionsRejected])).toEqual([
      [2, 5, 1],
      [0, 0, 0],
      [0, 0, 0],
      [1, 4, 0],
    ]);
    expect(buckets[0]!.startMs).toBe(T0);
    expect(buckets.map((bucket) => bucket.coverage)).toEqual(['partial', 'full', 'full', 'partial']);
  });

  it('never reports hours around an unreadable block as observed zeros', () => {
    const samples = [sample(1, T0, 3), sample(2, null, 0), sample(3, T0 + 2 * HOUR_MS, 4)];
    const buckets = bucketBlocksByTime(samples, HOUR_MS, observedSpans(samples, T0 + 2 * HOUR_MS + MINUTE_MS));
    expect(buckets.map((bucket) => [bucket.transactionsTotal, bucket.coverage])).toEqual([
      [3, 'partial'],
      [0, 'none'],
      [4, 'partial'],
    ]);
  });

  it('returns nothing without observed spans and rejects invalid widths or runaway counts', () => {
    expect(bucketBlocksByTime([], MINUTE_MS, [])).toEqual([]);
    expect(() => bucketBlocksByTime([], 0, [{ startMs: T0, endMs: T0 }])).toThrow(RangeError);
    expect(() => bucketBlocksByTime([], SECOND_MS, [{ startMs: T0, endMs: T0 + DAY_MS }])).toThrow(RangeError);
  });
});

describe('chain analytics: dayHourHeatmap', () => {
  it('builds a UTC day × hour grid whose coverage follows observed spans', () => {
    const samples = [sample(1, T0 - DAY_MS + 30 * MINUTE_MS, 1), sample(2, T0 + 5 * MINUTE_MS, 7), sample(3, T0 + 10 * MINUTE_MS, 2)];
    const heatmap = dayHourHeatmap(samples, { spans: observedSpans(samples, T0 + 30 * MINUTE_MS), timeZone: 'utc' });
    expect(heatmap.days).toEqual([Date.UTC(2026, 9, 19), Date.UTC(2026, 9, 20)]);
    expect(heatmap.cells).toHaveLength(48);
    const cell = (dayIndex: number, hour: number) =>
      heatmap.cells.find((entry) => entry.dayIndex === dayIndex && entry.hour === hour)!;
    expect(cell(1, 12)).toMatchObject({ blocks: 2, transactions: 9, coverage: 'partial' });
    expect(heatmap.maxTransactions).toBe(9);
    expect(cell(0, 3).coverage).toBe('none');
    expect(cell(0, 12).coverage).toBe('partial');
    expect(cell(0, 13).coverage).toBe('full');
    expect(cell(1, 11).coverage).toBe('full');
    expect(cell(1, 13).coverage).toBe('none');
  });

  it('keeps hours around an unreadable block unobserved', () => {
    const samples = [sample(1, T0, 3), sample(2, null, 0), sample(3, T0 + 3 * HOUR_MS, 4)];
    const heatmap = dayHourHeatmap(samples, { spans: observedSpans(samples, T0 + 3 * HOUR_MS), timeZone: 'utc' });
    const hours = heatmap.cells.filter((entry) => entry.hour >= 12 && entry.hour <= 15).map((entry) => entry.coverage);
    expect(hours).toEqual(['partial', 'none', 'none', 'partial']);
  });

  it('limits the grid to the newest days', () => {
    const heatmap = dayHourHeatmap([], { spans: [{ startMs: T0 - 20 * DAY_MS, endMs: T0 }], maxDays: 3, timeZone: 'utc' });
    expect(heatmap.days).toHaveLength(3);
    expect(heatmap.days[2]).toBe(Date.UTC(2026, 9, 20));
    expect(heatmap.maxTransactions).toBe(0);
  });

  it('uses local calendar days by default and returns an empty grid without spans', () => {
    const localNoon = new Date(2026, 9, 20, 12, 15).getTime();
    const heatmap = dayHourHeatmap([sample(1, localNoon, 4)], { spans: [{ startMs: localNoon - HOUR_MS, endMs: localNoon }] });
    expect(heatmap.days).toEqual([new Date(2026, 9, 20).getTime()]);
    expect(heatmap.cells.find((entry) => entry.hour === 12)!.transactions).toBe(4);
    expect(dayHourHeatmap([], { spans: [] })).toEqual({ days: [], cells: [], maxTransactions: 0 });
  });
});

describe('chain analytics: summarizeWindow', () => {
  it('summarizes counts and block fill', () => {
    const summary = summarizeWindow([
      sample(10, T0, 4, 1),
      sample(11, T0 + 2 * SECOND_MS, 6, 0),
      sample(12, T0 + 60 * SECOND_MS, 2, 1),
    ]);
    expect(summary).toMatchObject({
      blocks: 3,
      timedBlocks: 3,
      missingHeights: 0,
      fromHeight: 10,
      toHeight: 12,
      transactionsTotal: 12,
      transactionsRejected: 2,
      spanMs: 60 * SECOND_MS,
    });
    expect(summary.rejectionRate).toBeCloseTo(2 / 12, 10);
    expect(summary.meanTransactionsPerBlock).toBe(4);
    expect(summary.transactionsPerBlock).toMatchObject({ median: 4, max: 6 });
    expect(summary.busiestBlock?.height).toBe(11);
  });

  it('keeps unknown counts out of totals and block fill', () => {
    const summary = summarizeWindow([sample(1, T0, 3), sample(2, null, 0), sample(4, T0 + MINUTE_MS, 5)]);
    expect(summary.timedBlocks).toBe(2);
    expect(summary.transactionsTotal).toBe(8);
    expect(summary.missingHeights).toBe(1);
    expect(summary.transactionsPerBlock).toMatchObject({ count: 2, min: 3, max: 5 });
  });

  it('handles an empty window', () => {
    expect(summarizeWindow([])).toMatchObject({
      blocks: 0,
      fromHeight: null,
      toHeight: null,
      rejectionRate: null,
      meanTransactionsPerBlock: null,
      transactionsPerBlock: null,
      busiestBlock: null,
      spanMs: null,
    });
  });
});

describe('chain analytics: recentActivity', () => {
  const end = T0 + HOUR_MS;
  const samples = [sample(1, T0 - HOUR_MS, 50), sample(2, T0 + 30 * MINUTE_MS, 12), sample(3, T0 + 59 * MINUTE_MS, 18)];

  it('counts the trailing hour exactly when it was fully observed', () => {
    const activity = recentActivity(samples, { spans: observedSpans(samples, end), endMs: end });
    expect(activity).toMatchObject({ transactions: 30, observedMs: HOUR_MS, perMinute: 0.5, complete: true });
    expect(activity.buckets.filter((bucket) => bucket.transactionsTotal > 0)).toHaveLength(2);
    expect(activity.buckets.every((bucket) => bucket.coverage !== 'none')).toBe(true);
  });

  it('reads an observed quiet hour as zero', () => {
    const quiet = [sample(1, T0 - 3 * HOUR_MS, 9)];
    expect(recentActivity(quiet, { spans: observedSpans(quiet, end), endMs: end })).toMatchObject({
      transactions: 0,
      observedMs: HOUR_MS,
      perMinute: 0,
      complete: true,
    });
  });

  it('becomes a lower bound when part of the hour was not observed', () => {
    const gappy = [sample(1, T0 + 5 * MINUTE_MS, 4), sample(2, null, 0), sample(3, T0 + 50 * MINUTE_MS, 6)];
    const activity = recentActivity(gappy, { spans: observedSpans(gappy, end), endMs: end });
    expect(activity.complete).toBe(false);
    expect(activity.transactions).toBe(10);
    expect(activity.observedMs).toBe(10 * MINUTE_MS);
    expect(activity.buckets.some((bucket) => bucket.coverage === 'none')).toBe(true);
    expect(recentActivity([], { spans: [], endMs: end })).toMatchObject({ buckets: [], transactions: 0, observedMs: 0, perMinute: null });
  });
});

describe('chain analytics: peakMinute', () => {
  it('finds the busiest wall-clock minute, preferring the latest on ties', () => {
    const peak = peakMinute([
      sample(1, T0 + 5 * SECOND_MS, 3),
      sample(2, T0 + 40 * SECOND_MS, 4),
      sample(3, T0 + 3 * MINUTE_MS, 7),
      sample(4, null, 99),
    ]);
    expect(peak).toEqual({ startMs: T0 + 3 * MINUTE_MS, transactions: 7 });
    expect(peakMinute([])).toBeNull();
  });
});

describe('chain analytics: inclusionLatencies', () => {
  const blocks = [sample(10, T0), sample(11, T0 + 10 * SECOND_MS), sample(12, null)];

  it('measures creation-to-block waits for transactions in the window', () => {
    const result = inclusionLatencies(
      [
        { block: 10, createdAtMs: T0 - 2 * SECOND_MS },
        { block: 11, createdAtMs: T0 + 9500 },
      ],
      blocks
    );
    expect(result).toEqual({ values: [2 * SECOND_MS, 500], unmatched: 0, clockAhead: 0 });
  });

  it('separates clock skew and unmatched transactions from the distribution', () => {
    const result = inclusionLatencies(
      [
        { block: 10, createdAtMs: T0 + 3 * SECOND_MS },
        { block: 12, createdAtMs: T0 },
        { block: 99, createdAtMs: T0 },
        { block: 11, createdAtMs: null },
      ],
      blocks
    );
    expect(result).toEqual({ values: [], unmatched: 3, clockAhead: 1 });
  });
});

describe('chain analytics: classifyChainActivity', () => {
  const now = T0;
  const base = {
    nowMs: now,
    receivedAtMs: now - 2000,
    timeSinceLastBlockMs: 5000,
    queueDepth: 0,
    queueInflight: 0,
    oldestQueuedAgeMs: 0,
  };

  it('reports production when the peer committed a block recently', () => {
    expect(classifyChainActivity(base)).toBe('producing');
  });

  it('adds local time elapsed since the sample instead of comparing clocks', () => {
    expect(classifyChainActivity({ ...base, receivedAtMs: now - 20_000, timeSinceLastBlockMs: 50_000 })).toBe('idle');
  });

  it('reports an idle peer only when nothing is queued or in flight', () => {
    expect(classifyChainActivity({ ...base, timeSinceLastBlockMs: HOUR_MS })).toBe('idle');
    expect(classifyChainActivity({ ...base, timeSinceLastBlockMs: HOUR_MS, queueInflight: 2 })).toBe('pending');
  });

  it('distinguishes freshly queued work from a suspected delay', () => {
    expect(classifyChainActivity({ ...base, timeSinceLastBlockMs: HOUR_MS, queueDepth: 3, oldestQueuedAgeMs: 2000 })).toBe(
      'pending'
    );
    expect(classifyChainActivity({ ...base, queueDepth: 3, oldestQueuedAgeMs: 5 * MINUTE_MS })).toBe('delayed');
  });

  it('refuses to classify from a stale or missing sample', () => {
    expect(classifyChainActivity({ ...base, receivedAtMs: now - 31_000 })).toBe('stale');
    expect(classifyChainActivity({ ...base, receivedAtMs: null })).toBe('unknown');
    expect(classifyChainActivity({ ...base, timeSinceLastBlockMs: null })).toBe('unknown');
    expect(
      classifyChainActivity({ ...base, timeSinceLastBlockMs: HOUR_MS, queueDepth: null, queueInflight: null })
    ).toBe('unknown');
  });
});
