<template>
  <BaseContentBlock
    :title="$t('widgets.latestBlocks')"
    class="latest-blocks"
  >
    <template #header-action>
      <BaseButton
        line
        to="/blocks"
      >
        {{ $t('viewAll') }}
      </BaseButton>
    </template>

    <template #default>
      <div
        v-if="showAvailabilityNotice"
        class="latest-blocks__availability"
        :class="`latest-blocks__availability_${availability.state.value}`"
      >
        <span>{{ $t(availabilityNoticeKey) }}</span>
        <BaseButton
          size="xs"
          variant="secondary"
          @click="retryAvailabilityFailover"
        >
          {{ $t('settings.retryFailover') }}
        </BaseButton>
      </div>
      <div
        v-if="latestSampleDate"
        class="latest-blocks__freshness"
        :data-tone="latestSampleTone"
        data-test="latest-blocks-freshness"
      >
        <span>{{ $t('telemetry.dataTrustSampleAge') }}:</span>
        <TimeStamp
          v-if="latestSampleDate"
          :value="latestSampleDate"
        />
        <span v-else>{{ $t('telemetry.dataUnknown') }}</span>
        <span>({{ $t(latestSampleToneKey) }})</span>
      </div>
      <BaseCollectionState
        :snapshot="setup.snapshot"
        :count="blocks.length"
        @retry="setup.refetch()"
      >
        <div>
          <template
            v-for="block in blocks"
            :key="block.height"
          >
            <div
              class="latest-blocks__row"
            >
              <div class="latest-blocks__row-block-height row-text">
                {{ block.created_at === null ? '?' : block.transactions_hash ? '◉' : 'O' }}
                <BaseLink
                  :to="`/blocks/${block.height}`"
                  monospace
                >
                  {{ block.height }}
                </BaseLink>
              </div>

              <div class="latest-blocks__row-time">
                <TimeIcon
                  class="latest-blocks__row-time-icon"
                  aria-hidden="true"
                />
                <TimeStamp
                  v-if="block.created_at"
                  :value="block.created_at"
                />
                <span
                  v-else
                  data-test="latest-block-created-at-unavailable"
                >{{ $t('telemetry.dataUnknown') }}</span>
              </div>

              <span class="latest-blocks__row-number row-text-monospace">
                {{ $t('widgets.transactionCount', { count: block.transactions_total }) }}
              </span>
            </div>
          </template>
        </div>
      </BaseCollectionState>
    </template>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import TimeIcon from '@/shared/ui/icons/clock.svg';
import * as http from '@/shared/api';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseCollectionState from '@/shared/ui/components/BaseCollectionState.vue';
import { computed, ref, watch } from 'vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useBlockStream } from '@/shared/ui/composables/useBlockStream';
import { classifySampleFreshness } from '@/shared/lib/freshness';
import { useIntervalFn } from '@vueuse/core';

let refetchLatestBlocks: (() => void) | null = null;
let isFetchPending: (() => boolean) | null = null;
const blockStream = useBlockStream(() => {
  if (isFetchPending?.()) return;
  refetchLatestBlocks?.();
});

const setup = setupAsyncData(() => http.fetchBlocks({ limit: 10 }), {
  interval: 5000,
  pollWhen: () => !blockStream.isSupported || !blockStream.isStreaming.value,
});
refetchLatestBlocks = () => setup.refetch();
isFetchPending = () => setup.isLoading;

const blocks = computed(() => (setup.data?.status === SUCCESSFUL_FETCHING ? setup.data.data.items : []));
const availability = http.useToriiAvailability();
const showAvailabilityNotice = computed(() => availability.state.value !== 'healthy');
const availabilityNoticeKey = computed(() => `settings.nodeHealth.${availability.state.value}`);
const nowMs = ref(Date.now());

useIntervalFn(() => {
  nowMs.value = Date.now();
}, 1000);

const latestSampleDate = computed<Date | null>(() => {
  const timestamps = blocks.value
    .map((block) => block.created_at)
    .filter((createdAt): createdAt is Date => createdAt !== null);
  if (!timestamps.length) return null;
  return timestamps.reduce((latest, createdAt) => (createdAt > latest ? createdAt : latest), timestamps[0]);
});
const latestSampleTone = computed(() =>
  classifySampleFreshness(latestSampleDate.value?.getTime() ?? null, nowMs.value)
);
const latestSampleToneKeyMap = {
  fresh: 'telemetry.dataFresh',
  delayed: 'telemetry.dataDelayed',
  stale: 'telemetry.dataStale',
  unknown: 'telemetry.dataUnknown',
} as const;
const latestSampleToneKey = computed(() => latestSampleToneKeyMap[latestSampleTone.value]);

watch(
  () => blocks.value,
  (items) => {
    if (!blockStream.isSupported) return;
    if (!items.length) return;
    const maxHeight = Math.max(...items.map((block) => block.height));
    blockStream.connectFrom(maxHeight + 1);
  },
  { immediate: true }
);


async function retryAvailabilityFailover() {
  await http.retryToriiFailover();
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.latest-blocks {
  &_loading {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 20px;
  }

  container-type: inline-size;

  &__row {
    cursor: default;
    padding: size(1) size(4);
    border-bottom: 1px solid theme-color('border-primary');
    justify-content: space-between;
    align-items: center;
    min-height: 64px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;

    &:hover {
      background: theme-color('background-hover');
    }

    & > * {
      width: fit-content;
    }

    @include sm {
      padding: 0 size(4);
    }

    &-block-height {
      width: size(10);
    }

    &-time {
      user-select: none;
      cursor: default;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      min-width: 0;
      gap: 4px;
      position: relative;

      &-icon {
        path {
          fill: theme-color('content-quaternary');
        }
      }
    }

    &-number {
      min-width: 0;
      max-width: 100%;
      text-align: right;
      color: theme-color('content-primary');
    }
  }

  @container (max-width: 400px) {
    &__row { grid-template-columns: minmax(0, 1fr) auto; }
    &__row-time { grid-column: 1 / -1; grid-row: 2; }
  }

  &__availability {
    margin: size(1) size(2) size(2);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface-variant');
    padding: size(1) size(1.5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(1);
    @include tpg-s4;
  }

  &__availability_degraded {
    border-color: color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary'));
  }

  &__availability_failing_over,
  &__availability_outage {
    border-color: color-mix(in srgb, theme-color('error') 45%, theme-color('border-primary'));
  }

  &__freshness {
    margin: 0 size(2) size(1.5);
    padding: size(0.75) size(1.25);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface-variant');
    display: inline-flex;
    align-items: center;
    gap: size(0.75);
    @include tpg-s5;

    &[data-tone='fresh'] {
      border-color: color-mix(in srgb, theme-color('success') 40%, theme-color('border-primary'));
    }

    &[data-tone='delayed'] {
      border-color: color-mix(in srgb, theme-color('warning') 45%, theme-color('border-primary'));
    }

    &[data-tone='stale'] {
      border-color: color-mix(in srgb, theme-color('error') 45%, theme-color('border-primary'));
    }
  }
}
</style>
