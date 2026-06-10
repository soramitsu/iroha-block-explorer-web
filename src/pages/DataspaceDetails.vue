<template>
  <div class="dataspace-details-page">
    <BaseContentBlock :title="$t('dataspaces.detailTitle')">
      <template #header-action>
        <BaseButton
          line
          to="/dataspaces"
        >
          {{ $t('dataspaces.backToOverview') }}
        </BaseButton>
      </template>

      <template #default>
        <div class="dataspace-details-page__controls">
          <button
            type="button"
            class="dataspace-details-page__refresh"
            :disabled="state.isLoading"
            data-test="dataspace-details-refresh"
            @click="loadDetails"
          >
            {{ state.isLoading ? $t('dataspaces.loading') : $t('dataspaces.refresh') }}
          </button>
          <p
            v-if="state.lastUpdated"
            class="dataspace-details-page__updated"
            data-test="dataspace-details-updated"
          >
            {{ $t('dataspaces.updatedAt', { value: state.lastUpdated }) }}
          </p>
        </div>

        <BaseLoading
          v-if="state.isLoading && !dataspace"
          data-test="dataspace-details-loading"
        />

        <p
          v-else-if="state.error"
          class="dataspace-details-page__error"
          data-test="dataspace-details-error"
        >
          {{ state.error }}
        </p>

        <div
          v-else-if="dataspace"
          class="dataspace-details-page__grid"
          data-test="dataspace-details-core"
        >
          <DataField
            :title="$t('dataspaces.dataspace')"
            :value="dataspaceLabel(dataspace)"
          />
          <DataField
            :title="$t('dataspaces.dataspaceId')"
            :value="dataspace.dataspace_id"
            monospace
          />
          <DataField
            :title="$t('dataspaces.lane')"
            :value="dataspace.lane_id"
            monospace
          />
          <DataField
            :title="$t('dataspaces.dataspaceType')"
            :value="dataspaceType(dataspace)"
          />
          <DataField
            :title="$t('dataspaces.description')"
            :value="dataspace.description || $t('none')"
          />
          <DataField
            :title="$t('dataspaces.faultTolerance')"
            :value="dataspace.fault_tolerance"
            monospace
          />
          <DataField
            :title="$t('dataspaces.backlog')"
            :value="dataspace.backlog"
            monospace
          />
          <DataField
            :title="$t('dataspaces.ageSlots')"
            :value="dataspace.age_slots"
            monospace
          />
          <DataField
            :title="$t('dataspaces.virtualFinish')"
            :value="dataspace.virtual_finish"
            monospace
          />
          <DataField
            :title="$t('dataspaces.lifetimeTxServed')"
            :value="dataspace.tx_served"
            monospace
          />
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('dataspaces.laneGovernanceTitle')">
      <template #default>
        <p
          v-if="state.governanceError"
          class="dataspace-details-page__error"
          data-test="dataspace-details-governance-error"
        >
          {{ state.governanceError }}
        </p>

        <p
          v-else-if="!laneGovernance"
          class="dataspace-details-page__empty row-text"
          data-test="dataspace-details-governance-empty"
        >
          {{ $t('dataspaces.laneGovernanceMissing') }}
        </p>

        <div
          v-else
          class="dataspace-details-page__grid"
          data-test="dataspace-details-governance"
        >
          <DataField
            :title="$t('dataspaces.governanceMode')"
            :value="laneGovernance.governance || $t('none')"
          />
          <DataField
            :title="$t('dataspaces.quorum')"
            :value="laneGovernance.quorum ?? $t('none')"
            monospace
          />
          <DataField
            :title="$t('dataspaces.manifestRequired')"
            :value="laneGovernance.manifest_required ? 'Yes' : 'No'"
          />
          <DataField
            :title="$t('dataspaces.manifestReady')"
            :value="laneGovernance.manifest_ready ? 'Yes' : 'No'"
          />
          <DataField
            :title="$t('dataspaces.manifestPath')"
            :value="laneGovernance.manifest_path || $t('none')"
            monospace
          />
          <DataField
            :title="$t('dataspaces.validators')"
            :value="laneGovernance.validator_ids.join(', ') || $t('none')"
            monospace
          />
          <DataField
            :title="$t('dataspaces.protectedNamespaces')"
            :value="laneGovernance.protected_namespaces.join(', ') || $t('none')"
          />
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('dataspaces.publicNodes.title')">
      <template #default>
        <form
          class="dataspace-details-page__public-node-form"
          @submit.prevent="addPublicNode"
        >
          <label>
            <span class="h-sm">{{ $t('dataspaces.publicNodes.label') }}</span>
            <input
              v-model="publicNodeDraft.label"
              type="text"
              :placeholder="$t('dataspaces.publicNodes.labelPlaceholder')"
            >
          </label>
          <label>
            <span class="h-sm">{{ $t('dataspaces.publicNodes.url') }}</span>
            <input
              v-model="publicNodeDraft.url"
              type="url"
              :placeholder="$t('dataspaces.publicNodes.urlPlaceholder')"
            >
          </label>
          <BaseButton
            native-type="submit"
            :disabled="!publicNodeDraft.url.trim()"
          >
            {{ $t('dataspaces.publicNodes.add') }}
          </BaseButton>
        </form>

        <p
          v-if="publicNodeError"
          class="dataspace-details-page__error"
          data-test="dataspace-details-public-node-error"
        >
          {{ publicNodeError }}
        </p>

        <p
          v-if="publicNodes.length === 0"
          class="dataspace-details-page__empty row-text"
          data-test="dataspace-details-public-nodes-empty"
        >
          {{ $t('dataspaces.publicNodes.empty') }}
        </p>

        <div
          v-else
          class="dataspace-details-page__public-node-list"
          data-test="dataspace-details-public-nodes"
        >
          <div
            v-for="node in publicNodes"
            :key="node.url"
            class="dataspace-details-page__public-node-row"
          >
            <div class="dataspace-details-page__public-node-main">
              <span class="dataspace-details-page__public-node-label">{{ node.label }}</span>
              <span class="dataspace-details-page__public-node-url">{{ node.url }}</span>
            </div>
            <div class="dataspace-details-page__public-node-actions">
              <BaseButton
                size="sm"
                bordered
                data-test="dataspace-details-open-scoped"
                @click="openScopedExplorer(node)"
              >
                {{ $t('dataspaces.publicNodes.openExplorer') }}
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                data-test="dataspace-details-remove-node"
                @click="removePublicNode(node.url)"
              >
                {{ $t('dataspaces.publicNodes.remove') }}
              </BaseButton>
            </div>
          </div>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import * as http from '@/shared/api';
import type { NexusPublicStatus, NexusStatusDataspaceBacklog, SumeragiStatus } from '@/shared/api/schemas';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import {
  listDataspacePublicNodes,
  removeDataspacePublicNode,
  upsertDataspacePublicNode,
  type DataspacePublicNodeEntry,
} from '@/shared/lib/dataspace-public-nodes';
import { toExplorerScopeQuery } from '@/shared/lib/explorer-scope';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

defineOptions({
  name: 'DataspaceDetailsPage',
});

const route = useRoute();
const { t } = useI18n();
const navigation = useScopedExplorerNavigation();

const state = reactive<{
  isLoading: boolean
  error: string | null
  governanceError: string | null
  nexusStatus: NexusPublicStatus | null
  sumeragiStatus: SumeragiStatus | null
  lastUpdated: string | null
}>({
  isLoading: false,
  error: null,
  governanceError: null,
  nexusStatus: null,
  sumeragiStatus: null,
  lastUpdated: null,
});

const publicNodes = ref<DataspacePublicNodeEntry[]>([]);
const publicNodeError = ref<string | null>(null);
const publicNodeDraft = reactive({
  label: '',
  url: '',
});

const laneId = computed(() => {
  const raw = route.params.laneId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
});

const dataspaceId = computed(() => {
  const raw = route.params.dataspaceId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
});

const hasValidParams = computed(() => laneId.value !== null && dataspaceId.value !== null);

const dataspace = computed<NexusStatusDataspaceBacklog | null>(() => {
  if (!hasValidParams.value) return null;
  const lane = laneId.value as number;
  const id = dataspaceId.value as number;
  const rows = state.nexusStatus?.teu_dataspace_backlog ?? [];
  return rows.find((item) => item.lane_id === lane && item.dataspace_id === id) ?? null;
});

const laneGovernance = computed(() => {
  if (!hasValidParams.value) return null;
  const lane = laneId.value as number;
  const rows = state.sumeragiStatus?.lane_governance ?? [];
  return rows.find((item) => item.lane_id === lane) ?? null;
});

const storageScope = computed(() => {
  if (!hasValidParams.value) return null;
  return {
    registryNode: http.getConfiguredToriiBaseUrl(),
    laneId: laneId.value as number,
    dataspaceId: dataspaceId.value as number,
  };
});

function dataspaceLabel(item: NexusStatusDataspaceBacklog): string {
  return item.alias ? `${item.alias} (#${item.dataspace_id})` : `#${item.dataspace_id}`;
}

function dataspaceType(item: NexusStatusDataspaceBacklog) {
  return item.dataspace_id >= 10 ? t('dataspaces.typeCustom') : t('dataspaces.typeSystem');
}

function deriveNodeLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url;
  }
}

function refreshPublicNodes() {
  const scope = storageScope.value;
  publicNodes.value = scope ? listDataspacePublicNodes(scope) : [];
}

async function loadDetails() {
  if (!hasValidParams.value) {
    state.error = t('dataspaces.detailInvalidRoute');
    state.nexusStatus = null;
    state.sumeragiStatus = null;
    return;
  }

  state.isLoading = true;
  state.error = null;
  state.governanceError = null;

  try {
    const [nexusResponse, sumeragiResponse] = await Promise.all([
      http.fetchNexusPublicStatus(),
      http.fetchSumeragiStatus(),
    ]);

    if (nexusResponse.status === SUCCESSFUL_FETCHING) {
      state.nexusStatus = nexusResponse.data;
    } else {
      state.nexusStatus = null;
      state.error = t('dataspaces.loadFailed');
    }

    if (sumeragiResponse.status === SUCCESSFUL_FETCHING) {
      state.sumeragiStatus = sumeragiResponse.data;
    } else {
      state.sumeragiStatus = null;
      state.governanceError = t('dataspaces.laneGovernanceLoadFailed');
    }

    if (state.nexusStatus && !dataspace.value) {
      state.error = t('dataspaces.detailNotFound');
    }

    state.lastUpdated = new Date().toLocaleString();
    refreshPublicNodes();
  } catch {
    state.nexusStatus = null;
    state.sumeragiStatus = null;
    state.error = t('dataspaces.loadFailed');
  } finally {
    state.isLoading = false;
  }
}

function refreshDetails() {
  loadDetails().catch(() => {
    state.nexusStatus = null;
    state.sumeragiStatus = null;
    state.error = t('dataspaces.loadFailed');
    state.governanceError = t('dataspaces.laneGovernanceLoadFailed');
    state.isLoading = false;
  });
}

function addPublicNode() {
  const scope = storageScope.value;
  if (!scope) return;

  const normalized = http.normalizeToriiBaseUrl(publicNodeDraft.url, null);
  if (!normalized) {
    publicNodeError.value = t('dataspaces.publicNodes.invalidUrl');
    return;
  }

  const label = publicNodeDraft.label.trim() || deriveNodeLabel(normalized);
  upsertDataspacePublicNode(scope, {
    label,
    url: normalized,
  });

  publicNodeDraft.label = '';
  publicNodeDraft.url = '';
  publicNodeError.value = null;
  refreshPublicNodes();
}

function removePublicNode(url: string) {
  const scope = storageScope.value;
  if (!scope) return;
  removeDataspacePublicNode(scope, url);
  refreshPublicNodes();
}

function openScopedExplorer(node: DataspacePublicNodeEntry) {
  if (!hasValidParams.value) return;
  const lane = String(laneId.value);
  const id = String(dataspaceId.value);

  const scope = storageScope.value;
  if (scope) {
    upsertDataspacePublicNode(scope, {
      label: node.label,
      url: node.url,
    });
  }

  navigation.push({
    path: '/blocks',
    query: toExplorerScopeQuery({
      torii: node.url,
      dataspaceLaneId: lane,
      dataspaceId: id,
    }),
  }).catch(() => {});
}

watch(
  () => [route.params.laneId, route.params.dataspaceId],
  () => {
    refreshDetails();
  }
);

onMounted(() => {
  refreshDetails();
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dataspace-details-page {
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

  &__grid {
    padding: size(1) size(2) 0;
    display: grid;
    gap: size(1.5);
    grid-template-columns: repeat(1, minmax(0, 1fr));

    @include md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: size(1) size(3) 0;
    }
  }

  &__error,
  &__empty {
    padding: size(1) size(2) 0;
  }

  &__error {
    color: theme-color('error');
    @include tpg-s3;
  }

  &__public-node-form {
    display: grid;
    gap: size(1.5);
    grid-template-columns: 1fr;
    padding: 0 size(2);

    @include md {
      grid-template-columns: 1fr 1fr auto;
      align-items: end;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: size(0.75);
    }

    input {
      width: 100%;
      padding: size(1.25);
      border-radius: size(1);
      border: 1px solid theme-color('border-primary');
      background: theme-color('background');
      color: theme-color('content-primary');

      &::placeholder {
        color: theme-color('content-tertiary');
      }
    }
  }

  &__public-node-list {
    display: grid;
    gap: size(1);
    padding: size(1) size(2) 0;
  }

  &__public-node-row {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    background: theme-color('surface-variant');
    padding: size(1.25);
    display: flex;
    flex-direction: column;
    gap: size(1);

    @include md {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }

  &__public-node-main {
    display: grid;
    gap: size(0.5);
    min-width: 0;
  }

  &__public-node-label {
    color: theme-color('content-primary');
    @include tpg-s3;
  }

  &__public-node-url {
    color: theme-color('content-secondary');
    @include tpg-s4;
    word-break: break-all;
  }

  &__public-node-actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
  }
}
</style>
