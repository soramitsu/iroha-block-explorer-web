import type { Pagination } from '@/shared/api/schemas';

export const PINNED_TORII_DEFAULT_MAX_FETCH_SIZE = 500;

export interface ExactOffsetPageRequest {
  page: number;
  per_page: number;
}

export interface ExactOffsetPageResponse {
  items: readonly unknown[];
  total: number;
  has_more: boolean;
  count_mode: 'exact';
}

/** Enforces the exact limit/offset page invariants of current Torii list routes. */
export function assertExactOffsetPage(
  resource: string,
  request: ExactOffsetPageRequest,
  response: ExactOffsetPageResponse
): void {
  const offset = (request.page - 1) * request.per_page;
  const expectedItems = Math.min(request.per_page, Math.max(response.total - offset, 0));
  if (response.items.length !== expectedItems) {
    throw new Error(
      `Torii ${resource} response returned ${response.items.length} items; exact pagination requires ${expectedItems}`
    );
  }

  const returnedEnd = offset + response.items.length;
  if (response.has_more !== response.total > returnedEnd) {
    throw new Error(`Torii ${resource} response has_more contradicts its exact total`);
  }
}

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
