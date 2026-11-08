import { describe, expect, it } from 'vitest';
import { DIAL_END_DEG, DIAL_START_DEG, arcPath, dialAngle, dialFraction, polarPoint } from './gauge-geometry';

const CENTER = { x: 100, y: 100 };

describe('gauge geometry', () => {
  it('places linear values and clamps outside the range', () => {
    expect(dialFraction(50, { min: 0, max: 200 })).toBe(0.25);
    expect(dialFraction(-5, { min: 0, max: 200 })).toBe(0);
    expect(dialFraction(500, { min: 0, max: 200 })).toBe(1);
  });

  it('places log values by decade', () => {
    expect(dialFraction(100, { min: 10, max: 1000, scale: 'log' })).toBeCloseTo(0.5, 10);
    expect(dialFraction(1, { min: 10, max: 1000, scale: 'log' })).toBe(0);
    expect(dialFraction(10, { min: 0, max: 1000, scale: 'log' })).toBeNull();
  });

  it('refuses values it cannot place', () => {
    expect(dialFraction(null, { min: 0, max: 10 })).toBeNull();
    expect(dialFraction(Number.NaN, { min: 0, max: 10 })).toBeNull();
    expect(dialFraction(5, { min: 10, max: 10 })).toBeNull();
  });

  it('maps fractions onto the 240° sweep', () => {
    expect(dialAngle(0)).toBe(DIAL_START_DEG);
    expect(dialAngle(1)).toBe(DIAL_END_DEG);
    expect(dialAngle(0.5)).toBe(0);
    expect(dialAngle(2)).toBe(DIAL_END_DEG);
  });

  it('converts clockwise-from-noon angles to points', () => {
    const top = polarPoint(CENTER, 50, 0);
    expect(top.x).toBeCloseTo(100, 10);
    expect(top.y).toBeCloseTo(50, 10);
    const right = polarPoint(CENTER, 50, 90);
    expect(right.x).toBeCloseTo(150, 10);
    expect(right.y).toBeCloseTo(100, 10);
  });

  it('draws arcs with the large-arc flag only past 180°', () => {
    expect(arcPath(CENTER, 50, [-90, 0])).toBe('M 50 100 A 50 50 0 0 1 100 50');
    expect(arcPath(CENTER, 50, [-135, 135])).toContain(' 0 1 1 ');
    expect(arcPath(CENTER, 50, [10, 10])).toBe('');
  });
});
