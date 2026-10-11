import { describe, expect, it } from 'vitest';
import { ExplorerAsset, CollectionPage } from './schemas';

const account = 'testuﾛ1NﾎHﾋiｳwDｻWﾋｿｿeﾙｾｱ2VﾛﾌfｦfVbmﾍnwﾉﾉtQAﾍ7Rﾆ7UXM3T';
const definition = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const holding = { id: `${definition}#${account}`, definition_id: definition, account_id: account, value: '24999.99245' };

describe('native Explorer account asset holding', () => {
  it('parses the exact current four-field DTO without fabricating display metadata', () => {
    const result = ExplorerAsset.parse(holding);
    expect(result.id).toBe(holding.id);
    expect(result.definition_id).toBe(definition);
    expect(result.account_id).toBe(account);
    expect(result.value.toFixed()).toBe('24999.99245');
    expect(result.asset_name).toBeNull();
    expect(result.asset_alias).toBeNull();
  });

  it('retains the continuation cursor and decimal precision in the SDK collection model', () => {
    const page = CollectionPage(ExplorerAsset).parse({ items: [{ ...holding, value: '9007199254740993.0000000000000000000000000001' }], nextCursor: 'native_cursor' });
    expect(page.nextCursor).toBe('native_cursor');
    expect(page.items[0].value.toFixed()).toBe('9007199254740993.0000000000000000000000000001');
  });

  it('preserves the shipped enriched metadata and its name/alias binding checks', () => {
    expect(ExplorerAsset.parse({ ...holding, asset_name: 'XOR', asset_alias: 'xor#universal' }).asset_name).toBe('XOR');
    expect(ExplorerAsset.safeParse({ ...holding, asset_name: 'USD', asset_alias: 'xor#universal' }).success).toBe(false);
  });

  it.each([
    { value: 24999.99245 },
    { value: '-1' },
    { id: ` ${holding.id}` },
    { account_id: 'invalid' },
    { definition_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa' },
    { asset_name: '' },
    { asset_alias: 'xor#universal' },
    { asset_name: 'XOR' },
  ])('rejects invalid identity, quantity, or incomplete enriched metadata', (invalid) => {
    expect(ExplorerAsset.safeParse({ ...holding, ...invalid }).success).toBe(false);
  });
});
