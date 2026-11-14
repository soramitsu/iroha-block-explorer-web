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
const RWA_ID = `${'01'.repeat(32)}$commodities.main`;
const ENCODED_RWA_ID = encodeURIComponent(RWA_ID);

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
    expect(shouldPreserveExplorerScopeForPath(`/rwas/${ENCODED_RWA_ID}`)).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/search?q=abc')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/contracts')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/soracloud')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/zk/registry')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/dataspaces')).toBe(false);
    expect(shouldPreserveExplorerScopeForPath('/')).toBe(true);
    expect(shouldPreserveExplorerScopeForPath('/?foo=bar#activity')).toBe(true);
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

  it('preserves scope on the logo path and named Overview destination', () => {
    const pathDestination = applyExplorerScopeToLocation('/?foo=bar#activity', scope);
    expect(pathDestination).toBe(`/?foo=bar&${new URLSearchParams(toExplorerScopeQuery(scope) as Record<string, string>)}#activity`);
    expect(applyExplorerScopeToLocation({ name: 'home' }, scope)).toEqual({
      name: 'home',
      query: toExplorerScopeQuery(scope),
    });
    expect(applyExplorerScopeToLocation({ path: '/', query: { foo: 'bar' } }, scope)).toEqual({
      path: '/',
      query: { foo: 'bar', ...toExplorerScopeQuery(scope) },
    });
  });

  it('recognizes scoped Overview routes and leaves ordinary Overview unscoped', () => {
    expect(parseExplorerScopeFromRoute({ name: 'home', path: '/', query: toExplorerScopeQuery(scope) } as any)).toEqual(scope);
    expect(parseExplorerScopeFromRoute({ name: undefined, path: '/', query: toExplorerScopeQuery(scope) } as any)).toEqual(scope);
    expect(parseExplorerScopeFromRoute({ name: 'home', path: '/', query: {} })).toBeNull();
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
    const destination: RouteLocationRaw = { name: 'rwa-details', params: { id: RWA_ID } };
    const scopedDestination = applyExplorerScopeToLocation(destination, scope) as Exclude<RouteLocationRaw, string>;
    expect(scopedDestination).toMatchObject({
      name: 'rwa-details',
      params: { id: RWA_ID },
      query: toExplorerScopeQuery(scope),
    });
  });

  it('applies scope to exact search and contract route-name destinations', () => {
    const searchDestination = applyExplorerScopeToLocation(
      { name: 'search-results', query: { q: 'ab'.repeat(32) } },
      scope
    ) as Exclude<RouteLocationRaw, string>;
    expect(searchDestination).toMatchObject({
      name: 'search-results',
      query: {
        q: 'ab'.repeat(32),
        ...toExplorerScopeQuery(scope),
      },
    });

    const contractsDestination = applyExplorerScopeToLocation({ name: 'smart-contracts' }, scope) as Exclude<
      RouteLocationRaw,
      string
    >;
    expect(contractsDestination).toMatchObject({
      name: 'smart-contracts',
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
      path: `/rwas/${ENCODED_RWA_ID}`,
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(rwaRoute).toEqual(scope);

    const zkRegistryRoute = parseExplorerScopeFromRoute({
      name: 'zk-registry',
      path: '/zk/registry',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(zkRegistryRoute).toEqual(scope);

    const nonScopedRoute = parseExplorerScopeFromRoute({
      name: 'dataspaces-details',
      path: '/dataspaces/7/42',
      query: toExplorerScopeQuery(scope),
    } as any);
    expect(nonScopedRoute).toBeNull();
  });
});
