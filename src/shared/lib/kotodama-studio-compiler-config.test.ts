import { describe, expect, it } from 'vitest';
import { resolveKotodamaCompilerUrl } from './kotodama-studio-compiler-config';

describe('resolveKotodamaCompilerUrl', () => {
  it('uses the explicit runtime URL before the build-time URL', () => {
    expect(resolveKotodamaCompilerUrl(
      ' https://runtime-compiler.example/base ',
      'https://build-compiler.example'
    )).toBe('https://runtime-compiler.example/base');
  });

  it('uses an explicit build-time URL when runtime config is absent', () => {
    expect(resolveKotodamaCompilerUrl(undefined, ' https://build-compiler.example '))
      .toBe('https://build-compiler.example');
  });

  it('does not infer a Torii or same-origin compiler URL', () => {
    expect(resolveKotodamaCompilerUrl(undefined, undefined)).toBeNull();
    expect(resolveKotodamaCompilerUrl('   ', '')).toBeNull();
  });
});
