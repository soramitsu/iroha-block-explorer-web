<template>
  <div class="dataspaces-page">
    <BaseContentBlock :title="$t('dataspaces.overviewTitle')">
      <template #default>
        <div class="dataspaces-page__controls">
          <button
            type="button"
            class="dataspaces-page__refresh"
            :disabled="state.isLoading"
            data-test="dataspaces-refresh"
            @click="loadStatus"
          >
            {{ state.isLoading ? $t('dataspaces.loading') : $t('dataspaces.refresh') }}
          </button>
          <p
            v-if="state.lastUpdated"
            class="dataspaces-page__updated"
            data-test="dataspaces-updated"
          >
            {{ $t('dataspaces.updatedAt', { value: state.lastUpdated }) }}
          </p>
        </div>

        <p class="dataspaces-page__hint">
          {{ $t('dataspaces.overviewHint') }}
        </p>
        <p class="dataspaces-page__meta">
          {{ $t('dataspaces.overviewSystemIds') }}
        </p>
        <p class="dataspaces-page__meta">
          {{ $t('dataspaces.overviewLifetimeTx') }}
        </p>

        <BaseLoading
          v-if="state.isLoading && !state.status"
          data-test="dataspaces-loading"
        />

        <p
          v-else-if="state.error"
          class="dataspaces-page__error"
          data-test="dataspaces-error"
        >
          {{ state.error }}
        </p>

        <div
          v-else-if="state.status"
          class="dataspaces-page__stats"
          data-test="dataspaces-stats"
        >
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.totalDataspacesRegistered') }}</span>
            <span class="value">{{ summaryStats.totalDataspaces }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.totalDataspacesCustom') }}</span>
            <span class="value">{{ summaryStats.customDataspaces }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.totalBacklog') }}</span>
            <span class="value">{{ summaryStats.totalBacklog }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.totalLifetimeServed') }}</span>
            <span class="value">{{ summaryStats.totalTxServed }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.nodeBlockHeight') }}</span>
            <span class="value">{{ summaryStats.blocks }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.nodeQueueSize') }}</span>
            <span class="value">{{ summaryStats.queueSize }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.nodeApprovedTx') }}</span>
            <span class="value">{{ summaryStats.txsApproved }}</span>
          </div>
          <div class="dataspaces-page__stat">
            <span class="label">{{ $t('dataspaces.nodeRejectedTx') }}</span>
            <span class="value">{{ summaryStats.txsRejected }}</span>
          </div>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock
      v-if="state.status"
      :title="$t('dataspaces.dataspacesTable')"
    >
      <template #default>
        <BaseTable
          :items="dataspaces"
          :loading="state.isLoading"
          :row-key="dataspaceRowKey"
          container-class="dataspaces-page__table"
          :disable-pagination="true"
          row-pointer
          @click:row="openDataspace"
        >
          <template #header>
            <span class="dataspaces-page__cell dataspaces-page__cell--header">
              {{ $t('dataspaces.dataspace') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header dataspaces-page__cell--numeric">
              {{ $t('dataspaces.lane') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header dataspaces-page__cell--numeric">
              {{ $t('dataspaces.faultToleranceShort') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header dataspaces-page__cell--numeric">
              {{ $t('dataspaces.backlog') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header dataspaces-page__cell--numeric">
              {{ $t('dataspaces.ageSlots') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header dataspaces-page__cell--numeric">
              {{ $t('dataspaces.lifetimeTxServed') }}
            </span>
          </template>

          <template #row="{ item }">
            <span class="dataspaces-page__cell row-text">{{ dataspaceLabel(item) }}</span>
            <span class="dataspaces-page__cell dataspaces-page__cell--numeric row-text">{{ item.lane_summary }}</span>
            <span class="dataspaces-page__cell dataspaces-page__cell--numeric row-text">{{ item.fault_tolerance }}</span>
            <span class="dataspaces-page__cell dataspaces-page__cell--numeric row-text">{{ item.backlog }}</span>
            <span class="dataspaces-page__cell dataspaces-page__cell--numeric row-text">{{ item.age_slots }}</span>
            <span class="dataspaces-page__cell dataspaces-page__cell--numeric row-text">{{ item.tx_served }}</span>
          </template>

          <template #mobile-card="{ item }">
            <div class="dataspaces-page__mobile-card">
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.dataspace') }}</span>
                <span class="row-text">{{ dataspaceLabel(item) }}</span>
              </div>
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.lane') }}</span>
                <span class="row-text">{{ item.lane_summary }}</span>
              </div>
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.faultToleranceShort') }}</span>
                <span class="row-text">{{ item.fault_tolerance }}</span>
              </div>
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.backlog') }}</span>
                <span class="row-text">{{ item.backlog }}</span>
              </div>
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.ageSlots') }}</span>
                <span class="row-text">{{ item.age_slots }}</span>
              </div>
              <div class="dataspaces-page__mobile-row">
                <span class="label">{{ $t('dataspaces.lifetimeTxServed') }}</span>
                <span class="row-text">{{ item.tx_served }}</span>
              </div>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import * as http from '@/shared/api';
import type { NexusPublicStatus, NexusStatusDataspaceBacklog } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

defineOptions({
  name: 'DataspacesPage',
});

type DataspaceOverviewRow = Omit<NexusStatusDataspaceBacklog, 'lane_id' | 'backlog' | 'age_slots' | 'tx_served'> & {
  lane_ids: number[]
  representative_lane_id: number
  lane_summary: string
  backlog: number
  age_slots: number
  tx_served: number
}

const { t } = useI18n();
const navigation = useScopedExplorerNavigation();

const state = reactive<{
  isLoading: boolean
  error: string | null
  status: NexusPublicStatus | null
  lastUpdated: string | null
}>({
  isLoading: false,
  error: null,
  status: null,
  lastUpdated: null,
});

const CANONICAL_LANE_BY_ALIAS: Record<string, number> = {
  universal: 0,
  governance: 1,
  zk: 2,
  sbp: 3,
  cbuae: 4,
};

function pickRepresentativeLane(rows: NexusStatusDataspaceBacklog[]): number {
  const alias = rows[0]?.alias?.toLowerCase() ?? '';
  const preferredLane = CANONICAL_LANE_BY_ALIAS[alias];
  if (typeof preferredLane === 'number' && rows.some((item) => item.lane_id === preferredLane)) return preferredLane;
  return rows[0]?.lane_id ?? 0;
}

const dataspaces = computed<DataspaceOverviewRow[]>(() => {
  const entries = state.status?.teu_dataspace_backlog ?? [];
  const grouped = new Map<number, NexusStatusDataspaceBacklog[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.dataspace_id);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(entry.dataspace_id, [entry]);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, rows]) => {
      const sortedRows = [...rows].sort((left, right) => left.lane_id - right.lane_id);
      const representativeLane = pickRepresentativeLane(sortedRows);
      const primary = sortedRows.find((item) => item.lane_id === representativeLane) ?? sortedRows[0];
      const laneIds = sortedRows.map((item) => item.lane_id);

      return {
        ...primary,
        representative_lane_id: representativeLane,
        lane_ids: laneIds,
        lane_summary: laneIds.join(', '),
        backlog: sortedRows.reduce((sum, item) => sum + item.backlog, 0),
        age_slots: sortedRows.reduce((max, item) => Math.max(max, item.age_slots), 0),
        tx_served: sortedRows.reduce((sum, item) => sum + item.tx_served, 0),
      };
    });
});

const summaryStats = computed(() => {
  const entries = dataspaces.value;
  return {
    totalDataspaces: entries.length,
    customDataspaces: entries.filter((item) => item.dataspace_id >= 10).length,
    totalBacklog: entries.reduce((sum, item) => sum + item.backlog, 0),
    totalTxServed: entries.reduce((sum, item) => sum + item.tx_served, 0),
    blocks: state.status?.blocks ?? 0,
    queueSize: state.status?.queue_size ?? 0,
    txsApproved: state.status?.txs_approved ?? 0,
    txsRejected: state.status?.txs_rejected ?? 0,
  };
});

function dataspaceRowKey(item: DataspaceOverviewRow) {
  return String(item.dataspace_id);
}

function dataspaceLabel(item: Pick<DataspaceOverviewRow, 'alias' | 'dataspace_id'>): string {
  return item.alias ? `${item.alias} (#${item.dataspace_id})` : `#${item.dataspace_id}`;
}

function openDataspace(item: DataspaceOverviewRow) {
  navigation.push({
    name: 'dataspaces-details',
    params: {
      laneId: String(item.representative_lane_id),
      dataspaceId: String(item.dataspace_id),
    },
  }).catch(() => {});
}

async function loadStatus() {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await http.fetchNexusPublicStatus();

    if (response.status === SUCCESSFUL_FETCHING) {
      state.status = response.data;
      state.lastUpdated = new Date().toLocaleString();
      return;
    }

    state.status = null;
    state.error = t('dataspaces.loadFailed');
  } catch {
    state.status = null;
    state.error = t('dataspaces.loadFailed');
  } finally {
    state.isLoading = false;
  }
}

onMounted(() => {
  loadStatus();
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dataspaces-page {
  display: grid;
  gap: size(3);

  &__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1.5);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }
  }

  &__refresh {
    padding: size(1.25) size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    color: theme-color('content-primary');
    background: theme-color('surface-variant');
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__updated {
    color: theme-color('content-tertiary');
    @include tpg-s4;
  }

  &__hint,
  &__meta,
  &__error {
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }
  }

  &__hint {
    color: theme-color('content-secondary');
    @include tpg-s3;
  }

  &__meta {
    color: theme-color('content-tertiary');
    @include tpg-s4;
  }

  &__error {
    color: theme-color('error');
    @include tpg-s3;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: size(1);
    padding: size(1.5) size(2) 0;

    @include sm {
      padding: size(1.5) size(3) 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @include lg {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding: size(2) size(4) 0;
    }
  }

  &__stat {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(1.5);
    background: theme-color('surface-variant');
    display: grid;
    gap: size(0.5);

    .label {
      color: theme-color('content-tertiary');
      @include tpg-s4;
    }

    .value {
      color: theme-color('content-primary');
      @include tpg-s2;
    }
  }

  &__table {
    .content-row {
      display: grid;
      grid-template-columns: minmax(0, 2.4fr) repeat(5, minmax(0, 0.8fr));
      align-items: center;
      gap: size(1);
      min-height: 60px;
      padding: 0 size(2);

      @include sm {
        padding: 0 size(3);
      }

      @include md {
        padding: 0 size(2);
      }
    }
  }

  &__cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    &--header {
      color: theme-color('content-quaternary');
      @include tpg-s4;
    }
    &--numeric {
      text-align: right;
    }
  }

  &__mobile-card {
    padding: size(2) size(4);
    display: grid;
    gap: size(1);
  }

  &__mobile-row {
    display: flex;
    justify-content: space-between;
    gap: size(2);

    .label {
      color: theme-color('content-quaternary');
      @include tpg-s4;
    }
  }
}
</style>
