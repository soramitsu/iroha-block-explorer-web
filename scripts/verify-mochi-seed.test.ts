import { describe, expect, it, vi } from 'vitest';
import {
  localToriiBaseUrl,
  mochiSessionPath,
  verifyExplorerMochiSeed,
} from './verify-mochi-seed.mjs';

const profile = {
  chain_id: 'iroha-explorer-e2e-v1',
  seed: {
    domain_id: 'wonderland.universal',
    minimum_head_height: 2,
    minimum_transactions: 1,
  },
};
const session = {
  ready: true,
  mcp_ready: true,
  chain_id: profile.chain_id,
  torii_url: 'http://127.0.0.1:8080',
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hasHeader(headers: Record<string, string>, expectedName: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === expectedName);
}

describe('Mochi Explorer seed verification', () => {
  it('accepts only loopback Torii URLs and strips non-authoritative URL state', () => {
    expect(localToriiBaseUrl('http://localhost:8080/base/?probe=1#x').toString()).toBe(
      'http://localhost:8080/base'
    );
    expect(() => localToriiBaseUrl('https://taira.sora.org')).toThrow(/non-local/);
    expect(() => localToriiBaseUrl('file:///tmp/torii')).toThrow(/non-local/);
  });

  it('resolves a bounded session path and rejects traversal-like slugs', () => {
    expect(mochiSessionPath('/work/explorer', 'explorer-v1')).toBe(
      '/work/explorer/.mochi/sandbox/explorer-v1/session.json'
    );
    expect(() => mochiSessionPath('/work/explorer', '../other')).toThrow(/Invalid/);
  });

  it('checks the exact health, domain, and transaction seed resources in parallel', async () => {
    const fetchImpl = vi.fn(async (input: URL) => {
      if (input.pathname.endsWith('/health')) return jsonResponse({ head_height: 2 });
      if (input.pathname.includes('/domains/')) return jsonResponse({ id: 'wonderland.universal' });
      return jsonResponse({
        pagination: {
          limit: 1,
          snapshot_height: 2,
          snapshot_hash: 'ab'.repeat(32),
          next_cursor: null,
          has_more: false,
        },
        items: [{}],
      });
    });

    await expect(verifyExplorerMochiSeed({ profile, session, fetchImpl })).resolves.toEqual({
      chainId: profile.chain_id,
      headHeight: 2,
      domainId: 'wonderland.universal',
      transactionCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([url]) => url.pathname).sort()).toEqual([
      '/v1/explorer/domains/wonderland.universal',
      '/v1/explorer/health',
      '/v1/explorer/transactions',
    ]);
    const transactionUrl = fetchImpl.mock.calls.map(([url]) => url).find((url) => (
      url.pathname === '/v1/explorer/transactions'
    ));
    expect(transactionUrl?.searchParams.get('limit')).toBe('1');
    expect(transactionUrl?.searchParams.has('page')).toBe(false);
    expect(transactionUrl?.searchParams.has('per_page')).toBe(false);
    expect(fetchImpl.mock.calls.every(([, init]) => init.headers.Accept === 'application/json')).toBe(true);
    expect(fetchImpl.mock.calls.every(([, init]) => (
      !hasHeader(init.headers, 'x-iroha-api-version')
    ))).toBe(true);
  });

  it('rejects unready sessions, wrong chains, missing resources, and undersized seeds', async () => {
    await expect(verifyExplorerMochiSeed({
      profile,
      session: { ...session, ready: false },
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/not ready/);
    await expect(verifyExplorerMochiSeed({
      profile,
      session: { ...session, chain_id: 'other' },
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/chain id mismatch/);

    const missingDomain = vi.fn(async (input: URL) => (
      input.pathname.includes('/domains/')
        ? jsonResponse({ message: 'missing' }, 404)
        : input.pathname.endsWith('/health')
          ? jsonResponse({ head_height: 2 })
          : jsonResponse({ items: [{}] })
    ));
    await expect(verifyExplorerMochiSeed({ profile, session, fetchImpl: missingDomain }))
      .rejects.toThrow(/Seed domain returned HTTP 404/);

    const undersized = vi.fn(async (input: URL) => (
      input.pathname.endsWith('/health')
        ? jsonResponse({ head_height: 1 })
        : input.pathname.includes('/domains/')
          ? jsonResponse({ id: 'wonderland.universal' })
          : jsonResponse({ items: [] })
    ));
    await expect(verifyExplorerMochiSeed({ profile, session, fetchImpl: undersized }))
      .rejects.toThrow(/head height/);

    const insufficientTransactions = vi.fn(async (input: URL) => (
      input.pathname.endsWith('/health')
        ? jsonResponse({ head_height: 2 })
        : input.pathname.includes('/domains/')
          ? jsonResponse({ id: 'wonderland.universal' })
          : jsonResponse({ items: [] })
    ));
    await expect(verifyExplorerMochiSeed({ profile, session, fetchImpl: insufficientTransactions }))
      .rejects.toThrow(/transaction sample/);

    await expect(verifyExplorerMochiSeed({
      profile: { ...profile, seed: { ...profile.seed, minimum_transactions: 101 } },
      session,
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/between 1 and 100/);
  });
});
