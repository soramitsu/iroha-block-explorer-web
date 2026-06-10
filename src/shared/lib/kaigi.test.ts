import { describe, expect, it } from 'vitest';
import type { KaigiRelayHealthSnapshot, KaigiRelaySummary } from '@/shared/api/schemas';
import { computeKaigiRelayOverview, countKaigiRelayStatuses, parseKaigiRelayEvent } from './kaigi';

function relay(partial: Partial<KaigiRelaySummary> = {}): KaigiRelaySummary {
  return {
    relay_id: 'relay@kaigi',
    domain: 'kaigi',
    bandwidth_class: 1,
    hpke_fingerprint_hex: '00',
    status: null,
    reported_at_ms: null,
    ...partial,
  };
}

function snapshot(partial: Partial<KaigiRelayHealthSnapshot> = {}): KaigiRelayHealthSnapshot {
  return {
    healthy_total: 0,
    degraded_total: 0,
    unavailable_total: 0,
    reports_total: 0,
    registrations_total: 0,
    failovers_total: 0,
    domains: [],
    ...partial,
  };
}

describe('countKaigiRelayStatuses', () => {
  it('counts known statuses and null as unknown', () => {
    const counts = countKaigiRelayStatuses([
      relay({ status: 'Healthy' }),
      relay({ status: 'Healthy' }),
      relay({ status: 'Degraded' }),
      relay({ status: 'Unavailable' }),
      relay({ status: null }),
    ]);

    expect(counts.total).toBe(5);
    expect(counts.healthy).toBe(2);
    expect(counts.degraded).toBe(1);
    expect(counts.unavailable).toBe(1);
    expect(counts.unknown).toBe(1);
  });
});

describe('computeKaigiRelayOverview', () => {
  it('returns null when no relays and no snapshot', () => {
    expect(computeKaigiRelayOverview({ relays: [], snapshot: null })).toBeNull();
  });

  it('floors registrations and reports using relay list when snapshot counters are zero', () => {
    const overview = computeKaigiRelayOverview({
      relays: [
        relay({ status: 'Healthy', reported_at_ms: 1730000000000 }),
        relay({ status: null, reported_at_ms: null }),
      ],
      snapshot: snapshot({ registrations_total: 0, reports_total: 0 }),
    });

    expect(overview).not.toBeNull();
    expect(overview?.healthy_total).toBe(1);
    expect(overview?.unknown_total).toBe(1);
    expect(overview?.registrations_total).toBe(2);
    expect(overview?.reports_total).toBe(1);
  });

  it('uses snapshot totals when relays are empty', () => {
    const overview = computeKaigiRelayOverview({
      relays: [],
      snapshot: snapshot({
        healthy_total: 3,
        degraded_total: 2,
        unavailable_total: 1,
        registrations_total: 10,
        reports_total: 20,
        failovers_total: 5,
      }),
    });

    expect(overview).not.toBeNull();
    expect(overview?.healthy_total).toBe(3);
    expect(overview?.degraded_total).toBe(2);
    expect(overview?.unavailable_total).toBe(1);
    expect(overview?.unknown_total).toBe(0);
    expect(overview?.registrations_total).toBe(10);
    expect(overview?.reports_total).toBe(20);
    expect(overview?.failovers_total).toBe(5);
  });
});

describe('parseKaigiRelayEvent', () => {
  it('parses upstream Torii shape (flat payload with relay_id)', () => {
    const receivedAt = new Date('2026-02-14T00:00:00.000Z');
    const raw = JSON.stringify({
      kind: 'registration',
      domain: 'snx',
      relay_id: 'relay@snx',
      bandwidth_class: 2,
      hpke_fingerprint_hex: 'deadbeef',
    });

    const event = parseKaigiRelayEvent(raw, receivedAt);
    expect(event).not.toBeNull();
    expect(event?.kind).toBe('registration');
    expect(event?.domain).toBe('snx');
    expect(event?.relay).toBe('relay@snx');
    expect(event?.timestamp.toISOString()).toBe(receivedAt.toISOString());
    expect(event?.payload).toMatchObject({ kind: 'registration', domain: 'snx', relay_id: 'relay@snx' });
  });

  it('uses reported_at_ms as timestamp when present', () => {
    const receivedAt = new Date('2026-02-14T00:00:00.000Z');
    const raw = JSON.stringify({
      kind: 'health',
      domain: 'snx',
      relay_id: 'relay@snx',
      status: 'healthy',
      reported_at_ms: 1700000000000,
      call: { domain: 'snx', name: 'health_report' },
    });

    const event = parseKaigiRelayEvent(raw, receivedAt);
    expect(event).not.toBeNull();
    expect(event?.kind).toBe('health');
    expect(event?.timestamp.toISOString()).toBe(new Date(1700000000000).toISOString());
  });

  it('rejects legacy relay/timestamp/payload event shapes', () => {
    const receivedAt = new Date('2026-02-14T00:00:00.000Z');
    const raw = JSON.stringify({
      kind: 'health',
      domain: 'kaigi',
      relay: 'relay@kaigi',
      timestamp: '2026-02-14T01:02:03.000Z',
      payload: { foo: 'bar' },
    });

    const event = parseKaigiRelayEvent(raw, receivedAt);
    expect(event).toBeNull();
  });
});
