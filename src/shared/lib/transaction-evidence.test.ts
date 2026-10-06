import stateFinality from '../../../tests/fixtures/taira-state-finality.json';
import { describe, expect, it, vi } from 'vitest';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import {
  evidencePartFromResult,
  evidencePartFromSettled,
  loadTransactionEvidence,
  stateEvidenceAgreement,
  verifyTransactionBlockEvidence,
  type TransactionEvidenceBundle,
} from './transaction-evidence';

const TRANSACTION_HASH = '11'.repeat(32);
const ENTRY_ROOT = '33'.repeat(32);
const OTHER_HASH = '55'.repeat(32);

describe('transaction evidence orchestration', () => {
  it('maps successful, unavailable, and failed API results without disguising them', () => {
    expect(evidencePartFromResult({ status: SUCCESSFUL_FETCHING, data: 'proof' })).toEqual({
      status: 'available',
      data: 'proof',
    });
    expect(evidencePartFromResult<string>({ status: NOT_FOUND })).toEqual({ status: 'unavailable' });
    expect(evidencePartFromResult<string>({ status: UNKNOWN_ERROR, error: new Error('rejected') })).toMatchObject({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'rejected' },
    });
  });

  it('maps rejected requests to an explicit problem', () => {
    expect(evidencePartFromSettled<string>({ status: 'rejected', reason: new TypeError('offline') })).toEqual({
      status: 'error',
      problem: { kind: 'network', message: 'offline' },
    });
  });

  it('starts all authoritative requests together and preserves partial availability', async () => {
    const calls: string[] = [];
    const fetchBlockProof = vi.fn(async () => {
      calls.push('proof');
      return { status: SUCCESSFUL_FETCHING, data: { id: 'block-proof' } } as const;
    });
    const fetchReferenceBlock = vi.fn(async () => {
      calls.push('reference');
      return { status: SUCCESSFUL_FETCHING, data: { id: 'reference-block' } } as const;
    });
    const fetchStateRoot = vi.fn(async () => {
      calls.push('root');
      return { status: NOT_FOUND } as const;
    });
    const fetchStateProof = vi.fn(async () => {
      calls.push('qc');
      throw new TypeError('node unavailable');
    });

    const pending = loadTransactionEvidence({
      fetchBlockProof,
      fetchReferenceBlock,
      fetchStateRoot,
      fetchStateProof,
    });
    expect(calls).toEqual(['proof', 'reference', 'root', 'qc']);
    await expect(pending).resolves.toEqual({
      blockProof: { status: 'available', data: { id: 'block-proof' } },
      referenceBlock: { status: 'available', data: { id: 'reference-block' } },
      stateRoot: { status: 'unavailable' },
      stateProof: { status: 'error', problem: { kind: 'network', message: 'node unavailable' } },
    });
  });

  it('binds a valid SDK path to the requested transaction and authoritative block identity', () => {
    const verification = verifyTransactionBlockEvidence({
      blockProof: {
        status: 'available',
        data: {
          proof: {
            block_height: '42',
            entry_hash: `hash:${TRANSACTION_HASH.toUpperCase()}#4667`,
            entry_commitment: { root: `0X${ENTRY_ROOT.toUpperCase()}` },
          },
          pathVerification: { valid: true },
        },
      },
      referenceBlock: {
        status: 'available',
        data: { height: 42, transactions_hash: ENTRY_ROOT },
      },
      requestedTransactionHash: `0x${TRANSACTION_HASH.toUpperCase()}`,
      requestedBlockHeight: 42,
    });

    expect(verification).toEqual({
      valid: true,
      pathVerificationAvailable: true,
      pathVerificationValid: true,
      transactionHashMatches: true,
      proofHeightMatches: true,
      referenceBlockHeightMatches: true,
      entryRootMatches: true,
    });
  });

  it.each([
    {
      name: 'another transaction',
      proof: { block_height: '42', entry_hash: OTHER_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 42, transactions_hash: ENTRY_ROOT },
      pathValid: true,
      failedCheck: 'transactionHashMatches',
    },
    {
      name: 'another proof height',
      proof: { block_height: '43', entry_hash: TRANSACTION_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 42, transactions_hash: ENTRY_ROOT },
      pathValid: true,
      failedCheck: 'proofHeightMatches',
    },
    {
      name: 'another reference-block height',
      proof: { block_height: '42', entry_hash: TRANSACTION_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 43, transactions_hash: ENTRY_ROOT },
      pathValid: true,
      failedCheck: 'referenceBlockHeightMatches',
    },
    {
      name: 'another transactions root',
      proof: { block_height: '42', entry_hash: TRANSACTION_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 42, transactions_hash: OTHER_HASH },
      pathValid: true,
      failedCheck: 'entryRootMatches',
    },
    {
      name: 'a null transactions root',
      proof: { block_height: '42', entry_hash: TRANSACTION_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 42, transactions_hash: null },
      pathValid: true,
      failedCheck: 'entryRootMatches',
    },
    {
      name: 'an invalid SDK path',
      proof: { block_height: '42', entry_hash: TRANSACTION_HASH, entry_commitment: { root: ENTRY_ROOT } },
      block: { height: 42, transactions_hash: ENTRY_ROOT },
      pathValid: false,
      failedCheck: 'pathVerificationValid',
    },
  ])('fails closed when the evidence identifies $name', ({ proof, block, pathValid, failedCheck }) => {
    const verification = verifyTransactionBlockEvidence({
      blockProof: {
        status: 'available',
        data: { proof, pathVerification: { valid: pathValid } },
      },
      referenceBlock: { status: 'available', data: block },
      requestedTransactionHash: TRANSACTION_HASH,
      requestedBlockHeight: 42,
    });

    expect(verification.valid).toBe(false);
    expect(verification[failedCheck as keyof typeof verification]).toBe(false);
  });

  it('fails closed when browser path verification has no authenticated anchor', () => {
    const verification = verifyTransactionBlockEvidence({
      blockProof: {
        status: 'available',
        data: {
          proof: {
            block_height: '42',
            entry_hash: TRANSACTION_HASH,
            entry_commitment: { root: ENTRY_ROOT },
          },
          pathVerification: null,
        },
      },
      referenceBlock: {
        status: 'available',
        data: { height: 42, transactions_hash: ENTRY_ROOT },
      },
      requestedTransactionHash: TRANSACTION_HASH,
      requestedBlockHeight: 42,
    });

    expect(verification).toMatchObject({
      valid: false,
      pathVerificationAvailable: false,
      pathVerificationValid: false,
      transactionHashMatches: true,
      proofHeightMatches: true,
      referenceBlockHeightMatches: true,
      entryRootMatches: true,
    });
  });

  it('does not report a verifier as available when block proof access is unavailable', () => {
    const result = verifyTransactionBlockEvidence({
      blockProof: { status: 'unavailable' },
      referenceBlock: { status: 'unavailable' },
      requestedTransactionHash: TRANSACTION_HASH,
      requestedBlockHeight: 42,
    });
    expect(result).toMatchObject({ valid: false, pathVerificationAvailable: false, pathVerificationValid: false });
  });

  it('fails closed on missing reference evidence and malformed proof identities', () => {
    const verification = verifyTransactionBlockEvidence({
      blockProof: {
        status: 'available',
        data: {
          proof: {
            block_height: '042',
            entry_hash: `hash:${TRANSACTION_HASH.toUpperCase()}#0000`,
            entry_commitment: { root: 'not-a-hash' },
          },
          pathVerification: { valid: true },
        },
      },
      referenceBlock: { status: 'unavailable' },
      requestedTransactionHash: TRANSACTION_HASH,
      requestedBlockHeight: 42,
    });

    expect(verification).toMatchObject({
      valid: false,
      transactionHashMatches: false,
      proofHeightMatches: false,
      referenceBlockHeightMatches: false,
      entryRootMatches: false,
    });
  });

  function stateBundle(): TransactionEvidenceBundle<
    unknown,
    { height: number, hash: string },
    { height: number, block_hash: string, witnessed_post_state_root: string },
    { height: number, block_hash: string, witnessed_post_state_root: string }
  > {
    return {
      blockProof: { status: 'unavailable' },
      referenceBlock: {
        status: 'available',
        data: { height: stateFinality.height, hash: stateFinality.block_hash.slice(5, 69).toLowerCase() },
      },
      stateRoot: { status: 'available', data: { ...stateFinality } },
      stateProof: { status: 'available', data: { ...stateFinality } },
    };
  }

  it('compares live bare-hex block hashes with checksummed state-finality identities', () => {
    const matching = stateBundle();
    expect(stateEvidenceAgreement(matching, stateFinality.height)).toBe(true);
    expect(stateEvidenceAgreement(matching, stateFinality.height + 1)).toBe(false);
    if (matching.stateProof.status !== 'available') throw new Error('expected fixture');
    matching.stateProof.data.witnessed_post_state_root = stateFinality.witnessed_post_state_root.slice(5, 69).toLowerCase();
    expect(stateEvidenceAgreement(matching, stateFinality.height)).toBe(true);
  });

  it.each([
    ['referenceBlock', 'height', stateFinality.height + 1],
    ['stateRoot', 'height', stateFinality.height + 1],
    ['stateProof', 'height', stateFinality.height + 1],
    ['referenceBlock', 'hash', '11'.repeat(32)],
    ['stateRoot', 'block_hash', '11'.repeat(32)],
    ['stateProof', 'block_hash', '11'.repeat(32)],
    ['stateRoot', 'witnessed_post_state_root', '11'.repeat(32)],
    ['stateProof', 'witnessed_post_state_root', '11'.repeat(32)],
    ['referenceBlock', 'hash', stateFinality.block_hash.slice(0, -4) + '0000'],
    ['stateRoot', 'block_hash', stateFinality.block_hash.slice(0, -4) + '0000'],
    ['stateProof', 'block_hash', stateFinality.block_hash.slice(0, -4) + '0000'],
    ['stateRoot', 'witnessed_post_state_root', stateFinality.witnessed_post_state_root.slice(0, -4) + '0000'],
    ['stateProof', 'witnessed_post_state_root', stateFinality.witnessed_post_state_root.slice(0, -4) + '0000'],
    ['referenceBlock', 'hash', '22'.repeat(32)],
    ['stateRoot', 'block_hash', '22'.repeat(32)],
    ['stateProof', 'block_hash', '22'.repeat(32)],
    ['stateRoot', 'witnessed_post_state_root', '22'.repeat(32)],
    ['stateProof', 'witnessed_post_state_root', '22'.repeat(32)],
  ] as const)('fails closed for mismatching or invalid %s.%s', (partName, fieldName, value) => {
    const bundle = stateBundle();
    const part = bundle[partName];
    if (part.status !== 'available') throw new Error('expected fixture');
    Object.assign(part.data, { [fieldName]: value });
    expect(stateEvidenceAgreement(bundle, stateFinality.height)).toBe(false);
  });

  it('never treats two malformed hashes as agreeing because both normalize to null', () => {
    const bundle = stateBundle();
    if (bundle.stateRoot.status !== 'available' || bundle.stateProof.status !== 'available') throw new Error('expected fixture');
    bundle.stateRoot.data.block_hash = 'invalid';
    bundle.stateProof.data.block_hash = 'invalid';
    expect(stateEvidenceAgreement(bundle, stateFinality.height)).toBe(false);
    bundle.stateRoot.data.block_hash = stateFinality.block_hash;
    bundle.stateProof.data.block_hash = stateFinality.block_hash;
    bundle.stateRoot.data.witnessed_post_state_root = 'invalid';
    bundle.stateProof.data.witnessed_post_state_root = 'invalid';
    expect(stateEvidenceAgreement(bundle, stateFinality.height)).toBe(false);
  });

  it.each(['referenceBlock', 'stateRoot', 'stateProof'] as const)(
    'leaves agreement unknown when %s is unavailable', (part) => {
      const bundle = stateBundle();
      bundle[part] = { status: 'unavailable' };
      expect(stateEvidenceAgreement(bundle, stateFinality.height)).toBeNull();
    }
  );
});
