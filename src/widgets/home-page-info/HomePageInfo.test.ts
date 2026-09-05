import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HomePageInfo from './HomePageInfo.vue';

const telemetry = vi.hoisted(() => ({
  metrics: { __v_isRef: true, value: null as null | Record<string, unknown> },
  isLoading: { __v_isRef: true, value: false },
  streamStatus: { __v_isRef: true, value: 'OPEN' },
  reconnect: vi.fn(),
}));

vi.mock('@/shared/ui/composables/useTelemetryMetrics', () => ({
  useTelemetryMetrics: () => telemetry,
}));

describe('HomePageInfo', () => {
  beforeEach(() => {
    telemetry.metrics.value = null;
    telemetry.isLoading.value = false;
    telemetry.streamStatus.value = 'OPEN';
    telemetry.reconnect.mockClear();
  });

  function factory() {
    return mount(HomePageInfo, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          BaseButton: { template: '<button><slot /></button>' },
          BaseLoading: {
            template: '<div data-test="metrics-loading" />',
          },
        },
      },
    });
  }

  it('shows one availability notice until an exact telemetry sample exists', () => {
    const wrapper = factory();
    const values = wrapper.findAll('.home-page-info__item-value');

    expect(values).toHaveLength(0);
    expect(wrapper.text()).toContain('ux.metricsUnavailable');
  });

  it('renders exact zero and nonzero values from the telemetry sample', () => {
    telemetry.metrics.value = {
      peers: 0,
      domains: 2,
      accounts: 3,
      assets: 4,
      transactions_accepted: 5,
      transactions_rejected: 6,
      block: 7,
      block_created_at: null,
      finalized_block: 7,
      avg_commit_time: null,
      avg_block_time: null,
    };

    const wrapper = factory();

    expect(wrapper.findAll('.home-page-info__item-value').map((value) => value.text())).toEqual([
      '3',
      '4',
      '2',
      '7',
      '11',
      '0',
    ]);
  });

  it('keeps the metric grids hidden while the first sample is connecting', () => {
    telemetry.isLoading.value = true;

    const wrapper = factory();

    expect(wrapper.find('[data-test="metrics-loading"]').exists()).toBe(true);
    expect(wrapper.find('.home-page-info__grid').exists()).toBe(false);
  });
  it('reconnects the current stream on retry', async () => {
    const wrapper = factory();
    await wrapper.get('button').trigger('click');
    expect(telemetry.reconnect).toHaveBeenCalledOnce();
  });
  it('marks retained statistics stale after a disconnect', () => {
    telemetry.metrics.value = { peers: 1, accounts: 2, assets: 3, domains: 4, block: 5, transactions_accepted: 6, transactions_rejected: 0 };
    telemetry.streamStatus.value = 'CLOSED';
    const wrapper = factory();
    expect(wrapper.text()).toContain('ux.metricsStale');
    expect(wrapper.findAll('dd')).toHaveLength(6);
  });

});
