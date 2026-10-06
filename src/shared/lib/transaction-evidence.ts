import { NOT_FOUND, SUCCESSFUL_FETCHING, type UnknownError } from '@/shared/api/consts';
import type { ApiProblem } from '@/shared/utils/resource-state';
import { apiProblemFromError } from '@/shared/utils/resource-state';
import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';

export type EvidenceApiResult<T> =
  | { status: typeof SUCCESSFUL_FETCHING; data: T }
  | { status: typeof NOT_FOUND }
  | { status: UnknownError; error: Error };

export type EvidencePart<T> =
  | { status: 'available'; data: T }
  | { status: 'unavailable' }
  | { status: 'error'; problem: ApiProblem };

export interface TransactionEvidenceBundle<BlockProof, ReferenceBlock, StateRoot, StateProof> {
  blockProof: EvidencePart<BlockProof>;
  referenceBlock: EvidencePart<ReferenceBlock>;
  stateRoot: EvidencePart<StateRoot>;
  stateProof: EvidencePart<StateProof>;
}

export interface TransactionEvidenceRequests<BlockProof, ReferenceBlock, StateRoot, StateProof> {
  fetchBlockProof: () => Promise<EvidenceApiResult<BlockProof>>;
  fetchReferenceBlock: () => Promise<EvidenceApiResult<ReferenceBlock>>;
  fetchStateRoot: () => Promise<EvidenceApiResult<StateRoot>>;
  fetchStateProof: () => Promise<EvidenceApiResult<StateProof>>;
}

interface TransactionBlockProofIdentity {
  proof: {
    block_height: unknown;
    entry_hash: unknown;
    entry_commitment: {
      root: unknown;
    };
  };
  pathVerification: null | {
    valid: unknown;
  };
}

interface ReferenceBlockIdentity {
  height: unknown;
  transactions_hash: unknown;
}

interface StateReferenceBlockIdentity {
  height: number;
  hash: string;
}

export interface TransactionBlockEvidenceVerification {
  valid: boolean;
  pathVerificationAvailable: boolean;
  pathVerificationValid: boolean;
  transactionHashMatches: boolean;
  proofHeightMatches: boolean;
  referenceBlockHeightMatches: boolean;
  entryRootMatches: boolean;
}

export interface TransactionBlockEvidenceVerificationInput {
  blockProof: EvidencePart<TransactionBlockProofIdentity>;
  referenceBlock: EvidencePart<ReferenceBlockIdentity>;
  requestedTransactionHash: string;
  requestedBlockHeight: number;
}

export function evidencePartFromResult<T>(result: EvidenceApiResult<T>): EvidencePart<T> {
  if (result.status === SUCCESSFUL_FETCHING) {
    return { status: 'available', data: result.data };
  }
  if (result.status === NOT_FOUND) return { status: 'unavailable' };
  return { status: 'error', problem: apiProblemFromError(result.error) };
}

export function evidencePartFromSettled<T>(result: PromiseSettledResult<EvidenceApiResult<T>>): EvidencePart<T> {
  if (result.status === 'fulfilled') return evidencePartFromResult(result.value);
  return { status: 'error', problem: apiProblemFromError(result.reason) };
}

export async function loadTransactionEvidence<BlockProof, ReferenceBlock, StateRoot, StateProof>(
  requests: TransactionEvidenceRequests<BlockProof, ReferenceBlock, StateRoot, StateProof>
): Promise<TransactionEvidenceBundle<BlockProof, ReferenceBlock, StateRoot, StateProof>> {
  const [blockProof, referenceBlock, stateRoot, stateProof] = await Promise.allSettled([
    requests.fetchBlockProof(),
    requests.fetchReferenceBlock(),
    requests.fetchStateRoot(),
    requests.fetchStateProof(),
  ]);

  return {
    blockProof: evidencePartFromSettled(blockProof),
    referenceBlock: evidencePartFromSettled(referenceBlock),
    stateRoot: evidencePartFromSettled(stateRoot),
    stateProof: evidencePartFromSettled(stateProof),
  };
}

function blockHeightMatches(value: unknown, expectedHeight: number): boolean {
  if (!Number.isSafeInteger(expectedHeight) || expectedHeight < 0) return false;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) return false;
  try {
    return BigInt(value) === BigInt(expectedHeight);
  } catch {
    return false;
  }
}

export function verifyTransactionBlockEvidence({
  blockProof,
  referenceBlock,
  requestedTransactionHash,
  requestedBlockHeight,
}: TransactionBlockEvidenceVerificationInput): TransactionBlockEvidenceVerification {
  const proof = blockProof.status === 'available' ? blockProof.data : null;
  const block = referenceBlock.status === 'available' ? referenceBlock.data : null;
  const requestedHash = normalizeIrohaHash32(requestedTransactionHash);
  const proofEntryHash = normalizeIrohaHash32(proof?.proof.entry_hash);
  const proofEntryRoot = normalizeIrohaHash32(proof?.proof.entry_commitment.root);
  const blockTransactionsHash = normalizeIrohaHash32(block?.transactions_hash);

  const pathVerificationAvailable = proof !== null && proof.pathVerification !== null;
  const pathVerificationValid = proof?.pathVerification?.valid === true;
  const transactionHashMatches = requestedHash !== null && proofEntryHash !== null && requestedHash === proofEntryHash;
  const proofHeightMatches = proof !== null && blockHeightMatches(proof.proof.block_height, requestedBlockHeight);
  const referenceBlockHeightMatches =
    Number.isSafeInteger(requestedBlockHeight) && requestedBlockHeight >= 0 && block?.height === requestedBlockHeight;
  const entryRootMatches =
    proofEntryRoot !== null && blockTransactionsHash !== null && proofEntryRoot === blockTransactionsHash;

  return {
    valid: [
      pathVerificationValid,
      transactionHashMatches,
      proofHeightMatches,
      referenceBlockHeightMatches,
      entryRootMatches,
    ].every(Boolean),
    pathVerificationAvailable,
    pathVerificationValid,
    transactionHashMatches,
    proofHeightMatches,
    referenceBlockHeightMatches,
    entryRootMatches,
  };
}

export function stateEvidenceAgreement(
  bundle: TransactionEvidenceBundle<
    unknown,
    StateReferenceBlockIdentity,
    { height: number; block_hash: string; witnessed_post_state_root: string },
    { height: number; block_hash: string; witnessed_post_state_root: string }
  >,
  requestedBlockHeight: number
): boolean | null {
  if (
    bundle.referenceBlock.status !== 'available' ||
    bundle.stateRoot.status !== 'available' ||
    bundle.stateProof.status !== 'available'
  ) {
    return null;
  }
  if (!Number.isSafeInteger(requestedBlockHeight) || requestedBlockHeight < 0) return false;
  const referenceHash = normalizeIrohaHash32(bundle.referenceBlock.data.hash);
  const stateHash = normalizeIrohaHash32(bundle.stateRoot.data.block_hash);
  const proofHash = normalizeIrohaHash32(bundle.stateProof.data.block_hash);
  const stateRoot = normalizeIrohaHash32(bundle.stateRoot.data.witnessed_post_state_root);
  const proofRoot = normalizeIrohaHash32(bundle.stateProof.data.witnessed_post_state_root);
  return (
    bundle.referenceBlock.data.height === requestedBlockHeight &&
    bundle.stateRoot.data.height === requestedBlockHeight &&
    bundle.stateProof.data.height === requestedBlockHeight &&
    referenceHash !== null && stateHash !== null && proofHash !== null &&
    stateRoot !== null && proofRoot !== null &&
    referenceHash === stateHash && stateHash === proofHash && stateRoot === proofRoot
  );
}
