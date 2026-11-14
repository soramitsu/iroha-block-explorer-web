import type { MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';

export function computeDisplayRange(params: {
  items: number
  reversed: boolean
  totalItems?: number
  page: number
  pageSize: number
  activePage: number
}) {
  if (!params.totalItems)
    return {
      start: 0,
      end: 0,
      total: 0,
    };

  if (!params.reversed && params.items === 0 && (params.page - 1) * params.pageSize >= params.totalItems) {
    return {
      start: 0,
      end: 0,
      total: params.totalItems,
    };
  }

  const start = (params.page - 1) * params.pageSize + 1;
  const end = params.page * params.pageSize;

  if (params.reversed && params.activePage) {
    if (params.pageSize > params.totalItems) {
      return {
        start: params.totalItems,
        end: 1,
        total: params.totalItems,
      };
    }

    const start = (params.activePage - 1) * params.pageSize + params.items;

    const end = start - params.items + 1;

    return {
      start,
      end,
      total: params.totalItems,
    };
  }

  return {
    start,
    end: end > params.totalItems ? params.totalItems : end,
    total: params.totalItems,
  };
}

export function computeNumbers(params: {
  reversed: boolean
  totalItems?: number
  totalPages: number
  page: number
  activePage: number
  isMobile: boolean
}) {
  if (!params.totalItems) return [];

  const max = params.isMobile ? 6 : 10;
  const side = params.isMobile ? 4 : 7;
  const offset = params.isMobile ? 1 : 3;

  if (params.reversed) {
    if (params.totalPages < max) {
      return new Array(params.totalPages)
        .fill(0)
        .map((_, i) => i + 1)
        .toReversed();
    } else if (params.activePage < side) {
      const numbersArray = Array(side)
        .fill(0)
        .map<string | number>((_, i) => i + 1);

      return [params.totalPages, '. . .'].concat(numbersArray.toReversed());
    } else if (params.activePage > params.totalPages - side + 1) {
      return Array(side)
        .fill(params.totalPages)
        .map<string | number>((_, i) => _ - i)
        .concat(['. . .', 1]);
    } else {
      const start = Math.max(params.page - offset, 1);
      const end = Math.min(params.page + offset, params.totalPages);

      const middleNumbers = new Array(end - start + 1).fill(0).map((_, i) => i + start);

      return [params.totalPages, '. . .', ...middleNumbers.toReversed(), '. . .', 1];
    }
  }

  if (params.totalPages < max) {
    return new Array(params.totalPages).fill(0).map((_, i) => i + 1);
  }

  if (params.page < side) {
    return Array(side)
      .fill(0)
      .map<string | number>((_, i) => i + 1)
      .concat(['. . .', params.totalPages]);
  }

  if (params.page > params.totalPages - side + 1) {
    return [1, '. . .'].concat(
      Array(side)
        .fill(0)
        .map((_, i) => params.totalPages - i)
        .toReversed()
    );
  }

  const start = Math.max(params.page - offset, 1);
  const end = Math.min(params.page + offset, params.totalPages);

  const middleNumbers = new Array(end - start + 1).fill(0).map((_, i) => i + start);

  return [1, '. . .', ...middleNumbers, '. . .', params.totalPages];
}

export function usePagination(params: {
  items: MaybeRefOrGetter<number>
  reversed: boolean
  totalItems: MaybeRefOrGetter<number | undefined>
  totalPages: MaybeRefOrGetter<number>
  page: MaybeRefOrGetter<number>
  pageSize: MaybeRefOrGetter<number>
  activePage: MaybeRefOrGetter<number>
  isMobile: MaybeRefOrGetter<boolean>
}) {
  const items = computed(() => toValue(params.items));
  const reversed = computed(() => toValue(params.reversed));
  const totalItems = computed(() => toValue(params.totalItems));
  const totalPages = computed(() => toValue(params.totalPages));
  const page = computed(() => toValue(params.page));
  const pageSize = computed(() => toValue(params.pageSize));
  const activePage = computed(() => toValue(params.activePage));
  const isMobile = computed(() => toValue(params.isMobile));

  const displayRange = computed(() =>
    computeDisplayRange({
      items: items.value,
      reversed: reversed.value,
      totalItems: totalItems.value,
      page: page.value,
      pageSize: pageSize.value,
      activePage: activePage.value,
    })
  );

  const numbers = computed(() =>
    computeNumbers({
      reversed: reversed.value,
      totalItems: totalItems.value,
      totalPages: totalPages.value,
      page: page.value,
      activePage: activePage.value,
      isMobile: isMobile.value,
    })
  );

  return {
    displayRange,
    numbers,
  };
}
