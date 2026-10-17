import { normalizeIrohaHash32 } from '@/shared/lib/iroha-hash';

interface TransactionProofIdentity {
  network_id: string;
  block_height: string;
  block_header: { height: unknown };
  transaction: { entrypoint_hash: string };
}

/** Identifier agreement is not cryptographic inclusion or finality verification. */
export function transactionProofAgreement(
  proof: TransactionProofIdentity,
  requested: { transactionHash: string; blockHeight: number; networkId: string | undefined }
) {
  const requestedHash = normalizeIrohaHash32(requested.transactionHash);
  const entryHash = normalizeIrohaHash32(proof.transaction.entrypoint_hash);
  const transactionMatches = requestedHash !== null && requestedHash === entryHash;
  const networkMatches = requested.networkId !== undefined && proof.network_id === requested.networkId;
  const heightMatches = Number.isSafeInteger(requested.blockHeight) && requested.blockHeight > 0 &&
    proof.block_height === String(requested.blockHeight) && String(proof.block_header.height) === proof.block_height;
  return { transactionMatches, networkMatches, heightMatches, matches: transactionMatches && networkMatches && heightMatches };
}
