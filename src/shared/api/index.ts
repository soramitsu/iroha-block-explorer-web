import type {
  PaginationParams,
  AssetSearchParams,
  TransactionSearchParams,
  AccountSearchParams,
  AssetDefinitionSearchParams,
  InstructionsSearchParams,
  DomainSearchParams,
  NFTsSearchParams,
} from '@/shared/api/schemas';
import type { AccountId, AssetDefinitionId, AssetId, NftId } from '@iroha/core/data-model';
import {
  Account,
  Paginated,
  Asset,
  AssetDefinition,
  Domain,
  Block,
  Transaction,
  DetailedTransaction,
  Instruction,
  NetworkMetrics,
  PeerInfo,
  NFT,
  PeerMetrics,
} from '@/shared/api/schemas';
import { useEventSource } from '@vueuse/core';
import { computed } from 'vue';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { transformErrorResponse } from '@/shared/utils/transform-error-response';
import type { SuccessfulFetching } from '@/shared/api/consts';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

export function resolveApiBaseUrl(configuredBaseUrl: string | undefined, origin: string) {
  const normalizedConfigured = String(configuredBaseUrl ?? '').trim();
  if (normalizedConfigured) {
    return new URL(normalizedConfigured, origin).toString().replace(/\/+$/, '');
  }
  return `${origin.replace(/\/+$/, '')}/api/v1`;
}

const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location.origin.toString());

type GetResult<T> = { status: SuccessfulFetching, data: T } | { status: 'error', response: Response };
type ResultWithStatus<T> = { status: SuccessfulFetching, data: T } | ErrorResponse;

async function get<T>(path: string, params?: Record<string, any>): Promise<GetResult<T>> {
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, String(value)));
  }

  const res = await fetch(url);

  if (!res.ok) return { status: 'error', response: res };

  return {
    status: SUCCESSFUL_FETCHING,
    data: await res.json(),
  };
}

export async function fetchAccounts(params?: AccountSearchParams): Promise<ResultWithStatus<Paginated<Account>>> {
  const res = await get('/accounts', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Account).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchAccount(id: AccountId): Promise<ResultWithStatus<Account>> {
  const res = await get(`/accounts/${id}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: Account.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchAssets(params?: AssetSearchParams): Promise<ResultWithStatus<Paginated<Asset>>> {
  const res = await get('/assets', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Asset).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchAsset(id: AssetId): Promise<ResultWithStatus<Asset>> {
  const res = await get(`/assets/${id}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: Asset.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchAssetDefinitions(
  params?: AssetDefinitionSearchParams
): Promise<ResultWithStatus<Paginated<AssetDefinition>>> {
  const res = await get('/assets-definitions', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(AssetDefinition).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchAssetDefinition(id: AssetDefinitionId): Promise<ResultWithStatus<AssetDefinition>> {
  const res = await get(`/assets-definitions/${encodeURIComponent(id.toString())}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: AssetDefinition.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchNFTs(params?: NFTsSearchParams): Promise<ResultWithStatus<Paginated<NFT>>> {
  const res = await get('/nfts', params);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: Paginated(NFT).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchNFTById(id: NftId): Promise<ResultWithStatus<NFT>> {
  const res = await get(`/nfts/${encodeURIComponent(id.toString())}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: NFT.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchDomains(params?: DomainSearchParams): Promise<ResultWithStatus<Paginated<Domain>>> {
  const res = await get('/domains', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Domain).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchDomain(id: string): Promise<ResultWithStatus<Domain>> {
  const res = await get(`/domains/${id}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: Domain.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchBlocks(params?: Partial<PaginationParams>): Promise<ResultWithStatus<Paginated<Block>>> {
  const res = await get('/blocks', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Block).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchBlock(heightOrHash: number | string): Promise<ResultWithStatus<Block>> {
  const res = await get(`/blocks/${heightOrHash}`);
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: Block.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchNetworkMetrics(): Promise<ResultWithStatus<NetworkMetrics>> {
  const res = await get('/telemetry/network');
  if (res.status === SUCCESSFUL_FETCHING) return { status: SUCCESSFUL_FETCHING, data: NetworkMetrics.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export function streamTelemetryMetrics() {
  const { data: streamedMetrics, status } = useEventSource(`${BASE_URL}/telemetry/live`, [], {
    autoReconnect: true,
  });

  return {
    data: computed(() => {
      if (!streamedMetrics.value) return null;

      return PeerMetrics.parse(JSON.parse(streamedMetrics.value));
    }),
    status,
  };
}

export async function fetchPeersInfo(): Promise<ResultWithStatus<PeerInfo[]>> {
  const res = await get('/telemetry/peers-info');
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: PeerInfo.array().parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchTransactions(
  params?: TransactionSearchParams
): Promise<ResultWithStatus<Paginated<Transaction>>> {
  const res = await get<Paginated<Transaction>>('/transactions', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Transaction).parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchTransaction(hash: string): Promise<ResultWithStatus<DetailedTransaction>> {
  const res = await get<DetailedTransaction>(`/transactions/${hash}`);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: DetailedTransaction.parse(res.data) };

  return await transformErrorResponse(res.response);
}

export async function fetchInstructions(
  params?: InstructionsSearchParams
): Promise<ResultWithStatus<Paginated<Instruction>>> {
  const res = await get<Paginated<Instruction>>('/instructions', params);
  if (res.status === SUCCESSFUL_FETCHING)
    return { status: SUCCESSFUL_FETCHING, data: Paginated(Instruction).parse(res.data) };

  return await transformErrorResponse(res.response);
}
