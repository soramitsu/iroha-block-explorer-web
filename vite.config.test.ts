// @vitest-environment node

import { describe, expect, it } from 'vitest';

import explorerConfig, { isExplorerToriiProxyRequestAllowed } from './vite.config.mts';

describe('Vite Torii proxy', () => {
  it.each([
    '/v1/parameters',
    '/v1/soracles/feeds',
    '/v1/soracles/feeds/price_xor_usd/history',
    '/v1/soracles/defi/attestations/latest?domain=1&subject_id=42',
    '/v1/confidential/assets/66owaQmAQMuHxPzxUN3bqZ6FJfDa/transitions',
    '/v1/explorer/transactions?limit=10',
    '/v1/accounts/account%40domain/permissions',
    '/v1/accounts/account%40domain/history?limit=10',
    '/v1/explorer/accounts/account%40domain/qr',
    '/v1/explorer/assets/rose%23account%40wonderland',
    '/v1/assets/definitions/rose%23wonderland',
    '/v1/ledger/block/4/proof/abcd',
    '/v1/ledger/state-proof/4',
    '/v1/telemetry/live',
    '/v1/telemetry/peers-info',
    '/v1/vpn/profile',
    '/v1/contracts/events/sse?module=router',
    '/v1/nexus/dataspaces/accounts/account%40domain/summary',
    '/v1/sorafs/pin/abcd',
    '/v1/zk/proof/halo2%2Fipa/abcd',
    '/v1/connect/ws?sid=test&role=app',
  ])('allows the exact Explorer GET route %s', (url) => {
    expect(isExplorerToriiProxyRequestAllowed('GET', url)).toBe(true);
  });

  it.each(['/v1/connect/session', '/v1/multisig/spec', '/v1/multisig/proposals/query'])(
    'allows the exact Explorer POST route %s',
    (url) => {
      expect(isExplorerToriiProxyRequestAllowed('POST', url)).toBe(true);
    }
  );

  it.each([
    ['GET', '/metrics'],
    ['GET', '/v1/metrics'],
    ['GET', '/v1/status'],
    ['GET', '/v1/parameters/secret'],
    ['GET', '/v1/soracles'],
    ['GET', '/v1/soracles/feeds/price_xor_usd'],
    ['GET', '/v1/soracles/feeds/price_xor_usd/history/secret'],
    ['GET', '/v1/soracles/defi/attestations'],
    ['POST', '/v1/soracles/feeds'],
    ['GET', '/v1/confidential/assets/66owaQmAQMuHxPzxUN3bqZ6FJfDa'],
    ['GET', '/v1/confidential/assets/66owaQmAQMuHxPzxUN3bqZ6FJfDa/transitions/secret'],
    ['GET', '/v1/confidential/assets/66owaQmAQMuHxPzxUN3bqZ6FJfDa/other'],
    ['GET', '/v1/explorer'],
    ['GET', '/v1/explorer/metrics'],
    ['GET', '/v1/explorer/accounts/account/secret'],
    ['GET', '/v1/explorer/assets/asset/secret'],
    ['GET', '/v1/accounts/account%40domain/qr'],
    ['GET', '/v1/assets/rose%23account%40wonderland'],
    ['GET', '/v1/sumeragi/status'],
    ['GET', '/v1/telemetry'],
    ['GET', '/v1/telemetry/debug'],
    ['GET', '/v1/contracts/deployment-state'],
    ['GET', '/v1/connect/session'],
    ['POST', '/v1/explorer/transactions'],
    ['DELETE', '/v1/connect/session/session-id'],
  ])('denies a non-Explorer proxy request %s %s', (method, url) => {
    expect(isExplorerToriiProxyRequestAllowed(method, url)).toBe(false);
  });

  it('wires the strict request allowlist into the Vite proxy', async () => {
    if (typeof explorerConfig !== 'function') {
      throw new TypeError('expected the Explorer Vite config to be environment-aware');
    }

    const config = await explorerConfig({
      command: 'serve',
      mode: 'test',
      isSsrBuild: false,
      isPreview: false,
    });

    const proxy = config.server?.proxy?.['/v1'];
    expect(proxy).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    if (!proxy || typeof proxy === 'string' || !proxy.bypass) throw new TypeError('expected a guarded V1 proxy');
    expect(await proxy.bypass({ method: 'GET', url: '/v1/explorer/health' } as never, undefined, proxy)).toBe(
      undefined
    );
    expect(await proxy.bypass({ method: 'GET', url: '/metrics' } as never, undefined, proxy)).toBe(false);
    expect(config.server?.proxy).not.toHaveProperty('/status');
    expect(config.server?.proxy).not.toHaveProperty('/metrics');
  });
});
