import { describe, expect, it } from 'vitest';
import { isCanonicalIrohaHashLiteral32, normalizeIrohaHash32, requireIrohaHash32 } from './iroha-hash';

describe('isCanonicalIrohaHashLiteral32', () => {
  const body = 'AB'.repeat(32);
  const literal = `hash:${body}#B99E`;

  it('accepts an exact checksum-valid marked literal without changing its spelling', () => {
    expect(isCanonicalIrohaHashLiteral32(literal)).toBe(true);
    expect(literal).toBe(`hash:${body}#B99E`);
  });

  it.each([
    ['raw lowercase hex', body.toLowerCase()],
    ['raw uppercase hex', body],
    ['lowercase body', `hash:${body.toLowerCase()}#B99E`],
    ['lowercase checksum', `hash:${body}#b99E`],
    ['wrong checksum', `hash:${body}#0000`],
    ['unmarked body', `hash:${'10'.repeat(32)}#2B24`],
    ['surrounding whitespace', ` ${literal}`],
  ])('rejects %s', (_label, value) => {
    expect(isCanonicalIrohaHashLiteral32(value)).toBe(false);
  });
});

describe('normalizeIrohaHash32', () => {
  it('normalizes every supported 32-byte Iroha hash representation', () => {
    const hex = '11'.repeat(32);

    expect(normalizeIrohaHash32(hex.toUpperCase())).toBe(hex);
    expect(normalizeIrohaHash32(`0X${hex.toUpperCase()}`)).toBe(hex);
    expect(normalizeIrohaHash32(`hash:${hex.toUpperCase()}#4667`)).toBe(hex);
  });

  it('rejects malformed, checksum-invalid, and unmarked hashes', () => {
    expect(normalizeIrohaHash32('11'.repeat(31))).toBeNull();
    expect(normalizeIrohaHash32(`hash:${'11'.repeat(32)}#0000`)).toBeNull();
    expect(normalizeIrohaHash32('10'.repeat(32))).toBeNull();
    expect(normalizeIrohaHash32(null)).toBeNull();
  });
});


describe('requireIrohaHash32', () => {
  it('accepts the checksum-bound real Taira canary and returns Torii raw hex', () => {
    expect(requireIrohaHash32('hash:66BF60AB1C762607F02BBDFC834E2D832243EF413D0C24BBFF8EE3D00A2830DB#DB6C'))
      .toBe('66bf60ab1c762607f02bbdfc834e2d832243ef413d0c24bbff8ee3d00a2830db');
  });
  it.each([null, 'hash:' + 'AB'.repeat(32) + '#0000', '10'.repeat(32)])('rejects invalid selector %s', (value) => {
    expect(() => requireIrohaHash32(value)).toThrow(TypeError);
  });
});
