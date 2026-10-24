/**
 * Mark geometry for dashboard charts: thin bars with a rounded data end and a
 * square baseline, separated by surface gaps rather than outlines.
 */

export const MAX_BAR_WIDTH = 24;
export const SURFACE_GAP = 2;
export const DATA_END_RADIUS = 4;

export interface BandLayout {
  band: number
  barWidth: number
  /** Left edge of the bar centred in band `index`. */
  barX: (index: number) => number
  center: (index: number) => number
}

/** Equal bands across `plotWidth`; bars cap at 24px and keep a 2px gap while there is room. */
export function bandLayout(count: number, plotWidth: number, left = 0): BandLayout {
  const band = count > 0 ? plotWidth / count : plotWidth;
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, band > SURFACE_GAP + 1 ? band - SURFACE_GAP : band));
  return {
    band,
    barWidth,
    barX: (index) => left + index * band + (band - barWidth) / 2,
    center: (index) => left + index * band + band / 2,
  };
}

/**
 * Bar outline from the baseline `y0` up to `y1` (SVG y grows downward) with
 * only the data end rounded. Empty when the bar has no height.
 */
export interface BarExtent {
  x: number
  width: number
  y0: number
  y1: number
}

export function barPath({ x, width, y0, y1 }: BarExtent, rounded = true): string {
  const height = y0 - y1;
  if (!(height > 0) || !(width > 0)) return '';
  const r = rounded ? Math.min(DATA_END_RADIUS, width / 2, height) : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  if (r === 0) return `M ${round(x)} ${round(y0)} V ${round(y1)} H ${round(x + width)} V ${round(y0)} Z`;
  return [
    `M ${round(x)} ${round(y0)}`,
    `V ${round(y1 + r)}`,
    `Q ${round(x)} ${round(y1)} ${round(x + r)} ${round(y1)}`,
    `H ${round(x + width - r)}`,
    `Q ${round(x + width)} ${round(y1)} ${round(x + width)} ${round(y1 + r)}`,
    `V ${round(y0)}`,
    'Z',
  ].join(' ');
}

export interface StackSegment {
  index: number
  y0: number
  y1: number
  /** Only the topmost visible segment carries the rounded data end. */
  top: boolean
}

/**
 * Stack non-negative `values` (bottom first) on `baseline`, converting each
 * cumulative total with `toY`. Each upper segment starts a 2px surface gap
 * above the one beneath it; segments too short to survive the gap vanish.
 */
export function stackSegments(values: readonly number[], baseline: number, toY: (value: number) => number): StackSegment[] {
  const segments: StackSegment[] = [];
  let total = 0;
  let previousTop = baseline;
  values.forEach((value, index) => {
    if (!(value > 0)) return;
    total += value;
    const y0 = segments.length === 0 ? baseline : previousTop - SURFACE_GAP;
    const y1 = toY(total);
    previousTop = y1;
    if (y0 - y1 > 0.5) segments.push({ index, y0, y1, top: false });
  });
  if (segments.length > 0) segments[segments.length - 1]!.top = true;
  return segments;
}

/** Indices to label along a dense axis so labels keep `minSpacing` pixels apart. */
export function labelStride(count: number, band: number, minSpacing = 56): number {
  if (count <= 0 || !(band > 0)) return 1;
  return Math.max(1, Math.ceil(minSpacing / band));
}
