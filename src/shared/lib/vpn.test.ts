import { describe, expect, it } from 'vitest';
import { hasVpnMetrics, parsePrometheusMetricSamples, parseVpnMetricsSnapshot, summarizeVpnCountries } from './vpn';

describe('vpn metrics parsing', () => {
  it('parses a complete VPN Prometheus snapshot', () => {
    const snapshot = parseVpnMetricsSnapshot(`
# HELP soranet_vpn_runtime_status VPN runtime state
soranet_vpn_runtime_status{node="alpha",state="disabled"} 0
soranet_vpn_runtime_status{node="alpha",state="active"} 1
soranet_vpn_runtime_status{node="alpha",state="stubbed"} 0
soranet_vpn_sessions_total{node="alpha"} 4
soranet_vpn_bytes_total{node="alpha"} 8192
soranet_vpn_ingress_bytes_total{node="alpha"} 4096
soranet_vpn_egress_bytes_total{node="alpha"} 4096
soranet_vpn_data_bytes_total{node="alpha"} 6144
soranet_vpn_data_ingress_bytes_total{node="alpha"} 3072
soranet_vpn_data_egress_bytes_total{node="alpha"} 3072
soranet_vpn_cover_bytes_total{node="alpha"} 1024
soranet_vpn_cover_ingress_bytes_total{node="alpha"} 512
soranet_vpn_cover_egress_bytes_total{node="alpha"} 512
soranet_vpn_control_bytes_total{node="alpha"} 1024
soranet_vpn_control_ingress_bytes_total{node="alpha"} 512
soranet_vpn_control_egress_bytes_total{node="alpha"} 512
soranet_vpn_receipt_ingress_bytes_total{node="alpha"} 2048
soranet_vpn_receipt_egress_bytes_total{node="alpha"} 2048
soranet_vpn_receipt_cover_bytes_total{node="alpha"} 256
    `);

    expect(snapshot.runtimeState).toBe('active');
    expect(snapshot.sessions).toBe(4);
    expect(snapshot.totalBytes).toBe(8192);
    expect(snapshot.dataIngressBytes).toBe(3072);
    expect(snapshot.coverEgressBytes).toBe(512);
    expect(snapshot.receiptCoverBytes).toBe(256);
    expect(hasVpnMetrics(snapshot)).toBe(true);
  });

  it('sums duplicate metric series with different labels', () => {
    const snapshot = parseVpnMetricsSnapshot(`
soranet_vpn_runtime_status{state="active",relay="a"} 1
soranet_vpn_runtime_status{state="disabled",relay="a"} 0
soranet_vpn_sessions_total{relay="a"} 2
soranet_vpn_sessions_total{relay="b"} 3
soranet_vpn_cover_ingress_bytes_total{relay="a"} 64
soranet_vpn_cover_ingress_bytes_total{relay="b"} 32
    `);

    expect(snapshot.runtimeState).toBe('active');
    expect(snapshot.sessions).toBe(5);
    expect(snapshot.coverIngressBytes).toBe(96);
  });

  it('resolves stubbed runtime state from binary status gauges', () => {
    const snapshot = parseVpnMetricsSnapshot(`
soranet_vpn_runtime_status{state="active"} 0
soranet_vpn_runtime_status{state="stubbed"} 1
soranet_vpn_runtime_status{state="disabled"} 0
    `);

    expect(snapshot.runtimeState).toBe('stubbed');
  });

  it('resolves disabled runtime state from binary status gauges', () => {
    const snapshot = parseVpnMetricsSnapshot(`
soranet_vpn_runtime_status{state="active"} 0
soranet_vpn_runtime_status{state="stubbed"} 0
soranet_vpn_runtime_status{state="disabled"} 1
    `);

    expect(snapshot.runtimeState).toBe('disabled');
  });

  it('ignores comments, malformed lines, and non-finite values', () => {
    const samples = parsePrometheusMetricSamples(`
# TYPE soranet_vpn_sessions_total counter
not a metric
soranet_vpn_sessions_total 2
soranet_vpn_sessions_total NaN
soranet_vpn_runtime_status{state="active",note="line\\nbreak"} 1
    `);

    expect(samples).toEqual([
      { name: 'soranet_vpn_sessions_total', labels: {}, value: 2 },
      {
        name: 'soranet_vpn_runtime_status',
        labels: { state: 'active', note: 'line\nbreak' },
        value: 1,
      },
    ]);
  });

  it('returns unknown runtime state and null counters when VPN metrics are missing', () => {
    const snapshot = parseVpnMetricsSnapshot(`
http_requests_total{path="/v1/explorer/metrics"} 10
process_start_time_seconds 1.0
    `);

    expect(snapshot.runtimeState).toBe('unknown');
    expect(snapshot.sessions).toBeNull();
    expect(snapshot.totalBytes).toBeNull();
    expect(hasVpnMetrics(snapshot)).toBe(false);
  });

  it('returns unknown runtime state when multiple known states are set to 1', () => {
    const snapshot = parseVpnMetricsSnapshot(`
soranet_vpn_runtime_status{state="active"} 1
soranet_vpn_runtime_status{state="stubbed"} 1
soranet_vpn_runtime_status{state="disabled"} 0
    `);

    expect(snapshot.runtimeState).toBe('unknown');
  });

  it('returns unknown runtime state when a known state uses a non-binary positive gauge', () => {
    const snapshot = parseVpnMetricsSnapshot(`
soranet_vpn_runtime_status{state="active"} 2
soranet_vpn_runtime_status{state="stubbed"} 0
soranet_vpn_runtime_status{state="disabled"} 0
    `);

    expect(snapshot.runtimeState).toBe('unknown');
  });
});

describe('vpn country summary', () => {
  it('groups peers by country, counts connected peers, and keeps unknown last', () => {
    const rows = summarizeVpnCountries([
      {
        url: 'https://a.example',
        connected: true,
        telemetry_unsupported: false,
        config: null,
        location: { lat: 35, lon: 139, country: 'Japan', city: 'Tokyo' },
        connected_peers: [],
      },
      {
        url: 'https://b.example',
        connected: false,
        telemetry_unsupported: false,
        config: null,
        location: { lat: 34, lon: 135, country: 'Japan', city: 'Osaka' },
        connected_peers: [],
      },
      {
        url: 'https://c.example',
        connected: true,
        telemetry_unsupported: false,
        config: null,
        location: { lat: 25, lon: 55, country: 'UAE', city: 'Dubai' },
        connected_peers: [],
      },
      {
        url: 'https://d.example',
        connected: true,
        telemetry_unsupported: false,
        config: null,
        location: null,
        connected_peers: [],
      },
    ]);

    expect(rows).toEqual([
      { key: 'japan', country: 'Japan', peerCount: 2, connectedCount: 1 },
      { key: 'uae', country: 'UAE', peerCount: 1, connectedCount: 1 },
      { key: 'unknown', country: 'Unknown', peerCount: 1, connectedCount: 1 },
    ]);
  });
});
