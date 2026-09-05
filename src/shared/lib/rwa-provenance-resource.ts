import type { RWA } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING, type SuccessfulFetching } from '@/shared/api/consts';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';
import { fetchRwaProvenanceBundle, type RwaProvenanceBundle } from '@/shared/lib/rwa-provenance';

export type RwaResourceResult = { status: SuccessfulFetching, data: RWA } | ErrorResponse;

/**
 * Keeps the root request's authoritative not-found/error result intact while
 * treating unavailable ancestors as explicit gaps inside an otherwise valid graph.
 */
export async function fetchRwaProvenanceResource(
  rootId: string,
  fetchRwa: (id: string) => Promise<RwaResourceResult>
): Promise<RwaProvenanceBundle | ErrorResponse> {
  const rootResult = await fetchRwa(rootId);
  if (rootResult.status !== SUCCESSFUL_FETCHING) return rootResult;

  const root = rootResult.data;
  return await fetchRwaProvenanceBundle(rootId, async (id) => {
    if (id === rootId) return root;

    const result = await fetchRwa(id);
    if (result.status !== SUCCESSFUL_FETCHING) throw result;
    return result.data;
  });
}
