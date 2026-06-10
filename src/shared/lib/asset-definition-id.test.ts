import { describe, expect, it } from 'vitest';
import {
  describeAssetDefinitionId,
  getAssetDefinitionDisplayName,
  getAssetDefinitionDomain,
} from './asset-definition-id';

describe('asset definition id helpers', () => {
  it('uses alias metadata when present on the payload', () => {
    expect(
      describeAssetDefinitionId({
        id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        name: 'US Dollar',
        alias: 'usd#issuer.main',
      })
    ).toEqual({
      literal: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
      name: 'usd',
      domain: 'issuer',
      alias: 'usd#issuer.main',
      dataspace: 'main',
    });
  });

  it('falls back to human-readable name fields when no alias exists', () => {
    const literal = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';

    expect(
      describeAssetDefinitionId({
        id: literal,
        asset_name: 'Treasury Points',
      })
    ).toEqual({
      literal,
      name: 'Treasury Points',
      domain: null,
      alias: null,
      dataspace: null,
    });
    expect(getAssetDefinitionDisplayName({ id: literal, asset_name: 'Treasury Points' })).toBe('Treasury Points');
  });

  it('parses alias selectors when only the selector string is available', () => {
    const literal = 'usd#issuer.main';

    expect(describeAssetDefinitionId(literal)).toEqual({
      literal,
      name: 'usd',
      domain: 'issuer',
      alias: literal,
      dataspace: 'main',
    });
    expect(getAssetDefinitionDisplayName(literal)).toBe('usd');
    expect(getAssetDefinitionDomain(literal)).toBe('issuer');
  });

  it('keeps canonical base58 ids as literal display names when no alias metadata exists', () => {
    const literal = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';

    expect(describeAssetDefinitionId(literal)).toEqual({
      literal,
      name: literal,
      domain: null,
      alias: null,
      dataspace: null,
    });
  });

  it('keeps canonical base58 ids from object payloads when no alias metadata exists', () => {
    const literal = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';

    expect(describeAssetDefinitionId({ id: literal })).toEqual({
      literal,
      name: literal,
      domain: null,
      alias: null,
      dataspace: null,
    });
  });

  it('returns empty fields for non-stringable values', () => {
    expect(describeAssetDefinitionId(null)).toEqual({
      literal: '',
      name: '',
      domain: null,
      alias: null,
      dataspace: null,
    });
  });
});
