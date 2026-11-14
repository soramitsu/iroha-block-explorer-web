<script setup lang="ts">
import { defaultFormat } from '@/shared/lib/time';
import ContextTooltip from '@/shared/ui/components/ContextTooltip.vue';
import { useTimeAgo } from '@/shared/ui/composables/useTimeAgo';
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  value: Date
  inverted?: boolean
}>();

const { t } = useI18n();
const res = useTimeAgo(toRef(props, 'value'));

const i18nKey = computed(() => {
  if (res.precision === 'days') {
    if (res.value < 2) return 'time.dayAgo';

    return 'time.daysAgo';
  }

  if (res.precision === 'hours') {
    if (res.value < 2) return 'time.hourAgo';

    return 'time.hoursAgo';
  }

  if (res.precision === 'seconds') {
    if (res.value < 2) return 'time.secAgo';

    return 'time.secsAgo';
  }

  if (res.value < 2) return 'time.minAgo';

  return 'time.minsAgo';
});

const dateTime = computed(() => defaultFormat(props.value));
const timeAgo = computed(() => t(i18nKey.value, [res.value]));
</script>

<template>
  <div class="time-stamp">
    <time
      class="time-ago row-text-monospace"
      :datetime="props.value.toISOString()"
    >{{
      props.inverted ? dateTime : timeAgo
    }}</time>
    <ContextTooltip :message="props.inverted ? timeAgo : dateTime" />
  </div>
</template>

<style lang="scss">
.time-stamp { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; gap: 4px; }
.time-stamp time { overflow-wrap: anywhere; }
</style>
