import { normalizeAccountIdLiteral, normalizeToriiAccountSelectorLiteral } from '@/shared/lib/account-literal';
import {
  isAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionIdLiteral,
  normalizeAssetDefinitionSelectorLiteral,
  normalizeAssetIdLiteral,
  parseAssetDefinitionAliasLiteral,
  parseAssetIdLiteral,
} from '@/shared/lib/asset-definition-literal';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';
import { normalizeDomainIdLiteral, normalizeRwaIdLiteral } from '@/shared/lib/rwa-id';
import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';
import { parseStrictLosslessJsonForValidation } from '@/shared/lib/strict-lossless-integer-json';
import { AccountAddress } from '@iroha/iroha-js/browser';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { verifyEd25519 } from '@iroha/iroha-js/crypto';
import BigNumber from 'bignumber.js';
import { z } from 'zod/v4';
import { NativeInstructionEnvelope } from './instruction-envelope';

const Pagination = z.object({
  page: z.number(),
  per_page: z.number(),
  total_pages: z.number(),
  total_items: z.number(),
});

export type Pagination = z.infer<typeof Pagination>;

export const Paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    pagination: Pagination,
    items: item.array(),
  });

export interface Paginated<T> {
  pagination: Pagination;
  items: T[];
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

/** Server-issued continuation; clients never interpret the cursor contents. */
export const CollectionContinuation = z.object({ nextCursor: z.string().min(1).nullable() });
export type CollectionContinuation = z.infer<typeof CollectionContinuation>;

/** SDK collection model. Explorer feeds are bounded and do not return totals. */
export const CollectionPage = <T extends z.ZodType>(item: T) =>
  CollectionContinuation.extend({ items: item.array(), total: z.undefined().optional() })
    .strict()
    .transform(({ items, nextCursor }) => ({ items, nextCursor }));

export interface CollectionPage<T> extends CollectionContinuation {
  items: T[];
}

export interface CursorPaginationParams {
  cursor?: string | null;
  limit?: number;
}

const Metadata = z.record(z.string(), z.json());
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffff_ffff);
const MAX_NUMERIC_SCALE = 28;
const MAX_POSITIVE_NUMERIC_MANTISSA = (1n << 511n) - 1n;
const MAX_NEGATIVE_NUMERIC_MAGNITUDE = 1n << 511n;
const CANONICAL_UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*|(?:0|[1-9]\d*)\.\d{0,27}[1-9])$/u;
const CANONICAL_SIGNED_DECIMAL = /^(?:0|-?[1-9]\d*|-?(?:0|[1-9]\d*)\.\d{0,27}[1-9])$/u;

function canonicalNumericValue(nonnegative: boolean) {
  const grammar = nonnegative ? CANONICAL_UNSIGNED_DECIMAL : CANONICAL_SIGNED_DECIMAL;
  return z
    .string()
    .max(160)
    .superRefine((value, ctx) => {
      if (!grammar.test(value)) {
        ctx.addIssue({
          code: 'custom',
          message: nonnegative ? 'expected a canonical Quantity string' : 'expected a canonical Numeric string',
        });
        return;
      }

      const unsigned = value.startsWith('-') ? value.slice(1) : value;
      const [integer, fraction = ''] = unsigned.split('.');
      if (fraction.length > MAX_NUMERIC_SCALE) {
        ctx.addIssue({ code: 'custom', message: `numeric scale must not exceed ${MAX_NUMERIC_SCALE}` });
        return;
      }

      const mantissa = BigInt(`${integer}${fraction}`);
      const maximum = value.startsWith('-') ? MAX_NEGATIVE_NUMERIC_MAGNITUDE : MAX_POSITIVE_NUMERIC_MANTISSA;
      if (mantissa > maximum) {
        ctx.addIssue({ code: 'custom', message: 'numeric mantissa exceeds the signed 512-bit domain' });
      }
    })
    .transform((value) => BigNumber(value));
}

/** Exact canonical Norito JSON representation of `Quantity`. */
export const QuantityValue = canonicalNumericValue(true);
/** Exact canonical Norito JSON representation of signed `Numeric`. */
const SignedNumericValue = canonicalNumericValue(false);
const TransactionStatus = z.enum(['Committed', 'Rejected']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

const Duration = z.object({
  ms: z.number().min(0),
});

export type AccountId = string;
export type AccountSelector = string;
export type AssetDefinitionId = string;
export type AssetDefinitionSelector = string;
export type AssetId = string;
export type NftId = string;

function normalizedStringSchema(normalize: (value: string) => string | null, message: string) {
  return z.string().transform((value, ctx) => {
    const normalized = normalize(value);
    if (normalized) return normalized;
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  });
}

function exactNormalizedStringSchema(normalize: (value: string) => string | null, message: string) {
  return z.string().superRefine((value, ctx) => {
    if (normalize(value) !== value) ctx.addIssue({ code: 'custom', message });
  });
}

function isCanonicalName(value: string): boolean {
  return (
    value.length > 0 &&
    new TextEncoder().encode(value).length <= 255 &&
    value.normalize('NFC') === value &&
    !/[\s@#$\p{Cc}]/u.test(value) &&
    !/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

const CanonicalName = z.string().refine(isCanonicalName, 'expected a canonical Iroha Name');
const CanonicalDomainId = exactNormalizedStringSchema(
  normalizeDomainIdLiteral,
  'expected a canonical fully-qualified domain.dataspace ID'
);
/** Exact nonzero direct-home DataSpaceId text; never round a u64 through a JSON number. */
export const CanonicalDataspaceId = z
  .string()
  .refine(
    (value) => /^[1-9][0-9]{0,19}$/u.test(value) && BigInt(value) <= (1n << 64n) - 1n,
    'expected a canonical nonzero u64 decimal dataspace ID'
  );
const CanonicalAssetId = exactNormalizedStringSchema(
  normalizeAssetIdLiteral,
  'Asset ID response must use an exact canonical asset literal'
);
const ExactAssetDefinitionAlias = z
  .string()
  .refine(isAssetDefinitionAliasLiteral, 'expected an exact on-chain asset alias literal');
const AssetHumanName = z
  .string()
  .refine(
    (value) =>
      value.trim().length > 0 && new TextEncoder().encode(value.trim()).length <= 128 && !/[#@\p{Cc}]/u.test(value),
    'expected a valid asset human name'
  );
const AssetDescription = z
  .string()
  .refine(
    (value) => value.trim().length > 0 && new TextEncoder().encode(value).length <= 2048 && !/\p{Cc}/u.test(value),
    'expected a valid asset description'
  )
  .nullable();
const CanonicalAccountId = exactNormalizedStringSchema(
  normalizeAccountIdLiteral,
  'Account ID response must be exact I105 account selector text'
);

function equalIgnoringAsciiCase(left: string, right: string): boolean {
  const fold = (value: string) => value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  return fold(left) === fold(right);
}

function aliasMatchesAssetName(alias: string | null, name: string): boolean {
  if (alias === null) return true;
  const parsed = parseAssetDefinitionAliasLiteral(alias);
  return parsed !== null && equalIgnoringAsciiCase(parsed.name, name);
}

function normalizeNftIdLiteral(value: string): string | null {
  const [name, domain] = value.split('$');
  if (!name || !domain) return null;
  if (value.indexOf('$') !== value.lastIndexOf('$')) return null;
  if (!isCanonicalName(name) || normalizeDomainIdLiteral(domain) !== domain) return null;
  return value;
}

export const AccountIdSchema = normalizedStringSchema(
  normalizeAccountIdLiteral,
  'Account ID must use exact I105 account selector text'
);
export const AccountSelectorSchema = normalizedStringSchema(
  normalizeToriiAccountSelectorLiteral,
  'Account selector must use a canonical halfwidth i105 account ID or alias'
);
export const AssetDefinitionIdSchema = normalizedStringSchema(
  normalizeAssetDefinitionIdLiteral,
  'Asset definition ID must use a canonical Base58 literal'
);
export const AssetDefinitionSelectorSchema = normalizedStringSchema(
  normalizeAssetDefinitionSelectorLiteral,
  'Asset selector must use a canonical Base58 ID or asset alias'
);
export const AssetIdSchema = normalizedStringSchema(
  normalizeAssetIdLiteral,
  'Asset ID must use `<base58-asset-id>#<canonical-halfwidth-i105-account-id>` with an optional `#dataspace:<u64>` suffix'
);
export const NftIdSchema = exactNormalizedStringSchema(
  normalizeNftIdLiteral,
  'NFT ID must use a canonical `name$domain.dataspace` literal'
);
export const AssetDefinitionAliasSchema = normalizedStringSchema(
  normalizeAssetDefinitionAliasLiteral,
  'Asset alias must use `name#domain.dataspace` or `name#dataspace`'
);

const NullableString = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);
const NullableAssetDefinitionAlias = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    if (value === null || value === undefined) return null;
    const normalized = normalizeAssetDefinitionAliasLiteral(value);
    if (normalized) return normalized;
    ctx.addIssue({ code: 'custom', message: 'Invalid asset alias' });
    return z.NEVER;
  });

export const RwaIdSchema = exactNormalizedStringSchema(
  normalizeRwaIdLiteral,
  'RWA ID must use a canonical lowercase 64-hex-hash$domain.dataspace literal'
);

export interface AccountSearchParams extends CursorPaginationParams {
  domain?: string;
  with_asset?: AssetDefinitionSelector;
}

export const Account = z
  .object({
    id: CanonicalAccountId,
    network_prefix: U16,
    metadata: Metadata,
    owned_assets: U32,
    owned_nfts: U32,
    owned_domains: U32,
  })
  .strict()
  .transform((value) => {
    // Torii now returns the canonical i105 account literal in `id` directly.
    const canonical = value.id;
    return {
      id: canonical,
      i105_address: canonical,
      metadata: value.metadata,
      owned_assets: value.owned_assets,
      owned_nfts: value.owned_nfts,
      owned_domains: value.owned_domains,
      network_prefix: value.network_prefix,
    };
  });

export type Account = z.infer<typeof Account>;

export const AccountPermission = z
  .object({
    name: z.string().min(1),
    payload: z.json(),
  })
  .strict();
export type AccountPermission = z.infer<typeof AccountPermission>;

export const AccountPermissionsResponse = CollectionPage(AccountPermission);
export type AccountPermissionsResponse = z.infer<typeof AccountPermissionsResponse>;

export const AccountHistoryItem = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    type: z.string().min(1),
    timestamp_ms: z.number().int().nonnegative().optional(),
    block_height: z.number().int().nonnegative().optional(),
    block_index: z.number().int().nonnegative().optional(),
    movement_index: z.number().int().nonnegative().optional(),
    status: z.string().min(1),
    result_ok: z.boolean().optional(),
    direction: z.string().min(1),
    account_id: AccountIdSchema,
    counterparty_account_id: AccountIdSchema.optional(),
    asset_id: z.string().min(1).optional(),
    asset_definition_id: AssetDefinitionIdSchema.optional(),
    amount: z.string().min(1).optional(),
    tx_hash: z.string().min(1).optional(),
    operation_id: z.string().min(1).optional(),
    expires_at_ms: z.number().int().nonnegative().optional(),
    finalized_at_ms: z.number().int().nonnegative().optional(),
    requesting_fi_id: z.string().min(1).optional(),
  })
  .strict();
export type AccountHistoryItem = z.infer<typeof AccountHistoryItem>;

export const AccountHistoryResponse = CollectionPage(AccountHistoryItem);
export type AccountHistoryResponse = z.infer<typeof AccountHistoryResponse>;

export const ContractActivity = z
  .object({
    authority: z.string().min(1).optional(),
    timestamp_ms: z.number().int().nonnegative().optional(),
    entrypoint_hash: z.string().min(1),
    result_ok: z.boolean(),
    contract_address: z.string().min(1),
    contract_alias: z.string().min(1).optional(),
    contract_entrypoint: z.string().min(1).optional(),
    contract_payload: z.json().optional(),
    fee_payment: z.json().optional(),
  })
  .strict();
export type ContractActivity = z.infer<typeof ContractActivity>;

export const ContractActivityResponse = CollectionPage(ContractActivity);
export type ContractActivityResponse = z.infer<typeof ContractActivityResponse>;

export const ContractEvent = z
  .object({
    event_id: z.string().min(1),
    schema_version: z.number().int().nonnegative(),
    provenance: z.literal('emitted'),
    authority: z.string().min(1).optional(),
    timestamp_ms: z.number().int().nonnegative().optional(),
    execution_hash_hex: z.string().min(1),
    block_height: z.number().int().nonnegative(),
    block_hash_hex: z.string().min(1),
    output_index: z.number().int().nonnegative(),
    emission_index: z.number().int().nonnegative(),
    emission: z.json(),
    result_ok: z.literal(true),
    contract_address: z.string().min(1),
    event_kind: z.string().min(1),
    participants: z.string().min(1).array().optional(),
    asset_ids: z.string().min(1).array().optional(),
    numeric_fields: z.json().optional(),
    payload: z.json().optional(),
    fee_payment: z.json().optional(),
  })
  .strict();
export type ContractEvent = z.infer<typeof ContractEvent>;

export const ContractEventResponse = CollectionPage(ContractEvent);
export type ContractEventResponse = z.infer<typeof ContractEventResponse>;

export const MultisigProposalStatus = z.enum(['COLLECTING_SIGNATURES', 'FINALIZED', 'CANCELED', 'EXPIRED']);
export type MultisigProposalStatus = z.infer<typeof MultisigProposalStatus>;

export const MultisigSpecPayload = z
  .object({
    signatories: z.record(AccountIdSchema, z.number().int().min(0).max(255)),
    quorum: z.number().int().positive().max(65_535),
    transaction_ttl_ms: z.number().int().positive(),
  })
  .strict();
export type MultisigSpecPayload = z.infer<typeof MultisigSpecPayload>;

export const MultisigSpecResponse = z
  .object({
    resolved_multisig_account_id: AccountIdSchema,
    spec: MultisigSpecPayload,
  })
  .strict();
export type MultisigSpecResponse = z.infer<typeof MultisigSpecResponse>;

export const MultisigProposalPayload = z
  .object({
    network_id: z.string().refine((value) => {
      try {
        return NetworkId.parse(value).literal === value;
      } catch {
        return false;
      }
    }, 'expected a canonical network ID'),
    proposal_nonce: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .refine((value) => value !== '0'.repeat(64)),
    proposal_id: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .refine((value) => value !== '0'.repeat(64)),
    transaction_ttl_ms: z.number().int().safe().positive().nullable(),
    instructions: z.array(z.record(z.string(), z.json())),
    proposed_at_ms: z.number().int().safe().nonnegative(),
    expires_at_ms: z.number().int().safe().nonnegative(),
    approvals: AccountIdSchema.array(),
  })
  .strict();
export type MultisigProposalPayload = z.infer<typeof MultisigProposalPayload>;

export const MultisigProposalEntry = z
  .object({
    proposal_id: z.string().regex(/^[0-9a-f]{64}$/u),
    instructions_hash: z.string().regex(/^[0-9a-f]{64}$/u),
    operation_type: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
    intent: z.json().nullable().optional(),
    proposal: MultisigProposalPayload,
    status: MultisigProposalStatus,
    terminal_at_ms: z.number().int().nonnegative().nullable().optional(),
  })
  .strict()
  .refine((value) => value.proposal_id === value.proposal.proposal_id, {
    message: 'proposal occurrence ID differs from its retained payload',
    path: ['proposal', 'proposal_id'],
  });
export type MultisigProposalEntry = z.infer<typeof MultisigProposalEntry>;

export const MultisigProposalsQueryResponse = z
  .object({
    resolved_multisig_account_id: AccountIdSchema,
    proposals: MultisigProposalEntry.array().max(100),
    next_cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .optional(),
  })
  .strict();
export type MultisigProposalsQueryResponse = z.infer<typeof MultisigProposalsQueryResponse>;

export interface AssetSearchParams extends CursorPaginationParams {
  owned_by?: string;
  definition?: AssetDefinitionSelector;
  asset_id?: AssetId;
}

export const Asset = z
  .object({
    // Legacy explorer payloads expose a prebuilt instance id; the v1 account/holder
    // APIs expose the definition id under `asset` plus an optional `scope`.
    id: z.string().optional(),
    definition_id: AssetDefinitionIdSchema.optional(),
    asset: AssetDefinitionIdSchema.optional(),
    account_id: AccountIdSchema,
    asset_name: NullableString.optional().default(null),
    asset_alias: NullableAssetDefinitionAlias.optional().default(null),
    value: QuantityValue.optional(),
    quantity: QuantityValue.optional(),
    scope: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null),
  })
  .transform((value, ctx) => {
    const definitionId = value.definition_id ?? value.asset;
    if (!definitionId) {
      ctx.addIssue({ code: 'custom', message: 'Asset payload is missing a definition id' });
      return z.NEVER;
    }

    const numericValue = value.value ?? value.quantity;
    if (!numericValue) {
      ctx.addIssue({ code: 'custom', message: 'Asset payload is missing a value/quantity field' });
      return z.NEVER;
    }

    return {
      id: value.id ?? `${definitionId}@${value.account_id}${value.scope ? `:${value.scope}` : ''}`,
      definition_id: definitionId,
      account_id: value.account_id,
      asset_name: value.asset_name,
      asset_alias: value.asset_alias,
      value: numericValue,
      scope: value.scope,
    };
  });

export type Asset = z.infer<typeof Asset>;

/** Exact item emitted by the current `/v1/explorer/assets` routes. */
export const ExplorerAsset = z
  .object({
    id: CanonicalAssetId,
    definition_id: AssetDefinitionIdSchema,
    account_id: CanonicalAccountId,
    asset_name: AssetHumanName.optional(),
    asset_alias: ExactAssetDefinitionAlias.nullable().optional(),
    value: QuantityValue,
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsedId = parseAssetIdLiteral(value.id);
    if (!parsedId || parsedId.definitionId !== value.definition_id || parsedId.accountId !== value.account_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset id must bind the supplied definition_id and account_id',
        path: ['id'],
      });
    }
    // Current native holdings omit display metadata. Retain the shipped enriched
    // pair only when both fields are present and their existing binding is valid.
    if ((value.asset_name === undefined) !== (value.asset_alias === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'asset_name and asset_alias must be supplied together' });
    }
    if (value.asset_name !== undefined && !aliasMatchesAssetName(value.asset_alias ?? null, value.asset_name)) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset alias name segment must match asset_name',
        path: ['asset_alias'],
      });
    }
  })
  .transform((value) => ({
    ...value,
    asset_name: value.asset_name ?? null,
    asset_alias: value.asset_alias ?? null,
    scope: value.id.match(/#(dataspace:\d+)$/u)?.[1] ?? null,
  }));

export type ExplorerAsset = z.infer<typeof ExplorerAsset>;

export interface AssetDefinitionSearchParams extends CursorPaginationParams {
  domain?: string;
  dataspace?: string;
  owned_by?: string;
}

export const AssetDefinitionAliasBindingStatus = z.enum([
  'permanent',
  'leased_active',
  'leased_grace',
  'expired_pending_cleanup',
]);
export type AssetDefinitionAliasBindingStatus = z.infer<typeof AssetDefinitionAliasBindingStatus>;

export const AssetDefinitionAliasBinding = z
  .object({
    alias: ExactAssetDefinitionAlias,
    status: AssetDefinitionAliasBindingStatus,
    lease_expiry_ms: z
      .number()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    grace_until_ms: z
      .number()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    bound_at_ms: z.number(),
  })
  .strict();
export type AssetDefinitionAliasBinding = z.infer<typeof AssetDefinitionAliasBinding>;

const AssetDefinitionMintable = z.union([
  z.enum(['Infinitely', 'Once', 'Not']),
  z.string().refine((value) => {
    const match = /^Limited\(([1-9]\d{0,9})\)$/u.exec(value);
    if (!match) return false;
    return BigInt(match[1]) <= 0xffff_ffffn;
  }, 'expected Limited(<nonzero-u32>)'),
]);

/** Exact item emitted by the cursor-native `/v1/explorer/asset-definitions` route. */
export const ExplorerAssetDefinition = z
  .object({
    id: AssetDefinitionIdSchema,
    owning_domain: CanonicalDomainId.nullable(),
    owning_dataspace: CanonicalDataspaceId.nullable(),
    mintable: AssetDefinitionMintable,
    logo: z.string().nullable(),
    metadata: Metadata,
    owned_by: CanonicalAccountId,
    assets: U32,
    total_quantity: QuantityValue,
    locked_quantity: QuantityValue.nullable(),
    circulating_quantity: QuantityValue.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.owning_domain !== null && value.owning_dataspace !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset definition cannot have both domain and dataspace homes',
        path: ['owning_dataspace'],
      });
    }
  })
  .transform((value) => ({
    ...value,
    // The Explorer list DTO does not publish these detail-only fields.
    // Keep their absence explicit in the shared presentation model.
    name: null,
    description: null,
    alias: null,
    alias_binding: null,
  }));

export type ExplorerAssetDefinition = z.infer<typeof ExplorerAssetDefinition>;

const ConfidentialPolicyMode = z.enum(['TransparentOnly', 'ShieldedOnly', 'Convertible']);
const ConfidentialPolicyHeight = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ConfidentialPolicyHash = z.string().regex(/^[0-9a-fA-F]{64}$/u);
const AssetConfidentialPolicy = z
  .object({
    mode: ConfidentialPolicyMode,
    vk_set_hash: ConfidentialPolicyHash.nullable(),
    poseidon_params_id: U32.nullable(),
    pedersen_params_id: U32.nullable(),
    pending_transition: z
      .object({
        new_mode: ConfidentialPolicyMode,
        effective_height: ConfidentialPolicyHeight,
        previous_mode: ConfidentialPolicyMode,
        transition_id: ConfidentialPolicyHash,
        conversion_window: ConfidentialPolicyHeight.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** Full asset-definition record from `/v1/assets/definitions/:id`, including alias bindings. */
export const AssetDefinition = z
  .object({
    id: AssetDefinitionIdSchema,
    owning_domain: CanonicalDomainId.nullable(),
    owning_dataspace: CanonicalDataspaceId.nullable(),
    spec: z.object({ scale: z.number().int().min(0).max(MAX_NUMERIC_SCALE).nullable() }).strict(),
    balance_scope_policy: z.enum(['Global', 'DataspaceRestricted']),
    confidential_policy: AssetConfidentialPolicy,
    name: AssetHumanName,
    description: AssetDescription,
    alias: ExactAssetDefinitionAlias.nullable(),
    alias_binding: AssetDefinitionAliasBinding.nullish().transform((value) => value ?? null),
    logo: z.string().nullable(),
    metadata: Metadata,
    mintable: AssetDefinitionMintable,
    owned_by: CanonicalAccountId,
    total_quantity: QuantityValue,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.owning_domain !== null && value.owning_dataspace !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset definition cannot have both domain and dataspace homes',
        path: ['owning_dataspace'],
      });
    }
    if (!aliasMatchesAssetName(value.alias, value.name)) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset alias name segment must match asset name',
        path: ['alias'],
      });
    }
    if (value.alias_binding !== null && value.alias_binding.alias !== value.alias) {
      ctx.addIssue({
        code: 'custom',
        message: 'alias binding must match the authoritative alias field',
        path: ['alias_binding', 'alias'],
      });
    }
  })
  .transform((value) => ({
    ...value,
    assets: null,
    locked_quantity: null,
    circulating_quantity: null,
  }));

export type AssetDefinition = z.infer<typeof AssetDefinition> | ExplorerAssetDefinition;

export const AssetDefinitionEconometricsVelocityWindow = z.object({
  key: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  transfers: z.number(),
  unique_senders: z.number(),
  unique_receivers: z.number(),
  amount: QuantityValue,
});

export type AssetDefinitionEconometricsVelocityWindow = z.infer<typeof AssetDefinitionEconometricsVelocityWindow>;

export const AssetDefinitionEconometricsIssuanceWindow = z.object({
  key: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  mint_count: z.number(),
  burn_count: z.number(),
  minted: QuantityValue,
  burned: QuantityValue,
  net: SignedNumericValue,
});

export type AssetDefinitionEconometricsIssuanceWindow = z.infer<typeof AssetDefinitionEconometricsIssuanceWindow>;

export const AssetDefinitionEconometricsIssuanceSeriesPoint = z.object({
  bucket_start_ms: z.number(),
  minted: QuantityValue,
  burned: QuantityValue,
  net: SignedNumericValue,
});

export type AssetDefinitionEconometricsIssuanceSeriesPoint = z.infer<
  typeof AssetDefinitionEconometricsIssuanceSeriesPoint
>;

export const AssetDefinitionEconometrics = z.object({
  definition_id: AssetDefinitionIdSchema,
  computed_at_ms: z.number(),
  velocity_windows: AssetDefinitionEconometricsVelocityWindow.array(),
  issuance_windows: AssetDefinitionEconometricsIssuanceWindow.array(),
  issuance_series: AssetDefinitionEconometricsIssuanceSeriesPoint.array(),
});

export type AssetDefinitionEconometrics = z.infer<typeof AssetDefinitionEconometrics>;

export const AssetDefinitionSnapshotLorenzPoint = z.object({
  population: z.number(),
  share: z.number(),
});

export type AssetDefinitionSnapshotLorenzPoint = z.infer<typeof AssetDefinitionSnapshotLorenzPoint>;

export const AssetDefinitionSnapshotDistribution = z.object({
  gini: z.number(),
  hhi: z.number(),
  theil: z.number(),
  entropy: z.number(),
  entropy_normalized: z.number(),
  nakamoto_33: z.number().optional().default(0),
  nakamoto_51: z.number().optional().default(0),
  nakamoto_67: z.number().optional().default(0),
  top1: z.number(),
  top5: z.number(),
  top10: z.number(),
  median: QuantityValue.nullable(),
  p90: QuantityValue.nullable(),
  p99: QuantityValue.nullable(),
  lorenz: AssetDefinitionSnapshotLorenzPoint.array(),
});

export type AssetDefinitionSnapshotDistribution = z.infer<typeof AssetDefinitionSnapshotDistribution>;

export const AssetDefinitionSnapshotTopHolder = z.object({
  account_id: AccountIdSchema,
  balance: QuantityValue,
});

export type AssetDefinitionSnapshotTopHolder = z.infer<typeof AssetDefinitionSnapshotTopHolder>;

export const AssetDefinitionSnapshot = z.object({
  definition_id: AssetDefinitionIdSchema,
  computed_at_ms: z.number(),
  holders_total: z.number(),
  total_supply: QuantityValue,
  top_holders: AssetDefinitionSnapshotTopHolder.array(),
  distribution: AssetDefinitionSnapshotDistribution,
});

export type AssetDefinitionSnapshot = z.infer<typeof AssetDefinitionSnapshot>;

export const NFT = z
  .object({
    id: NftIdSchema,
    owned_by: CanonicalAccountId,
    metadata: Metadata,
  })
  .strict();

export type NFT = z.infer<typeof NFT>;

export type NFTsSearchParams = AssetDefinitionSearchParams;

export interface RWASearchParams extends CursorPaginationParams {
  domain?: string;
  owned_by?: string;
}

export const RwaParent = z
  .object({
    rwa: RwaIdSchema,
    quantity: QuantityValue,
  })
  .strict();

export type RwaParent = z.infer<typeof RwaParent>;

export const RWA = z
  .object({
    id: RwaIdSchema,
    owned_by: CanonicalAccountId,
    quantity: QuantityValue,
    held_quantity: QuantityValue,
    primary_reference: z.string(),
    status: CanonicalName.nullable(),
    is_frozen: z.boolean(),
    metadata: Metadata,
    parents: RwaParent.array(),
  })
  .strict();

export type RWA = z.infer<typeof RWA>;

export interface DomainSearchParams extends CursorPaginationParams {
  owned_by?: string;
}

export const Domain = z
  .object({
    id: CanonicalDomainId,
    logo: z.string().nullable(),
    metadata: Metadata,
    owned_by: CanonicalAccountId,
    accounts: U32,
    assets: U32,
    nfts: U32,
  })
  .strict();

export type Domain = z.infer<typeof Domain>;

export interface TransactionSearchParams extends CursorPaginationParams {
  authority?: string;
  block?: number;
  status?: TransactionStatus;
  asset_id?: AssetId;
}

/** Torii Explorer executable labels from `explorer_history.rs::executable_label`. */
export const TRANSACTION_EXECUTABLES = ['Instructions', 'ContractCall', 'Ivm', 'IvmProved', 'Batch'] as const;
export const TransactionExecutable = z.enum(TRANSACTION_EXECUTABLES);
export type TransactionExecutable = z.infer<typeof TransactionExecutable>;

export const Transaction = z.object({
  authority: AccountIdSchema,
  hash: z.string(),
  block: z.number(),
  created_at: z.coerce.date(),
  executable: TransactionExecutable,
  status: TransactionStatus,
});

export const ExplorerHealth = z.object({
  head_height: z.number(),
  head_created_at: z.coerce.date().nullable(),
  sampled_at: z.coerce.date(),
});

export const LatestTransactionsResponse = CollectionPage(Transaction);

const RejectionReason = z
  .object({
    encoded: z.string().optional().default(''),
    json: z.union([Metadata, z.string()]),
    message: z.string().optional().default(''),
  })
  .strict();

export const DetailedTransaction = Transaction.extend({
  rejection_reason: RejectionReason.nullable(),
  executable_payload: z.json(),
  metadata: Metadata,
  nonce: z.number().nullable(),
  signature: z.string(),
  time_to_live: Duration.nullable(),
});

export type Transaction = z.infer<typeof Transaction>;
export type DetailedTransaction = z.infer<typeof DetailedTransaction>;
export type ExplorerHealth = z.infer<typeof ExplorerHealth>;
export type LatestTransactionsResponse = z.infer<typeof LatestTransactionsResponse>;

export const Block = z.object({
  hash: z.string(),
  height: z.number(),
  created_at: z.coerce.date(),
  prev_block_hash: z.string().nullable(),
  transactions_hash: z.string().nullable(),
  transactions_rejected: z.number(),
  transactions_total: z.number(),
});

export type Block = z.infer<typeof Block>;

const LedgerEvidenceBytes = z.number().int().min(0).max(255).array();
const LedgerHeader = z
  .object({
    height: z.number().int().positive(),
    prev_block_hash: z.string().nullable(),
    merkle_root: z.string().nullable(),
    da_proof_policies_hash: z.string().nullable(),
    da_commitments_hash: z.string().nullable(),
    da_pin_intents_hash: z.string().nullable(),
    npos_effects_hash: z.string().nullable(),
    creation_time_ms: z.number().int().nonnegative(),
    view_change_index: z.number().int().nonnegative(),
    confidential_features: z
      .object({
        vk_set_hash: LedgerEvidenceBytes.length(32),
        poseidon_params_id: U32.nullable(),
        pedersen_params_id: U32.nullable(),
        conf_rules_version: U32,
        zk_policy_hash: LedgerEvidenceBytes.length(32),
      })
      .strict()
      .nullable(),
    execution_context_hash: z.string().nullable(),
    global_beacon_pulse_hash: z.string().nullable(),
  })
  .strict();

/** Node-supplied state-finality evidence; parsing does not authenticate its committee or signatures. */
export const StateFinalityResponse = z
  .object({
    height: z.number().int().min(2),
    block_hash: z.string(),
    witnessed_post_state_root: z.string(),
    block_header: LedgerHeader,
    finality_proof: z
      .object({
        block_header: LedgerHeader,
        block_wire: LedgerEvidenceBytes.min(1),
        committee: z
          .object({
            public_key: z.string().min(1),
            proof_of_possession: LedgerEvidenceBytes.min(1),
          })
          .strict()
          .array()
          .min(1),
      })
      .strict(),
  })
  .strict();

export type StateFinalityResponse = z.infer<typeof StateFinalityResponse>;

export const NetworkMetrics = z.object({
  peers: z.number(),
  domains: z.number(),
  accounts: z.number(),
  assets: z.number(),
  transactions_accepted: z.number(),
  transactions_rejected: z.number(),
  block: z.number(),
  block_created_at: z.coerce.date().nullable(),
  finalized_block: z.number(),
  avg_commit_time: Duration.nullable(),
  avg_block_time: Duration.nullable(),
});

export type NetworkMetrics = z.infer<typeof NetworkMetrics>;

const PeerConfig = z
  .object({
    public_key: z.string().optional(),
    queue_capacity: z.number().nullish().default(null),
    network_block_gossip_size: z.number().nullish().default(null),
    network_block_gossip_period: Duration.nullish().default(null),
    network_tx_gossip_size: z.number().nullish().default(null),
    network_tx_gossip_period: Duration.nullish().default(null),
  })
  .transform((value) => {
    const publicKey = value.public_key?.trim() ?? '';
    const hasConfig =
      publicKey.length > 0 ||
      value.queue_capacity !== null ||
      value.network_block_gossip_size !== null ||
      value.network_block_gossip_period !== null ||
      value.network_tx_gossip_size !== null ||
      value.network_tx_gossip_period !== null;

    if (!hasConfig) return null;

    return {
      public_key: publicKey,
      queue_capacity: value.queue_capacity,
      network_block_gossip_size: value.network_block_gossip_size,
      network_block_gossip_period: value.network_block_gossip_period,
      network_tx_gossip_size: value.network_tx_gossip_size,
      network_tx_gossip_period: value.network_tx_gossip_period,
    };
  });

const PeerLocation = z
  .object({
    lat: z.number().optional(),
    lon: z.number().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
  })
  .transform((value) => {
    if (
      typeof value.lat !== 'number' ||
      typeof value.lon !== 'number' ||
      typeof value.country !== 'string' ||
      typeof value.city !== 'string'
    ) {
      return null;
    }

    return {
      lat: value.lat,
      lon: value.lon,
      country: value.country,
      city: value.city,
    };
  });

export const PeerInfo = z.object({
  url: z.string(),
  connected: z.boolean(),
  telemetry_unsupported: z.boolean(),
  config: PeerConfig.nullish().transform((value) => value ?? null),
  location: PeerLocation.nullish().transform((value) => value ?? null),
  connected_peers: z
    .string()
    .array()
    .nullish()
    .transform((value) => value ?? null),
});

export type PeerInfo = z.infer<typeof PeerInfo>;

export const PeerStatus = z.object({
  url: z.string(),
  block: z.number(),
  commit_time: Duration,
  avg_commit_time: Duration,
  status_rtt: Duration.optional().nullable(),
  status_rtt_avg: Duration.optional().nullable(),
  status_rtt_p95: Duration.optional().nullable(),
  queue_size: z.number(),
  uptime: Duration,
  propagation_time: Duration.optional().nullable(),
  observed_at_ms: z.number().optional().nullable(),
});

export type PeerStatus = z.infer<typeof PeerStatus>;

export const PeerPropagation = z.object({
  block: z.number(),
  first_seen_at_ms: z.number(),
  last_seen_at_ms: z.number(),
  spread_ms: z.number(),
  peers_reported: z.number(),
});

export type PeerPropagation = z.infer<typeof PeerPropagation>;

export const OnlinePeers = z.string().array();
export type OnlinePeers = z.infer<typeof OnlinePeers>;

export const PeerMetrics = z.discriminatedUnion('kind', [
  PeerInfo.extend({ kind: z.literal('peer_info') }),
  PeerStatus.extend({ kind: z.literal('peer_status') }),
  PeerPropagation.extend({ kind: z.literal('propagation') }),
  NetworkMetrics.extend({ kind: z.literal('network_status') }),
  z.object({
    kind: z.literal('first'),
    peers_info: PeerInfo.array(),
    peers_status: PeerStatus.array(),
    propagation: PeerPropagation.array().optional().default([]),
    network_status: NetworkMetrics,
  }),
]);
export type PeerMetrics = z.infer<typeof PeerMetrics>;

export interface InstructionsSearchParams extends CursorPaginationParams {
  /** Committed upper bound shared across independently filtered scans. */
  max_block_height?: number;
  account?: string;
  authority?: string;
  kind?: string;
  transaction_hash?: string;
  transaction_status?: TransactionStatus;
  block?: number;
  asset_id?: AssetId;
}

const InstructionKind = z.string().min(1);
export type InstructionKind = z.infer<typeof InstructionKind>;

/** Semantic views are local UI input; the native network decoder never accepts them. */
export interface DecodedInstructionBox {
  encoded: string;
  framed_sha256: string;
  json: { kind: InstructionKind; payload: unknown; wire_id?: string; encoded?: string };
}

const InstructionBox = NativeInstructionEnvelope.transform((envelope) => ({
  encoded: envelope.instruction,
  framed_sha256: `0x${envelope.framed_sha256}`,
  wire_id: envelope.wire_id,
  json: null,
}));
export type InstructionBox = z.infer<typeof InstructionBox> | DecodedInstructionBox;
const InstructionRaw = z.object({
  authority: AccountIdSchema,
  created_at: z.coerce.date(),
  kind: InstructionKind,
  index: z.number(),
  box: InstructionBox,
  transaction_hash: z.string(),
  transaction_status: TransactionStatus,
  block: z.number(),
});

/** Decode only the authoritative native opaque-envelope wire contract. */
export const Instruction = InstructionRaw;
/** Existing semantic presentation helpers may also consume locally decoded values. */
export type Instruction = Omit<z.infer<typeof Instruction>, 'box'> & { box: InstructionBox };

export const LatestInstructionsResponse = CollectionPage(Instruction);
export type LatestInstructionsResponse = z.infer<typeof LatestInstructionsResponse>;

export const ContractViewAccessHints = z.object({
  read_keys: z.string().array(),
  write_keys: z.string().array(),
});
export type ContractViewAccessHints = z.infer<typeof ContractViewAccessHints>;

export const ContractViewEntrypointParam = z.object({
  name: z.string(),
  type_name: z.string(),
});
export type ContractViewEntrypointParam = z.infer<typeof ContractViewEntrypointParam>;

export const ContractViewEntrypoint = z.object({
  name: z.string(),
  kind: z.string(),
  params: ContractViewEntrypointParam.array(),
  return_type: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  permission: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  read_keys: z.string().array(),
  write_keys: z.string().array(),
  access_hints_complete: z
    .boolean()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  access_hints_skipped: z.string().array(),
  triggers: z.string().array(),
});
export type ContractViewEntrypoint = z.infer<typeof ContractViewEntrypoint>;

export const ContractViewSyscall = z.object({
  number: z.number(),
  name: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  count: z.number(),
});
export type ContractViewSyscall = z.infer<typeof ContractViewSyscall>;

export const ContractViewMemory = z.object({
  load64: z.number(),
  store64: z.number(),
  load128: z.number(),
  store128: z.number(),
});
export type ContractViewMemory = z.infer<typeof ContractViewMemory>;

export const ContractViewAnalysis = z.object({
  instruction_count: z.number(),
  memory: ContractViewMemory,
  syscalls: ContractViewSyscall.array(),
});
export type ContractViewAnalysis = z.infer<typeof ContractViewAnalysis>;

export const ContractVerifiedSourceRef = z.object({
  language: z.string(),
  source_name: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  submitted_at: z.string(),
  manifest_id_hex: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  payload_digest_hex: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  content_length: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type ContractVerifiedSourceRef = z.infer<typeof ContractVerifiedSourceRef>;

export const ContractCodeView = z.object({
  code_hash: z.string(),
  declared_code_hash: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  abi_hash: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  compiler_fingerprint: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  byte_len: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  permissions: z.string().array(),
  access_hints: ContractViewAccessHints.nullable()
    .optional()
    .transform((value) => value ?? null),
  entrypoints: ContractViewEntrypoint.array(),
  analysis: ContractViewAnalysis.nullable()
    .optional()
    .transform((value) => value ?? null),
  warnings: z.string().array(),
  rendered_source_kind: z.enum(['verified_source', 'pseudo_source', 'manifest_stub']),
  rendered_source_text: z.string(),
  verified_source_ref: ContractVerifiedSourceRef.nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type ContractCodeView = z.infer<typeof ContractCodeView>;

export const KaigiRelayStatus = z.enum(['Healthy', 'Degraded', 'Unavailable']);
export type KaigiRelayStatus = z.infer<typeof KaigiRelayStatus>;

export const KaigiRelaySummary = z.object({
  relay_id: z.string(),
  domain: z.string(),
  bandwidth_class: z.number(),
  hpke_fingerprint_hex: z.string(),
  status: KaigiRelayStatus.nullable(),
  reported_at_ms: z.number().nullable(),
});
export type KaigiRelaySummary = z.infer<typeof KaigiRelaySummary>;

export const KaigiRelaySummaryList = z.object({
  total: z.number(),
  items: KaigiRelaySummary.array(),
});
export type KaigiRelaySummaryList = z.infer<typeof KaigiRelaySummaryList>;

export const KaigiRelayDomainMetrics = z.object({
  domain: z.string(),
  registrations_total: z.number(),
  manifest_updates_total: z.number(),
  failovers_total: z.number(),
  health_reports_total: z.number(),
});
export type KaigiRelayDomainMetrics = z.infer<typeof KaigiRelayDomainMetrics>;

export const KaigiRelayDetail = z.object({
  relay: KaigiRelaySummary,
  hpke_public_key_b64: z.string(),
  reported_call: z.string().nullable(),
  reported_by: AccountIdSchema.nullable(),
  notes: z.string().nullable(),
  metrics: KaigiRelayDomainMetrics.nullable(),
});
export type KaigiRelayDetail = z.infer<typeof KaigiRelayDetail>;

export const KaigiRelayHealthSnapshot = z.object({
  healthy_total: z.number(),
  degraded_total: z.number(),
  unavailable_total: z.number(),
  reports_total: z.number(),
  registrations_total: z.number(),
  failovers_total: z.number(),
  domains: KaigiRelayDomainMetrics.array(),
});
export type KaigiRelayHealthSnapshot = z.infer<typeof KaigiRelayHealthSnapshot>;

export const NexusDataspaceManifestSummary = z.object({
  present: z.boolean(),
  status: z.string(),
  active: z.boolean(),
  issued_ms: z.number().nullable(),
  activation_epoch: z.number().nullable(),
  expiry_epoch: z.number().nullable(),
  activated_epoch: z.number().nullable(),
  expired_epoch: z.number().nullable(),
  revoked_epoch: z.number().nullable(),
  revoked_reason: z.string().nullable(),
  entries: z.number(),
});
export type NexusDataspaceManifestSummary = z.infer<typeof NexusDataspaceManifestSummary>;

export const NexusDataspaceConsensusCommitment = z.object({
  block_height: z.number(),
  lane_id: z.number(),
  dataspace_id: z.number(),
  tx_count: z.number(),
  total_chunks: z.number(),
  rbc_bytes_total: z.number(),
  teu_total: z.number(),
  block_hash: z.string(),
});
export type NexusDataspaceConsensusCommitment = z.infer<typeof NexusDataspaceConsensusCommitment>;

export const NexusDataspaceConsensusSummary = z.object({
  entries: z.number(),
  lane_ids: z.number().array(),
  tx_count: z.number(),
  total_chunks: z.number(),
  rbc_bytes_total: z.number(),
  teu_total: z.number(),
  last_block_height: z.number().nullable(),
  last_block_hash: z.string().nullable(),
  details: NexusDataspaceConsensusCommitment.array(),
});
export type NexusDataspaceConsensusSummary = z.infer<typeof NexusDataspaceConsensusSummary>;

export const NexusDataspacePortfolioSummary = z.object({
  accounts: z.number(),
  positions: z.number(),
  asset_definitions: z.number(),
});
export type NexusDataspacePortfolioSummary = z.infer<typeof NexusDataspacePortfolioSummary>;

export const NexusDataspaceAccountSummaryRow = z.object({
  dataspace_id: z.number(),
  dataspace_alias: z.string().nullable(),
  accounts: z.string().array(),
  portfolio: NexusDataspacePortfolioSummary,
  manifest: NexusDataspaceManifestSummary,
  consensus: NexusDataspaceConsensusSummary,
});
export type NexusDataspaceAccountSummaryRow = z.infer<typeof NexusDataspaceAccountSummaryRow>;

export const NexusDataspacesAccountTotals = z.object({
  dataspaces: z.number(),
  accounts_bound: z.number(),
  portfolio_accounts: z.number(),
  portfolio_positions: z.number(),
  manifests_total: z.number(),
  manifests_active: z.number(),
  consensus_entries: z.number(),
  consensus_tx_count: z.number(),
  consensus_chunks_total: z.number(),
  consensus_rbc_bytes_total: z.number(),
  consensus_teu_total: z.number(),
});
export type NexusDataspacesAccountTotals = z.infer<typeof NexusDataspacesAccountTotals>;

export const NexusDataspacesAccountSummary = z.object({
  account: AccountSelectorSchema,
  account_id: AccountIdSchema,
  uaid: z.string().nullable(),
  totals: NexusDataspacesAccountTotals,
  dataspaces: NexusDataspaceAccountSummaryRow.array(),
});
export type NexusDataspacesAccountSummary = z.infer<typeof NexusDataspacesAccountSummary>;

// Public status includes the universal dataspace (zero) and full-width u64 IDs.
// Unsafe numbers have already lost identity and must never be converted to text.
export const DataspaceId = z
  .union([z.string(), z.bigint(), z.number().int().safe()])
  .transform(String)
  .pipe(
    z
      .string()
      .refine(
        (value) => /^(0|[1-9][0-9]{0,19})$/u.test(value) && BigInt(value) <= (1n << 64n) - 1n,
        'expected an exact canonical u64 decimal dataspace ID'
      )
  );

export const NexusDataspaceCatalogEntry = z
  .object({
    lane_id: z.number().int().nonnegative(),
    dataspace_id: DataspaceId,
    alias: z.string().nullable(),
    visibility: z.enum(['public', 'restricted']).optional(),
    manifest_required: z.boolean().optional(),
    manifest_ready: z.boolean().optional(),
    manifest_path: z.string().nullable().optional(),
  })
  .passthrough();

export const NexusStatusDataspaceBacklog = z.object({
  lane_id: z.number(),
  dataspace_id: DataspaceId,
  fault_tolerance: z.number(),
  backlog: z.number(),
  age_slots: z.number(),
  virtual_finish: z.number(),
  tx_served: z.number(),
  alias: z.string().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
});
export type NexusStatusDataspaceBacklog = z.infer<typeof NexusStatusDataspaceBacklog>;

export const NexusPublicStatus = z
  .object({
    blocks: z.number(),
    txs_approved: z.number(),
    txs_rejected: z.number(),
    queue_size: z.number(),
    teu_dataspace_backlog: NexusStatusDataspaceBacklog.array(),
    dataspace_catalog: NexusDataspaceCatalogEntry.array(),
  })
  .passthrough();
export type NexusPublicStatus = z.infer<typeof NexusPublicStatus>;

const StatusCount = z.number().int().nonnegative();

/**
 * The reporting peer's `/status` fields the dashboards read. Every value
 * describes that one peer: `peers` excludes it, `commit_time_ms` is the
 * latest block's creation-to-commit time there, `view_changes` counts the
 * current round and `uptime` runs from genesis creation.
 */
export const NodeStatusSnapshot = z
  .object({
    build: z.object({ version: z.string() }).passthrough(),
    observed_at_ms: StatusCount,
    peers: StatusCount,
    blocks: StatusCount,
    blocks_non_empty: StatusCount,
    commit_time_ms: StatusCount,
    txs_approved: StatusCount,
    txs_rejected: StatusCount,
    txs_rejected_recent_5m: StatusCount,
    uptime: z.object({ secs: StatusCount, nanos: U32 }).strict(),
    view_changes: U32,
    queue_size: StatusCount,
    queue_queued: StatusCount,
    queue_inflight: StatusCount,
    time_since_last_block_ms: StatusCount,
    sumeragi: z
      .object({
        tx_queue_depth: StatusCount,
        tx_queue_capacity: StatusCount,
        tx_queue_saturated: z.boolean(),
        tx_queue_oldest_queued_age_ms: StatusCount,
      })
      .passthrough()
      .optional(),
    teu_lane_commit: z
      .object({ lane_id: U32, capacity: StatusCount, committed: StatusCount, block_height: StatusCount })
      .passthrough()
      .array(),
    teu_dataspace_backlog: NexusStatusDataspaceBacklog.array(),
    dataspace_catalog: NexusDataspaceCatalogEntry.array().optional().default([]),
  })
  .passthrough();
export type NodeStatusSnapshot = z.infer<typeof NodeStatusSnapshot>;

/** Dashboard projection of the transactions feed. */
export const TRANSACTION_SAMPLE_FIELDS = ['authority', 'block', 'created_at', 'executable', 'status'] as const;

/**
 * One projected transaction row. `executable` stays open text so a kind the
 * Explorer has no label for is counted as such instead of failing the page.
 * `created_at` is the transaction's own creation time, set by its signer.
 */
export const TransactionSampleRow = z
  .object({
    authority: AccountIdSchema,
    block: z.number().int().positive(),
    created_at: z.iso.datetime({ offset: true }),
    executable: z.string().min(1),
    status: TransactionStatus,
  })
  .strict()
  .transform((row) => ({
    authority: row.authority,
    block: row.block,
    createdAtMs: Date.parse(row.created_at),
    executable: row.executable,
    status: row.status,
  }));
export type TransactionSampleRow = z.infer<typeof TransactionSampleRow>;

/** Dashboard projection of the blocks feed. */
export const BLOCK_SAMPLE_FIELDS = ['height', 'created_at', 'transactions_total', 'transactions_rejected'] as const;

/**
 * One projected block row. An empty `created_at` marks a block whose body the
 * node could not read: its zero counters are unknown, so the sample keeps
 * `createdAtMs: null` and analytics exclude it from every total.
 */
export const BlockSampleRow = z
  .object({
    height: z.number().int().positive(),
    created_at: z.union([z.literal(''), z.iso.datetime({ offset: true })]),
    transactions_total: StatusCount,
    transactions_rejected: StatusCount,
  })
  .strict()
  .refine((row) => row.transactions_rejected <= row.transactions_total, {
    message: 'transactions_rejected exceeds transactions_total',
  })
  .transform((row) => ({
    height: row.height,
    createdAtMs: row.created_at === '' ? null : Date.parse(row.created_at),
    transactionsTotal: row.transactions_total,
    transactionsRejected: row.transactions_rejected,
  }));

export const SorafsAttestation = z.object({
  block_height: z.number(),
  block_hash_hex: z.string().nullable(),
  chain_id: z.string(),
});
export type SorafsAttestation = z.infer<typeof SorafsAttestation>;

const SafeU64 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MAX_U64_VALUE = (1n << 64n) - 1n;
const LosslessU64 = z
  .union([z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), z.bigint().min(0n).max(MAX_U64_VALUE)])
  .transform((value) => value.toString(10));
const PositiveLosslessU64 = LosslessU64.refine((value) => value !== '0', 'expected a non-zero u64');
const CanonicalU64Decimal = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/u, 'expected a canonical unsigned decimal integer')
  .refine((value) => BigInt(value) <= MAX_U64_VALUE, 'integer exceeds the unsigned 64-bit domain');
const LowerHex32 = z.string().regex(/^[0-9a-f]{64}$/u, 'expected lowercase 32-byte hex');
const ExactNonEmptyString = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'expected an exact non-empty string');

const CONTRACT_ADDRESS_HRP = 'irohac';
const CONTRACT_ADDRESS_VERSION_V1 = 1;
const CONTRACT_ADDRESS_PAYLOAD_BYTES_V1 = 29;
const BECH32M_CONSTANT = 0x2bc8_30a3;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a_57b2, 0x2650_8e6d, 0x1ea1_19fa, 0x3d42_33dd, 0x2a14_62b3] as const;

function bech32Polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ff_ffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if (((top >>> index) & 1) !== 0) checksum ^= BECH32_GENERATORS[index]!;
    }
  }
  return checksum >>> 0;
}

function decodeBech32Payload(values: readonly number[]): number[] | null {
  const output: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const value of values) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
    }
    accumulator &= bits === 0 ? 0 : (1 << bits) - 1;
  }
  if (bits >= 5 || (bits > 0 && accumulator !== 0)) return null;
  return output;
}

function isCanonicalContractAddress(value: string): boolean {
  if (value.length === 0 || value.length > 90 || value !== value.toLowerCase()) return false;
  const separator = value.lastIndexOf('1');
  if (separator <= 0 || separator > 83 || separator + 7 > value.length) return false;

  const hrp = value.slice(0, separator);
  if (hrp !== CONTRACT_ADDRESS_HRP) return false;
  if (
    ![...hrp].every((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 33 && codePoint <= 126;
    })
  ) {
    return false;
  }

  const values: number[] = [];
  for (const character of value.slice(separator + 1)) {
    const index = BECH32_CHARSET.indexOf(character);
    if (index < 0) return false;
    values.push(index);
  }
  const expandedHrp = [
    ...Array.from(hrp, (character) => character.codePointAt(0)! >>> 5),
    0,
    ...Array.from(hrp, (character) => character.codePointAt(0)! & 0x1f),
  ];
  if (bech32Polymod([...expandedHrp, ...values]) !== BECH32M_CONSTANT) return false;

  const payload = decodeBech32Payload(values.slice(0, -6));
  return payload?.length === CONTRACT_ADDRESS_PAYLOAD_BYTES_V1 && payload[0] === CONTRACT_ADDRESS_VERSION_V1;
}

function isCanonicalContractAlias(value: string): boolean {
  if (value.trim() !== value || value.includes('@') || value.includes('#') || value.includes('$')) return false;
  const separator = value.indexOf('::');
  if (separator <= 0 || separator !== value.lastIndexOf('::') || separator + 2 >= value.length) return false;

  const name = value.slice(0, separator);
  const scope = value.slice(separator + 2).split('.');
  if (scope.length < 1 || scope.length > 2) return false;
  return [name, ...scope].every(
    (segment) => !segment.includes(':') && !segment.includes('.') && isCanonicalName(segment)
  );
}
export const ContractAddressSchema = z
  .string()
  .refine(isCanonicalContractAddress, 'expected a canonical lowercase V1 irohac Bech32m address');
export const ContractAliasSchema = z.string().refine(isCanonicalContractAlias, 'expected a canonical contract alias');

export const AccountQrSnapshot = z
  .object({
    canonicalId: CanonicalAccountId,
    literal: CanonicalAccountId,
    networkPrefix: U16,
    errorCorrection: z.literal('M'),
    modules: z.literal(192),
    qrVersion: z.number().int().min(1).max(40),
    svg: z.string().min(1).startsWith('<svg'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.canonicalId !== value.literal) {
      ctx.addIssue({
        code: 'custom',
        path: ['literal'],
        message: 'QR literal must match the canonical account id',
      });
    }
  });
export type AccountQrSnapshot = z.infer<typeof AccountQrSnapshot>;

export const AccountQrResponse = z
  .object({
    canonical_id: CanonicalAccountId,
    literal: CanonicalAccountId,
    network_prefix: U16,
    error_correction: z.string(),
    modules: U32,
    qr_version: z.number().int().min(1).max(255),
    svg: z.string(),
  })
  .strict()
  .transform((value) => ({
    canonicalId: value.canonical_id,
    literal: value.literal,
    networkPrefix: value.network_prefix,
    errorCorrection: value.error_correction,
    modules: value.modules,
    qrVersion: value.qr_version,
    svg: value.svg,
  }))
  .pipe(AccountQrSnapshot);

const UpperHex32 = z
  .string()
  .regex(/^[0-9A-F]{64}$/u, 'expected uppercase 32-byte hex')
  .refine((value) => normalizeIrohaHash32(value) !== null, 'expected a marked Iroha Hash');

export const ConfidentialPolicyTransition = z
  .object({
    transition_id: UpperHex32,
    previous_mode: ConfidentialPolicyMode,
    new_mode: ConfidentialPolicyMode,
    effective_height: PositiveLosslessU64,
    conversion_window: LosslessU64.nullable(),
    window_open_height: LosslessU64.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.conversion_window === null) !== (value.window_open_height === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'conversion_window and window_open_height must both be null or both be present',
        path: ['window_open_height'],
      });
      return;
    }

    if (value.conversion_window !== null && value.window_open_height !== null) {
      const effectiveHeight = BigInt(value.effective_height);
      const conversionWindow = BigInt(value.conversion_window);
      const expectedWindowOpen = effectiveHeight > conversionWindow ? effectiveHeight - conversionWindow : 0n;
      if (value.window_open_height !== expectedWindowOpen.toString(10)) {
        ctx.addIssue({
          code: 'custom',
          message: 'window_open_height must equal the saturating effective-height minus conversion-window value',
          path: ['window_open_height'],
        });
      }
    }
  });

export type ConfidentialPolicyTransition = z.infer<typeof ConfidentialPolicyTransition>;

/** Exact DTO emitted by `/v1/confidential/assets/{definition_id}/transitions`. */
export const ConfidentialAssetPolicy = z
  .object({
    asset_id: AssetDefinitionIdSchema,
    block_height: LosslessU64,
    current_mode: ConfidentialPolicyMode,
    effective_mode: ConfidentialPolicyMode,
    vk_set_hash: UpperHex32.nullable(),
    poseidon_params_id: U32.nullable(),
    pedersen_params_id: U32.nullable(),
    pending_transition: ConfidentialPolicyTransition.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const transition = value.pending_transition;
    if (transition === null) {
      if (value.effective_mode !== value.current_mode) {
        ctx.addIssue({
          code: 'custom',
          message: 'effective_mode must equal current_mode when no transition is pending',
          path: ['effective_mode'],
        });
      }
      return;
    }

    if (transition.previous_mode !== value.current_mode) {
      ctx.addIssue({
        code: 'custom',
        message: 'pending transition previous_mode must equal current_mode',
        path: ['pending_transition', 'previous_mode'],
      });
    }

    const schedulesShieldedOnly = value.current_mode === 'Convertible' && transition.new_mode === 'ShieldedOnly';
    const schedulesConvertible = value.current_mode === 'ShieldedOnly' && transition.new_mode === 'Convertible';
    if (!schedulesShieldedOnly && !schedulesConvertible) {
      ctx.addIssue({
        code: 'custom',
        message: 'pending transition must follow the confidential-policy ABI V1 state machine',
        path: ['pending_transition', 'new_mode'],
      });
    }

    if (schedulesShieldedOnly) {
      if (
        transition.conversion_window === null ||
        transition.conversion_window === '0' ||
        BigInt(transition.conversion_window) > BigInt(transition.effective_height)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'a ShieldedOnly transition requires a positive conversion window no greater than its height',
          path: ['pending_transition', 'conversion_window'],
        });
      }
    } else if (schedulesConvertible && transition.conversion_window !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'a Convertible transition must not include a conversion window',
        path: ['pending_transition', 'conversion_window'],
      });
    }

    const expectedEffectiveMode =
      BigInt(value.block_height) >= BigInt(transition.effective_height) ? transition.new_mode : value.current_mode;
    if (value.effective_mode !== expectedEffectiveMode) {
      ctx.addIssue({
        code: 'custom',
        message: 'effective_mode must match the mode effective at block_height',
        path: ['effective_mode'],
      });
    }
  });

export type ConfidentialAssetPolicy = z.infer<typeof ConfidentialAssetPolicy>;

const VpnExitClass = z.enum(['standard', 'low-latency', 'high-security']);

function isCanonicalEd25519PublicKeyHex(value: string): boolean {
  if (!/^[0-9a-f]{64}$/u.test(value)) return false;
  try {
    const publicKey = Uint8Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
    );
    AccountAddress.fromAccount({ publicKey, algorithm: 'ed25519' });
    return true;
  } catch {
    return false;
  }
}

function isCanonicalVpnDnsName(value: string): boolean {
  if (value.length === 0 || value.length > 253 || value !== value.toLowerCase()) return false;
  return value
    .split('.')
    .every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label));
}

function isCanonicalVpnRelayEndpoint(value: string): boolean {
  const match = /^\/(ip4|ip6|dns|dns4|dns6)\/([^/]+)\/udp\/([1-9][0-9]{0,4})\/quic$/u.exec(value);
  if (!match) return false;

  const [, protocol, host, portLiteral] = match;
  const port = Number(portLiteral);
  if (!Number.isSafeInteger(port) || port > 65_535) return false;

  if (protocol === 'ip4') {
    const octets = host.split('.');
    return (
      octets.length === 4 && octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/u.test(octet) && Number(octet) <= 255)
    );
  }
  if (protocol === 'ip6') {
    try {
      return host === host.toLowerCase() && new URL(`https://[${host}]/`).hostname === `[${host}]`;
    } catch {
      return false;
    }
  }
  return isCanonicalVpnDnsName(host);
}

const VpnRelayEndpoint = z.union([
  z.literal(''),
  z.string().refine(isCanonicalVpnRelayEndpoint, 'expected a canonical VPN QUIC multiaddress'),
]);
const VpnRelayIdHex = z.union([
  z.literal(''),
  z.string().refine(isCanonicalEd25519PublicKeyHex, 'expected a canonical Ed25519 relay public key'),
]);
const VpnMldsa65PublicKeyHex = z
  .string()
  .refine(
    (value) => value === '' || (/^[0-9a-f]{3904}$/u.test(value) && !/^0+$/u.test(value)),
    'expected an empty value or a nonzero lowercase ML-DSA-65 public key'
  );
const VpnTrustDigestHex = z.union([
  z.literal(''),
  LowerHex32.refine((value) => !/^0+$/u.test(value), 'VPN trust digests must not be all zero'),
]);
const VpnTlsServerName = z.union([
  z.literal(''),
  z.string().refine(isCanonicalVpnDnsName, 'expected a canonical lowercase DNS name'),
]);

/** Exact Norito JSON response emitted by public `GET /v1/vpn/profile`. */
export const VpnProfile = z
  .object({
    available: z.boolean(),
    relay_endpoint: VpnRelayEndpoint,
    supported_exit_classes: VpnExitClass.array()
      .length(3)
      .refine((items) => new Set(items).size === 3),
    default_exit_class: VpnExitClass,
    lease_secs: U32.positive(),
    dns_push_interval_secs: SafeU64.min(30),
    meter_family: ExactNonEmptyString,
    route_pushes: z.string().array(),
    excluded_routes: z.string().array(),
    dns_servers: z.string().array(),
    tunnel_addresses: z.string().array(),
    mtu_bytes: z.literal(1280),
    display_billing_label: ExactNonEmptyString,
    operator_account_id: CanonicalAccountId,
    lease_fee: QuantityValue,
    settlement_grace_secs: SafeU64.positive(),
    flow_label_bits: z.literal(24),
    padding_budget_ms: U16.positive(),
    relay_id_hex: VpnRelayIdHex,
    relay_mldsa65_public_key_hex: VpnMldsa65PublicKeyHex,
    descriptor_commit_hex: VpnTrustDigestHex,
    tls_server_name: VpnTlsServerName,
    relay_tls_spki_sha256_hex: VpnTrustDigestHex,
    relay_certificate_sha256_hex: VpnTrustDigestHex,
    directory_snapshot_digest_hex: VpnTrustDigestHex,
  })
  .strict()
  .superRefine((value, ctx) => {
    const trustFields: Array<keyof typeof value> = [
      'relay_endpoint',
      'relay_id_hex',
      'relay_mldsa65_public_key_hex',
      'descriptor_commit_hex',
      'tls_server_name',
      'relay_tls_spki_sha256_hex',
      'relay_certificate_sha256_hex',
      'directory_snapshot_digest_hex',
    ];
    for (const field of trustFields) {
      const isEmpty = value[field] === '';
      if (isEmpty === value.available) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: value.available
            ? 'available VPN profiles require the complete relay trust tuple'
            : 'unavailable VPN profiles must not publish a partial relay trust tuple',
        });
      }
    }
  });
export type VpnProfile = z.infer<typeof VpnProfile>;

const SystemParameterAlgorithm = z.enum([
  'ed25519',
  'secp256k1',
  'bls_normal',
  'bls_small',
  'ml-dsa',
  'gost3410-2012-256-paramset-a',
  'gost3410-2012-256-paramset-b',
  'gost3410-2012-256-paramset-c',
  'gost3410-2012-512-paramset-a',
  'gost3410-2012-512-paramset-b',
  'sm2',
]);

const PositiveSafeInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const NonNegativeSafeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SmartContractParameters = z
  .object({
    fuel: PositiveSafeInteger,
    memory: PositiveSafeInteger,
    execution_depth: z.number().int().min(0).max(0xff),
    max_output_items: PositiveSafeInteger,
    max_output_bytes: PositiveSafeInteger,
  })
  .strict();
const CustomSystemParameter = z
  .object({
    id: CanonicalName,
    payload: z.json(),
  })
  .strict();
const CustomSystemParameters = z.record(CanonicalName, CustomSystemParameter).superRefine((parameters, ctx) => {
  for (const [id, parameter] of Object.entries(parameters)) {
    if (parameter.id !== id) {
      ctx.addIssue({
        code: 'custom',
        path: [id, 'id'],
        message: 'custom parameter id must match its map key',
      });
    }
  }
});

/** Exact JSON snapshot returned by the signed `/v1/parameters` route. */
export const SystemParameters = z
  .object({
    sumeragi: z
      .object({
        block_cadence_ms: PositiveSafeInteger,
        max_clock_drift_ms: NonNegativeSafeInteger,
        key_activation_lead_blocks: NonNegativeSafeInteger,
        key_overlap_grace_blocks: NonNegativeSafeInteger,
        key_expiry_grace_blocks: NonNegativeSafeInteger,
        key_require_hsm: z.boolean(),
        key_allowed_algorithms: SystemParameterAlgorithm.array(),
        key_allowed_hsm_providers: z.string().array(),
      })
      .strict(),
    block: z
      .object({
        max_transactions: PositiveSafeInteger,
      })
      .strict(),
    transaction: z
      .object({
        max_signatures: PositiveSafeInteger,
        max_instructions: PositiveSafeInteger,
        ivm_bytecode_size: PositiveSafeInteger,
        max_tx_bytes: PositiveSafeInteger,
        max_decompressed_bytes: PositiveSafeInteger,
        max_metadata_depth: z.number().int().min(1).max(0xffff),
        max_time_to_live_ms: PositiveSafeInteger,
        require_height_ttl: z.boolean(),
        require_sequence: z.boolean(),
      })
      .strict(),
    executor: SmartContractParameters,
    smart_contract: SmartContractParameters,
    custom: CustomSystemParameters.optional(),
  })
  .strict();
export type SystemParameters = z.infer<typeof SystemParameters>;

export const SoracleFeedIdSchema = CanonicalName;
const SoracleFeedId = z.tuple([SoracleFeedIdSchema]);
const SoracleFeedConfigVersion = z.tuple([U32]);
const SoracleHash = z
  .string()
  .regex(/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u, 'expected canonical Norito Hash text')
  .refine((value) => normalizeIrohaHash32(value) !== null, 'expected a checksum-valid marked Iroha Hash');
const CanonicalI128String = z
  .string()
  .regex(/^(?:0|-?[1-9]\d*)$/u, 'expected a canonical signed decimal integer')
  .superRefine((value, ctx) => {
    const integer = BigInt(value);
    if (integer < -(1n << 127n) || integer > (1n << 127n) - 1n) {
      ctx.addIssue({ code: 'custom', message: 'integer exceeds the signed 128-bit domain' });
    }
  });
const SoracleObservationValue = z
  .object({
    mantissa: CanonicalI128String,
    scale: U32,
  })
  .strict();
const SoracleRiskClass = z
  .object({
    risk_class: z.enum(['Low', 'Medium', 'High']),
    value: z.null(),
  })
  .strict();
const SoracleAggregationRule = z.discriminatedUnion('aggregation_rule', [
  z.object({ aggregation_rule: z.literal('MedianMad'), value: U16 }).strict(),
  z.object({ aggregation_rule: z.literal('Percentile'), value: U16 }).strict(),
]);
const SoracleOutlierPolicy = z.discriminatedUnion('outlier_policy', [
  z.object({ outlier_policy: z.literal('Mad'), value: U16 }).strict(),
  z
    .object({
      outlier_policy: z.literal('Absolute'),
      value: z.object({ max_delta: CanonicalI128String }).strict(),
    })
    .strict(),
]);

/** Exact Norito JSON returned by the signed `/v1/soracles/feeds` route. */
export const SoracleFeedConfig = z
  .object({
    feed_id: SoracleFeedId,
    feed_config_version: SoracleFeedConfigVersion,
    providers: CanonicalAccountId.array(),
    connector_id: z.string(),
    connector_version: U32,
    cadence_slots: PositiveLosslessU64,
    aggregation: SoracleAggregationRule,
    outlier_policy: SoracleOutlierPolicy,
    min_signers: U16,
    committee_size: U16,
    risk_class: SoracleRiskClass,
    max_observers: U16,
    max_value_len: U16,
    max_error_rate_bps: U16,
    dispute_window_slots: PositiveLosslessU64,
    replay_window_slots: PositiveLosslessU64,
  })
  .strict()
  .superRefine((value, ctx) => {
    const uniqueProviders = new Set(value.providers);
    if (value.providers.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'feed must list at least one provider', path: ['providers'] });
    } else if (uniqueProviders.size !== value.providers.length) {
      ctx.addIssue({ code: 'custom', message: 'feed providers must be unique', path: ['providers'] });
    }
    if (value.min_signers === 0) {
      ctx.addIssue({ code: 'custom', message: 'min_signers must be non-zero', path: ['min_signers'] });
    }
    if (value.committee_size === 0) {
      ctx.addIssue({ code: 'custom', message: 'committee_size must be non-zero', path: ['committee_size'] });
    }
    if (value.providers.length > value.max_observers) {
      ctx.addIssue({ code: 'custom', message: 'providers must not exceed max_observers', path: ['providers'] });
    }
    if (value.committee_size > value.max_observers) {
      ctx.addIssue({
        code: 'custom',
        message: 'committee_size must not exceed max_observers',
        path: ['committee_size'],
      });
    }
    if (value.committee_size > value.providers.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'committee_size must not exceed the provider count',
        path: ['committee_size'],
      });
    }
    if (value.min_signers > value.committee_size) {
      ctx.addIssue({
        code: 'custom',
        message: 'min_signers must not exceed committee_size',
        path: ['min_signers'],
      });
    }
    if (value.max_error_rate_bps > 10_000) {
      ctx.addIssue({
        code: 'custom',
        message: 'max_error_rate_bps must not exceed 10000',
        path: ['max_error_rate_bps'],
      });
    }
  });
export type SoracleFeedConfig = z.infer<typeof SoracleFeedConfig>;

export const SoracleFeedRegistry = SoracleFeedConfig.array().superRefine((feeds, ctx) => {
  const seen = new Set<string>();
  for (const [index, feed] of feeds.entries()) {
    const id = feed.feed_id[0];
    if (seen.has(id)) {
      ctx.addIssue({ code: 'custom', path: [index, 'feed_id'], message: 'feed ids must be unique' });
    }
    seen.add(id);
  }
});
export type SoracleFeedRegistry = z.infer<typeof SoracleFeedRegistry>;

const SoracleObservationErrorCode = z.discriminatedUnion('error_code', [
  z.object({ error_code: z.literal('ResourceUnavailable'), value: z.null() }).strict(),
  z.object({ error_code: z.literal('AuthFailed'), value: z.null() }).strict(),
  z.object({ error_code: z.literal('Timeout'), value: z.null() }).strict(),
  z.object({ error_code: z.literal('Missing'), value: z.null() }).strict(),
  z.object({ error_code: z.literal('Other'), value: U16 }).strict(),
]);
const SoracleReportEntry = z
  .object({
    oracle_id: CanonicalAccountId,
    observation_hash: SoracleHash,
    value: SoracleObservationValue,
    outlier: z.boolean(),
  })
  .strict();
const SoracleFeedEventOutcome = z
  .discriminatedUnion('result', [
    z
      .object({
        result: z.literal('Success'),
        detail: z
          .object({
            value: SoracleObservationValue,
            entries: SoracleReportEntry.array(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        result: z.literal('Error'),
        detail: z.object({ code: SoracleObservationErrorCode }).strict(),
      })
      .strict(),
    z.object({ result: z.literal('Missing'), detail: z.null() }).strict(),
  ])
  .superRefine((outcome, ctx) => {
    if (outcome.result !== 'Success') return;

    const { entries, value } = outcome.detail;
    if (entries.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'successful feed events must contain entries',
        path: ['detail', 'entries'],
      });
      return;
    }
    const seen = new Set<string>();
    let hasInlier = false;
    for (const [index, entry] of entries.entries()) {
      if (seen.has(entry.oracle_id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'successful feed-event providers must be unique',
          path: ['detail', 'entries', index, 'oracle_id'],
        });
      }
      seen.add(entry.oracle_id);
      if (entry.value.scale !== value.scale) {
        ctx.addIssue({
          code: 'custom',
          message: 'successful feed-event entries must share the aggregate scale',
          path: ['detail', 'entries', index, 'value', 'scale'],
        });
      }
      hasInlier ||= !entry.outlier;
    }
    if (!hasInlier) {
      ctx.addIssue({
        code: 'custom',
        message: 'successful feed events must contain an inlier',
        path: ['detail', 'entries'],
      });
    }
  });

/** Exact Norito JSON returned by the signed Soracles feed-history route. */
export const SoracleFeedEvent = z
  .object({
    feed_id: SoracleFeedId,
    feed_config_version: SoracleFeedConfigVersion,
    slot: LosslessU64,
    request_hash: SoracleHash,
    outcome: SoracleFeedEventOutcome,
  })
  .strict();
export type SoracleFeedEvent = z.infer<typeof SoracleFeedEvent>;

/** Exact retained record returned by the signed Soracles feed-history route. */
export const SoracleFeedEventRecord = z
  .object({
    event: SoracleFeedEvent,
    recorded_at_ms: LosslessU64,
    evidence_hashes: SoracleHash.array(),
  })
  .strict();
export type SoracleFeedEventRecord = z.infer<typeof SoracleFeedEventRecord>;

const DefiOracleDomain = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** Exact query accepted by `/v1/soracles/defi/attestations/latest`. */
export const DefiOracleAttestationLatestParamsSchema = z
  .object({
    domain: DefiOracleDomain,
    subject_id: CanonicalU64Decimal,
    status: U32.optional(),
  })
  .strict();
export type DefiOracleAttestationLatestParams = z.infer<typeof DefiOracleAttestationLatestParamsSchema>;

const DefiOracleAttestationSource = z
  .object({
    feed_id: SoracleFeedId,
    slot: LosslessU64,
    request_hash: SoracleHash,
    field: z.string().min(1),
  })
  .strict();
const Byte = z.number().int().min(0).max(0xff);
const NonEmptyByteArray = Byte.array().min(1);
const Ed25519SignatureBytes = Byte.array()
  .length(64)
  .refine((bytes) => bytes.some((byte) => byte !== 0), 'Ed25519 signature must not be all zero');
const Ed25519PublicKeyBytes = Byte.array()
  .length(32)
  .refine((bytes) => bytes.some((byte) => byte !== 0), 'Ed25519 public key must not be all zero');
const DefiOracleSubjectField = {
  1: 'market_id',
  2: 'series_id',
  3: 'position_id',
  4: 'policy_id',
} as const;
const DefiOracleDomainFields = {
  1: ['mark_price_bps', 'index_price_bps', 'confidence_bps'],
  2: ['final_mark', 'final_quote_mark'],
  3: ['mark_price_bps'],
  4: ['observed_price'],
} as const;

function readPayloadU64(payload: Record<string, unknown>, field: string): string | null {
  const parsed = LosslessU64.safeParse(payload[field]);
  return parsed.success ? parsed.data : null;
}

/** Exact Norito JSON returned by the signed latest-DeFi-attestation route. */
export const DefiOracleAttestation = z
  .object({
    key: z
      .object({
        domain: DefiOracleDomain,
        subject_id: LosslessU64,
      })
      .strict(),
    provider: CanonicalAccountId,
    oracle_slot: LosslessU64,
    status_flags: U32,
    attestation_hash: PositiveLosslessU64,
    oracle_payload: NonEmptyByteArray,
    oracle_signature: Ed25519SignatureBytes,
    signer_public_key: Ed25519PublicKeyBytes,
    oracle_scheme: z.literal(1),
    source_events: DefiOracleAttestationSource.array(),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      const providerAddress = AccountAddress.fromAccountId(value.provider);
      const signerAddress = AccountAddress.fromAccount({
        publicKey: value.signer_public_key,
        algorithm: 'ed25519',
      });
      if (providerAddress.canonicalHex() !== signerAddress.canonicalHex()) {
        ctx.addIssue({
          code: 'custom',
          message: 'signer_public_key must be the provider single-signature controller',
          path: ['signer_public_key'],
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'signer_public_key must be a canonical Ed25519 provider controller',
        path: ['signer_public_key'],
      });
    }

    try {
      if (
        !verifyEd25519(
          Uint8Array.from(value.oracle_payload),
          Uint8Array.from(value.oracle_signature),
          Uint8Array.from(value.signer_public_key)
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'oracle_signature must verify over oracle_payload',
          path: ['oracle_signature'],
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'oracle_signature must be a valid Ed25519 signature over oracle_payload',
        path: ['oracle_signature'],
      });
    }

    if (value.source_events.length > 0) {
      try {
        const deterministicHash = deriveDefiOracleAttestationHash({
          domain: value.key.domain,
          subjectId: value.key.subject_id,
          oracleSlot: value.oracle_slot,
          statusFlags: value.status_flags,
          sourceEvents: value.source_events.map((source) => ({
            feedId: source.feed_id[0],
            slot: source.slot,
            requestHash: source.request_hash,
            field: source.field,
          })),
        });
        if (value.attestation_hash !== deterministicHash) {
          ctx.addIssue({
            code: 'custom',
            message: 'source-backed attestation_hash must match the deterministic BLAKE3 derivation',
            path: ['attestation_hash'],
          });
        }
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'source-backed attestation_hash inputs must be canonical',
          path: ['attestation_hash'],
        });
      }
    }

    let decoded: unknown;
    try {
      const payloadText = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(value.oracle_payload));
      decoded = parseStrictLosslessJsonForValidation(payloadText, 'DeFi oracle payload');
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'oracle_payload must be valid integer-only compact JSON',
        path: ['oracle_payload'],
      });
      return;
    }
    if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
      ctx.addIssue({
        code: 'custom',
        message: 'oracle_payload must decode to a JSON object',
        path: ['oracle_payload'],
      });
      return;
    }

    const payload = decoded as Record<string, unknown>;
    const subjectField = DefiOracleSubjectField[value.key.domain];
    const expectedFields = [
      ['domain', value.key.domain.toString(10)],
      [subjectField, value.key.subject_id],
      ['oracle_slot', value.oracle_slot],
      ['status_flags', value.status_flags.toString(10)],
      ['attestation_hash', value.attestation_hash],
    ] as const;
    for (const [field, expected] of expectedFields) {
      if (readPayloadU64(payload, field) !== expected) {
        ctx.addIssue({
          code: 'custom',
          message: `oracle_payload ${field} must match the retained attestation`,
          path: ['oracle_payload'],
        });
      }
    }
    for (const field of DefiOracleDomainFields[value.key.domain]) {
      if (readPayloadU64(payload, field) === null) {
        ctx.addIssue({
          code: 'custom',
          message: `oracle_payload ${field} must be a u64 integer token`,
          path: ['oracle_payload'],
        });
      }
    }
    for (const source of value.source_events) {
      if (readPayloadU64(payload, source.field) === null) {
        ctx.addIssue({
          code: 'custom',
          message: `oracle_payload ${source.field} must be a u64 integer token`,
          path: ['source_events'],
        });
      }
    }
  });
export type DefiOracleAttestation = z.infer<typeof DefiOracleAttestation>;

export const SorafsManifestState = z.enum(['pending', 'approved', 'retired']);
export type SorafsManifestState = z.infer<typeof SorafsManifestState>;

const FixedBytes32Hex = z
  .array(z.number().int().min(0).max(255))
  .length(32)
  .transform((bytes) => bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(''));

const ManifestRootCidHex = z
  .array(z.number().int().min(0).max(255))
  .length(36)
  .superRefine((bytes, ctx) => {
    if (bytes[0] !== 1 || bytes[1] !== 0x71 || bytes[2] !== 0x1f || bytes[3] !== 32) {
      ctx.addIssue({ code: 'custom', message: 'expected the canonical first-release SoraFS root CID layout' });
    } else if (bytes.slice(4).every((byte) => byte === 0)) {
      ctx.addIssue({ code: 'custom', message: 'SoraFS root CID digest must be non-zero' });
    }
  })
  .transform((bytes) => bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(''));

export const SorafsPinStatus = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('Pending'), value: z.null() }).strict(),
    z.object({ status: z.literal('Approved'), value: z.number().int().nonnegative() }).strict(),
    z.object({ status: z.literal('Retired'), value: z.number().int().nonnegative() }).strict(),
  ])
  .transform((value) => ({
    state: value.status.toLowerCase() as SorafsManifestState,
    epoch: 'value' in value ? value.value : null,
  }));
export type SorafsPinStatus = z.infer<typeof SorafsPinStatus>;

export const SorafsPinFinalizedCursor = z
  .object({
    height: z.number().int().positive(),
    block_hash: FixedBytes32Hex.refine((value) => !/^0+$/u.test(value), 'finalized block hash must be non-zero'),
  })
  .strict();
export type SorafsPinFinalizedCursor = z.infer<typeof SorafsPinFinalizedCursor>;

export const SorafsPinResourceUsage = z
  .object({
    manifest_count: z.number().int().nonnegative(),
    content_bytes: z.number().int().nonnegative(),
  })
  .strict();
export type SorafsPinResourceUsage = z.infer<typeof SorafsPinResourceUsage>;

export const SorafsPinManifestSummary = z
  .object({
    digest: FixedBytes32Hex,
    submitted_by: CanonicalAccountId,
    submitted_epoch: z.number().int().nonnegative(),
    approved_epoch: z.number().int().nonnegative().nullable(),
    content_length: z.number().int().nonnegative(),
    retention_epoch: z.number().int().nonnegative(),
    status: SorafsPinStatus,
    successor_of: FixedBytes32Hex.nullable(),
  })
  .strict();
export type SorafsPinManifestSummary = z.infer<typeof SorafsPinManifestSummary>;

export const SorafsPinRegistryResponse = z
  .object({
    finalized_cursor: SorafsPinFinalizedCursor,
    charged_usage: SorafsPinResourceUsage,
    manifests: SorafsPinManifestSummary.array().max(256),
    has_more: z.boolean(),
    next_after_digest: FixedBytes32Hex.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.has_more !== (value.next_after_digest !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'has_more must match next_after_digest availability',
        path: ['has_more'],
      });
    }
  });
export type SorafsPinRegistryResponse = z.infer<typeof SorafsPinRegistryResponse>;

const SorafsPinStorageClass = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('Hot'), value: z.null() }).strict(),
    z.object({ type: z.literal('Warm'), value: z.null() }).strict(),
    z.object({ type: z.literal('Cold'), value: z.null() }).strict(),
  ])
  .transform((value) => value.type.toLowerCase() as 'hot' | 'warm' | 'cold');

const SorafsPinManifestRecord = z
  .object({
    digest: FixedBytes32Hex,
    root_cid: ManifestRootCidHex,
    chunker: z
      .object({
        profile_id: z.number().int().nonnegative().max(0xffff_ffff),
        namespace: z.string(),
        name: z.string(),
        semver: z.string(),
        multihash_code: z.number().int().nonnegative(),
      })
      .strict(),
    chunk_digest_sha3_256: FixedBytes32Hex,
    por_root: FixedBytes32Hex,
    content_length: z.number().int().nonnegative(),
    policy: z
      .object({
        min_replicas: z.number().int().nonnegative().max(0xffff),
        storage_class: SorafsPinStorageClass,
        retention_epoch: z.number().int().nonnegative(),
      })
      .strict(),
    submitted_by: CanonicalAccountId,
    submitted_epoch: z.number().int().nonnegative(),
    approved_epoch: z.number().int().nonnegative().nullable(),
    alias: z
      .object({
        name: z.string(),
        namespace: z.string(),
        proof: z.string(),
      })
      .strict()
      .nullable(),
    successor_of: FixedBytes32Hex.optional(),
    metadata: Metadata,
    status: SorafsPinStatus,
    retirement_reason: z.string().optional(),
    council_envelope_digest: FixedBytes32Hex.nullable(),
    pin_fee_payment: z
      .object({
        paid_by: CanonicalAccountId,
        fee_asset_id: AssetDefinitionIdSchema,
        treasury_account_id: CanonicalAccountId,
        amount: QuantityValue,
      })
      .strict()
      .optional(),
  })
  .strict();

export const SorafsPinManifestResponse = z
  .object({
    finalized_cursor: SorafsPinFinalizedCursor,
    manifest: SorafsPinManifestRecord,
  })
  .strict();
export type SorafsPinManifestResponse = z.infer<typeof SorafsPinManifestResponse>;

export const ConnectSessionResponse = z
  .object({
    sid: z.string().min(1),
    network_id: z.string().min(1),
    app_pk: z.string().min(1),
    nonce: z.string().min(1),
    wallet_uri: z.string().min(1),
    app_uri: z.string().min(1),
    token_app: z.string().min(1),
    token_wallet: z.string().min(1),
    token_management: z.string().min(1),
    token_relay: z.string().min(1),
  })
  .strict();
export type ConnectSessionResponse = z.infer<typeof ConnectSessionResponse>;

export interface SorafsPinRegistrySearchParams {
  limit?: number;
  max_bytes?: number;
  after_digest_hex?: string;
  expected_finalized_height?: number;
  expected_finalized_block_hash_hex?: string;
  status?: SorafsManifestState;
}

export interface SorafsPinManifestSearchParams {
  expected_finalized_height?: number;
  expected_finalized_block_hash_hex?: string;
}

const ZkLowerHex32 = z.string().regex(/^[0-9a-f]{64}$/u, 'expected a lowercase 32-byte hex value');
const ZkHeight = z.number().int().nonnegative();
const ZkPortableRegistryIdField = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$/u, 'expected a portable registry identifier')
  .refine(
    (value) => !['..', '//', ':::', '/:', ':/', '/.', './', ':.', '.:'].some((separator) => value.includes(separator)),
    'expected a portable registry identifier'
  );
const ZkCanonicalBase64 = z
  .string()
  .min(1)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u, 'expected standard base64');

export const ZkProofStatus = z.enum(['Submitted', 'Verified', 'Rejected']);
export type ZkProofStatus = z.infer<typeof ZkProofStatus>;

export const ZkVerifyingKeyId = z
  .object({
    backend: ZkPortableRegistryIdField,
    name: ZkPortableRegistryIdField,
  })
  .strict();
export type ZkVerifyingKeyId = z.infer<typeof ZkVerifyingKeyId>;

export const ZkProofId = z
  .object({
    backend: z.string().min(1),
    hash: ZkLowerHex32,
  })
  .strict();
export type ZkProofId = z.infer<typeof ZkProofId>;

export const ZkBridgeProofBinding = z
  .object({
    kind: z.enum(['verifier_manifest', 'sccp_route_configuration_v1']),
    hash: ZkLowerHex32,
  })
  .strict();
export type ZkBridgeProofBinding = z.infer<typeof ZkBridgeProofBinding>;

export const ZkBridgeProofPayload = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ics'),
      state_root: ZkLowerHex32,
      leaf_hash: ZkLowerHex32,
      hash_function: z.enum(['Sha256', 'Blake2b']),
      path_len: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('transparent_zk'),
      backend: z.string().min(1),
      proof_len_bytes: z.number().int().nonnegative(),
      recursion_depth: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('native_protocol'),
      backend: z.string().min(1),
      proof_len_bytes: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('sccp_destination'),
      backend: z.string().min(1),
      artifact_len_bytes: z.number().int().nonnegative(),
      message_id: ZkLowerHex32.optional(),
      request_hash: ZkLowerHex32.optional(),
      destination_binding_hash: ZkLowerHex32.optional(),
    })
    .strict(),
]);
export type ZkBridgeProofPayload = z.infer<typeof ZkBridgeProofPayload>;

export const ZkBridgeProof = z
  .object({
    binding: ZkBridgeProofBinding,
    commitment: ZkLowerHex32,
    size_bytes: z.number().int().nonnegative(),
    range: z
      .object({
        start_height: ZkHeight,
        end_height: ZkHeight,
      })
      .strict(),
    payload: ZkBridgeProofPayload,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.range.start_height > value.range.end_height) {
      context.addIssue({
        code: 'custom',
        path: ['range', 'end_height'],
        message: 'end_height must be greater than or equal to start_height',
      });
    }
  });
export type ZkBridgeProof = z.infer<typeof ZkBridgeProof>;

export const ZkProofRegistryItem = z
  .object({
    backend: z.string().min(1),
    hash: ZkLowerHex32,
    status: ZkProofStatus,
    verified_at_height: ZkHeight.optional(),
    vk_ref: ZkVerifyingKeyId.nullable(),
    vk_commitment: ZkLowerHex32.nullable(),
    bridge: ZkBridgeProof.optional(),
  })
  .strict();
export type ZkProofRegistryItem = z.infer<typeof ZkProofRegistryItem>;

export const ZkProofDetail = z
  .object({
    backend: z.string().min(1),
    proof_hash: ZkLowerHex32,
    status: ZkProofStatus,
    verified_at_height: ZkHeight.optional(),
    vk_ref: ZkVerifyingKeyId.nullable(),
    vk_commitment: ZkLowerHex32.nullable(),
    bridge: ZkBridgeProof.optional(),
  })
  .strict();
export type ZkProofDetail = z.infer<typeof ZkProofDetail>;

export const ZkProofCount = z.object({ count: z.number().int().nonnegative() }).strict();
export type ZkProofCount = z.infer<typeof ZkProofCount>;

export interface ZkProofFilterParams {
  backend?: string;
  status?: ZkProofStatus;
  bridge_only?: boolean;
  bridge_start_from_height?: number;
  bridge_end_until_height?: number;
  has_tag?: string;
  verified_from_height?: number;
  verified_until_height?: number;
}

export interface ZkProofListParams extends ZkProofFilterParams {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  ids_only?: boolean;
}

export const ZkVerifyingKeyStatus = z.enum(['Active', 'Proposed', 'Withdrawn']);
export type ZkVerifyingKeyStatus = z.infer<typeof ZkVerifyingKeyStatus>;

export const ZkVerifyingKeyRecord = z
  .object({
    version: z.number().int().nonnegative().max(0xffff_ffff),
    circuit_id: z.string().min(1),
    owner_manifest_id: z.string().min(1).nullable(),
    namespace: z.string().min(1),
    backend: z.string().min(1),
    curve: z.string().min(1),
    public_inputs_schema_hash: ZkLowerHex32,
    commitment: ZkLowerHex32,
    vk_len: z.number().int().nonnegative().max(0xffff_ffff),
    max_proof_bytes: z.number().int().nonnegative().max(0xffff_ffff),
    gas_schedule_id: z.string().min(1).nullable(),
    metadata_uri_cid: z.string().min(1).nullable(),
    vk_bytes_cid: z.string().min(1).nullable(),
    activation_height: ZkHeight.nullable(),
    withdraw_height: ZkHeight.nullable(),
    status: ZkVerifyingKeyStatus,
    key: z
      .object({
        backend: z.string().min(1),
        bytes_b64: ZkCanonicalBase64,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.activation_height !== null &&
      value.withdraw_height !== null &&
      value.withdraw_height <= value.activation_height
    ) {
      context.addIssue({
        code: 'custom',
        path: ['withdraw_height'],
        message: 'withdraw_height must be greater than activation_height',
      });
    }
  });
export type ZkVerifyingKeyRecord = z.infer<typeof ZkVerifyingKeyRecord>;

export const ZkVerifyingKeyListItem = z
  .object({
    id: ZkVerifyingKeyId,
    record: ZkVerifyingKeyRecord,
  })
  .strict();
export type ZkVerifyingKeyListItem = z.infer<typeof ZkVerifyingKeyListItem>;

export const ZkVerifyingKeyDetail = z
  .object({
    id: ZkVerifyingKeyId,
    record: ZkVerifyingKeyRecord,
    record_norito_base64: ZkCanonicalBase64,
  })
  .strict();
export type ZkVerifyingKeyDetail = z.infer<typeof ZkVerifyingKeyDetail>;

export interface ZkVerifyingKeyListParams {
  backend?: string;
  status?: ZkVerifyingKeyStatus;
  name_contains?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  ids_only?: boolean;
}

export const WorldCursorSchema = z
  .string()
  .min(1)
  .max(1424)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const CursorPagination = z
  .object({
    limit: z.number().int().min(1).max(100),
    next_cursor: WorldCursorSchema.nullable(),
    has_more: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.has_more !== (value.next_cursor !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'has_more must match next_cursor availability',
        path: ['has_more'],
      });
    }
  });

export type CursorPagination = z.infer<typeof CursorPagination>;

const MultisigProposalCursor = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/u, 'expected canonical unpadded base64url');
export const MultisigProposalsSearchParamsSchema = z
  .object({
    status: MultisigProposalStatus.array()
      .max(4)
      .refine((statuses) => new Set(statuses).size === statuses.length, 'status entries must be unique')
      .optional(),
    cursor: MultisigProposalCursor.nullable().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
