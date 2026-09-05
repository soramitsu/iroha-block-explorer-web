import { describe, expect, it } from 'vitest';
import { deriveDefiOracleAttestationHash } from './soracle-attestation-hash';

const requestHash = `hash:${'AB'.repeat(32)}#B99E`;

describe('deriveDefiOracleAttestationHash', () => {
  it('matches the signed-Iroha BLAKE3 truncation vector', () => {
    expect(
      deriveDefiOracleAttestationHash({
        domain: 4,
        subjectId: '99',
        oracleSlot: '12',
        statusFlags: 7,
        sourceEvents: [{ feedId: 'price_xor_usd', slot: '10', requestHash, field: 'observed_price' }],
      })
    ).toBe('5304616722353729915');
  });

  it('binds source ordering and every source field', () => {
    const first = { feedId: 'price_xor_usd', slot: '10', requestHash, field: 'price' };
    const second = { feedId: 'price_xor_eur', slot: '11', requestHash, field: 'index_price' };
    const input = {
      domain: 1,
      subjectId: '18446744073709551615',
      oracleSlot: '18446744073709551615',
      statusFlags: 0xffff_ffff,
      sourceEvents: [first, second],
    } as const;

    const expected = deriveDefiOracleAttestationHash(input);
    expect(deriveDefiOracleAttestationHash({ ...input, sourceEvents: [second, first] })).not.toBe(expected);
    expect(
      deriveDefiOracleAttestationHash({
        ...input,
        sourceEvents: [{ ...first, field: 'other_price' }, second],
      })
    ).not.toBe(expected);
  });

  it.each([
    { domain: -1, subjectId: '1', oracleSlot: '1', statusFlags: 0, sourceEvents: [] },
    { domain: 1, subjectId: '01', oracleSlot: '1', statusFlags: 0, sourceEvents: [] },
    { domain: 1, subjectId: '18446744073709551616', oracleSlot: '1', statusFlags: 0, sourceEvents: [] },
    {
      domain: 1,
      subjectId: '1',
      oracleSlot: '1',
      statusFlags: 0,
      sourceEvents: [{ feedId: 'feed', slot: '1', requestHash: `hash:${'AB'.repeat(32)}#0000`, field: 'x' }],
    },
  ])('rejects a noncanonical derivation input %#', (input) => {
    expect(() => deriveDefiOracleAttestationHash(input)).toThrow();
  });
});
