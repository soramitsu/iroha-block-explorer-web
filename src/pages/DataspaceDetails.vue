<template>
  <div class="dataspace-details-page">
    <BaseContentBlock :title="$t('dataspaces.detailTitle')">
      <template #header-action>
        <BaseButton line to="/dataspaces">
          {{ $t('dataspaces.backToOverview') }}
        </BaseButton>
      </template>

      <template #default>
        <p v-if="!hasValidParams" class="dataspace-details-page__error" data-test="dataspace-details-error">
          {{ $t('dataspaces.detailInvalidRoute') }}
        </p>

        <template v-else>
          <div class="dataspace-details-page__grid" data-test="dataspace-details-core">
            <DataField :title="$t('dataspaces.dataspaceId')" :value="dataspaceId" monospace />
            <DataField :title="$t('dataspaces.lane')" :value="laneId" monospace />
          </div>

          <div class="dataspace-details-page__protected" data-test="dataspace-details-diagnostic-protected">
            <strong>{{ $t('dataspaces.accessBoundary.diagnosticTitle') }}</strong>
            <i18n-t scope="global" keypath="dataspaces.accessBoundary.diagnosticDescription" tag="p">
              <template #status><code>/status</code></template>
            </i18n-t>
          </div>
        </template>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('dataspaces.laneGovernanceTitle')">
      <template #default>
        <div class="dataspace-details-page__protected" data-test="dataspace-details-governance-protected">
          <strong>{{ $t('dataspaces.accessBoundary.governanceTitle') }}</strong>
          <i18n-t scope="global" keypath="dataspaces.accessBoundary.governanceDescription" tag="p">
            <template #operatorSigningContext><code>OperatorSigningContext</code></template>
          </i18n-t>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock v-if="hasValidParams" :title="$t('dataspaces.publicNodes.title')">
      <template #default>
        <form class="dataspace-details-page__public-node-form" @submit.prevent="addPublicNode">
          <label>
            <span class="h-sm">{{ $t('dataspaces.publicNodes.label') }}</span>
            <input
              v-model="publicNodeDraft.label"
              type="text"
              :placeholder="$t('dataspaces.publicNodes.labelPlaceholder')"
            />
          </label>
          <label>
            <span class="h-sm">{{ $t('dataspaces.publicNodes.url') }}</span>
            <input
              v-model="publicNodeDraft.url"
              type="url"
              :placeholder="$t('dataspaces.publicNodes.urlPlaceholder')"
            />
          </label>
          <BaseButton native-type="submit" :disabled="!publicNodeDraft.url.trim()">
            {{ $t('dataspaces.publicNodes.add') }}
          </BaseButton>
        </form>

        <p v-if="publicNodeError" class="dataspace-details-page__error" data-test="dataspace-details-public-node-error">
          {{ publicNodeError }}
        </p>

        <p
          v-if="publicNodes.length === 0"
          class="dataspace-details-page__empty row-text"
          data-test="dataspace-details-public-nodes-empty"
        >
          {{ $t('dataspaces.publicNodes.empty') }}
        </p>

        <div v-else class="dataspace-details-page__public-node-list" data-test="dataspace-details-public-nodes">
          <div v-for="node in publicNodes" :key="node.url" class="dataspace-details-page__public-node-row">
            <div class="dataspace-details-page__public-node-main">
              <span class="dataspace-details-page__public-node-label">{{ node.label }}</span>
              <span class="dataspace-details-page__public-node-url">{{ node.url }}</span>
            </div>
            <div class="dataspace-details-page__public-node-actions">
              <BaseButton bordered data-test="dataspace-details-open-scoped" @click="openScopedExplorer(node)">
                {{ $t('dataspaces.publicNodes.openExplorer') }}
              </BaseButton>
              <BaseButton data-test="dataspace-details-remove-node" @click="removePublicNode(node.url)">
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
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import * as http from '@/shared/api';
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

const publicNodes = ref<DataspacePublicNodeEntry[]>([]);
const publicNodeError = ref<string | null>(null);
const publicNodeDraft = reactive({
  label: '',
  url: '',
});

function parseRouteId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const laneId = computed(() => parseRouteId(route.params.laneId));
const dataspaceId = computed(() => parseRouteId(route.params.dataspaceId));
const hasValidParams = computed(() => laneId.value !== null && dataspaceId.value !== null);

const storageScope = computed(() => {
  if (!hasValidParams.value) return null;
  return {
    registryNode: http.getConfiguredToriiBaseUrl(),
    laneId: laneId.value as number,
    dataspaceId: dataspaceId.value as number,
  };
});

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
  publicNodeError.value = null;
}

function addPublicNode() {
  const scope = storageScope.value;
  if (!scope) return;

  const normalized = http.normalizeToriiBaseUrl(publicNodeDraft.url);
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

  navigation
    .push({
      path: '/blocks',
      query: toExplorerScopeQuery({
        torii: node.url,
        dataspaceLaneId: lane,
        dataspaceId: id,
      }),
    })
    .catch(() => {});
}

watch(() => [route.params.laneId, route.params.dataspaceId], refreshPublicNodes, { immediate: true });
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dataspace-details-page {
  display: grid;
  gap: size(3);

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(1);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }
  }

  &__protected,
  &__error,
  &__empty {
    margin: 0;
    padding: size(1.5) size(2);

    @include sm {
      padding-right: size(3);
      padding-left: size(3);
    }
  }

  &__protected {
    display: grid;
    gap: size(0.75);
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

  &__public-node-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    align-items: end;
    gap: size(1.5);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include xs {
      grid-template-columns: 1fr;
    }

    label {
      display: grid;
      gap: size(0.75);
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

  &__public-node-list {
    display: grid;
    gap: size(1);
    padding: size(2);

    @include sm {
      padding-right: size(3);
      padding-left: size(3);
    }
  }

  &__public-node-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: size(1.5);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(1.5);
    background: theme-color('surface-variant');
  }

  &__public-node-main {
    display: grid;
    min-width: 0;
    gap: size(0.5);
  }

  &__public-node-label {
    color: theme-color('content-primary');
    @include tpg-s3;
  }

  &__public-node-url {
    color: theme-color('content-secondary');
    word-break: break-all;
    @include tpg-s4;
  }

  &__public-node-actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
  }
}
</style>
