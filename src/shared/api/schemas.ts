import { z } from 'zod/v4';
import BigNumber from 'bignumber.js';
import { AccountAddress } from '@iroha/iroha-js/browser';
import { verifyEd25519 } from '@iroha/iroha-js/crypto';
import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';
import {
  isAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionIdLiteral,
  normalizeAssetDefinitionSelectorLiteral,
  normalizeAssetIdLiteral,
  parseAssetDefinitionAliasLiteral,
  parseAssetIdLiteral,
} from '@/shared/lib/asset-definition-literal';
import { normalizeDomainIdLiteral, normalizeRwaIdLiteral } from '@/shared/lib/rwa-id';
import { isExactNoritoQueryStringValue } from '@/shared/lib/torii-query-string';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';
import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';
import { parseStrictLosslessJsonForValidation } from '@/shared/lib/strict-lossless-integer-json';

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

export const WorldCursorSchema = z
  .string()
  .min(1)
  .max(1424)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const HistoryCursorSchema = z
  .string()
  .min(1)
  .max(192)
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

export const CursorPaginated = <T extends z.ZodType>(item: T) =>
  z
    .object({
      pagination: CursorPagination,
      items: item.array(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.items.length > value.pagination.limit) {
        ctx.addIssue({
          code: 'custom',
          message: 'items must not exceed the cursor page limit',
          path: ['items'],
        });
      }
    });

export interface CursorPaginated<T> {
  pagination: CursorPagination;
  items: T[];
}

export interface CursorPaginationParams {
  cursor?: string | null;
  limit?: number;
}

/** Exact snapshot-bound pagination metadata used by Explorer chain-history routes. */
export const HistoryCursorPagination = z
  .object({
    limit: z.number().int().min(1).max(100),
    snapshot_height: z.number().int().nonnegative(),
    snapshot_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    next_cursor: HistoryCursorSchema.nullable(),
    has_more: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.snapshot_height === 0) !== (value.snapshot_hash === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'snapshot_hash must be null exactly when snapshot_height is zero',
        path: ['snapshot_hash'],
      });
    }
    if (value.has_more !== (value.next_cursor !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'has_more must match next_cursor availability',
        path: ['has_more'],
      });
    }
  });

export type HistoryCursorPagination = z.infer<typeof HistoryCursorPagination>;

export const HistoryCursorPaginated = <T extends z.ZodType>(item: T) =>
  z
    .object({
      pagination: HistoryCursorPagination,
      items: item.array(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.items.length > value.pagination.limit) {
        ctx.addIssue({
          code: 'custom',
          message: 'items must not exceed the history cursor page limit',
          path: ['items'],
        });
      }
    });

export interface HistoryCursorPaginated<T> {
  pagination: HistoryCursorPagination;
  items: T[];
}

const Metadata = z.record(z.string(), z.json());
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffff_ffff);
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
const ExactNoritoQueryString = ExactNonEmptyString.refine(
  isExactNoritoQueryStringValue,
  'expected a value scalar-coercing NoritoQuery preserves as an exact string'
);
export const PINNED_TORII_DEFAULT_MAX_PAGE_LIMIT = 500;
export const PINNED_TORII_DEFAULT_MAX_FETCH_SIZE = 500;
const PaginationRequestShape = {
  page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  per_page: z.number().int().min(1).max(PINNED_TORII_DEFAULT_MAX_PAGE_LIMIT),
} as const;

function validateSafePageOffset(
  value: { page: number; per_page: number },
  ctx: z.core.$RefinementCtx<{ page: number; per_page: number }>
) {
  const offset = (value.page - 1) * value.per_page;
  const window = offset + value.per_page;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(window)) {
    ctx.addIssue({
      code: 'custom',
      message: 'page and per_page must produce a safe integer Torii offset',
      path: ['page'],
    });
  } else if (window > PINNED_TORII_DEFAULT_MAX_FETCH_SIZE) {
    ctx.addIssue({
      code: 'custom',
      message: `page and per_page must stay within Torii's ${PINNED_TORII_DEFAULT_MAX_FETCH_SIZE}-row fetch window`,
      path: ['page'],
    });
  }
}

/** Exact numbered-page input used by current Torii limit/offset routes. */
export const PaginationParamsSchema = z.object(PaginationRequestShape).strict().superRefine(validateSafePageOffset);
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
const Rfc3339Timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
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
const QuantityValue = canonicalNumericValue(true);
/** Exact canonical Norito JSON representation of signed `Numeric`. */
const SignedNumericValue = canonicalNumericValue(false);
const TransactionStatus = z.enum(['Committed', 'Rejected']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const InstructionKind = z.enum([
  'Register',
  'Unregister',
  'Mint',
  'Burn',
  'Transfer',
  'SetKeyValue',
  'RemoveKeyValue',
  'Grant',
  'Revoke',
  'ExecuteTrigger',
  'SetParameter',
  'Upgrade',
  'Log',
  'KagemushaTopUp',
  'KagemushaRedeem',
  'Custom',
]);
export type InstructionKind = z.infer<typeof InstructionKind>;

const Duration = z.object({ ms: SafeU64 }).strict();

export type AccountId = string;
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

const CanonicalName = z.string().refine(isCanonicalName, 'expected a canonical Iroha Name');
export const ContractAddressSchema = z
  .string()
  .refine(isCanonicalContractAddress, 'expected a canonical lowercase V1 irohac Bech32m address');
export const ContractAliasSchema = z.string().refine(isCanonicalContractAlias, 'expected a canonical contract alias');
const CanonicalDomainId = exactNormalizedStringSchema(
  normalizeDomainIdLiteral,
  'expected a canonical fully-qualified domain.dataspace ID'
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
  'Account ID response must be an exact canonical halfwidth i105 literal'
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
  'Account ID must use a canonical halfwidth i105 literal'
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

export const RwaIdSchema = exactNormalizedStringSchema(
  normalizeRwaIdLiteral,
  'RWA ID must use a canonical lowercase 64-hex-hash$domain.dataspace literal'
);

export const AccountPermissionsSearchParamsSchema = PaginationParamsSchema;
export type AccountPermissionsSearchParams = z.infer<typeof AccountPermissionsSearchParamsSchema>;

const AccountHistoryAssetSelectorSchema = z.union([AssetIdSchema, AssetDefinitionSelectorSchema]);
export const AccountHistorySearchParamsSchema = z
  .object({
    ...PaginationRequestShape,
    asset_id: AccountHistoryAssetSelectorSchema.optional(),
  })
  .strict()
  .superRefine(validateSafePageOffset);
export type AccountHistorySearchParams = z.infer<typeof AccountHistorySearchParamsSchema>;

const WorldCursorRequestShape = {
  cursor: WorldCursorSchema.nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
} as const;

const HistoryCursorRequestShape = {
  cursor: HistoryCursorSchema.nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
} as const;

export const HistoryCursorParamsSchema = z.object(HistoryCursorRequestShape).strict();

export const AccountSearchParamsSchema = z
  .object({
    ...WorldCursorRequestShape,
    domain: CanonicalDomainId.optional(),
    with_asset: AssetDefinitionSelectorSchema.optional(),
  })
  .strict();
export type AccountSearchParams = z.infer<typeof AccountSearchParamsSchema>;

export const Account = z
  .object({
    id: CanonicalAccountId,
    network_prefix: U16,
    metadata: Metadata,
    owned_assets: U32,
    owned_nfts: U32,
    owned_domains: U32,
  })
  .strict();

export type Account = z.infer<typeof Account>;

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

export const ToriiCountMode = z.enum(['bounded', 'exact']);
export type ToriiCountMode = z.infer<typeof ToriiCountMode>;

const ExactCountedListEnvelope = z
  .object({
    has_more: z.boolean(),
    count_mode: z.literal('exact'),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const AccountPermission = z
  .object({
    name: z.string().min(1),
    payload: z.json(),
  })
  .strict();
export type AccountPermission = z.infer<typeof AccountPermission>;

export const AccountPermissionsResponse = ExactCountedListEnvelope.extend({
  items: AccountPermission.array(),
}).strict();
export type AccountPermissionsResponse = z.infer<typeof AccountPermissionsResponse>;

export const AccountHistoryItem = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    type: z.string().min(1),
    timestamp_ms: z.number().int().nonnegative().optional(),
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

const AccountHistoryIndexResponse = ExactCountedListEnvelope.extend({
  items: AccountHistoryItem.array(),
  indexed_height: z.number().int().nonnegative(),
  indexed_block_hash: z.string().min(1).nullable(),
  query_source: z.literal('account_history_index'),
}).strict();

const AccountHistoryFanoutResponse = ExactCountedListEnvelope.extend({
  items: AccountHistoryItem.array(),
  query_source: z.literal('account_history_fanout'),
}).strict();

export const AccountHistoryResponse = z.discriminatedUnion('query_source', [
  AccountHistoryIndexResponse,
  AccountHistoryFanoutResponse,
]);
export type AccountHistoryResponse = z.infer<typeof AccountHistoryResponse>;

const ContractCommonFilterShape = {
  authority: AccountIdSchema.optional(),
  contract_address: ContractAddressSchema.optional(),
  contract_alias: ContractAliasSchema.refine(isExactNoritoQueryStringValue).optional(),
  since_timestamp_ms: SafeU64.optional(),
  until_timestamp_ms: SafeU64.optional(),
  result_ok: z.boolean().optional(),
} as const;

function validateTimestampBounds(
  value: { since_timestamp_ms?: number; until_timestamp_ms?: number },
  ctx: z.core.$RefinementCtx<{ since_timestamp_ms?: number; until_timestamp_ms?: number }>
) {
  if (
    value.since_timestamp_ms !== undefined &&
    value.until_timestamp_ms !== undefined &&
    value.since_timestamp_ms > value.until_timestamp_ms
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'since_timestamp_ms must not exceed until_timestamp_ms',
      path: ['since_timestamp_ms'],
    });
  }
}

export const ContractActivityFiltersSchema = z
  .object({
    ...ContractCommonFilterShape,
    contract_entrypoint: ExactNoritoQueryString.optional(),
  })
  .strict()
  .superRefine(validateTimestampBounds);
export type ContractActivityFilters = z.infer<typeof ContractActivityFiltersSchema>;

export const ContractActivitySearchParamsSchema = z
  .object({
    ...PaginationRequestShape,
    ...ContractCommonFilterShape,
    contract_entrypoint: ExactNoritoQueryString.optional(),
  })
  .strict()
  .superRefine(validateSafePageOffset)
  .superRefine(validateTimestampBounds);
export type ContractActivitySearchParams = z.infer<typeof ContractActivitySearchParamsSchema>;

const ContractEventSpecificFilterShape = {
  module: ExactNoritoQueryString.optional(),
  event_kind: ExactNoritoQueryString.optional(),
  participant: ExactNoritoQueryString.optional(),
  asset_id: ExactNoritoQueryString.optional(),
  provenance: z.enum(['emitted', 'derived']).optional(),
} as const;

export const ContractEventFiltersSchema = z
  .object({
    ...ContractCommonFilterShape,
    ...ContractEventSpecificFilterShape,
  })
  .strict()
  .superRefine(validateTimestampBounds);
export type ContractEventFilters = z.infer<typeof ContractEventFiltersSchema>;

export const ContractEventSearchParamsSchema = z
  .object({
    ...PaginationRequestShape,
    ...ContractCommonFilterShape,
    ...ContractEventSpecificFilterShape,
  })
  .strict()
  .superRefine(validateSafePageOffset)
  .superRefine(validateTimestampBounds);
export type ContractEventSearchParams = z.infer<typeof ContractEventSearchParamsSchema>;

export const ContractActivity = z
  .object({
    authority: CanonicalAccountId.optional(),
    timestamp_ms: SafeU64.optional(),
    entrypoint_hash: LowerHex32,
    result_ok: z.boolean(),
    contract_address: ContractAddressSchema,
    contract_alias: ContractAliasSchema.optional(),
    contract_entrypoint: ExactNonEmptyString.optional(),
    contract_payload: z.json().optional(),
    fee_payment: z.json().optional(),
  })
  .strict();
export type ContractActivity = z.infer<typeof ContractActivity>;

export const ContractActivityResponse = z
  .object({
    items: ContractActivity.array(),
    total: z.number().int().nonnegative(),
    has_more: z.boolean(),
    count_mode: z.literal('exact'),
  })
  .strict();
export type ContractActivityResponse = z.infer<typeof ContractActivityResponse>;

export const ContractEvent = z
  .object({
    event_id: ExactNonEmptyString,
    schema_version: z.literal(1),
    provenance: z.enum(['emitted', 'derived']),
    authority: CanonicalAccountId.optional(),
    timestamp_ms: SafeU64.optional(),
    tx_hash_hex: LowerHex32,
    block_height: SafeU64.positive(),
    block_hash_hex: LowerHex32,
    result_ok: z.boolean(),
    contract_address: ContractAddressSchema,
    contract_alias: ContractAliasSchema.optional(),
    module: ExactNonEmptyString,
    event_kind: ExactNonEmptyString,
    participants: ExactNonEmptyString.array().min(1).optional(),
    asset_ids: ExactNonEmptyString.array().min(1).optional(),
    numeric_fields: z.record(z.string(), z.json()).optional(),
    payload: z.json().optional(),
    fee_payment: z.json().optional(),
  })
  .strict();
export type ContractEvent = z.infer<typeof ContractEvent>;

export const ContractEventResponse = z
  .object({
    items: ContractEvent.array(),
    total: z.number().int().nonnegative(),
    has_more: z.boolean(),
    count_mode: z.literal('exact'),
  })
  .strict();
export type ContractEventResponse = z.infer<typeof ContractEventResponse>;

export const MultisigProposalStatus = z.enum(['COLLECTING_SIGNATURES', 'FINALIZED', 'CANCELED', 'EXPIRED']);
export type MultisigProposalStatus = z.infer<typeof MultisigProposalStatus>;

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
export type MultisigProposalsSearchParams = z.infer<typeof MultisigProposalsSearchParamsSchema>;

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
    instructions: z.array(z.record(z.string(), z.json())),
    proposed_at_ms: z.number().int().nonnegative(),
    expires_at_ms: z.number().int().nonnegative(),
    approvals: AccountIdSchema.array(),
    is_relayed: z.boolean().nullable().optional(),
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
  .strict();
export type MultisigProposalEntry = z.infer<typeof MultisigProposalEntry>;

export const MultisigProposalsQueryResponse = z
  .object({
    resolved_multisig_account_id: AccountIdSchema,
    proposals: MultisigProposalEntry.array().max(100),
    next_cursor: MultisigProposalCursor.nullable().optional(),
  })
  .strict();
export type MultisigProposalsQueryResponse = z.infer<typeof MultisigProposalsQueryResponse>;

export const AssetSearchParamsSchema = z
  .object({
    ...WorldCursorRequestShape,
    owned_by: CanonicalAccountId.optional(),
    definition: AssetDefinitionSelectorSchema.optional(),
    asset_id: AssetIdSchema.optional(),
  })
  .strict();
export type AssetSearchParams = z.infer<typeof AssetSearchParamsSchema>;

/** Exact item emitted by the current `/v1/explorer/assets` routes. */
export const ExplorerAsset = z
  .object({
    id: CanonicalAssetId,
    definition_id: AssetDefinitionIdSchema,
    account_id: CanonicalAccountId,
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
  });

export type ExplorerAsset = z.infer<typeof ExplorerAsset>;

export const AssetDefinitionSearchParamsSchema = z
  .object({
    ...WorldCursorRequestShape,
    owning_domain: CanonicalDomainId.optional(),
    owned_by: CanonicalAccountId.optional(),
  })
  .strict();
export type AssetDefinitionSearchParams = z.infer<typeof AssetDefinitionSearchParamsSchema>;

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
    lease_expiry_ms: SafeU64.optional(),
    grace_until_ms: SafeU64.optional(),
    bound_at_ms: SafeU64,
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
    mintable: AssetDefinitionMintable,
    logo: z.string().nullable(),
    metadata: Metadata,
    owned_by: CanonicalAccountId,
    assets: U32,
    total_quantity: QuantityValue,
    locked_quantity: QuantityValue.nullable(),
    circulating_quantity: QuantityValue.nullable(),
  })
  .strict();

export type ExplorerAssetDefinition = z.infer<typeof ExplorerAssetDefinition>;

/** Full current record from `/v1/assets/definitions/:id`. */
export const AssetDefinition = z
  .object({
    id: AssetDefinitionIdSchema,
    owning_domain: CanonicalDomainId.nullable(),
    name: AssetHumanName,
    description: AssetDescription,
    alias: ExactAssetDefinitionAlias.nullable(),
    alias_binding: AssetDefinitionAliasBinding.optional(),
    balance_scope_policy: z.enum(['Global', 'DataspaceRestricted']),
    confidential_policy: z.json(),
    logo: z.string().nullable(),
    metadata: Metadata,
    mintable: AssetDefinitionMintable,
    owned_by: CanonicalAccountId,
    spec: z.json(),
    total_quantity: QuantityValue,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!aliasMatchesAssetName(value.alias, value.name)) {
      ctx.addIssue({
        code: 'custom',
        message: 'asset alias name segment must match asset name',
        path: ['alias'],
      });
    }
    if (value.alias_binding !== undefined && value.alias_binding.alias !== value.alias) {
      ctx.addIssue({
        code: 'custom',
        message: 'alias binding must match the authoritative alias field',
        path: ['alias_binding', 'alias'],
      });
    }
  });

export type AssetDefinition = z.infer<typeof AssetDefinition>;

const UpperHex32 = z
  .string()
  .regex(/^[0-9A-F]{64}$/u, 'expected uppercase 32-byte hex')
  .refine((value) => normalizeIrohaHash32(value) !== null, 'expected a marked Iroha Hash');

export const ConfidentialPolicyMode = z.enum(['TransparentOnly', 'ShieldedOnly', 'Convertible']);
export type ConfidentialPolicyMode = z.infer<typeof ConfidentialPolicyMode>;

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

export const AssetDefinitionEconometricsVelocityWindow = z
  .object({
    key: z.string(),
    start_ms: z.number(),
    end_ms: z.number(),
    transfers: z.number(),
    unique_senders: z.number(),
    unique_receivers: z.number(),
    amount: QuantityValue,
  })
  .strict();

export type AssetDefinitionEconometricsVelocityWindow = z.infer<typeof AssetDefinitionEconometricsVelocityWindow>;

export const AssetDefinitionEconometricsIssuanceWindow = z
  .object({
    key: z.string(),
    start_ms: z.number(),
    end_ms: z.number(),
    mint_count: z.number(),
    burn_count: z.number(),
    minted: QuantityValue,
    burned: QuantityValue,
    net: SignedNumericValue,
  })
  .strict();

export type AssetDefinitionEconometricsIssuanceWindow = z.infer<typeof AssetDefinitionEconometricsIssuanceWindow>;

export const AssetDefinitionEconometricsIssuanceSeriesPoint = z
  .object({
    bucket_start_ms: z.number(),
    minted: QuantityValue,
    burned: QuantityValue,
    net: SignedNumericValue,
  })
  .strict();

export type AssetDefinitionEconometricsIssuanceSeriesPoint = z.infer<
  typeof AssetDefinitionEconometricsIssuanceSeriesPoint
>;

export const AssetDefinitionEconometrics = z
  .object({
    definition_id: AssetDefinitionIdSchema,
    computed_at_ms: z.number(),
    velocity_windows: AssetDefinitionEconometricsVelocityWindow.array(),
    issuance_windows: AssetDefinitionEconometricsIssuanceWindow.array(),
    issuance_series: AssetDefinitionEconometricsIssuanceSeriesPoint.array(),
  })
  .strict();

export type AssetDefinitionEconometrics = z.infer<typeof AssetDefinitionEconometrics>;

export const AssetDefinitionSnapshotLorenzPoint = z
  .object({
    population: z.number(),
    share: z.number(),
  })
  .strict();

export type AssetDefinitionSnapshotLorenzPoint = z.infer<typeof AssetDefinitionSnapshotLorenzPoint>;

export const AssetDefinitionSnapshotDistribution = z
  .object({
    gini: z.number(),
    hhi: z.number(),
    theil: z.number(),
    entropy: z.number(),
    entropy_normalized: z.number(),
    nakamoto_33: z.number(),
    nakamoto_51: z.number(),
    nakamoto_67: z.number(),
    top1: z.number(),
    top5: z.number(),
    top10: z.number(),
    median: QuantityValue.nullable(),
    p90: QuantityValue.nullable(),
    p99: QuantityValue.nullable(),
    lorenz: AssetDefinitionSnapshotLorenzPoint.array(),
  })
  .strict();

export type AssetDefinitionSnapshotDistribution = z.infer<typeof AssetDefinitionSnapshotDistribution>;

export const AssetDefinitionSnapshotTopHolder = z
  .object({
    account_id: AccountIdSchema,
    balance: QuantityValue,
  })
  .strict();

export type AssetDefinitionSnapshotTopHolder = z.infer<typeof AssetDefinitionSnapshotTopHolder>;

export const AssetDefinitionSnapshot = z
  .object({
    definition_id: AssetDefinitionIdSchema,
    computed_at_ms: z.number(),
    holders_total: z.number(),
    total_supply: QuantityValue,
    top_holders: AssetDefinitionSnapshotTopHolder.array(),
    distribution: AssetDefinitionSnapshotDistribution,
  })
  .strict();

export type AssetDefinitionSnapshot = z.infer<typeof AssetDefinitionSnapshot>;

export const NFT = z
  .object({
    id: NftIdSchema,
    owned_by: CanonicalAccountId,
    metadata: Metadata,
  })
  .strict();

export type NFT = z.infer<typeof NFT>;

export const NFTsSearchParamsSchema = z
  .object({
    ...WorldCursorRequestShape,
    domain: CanonicalDomainId.optional(),
    owned_by: CanonicalAccountId.optional(),
  })
  .strict();
export type NFTsSearchParams = z.infer<typeof NFTsSearchParamsSchema>;

export const RWASearchParamsSchema = NFTsSearchParamsSchema;
export type RWASearchParams = z.infer<typeof RWASearchParamsSchema>;

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

export const DomainSearchParamsSchema = z
  .object({
    ...WorldCursorRequestShape,
    owned_by: CanonicalAccountId.optional(),
  })
  .strict();
export type DomainSearchParams = z.infer<typeof DomainSearchParamsSchema>;

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

export const TransactionSearchParamsSchema = z
  .object({
    ...HistoryCursorRequestShape,
    authority: CanonicalAccountId.optional(),
    block: SafeU64.positive().optional(),
    status: TransactionStatus.optional(),
    asset_id: AssetIdSchema.optional(),
  })
  .strict();
export type TransactionSearchParams = z.infer<typeof TransactionSearchParamsSchema>;

export const Transaction = z
  .object({
    authority: CanonicalAccountId,
    hash: LowerHex32,
    block: SafeU64.refine((value) => value > 0, 'block height must be positive'),
    created_at: Rfc3339Timestamp,
    executable: z.enum(['Instructions', 'ContractCall', 'Ivm', 'IvmProved', 'Batch']),
    status: TransactionStatus,
  })
  .strict();

export const ExplorerHealth = z
  .object({
    head_height: SafeU64,
    head_created_at: Rfc3339Timestamp.nullable(),
    sampled_at: Rfc3339Timestamp,
  })
  .strict();

export const LatestTransactionsResponse = z
  .object({
    sampled_at: Rfc3339Timestamp,
    pagination: HistoryCursorPagination,
    items: Transaction.array(),
  })
  .strict();

const RejectionReason = z
  .object({
    encoded: z.string().regex(/^0x[0-9a-f]+$/u),
    json: z.json(),
    message: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, 'message must contain visible text'),
  })
  .strict();

export const DetailedTransaction = Transaction.extend({
  rejection_reason: RejectionReason.nullable(),
  executable_payload: z.json(),
  metadata: Metadata,
  nonce: SafeU64.nullable(),
  signature: z.string(),
  time_to_live: Duration.nullable(),
});

export type Transaction = z.infer<typeof Transaction>;
export type DetailedTransaction = z.infer<typeof DetailedTransaction>;
export type ExplorerHealth = z.infer<typeof ExplorerHealth>;
export type LatestTransactionsResponse = z.infer<typeof LatestTransactionsResponse>;

export const Block = z
  .object({
    hash: LowerHex32,
    height: SafeU64.refine((value) => value > 0, 'block height must be positive'),
    created_at: z.union([Rfc3339Timestamp, z.literal('').transform(() => null)]),
    prev_block_hash: LowerHex32.nullable(),
    transactions_hash: LowerHex32.nullable(),
    transactions_rejected: U32,
    transactions_total: U32,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.created_at === null &&
      (value.transactions_hash !== null || value.transactions_rejected !== 0 || value.transactions_total !== 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['created_at'],
        message: 'hash-only committed-journal blocks require null transaction hash and zero transaction counts',
      });
    }
  });

export type Block = z.infer<typeof Block>;

export const LedgerCommitQc = z
  .object({
    phase: z.string(),
    subject_block_hash: z.string(),
    parent_state_root: z.string(),
    post_state_root: z.string(),
    height: z.number(),
    view: z.number(),
    epoch: z.number(),
    mode_tag: z.string(),
    highest_qc: z
      .object({
        height: z.number(),
        view: z.number(),
        epoch: z.number(),
        subject_block_hash: z.string(),
        phase: z.string(),
      })
      .strict()
      .nullable(),
    validator_set_hash: z.string(),
    validator_set_hash_version: z.number(),
    validator_set: z.string().array(),
    aggregate: z
      .object({
        signers_bitmap: z.string(),
        bls_aggregate_signature: z.string(),
      })
      .strict(),
  })
  .strict();

export type LedgerCommitQc = z.infer<typeof LedgerCommitQc>;

export const LedgerStateRoot = z
  .object({
    height: z.number(),
    block_hash: z.string(),
    state_root: z.string(),
    source: z.enum(['commit_qc', 'result_merkle_root']),
    commit_qc: LedgerCommitQc.nullable(),
  })
  .strict();

export type LedgerStateRoot = z.infer<typeof LedgerStateRoot>;

export const LedgerStateProof = z
  .object({
    height: z.number(),
    block_hash: z.string(),
    state_root: z.string(),
    commit_qc: LedgerCommitQc,
  })
  .strict();

export type LedgerStateProof = z.infer<typeof LedgerStateProof>;

export const NetworkMetrics = z
  .object({
    peers: SafeU64,
    domains: SafeU64,
    accounts: SafeU64,
    assets: SafeU64,
    transactions_accepted: SafeU64,
    transactions_rejected: SafeU64,
    block: SafeU64,
    block_created_at: Rfc3339Timestamp.nullable(),
    finalized_block: SafeU64,
    avg_commit_time: Duration.nullable(),
    avg_block_time: Duration.nullable(),
  })
  .strict();

export type NetworkMetrics = z.infer<typeof NetworkMetrics>;

const PeerConfig = z
  .object({
    public_key: z.string().optional(),
    queue_capacity: U32.optional(),
    network_block_gossip_size: U32.optional(),
    network_block_gossip_period: Duration.optional(),
    network_tx_gossip_size: U32.optional(),
    network_tx_gossip_period: Duration.optional(),
  })
  .strict();

const PeerLocation = z
  .object({
    lat: z.number(),
    lon: z.number(),
    country: z.string(),
    city: z.string(),
  })
  .strict();

export const PeerInfo = z
  .object({
    url: z.string(),
    connected: z.boolean(),
    telemetry_unsupported: z.boolean(),
    config: PeerConfig.optional(),
    location: PeerLocation.optional(),
    connected_peers: z.string().array().optional(),
  })
  .strict();

export type PeerInfo = z.infer<typeof PeerInfo>;

export const PeerStatus = z
  .object({
    url: z.string(),
    block: U32,
    commit_time: Duration,
    avg_commit_time: Duration,
    status_rtt: Duration.optional(),
    status_rtt_avg: Duration.optional(),
    status_rtt_p95: Duration.optional(),
    queue_size: U32,
    uptime: Duration,
    propagation_time: Duration.optional(),
    observed_at_ms: SafeU64.optional(),
  })
  .strict();

export type PeerStatus = z.infer<typeof PeerStatus>;

export const PeerPropagation = z
  .object({
    block: U32,
    first_seen_at_ms: SafeU64,
    last_seen_at_ms: SafeU64,
    spread_ms: SafeU64,
    peers_reported: U32,
  })
  .strict();

export type PeerPropagation = z.infer<typeof PeerPropagation>;

export const PeerMetrics = z.discriminatedUnion('kind', [
  PeerInfo.extend({ kind: z.literal('peer_info') }),
  PeerStatus.extend({ kind: z.literal('peer_status') }),
  PeerPropagation.extend({ kind: z.literal('propagation') }),
  NetworkMetrics.extend({ kind: z.literal('network_status') }),
  z
    .object({
      kind: z.literal('first'),
      peers_info: PeerInfo.array(),
      peers_status: PeerStatus.array(),
      propagation: PeerPropagation.array(),
      network_status: NetworkMetrics,
    })
    .strict(),
]);
export type PeerMetrics = z.infer<typeof PeerMetrics>;

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

export const InstructionsSearchParamsSchema = z
  .object({
    ...HistoryCursorRequestShape,
    account: CanonicalAccountId.optional(),
    authority: CanonicalAccountId.optional(),
    kind: InstructionKind.optional(),
    transaction_hash: LowerHex32.optional(),
    transaction_status: TransactionStatus.optional(),
    block: SafeU64.positive().optional(),
    asset_id: AssetIdSchema.optional(),
  })
  .strict();
export type InstructionsSearchParams = z.infer<typeof InstructionsSearchParamsSchema>;

const StructuredInstructionPayload: z.ZodType<{ variant: string; value: unknown }> = z
  .object({
    variant: z.string().min(1),
    value: z.json(),
  })
  .strict();

const InstructionBoxStructured = z
  .object({
    kind: InstructionKind,
    payload: StructuredInstructionPayload,
    wire_id: z.string().min(1),
    encoded: z.string().regex(/^[0-9a-f]+$/u),
  })
  .strict();

const InstructionBox = z
  .object({
    encoded: z.string().regex(/^0x[0-9a-f]+$/u),
    framed_sha256: z.string().regex(/^0x[0-9a-f]{64}$/u),
    json: InstructionBoxStructured,
  })
  .strict();
export type InstructionBox = z.infer<typeof InstructionBox>;
const InstructionRaw = z
  .object({
    authority: AccountIdSchema,
    created_at: Rfc3339Timestamp,
    kind: z.string().min(1),
    index: z.number().int().min(0).max(4_294_967_295),
    box: InstructionBox,
    transaction_hash: z.string().regex(/^[0-9a-f]{64}$/u),
    transaction_status: TransactionStatus,
    block: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const family = value.box.json.kind;
    const wireVariant = value.box.json.wire_id.split('::').at(-1) ?? value.box.json.wire_id;
    const expectedDisplayKind =
      family !== 'Custom' || wireVariant.trim().length === 0 || wireVariant.toLowerCase() === 'custominstruction'
        ? family
        : wireVariant;

    if (value.kind !== expectedDisplayKind) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `kind must equal the Torii display kind derived from box.json (${expectedDisplayKind})`,
      });
    }
  });

export const Instruction = InstructionRaw;
export type Instruction = z.infer<typeof Instruction>;

export const LatestInstructionsResponse = z
  .object({
    sampled_at: Rfc3339Timestamp,
    pagination: HistoryCursorPagination,
    items: Instruction.array(),
  })
  .strict();
export type LatestInstructionsResponse = z.infer<typeof LatestInstructionsResponse>;

export const ContractViewAccessHints = z
  .object({
    read_keys: z.string().array(),
    write_keys: z.string().array(),
  })
  .strict();
export type ContractViewAccessHints = z.infer<typeof ContractViewAccessHints>;

export const ContractViewEntrypointParam = z
  .object({
    name: z.string(),
    type_name: z.string(),
  })
  .strict();
export type ContractViewEntrypointParam = z.infer<typeof ContractViewEntrypointParam>;

export const ContractViewEntrypoint = z
  .object({
    name: z.string(),
    kind: z.string(),
    params: ContractViewEntrypointParam.array(),
    return_type: z.string().optional(),
    permission: z.string().optional(),
    read_keys: z.string().array(),
    write_keys: z.string().array(),
    access_hints_complete: z.boolean().optional(),
    access_hints_skipped: z.string().array(),
    triggers: z.string().array(),
  })
  .strict();
export type ContractViewEntrypoint = z.infer<typeof ContractViewEntrypoint>;

export const ContractViewSyscall = z
  .object({
    number: U32,
    name: z.string().optional(),
    count: SafeU64,
  })
  .strict();
export type ContractViewSyscall = z.infer<typeof ContractViewSyscall>;

export const ContractViewMemory = z
  .object({
    load64: SafeU64,
    store64: SafeU64,
    load128: SafeU64,
    store128: SafeU64,
  })
  .strict();
export type ContractViewMemory = z.infer<typeof ContractViewMemory>;

export const ContractViewAnalysis = z
  .object({
    instruction_count: SafeU64,
    memory: ContractViewMemory,
    syscalls: ContractViewSyscall.array(),
  })
  .strict();
export type ContractViewAnalysis = z.infer<typeof ContractViewAnalysis>;

export const ContractVerifiedSourceRef = z
  .object({
    language: z.string(),
    source_name: z.string().nullable(),
    submitted_at: z.string(),
    manifest_id_hex: z.string().nullable(),
    payload_digest_hex: z.string().nullable(),
    content_length: SafeU64.nullable(),
  })
  .strict();
export type ContractVerifiedSourceRef = z.infer<typeof ContractVerifiedSourceRef>;

export const ContractCodeView = z
  .object({
    code_hash: LowerHex32,
    declared_code_hash: LowerHex32.optional(),
    abi_hash: LowerHex32.optional(),
    compiler_fingerprint: z.string().optional(),
    byte_len: SafeU64.optional(),
    permissions: z.string().array(),
    access_hints: ContractViewAccessHints.optional(),
    entrypoints: ContractViewEntrypoint.array(),
    analysis: ContractViewAnalysis.optional(),
    warnings: z.string().array(),
    rendered_source_kind: z.enum(['verified_source', 'pseudo_source', 'manifest_stub']),
    rendered_source_text: z.string(),
    verified_source_ref: ContractVerifiedSourceRef.optional(),
  })
  .strict();
export type ContractCodeView = z.infer<typeof ContractCodeView>;

const NexusCount = z.number().int().nonnegative();

export const NexusDataspaceManifestSummary = z
  .object({
    present: z.boolean(),
    status: z.enum(['Missing', 'Pending', 'Active', 'Expired', 'Revoked']),
    active: z.boolean(),
    issued_ms: NexusCount.nullable(),
    activation_epoch: NexusCount.nullable(),
    expiry_epoch: NexusCount.nullable(),
    activated_epoch: NexusCount.nullable(),
    expired_epoch: NexusCount.nullable(),
    revoked_epoch: NexusCount.nullable(),
    revoked_reason: z.string().nullable(),
    entries: NexusCount,
  })
  .strict();
export type NexusDataspaceManifestSummary = z.infer<typeof NexusDataspaceManifestSummary>;

export const NexusDataspaceConsensusCommitment = z
  .object({
    block_height: NexusCount,
    lane_id: NexusCount,
    dataspace_id: NexusCount,
    tx_count: NexusCount,
    total_chunks: NexusCount,
    rbc_bytes_total: NexusCount,
    teu_total: NexusCount,
    block_hash: z.string().min(1),
  })
  .strict();
export type NexusDataspaceConsensusCommitment = z.infer<typeof NexusDataspaceConsensusCommitment>;

export const NexusDataspaceConsensusSummary = z
  .object({
    entries: NexusCount,
    lane_ids: NexusCount.array(),
    tx_count: NexusCount,
    total_chunks: NexusCount,
    rbc_bytes_total: NexusCount,
    teu_total: NexusCount,
    last_block_height: NexusCount.nullable(),
    last_block_hash: z.string().min(1).nullable(),
    details: NexusDataspaceConsensusCommitment.array(),
  })
  .strict();
export type NexusDataspaceConsensusSummary = z.infer<typeof NexusDataspaceConsensusSummary>;

export const NexusDataspacePortfolioSummary = z
  .object({
    accounts: NexusCount,
    positions: NexusCount,
    asset_definitions: NexusCount,
  })
  .strict();
export type NexusDataspacePortfolioSummary = z.infer<typeof NexusDataspacePortfolioSummary>;

export const NexusDataspaceAccountSummaryRow = z
  .object({
    dataspace_id: NexusCount,
    dataspace_alias: z.string().min(1).nullable(),
    accounts: CanonicalAccountId.array(),
    portfolio: NexusDataspacePortfolioSummary,
    manifest: NexusDataspaceManifestSummary,
    consensus: NexusDataspaceConsensusSummary,
  })
  .strict();
export type NexusDataspaceAccountSummaryRow = z.infer<typeof NexusDataspaceAccountSummaryRow>;

export const NexusDataspacesAccountTotals = z
  .object({
    dataspaces: NexusCount,
    accounts_bound: NexusCount,
    portfolio_accounts: NexusCount,
    portfolio_positions: NexusCount,
    manifests_total: NexusCount,
    manifests_active: NexusCount,
    consensus_entries: NexusCount,
    consensus_tx_count: NexusCount,
    consensus_chunks_total: NexusCount,
    consensus_rbc_bytes_total: NexusCount,
    consensus_teu_total: NexusCount,
  })
  .strict();
export type NexusDataspacesAccountTotals = z.infer<typeof NexusDataspacesAccountTotals>;

export const NexusDataspacesAccountSummary = z
  .object({
    account: CanonicalAccountId,
    account_id: CanonicalAccountId,
    uaid: z
      .string()
      .regex(/^uaid:[0-9a-f]{64}$/u)
      .nullable(),
    totals: NexusDataspacesAccountTotals,
    dataspaces: NexusDataspaceAccountSummaryRow.array(),
  })
  .strict();
export type NexusDataspacesAccountSummary = z.infer<typeof NexusDataspacesAccountSummary>;

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
