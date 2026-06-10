import { describe, expect, it } from 'vitest';
import { formatTransactionRejectionReason } from './rejection-reason';

describe('formatTransactionRejectionReason', () => {
  it('decodes account lookup failures into domainless account identifiers', () => {
    const reason = {
      encoded:
        '0x000000008900000000000000030000007d0000000000000013000000000000000b0000000000000003000000000000007362705a00000000000000000000004e00000000000000460000000000000065643031323041454531393731433939463245393843433346373741344241364139304234453332324241373239444441413137303531333834323143323333443043444446',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwCVAAAAAAAAAFGolkLFn6W5AAAAAACJAAAAAAAAAAMAAAB9AAAAAAAAABMAAAAAAAAACwAAAAAAAAADAAAAAAAAAHNicFoAAAAAAAAAAAAAAE4AAAAAAAAARgAAAAAAAABlZDAxMjBBRUUxOTcxQzk5RjJFOThDQzNGNzdBNEJBNkE5MEI0RTMyMkJBNzI5RERBQTE3MDUxMzg0MjFDMjMzRDBDRERG',
    };

    expect(formatTransactionRejectionReason(reason)).toBe(
      'Failed to find account: ed0120AEE1971C99F2E98CC3F77A4BA6A90B4E322BA729DDAA1705138421C233D0CDDF'
    );
  });

  it('falls back to a generic account-not-found message when account id bytes are malformed', () => {
    const reason = {
      encoded: '0x000000000d00000000000000030000000100000000000000ff',
      json: '',
    };

    expect(formatTransactionRejectionReason(reason)).toBe('Failed to find account');
  });

  it('decodes Norito payloads exposed as hex in rejection_reason.encoded', () => {
    const reason = {
      encoded:
        '0x020000003900000000000000020000002d000000000000000300000021000000000000000400000015000000000000000d00000000000000050000000000000062616e6b32',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBFAAAAAAAAABkx6sSjz4aAAAIAAAA5AAAAAAAAAAIAAAAtAAAAAAAAAAMAAAAhAAAAAAAAAAQAAAAVAAAAAAAAAA0AAAAAAAAABQAAAAAAAABiYW5rMg==',
    };

    expect(formatTransactionRejectionReason(reason)).toBe(
      'Validation failed: Instruction failed: Failed to find domain: bank2'
    );
  });

  it('falls back to decoding Norito base64 archives when encoded is not a hex payload', () => {
    const reason = {
      encoded: 'not-hex',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBFAAAAAAAAABkx6sSjz4aAAAIAAAA5AAAAAAAAAAIAAAAtAAAAAAAAAAMAAAAhAAAAAAAAAAQAAAAVAAAAAAAAAA0AAAAAAAAABQAAAAAAAABiYW5rMg==',
    };

    expect(formatTransactionRejectionReason(reason)).toBe(
      'Validation failed: Instruction failed: Failed to find domain: bank2'
    );
  });

  it('decodes repeated-instruction validation failures into the repeated id', () => {
    const reason = {
      encoded:
        '0x020000004b00000000000000020000003f000000000000000400000033000000000000000400000000000000030000001f000000000000000000000013000000000000000b000000000000000300000000000000736270',
      json:
        'TlJUMAAAFbOLmVWS1wsVs4uZVZLXCwBXAAAAAAAAANkeGTU4zDb4AAIAAABLAAAAAAAAAAIAAAA/AAAAAAAAAAQAAAAzAAAAAAAAAAQAAAAAAAAAAwAAAB8AAAAAAAAAAAAAABMAAAAAAAAACwAAAAAAAAADAAAAAAAAAHNicA==',
    };

    expect(formatTransactionRejectionReason(reason)).toBe(
      'Validation failed: Instruction failed: Repeated instruction for id: sbp'
    );
  });

  it('returns plain-string json rejection reasons unchanged', () => {
    const reason = {
      encoded: '0x01',
      json: 'Account permission denied',
    };

    expect(formatTransactionRejectionReason(reason)).toBe('Account permission denied');
  });
});
