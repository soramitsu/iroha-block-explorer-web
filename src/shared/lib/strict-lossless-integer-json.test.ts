import { describe, expect, it } from 'vitest';
import { parseStrictLosslessIntegerJson, parseStrictLosslessJsonForValidation } from './strict-lossless-integer-json';

describe('parseStrictLosslessIntegerJson', () => {
  it('preserves safe integers as numbers and wider integers as bigint values', () => {
    expect(
      parseStrictLosslessIntegerJson(
        '{"safe":9007199254740991,"wide":9007199254740992,"max":18446744073709551615}',
        'fixture'
      )
    ).toEqual({ safe: 9_007_199_254_740_991, wide: 9_007_199_254_740_992n, max: 18_446_744_073_709_551_615n });
  });

  it('preserves number token provenance instead of coercing quoted integers', () => {
    expect(parseStrictLosslessIntegerJson('{"subject_id":"18446744073709551615"}', 'fixture')).toEqual({
      subject_id: '18446744073709551615',
    });
  });

  it.each([
    '{"value":1,"value":2}',
    '{"value":1.0}',
    '{"value":1e3}',
    '{"value":01}',
    '{"value":-0}',
    '{"value":1} trailing',
  ])('rejects JSON outside the strict integer profile: %s', (source) => {
    expect(() => parseStrictLosslessIntegerJson(source, 'fixture')).toThrow(/fixture contains invalid JSON/u);
  });

  it('decodes valid Unicode scalar pairs and rejects unpaired surrogates', () => {
    expect(parseStrictLosslessIntegerJson('{"value":"\\uD83D\\uDE80"}', 'fixture')).toEqual({ value: '🚀' });
    expect(() => parseStrictLosslessIntegerJson('{"value":"\\uD83Dx"}', 'fixture')).toThrow(/surrogate/u);
  });

  it('enforces the signed Norito owned-value nesting budget', () => {
    const accepted = `${'['.repeat(256)}0${']'.repeat(256)}`;
    const rejected = `${'['.repeat(257)}0${']'.repeat(257)}`;

    expect(() => parseStrictLosslessJsonForValidation(accepted, 'fixture')).not.toThrow();
    expect(() => parseStrictLosslessJsonForValidation(rejected, 'fixture')).toThrow(/256-level nesting limit/u);
  });

  it('requires a non-empty diagnostic context', () => {
    expect(() => parseStrictLosslessIntegerJson('{}', '')).toThrow(/context must be a non-empty string/u);
  });

  it('admits generic finite JSON numbers while preserving their non-integer token class', () => {
    const parsed = parseStrictLosslessJsonForValidation('{"integer":1,"negative_zero":-0,"ratio":1.0}', 'fixture') as {
      integer: unknown;
      negative_zero: unknown;
      ratio: unknown;
    };

    expect(parsed.integer).toBe(1);
    expect(Object.is(parsed.negative_zero, -0)).toBe(false);
    expect(parsed.negative_zero).not.toBe(0);
    expect(parsed.ratio).not.toBe(1);
  });

  it('keeps duplicate-key rejection for generic Norito JSON', () => {
    expect(() => parseStrictLosslessJsonForValidation('{"value":1,"value":2.0}', 'fixture')).toThrow(
      /duplicate object key/u
    );
  });

  it('enforces Norito generic JSON integer bounds', () => {
    expect(() =>
      parseStrictLosslessJsonForValidation('{"value":340282366920938463463374607431768211456}', 'fixture')
    ).toThrow(/Norito JSON numeric domain/u);
    expect(() => parseStrictLosslessJsonForValidation('{"value":-9223372036854775809}', 'fixture')).toThrow(
      /Norito JSON numeric domain/u
    );
  });
});
