<template>
  <div class="kaigi-relays-page">
    <BaseContentBlock :title="$t('kaigi.overview')">
      <template #default>
        <div
          v-if="overview"
          class="kaigi-relays-page__snapshot"
        >
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.healthyRelays') }}</span>
            <span class="value healthy">{{ overview.healthy_total }}</span>
          </div>
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.degradedRelays') }}</span>
            <span class="value degraded">{{ overview.degraded_total }}</span>
          </div>
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.unavailableRelays') }}</span>
            <span class="value unavailable">{{ overview.unavailable_total }}</span>
          </div>
          <div
            v-if="overview.unknown_total"
            class="kaigi-relays-page__stat"
          >
            <span class="label">{{ $t('kaigi.statusUnknown') }}</span>
            <span class="value unknown">{{ overview.unknown_total }}</span>
          </div>
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.reportsTotal') }}</span>
            <span class="value">{{ overview.reports_total }}</span>
          </div>
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.registrationsTotal') }}</span>
            <span class="value">{{ overview.registrations_total }}</span>
          </div>
          <div class="kaigi-relays-page__stat">
            <span class="label">{{ $t('kaigi.failoversTotal') }}</span>
            <span class="value">{{ overview.failovers_total }}</span>
          </div>
        </div>
        <BaseLoading v-else-if="isOverviewLoading" />
        <div
          v-else
          class="kaigi-relays-page__snapshot kaigi-relays-page__snapshot--empty"
        >
          {{ $t('kaigi.snapshotUnavailable') }}
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('kaigi.relays')">
      <template #default>
        <BaseTable
          :items="relays"
          :loading="relaysState.isLoading"
          :row-key="relayRowKey"
          container-class="kaigi-relays-page__table"
          :disable-pagination="true"
          row-pointer
          @click:row="handleRowClick"
        >
          <template #header>
            <div class="kaigi-relays-page__row">
              <span class="cell">{{ $t('kaigi.relayId') }}</span>
              <span class="cell">{{ $t('kaigi.domain') }}</span>
              <span class="cell">{{ $t('kaigi.bandwidthClass') }}</span>
              <span class="cell">{{ $t('kaigi.status') }}</span>
              <span class="cell">{{ $t('kaigi.lastReported') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="kaigi-relays-page__row">
              <span class="cell">{{ item.relay_id }}</span>
              <span class="cell">{{ item.domain }}</span>
              <span class="cell">{{ item.bandwidth_class }}</span>
              <span class="cell">
                <span
                  :class="['status-pill', statusClass(item.status)]"
                >{{ formatStatus(item.status) }}</span>
              </span>
              <span class="cell">
                <TimeStamp
                  v-if="item.reported_at_ms !== null"
                  :value="new Date(item.reported_at_ms)"
                  inverted
                />
                <span
                  v-else
                  class="row-text"
                >{{ $t('kaigi.neverReported') }}</span>
              </span>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('kaigi.domainMetrics')">
      <template #default>
        <BaseTable
          v-if="domainMetrics.length"
          :items="domainMetrics"
          :loading="healthState.isLoading"
          :row-key="domainMetricRowKey"
          container-class="kaigi-relays-page__table"
          :disable-pagination="true"
        >
          <template #header>
            <div class="kaigi-relays-page__row">
              <span class="cell">{{ $t('kaigi.domain') }}</span>
              <span class="cell">{{ $t('kaigi.registrationsTotal') }}</span>
              <span class="cell">{{ $t('kaigi.manifestUpdatesTotal') }}</span>
              <span class="cell">{{ $t('kaigi.failoversTotal') }}</span>
              <span class="cell">{{ $t('kaigi.healthReportsTotal') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="kaigi-relays-page__row">
              <span class="cell">{{ item.domain }}</span>
              <span class="cell">{{ item.registrations_total }}</span>
              <span class="cell">{{ item.manifest_updates_total }}</span>
              <span class="cell">{{ item.failovers_total }}</span>
              <span class="cell">{{ item.health_reports_total }}</span>
            </div>
          </template>
        </BaseTable>
        <div
          v-else
          class="kaigi-relays-page__empty row-text"
        >
          {{ $t('kaigi.noDomainMetrics') }}
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('kaigi.liveEvents')">
      <template #default>
        <KaigiRelayEvents
          :stream-url="kaigiEventsStream"
          @event="handleKaigiEvent"
        />
      </template>
    </BaseContentBlock>

    <section
      v-if="detailState.isOpen"
      class="kaigi-relays-detail"
    >
      <div class="kaigi-relays-detail__header">
        <h3>{{ detailState.data?.relay.relay_id }}</h3>
        <button
          class="kaigi-relays-detail__close"
          type="button"
          @click="closeDetail"
        >
          {{ $t('kaigi.hideDetails') }}
        </button>
      </div>

      <BaseLoading v-if="detailState.isLoading" />
      <div
        v-else-if="detailState.error"
        class="kaigi-relays-detail__error"
      >
        {{ detailState.error }}
      </div>
      <div
        v-else-if="detailState.data"
        class="kaigi-relays-detail__body"
      >
        <div class="kaigi-relays-detail__grid">
          <DataField
            :title="$t('kaigi.domain')"
            :value="detailState.data.relay.domain"
          />
          <DataField
            :title="$t('kaigi.bandwidthClass')"
            :value="detailState.data.relay.bandwidth_class"
          />
          <DataField
            :title="$t('kaigi.status')"
            :value="formatStatus(detailState.data.relay.status)"
          />
          <DataField
            :title="$t('kaigi.hpkeFingerprint')"
            :value="detailState.data.relay.hpke_fingerprint_hex"
            monospace
          />
          <DataField
            :title="$t('kaigi.hpkePublicKey')"
            :value="detailState.data.hpke_public_key_b64"
            monospace
          />
          <DataField
            v-if="detailState.data.reported_by"
            :title="$t('kaigi.reportedBy')"
            :link="`/accounts/${detailState.data.reported_by.toString()}`"
            :hash="detailState.data.reported_by.toString()"
          />
          <DataField
            v-if="detailState.data.notes"
            :title="$t('kaigi.notes')"
            :value="detailState.data.notes"
          />
        </div>

        <div
          v-if="detailState.data.metrics"
          class="kaigi-relays-detail__metrics"
        >
          <h4>{{ $t('kaigi.domainMetrics') }}</h4>
          <div class="kaigi-relays-detail__grid">
            <DataField
              :title="$t('kaigi.registrationsTotal')"
              :value="detailState.data.metrics.registrations_total"
            />
            <DataField
              :title="$t('kaigi.manifestUpdatesTotal')"
              :value="detailState.data.metrics.manifest_updates_total"
            />
            <DataField
              :title="$t('kaigi.failoversTotal')"
              :value="detailState.data.metrics.failovers_total"
            />
            <DataField
              :title="$t('kaigi.healthReportsTotal')"
              :value="detailState.data.metrics.health_reports_total"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import * as http from '@/shared/api';
import type { KaigiRelaySummary, KaigiRelayDetail } from '@/shared/api/schemas';
import { useI18n } from 'vue-i18n';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import KaigiRelayEvents from '@/shared/ui/components/KaigiRelayEvents.vue';
import type { KaigiRelayEvent } from '@/shared/lib/kaigi';
import { computeKaigiRelayOverview } from '@/shared/lib/kaigi';
import { useDebounceFn } from '@vueuse/core';

const { t } = useI18n();

const relaysState = setupAsyncData(() => http.fetchKaigiRelays());
const healthState = setupAsyncData(() => http.fetchKaigiRelayHealthSnapshot());

const relays = computed(() =>
  relaysState.data?.status === SUCCESSFUL_FETCHING ? relaysState.data.data.items : ([] as KaigiRelaySummary[])
);
const healthSnapshot = computed(() =>
  healthState.data?.status === SUCCESSFUL_FETCHING ? healthState.data.data : null
);

const relayRowKey = (item: KaigiRelaySummary) => item.relay_id;
const domainMetricRowKey = (item: { domain: string }) => item.domain;

const overview = computed(() =>
  computeKaigiRelayOverview({
    relays: relays.value,
    snapshot: healthSnapshot.value,
  })
);
const isOverviewLoading = computed(() => overview.value === null && (healthState.isLoading || relaysState.isLoading));

const domainMetrics = computed(() => healthSnapshot.value?.domains ?? []);
const kaigiEventsStream = http.buildToriiUrl('/kaigi/relays/events');

const refetchKaigiOverview = useDebounceFn(() => {
  relaysState.refetch();
  healthState.refetch();
}, 750);

function handleKaigiEvent(_event: KaigiRelayEvent) {
  refetchKaigiOverview();
}

const detailState = reactive({
  isOpen: false,
  isLoading: false,
  error: '',
  data: null as KaigiRelayDetail | null,
});

function formatStatus(status: KaigiRelaySummary['status']) {
  if (!status) return t('kaigi.statusUnknown');
  return t(`kaigi.statusLabels.${status.toLowerCase()}`);
}

function statusClass(status: KaigiRelaySummary['status']) {
  if (!status) return 'unknown';
  return status.toLowerCase();
}

async function handleRowClick(item: KaigiRelaySummary) {
  detailState.isOpen = true;
  detailState.isLoading = true;
  detailState.error = '';
  detailState.data = null;
  const response = await http.fetchKaigiRelayDetail(item.relay_id);
  if (response.status === SUCCESSFUL_FETCHING) {
    detailState.data = response.data;
  } else if (response.status === NOT_FOUND) {
    detailState.error = t('kaigi.relayNotFound');
  } else {
    detailState.error = t('kaigi.relayError');
  }
  detailState.isLoading = false;
}

function closeDetail() {
  detailState.isOpen = false;
  detailState.error = '';
  detailState.data = null;
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.kaigi-relays-page {
  display: flex;
  flex-direction: column;
  gap: size(3);
  background: radial-gradient(circle at 20% 20%, rgba(theme-color('primary'), 0.08), transparent 40%),
    radial-gradient(circle at 80% 10%, rgba(theme-color('primary'), 0.05), transparent 35%),
    theme-color('background');
  padding: size(2.5);
  border-radius: size(3);
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 30px 60px rgba(theme-color('primary'), 0.08),
    0 6px 18px rgba(theme-color('background'), 0.28);

  &::after {
    content: '';
    position: absolute;
    inset: 5% 10%;
    background: radial-gradient(ellipse at center, rgba(theme-color('primary'), 0.08), transparent 50%);
    filter: blur(40px);
    opacity: 0.6;
    pointer-events: none;
  }

  :deep(.base-content-block__header) {
    padding: size(2.5) size(3);
  }

  :deep(.base-content-block__body) {
    padding: 0 size(3) size(3);
  }

  &__snapshot {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(2.5);

    &--empty {
      @include tpg-s3;
      color: theme-color('content-primary');
    }
  }

  &__stat {
    border: 1px solid color-mix(in srgb, theme-color('primary') 30%, theme-color('border-primary'));
    border-radius: size(2);
    padding: size(2.5);
    background: linear-gradient(140deg, rgba(theme-color('surface'), 0.95), rgba(theme-color('surface-variant'), 0.85));
    box-shadow:
      0 20px 40px rgba(theme-color('primary'), 0.08),
      0 4px 12px rgba(theme-color('background'), 0.3);
    backdrop-filter: blur(10px);

    .label {
      @include tpg-s4;
      color: theme-color('content-secondary');
      letter-spacing: 0.3px;
    }

    .value {
      display: block;
      margin-top: size(1.5);
      font-size: size(3.5);
      font-weight: 700;

      &.healthy {
        color: theme-color('success');
      }

      &.degraded {
        color: theme-color('warning');
      }

      &.unavailable {
        color: theme-color('error');
      }

      &.unknown {
        color: theme-color('content-secondary');
      }
    }
  }

  &__table {
    background: rgba(theme-color('surface'), 0.9);
    border-radius: size(3);
    border: 1px solid theme-color('border-primary');
    box-shadow: 0 18px 36px rgba(theme-color('primary'), 0.06);
    backdrop-filter: blur(6px);

    :deep(.content-row) {
      padding: size(2.5) size(3);
    }

    :deep(.content-row_empty) {
      justify-content: center;
    }
  }

  &__empty {
    padding: size(2.5) size(3);
  }

  &__row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: size(1.5);
    align-items: center;
    width: 100%;

    .cell {
      display: flex;
      align-items: center;
      gap: size(1);
      min-width: 0;
    }

    @include lg {
      grid-template-columns: 1.4fr 1fr 1fr 1fr 1.2fr;
    }
  }
}

.status-pill {
  padding: size(0.5) size(2);
  border-radius: size(1);
  font-size: size(1.5);
  text-transform: capitalize;

  &.healthy {
    background: color-mix(in srgb, theme-color('success') 10%, transparent);
    color: theme-color('success');
  }

  &.degraded {
    background: color-mix(in srgb, theme-color('warning') 10%, transparent);
    color: theme-color('warning');
  }

  &.unavailable {
    background: color-mix(in srgb, theme-color('error') 10%, transparent);
    color: theme-color('error');
  }

  &.unknown {
    background: theme-color('border-primary');
    color: theme-color('content-secondary');
  }
}

.kaigi-relays-detail {
  border: 1px solid theme-color('border-primary');
  border-radius: size(2);
  padding: size(4);
  display: flex;
  flex-direction: column;
  gap: size(3);
  background: linear-gradient(160deg, rgba(theme-color('surface'), 0.96), rgba(theme-color('surface-variant'), 0.9));
  box-shadow:
    0 12px 30px rgba(theme-color('primary'), 0.08),
    0 4px 10px rgba(theme-color('background'), 0.3);
  backdrop-filter: blur(8px);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
      margin: 0;
    }
  }

  &__header-actions {
    display: flex;
    gap: size(2);
  }

  &__close {
    border: none;
    background: theme-color('border-primary');
    padding: size(1) size(3);
    border-radius: size(1);
    cursor: pointer;
  }

  &__error {
    color: theme-color('error');
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: size(3);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: size(2);
  }
}

html:not(.dark) .kaigi-relays-page {
  background: radial-gradient(circle at 20% 20%, rgba(theme-color('primary'), 0.04), transparent 44%),
    radial-gradient(circle at 80% 10%, rgba(theme-color('info'), 0.03), transparent 40%),
    theme-color('background');
  box-shadow:
    0 20px 44px rgba(17, 24, 39, 0.1),
    0 4px 12px rgba(17, 24, 39, 0.06);

  &::after {
    background: radial-gradient(ellipse at center, rgba(theme-color('primary'), 0.04), transparent 54%);
    filter: blur(32px);
    opacity: 0.48;
  }

  &__stat {
    border-color: color-mix(in srgb, theme-color('border-primary') 90%, white);
    background: theme-color('surface');
    box-shadow:
      0 12px 28px rgba(17, 24, 39, 0.08),
      0 2px 6px rgba(17, 24, 39, 0.06);
    backdrop-filter: none;
  }

  &__table {
    background: theme-color('surface');
    border-color: color-mix(in srgb, theme-color('border-primary') 90%, white);
    box-shadow: 0 16px 34px rgba(17, 24, 39, 0.09);
    backdrop-filter: none;
  }
}

html:not(.dark) .kaigi-relays-detail {
  border-color: color-mix(in srgb, theme-color('border-primary') 92%, white);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, theme-color('surface') 98%, white),
    color-mix(in srgb, theme-color('surface-variant') 92%, white)
  );
  box-shadow:
    0 14px 34px rgba(17, 24, 39, 0.1),
    0 3px 10px rgba(17, 24, 39, 0.06);
  backdrop-filter: none;

  &__close {
    background: theme-color('surface-variant');
    border: 1px solid theme-color('border-primary');
    color: theme-color('content-primary');
  }
}

@media (dynamic-range: high), (video-dynamic-range: high) {
  @supports (color: color(display-p3 1 1 1)) {
    html.dark .kaigi-relays-page {
      background: radial-gradient(
          circle at 20% 20%,
          color-mix(in display-p3, theme-color('primary') 22%, transparent),
          transparent 48%
        ),
        radial-gradient(circle at 80% 10%, color-mix(in display-p3, theme-color('primary') 14%, transparent), transparent 42%),
        theme-color('background');
      box-shadow:
        0 34px 74px rgba(theme-color('primary'), 0.16),
        0 12px 30px rgba(theme-color('background'), 0.36);

      &::after {
        background: radial-gradient(
          ellipse at center,
          color-mix(in display-p3, theme-color('primary') 22%, transparent),
          transparent 56%
        );
        opacity: 0.78;
      }

      &__stat {
        border-color: color-mix(in display-p3, theme-color('primary') 45%, theme-color('border-primary'));
        background: linear-gradient(
          140deg,
          color-mix(in display-p3, theme-color('surface') 97%, transparent),
          color-mix(in display-p3, theme-color('surface-variant') 89%, transparent)
        );
        box-shadow:
          0 22px 46px rgba(theme-color('primary'), 0.15),
          0 6px 14px rgba(theme-color('background'), 0.34);
      }

      &__table {
        background: color-mix(in display-p3, theme-color('surface') 93%, transparent);
        border-color: color-mix(in display-p3, theme-color('primary') 25%, theme-color('border-primary'));
        box-shadow: 0 22px 44px rgba(theme-color('primary'), 0.14);
      }
    }

    html.dark .status-pill {
      &.healthy {
        background: color-mix(in display-p3, theme-color('success') 20%, transparent);
      }

      &.degraded {
        background: color-mix(in display-p3, theme-color('warning') 20%, transparent);
      }

      &.unavailable {
        background: color-mix(in display-p3, theme-color('error') 20%, transparent);
      }
    }

    html.dark .kaigi-relays-detail {
      border-color: color-mix(in display-p3, theme-color('primary') 30%, theme-color('border-primary'));
      background: linear-gradient(
        160deg,
        color-mix(in display-p3, theme-color('surface') 98%, transparent),
        color-mix(in display-p3, theme-color('surface-variant') 92%, transparent)
      );
      box-shadow:
        0 16px 36px rgba(theme-color('primary'), 0.16),
        0 6px 14px rgba(theme-color('background'), 0.34);
    }
  }
}
</style>
