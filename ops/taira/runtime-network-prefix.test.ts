import { describe, expect, it } from 'vitest';
import { validateTairaRuntimeConfig } from './release-tool.mjs';

const config = {
  toriiBaseUrl: 'https://taira.sora.org',
  toriiForceBaseUrl: true,
  networkId: `hash:${'AB'.repeat(32)}#B99E`,
  networkPrefix: 369,
};

describe('Taira release network prefix', () => {
  it('accepts the exact selected four-field profile', () => {
    expect(validateTairaRuntimeConfig(config)).toEqual(config);
  });

  it.each([undefined, null, 0, 1, 65535, -1, 65536, 1.5, '369'])('rejects prefix %s', networkPrefix => {
    expect(() => validateTairaRuntimeConfig({ ...config, networkPrefix })).toThrow('networkPrefix must be 369');
  });
});
