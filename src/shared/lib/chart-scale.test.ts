import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from './chain-analytics';
import {
  formatCompactNumber,
  formatDuration,
  formatDurationTick,
  formatPercent,
  formatTimeTick,
  linearScale,
  niceStep,
  niceZeroBasedAxis,
  timeTicks,
} from './chart-scale';

describe('chart scales', () => {
  it('maps and inverts a linear scale', () => {
    const scale = linearScale([0, 100], [200, 0]);
    expect(scale(0)).toBe(200);
    expect(scale(25)).toBe(150);
    expect(scale.invert(150)).toBe(25);
  });

  it('centres a degenerate linear domain instead of dividing by zero', () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
    expect(linearScale([0, 1], [3, 3]).invert(3)).toBe(0);
  });

  it('rounds steps to 1-2-5 multiples', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(230)).toBe(500);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it('builds zero-based axes that clear the tallest value', () => {
    expect(niceZeroBasedAxis(11, 4)).toEqual({ domain: [0, 15], ticks: [0, 5, 10, 15] });
    expect(niceZeroBasedAxis(7, 4)).toEqual({ domain: [0, 8], ticks: [0, 2, 4, 6, 8] });
    expect(niceZeroBasedAxis(0, 4)).toEqual({ domain: [0, 1], ticks: [0, 1] });
    expect(niceZeroBasedAxis(3, 4).ticks).toEqual([0, 1, 2, 3]);
  });

  it('keeps fractional steps for rates when the minimum step allows it', () => {
    expect(niceZeroBasedAxis(0.9, 3, 0.1)).toEqual({ domain: [0, 1], ticks: [0, 0.5, 1] });
  });

});

describe('chart formatting', () => {
  it('formats compact numbers', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(1284)).toBe('1,284');
    expect(formatCompactNumber(2.25)).toBe('2.3');
    expect(formatCompactNumber(12_900)).toBe('12.9K');
    expect(formatCompactNumber(4_200_000)).toBe('4.2M');
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formats percentages with adaptive precision', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.004)).toBe('0.4%');
    expect(formatPercent(0.00123)).toBe('0.12%');
    expect(formatPercent(0.0525)).toBe('5.3%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats durations across units', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(3900)).toBe('3.9 s');
    expect(formatDuration(3000)).toBe('3 s');
    expect(formatDuration(45 * SECOND_MS)).toBe('45 s');
    expect(formatDuration(4 * MINUTE_MS + 12 * SECOND_MS)).toBe('4m 12s');
    expect(formatDuration(5 * MINUTE_MS)).toBe('5m');
    expect(formatDuration(2 * HOUR_MS + 5 * MINUTE_MS)).toBe('2h 05m');
    expect(formatDuration(3 * DAY_MS + 4 * HOUR_MS)).toBe('3d 4h');
    expect(formatDuration(2 * DAY_MS)).toBe('2d');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });

  it('formats duration ticks compactly', () => {
    expect([100, SECOND_MS, 10 * SECOND_MS, MINUTE_MS, HOUR_MS, 6 * HOUR_MS, DAY_MS].map(formatDurationTick)).toEqual([
      '100ms',
      '1s',
      '10s',
      '1m',
      '1h',
      '6h',
      '1d',
    ]);
  });

  it('produces aligned wall-clock ticks', () => {
    const start = new Date(2026, 9, 20, 10, 7).getTime();
    const ticks = timeTicks(start, start + 2 * HOUR_MS, 4);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    for (const tick of ticks) {
      expect(new Date(tick).getMinutes() % 30).toBe(0);
      expect(tick).toBeGreaterThanOrEqual(start);
    }
    expect(timeTicks(start, start)).toEqual([]);
  });

  it('labels ticks by span', () => {
    const at = new Date(2026, 9, 20, 9, 5).getTime();
    expect(formatTimeTick(at, HOUR_MS)).toBe('09:05');
    expect(formatTimeTick(at, 2 * DAY_MS)).toBe('Oct 20, 09');
    expect(formatTimeTick(at, 7 * DAY_MS)).toBe('Oct 20');
  });

  it('labels ticks in the requested locale', () => {
    const at = new Date(2026, 9, 20, 9, 5).getTime();
    expect(formatTimeTick(at, 7 * DAY_MS, 'de')).toBe('20. Okt.');
    expect(formatTimeTick(at, HOUR_MS, 'de')).toBe('09:05');
  });
});
