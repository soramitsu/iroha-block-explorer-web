import { describe, expect, it } from 'vitest';
import { buildOffsetPagination } from './pagination';

describe('buildOffsetPagination', () => {
  it('derives pagination metadata from offset windows', () => {
    expect(buildOffsetPagination(50, 10, 20)).toEqual({
      page: 3,
      per_page: 10,
      total_pages: 5,
      total_items: 50,
    });
  });

  it('handles zero totals gracefully', () => {
    expect(buildOffsetPagination(0, 10, 0)).toEqual({
      page: 1,
      per_page: 10,
      total_pages: 0,
      total_items: 0,
    });
  });
});
