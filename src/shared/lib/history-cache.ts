import { isCanonicalIrohaHashLiteral32 } from './iroha-hash';
import { explorerReadIsPublic, explorerReadAuthRevision } from './explorer-read-auth';

/** An anonymous view may persist history only while its reader identity stays unchanged. */
export function createPublicHistoryCacheKey(kind: string, networkId: string | undefined, toriiUrl: string): () => string | null {
  const readerRevision = explorerReadAuthRevision.value;
  const key = explorerReadIsPublic.value ? historyCacheKey(kind, networkId, toriiUrl) : null;
  return () => explorerReadIsPublic.value && explorerReadAuthRevision.value === readerRevision ? key : null;
}

/** Cache identity is exact ledger metadata plus the active Torii endpoint. */
export function historyCacheKey(kind: string, networkId: string | undefined, toriiUrl: string): string | null {
  if (!networkId || !isCanonicalIrohaHashLiteral32(networkId)) return null;
  try {
    const endpoint = new URL(toriiUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null;
  } catch {
    return null;
  }
  return `iroha-history-v1:${kind}:${encodeURIComponent(networkId)}:${encodeURIComponent(toriiUrl)}`;
}
