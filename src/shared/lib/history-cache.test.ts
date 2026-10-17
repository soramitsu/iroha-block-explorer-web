import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicHistoryCacheKey, historyCacheKey } from './history-cache';

import { activateExplorerReadSession, disconnectExplorerReadSession } from './explorer-read-auth';
afterEach(disconnectExplorerReadSession);

const networkId = `hash:${'AB'.repeat(32)}#B99E`;
const otherNetwork = `hash:${'11'.repeat(32)}#4667`;

describe('ledger-bound history cache identity', () => {
  it('separates endpoints and never reuses an unscoped predecessor key', () => {
    const key = historyCacheKey('transactions', networkId, 'https://taira.sora.org');
    expect(key).not.toBe('transactions_table_cache_v2');
    expect(key).not.toBe(historyCacheKey('transactions', networkId, 'https://another.example'));
    expect(historyCacheKey('transactions', otherNetwork, 'https://taira.sora.org')).not.toBeNull();
    expect(key).not.toBe(historyCacheKey('transactions', otherNetwork, 'https://taira.sora.org'));
    expect(key).toContain(encodeURIComponent(networkId));
  });

  it('rejects absent or retired network identities without a generic cache', () => {
    for (const identity of [undefined, '', 'ab'.repeat(32), otherNetwork.replace(/4667$/, '0000')]) {
      expect(historyCacheKey('transactions', identity, 'https://taira.sora.org')).toBeNull();
    }
  });

  it('does not create a cache for invalid or credential-bearing endpoints', () => {
    for (const endpoint of ['invalid', 'file:///tmp/history', 'https://user:password@taira.sora.org']) {
      expect(historyCacheKey('transactions', networkId, endpoint)).toBeNull();
    }
  });
});

describe('anonymous history persistence', () => {
  it('revokes old cache access on authentication and does not revive it on logout', () => {
    const beforeLogin = createPublicHistoryCacheKey('transactions', networkId, 'https://taira.sora.org');
    expect(beforeLogin()).not.toBeNull();
    activateExplorerReadSession({ baseUrl: 'https://taira.sora.org', networkId,
      auth: { authAccountId: 'reader@bank', sign: async () => new Uint8Array(64) }, close: vi.fn() });
    const duringLogin = createPublicHistoryCacheKey('transactions', networkId, 'https://taira.sora.org');
    expect(beforeLogin()).toBeNull();
    expect(duringLogin()).toBeNull();
    disconnectExplorerReadSession();
    expect(beforeLogin()).toBeNull();
    expect(duringLogin()).toBeNull();
    expect(createPublicHistoryCacheKey('transactions', networkId, 'https://taira.sora.org')()).not.toBeNull();
  });
});
