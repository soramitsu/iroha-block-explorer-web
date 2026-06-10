<template>
  <BaseContentBlock :title="$t('soracloud.hfAgentInspector')">
    <BaseInnerBlock
      :title="$t('soracloud.hfSharedLeaseStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-hf-lease"
        @submit.prevent="handleSubmitHfLease"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.repoId') }}</span>
            <input
              v-model="hfLeaseDraft.repo_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.repoIdPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.revision') }}</span>
            <input
              v-model="hfLeaseDraft.revision"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.storageClass') }}</span>
            <input
              v-model="hfLeaseDraft.storage_class"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.storageClassPlaceholder')"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.leaseTermMs') }}</span>
            <input
              v-model="hfLeaseDraft.lease_term_ms"
              class="soracloud-page__input"
              inputmode="numeric"
              :placeholder="$t('soracloud.leaseTermPlaceholder')"
              data-test="soracloud-hf-lease-term-ms"
              @blur="validationTouched.hfLeaseTermMs = true"
            >
            <p
              v-if="hfLeaseTermMsError"
              class="soracloud-page__field-error"
              data-test="soracloud-hf-lease-term-ms-error"
            >
              {{ hfLeaseTermMsError }}
            </p>
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.accountId') }}</span>
            <input
              v-model="hfLeaseDraft.account_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-hf-account-id"
              @blur="validationTouched.hfLeaseAccountId = true"
            >
            <p
              v-if="hfLeaseAccountIdError"
              class="soracloud-page__field-error"
              data-test="soracloud-hf-account-id-error"
            >
              {{ hfLeaseAccountIdError }}
            </p>
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!hfLeaseDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!hfLeaseRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="hfLeaseRequest.isLoading && !hfLeaseRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="hfLeaseRequest.data">
        <p
          v-if="hfLeaseRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ hfLeaseRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.auditEventCount')"
            :value="formatNumber(hfLeaseRequest.data.audit_event_count)"
          />
          <DataField
            :title="$t('soracloud.storageBaseFeeNanos')"
            :value="hfLeaseRequest.data.storage_base_fee_nanos"
            monospace
          />
          <DataField
            :title="$t('soracloud.computeReservationFeeNanos')"
            :value="hfLeaseRequest.data.compute_reservation_fee_nanos"
            monospace
          />
          <DataField
            :title="$t('soracloud.eligibleHostCount')"
            :value="formatNumber(hfLeaseRequest.data.eligible_host_count)"
          />
          <DataField
            :title="$t('soracloud.warmHostCount')"
            :value="formatNumber(hfLeaseRequest.data.warm_host_count)"
          />
          <DataField
            :title="$t('soracloud.importerPending')"
            :value="hfLeaseRequest.data.importer_pending ? $t('soracloud.yes') : $t('soracloud.no')"
          />
        </div>

        <div class="soracloud-page__json-stack">
          <div class="soracloud-page__json-card">
            <span class="label">{{ $t('soracloud.source') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.source"
              full
            />
          </div>

          <div
            v-if="hfLeaseRequest.data.runtime_projection"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.runtimeProjection') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.runtime_projection"
              full
            />
          </div>

          <div
            v-if="hfLeaseRequest.data.pool"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.pool') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.pool"
              full
            />
          </div>

          <div
            v-if="hfLeaseRequest.data.member"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.member') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.member"
              full
            />
          </div>

          <div
            v-if="hfLeaseRequest.data.placement"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.placement') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.placement"
              full
            />
          </div>

          <div
            v-if="hfLeaseRequest.data.latest_audit_event"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.latestAuditEvent') }}</span>
            <BaseJson
              :value="hfLeaseRequest.data.latest_audit_event"
              full
            />
          </div>
        </div>
      </template>

      <p
        v-else-if="hfLeaseRequest.error"
        class="soracloud-page__section-error"
      >
        {{ hfLeaseRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.modelHostStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-model-host"
        @submit.prevent="handleSubmitModelHost"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.accountId') }}</span>
            <input
              v-model="modelHostDraft.account_id"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
              data-test="soracloud-model-host-account-id"
              @blur="validationTouched.modelHostAccountId = true"
            >
            <p
              v-if="modelHostAccountIdError"
              class="soracloud-page__field-error"
              data-test="soracloud-model-host-account-id-error"
            >
              {{ modelHostAccountIdError }}
            </p>
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!modelHostDraftReady"
        >
          {{ $t('soracloud.applyFilters') }}
        </button>
      </form>

      <div
        v-if="modelHostRequest.isLoading && !modelHostRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="modelHostRequest.data">
        <p
          v-if="modelHostRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ modelHostRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.validatorAccountId')"
            :value="modelHostRequest.data.validator_account_id ?? '—'"
          />
          <DataField
            :title="$t('soracloud.activeHostCount')"
            :value="formatNumber(modelHostRequest.data.active_host_count)"
          />
          <DataField
            :title="$t('soracloud.hosts')"
            :value="formatNumber(modelHostRequest.data.hosts.length)"
          />
        </div>

        <div
          v-if="modelHostRequest.data.hosts.length"
          class="soracloud-page__json-stack"
        >
          <div
            v-for="(host, index) in modelHostRequest.data.hosts"
            :key="index"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.host') }} {{ index + 1 }}</span>
            <BaseJson
              :value="host"
              full
            />
          </div>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="modelHostRequest.error"
        class="soracloud-page__section-error"
      >
        {{ modelHostRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.agentStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitAgentStatus"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.apartmentName') }}</span>
            <input
              v-model="agentStatusDraft.apartment_name"
              class="soracloud-page__input"
              :list="apartmentSuggestions.length ? 'soracloud-apartment-suggestions' : undefined"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
        >
          {{ $t('soracloud.applyFilters') }}
        </button>
      </form>

      <div
        v-if="agentStatusRequest.isLoading && !agentStatusRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="agentStatusRequest.data">
        <p
          v-if="agentStatusRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ agentStatusRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.apartmentCount')"
            :value="formatNumber(agentStatusRequest.data.apartment_count)"
          />
          <DataField
            :title="$t('soracloud.eventCount')"
            :value="formatNumber(agentStatusRequest.data.event_count)"
          />
        </div>

        <div
          v-if="agentStatusRequest.data.apartments.length"
          class="soracloud-page__entry-list"
        >
          <article
            v-for="apartment in agentStatusRequest.data.apartments"
            :key="apartment.apartment_name"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title">
                {{ apartment.apartment_name }}
              </h4>
              <span class="row-text">{{ apartment.status }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.manifestHash')"
                :value="apartment.manifest_hash"
                :hash="apartment.manifest_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.leaseStartedSequence')"
                :value="formatNumber(apartment.lease_started_sequence)"
              />
              <DataField
                :title="$t('soracloud.leaseExpiresSequence')"
                :value="formatNumber(apartment.lease_expires_sequence)"
              />
              <DataField
                :title="$t('soracloud.leaseRemainingTicks')"
                :value="formatNumber(apartment.lease_remaining_ticks)"
              />
              <DataField
                :title="$t('soracloud.restartCount')"
                :value="formatNumber(apartment.restart_count)"
              />
              <DataField
                :title="$t('soracloud.stateQuotaBytes')"
                :value="formatBytes(apartment.state_quota_bytes)"
              />
              <DataField
                :title="$t('soracloud.toolCapabilityCount')"
                :value="formatNumber(apartment.tool_capability_count)"
              />
              <DataField
                :title="$t('soracloud.policyCapabilityCount')"
                :value="formatNumber(apartment.policy_capability_count)"
              />
              <DataField
                :title="$t('soracloud.revokedPolicyCapabilityCount')"
                :value="formatNumber(apartment.revoked_policy_capability_count)"
              />
              <DataField
                :title="$t('soracloud.pendingWalletRequestCount')"
                :value="formatNumber(apartment.pending_wallet_request_count)"
              />
              <DataField
                :title="$t('soracloud.pendingMessageCount')"
                :value="formatNumber(apartment.pending_mailbox_message_count)"
              />
              <DataField
                :title="$t('soracloud.autonomyBudgetCeilingUnits')"
                :value="formatNumber(apartment.autonomy_budget_ceiling_units)"
              />
              <DataField
                :title="$t('soracloud.autonomyBudgetRemainingUnits')"
                :value="formatNumber(apartment.autonomy_budget_remaining_units)"
              />
              <DataField
                :title="$t('soracloud.artifactAllowlistCount')"
                :value="formatNumber(apartment.artifact_allowlist_count)"
              />
              <DataField
                :title="$t('soracloud.autonomyRunCount')"
                :value="formatNumber(apartment.autonomy_run_count)"
              />
              <DataField
                :title="$t('soracloud.processGeneration')"
                :value="formatNumber(apartment.process_generation)"
              />
              <DataField
                :title="$t('soracloud.processStartedSequence')"
                :value="formatNumber(apartment.process_started_sequence)"
              />
              <DataField
                :title="$t('soracloud.lastActiveSequence')"
                :value="formatNumber(apartment.last_active_sequence)"
              />
              <DataField
                :title="$t('soracloud.lastCheckpointSequence')"
                :value="formatNullableNumber(apartment.last_checkpoint_sequence)"
              />
              <DataField
                :title="$t('soracloud.checkpointCount')"
                :value="formatNumber(apartment.checkpoint_count)"
              />
              <DataField
                :title="$t('soracloud.persistentStateTotalBytes')"
                :value="formatBytes(apartment.persistent_state_total_bytes)"
              />
              <DataField
                :title="$t('soracloud.persistentStateKeyCount')"
                :value="formatNumber(apartment.persistent_state_key_count)"
              />
              <DataField
                :title="$t('soracloud.spendLimitCount')"
                :value="formatNumber(apartment.spend_limit_count)"
              />
              <DataField
                :title="$t('soracloud.upgradePolicy')"
                :value="jsonString(apartment.upgrade_policy)"
              />
              <DataField
                :title="$t('soracloud.lastRestartSequence')"
                :value="formatNullableNumber(apartment.last_restart_sequence)"
              />
              <DataField
                :title="$t('soracloud.lastRestartReason')"
                :value="apartment.last_restart_reason ?? '—'"
              />
            </div>
          </article>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="agentStatusRequest.error"
        class="soracloud-page__section-error"
      >
        {{ agentStatusRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.agentMailboxStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitAgentMailbox"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.apartmentName') }}</span>
            <input
              v-model="agentMailboxDraft.apartment_name"
              class="soracloud-page__input"
              :list="apartmentSuggestions.length ? 'soracloud-apartment-suggestions' : undefined"
              :placeholder="$t('soracloud.apartmentPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!agentMailboxDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!agentMailboxRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="agentMailboxRequest.isLoading && !agentMailboxRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="agentMailboxRequest.data">
        <p
          v-if="agentMailboxRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ agentMailboxRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.apartmentName')"
            :value="agentMailboxRequest.data.apartment_name"
          />
          <DataField
            :title="$t('soracloud.status')"
            :value="agentMailboxRequest.data.status"
          />
          <DataField
            :title="$t('soracloud.pendingMessageCount')"
            :value="formatNumber(agentMailboxRequest.data.pending_message_count)"
          />
          <DataField
            :title="$t('soracloud.eventCount')"
            :value="formatNumber(agentMailboxRequest.data.event_count)"
          />
        </div>

        <div
          v-if="agentMailboxRequest.data.messages.length"
          class="soracloud-page__entry-list"
        >
          <article
            v-for="message in agentMailboxRequest.data.messages"
            :key="message.message_id"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title row-text-monospace">
                {{ message.message_id }}
              </h4>
              <span class="row-text">{{ message.channel }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.fromApartment')"
                :value="message.from_apartment"
              />
              <DataField
                :title="$t('soracloud.channel')"
                :value="message.channel"
              />
              <DataField
                :title="$t('soracloud.payloadHash')"
                :value="message.payload_hash"
                :hash="message.payload_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.enqueuedSequence')"
                :value="formatNumber(message.enqueued_sequence)"
              />
            </div>

            <div class="soracloud-page__json-card">
              <span class="label">{{ $t('soracloud.payload') }}</span>
              <BaseJson
                :value="{ payload: message.payload }"
                full
              />
            </div>
          </article>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="agentMailboxRequest.error"
        class="soracloud-page__section-error"
      >
        {{ agentMailboxRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.agentAutonomyStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        @submit.prevent="submitAgentAutonomy"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.apartmentName') }}</span>
            <input
              v-model="agentAutonomyDraft.apartment_name"
              class="soracloud-page__input"
              :list="apartmentSuggestions.length ? 'soracloud-apartment-suggestions' : undefined"
              :placeholder="$t('soracloud.apartmentPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!agentAutonomyDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!agentAutonomyRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="agentAutonomyRequest.isLoading && !agentAutonomyRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="agentAutonomyRequest.data">
        <p
          v-if="agentAutonomyRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ agentAutonomyRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.apartmentName')"
            :value="agentAutonomyRequest.data.apartment_name"
          />
          <DataField
            :title="$t('soracloud.sequence')"
            :value="formatNumber(agentAutonomyRequest.data.sequence)"
          />
          <DataField
            :title="$t('soracloud.status')"
            :value="agentAutonomyRequest.data.status"
          />
          <DataField
            :title="$t('soracloud.leaseExpiresSequence')"
            :value="formatNumber(agentAutonomyRequest.data.lease_expires_sequence)"
          />
          <DataField
            :title="$t('soracloud.leaseRemainingTicks')"
            :value="formatNumber(agentAutonomyRequest.data.lease_remaining_ticks)"
          />
          <DataField
            :title="$t('soracloud.manifestHash')"
            :value="agentAutonomyRequest.data.manifest_hash"
            :hash="agentAutonomyRequest.data.manifest_hash"
            monospace
          />
          <DataField
            :title="$t('soracloud.revokedPolicyCapabilityCount')"
            :value="formatNumber(agentAutonomyRequest.data.revoked_policy_capability_count)"
          />
          <DataField
            :title="$t('soracloud.budgetCeilingUnits')"
            :value="formatNumber(agentAutonomyRequest.data.budget_ceiling_units)"
          />
          <DataField
            :title="$t('soracloud.budgetRemainingUnits')"
            :value="formatNumber(agentAutonomyRequest.data.budget_remaining_units)"
          />
          <DataField
            :title="$t('soracloud.allowlistCount')"
            :value="formatNumber(agentAutonomyRequest.data.allowlist_count)"
          />
          <DataField
            :title="$t('soracloud.runCount')"
            :value="formatNumber(agentAutonomyRequest.data.run_count)"
          />
          <DataField
            :title="$t('soracloud.processGeneration')"
            :value="formatNumber(agentAutonomyRequest.data.process_generation)"
          />
          <DataField
            :title="$t('soracloud.processStartedSequence')"
            :value="formatNumber(agentAutonomyRequest.data.process_started_sequence)"
          />
          <DataField
            :title="$t('soracloud.lastActiveSequence')"
            :value="formatNumber(agentAutonomyRequest.data.last_active_sequence)"
          />
          <DataField
            :title="$t('soracloud.lastCheckpointSequence')"
            :value="formatNullableNumber(agentAutonomyRequest.data.last_checkpoint_sequence)"
          />
          <DataField
            :title="$t('soracloud.checkpointCount')"
            :value="formatNumber(agentAutonomyRequest.data.checkpoint_count)"
          />
          <DataField
            :title="$t('soracloud.persistentStateTotalBytes')"
            :value="formatBytes(agentAutonomyRequest.data.persistent_state_total_bytes)"
          />
          <DataField
            :title="$t('soracloud.persistentStateKeyCount')"
            :value="formatNumber(agentAutonomyRequest.data.persistent_state_key_count)"
          />
        </div>

        <div class="soracloud-page__json-stack">
          <div
            v-if="agentAutonomyRequest.data.allowlist.length"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.allowlist') }}</span>
            <BaseJson
              :value="{ allowlist: agentAutonomyRequest.data.allowlist }"
              full
            />
          </div>

          <div
            v-if="agentAutonomyRequest.data.recent_runs.length"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.recentRuns') }}</span>
            <BaseJson
              :value="{ recent_runs: agentAutonomyRequest.data.recent_runs }"
              full
            />
          </div>

          <div
            v-if="agentAutonomyRequest.data.runtime_recent_runs.length"
            class="soracloud-page__json-card"
          >
            <span class="label">{{ $t('soracloud.runtimeRecentRuns') }}</span>
            <BaseJson
              :value="{ runtime_recent_runs: agentAutonomyRequest.data.runtime_recent_runs }"
              full
            />
          </div>
        </div>
      </template>

      <p
        v-else-if="agentAutonomyRequest.error"
        class="soracloud-page__section-error"
      >
        {{ agentAutonomyRequest.error }}
      </p>
    </BaseInnerBlock>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  SoracloudAgentAutonomyStatusQuery,
  SoracloudAgentAutonomyStatusResponse,
  SoracloudAgentMailboxStatusQuery,
  SoracloudAgentMailboxStatusResponse,
  SoracloudAgentStatusQuery,
  SoracloudAgentStatusResponse,
  SoracloudHfSharedLeaseStatusQuery,
  SoracloudHfSharedLeaseStatusResponse,
  SoracloudModelHostStatusQuery,
  SoracloudModelHostStatusResponse,
} from '@/shared/api/schemas';
import { formatBytes, formatNumber } from '@/shared/ui/utils/formatters';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseInnerBlock from '@/shared/ui/components/BaseInnerBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { formatNullableNumber, jsonString } from './display';
import type { SoracloudParsedField, SoracloudSectionState } from './types';
import { soracloudValidationMessageKey } from './validation';

const { t } = useI18n();

const hfLeaseDraft = defineModel<{
  repo_id: string
  revision: string
  storage_class: string
  lease_term_ms: string
  account_id: string
}>('hfLeaseDraft', { required: true });
const modelHostDraft = defineModel<{ account_id: string }>('modelHostDraft', { required: true });
const agentStatusDraft = defineModel<{ apartment_name: string }>('agentStatusDraft', { required: true });
const agentMailboxDraft = defineModel<{ apartment_name: string }>('agentMailboxDraft', { required: true });
const agentAutonomyDraft = defineModel<{ apartment_name: string }>('agentAutonomyDraft', { required: true });

const props = defineProps<{
  apartmentSuggestions: string[]
  hfLeaseDraftReady: boolean
  modelHostDraftReady: boolean
  agentMailboxDraftReady: boolean
  agentAutonomyDraftReady: boolean
  hfLeaseRequest: SoracloudSectionState<SoracloudHfSharedLeaseStatusQuery, SoracloudHfSharedLeaseStatusResponse>
  modelHostRequest: SoracloudSectionState<SoracloudModelHostStatusQuery, SoracloudModelHostStatusResponse>
  agentStatusRequest: SoracloudSectionState<SoracloudAgentStatusQuery, SoracloudAgentStatusResponse>
  agentMailboxRequest: SoracloudSectionState<SoracloudAgentMailboxStatusQuery, SoracloudAgentMailboxStatusResponse>
  agentAutonomyRequest: SoracloudSectionState<SoracloudAgentAutonomyStatusQuery, SoracloudAgentAutonomyStatusResponse>
  hfLeaseLeaseTermValidation: SoracloudParsedField<number>
  hfLeaseAccountIdValidation: SoracloudParsedField<string>
  modelHostAccountIdValidation: SoracloudParsedField<string>
  submitHfLease: () => void
  submitModelHost: () => void
  submitAgentStatus: () => void
  submitAgentMailbox: () => void
  submitAgentAutonomy: () => void
}>();

const validationTouched = reactive({
  hfLeaseTermMs: false,
  hfLeaseAccountId: false,
  modelHostAccountId: false,
});

const validationSubmitted = reactive({
  hfLease: false,
  modelHost: false,
});

function resolveValidationMessage(
  error: SoracloudParsedField<string>['error'] | SoracloudParsedField<number>['error'],
  touched: boolean,
  submitted: boolean
) {
  if (!error || (!touched && !submitted)) return null;
  return t(soracloudValidationMessageKey(error));
}

const hfLeaseTermMsError = computed(() =>
  resolveValidationMessage(
    props.hfLeaseLeaseTermValidation.error,
    validationTouched.hfLeaseTermMs,
    validationSubmitted.hfLease
  )
);
const hfLeaseAccountIdError = computed(() =>
  resolveValidationMessage(
    props.hfLeaseAccountIdValidation.error,
    validationTouched.hfLeaseAccountId,
    validationSubmitted.hfLease
  )
);
const modelHostAccountIdError = computed(() =>
  resolveValidationMessage(
    props.modelHostAccountIdValidation.error,
    validationTouched.modelHostAccountId,
    validationSubmitted.modelHost
  )
);

function handleSubmitHfLease() {
  validationSubmitted.hfLease = true;
  if (!props.hfLeaseDraftReady) return;
  props.submitHfLease();
}

function handleSubmitModelHost() {
  validationSubmitted.modelHost = true;
  if (!props.modelHostDraftReady) return;
  props.submitModelHost();
}
</script>
