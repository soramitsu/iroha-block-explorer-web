import { useElementSize } from '@vueuse/core';
import { computed } from 'vue';
import {
  LG_WINDOW_SIZE,
  MD_WINDOW_SIZE,
  SM_WINDOW_SIZE,
  XL_WINDOW_SIZE,
  XS_WINDOW_SIZE,
  XXL_WINDOW_SIZE,
} from '@/shared/ui/consts';

export type HashType = 'full' | 'medium' | 'short' | 'two-line';

export function useAdaptiveHash(
  sizes: Partial<{
    xxl: HashType
    xl: HashType
    lg: HashType
    md: HashType
    sm: HashType
    xs: HashType
    xxs: HashType
  }>,
  defaultDisplay?: HashType
) {
  const defaultHashType = defaultDisplay ?? 'short';
  const workspace = computed(() => document.getElementById('main-content'));
  const { width } = useElementSize(workspace);

  return computed(() => {
    if (width.value >= XXL_WINDOW_SIZE) return sizes.xxl ?? defaultHashType;
    else if (width.value >= XL_WINDOW_SIZE) return sizes.xl ?? defaultHashType;
    else if (width.value >= LG_WINDOW_SIZE) return sizes.lg ?? defaultHashType;
    else if (width.value >= MD_WINDOW_SIZE) return sizes.md ?? defaultHashType;
    else if (width.value >= SM_WINDOW_SIZE) return sizes.sm ?? defaultHashType;
    else if (width.value >= XS_WINDOW_SIZE) return sizes.xs ?? defaultHashType;

    return sizes.xxs ?? defaultHashType;
  });
}
