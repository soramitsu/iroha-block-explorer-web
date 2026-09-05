<template>
  <div class="dataspaces-page">
    <BaseContentBlock :title="$t('dataspaces.title')">
      <template #default>
        <form class="dataspaces-page__lookup" data-test="dataspaces-lookup" @submit.prevent="loadSummary">
          <label>
            <span class="h-sm">{{ $t('dataspaces.accountLiteralLabel') }}</span>
            <input
              v-model="accountLiteral"
              type="text"
              autocomplete="off"
              :placeholder="$t('dataspaces.accountLiteralPlaceholder')"
            />
          </label>
          <BaseButton bordered native-type="submit" :disabled="state.isLoading" data-test="dataspaces-submit">
            {{ $t('dataspaces.lookup') }}
          </BaseButton>
        </form>

        <p class="dataspaces-page__hint">
          {{ $t('dataspaces.hint') }}
        </p>

        <BaseLoading v-if="state.isLoading" data-test="dataspaces-loading" />

        <p v-else-if="state.error" class="dataspaces-page__error" data-test="dataspaces-error">
          {{ state.error }}
        </p>

        <template v-else-if="state.summary">
          <div class="dataspaces-page__identity" data-test="dataspaces-identity">
            <DataField :title="$t('dataspaces.accountLiteralLabel')" :value="state.summary.account_id" monospace />
            <DataField :title="$t('dataspaces.uaid')" :value="state.summary.uaid ?? $t('none')" monospace />
          </div>

          <div class="dataspaces-page__stats" data-test="dataspaces-stats">
            <DataField :title="$t('dataspaces.totalDataspaces')" :value="state.summary.totals.dataspaces" monospace />
            <DataField :title="$t('dataspaces.boundAccounts')" :value="state.summary.totals.accounts_bound" monospace />
            <DataField
              :title="$t('dataspaces.portfolioPositions')"
              :value="state.summary.totals.portfolio_positions"
              monospace
            />
            <DataField
              :title="$t('dataspaces.manifests')"
              :value="`${state.summary.totals.manifests_active}/${state.summary.totals.manifests_total}`"
              monospace
            />
            <DataField
              :title="$t('dataspaces.consensusEntries')"
              :value="state.summary.totals.consensus_entries"
              monospace
            />
            <DataField
              :title="$t('dataspaces.consensusTx')"
              :value="state.summary.totals.consensus_tx_count"
              monospace
            />
            <DataField
              :title="$t('dataspaces.consensusChunks')"
              :value="state.summary.totals.consensus_chunks_total"
              monospace
            />
            <DataField
              :title="$t('dataspaces.consensusBytes')"
              :value="state.summary.totals.consensus_rbc_bytes_total"
              monospace
            />
          </div>
        </template>
      </template>
    </BaseContentBlock>

    <BaseContentBlock v-if="state.summary" :title="$t('dataspaces.dataspacesTable')">
      <template #default>
        <BaseTable
          :items="state.summary.dataspaces"
          :loading="state.isLoading"
          :row-key="dataspaceRowKey"
          container-class="dataspaces-page__table"
          :disable-pagination="true"
          row-pointer
          @click:row="selectDataspace"
        >
          <template #header>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.dataspace') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.accountsInDataspace') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.portfolioPositions') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.manifestStatus') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.consensusTx') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.consensusLanes') }}
            </span>
            <span class="dataspaces-page__cell dataspaces-page__cell--header" role="columnheader">
              {{ $t('dataspaces.lastCommit') }}
            </span>
          </template>

          <template #row="{ item }">
            <span class="dataspaces-page__cell row-text" role="cell">{{ dataspaceLabel(item) }}</span>
            <span class="dataspaces-page__cell row-text-monospace" role="cell">{{ item.accounts.length }}</span>
            <span class="dataspaces-page__cell row-text-monospace" role="cell">{{ item.portfolio.positions }}</span>
            <span class="dataspaces-page__cell row-text" role="cell">{{ manifestLabel(item) }}</span>
            <span class="dataspaces-page__cell row-text-monospace" role="cell">{{ item.consensus.tx_count }}</span>
            <span class="dataspaces-page__cell row-text-monospace" role="cell">{{ laneLabel(item) }}</span>
            <span class="dataspaces-page__cell row-text-monospace" role="cell">{{ lastCommitLabel(item) }}</span>
          </template>

          <template #mobile-card="{ item }">
            <div class="dataspaces-page__mobile-card">
              <DataField :title="$t('dataspaces.dataspace')" :value="dataspaceLabel(item)" />
              <DataField :title="$t('dataspaces.accountsInDataspace')" :value="item.accounts.length" monospace />
              <DataField :title="$t('dataspaces.portfolioPositions')" :value="item.portfolio.positions" monospace />
              <DataField :title="$t('dataspaces.manifestStatus')" :value="manifestLabel(item)" />
              <DataField :title="$t('dataspaces.consensusLanes')" :value="laneLabel(item)" monospace />
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>

    <BaseContentBlock v-if="selectedDataspace" :title="$t('dataspaces.selectedTitle')" data-test="dataspaces-selected">
      <template #default>
        <div class="dataspaces-page__selected-grid">
          <DataField :title="$t('dataspaces.dataspace')" :value="dataspaceLabel(selectedDataspace)" />
          <DataField
            :title="$t('dataspaces.accountsInDataspace')"
            :value="selectedDataspace.accounts.join(', ') || $t('none')"
            monospace
          />
          <DataField
            :title="$t('dataspaces.portfolioPositions')"
            :value="selectedDataspace.portfolio.positions"
            monospace
          />
          <DataField :title="$t('dataspaces.manifestStatus')" :value="manifestLabel(selectedDataspace)" />
          <DataField
            :title="$t('dataspaces.consensusEntries')"
            :value="selectedDataspace.consensus.entries"
            monospace
          />
          <DataField :title="$t('dataspaces.consensusTx')" :value="selectedDataspace.consensus.tx_count" monospace />
          <DataField
            :title="$t('dataspaces.consensusChunks')"
            :value="selectedDataspace.consensus.total_chunks"
            monospace
          />
          <DataField
            :title="$t('dataspaces.consensusBytes')"
            :value="selectedDataspace.consensus.rbc_bytes_total"
            monospace
          />
          <DataField :title="$t('dataspaces.lastCommit')" :value="lastCommitLabel(selectedDataspace)" monospace />
          <DataField
            :title="$t('dataspaces.lastCommitHash')"
            :value="selectedDataspace.consensus.last_block_hash ?? $t('none')"
            monospace
          />
        </div>

        <div
          v-if="selectedDataspace.consensus.lane_ids.length > 0"
          class="dataspaces-page__lane-links"
          data-test="dataspaces-lane-links"
        >
          <BaseButton
            v-for="laneId in selectedDataspace.consensus.lane_ids"
            :key="laneId"
            bordered
            :to="{
              name: 'dataspaces-details',
              params: { laneId: String(laneId), dataspaceId: String(selectedDataspace.dataspace_id) },
            }"
          >
            {{ $t('dataspaces.lane') }} {{ laneId }}
          </BaseButton>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import * as http from '@/shared/api';
import type { NexusDataspaceAccountSummaryRow, NexusDataspacesAccountSummary } from '@/shared/api/schemas';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';

defineOptions({
  name: 'DataspacesPage',
});

const { t } = useI18n();
const accountLiteral = ref('');
const selectedDataspaceId = ref<number | null>(null);
const state = reactive<{
  isLoading: boolean;
  error: string | null;
  summary: NexusDataspacesAccountSummary | null;
}>({
  isLoading: false,
  error: null,
  summary: null,
});

const selectedDataspace = computed(() => {
  const rows = state.summary?.dataspaces ?? [];
  if (rows.length === 0) return null;
  return rows.find((item) => item.dataspace_id === selectedDataspaceId.value) ?? rows[0] ?? null;
});

function dataspaceRowKey(item: NexusDataspaceAccountSummaryRow): string {
  return String(item.dataspace_id);
}

function dataspaceLabel(item: NexusDataspaceAccountSummaryRow): string {
  return item.dataspace_alias ? `${item.dataspace_alias} (#${item.dataspace_id})` : `#${item.dataspace_id}`;
}

function manifestLabel(item: NexusDataspaceAccountSummaryRow): string {
  return item.manifest.present ? item.manifest.status : t('dataspaces.manifestMissing');
}

function laneLabel(item: NexusDataspaceAccountSummaryRow): string {
  return item.consensus.lane_ids.length > 0 ? item.consensus.lane_ids.join(', ') : '—';
}

function lastCommitLabel(item: NexusDataspaceAccountSummaryRow): string {
  return item.consensus.last_block_height === null ? '—' : String(item.consensus.last_block_height);
}

function selectDataspace(item: NexusDataspaceAccountSummaryRow) {
  selectedDataspaceId.value = item.dataspace_id;
}

async function loadSummary() {
  const rawLiteral = accountLiteral.value;
  if (!rawLiteral.trim()) {
    state.summary = null;
    selectedDataspaceId.value = null;
    state.error = t('dataspaces.accountRequired');
    return;
  }
  const literal = normalizeAccountIdLiteral(rawLiteral);
  if (!literal) {
    state.summary = null;
    selectedDataspaceId.value = null;
    state.error = t('dataspaces.accountInvalid');
    return;
  }

  state.isLoading = true;
  state.error = null;
  state.summary = null;
  selectedDataspaceId.value = null;

  try {
    const response = await http.fetchNexusDataspacesAccountSummary(literal);
    if (response.status === SUCCESSFUL_FETCHING) {
      state.summary = response.data;
      selectedDataspaceId.value = response.data.dataspaces[0]?.dataspace_id ?? null;
      return;
    }

    state.error = response.status === NOT_FOUND ? t('dataspaces.accountNotFound') : t('dataspaces.loadFailed');
  } catch {
    state.error = t('dataspaces.loadFailed');
  } finally {
    state.isLoading = false;
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dataspaces-page {
  display: grid;
  gap: size(3);

  &__lookup {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: size(1.5);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    label {
      display: grid;
      flex: 1 1 360px;
      gap: size(0.75);
      min-width: 0;
    }

    input {
      width: 100%;
      min-width: 0;
      padding: size(1.25);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      color: theme-color('content-primary');
      background: transparent;
    }
  }

  &__hint,
  &__error {
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }
  }

  &__hint {
    color: theme-color('content-secondary');
    @include tpg-s3;
  }

  &__error {
    color: theme-color('error');
    @include tpg-s3;
  }

  &__identity,
  &__stats,
  &__selected-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: size(1);
    padding: size(1.5) size(2) 0;

    @include sm {
      padding-right: size(3);
      padding-left: size(3);
    }
  }

  &__table {
    .content-row {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) repeat(6, minmax(0, 1fr));
      align-items: center;
      gap: size(1);
      min-height: 60px;
      padding: 0 size(2);

      @include sm {
        padding: 0 size(3);
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
  }

  &__mobile-card {
    display: grid;
    gap: size(1);
    padding: size(2) size(4);
  }

  &__lane-links {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    padding: size(2);

    @include sm {
      padding-right: size(3);
      padding-left: size(3);
    }
  }
}
</style>
