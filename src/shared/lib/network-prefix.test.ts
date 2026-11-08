import { describe, expect, it } from 'vitest';
import { requireNetworkPrefix } from './network-prefix';

describe('selected network prefix', () => {
  it.each([0, 369, 65535])('preserves the exact uint16 value %s', prefix => {
    expect(requireNetworkPrefix(prefix)).toBe(prefix);
  });

  it.each([undefined, null, '369', -1, 65536, 1.5, NaN, Infinity])('rejects %s without a default', prefix => {
    expect(() => requireNetworkPrefix(prefix)).toThrow('network prefix is unavailable or invalid');
  });
});
