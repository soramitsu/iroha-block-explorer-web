import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { i18n } from '@/shared/lib/localization';
import ChartFrame from './ChartFrame.vue';
import ColumnChart from './ColumnChart.vue';
import TimeSeriesChart from './TimeSeriesChart.vue';
import HeatmapChart from './HeatmapChart.vue';
import { describeTooltip, type ColumnDatum, type TimeSeriesPoint } from './types';
import type { HeatmapCell } from '@/shared/lib/chain-analytics';

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useElementSize: () => ({ width: ref(640.6), height: ref(200) }),
}));

const axis = { domain: [0, 10] as [number, number], ticks: [0, 5, 10] };
const series = [
  { key: 'committed', label: 'Committed', color: 'green' },
  { key: 'rejected', label: 'Rejected', color: 'purple' },
];

function columnChart(data: ColumnDatum[], extra: Record<string, unknown> = {}) {
  return mount(ColumnChart, {
    props: {
      data,
      series,
      width: 400,
      axis,
      formatTick: String,
      formatValue: String,
      chartLabel: 'Transactions per block',
      unknownLabel: 'Counts unknown',
      totalLabel: 'Total',
      ...extra,
    },
  });
}

describe('ChartFrame', () => {
  it('renders the chart slot at the measured whole-pixel width with its legend', () => {
    const wrapper = mount(ChartFrame, {
      props: { title: 'Cadence', legend: [{ key: 'a', label: 'Interval', color: 'red', shape: 'line' }] },
      slots: { default: '<template #default="{ width }"><span class="probe">{{ width }}</span></template>' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.probe').text()).toBe('640');
    expect(wrapper.find('.chart-frame__swatch').attributes('data-shape')).toBe('line');
    expect(wrapper.find('[data-test="chart-table-toggle"]').exists()).toBe(false);
  });

  it('switches to the table twin and back', async () => {
    const wrapper = mount(ChartFrame, {
      props: {
        title: 'Cadence',
        table: { columns: [{ key: 'h', label: 'Height' }, { key: 'v', label: 'Interval', align: 'end' }], rows: [{ h: '#2', v: '1 s' }] },
      },
      slots: { default: '<div class="probe" />' },
      global: { plugins: [i18n] },
    });
    const toggle = wrapper.find('[data-test="chart-table-toggle"]');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(wrapper.findAll('tbody td').map((cell) => cell.text())).toEqual(['#2', '1 s']);
    expect(wrapper.find('td[data-align="end"]').exists()).toBe(true);
    await toggle.trigger('click');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('keys hatch and hollow marks in the legend and footnotes the table markers', async () => {
    const wrapper = mount(ChartFrame, {
      props: {
        title: 'Throughput',
        legend: [
          { key: 'unknown', label: 'Counts unknown', color: 'gray', shape: 'hatch' },
          { key: 'partial', label: 'Partly observed', color: 'gray', shape: 'hollow' },
        ],
        table: { columns: [{ key: 'v', label: 'Value' }], rows: [{ v: '—' }], footnote: '— Counts unknown' },
      },
      slots: { default: '<div class="probe" />' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('.chart-frame__swatch').map((swatch) => swatch.attributes('data-shape'))).toEqual([
      'hatch',
      'hollow',
    ]);
    await wrapper.find('[data-test="chart-table-toggle"]').trigger('click');
    expect(wrapper.find('.chart-frame__footnote').text()).toBe('— Counts unknown');
  });

  it('shows an explicit empty message instead of an empty plot', () => {
    const wrapper = mount(ChartFrame, {
      props: { title: 'Cadence', empty: 'Not enough blocks yet.' },
      slots: { default: '<div class="probe" />' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.chart-frame__empty').text()).toBe('Not enough blocks yet.');
    expect(wrapper.find('.probe').exists()).toBe(false);
  });
});

describe('ColumnChart', () => {
  const data: ColumnDatum[] = [
    { key: 1, label: 'Block 1', values: { committed: 4, rejected: 1 } },
    { key: 2, label: 'Block 2', values: null },
    { key: 3, label: 'Block 3', values: { committed: 2, rejected: 0 } },
  ];

  it('stacks known columns and hatches unknown ones', () => {
    const wrapper = columnChart(data);
    const bars = wrapper.findAll('.column-chart__bar');
    expect(bars).toHaveLength(3);
    expect(bars[0]!.findAll('path')).toHaveLength(2);
    expect(bars[1]!.find('.column-chart__unknown').exists()).toBe(true);
    expect(bars[2]!.findAll('path')).toHaveLength(1);
    expect(wrapper.find('svg').attributes('aria-label')).toBe('Transactions per block');
  });

  it('opens on the newest column with keyboard focus and walks with arrows', async () => {
    const wrapper = columnChart(data);
    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    expect(wrapper.find('.chart-tooltip__title').text()).toBe('Block 3');
    expect(wrapper.findAll('.chart-tooltip__value').map((value) => value.text())).toEqual(['2', '0', '2']);

    await svg.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.find('.chart-tooltip__title').text()).toBe('Block 2');
    expect(wrapper.find('.chart-tooltip__name').text()).toBe('Counts unknown');

    await svg.trigger('keydown', { key: 'Home' });
    expect(wrapper.find('.chart-tooltip__title').text()).toBe('Block 1');
    await svg.trigger('blur');
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
  });

  it('marks a lower-bound column with a hollow point above it', () => {
    const wrapper = columnChart([
      { key: 1, label: '09:00', values: { committed: 4, rejected: 0 }, partial: true, note: 'Partly observed' },
      { key: 2, label: '10:00', values: { committed: 2, rejected: 0 } },
    ]);
    const bars = wrapper.findAll('.column-chart__bar');
    expect(bars[0]!.find('.column-chart__partial').exists()).toBe(true);
    expect(bars[1]!.find('.column-chart__partial').exists()).toBe(false);
  });

  it('announces the active column and closes it on Escape', async () => {
    const wrapper = columnChart(data);
    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    expect(wrapper.find('.column-chart__live').text()).toBe('Block 3: Committed 2, Rejected 0, Total 2');
    await svg.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
    expect(wrapper.find('.column-chart__live').text()).toBe('');
  });
});

describe('TimeSeriesChart', () => {
  const points = [
    { startMs: 0, endMs: 60_000, coverage: 'partial' as const, values: { committed: 3, rejected: 0 } },
    { startMs: 60_000, endMs: 120_000, coverage: 'full' as const, values: { committed: 0, rejected: 0 } },
    { startMs: 120_000, endMs: 180_000, coverage: 'partial' as const, values: { committed: 7, rejected: 1 } },
  ];

  function timeSeries(seriesPoints: TimeSeriesPoint[] = points) {
    return mount(TimeSeriesChart, {
      props: {
        points: seriesPoints,
        series: [
          { key: 'committed', label: 'Committed', color: 'green', area: true },
          { key: 'rejected', label: 'Rejected', color: 'purple' },
        ],
        width: 500,
        axis,
        formatTick: String,
        formatValue: String,
        formatRange: (start: number, end: number) => `${start}-${end}`,
        partialNote: 'Partly observed',
        unknownLabel: 'Counts unknown',
        chartLabel: 'Throughput',
      },
      global: { plugins: [i18n] },
    });
  }

  const bucket = (index: number, coverage: TimeSeriesPoint['coverage'], committed = 2): TimeSeriesPoint => ({
    startMs: index * 60_000,
    endMs: (index + 1) * 60_000,
    coverage,
    values: { committed, rejected: 0 },
  });

  it('draws one line per series, a wash for area series and hollow partial markers', () => {
    const wrapper = timeSeries();
    expect(wrapper.findAll('.time-series-chart__line')).toHaveLength(2);
    expect(wrapper.findAll('.time-series-chart__area')).toHaveLength(1);
    expect(wrapper.findAll('.time-series-chart__partial')).toHaveLength(4);
  });

  it('reads every series at the crosshair and flags partial buckets', async () => {
    const wrapper = timeSeries();
    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    expect(wrapper.find('.chart-tooltip__title').text()).toBe('120000-180000');
    expect(wrapper.findAll('.chart-tooltip__value').map((value) => value.text())).toEqual(['7', '1']);
    expect(wrapper.find('.chart-tooltip__note').text()).toBe('Partly observed');
    await svg.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.find('.chart-tooltip__note').exists()).toBe(false);
  });

  it('announces the crosshair reading and drops it on Escape', async () => {
    const wrapper = timeSeries();
    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    expect(wrapper.find('.time-series-chart__live').text()).toBe(
      '120000-180000: Committed 7, Rejected 1. Partly observed'
    );
    await svg.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.time-series-chart__crosshair').exists()).toBe(false);
    expect(wrapper.find('.time-series-chart__live').text()).toBe('');
  });

  it('breaks lines at unknown buckets, hatches them and never reads them as zero', async () => {
    const wrapper = timeSeries([bucket(0, 'full'), bucket(1, 'full'), bucket(2, 'none', 0), bucket(3, 'full'), bucket(4, 'partial')]);
    // Two runs per series (0–1 and 3–4), each with its own line; one area per run for the area series.
    expect(wrapper.findAll('.time-series-chart__line')).toHaveLength(4);
    expect(wrapper.findAll('.time-series-chart__area')).toHaveLength(2);
    expect(wrapper.findAll('.time-series-chart__unknown')).toHaveLength(1);
    expect(wrapper.findAll('.time-series-chart__partial')).toHaveLength(2);

    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    await svg.trigger('keydown', { key: 'ArrowLeft' });
    await svg.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.find('.chart-tooltip__name').text()).toBe('Counts unknown');
    expect(wrapper.find('.chart-tooltip__value').text()).toBe('—');
    expect(wrapper.find('.chart-tooltip__note').exists()).toBe(false);
    expect(wrapper.findAll('.time-series-chart__crosshair circle')).toHaveLength(0);
  });

  it('draws a fully observed bucket between unknown ones as a dot', () => {
    const wrapper = timeSeries([bucket(0, 'none', 0), bucket(1, 'full', 5), bucket(2, 'none', 0)]);
    expect(wrapper.findAll('.time-series-chart__line')).toHaveLength(0);
    expect(wrapper.findAll('.time-series-chart__dot')).toHaveLength(2);
    expect(wrapper.findAll('.time-series-chart__unknown')).toHaveLength(2);
  });

  it('snaps the pointer to the nearest bucket and clears on leave', async () => {
    const wrapper = timeSeries();
    const svg = wrapper.find('svg');
    const pointAt = async (clientX: number) => {
      svg.element.dispatchEvent(new MouseEvent('pointermove', { clientX, bubbles: true }));
      await nextTick();
      return wrapper.find('.chart-tooltip__title').text();
    };
    // Bucket centres sit at 121, 268 and 415 px across the 500 px plot.
    expect(await pointAt(250)).toBe('60000-120000');
    expect(await pointAt(5)).toBe('0-60000');
    expect(await pointAt(9_999)).toBe('120000-180000');
    await svg.trigger('pointerleave');
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
  });
});

describe('HeatmapChart', () => {
  function hours(coverage: (hour: number) => HeatmapCell['coverage'], busyHour: number): HeatmapCell[] {
    return Array.from({ length: 24 }, (_, hour) => ({
      dayIndex: 0,
      hour,
      startMs: hour * 3_600_000,
      blocks: hour === busyHour ? 2 : 0,
      transactions: hour === busyHour ? 9 : 0,
      coverage: coverage(hour),
    }));
  }

  function heatmapChart(cells: HeatmapCell[]) {
    return mount(HeatmapChart, {
      props: {
        heatmap: { days: [0], cells, maxTransactions: 9 },
        width: 600,
        chartLabel: 'Activity',
        valueLabel: 'Transactions',
        blocksLabel: 'Blocks',
        noDataLabel: 'Not scanned',
        partialNote: 'Partly observed',
        formatDay: () => 'Fri 24',
        formatHour: (hour: number) => String(hour),
        formatValue: String,
        formatSlot: (ms: number) => `slot ${ms}`,
      },
    });
  }

  it('hatches unscanned hours and marks partial ones', async () => {
    const wrapper = heatmapChart(hours((hour) => (hour < 10 ? 'none' : hour === 12 ? 'partial' : 'full'), 12));
    const rects = wrapper.findAll('.heatmap-chart__cell');
    expect(rects).toHaveLength(24);
    expect(rects[0]!.attributes('style')).toContain('url(#');
    expect(rects[12]!.attributes('style')).toContain('color-mix');
    expect(wrapper.findAll('.heatmap-chart__partial')).toHaveLength(1);

    await rects[3]!.trigger('pointerenter');
    expect(wrapper.find('.chart-tooltip__name').text()).toBe('Not scanned');
    await rects[12]!.trigger('pointerenter');
    expect(wrapper.findAll('.chart-tooltip__value').map((value) => value.text())).toEqual(['9', '2']);
    expect(wrapper.find('.chart-tooltip__note').text()).toBe('Partly observed');
  });

  it('opens keyboard focus on the newest observed hour, not an older partial one', async () => {
    // The window starts mid-way through 10:00 and the last head read landed exactly on 16:00.
    const wrapper = heatmapChart(hours((hour) => (hour === 10 ? 'partial' : hour > 10 && hour < 16 ? 'full' : 'none'), 15));
    const svg = wrapper.find('svg');
    await svg.trigger('focus');
    expect(wrapper.findAll('.heatmap-chart__cell')[15]!.attributes('data-active')).toBe('true');
    expect(wrapper.find('.heatmap-chart__live').text()).toBe('slot 54000000: Transactions 9, Blocks 2');

    await svg.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
    expect(wrapper.find('.heatmap-chart__live').text()).toBe('');
  });
});

describe('describeTooltip', () => {
  it('reads the title, every row and the note as one sentence', () => {
    expect(
      describeTooltip({
        title: 'Block 3',
        rows: [
          { key: 'committed', label: 'Committed', value: '2' },
          { key: 'rejected', label: 'Rejected', value: '0' },
        ],
        note: 'Partly observed',
      })
    ).toBe('Block 3: Committed 2, Rejected 0. Partly observed');
  });

  it('announces nothing without a tooltip and leaves out an absent note', () => {
    expect(describeTooltip(null)).toBe('');
    expect(describeTooltip({ title: 'Block 1', rows: [{ key: 'total', label: 'Total', value: '5' }] })).toBe(
      'Block 1: Total 5'
    );
  });
});
