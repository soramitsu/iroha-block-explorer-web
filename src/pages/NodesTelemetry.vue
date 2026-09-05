<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { ExplorerHealth, PeerInfo, PeerStatus } from '@/shared/api/schemas';
import { formatNumber } from '@/shared/ui/utils/formatters';
import { usePeersTelemetry } from '@/shared/ui/composables/usePeersTelemetry';

defineOptions({
  name: 'NodesTelemetryPage',
});

const { t } = useI18n();
const health = ref<ExplorerHealth | null>(null);
const isHealthLoading = ref(true);
const { metrics: liveMetrics, streamStatus, peers, propagation, isPeersLoading } = usePeersTelemetry();
const isLoading = computed(() => isHealthLoading.value || isPeersLoading.value);

const streamStatusLabel = computed(() => {
  switch (streamStatus.value) {
    case 'OPEN':
      return t('telemetry.statusConnected');
    case 'CONNECTING':
      return t('telemetry.statusConnecting');
    default:
      return t('telemetry.statusDisconnected');
  }
});

const streamStatusTone = computed(() => streamStatus.value.toLowerCase());

interface PublicPeerRow {
  info: PeerInfo;
  status: PeerStatus | null;
}

interface DurationValue {
  ms: number;
}

const peerRows = computed<PublicPeerRow[]>(() =>
  peers.value
    .filter((row): row is PublicPeerRow => row.info !== null)
    .sort((left, right) => left.info.url.localeCompare(right.info.url))
);
const propagationRows = computed(() => [...propagation.value].sort((left, right) => right.block - left.block));
const loadError = computed(() =>
  !isLoading.value && !health.value && peerRows.value.length === 0 ? t('telemetry.telemetryUnavailable') : null
);

async function loadPublicHealth() {
  isHealthLoading.value = true;

  try {
    const healthResponse = await http.fetchExplorerHealth();

    if (healthResponse.status === SUCCESSFUL_FETCHING) {
      health.value = healthResponse.data;
    }
  } catch {
    health.value = null;
  } finally {
    isHealthLoading.value = false;
  }
}

function peerRowKey(row: PublicPeerRow) {
  return row.info.url;
}

function peerLocation(peer: PeerInfo) {
  if (!peer.location) return '—';
  return [peer.location.city, peer.location.country].filter(Boolean).join(', ') || '—';
}

function displayDate(value: Date | null | undefined) {
  return value ? value.toLocaleString() : '—';
}

function displayEpochMilliseconds(value: number | undefined) {
  return typeof value === 'number' ? new Date(value).toLocaleString() : '—';
}

function displayDuration(value: DurationValue | null | undefined) {
  return value ? t('units.milliseconds', { value: formatNumber(value.ms) }) : '—';
}

function displayOptionalNumber(value: number | undefined) {
  return typeof value === 'number' ? formatNumber(value) : '—';
}

function displayGossipConfig(size: number | undefined, period: DurationValue | undefined) {
  return t('telemetry.networkGossipDetails', [displayOptionalNumber(size), period ? formatNumber(period.ms) : '—']);
}

onMounted(() => {
  loadPublicHealth();
});
</script>

<template>
  <div class="nodes-telemetry-page">
    <BaseContentBlock :title="$t('telemetry.telemetry')">
      <template #header-action>
        <span
          class="nodes-telemetry-page__stream"
          :data-status="streamStatusTone"
          data-test="public-telemetry-stream-status"
        >
          {{ streamStatusLabel }}
        </span>
      </template>

      <template #default>
        <BaseLoading v-if="isLoading && !health" />
        <p v-if="loadError" class="nodes-telemetry-page__error row-text" data-test="public-telemetry-error">
          {{ loadError }}
        </p>

        <div v-if="health" class="nodes-telemetry-page__grid" data-test="explorer-health">
          <DataField :title="$t('telemetry.bestBlock')" :value="formatNumber(health.head_height)" monospace />
          <DataField :title="$t('telemetry.lastBlock')" :value="displayDate(health.head_created_at)" />
          <DataField :title="$t('telemetry.healthSampledAt')" :value="displayDate(health.sampled_at)" />
        </div>

        <div v-if="liveMetrics" class="nodes-telemetry-page__grid" data-test="public-live-metrics">
          <DataField :title="$t('telemetry.peers')" :value="formatNumber(liveMetrics.peers)" monospace />
          <DataField :title="$t('telemetry.domains')" :value="formatNumber(liveMetrics.domains)" monospace />
          <DataField :title="$t('telemetry.accounts')" :value="formatNumber(liveMetrics.accounts)" monospace />
          <DataField :title="$t('telemetry.assets')" :value="formatNumber(liveMetrics.assets)" monospace />
          <DataField
            :title="$t('telemetry.block')"
            :value="formatNumber(liveMetrics.block)"
            monospace
            data-test="live-block"
          />
          <DataField
            :title="$t('telemetry.lastBlock')"
            :value="displayDate(liveMetrics.block_created_at)"
            data-test="live-block-created-at"
          />
          <DataField
            :title="$t('telemetry.finalizedBlock')"
            :value="formatNumber(liveMetrics.finalized_block)"
            monospace
          />
          <DataField
            :title="$t('telemetry.averageBlockCommitTime')"
            :value="displayDuration(liveMetrics.avg_commit_time)"
            monospace
            data-test="live-average-commit-time"
          />
          <DataField
            :title="$t('telemetry.averageBlockTime')"
            :value="displayDuration(liveMetrics.avg_block_time)"
            monospace
            data-test="live-average-block-time"
          />
          <DataField
            :title="$t('telemetry.acceptedTransactions')"
            :value="formatNumber(liveMetrics.transactions_accepted)"
            monospace
          />
          <DataField
            :title="$t('telemetry.rejectedTransactions')"
            :value="formatNumber(liveMetrics.transactions_rejected)"
            monospace
          />
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('telemetry.propagationSpread')">
      <template #default>
        <BaseTable
          :items="propagationRows"
          :row-key="(item) => item.block"
          :disable-pagination="true"
          :loading="isPeersLoading"
          container-class="nodes-telemetry-page__table"
        >
          <template #header>
            <div class="nodes-telemetry-page__propagation-row nodes-telemetry-page__row--header" role="row">
              <span role="columnheader">{{ $t('telemetry.block') }}</span>
              <span role="columnheader">{{ $t('telemetry.firstSeenAt') }}</span>
              <span role="columnheader">{{ $t('telemetry.lastSeenAt') }}</span>
              <span role="columnheader">{{ $t('telemetry.propagationSpread') }}</span>
              <span role="columnheader">{{ $t('telemetry.nodes') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="nodes-telemetry-page__propagation-row" role="row" data-test="public-propagation-row">
              <span role="cell">{{ formatNumber(item.block) }}</span>
              <span role="cell" data-test="propagation-first-seen-at">{{
                displayEpochMilliseconds(item.first_seen_at_ms)
              }}</span>
              <span role="cell" data-test="propagation-last-seen-at">{{
                displayEpochMilliseconds(item.last_seen_at_ms)
              }}</span>
              <span role="cell">{{ $t('units.milliseconds', { value: formatNumber(item.spread_ms) }) }}</span>
              <span role="cell">{{ formatNumber(item.peers_reported) }}</span>
            </div>
          </template>
        </BaseTable>
        <p
          v-if="!isPeersLoading && propagationRows.length === 0"
          class="nodes-telemetry-page__empty row-text"
          data-test="public-propagation-empty"
        >
          {{ $t('telemetry.noData') }}
        </p>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('telemetry.nodes')">
      <template #default>
        <BaseTable
          :items="peerRows"
          :row-key="peerRowKey"
          :disable-pagination="true"
          :loading="isLoading"
          container-class="nodes-telemetry-page__table"
        >
          <template #header>
            <div class="nodes-telemetry-page__row nodes-telemetry-page__row--header" role="row">
              <span role="columnheader">{{ $t('telemetry.connectionStatus') }}</span>
              <span role="columnheader">{{ $t('telemetry.publicUrl') }}</span>
              <span role="columnheader">{{ $t('telemetry.location') }}</span>
              <span role="columnheader">{{ $t('telemetry.connectedPeers') }}</span>
              <span role="columnheader">{{ $t('telemetry.block') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="nodes-telemetry-page__peer-record" data-test="public-peer-row">
              <div class="nodes-telemetry-page__row" role="row">
                <span role="cell">{{
                  item.info.connected ? $t('telemetry.connected') : $t('telemetry.disconnected')
                }}</span>
                <span class="row-text-monospace" role="cell">{{ item.info.url }}</span>
                <span role="cell">{{ peerLocation(item.info) }}</span>
                <span role="cell">{{ item.info.connected_peers?.length ?? '—' }}</span>
                <span role="cell">{{ item.status ? formatNumber(item.status.block) : '—' }}</span>
              </div>

              <details class="nodes-telemetry-page__peer-details">
                <summary>{{ $t('telemetry.details') }}</summary>
                <div class="nodes-telemetry-page__peer-details-grid" data-test="public-peer-details">
                  <DataField
                    :title="$t('telemetry.publicKey')"
                    :value="item.info.config?.public_key ?? '—'"
                    monospace
                    data-test="peer-public-key"
                  />
                  <DataField
                    :title="$t('telemetry.queueCapacity')"
                    :value="displayOptionalNumber(item.info.config?.queue_capacity)"
                    monospace
                    data-test="peer-queue-capacity"
                  />
                  <DataField
                    :title="$t('telemetry.blocksGossiping')"
                    :value="
                      displayGossipConfig(
                        item.info.config?.network_block_gossip_size,
                        item.info.config?.network_block_gossip_period
                      )
                    "
                    monospace
                    data-test="peer-block-gossip"
                  />
                  <DataField
                    :title="$t('telemetry.tnxsGossiping')"
                    :value="
                      displayGossipConfig(
                        item.info.config?.network_tx_gossip_size,
                        item.info.config?.network_tx_gossip_period
                      )
                    "
                    monospace
                    data-test="peer-transaction-gossip"
                  />
                  <DataField
                    :title="$t('telemetry.commitTime')"
                    :value="displayDuration(item.status?.commit_time)"
                    monospace
                    data-test="peer-commit-time"
                  />
                  <DataField
                    :title="$t('telemetry.avgCommitTime')"
                    :value="displayDuration(item.status?.avg_commit_time)"
                    monospace
                    data-test="peer-average-commit-time"
                  />
                  <DataField
                    :title="$t('telemetry.statusRtt')"
                    :value="displayDuration(item.status?.status_rtt)"
                    monospace
                    data-test="peer-status-rtt"
                  />
                  <DataField
                    :title="$t('telemetry.statusRttAverage')"
                    :value="displayDuration(item.status?.status_rtt_avg)"
                    monospace
                    data-test="peer-status-rtt-average"
                  />
                  <DataField
                    :title="$t('telemetry.statusRttP95')"
                    :value="displayDuration(item.status?.status_rtt_p95)"
                    monospace
                    data-test="peer-status-rtt-p95"
                  />
                  <DataField
                    :title="$t('telemetry.queue')"
                    :value="displayOptionalNumber(item.status?.queue_size)"
                    monospace
                    data-test="peer-queue-size"
                  />
                  <DataField
                    :title="$t('telemetry.uptime')"
                    :value="displayDuration(item.status?.uptime)"
                    monospace
                    data-test="peer-uptime"
                  />
                  <DataField
                    :title="$t('telemetry.propagationTime')"
                    :value="displayDuration(item.status?.propagation_time)"
                    monospace
                    data-test="peer-propagation-time"
                  />
                  <DataField
                    :title="$t('telemetry.observedAt')"
                    :value="displayEpochMilliseconds(item.status?.observed_at_ms)"
                    data-test="peer-observed-at"
                  />
                </div>
              </details>
            </div>
          </template>
        </BaseTable>
        <p
          v-if="!isLoading && peerRows.length === 0"
          class="nodes-telemetry-page__empty row-text"
          data-test="public-peers-empty"
        >
          {{ $t('telemetry.telemetryUnavailable') }}
        </p>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('telemetry.operatorBoundary.title')">
      <template #default>
        <div class="nodes-telemetry-page__boundary" data-test="operator-telemetry-boundary">
          <strong>{{ $t('telemetry.operatorBoundary.protected') }}</strong>
          <p>
            {{ $t('telemetry.operatorBoundary.description') }}
          </p>
          <p>
            {{ $t('telemetry.operatorBoundary.publicDescription') }}
          </p>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.nodes-telemetry-page {
  display: grid;
  gap: size(3);

  &__stream {
    border: 1px solid theme-color('border-primary');
    border-radius: 999px;
    padding: size(0.5) size(1);
    color: theme-color('content-secondary');
    @include tpg-s4;

    &[data-status='open'] {
      color: theme-color('success');
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(1.5);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }
  }

  &__table {
    min-width: 720px;
  }

  &__row {
    display: grid;
    grid-template-columns: 120px minmax(240px, 2fr) minmax(140px, 1fr) 130px 100px;
    gap: size(1);
    align-items: center;
    padding: size(1.25) size(2);

    &--header {
      color: theme-color('content-secondary');
      @include tpg-s4;
    }
  }

  &__propagation-row {
    display: grid;
    grid-template-columns: minmax(90px, 0.6fr) repeat(2, minmax(180px, 1.5fr)) repeat(2, minmax(120px, 1fr));
    gap: size(1);
    align-items: center;
    padding: size(1.25) size(2);
  }

  &__peer-record {
    border-bottom: 1px solid theme-color('border-primary');
  }

  &__peer-details {
    padding: 0 size(2) size(1.5);

    summary {
      width: fit-content;
      cursor: pointer;
      color: theme-color('content-secondary');
      @include tpg-s4;
    }
  }

  &__peer-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(1.5);
    padding-top: size(1.5);
  }

  &__boundary,
  &__empty,
  &__error {
    margin: 0;
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }
  }

  &__boundary {
    display: grid;
    gap: size(1);
    color: theme-color('content-secondary');

    strong {
      color: theme-color('content-primary');
    }

    p {
      margin: 0;
    }
  }

  &__error {
    color: theme-color('error');
  }
}
</style>
