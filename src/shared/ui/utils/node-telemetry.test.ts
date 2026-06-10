import { describe, expect, it } from 'vitest';
import {
  buildNodeBoardRow,
  buildSparklinePoints,
  calculatePercentile,
  calculatePropagationSpread,
  calculateQueueFillPercent,
  compareNodeBoardRows,
  formatBlockDelta,
  formatLatencyMs,
  formatQueueUsage,
  projectGeoPoint,
} from './node-telemetry';

describe('node telemetry utils', () => {
  describe('formatQueueUsage', () => {
    it('returns "-" when both size and capacity are missing', () => {
      expect(formatQueueUsage(null, null)).toBe('-');
      expect(formatQueueUsage(undefined, undefined)).toBe('-');
    });

    it('formats only the queue size when capacity is missing', () => {
      expect(formatQueueUsage(5, null)).toBe('5');
      expect(formatQueueUsage(1000, undefined)).toBe('1,000');
    });

    it('formats size/capacity when capacity is present', () => {
      expect(formatQueueUsage(null, 10)).toBe('- / 10');
      expect(formatQueueUsage(3, 10)).toBe('3 / 10');
      expect(formatQueueUsage(1000, 2000)).toBe('1,000 / 2,000');
    });
  });

  describe('formatBlockDelta', () => {
    it('returns null when best block or peer block is missing', () => {
      expect(formatBlockDelta(null, 10)).toBeNull();
      expect(formatBlockDelta(10, null)).toBeNull();
      expect(formatBlockDelta(undefined, 10)).toBeNull();
      expect(formatBlockDelta(10, undefined)).toBeNull();
    });

    it('returns null when the node is at the best block', () => {
      expect(formatBlockDelta(10, 10)).toBeNull();
    });

    it('returns a signed delta when the node diverges from the best block', () => {
      expect(formatBlockDelta(10, 8)).toBe('-2');
      expect(formatBlockDelta(10, 11)).toBe('+1');
    });
  });

  describe('calculateQueueFillPercent', () => {
    it('returns null when inputs are missing or invalid', () => {
      expect(calculateQueueFillPercent(null, 10)).toBeNull();
      expect(calculateQueueFillPercent(3, null)).toBeNull();
      expect(calculateQueueFillPercent(3, 0)).toBeNull();
    });

    it('returns a clamped percentage when queue size and capacity are available', () => {
      expect(calculateQueueFillPercent(3, 10)).toBe(30);
      expect(calculateQueueFillPercent(12, 10)).toBe(100);
      expect(calculateQueueFillPercent(-2, 10)).toBe(0);
    });
  });

  describe('formatLatencyMs', () => {
    it('formats missing values as an em dash', () => {
      expect(formatLatencyMs(null)).toBe('—');
      expect(formatLatencyMs(undefined)).toBe('—');
    });

    it('formats millisecond, second, and minute ranges', () => {
      expect(formatLatencyMs(999)).toBe('999 ms');
      expect(formatLatencyMs(1530)).toBe('1.53 s');
      expect(formatLatencyMs(120_000)).toBe('2.0 m');
    });
  });

  describe('calculatePercentile', () => {
    it('returns null when there are no numeric samples', () => {
      expect(calculatePercentile([null, undefined], 50)).toBeNull();
    });

    it('computes percentile values with interpolation and percentile clamping', () => {
      expect(calculatePercentile([10, 20, 30, 40], 50)).toBe(25);
      expect(calculatePercentile([10, 20, 30, 40], -10)).toBe(10);
      expect(calculatePercentile([10, 20, 30, 40], 200)).toBe(40);
      expect(calculatePercentile([10, 20, 30, 40], 95)).toBe(38.5);
    });
  });

  describe('calculatePropagationSpread', () => {
    it('returns spread and ms estimate when average block time is available', () => {
      expect(calculatePropagationSpread([8, 10, 11], 5000)).toEqual({
        spreadBlocks: 3,
        estimatedMs: 15_000,
      });
    });

    it('returns zero spread for sparse inputs and null estimate when block time is missing', () => {
      expect(calculatePropagationSpread([42], 5000)).toEqual({
        spreadBlocks: 0,
        estimatedMs: 0,
      });
      expect(calculatePropagationSpread([8, 10], null)).toEqual({
        spreadBlocks: 2,
        estimatedMs: null,
      });
      expect(calculatePropagationSpread([null], null)).toEqual({
        spreadBlocks: 0,
        estimatedMs: null,
      });
    });
  });

  describe('buildSparklinePoints', () => {
    it('returns empty output when the series cannot be rendered', () => {
      expect(buildSparklinePoints([], 100, 40)).toBe('');
      expect(buildSparklinePoints([1, 2], 0, 40)).toBe('');
      expect(buildSparklinePoints([1, 2], 100, 0)).toBe('');
    });

    it('renders stable coordinates for single and multi-point series', () => {
      expect(buildSparklinePoints([5], 100, 40)).toBe('0.00,20.00 100.00,20.00');
      expect(buildSparklinePoints([0, 10, 20], 100, 40)).toBe('0.00,40.00 50.00,20.00 100.00,0.00');
      expect(buildSparklinePoints([7, 7, 7], 100, 40)).toBe('0.00,20.00 50.00,20.00 100.00,20.00');
    });
  });

  describe('projectGeoPoint', () => {
    it('returns null for invalid input values', () => {
      expect(projectGeoPoint(null, 0)).toBeNull();
      expect(projectGeoPoint(0, undefined)).toBeNull();
      expect(projectGeoPoint(0, 0, { width: 0, height: 10 })).toBeNull();
      expect(projectGeoPoint(0, 0, { width: 10, height: 0 })).toBeNull();
    });

    it('projects latitude/longitude into a bounded map viewport', () => {
      expect(projectGeoPoint(0, 0, { width: 100, height: 40 })).toEqual({ x: 50, y: 20 });
      expect(projectGeoPoint(90, 200, { width: 100, height: 40 })).toEqual({ x: 100, y: 1.11 });
      expect(projectGeoPoint(-90, -200, { width: 100, height: 40 })).toEqual({ x: 0, y: 38.89 });
    });
  });

  describe('node board helpers', () => {
    it('builds a row with derived queue, location, and propagation fields', () => {
      const row = buildNodeBoardRow(
        {
          info: {
            url: 'https://node-a',
            connected: true,
            telemetry_unsupported: false,
            config: {
              public_key: 'ed0120-a',
              queue_capacity: 10,
              network_block_gossip_size: null,
              network_block_gossip_period: null,
              network_tx_gossip_size: null,
              network_tx_gossip_period: null,
            },
            location: {
              lat: 35.68,
              lon: 139.76,
              city: 'Tokyo',
              country: 'Japan',
            },
            connected_peers: [],
          },
          status: {
            url: 'https://node-a',
            block: 10,
            commit_time: { ms: 40 },
            avg_commit_time: { ms: 50 },
            status_rtt: null,
            status_rtt_avg: null,
            status_rtt_p95: { ms: 75 },
            queue_size: 3,
            uptime: { ms: 1000 },
            propagation_time: null,
            observed_at_ms: null,
          },
        },
        { index: 0, bestBlock: 12, averageBlockTimeMs: 5000 }
      );

      expect(row.locationLabel).toBe('Tokyo, Japan');
      expect(row.queueUsage).toBe('3 / 10');
      expect(row.queueFillPercent).toBe(30);
      expect(row.blockDelta).toBe('-2');
      expect(row.propagationMs).toBe(10_000);
    });

    it('sorts unsupported and offline peers after healthy active rows', () => {
      const connected = {
        key: 'connected',
        url: 'https://node-a',
        peerId: null,
        connected: true,
        telemetryUnsupported: false,
        locationLabel: 'Unknown',
        locationLat: null,
        locationLon: null,
        block: 11,
        blockDelta: null,
        pingMs: 20,
        avgPingMs: null,
        p95PingMs: null,
        queueUsage: '-',
        queueFillPercent: null,
        propagationMs: null,
      };
      const offline = {
        ...connected,
        key: 'offline',
        url: 'https://node-b',
        connected: false,
        block: 9,
      };
      const unsupported = {
        ...connected,
        key: 'unsupported',
        url: 'https://node-c',
        telemetryUnsupported: true,
      };

      expect(compareNodeBoardRows(connected, offline)).toBeLessThan(0);
      expect(compareNodeBoardRows(offline, unsupported)).toBeLessThan(0);
    });
  });
});
