<template>
    <BaseContentBlock :title="$t('soracloud.title')">
      <template #header-action>
        <div class="soracloud-page__header-actions">
          <span class="soracloud-page__source">
            {{ $t('soracloud.source') }}: {{ toriiBaseUrl }}
          </span>

          <button
            type="button"
            class="soracloud-page__refresh"
            :disabled="isRefreshing"
            data-test="soracloud-refresh"
            @click="refreshAll"
          >
            {{ isRefreshing ? $t('soracloud.loading') : $t('soracloud.refresh') }}
          </button>
        </div>
      </template>

      <p class="soracloud-page__hint">
        {{ $t('soracloud.hint') }}
      </p>

      <p
        v-if="overviewUpdatedAt"
        class="soracloud-page__updated"
        data-test="soracloud-updated"
      >
        {{ $t('soracloud.updatedAt', { value: overviewUpdatedAt }) }}
      </p>

      <div
        v-if="overviewRequest.isLoading && !overview"
        class="soracloud-page__section-state"
        data-test="soracloud-loading"
      >
        <BaseLoading />
      </div>

      <div v-else-if="overview">
        <p
          v-if="overviewRequest.error"
          class="soracloud-page__inline-error"
          data-test="soracloud-error"
        >
          {{ overviewRequest.error }}
        </p>

        <div
          class="soracloud-page__stats"
          data-test="soracloud-stats"
        >
          <article class="soracloud-page__stat">
            <span class="label">{{ $t('soracloud.status') }}</span>
            <span class="value">
              <span
                :class="[
                  'soracloud-page__status-pill',
                  `soracloud-page__status-pill--${overview.service_health.status.toLowerCase()}`,
                ]"
              >
                {{ overview.service_health.status }}
              </span>
            </span>
          </article>

          <article
            v-for="card in overviewCards"
            :key="card.key"
            class="soracloud-page__stat"
          >
            <span class="label">{{ $t(card.label) }}</span>
            <span class="value">{{ card.value }}</span>
          </article>
        </div>

        <div class="soracloud-page__section-grid">
          <section class="soracloud-page__panel">
            <h3 class="soracloud-page__panel-title">
              {{ $t('soracloud.serviceHealth') }}
            </h3>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.message')"
                :value="overview.service_health.message"
              />
              <DataField
                :title="$t('soracloud.observedHeight')"
                :value="formatNullableNumber(overview.service_health.observed_height)"
              />
              <DataField
                :title="$t('soracloud.observedBlockHash')"
                :value="overview.service_health.observed_block_hash ?? '—'"
                :hash="overview.service_health.observed_block_hash ?? undefined"
                monospace
              />
              <DataField
                :title="$t('soracloud.stateDir')"
                :value="overview.service_health.state_dir ?? '—'"
                monospace
              />
              <DataField
                :title="$t('soracloud.healthyServiceRevisions')"
                :value="formatNumber(overview.service_health.healthy_service_revisions)"
              />
              <DataField
                :title="$t('soracloud.hydratingServiceRevisions')"
                :value="formatNumber(overview.service_health.hydrating_service_revisions)"
              />
              <DataField
                :title="$t('soracloud.degradedServiceRevisions')"
                :value="formatNumber(overview.service_health.degraded_service_revisions)"
              />
              <DataField
                :title="$t('soracloud.unavailableServiceRevisions')"
                :value="formatNumber(overview.service_health.unavailable_service_revisions)"
              />
              <DataField
                :title="$t('soracloud.apartments')"
                :value="formatNumber(overview.service_health.apartments)"
              />
              <DataField
                :title="$t('soracloud.runningApartments')"
                :value="formatNumber(overview.service_health.running_apartments)"
              />
              <DataField
                :title="$t('soracloud.expiredApartments')"
                :value="formatNumber(overview.service_health.expired_apartments)"
              />
            </div>
          </section>

          <section class="soracloud-page__panel">
            <h3 class="soracloud-page__panel-title">
              {{ $t('soracloud.routing') }}
            </h3>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.nexusEnabled')"
                :value="overview.routing.nexus_enabled ? $t('soracloud.yes') : $t('soracloud.no')"
              />
              <DataField
                :title="$t('soracloud.laneCount')"
                :value="formatNumber(overview.routing.lane_count)"
              />
              <DataField
                :title="$t('soracloud.dataspaceCount')"
                :value="formatNumber(overview.routing.dataspace_count)"
              />
              <DataField
                :title="$t('soracloud.routingRules')"
                :value="formatNumber(overview.routing.routing_rules)"
              />
              <DataField
                :title="$t('soracloud.defaultLaneId')"
                :value="formatNumber(overview.routing.default_lane_id)"
              />
              <DataField
                :title="$t('soracloud.defaultDataspaceId')"
                :value="formatNumber(overview.routing.default_dataspace_id)"
              />
            </div>
          </section>

          <section class="soracloud-page__panel">
            <h3 class="soracloud-page__panel-title">
              {{ $t('soracloud.resourcePressure') }}
            </h3>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.queueActive')"
                :value="formatNumber(overview.resource_pressure.queue_active)"
              />
              <DataField
                :title="$t('soracloud.queueQueued')"
                :value="formatNumber(overview.resource_pressure.queue_queued)"
              />
              <DataField
                :title="$t('soracloud.queueCapacity')"
                :value="formatNumber(overview.resource_pressure.queue_capacity)"
              />
              <DataField
                :title="$t('soracloud.queueSaturated')"
                :value="overview.resource_pressure.queue_saturated ? $t('soracloud.yes') : $t('soracloud.no')"
              />
              <DataField
                :title="$t('soracloud.highLoad')"
                :value="overview.resource_pressure.high_load ? $t('soracloud.yes') : $t('soracloud.no')"
              />
              <DataField
                :title="$t('soracloud.highLoadThreshold')"
                :value="formatNumber(overview.resource_pressure.high_load_threshold)"
              />
              <DataField
                :title="$t('soracloud.runtimeObservedHeight')"
                :value="formatNumber(overview.resource_pressure.runtime.observed_height)"
              />
              <DataField
                :title="$t('soracloud.maxLoadFactor')"
                :value="`${formatNumber(overview.resource_pressure.runtime.max_load_factor_bps / 100)}%`"
              />
              <DataField
                :title="$t('soracloud.reportedPendingMailboxMessages')"
                :value="formatNumber(overview.resource_pressure.runtime.reported_pending_mailbox_messages)"
              />
              <DataField
                :title="$t('soracloud.authoritativePendingMailboxMessages')"
                :value="formatNumber(overview.resource_pressure.runtime.authoritative_pending_mailbox_messages)"
              />
              <DataField
                :title="$t('soracloud.bundleCacheMisses')"
                :value="formatNumber(overview.resource_pressure.runtime.bundle_cache_misses)"
              />
              <DataField
                :title="$t('soracloud.artifactCacheMisses')"
                :value="formatNumber(overview.resource_pressure.runtime.artifact_cache_misses)"
              />
            </div>
          </section>

          <section class="soracloud-page__panel">
            <h3 class="soracloud-page__panel-title">
              {{ $t('soracloud.failedAdmissions') }}
            </h3>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.available')"
                :value="overview.failed_admissions.available ? $t('soracloud.yes') : $t('soracloud.no')"
              />
              <DataField
                :title="$t('soracloud.total')"
                :value="formatNumber(overview.failed_admissions.total)"
              />
              <DataField
                :title="$t('soracloud.governanceManifestRejected')"
                :value="formatNumber(overview.failed_admissions.governance_manifest_rejected)"
              />
              <DataField
                :title="$t('soracloud.sorafsProviderRejected')"
                :value="formatNumber(overview.failed_admissions.sorafs_provider_rejected)"
              />
            </div>
          </section>
        </div>
      </div>

      <p
        v-else-if="overviewRequest.error"
        class="soracloud-page__section-error"
        data-test="soracloud-error"
      >
        {{ overviewRequest.error }}
      </p>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('soracloud.controlPlaneServices')">
      <p
        v-if="overviewRequest.error && services.length"
        class="soracloud-page__inline-error"
      >
        {{ overviewRequest.error }}
      </p>

      <div
        v-if="services.length"
        class="soracloud-page__service-list"
      >
        <article
          v-for="service in services"
          :key="`${service.service_name}:${service.current_version}`"
          class="soracloud-page__service-card"
          data-test="soracloud-service"
        >
          <div class="soracloud-page__service-head">
            <h3 class="soracloud-page__service-title">
              {{ service.service_name }}
            </h3>
            <span class="row-text-monospace">
              {{ service.current_version }}
            </span>
          </div>

          <div class="soracloud-page__service-grid">
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.revisionCount') }}</span>
              <span class="row-text">{{ formatNumber(service.revision_count) }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.configEntries') }}</span>
              <span class="row-text">{{ formatNumber(service.config_entry_count) }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.secretEntries') }}</span>
              <span class="row-text">{{ formatNumber(service.secret_entry_count) }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.latestAction') }}</span>
              <span class="row-text">
                {{ service.latest_revision ? soracloudActionLabel(service.latest_revision.action) : $t('soracloud.unknownAction') }}
              </span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.replicas') }}</span>
              <span class="row-text">{{ formatNumber(service.latest_revision?.replicas ?? 0) }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.route') }}</span>
              <span class="row-text-monospace">{{ soracloudServiceRouteLabel(service) }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.activeRollout') }}</span>
              <span class="row-text">{{ service.active_rollout ? $t('soracloud.yes') : $t('soracloud.no') }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.lastRollout') }}</span>
              <span class="row-text">{{ service.last_rollout ? $t('soracloud.yes') : $t('soracloud.no') }}</span>
            </div>
          </div>
        </article>
      </div>

      <p
        v-else-if="overview"
        class="soracloud-page__empty"
        data-test="soracloud-services-empty"
      >
        {{ $t('soracloud.servicesEmpty') }}
      </p>

      <div
        v-else-if="overviewRequest.isLoading"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <p
        v-else
        class="soracloud-page__section-error"
      >
        {{ $t('soracloud.loadFailed') }}
      </p>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('soracloud.recentAudit')">
      <p
        v-if="overviewRequest.error && auditEvents.length"
        class="soracloud-page__inline-error"
      >
        {{ overviewRequest.error }}
      </p>

      <div
        v-if="auditEvents.length"
        class="soracloud-page__audit-list"
      >
        <article
          v-for="event in auditEvents"
          :key="`${event.sequence}:${event.service_name}:${event.to_version}`"
          class="soracloud-page__audit-card"
          data-test="soracloud-audit"
        >
          <div class="soracloud-page__audit-head">
            <span class="soracloud-page__audit-sequence">
              #{{ formatNumber(event.sequence) }}
            </span>
            <span class="soracloud-page__audit-action">
              {{ soracloudActionLabel(event.action) }}
            </span>
          </div>

          <div class="soracloud-page__service-grid">
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.service') }}</span>
              <span class="row-text">{{ event.service_name }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.fromVersion') }}</span>
              <span class="row-text-monospace">{{ event.from_version ?? '—' }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.toVersion') }}</span>
              <span class="row-text-monospace">{{ event.to_version }}</span>
            </div>
            <div class="soracloud-page__service-field">
              <span class="label">{{ $t('soracloud.governanceTxHash') }}</span>
              <span class="row-text-monospace">{{ event.governance_tx_hash ?? '—' }}</span>
            </div>
          </div>
        </article>
      </div>

      <p
        v-else-if="overview"
        class="soracloud-page__empty"
        data-test="soracloud-audit-empty"
      >
        {{ $t('soracloud.auditEmpty') }}
      </p>

      <div
        v-else-if="overviewRequest.isLoading"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <p
        v-else
        class="soracloud-page__section-error"
      >
        {{ $t('soracloud.loadFailed') }}
      </p>
    </BaseContentBlock>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type {
  SoracloudControlPlaneAuditEvent,
  SoracloudControlPlaneService,
  SoracloudStatus,
} from '@/shared/api/schemas';
import { formatNumber } from '@/shared/ui/utils/formatters';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { soracloudActionLabel, soracloudServiceRouteLabel } from '@/shared/lib/soracloud';
import { formatNullableNumber } from './display';
import type { SoracloudOverviewCard, SoracloudSectionState } from './types';

defineProps<{
  toriiBaseUrl: string
  isRefreshing: boolean
  overviewUpdatedAt: string | null
  overviewRequest: SoracloudSectionState<Record<string, never>, SoracloudStatus>
  overview: SoracloudStatus | null
  overviewCards: SoracloudOverviewCard[]
  services: SoracloudControlPlaneService[]
  auditEvents: SoracloudControlPlaneAuditEvent[]
  refreshAll: () => void
}>();

useI18n();
</script>
