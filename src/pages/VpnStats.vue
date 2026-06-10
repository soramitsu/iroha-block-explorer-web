<template>
  <div class="vpn-stats-page">
    <BaseContentBlock :title="$t('vpn.overviewTitle')">
      <template #header-action>
        <span class="vpn-stats-page__source">
          {{ $t('vpn.source') }}: {{ toriiBaseUrl }}
        </span>
      </template>

      <div
        v-if="metricsRequest.isLoading && !vpnMetrics"
        class="vpn-stats-page__state"
      >
        <BaseLoading />
      </div>

      <div
        v-else-if="metricsAvailable"
        class="vpn-stats-page__card-grid"
      >
        <article
          v-for="card in overviewCards"
          :key="card.key"
          class="vpn-stats-page__card"
        >
          <span class="vpn-stats-page__card-label">{{ card.label }}</span>
          <span
            class="vpn-stats-page__card-value"
            :class="card.toneClass"
          >
            {{ card.value }}
          </span>
        </article>
      </div>

      <div
        v-else
        class="vpn-stats-page__state vpn-stats-page__state--error"
      >
        {{ $t('vpn.unavailable') }}
      </div>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('vpn.breakdownTitle')">
      <div
        v-if="metricsRequest.isLoading && !vpnMetrics"
        class="vpn-stats-page__state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="metricsAvailable">
        <BaseInnerBlock :title="$t('vpn.trafficClassesTitle')">
          <div class="vpn-stats-page__traffic-grid">
            <article
              v-for="row in trafficRows"
              :key="row.key"
              class="vpn-stats-page__traffic-card"
            >
              <span class="vpn-stats-page__card-label">{{ row.label }}</span>
              <span class="vpn-stats-page__traffic-total">{{ row.total }}</span>
              <div class="vpn-stats-page__traffic-meta">
                <span>{{ $t('vpn.ingress') }}: {{ row.ingress }}</span>
                <span>{{ $t('vpn.egress') }}: {{ row.egress }}</span>
              </div>
            </article>
          </div>
        </BaseInnerBlock>

        <BaseInnerBlock :title="$t('vpn.receiptsTitle')">
          <div class="vpn-stats-page__card-grid vpn-stats-page__card-grid--compact">
            <article
              v-for="card in receiptCards"
              :key="card.key"
              class="vpn-stats-page__card"
            >
              <span class="vpn-stats-page__card-label">{{ card.label }}</span>
              <span class="vpn-stats-page__card-value">{{ card.value }}</span>
            </article>
          </div>
        </BaseInnerBlock>
      </template>

      <div
        v-else
        class="vpn-stats-page__state vpn-stats-page__state--error"
      >
        {{ $t('vpn.unavailable') }}
      </div>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('vpn.countriesTitle')">
      <div
        v-if="countriesRequest.isLoading && !countriesRequest.data"
        class="vpn-stats-page__state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="countriesAvailable">
        <BaseTable
          :loading="countriesRequest.isLoading"
          :items="countryRows"
          :row-key="countryRowKey"
          :disable-pagination="true"
          container-class="vpn-stats-page__countries-table"
        >
          <template #header>
            <div class="vpn-stats-page__countries-row vpn-stats-page__countries-row--header">
              <span>{{ $t('vpn.country') }}</span>
              <span>{{ $t('vpn.peers') }}</span>
              <span>{{ $t('vpn.connectedPeers') }}</span>
            </div>
          </template>

          <template #row="{ item }">
            <div class="vpn-stats-page__countries-row">
              <span class="row-text">{{ item.country }}</span>
              <span class="row-text">{{ formatNumber(item.peerCount) }}</span>
              <span class="row-text">{{ formatNumber(item.connectedCount) }}</span>
            </div>
          </template>
        </BaseTable>
      </template>

      <div
        v-else
        class="vpn-stats-page__state vpn-stats-page__state--error"
      >
        {{ $t('vpn.countryDataUnavailable') }}
      </div>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseInnerBlock from '@/shared/ui/components/BaseInnerBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { fetchPeersInfo, fetchToriiMetricsText, getToriiBaseUrl } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { hasVpnMetrics, parseVpnMetricsSnapshot, summarizeVpnCountries } from '@/shared/lib/vpn';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { formatBytes, formatNumber } from '@/shared/ui/utils/formatters';

defineOptions({
  name: 'VpnStatsPage',
});

const { t } = useI18n();

const metricsRequest = setupAsyncData(() => fetchToriiMetricsText(), {
  interval: 10_000,
});

const countriesRequest = setupAsyncData(() => fetchPeersInfo(), {
  interval: 10_000,
});

const toriiBaseUrl = computed(() => getToriiBaseUrl());

watch(toriiBaseUrl, (next, previous) => {
  if (!previous || next === previous) return;
  metricsRequest.refetch();
  countriesRequest.refetch();
});

const vpnMetrics = computed(() => {
  const result = metricsRequest.data;
  if (result?.status !== SUCCESSFUL_FETCHING) return null;
  return parseVpnMetricsSnapshot(result.data);
});

const metricsAvailable = computed(() => vpnMetrics.value !== null && hasVpnMetrics(vpnMetrics.value));

const runtimeStateLabel = computed(() => t(`vpn.statusLabels.${vpnMetrics.value?.runtimeState ?? 'unknown'}`));

const overviewCards = computed(() => {
  if (!vpnMetrics.value) return [];

  return [
    {
      key: 'runtime',
      label: t('vpn.runtimeState'),
      value: runtimeStateLabel.value,
      toneClass: `vpn-stats-page__card-value--${vpnMetrics.value.runtimeState}`,
    },
    {
      key: 'sessions',
      label: t('vpn.sessions'),
      value: vpnMetrics.value.sessions === null ? '—' : formatNumber(vpnMetrics.value.sessions),
      toneClass: '',
    },
    {
      key: 'total',
      label: t('vpn.totalBytes'),
      value: vpnMetrics.value.totalBytes === null ? '—' : formatBytes(vpnMetrics.value.totalBytes),
      toneClass: '',
    },
    {
      key: 'ingress',
      label: t('vpn.ingressBytes'),
      value: vpnMetrics.value.ingressBytes === null ? '—' : formatBytes(vpnMetrics.value.ingressBytes),
      toneClass: '',
    },
    {
      key: 'egress',
      label: t('vpn.egressBytes'),
      value: vpnMetrics.value.egressBytes === null ? '—' : formatBytes(vpnMetrics.value.egressBytes),
      toneClass: '',
    },
  ];
});

const trafficRows = computed(() => {
  if (!vpnMetrics.value) return [];

  return [
    {
      key: 'data',
      label: t('vpn.dataBytes'),
      total: vpnMetrics.value.dataBytes === null ? '—' : formatBytes(vpnMetrics.value.dataBytes),
      ingress: vpnMetrics.value.dataIngressBytes === null ? '—' : formatBytes(vpnMetrics.value.dataIngressBytes),
      egress: vpnMetrics.value.dataEgressBytes === null ? '—' : formatBytes(vpnMetrics.value.dataEgressBytes),
    },
    {
      key: 'cover',
      label: t('vpn.coverBytes'),
      total: vpnMetrics.value.coverBytes === null ? '—' : formatBytes(vpnMetrics.value.coverBytes),
      ingress: vpnMetrics.value.coverIngressBytes === null ? '—' : formatBytes(vpnMetrics.value.coverIngressBytes),
      egress: vpnMetrics.value.coverEgressBytes === null ? '—' : formatBytes(vpnMetrics.value.coverEgressBytes),
    },
    {
      key: 'control',
      label: t('vpn.controlBytes'),
      total: vpnMetrics.value.controlBytes === null ? '—' : formatBytes(vpnMetrics.value.controlBytes),
      ingress: vpnMetrics.value.controlIngressBytes === null ? '—' : formatBytes(vpnMetrics.value.controlIngressBytes),
      egress: vpnMetrics.value.controlEgressBytes === null ? '—' : formatBytes(vpnMetrics.value.controlEgressBytes),
    },
  ];
});

const receiptCards = computed(() => {
  if (!vpnMetrics.value) return [];

  return [
    {
      key: 'receipt-ingress',
      label: t('vpn.receiptIngressBytes'),
      value: vpnMetrics.value.receiptIngressBytes === null ? '—' : formatBytes(vpnMetrics.value.receiptIngressBytes),
    },
    {
      key: 'receipt-egress',
      label: t('vpn.receiptEgressBytes'),
      value: vpnMetrics.value.receiptEgressBytes === null ? '—' : formatBytes(vpnMetrics.value.receiptEgressBytes),
    },
    {
      key: 'receipt-cover',
      label: t('vpn.receiptCoverBytes'),
      value: vpnMetrics.value.receiptCoverBytes === null ? '—' : formatBytes(vpnMetrics.value.receiptCoverBytes),
    },
  ];
});

const countryRows = computed(() => {
  const result = countriesRequest.data;
  if (result?.status !== SUCCESSFUL_FETCHING) return [];
  return summarizeVpnCountries(result.data).map((row) => ({
    ...row,
    country: row.key === 'unknown' ? t('vpn.unknownCountry') : row.country,
  }));
});

const countriesAvailable = computed(() => countriesRequest.data?.status === SUCCESSFUL_FETCHING);

const countryRowKey = (item: { key: string }) => item.key;
</script>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.vpn-stats-page {
  display: grid;
  gap: size(4);

  &__source {
    max-width: size(42);
    color: theme-color('content-secondary');
    word-break: break-all;
    text-align: right;
    @include tpg-s4;
  }

  &__state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: size(20);
    margin: 0 size(4);
    padding: size(4);
    border-radius: size(3);
    border: 1px dashed theme-color('border-primary');
    color: theme-color('content-secondary');
    text-align: center;
    @include tpg-s3;

    &--error {
      border-color: color-mix(in srgb, theme-color('warning') 35%, theme-color('border-primary'));
      color: theme-color('content-primary');
    }
  }

  &__card-grid {
    display: grid;
    gap: size(2);
    padding: 0 size(4);
    grid-template-columns: repeat(auto-fit, minmax(size(22), 1fr));

    &--compact {
      padding: 0;
    }
  }

  &__card {
    display: grid;
    gap: size(1);
    min-height: size(14);
    padding: size(2.5);
    border-radius: size(3);
    border: 1px solid color-mix(in srgb, theme-color('border-primary') 70%, transparent);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 96%, white),
      color-mix(in srgb, theme-color('surface-variant') 92%, white)
    );
  }

  &__card-label {
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__card-value {
    color: theme-color('content-primary');
    @include tpg-h4;

    &--active {
      color: color-mix(in srgb, theme-color('success') 85%, theme-color('content-primary'));
    }

    &--stubbed {
      color: color-mix(in srgb, theme-color('warning') 90%, theme-color('content-primary'));
    }

    &--disabled,
    &--unknown {
      color: theme-color('content-secondary');
    }
  }

  &__traffic-grid {
    display: grid;
    gap: size(2);
    grid-template-columns: repeat(auto-fit, minmax(size(22), 1fr));
  }

  &__traffic-card {
    display: grid;
    gap: size(1.25);
    padding: size(2.5);
    border-radius: size(3);
    border: 1px solid color-mix(in srgb, theme-color('border-primary') 70%, transparent);
    background: color-mix(in srgb, theme-color('surface') 94%, transparent);
  }

  &__traffic-total {
    color: theme-color('content-primary');
    @include tpg-h4;
  }

  &__traffic-meta {
    display: grid;
    gap: size(0.5);
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__countries-table {
    display: grid;
  }

  &__countries-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(size(8), 1fr) minmax(size(8), 1fr);
    gap: size(2);
    align-items: center;
    padding: 0 size(4);

    &--header {
      color: theme-color('content-secondary');
      @include tpg-s4;
    }
  }
}
</style>
