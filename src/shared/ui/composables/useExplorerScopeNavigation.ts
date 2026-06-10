import { computed, inject, type ComputedRef } from 'vue';
import { routerKey, useRouter, type RouteLocationRaw, type Router } from 'vue-router';
import {
  applyExplorerScopeToLocation,
  parseExplorerScopeFromRoute,
  stripExplorerScopeFromLocation,
  type ExplorerRouteScope,
} from '@/shared/lib/explorer-scope';
import { getToriiBaseUrl } from '@/shared/api';
import { normalizeAccountRoutePath } from '@/shared/lib/account-id';

function createCurrentScopeComputed(
  router: Pick<Router, 'currentRoute'> | { currentRoute?: { value?: unknown } } | null
): ComputedRef<ExplorerRouteScope | null> {
  return computed(() => {
    const route = router?.currentRoute?.value as any;
    if (!route || typeof route !== 'object') return null;
    if (!('path' in route) || !('query' in route)) return null;
    return parseExplorerScopeFromRoute(route);
  });
}

export function useCurrentExplorerScope(): ComputedRef<ExplorerRouteScope | null> {
  const router = inject(routerKey, null);
  return createCurrentScopeComputed(router);
}

export function useScopedExplorerNavigation() {
  const router = useRouter();
  const scope = createCurrentScopeComputed(router);

  const toScopedLocation = (to: RouteLocationRaw) => {
    const normalized =
      typeof to === 'string' ? normalizeAccountRoutePath(to, scope.value?.torii ?? getToriiBaseUrl()) : to;
    return applyExplorerScopeToLocation(normalized, scope.value);
  };
  const toGlobalLocation = (to: RouteLocationRaw) => stripExplorerScopeFromLocation(to);

  function push(to: RouteLocationRaw) {
    return Promise.resolve(router.push(toScopedLocation(to)));
  }

  function replace(to: RouteLocationRaw) {
    return Promise.resolve(router.replace(toScopedLocation(to)));
  }

  function pushGlobal(to: RouteLocationRaw) {
    return Promise.resolve(router.push(toGlobalLocation(to)));
  }

  function replaceGlobal(to: RouteLocationRaw) {
    return Promise.resolve(router.replace(toGlobalLocation(to)));
  }

  return {
    scope,
    toScopedLocation,
    toGlobalLocation,
    push,
    replace,
    pushGlobal,
    replaceGlobal,
    router,
  };
}
