import { describe, expect, it } from 'vitest';
import {
  parseSoracloudAccountId,
  parseSoracloudLeaseTermMs,
  parseSoracloudOptionalHex,
  soracloudValidationMessageKey,
} from './validation';

describe('soracloud validation helpers', () => {
  it('normalizes valid account selectors and rejects malformed ones', () => {
    expect(parseSoracloudAccountId(' alice@wonderland ')).toEqual({
      value: 'alice@wonderland',
      error: null,
    });
    expect(parseSoracloudAccountId(' not a selector ')).toEqual({
      value: undefined,
      error: 'invalidAccountId',
    });
  });

  it('accepts blank optional account selectors without errors', () => {
    expect(parseSoracloudAccountId('   ')).toEqual({
      value: undefined,
      error: null,
    });
  });

  it('parses positive integer lease terms and rejects invalid values', () => {
    expect(parseSoracloudLeaseTermMs('60000')).toEqual({
      value: 60000,
      error: null,
    });
    expect(parseSoracloudLeaseTermMs('0')).toEqual({
      value: undefined,
      error: 'invalidLeaseTermMs',
    });
    expect(parseSoracloudLeaseTermMs('1.5')).toEqual({
      value: undefined,
      error: 'invalidLeaseTermMs',
    });
  });

  it('accepts blank lease terms until the user provides a value', () => {
    expect(parseSoracloudLeaseTermMs('')).toEqual({
      value: undefined,
      error: null,
    });
  });

  it('accepts even-length hex inputs with and without 0x', () => {
    expect(parseSoracloudOptionalHex('0xdeadbeef')).toEqual({
      value: '0xdeadbeef',
      error: null,
    });
    expect(parseSoracloudOptionalHex('DEADBEEF')).toEqual({
      value: 'DEADBEEF',
      error: null,
    });
  });

  it('rejects odd-length and non-hex inputs', () => {
    expect(parseSoracloudOptionalHex('0xabc')).toEqual({
      value: undefined,
      error: 'invalidHex',
    });
    expect(parseSoracloudOptionalHex('xyz')).toEqual({
      value: undefined,
      error: 'invalidHex',
    });
  });

  it('maps validation errors to Soracloud locale keys', () => {
    expect(soracloudValidationMessageKey('invalidAccountId')).toBe('soracloud.validation.accountId');
    expect(soracloudValidationMessageKey('invalidLeaseTermMs')).toBe('soracloud.validation.leaseTermMs');
    expect(soracloudValidationMessageKey('invalidHex')).toBe('soracloud.validation.hex');
  });
});
