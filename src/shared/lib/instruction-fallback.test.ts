import { describe, expect, it, vi } from 'vitest';
import type { Instruction } from '@/shared/api/schemas';
import { collectInstructionFallback, type FetchInstructionDetail } from './instruction-fallback';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function makeInstruction(index: number): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    kind: 'Register',
    index,
    box: {
      encoded: `0x${index.toString(16)}`,
      json: {
        kind: 'Register',
        payload: {
          object: {
            id: `domain-${index}`,
          },
        },
      },
    },
    transaction_hash: '0xabc',
    transaction_status: 'Committed',
    block: 42,
  };
}

describe('collectInstructionFallback', () => {
  it('collects contiguous instruction details and stops at first not-found gap', async () => {
    const fetchInstructionDetail = vi.fn<FetchInstructionDetail>(async (_hash: string, index: number) => {
      if (index === 0 || index === 1) {
        return { status: 'ok', data: makeInstruction(index) };
      }
      return { status: 'not-found' };
    });

    const result = await collectInstructionFallback({
      transactionHash: '0xabc',
      fetchInstructionDetail,
      maxProbe: 16,
    });

    expect(result.map((instruction) => instruction.index)).toEqual([0, 1]);
    expect(fetchInstructionDetail).toHaveBeenCalledTimes(3);
    expect(fetchInstructionDetail).toHaveBeenNthCalledWith(1, '0xabc', 0);
    expect(fetchInstructionDetail).toHaveBeenNthCalledWith(2, '0xabc', 1);
    expect(fetchInstructionDetail).toHaveBeenNthCalledWith(3, '0xabc', 2);
  });

  it('probes priority index when the first sequential entry is missing', async () => {
    const fetchInstructionDetail = vi.fn<FetchInstructionDetail>(async (_hash: string, index: number) => {
      if (index === 2) {
        return { status: 'ok', data: makeInstruction(index) };
      }
      return { status: 'not-found' };
    });

    const result = await collectInstructionFallback({
      transactionHash: '0xabc',
      fetchInstructionDetail,
      priorityIndex: 2,
      maxProbe: 8,
    });

    expect(result.map((instruction) => instruction.index)).toEqual([2]);
    expect(fetchInstructionDetail).toHaveBeenCalledWith('0xabc', 0);
    expect(fetchInstructionDetail).toHaveBeenCalledWith('0xabc', 1);
    expect(fetchInstructionDetail).toHaveBeenCalledWith('0xabc', 2);
  });

  it('does not re-fetch an already collected priority index', async () => {
    const fetchInstructionDetail = vi.fn<FetchInstructionDetail>(async (_hash: string, index: number) => {
      if (index === 0 || index === 1) {
        return { status: 'ok', data: makeInstruction(index) };
      }
      return { status: 'not-found' };
    });

    const result = await collectInstructionFallback({
      transactionHash: '0xabc',
      fetchInstructionDetail,
      priorityIndex: 1,
      maxProbe: 8,
    });

    expect(result.map((instruction) => instruction.index)).toEqual([0, 1]);
    expect(fetchInstructionDetail).toHaveBeenCalledTimes(3);
  });

  it('returns empty set when the first probe fails with unknown error', async () => {
    const fetchInstructionDetail = vi.fn<FetchInstructionDetail>(
      async () => ({ status: 'unknown-error' })
    );

    const result = await collectInstructionFallback({
      transactionHash: '0xabc',
      fetchInstructionDetail,
    });

    expect(result).toEqual([]);
    expect(fetchInstructionDetail).toHaveBeenCalledTimes(1);
  });
});
