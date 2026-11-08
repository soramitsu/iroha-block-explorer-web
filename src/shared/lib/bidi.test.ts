import { describe, expect, it } from 'vitest';
import { isolateText } from './bidi';

describe('isolateText', () => {
  it('wraps a value in a first-strong isolate', () => {
    expect(isolateText('2.4 s')).toBe('⁨2.4 s⁩');
    expect(isolateText('שנ׳ 2.4')).toBe('⁨שנ׳ 2.4⁩');
  });

  it('adds no marks to an empty value', () => {
    expect(isolateText('')).toBe('');
  });
});
