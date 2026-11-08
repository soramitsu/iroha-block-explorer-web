import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/shared/lib/localization';
import DashDial from './DashDial.vue';
import DashOdometer from './DashOdometer.vue';
import DashSegmented from './DashSegmented.vue';
import DashMeter from './DashMeter.vue';
import DashStatTile from './DashStatTile.vue';
import DashLamp from './DashLamp.vue';
import ShareBar from './ShareBar.vue';
import RankedBars from './RankedBars.vue';

const dialProps = {
  min: 0,
  max: 100,
  label: 'Throughput',
  readout: '50/min',
  ticks: [0, 50, 100],
  formatTick: (value: number) => String(value),
};

describe('DashDial', () => {
  it('points the needle at the value and names the reading', () => {
    const wrapper = mount(DashDial, { props: { ...dialProps, value: 50 } });
    expect(wrapper.find('.dash-dial__needle').attributes('style')).toContain('rotate(0deg)');
    expect(wrapper.attributes('aria-label')).toBe('Throughput: 50/min');
    expect(wrapper.findAll('.dash-dial__ticks text').map((tick) => tick.text())).toEqual(['0', '50', '100']);
    expect(wrapper.find('.dash-dial__value').attributes('d')).toMatch(/^M /);
  });

  it('draws no needle or value arc for an unknown reading', () => {
    const wrapper = mount(DashDial, { props: { ...dialProps, value: null, readout: '—' } });
    expect(wrapper.find('.dash-dial__needle').exists()).toBe(false);
    expect(wrapper.find('.dash-dial__value').exists()).toBe(false);
    expect(wrapper.find('.dash-dial__readout').text()).toBe('—');
  });

  it('draws only zones that fit the scale, plus the reference notch', () => {
    const wrapper = mount(DashDial, {
      props: {
        ...dialProps,
        value: 10,
        marker: 75,
        zones: [
          { from: 80, to: 100, tone: 'critical' },
          { from: 60, to: 40, tone: 'warning' },
        ],
      },
    });
    expect(wrapper.findAll('.dash-dial__zone')).toHaveLength(1);
    expect(wrapper.find('.dash-dial__zone').attributes('data-tone')).toBe('critical');
    expect(wrapper.find('.dash-dial__marker').exists()).toBe(true);
  });
});

describe('DashOdometer', () => {
  it('renders one wheel per digit and keeps group separators', () => {
    const wrapper = mount(DashOdometer, { props: { value: 1102, label: 'Height' } });
    const cells = wrapper.findAll('.dash-odometer__cell');
    expect(cells.map((cell) => cell.attributes('data-kind'))).toEqual(['digit', 'separator', 'digit', 'digit', 'digit']);
    expect(wrapper.findAll('.dash-odometer__strip')[1]?.attributes('style')).toContain('translateY(-10%)');
    expect(wrapper.attributes('aria-label')).toBe('Height: 1,102');
  });

  it('shows a placeholder until the height is known', () => {
    const wrapper = mount(DashOdometer, { props: { value: null, label: 'Height' } });
    expect(wrapper.find('[data-kind="placeholder"]').text()).toBe('—');
    expect(wrapper.attributes('aria-label')).toBe('Height: —');
  });
});

describe('DashSegmented', () => {
  const options = [
    { value: 100, label: '100' },
    { value: 250, label: '250' },
    { value: 500, label: '500' },
  ];

  function mountSegmented(modelValue: number): VueWrapper {
    const holder: { wrapper?: VueWrapper } = {};
    holder.wrapper = mount(DashSegmented, {
      props: {
        options,
        label: 'Window',
        modelValue,
        'onUpdate:modelValue': (value: string | number) => holder.wrapper?.setProps({ modelValue: value }),
      },
    });
    return holder.wrapper;
  }

  it('selects on click and marks the checked key', async () => {
    const wrapper = mountSegmented(100);
    expect(wrapper.attributes('role')).toBe('radiogroup');
    await wrapper.findAll('button')[2]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([500]);
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(wrapper.findAll('button').map((button) => button.attributes('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('moves the selection with arrow keys, wrapping at the ends', async () => {
    const wrapper = mountSegmented(100);
    await wrapper.findAll('button')[0]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([500]);
    await wrapper.findAll('button')[2]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([100]);
    await wrapper.findAll('button')[0]!.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([500]);
    await wrapper.findAll('button')[2]!.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
  });

  it('follows the reading direction in right-to-left layouts', async () => {
    document.documentElement.dir = 'rtl';
    try {
      const wrapper = mountSegmented(250);
      await wrapper.findAll('button')[1]!.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([100]);
      await wrapper.findAll('button')[0]!.trigger('keydown', { key: 'ArrowLeft' });
      expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([250]);
      await wrapper.findAll('button')[1]!.trigger('keydown', { key: 'ArrowDown' });
      expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([500]);
    } finally {
      document.documentElement.dir = '';
    }
  });
});

describe('DashMeter', () => {
  it('fills by share of capacity and escalates through thresholds', async () => {
    const wrapper = mount(DashMeter, {
      props: { label: 'Queue', value: 85, max: 100, valueText: '85 of 100', warnAt: 0.8, criticalAt: 0.95 },
    });
    expect(wrapper.find('.dash-meter__fill').attributes('style')).toContain('width: 85%');
    expect(wrapper.find('.dash-meter__fill').attributes('data-tone')).toBe('warning');
    expect(wrapper.find('[role="meter"]').attributes('aria-valuetext')).toBe('85 of 100');

    await wrapper.setProps({ value: 99 });
    expect(wrapper.find('.dash-meter__fill').attributes('data-tone')).toBe('critical');
  });

  it('stays empty for an unknown value or capacity', () => {
    const wrapper = mount(DashMeter, { props: { label: 'Queue', value: null, max: 0, valueText: '—' } });
    expect(wrapper.find('.dash-meter__fill').attributes('style')).toContain('width: 0%');
    expect(wrapper.find('.dash-meter__fill').attributes('data-tone')).toBe('normal');
  });
});

describe('DashStatTile and DashLamp', () => {
  it('draws a sparkline only with two or more values', async () => {
    const wrapper = mount(DashStatTile, { props: { label: 'Transactions', value: '437', trend: [1, 3, 2] } });
    expect(wrapper.find('polyline').attributes('points')).toBe('0,22 50,2 100,12');
    await wrapper.setProps({ trend: [4] });
    expect(wrapper.find('polyline').exists()).toBe(false);
  });

  it('pairs every lamp tone with a text label', () => {
    const wrapper = mount(DashLamp, { props: { tone: 'critical', label: 'Suspected delay' } });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('.dash-lamp__bulb').attributes('data-tone')).toBe('critical');
    expect(wrapper.text()).toBe('Suspected delay');
  });
});

describe('ShareBar and RankedBars', () => {
  it('sizes segments by share and lists percentages', () => {
    const wrapper = mount(ShareBar, {
      props: {
        chartLabel: 'Outcomes',
        formatValue: String,
        segments: [
          { key: 'ok', label: 'Committed', value: 3, color: 'green' },
          { key: 'no', label: 'Rejected', value: 1, color: 'purple' },
          { key: 'none', label: 'Other', value: 0, color: 'gray' },
        ],
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('.share-bar__segment')).toHaveLength(2);
    expect(wrapper.findAll('.share-bar__percent').map((cell) => cell.text())).toEqual(['75%', '25%', '0%']);
  });

  it('scales ranked bars to the leader and links rows', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] });
    const wrapper = mount(RankedBars, {
      props: {
        color: 'red',
        formatValue: String,
        items: [
          { key: 'a', label: 'alpha', value: 40, to: '/domains/alpha' },
          { key: 'b', label: 'beta', value: 10 },
        ],
      },
      global: { plugins: [router] },
    });
    await router.isReady();
    const fills = wrapper.findAll('.ranked-bars__fill').map((fill) => fill.attributes('style'));
    expect(fills[0]).toContain('width: 100%');
    expect(fills[1]).toContain('width: 25%');
    expect(wrapper.find('a').attributes('href')).toBe('/domains/alpha');
  });
});
