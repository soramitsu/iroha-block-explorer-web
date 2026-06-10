<template>
  <div class="zk-telemetry-page">
    <BaseContentBlock :title="$t('zkTelemetry.stream.title')">
      <template #default>
        <div class="zk-telemetry-page__filters">
          <label>
            {{ $t('zkTelemetry.stream.backend') }}
            <input
              v-model="proofStreamFilters.backend"
              type="text"
              :placeholder="$t('zkTelemetry.stream.backendPlaceholder')"
            >
          </label>
          <span class="zk-telemetry-page__stream-status">
            {{ streamStatusLabel }}
          </span>
        </div>

        <div class="zk-telemetry-page__stats">
          <div class="stat">
            <span class="label">{{ $t('zkTelemetry.stream.verifiedTotal') }}</span>
            <span class="value">{{ proofTotals.verified }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ $t('zkTelemetry.stream.rejectedTotal') }}</span>
            <span class="value">{{ proofTotals.rejected }}</span>
          </div>
        </div>

        <div class="zk-telemetry-page__sparkline">
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
          >
            <polyline
              :points="sparklinePoints"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span class="caption">
            {{ $t('zkTelemetry.stream.throughputLabel', [proofThroughputPerMinute]) }}
          </span>
        </div>

        <BaseTable
          :loading="false"
          :items="proofEvents"
          :row-key="proofRowKey"
          :disable-pagination="true"
          container-class="zk-telemetry-page__table"
        >
          <template #header>
            <div class="zk-telemetry-page__row zk-telemetry-page__row--header">
              <span>{{ $t('zkTelemetry.stream.columns.event') }}</span>
              <span>{{ $t('zkTelemetry.stream.columns.backend') }}</span>
              <span>{{ $t('zkTelemetry.stream.columns.proofHash') }}</span>
              <span>{{ $t('zkTelemetry.stream.columns.callHash') }}</span>
              <span>{{ $t('zkTelemetry.stream.columns.envelopeHash') }}</span>
              <span>{{ $t('zkTelemetry.stream.columns.observedAt') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="zk-telemetry-page__row">
              <span :class="['zk-telemetry-page__status', `zk-telemetry-page__status--${item.event === 'ProofVerified' ? 'ok' : 'failed'}`]">
                {{ formatStreamEvent(item.event) }}
              </span>
              <span class="row-text">{{ item.backend }}</span>
              <BaseHash
                v-if="item.proof_hash"
                :hash="item.proof_hash"
                :type="hashType"
                copy
              />
              <span v-else>—</span>
              <BaseHash
                v-if="item.call_hash"
                :hash="item.call_hash"
                :type="hashType"
                copy
              />
              <span v-else>—</span>
              <BaseHash
                v-if="item.envelope_hash"
                :hash="item.envelope_hash"
                :type="hashType"
                copy
              />
              <span v-else>—</span>
              <TimeStamp
                :value="item.observed_at"
                inverted
              />
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('zkTelemetry.attachments.title')">
      <template #default>
        <div class="zk-telemetry-page__filters">
          <label>
            {{ $t('zkTelemetry.attachments.contentType') }}
            <input
              v-model="attachmentFilters.content_type"
              type="text"
              :placeholder="$t('zkTelemetry.attachments.contentTypePlaceholder')"
            >
          </label>
          <label>
            {{ $t('zkTelemetry.attachments.hasTag') }}
            <input
              v-model="attachmentFilters.has_tag"
              type="text"
              :placeholder="$t('zkTelemetry.attachments.tagPlaceholder')"
            >
          </label>
          <label>
            {{ $t('zkTelemetry.attachments.order') }}
            <select v-model="attachmentFilters.order">
              <option value="desc">{{ $t('zkTelemetry.attachments.orderNewest') }}</option>
              <option value="asc">{{ $t('zkTelemetry.attachments.orderOldest') }}</option>
            </select>
          </label>
        </div>

        <BaseTable
          v-model:page="attachmentFilters.page"
          v-model:page-size="attachmentFilters.per_page"
          :items="attachments"
          :loading="attachmentsLoading"
          :total="attachmentsTotal"
          :payload-pagination="attachmentsPagination"
          :row-key="attachmentRowKey"
          container-class="zk-telemetry-page__table"
        >
          <template #header>
            <div class="zk-telemetry-page__row zk-telemetry-page__row--header">
              <span>{{ $t('zkTelemetry.attachments.columns.id') }}</span>
              <span>{{ $t('zkTelemetry.attachments.columns.contentType') }}</span>
              <span>{{ $t('zkTelemetry.attachments.columns.size') }}</span>
              <span>{{ $t('zkTelemetry.attachments.columns.created') }}</span>
              <span>{{ $t('zkTelemetry.attachments.columns.tenant') }}</span>
              <span>{{ $t('zkTelemetry.attachments.columns.actions') }}</span>
            </div>
          </template>

          <template #row="{ item }">
            <div class="zk-telemetry-page__row">
              <BaseHash
                :hash="item.id"
                :type="hashType"
                copy
              />
              <span class="row-text">{{ item.content_type }}</span>
              <span class="row-text">{{ formatBytes(item.size) }}</span>
              <TimeStamp
                :value="msToDate(item.created_ms)"
                inverted
              />
              <span class="row-text">{{ item.tenant ?? '—' }}</span>
              <a
                class="zk-telemetry-page__link"
                :href="attachmentDownloadUrl(item.id)"
                target="_blank"
                rel="noreferrer"
              >
                {{ $t('zkTelemetry.attachments.download') }}
              </a>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('zkTelemetry.reports.title')">
      <template #default>
        <div class="zk-telemetry-page__filters">
          <label>
            {{ $t('zkTelemetry.reports.status') }}
            <select v-model="reportFilters.status">
              <option value="all">{{ $t('zkTelemetry.reports.statusAll') }}</option>
              <option value="ok">{{ $t('zkTelemetry.reports.statusOk') }}</option>
              <option value="failed">{{ $t('zkTelemetry.reports.statusFailed') }}</option>
            </select>
          </label>
          <label>
            {{ $t('zkTelemetry.reports.contentType') }}
            <input
              v-model="reportFilters.content_type"
              type="text"
              :placeholder="$t('zkTelemetry.reports.contentTypePlaceholder')"
            >
          </label>
          <label>
            {{ $t('zkTelemetry.reports.hasTag') }}
            <input
              v-model="reportFilters.has_tag"
              type="text"
              :placeholder="$t('zkTelemetry.reports.tagPlaceholder')"
            >
          </label>
        </div>

        <BaseTable
          v-model:page="reportFilters.page"
          v-model:page-size="reportFilters.per_page"
          :items="reports"
          :loading="reportsLoading"
          :total="reportsTotal"
          :payload-pagination="reportsPagination"
          :row-key="reportRowKey"
          container-class="zk-telemetry-page__table"
        >
          <template #header>
            <div class="zk-telemetry-page__row zk-telemetry-page__row--header">
              <span>{{ $t('zkTelemetry.reports.columns.id') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.status') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.processed') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.latency') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.contentType') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.tags') }}</span>
              <span>{{ $t('zkTelemetry.reports.columns.error') }}</span>
            </div>
          </template>
          <template #row="{ item }">
            <div class="zk-telemetry-page__row">
              <BaseHash
                :hash="item.id"
                :type="hashType"
                copy
              />
              <span :class="['zk-telemetry-page__status', `zk-telemetry-page__status--${item.ok ? 'ok' : 'failed'}`]">
                {{ item.ok ? $t('zkTelemetry.reports.statusOk') : $t('zkTelemetry.reports.statusFailed') }}
              </span>
              <TimeStamp
                :value="msToDate(item.processed_ms)"
                inverted
              />
              <span class="row-text">{{ formatLatency(item.latency_ms) }}</span>
              <span class="row-text">{{ item.content_type }}</span>
              <span class="row-text">{{ formatTags(item.zk1_tags) }}</span>
              <span class="row-text">{{ item.error ?? '—' }}</span>
            </div>
          </template>
        </BaseTable>
      </template>
    </BaseContentBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, watch } from 'vue';
import { useEventSource } from '@vueuse/core';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { buildOffsetPagination } from '@/shared/lib/pagination';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import * as http from '@/shared/api';
import { buildToriiUrl } from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { useI18n } from 'vue-i18n';

const hashType = useAdaptiveHash({ xs: 'short', xxs: 'short' }, 'medium');
const EVENTS_SSE_BASE = `${buildToriiUrl('/events/sse')}`;
const { t } = useI18n();

interface ProofStreamRow {
  id: string
  event: 'ProofVerified' | 'ProofRejected'
  backend: string
  proof_hash: string
  call_hash?: string | null
  envelope_hash?: string | null
  observed_at: Date
}

interface ProofScrollSnapshot {
  top: number
  scrollHeight: number
}

const proofStreamFilters = reactive({
  backend: '',
});

const proofStreamFilterParam = computed(() => {
  const backend = proofStreamFilters.backend.trim();
  if (!backend) return null;
  return JSON.stringify({
    op: 'eq',
    args: ['proof_backend', backend],
  });
});

function pruneTimeline() {
  const cutoff = Date.now() - TIMELINE_WINDOW_MS;
  while (proofTimeline.length && proofTimeline[0].timestamp < cutoff) {
    proofTimeline.shift();
  }
}

const proofStreamUrl = computed(() => {
  const filter = proofStreamFilterParam.value;
  if (!filter) return EVENTS_SSE_BASE;
  return `${EVENTS_SSE_BASE}?filter=${encodeURIComponent(filter)}`;
});

const { data: proofStreamData, status: proofStreamStatus } = useEventSource(proofStreamUrl, [], {
  autoReconnect: true,
});

const proofEvents = reactive<ProofStreamRow[]>([]);
const proofTotals = reactive({
  verified: 0,
  rejected: 0,
});
const proofTimeline: Array<{ timestamp: number, kind: 'verified' | 'rejected' }> = reactive([]);
const TIMELINE_WINDOW_MS = 60_000;
const TIMELINE_BUCKETS = 12;

const proofRowKey = (item: ProofStreamRow) => item.id;
const attachmentRowKey = (item: { id: string }) => item.id;
const reportRowKey = (item: { id: string }) => item.id;

function captureProofScrollSnapshot(): ProofScrollSnapshot | null {
  if (typeof window === 'undefined' || window.scrollY <= 80) return null;
  return {
    top: window.scrollY,
    scrollHeight: document.documentElement?.scrollHeight ?? 0,
  };
}

async function restoreProofScrollSnapshot(snapshot: ProofScrollSnapshot | null) {
  if (!snapshot) return;
  await nextTick();
  const afterScrollHeight = document.documentElement?.scrollHeight ?? snapshot.scrollHeight;
  const delta = afterScrollHeight - snapshot.scrollHeight;
  if (delta !== 0) window.scrollTo({ top: snapshot.top + delta });
}

function createProofStreamId(event: ProofStreamRow['event'], proofHash: string): string {
  if (proofHash) return proofHash;
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseProofStreamRow(raw: string): ProofStreamRow | null {
  if (!raw.trim().startsWith('{')) return null;
  const payload: unknown = JSON.parse(raw);
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  if (record.category !== 'Data') return null;
  if (record.event !== 'ProofVerified' && record.event !== 'ProofRejected') return null;

  const proofHash = typeof record.proof_hash === 'string' ? record.proof_hash : '';
  return {
    id: createProofStreamId(record.event, proofHash),
    event: record.event,
    backend: typeof record.backend === 'string' && record.backend.trim() ? record.backend : 'unknown',
    proof_hash: proofHash,
    call_hash: typeof record.call_hash === 'string' ? record.call_hash : null,
    envelope_hash: typeof record.envelope_hash === 'string' ? record.envelope_hash : null,
    observed_at: new Date(),
  };
}

function appendProofStreamRow(row: ProofStreamRow) {
  proofEvents.unshift(row);
  if (proofEvents.length > 40) {
    proofEvents.splice(40);
  }

  if (row.event === 'ProofVerified') {
    proofTotals.verified += 1;
    proofTimeline.push({ timestamp: Date.now(), kind: 'verified' });
  } else {
    proofTotals.rejected += 1;
    proofTimeline.push({ timestamp: Date.now(), kind: 'rejected' });
  }
  pruneTimeline();
}

watch(proofStreamData, async (value) => {
  if (!value) return;
  try {
    const scrollSnapshot = captureProofScrollSnapshot();
    const row = parseProofStreamRow(value);
    if (!row) return;

    appendProofStreamRow(row);
    await restoreProofScrollSnapshot(scrollSnapshot);
  } catch (error) {
    console.warn('Failed to parse proof SSE payload', error);
  }
});

watch(
  () => proofStreamFilters.backend,
  () => {
    proofEvents.splice(0);
    proofTotals.verified = 0;
    proofTotals.rejected = 0;
    proofTimeline.splice(0);
  }
);

const streamStatusLabel = computed(() => {
  switch (proofStreamStatus.value) {
    case 'OPEN':
      return t('zkTelemetry.stream.status.open');
    case 'CONNECTING':
      return t('zkTelemetry.stream.status.connecting');
    default:
      return t('zkTelemetry.stream.status.closed');
  }
});

const proofThroughputPerMinute = computed(() => {
  pruneTimeline();
  return ((proofTimeline.length / TIMELINE_WINDOW_MS) * 60_000).toFixed(1);
});

const sparklinePoints = computed(() => {
  pruneTimeline();
  const buckets = Array.from({ length: TIMELINE_BUCKETS }, () => 0);
  const now = Date.now();
  const bucketSize = TIMELINE_WINDOW_MS / TIMELINE_BUCKETS;
  proofTimeline.forEach((entry) => {
    const age = now - entry.timestamp;
    if (age >= 0 && age <= TIMELINE_WINDOW_MS) {
      const bucketIndex = TIMELINE_BUCKETS - 1 - Math.floor(age / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < TIMELINE_BUCKETS) {
        buckets[bucketIndex] += 1;
      }
    }
  });
  const max = Math.max(...buckets, 1);
  return buckets
    .map((value, idx) => {
      const x = (idx / (TIMELINE_BUCKETS - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');
});

function formatStreamEvent(event: ProofStreamRow['event']) {
  return event === 'ProofVerified'
    ? t('zkTelemetry.stream.labels.verified')
    : t('zkTelemetry.stream.labels.rejected');
}

const attachmentFilters = reactive({
  page: 1,
  per_page: 10,
  content_type: '',
  has_tag: '',
  order: 'desc' as 'asc' | 'desc',
});

watch(
  () => [attachmentFilters.per_page, attachmentFilters.content_type, attachmentFilters.has_tag, attachmentFilters.order],
  () => {
    attachmentFilters.page = 1;
  }
);

const attachmentListPayload = computed(() => {
  const limit = attachmentFilters.per_page;
  const offset = (attachmentFilters.page - 1) * limit;
  return {
    limit,
    offset,
    content_type: attachmentFilters.content_type.trim() || undefined,
    has_tag: attachmentFilters.has_tag.trim() || undefined,
    order: attachmentFilters.order,
  };
});

const attachmentCountPayload = computed(() => ({
  content_type: attachmentListPayload.value.content_type,
  has_tag: attachmentListPayload.value.has_tag,
}));

const attachmentsScope = useParamScope(
  () => ({
    key: `zk-att-${JSON.stringify(attachmentListPayload.value)}`,
    payload: attachmentListPayload.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchZkAttachments(payload))
);

const attachmentsCountScope = useParamScope(
  () => ({
    key: `zk-att-count-${JSON.stringify(attachmentCountPayload.value)}`,
    payload: attachmentCountPayload.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchZkAttachmentCount(payload))
);

const attachmentsLoading = computed(() => Boolean(attachmentsScope.value?.expose.isLoading));
const attachments = computed(() =>
  attachmentsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? attachmentsScope.value.expose.data.data : []
);
const attachmentsTotal = computed(() =>
  attachmentsCountScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? attachmentsCountScope.value.expose.data.data.count
    : 0
);
const attachmentsPagination = computed(() => {
  if (!attachmentsCountScope.value?.expose.data || attachmentsCountScope.value.expose.data.status !== SUCCESSFUL_FETCHING) {
    return null;
  }
  return buildOffsetPagination(
    attachmentsTotal.value,
    attachmentListPayload.value.limit,
    attachmentListPayload.value.offset
  );
});

const reportFilters = reactive({
  page: 1,
  per_page: 10,
  status: 'all' as 'all' | 'ok' | 'failed',
  content_type: '',
  has_tag: '',
  order: 'desc' as 'asc' | 'desc',
});

watch(
  () => [reportFilters.per_page, reportFilters.status, reportFilters.content_type, reportFilters.has_tag, reportFilters.order],
  () => {
    reportFilters.page = 1;
  }
);

const reportListPayload = computed(() => {
  const limit = reportFilters.per_page;
  const offset = (reportFilters.page - 1) * limit;
  return {
    limit,
    offset,
    status: reportFilters.status,
    content_type: reportFilters.content_type.trim() || undefined,
    has_tag: reportFilters.has_tag.trim() || undefined,
    order: reportFilters.order,
  };
});

const reportCountPayload = computed(() => ({
  status: reportListPayload.value.status,
  content_type: reportListPayload.value.content_type,
  has_tag: reportListPayload.value.has_tag,
}));

const reportsScope = useParamScope(
  () => ({
    key: `zk-reports-${JSON.stringify(reportListPayload.value)}`,
    payload: reportListPayload.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchZkProverReports(payload))
);

const reportsCountScope = useParamScope(
  () => ({
    key: `zk-reports-count-${JSON.stringify(reportCountPayload.value)}`,
    payload: reportCountPayload.value,
  }),
  ({ payload }) => setupAsyncData(() => http.fetchZkProverReportCount(payload))
);

const reportsLoading = computed(() => Boolean(reportsScope.value?.expose.isLoading));
const reports = computed(() =>
  reportsScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? reportsScope.value.expose.data.data : []
);
const reportsTotal = computed(() =>
  reportsCountScope.value?.expose.data?.status === SUCCESSFUL_FETCHING
    ? reportsCountScope.value.expose.data.data.count
    : 0
);
const reportsPagination = computed(() => {
  if (!reportsCountScope.value?.expose.data || reportsCountScope.value.expose.data.status !== SUCCESSFUL_FETCHING) {
    return null;
  }
  return buildOffsetPagination(reportsTotal.value, reportListPayload.value.limit, reportListPayload.value.offset);
});

function msToDate(ms: number) {
  return new Date(ms);
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatLatency(latency: number | undefined) {
  if (!latency) return '—';
  if (latency < 1000) return `${latency} ms`;
  const seconds = latency / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} m`;
}

function formatTags(tags?: string[] | null) {
  if (!tags || tags.length === 0) return '—';
  return tags.join(', ');
}

function attachmentDownloadUrl(id: string) {
  return buildToriiUrl(`/zk/attachments/${encodeURIComponent(id)}`);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.zk-telemetry-page {
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: size(2);
    margin-bottom: size(2);

    label {
      display: flex;
      flex-direction: column;
      gap: size(1);

      input,
      select {
        padding: size(1.25);
        border: 1px solid theme-color('border-primary');
        border-radius: size(1);
        background: transparent;
        color: theme-color('content-primary');
      }
    }
  }

  &__stream-status {
    font-size: size(1.5);
    color: theme-color('content-tertiary');
    align-self: flex-end;
  }

  .base-table > .content-row,
  &__table .content-row {
    padding-block: size(1.5);
    padding-inline: size(3);

    @include lg {
      padding-inline: size(4);
    }
  }

  &__row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: size(1);
    align-items: center;

    &--header {
      font-weight: 600;
      color: theme-color('content-secondary');
    }
  }

  &__link {
    color: theme-color('primary');
    text-decoration: underline;
  }

  &__status {
    padding: size(0.5) size(1.5);
    border-radius: size(2);
    font-weight: 600;
    text-transform: uppercase;
    font-size: size(1.5);

    &--ok {
      background: color-mix(in srgb, theme-color('success') 15%, transparent);
      color: theme-color('success');
    }

    &--failed {
      background: color-mix(in srgb, theme-color('error') 15%, transparent);
      color: theme-color('error');
    }
  }

  &__sparkline {
    margin: size(2) 0;
    display: flex;
    align-items: center;
    gap: size(2);

    svg {
      width: 160px;
      height: 40px;
      stroke: theme-color('primary');
      fill: none;
      stroke-width: 2;
    }

    .caption {
      font-size: size(1.5);
      color: theme-color('content-secondary');
    }
  }
}
</style>
