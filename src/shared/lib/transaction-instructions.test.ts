import { describe, expect, it, vi } from 'vitest';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Instruction } from '@/shared/api/schemas';
import { fetchAllTransactionInstructions } from './transaction-instructions';

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function makeInstruction(index: number): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'Register',
    index,
    transaction_hash: '0xtest',
    transaction_status: 'Committed',
    block: 1,
    box: {
      encoded: `0x${index.toString(16).padStart(2, '0')}`,
      json: {
        kind: 'Register',
        payload: {},
      },
    },
  };
}

describe('fetchAllTransactionInstructions', () => {
  it('loads every page for a transaction and returns a unique index-sorted list', async () => {
    const fetchInstructions = vi.fn().mockImplementation(async ({ page = 1 }) => ({
      status: SUCCESSFUL_FETCHING,
      data: page === 1
        ? {
            pagination: { page: 1, per_page: 2, total_pages: 2, total_items: 3 },
            items: [makeInstruction(1), makeInstruction(0)],
          }
        : {
            pagination: { page: 2, per_page: 2, total_pages: 2, total_items: 3 },
            items: [makeInstruction(1), makeInstruction(2)],
          },
    }));

    const instructions = await fetchAllTransactionInstructions({
      transactionHash: '0xtest',
      fetchInstructions,
      perPage: 2,
    });

    expect(fetchInstructions).toHaveBeenNthCalledWith(1, {
      page: 1,
      per_page: 2,
      transaction_hash: '0xtest',
    });
    expect(fetchInstructions).toHaveBeenNthCalledWith(2, {
      page: 2,
      per_page: 2,
      transaction_hash: '0xtest',
    });
    expect(instructions.map((instruction) => instruction.index)).toEqual([0, 1, 2]);
  });

  it('throws when an instruction-history page fails so the caller can fall back', async () => {
    const fetchInstructions = vi.fn()
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
          pagination: { page: 1, per_page: 1, total_pages: 2, total_items: 2 },
          items: [makeInstruction(0)],
        },
      })
      .mockResolvedValueOnce({
        status: 'unknown-error',
      });

    await expect(fetchAllTransactionInstructions({
      transactionHash: '0xtest',
      fetchInstructions,
      perPage: 1,
    })).rejects.toThrow('Failed to fetch transaction instructions page 2');
  });
});
