import BigNumber from 'bignumber.js';
import { describe, expect, it, vi } from 'vitest';
import type { RWA } from '@/shared/api/schemas';
import { fetchRwaProvenanceBundle } from './rwa-provenance';

const OWNER = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function makeRwa(id: string, overrides?: Partial<RWA>): RWA {
  return {
    id,
    owned_by: OWNER,
    quantity: new BigNumber(10),
    held_quantity: new BigNumber(0),
    primary_reference: `ref:${id}`,
    status: null,
    is_frozen: false,
    metadata: {},
    parents: [],
    ...overrides,
  };
}

describe('fetchRwaProvenanceBundle', () => {
  it('builds a layered provenance graph from recursive parent refs', async () => {
    const rootId = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc$commodities';
    const midId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb$commodities';
    const leafId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$commodities';

    const records = new Map<string, RWA>([
      [
        rootId,
        makeRwa(rootId, {
          parents: [{ rwa: midId, quantity: new BigNumber(4) }],
        }),
      ],
      [
        midId,
        makeRwa(midId, {
          parents: [{ rwa: leafId, quantity: new BigNumber(4) }],
        }),
      ],
      [leafId, makeRwa(leafId)],
    ]);

    const fetchRwa = vi.fn(async (id: string) => {
      const rwa = records.get(id);
      if (!rwa) throw new Error(`missing ${id}`);
      return rwa;
    });

    const bundle = await fetchRwaProvenanceBundle(rootId, fetchRwa);

    expect(fetchRwa).toHaveBeenCalledTimes(3);
    expect(bundle.root.id).toBe(rootId);
    expect(bundle.missingAncestorIds).toEqual([]);
    expect(bundle.graph.nodes.map((node) => ({ id: node.id, depth: node.depth, isRoot: node.isRoot }))).toEqual([
      { id: leafId, depth: 2, isRoot: false },
      { id: midId, depth: 1, isRoot: false },
      { id: rootId, depth: 0, isRoot: true },
    ]);
    expect(bundle.graph.edges).toEqual([
      { id: `${midId}->${rootId}:4`, source: midId, target: rootId, quantity: '4' },
      { id: `${leafId}->${midId}:4`, source: leafId, target: midId, quantity: '4' },
    ]);
  });

  it('keeps placeholder nodes when ancestor fetches fail', async () => {
    const rootId = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd$commodities';
    const missingId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee$commodities';

    const fetchRwa = vi.fn(async (id: string) => {
      if (id === rootId) {
        return makeRwa(rootId, {
          parents: [{ rwa: missingId, quantity: new BigNumber(2) }],
        });
      }
      throw new Error('not found');
    });

    const bundle = await fetchRwaProvenanceBundle(rootId, fetchRwa);

    expect(bundle.missingAncestorIds).toEqual([missingId]);
    expect(bundle.graph.nodes).toHaveLength(2);
    expect(bundle.graph.nodes.find((node) => node.id === missingId)?.isPlaceholder).toBe(true);
    expect(bundle.graph.edges).toEqual([
      { id: `${missingId}->${rootId}:2`, source: missingId, target: rootId, quantity: '2' },
    ]);
  });
});
