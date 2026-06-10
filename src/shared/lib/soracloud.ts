import type {
  SoracloudAgentStatusResponse,
  SoracloudControlPlaneAuditEvent,
  SoracloudControlPlaneService,
  SoracloudAgentAutonomyStatusQuery,
  SoracloudAgentMailboxStatusQuery,
  SoracloudHfSharedLeaseStatusQuery,
  SoracloudModelArtifactStatusQuery,
  SoracloudServiceConfigStatusQuery,
  SoracloudServiceSecretStatusQuery,
  SoracloudStatus,
  SoracloudTrainingJobStatusQuery,
  SoracloudModelWeightStatusQuery,
  SoracloudUploadedModelStatusQuery,
  SoracloudPrivateInferenceStatusQuery,
} from '@/shared/api/schemas';
import { NOT_FOUND } from '@/shared/api/consts';
import type { ErrorResponse } from '@/shared/utils/transform-error-response';

export interface SoracloudOverviewStats {
  runtimeStatus: string
  serviceCount: number
  serviceRevisions: number
  auditEventCount: number
  apartments: number
  runningApartments: number
  failedAdmissionsTotal: number
  queueActive: number
  queueQueued: number
  queueCapacity: number
  reportedPendingMailboxMessages: number
  authoritativePendingMailboxMessages: number
  bundleCacheMisses: number
  artifactCacheMisses: number
}

export function summarizeSoracloudStatus(status: SoracloudStatus): SoracloudOverviewStats {
  return {
    runtimeStatus: status.service_health.status,
    serviceCount: status.control_plane.service_count,
    serviceRevisions: status.service_health.service_revisions,
    auditEventCount: status.control_plane.audit_event_count,
    apartments: status.service_health.apartments,
    runningApartments: status.service_health.running_apartments,
    failedAdmissionsTotal: status.failed_admissions.total,
    queueActive: status.resource_pressure.queue_active,
    queueQueued: status.resource_pressure.queue_queued,
    queueCapacity: status.resource_pressure.queue_capacity,
    reportedPendingMailboxMessages: status.resource_pressure.runtime.reported_pending_mailbox_messages,
    authoritativePendingMailboxMessages: status.resource_pressure.runtime.authoritative_pending_mailbox_messages,
    bundleCacheMisses: status.resource_pressure.runtime.bundle_cache_misses,
    artifactCacheMisses: status.resource_pressure.runtime.artifact_cache_misses,
  };
}

export function sortSoracloudServices(
  services: readonly SoracloudControlPlaneService[]
): SoracloudControlPlaneService[] {
  return [...services].sort((left, right) => {
    const byName = left.service_name.localeCompare(right.service_name);
    if (byName !== 0) return byName;
    return left.current_version.localeCompare(right.current_version);
  });
}

export function sortSoracloudAuditEvents(
  events: readonly SoracloudControlPlaneAuditEvent[]
): SoracloudControlPlaneAuditEvent[] {
  return [...events].sort((left, right) => right.sequence - left.sequence);
}

export function soracloudActionLabel(action: unknown): string {
  if (typeof action === 'string') return action;
  if (!action || typeof action !== 'object') return 'Unknown';

  const record = action as Record<string, unknown>;
  if (typeof record.kind === 'string' && record.kind.trim()) return record.kind;
  if (typeof record.variant === 'string' && record.variant.trim()) return record.variant;

  const stringEntry = Object.entries(record).find(([, value]) => typeof value === 'string' && value.trim());
  if (stringEntry?.[1] && typeof stringEntry[1] === 'string') return stringEntry[1];

  const keys = Object.keys(record);
  if (keys.length === 1) return keys[0] ?? 'Unknown';

  return 'Unknown';
}

export function soracloudServiceRouteLabel(service: SoracloudControlPlaneService): string {
  const host = service.latest_revision?.route_host?.trim() || null;
  const pathPrefix = service.latest_revision?.route_path_prefix?.trim() || null;
  if (host && pathPrefix) return `${host}${pathPrefix}`;
  return host ?? pathPrefix ?? '—';
}

function hasSoracloudText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function suggestSoracloudServiceNames(status: SoracloudStatus | null | undefined): string[] {
  if (!status) return [];

  return Array.from(new Set(status.control_plane.services.map((service) => service.service_name.trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right)
  );
}

export function suggestSoracloudApartmentNames(agentStatus: SoracloudAgentStatusResponse | null | undefined): string[] {
  if (!agentStatus) return [];

  return Array.from(
    new Set(agentStatus.apartments.map((apartment) => apartment.apartment_name.trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
}

export function isSoracloudServiceConfigQueryReady(
  query: SoracloudServiceConfigStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.service_name);
}

export function isSoracloudServiceSecretQueryReady(
  query: SoracloudServiceSecretStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.service_name);
}

export function isSoracloudTrainingJobQueryReady(
  query: SoracloudTrainingJobStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.service_name) && hasSoracloudText(query?.job_id);
}

export function isSoracloudModelWeightQueryReady(
  query: SoracloudModelWeightStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.service_name) && hasSoracloudText(query?.model_name);
}

export function isSoracloudModelArtifactQueryReady(
  query: SoracloudModelArtifactStatusQuery | null | undefined
): boolean {
  return (
    hasSoracloudText(query?.service_name) &&
    (hasSoracloudText(query?.model_name) || hasSoracloudText(query?.artifact_id) || hasSoracloudText(query?.training_job_id))
  );
}

export function isSoracloudUploadedModelQueryReady(
  query: SoracloudUploadedModelStatusQuery | null | undefined
): boolean {
  return (
    hasSoracloudText(query?.service_name) &&
    hasSoracloudText(query?.weight_version) &&
    (hasSoracloudText(query?.model_id) || hasSoracloudText(query?.model_name))
  );
}

export function isSoracloudPrivateInferenceQueryReady(
  query: SoracloudPrivateInferenceStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.session_id);
}

export function isSoracloudHfSharedLeaseQueryReady(
  query: SoracloudHfSharedLeaseStatusQuery | null | undefined
): boolean {
  return (
    hasSoracloudText(query?.repo_id) &&
    hasSoracloudText(query?.storage_class) &&
    typeof query?.lease_term_ms === 'number' &&
    Number.isFinite(query.lease_term_ms) &&
    query.lease_term_ms > 0
  );
}

export function isSoracloudAgentMailboxQueryReady(
  query: SoracloudAgentMailboxStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.apartment_name);
}

export function isSoracloudAgentAutonomyQueryReady(
  query: SoracloudAgentAutonomyStatusQuery | null | undefined
): boolean {
  return hasSoracloudText(query?.apartment_name);
}

export function soracloudInlineErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

export function soracloudResultErrorMessage(
  response: ErrorResponse,
  fallback: string,
  notFoundFallback?: string
): string {
  if (response.status === NOT_FOUND) return notFoundFallback ?? fallback;
  return soracloudInlineErrorMessage(response.error, fallback);
}
