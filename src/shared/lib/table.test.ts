import { describe, expect, it, vi } from 'vitest';
import { useTable } from './table';

function paginated<T>(
  items: T[],
  { page = 1, per_page = 10, total = items.length }: { page?: number, per_page?: number, total?: number } = {}
) {
  return {
    items,
    pagination: {
      page,
      per_page,
      total_items: total,
      total_pages: Math.max(1, Math.ceil(total / per_page)),
    },
  };
}

describe('useTable', () => {
  it('fetches data and updates pagination metadata', async () => {
    const fetchFn = vi.fn().mockResolvedValue(paginated(['a', 'b'], { total: 20 }));
    const table = useTable(fetchFn);

    await table.fetch();

    expect(fetchFn).toHaveBeenCalledWith({ page: 1, per_page: 10 });
    expect(table.items.value).toEqual(['a', 'b']);
    expect(table.pagination.total_items).toBe(20);
    expect(table.pagination.total_pages).toBe(2);
    expect(table.loading.value).toBe(false);
  });

  it('persists additional fetch params across calls', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(paginated(['a'], { total: 10 }))
      .mockResolvedValueOnce(paginated(['b'], { total: 5 }));
    const table = useTable(fetchFn);

    await table.fetch({ domain: 'wonderland' });
    await table.fetch();

    expect(fetchFn).toHaveBeenNthCalledWith(1, { page: 1, per_page: 10, domain: 'wonderland' });
    expect(fetchFn).toHaveBeenNthCalledWith(2, { page: 1, per_page: 10, domain: 'wonderland' });
    expect(table.items.value).toEqual(['b']);
  });

  it('resets pagination when page size changes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(paginated(['a', 'b'], { per_page: 10, total: 20 }))
      .mockResolvedValueOnce(paginated(['c'], { per_page: 5, total: 5 }));
    const table = useTable(fetchFn);

    await table.fetch();
    await table.setSize(5);

    expect(fetchFn).toHaveBeenLastCalledWith({ page: 1, per_page: 5 });
    expect(table.pagination.per_page).toBe(5);
    expect(table.pagination.page).toBe(1);
  });
});
