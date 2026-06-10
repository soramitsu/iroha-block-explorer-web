import { describe, expect, it } from 'vitest';
import {
  buildMultisigCustomDisplayPayload,
  readMultisigCustomEnvelope,
} from './multisig-custom';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

describe('readMultisigCustomEnvelope', () => {
  it('reads direct multisig custom payload shape', () => {
    const payload = {
      Register: {
        account: SAMPLE_I105,
        instructions: ['aXJvaGEucmVnaXN0ZXI='],
        transaction_ttl_ms: 60_000,
      },
    };

    expect(readMultisigCustomEnvelope(payload)).toEqual({
      variant: 'Register',
      account: SAMPLE_I105,
      instructions: ['aXJvaGEucmVnaXN0ZXI='],
      transaction_ttl_ms: 60_000,
    });
  });

  it('reads nested production-style multisig payload shape', () => {
    const payload = {
      variant: 'Custom',
      value: {
        Propose: {
          account: SAMPLE_I105_ALT,
          instructions: ['aXJvaGEudHJhbnNmZXI='],
          transaction_ttl_ms: null,
        },
      },
    };

    expect(readMultisigCustomEnvelope(payload)).toEqual({
      variant: 'Propose',
      account: SAMPLE_I105_ALT,
      instructions: ['aXJvaGEudHJhbnNmZXI='],
      transaction_ttl_ms: null,
    });
  });

  it('returns null for non-multisig custom payload shape', () => {
    const payload = {
      extension: {
        account: SAMPLE_I105,
      },
    };

    expect(readMultisigCustomEnvelope(payload)).toBeNull();
  });
});

describe('buildMultisigCustomDisplayPayload', () => {
  it('builds readable summary including decoded nested instruction metadata', () => {
    const payload = {
      value: {
        Propose: {
          account: SAMPLE_I105,
          instructions: ['aXJvaGEucmVnaXN0ZXI='],
          transaction_ttl_ms: 120_000,
        },
      },
      variant: 'Custom',
    };

    const result = buildMultisigCustomDisplayPayload(payload);

    expect(result).not.toBeNull();
    expect(result?.multisig.variant).toBe('Propose');
    expect(result?.multisig.instructions_count).toBe(1);
    expect(result?.multisig.decoded_instructions[0]?.kind).toBe('Register');
    expect(result?.multisig.decoded_instructions[0]?.wire_id).toBe('iroha.register');
    expect(result?.raw_payload).toEqual(payload);
  });

  it('keeps decoded metadata null when nested payload bytes are not decodable', () => {
    const payload = {
      Approve: {
        account: SAMPLE_I105,
        instructions: ['%%%'],
      },
    };

    const result = buildMultisigCustomDisplayPayload(payload);

    expect(result?.multisig.decoded_instructions[0]).toEqual({
      index: 0,
      kind: null,
      wire_id: null,
      preview: null,
    });
  });
});
