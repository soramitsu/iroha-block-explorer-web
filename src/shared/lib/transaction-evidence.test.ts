import { describe, expect, it } from 'vitest';
import { transactionProofAgreement } from './transaction-evidence';

const hash = '11'.repeat(32);
const networkId = 'configured-network';
const proof = {
  network_id: networkId, block_height: '42', block_header: { height: '42' },
  transaction: { entrypoint_hash: hash },
};
const request = { transactionHash: hash, blockHeight: 42, networkId };

describe('transaction proof identity agreement', () => {
  it('compares all three identities without treating them as verified finality', () => {
    expect(transactionProofAgreement(proof, request)).toEqual({
      transactionMatches: true, networkMatches: true, heightMatches: true, matches: true,
    });
    expect(transactionProofAgreement({ ...proof, transaction: { entrypoint_hash: `0X${hash}` } }, request).matches).toBe(true);
  });

  it.each([
    ['transaction', { ...proof, transaction: { entrypoint_hash: '55'.repeat(32) } }],
    ['invalid hash', { ...proof, transaction: { entrypoint_hash: 'invalid' } }],
    ['network', { ...proof, network_id: 'another-network' }],
    ['height', { ...proof, block_height: '43' }],
    ['header height', { ...proof, block_header: { height: '43' } }],
    ['noncanonical height', { ...proof, block_height: '042', block_header: { height: '042' } }],
  ])('rejects mismatched %s', (_label, invalid) => {
    expect(transactionProofAgreement(invalid, request).matches).toBe(false);
  });

  it('does not bind evidence without a configured network or safe positive requested height', () => {
    expect(transactionProofAgreement(proof, { ...request, networkId: undefined }).matches).toBe(false);
    for (const blockHeight of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(transactionProofAgreement(proof, { ...request, blockHeight }).matches).toBe(false);
    }
  });
});
