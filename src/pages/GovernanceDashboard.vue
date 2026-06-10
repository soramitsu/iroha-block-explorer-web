<template>
  <div class="governance-page">
    <BaseContentBlock :title="$t('governance.council.title')">
      <template #header-action>
        <span
          class="governance-page__stream-indicator"
          :data-status="governanceStreamStatus"
        >
          {{ $t(governanceStreamStatusKey) }}
        </span>
      </template>
      <template #default>
        <BaseLoading v-if="isCouncilLoading" />
        <div
          v-else-if="council"
          class="governance-page__panel"
        >
          <div class="governance-page__panel-header">
            <span class="label">{{ $t('governance.council.epoch') }}</span>
            <span class="value">{{ council.epoch }}</span>
          </div>
          <div class="governance-page__panel-grid">
            <BaseHash
              v-for="member in council.members"
              :key="member.account_id.toString()"
              :hash="member.account_id.toString()"
              :link="`/accounts/${member.account_id.toString()}`"
              type="short"
              copy
            />
          </div>
        </div>
        <span
          v-else
          class="row-text governance-page__message"
        >
          {{ $t('governance.council.empty') }}
        </span>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('governance.unlocks.title')">
      <template #default>
        <BaseLoading v-if="isUnlocksLoading" />
        <div
          v-else-if="unlockStats"
          class="governance-page__stats"
        >
          <div class="stat">
            <span class="label">{{ $t('governance.unlocks.currentHeight') }}</span>
            <span class="value">{{ unlockStats.height_current }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ $t('governance.unlocks.expiredLocks') }}</span>
            <span class="value">{{ unlockStats.expired_locks_now }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ $t('governance.unlocks.referendaWithExpired') }}</span>
            <span class="value">{{ unlockStats.referenda_with_expired }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ $t('governance.unlocks.lastSweepHeight') }}</span>
            <span class="value">{{ unlockStats.last_sweep_height }}</span>
          </div>
        </div>
        <span
          v-else
          class="row-text governance-page__message"
        >
          {{ $t('governance.unlocks.empty') }}
        </span>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('governance.lookup.title')">
      <template #default>
        <form
          class="governance-page__form"
          @submit.prevent="lookupReferendum"
        >
          <label>
            <span>{{ $t('governance.lookup.referendumId') }}</span>
            <input
              v-model="referendumInput"
              type="text"
              :placeholder="$t('governance.lookup.referendumPlaceholder')"
            >
          </label>
          <BaseButton type="submit">
            {{ $t('governance.lookup.inspect') }}
          </BaseButton>
        </form>

        <div v-if="referendumPending && !referendumData">
          <BaseLoading />
        </div>
        <div
          v-else-if="referendumData"
          class="governance-page__referendum"
        >
          <div class="governance-page__panel">
            <div class="governance-page__panel-header">
              <span class="label">{{ $t('governance.lookup.status') }}</span>
              <span class="value">{{ referendumData.referendum?.status ?? $t('governance.lookup.notFound') }}</span>
            </div>
            <div
              v-if="referendumData.referendum"
              class="governance-page__panel-grid"
            >
              <div>
                <span class="label">{{ $t('governance.lookup.windowStart') }}</span>
                <span class="value">{{ referendumData.referendum.h_start }}</span>
              </div>
              <div>
                <span class="label">{{ $t('governance.lookup.windowEnd') }}</span>
                <span class="value">{{ referendumData.referendum.h_end }}</span>
              </div>
              <div>
                <span class="label">{{ $t('governance.lookup.mode') }}</span>
                <span class="value">{{ referendumData.referendum.mode }}</span>
              </div>
            </div>
          </div>

          <div class="governance-page__panel">
            <div class="governance-page__panel-header">
              <span class="label">{{ $t('governance.lookup.tallyTitle') }}</span>
            </div>
            <div
              v-if="tallyData"
              class="governance-page__panel-grid governance-page__panel-grid--columns-3"
            >
              <div>
                <span class="label">{{ $t('governance.lookup.approve') }}</span>
                <span class="value">{{ tallyData.approve.toString() }}</span>
              </div>
              <div>
                <span class="label">{{ $t('governance.lookup.reject') }}</span>
                <span class="value">{{ tallyData.reject.toString() }}</span>
              </div>
              <div>
                <span class="label">{{ $t('governance.lookup.abstain') }}</span>
                <span class="value">{{ tallyData.abstain.toString() }}</span>
              </div>
            </div>
            <span
              v-else
              class="row-text"
            >
              {{ $t('governance.lookup.tallyMissing') }}
            </span>
          </div>

          <div class="governance-page__panel">
            <div class="governance-page__panel-header">
              <span class="label">{{ $t('governance.lookup.locksTitle') }}</span>
              <span class="value">{{ locksRows.length }}</span>
            </div>
            <BaseTable
              :items="locksRows"
              :row-key="lockRowKey"
              :disable-pagination="true"
              container-class="governance-page__locks-table"
              :loading="locksPending"
            >
              <template #header>
                <div class="governance-page__locks-row governance-page__locks-row--header">
                  <span>{{ $t('governance.lookup.lockOwner') }}</span>
                  <span>{{ $t('governance.lookup.lockAmount') }}</span>
                  <span>{{ $t('governance.lookup.lockDirection') }}</span>
                  <span>{{ $t('governance.lookup.lockExpiry') }}</span>
                  <span>{{ $t('governance.lookup.lockDuration') }}</span>
                </div>
              </template>
              <template #row="{ item }">
                <div class="governance-page__locks-row">
                  <BaseLink
                    :to="`/accounts/${item.accountId}`"
                    monospace
                  >
                    {{ item.accountId }}
                  </BaseLink>
                  <span class="row-text-monospace">{{ item.amount.toString() }}</span>
                  <span class="row-text">{{ resolveDirectionLabel(item.direction) }}</span>
                  <span class="row-text">{{ item.expiry_height }}</span>
                  <span class="row-text">{{ item.duration_blocks }}</span>
                </div>
              </template>
            </BaseTable>
          </div>
        </div>
        <span
          v-else
          class="row-text governance-page__message"
        >
          {{ $t('governance.lookup.prompt') }}
        </span>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('governance.proposals.title')">
      <template #default>
        <form
          class="governance-page__form"
          @submit.prevent="lookupProposal"
        >
          <label>
            <span>{{ $t('governance.proposals.proposalId') }}</span>
            <input
              v-model="proposalInput"
              type="text"
              :placeholder="$t('governance.proposals.proposalPlaceholder')"
            >
          </label>
          <BaseButton type="submit">
            {{ $t('governance.lookup.inspect') }}
          </BaseButton>
        </form>
        <div v-if="proposalPending && !proposalResponse">
          <BaseLoading />
        </div>
        <div
          v-else-if="proposalData"
          class="governance-page__panel"
        >
          <div class="governance-page__panel-grid">
            <div>
              <span class="label">{{ $t('governance.proposals.status') }}</span>
              <span class="value">{{ proposalData.status }}</span>
            </div>
            <div>
              <span class="label">{{ $t('governance.proposals.proposer') }}</span>
              <BaseLink
                :to="`/accounts/${proposalData.proposer.toString()}`"
                monospace
              >
                {{ proposalData.proposer.toString() }}
              </BaseLink>
            </div>
            <div>
              <span class="label">{{ $t('governance.proposals.createdHeight') }}</span>
              <span class="value">{{ proposalData.created_height }}</span>
            </div>
            <div v-if="proposalPayload">
              <span class="label">{{ $t('governance.proposals.contractAddress') }}</span>
              <span class="value">{{ proposalPayload.contract_address ?? `${proposalPayload.namespace}.${proposalPayload.contract_id}` }}</span>
            </div>
            <div
              v-if="proposalPayload?.contract_alias"
            >
              <span class="label">{{ $t('governance.proposals.contractAlias') }}</span>
              <span class="value">{{ proposalPayload.contract_alias }}</span>
            </div>
            <div
              v-if="proposalPayload?.dataspace"
            >
              <span class="label">{{ $t('governance.proposals.contractDataspace') }}</span>
              <span class="value">{{ proposalPayload.dataspace }}</span>
            </div>
            <div v-if="proposalPayload">
              <span class="label">{{ $t('governance.proposals.codeHash') }}</span>
              <span class="value">{{ proposalPayload.code_hash_hex }}</span>
            </div>
            <div v-if="proposalPayload">
              <span class="label">{{ $t('governance.proposals.abiHash') }}</span>
              <span class="value">{{ proposalPayload.abi_hash_hex }}</span>
            </div>
            <div v-if="proposalPayload">
              <span class="label">{{ $t('governance.proposals.abiVersion') }}</span>
              <span class="value">{{ proposalPayload.abi_version }}</span>
            </div>
          </div>
        </div>
        <span
          v-else
          class="row-text governance-page__message"
        >
          {{ $t('governance.proposals.prompt') }}
        </span>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useParamScope } from '@vue-kakuyaku/core';
import { useIntervalFn } from '@vueuse/core';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import * as http from '@/shared/api';
import { useGovernanceMetrics } from '@/shared/ui/composables/useGovernanceMetrics';
import { useGovernanceEvents } from '@/shared/ui/composables/useGovernanceEvents';

const { t } = useI18n();

const {
  council,
  unlockStats,
  isCouncilLoading,
  isUnlocksLoading,
} = useGovernanceMetrics();
const { data: governanceEvent, status: governanceStreamStatus } = useGovernanceEvents();

const governanceStreamStatusKey = computed(() => {
  switch (governanceStreamStatus.value) {
    case 'OPEN':
      return 'telemetry.statusConnected';
    case 'CONNECTING':
      return 'telemetry.statusConnecting';
    default:
      return 'telemetry.statusDisconnected';
  }
});

const referendumInput = ref('');
const referendumQuery = reactive({
  id: '',
  nonce: 0,
});

function lookupReferendum() {
  const trimmed = referendumInput.value.trim();
  if (!trimmed) return;
  referendumQuery.id = trimmed;
  referendumQuery.nonce += 1;
}

const proposalInput = ref('');
const proposalQuery = reactive({
  id: '',
  nonce: 0,
});

function lookupProposal() {
  const trimmed = proposalInput.value.trim();
  if (!trimmed) return;
  proposalQuery.id = trimmed;
  proposalQuery.nonce += 1;
}

const referendumScope = useParamScope(
  () => {
    if (!referendumQuery.id) return null;
    return {
      key: `gov-ref-${referendumQuery.id}-${referendumQuery.nonce}`,
      payload: referendumQuery.id,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchGovernanceReferendum(payload))
);

const locksScope = useParamScope(
  () => {
    if (!referendumQuery.id) return null;
    return {
      key: `gov-locks-${referendumQuery.id}-${referendumQuery.nonce}`,
      payload: referendumQuery.id,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchGovernanceLocks(payload))
);

const tallyScope = useParamScope(
  () => {
    if (!referendumQuery.id) return null;
    return {
      key: `gov-tally-${referendumQuery.id}-${referendumQuery.nonce}`,
      payload: referendumQuery.id,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchGovernanceTally(payload))
);

const proposalScope = useParamScope(
  () => {
    if (!proposalQuery.id) return null;
    return {
      key: `gov-proposal-${proposalQuery.id}-${proposalQuery.nonce}`,
      payload: proposalQuery.id,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchGovernanceProposal(payload))
);

function parseGovernanceEvent(message: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(message);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch (error) {
    console.warn('[GovernanceDashboard] Failed to parse governance event payload', error);
    return null;
  }
}

function eventIdMatches(activeId: string | null, ...values: unknown[]): boolean {
  if (!activeId) return false;
  return values.some((value) => value !== null && value !== undefined && value.toString() === activeId);
}

watch(
  () => governanceEvent.value,
  (message) => {
    if (typeof message !== 'string') return;
    const payload = parseGovernanceEvent(message);
    if (!payload) return;

    switch (payload.kind) {
      case 'ReferendumUpdated':
        if (eventIdMatches(referendumQuery.id, payload.id, payload.referendum_id)) {
          referendumScope.value?.expose.refetch?.();
        }
        break;
      case 'LocksUpdated':
        if (eventIdMatches(referendumQuery.id, payload.id, payload.referendum_id)) {
          locksScope.value?.expose.refetch?.();
        }
        break;
      case 'TallyUpdated':
        if (eventIdMatches(referendumQuery.id, payload.id, payload.referendum_id)) {
          tallyScope.value?.expose.refetch?.();
        }
        break;
      case 'ProposalUpdated':
        if (eventIdMatches(proposalQuery.id, payload.id)) {
          proposalScope.value?.expose.refetch?.();
        }
        break;
      default:
        break;
    }
  }
);

const referendumPending = computed(() => Boolean(referendumScope.value?.expose.isLoading));
const referendumData = computed(() =>
  referendumScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? referendumScope.value.expose.data.data : null
);

const locksPending = computed(() => Boolean(locksScope.value?.expose.isLoading));
const locksData = computed(() =>
  locksScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? locksScope.value.expose.data.data : null
);

const tallyData = computed(() =>
  tallyScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? tallyScope.value.expose.data.data : null
);

const locksRows = computed(() => {
  if (!locksData.value?.locks) return [];
  return Object.entries(locksData.value.locks).map(([accountId, record]) => ({
    accountId,
    amount: record.amount,
    expiry_height: record.expiry_height,
    direction: record.direction,
    duration_blocks: record.duration_blocks ?? 0,
  }));
});

const lockRowKey = (item: { accountId: string }) => item.accountId;

const proposalPending = computed(() => Boolean(proposalScope.value?.expose.isLoading));
const proposalResponse = computed(() =>
  proposalScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? proposalScope.value.expose.data.data : null
);
const proposalData = computed(() => (proposalResponse.value?.found ? proposalResponse.value.proposal : null));
const proposalPayload = computed(() => {
  if (!proposalData.value) return null;
  if (proposalData.value.kind.kind === 'DeployContract') return proposalData.value.kind.payload;
  return null;
});

const directionLabels = computed<Record<number, string>>(() => ({
  0: t('governance.lookup.approve'),
  1: t('governance.lookup.reject'),
  2: t('governance.lookup.abstain'),
}));

function resolveDirectionLabel(direction: unknown) {
  const key = typeof direction === 'number' ? direction : Number(direction);
  if (Number.isNaN(key)) return t('governance.lookup.unknownDirection');
  return directionLabels.value[key] ?? t('governance.lookup.unknownDirection');
}

const refreshActive = () => {
  referendumScope.value?.expose.refetch?.();
  locksScope.value?.expose.refetch?.();
  tallyScope.value?.expose.refetch?.();
  proposalScope.value?.expose.refetch?.();
};

const { pause: pauseAutoRefresh, resume: resumeAutoRefresh } = useIntervalFn(refreshActive, 30_000, {
  immediate: false,
});

watch(
  () => [referendumQuery.id, proposalQuery.id],
  ([refId, propId]) => {
    const hasActive = Boolean(refId || propId);
    if (hasActive) {
      refreshActive();
      resumeAutoRefresh();
    } else {
      pauseAutoRefresh();
    }
  },
  { immediate: true }
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.governance-page {
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__stream-indicator {
    @include tpg-s4;
    color: theme-color('content-secondary');

    &[data-status='OPEN'] {
      color: theme-color('success');
    }

    &[data-status='CLOSED'] {
      color: theme-color('error');
    }
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: size(2);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }
  }

  &__panel-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;

    .label {
      text-transform: uppercase;
      font-size: size(1.5);
      color: theme-color('content-tertiary');
    }

    .value {
      font-size: size(3);
      font-weight: 600;
    }
  }

  &__panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(2);

    &--columns-3 {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    .label {
      display: block;
      font-size: size(1.5);
      color: theme-color('content-tertiary');
    }

    .value {
      font-weight: 600;
      font-size: size(2.5);
    }
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: size(2);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }

    .stat {
      border: 1px solid theme-color('border-primary');
      border-radius: size(1.5);
      padding: size(2);

      .label {
        font-size: size(1.5);
        color: theme-color('content-tertiary');
      }

      .value {
        display: block;
        margin-top: size(1);
        font-size: size(3);
        font-weight: 600;
      }
    }
  }

  &__form {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    align-items: flex-end;
    padding: 0 size(2);
    margin-bottom: size(3);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);
      flex: 1;

      input {
        padding: size(1.5);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }
  }

  &__locks-table {
    .content-row {
      padding: size(1.5) size(2);

      @include sm {
        padding: size(1.5) size(3);
      }

      @include md {
        padding: size(1.5) size(2);
      }
    }
  }

  &__locks-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: size(1);
    align-items: center;

    &--header {
      font-weight: 600;
      color: theme-color('content-secondary');
    }
  }

  &__message {
    display: block;
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

    @include md {
      padding: 0 size(2);
    }
  }
}
</style>
