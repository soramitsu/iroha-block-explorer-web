import { describe, expect, it } from 'vitest';
import { normalizeIrohaHash32 } from './iroha-hash';

describe('normalizeIrohaHash32', () => {
  it('normalizes every supported 32-byte Iroha hash representation', () => {
    const hex = '11'.repeat(32);

    expect(normalizeIrohaHash32(hex.toUpperCase())).toBe(hex);
    expect(normalizeIrohaHash32(`0X${hex.toUpperCase()}`)).toBe(hex);
    expect(normalizeIrohaHash32(`hash:${hex.toUpperCase()}#4667`)).toBe(hex);
  });

  it('rejects malformed, checksum-invalid, and unmarked hashes', () => {
    expect(normalizeIrohaHash32('11'.repeat(31))).toBeNull();
    expect(normalizeIrohaHash32(`hash:${'11'.repeat(32)}#0000`)).toBeNull();
    expect(normalizeIrohaHash32('10'.repeat(32))).toBeNull();
    expect(normalizeIrohaHash32(null)).toBeNull();
  });
});
