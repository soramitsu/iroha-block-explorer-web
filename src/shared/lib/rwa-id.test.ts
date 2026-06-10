import { describe, expect, it } from 'vitest';
import { describeRwaId, getRwaDomain, normalizeRwaIdLiteral } from './rwa-id';

describe('rwa id helpers', () => {
  it('splits hash$domain ids for display', () => {
    const literal = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities';

    expect(describeRwaId(literal)).toEqual({
      literal,
      hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      domain: 'commodities',
    });
    expect(getRwaDomain(literal)).toBe('commodities');
  });

  it('normalizes uppercase hashes to canonical lowercase', () => {
    expect(
      normalizeRwaIdLiteral('0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF$commodities')
    ).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities');
  });

  it('rejects non-canonical rwa ids so NFT literals stay distinguishable in search', () => {
    expect(normalizeRwaIdLiteral('cool-cat$gallery')).toBeNull();
    expect(normalizeRwaIdLiteral('lot 001$commodities')).toBeNull();
    expect(normalizeRwaIdLiteral('0123$commodities')).toBeNull();
  });
});
