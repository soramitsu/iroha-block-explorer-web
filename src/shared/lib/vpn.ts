import type { PeerInfo } from '@/shared/api/schemas';

export type VpnRuntimeState = 'active' | 'stubbed' | 'disabled' | 'unknown';

export interface PrometheusMetricSample {
  name: string
  labels: Record<string, string>
  value: number
}

export interface VpnMetricsSnapshot {
  runtimeState: VpnRuntimeState
  sessions: number | null
  totalBytes: number | null
  ingressBytes: number | null
  egressBytes: number | null
  dataBytes: number | null
  dataIngressBytes: number | null
  dataEgressBytes: number | null
  coverBytes: number | null
  coverIngressBytes: number | null
  coverEgressBytes: number | null
  controlBytes: number | null
  controlIngressBytes: number | null
  controlEgressBytes: number | null
  receiptIngressBytes: number | null
  receiptEgressBytes: number | null
  receiptCoverBytes: number | null
}

export interface VpnCountrySummary {
  key: string
  country: string
  peerCount: number
  connectedCount: number
}

const UNKNOWN_COUNTRY = 'Unknown';

function parseMetricValue(raw: string): number | null {
  if (raw === '+Inf' || raw === 'Inf' || raw === 'Infinity') return Infinity;
  if (raw === '-Inf' || raw === '-Infinity') return -Infinity;
  if (raw === 'NaN') return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function unescapeLabelValue(value: string): string {
  return value.replace(/\\([\\n"])/g, (_match, char: string) => {
    if (char === 'n') return '\n';
    return char;
  });
}

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};

  const labels: Record<string, string> = {};
  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g;

  for (const match of raw.matchAll(labelPattern)) {
    labels[match[1]!] = unescapeLabelValue(match[2]!);
  }

  return labels;
}

export function parsePrometheusMetricSamples(text: string): PrometheusMetricSample[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) => {
      if (!line || line.startsWith('#')) return [];

      const match = line.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)(?:\s+[^\s]+)?$/
      );
      if (!match) return [];

      const value = parseMetricValue(match[3]!);
      if (value === null) return [];

      return [
        {
          name: match[1]!,
          labels: parseLabels(match[2]),
          value,
        },
      ];
    });
}

function sumMetric(
  samples: PrometheusMetricSample[],
  name: string,
  predicate?: (sample: PrometheusMetricSample) => boolean
): number | null {
  const matches = samples.filter((sample) => sample.name === name && (!predicate || predicate(sample)));
  if (matches.length === 0) return null;

  return matches.reduce((total, sample) => total + sample.value, 0);
}

function resolveRuntimeState(samples: PrometheusMetricSample[]): VpnRuntimeState {
  const states: Array<Exclude<VpnRuntimeState, 'unknown'>> = ['active', 'stubbed', 'disabled'];

  const resolved = states.map((state) => ({
    state,
    value: sumMetric(samples, 'soranet_vpn_runtime_status', (sample) => sample.labels.state === state),
  }));

  if (resolved.every((entry) => entry.value === null)) return 'unknown';
  if (resolved.some((entry) => entry.value !== null && entry.value !== 0 && entry.value !== 1)) return 'unknown';

  const activeStates = resolved.filter((entry) => entry.value === 1);
  if (activeStates.length !== 1) return 'unknown';

  return activeStates[0]!.state;
}

export function parseVpnMetricsSnapshot(text: string): VpnMetricsSnapshot {
  const samples = parsePrometheusMetricSamples(text);

  return {
    runtimeState: resolveRuntimeState(samples),
    sessions: sumMetric(samples, 'soranet_vpn_sessions_total'),
    totalBytes: sumMetric(samples, 'soranet_vpn_bytes_total'),
    ingressBytes: sumMetric(samples, 'soranet_vpn_ingress_bytes_total'),
    egressBytes: sumMetric(samples, 'soranet_vpn_egress_bytes_total'),
    dataBytes: sumMetric(samples, 'soranet_vpn_data_bytes_total'),
    dataIngressBytes: sumMetric(samples, 'soranet_vpn_data_ingress_bytes_total'),
    dataEgressBytes: sumMetric(samples, 'soranet_vpn_data_egress_bytes_total'),
    coverBytes: sumMetric(samples, 'soranet_vpn_cover_bytes_total'),
    coverIngressBytes: sumMetric(samples, 'soranet_vpn_cover_ingress_bytes_total'),
    coverEgressBytes: sumMetric(samples, 'soranet_vpn_cover_egress_bytes_total'),
    controlBytes: sumMetric(samples, 'soranet_vpn_control_bytes_total'),
    controlIngressBytes: sumMetric(samples, 'soranet_vpn_control_ingress_bytes_total'),
    controlEgressBytes: sumMetric(samples, 'soranet_vpn_control_egress_bytes_total'),
    receiptIngressBytes: sumMetric(samples, 'soranet_vpn_receipt_ingress_bytes_total'),
    receiptEgressBytes: sumMetric(samples, 'soranet_vpn_receipt_egress_bytes_total'),
    receiptCoverBytes: sumMetric(samples, 'soranet_vpn_receipt_cover_bytes_total'),
  };
}

export function hasVpnMetrics(snapshot: VpnMetricsSnapshot): boolean {
  if (snapshot.runtimeState !== 'unknown') return true;

  return [
    snapshot.sessions,
    snapshot.totalBytes,
    snapshot.ingressBytes,
    snapshot.egressBytes,
    snapshot.dataBytes,
    snapshot.dataIngressBytes,
    snapshot.dataEgressBytes,
    snapshot.coverBytes,
    snapshot.coverIngressBytes,
    snapshot.coverEgressBytes,
    snapshot.controlBytes,
    snapshot.controlIngressBytes,
    snapshot.controlEgressBytes,
    snapshot.receiptIngressBytes,
    snapshot.receiptEgressBytes,
    snapshot.receiptCoverBytes,
  ].some((value) => value !== null);
}

export function summarizeVpnCountries(peers: PeerInfo[]): VpnCountrySummary[] {
  const countries = new Map<string, VpnCountrySummary>();

  for (const peer of peers) {
    const country = peer.location?.country?.trim() || UNKNOWN_COUNTRY;
    const key = country.toLowerCase();
    const existing = countries.get(key) ?? {
      key,
      country,
      peerCount: 0,
      connectedCount: 0,
    };

    existing.peerCount += 1;
    if (peer.connected) existing.connectedCount += 1;
    countries.set(key, existing);
  }

  return [...countries.values()].sort((left, right) => {
    if (left.country === UNKNOWN_COUNTRY && right.country !== UNKNOWN_COUNTRY) return 1;
    if (right.country === UNKNOWN_COUNTRY && left.country !== UNKNOWN_COUNTRY) return -1;
    if (right.peerCount !== left.peerCount) return right.peerCount - left.peerCount;
    return left.country.localeCompare(right.country);
  });
}
