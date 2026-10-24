/**
 * Geometry for 240° analog dials. Angles are degrees clockwise from twelve
 * o'clock; the sweep runs from 8 o'clock (-120°) to 4 o'clock (+120°), which
 * leaves the bottom of the face clear for the digital readout.
 */

export const DIAL_START_DEG = -120;
export const DIAL_END_DEG = 120;

export type DialScale = 'linear' | 'log';

export interface DialRange {
  min: number
  max: number
  scale?: DialScale
}

export interface Point {
  x: number
  y: number
}

/** Position of `value` along the dial in [0, 1], or `null` when it cannot be placed. */
export function dialFraction(value: number | null, { min, max, scale = 'linear' }: DialRange): number | null {
  if (value === null || !Number.isFinite(value) || !(max > min)) return null;
  if (scale === 'log') {
    if (min <= 0) return null;
    const clamped = Math.min(max, Math.max(min, value));
    return (Math.log10(clamped) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  }
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function dialAngle(fraction: number): number {
  return DIAL_START_DEG + (DIAL_END_DEG - DIAL_START_DEG) * Math.min(1, Math.max(0, fraction));
}

export function polarPoint(center: Point, radius: number, angleDeg: number): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: center.x + radius * Math.sin(radians), y: center.y - radius * Math.cos(radians) };
}

/** Clockwise SVG arc path over `[startDeg, endDeg]`; empty when the span is not positive. */
export function arcPath(center: Point, radius: number, [startDeg, endDeg]: readonly [number, number]): string {
  const span = endDeg - startDeg;
  if (!(span > 0)) return '';
  const start = polarPoint(center, radius, startDeg);
  const end = polarPoint(center, radius, endDeg);
  const largeArc = span > 180 ? 1 : 0;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return `M ${round(start.x)} ${round(start.y)} A ${radius} ${radius} 0 ${largeArc} 1 ${round(end.x)} ${round(end.y)}`;
}
