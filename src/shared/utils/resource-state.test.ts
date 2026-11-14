import { describe, expect, it } from 'vitest';

import { apiProblemFromError, resourceResultProblem, resourceResultStatus } from './resource-state';

describe('apiProblemFromError', () => {
  it('classifies HTTP, timeout, network, and invalid-response errors', () => {
    expect(apiProblemFromError(Object.assign(new Error('denied'), { status: 403 }))).toEqual({
      kind: 'http',
      status: 403,
      message: 'denied',
    });
    expect(apiProblemFromError(new DOMException('late', 'AbortError'))).toEqual({
      kind: 'timeout',
      message: 'late',
    });
    expect(apiProblemFromError(new TypeError('offline'))).toEqual({ kind: 'network', message: 'offline' });
    expect(apiProblemFromError(new Error('schema'))).toEqual({
      kind: 'invalid-response',
      message: 'schema',
    });
  });
});

describe('resource result helpers', () => {
  it('distinguishes successful, missing, failed, and raw values', () => {
    expect(resourceResultStatus({ status: 'ok', data: [] })).toBe('ready');
    expect(resourceResultStatus({ status: 'not-found' })).toBe('not-found');
    expect(resourceResultStatus({ status: 'unknown-error', error: new Error('bad') })).toBe('error');
    expect(resourceResultStatus(['raw'])).toBe('ready');
  });

  it('extracts the structured problem from a failed result', () => {
    expect(resourceResultProblem({ status: 'unknown-error', error: new TypeError('offline') })).toEqual({
      kind: 'network',
      message: 'offline',
    });
    expect(resourceResultProblem({ status: 'unknown-error' })).toEqual({
      kind: 'invalid-response',
      message: '',
    });
  });
});
