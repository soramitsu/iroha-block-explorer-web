import { describe, expect, it } from 'vitest';
import { appendSearchParams } from './query';

describe('appendSearchParams', () => {
  it('preserves falsey-but-meaningful values while skipping empty ones', () => {
    const url = new URL('https://explorer.test/transactions');

    appendSearchParams(url, {
      page: 0,
      exact: false,
      include_failed: true,
      empty: '',
      blank: '   ',
      none: null,
      missing: undefined,
    });

    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.get('exact')).toBe('false');
    expect(url.searchParams.get('include_failed')).toBe('true');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(url.searchParams.has('blank')).toBe(false);
    expect(url.searchParams.has('none')).toBe(false);
    expect(url.searchParams.has('missing')).toBe(false);
  });

  it('overwrites existing keys with stringified values', () => {
    const url = new URL('https://explorer.test/accounts?scope=global');

    appendSearchParams(url, {
      scope: 'node',
      account_id: ' alice@wonderland ',
      limit: 25,
    });

    expect(url.searchParams.get('scope')).toBe('node');
    expect(url.searchParams.get('account_id')).toBe(' alice@wonderland ');
    expect(url.searchParams.get('limit')).toBe('25');
  });
});
