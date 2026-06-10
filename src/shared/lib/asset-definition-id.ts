import { parseAssetDefinitionAliasLiteral } from './asset-definition-literal';

export interface AssetDefinitionIdDisplay {
  literal: string
  name: string
  domain: string | null
  alias: string | null
  dataspace: string | null
}

function coerceLiteral(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const toString = (value as { toString?: unknown }).toString;
  if (typeof toString !== 'function') return '';

  const literal = toString.call(value);
  return typeof literal === 'string' ? literal.trim() : '';
}

function coerceNamedField(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function describeAssetDefinitionId(value: unknown): AssetDefinitionIdDisplay {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const literal = coerceNamedField(record, ['id', 'definition_id', 'asset']) ?? coerceLiteral(value);
    const alias = coerceNamedField(record, ['alias', 'asset_alias', 'asset_definition_alias']);
    const parsedAlias = alias ? parseAssetDefinitionAliasLiteral(alias) : null;
    if (parsedAlias) {
      return {
        literal,
        name: parsedAlias.name,
        domain: parsedAlias.domain,
        alias: parsedAlias.literal,
        dataspace: parsedAlias.dataspace,
      };
    }

    const name = coerceNamedField(record, ['name', 'asset_name', 'asset_definition_name']);
    if (name) {
      return {
        literal,
        name,
        domain: null,
        alias: null,
        dataspace: null,
      };
    }

    if (literal) {
      return {
        literal,
        name: literal,
        domain: null,
        alias: null,
        dataspace: null,
      };
    }
  }

  const literal = coerceLiteral(value);
  if (!literal) return { literal: '', name: '', domain: null, alias: null, dataspace: null };

  const parsedAlias = parseAssetDefinitionAliasLiteral(literal);
  if (parsedAlias) {
    return {
      literal,
      name: parsedAlias.name,
      domain: parsedAlias.domain,
      alias: parsedAlias.literal,
      dataspace: parsedAlias.dataspace,
    };
  }

  return {
    literal,
    name: literal,
    domain: null,
    alias: null,
    dataspace: null,
  };
}

export function getAssetDefinitionDisplayName(value: unknown): string {
  return describeAssetDefinitionId(value).name;
}

export function getAssetDefinitionDomain(value: unknown): string | null {
  return describeAssetDefinitionId(value).domain;
}
