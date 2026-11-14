import { describe, expect, it } from 'vitest';
import original from './fixtures/kina-47f0-definition.actual.json';
import { AssetDefinition, ExplorerAssetDefinition } from './schemas';

describe('current Native asset definition detail', () => {
  it('accepts the actual Taira Kina response and preserves its direct dataspace home', () => {
    const value = AssetDefinition.parse(original);
    expect(value.id).toBe('839FV3NJC8NfgWQvghXU2hEFQm9a');
    expect(value.owning_domain).toBeNull();
    expect(value.owning_dataspace).toBe('8648377547929788715');
    expect(value.balance_scope_policy).toBe('DataspaceRestricted');
    expect(value.spec.scale).toBe(2);
    expect(value.confidential_policy.mode).toBe('TransparentOnly');
  });

  it.each(['spec', 'balance_scope_policy', 'confidential_policy', 'owning_dataspace'] as const)(
    'requires the Native %s field',
    (key) => {
      const value: Record<string, unknown> = { ...original };
      delete value[key];
      expect(AssetDefinition.safeParse(value).success).toBe(false);
    }
  );

  it('rejects malformed scale, unsupported policies and extra policy fields', () => {
    for (const change of [
      { spec: { scale: 29 } },
      { spec: { scale: '2' } },
      { balance_scope_policy: 'Local' },
      { confidential_policy: { ...original.confidential_policy, mode: 'Unknown' } },
      { confidential_policy: { ...original.confidential_policy, approved: true } },
    ])
      expect(AssetDefinition.safeParse({ ...original, ...change }).success).toBe(false);
  });
});

describe('current Native asset-definition list', () => {
  it('requires an explicit domain-or-dataspace home slot without accepting the omitted legacy field', () => {
    const value = {
      id: original.id,
      owning_domain: null,
      owning_dataspace: original.owning_dataspace,
      mintable: original.mintable,
      logo: original.logo,
      metadata: original.metadata,
      owned_by: original.owned_by,
      assets: 0,
      total_quantity: '0',
      locked_quantity: null,
      circulating_quantity: null,
    };
    expect(ExplorerAssetDefinition.safeParse(value).success).toBe(true);
    expect(ExplorerAssetDefinition.safeParse({ ...value, owning_dataspace: null }).success).toBe(true);
    const legacy: Record<string, unknown> = { ...value };
    delete legacy.owning_dataspace;
    expect(ExplorerAssetDefinition.safeParse(legacy).success).toBe(false);
  });
});
