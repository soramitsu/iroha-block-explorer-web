import { describe, expect, it } from 'vitest';
import { extractActivateContractInstancePayload, extractSmartContractDeployment } from './smart-contracts';
import type { Instruction } from '@/shared/api/schemas';

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

function makeInstruction(overrides: Partial<Instruction> = {}): Instruction {
  return {
    authority: SAMPLE_I105,
    created_at: new Date('2026-04-04T00:00:00Z'),
    kind: 'ActivateContractInstance',
    index: 2,
    transaction_hash: '0xdeploy',
    transaction_status: 'Committed',
    block: 88,
    box: {
      encoded: '0x01',
      json: {
        kind: 'ActivateContractInstance',
        payload: {
          contract_address: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
          contract_alias: 'reward-garden::universal',
          dataspace: 'universal',
          code_hash: 'aa'.repeat(32),
        },
      },
    },
    ...overrides,
  };
}

describe('extractActivateContractInstancePayload', () => {
  it('reads address-first activation payloads', () => {
    const instruction = makeInstruction();

    expect(extractActivateContractInstancePayload(instruction)).toEqual({
      codeHash: 'aa'.repeat(32),
      contractAddress: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
      contractAlias: 'reward-garden::universal',
      dataspace: 'universal',
      namespace: null,
      contractId: null,
    });
  });

  it('reads nested Norito variant payloads and keeps legacy fields for historical instructions', () => {
    const instruction = makeInstruction({
      kind: 'Custom',
      box: {
        encoded: '0x02',
        json: {
          kind: 'Custom',
          payload: {
            variant: 'ActivateContractInstance',
            value: {
              contract_address: 'sorac1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5fcj4z3',
              namespace: 'apps',
              contract_id: 'reward-garden',
              code_hash: 'bb'.repeat(32),
            },
          },
          wire_id: 'iroha_data_model::isi::smart_contract_code::ActivateContractInstance',
        },
      },
    });

    expect(extractActivateContractInstancePayload(instruction)).toEqual({
      codeHash: 'bb'.repeat(32),
      contractAddress: 'sorac1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5fcj4z3',
      contractAlias: null,
      dataspace: null,
      namespace: 'apps',
      contractId: 'reward-garden',
    });
  });
});

describe('extractSmartContractDeployment', () => {
  it('maps activation instructions into deployment rows', () => {
    const instruction = makeInstruction();
    const deployment = extractSmartContractDeployment(instruction);

    expect(deployment).toEqual({
      contractAddress: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
      contractAlias: 'reward-garden::universal',
      dataspace: 'universal',
      codeHash: 'aa'.repeat(32),
      authority: SAMPLE_I105,
      transactionHash: '0xdeploy',
      index: 2,
      block: 88,
      createdAt: new Date('2026-04-04T00:00:00Z'),
    });
  });

  it('returns null when the activation payload has no canonical contract address', () => {
    const instruction = makeInstruction({
      box: {
        encoded: '0x03',
        json: {
          kind: 'ActivateContractInstance',
          payload: {
            namespace: 'apps',
            contract_id: 'legacy',
            code_hash: 'cc'.repeat(32),
          },
        },
      },
    });

    expect(extractSmartContractDeployment(instruction)).toBeNull();
  });
});
