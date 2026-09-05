import { describe, expect, it } from 'vitest';
import { parseOptionalFilter, parseOptionalFilterCatching } from './optional-filter';

describe('optional filter helpers', () => {
  it('returns empty state for blank input', () => {
    expect(parseOptionalFilter('   ', (value) => value.toUpperCase(), 'Invalid')).toEqual({
      value: undefined,
      error: null,
    });
  });

  it('returns parsed value for valid input', () => {
    expect(parseOptionalFilter('  alice  ', (value) => value.toUpperCase(), 'Invalid')).toEqual({
      value: 'ALICE',
      error: null,
    });
  });

  it('returns an error when parser returns nullish', () => {
    expect(parseOptionalFilter('alice', () => null, 'Invalid')).toEqual({
      value: undefined,
      error: 'Invalid',
    });
    expect(parseOptionalFilter('alice', () => undefined, 'Invalid')).toEqual({
      value: undefined,
      error: 'Invalid',
    });
  });

  it('returns an error when the parser throws', () => {
    expect(
      parseOptionalFilterCatching('  usd#issuer.main  ', (value) => {
        if (value === 'usd#issuer.main') return value;
        throw new Error('boom');
      }, 'Invalid')
    ).toEqual({
      value: 'usd#issuer.main',
      error: null,
    });

    expect(
      parseOptionalFilterCatching('  bad  ', () => {
        throw new Error('boom');
      }, 'Invalid')
    ).toEqual({
      value: undefined,
      error: 'Invalid',
    });
  });
});
