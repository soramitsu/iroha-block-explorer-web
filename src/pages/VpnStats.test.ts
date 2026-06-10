import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import VpnStats from './VpnStats.vue';
import { i18n } from '@/shared/lib/localization';

const setupState = vi.hoisted(() => ({ callCount: 0 }));
const metricsState = vi.hoisted(() => ({
  isLoading: false,
  data: { status: 'ok', data: '' } as any,
  refetch: vi.fn(),
}));
const countriesState = vi.hoisted(() => ({
  isLoading: false,
  data: { status: 'ok', data: [] as any[] } as any,
  refetch: vi.fn(),
}));

vi.mock('@/shared/api', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue');
  const mockedBaseUrlState = ref('https://torii.example');

  return {
    __setBaseUrl: (value: string) => {
      mockedBaseUrlState.value = value;
    },
    fetchToriiMetricsText: vi.fn(),
    fetchPeersInfo: vi.fn(),
    getToriiBaseUrl: () => mockedBaseUrlState.value,
  };
});

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => {
    const states = [metricsState, countriesState];
    const current = states[setupState.callCount]!;
    setupState.callCount += 1;
    return current;
  }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /><slot name="header-action" /></section>',
};

const BaseInnerBlockStub = {
  props: ['title'],
  template: '<div><h3>{{ title }}</h3><slot /></div>',
};

const BaseLoadingStub = {
  template: '<div>loading…</div>',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot v-for="item in items" name="row" :item="item" /></div>',
};

const COMPLETE_METRICS = `
soranet_vpn_runtime_status{state="disabled"} 0
soranet_vpn_runtime_status{state="active"} 1
soranet_vpn_runtime_status{state="stubbed"} 0
soranet_vpn_sessions_total 4
soranet_vpn_bytes_total 4096
soranet_vpn_ingress_bytes_total 2048
soranet_vpn_egress_bytes_total 2048
soranet_vpn_data_bytes_total 3072
soranet_vpn_data_ingress_bytes_total 1536
soranet_vpn_data_egress_bytes_total 1536
soranet_vpn_cover_bytes_total 512
soranet_vpn_cover_ingress_bytes_total 256
soranet_vpn_cover_egress_bytes_total 256
soranet_vpn_control_bytes_total 512
soranet_vpn_control_ingress_bytes_total 256
soranet_vpn_control_egress_bytes_total 256
soranet_vpn_receipt_ingress_bytes_total 1024
soranet_vpn_receipt_egress_bytes_total 1024
soranet_vpn_receipt_cover_bytes_total 128
`;

describe('VpnStats', () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
  });

  beforeEach(async () => {
    const api = await import('@/shared/api') as any;
    setupState.callCount = 0;
    api.__setBaseUrl('https://torii.example');
    metricsState.isLoading = false;
    metricsState.data = {
      status: 'ok',
      data: COMPLETE_METRICS,
    };
    metricsState.refetch.mockReset();
    countriesState.isLoading = false;
    countriesState.data = {
      status: 'ok',
      data: [
        {
          url: 'https://jp-1.example',
          connected: true,
          telemetry_unsupported: false,
          config: null,
          location: { lat: 35, lon: 139, country: 'Japan', city: 'Tokyo' },
          connected_peers: [],
        },
        {
          url: 'https://jp-2.example',
          connected: false,
          telemetry_unsupported: false,
          config: null,
          location: { lat: 34, lon: 135, country: 'Japan', city: 'Osaka' },
          connected_peers: [],
        },
        {
          url: 'https://ae-1.example',
          connected: true,
          telemetry_unsupported: false,
          config: null,
          location: { lat: 25, lon: 55, country: 'UAE', city: 'Dubai' },
          connected_peers: [],
        },
      ],
    };
    countriesState.refetch.mockReset();
  });

  const factory = () => {
    const wrapper = mount(VpnStats, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseInnerBlock: BaseInnerBlockStub,
          BaseLoading: BaseLoadingStub,
          BaseTable: BaseTableStub,
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  it('renders VPN overview metrics and country rows', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('VPN overview');
    expect(wrapper.text()).toContain('Active');
    expect(wrapper.text()).toContain('4 KB');
    expect(wrapper.text()).toContain('Japan');
    expect(wrapper.text()).toContain('UAE');
  });

  it('refetches both datasets when the selected node base changes', async () => {
    factory();
    await flushPromises();
    metricsState.refetch.mockClear();
    countriesState.refetch.mockClear();

    const api = await import('@/shared/api') as any;
    api.__setBaseUrl('https://backup.example');
    await nextTick();

    expect(metricsState.refetch).toHaveBeenCalledTimes(1);
    expect(countriesState.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows VPN metrics unavailable while keeping country data visible', async () => {
    metricsState.data = { status: 'unknown-error' };

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('vpn.unavailable'));
    expect(wrapper.text()).toContain('Japan');
  });

  it('shows country data unavailable while keeping VPN metrics visible', async () => {
    countriesState.data = { status: 'unknown-error' };

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('vpn.countryDataUnavailable'));
    expect(wrapper.text()).toContain('Active');
  });
});
