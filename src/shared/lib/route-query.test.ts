import { describe, expect, it } from 'vitest';

import {
  firstRouteQueryValue,
  mergeRouteQuery,
  parseCanonicalRoutePositiveInteger,
  parseRouteEnum,
  routeQueriesEqual,
} from './route-query';

describe('route query parsing', () => {
  it('reads the first string from a general-purpose route value', () => {
    expect(firstRouteQueryValue(['20', '50'])).toBe('20');
  });

  it('distinguishes a missing canonical positive integer from explicit invalid state', () => {
    const allowed = new Set([10, 20, 50, 100]);
    expect(parseCanonicalRoutePositiveInteger(undefined, 10, allowed)).toEqual({
      ok: true,
      value: 10,
      explicit: false,
    });
    expect(parseCanonicalRoutePositiveInteger('20', 10, allowed)).toEqual({
      ok: true,
      value: 20,
      explicit: true,
    });
    for (const invalid of [null, '', '0', '+1', '01', '1.0', '9007199254740992', '30', ['20'], ['20', '50']]) {
      expect(parseCanonicalRoutePositiveInteger(invalid, 10, allowed)).toEqual({ ok: false });
    }
  });

  it('accepts only exact enum values', () => {
    const allowed = new Set(['all', 'committed'] as const);
    expect(parseRouteEnum('committed', allowed, 'all')).toBe('committed');
    expect(parseRouteEnum('Committed', allowed, 'all')).toBe('all');
  });
});

describe('mergeRouteQuery', () => {
  it('preserves unrelated and Explorer-scope values while applying a patch', () => {
    expect(
      mergeRouteQuery(
        { torii: 'https://node', dataspaceId: '2', page: '4', unrelated: 'keep' },
        { page: 2, status: 'Committed' }
      )
    ).toEqual({
      torii: 'https://node',
      dataspaceId: '2',
      page: '2',
      status: 'Committed',
      unrelated: 'keep',
    });
  });

  it('omits empty and default values atomically', () => {
    expect(
      mergeRouteQuery(
        { page: '8', per_page: '20', status: 'Rejected' },
        { page: 1, per_page: 10, status: null },
        { page: 1, per_page: 10 }
      )
    ).toEqual({});
  });
});

describe('routeQueriesEqual', () => {
  it('compares key/value content independently of key order', () => {
    expect(routeQueriesEqual({ page: '2', status: 'ok' }, { status: 'ok', page: '2' })).toBe(true);
    expect(routeQueriesEqual({ page: '2' }, { page: '3' })).toBe(false);
  });
});
