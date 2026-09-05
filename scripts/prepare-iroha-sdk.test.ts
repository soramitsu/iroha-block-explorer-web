// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { prepareIrohaSdk } from './prepare-iroha-sdk.mjs';

describe('prepareIrohaSdk', () => {
  it('awaits a successful injected distribution build', async () => {
    const build = vi.fn().mockResolvedValue(undefined);

    await expect(prepareIrohaSdk({ build })).resolves.toBeUndefined();

    expect(build).toHaveBeenCalledTimes(1);
  });

  it('propagates distribution build failures unchanged', async () => {
    const failure = new Error('distribution build failed');
    const build = vi.fn().mockRejectedValue(failure);

    await expect(prepareIrohaSdk({ build })).rejects.toBe(failure);
  });

  it('supports repeat execution without retaining state', async () => {
    const build = vi.fn().mockResolvedValue(undefined);

    await prepareIrohaSdk({ build });
    await prepareIrohaSdk({ build });

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid injected builder before doing work', async () => {
    await expect(prepareIrohaSdk({ build: null as never })).rejects.toThrow(TypeError);
  });
});
