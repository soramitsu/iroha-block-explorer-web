import { describe, expect, it, vi } from 'vitest';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import type { Instruction } from '@/shared/api/schemas';
import { fetchAllTransactionInstructions } from './transaction-instructions';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const FRAMED_SHA256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const TRANSACTION_HASH = 'a'.repeat(64);

function makeInstruction(index: number): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'Register',
    index,
    transaction_hash: TRANSACTION_HASH,
    transaction_status: 'Committed',
    block: 1,
    box: {
      encoded: `0x${index.toString(16).padStart(2, '0')}`,
      framed_sha256: FRAMED_SHA256,
      json: {
        kind: 'Register',
        payload: { variant: 'Domain', value: {} },
        wire_id: 'iroha_data_model::isi::Register',
        encoded: index.toString(16).padStart(2, '0'),
      },
    },
  };
}

describe('fetchAllTransactionInstructions', () => {
  it('follows every opaque cursor and returns a unique index-sorted list', async () => {
    const fetchInstructions = vi.fn().mockImplementation(async ({ cursor = null }) => ({
      status: SUCCESSFUL_FETCHING,
      data:
        cursor === null
          ? {
              pagination: { next_cursor: 'opaque-next', has_more: true },
              items: [makeInstruction(1), makeInstruction(0)],
            }
          : {
              pagination: { next_cursor: null, has_more: false },
              items: [makeInstruction(1), makeInstruction(2)],
            },
    }));

    const instructions = await fetchAllTransactionInstructions({
      transactionHash: TRANSACTION_HASH,
      fetchInstructions,
      limit: 2,
    });

    expect(fetchInstructions).toHaveBeenNthCalledWith(1, {
      cursor: null,
      limit: 2,
      transaction_hash: TRANSACTION_HASH,
    });
    expect(fetchInstructions).toHaveBeenNthCalledWith(2, {
      cursor: 'opaque-next',
      limit: 2,
      transaction_hash: TRANSACTION_HASH,
    });
    expect(instructions.map((instruction) => instruction.index)).toEqual([0, 1, 2]);
  });

  it('throws when an instruction-history cursor page fails', async () => {
    const fetchInstructions = vi
      .fn()
      .mockResolvedValueOnce({
        status: SUCCESSFUL_FETCHING,
        data: {
          pagination: { next_cursor: 'next', has_more: true },
          items: [makeInstruction(0)],
        },
      })
      .mockResolvedValueOnce({
        status: 'unknown-error',
      });

    await expect(
      fetchAllTransactionInstructions({
        transactionHash: TRANSACTION_HASH,
        fetchInstructions,
        limit: 1,
      })
    ).rejects.toThrow('Failed to fetch transaction instructions cursor page 2');
  });

  it('rejects repeated continuation cursors instead of looping forever', async () => {
    const fetchInstructions = vi.fn().mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { next_cursor: 'repeated', has_more: true },
        items: [makeInstruction(0)],
      },
    });

    await expect(
      fetchAllTransactionInstructions({
        transactionHash: TRANSACTION_HASH,
        fetchInstructions,
        limit: 1,
      })
    ).rejects.toThrow('repeated continuation cursor');
    expect(fetchInstructions).toHaveBeenCalledTimes(2);
  });

  it('fails closed at the configured cursor-page safety limit', async () => {
    let cursorNumber = 0;
    const fetchInstructions = vi.fn().mockImplementation(async () => ({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { next_cursor: `cursor-${++cursorNumber}`, has_more: true },
        items: [makeInstruction(cursorNumber)],
      },
    }));

    await expect(
      fetchAllTransactionInstructions({
        transactionHash: TRANSACTION_HASH,
        fetchInstructions,
        maxPages: 2,
      })
    ).rejects.toThrow('exceeded the 2-page safety limit');
    expect(fetchInstructions).toHaveBeenCalledTimes(2);
  });

  it("uses Torii's canonical 100-row history ceiling by default", async () => {
    const fetchInstructions = vi.fn().mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        pagination: { next_cursor: null, has_more: false },
        items: [],
      },
    });

    await fetchAllTransactionInstructions({
      transactionHash: TRANSACTION_HASH,
      fetchInstructions,
    });

    expect(fetchInstructions).toHaveBeenCalledWith({
      cursor: null,
      limit: 100,
      transaction_hash: TRANSACTION_HASH,
    });
  });

  it("rejects an instruction page size above Torii's hard ceiling before fetching", async () => {
    const fetchInstructions = vi.fn();

    await expect(
      fetchAllTransactionInstructions({
        transactionHash: TRANSACTION_HASH,
        fetchInstructions,
        limit: 101,
      })
    ).rejects.toThrow('Instruction page limit must be an integer from 1 through 100');
    expect(fetchInstructions).not.toHaveBeenCalled();
  });
});
