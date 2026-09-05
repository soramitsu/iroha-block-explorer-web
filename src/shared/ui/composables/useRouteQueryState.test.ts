import { describe, expect, it, vi } from 'vitest';

import { useRouteQueryState } from './useRouteQueryState';

const route = { query: { torii: 'https://node', page: '2' } };
const push = vi.fn();
const replace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}));

describe('useRouteQueryState', () => {
  it('preserves scope and uses replacement by default', async () => {
    const { updateRouteQuery } = useRouteQueryState();
    await updateRouteQuery({ page: 1, filter: 'alice' }, { defaults: { page: 1 } });

    expect(replace).toHaveBeenCalledWith({ query: { torii: 'https://node', filter: 'alice' } });
    expect(push).not.toHaveBeenCalled();
  });

  it('supports discrete history pushes and skips identical updates', async () => {
    push.mockReset();
    replace.mockReset();
    const { updateRouteQuery } = useRouteQueryState();
    await updateRouteQuery({ page: 3 }, { history: 'push' });
    await updateRouteQuery({ page: 2 });

    expect(push).toHaveBeenCalledWith({ query: { torii: 'https://node', page: '3' } });
    expect(replace).not.toHaveBeenCalled();
  });
});
