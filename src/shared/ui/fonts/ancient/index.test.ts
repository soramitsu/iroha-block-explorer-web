// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { loadAncientFontForLocale, type AncientFontLocale } from './index';

function fixture() {
  const akk = vi.fn(async () => undefined);
  const egy = vi.fn(async () => undefined);
  return {
    loaded: new Set<AncientFontLocale>(),
    loaders: { akk, egy },
    akk,
    egy,
  };
}

describe('loadAncientFontForLocale', () => {
  it('does not load an ancient font for an unrelated locale', async () => {
    const state = fixture();

    await expect(loadAncientFontForLocale('en', state)).resolves.toBe(false);
    expect(state.akk).not.toHaveBeenCalled();
    expect(state.egy).not.toHaveBeenCalled();
  });

  it.each(['akk', 'egy'] as const)('loads only the active %s font and caches it', async (locale) => {
    const state = fixture();

    await expect(loadAncientFontForLocale(locale, state)).resolves.toBe(true);
    await expect(loadAncientFontForLocale(locale, state)).resolves.toBe(true);

    expect(state.loaders[locale]).toHaveBeenCalledTimes(1);
    expect(state.loaders[locale === 'akk' ? 'egy' : 'akk']).not.toHaveBeenCalled();
  });

  it('does not cache a failed load, allowing the next activation to retry', async () => {
    const state = fixture();
    state.akk.mockRejectedValueOnce(new Error('font chunk unavailable'));

    await expect(loadAncientFontForLocale('akk', state)).rejects.toThrow('font chunk unavailable');
    await expect(loadAncientFontForLocale('akk', state)).resolves.toBe(true);
    expect(state.akk).toHaveBeenCalledTimes(2);
  });
});
