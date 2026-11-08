import { describe, expect, it } from 'vitest';
import { MAX_BAR_WIDTH, bandLayout, barPath, labelStride, stackSegments } from './chart-geometry';

describe('chart geometry', () => {
  it('caps bars at 24px and centres them in their band', () => {
    const layout = bandLayout(4, 400, 40);
    expect(layout.band).toBe(100);
    expect(layout.barWidth).toBe(MAX_BAR_WIDTH);
    expect(layout.barX(0)).toBe(40 + 38);
    expect(layout.center(1)).toBe(190);
  });

  it('keeps a 2px gap between dense bars and drops it when there is no room', () => {
    expect(bandLayout(100, 500).barWidth).toBe(3);
    expect(bandLayout(400, 800).barWidth).toBe(2);
    expect(bandLayout(1000, 500).barWidth).toBe(1);
  });

  it('rounds only the data end of a bar', () => {
    expect(barPath({ x: 10, width: 20, y0: 100, y1: 40 })).toBe('M 10 100 V 44 Q 10 40 14 40 H 26 Q 30 40 30 44 V 100 Z');
    expect(barPath({ x: 10, width: 20, y0: 100, y1: 40 }, false)).toBe('M 10 100 V 40 H 30 V 100 Z');
  });

  it('shrinks the radius for thin or short bars and draws nothing without height', () => {
    expect(barPath({ x: 0, width: 2, y0: 10, y1: 8 })).toContain('Q 0 8 1 8');
    expect(barPath({ x: 0, width: 10, y0: 10, y1: 10 })).toBe('');
    expect(barPath({ x: 0, width: 0, y0: 10, y1: 5 })).toBe('');
  });

  it('stacks segments with a surface gap and marks the top segment', () => {
    const segments = stackSegments([10, 5], 100, (value) => 100 - value * 4);
    expect(segments).toEqual([
      { index: 0, y0: 100, y1: 60, top: false },
      { index: 1, y0: 58, y1: 40, top: true },
    ]);
  });

  it('skips empty series and segments too short to survive the gap', () => {
    expect(stackSegments([0, 3], 100, (value) => 100 - value)).toEqual([{ index: 1, y0: 100, y1: 97, top: true }]);
    expect(stackSegments([10, 0.1], 100, (value) => 100 - value)).toEqual([{ index: 0, y0: 100, y1: 90, top: true }]);
    expect(stackSegments([0, 0], 100, (value) => 100 - value)).toEqual([]);
  });

  it('spaces dense axis labels', () => {
    expect(labelStride(100, 6)).toBe(10);
    expect(labelStride(5, 120)).toBe(1);
    expect(labelStride(0, 10)).toBe(1);
  });
});
