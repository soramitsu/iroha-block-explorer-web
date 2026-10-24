import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS, SECOND_MS, DAY_MS, type BlockSample } from './chain-analytics';
import {
  countIntoBuckets,
  coverageFootnote,
  coverageMessageKey,
  durationBinLabel,
  histogramColumns,
  hourOfDayColumns,
  laneMeters,
  parseWindowParam,
  perBlockColumns,
  rankCounts,
  throughputPoints,
} from './dashboard-models';

const T0 = Date.UTC(2026, 9, 24, 7, 0, 0);
const title = (height: number) => `Block ${height}`;

function sample(height: number, createdAtMs: number | null, total = 2, rejected = 1): BlockSample {
  return { height, createdAtMs, transactionsTotal: total, transactionsRejected: rejected };
}

describe('dashboard models', () => {
  it('parses only listed window sizes', () => {
    const allowed = [100, 250, 500];
    expect(parseWindowParam('250', allowed, 100)).toBe(250);
    expect(parseWindowParam(['500', '100'], allowed, 100)).toBe(500);
    expect(parseWindowParam('300', allowed, 100)).toBe(100);
    expect(parseWindowParam('2.5e2', allowed, 100)).toBe(100);
    expect(parseWindowParam(undefined, allowed, 250)).toBe(250);
  });

  it('stacks committed and rejected per block and keeps unreadable bodies unknown', () => {
    const columns = perBlockColumns([sample(1, T0, 5, 2), sample(2, null, 0, 0), sample(3, T0 + 1000, 1, 0)], 2, title);
    expect(columns).toEqual([
      { key: 2, label: 'Block 2', tick: '#2', values: null },
      { key: 3, label: 'Block 3', tick: '#3', values: { committed: 1, rejected: 0 } },
    ]);
  });

  it('labels duration bins, including the open-ended one', () => {
    expect(durationBinLabel({ startMs: SECOND_MS, endMs: 2 * SECOND_MS, count: 1 })).toBe('1s–2s');
    expect(durationBinLabel({ startMs: DAY_MS, endMs: null, count: 1 })).toBe('≥1d');
    expect(
      histogramColumns([
        { startMs: MINUTE_MS, endMs: 2 * MINUTE_MS, count: 4 },
        { startMs: HOUR_MS, endMs: null, count: 1 },
      ])
    ).toEqual([
      { key: MINUTE_MS, label: '1m–2m', tick: '1m', values: { count: 4 } },
      { key: HOUR_MS, label: '≥1h', tick: '≥1h', values: { count: 1 } },
    ]);
  });

  it('splits bucket totals into committed and rejected series', () => {
    expect(
      throughputPoints([
        { startMs: 0, endMs: 60, blocks: 2, transactionsTotal: 7, transactionsRejected: 2, coverage: 'partial' },
      ])
    ).toEqual([{ startMs: 0, endMs: 60, coverage: 'partial', values: { committed: 5, rejected: 2 } }]);
  });

  it('names lanes from the catalogue and orders them', () => {
    const status = {
      teu_lane_commit: [
        { lane_id: 2, capacity: 100, committed: 5, block_height: 9 },
        { lane_id: 0, capacity: 50, committed: 50, block_height: 9 },
      ],
      dataspace_catalog: [
        { lane_id: 0, dataspace_id: '0', alias: 'universal', lane_alias: 'core' },
        { lane_id: 2, dataspace_id: '7', alias: 'bank', lane_alias: '  ' },
      ],
    } as never;
    expect(laneMeters(status)).toEqual([
      { laneId: 0, alias: 'core', committed: 50, capacity: 50 },
      { laneId: 2, alias: null, committed: 5, capacity: 100 },
    ]);
    expect(laneMeters(null)).toEqual([]);
  });

  it('ranks counts and folds the tail', () => {
    const result = rankCounts(['a', 'b', 'a', 'c', 'a', 'b', 'd'], (item) => item, 2);
    expect(result.ranked).toEqual([
      { key: 'a', count: 3 },
      { key: 'b', count: 2 },
    ]);
    expect(result.remainder).toEqual({ keys: 2, count: 2 });
    expect(rankCounts([], (item: string) => item, 3)).toEqual({ ranked: [], remainder: { keys: 0, count: 0 } });
  });

  it('sums each local hour over observed days, flags lower bounds and leaves unobserved hours unknown', () => {
    const cell = (dayIndex: number, hour: number, transactions: number, coverage: 'full' | 'partial' | 'none') => ({
      dayIndex,
      hour,
      startMs: 0,
      blocks: 0,
      transactions,
      coverage,
    });
    const heatmap = {
      days: [0, 1],
      maxTransactions: 9,
      cells: [
        cell(0, 3, 4, 'full'),
        cell(1, 3, 5, 'partial'),
        cell(0, 4, 9, 'none'),
        cell(1, 4, 0, 'none'),
        cell(0, 6, 2, 'full'),
        cell(1, 6, 3, 'full'),
        cell(0, 7, 8, 'full'),
        cell(1, 7, 0, 'none'),
      ],
    };
    const columns = hourOfDayColumns(heatmap, (hour) => `${hour}:00`, 'lower bound');
    expect(columns).toHaveLength(24);
    expect(columns[3]).toEqual({
      key: 3,
      label: '3:00',
      tick: '03',
      values: { transactions: 9 },
      partial: true,
      note: 'lower bound',
    });
    expect(columns[4]).toMatchObject({ values: null });
    expect(columns[4]!.partial).toBeUndefined();
    expect(columns[5]!.values).toBeNull();
    expect(columns[6]).toEqual({ key: 6, label: '6:00', tick: '06', values: { transactions: 5 } });
    // One day unobserved at 07:00 leaves the other day's count as a lower bound.
    expect(columns[7]).toMatchObject({ values: { transactions: 8 }, partial: true });
  });

  it('footnotes only the row markers a table uses', () => {
    const labels = { partial: 'Partly observed', unknown: 'Counts unknown' };
    expect(coverageFootnote(['full', 'full'], labels)).toBe('');
    expect(coverageFootnote(['full', 'partial'], labels)).toBe('* Partly observed');
    expect(coverageFootnote(['none', 'full'], labels)).toBe('— Counts unknown');
    expect(coverageFootnote(['partial', 'none'], labels)).toBe('* Partly observed · — Counts unknown');
  });

  it('counts values into ordered buckets', () => {
    const columns = countIntoBuckets([0, 0, 1, 2, 4, 5, 7, 40, -1, Number.NaN], [0, 1, 2, 3, 6]);
    expect(columns.map((column) => [column.label, column.values?.count])).toEqual([
      ['0', 2],
      ['1', 1],
      ['2', 1],
      ['3–5', 2],
      ['6+', 2],
    ]);
    expect(() => countIntoBuckets([1], [0, 0])).toThrow(RangeError);
    expect(() => countIntoBuckets([1], [])).toThrow(RangeError);
  });
});

describe('dashboard models: coverage message', () => {
  const partial = { loaded: 300, target: 1000, complete: false };

  it('says the window is still being read only while a scan runs', () => {
    expect(coverageMessageKey(partial, { scanning: true, reachedGenesis: false })).toBe('scanning');
    expect(coverageMessageKey(partial, { scanning: false, reachedGenesis: false })).toBe('incomplete');
  });

  it('distinguishes a chain shorter than the window from a full window', () => {
    const short = { loaded: 42, target: 1000, complete: true };
    expect(coverageMessageKey(short, { scanning: false, reachedGenesis: true })).toBe('genesis');
    const full = { loaded: 1000, target: 1000, complete: true };
    expect(coverageMessageKey(full, { scanning: false, reachedGenesis: true })).toBe('complete');
    expect(coverageMessageKey(full, { scanning: true, reachedGenesis: false })).toBe('complete');
  });
});
