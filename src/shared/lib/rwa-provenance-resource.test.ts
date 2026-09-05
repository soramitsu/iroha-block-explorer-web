import { describe, expect, it, vi } from 'vitest';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import type { RWA } from '@/shared/api/schemas';
import { fetchRwaProvenanceResource, type RwaResourceResult } from './rwa-provenance-resource';

const CHILD_RWA_ID = `${'11'.repeat(32)}$goods.main`;
const PARENT_RWA_ID = `${'22'.repeat(32)}$goods.main`;
const MISSING_RWA_ID = `${'33'.repeat(32)}$goods.main`;

function rwa(id: string, parents: Array<{ rwa: string, quantity: { toString: () => string } }> = []): RWA {
  return {
    id,
    parents,
    owned_by: 'alice@wonderland',
    quantity: { toString: () => '10' },
    held_quantity: { toString: () => '0' },
    primary_reference: null,
    status: null,
    is_frozen: false,
    metadata: {},
  } as unknown as RWA;
}

describe('fetchRwaProvenanceResource', () => {
  it('builds the graph from one authoritative root fetch and its available ancestors', async () => {
    const fetchRwa = vi.fn(async (id: string): Promise<RwaResourceResult> => ({
      status: SUCCESSFUL_FETCHING,
      data:
        id === CHILD_RWA_ID
          ? rwa(CHILD_RWA_ID, [{ rwa: PARENT_RWA_ID, quantity: { toString: () => '7' } }])
          : rwa(PARENT_RWA_ID),
    }));

    const result = await fetchRwaProvenanceResource(CHILD_RWA_ID, fetchRwa);

    expect('root' in result && result.root.id).toBe(CHILD_RWA_ID);
    expect('graph' in result && result.graph.nodes.map((node) => node.id)).toEqual([PARENT_RWA_ID, CHILD_RWA_ID]);
    expect(fetchRwa.mock.calls).toEqual([[CHILD_RWA_ID], [PARENT_RWA_ID]]);
  });

  it('preserves a root not-found result instead of fabricating an empty graph', async () => {
    const fetchRwa = vi.fn(async (): Promise<RwaResourceResult> => ({ status: NOT_FOUND }));

    await expect(fetchRwaProvenanceResource(MISSING_RWA_ID, fetchRwa)).resolves.toEqual({ status: NOT_FOUND });
    expect(fetchRwa).toHaveBeenCalledTimes(1);
  });

  it('preserves a root request error for the shared terminal error state', async () => {
    const error = new Error('offline');
    const fetchRwa = vi.fn(async (): Promise<RwaResourceResult> => ({ status: UNKNOWN_ERROR, error }));

    await expect(fetchRwaProvenanceResource(CHILD_RWA_ID, fetchRwa)).resolves.toEqual({
      status: UNKNOWN_ERROR,
      error,
    });
  });

  it('keeps a valid root visible and marks an unavailable ancestor as a graph gap', async () => {
    const fetchRwa = vi.fn(async (id: string): Promise<RwaResourceResult> =>
      id === CHILD_RWA_ID
        ? {
            status: SUCCESSFUL_FETCHING,
            data: rwa(CHILD_RWA_ID, [{ rwa: MISSING_RWA_ID, quantity: { toString: () => '3' } }]),
          }
        : { status: NOT_FOUND }
    );

    const result = await fetchRwaProvenanceResource(CHILD_RWA_ID, fetchRwa);

    expect('missingAncestorIds' in result && result.missingAncestorIds).toEqual([MISSING_RWA_ID]);
    expect(
      'graph' in result && result.graph.nodes.find((node) => node.id === MISSING_RWA_ID)?.isPlaceholder
    ).toBe(true);
  });
});
