import { describe, expect, it } from 'vitest';
import { assertExactOffsetPage, buildOffsetPagination } from './pagination';

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

describe('assertExactOffsetPage', () => {
  it.each([
    [
      { page: 1, per_page: 10 },
      { items: Array(10), total: 25, has_more: true, count_mode: 'exact' as const },
    ],
    [
      { page: 3, per_page: 10 },
      { items: Array(5), total: 25, has_more: false, count_mode: 'exact' as const },
    ],
    [
      { page: 1, per_page: 10 },
      { items: [], total: 0, has_more: false, count_mode: 'exact' as const },
    ],
    [
      { page: 3, per_page: 10 },
      { items: [], total: 7, has_more: false, count_mode: 'exact' as const },
    ],
  ])('accepts a coherent exact Torii page %#', (request, response) => {
    expect(() => assertExactOffsetPage('test rows', request, response)).not.toThrow();
  });

  it.each([
    [
      { page: 1, per_page: 10 },
      { items: Array(11), total: 11, has_more: false, count_mode: 'exact' as const },
      'requires 10',
    ],
    [
      { page: 1, per_page: 10 },
      { items: Array(9), total: 25, has_more: true, count_mode: 'exact' as const },
      'requires 10',
    ],
    [{ page: 1, per_page: 10 }, { items: [1], total: 0, has_more: false, count_mode: 'exact' as const }, 'requires 0'],
    [
      { page: 1, per_page: 10 },
      { items: Array(10), total: 25, has_more: false, count_mode: 'exact' as const },
      'has_more',
    ],
    [
      { page: 3, per_page: 10 },
      { items: Array(5), total: 25, has_more: true, count_mode: 'exact' as const },
      'has_more',
    ],
  ])('rejects contradictory exact pagination %#', (request, response, message) => {
    expect(() => assertExactOffsetPage('test rows', request, response)).toThrow(message);
  });
});
