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
      <div v-if="!isInitialLoading">
        <template
          v-for="block in blocks"
          :key="block.height"
        >
          <div
            class="latest-blocks__row"
            tabindex="0"
            role="link"
            @click="handleRowClick(block.height)"
            @keydown.enter.space="handleRowClick(block.height)"
          >
            <div class="latest-blocks__row-block-height row-text">
              {{ block.transactions_hash ? '◉' : 'O' }}
              <span class="row-text-monospace">{{ block.height }}</span>
            </div>

            <div class="latest-blocks__row-time">
              <TimeIcon class="latest-blocks__row-time-icon" />
              <TimeStamp :value="block.created_at" />
            </div>

            <span class="latest-blocks__row-number row-text-monospace">{{ block.transactions_total }} txns</span>
          </div>
        </template>
      </div>
      <BaseLoading
        v-else
        class="latest-blocks_loading"
      />
    </template>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import TimeIcon from '@/shared/ui/icons/clock.svg';
import * as http from '@/shared/api';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import { computed, ref, watch } from 'vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useBlockStream } from '@/shared/ui/composables/useBlockStream';
import { classifySampleFreshness } from '@/shared/lib/freshness';
import { useIntervalFn } from '@vueuse/core';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

const navigation = useScopedExplorerNavigation();
let refetchLatestBlocks: (() => void) | null = null;
let isFetchPending: (() => boolean) | null = null;
const blockStream = useBlockStream(() => {
  if (isFetchPending?.()) return;
  refetchLatestBlocks?.();
});

const setup = setupAsyncData(() => http.fetchBlocks({ per_page: 10 }), {
  interval: 5000,
  pollWhen: () => !blockStream.isSupported || !blockStream.isStreaming.value,
});
refetchLatestBlocks = () => setup.refetch();
isFetchPending = () => setup.isLoading;

const blocks = computed(() => (setup.data?.status === SUCCESSFUL_FETCHING ? setup.data.data.items : []));
const isInitialLoading = computed(() => setup.isLoading && blocks.value.length === 0);
const availability = http.useToriiAvailability();
const showAvailabilityNotice = computed(() => availability.state.value !== 'healthy');
const availabilityNoticeKey = computed(() => `settings.nodeHealth.${availability.state.value}`);
const nowMs = ref(Date.now());

useIntervalFn(() => {
  nowMs.value = Date.now();
}, 1000);

const latestSampleDate = computed<Date | null>(() => {
  if (!blocks.value.length) return null;
  return blocks.value.reduce((latest, block) => (block.created_at > latest ? block.created_at : latest), blocks.value[0].created_at);
});
const latestSampleTone = computed(() => classifySampleFreshness(latestSampleDate.value?.getTime() ?? null, nowMs.value));
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

function handleRowClick(height: number) {
  navigation.push(`/blocks/${height}`).catch(() => {});
}

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

  &__row {
    cursor: pointer;
    padding: size(1) size(4);
    border-bottom: 1px solid theme-color('border-primary');
    justify-content: space-between;
    align-items: center;
    min-height: 64px;
    display: flex;

    &:hover {
      box-shadow: theme-shadow('row');
      border-color: transparent;
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
      width: size(18);
      gap: size(2);
      position: relative;

      &-icon {
        path {
          fill: theme-color('content-quaternary');
        }
      }

      &:hover .context-tooltip {
        display: flex;
        left: size(20);
      }
    }

    &-number {
      width: size(11);
      text-align: right;
      color: theme-color('content-primary');
    }
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
