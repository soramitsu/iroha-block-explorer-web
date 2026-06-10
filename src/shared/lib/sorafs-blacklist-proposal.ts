export const BLACKLIST_REASON_OPTIONS = [
  { value: 'csam', label: 'CSAM' },
  { value: 'malware', label: 'Malware' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'policy-escalation', label: 'Policy escalation' },
  { value: 'terrorism', label: 'Terrorism' },
  { value: 'spam', label: 'Spam' },
] as const;

export type BlacklistReasonTag = (typeof BLACKLIST_REASON_OPTIONS)[number]['value'];
export type SorafsDenylistProposalAction = 'add-to-denylist' | 'remove-from-denylist';
export const SORAFS_BLACKLIST_PROPOSAL_ISSUES = {
  missingRootCid: 'missing-root-cid',
  missingAddReason: 'missing-add-reason',
  invalidProposalId: 'invalid-proposal-id',
  missingSubmitterName: 'missing-submitter-name',
  missingSubmitterContact: 'missing-submitter-contact',
  missingRemovalNote: 'missing-removal-note',
  invalidPgpFingerprint: 'invalid-pgp-fingerprint',
  invalidEvidenceDigest: 'invalid-evidence-digest',
  missingEvidence: 'missing-evidence',
  invalidDuplicateReference: 'invalid-duplicate-reference',
} as const;

export type SorafsBlacklistProposalIssueCode =
  (typeof SORAFS_BLACKLIST_PROPOSAL_ISSUES)[keyof typeof SORAFS_BLACKLIST_PROPOSAL_ISSUES];

export interface SorafsBlacklistProposalFormInput {
  action: SorafsDenylistProposalAction
  reasonTag?: BlacklistReasonTag | null
  proposalId: string
  submitterName: string
  submitterContact: string
  submitterOrganization?: string | null
  submitterPgpFingerprint?: string | null
  note?: string | null
  duplicatesRaw?: string | null
}

export interface SorafsBlacklistProposalContext {
  manifestDigestHex: string
  aliasName?: string | null
  rootCid: string
  rootCidHex: string
  publicEvidenceUrl?: string | null
  explorerEvidenceUrl?: string | null
  evidenceDigestBlake3Hex?: string | null
  timestampMs?: number
}

export interface SorafsBlacklistProposalEvidence {
  kind: 'url' | 'torii-case' | 'sorafs-cid' | 'attachment'
  uri: string
  digest_blake3_hex?: string
  description?: string
}

export interface SorafsBlacklistProposalDraft {
  version: 1
  proposal_id: string
  submitted_at_unix_ms: number
  language: string
  action: SorafsDenylistProposalAction
  summary: {
    title: string
    motivation: string
    expected_impact: string
  }
  tags: string[]
  targets: Array<{
    label: string
    hash_family: 'sorafs-root-cid'
    hash_hex: string
    reason: string
  }>
  evidence: SorafsBlacklistProposalEvidence[]
  submitter: {
    name: string
    contact: string
    organization?: string
    pgp_fingerprint?: string
  }
  duplicates: string[]
}

export interface SorafsBlacklistProposalLocalizedText {
  addTitle: string
  removeTitle: string
  addMotivation: string
  removeMotivation: string
  addExpectedImpact: string
  removeExpectedImpact: string
  addTargetReason: string
  removeTargetReason: string
  addCidEvidenceDescription: string
  removeCidEvidenceDescription: string
  addUrlEvidenceDescription: string
  removeUrlEvidenceDescription: string
}

export interface SorafsBlacklistProposalBuildOptions {
  locale: string
  localizedText: SorafsBlacklistProposalLocalizedText
}

const PROPOSAL_ID_RE = /^AC-\d{4}-\d{3}$/;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const HEX_40_RE = /^[0-9a-f]{40}$/i;
const SAFE_FILENAME_SEGMENT_RE = /[^A-Za-z0-9._-]+/gu;

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePgpFingerprint(value?: string | null): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;
  return HEX_40_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

function normalizeEvidenceDigest(value?: string | null): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  return HEX_64_RE.test(normalized) ? normalized : null;
}

function buildSorafsCidEvidenceUri(rootCid: string): string {
  return `sorafs://${rootCid}/manifest.car`;
}

export function parseProposalDuplicates(raw?: string | null): string[] {
  if (!raw) return [];

  const unique = new Set<string>();
  for (const token of raw.split(/[\n,]/u)) {
    const trimmed = token.trim();
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique);
}

function sanitizeFilenameSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(SAFE_FILENAME_SEGMENT_RE, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized || fallback;
}

function normalizeLocaleTag(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'en';

  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

export function buildSorafsBlacklistProposalFilename(proposalId: string, rootCid: string): string {
  const safeProposalId = sanitizeFilenameSegment(proposalId, 'agenda-proposal');
  const safeRootCid = sanitizeFilenameSegment(rootCid.toLowerCase(), 'cid');
  return `agenda-proposal-${safeProposalId}-${safeRootCid}.json`;
}

export function buildSorafsBlacklistValidateCommand(filename: string): string {
  const safeFilename = sanitizeFilenameSegment(filename, 'agenda-proposal.json');
  return `cargo xtask ministry-agenda validate --proposal ./${safeFilename}`;
}

export function buildSorafsBlacklistImpactCommand(filename: string, proposalId: string): string {
  const safeFilename = sanitizeFilenameSegment(filename, 'agenda-proposal.json');
  const safeProposalId = sanitizeFilenameSegment(proposalId, 'agenda-proposal');
  return `cargo xtask ministry-agenda impact --proposal ./${safeFilename} --out ./impact-${safeProposalId}.json`;
}

export function buildSorafsBlacklistProposal(
  context: SorafsBlacklistProposalContext,
  form: SorafsBlacklistProposalFormInput,
  options: SorafsBlacklistProposalBuildOptions
): SorafsBlacklistProposalDraft {
  const action = form.action;
  const normalizedNote = normalizeOptionalString(form.note);
  const normalizedOrganization = normalizeOptionalString(form.submitterOrganization);
  const normalizedFingerprint = normalizePgpFingerprint(form.submitterPgpFingerprint);
  const normalizedDuplicates = parseProposalDuplicates(form.duplicatesRaw);
  const normalizedDigest = normalizeEvidenceDigest(context.evidenceDigestBlake3Hex);
  const normalizedPublicUrl = normalizeOptionalString(context.publicEvidenceUrl);
  const normalizedExplorerUrl = normalizeOptionalString(context.explorerEvidenceUrl);
  const manifestDigest = context.manifestDigestHex.trim();
  const rootCid = context.rootCid.trim();
  const language = normalizeLocaleTag(options.locale);
  const localizedText = options.localizedText;
  const targetLabel = normalizeOptionalString(context.aliasName) ? `${context.aliasName?.trim()} (${rootCid})` : rootCid;
  const baseTargetReason =
    action === 'remove-from-denylist'
      ? localizedText.removeTargetReason
      : localizedText.addTargetReason;
  const targetReason = normalizedNote ? `${baseTargetReason} · ${normalizedNote}` : baseTargetReason;
  const evidence: SorafsBlacklistProposalEvidence[] = [];

  if (normalizedDigest) {
    evidence.push({
      kind: 'sorafs-cid',
      uri: buildSorafsCidEvidenceUri(rootCid),
      digest_blake3_hex: normalizedDigest,
      description:
        action === 'remove-from-denylist'
          ? localizedText.removeCidEvidenceDescription
          : localizedText.addCidEvidenceDescription,
    });
  }

  const urlEvidence = normalizedPublicUrl ?? normalizedExplorerUrl;
  if (urlEvidence) {
    evidence.push({
      kind: 'url',
      uri: urlEvidence,
      description:
        action === 'remove-from-denylist'
          ? `${localizedText.removeUrlEvidenceDescription}${normalizedNote ? ` · ${normalizedNote}` : ''}`
          : `${localizedText.addUrlEvidenceDescription}${normalizedNote ? ` · ${normalizedNote}` : ''}`,
    });
  }

  return {
    version: 1,
    proposal_id: form.proposalId.trim(),
    submitted_at_unix_ms: context.timestampMs ?? Date.now(),
    language,
    action,
    summary: {
      title:
        action === 'remove-from-denylist'
          ? localizedText.removeTitle
          : localizedText.addTitle,
      motivation:
        action === 'remove-from-denylist'
          ? localizedText.removeMotivation
          : localizedText.addMotivation,
      expected_impact:
        action === 'remove-from-denylist'
          ? localizedText.removeExpectedImpact
          : localizedText.addExpectedImpact,
    },
    tags: action === 'add-to-denylist' && form.reasonTag ? [form.reasonTag] : [],
    targets: [
      {
        label: targetLabel,
        hash_family: 'sorafs-root-cid',
        hash_hex: context.rootCidHex.trim(),
        reason: targetReason,
      },
    ],
    evidence,
    submitter: {
      name: form.submitterName.trim(),
      contact: form.submitterContact.trim(),
      ...(normalizedOrganization ? { organization: normalizedOrganization } : {}),
      ...(normalizedFingerprint ? { pgp_fingerprint: normalizedFingerprint } : {}),
    },
    duplicates: normalizedDuplicates,
  };
}

export function validateSorafsBlacklistProposalDraft(
  context: SorafsBlacklistProposalContext,
  form: SorafsBlacklistProposalFormInput
): SorafsBlacklistProposalIssueCode[] {
  const issues: SorafsBlacklistProposalIssueCode[] = [];
  const isRemoval = form.action === 'remove-from-denylist';
  const normalizedFingerprint = normalizeOptionalString(form.submitterPgpFingerprint);
  const normalizedDigest = normalizeOptionalString(context.evidenceDigestBlake3Hex);
  const duplicates = parseProposalDuplicates(form.duplicatesRaw);
  const hasEvidenceUrl =
    !!normalizeOptionalString(context.publicEvidenceUrl) || !!normalizeOptionalString(context.explorerEvidenceUrl);

  if (!context.rootCidHex.trim()) issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingRootCid);
  if (!isRemoval && !form.reasonTag) issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingAddReason);
  if (!PROPOSAL_ID_RE.test(form.proposalId.trim())) issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidProposalId);
  if (!form.submitterName.trim()) issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingSubmitterName);
  if (!form.submitterContact.trim()) issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingSubmitterContact);
  if (isRemoval && !normalizeOptionalString(form.note)) {
    issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingRemovalNote);
  }
  if (normalizedFingerprint && !normalizePgpFingerprint(normalizedFingerprint)) {
    issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidPgpFingerprint);
  }
  if (normalizedDigest && !normalizeEvidenceDigest(normalizedDigest)) {
    issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidEvidenceDigest);
  }
  if (!hasEvidenceUrl && !normalizeEvidenceDigest(context.evidenceDigestBlake3Hex)) {
    issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.missingEvidence);
  }
  if (duplicates.some((entry) => !PROPOSAL_ID_RE.test(entry))) {
    issues.push(SORAFS_BLACKLIST_PROPOSAL_ISSUES.invalidDuplicateReference);
  }

  return issues;
}
