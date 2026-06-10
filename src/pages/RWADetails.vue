<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import * as http from '@/shared/api';
import type { RWA } from '@/shared/api/schemas';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { RwaIdSchema } from '@/shared/api/schemas';
import { parseMetadata } from '@/shared/ui/utils/json';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { getRwaDomain } from '@/shared/lib/rwa-id';
import type { RwaProvenanceEdge, RwaProvenanceGraph, RwaProvenanceNode } from '@/shared/lib/rwa-provenance';
import { fetchRwaProvenanceBundle } from '@/shared/lib/rwa-provenance';

const router = useRouter();

const hashType = useAdaptiveHash({ md: 'medium', sm: 'medium', xs: 'short', xxs: 'short' }, 'full');
const EMPTY_GRAPH: RwaProvenanceGraph = {
  width: 0,
  height: 0,
  nodeWidth: 0,
  nodeHeight: 0,
  nodes: [],
  edges: [],
};

const rwaId = computed(() => {
  const id = router.currentRoute.value.params['id'];

  return RwaIdSchema.parse(id);
});
const rwaDomain = computed(() => getRwaDomain(rwaId.value));

async function fetchExistingRwa(id: string): Promise<RWA> {
  const result = await http.fetchRwaById(id);
  if (result.status !== SUCCESSFUL_FETCHING) {
    throw new Error(`Failed to fetch RWA ${id}`);
  }
  return result.data;
}

const rwaScope = useParamScope(
  () => {
    return {
      key: rwaId.value,
      payload: rwaId.value,
    };
  },
  ({ payload }) => setupAsyncData(() => fetchRwaProvenanceBundle(payload, fetchExistingRwa))
);

const isLoading = computed(() => rwaScope.value.expose.isLoading);
const provenanceBundle = computed(() => rwaScope.value?.expose.data);
const rwa = computed(() => provenanceBundle.value?.root);
const provenanceGraph = computed(() => provenanceBundle.value?.graph ?? EMPTY_GRAPH);
const missingAncestorIds = computed(() => provenanceBundle.value?.missingAncestorIds ?? []);
const provenanceTruncated = computed(() => provenanceBundle.value?.truncated ?? false);
const availableQuantity = computed(() => {
  if (!rwa.value) return null;
  return rwa.value.quantity.minus(rwa.value.held_quantity).toString();
});
const provenanceNodesById = computed<Map<string, RwaProvenanceNode>>(
  () => new Map<string, RwaProvenanceNode>(provenanceGraph.value.nodes.map((node) => [node.id, node]))
);
const hasRecordedParents = computed(() => Boolean(rwa.value?.parents.length));

function graphNodeStyle(x: number, y: number) {
  return {
    transform: `translate(${x}px, ${y}px)`,
  };
}

function edgePath(edge: RwaProvenanceEdge): string {
  const source = provenanceNodesById.value.get(edge.source);
  const target = provenanceNodesById.value.get(edge.target);
  if (!source || !target) return '';

  const startX = source.x + provenanceGraph.value.nodeWidth;
  const startY = source.y + provenanceGraph.value.nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + provenanceGraph.value.nodeHeight / 2;
  const controlOffset = Math.max(56, (endX - startX) / 2);

  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

function edgeLabelStyle(edge: RwaProvenanceEdge) {
  const source = provenanceNodesById.value.get(edge.source);
  const target = provenanceNodesById.value.get(edge.target);
  if (!source || !target) return {};

  const left = source.x + provenanceGraph.value.nodeWidth + (target.x - (source.x + provenanceGraph.value.nodeWidth)) / 2;
  const top = (source.y + target.y + provenanceGraph.value.nodeHeight) / 2;

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
}

function nodeAvailableQuantity(node: RWA | null): string | null {
  if (!node) return null;
  return node.quantity.minus(node.held_quantity).toString();
}
</script>

<template>
  <div class="rwa-details">
    <BaseContentBlock
      :title="$t('assets.rwa', [rwaId])"
      class="rwa-details__section"
    >
      <template #default>
        <div
          v-if="isLoading"
          class="rwa-details__section_loading"
        >
          <BaseLoading />
        </div>
        <div v-else-if="rwa">
          <div class="rwa-details__section-information">
            <DataField
              :title="$t('assets.ownedBy')"
              :hash="rwa.owned_by.toString()"
              copy
              :link="`/accounts/${rwa.owned_by}`"
              :type="hashType"
            />
            <div class="rwa-details__section-grid">
              <DataField
                :title="$t('domain')"
                :value="rwaDomain ?? $t('none')"
                :link="rwaDomain ? `/domains/${rwaDomain}` : undefined"
              />
              <DataField
                :title="$t('value')"
                :value="rwa.quantity.toString()"
                monospace
              />
              <DataField
                :title="$t('assets.heldQuantity')"
                :value="rwa.held_quantity.toString()"
                monospace
              />
              <DataField
                :title="$t('assets.availableQuantity')"
                :value="availableQuantity"
                monospace
              />
              <DataField
                :title="$t('assets.primaryReference')"
                :value="rwa.primary_reference"
                monospace
              />
              <DataField
                :title="$t('assets.frozen')"
                :value="rwa.is_frozen ? $t('assets.frozenYes') : $t('assets.frozenNo')"
              />
              <DataField
                :title="$t('transactions.status')"
                :value="rwa.status ?? $t('none')"
              />
            </div>
            <DataField
              :title="$t('metadata')"
              :metadata="{ display: 'full' }"
              :value="parseMetadata(rwa.metadata)"
            />
            <section class="rwa-details__provenance">
              <div class="rwa-details__provenance-header">
                <h2 class="rwa-details__provenance-title">{{ $t('assets.provenanceGraph') }}</h2>
                <p
                  v-if="!hasRecordedParents"
                  class="rwa-details__provenance-note"
                >
                  {{ $t('assets.provenanceNoParents') }}
                </p>
                <p
                  v-if="missingAncestorIds.length"
                  class="rwa-details__provenance-note"
                >
                  {{ $t('assets.provenanceIncomplete') }}
                </p>
                <p
                  v-if="provenanceTruncated"
                  class="rwa-details__provenance-note"
                >
                  {{ $t('assets.provenanceTruncated') }}
                </p>
              </div>
              <div class="rwa-details__provenance-viewport">
                <div
                  class="rwa-details__provenance-graph"
                  :style="{
                    width: `${provenanceGraph.width}px`,
                    height: `${provenanceGraph.height}px`,
                  }"
                >
                  <svg
                    class="rwa-details__provenance-svg"
                    :viewBox="`0 0 ${provenanceGraph.width} ${provenanceGraph.height}`"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      v-for="edge in provenanceGraph.edges"
                      :key="edge.id"
                      class="rwa-details__provenance-edge"
                      :d="edgePath(edge)"
                    />
                  </svg>
                  <div
                    v-for="edge in provenanceGraph.edges"
                    :key="`${edge.id}-label`"
                    class="rwa-details__provenance-edge-label"
                    :style="edgeLabelStyle(edge)"
                  >
                    <span class="rwa-details__provenance-edge-label-caption">
                      {{ $t('assets.provenanceContribution') }}
                    </span>
                    <span class="rwa-details__provenance-edge-label-value">{{ edge.quantity }}</span>
                  </div>
                  <article
                    v-for="node in provenanceGraph.nodes"
                    :key="node.id"
                    class="rwa-details__provenance-node"
                    :data-root="node.isRoot || null"
                    :data-placeholder="node.isPlaceholder || null"
                    :style="graphNodeStyle(node.x, node.y)"
                  >
                    <BaseLink
                      :to="`/rwas/${node.id}`"
                      monospace
                      class="rwa-details__provenance-node-id"
                    >
                      {{ node.id }}
                    </BaseLink>
                    <template v-if="node.rwa">
                      <div class="rwa-details__provenance-node-grid">
                        <div class="rwa-details__provenance-node-field">
                          <span class="rwa-details__provenance-node-label">{{ $t('value') }}</span>
                          <span class="rwa-details__provenance-node-value">{{ node.rwa.quantity.toString() }}</span>
                        </div>
                        <div class="rwa-details__provenance-node-field">
                          <span class="rwa-details__provenance-node-label">{{ $t('assets.availableQuantity') }}</span>
                          <span class="rwa-details__provenance-node-value">{{ nodeAvailableQuantity(node.rwa) }}</span>
                        </div>
                      </div>
                      <div class="rwa-details__provenance-node-owner">
                        <span class="rwa-details__provenance-node-label">{{ $t('assets.ownedBy') }}</span>
                        <BaseLink
                          :to="`/accounts/${node.rwa.owned_by}`"
                          monospace
                          class="rwa-details__provenance-node-owner-link"
                        >
                          {{ node.rwa.owned_by }}
                        </BaseLink>
                      </div>
                    </template>
                    <p
                      v-else
                      class="rwa-details__provenance-node-missing"
                    >
                      {{ $t('assets.provenanceUnavailableParent') }}
                    </p>
                  </article>
                </div>
              </div>
            </section>
          </div>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.rwa-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__section {
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-information {
      display: flex;
      flex-direction: column;
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);
      gap: size(2);
      overflow: visible;
    }
  }

  &__section-grid {
    display: grid;
    gap: size(2);

    @include xxs {
      grid-template-columns: 1fr;
    }

    @include md {
      grid-template-columns: 1fr 1fr;
    }

    @include lg {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }

  &__provenance {
    display: flex;
    flex-direction: column;
    gap: size(2);
  }

  &__provenance-header {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__provenance-title {
    @include tpg-h4;
    color: theme-color('content-primary');
  }

  &__provenance-note {
    @include tpg-s4;
    color: theme-color('content-secondary');
  }

  &__provenance-viewport {
    overflow: auto;
    padding-bottom: size(1);
  }

  &__provenance-graph {
    position: relative;
    min-width: 100%;
  }

  &__provenance-svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }

  &__provenance-edge {
    stroke: color-mix(in srgb, theme-color('primary') 42%, theme-color('border-primary'));
    stroke-width: 2;
    opacity: 0.9;
  }

  &__provenance-edge-label {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: size(0.25);
    min-width: 84px;
    padding: size(0.75) size(1);
    border: 1px solid color-mix(in srgb, theme-color('primary') 35%, theme-color('border-primary'));
    border-radius: size(1.25);
    background: color-mix(in srgb, theme-color('surface') 94%, white);
    box-shadow: 0 8px 20px rgba(theme-color('primary'), 0.08);
    pointer-events: none;
  }

  &__provenance-edge-label-caption {
    @include tpg-s5;
    color: theme-color('content-secondary');
  }

  &__provenance-edge-label-value {
    @include tpg-s3-mono;
    color: theme-color('content-primary');
  }

  &__provenance-node {
    position: absolute;
    width: 272px;
    min-height: 132px;
    display: flex;
    flex-direction: column;
    gap: size(1);
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    background: linear-gradient(
      165deg,
      color-mix(in srgb, theme-color('surface') 97%, white),
      color-mix(in srgb, theme-color('surface-variant') 92%, white)
    );
    box-shadow:
      0 16px 30px rgba(theme-color('primary'), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);

    &[data-root] {
      border-color: color-mix(in srgb, theme-color('primary') 58%, theme-color('border-primary'));
      box-shadow:
        0 18px 34px rgba(theme-color('primary'), 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }

    &[data-placeholder] {
      border-style: dashed;
      background: color-mix(in srgb, theme-color('surface') 88%, transparent);
    }
  }

  &__provenance-node-id {
    @include tpg-link1-mono;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  &__provenance-node-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: size(1);
  }

  &__provenance-node-field,
  &__provenance-node-owner {
    display: flex;
    flex-direction: column;
    gap: size(0.25);
  }

  &__provenance-node-label {
    @include tpg-s5;
    color: theme-color('content-secondary');
  }

  &__provenance-node-value,
  &__provenance-node-owner-link {
    @include tpg-s3-mono;
    color: theme-color('content-primary');
    overflow-wrap: anywhere;
  }

  &__provenance-node-missing {
    @include tpg-s4;
    color: theme-color('content-secondary');
  }
}
</style>
