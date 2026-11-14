import { describe, expect, it } from 'vitest';
import { describeRwaId, getRwaDomain, normalizeDomainIdLiteral, normalizeRwaIdLiteral } from './rwa-id';

const sampleHash = `${'00'.repeat(31)}01`;
const alternateHash = 'ff'.repeat(32);

describe('rwa id helpers', () => {
  it('splits hash$domain ids for display', () => {
    const literal = `${sampleHash}$commodities.main`;

    expect(describeRwaId(literal)).toEqual({
      literal,
      hash: sampleHash,
      domain: 'commodities.main',
    });
    expect(getRwaDomain(literal)).toBe('commodities.main');
  });

  it('uses the current SDK normalizer for hashes and requires canonical domain wire text', () => {
    expect(normalizeRwaIdLiteral(`${alternateHash.toUpperCase()}$commodities.main`))
      .toBe(`${alternateHash}$commodities.main`);
    expect(normalizeRwaIdLiteral(`${alternateHash}$Commodities.Main`)).toBeNull();
  });

  it('accepts every canonical 64-hex hash shape without an invented marker bit', () => {
    expect(normalizeRwaIdLiteral(`${'00'.repeat(32)}$commodities.main`)).toBe(`${'00'.repeat(32)}$commodities.main`);
    expect(normalizeRwaIdLiteral(`${'fe'.repeat(32)}$commodities.main`)).toBe(`${'fe'.repeat(32)}$commodities.main`);
  });

  it('accepts only canonical, fully qualified DomainId wire text', () => {
    expect(normalizeDomainIdLiteral('xn--bcher-kva.main')).toBe('xn--bcher-kva.main');
    expect(normalizeDomainIdLiteral('BÜCHER.Main')).toBeNull();
    expect(normalizeDomainIdLiteral('BÜCHER.Example.Main')).toBeNull();
    expect(normalizeDomainIdLiteral('issuer_main.sora')).toBe('issuer_main.sora');
    expect(normalizeDomainIdLiteral('issuer_main.SORA')).toBeNull();
    expect(normalizeDomainIdLiteral('ab--cd.main')).toBeNull();
  });

  it('matches the upstream domain profile rejection for Latin Extended Additional', () => {
    expect(normalizeDomainIdLiteral('\u1e00.Main')).toBeNull();
  });

  it.each([
    'cool-cat$gallery.main',
    'lot 001$commodities.main',
    `0123$commodities.main`,
    `${'0'.repeat(63)}$commodities.main`,
    `${'0'.repeat(65)}$commodities.main`,
    `${sampleHash}$commodities`,
    `${sampleHash}$-commodities.main`,
    `${sampleHash}$ab--cd.main`,
  ])('rejects invalid RWA id %s', (literal) => {
    expect(normalizeRwaIdLiteral(literal)).toBeNull();
  });

  it('keeps NFT literals distinguishable in search', () => {
    expect(normalizeRwaIdLiteral('cool-cat$gallery')).toBeNull();
  });
});
