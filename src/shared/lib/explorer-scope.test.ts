import { describe, expect, it } from 'vitest';
import type { RouteLocationRaw } from 'vue-router';
import {
  applyExplorerScopeToLocation,
  EXPLORER_SCOPE_QUERY_KEYS,
  parseExplorerScopeFromQuery,
  parseExplorerScopeFromRoute,
  shouldPreserveExplorerScopeForPath,
  stripExplorerScopeFromLocation,
  toExplorerScopeQuery,
} from './explorer-scope';

const scope = {
  torii: 'https://public-node.example:8080',
  dataspaceLaneId: '7',
  dataspaceId: '42',
};

describe('explorer scope helpers', () => {
  it('parses full route scope from query', () => {
    const parsed = parseExplorerScopeFromQuery({
      [EXPLORER_SCOPE_QUERY_KEYS.torii]: scope.torii,
      [EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId]: scope.dataspaceLaneId,
      [EXPLORER_SCOPE_QUERY_KEYS.dataspaceId]: scope.dataspaceId,
    });

    expect(parsed).toEqual(scope);
  });

  it('rejects partial scope query values', () => {
    expect(
      parseExplorerScopeFromQuery({
        [EXPLORER_SCOPE_QUERY_KEYS.torii]: scope.torii,
        [EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId]: scope.dataspaceLaneId,
      })
    ).toBeNull();
  });

  it('preserves scope only for scoped explorer paths', () => {
    expect(shouldPreserveExplorerScopeForPath('/blocks')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/accounts/abc')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/rwas/lot-001%24commodities')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/soracloud')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/dataspaces')).toBe(false);
    expect(shouldPreserveExplorerScopeForPath('/')).toBe(false);
    expect(shouldPreserveExplorerScopeForPath('https://example.com')).toBe(false);
  });

  it('applies scope to path-based internal destinations', () => {
    const target = applyExplorerScopeToLocation('/blocks/10?foo=bar', scope);
    expect(target).toContain('/blocks/10?');
    expect(target).toContain('foo=bar');
    expect(target).toContain(
      `${EXPLORER_SCOPE_QUERY_KEYS.torii}=${encodeURIComponent(scope.torii)}`
    );
    expect(target).toContain(`${EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId}=7`);
    expect(target).toContain(`${EXPLORER_SCOPE_QUERY_KEYS.dataspaceId}=42`);
  });

  it('does not rewrite non-scoped destinations', () => {
    const target = applyExplorerScopeToLocation('/dataspaces', scope);
    expect(target).toBe('/dataspaces');
  });

  it('strips scope keys when exiting to global destinations', () => {
    const input = `/blocks?foo=bar&${EXPLORER_SCOPE_QUERY_KEYS.torii}=https%3A%2F%2Fnode&${EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId}=1&${EXPLORER_SCOPE_QUERY_KEYS.dataspaceId}=2`;
    const stripped = stripExplorerScopeFromLocation(input);
    expect(stripped).toBe('/blocks?foo=bar');
  });

  it('applies scope to route-name destinations', () => {
    const destination: RouteLocationRaw = { name: 'account-details', params: { id: 'alice' } };
    const scopedDestination = applyExplorerScopeToLocation(destination, scope) as Exclude<RouteLocationRaw, string>;
    expect(scopedDestination).toMatchObject({
      name: 'account-details',
      params: { id: 'alice' },
      query: toExplorerScopeQuery(scope),
    });
  });

  it('applies scope to rwa route-name destinations', () => {
    const destination: RouteLocationRaw = { name: 'rwa-details', params: { id: 'lot-001$commodities' } };
    const scopedDestination = applyExplorerScopeToLocation(destination, scope) as Exclude<RouteLocationRaw, string>;
    expect(scopedDestination).toMatchObject({
      name: 'rwa-details',
      params: { id: 'lot-001$commodities' },
      query: toExplorerScopeQuery(scope),
    });
  });

  it('preserves scope on query-only relative navigations', () => {
    const destination: RouteLocationRaw = { query: { asset: 'xor#sora' } };
    const scopedDestination = applyExplorerScopeToLocation(destination, scope) as Exclude<RouteLocationRaw, string>;
    expect(scopedDestination).toMatchObject({
      query: {
        asset: 'xor#sora',
        ...toExplorerScopeQuery(scope),
      },
    });
  });

  it('resolves route scope only for scoped explorer routes', () => {
    const scopedRoute = parseExplorerScopeFromRoute({
      name: 'blocks-list',
      path: '/blocks',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(scopedRoute).toEqual(scope);

    const soracloudRoute = parseExplorerScopeFromRoute({
      name: 'soracloud',
      path: '/soracloud',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(soracloudRoute).toEqual(scope);

    const rwaRoute = parseExplorerScopeFromRoute({
      name: 'rwa-details',
      path: '/rwas/lot-001%24commodities',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(rwaRoute).toEqual(scope);

    const nonScopedRoute = parseExplorerScopeFromRoute({
      name: 'dataspaces-details',
      path: '/dataspaces/7/42',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(nonScopedRoute).toBeNull();
  });
});
