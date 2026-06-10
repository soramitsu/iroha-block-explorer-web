import { z } from 'zod/v4';
import BigNumber from 'bignumber.js';
import { normalizeAccountIdLiteral, normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import {
  normalizeAssetDefinitionAliasLiteral,
  normalizeAssetDefinitionIdLiteral,
  normalizeAssetDefinitionSelectorLiteral,
  normalizeAssetIdLiteral,
} from '@/shared/lib/asset-definition-literal';

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

const Metadata = z.record(z.string(), z.any());
const BigIntCoerce = z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigInt(value));
const BigNumberValue = z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigNumber(value.toString()));
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

function normalizeNftIdLiteral(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [name, domain] = trimmed.split('$');
  if (!name || !domain) return null;
  if (trimmed.indexOf('$') !== trimmed.lastIndexOf('$')) return null;
  if (/\s|[@#$]/u.test(name) || /\s|[@#$]/u.test(domain)) return null;
  return trimmed;
}

export const AccountIdSchema = normalizedStringSchema(
  normalizeAccountIdLiteral,
  'Account ID must use a canonical halfwidth i105 literal'
);
export const AccountSelectorSchema = normalizedStringSchema(
  normalizeAccountSelectorLiteral,
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
  'Asset ID must use `<base58-asset-id>#<canonical-halfwidth-i105-account-id>`'
);
export const NftIdSchema = normalizedStringSchema(normalizeNftIdLiteral, 'NFT ID must use `name$domain`');
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

export const RwaIdSchema = z.string().transform((value) => value.trim());

export interface AccountSearchParams extends PaginationParams {
  domain?: string;
  with_asset?: AssetDefinitionSelector;
}

export const Account = z
  .object({
    id: AccountIdSchema,
    compressed_address: z.string().nullish(),
    network_prefix: z.number().optional(),
    metadata: Metadata,
    owned_assets: z.number(),
    owned_nfts: z.number(),
    owned_domains: z.number(),
  })
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
      network_prefix: value.network_prefix ?? 0,
    };
  });

export type Account = z.infer<typeof Account>;

export interface AssetSearchParams extends PaginationParams {
  owned_by?: string;
  definition?: AssetDefinitionSelector;
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
    value: BigNumberValue.optional(),
    quantity: BigNumberValue.optional(),
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

export interface AssetDefinitionSearchParams extends PaginationParams {
  domain?: string;
  owned_by?: string;
}

export const AssetDefinitionAliasBindingStatus = z.enum([
  'permanent',
  'leased_active',
  'leased_grace',
  'expired_pending_cleanup',
]);
export type AssetDefinitionAliasBindingStatus = z.infer<typeof AssetDefinitionAliasBindingStatus>;

export const AssetDefinitionAliasBinding = z.object({
  alias: AssetDefinitionAliasSchema,
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
});
export type AssetDefinitionAliasBinding = z.infer<typeof AssetDefinitionAliasBinding>;

export const AssetDefinition = z.object({
  id: AssetDefinitionIdSchema,
  name: NullableString.optional().default(null),
  description: NullableString.optional().default(null),
  alias: NullableAssetDefinitionAlias.optional().default(null),
  alias_binding: AssetDefinitionAliasBinding.nullish().transform((value) => value ?? null),
  logo: z.string().nullish().transform((value) => value ?? null),
  assets: z
    .number()
    .nullish()
    .transform((value) => value ?? 0),
  // Some Torii deployments omit supply fields on asset-definition listings. Treat them as optional
  // so the UI remains functional and can fall back to `/asset-definitions/:id/snapshot` where available.
  total_quantity: z
    .union([z.string(), z.number(), z.bigint()])
    .nullish()
    .transform((value) => (value === null || value === undefined ? null : BigNumber(value.toString()))),
  locked_quantity: z
    .union([z.string(), z.number(), z.bigint()])
    .nullable()
    .optional()
    .transform((value) => (value === null || value === undefined ? null : BigNumber(value.toString()))),
  circulating_quantity: z
    .union([z.string(), z.number(), z.bigint()])
    .nullable()
    .optional()
    .transform((value) => (value === null || value === undefined ? null : BigNumber(value.toString()))),
  metadata: Metadata.nullish().transform((value) => value ?? {}),
  mintable: z.union([z.enum(['Infinitely', 'Once', 'Not']), z.string().regex(/^Limited\(.+\)$/)]),
  owned_by: AccountIdSchema,
});

export type AssetDefinition = z.infer<typeof AssetDefinition>;

export const AssetDefinitionEconometricsVelocityWindow = z.object({
  key: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  transfers: z.number(),
  unique_senders: z.number(),
  unique_receivers: z.number(),
  amount: z.string().transform((value) => BigNumber(value)),
});

export type AssetDefinitionEconometricsVelocityWindow = z.infer<typeof AssetDefinitionEconometricsVelocityWindow>;

export const AssetDefinitionEconometricsIssuanceWindow = z.object({
  key: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  mint_count: z.number(),
  burn_count: z.number(),
  minted: z.string().transform((value) => BigNumber(value)),
  burned: z.string().transform((value) => BigNumber(value)),
  net: z.string().transform((value) => BigNumber(value)),
});

export type AssetDefinitionEconometricsIssuanceWindow = z.infer<typeof AssetDefinitionEconometricsIssuanceWindow>;

export const AssetDefinitionEconometricsIssuanceSeriesPoint = z.object({
  bucket_start_ms: z.number(),
  minted: z.string().transform((value) => BigNumber(value)),
  burned: z.string().transform((value) => BigNumber(value)),
  net: z.string().transform((value) => BigNumber(value)),
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
  median: z
    .string()
    .nullable()
    .transform((value) => (typeof value === 'string' ? BigNumber(value) : null)),
  p90: z
    .string()
    .nullable()
    .transform((value) => (typeof value === 'string' ? BigNumber(value) : null)),
  p99: z
    .string()
    .nullable()
    .transform((value) => (typeof value === 'string' ? BigNumber(value) : null)),
  lorenz: AssetDefinitionSnapshotLorenzPoint.array(),
});

export type AssetDefinitionSnapshotDistribution = z.infer<typeof AssetDefinitionSnapshotDistribution>;

export const AssetDefinitionSnapshotTopHolder = z.object({
  account_id: AccountIdSchema,
  balance: z.string().transform((value) => BigNumber(value)),
});

export type AssetDefinitionSnapshotTopHolder = z.infer<typeof AssetDefinitionSnapshotTopHolder>;

export const AssetDefinitionSnapshot = z.object({
  definition_id: AssetDefinitionIdSchema,
  computed_at_ms: z.number(),
  holders_total: z.number(),
  total_supply: z.string().transform((value) => BigNumber(value)),
  top_holders: AssetDefinitionSnapshotTopHolder.array(),
  distribution: AssetDefinitionSnapshotDistribution,
});

export type AssetDefinitionSnapshot = z.infer<typeof AssetDefinitionSnapshot>;

export const NFT = z.object({
  id: NftIdSchema,
  owned_by: AccountIdSchema,
  metadata: Metadata,
});

export type NFT = z.infer<typeof NFT>;

export type NFTsSearchParams = AssetDefinitionSearchParams;

export interface RWASearchParams extends PaginationParams {
  domain?: string;
  owned_by?: string;
}

export const RwaParent = z.object({
  rwa: RwaIdSchema,
  quantity: z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigNumber(value.toString())),
});

export type RwaParent = z.infer<typeof RwaParent>;

export const RWA = z.object({
  id: RwaIdSchema,
  owned_by: AccountIdSchema,
  quantity: z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigNumber(value.toString())),
  held_quantity: z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigNumber(value.toString())),
  primary_reference: z.string(),
  status: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  is_frozen: z.boolean(),
  metadata: Metadata.nullish().transform((value) => value ?? {}),
  parents: RwaParent.array()
    .nullish()
    .transform((value) => value ?? []),
});

export type RWA = z.infer<typeof RWA>;

export interface DomainSearchParams extends PaginationParams {
  owned_by?: string;
}

export const Domain = z.object({
  id: z.string(),
  logo: z.string().nullable(),
  metadata: Metadata,
  owned_by: AccountIdSchema,
  accounts: z.number(),
  assets: z.number(),
  nfts: z.number(),
});

export type Domain = z.infer<typeof Domain>;

export interface TransactionSearchParams extends Partial<PaginationParams> {
  authority?: string;
  block?: number;
  status?: TransactionStatus;
  asset_id?: AssetId;
}

export const Transaction = z.object({
  authority: AccountIdSchema,
  hash: z.string(),
  block: z.number(),
  created_at: z.coerce.date(),
  executable: z.enum(['Instructions', 'Wasm', 'Ivm', 'IvmProved', 'ContractCall']),
  status: TransactionStatus,
});

export const ExplorerHealth = z.object({
  head_height: z.number(),
  head_created_at: z.coerce.date().nullable(),
  sampled_at: z.coerce.date(),
});

export const LatestTransactionsResponse = z.object({
  sampled_at: z.coerce.date(),
  items: Transaction.array(),
});

const RejectionReason = z
  .object({
    encoded: z.string().optional().default(''),
    json: z.union([Metadata, z.string()]),
    message: z.string().optional().default(''),
  })
  .strict();

export const DetailedTransaction = Transaction.extend({
  rejection_reason: RejectionReason.nullable(),
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
  connected_peers: z.string().array().nullish().transform((value) => value ?? null),
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

const SumeragiQcSnapshot = z.object({
  height: z.number(),
  view: z.number(),
  subject_block_hash: z.string().nullable(),
});

const SumeragiTxQueueSnapshot = z.object({
  depth: z.number(),
  capacity: z.number(),
  saturated: z.boolean(),
});

const SettlementCounts = z.record(z.string(), z.number());

const SettlementPlan = z.object({
  order: z.string(),
  atomicity: z.string(),
});

const SettlementLastEventBase = z.object({
  observed_at_ms: z.number(),
  settlement_id: z.string().nullable(),
  plan: SettlementPlan,
  outcome: z.string(),
  failure_reason: z.string().nullable(),
  final_state: z.string(),
});

const DvpSettlementLastEvent = SettlementLastEventBase.extend({
  legs: z.object({
    delivery_committed: z.boolean(),
    payment_committed: z.boolean(),
  }),
});

const PvpSettlementLastEvent = SettlementLastEventBase.extend({
  legs: z.object({
    primary_committed: z.boolean(),
    counter_committed: z.boolean(),
  }),
  fx_window_ms: z.number().nullable(),
});

const DvpSettlementSnapshot = z.object({
  success_total: z.number(),
  failure_total: z.number(),
  final_state_totals: SettlementCounts,
  failure_reasons: SettlementCounts,
  last_event: DvpSettlementLastEvent.nullable(),
});

const PvpSettlementSnapshot = z.object({
  success_total: z.number(),
  failure_total: z.number(),
  final_state_totals: SettlementCounts,
  failure_reasons: SettlementCounts,
  last_event: PvpSettlementLastEvent.nullable(),
});

const SettlementSnapshot = z.object({
  dvp: DvpSettlementSnapshot,
  pvp: PvpSettlementSnapshot,
});

const SumeragiRbcEviction = z.object({
  block_hash: z.string(),
  height: z.number(),
  view: z.number(),
});

const SumeragiRbcStoreSnapshot = z.object({
  sessions: z.number(),
  bytes: z.number(),
  pressure_level: z.number(),
  backpressure_deferrals_total: z.number(),
  evictions_total: z.number(),
  recent_evictions: SumeragiRbcEviction.array(),
});

const SumeragiLaneRuntimeUpgrade = z.object({
  allow: z.boolean(),
  require_metadata: z.boolean(),
  metadata_key: z.string().nullable(),
  allowed_ids: z.string().array(),
});

const SumeragiLanePrivacyMerkle = z.object({
  root: z.string(),
  max_depth: z.number(),
});

const SumeragiLanePrivacySnark = z.object({
  circuit_id: z.number(),
  verifying_key_digest: z.string(),
  statement_hash: z.string(),
  proof_hash: z.string(),
});

const SumeragiLanePrivacyCommitment = z.object({
  id: z.number(),
  scheme: z.enum(['merkle', 'snark']),
  merkle: SumeragiLanePrivacyMerkle.nullable(),
  snark: SumeragiLanePrivacySnark.nullable(),
});

const SumeragiLaneGovernanceEntry = z.object({
  lane_id: z.number(),
  alias: z.string(),
  governance: z.string().nullable(),
  manifest_required: z.boolean(),
  manifest_ready: z.boolean(),
  manifest_path: z.string().nullable(),
  validator_ids: z.string().array(),
  quorum: z.number().nullable(),
  protected_namespaces: z.string().array(),
  runtime_upgrade: SumeragiLaneRuntimeUpgrade.nullable(),
  privacy_commitments: SumeragiLanePrivacyCommitment.array().default([]),
});

const SumeragiNexusFeeSnapshot = z.object({
  charged_total: z.number().default(0),
  charged_via_payer_total: z.number().default(0),
  charged_via_sponsor_total: z.number().default(0),
  sponsor_disabled_total: z.number().default(0),
  sponsor_cap_exceeded_total: z.number().default(0),
  config_errors_total: z.number().default(0),
  transfer_failures_total: z.number().default(0),
  last_amount: z.string().nullable(),
  last_asset_id: z.string().nullable(),
  last_payer: z.enum(['payer', 'sponsor']).nullable(),
  last_payer_id: z.string().nullable(),
  last_error: z.string().nullable(),
});

const SumeragiNexusStakingLane = z.object({
  lane_id: z.number(),
  bonded: z.string(),
  pending_unbond: z.string(),
  slash_total: z.number().default(0),
});

const SumeragiNexusStakingSnapshot = z.object({
  lanes: SumeragiNexusStakingLane.array().default([]),
});

const SumeragiNposElectionParams = z.object({
  max_validators: z.number(),
  min_self_bond: z.number(),
  min_nomination_bond: z.number(),
  max_nominator_concentration_pct: z.number(),
  seat_band_pct: z.number(),
  max_entity_correlation_pct: z.number(),
  finality_margin_blocks: z.number(),
});

const SumeragiNposTieBreak = z.object({
  peer_id: z.string(),
  score: z.string(),
});

const SumeragiNposElectionSnapshot = z.object({
  epoch: z.number(),
  snapshot_height: z.number(),
  seed: z.string(),
  candidates_total: z.number(),
  validator_set_hash: z.string(),
  validator_set: z.string().array(),
  params: SumeragiNposElectionParams,
  rejection_reason: z.string().nullable(),
  tie_break: SumeragiNposTieBreak.array(),
});

const defaultNexusFeeSnapshot: z.infer<typeof SumeragiNexusFeeSnapshot> = {
  charged_total: 0,
  charged_via_payer_total: 0,
  charged_via_sponsor_total: 0,
  sponsor_disabled_total: 0,
  sponsor_cap_exceeded_total: 0,
  config_errors_total: 0,
  transfer_failures_total: 0,
  last_amount: null,
  last_asset_id: null,
  last_payer: null,
  last_payer_id: null,
  last_error: null,
};

const defaultNexusStakingSnapshot: z.infer<typeof SumeragiNexusStakingSnapshot> = {
  lanes: [],
};

const SumeragiStatusSchema = z
  .object({
    leader_index: z.number(),
    view_change_index: z.number(),
    highest_qc: SumeragiQcSnapshot,
    locked_qc: SumeragiQcSnapshot,
    tx_queue: SumeragiTxQueueSnapshot,
    epoch: z
      .object({
        length_blocks: z.number(),
        commit_deadline_offset: z.number(),
        reveal_deadline_offset: z.number(),
      })
      .passthrough(),
    membership: z.object({
      height: z.number(),
      view: z.number(),
      epoch: z.number(),
      view_hash: z.string().nullable(),
    }),
    prf: z.object({
      height: z.number(),
      view: z.number(),
      epoch_seed: z.string().nullable(),
    }),
    gossip_fallback_total: z.number(),
    bg_post_inline_post_total: z.number().default(0),
    bg_post_inline_broadcast_total: z.number().default(0),
    block_created_dropped_by_lock_total: z.number(),
    block_created_hint_mismatch_total: z.number(),
    block_created_proposal_mismatch_total: z.number(),
    settlement: SettlementSnapshot,
    pacemaker_backpressure_deferrals_total: z.number(),
    rbc_retry_attempts_total: z.number().default(0),
    rbc_retry_abort_total: z.number().default(0),
    da_reschedule_total: z.number(),
    rbc_store: SumeragiRbcStoreSnapshot,
    view_change_proof_accepted_total: z.number(),
    view_change_proof_stale_total: z.number(),
    view_change_proof_rejected_total: z.number(),
    view_change_suggest_total: z.number(),
    view_change_install_total: z.number(),
    collectors_targeted_current: z.number().nullable().optional(),
    collectors_targeted_last_per_block: z.number().nullable().optional(),
    redundant_sends_total: z.number().optional(),
    vrf_penalty_epoch: z.number(),
    vrf_committed_no_reveal_total: z.number(),
    vrf_no_participation_total: z.number(),
    vrf_late_reveals_total: z.number(),
    consensus_penalties_applied_total: z.number().default(0),
    consensus_penalties_pending: z.number().default(0),
    vrf_penalties_applied_total: z.number().default(0),
    vrf_penalties_pending: z.number().default(0),
    lane_governance_sealed_total: z.number().default(0),
    lane_governance_sealed_aliases: z.string().array().default([]),
    lane_governance: SumeragiLaneGovernanceEntry.array().default([]),
    nexus_fee: SumeragiNexusFeeSnapshot.default(defaultNexusFeeSnapshot),
    nexus_staking: SumeragiNexusStakingSnapshot.default(defaultNexusStakingSnapshot),
    npos_election: SumeragiNposElectionSnapshot.nullable(),
  })
  .passthrough();

export const SumeragiStatus = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;

  const payload = { ...(input as Record<string, unknown>) };
  if (payload.bg_post_inline_post_total === undefined && payload.bg_post_drop_post_total !== undefined) {
    payload.bg_post_inline_post_total = payload.bg_post_drop_post_total;
  }
  if (payload.bg_post_inline_broadcast_total === undefined && payload.bg_post_drop_broadcast_total !== undefined) {
    payload.bg_post_inline_broadcast_total = payload.bg_post_drop_broadcast_total;
  }

  return payload;
}, SumeragiStatusSchema);
export type SumeragiStatus = z.infer<typeof SumeragiStatus>;

const SumeragiAvailabilityCollector = z.object({
  collector_idx: z.number(),
  peer_id: z.string(),
  votes_ingested: z.number(),
});

const SumeragiQcLatency = z.object({
  kind: z.string(),
  last_ms: z.number(),
});

const SumeragiVrfSummary = z.object({
  found: z.boolean(),
  epoch: z.number(),
  finalized: z.boolean(),
  seed_hex: z.string().nullable(),
  epoch_length: z.number(),
  commit_deadline_offset: z.number(),
  reveal_deadline_offset: z.number(),
  roster_len: z.number(),
  updated_at_height: z.number(),
  participants_total: z.number(),
  commitments_total: z.number(),
  reveals_total: z.number(),
  late_reveals_total: z.number(),
  committed_no_reveal: z.number().array(),
  no_participation: z.number().array(),
  late_reveals: z
    .object({
      signer: z.number(),
      noted_at_height: z.number(),
    })
    .array(),
});

export const SumeragiTelemetry = z.object({
  availability: z.object({
    total_votes_ingested: z.number(),
    collectors: SumeragiAvailabilityCollector.array(),
  }),
  qc_latency_ms: SumeragiQcLatency.array(),
  rbc_backlog: z.object({
    pending_sessions: z.number(),
    total_missing_chunks: z.number(),
    max_missing_chunks: z.number(),
  }),
  vrf: SumeragiVrfSummary,
});
export type SumeragiTelemetry = z.infer<typeof SumeragiTelemetry>;

export interface InstructionsSearchParams extends PaginationParams {
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

const InstructionBoxStructured = z
  .object({
    kind: InstructionKind,
    payload: z.unknown(),
    wire_id: z.string().optional(),
    encoded: z.string().optional(),
  })
  .strict();

const InstructionBox = z
  .object({
    encoded: z.string().optional().default(''),
    json: InstructionBoxStructured,
  })
  .strict();
export type InstructionBox = z.infer<typeof InstructionBox>;
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

export const Instruction = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const payload = { ...(input as Record<string, unknown>) };

  // Torii may expose the Rust raw identifier form `r#box`.
  // Keep parser forward-compatible by aliasing it to canonical `box`.
  if (payload.box === undefined && payload['r#box'] !== undefined) {
    payload.box = payload['r#box'];
  }

  return payload;
}, InstructionRaw);
export type Instruction = z.infer<typeof Instruction>;

export const LatestInstructionsResponse = z.object({
  sampled_at: z.coerce.date(),
  items: Instruction.array(),
});
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

export const SubmitVerifiedContractSource = z.object({
  language: z.string(),
  source_name: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  source_text: z.string(),
});
export type SubmitVerifiedContractSource = z.infer<typeof SubmitVerifiedContractSource>;

export const ContractVerifiedSourceJobResponse = z.object({
  job_id: z.string(),
  code_hash: z.string(),
  status: z.string(),
  submitted_at: z.string(),
  completed_at: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  message: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  actual_code_hash: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  verified_source_ref: ContractVerifiedSourceRef.nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type ContractVerifiedSourceJobResponse = z.infer<typeof ContractVerifiedSourceJobResponse>;

export const SubmitContractDeployRequest = z.object({
  authority: z.string().trim().min(1),
  private_key: z.string().trim().min(1),
  code_b64: z.string().trim().min(1),
  dataspace: z.string().trim().min(1).optional(),
});
export type SubmitContractDeployRequest = z.infer<typeof SubmitContractDeployRequest>;

export const ContractDeployResponse = z.object({
  ok: z.boolean(),
  contract_address: z.string(),
  dataspace: z.string(),
  deploy_nonce: z.coerce.number(),
  tx_hash_hex: z.string(),
  code_hash_hex: z.string(),
  abi_hash_hex: z.string(),
});
export type ContractDeployResponse = z.infer<typeof ContractDeployResponse>;

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

export const NexusStatusDataspaceBacklog = z.object({
  lane_id: z.number(),
  dataspace_id: z.number(),
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
  })
  .passthrough();
export type NexusPublicStatus = z.infer<typeof NexusPublicStatus>;

export const SorafsAttestation = z.object({
  block_height: z.number(),
  block_hash_hex: z.string().nullable(),
  chain_id: z.string(),
});
export type SorafsAttestation = z.infer<typeof SorafsAttestation>;

export const SorafsManifestState = z.enum(['pending', 'approved', 'retired']);
export type SorafsManifestState = z.infer<typeof SorafsManifestState>;

export const SorafsManifestStatus = z.object({
  state: SorafsManifestState,
  epoch: z.number().nullable().optional(),
});
export type SorafsManifestStatus = z.infer<typeof SorafsManifestStatus>;

const SorafsLineageSuccessor = z.object({
  digest_hex: z.string(),
  status: SorafsManifestStatus,
  approved_epoch: z.number().nullable(),
  approved_at: z.string().nullable(),
  status_timestamp_unix: z.number().nullable(),
});

const SorafsLineage = z.object({
  successor_of_hex: z.string().nullable(),
  head_hex: z.string(),
  depth_to_head: z.number().nullable(),
  is_head: z.boolean(),
  superseded_by: SorafsLineageSuccessor.nullable(),
  immediate_successor: SorafsLineageSuccessor.nullable(),
  anomalies: z.string().array(),
});

const SorafsChunkerHandle = z.object({
  profile_id: z.number(),
  namespace: z.string(),
  name: z.string(),
  semver: z.string(),
  multihash_code: z.number(),
});

const SorafsAliasBinding = z.object({
  namespace: z.string(),
  name: z.string(),
  proof_b64: z.string(),
});

const SorafsGovernanceRef = z.object({
  cid: z.string().nullable(),
  kind: z.string(),
  effective_at: z.string().nullable(),
  effective_at_unix: z.number().nullable(),
  targets: z
    .object({
      alias: z.string().optional(),
      pin_digest_hex: z.string().optional(),
    })
    .optional(),
  signers: z.string().array(),
});

export const SorafsManifest = z.object({
  digest_hex: z.string(),
  chunker: SorafsChunkerHandle,
  chunk_digest_sha3_256_hex: z.string(),
  pin_policy: Metadata,
  submitted_by: z.string(),
  submitted_epoch: z.number(),
  status: SorafsManifestStatus,
  metadata: Metadata,
  alias: SorafsAliasBinding.nullable(),
  successor_of_hex: z.string().nullable(),
  status_timestamp_unix: z.number().nullable(),
  governance_refs: SorafsGovernanceRef.array(),
  council_envelope_digest_hex: z.string().nullable(),
  lineage: SorafsLineage.optional(),
});
export type SorafsManifest = z.infer<typeof SorafsManifest>;

export const SorafsAliasRecord = z.object({
  alias: z.string(),
  namespace: z.string(),
  name: z.string(),
  manifest_digest_hex: z.string(),
  bound_by: z.string(),
  bound_epoch: z.number(),
  expiry_epoch: z.number(),
  proof_b64: z.string(),
});
export type SorafsAliasRecord = z.infer<typeof SorafsAliasRecord>;

export const SorafsReplicationStatus = z.object({
  state: z.enum(['pending', 'completed', 'expired']),
  epoch: z.number().nullable().optional(),
});
export type SorafsReplicationStatus = z.infer<typeof SorafsReplicationStatus>;

const SorafsReplicationReceipt = z.object({
  provider_hex: z.string(),
  status: z.string(),
  timestamp: z.number(),
  por_sample_digest_hex: z.string().nullable(),
});

export const SorafsReplicationOrder = z.object({
  order_id_hex: z.string(),
  manifest_digest_hex: z.string(),
  issued_by: z.string(),
  issued_epoch: z.number(),
  deadline_epoch: z.number(),
  status: SorafsReplicationStatus,
  canonical_order_b64: z.string(),
  order: z.record(z.string(), z.any()),
  receipts: SorafsReplicationReceipt.array(),
  providers: z.string().array(),
});
export type SorafsReplicationOrder = z.infer<typeof SorafsReplicationOrder>;

export const SorafsPinRegistryResponse = z.object({
  attestation: SorafsAttestation,
  total_count: z.number(),
  returned_count: z.number(),
  offset: z.number(),
  limit: z.number(),
  manifests: SorafsManifest.array(),
});
export type SorafsPinRegistryResponse = z.infer<typeof SorafsPinRegistryResponse>;

export const SorafsAliasResponse = z.object({
  attestation: SorafsAttestation,
  total_count: z.number(),
  returned_count: z.number(),
  offset: z.number(),
  limit: z.number(),
  aliases: SorafsAliasRecord.array(),
});
export type SorafsAliasResponse = z.infer<typeof SorafsAliasResponse>;

export const SorafsReplicationResponse = z.object({
  attestation: SorafsAttestation,
  total_count: z.number(),
  returned_count: z.number(),
  offset: z.number(),
  limit: z.number(),
  replication_orders: SorafsReplicationOrder.array(),
});
export type SorafsReplicationResponse = z.infer<typeof SorafsReplicationResponse>;

export const SorafsStorageManifestFile = z.object({
  path: z.string().array(),
  offset: z.number(),
  size: z.number(),
  first_chunk: z.number(),
  chunk_count: z.number(),
});
export type SorafsStorageManifestFile = z.infer<typeof SorafsStorageManifestFile>;

export const SorafsStorageManifestResponse = z.object({
  manifest_id_hex: z.string(),
  manifest_b64: z.string(),
  manifest_digest_hex: z.string(),
  payload_digest_hex: z.string(),
  content_length: z.number(),
  chunk_count: z.number(),
  chunk_profile_handle: z.string(),
  stored_at_unix_secs: z.number(),
  files: SorafsStorageManifestFile.array(),
});
export type SorafsStorageManifestResponse = z.infer<typeof SorafsStorageManifestResponse>;

export const SorafsCidLookupModerationStatus = z.enum([
  'clear',
  'local_blocked',
  'global_blocked',
  'mixed_blocked',
]);
export type SorafsCidLookupModerationStatus = z.infer<typeof SorafsCidLookupModerationStatus>;

export const SorafsCidLookupModerationScope = z.enum(['local', 'global']);
export type SorafsCidLookupModerationScope = z.infer<typeof SorafsCidLookupModerationScope>;

export const SorafsCidLookupModerationMatchKind = z.enum(['cid', 'manifest_digest']);
export type SorafsCidLookupModerationMatchKind = z.infer<typeof SorafsCidLookupModerationMatchKind>;

export const SorafsCidLookupModerationPolicyTier = z.enum(['standard', 'emergency', 'permanent']);
export type SorafsCidLookupModerationPolicyTier = z.infer<typeof SorafsCidLookupModerationPolicyTier>;

export const SorafsCidLookupModerationMatch = z.object({
  scope: SorafsCidLookupModerationScope,
  match_kind: SorafsCidLookupModerationMatchKind,
  pack_id: NullableString,
  policy_tier: SorafsCidLookupModerationPolicyTier,
  reason: NullableString,
  jurisdiction: NullableString,
  issued_at: NullableString,
  expires_at: NullableString,
  review_due_at: NullableString,
  issued_by_proposal_id: NullableString,
  review_reference: NullableString,
  governance_reference: NullableString,
  pack_manifest_cid: NullableString,
  merkle_root: NullableString,
});
export type SorafsCidLookupModerationMatch = z.infer<typeof SorafsCidLookupModerationMatch>;

export const SorafsCidLookupModeration = z.object({
  status: SorafsCidLookupModerationStatus,
  public_links_enabled: z.boolean(),
  matches: SorafsCidLookupModerationMatch.array(),
});
export type SorafsCidLookupModeration = z.infer<typeof SorafsCidLookupModeration>;

export const SorafsCidLookupResponse = z.object({
  content_cid: z.string(),
  manifest_digest_hex: z.string(),
  manifest_id_hex: z.string(),
  index_document: NullableString,
  files: SorafsStorageManifestFile.array(),
  moderation: SorafsCidLookupModeration.nullish().transform((value) => value ?? null),
});
export type SorafsCidLookupResponse = z.infer<typeof SorafsCidLookupResponse>;

export const ConnectPerIpSessionsEntry = z.object({
  ip: z.string(),
  sessions: z.number(),
});
export type ConnectPerIpSessionsEntry = z.infer<typeof ConnectPerIpSessionsEntry>;

export const ConnectStatusPolicy = z.object({
  ws_max_sessions: z.number(),
  ws_per_ip_max_sessions: z.number(),
  ws_rate_per_ip_per_min: z.number(),
  session_ttl_ms: z.number(),
  frame_max_bytes: z.number(),
  session_buffer_max_bytes: z.number(),
  relay_enabled: z.boolean(),
  relay_strategy: z.string(),
  relay_effective_strategy: z.string(),
  relay_p2p_attached: z.boolean(),
  heartbeat_interval_ms: z.number(),
  heartbeat_miss_tolerance: z.number(),
  heartbeat_min_interval_ms: z.number(),
});
export type ConnectStatusPolicy = z.infer<typeof ConnectStatusPolicy>;

export const ConnectStatusResponse = z.object({
  enabled: z.boolean(),
  sessions_total: z.number(),
  sessions_active: z.number(),
  per_ip_sessions: ConnectPerIpSessionsEntry.array(),
  buffered_sessions: z.number(),
  total_buffer_bytes: z.number(),
  dedupe_size: z.number(),
  policy: ConnectStatusPolicy,
  frames_in_total: z.number(),
  frames_out_total: z.number(),
  ciphertext_total: z.number(),
  dedupe_drops_total: z.number(),
  buffer_drops_total: z.number(),
  plaintext_control_drops_total: z.number(),
  monotonic_drops_total: z.number(),
  sequence_violation_closes_total: z.number(),
  role_direction_mismatch_total: z.number(),
  ping_miss_total: z.number(),
  p2p_rebroadcasts_total: z.number(),
  p2p_rebroadcast_skipped_total: z.number(),
});
export type ConnectStatusResponse = z.infer<typeof ConnectStatusResponse>;

export const ConnectSessionResponse = z.object({
  sid: z.string(),
  wallet_uri: z.string(),
  app_uri: z.string(),
  token_app: z.string(),
  token_wallet: z.string(),
  token_relay: z.string(),
  token_management: z.string().optional(),
});
export type ConnectSessionResponse = z.infer<typeof ConnectSessionResponse>;

function normalizeHashLike32(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must not be empty`);

  const hashLiteralMatch = /^hash:([0-9a-fA-F]{64})#[0-9a-fA-F]{4}$/u.exec(trimmed);
  if (hashLiteralMatch?.[1]) return hashLiteralMatch[1].toLowerCase();

  const hexValue = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/u.test(hexValue)) return hexValue.toLowerCase();

  throw new Error(`${name} must be a 32-byte hex string or canonical hash literal`);
}

const HashLike32String = z.string().transform((value, ctx) => {
  try {
    return normalizeHashLike32(value, 'hash');
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'invalid hash',
    });
    return z.NEVER;
  }
});

const JsonRecord = z.record(z.string(), z.unknown());
const JsonArray = z.array(z.unknown());

export const MinistryAgendaProposalDraftRequest = z.object({
  proposal: JsonRecord,
  authority: AccountIdSchema,
});
export type MinistryAgendaProposalDraftRequest = z.infer<typeof MinistryAgendaProposalDraftRequest>;

export const MinistryAgendaProposalRecord = z.object({
  proposal: JsonRecord,
  authority: AccountIdSchema,
  submitted_tx_hash_hex: HashLike32String,
  submitted_height: z.number().int().nonnegative(),
});
export type MinistryAgendaProposalRecord = z.infer<typeof MinistryAgendaProposalRecord>;

export const MinistryAgendaProposalDraftResponse = z.object({
  ok: z.literal(true),
  agenda_proposal_id: z.string(),
  authority: AccountIdSchema,
  tx_instructions: JsonArray,
  signable_transaction_b64: z.string(),
});
export type MinistryAgendaProposalDraftResponse = z.infer<typeof MinistryAgendaProposalDraftResponse>;

export const MinistryAgendaProposalGetResponse = z.object({
  found: z.boolean(),
  record: MinistryAgendaProposalRecord.nullable(),
});
export type MinistryAgendaProposalGetResponse = z.infer<typeof MinistryAgendaProposalGetResponse>;

export const TransactionSubmissionReceiptResponse = z.object({
  payload: z.object({
    tx_hash: HashLike32String,
    submitted_at_ms: z.number().int().nonnegative(),
    submitted_at_height: z.number().int().nonnegative(),
    signer: z.string(),
  }),
  signature: z.string(),
});
export type TransactionSubmissionReceiptResponse = z.infer<typeof TransactionSubmissionReceiptResponse>;

export const PipelineTransactionStatusResponse = z.object({
  hash: HashLike32String,
  status: z.object({
    kind: z.string(),
    block_height: z.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
    rejection_reason: z.unknown().nullable().optional().transform((value) => value ?? null),
  }),
  scope: z.string(),
  resolved_from: z.string(),
});
export type PipelineTransactionStatusResponse = z.infer<typeof PipelineTransactionStatusResponse>;

const SoracloudNullableString = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);
const SoracloudJsonRecord = z.record(z.string(), z.unknown());
const SoracloudJsonRecordArray = SoracloudJsonRecord.array();

export interface SoracloudServiceConfigStatusQuery {
  service_name: string;
  config_name?: string;
}

export interface SoracloudServiceSecretStatusQuery {
  service_name: string;
  secret_name?: string;
}

export interface SoracloudTrainingJobStatusQuery {
  service_name: string;
  job_id: string;
}

export interface SoracloudModelWeightStatusQuery {
  service_name: string;
  model_name: string;
}

export interface SoracloudModelArtifactStatusQuery {
  service_name: string;
  model_name?: string;
  artifact_id?: string;
  training_job_id?: string;
  weight_version?: string;
}

export interface SoracloudUploadedModelStatusQuery {
  service_name: string;
  weight_version: string;
  model_id?: string;
  model_name?: string;
  bundle_root?: string;
  compile_profile_hash?: string;
}

export interface SoracloudPrivateInferenceStatusQuery {
  session_id: string;
}

export interface SoracloudHfSharedLeaseStatusQuery {
  repo_id: string;
  revision?: string;
  storage_class: string;
  lease_term_ms: number;
  account_id?: string;
}

export interface SoracloudModelHostStatusQuery {
  account_id?: string;
}

export interface SoracloudAgentStatusQuery {
  apartment_name?: string;
}

export interface SoracloudAgentMailboxStatusQuery {
  apartment_name: string;
}

export interface SoracloudAgentAutonomyStatusQuery {
  apartment_name: string;
}

export const SoracloudServiceHealth = z
  .object({
    mode: z.string(),
    status: z.string(),
    message: z.string(),
    observed_height: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    observed_block_hash: SoracloudNullableString,
    state_dir: SoracloudNullableString,
    service_revisions: z.number().optional().default(0),
    healthy_service_revisions: z.number().optional().default(0),
    hydrating_service_revisions: z.number().optional().default(0),
    degraded_service_revisions: z.number().optional().default(0),
    unavailable_service_revisions: z.number().optional().default(0),
    apartments: z.number().optional().default(0),
    running_apartments: z.number().optional().default(0),
    expired_apartments: z.number().optional().default(0),
  })
  .passthrough();
export type SoracloudServiceHealth = z.infer<typeof SoracloudServiceHealth>;

export const SoracloudRouting = z
  .object({
    nexus_enabled: z.boolean().optional().default(false),
    lane_count: z.number().optional().default(0),
    dataspace_count: z.number().optional().default(0),
    routing_rules: z.number().optional().default(0),
    default_lane_id: z.number().optional().default(0),
    default_dataspace_id: z.number().optional().default(0),
  })
  .passthrough();
export type SoracloudRouting = z.infer<typeof SoracloudRouting>;

export const SoracloudRuntimePressure = z
  .object({
    enabled: z.boolean().optional().default(false),
    state_dir: SoracloudNullableString,
    observed_height: z.number().optional().default(0),
    service_revisions: z.number().optional().default(0),
    apartments: z.number().optional().default(0),
    max_load_factor_bps: z.number().optional().default(0),
    reported_pending_mailbox_messages: z.number().optional().default(0),
    authoritative_pending_mailbox_messages: z.number().optional().default(0),
    bundle_cache_misses: z.number().optional().default(0),
    artifact_cache_misses: z.number().optional().default(0),
  })
  .passthrough();
export type SoracloudRuntimePressure = z.infer<typeof SoracloudRuntimePressure>;

export const SoracloudResourcePressure = z
  .object({
    queue_active: z.number().optional().default(0),
    queue_queued: z.number().optional().default(0),
    queue_capacity: z.number().optional().default(0),
    queue_saturated: z.boolean().optional().default(false),
    high_load_threshold: z.number().optional().default(0),
    high_load: z.boolean().optional().default(false),
    runtime: SoracloudRuntimePressure,
  })
  .passthrough();
export type SoracloudResourcePressure = z.infer<typeof SoracloudResourcePressure>;

export const SoracloudFailedAdmissions = z
  .object({
    available: z.boolean().optional().default(false),
    total: z.number().optional().default(0),
    governance_manifest_rejected: z.number().optional().default(0),
    sorafs_provider_rejected: z.number().optional().default(0),
  })
  .passthrough();
export type SoracloudFailedAdmissions = z.infer<typeof SoracloudFailedAdmissions>;

export const SoracloudControlPlaneServiceRevision = z
  .object({
    sequence: z.number(),
    action: z.unknown(),
    service_version: z.string(),
    replicas: z.number().optional().default(0),
    route_host: SoracloudNullableString,
    route_path_prefix: SoracloudNullableString,
    state_binding_count: z.number().optional().default(0),
    signed_by: SoracloudNullableString,
  })
  .passthrough();
export type SoracloudControlPlaneServiceRevision = z.infer<typeof SoracloudControlPlaneServiceRevision>;

export const SoracloudControlPlaneService = z
  .object({
    service_name: z.string(),
    current_version: z.string(),
    revision_count: z.number(),
    config_generation: z.number().optional().default(0),
    secret_generation: z.number().optional().default(0),
    config_entry_count: z.number().optional().default(0),
    secret_entry_count: z.number().optional().default(0),
    latest_revision: SoracloudControlPlaneServiceRevision.nullish().transform((value) => value ?? null),
    active_rollout: z
      .unknown()
      .nullish()
      .transform((value) => value ?? null),
    last_rollout: z
      .unknown()
      .nullish()
      .transform((value) => value ?? null),
  })
  .passthrough();
export type SoracloudControlPlaneService = z.infer<typeof SoracloudControlPlaneService>;

export const SoracloudControlPlaneAuditEvent = z
  .object({
    sequence: z.number(),
    action: z.unknown(),
    service_name: z.string(),
    from_version: SoracloudNullableString,
    to_version: z.string(),
    governance_tx_hash: SoracloudNullableString,
  })
  .passthrough();
export type SoracloudControlPlaneAuditEvent = z.infer<typeof SoracloudControlPlaneAuditEvent>;

export const SoracloudControlPlane = z
  .object({
    schema_version: z.number(),
    service_count: z.number(),
    audit_event_count: z.number(),
    services: SoracloudControlPlaneService.array().optional().default([]),
    recent_audit_events: SoracloudControlPlaneAuditEvent.array().optional().default([]),
  })
  .passthrough();
export type SoracloudControlPlane = z.infer<typeof SoracloudControlPlane>;

export const SoracloudRuntimeManager = z
  .object({
    available: z.boolean().optional().default(false),
    state_dir: SoracloudNullableString,
    snapshot: z.unknown().optional(),
  })
  .passthrough();
export type SoracloudRuntimeManager = z.infer<typeof SoracloudRuntimeManager>;

export const SoracloudStatus = z
  .object({
    schema_version: z.number(),
    service_health: SoracloudServiceHealth,
    routing: SoracloudRouting,
    resource_pressure: SoracloudResourcePressure,
    failed_admissions: SoracloudFailedAdmissions,
    runtime_manager: SoracloudRuntimeManager,
    control_plane: SoracloudControlPlane,
  })
  .passthrough();
export type SoracloudStatus = z.infer<typeof SoracloudStatus>;

export const SoracloudServiceConfigStatusEntry = z
  .object({
    config_name: z.string(),
    value_hash: z.string(),
    value_json: z.unknown(),
    last_update_sequence: z.number(),
  })
  .passthrough();
export type SoracloudServiceConfigStatusEntry = z.infer<typeof SoracloudServiceConfigStatusEntry>;

export const SoracloudServiceConfigStatusResponse = z
  .object({
    schema_version: z.number(),
    service_name: z.string(),
    current_version: z.string(),
    config_generation: z.number(),
    config_entry_count: z.number(),
    configs: SoracloudServiceConfigStatusEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudServiceConfigStatusResponse = z.infer<typeof SoracloudServiceConfigStatusResponse>;

export const SoracloudServiceSecretStatusEntry = z
  .object({
    secret_name: z.string(),
    encryption: z.unknown(),
    key_id: z.string(),
    key_version: z.number(),
    commitment: z.string(),
    ciphertext_bytes: z.number(),
    last_update_sequence: z.number(),
  })
  .passthrough();
export type SoracloudServiceSecretStatusEntry = z.infer<typeof SoracloudServiceSecretStatusEntry>;

export const SoracloudServiceSecretStatusResponse = z
  .object({
    schema_version: z.number(),
    service_name: z.string(),
    current_version: z.string(),
    secret_generation: z.number(),
    secret_entry_count: z.number(),
    secrets: SoracloudServiceSecretStatusEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudServiceSecretStatusResponse = z.infer<typeof SoracloudServiceSecretStatusResponse>;

export const SoracloudTrainingJobStatusEntry = z
  .object({
    service_name: z.string(),
    model_name: z.string(),
    job_id: z.string(),
    status: z.string(),
    worker_group_size: z.number(),
    target_steps: z.number(),
    completed_steps: z.number(),
    checkpoint_interval_steps: z.number(),
    last_checkpoint_step: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    checkpoint_count: z.number(),
    retry_count: z.number(),
    max_retries: z.number(),
    step_compute_units: z.number(),
    compute_budget_units: z.number(),
    compute_consumed_units: z.number(),
    compute_remaining_units: z.number(),
    storage_budget_bytes: z.number(),
    storage_consumed_bytes: z.number(),
    storage_remaining_bytes: z.number(),
    latest_metrics_hash: SoracloudNullableString,
    last_failure_reason: SoracloudNullableString,
    created_sequence: z.number(),
    updated_sequence: z.number(),
  })
  .passthrough();
export type SoracloudTrainingJobStatusEntry = z.infer<typeof SoracloudTrainingJobStatusEntry>;

export const SoracloudTrainingJobStatusResponse = z
  .object({
    schema_version: z.number(),
    job: SoracloudTrainingJobStatusEntry,
  })
  .passthrough();
export type SoracloudTrainingJobStatusResponse = z.infer<typeof SoracloudTrainingJobStatusResponse>;

export const SoracloudModelWeightVersionEntry = z
  .object({
    weight_version: z.string(),
    parent_version: SoracloudNullableString,
    training_job_id: z.string(),
    weight_artifact_hash: z.string(),
    dataset_ref: z.string(),
    training_config_hash: z.string(),
    reproducibility_hash: z.string(),
    provenance_attestation_hash: z.string(),
    registered_sequence: z.number(),
    promoted_sequence: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    gate_report_hash: SoracloudNullableString,
  })
  .passthrough();
export type SoracloudModelWeightVersionEntry = z.infer<typeof SoracloudModelWeightVersionEntry>;

export const SoracloudModelWeightStatusEntry = z
  .object({
    service_name: z.string(),
    model_name: z.string(),
    current_version: SoracloudNullableString,
    version_count: z.number(),
    versions: SoracloudModelWeightVersionEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudModelWeightStatusEntry = z.infer<typeof SoracloudModelWeightStatusEntry>;

export const SoracloudModelWeightStatusResponse = z
  .object({
    schema_version: z.number(),
    model: SoracloudModelWeightStatusEntry,
  })
  .passthrough();
export type SoracloudModelWeightStatusResponse = z.infer<typeof SoracloudModelWeightStatusResponse>;

export const SoracloudModelArtifactStatusEntry = z
  .object({
    service_name: z.string(),
    model_name: z.string(),
    artifact_id: z.string(),
    training_job_id: z.string(),
    weight_version: SoracloudNullableString,
    weight_artifact_hash: z.string(),
    dataset_ref: z.string(),
    training_config_hash: z.string(),
    reproducibility_hash: z.string(),
    provenance_attestation_hash: z.string(),
    registered_sequence: z.number(),
    consumed_by_version: SoracloudNullableString,
    private_bundle_root: SoracloudNullableString,
    compile_profile_hash: SoracloudNullableString,
    chunk_manifest_root: SoracloudNullableString,
    privacy_mode: z
      .unknown()
      .nullish()
      .transform((value) => value ?? null),
  })
  .passthrough();
export type SoracloudModelArtifactStatusEntry = z.infer<typeof SoracloudModelArtifactStatusEntry>;

export const SoracloudModelArtifactStatusResponse = z
  .object({
    schema_version: z.number(),
    service_name: z.string(),
    model_name: z.string(),
    artifact_count: z.number(),
    artifact: SoracloudModelArtifactStatusEntry,
    artifacts: SoracloudModelArtifactStatusEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudModelArtifactStatusResponse = z.infer<typeof SoracloudModelArtifactStatusResponse>;

export const SoracloudUploadedModelStatusResponse = z
  .object({
    schema_version: z.number(),
    bundle: SoracloudJsonRecord,
    uploaded_chunk_count: z.number(),
    chunk_ordinals: z.number().array().optional().default([]),
    compile_profile: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    artifact: SoracloudModelArtifactStatusEntry.nullish().transform((value) => value ?? null),
  })
  .passthrough();
export type SoracloudUploadedModelStatusResponse = z.infer<typeof SoracloudUploadedModelStatusResponse>;

export const SoracloudPrivateInferenceStatusResponse = z
  .object({
    schema_version: z.number(),
    session: SoracloudJsonRecord,
    checkpoint_count: z.number(),
    checkpoints: SoracloudJsonRecordArray.optional().default([]),
  })
  .passthrough();
export type SoracloudPrivateInferenceStatusResponse = z.infer<typeof SoracloudPrivateInferenceStatusResponse>;

export const SoracloudHfSharedLeaseStatusResponse = z
  .object({
    schema_version: z.number(),
    source: SoracloudJsonRecord,
    runtime_projection: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    pool: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    member: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    placement: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    latest_audit_event: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    audit_event_count: z.number(),
    storage_base_fee_nanos: z.union([z.string(), z.number(), z.bigint()]).transform((value) => value.toString()),
    compute_reservation_fee_nanos: z.union([z.string(), z.number(), z.bigint()]).transform((value) => value.toString()),
    eligible_host_count: z.number(),
    warm_host_count: z.number(),
    importer_pending: z.boolean(),
  })
  .passthrough();
export type SoracloudHfSharedLeaseStatusResponse = z.infer<typeof SoracloudHfSharedLeaseStatusResponse>;

export const SoracloudModelHostStatusResponse = z
  .object({
    schema_version: z.number(),
    validator_account_id: SoracloudNullableString,
    active_host_count: z.number(),
    hosts: SoracloudJsonRecordArray.optional().default([]),
  })
  .passthrough();
export type SoracloudModelHostStatusResponse = z.infer<typeof SoracloudModelHostStatusResponse>;

export const SoracloudAgentApartmentStatusEntry = z
  .object({
    apartment_name: z.string(),
    manifest_hash: z.string(),
    status: z.string(),
    lease_started_sequence: z.number(),
    lease_expires_sequence: z.number(),
    lease_remaining_ticks: z.number(),
    restart_count: z.number(),
    state_quota_bytes: z.number(),
    tool_capability_count: z.number(),
    policy_capability_count: z.number(),
    revoked_policy_capability_count: z.number(),
    pending_wallet_request_count: z.number(),
    pending_mailbox_message_count: z.number(),
    autonomy_budget_ceiling_units: z.number(),
    autonomy_budget_remaining_units: z.number(),
    artifact_allowlist_count: z.number(),
    autonomy_run_count: z.number(),
    process_generation: z.number(),
    process_started_sequence: z.number(),
    last_active_sequence: z.number(),
    last_checkpoint_sequence: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    checkpoint_count: z.number(),
    persistent_state_total_bytes: z.number(),
    persistent_state_key_count: z.number(),
    spend_limit_count: z.number(),
    upgrade_policy: z.unknown(),
    last_restart_sequence: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    last_restart_reason: SoracloudNullableString,
  })
  .passthrough();
export type SoracloudAgentApartmentStatusEntry = z.infer<typeof SoracloudAgentApartmentStatusEntry>;

export const SoracloudAgentStatusResponse = z
  .object({
    schema_version: z.number(),
    apartment_count: z.number(),
    event_count: z.number(),
    apartments: SoracloudAgentApartmentStatusEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudAgentStatusResponse = z.infer<typeof SoracloudAgentStatusResponse>;

export const SoracloudAgentMailboxMessageEntry = z
  .object({
    message_id: z.string(),
    from_apartment: z.string(),
    channel: z.string(),
    payload: z.string(),
    payload_hash: z.string(),
    enqueued_sequence: z.number(),
  })
  .passthrough();
export type SoracloudAgentMailboxMessageEntry = z.infer<typeof SoracloudAgentMailboxMessageEntry>;

export const SoracloudAgentMailboxStatusResponse = z
  .object({
    schema_version: z.number(),
    apartment_name: z.string(),
    status: z.string(),
    pending_message_count: z.number(),
    event_count: z.number(),
    messages: SoracloudAgentMailboxMessageEntry.array().optional().default([]),
  })
  .passthrough();
export type SoracloudAgentMailboxStatusResponse = z.infer<typeof SoracloudAgentMailboxStatusResponse>;

export const SoracloudAgentAutonomyAllowlistEntry = z
  .object({
    artifact_hash: z.string(),
    provenance_hash: SoracloudNullableString,
    added_sequence: z.number(),
  })
  .passthrough();
export type SoracloudAgentAutonomyAllowlistEntry = z.infer<typeof SoracloudAgentAutonomyAllowlistEntry>;

export const SoracloudAgentAutonomyRunRecord = z
  .object({
    run_id: z.string(),
    artifact_hash: z.string(),
    provenance_hash: SoracloudNullableString,
    budget_units: z.number(),
    run_label: z.string(),
    workflow_input_json: SoracloudNullableString,
    approved_sequence: z.number(),
    authoritative_runtime_receipt: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
    authoritative_execution_audit: SoracloudJsonRecord.nullish().transform((value) => value ?? null),
  })
  .passthrough();
export type SoracloudAgentAutonomyRunRecord = z.infer<typeof SoracloudAgentAutonomyRunRecord>;

export const SoracloudAgentAutonomyStatusResponse = z
  .object({
    apartment_name: z.string(),
    sequence: z.number(),
    status: z.string(),
    lease_expires_sequence: z.number(),
    lease_remaining_ticks: z.number(),
    manifest_hash: z.string(),
    revoked_policy_capability_count: z.number(),
    budget_ceiling_units: z.number(),
    budget_remaining_units: z.number(),
    allowlist_count: z.number(),
    run_count: z.number(),
    process_generation: z.number(),
    process_started_sequence: z.number(),
    last_active_sequence: z.number(),
    last_checkpoint_sequence: z
      .number()
      .nullish()
      .transform((value) => value ?? null),
    checkpoint_count: z.number(),
    persistent_state_total_bytes: z.number(),
    persistent_state_key_count: z.number(),
    allowlist: SoracloudAgentAutonomyAllowlistEntry.array().optional().default([]),
    recent_runs: SoracloudAgentAutonomyRunRecord.array().optional().default([]),
    runtime_recent_runs: SoracloudJsonRecordArray.optional().default([]),
  })
  .passthrough();
export type SoracloudAgentAutonomyStatusResponse = z.infer<typeof SoracloudAgentAutonomyStatusResponse>;

export interface SorafsPinRegistrySearchParams {
  limit: number;
  offset: number;
  status?: SorafsManifestState;
}

export interface SorafsAliasSearchParams {
  limit: number;
  offset: number;
  namespace?: string;
  manifest_digest?: string;
}

export interface SorafsReplicationSearchParams {
  limit: number;
  offset: number;
  status?: 'pending' | 'completed' | 'expired';
  manifest_digest?: string;
}

export const CountResponse = z.object({
  count: z.number(),
});
export type CountResponse = z.infer<typeof CountResponse>;

export const ZkAttachment = z.object({
  id: z.string(),
  content_type: z.string(),
  size: z.number(),
  created_ms: z.number(),
  tenant: z.string().nullable(),
});
export type ZkAttachment = z.infer<typeof ZkAttachment>;

export interface ZkAttachmentSearchParams {
  limit: number;
  offset: number;
  content_type?: string;
  has_tag?: string;
  since_ms?: number;
  before_ms?: number;
  order?: 'asc' | 'desc';
}

export const ZkProverReport = z.object({
  id: z.string(),
  ok: z.boolean(),
  error: z.string().nullable(),
  content_type: z.string(),
  size: z.number(),
  created_ms: z.number(),
  processed_ms: z.number(),
  latency_ms: z.number().optional().default(0),
  zk1_tags: z.string().array().nullable(),
});
export type ZkProverReport = z.infer<typeof ZkProverReport>;

export interface ZkProverReportSearchParams {
  limit: number;
  offset: number;
  status?: 'all' | 'ok' | 'failed';
  content_type?: string;
  has_tag?: string;
  since_ms?: number;
  before_ms?: number;
  order?: 'asc' | 'desc';
}

export const GovernanceCouncilMember = z.object({
  account_id: AccountIdSchema,
});
export type GovernanceCouncilMember = z.infer<typeof GovernanceCouncilMember>;

export const GovernanceCouncil = z.object({
  epoch: z.number(),
  members: GovernanceCouncilMember.array(),
});
export type GovernanceCouncil = z.infer<typeof GovernanceCouncil>;

export const GovernanceUnlockStats = z.object({
  height_current: z.number(),
  expired_locks_now: z.number(),
  referenda_with_expired: z.number(),
  last_sweep_height: z.number(),
});
export type GovernanceUnlockStats = z.infer<typeof GovernanceUnlockStats>;

export const GovernanceReferendumStatus = z.enum(['Proposed', 'Open', 'Closed']);
export type GovernanceReferendumStatus = z.infer<typeof GovernanceReferendumStatus>;

export const GovernanceReferendumMode = z.enum(['Zk', 'Plain']);
export type GovernanceReferendumMode = z.infer<typeof GovernanceReferendumMode>;

export const GovernanceReferendum = z.object({
  h_start: z.number(),
  h_end: z.number(),
  status: GovernanceReferendumStatus,
  mode: GovernanceReferendumMode,
});
export type GovernanceReferendum = z.infer<typeof GovernanceReferendum>;

export const GovernanceReferendumResponse = z.object({
  found: z.boolean(),
  referendum: GovernanceReferendum.nullable(),
});
export type GovernanceReferendumResponse = z.infer<typeof GovernanceReferendumResponse>;

export const GovernanceLockRecord = z.object({
  owner: AccountIdSchema,
  amount: BigIntCoerce,
  expiry_height: z.number(),
  direction: z.number(),
  duration_blocks: z.number().optional().default(0),
});
export type GovernanceLockRecord = z.infer<typeof GovernanceLockRecord>;

export const GovernanceLocksResponse = z.object({
  found: z.boolean(),
  referendum_id: z.string(),
  locks: z.record(z.string(), GovernanceLockRecord).nullable(),
});
export type GovernanceLocksResponse = z.infer<typeof GovernanceLocksResponse>;

export const GovernanceTallyResponse = z.object({
  referendum_id: z.string(),
  approve: BigIntCoerce,
  reject: BigIntCoerce,
  abstain: BigIntCoerce,
});
export type GovernanceTallyResponse = z.infer<typeof GovernanceTallyResponse>;

export const GovernanceProposalStatus = z.enum(['Proposed', 'Approved', 'Rejected', 'Enacted']);
export type GovernanceProposalStatus = z.infer<typeof GovernanceProposalStatus>;

const NullableGovernanceString = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);

export const GovernanceDeployContractProposal = z.object({
  contract_address: NullableGovernanceString.optional().default(null),
  contract_alias: NullableGovernanceString.optional().default(null),
  dataspace: NullableGovernanceString.optional().default(null),
  namespace: NullableGovernanceString.optional().default(null),
  contract_id: NullableGovernanceString.optional().default(null),
  code_hash_hex: z.string(),
  abi_hash_hex: z.string(),
  abi_version: z.union([z.string(), z.number()]).transform((value) => value.toString()),
});
export type GovernanceDeployContractProposal = z.infer<typeof GovernanceDeployContractProposal>;

export const GovernanceProposalKind = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('DeployContract'),
    payload: GovernanceDeployContractProposal,
  }),
]);
export type GovernanceProposalKind = z.infer<typeof GovernanceProposalKind>;

export const GovernanceProposal = z.object({
  proposer: AccountIdSchema,
  kind: GovernanceProposalKind,
  created_height: z.number(),
  status: GovernanceProposalStatus,
});
export type GovernanceProposal = z.infer<typeof GovernanceProposal>;

export const GovernanceProposalResponse = z.object({
  found: z.boolean(),
  proposal: GovernanceProposal.nullable(),
});
export type GovernanceProposalResponse = z.infer<typeof GovernanceProposalResponse>;
