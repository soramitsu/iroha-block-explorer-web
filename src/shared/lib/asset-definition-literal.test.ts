import { describe, expect, it } from 'vitest';
import {
  extractAssetDefinitionIdFromAssetIdLiteral,
  normalizeAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionIdLiteral,
  normalizeAssetDefinitionSelectorLiteral,
  normalizeAssetIdLiteral,
  parseAssetDefinitionAliasLiteral,
  parseAssetIdLiteral,
} from './asset-definition-literal';

const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

describe('asset definition literal helpers', () => {
  it('normalizes canonical base58 asset-definition ids', () => {
    expect(normalizeAssetDefinitionIdLiteral(SAMPLE_ASSET_DEFINITION_ID)).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(normalizeAssetDefinitionIdLiteral('usd#main')).toBeNull();
    expect(normalizeAssetDefinitionIdLiteral('aid:2d17e27f978d4356883b540591476118')).toBeNull();
  });

  it('normalizes canonical asset aliases', () => {
    expect(normalizeAssetDefinitionAliasLiteral('Usd#Issuer.Main')).toBe('usd#issuer.main');
    expect(parseAssetDefinitionAliasLiteral('Usd#Main')).toEqual({
      literal: 'usd#main',
      name: 'usd',
      domain: null,
      dataspace: 'main',
    });
    expect(normalizeAssetDefinitionAliasLiteral('usd#issuer.main.extra')).toBeNull();
    expect(normalizeAssetDefinitionAliasLiteral('usd#issuer@main')).toBeNull();
  });

  it('accepts base58 ids or aliases as asset-definition selectors', () => {
    expect(normalizeAssetDefinitionSelectorLiteral(SAMPLE_ASSET_DEFINITION_ID)).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(normalizeAssetDefinitionSelectorLiteral('Usd#Issuer.Main')).toBe('usd#issuer.main');
    expect(normalizeAssetDefinitionSelectorLiteral('??')).toBeNull();
  });

  it('parses canonical asset ids into base58 definition ids plus i105 owners', () => {
    const literal = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_ACCOUNT_ID}`;

    expect(normalizeAssetIdLiteral(literal)).toBe(literal);
    expect(parseAssetIdLiteral(literal)).toEqual({
      literal,
      definitionId: SAMPLE_ASSET_DEFINITION_ID,
      accountId: SAMPLE_ACCOUNT_ID,
      scope: null,
    });
    expect(extractAssetDefinitionIdFromAssetIdLiteral(literal)).toBe(SAMPLE_ASSET_DEFINITION_ID);
  });

  it('rejects non-canonical asset ids', () => {
    expect(normalizeAssetIdLiteral(`usd#main#${SAMPLE_ACCOUNT_ID}`)).toBeNull();
    expect(normalizeAssetIdLiteral(`${SAMPLE_ASSET_DEFINITION_ID}#primary@main`)).toBeNull();
    expect(normalizeAssetIdLiteral(`${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_ACCOUNT_ID}#scope:1`)).toBeNull();
  });
});
