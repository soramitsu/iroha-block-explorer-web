import { describe, expect, it, vi } from 'vitest';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import type { Block, DetailedTransaction } from '@/shared/api/schemas';
import { resolveExactHashSearch, snapshotFromExactHashSearch } from './exact-hash-search';

const HASH = '0301b76be6d3dead32484180986523173082d770bc4fd954760d0a74a434624f';
const block = {
  hash: HASH,
  height: 12,
  created_at: new Date('2026-07-21T00:00:00Z'),
  prev_block_hash: null,
  transactions_hash: null,
  transactions_rejected: 0,
  transactions_total: 1,
} satisfies Block;
const transaction = {
  authority: 'alice@wonderland',
  hash: HASH,
  block: 12,
  created_at: new Date('2026-07-21T00:00:00Z'),
  executable: 'Instructions',
  status: 'Committed',
  rejection_reason: null,
  metadata: {},
  nonce: null,
  signature: 'signature',
  time_to_live: null,
} as unknown as DetailedTransaction;

function dependencies() {
  return {
    fetchBlock: vi.fn(),
    fetchTransaction: vi.fn(),
  };
}

describe('resolveExactHashSearch', () => {
  it('probes block and transaction concurrently with one normalized exact hash', async () => {
    const api = dependencies();
    let releaseBlock!: () => void;
    let releaseTransaction!: () => void;
    api.fetchBlock.mockReturnValue(new Promise(resolve => {
      releaseBlock = () => resolve({ status: SUCCESSFUL_FETCHING, data: block });
    }));
    api.fetchTransaction.mockReturnValue(new Promise(resolve => {
      releaseTransaction = () => resolve({ status: SUCCESSFUL_FETCHING, data: transaction });
    }));

    const pending = resolveExactHashSearch(`0x${HASH.toUpperCase()}`, api);
    expect(api.fetchBlock).toHaveBeenCalledWith(HASH);
    expect(api.fetchTransaction).toHaveBeenCalledWith(HASH);
    releaseBlock();
    releaseTransaction();

    await expect(pending).resolves.toEqual({
      query: HASH,
      block: { kind: 'match', value: block },
      transaction: { kind: 'match', value: transaction },
    });
  });

  it('preserves a valid partial match and the other probe failure', async () => {
    const api = dependencies();
    api.fetchBlock.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: block });
    api.fetchTransaction.mockRejectedValue(new TypeError('offline'));

    const result = await resolveExactHashSearch(HASH, api);
    expect(result.block).toEqual({ kind: 'match', value: block });
    expect(result.transaction).toEqual({
      kind: 'error',
      problem: { kind: 'network', message: 'offline' },
    });
    expect(snapshotFromExactHashSearch(result).status).toBe('ready');
  });

  it('distinguishes an authoritative miss from a failed search', async () => {
    const missingApi = dependencies();
    missingApi.fetchBlock.mockResolvedValue({ status: NOT_FOUND });
    missingApi.fetchTransaction.mockResolvedValue({ status: NOT_FOUND });
    const missing = await resolveExactHashSearch(HASH, missingApi);
    expect(snapshotFromExactHashSearch(missing)).toEqual({ status: 'not-found' });

    const failedApi = dependencies();
    failedApi.fetchBlock.mockResolvedValue({ status: NOT_FOUND });
    failedApi.fetchTransaction.mockResolvedValue({ status: UNKNOWN_ERROR, error: new Error('Torii failed') });
    const failed = await resolveExactHashSearch(HASH, failedApi);
    expect(snapshotFromExactHashSearch(failed)).toMatchObject({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'Torii failed' },
    });
  });

  it('rejects malformed input without issuing either request', async () => {
    const api = dependencies();
    await expect(resolveExactHashSearch('0xabc123', api)).rejects.toThrow(/64 hexadecimal/u);
    expect(api.fetchBlock).not.toHaveBeenCalled();
    expect(api.fetchTransaction).not.toHaveBeenCalled();
  });
});
