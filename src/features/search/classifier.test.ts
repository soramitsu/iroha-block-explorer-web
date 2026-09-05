import { describe, expect, it } from 'vitest';
import { classifySearchQuery } from './classifier';

const CANONICAL_ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

describe('classifySearchQuery', () => {
  it('normalizes exact 32-byte hashes before considering decimal heights', () => {
    expect(classifySearchQuery(`0x${'AB'.repeat(32)}`)).toEqual({
      kind: 'hash',
      value: 'ab'.repeat(32),
    });
    expect(classifySearchQuery('1'.repeat(64))).toEqual({
      kind: 'hash',
      value: '1'.repeat(64),
    });
  });

  it('rejects hash-like strings that are not exactly 64 hexadecimal characters', () => {
    expect(classifySearchQuery('0xabc123')).toEqual({
      kind: 'unsupported',
      value: '0xabc123',
    });
    expect(classifySearchQuery('a'.repeat(63))).toEqual({
      kind: 'unsupported',
      value: 'a'.repeat(63),
    });
  });

  it('classifies RWA before the broader NFT shape', () => {
    const hash = 'AB'.repeat(32);
    expect(classifySearchQuery(`${hash}$commodities.main`)).toEqual({
      kind: 'rwa',
      value: `${hash.toLowerCase()}$commodities.main`,
    });
    expect(classifySearchQuery('collectible$gallery.main')).toEqual({
      kind: 'nft',
      value: 'collectible$gallery.main',
    });
    expect(classifySearchQuery('collectible-é$gallery.universal')).toEqual({
      kind: 'nft',
      value: 'collectible-é$gallery.universal',
    });
  });

  it('uses the authoritative NFT schema instead of accepting NFT-shaped strings', () => {
    expect(classifySearchQuery('collectible$gallery').kind).toBe('unsupported');
    expect(classifySearchQuery('collectible$Gallery.main').kind).toBe('unsupported');
    expect(classifySearchQuery('collectible$gallery.main$extra').kind).toBe('unsupported');
  });

  it('classifies canonical accounts, assets, domains, and positive heights in order', () => {
    expect(classifySearchQuery(CANONICAL_ACCOUNT)).toEqual({
      kind: 'account',
      value: CANONICAL_ACCOUNT,
    });
    expect(classifySearchQuery('Treasury@Banking.Retail')).toEqual({
      kind: 'unsupported',
      value: 'Treasury@Banking.Retail',
    });
    expect(classifySearchQuery('USD#Issuer.Main')).toEqual({
      kind: 'asset-definition',
      value: 'USD#Issuer.Main',
    });
    expect(classifySearchQuery('Treasury.Universal')).toEqual({
      kind: 'domain',
      value: 'treasury.universal',
    });
    expect(classifySearchQuery('123')).toEqual({
      kind: 'block-height',
      value: '123',
    });
  });

  it('keeps domain and height matching conservative', () => {
    expect(classifySearchQuery('wonder.land.ops').kind).toBe('unsupported');
    expect(classifySearchQuery('0').kind).toBe('unsupported');
    expect(classifySearchQuery('0123').kind).toBe('unsupported');
    expect(classifySearchQuery('??').kind).toBe('unsupported');
  });
});
