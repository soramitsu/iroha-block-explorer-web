import type {
  LocationQuery,
  LocationQueryRaw,
  RouteLocationNormalizedLoaded,
  RouteLocationRaw,
  RouteRecordName,
} from 'vue-router';

export const EXPLORER_SCOPE_QUERY_KEYS = {
  torii: 'torii',
  dataspaceLaneId: 'dataspaceLaneId',
  dataspaceId: 'dataspaceId',
} as const;

export interface ExplorerRouteScope {
  torii: string
  dataspaceLaneId: string
  dataspaceId: string
}

const SCOPED_EXPLORER_ROUTE_NAMES = new Set<RouteRecordName>([
  'blocks-list',
  'blocks-details',
  'assets',
  'asset-details',
  'nfts',
  'nft-details',
  'rwas',
  'rwa-details',
  'accounts-list',
  'account-details',
  'domains-list',
  'domain-details',
  'transactions-list',
  'transaction-details',
  'tracing-workspace',
  'econometrics',
  'telemetry',
  'kaigi-relays',
  'governance-dashboard',
  'soracloud',
  'sorafs-registry',
  'zk-telemetry',
]);

const SCOPED_EXPLORER_PATH_PREFIXES = [
  '/blocks',
  '/assets',
  '/nfts',
  '/rwas',
  '/accounts',
  '/domains',
  '/transactions',
  '/tracing',
  '/econometrics',
  '/telemetry',
  '/kaigi',
  '/governance',
  '/soracloud',
  '/sorafs',
  '/zk',
] as const;

function firstQueryValue(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

function normalizePath(rawPath: string): string {
  const noHash = rawPath.split('#', 1)[0] ?? '';
  const noQuery = noHash.split('?', 1)[0] ?? '';
  const withLeadingSlash = noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const trimmed = collapsed !== '/' ? collapsed.replace(/\/+$/, '') : collapsed;
  return trimmed || '/';
}

function isExternalHref(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(value);
}

function splitPathQueryHash(raw: string): {
  path: string
  query: string
  hash: string
} {
  const hashIndex = raw.indexOf('#');
  const pathAndQuery = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : '';

  const queryIndex = pathAndQuery.indexOf('?');
  const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : '';

  return { path, query, hash };
}

export function toExplorerScopeQuery(scope: ExplorerRouteScope): LocationQueryRaw {
  return {
    [EXPLORER_SCOPE_QUERY_KEYS.torii]: scope.torii,
    [EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId]: scope.dataspaceLaneId,
    [EXPLORER_SCOPE_QUERY_KEYS.dataspaceId]: scope.dataspaceId,
  };
}

export function parseExplorerScopeFromQuery(query: LocationQuery | LocationQueryRaw): ExplorerRouteScope | null {
  const torii = firstQueryValue(query[EXPLORER_SCOPE_QUERY_KEYS.torii]);
  const dataspaceLaneId = firstQueryValue(query[EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId]);
  const dataspaceId = firstQueryValue(query[EXPLORER_SCOPE_QUERY_KEYS.dataspaceId]);

  if (!torii?.trim()) return null;
  if (!dataspaceLaneId?.trim()) return null;
  if (!dataspaceId?.trim()) return null;

  return {
    torii: torii.trim(),
    dataspaceLaneId: dataspaceLaneId.trim(),
    dataspaceId: dataspaceId.trim(),
  };
}

export function isScopedExplorerRouteName(name: RouteRecordName | null | undefined): boolean {
  if (!name) return false;
  return SCOPED_EXPLORER_ROUTE_NAMES.has(name);
}

export function shouldPreserveExplorerScopeForPath(path: string): boolean {
  if (!path) return false;
  if (isExternalHref(path)) return false;

  const normalizedPath = normalizePath(path);
  if (normalizedPath === '/') return false;

  return SCOPED_EXPLORER_PATH_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
}

function shouldPreserveExplorerScopeForLocation(to: RouteLocationRaw): boolean {
  if (typeof to === 'string') {
    return shouldPreserveExplorerScopeForPath(to);
  }

  if ('name' in to && to.name) {
    return isScopedExplorerRouteName(to.name);
  }

  if ('path' in to && typeof to.path === 'string') {
    return shouldPreserveExplorerScopeForPath(to.path);
  }

  // Query/hash-only navigations are relative to the current route and should keep scope.
  if ('query' in to || 'hash' in to) {
    return true;
  }

  return false;
}

export function stripExplorerScopeFromQuery(query?: LocationQuery | LocationQueryRaw): LocationQueryRaw {
  if (!query) return {};
  const next: LocationQueryRaw = { ...query };
  delete next[EXPLORER_SCOPE_QUERY_KEYS.torii];
  delete next[EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId];
  delete next[EXPLORER_SCOPE_QUERY_KEYS.dataspaceId];
  return next;
}

export function applyExplorerScopeToQuery(
  query: LocationQuery | LocationQueryRaw | undefined,
  scope: ExplorerRouteScope
): LocationQueryRaw {
  return {
    ...stripExplorerScopeFromQuery(query),
    ...toExplorerScopeQuery(scope),
  };
}

export function applyExplorerScopeToLocation(
  to: RouteLocationRaw,
  scope: ExplorerRouteScope | null
): RouteLocationRaw {
  if (!scope) return to;
  if (!shouldPreserveExplorerScopeForLocation(to)) return stripExplorerScopeFromLocation(to);

  if (typeof to === 'string') {
    if (isExternalHref(to)) return to;
    const { path, query, hash } = splitPathQueryHash(to);
    const search = new URLSearchParams(query);
    search.set(EXPLORER_SCOPE_QUERY_KEYS.torii, scope.torii);
    search.set(EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId, scope.dataspaceLaneId);
    search.set(EXPLORER_SCOPE_QUERY_KEYS.dataspaceId, scope.dataspaceId);
    const nextPath = path || '';
    const nextQuery = search.toString();
    const nextHash = hash ? `#${hash}` : '';
    return nextQuery.length > 0 ? `${nextPath}?${nextQuery}${nextHash}` : `${nextPath}${nextHash}`;
  }

  const next = { ...to };
  if ('query' in to) {
    next.query = applyExplorerScopeToQuery(to.query as LocationQueryRaw | undefined, scope);
  } else {
    next.query = toExplorerScopeQuery(scope);
  }
  return next;
}

export function stripExplorerScopeFromLocation(to: RouteLocationRaw): RouteLocationRaw {
  if (typeof to === 'string') {
    if (isExternalHref(to)) return to;
    const { path, query, hash } = splitPathQueryHash(to);
    if (!query) return to;
    const search = new URLSearchParams(query);
    search.delete(EXPLORER_SCOPE_QUERY_KEYS.torii);
    search.delete(EXPLORER_SCOPE_QUERY_KEYS.dataspaceLaneId);
    search.delete(EXPLORER_SCOPE_QUERY_KEYS.dataspaceId);
    const nextQuery = search.toString();
    const nextHash = hash ? `#${hash}` : '';
    return nextQuery.length > 0 ? `${path}?${nextQuery}${nextHash}` : `${path}${nextHash}`;
  }

  const next = { ...to };
  if ('query' in to) {
    next.query = stripExplorerScopeFromQuery(to.query as LocationQueryRaw | undefined);
  }
  return next;
}

export function parseExplorerScopeFromRoute(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>) {
  const shouldPreserve =
    isScopedExplorerRouteName(route.name) || shouldPreserveExplorerScopeForPath(route.path ?? '/');
  if (!shouldPreserve) return null;
  return parseExplorerScopeFromQuery(route.query);
}
