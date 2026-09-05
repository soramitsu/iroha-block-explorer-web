import { useRoute, useRouter } from 'vue-router';

import { mergeRouteQuery, routeQueriesEqual, type RouteQueryPatchValue } from '@/shared/lib/route-query';

export function useRouteQueryState() {
  const route = useRoute();
  const router = useRouter();

  async function updateRouteQuery(
    patch: Record<string, RouteQueryPatchValue>,
    options: {
      history?: 'push' | 'replace'
      defaults?: Record<string, RouteQueryPatchValue>
    } = {}
  ) {
    const query = mergeRouteQuery(route.query, patch, options.defaults);
    if (routeQueriesEqual(route.query, query)) return;
    await router[options.history ?? 'replace']({ query });
  }

  return { route, updateRouteQuery };
}
