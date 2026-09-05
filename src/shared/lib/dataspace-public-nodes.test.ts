import { beforeEach, describe, expect, it } from 'vitest';
import {
  listDataspacePublicNodes,
  removeDataspacePublicNode,
  upsertDataspacePublicNode,
} from './dataspace-public-nodes';

const scope = {
  registryNode: 'https://registry.example:8080',
  laneId: 7,
  dataspaceId: 42,
} as const;

describe('dataspace public-node storage', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  });

  it('normalizes urls and dedupes entries by normalized url', () => {
    upsertDataspacePublicNode(scope, {
      label: 'Node A',
      url: 'https://public-node.example:8080',
    });
    upsertDataspacePublicNode(scope, {
      label: 'Node A Updated',
      url: 'https://public-node.example:8080/',
    });

    const entries = listDataspacePublicNodes(scope);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      label: 'Node A Updated',
      url: 'https://public-node.example:8080',
      source: 'manual',
    });
  });

  it('isolates entries per configured registry node and dataspace key', () => {
    const scopeA = {
      registryNode: 'https://registry-a.example:8080',
      laneId: 1,
      dataspaceId: 10,
    };
    const scopeB = {
      registryNode: 'https://registry-b.example:8080',
      laneId: 1,
      dataspaceId: 10,
    };
    const scopeC = {
      registryNode: 'https://registry-a.example:8080',
      laneId: 2,
      dataspaceId: 10,
    };

    upsertDataspacePublicNode(scopeA, {
      label: 'A1',
      url: 'https://node-a.example:8080',
    });
    upsertDataspacePublicNode(scopeB, {
      label: 'B1',
      url: 'https://node-b.example:8080',
    });
    upsertDataspacePublicNode(scopeC, {
      label: 'C1',
      url: 'https://node-c.example:8080',
    });

    expect(listDataspacePublicNodes(scopeA).map((item) => item.label)).toEqual(['A1']);
    expect(listDataspacePublicNodes(scopeB).map((item) => item.label)).toEqual(['B1']);
    expect(listDataspacePublicNodes(scopeC).map((item) => item.label)).toEqual(['C1']);
  });

  it('removes entries by normalized url', () => {
    upsertDataspacePublicNode(scope, {
      label: 'To remove',
      url: 'https://public-node.example:8080',
    });

    expect(listDataspacePublicNodes(scope)).toHaveLength(1);
    removeDataspacePublicNode(scope, 'https://public-node.example:8080/');
    expect(listDataspacePublicNodes(scope)).toHaveLength(0);
  });

  it('does not seed deployment-specific nodes for a fresh scope', () => {
    const entries = listDataspacePublicNodes({
      registryNode: 'https://torii.soramitsu.io',
      laneId: 0,
      dataspaceId: 10,
    });

    expect(entries).toEqual([]);
  });

  it.each([
    'registry.example',
    'ftp://registry.example',
    'https://user:secret@registry.example',
    'https://registry.example/v1/explorer',
  ])('rejects an inexact registry node scope: %s', (registryNode) => {
    expect(() => listDataspacePublicNodes({ registryNode, laneId: 0, dataspaceId: 10 })).toThrow(
      'Dataspace registry node must be an exact absolute Torii base URL'
    );
  });

  it('does not persist an invalid public node URL', () => {
    expect(upsertDataspacePublicNode(scope, { label: 'Invalid', url: 'relative-node' })).toEqual([]);
    expect(listDataspacePublicNodes(scope)).toEqual([]);
  });
});
