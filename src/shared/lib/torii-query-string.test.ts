import { describe, expect, it } from 'vitest';
import { isExactNoritoQueryStringValue } from './torii-query-string';

describe('isExactNoritoQueryStringValue', () => {
  it.each(['router', 'nullifier', 'truth', '0x10', 'NaN', 'Infinity', '-Infinity', '1e4000'])(
    'accepts an exact value Torii preserves as a string: %s',
    (value) => {
      expect(isExactNoritoQueryStringValue(value)).toBe(true);
    }
  );

  it.each([
    '',
    ' router',
    'router ',
    'null',
    'NULL',
    'true',
    'FALSE',
    '0',
    '-0',
    '+1',
    '001',
    '.5',
    '1.',
    '1e3',
    '-2.5E-4',
  ])('rejects a value scalar-coercing NoritoQuery would alter: %j', (value) => {
    expect(isExactNoritoQueryStringValue(value)).toBe(false);
  });
});
