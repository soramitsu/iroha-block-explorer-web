import { expect, test } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/shared/lib/localization';
import BasePagination from '@/shared/ui/components/BasePagination.vue';
import { computeDisplayRange, computeNumbers } from '@/shared/ui/composables/usePagination';

test.each([
  [
    {
      reversed: true,
      items: 19,
      totalItems: 29,
      page: 0,
      pageSize: 10,
      activePage: 2,
    },
    {
      start: 29,
      end: 11,
      total: 29,
    },
  ],
  [
    {
      reversed: true,
      items: 10,
      totalItems: 30,
      page: 0,
      pageSize: 10,
      activePage: 3,
    },
    {
      start: 30,
      end: 21,
      total: 30,
    },
  ],
  [
    {
      reversed: false,
      items: 2,
      totalItems: 32,
      page: 4,
      pageSize: 10,
      activePage: 4,
    },
    {
      start: 31,
      end: 32,
      total: 32,
    },
  ],
  [
    {
      reversed: false,
      items: 40,
      totalItems: 40,
      page: 4,
      pageSize: 10,
      activePage: 4,
    },
    {
      start: 31,
      end: 40,
      total: 40,
    },
  ],
])('Items range computation correctness', ({ items, page, pageSize, activePage, reversed, totalItems }, expected) => {
  expect(computeDisplayRange({ items, reversed, totalItems, page, pageSize, activePage })).toStrictEqual(expected);
});

test.each([
  [
    {
      reversed: true,
      totalItems: 159,
      totalPages: 15,
      page: 0,
      activePage: 15,
      isMobile: false,
    },
    [15, 14, 13, 12, 11, 10, 9, '. . .', 1],
  ],
  [
    {
      reversed: true,
      totalItems: 189,
      totalPages: 18,
      page: 7,
      activePage: 7,
      isMobile: false,
    },
    [18, '. . .', 10, 9, 8, 7, 6, 5, 4, '. . .', 1],
  ],
  [
    {
      reversed: true,
      totalItems: 189,
      totalPages: 18,
      page: 3,
      activePage: 3,
      isMobile: false,
    },
    [18, '. . .', 7, 6, 5, 4, 3, 2, 1],
  ],
  [
    {
      reversed: true,
      totalItems: 159,
      totalPages: 15,
      page: 0,
      activePage: 15,
      isMobile: true,
    },
    [15, 14, 13, 12, '. . .', 1],
  ],
  [
    {
      reversed: true,
      totalItems: 189,
      totalPages: 18,
      page: 7,
      activePage: 7,
      isMobile: true,
    },
    [18, '. . .', 8, 7, 6, '. . .', 1],
  ],
  [
    {
      reversed: true,
      totalItems: 189,
      totalPages: 18,
      page: 3,
      activePage: 3,
      isMobile: true,
    },
    [18, '. . .', 4, 3, 2, 1],
  ],
  [
    {
      reversed: false,
      totalItems: 159,
      totalPages: 16,
      page: 0,
      activePage: 16,
      isMobile: false,
    },
    [1, 2, 3, 4, 5, 6, 7, '. . .', 16],
  ],
  [
    {
      reversed: false,
      totalItems: 189,
      totalPages: 19,
      page: 7,
      activePage: 7,
      isMobile: false,
    },
    [1, '. . .', 4, 5, 6, 7, 8, 9, 10, '. . .', 19],
  ],
  [
    {
      reversed: false,
      totalItems: 189,
      totalPages: 19,
      page: 17,
      activePage: 17,
      isMobile: false,
    },
    [1, '. . .', 13, 14, 15, 16, 17, 18, 19],
  ],
  [
    {
      reversed: false,
      totalItems: 159,
      totalPages: 16,
      page: 0,
      activePage: 16,
      isMobile: true,
    },
    [1, 2, 3, 4, '. . .', 16],
  ],
  [
    {
      reversed: false,
      totalItems: 189,
      totalPages: 19,
      page: 7,
      activePage: 7,
      isMobile: true,
    },
    [1, '. . .', 6, 7, 8, '. . .', 19],
  ],
  [
    {
      reversed: false,
      totalItems: 189,
      totalPages: 19,
      page: 17,
      activePage: 17,
      isMobile: true,
    },
    [1, '. . .', 16, 17, 18, 19],
  ],
])(
  'Numbers list computation correctness',
  ({ isMobile, page, totalPages, activePage, reversed, totalItems }, expected) => {
    expect(computeNumbers({ isMobile, totalPages, reversed, totalItems, page, activePage })).toStrictEqual(expected);
  }
);

test.each([
  [
    {
      items: 15,
      page: 0,
      pageSize: 10,
      payloadPagination: { page: 4, per_page: 10, total_pages: 4, total_items: 35 },
      reversed: true,
      totalItems: 35,
    },
    {
      segmentInfo: '21-35 of 35',
      numbers: ['1', '2', '3'],
      activePage: '3',
    },
  ],
  [
    {
      items: 10,
      page: 0,
      pageSize: 10,
      payloadPagination: { page: 3, per_page: 10, total_pages: 3, total_items: 30 },
      reversed: true,
      totalItems: 30,
    },
    {
      segmentInfo: '21-30 of 30',
      numbers: ['1', '2', '3'],
      activePage: '3',
    },
  ],
  [
    {
      items: 15,
      page: 0,
      pageSize: 10,
      payloadPagination: { page: 11, per_page: 10, total_pages: 11, total_items: 105 },
      reversed: true,
      totalItems: 105,
    },
    {
      segmentInfo: '91-105 of 105',
      numbers: ['1', '. . .', '4', '5', '6', '7', '8', '9', '10'],
      activePage: '10',
    },
  ],
  [
    {
      items: 10,
      page: 8,
      pageSize: 10,
      payloadPagination: { page: 8, per_page: 10, total_pages: 13, total_items: 125 },
      reversed: true,
      totalItems: 125,
    },
    {
      segmentInfo: '71-80 of 125',
      numbers: ['1', '. . .', '6', '7', '8', '9', '10', '11', '12'],
      activePage: '8',
    },
  ],
  [
    {
      items: 10,
      page: 3,
      pageSize: 10,
      payloadPagination: { page: 3, per_page: 10, total_pages: 13, total_items: 125 },
      reversed: true,
      totalItems: 125,
    },
    {
      segmentInfo: '21-30 of 125',
      numbers: ['1', '2', '3', '4', '5', '6', '7', '. . .', '12'],
      activePage: '3',
    },
  ],
  [
    {
      items: 10,
      page: 8,
      pageSize: 10,
      payloadPagination: { page: 8, per_page: 10, total_pages: 20, total_items: 195 },
      reversed: true,
      totalItems: 195,
    },
    {
      segmentInfo: '71-80 of 195',
      numbers: ['1', '. . .', '5', '6', '7', '8', '9', '10', '11', '. . .', '19'],
      activePage: '8',
    },
  ],
  [
    {
      items: 10,
      page: 2,
      pageSize: 10,
      payloadPagination: { page: 2, per_page: 10, total_pages: 4, total_items: 35 },
      reversed: true,
      totalItems: 35,
    },
    {
      segmentInfo: '11-20 of 35',
      numbers: ['1', '2', '3'],
      activePage: '2',
    },
  ],
  [
    {
      items: 27,
      page: 0,
      pageSize: 20,
      payloadPagination: { page: 2, per_page: 20, total_pages: 2, total_items: 27 },
      reversed: true,
      totalItems: 27,
    },
    {
      segmentInfo: '1-27 of 27',
      numbers: [],
      activePage: '',
    },
  ],
  [
    {
      items: 1,
      page: 0,
      pageSize: 10,
      payloadPagination: { page: 0, per_page: 10, total_pages: 1, total_items: 1 },
      reversed: true,
      totalItems: 1,
    },
    {
      segmentInfo: '1-1 of 1',
      numbers: [],
      activePage: '',
    },
  ],
  [
    {
      items: 5,
      page: 1,
      pageSize: 10,
      payloadPagination: undefined,
      reversed: false,
      totalItems: 35,
    },
    {
      segmentInfo: '1-10 of 35',
      numbers: ['1', '2', '3', '4'],
      activePage: '1',
    },
  ],
  [
    {
      items: 5,
      page: 4,
      pageSize: 10,
      payloadPagination: undefined,
      reversed: false,
      totalItems: 35,
    },
    {
      segmentInfo: '31-35 of 35',
      numbers: ['1', '2', '3', '4'],
      activePage: '4',
    },
  ],
  [
    {
      items: 7,
      page: 2,
      pageSize: 20,
      payloadPagination: undefined,
      reversed: false,
      totalItems: 27,
    },
    {
      segmentInfo: '21-27 of 27',
      numbers: ['1', '2'],
      activePage: '2',
    },
  ],
])(
  'BasePagination reversed and usual display correctness',
  async ({ items, page, pageSize, payloadPagination, reversed, totalItems }, expected) => {
    const wrapper = mount(BasePagination, {
      props: {
        items,
        page,
        pageSize,
        payloadPagination,
        reversed,
        totalItems,
      },
      global: {
        plugins: [i18n],
      },
    });

    function getSegmentInfo() {
      return wrapper.find('.base-pagination__segment-info').text();
    }

    function getActivePage() {
      const activePage = wrapper.find('[data-active]');
      if (!activePage.exists()) return '';

      return activePage.text();
    }

    function getPagesList() {
      return wrapper.findAll('.base-pagination__item-numbers-number').map((i) => i.text());
    }

    const res = {
      segmentInfo: getSegmentInfo(),
      activePage: getActivePage(),
      numbers: getPagesList(),
    };

    expect(res).toStrictEqual(expected);
  }
);
