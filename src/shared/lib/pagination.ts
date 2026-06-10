import type { Pagination } from '@/shared/api/schemas';

export function buildOffsetPagination(totalItems: number, limit: number, offset: number): Pagination {
  const safeTotal = Math.max(totalItems, 0);
  const perPage = Math.max(limit, 1);
  const safeOffset = Math.max(offset, 0);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / perPage);
  const page = Math.floor(safeOffset / perPage) + 1;
  return {
    page,
    per_page: perPage,
    total_pages: totalPages,
    total_items: safeTotal,
  };
}
