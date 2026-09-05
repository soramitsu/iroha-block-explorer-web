import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import VpnStats from './VpnStats.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const mocks = vi.hoisted(() => ({
  fetchVpnProfile: vi.fn(),
}));

vi.mock('@/shared/api', () => ({
  fetchVpnProfile: mocks.fetchVpnProfile,
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};

const DataFieldStub = {
  inheritAttrs: false,
  props: ['title', 'value', 'link'],
  template: `
    <div v-bind="$attrs">
      <span>{{ title }}</span>
      <a v-if="link" :href="link">{{ value }}</a>
      <span v-else>{{ value }}</span>
    </div>
  `,
};

const availableProfile = {
  available: true,
  relay_endpoint: '/dns4/relay.example/udp/443/quic',
  supported_exit_classes: ['standard', 'low-latency', 'high-security'],
  default_exit_class: 'standard',
  lease_secs: 3_600,
  dns_push_interval_secs: 60,
  meter_family: 'vpn_bytes_total',
  route_pushes: [],
  excluded_routes: [],
  dns_servers: ['10.10.0.53'],
  tunnel_addresses: ['10.10.0.0/24'],
  mtu_bytes: 1_280,
  display_billing_label: 'standard · vpn_bytes_total · 10 XOR',
  operator_account_id: 'iroha:sample-operator',
  lease_fee: '10',
  settlement_grace_secs: 30,
  flow_label_bits: 24,
  padding_budget_ms: 10,
  relay_id_hex: '11'.repeat(32),
  relay_mldsa65_public_key_hex: '22'.repeat(1_952),
  descriptor_commit_hex: '33'.repeat(32),
  tls_server_name: 'relay.example',
  relay_tls_spki_sha256_hex: '44'.repeat(32),
  relay_certificate_sha256_hex: '55'.repeat(32),
  directory_snapshot_digest_hex: '66'.repeat(32),
};

describe('VpnStats', () => {
  beforeEach(() => {
    mocks.fetchVpnProfile.mockReset();
    mocks.fetchVpnProfile.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: availableProfile });
  });

  function mountPage() {
    return mount(VpnStats, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          DataField: DataFieldStub,
          RouterLink: {
            props: ['to'],
            template: '<a :href="String(to)"><slot /></a>',
          },
        },
      },
    });
  }

  it('renders the exact public relay and lease profile', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.fetchVpnProfile).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-test="vpn-profile-availability"]').text()).toContain('Active');
    expect(wrapper.get('[data-test="vpn-profile-relay"]').text()).toContain(
      '/dns4/relay.example/udp/443/quic'
    );
    expect(wrapper.get('[data-test="vpn-profile-exit-classes"]').text()).toContain(
      'standard · low-latency · high-security'
    );
    expect(wrapper.get('[data-test="vpn-profile-default-exit-class"]').text()).toContain('standard');
    expect(wrapper.get('[data-test="vpn-profile-lease"]').text()).toContain('1h');
    expect(wrapper.get('[data-test="vpn-profile-dns-push-interval"]').text()).toContain('1m');
    expect(wrapper.get('[data-test="vpn-profile-billing"]').text()).toContain(
      'standard · vpn_bytes_total · 10 XOR'
    );
    expect(wrapper.get('[data-test="vpn-profile-meter-family"]').text()).toContain('vpn_bytes_total');
    expect(wrapper.get('[data-test="vpn-profile-lease-fee"]').text()).toContain('10');
    expect(wrapper.get('[data-test="vpn-profile-settlement-grace"]').text()).toContain('30s');
    expect(wrapper.get('[data-test="vpn-profile-operator"] a').attributes('href')).toBe(
      `/accounts/${encodeURIComponent(availableProfile.operator_account_id)}`
    );
    expect(wrapper.get('[data-test="vpn-profile-pushed-routes"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-excluded-routes"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-dns-servers"]').text()).toContain('10.10.0.53');
    expect(wrapper.get('[data-test="vpn-profile-tunnel-addresses"]').text()).toContain('10.10.0.0/24');
    expect(wrapper.get('[data-test="vpn-profile-mtu"]').text()).toContain('1280 B');
    expect(wrapper.get('[data-test="vpn-profile-flow-label-bits"]').text()).toContain('24');
    expect(wrapper.get('[data-test="vpn-profile-padding-budget"]').text()).toContain('10ms');
    expect(wrapper.get('[data-test="vpn-profile-relay-id"]').text()).toContain('11'.repeat(32));
    expect(wrapper.get('[data-test="vpn-profile-relay-mldsa65"]').text()).toContain('22'.repeat(1_952));
    expect(wrapper.get('[data-test="vpn-profile-descriptor-commit"]').text()).toContain('33'.repeat(32));
    expect(wrapper.get('[data-test="vpn-profile-tls"]').text()).toContain('relay.example');
    expect(wrapper.get('[data-test="vpn-profile-tls-spki"]').text()).toContain('44'.repeat(32));
    expect(wrapper.get('[data-test="vpn-profile-certificate"]').text()).toContain('55'.repeat(32));
    expect(wrapper.get('[data-test="vpn-profile-directory"]').text()).toContain('66'.repeat(32));
    expect(wrapper.find('[data-test="vpn-profile-unavailable"]').exists()).toBe(false);
  });

  it('preserves policy fields and omits an absent trust tuple when VPN is unavailable', async () => {
    mocks.fetchVpnProfile.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...availableProfile,
        available: false,
        relay_endpoint: '',
        relay_id_hex: '',
        relay_mldsa65_public_key_hex: '',
        descriptor_commit_hex: '',
        tls_server_name: '',
        relay_tls_spki_sha256_hex: '',
        relay_certificate_sha256_hex: '',
        directory_snapshot_digest_hex: '',
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="vpn-profile-availability"]').text()).toContain('Disabled');
    expect(wrapper.get('[data-test="vpn-profile-unavailable"]').text()).toContain(
      'The VPN control plane is not currently available.'
    );
    expect(wrapper.get('[data-test="vpn-profile-relay"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-tls"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-relay-id"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-relay-mldsa65"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-descriptor-commit"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-tls-spki"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-certificate"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-directory"]').text()).toContain('None');
    expect(wrapper.get('[data-test="vpn-profile-billing"]').text()).toContain('10 XOR');
  });

  it('shows a strict load failure and retries the same public endpoint', async () => {
    mocks.fetchVpnProfile
      .mockResolvedValueOnce({ status: UNKNOWN_ERROR, error: new Error('Torii unavailable') })
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: availableProfile });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('The public VPN profile could not be loaded.');
    expect(wrapper.find('[data-test="vpn-public-profile"]').exists()).toBe(false);

    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    await flushPromises();

    expect(mocks.fetchVpnProfile).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-test="vpn-public-profile"]').exists()).toBe(true);
  });

  it('describes metrics as an unauthenticated-class diagnostic outside the browser', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="vpn-diagnostic-boundary"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Diagnostic telemetry stays outside the Explorer');
    expect(wrapper.text()).toContain('unauthenticated Diagnostic route');
    expect(wrapper.text()).toContain("Torii's global API-token/CIDR policy");
    expect(wrapper.text()).toContain('/metrics');
    expect(wrapper.text()).not.toContain('operator-restricted');
  });

  it('separates Torii admission, deployment token policy, and Explorer behavior', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const contract = wrapper.find('[data-test="vpn-auth-contract"]');
    expect(contract.text()).toContain('Unauthenticated Diagnostic route');
    expect(contract.text()).toContain('May require Torii API token or admitted CIDR');
    expect(contract.text()).toContain('No Prometheus request, scrape, or proxy');
    expect(contract.text()).not.toContain('Metrics access grant');
  });
});
