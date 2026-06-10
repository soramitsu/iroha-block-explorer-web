<template>
  <div class="sorafs-registry-page">
    <BaseContentBlock :title="$t('sorafs.registryTitle')">
      <template #default>
        <div
          v-if="pinAttestation"
          class="sorafs-registry-page__attestation"
        >
          <DataField
            :title="$t('sorafs.attestation.height')"
            :value="pinAttestation.block_height"
            monospace
          />
          <DataField
            :title="$t('sorafs.attestation.hash')"
            :hash="pinAttestation.block_hash_hex ?? undefined"
            :value="pinAttestation.block_hash_hex ?? '—'"
            monospace
          />
          <DataField
            :title="$t('sorafs.attestation.chain')"
            :value="pinAttestation.chain_id"
            monospace
          />
        </div>
        <BaseLoading v-else-if="isManifestsLoading" />
        <span
          v-else
          class="row-text"
        >
          {{ $t('sorafs.attestation.unavailable') }}
        </span>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('sorafs.manifestsTitle')">
      <template #default>
        <div class="sorafs-registry-page__filters">
          <label>
            {{ $t('sorafs.filters.status') }}
            <select v-model="manifestFilters.status">
              <option value="all">
                {{ $t('sorafs.filters.statusAll') }}
              </option>
              <option
                v-for="state in manifestStatusOptions"
                :key="state"
                :value="state"
              >
                {{ $t(`sorafs.manifestStatus.${state}`) }}
              </option>
            </select>
          </label>
        </div>

        <BaseTable
          v-model:page="manifestFilters.page"
          v-model:page-size="manifestFilters.per_page"
          :loading="isManifestsLoading"
          :items="manifests"
          :total="manifestsTotal"
          :payload-pagination="manifestsPagination"
          :row-key="manifestRowKey"
          container-class="sorafs-registry-page__table"
          row-pointer
          @click:row="selectManifest"
        >
          <template #header>
            <div class="sorafs-registry-page__row sorafs-registry-page__row--header">
              <span>{{ $t('sorafs.columns.digest') }}</span>
              <span>{{ $t('sorafs.columns.status') }}</span>
              <span>{{ $t('sorafs.columns.alias') }}</span>
              <span>{{ $t('sorafs.columns.chunker') }}</span>
              <span>{{ $t('sorafs.columns.submittedBy') }}</span>
              <span>{{ $t('sorafs.columns.successor') }}</span>
            </div>
          </template>

          <template #row="{ item }">
            <div
              :class="[
                'sorafs-registry-page__row',
                selectedManifestId === item.digest_hex ? 'sorafs-registry-page__row--selected' : null,
              ]"
            >
              <BaseHash
                :hash="item.digest_hex"
                type="medium"
                copy
              />

              <span :class="['sorafs-status-pill', `sorafs-status-pill--${item.status.state}`]">
                {{ $t(`sorafs.manifestStatus.${item.status.state}`) }}
              </span>

              <span class="row-text-monospace">
                {{ item.alias?.name ?? '—' }}
              </span>

              <span class="row-text">
                {{ item.chunker.namespace }}.{{ item.chunker.name }}@{{ item.chunker.semver }}
              </span>

              <BaseLink
                :to="`/accounts/${item.submitted_by}`"
                monospace
              >
                {{ item.submitted_by }}
              </BaseLink>

              <span class="row-text">
                {{ sorafsSuccessorLabel(item.lineage?.immediate_successor) }}
              </span>
            </div>
          </template>
        </BaseTable>

        <div
          v-if="selectedManifest"
          :id="`manifest-${selectedManifest.digest_hex}`"
          class="sorafs-registry-page__detail"
        >
          <h3>{{ $t('sorafs.detail.title') }} {{ selectedManifest.digest_hex }}</h3>

          <div class="sorafs-registry-page__detail-grid">
            <DataField
              :title="$t('sorafs.columns.status')"
              :value="$t(`sorafs.manifestStatus.${selectedManifest.status.state}`)"
            />
            <DataField
              :title="$t('sorafs.columns.alias')"
              :value="selectedManifest.alias?.name ?? '—'"
            />
            <DataField
              :title="$t('sorafs.detail.submittedBy')"
              :hash="selectedManifest.submitted_by"
              :link="`/accounts/${selectedManifest.submitted_by}`"
            />
            <DataField
              :title="$t('sorafs.detail.submittedEpoch')"
              :value="selectedManifest.submitted_epoch"
            />
            <DataField
              :title="$t('sorafs.detail.statusTimestamp')"
              :value="selectedManifest.status_timestamp_unix ?? '—'"
            />
            <DataField
              :title="$t('sorafs.detail.rootCid')"
              :value="selectedManifestRootCid ?? '—'"
              :link="selectedManifestRootLink ?? undefined"
              monospace
            />
            <DataField
              :title="$t('sorafs.detail.contentLength')"
              :value="selectedManifestStorage?.content_length ?? '—'"
            />
            <DataField
              :title="$t('sorafs.detail.chunkCount')"
              :value="selectedManifestStorage?.chunk_count ?? '—'"
            />
            <DataField
              :title="$t('sorafs.detail.chunkProfile')"
              :value="selectedManifestStorage?.chunk_profile_handle ?? '—'"
              monospace
            />
          </div>

          <div class="sorafs-registry-page__detail-panels">
            <div>
              <h4>{{ $t('sorafs.detail.pinPolicy') }}</h4>
              <BaseJson :value="selectedManifest.pin_policy" />
            </div>
            <div>
              <h4>{{ $t('sorafs.detail.metadata') }}</h4>
              <BaseJson :value="selectedManifest.metadata" />
            </div>
          </div>

          <div class="sorafs-registry-page__detail-panels">
            <div>
              <h4>{{ $t('sorafs.detail.deployedFiles') }}</h4>
              <div
                v-if="selectedManifestModeration"
                class="sorafs-registry-page__moderation-card"
                data-testid="sorafs-moderation-card"
              >
                <strong data-testid="sorafs-moderation-status">{{ selectedManifestModerationHeadline }}</strong>
                <span class="row-text">{{ selectedManifestModerationSummary }}</span>
                <ul
                  v-if="selectedManifestModerationRows.length > 0"
                  class="sorafs-registry-page__moderation-list"
                >
                  <li
                    v-for="row in selectedManifestModerationRows"
                    :key="row.key"
                    class="sorafs-registry-page__moderation-row"
                  >
                    <strong>{{ row.headline }}</strong>
                    <span>{{ row.details }}</span>
                  </li>
                </ul>
              </div>
              <BaseLoading v-if="isSelectedManifestStorageLoading" />
              <span
                v-else-if="selectedManifestStorageLoadFailed"
                class="row-text"
              >
                {{ $t('sorafs.detail.storageUnavailable') }}
              </span>
              <ul
                v-else-if="selectedManifestFiles.length > 0"
                class="sorafs-registry-page__files"
              >
                <li
                  v-if="selectedManifestPublicLinksBlocked"
                  class="sorafs-registry-page__file-status"
                  data-testid="sorafs-public-links-blocked"
                >
                  {{ $t('sorafs.detail.publicLinksBlocked') }}
                </li>
                <li
                  v-else-if="selectedManifestPublicLinksUnavailable"
                  class="sorafs-registry-page__file-status"
                >
                  {{ $t('sorafs.detail.publicLinksUnavailable') }}
                </li>
                <li
                  v-for="file in selectedManifestFiles"
                  :key="file.key"
                  class="sorafs-registry-page__file-row"
                >
                  <BaseLink
                    v-if="file.url && !selectedManifestPublicLinksBlocked"
                    :to="file.url"
                    monospace
                  >
                    {{ file.pathLabel }}
                  </BaseLink>
                  <span
                    v-else
                    class="row-text-monospace"
                    data-testid="sorafs-file-path-blocked"
                  >
                    {{ file.pathLabel }}
                  </span>
                  <span class="row-text">{{ file.size }} B</span>
                  <span class="row-text">
                    {{ file.chunkCount }}
                    {{ file.chunkCount === 1 ? $t('sorafs.detail.chunk') : $t('sorafs.detail.chunks') }}
                  </span>
                </li>
              </ul>
              <span
                v-else
                class="row-text"
              >
                {{ $t('sorafs.detail.noFiles') }}
              </span>
            </div>
          </div>

          <div class="sorafs-registry-page__detail-panels">
            <div class="sorafs-registry-page__panel-card">
              <div class="sorafs-registry-page__panel-header">
                <div>
                  <h4>{{ $t('sorafs.connect.title') }}</h4>
                  <p class="row-text">
                    {{ $t('sorafs.connect.description') }}
                  </p>
                </div>
                <BaseButton
                  data-testid="sorafs-connect-create"
                  bordered
                  :disabled="!canCreateConnectSession"
                  @click="createWalletConnectSession"
                >
                  {{ isCreatingConnectSession ? $t('sorafs.connect.creatingSession') : $t('sorafs.connect.createSession') }}
                </BaseButton>
              </div>

              <BaseLoading v-if="isConnectStatusLoading" />
              <span
                v-else-if="connectStatusUnavailable"
                class="row-text"
              >
                {{ $t('sorafs.connect.unavailable') }}
              </span>
              <span
                v-else-if="connectStatusLoadFailed"
                class="row-text"
              >
                {{ $t('sorafs.connect.loadFailed') }}
              </span>
              <template v-else-if="connectStatus">
                <ul class="sorafs-registry-page__meta-list">
                  <li>
                    <strong>{{ $t('sorafs.connect.sessionTtl') }}:</strong>
                    <span>{{ connectSessionTtlLabel }}</span>
                  </li>
                  <li>
                    <strong>{{ $t('sorafs.connect.perIpCap') }}:</strong>
                    <span>{{ connectStatus.policy.ws_per_ip_max_sessions }}</span>
                  </li>
                  <li>
                    <strong>{{ $t('sorafs.connect.relayMode') }}:</strong>
                    <span>{{ connectStatus.policy.relay_effective_strategy }}</span>
                  </li>
                </ul>

                <div
                  v-if="walletConnectSession"
                  class="sorafs-registry-page__wallet-session"
                >
                  <img
                    v-if="walletConnectQr"
                    :src="walletConnectQr"
                    :alt="$t('sorafs.connect.qrAlt')"
                    class="sorafs-registry-page__wallet-qr"
                  >

                  <div class="sorafs-registry-page__wallet-session-copy">
                    <a
                      :href="walletConnectLaunchUri ?? walletConnectSession.wallet_uri"
                      class="sorafs-registry-page__wallet-link"
                      data-testid="sorafs-connect-wallet-link"
                    >
                      {{ $t('sorafs.connect.openWallet') }}
                    </a>

                    <div class="sorafs-registry-page__connect-actions">
                      <BaseButton
                        bordered
                        @click="copyWalletConnectValue(walletConnectLaunchUri ?? walletConnectSession.wallet_uri)"
                      >
                        {{ $t('sorafs.connect.copyLaunchLink') }}
                      </BaseButton>
                      <BaseButton
                        bordered
                        @click="copyWalletConnectValue(walletConnectSession.sid)"
                      >
                        {{ $t('sorafs.connect.copySid') }}
                      </BaseButton>
                    </div>

                    <DataField
                      :title="$t('sorafs.connect.sid')"
                      :value="walletConnectSession.sid"
                      monospace
                    />
                  </div>
                </div>

                <span
                  v-else
                  class="row-text"
                >
                  {{ $t('sorafs.connect.noActiveSession') }}
                </span>
              </template>
            </div>

            <div class="sorafs-registry-page__panel-card">
              <div class="sorafs-registry-page__panel-header">
                <div>
                  <h4>{{ $t('sorafs.proposal.title') }}</h4>
                  <p class="row-text">
                    {{ blacklistProposalDescription }}
                  </p>
                </div>
                <BaseButton
                  data-testid="sorafs-blacklist-copy"
                  bordered
                  :disabled="!blacklistProposalReady"
                  @click="copyBlacklistProposalDraft"
                >
                  {{ $t('sorafs.proposal.copyDraft') }}
                </BaseButton>
              </div>

              <span
                v-if="!selectedManifestRootCidHex"
                class="row-text"
              >
                {{ $t('sorafs.proposal.missingRootCid') }}
              </span>
              <template v-else>
                <ul class="sorafs-registry-page__meta-list">
                  <li data-testid="sorafs-blacklist-action">
                    <strong>{{ $t('sorafs.proposal.proposedAction') }}:</strong>
                    <code>{{ blacklistProposalAction }}</code>
                  </li>
                  <li v-if="selectedManifestModeration">
                    <strong>{{ $t('sorafs.proposal.gatewayStatus') }}:</strong>
                    <span>{{ selectedManifestModerationHeadline }}</span>
                  </li>
                </ul>

                <div class="sorafs-registry-page__proposal-form">
                  <label v-if="blacklistProposalAction === 'add-to-denylist'">
                    {{ $t('sorafs.proposal.reason') }}
                    <select
                      v-model="blacklistProposalForm.reasonTag"
                      data-testid="sorafs-blacklist-reason"
                    >
                      <option
                        v-for="option in blacklistReasonOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.proposalId') }}
                    <input
                      v-model="blacklistProposalForm.proposalId"
                      data-testid="sorafs-blacklist-proposal-id"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.proposalId')"
                    >
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.submitterName') }}
                    <input
                      v-model="blacklistProposalForm.submitterName"
                      data-testid="sorafs-blacklist-submitter-name"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.submitterName')"
                    >
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.submitterContact') }}
                    <input
                      v-model="blacklistProposalForm.submitterContact"
                      data-testid="sorafs-blacklist-submitter-contact"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.submitterContact')"
                    >
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.organization') }}
                    <input
                      v-model="blacklistProposalForm.submitterOrganization"
                      data-testid="sorafs-blacklist-submitter-organization"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.organization')"
                    >
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.pgpFingerprint') }}
                    <input
                      v-model="blacklistProposalForm.submitterPgpFingerprint"
                      data-testid="sorafs-blacklist-submitter-pgp"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.pgpFingerprint')"
                    >
                  </label>

                  <label>
                    {{ $t('sorafs.proposal.duplicateProposals') }}
                    <input
                      v-model="blacklistProposalForm.duplicatesRaw"
                      data-testid="sorafs-blacklist-duplicates"
                      type="text"
                      :placeholder="$t('sorafs.proposal.placeholders.duplicateProposals')"
                    >
                  </label>
                </div>

                <label class="sorafs-registry-page__textarea-field">
                  {{ blacklistProposalNoteLabel }}
                  <textarea
                    v-model="blacklistProposalForm.note"
                    data-testid="sorafs-blacklist-note"
                    rows="4"
                    :placeholder="blacklistProposalNotePlaceholder"
                  />
                </label>

                <ul
                  v-if="blacklistProposalDraftIssues.length > 0"
                  class="sorafs-registry-page__draft-issues"
                >
                  <li
                    v-for="issue in blacklistProposalDraftIssues"
                    :key="issue"
                  >
                    {{ issue }}
                  </li>
                </ul>

                <BaseJson
                  v-if="blacklistProposalDraft"
                  :value="blacklistProposalDraft"
                  data-testid="sorafs-blacklist-draft"
                />

                <template v-if="blacklistProposalDraft && blacklistProposalFilename && blacklistProposalValidateCommand">
                  <ul class="sorafs-registry-page__meta-list">
                    <li data-testid="sorafs-blacklist-filename">
                      <strong>{{ $t('sorafs.proposal.suggestedFile') }}:</strong>
                      <code>{{ blacklistProposalFilename }}</code>
                    </li>
                    <li data-testid="sorafs-blacklist-validate-command">
                      <strong>{{ $t('sorafs.proposal.validateLocally') }}:</strong>
                      <code>{{ blacklistProposalValidateCommand }}</code>
                    </li>
                    <li
                      v-if="blacklistProposalImpactCommand"
                      data-testid="sorafs-blacklist-impact-command"
                    >
                      <strong>{{ $t('sorafs.proposal.impactReport') }}:</strong>
                      <code>{{ blacklistProposalImpactCommand }}</code>
                    </li>
                  </ul>

                  <div class="sorafs-registry-page__connect-actions">
                    <BaseButton
                      data-testid="sorafs-blacklist-download"
                      bordered
                      :disabled="!blacklistProposalReady"
                      @click="downloadBlacklistProposalDraft"
                    >
                      {{ $t('sorafs.proposal.downloadDraft') }}
                    </BaseButton>
                    <BaseButton
                      data-testid="sorafs-blacklist-copy-validate"
                      bordered
                      :disabled="!blacklistProposalReady"
                      @click="copyBlacklistValidateCommand"
                    >
                      {{ $t('sorafs.proposal.copyValidateCommand') }}
                    </BaseButton>
                    <BaseButton
                      data-testid="sorafs-blacklist-copy-impact"
                      bordered
                      :disabled="!blacklistProposalReady"
                      @click="copyBlacklistImpactCommand"
                    >
                      {{ $t('sorafs.proposal.copyImpactCommand') }}
                    </BaseButton>
                    <BaseButton
                      data-testid="sorafs-blacklist-submit"
                      bordered
                      :disabled="!canSubmitBlacklistProposal"
                      @click="submitBlacklistProposal"
                    >
                      {{ blacklistProposalSubmitLabel }}
                    </BaseButton>
                  </div>
                </template>

                <p
                  class="row-text"
                  data-testid="sorafs-connect-submission-state"
                >
                  {{ blacklistProposalSubmissionStateLabel }}
                </p>
                <p
                  v-if="blacklistProposalSubmissionError"
                  class="row-text"
                  data-testid="sorafs-connect-submission-error"
                >
                  {{ blacklistProposalSubmissionError }}
                </p>
                <DataField
                  v-if="approvedWalletAccountId"
                  :title="$t('sorafs.connect.approvedAccount')"
                  :value="approvedWalletAccountId"
                  monospace
                />
                <BaseJson
                  v-if="submittedAgendaRecord"
                  :value="submittedAgendaRecord"
                  data-testid="sorafs-blacklist-submission-record"
                />
                <p class="row-text">
                  {{ blacklistProposalSubmissionHelp }}
                </p>
              </template>
            </div>
          </div>

          <div class="sorafs-registry-page__detail-panels">
            <div>
              <h4>{{ $t('sorafs.detail.lineage') }}</h4>
              <ul class="sorafs-registry-page__lineage">
                <li>
                  <strong>{{ $t('sorafs.detail.lineageHead') }}:</strong>
                  <span>{{ selectedManifest.lineage?.head_hex ?? '—' }}</span>
                </li>
                <li>
                  <strong>{{ $t('sorafs.detail.lineageDepth') }}:</strong>
                  <span>{{ selectedManifest.lineage?.depth_to_head ?? 0 }}</span>
                </li>
                <li>
                  <strong>{{ $t('sorafs.detail.lineageSuccessor') }}:</strong>
                  <span>{{ selectedManifest.lineage?.immediate_successor?.digest_hex ?? '—' }}</span>
                </li>
              </ul>
            </div>

            <div>
              <h4>{{ $t('sorafs.detail.governanceRefs') }}</h4>
              <ul class="sorafs-registry-page__gov-list">
                <li
                  v-for="governanceRef in selectedManifest.governance_refs"
                  :key="`${governanceRef.kind}-${governanceRef.effective_at_unix ?? 0}`"
                >
                  <strong>{{ governanceRef.kind }}</strong>
                  <span v-if="governanceRef.targets?.alias"> · {{ governanceRef.targets.alias }}</span>
                  <span v-if="governanceRef.targets?.pin_digest_hex"> · {{ governanceRef.targets.pin_digest_hex }}</span>
                </li>
                <li v-if="selectedManifest.governance_refs.length === 0">
                  {{ $t('sorafs.detail.noGovernanceRefs') }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('sorafs.aliasesTitle')">
      <template #default>
        <div class="sorafs-registry-page__filters">
          <label>
            {{ $t('sorafs.filters.namespace') }}
            <input
              v-model="aliasFilters.namespace"
              type="text"
              :placeholder="$t('sorafs.filters.namespacePlaceholder')"
            >
          </label>

          <label>
            {{ $t('sorafs.filters.manifestDigest') }}
            <input
              v-model="aliasFilters.manifest"
              type="text"
              :placeholder="$t('sorafs.filters.manifestPlaceholder')"
            >
          </label>
        </div>

        <BaseTable
          v-model:page="aliasFilters.page"
          v-model:page-size="aliasFilters.per_page"
          :loading="areAliasesLoading"
          :items="aliasItems"
          :total="aliasTotal"
          :payload-pagination="aliasPagination"
          :row-key="aliasRowKey"
          container-class="sorafs-registry-page__table"
        >
          <template #header>
            <div class="sorafs-registry-page__row sorafs-registry-page__row--header">
              <span>{{ $t('sorafs.columns.alias') }}</span>
              <span>{{ $t('sorafs.columns.namespace') }}</span>
              <span>{{ $t('sorafs.columns.manifest') }}</span>
              <span>{{ $t('sorafs.columns.boundBy') }}</span>
              <span>{{ $t('sorafs.columns.expiry') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="sorafs-registry-page__row">
              <span class="row-text">{{ item.alias }}</span>
              <span class="row-text">{{ item.namespace }}</span>
              <BaseHash
                :hash="item.manifest_digest_hex"
                type="short"
                copy
              />
              <BaseLink
                :to="`/accounts/${item.bound_by}`"
                monospace
              >
                {{ item.bound_by }}
              </BaseLink>
              <TimeStamp
                :value="sorafsEpochToDate(item.expiry_epoch)"
                inverted
              />
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('sorafs.replicationTitle')">
      <template #default>
        <div class="sorafs-registry-page__filters">
          <label>
            {{ $t('sorafs.filters.status') }}
            <select v-model="replicationFilters.status">
              <option value="all">
                {{ $t('sorafs.filters.statusAll') }}
              </option>
              <option value="pending">{{ $t('sorafs.replicationStatus.pending') }}</option>
              <option value="completed">{{ $t('sorafs.replicationStatus.completed') }}</option>
              <option value="expired">{{ $t('sorafs.replicationStatus.expired') }}</option>
            </select>
          </label>
          <label>
            {{ $t('sorafs.filters.manifestDigest') }}
            <input
              v-model="replicationFilters.manifest"
              type="text"
              :placeholder="$t('sorafs.filters.manifestPlaceholder')"
            >
          </label>
        </div>

        <BaseTable
          v-model:page="replicationFilters.page"
          v-model:page-size="replicationFilters.per_page"
          :loading="areReplicationLoading"
          :items="replicationOrders"
          :total="replicationTotal"
          :payload-pagination="replicationPagination"
          :row-key="replicationOrderRowKey"
          container-class="sorafs-registry-page__table"
        >
          <template #header>
            <div class="sorafs-registry-page__row sorafs-registry-page__row--header">
              <span>{{ $t('sorafs.columns.orderId') }}</span>
              <span>{{ $t('sorafs.columns.manifest') }}</span>
              <span>{{ $t('sorafs.columns.status') }}</span>
              <span>{{ $t('sorafs.columns.deadline') }}</span>
              <span>{{ $t('sorafs.columns.providers') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="sorafs-registry-page__row">
              <BaseHash
                :hash="item.order_id_hex"
                type="short"
                copy
              />
              <BaseHash
                :hash="item.manifest_digest_hex"
                type="short"
                copy
              />
              <span :class="['sorafs-status-pill', `sorafs-status-pill--${item.status.state}`]">
                {{ $t(`sorafs.replicationStatus.${item.status.state}`) }}
              </span>
              <TimeStamp
                :value="sorafsEpochToDate(item.deadline_epoch)"
                inverted
              />
              <span class="row-text">{{ item.providers.length }}</span>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import * as http from '@/shared/api';
import type {
  ConnectSessionResponse,
  ConnectStatusResponse,
  MinistryAgendaProposalRecord,
  SorafsCidLookupModeration,
  SorafsCidLookupModerationMatch,
  PipelineTransactionStatusResponse,
  SorafsManifestState,
} from '@/shared/api/schemas';
import {
  buildSorafsPublicFileUrl,
  sorafsContentCidToHex,
  resolveSorafsPublicBaseUrl,
  sorafsEpochToDate,
  sorafsFilePathLabel,
  sorafsManifestBase64ToRootCid,
  sorafsSuccessorLabel,
} from '@/shared/lib/sorafs';
import {
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  createConnectAppSession,
  createConnectSessionPreview,
  finalizeSignedTransaction,
  rewriteConnectUriProtocol,
  type ConnectSessionPreview,
} from '@/shared/lib/connect';
import {
  BLACKLIST_REASON_OPTIONS,
  type SorafsBlacklistProposalLocalizedText,
  type SorafsBlacklistProposalIssueCode,
  buildSorafsBlacklistImpactCommand,
  buildSorafsBlacklistProposalFilename,
  buildSorafsBlacklistProposal,
  buildSorafsBlacklistValidateCommand,
  type BlacklistReasonTag,
  type SorafsDenylistProposalAction,
  validateSorafsBlacklistProposalDraft,
} from '@/shared/lib/sorafs-blacklist-proposal';
import { buildOffsetPagination } from '@/shared/lib/pagination';
import { getRuntimeConfig } from '@/shared/runtime-config';
import { useI18n } from 'vue-i18n';
import { useClipboard } from '@vueuse/core';
import { useNotifications } from '@/shared/ui/composables/notifications';
import QRCode from 'qrcode';

const { locale, t } = useI18n();
const clipboard = useClipboard();
const notifications = useNotifications();

const manifestStatusOptions: SorafsManifestState[] = ['pending', 'approved', 'retired'];
const blacklistReasonOptions = computed(() =>
  BLACKLIST_REASON_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`sorafs.proposal.reasons.${option.value}`),
  }))
);

const manifestRowKey = (item: { digest_hex: string }) => item.digest_hex;
const aliasRowKey = (item: { namespace: string, alias: string }) => `${item.namespace}:${item.alias}`;
const replicationOrderRowKey = (item: { order_id_hex: string }) => item.order_id_hex;

const manifestFilters = reactive({
  page: 1,
  per_page: 10,
  status: 'all' as 'all' | SorafsManifestState,
});

watch(
  () => manifestFilters.per_page,
  () => {
    manifestFilters.page = 1;
  }
);
watch(
  () => manifestFilters.status,
  () => {
    manifestFilters.page = 1;
  }
);

const manifestScope = useParamScope(
  () => {
    const limit = manifestFilters.per_page;
    const offset = (manifestFilters.page - 1) * limit;
    return {
      key: JSON.stringify({ limit, offset, status: manifestFilters.status }),
      payload: {
        limit,
        offset,
        status: manifestFilters.status === 'all' ? undefined : manifestFilters.status,
      },
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSorafsPinRegistry(payload))
);

const isManifestsLoading = computed(() => manifestScope.value?.expose.isLoading);
const manifestResponse = computed(() =>
  manifestScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? manifestScope.value.expose.data.data
    : null
);
const manifests = computed(() => manifestResponse.value?.manifests ?? []);
const manifestsTotal = computed(() => manifestResponse.value?.total_count ?? 0);
const manifestsPagination = computed(() => {
  if (!manifestResponse.value) return null;
  return buildOffsetPagination(manifestsTotal.value, manifestResponse.value.limit, manifestResponse.value.offset);
});
const pinAttestation = computed(() => manifestResponse.value?.attestation ?? null);

const selectedManifestId = ref<string | null>(null);
const manifestsList = computed(() => manifests.value);
watch(
  manifestsList,
  (items) => {
    if (!items.length) {
      selectedManifestId.value = null;
      return;
    }
    if (selectedManifestId.value && items.some((item) => item.digest_hex === selectedManifestId.value)) {
      return;
    }
    selectedManifestId.value = items[0]?.digest_hex ?? null;
  },
  { immediate: true }
);
const selectedManifest = computed(() =>
  manifestsList.value.find((manifest) => manifest.digest_hex === selectedManifestId.value) ?? null
);

const selectedManifestStorageScope = useParamScope(
  () => {
    const manifestId = selectedManifestId.value?.trim();
    if (!manifestId) return null;
    return {
      key: manifestId,
      payload: manifestId,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSorafsStorageManifest(payload))
);

const isSelectedManifestStorageLoading = computed(() => !!selectedManifestStorageScope.value?.expose.isLoading);
const selectedManifestStorageResult = computed(() => selectedManifestStorageScope.value?.expose.data ?? null);
const selectedManifestStorage = computed(() =>
  selectedManifestStorageResult.value?.status === SUCCESSFUL_FETCHING ? selectedManifestStorageResult.value.data : null
);
const selectedManifestStorageLoadFailed = computed(
  () =>
    !!selectedManifestId.value &&
    !isSelectedManifestStorageLoading.value &&
    !!selectedManifestStorageResult.value &&
    selectedManifestStorageResult.value.status !== SUCCESSFUL_FETCHING
);
const sorafsPublicBaseUrl = computed(() =>
  resolveSorafsPublicBaseUrl({
    configuredBaseUrl: getRuntimeConfig().sorafsPublicBaseUrl ?? null,
    toriiBaseUrl: http.getToriiBaseUrl(),
    windowOrigin: typeof window !== 'undefined' ? window.location.origin : null,
  })
);
const selectedManifestRootCid = computed(() =>
  selectedManifestStorage.value ? sorafsManifestBase64ToRootCid(selectedManifestStorage.value.manifest_b64) : null
);
const selectedManifestCidLookupScope = useParamScope(
  () => {
    const rootCid = selectedManifestRootCid.value?.trim();
    if (!rootCid) return null;
    return {
      key: rootCid,
      payload: rootCid,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSorafsCidLookup(payload))
);
const selectedManifestCidLookupResult = computed(() => selectedManifestCidLookupScope.value?.expose.data ?? null);
const selectedManifestCidLookup = computed(() =>
  selectedManifestCidLookupResult.value?.status === SUCCESSFUL_FETCHING ? selectedManifestCidLookupResult.value.data : null
);
const selectedManifestModeration = computed<SorafsCidLookupModeration | null>(
  () => selectedManifestCidLookup.value?.moderation ?? null
);
const selectedManifestPublicLinksBlocked = computed(
  () => !!selectedManifestModeration.value && !selectedManifestModeration.value.public_links_enabled
);
const selectedManifestRootUrl = computed(() => {
  if (!selectedManifestRootCid.value || !sorafsPublicBaseUrl.value) return null;
  return buildSorafsPublicFileUrl(selectedManifestRootCid.value, [], sorafsPublicBaseUrl.value);
});
const selectedManifestRootLink = computed(() =>
  selectedManifestPublicLinksBlocked.value ? null : selectedManifestRootUrl.value
);
const selectedManifestPublicLinksUnavailable = computed(
  () => !!selectedManifestStorage.value && (!selectedManifestRootCid.value || !sorafsPublicBaseUrl.value)
);
const selectedManifestFiles = computed(() => {
  if (!selectedManifestStorage.value) return [];

  return selectedManifestStorage.value.files.map((file) => {
    const pathLabel = sorafsFilePathLabel(file.path);
    return {
      key: `${selectedManifestId.value ?? 'manifest'}:${pathLabel}`,
      pathLabel,
      size: file.size,
      chunkCount: file.chunk_count,
      url:
        selectedManifestRootCid.value && sorafsPublicBaseUrl.value
          ? buildSorafsPublicFileUrl(selectedManifestRootCid.value, file.path, sorafsPublicBaseUrl.value)
          : null,
    };
  });
});
const selectedManifestRootCidHex = computed(() =>
  selectedManifestRootCid.value ? sorafsContentCidToHex(selectedManifestRootCid.value) : null
);
const selectedManifestAliasLabel = computed(() =>
  selectedManifest.value?.alias ? `${selectedManifest.value.alias.namespace}.${selectedManifest.value.alias.name}` : null
);

function selectManifest(manifest: { digest_hex: string }) {
  selectedManifestId.value = manifest.digest_hex;
}

function moderationMatchLabel(match: SorafsCidLookupModerationMatch): string {
  const scopeKey = match.scope === 'global' ? 'global' : 'local';
  const kindKey = match.match_kind === 'manifest_digest' ? 'manifestDigest' : 'cid';
  return t(`sorafs.moderation.matches.${scopeKey}.${kindKey}`);
}

function moderationStatusHeadline(moderation: SorafsCidLookupModeration | null): string {
  if (!moderation) return '';

  switch (moderation.status) {
    case 'clear':
      return t('sorafs.moderation.status.clear');
    case 'local_blocked':
      return t('sorafs.moderation.status.localBlocked');
    case 'global_blocked':
      return t('sorafs.moderation.status.globalBlocked');
    case 'mixed_blocked':
      return t('sorafs.moderation.status.mixedBlocked');
  }
}

const selectedManifestModerationHeadline = computed(() => moderationStatusHeadline(selectedManifestModeration.value));
const selectedManifestModerationSummary = computed(() => {
  const moderation = selectedManifestModeration.value;
  if (!moderation) return '';
  if (moderation.status === 'clear') {
    return t('sorafs.moderation.summary.clear');
  }
  return moderation.public_links_enabled
    ? t('sorafs.moderation.summary.linksEnabled')
    : t('sorafs.moderation.summary.linksBlocked');
});
const selectedManifestModerationRows = computed(() =>
  (selectedManifestModeration.value?.matches ?? []).map((match, index) => {
    const details = [
      t('sorafs.moderation.details.tier', { value: match.policy_tier }),
      match.reason ? t('sorafs.moderation.details.reason', { value: match.reason }) : null,
      match.pack_id ? t('sorafs.moderation.details.pack', { value: match.pack_id }) : null,
      match.issued_by_proposal_id
        ? t('sorafs.moderation.details.proposal', { value: match.issued_by_proposal_id })
        : null,
      match.review_reference ? t('sorafs.moderation.details.review', { value: match.review_reference }) : null,
      match.governance_reference
        ? t('sorafs.moderation.details.governance', { value: match.governance_reference })
        : null,
      match.expires_at ? t('sorafs.moderation.details.expires', { value: match.expires_at }) : null,
      match.review_due_at ? t('sorafs.moderation.details.reviewDue', { value: match.review_due_at }) : null,
    ]
      .filter((value): value is string => !!value)
      .join(' · ');

    return {
      key: `${match.match_kind}:${match.pack_id ?? 'direct'}:${index}`,
      headline: moderationMatchLabel(match),
      details,
    };
  })
);

const connectStatus = ref<ConnectStatusResponse | null>(null);
const isConnectStatusLoading = ref(true);
const connectStatusLoadFailed = ref(false);
const walletConnectPreview = ref<ConnectSessionPreview | null>(null);
const walletConnectSession = ref<ConnectSessionResponse | null>(null);
const walletConnectQr = ref<string | null>(null);
const isCreatingConnectSession = ref(false);
const approvedWalletAccountId = ref<string | null>(null);
const submittedAgendaRecord = ref<MinistryAgendaProposalRecord | null>(null);
const latestSubmissionStatus = ref<PipelineTransactionStatusResponse | null>(null);
const blacklistProposalSubmissionState = ref<
  'idle' | 'waiting_for_wallet' | 'approved' | 'signing' | 'submitted' | 'wallet_rejected' | 'session_closed' | 'submission_failed'
>('idle');
const blacklistProposalSubmissionError = ref<string | null>(null);
const walletConnectLaunchUri = computed(() => {
  const rawUri = walletConnectSession.value?.wallet_uri?.trim();
  if (!rawUri) return null;

  try {
    return rewriteConnectUriProtocol(rawUri);
  } catch {
    return rawUri;
  }
});

const connectStatusUnavailable = computed(
  () => !isConnectStatusLoading.value && !connectStatusLoadFailed.value && !connectStatus.value?.enabled
);
const canCreateConnectSession = computed(
  () => !!pinAttestation.value?.chain_id?.trim() && !!connectStatus.value?.enabled && !isCreatingConnectSession.value
);
const connectSessionTtlLabel = computed(() => {
  const ttlMs = connectStatus.value?.policy.session_ttl_ms;
  if (!ttlMs) return '—';

  if (ttlMs % 60_000 === 0) return t('sorafs.connect.ttlMinutes', { value: ttlMs / 60_000 });
  if (ttlMs % 1000 === 0) return t('sorafs.connect.ttlSeconds', { value: ttlMs / 1000 });
  return t('sorafs.connect.ttlMilliseconds', { value: ttlMs });
});

const blacklistProposalForm = reactive({
  reasonTag: 'spam' as BlacklistReasonTag,
  proposalId: `AC-${new Date().getUTCFullYear()}-001`,
  submitterName: '',
  submitterContact: '',
  submitterOrganization: '',
  submitterPgpFingerprint: '',
  duplicatesRaw: '',
  note: '',
});
const blacklistProposalAction = computed<SorafsDenylistProposalAction>(() =>
  selectedManifestModeration.value?.matches.length ? 'remove-from-denylist' : 'add-to-denylist'
);
const blacklistProposalSuggestedReferences = computed(() => {
  const references = new Set<string>();
  for (const match of selectedManifestModeration.value?.matches ?? []) {
    if (match.issued_by_proposal_id) references.add(match.issued_by_proposal_id);
    if (match.review_reference) references.add(match.review_reference);
  }
  return Array.from(references);
});
const blacklistProposalDescription = computed(() =>
  blacklistProposalAction.value === 'remove-from-denylist'
    ? t('sorafs.proposal.descriptionRemove')
    : t('sorafs.proposal.descriptionAdd')
);
const blacklistProposalReasonLabel = computed(() => {
  return blacklistReasonOptions.value.find((option) => option.value === blacklistProposalForm.reasonTag)?.label ??
    t('sorafs.proposal.reasons.spam');
});
const blacklistProposalNoteLabel = computed(() =>
  blacklistProposalAction.value === 'remove-from-denylist'
    ? t('sorafs.proposal.removalRationale')
    : t('sorafs.proposal.reviewerNote')
);
const blacklistProposalNotePlaceholder = computed(() =>
  blacklistProposalAction.value === 'remove-from-denylist'
    ? t('sorafs.proposal.removalRationalePlaceholder')
    : t('sorafs.proposal.reviewerNotePlaceholder')
);
const blacklistProposalLocalizedText = computed<SorafsBlacklistProposalLocalizedText | null>(() => {
  if (!selectedManifest.value || !selectedManifestRootCid.value) return null;

  return {
    addTitle: t('sorafs.proposal.payload.titleAdd', {
      rootCid: selectedManifestRootCid.value,
    }),
    removeTitle: t('sorafs.proposal.payload.titleRemove', {
      rootCid: selectedManifestRootCid.value,
    }),
    addMotivation: t('sorafs.proposal.payload.motivationAdd', {
      manifestDigest: selectedManifest.value.digest_hex,
      rootCid: selectedManifestRootCid.value,
      reason: blacklistProposalReasonLabel.value,
    }),
    removeMotivation: t('sorafs.proposal.payload.motivationRemove', {
      manifestDigest: selectedManifest.value.digest_hex,
      rootCid: selectedManifestRootCid.value,
    }),
    addExpectedImpact: t('sorafs.proposal.payload.expectedImpactAdd'),
    removeExpectedImpact: t('sorafs.proposal.payload.expectedImpactRemove'),
    addTargetReason: t('sorafs.proposal.payload.targetReasonAdd', {
      rootCid: selectedManifestRootCid.value,
      reason: blacklistProposalReasonLabel.value,
    }),
    removeTargetReason: t('sorafs.proposal.payload.targetReasonRemove', {
      rootCid: selectedManifestRootCid.value,
    }),
    addCidEvidenceDescription: t('sorafs.proposal.payload.cidEvidenceDescriptionAdd', {
      manifestDigest: selectedManifest.value.digest_hex,
    }),
    removeCidEvidenceDescription: t('sorafs.proposal.payload.cidEvidenceDescriptionRemove', {
      manifestDigest: selectedManifest.value.digest_hex,
    }),
    addUrlEvidenceDescription: t('sorafs.proposal.payload.urlEvidenceDescriptionAdd', {
      manifestDigest: selectedManifest.value.digest_hex,
    }),
    removeUrlEvidenceDescription: t('sorafs.proposal.payload.urlEvidenceDescriptionRemove', {
      manifestDigest: selectedManifest.value.digest_hex,
    }),
  };
});

watch(
  () => [selectedManifestId.value, blacklistProposalAction.value, blacklistProposalSuggestedReferences.value.join('|')],
  () => {
    if (blacklistProposalAction.value !== 'remove-from-denylist') return;
    if (blacklistProposalForm.duplicatesRaw.trim()) return;
    if (!blacklistProposalSuggestedReferences.value.length) return;
    blacklistProposalForm.duplicatesRaw = blacklistProposalSuggestedReferences.value.join(', ');
  },
  { immediate: true }
);

const selectedManifestExplorerEvidenceUrl = computed(() => {
  if (typeof window === 'undefined' || !selectedManifest.value) return null;

  const url = new URL(window.location.href);
  url.hash = `manifest-${selectedManifest.value.digest_hex}`;
  return url.toString();
});
const blacklistProposalDraft = computed(() => {
  if (
    !selectedManifest.value ||
    !selectedManifestRootCid.value ||
    !selectedManifestRootCidHex.value ||
    !blacklistProposalLocalizedText.value
  ) return null;

  return buildSorafsBlacklistProposal(
    {
      manifestDigestHex: selectedManifest.value.digest_hex,
      aliasName: selectedManifestAliasLabel.value,
      rootCid: selectedManifestRootCid.value,
      rootCidHex: selectedManifestRootCidHex.value,
      publicEvidenceUrl: selectedManifestRootUrl.value,
      explorerEvidenceUrl: selectedManifestExplorerEvidenceUrl.value,
      evidenceDigestBlake3Hex: selectedManifestStorage.value?.payload_digest_hex ?? null,
    },
    {
      ...blacklistProposalForm,
      action: blacklistProposalAction.value,
    },
    {
      locale: locale.value,
      localizedText: blacklistProposalLocalizedText.value,
    }
  );
});
const blacklistProposalDraftJson = computed(() =>
  blacklistProposalDraft.value ? JSON.stringify(blacklistProposalDraft.value, null, 2) : null
);
const blacklistProposalFilename = computed(() => {
  if (!blacklistProposalDraft.value || !selectedManifestRootCid.value) return null;

  return buildSorafsBlacklistProposalFilename(blacklistProposalDraft.value.proposal_id, selectedManifestRootCid.value);
});
const blacklistProposalValidateCommand = computed(() =>
  blacklistProposalFilename.value ? buildSorafsBlacklistValidateCommand(blacklistProposalFilename.value) : null
);
const blacklistProposalImpactCommand = computed(() => {
  if (!blacklistProposalDraft.value || !blacklistProposalFilename.value) return null;

  return buildSorafsBlacklistImpactCommand(blacklistProposalFilename.value, blacklistProposalDraft.value.proposal_id);
});
function formatBlacklistProposalIssue(issue: SorafsBlacklistProposalIssueCode): string {
  switch (issue) {
    case 'missing-root-cid':
      return t('sorafs.proposal.issues.missingRootCid');
    case 'missing-add-reason':
      return t('sorafs.proposal.issues.missingAddReason');
    case 'invalid-proposal-id':
      return t('sorafs.proposal.issues.invalidProposalId');
    case 'missing-submitter-name':
      return t('sorafs.proposal.issues.missingSubmitterName');
    case 'missing-submitter-contact':
      return t('sorafs.proposal.issues.missingSubmitterContact');
    case 'missing-removal-note':
      return t('sorafs.proposal.issues.missingRemovalNote');
    case 'invalid-pgp-fingerprint':
      return t('sorafs.proposal.issues.invalidPgpFingerprint');
    case 'invalid-evidence-digest':
      return t('sorafs.proposal.issues.invalidEvidenceDigest');
    case 'missing-evidence':
      return t('sorafs.proposal.issues.missingEvidence');
    case 'invalid-duplicate-reference':
      return t('sorafs.proposal.issues.invalidDuplicateReference');
  }
}

const blacklistProposalDraftIssueCodes = computed<SorafsBlacklistProposalIssueCode[]>(() => {
  if (!selectedManifest.value || !selectedManifestRootCid.value) {
    return ['missing-root-cid'];
  }

  return validateSorafsBlacklistProposalDraft(
    {
      manifestDigestHex: selectedManifest.value.digest_hex,
      aliasName: selectedManifestAliasLabel.value,
      rootCid: selectedManifestRootCid.value,
      rootCidHex: selectedManifestRootCidHex.value ?? '',
      publicEvidenceUrl: selectedManifestRootUrl.value,
      explorerEvidenceUrl: selectedManifestExplorerEvidenceUrl.value,
      evidenceDigestBlake3Hex: selectedManifestStorage.value?.payload_digest_hex ?? null,
    },
    {
      ...blacklistProposalForm,
      action: blacklistProposalAction.value,
    }
  );
});
const blacklistProposalDraftIssues = computed(() => {
  return blacklistProposalDraftIssueCodes.value.map((issue) => formatBlacklistProposalIssue(issue));
});
const blacklistProposalReady = computed(
  () => !!blacklistProposalDraftJson.value && blacklistProposalDraftIssueCodes.value.length === 0
);
const canSubmitBlacklistProposal = computed(
  () =>
    blacklistProposalReady.value &&
    !!connectStatus.value?.enabled &&
    blacklistProposalSubmissionState.value !== 'waiting_for_wallet' &&
    blacklistProposalSubmissionState.value !== 'signing'
);
const blacklistProposalSubmitLabel = computed(() => {
  if (blacklistProposalSubmissionState.value === 'waiting_for_wallet') {
    return t('sorafs.proposal.submitStates.waiting_for_wallet');
  }

  if (blacklistProposalSubmissionState.value === 'signing') {
    return t('sorafs.proposal.submitStates.signing');
  }

  if (blacklistProposalSubmissionState.value === 'submitted') {
    return t('sorafs.proposal.submitStates.submitted');
  }

  return t('sorafs.proposal.submitWallet');
});
const blacklistProposalSubmissionStateLabel = computed(() =>
  t(`sorafs.connect.sessionStates.${blacklistProposalSubmissionState.value}`)
);
const blacklistProposalSubmissionHelp = computed(() => {
  if (connectStatusUnavailable.value) return t('sorafs.proposal.walletSubmissionUnavailable');
  if (connectStatusLoadFailed.value) return t('sorafs.connect.loadFailed');
  if (blacklistProposalSubmissionState.value === 'submitted') return t('sorafs.proposal.walletSubmissionComplete');
  return t('sorafs.proposal.walletSubmissionHelp');
});

watch(
  () => [selectedManifestId.value, blacklistProposalDraftJson.value],
  () => {
    approvedWalletAccountId.value = null;
    submittedAgendaRecord.value = null;
    latestSubmissionStatus.value = null;
    blacklistProposalSubmissionState.value = 'idle';
    blacklistProposalSubmissionError.value = null;
  }
);

onMounted(() => {
  loadConnectStatus().catch(() => undefined);
});

watch(
  () => walletConnectLaunchUri.value,
  async (walletUri) => {
    if (!walletUri || typeof window === 'undefined') {
      walletConnectQr.value = null;
      return;
    }

    try {
      walletConnectQr.value = await QRCode.toDataURL(walletUri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 224,
      });
    } catch {
      walletConnectQr.value = null;
    }
  },
  { immediate: true }
);

async function loadConnectStatus() {
  isConnectStatusLoading.value = true;
  connectStatusLoadFailed.value = false;

  try {
    const result = await http.fetchConnectStatus();
    if (result.status === SUCCESSFUL_FETCHING) {
      connectStatus.value = result.data?.enabled ? result.data : null;
      return;
    }

    connectStatusLoadFailed.value = true;
  } catch {
    connectStatusLoadFailed.value = true;
  } finally {
    isConnectStatusLoading.value = false;
  }
}

function connectNodeHint(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).host || null;
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));

  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function statusKind(status: PipelineTransactionStatusResponse | null): string | null {
  return status?.status.kind ?? null;
}

function isTerminalStatus(status: PipelineTransactionStatusResponse | null): boolean {
  const kind = statusKind(status);
  return kind === 'Committed' || kind === 'Applied' || kind === 'Rejected' || kind === 'Expired';
}

function isFailedStatus(status: PipelineTransactionStatusResponse | null): boolean {
  const kind = statusKind(status);
  return kind === 'Rejected' || kind === 'Expired';
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function resultErrorMessage(result: { status: string, error?: Error }, fallbackKey: string): string {
  return result.status === UNKNOWN_ERROR && result.error ? result.error.message : t(fallbackKey);
}

async function copyWalletConnectValue(value?: string | null) {
  if (!value) return;

  try {
    await clipboard.copy(value);
    notifications.success(t('clipboard.success'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
}

async function createWalletConnectSession() {
  const chainId = pinAttestation.value?.chain_id?.trim();
  if (!chainId || !connectStatus.value?.enabled) return;

  isCreatingConnectSession.value = true;

  try {
    const preview = createConnectSessionPreview({
      chainId,
      node: http.getToriiBaseUrl(),
    });
    const result = await http.createConnectSession({
      sid: preview.sidBase64Url,
      node: connectNodeHint(http.getToriiBaseUrl()),
    });

    if (result.status !== SUCCESSFUL_FETCHING) {
      notifications.error(
        result.status === 'not-found'
          ? t('sorafs.connect.notifications.sessionEndpointUnavailable')
          : resultErrorMessage(result, 'sorafs.connect.notifications.sessionCreateFailed')
      );
      return false;
    }

    walletConnectPreview.value = preview;
    walletConnectSession.value = result.data;
    notifications.success(t('sorafs.connect.notifications.sessionReady'));
    return true;
  } catch (error) {
    notifications.error(
      error instanceof Error ? error.message : t('sorafs.connect.notifications.sessionCreateFailed')
    );
    return false;
  } finally {
    isCreatingConnectSession.value = false;
  }
}

async function ensureWalletConnectSession(): Promise<{
  preview: ConnectSessionPreview
  session: ConnectSessionResponse
} | null> {
  if (walletConnectPreview.value && walletConnectSession.value) {
    return {
      preview: walletConnectPreview.value,
      session: walletConnectSession.value,
    };
  }

  const created = await createWalletConnectSession();
  if (!created || !walletConnectPreview.value || !walletConnectSession.value) return null;

  return {
    preview: walletConnectPreview.value,
    session: walletConnectSession.value,
  };
}

async function waitForTerminalTransactionStatus(hashHex: string): Promise<PipelineTransactionStatusResponse> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await http.fetchPipelineTransactionStatus(hashHex);
    if (result.status !== SUCCESSFUL_FETCHING) {
      throw new Error(resultErrorMessage(result, 'sorafs.proposal.notifications.transactionStatusTimeout'));
    }

    latestSubmissionStatus.value = result.data;
    if (isTerminalStatus(result.data)) {
      return result.data as PipelineTransactionStatusResponse;
    }

    await delay(1000);
  }

  throw new Error(t('sorafs.proposal.notifications.transactionStatusTimeout'));
}

async function submitBlacklistProposal() {
  if (!blacklistProposalDraft.value || !blacklistProposalReady.value) {
    notifications.error(t('sorafs.proposal.notifications.draftRequiredForSubmit'));
    return;
  }

  if (!connectStatus.value?.enabled) {
    notifications.error(t('sorafs.proposal.notifications.walletSubmitUnavailable'));
    return;
  }

  const sessionContext = await ensureWalletConnectSession();
  if (!sessionContext) return;

  blacklistProposalSubmissionError.value = null;
  approvedWalletAccountId.value = null;
  submittedAgendaRecord.value = null;
  latestSubmissionStatus.value = null;
  blacklistProposalSubmissionState.value = 'waiting_for_wallet';

  const appSession = createConnectAppSession({
    baseUrl: http.getToriiBaseUrl(),
    preview: sessionContext.preview,
    session: sessionContext.session,
  });

  try {
    const approval = await appSession.waitForApproval();
    approvedWalletAccountId.value = approval.accountId;
    blacklistProposalSubmissionState.value = 'approved';

    const draftResult = await http.draftMinistryAgendaProposal({
      proposal: blacklistProposalDraft.value as unknown as Record<string, unknown>,
      authority: approval.accountId,
    });
    if (draftResult.status === 'conflict') {
      submittedAgendaRecord.value = draftResult.data.record;
      blacklistProposalSubmissionState.value = 'submitted';
      notifications.success(t('sorafs.proposal.notifications.alreadySubmitted'));
      return;
    }
    if (draftResult.status !== SUCCESSFUL_FETCHING) {
      throw new Error(resultErrorMessage(draftResult, 'sorafs.proposal.notifications.walletSubmitFailed'));
    }

    const unsignedTxBytes = decodeBase64(draftResult.data.signable_transaction_b64);
    blacklistProposalSubmissionState.value = 'signing';
    const detachedSignature = await appSession.signTransaction(unsignedTxBytes);
    const signedTransaction = finalizeSignedTransaction(unsignedTxBytes, detachedSignature);

    const submissionResult = await http.submitSignedTransaction(signedTransaction);
    if (submissionResult.status !== SUCCESSFUL_FETCHING) {
      throw new Error(resultErrorMessage(submissionResult, 'sorafs.proposal.notifications.walletSubmitFailed'));
    }

    const finalStatus = await waitForTerminalTransactionStatus(submissionResult.data.payload.tx_hash);
    if (isFailedStatus(finalStatus)) {
      throw new Error(
        t('sorafs.proposal.notifications.transactionRejected', {
          status: finalStatus.status.kind,
        })
      );
    }

    const recordResult = await http.getMinistryAgendaProposal(blacklistProposalDraft.value.proposal_id);
    if (recordResult.status !== SUCCESSFUL_FETCHING) {
      throw new Error(resultErrorMessage(recordResult, 'sorafs.proposal.notifications.submissionRecordMissing'));
    }
    if (!recordResult.data.record) {
      throw new Error(t('sorafs.proposal.notifications.submissionRecordMissing'));
    }

    submittedAgendaRecord.value = recordResult.data.record;
    blacklistProposalSubmissionState.value = 'submitted';
    notifications.success(t('sorafs.proposal.notifications.walletSubmitted'));
  } catch (error) {
    if (error instanceof ConnectApprovalRejectedError) {
      blacklistProposalSubmissionState.value = 'wallet_rejected';
      blacklistProposalSubmissionError.value = error.reason ?? t('sorafs.connect.notifications.walletRejected');
      notifications.error(blacklistProposalSubmissionError.value);
      return;
    }

    if (error instanceof ConnectSessionClosedError) {
      blacklistProposalSubmissionState.value = 'session_closed';
      blacklistProposalSubmissionError.value = error.reason ?? t('sorafs.connect.notifications.sessionClosed');
      notifications.error(blacklistProposalSubmissionError.value);
      return;
    }

    if (error instanceof ConnectSignRequestError) {
      blacklistProposalSubmissionState.value = 'submission_failed';
      blacklistProposalSubmissionError.value = error.message;
      notifications.error(blacklistProposalSubmissionError.value);
      return;
    }

    blacklistProposalSubmissionState.value = 'submission_failed';
    blacklistProposalSubmissionError.value =
      error instanceof Error ? error.message : t('sorafs.proposal.notifications.walletSubmitFailed');
    notifications.error(blacklistProposalSubmissionError.value);
  } finally {
    appSession.close();
  }
}

async function copyBlacklistProposalDraft() {
  if (!blacklistProposalReady.value || !blacklistProposalDraftJson.value) {
    notifications.error(t('sorafs.proposal.notifications.draftRequiredForCopy'));
    return;
  }

  try {
    await clipboard.copy(blacklistProposalDraftJson.value);
    notifications.success(t('sorafs.proposal.notifications.draftCopied'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBlacklistProposalDraft() {
  if (!blacklistProposalReady.value || !blacklistProposalDraftJson.value || !blacklistProposalFilename.value) {
    notifications.error(t('sorafs.proposal.notifications.draftRequiredForDownload'));
    return;
  }

  try {
    downloadTextFile(
      blacklistProposalFilename.value,
      blacklistProposalDraftJson.value,
      'application/json;charset=utf-8'
    );
    notifications.success(t('sorafs.proposal.notifications.draftDownloadStarted'));
  } catch {
    notifications.error(t('sorafs.proposal.notifications.draftDownloadFailed'));
  }
}

async function copyBlacklistValidateCommand() {
  if (!blacklistProposalReady.value || !blacklistProposalValidateCommand.value) {
    notifications.error(t('sorafs.proposal.notifications.validateRequired'));
    return;
  }

  try {
    await clipboard.copy(blacklistProposalValidateCommand.value);
    notifications.success(t('sorafs.proposal.notifications.validateCopied'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
}

async function copyBlacklistImpactCommand() {
  if (!blacklistProposalReady.value || !blacklistProposalImpactCommand.value) {
    notifications.error(t('sorafs.proposal.notifications.impactRequired'));
    return;
  }

  try {
    await clipboard.copy(blacklistProposalImpactCommand.value);
    notifications.success(t('sorafs.proposal.notifications.impactCopied'));
  } catch {
    notifications.error(t('clipboard.error'));
  }
}

const aliasFilters = reactive({
  page: 1,
  per_page: 10,
  namespace: '',
  manifest: '',
});

watch(
  () => aliasFilters.per_page,
  () => {
    aliasFilters.page = 1;
  }
);
watch(
  () => [aliasFilters.namespace, aliasFilters.manifest],
  () => {
    aliasFilters.page = 1;
  }
);

const aliasScope = useParamScope(
  () => {
    const limit = aliasFilters.per_page;
    const offset = (aliasFilters.page - 1) * limit;
    return {
      key: JSON.stringify({ limit, offset, namespace: aliasFilters.namespace, digest: aliasFilters.manifest }),
      payload: {
        limit,
        offset,
        namespace: aliasFilters.namespace.trim() || undefined,
        manifest_digest: aliasFilters.manifest.trim() || undefined,
      },
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSorafsAliases(payload))
);

const areAliasesLoading = computed(() => aliasScope.value?.expose.isLoading);
const aliasResponse = computed(() =>
  aliasScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? aliasScope.value.expose.data.data : null
);
const aliasItems = computed(() => aliasResponse.value?.aliases ?? []);
const aliasTotal = computed(() => aliasResponse.value?.total_count ?? 0);
const aliasPagination = computed(() => {
  if (!aliasResponse.value) return null;
  return buildOffsetPagination(aliasTotal.value, aliasResponse.value.limit, aliasResponse.value.offset);
});

const replicationFilters = reactive({
  page: 1,
  per_page: 10,
  status: 'all' as 'all' | 'pending' | 'completed' | 'expired',
  manifest: '',
});

watch(
  () => replicationFilters.per_page,
  () => {
    replicationFilters.page = 1;
  }
);

watch(
  () => [replicationFilters.status, replicationFilters.manifest],
  () => {
    replicationFilters.page = 1;
  }
);

const replicationScope = useParamScope(
  () => {
    const limit = replicationFilters.per_page;
    const offset = (replicationFilters.page - 1) * limit;
    return {
      key: JSON.stringify({
        limit,
        offset,
        status: replicationFilters.status,
        manifest: replicationFilters.manifest,
      }),
      payload: {
        limit,
        offset,
        status: replicationFilters.status === 'all' ? undefined : replicationFilters.status,
        manifest_digest: replicationFilters.manifest.trim() || undefined,
      },
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchSorafsReplicationOrders(payload))
);

const areReplicationLoading = computed(() => replicationScope.value?.expose.isLoading);
const replicationResponse = computed(() =>
  replicationScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? replicationScope.value.expose.data.data : null
);
const replicationOrders = computed(() => replicationResponse.value?.replication_orders ?? []);
const replicationTotal = computed(() => replicationResponse.value?.total_count ?? 0);
const replicationPagination = computed(() => {
  if (!replicationResponse.value) return null;
  return buildOffsetPagination(replicationTotal.value, replicationResponse.value.limit, replicationResponse.value.offset);
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.sorafs-registry-page {
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__attestation {
    display: grid;
    gap: size(2);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    margin-bottom: size(2);

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      font-size: size(1.5);

      input,
      select {
        padding: size(1);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }
  }

  &__table {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  .base-table > .content-row,
  &__table .content-row {
    padding-inline: size(3);

    @include lg {
      padding-inline: size(4);
    }
  }

  &__row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: size(1);
    align-items: center;

    &--header {
      font-weight: 600;
      color: theme-color('content-secondary');
    }

    &--selected {
      background: rgba(theme-color('primary'), 0.08);
      border-radius: size(1);
    }

    @include md {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  &__detail {
    margin-top: size(3);
    padding: size(3);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);

    h3 {
      margin: 0 0 size(2) 0;
    }
  }

  &__detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: size(2);
  }

  &__detail-panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: size(2);
    margin-top: size(3);

    h4 {
      margin-bottom: size(1);
    }
  }

  &__lineage,
  &__gov-list,
  &__files,
  &__moderation-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: size(1);

    li {
      font-size: size(1.5);
      color: theme-color('content-secondary');
    }
  }

  &__file-row {
    display: flex;
    flex-wrap: wrap;
    gap: size(1.5);
    align-items: center;
  }

  &__file-status {
    color: theme-color('warning');
  }

  &__panel-card {
    display: flex;
    flex-direction: column;
    gap: size(2);
  }

  &__panel-header {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    justify-content: space-between;
    align-items: flex-start;

    h4 {
      margin: 0 0 size(1) 0;
    }
  }

  &__meta-list,
  &__draft-issues {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: size(1);

    li {
      font-size: size(1.5);
      color: theme-color('content-secondary');
    }
  }

  &__draft-issues li {
    color: theme-color('warning');
  }

  &__moderation-card {
    display: flex;
    flex-direction: column;
    gap: size(1);
    margin-bottom: size(2);
    padding: size(2);
    border: 1px solid color-mix(in srgb, theme-color('warning') 40%, theme-color('border-primary'));
    border-radius: size(1.5);
    background: color-mix(in srgb, theme-color('warning') 8%, transparent);
  }

  &__moderation-row {
    display: flex;
    flex-direction: column;
    gap: size(0.5);
  }

  &__wallet-session {
    display: grid;
    gap: size(2);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    align-items: start;
  }

  &__wallet-qr {
    width: min(224px, 100%);
    border-radius: size(2);
    background: white;
    padding: size(1);
  }

  &__wallet-session-copy {
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__wallet-link {
    color: theme-color('primary');
    text-decoration: none;
    word-break: break-word;
  }

  &__connect-actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
  }

  &__proposal-form {
    display: grid;
    gap: size(2);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      font-size: size(1.5);

      input,
      select {
        padding: size(1);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }
  }

  &__textarea-field {
    display: flex;
    flex-direction: column;
    gap: size(1);
    font-size: size(1.5);

    textarea {
      min-height: size(12);
      padding: size(1.5);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      background: transparent;
      color: theme-color('content-primary');
      resize: vertical;
    }
  }
}

.sorafs-status-pill {
  display: inline-flex;
  padding: size(0.5) size(1.5);
  border-radius: size(3);
  font-size: size(1.5);
  text-transform: capitalize;
  background: theme-color('surface-variant');

  &--approved,
  &--completed {
    background: color-mix(in srgb, theme-color('success') 20%, transparent);
    color: theme-color('success');
  }

  &--pending {
    background: color-mix(in srgb, theme-color('warning') 20%, transparent);
    color: theme-color('warning');
  }

  &--retired,
  &--expired {
    background: color-mix(in srgb, theme-color('error') 20%, transparent);
    color: theme-color('error');
  }
}
</style>
