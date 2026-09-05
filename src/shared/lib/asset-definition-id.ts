import { parseAssetDefinitionAliasLiteral } from './asset-definition-literal';

export interface AssetDefinitionIdDisplay {
  literal: string;
  name: string;
  domain: string | null;
  alias: string | null;
  dataspace: string | null;
}

interface FullAssetDefinitionDisplaySource {
  id: string;
  name: string;
  alias: string | null;
}

interface ExplorerAssetDefinitionDisplaySource {
  id: string;
  owning_domain: string | null;
}

export type AssetDefinitionDisplaySource =
  | string
  | FullAssetDefinitionDisplaySource
  | ExplorerAssetDefinitionDisplaySource;

function isFullAssetDefinition(value: AssetDefinitionDisplaySource): value is FullAssetDefinitionDisplaySource {
  return typeof value !== 'string' && 'name' in value && 'alias' in value;
}

export function describeAssetDefinitionId(value: AssetDefinitionDisplaySource): AssetDefinitionIdDisplay {
  const literal = (typeof value === 'string' ? value : value.id).trim();
  if (!literal) return { literal: '', name: '', domain: null, alias: null, dataspace: null };

  if (isFullAssetDefinition(value) && value.alias) {
    const parsedAlias = parseAssetDefinitionAliasLiteral(value.alias);
    if (parsedAlias) {
      return {
        literal,
        name: parsedAlias.name,
        domain: parsedAlias.domain,
        alias: parsedAlias.literal,
        dataspace: parsedAlias.dataspace,
      };
    }
  }

  if (isFullAssetDefinition(value)) {
    return {
      literal,
      name: value.name.trim(),
      domain: null,
      alias: null,
      dataspace: null,
    };
  }

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

export function getAssetDefinitionDisplayName(value: AssetDefinitionDisplaySource): string {
  return describeAssetDefinitionId(value).name;
}

export function getAssetDefinitionDomain(value: AssetDefinitionDisplaySource): string | null {
  return describeAssetDefinitionId(value).domain;
}
