import { z } from 'zod/v4';
import BigNumber from 'bignumber.js';
import { AssetDefinitionId, AccountId, AssetId, NftId } from '@iroha/core/data-model';

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
  pagination: Pagination
  items: T[]
}

export interface PaginationParams {
  page: number
  per_page: number
}

const Metadata = z.record(z.string(), z.any());
const TransactionStatus = z.enum(['Committed', 'Rejected']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

const Duration = z.object({
  ms: z.number().min(0),
});

export const AccountIdSchema = z.string().transform(AccountId.parse);

export const AssetDefinitionIdSchema = z.string().transform(AssetDefinitionId.parse);

export const AssetIdSchema = z.string().transform(AssetId.parse);

export const NftIdSchema = z.string().transform(NftId.parse);

export interface AccountSearchParams extends PaginationParams {
  domain?: string
  with_asset?: AssetDefinitionId
}

export const Account = z.object({
  id: AccountIdSchema,
  metadata: Metadata,
  owned_assets: z.number(),
  owned_nfts: z.number(),
  owned_domains: z.number(),
});

export type Account = z.infer<typeof Account>;

export interface AssetSearchParams extends PaginationParams {
  owned_by?: AccountId
  definition?: AssetDefinitionId
}

export const Asset = z.object({
  id: AssetIdSchema,
  value: z.string().transform((value) => BigNumber(value)),
});

export type Asset = z.infer<typeof Asset>;

export interface AssetDefinitionSearchParams extends PaginationParams {
  domain?: string
  owned_by?: AccountId
}

export const AssetDefinition = z.object({
  id: AssetDefinitionIdSchema,
  logo: z.string().nullable(),
  assets: z.number(),
  metadata: Metadata,
  mintable: z.enum(['Infinitely', 'Once', 'Not']),
  owned_by: AccountIdSchema,
});

export type AssetDefinition = z.infer<typeof AssetDefinition>;

export const NFT = z.object({
  id: NftIdSchema,
  owned_by: AccountIdSchema,
  content: Metadata,
});

export type NFT = z.infer<typeof NFT>;

export type NFTsSearchParams = AssetDefinitionSearchParams;

export interface DomainSearchParams extends PaginationParams {
  owned_by?: AccountId
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
  authority?: AccountId
  block?: number
  status?: TransactionStatus
}

export const Transaction = z.object({
  authority: z.string(),
  hash: z.string(),
  block: z.number(),
  created_at: z.coerce.date(),
  executable: z.enum(['Instructions', 'Wasm']),
  status: TransactionStatus,
});

export const DetailedTransaction = Transaction.extend({
  rejection_reason: z
    .object({
      scale: z.string(),
      json: Metadata,
    })
    .nullable(),
  metadata: Metadata,
  nonce: z.number().nullable(),
  signature: z.string(),
  time_to_live: Duration.nullable(),
});

export type Transaction = z.infer<typeof Transaction>;
export type DetailedTransaction = z.infer<typeof DetailedTransaction>;

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
  finalized_block: z.number().nullable(),
  avg_commit_time: Duration.nullable(),
  avg_block_time: Duration,
});

export type NetworkMetrics = z.infer<typeof NetworkMetrics>;

export const PeerInfo = z.object({
  url: z.string(),
  connected: z.boolean(),
  telemetry_unsupported: z.boolean(),
  config: z
    .object({
      public_key: z.string(),
      queue_capacity: z.number().nullable(),
      network_block_gossip_size: z.number().nullable(),
      network_block_gossip_period: Duration.nullable(),
      network_tx_gossip_size: z.number().nullable(),
      network_tx_gossip_period: Duration.nullable(),
    })
    .nullable(),
  location: z
    .object({
      lat: z.number(),
      lon: z.number(),
      country: z.string(),
      city: z.string(),
    })
    .nullable(),
  connected_peers: z.string().array().nullable(),
});

export type PeerInfo = z.infer<typeof PeerInfo>;

export const PeerStatus = z.object({
  url: z.string(),
  block: z.number(),
  commit_time: Duration,
  avg_commit_time: Duration,
  queue_size: z.number(),
  uptime: Duration,
});

export type PeerStatus = z.infer<typeof PeerStatus>;

export const PeerMetrics = z.discriminatedUnion('kind', [
  PeerInfo.extend({ kind: z.literal('peer_info') }),
  PeerStatus.extend({ kind: z.literal('peer_status') }),
  NetworkMetrics.extend({ kind: z.literal('network_status') }),
  z.object({
    kind: z.literal('first'),
    peers_info: PeerInfo.array(),
    peers_status: PeerStatus.array(),
    network_status: NetworkMetrics,
  }),
]);
export type PeerMetrics = z.infer<typeof PeerMetrics>;

export interface InstructionsSearchParams extends PaginationParams {
  authority?: string
  kind?: string
  transaction_hash?: string
  transaction_status?: TransactionStatus
  block?: number
}

const InstructionKind = z.enum([
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
  'Shield',
  'ZkTransfer',
  'Unshield',
  'Custom',
]);
export type InstructionKind = z.infer<typeof InstructionKind>;

const InstructionBox = z.object({
  scale: z.string().optional(),
  encoded: z.string().optional(),
  json: z.record(z.string(), z.any()),
});

export const Instruction = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if (record.box || !record['r#box']) return raw;
  return {
    ...record,
    box: record['r#box'],
  };
}, z.object({
  authority: z.string(),
  created_at: z.coerce.date(),
  kind: InstructionKind,
  // TODO: add payload schemas for every kind
  box: InstructionBox,
  transaction_hash: z.string(),
  transaction_status: TransactionStatus,
  block: z.number(),
}));
export type Instruction = z.infer<typeof Instruction>;
