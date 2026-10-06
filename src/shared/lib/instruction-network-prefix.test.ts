import { describe, expect, it } from 'vitest';
import { buildDecodedInstructionPresentation, buildInstructionPresentation } from './instruction-presentation';

const encoded = btoa('encoded instruction bytes');
const proposal = {
  Propose: { account: 'multisig@fixture', instructions: [encoded], transaction_ttl_ms: null },
};
const explorerInstruction = {
  kind: 'Custom',
  box: {
    encoded: '0x01', framed_sha256: `0x${'00'.repeat(32)}`,
    json: { kind: 'Custom', payload: { variant: 'Custom', value: proposal } },
  },
};

describe('explicit instruction display network context', () => {
  it.each([0, 369, 65535])('preserves opaque nested instructions with explicit prefix %s', networkPrefix => {
    const result = buildInstructionPresentation(explorerInstruction, networkPrefix);
    expect(result?.nestedInstructions).toEqual([{ index: 0, encoded, presentation: null }]);
    expect(proposal.Propose.instructions).toEqual([encoded]);
  });

  it.each([undefined, null, '369', -1, 65536, 1.5])('rejects invalid network context %s', value => {
    const prefix = value as unknown as number;
    expect(() => buildInstructionPresentation(explorerInstruction, prefix)).toThrow('network prefix');
    expect(() => buildDecodedInstructionPresentation({ Custom: { payload: proposal } }, prefix)).toThrow('network prefix');
  });

  it.each([
    { Custom: proposal },
    { Custom: { payload: proposal, extra: true } },
    { Custom: { payload: { ...proposal, Cancel: {} } } },
  ])('rejects ambiguous Torii JSON Custom envelopes %j', decoded => {
    expect(buildDecodedInstructionPresentation(decoded, 369)).toBeNull();
  });

  it('presents already-decoded Torii JSON while leaving its nested bytes encoded', () => {
    const result = buildDecodedInstructionPresentation({ Custom: { payload: proposal } }, 369);
    expect(result?.registryKey).toBe('Custom:Propose');
    expect(result?.nestedInstructions).toEqual([{ index: 0, encoded, presentation: null }]);
  });
});
