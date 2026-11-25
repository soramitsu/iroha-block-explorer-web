import { countTimeDifference } from '@/shared/lib/time';
import type { MaybeRefOrGetter } from 'vue';
import { reactive, toValue, watchEffect } from 'vue';
import { useSharedNow } from '@/shared/ui/composables/useSharedNow';

export type TimeAgo =
  | { precision: 'seconds', value: number }
  | { precision: 'minutes', value: number }
  | { precision: 'hours', value: number }
  | { precision: 'days', value: number };

/** Time elapsed since `date`, advanced by the page's shared one-second clock. */
export function useTimeAgo(date: MaybeRefOrGetter<Date>) {
  const now = useSharedNow();
  const result = reactive<TimeAgo>({ precision: 'seconds', value: 0 });

  // Unchanged values are not re-rendered, so an hour-old row costs one
  // subtraction per tick and no DOM work.
  watchEffect(() => {
    const { precision, value } = countTimeDifference(now.value, toValue(date));
    result.precision = precision;
    result.value = value;
  });

  return result;
}
