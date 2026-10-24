import type { RouteLocationRaw } from 'vue-router';
import type { SlotCoverage } from '@/shared/lib/chain-analytics';

export interface ChartLegendItem {
  key: string
  label: string
  color: string
  /** `hatch` keys unknown regions; `hollow` keys partly observed marks. */
  shape?: 'rect' | 'line' | 'hatch' | 'hollow'
}

export interface ChartTable {
  columns: Array<{ key: string; label: string; align?: 'start' | 'end' }>
  rows: Array<Record<string, string | number>>
  /** Explains row markers such as `*` (partly observed) and `—` (unknown). */
  footnote?: string
}

export interface ColumnSeries {
  key: string
  label: string
  color: string
}

export interface ColumnDatum {
  key: string | number
  /** Tooltip title. */
  label: string
  /** Axis label; omitted ticks fall back to `label`. */
  tick?: string
  /** `null` marks a column whose values are unknown (drawn hatched, never as zero). */
  values: Record<string, number> | null
  /** Only part of the column's span was observed, so its values are a lower bound. */
  partial?: boolean
  note?: string
}

export interface TimeSeriesPoint {
  startMs: number
  endMs: number
  coverage: SlotCoverage
  values: Record<string, number>
}

export interface TimeSeries {
  key: string
  label: string
  color: string
  area?: boolean
}

export interface RankedItem {
  key: string
  label: string
  value: number
  to?: RouteLocationRaw
}

export interface ShareSegment {
  key: string
  label: string
  value: number
  color: string
}

/** Theme-aware colours for chart marks; values resolve per light/dark theme. */
export const CHART_COLORS = {
  accent: 'var(--color_chart-accent)',
  good: 'var(--color_chart-good)',
  critical: 'var(--color_chart-critical)',
  warning: 'var(--color_chart-warning)',
  series: [
    'var(--color_chart-series-1)',
    'var(--color_chart-series-2)',
    'var(--color_chart-series-3)',
    'var(--color_chart-series-4)',
    'var(--color_chart-series-5)',
  ],
  muted: 'var(--color_dash-ink-muted)',
} as const;

export interface ChartTooltipContent {
  title: string
  rows: Array<{ key: string; label: string; value: string }>
  note?: string
}

/** Plain-text reading of a tooltip for screen-reader announcements. */
export function describeTooltip(tooltip: ChartTooltipContent | null): string {
  if (!tooltip) return '';
  const values = tooltip.rows.map((row) => `${row.label} ${row.value}`).join(', ');
  return [`${tooltip.title}: ${values}`, tooltip.note].filter(Boolean).join('. ');
}
