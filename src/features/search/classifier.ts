import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';
import { normalizeAssetDefinitionSelectorLiteral } from '@/shared/lib/asset-definition-literal';
import { normalizeRwaIdLiteral } from '@/shared/lib/rwa-id';
import { NftIdSchema } from '@/shared/api/schemas';

export type SearchClassification =
  | { kind: 'hash', value: string }
  | { kind: 'rwa', value: string }
  | { kind: 'nft', value: string }
  | { kind: 'account', value: string }
  | { kind: 'asset-definition', value: string }
  | { kind: 'domain', value: string }
  | { kind: 'block-height', value: string }
  | { kind: 'unsupported', value: string };

const EXACT_HASH_RE = /^(?:0x)?[0-9a-f]{64}$/iu;
const DOMAIN_SEGMENT_RE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/iu;
const POSITIVE_BLOCK_HEIGHT_RE = /^[1-9][0-9]*$/u;

function normalizeNftId(value: string): string | null {
  const parsed = NftIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeDomainId(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 2 || parts.some(part => !DOMAIN_SEGMENT_RE.test(part))) return null;
  return value.toLowerCase();
}

/**
 * Classifies an exact Explorer identifier without consulting the network.
 *
 * Ordering is intentional: an all-decimal 64-character digest is a hash, not
 * a block height, and RWA identifiers are a strict subset of NFT-shaped IDs.
 */
export function classifySearchQuery(input: string): SearchClassification {
  const value = input.trim();

  if (EXACT_HASH_RE.test(value)) {
    return { kind: 'hash', value: value.replace(/^0x/iu, '').toLowerCase() };
  }

  const rwa = normalizeRwaIdLiteral(value);
  if (rwa) return { kind: 'rwa', value: rwa };

  const nft = normalizeNftId(value);
  if (nft) return { kind: 'nft', value: nft };

  const account = normalizeAccountIdLiteral(value);
  if (account) return { kind: 'account', value: account };

  const assetDefinition = normalizeAssetDefinitionSelectorLiteral(value);
  if (assetDefinition) return { kind: 'asset-definition', value: assetDefinition };

  const domain = normalizeDomainId(value);
  if (domain) return { kind: 'domain', value: domain };

  if (POSITIVE_BLOCK_HEIGHT_RE.test(value)) {
    return { kind: 'block-height', value };
  }

  return { kind: 'unsupported', value };
}
