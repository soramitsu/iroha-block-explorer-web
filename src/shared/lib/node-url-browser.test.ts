import { describe, expect, it } from 'vitest';
import { domainToASCII, fileURLToPath } from './node-url-browser';

describe('node-url-browser', () => {
  it('exposes the URL helpers needed by browser-bundled dependencies and tests', () => {
    expect(domainToASCII(' example.com ')).toBe('example.com');
    expect(fileURLToPath('file:///tmp/hello%20world.txt')).toBe('/tmp/hello world.txt');
    expect(fileURLToPath(new URL('file:///Users/test/project/index.test.ts'))).toBe(
      '/Users/test/project/index.test.ts'
    );
  });

  it('rejects non-file URLs for fileURLToPath', () => {
    expect(() => fileURLToPath('https://example.com/index.test.ts')).toThrow(/file URL/);
  });
});
