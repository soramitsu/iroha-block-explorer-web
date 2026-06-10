import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractCodeView, Instruction } from '@/shared/api/schemas';
import {
  computeContractCodeViewInBackground,
  resetContractCodeViewWorkerClientForTests,
} from './contract-view-worker-client';

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function encodeWord(word: number): number[] {
  return [
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ];
}

function encodeRi(opcode: number, rd: number, rs1: number, imm: number): number {
  return (((opcode & 0xff) << 24) | ((rd & 0xff) << 16) | ((rs1 & 0xff) << 8) | (imm & 0xff)) >>> 0;
}

function makeContractBytes(): Uint8Array {
  return Uint8Array.from([
    0x49, 0x56, 0x4d, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x10, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x01,
    ...encodeWord(encodeRi(0x20, 1, 0, 5)),
    ...encodeWord(encodeRi(0x30, 2, 1, 0)),
    ...encodeWord((((0x60 & 0xff) << 24) | 0xa0) >>> 0),
    ...encodeWord(0x49000000),
  ]);
}

function makeInstruction(): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'RegisterSmartContractBytes',
    index: 0,
    transaction_hash: '0xworker',
    transaction_status: 'Rejected',
    block: 77,
    box: {
      encoded: '0xworker',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {
          code_hash: 'aa'.repeat(32),
          code: encodeBase64(makeContractBytes()),
        },
      },
    },
  };
}

const workerView: ContractCodeView = {
  code_hash: 'cc'.repeat(32),
  declared_code_hash: null,
  abi_hash: null,
  compiler_fingerprint: null,
  byte_len: 0,
  permissions: [],
  access_hints: null,
  entrypoints: [],
  analysis: null,
  warnings: [],
  rendered_source_kind: 'pseudo_source',
  rendered_source_text: 'worker result',
  verified_source_ref: null,
};

afterEach(() => {
  resetContractCodeViewWorkerClientForTests();
  vi.unstubAllGlobals();
});

describe('computeContractCodeViewInBackground', () => {
  it('falls back to synchronous local rendering when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);

    const view = await computeContractCodeViewInBackground({
      instruction: makeInstruction(),
      relatedInstructions: [],
    });

    expect(view?.rendered_source_text).toContain('addi r1, r0, +5');
    expect(view?.rendered_source_text).toContain('scall 0xa0 ; SMARTCONTRACT_EXECUTE_INSTRUCTION');
  });

  it('uses the background worker result when Worker is available', async () => {
    class MockWorker {
      onmessage: ((event: MessageEvent<{ id: number } & ({ ok: true, view: ContractCodeView | null } | { ok: false, error: string })>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      postMessage(request: { id: number }) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              view: workerView,
            },
          } as MessageEvent<any>);
        });
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', MockWorker);

    const view = await computeContractCodeViewInBackground({
      instruction: makeInstruction(),
      relatedInstructions: [],
    });

    expect(view).toEqual(workerView);
  });

  it('falls back to synchronous rendering when the worker errors', async () => {
    class MockWorker {
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      postMessage() {
        queueMicrotask(() => {
          this.onerror?.(new Event('error'));
        });
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', MockWorker);

    const view = await computeContractCodeViewInBackground({
      instruction: makeInstruction(),
      relatedInstructions: [],
    });

    expect(view?.rendered_source_text).toContain('addi r1, r0, +5');
    expect(view?.rendered_source_text).not.toContain('worker result');
  });
});
