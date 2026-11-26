// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProxyOptions } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

import explorerConfig, {
  collectBootPreloadFiles,
  collectBuildPublicAssets,
  entryStaticSdkModules,
  explorerManualChunk,
  isExplorerToriiProxyRequestAllowed,
} from './vite.config.mts';

function chunk(
  fileName: string,
  graph: { imports?: string[], dynamicImports?: string[], css?: string[], moduleIds?: string[] } = {}
) {
  return {
    type: 'chunk',
    fileName,
    imports: graph.imports ?? [],
    dynamicImports: graph.dynamicImports ?? [],
    moduleIds: graph.moduleIds ?? [],
    viteMetadata: { importedCss: new Set(graph.css ?? []) },
  };
}

function bundleOf(...chunks: ReturnType<typeof chunk>[]) {
  return Object.fromEntries(chunks.map((item) => [item.fileName, item]));
}

// The Explorer's boot shape: the entry loads config first, then imports the
// API, App, router and locale modules, which share the SDK and Vue chunks.
const bootBundle = bundleOf(
  chunk('_assets/index.js', {
    imports: ['_assets/vue.js', '_assets/vendor.js', '_assets/preload-helper.js'],
    dynamicImports: ['_assets/api.js', '_assets/App.js', '_assets/router.js'],
    css: ['_assets/index.css'],
  }),
  chunk('_assets/vue.js'),
  chunk('_assets/vendor.js', { imports: ['_assets/vue.js'] }),
  chunk('_assets/preload-helper.js'),
  chunk('_assets/api.js', {
    imports: ['_assets/index.js', '_assets/iroha-sdk.js', '_assets/vendor.js'],
    moduleIds: ['/repo/src/shared/api/index.ts'],
  }),
  chunk('_assets/iroha-sdk.js', { moduleIds: ['/repo/node_modules/@iroha/iroha-js/src/index.js'] }),
  chunk('_assets/App.js', { imports: ['_assets/api.js', '_assets/scope.js'], css: ['_assets/App.css', '_assets/index.css'] }),
  chunk('_assets/scope.js', { imports: ['_assets/preload-helper.js'], css: ['_assets/App.css'] }),
  chunk('_assets/router.js', { imports: ['_assets/preload-helper.js'], dynamicImports: ['_assets/HomePage.js'] }),
  chunk('_assets/HomePage.js', { imports: ['_assets/api.js'], css: ['_assets/HomePage.css'] })
);

describe('Explorer boot chunk graph', () => {
  it('preloads every boot chunk and stylesheet the entry HTML does not already load', () => {
    expect(collectBootPreloadFiles(bootBundle, '_assets/index.js')).toEqual({
      scripts: ['_assets/api.js', '_assets/App.js', '_assets/router.js', '_assets/iroha-sdk.js', '_assets/scope.js'],
      styles: ['_assets/App.css'],
    });
  });

  it('leaves route chunks to the router and preloads nothing for an entry without boot imports', () => {
    const preload = collectBootPreloadFiles(bootBundle, '_assets/index.js');
    expect(preload.scripts).not.toContain('_assets/HomePage.js');
    expect(preload.styles).not.toContain('_assets/HomePage.css');

    const staticOnly = bundleOf(chunk('_assets/index.js', { imports: ['_assets/vue.js'] }), chunk('_assets/vue.js'));
    expect(collectBootPreloadFiles(staticOnly, '_assets/index.js')).toEqual({ scripts: [], styles: [] });
  });

  it('rejects a graph that references a chunk missing from the bundle', () => {
    const broken = bundleOf(chunk('_assets/index.js', { dynamicImports: ['_assets/missing.js'] }));
    expect(() => collectBootPreloadFiles(broken, '_assets/index.js'))
      .toThrow('Boot chunk is missing from the bundle: _assets/missing.js');
    expect(() => collectBootPreloadFiles({ 'index.css': { type: 'asset' } }, 'index.css'))
      .toThrow('Boot chunk is missing from the bundle: index.css');
  });

  it('finds SDK modules the entry would have to evaluate before requesting its configuration', () => {
    expect(entryStaticSdkModules(bootBundle, '_assets/index.js')).toEqual([]);

    const regressed = {
      ...bootBundle,
      '_assets/index.js': chunk('_assets/index.js', { imports: ['_assets/vue.js', '_assets/iroha-sdk.js'] }),
    };
    expect(entryStaticSdkModules(regressed, '_assets/index.js'))
      .toEqual(['/repo/node_modules/@iroha/iroha-js/src/index.js']);
  });

  it('gives the preload helper its own chunk and keeps the named dependency chunks', () => {
    expect(explorerManualChunk('\0vite/preload-helper.js')).toBe('preload-helper');
    expect(explorerManualChunk('/repo/node_modules/@iroha/iroha-js/dist/torii-browser.js')).toBe('iroha-sdk');
    expect(explorerManualChunk('C:\\repo\\javascript\\iroha_js\\src\\index.js')).toBe('iroha-sdk');
    expect(explorerManualChunk('/repo/node_modules/vue-router/dist/vue-router.mjs')).toBe('vue');
    expect(explorerManualChunk('/repo/node_modules/zod/v4/index.js')).toBe('vendor');
    expect(explorerManualChunk('/repo/node_modules/@vue-flow/core/dist/index.mjs')).toBe('studio-flow');
    expect(explorerManualChunk('/repo/src/shared/api/index.ts')).toBeUndefined();
  });

  it('registers the boot preload plugin for production builds only', async () => {
    if (typeof explorerConfig !== 'function') {
      throw new TypeError('expected the Explorer Vite config to be environment-aware');
    }
    const config = await explorerConfig({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false });
    expect(config.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'explorer-boot-preload', apply: 'build' }),
    ]));
  });
});


// Every Torii read the home page and the Network, Activity and Ledger
// dashboards make, as traced through the installed SDK.
const DASHBOARD_TORII_READS = [
  ['GET', '/status'],
  ['POST', '/v1/explorer/blocks/query'],
  ['POST', '/v1/explorer/transactions/latest/query'],
  ['POST', '/v1/explorer/transactions/query'],
  ['POST', '/v1/explorer/domains/query'],
  ['POST', '/v1/explorer/asset-definitions/query'],
  ['POST', '/v1/explorer/accounts/query'],
  ['GET', '/v1/explorer/blocks/stream'],
  ['GET', '/v1/explorer/transactions/stream'],
  ['GET', '/v1/telemetry/live'],
] as const;

describe('Vite Torii proxy', () => {
  it.each([
    '/status',
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

  it.each([
    '/v1/connect/session',
    '/v1/multisig/spec',
    '/v1/multisig/proposals/query',
    '/v1/explorer/blocks/query',
    '/v1/explorer/transactions/latest/query',
    '/v1/explorer/transactions/query',
    '/v1/explorer/domains/query',
    '/v1/explorer/asset-definitions/query',
    '/v1/explorer/accounts/query',
  ])('allows the exact Explorer POST route %s', (url) => {
    expect(isExplorerToriiProxyRequestAllowed('POST', url)).toBe(true);
  });

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
    // Only the status snapshot itself, and only GET.
    ['GET', '/status/blocks'],
    ['GET', '/status/peers'],
    ['GET', '/status/'],
    ['GET', '/statuses'],
    ['GET', '/health'],
    ['POST', '/status'],
    ['HEAD', '/status'],
    // Query routes these views do not read stay closed, the signed query endpoint included.
    ['POST', '/v1/query'],
    ['POST', '/v1/explorer/assets/query'],
    ['POST', '/v1/explorer/nfts/query'],
    ['POST', '/v1/explorer/rwas/query'],
    ['POST', '/v1/explorer/instructions/query'],
    ['POST', '/v1/explorer/instructions/latest/query'],
    ['POST', '/v1/accounts/query'],
    ['POST', '/v1/domains/query'],
    ['POST', '/v1/assets/definitions/query'],
    ['POST', '/v1/transactions/query'],
    ['POST', '/v1/repo/agreements/query'],
    ['POST', '/v1/subscriptions/query'],
    ['POST', '/v1/contracts/activity/query'],
    ['POST', '/v1/accounts/account%40domain/permissions/query'],
    ['POST', '/v1/explorer/blocks/query/'],
    ['POST', '/v1/explorer/blocks/query/extra'],
    // The allowed query routes take POST only.
    ['PUT', '/v1/explorer/blocks/query'],
    ['PATCH', '/v1/explorer/transactions/query'],
    ['DELETE', '/v1/explorer/accounts/query'],
    ['HEAD', '/v1/explorer/transactions/latest/query'],
    ['OPTIONS', '/v1/explorer/domains/query'],
    // Including GET, although four of them would otherwise match a GET detail route.
    ['GET', '/v1/explorer/blocks/query'],
    ['GET', '/v1/explorer/transactions/query'],
    ['GET', '/v1/explorer/transactions/latest/query'],
    ['GET', '/v1/explorer/domains/query'],
    ['GET', '/v1/explorer/asset-definitions/query'],
    ['GET', '/v1/explorer/accounts/query'],
  ])('denies a non-Explorer proxy request %s %s', (method, url) => {
    expect(isExplorerToriiProxyRequestAllowed(method, url)).toBe(false);
  });

  it.each([
    ['GET', '/v1/connect/ws?sid=test&role=app', true],
    ['GET', '/v1/explorer/health', false],
    ['GET', '/v1/explorer/blocks/stream', false],
    ['GET', '/v1/telemetry/live', false],
    ['GET', '/status', false],
    ['GET', '/v1/connect/ws/', false],
    ['POST', '/v1/connect/ws', false],
  ])('allows a WebSocket upgrade %s %s only for the Connect socket (%s)', (method, url, allowed) => {
    expect(isExplorerToriiProxyRequestAllowed(method, url, true)).toBe(allowed);
  });

  it.each([
    ['GET', '/status/../status'],
    ['GET', '/v1/explorer/blocks/%2e%2e/accounts'],
    ['POST', '/v1/explorer/blocks/./query'],
    ['POST', '/v1/query/../explorer/blocks/query'],
    ['POST', '/v1/query/%2e%2e/explorer/blocks/query'],
    ['POST', '/v1/query\\..\\explorer/blocks/query'],
  ])('denies %s %s, which URL parsing would rewrite into an allowed route', (method, url) => {
    const rewritten = new URL(url, 'http://explorer.invalid').pathname;
    expect(rewritten).not.toBe(url);
    expect(isExplorerToriiProxyRequestAllowed(method, rewritten)).toBe(true);
    expect(isExplorerToriiProxyRequestAllowed(method, url)).toBe(false);
  });

  describe('through the configured development proxy', () => {
    let proxy: Record<string, string | ProxyOptions>;

    beforeAll(async () => {
      if (typeof explorerConfig !== 'function') {
        throw new TypeError('expected the Explorer Vite config to be environment-aware');
      }
      const config = await explorerConfig({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false });
      if (!config.server?.proxy) throw new TypeError('expected a Torii development proxy');
      proxy = config.server.proxy;
    });

    /**
     * Vite 7's routing (`doesProxyContextMatchUrl` and the proxy middleware):
     * the first key matching the request URL wins, a `^` key as a RegExp and
     * any key as a literal prefix. An upgrade only considers keys with
     * WebSockets enabled and reaches `bypass` without a response. The bypass
     * then forwards (`undefined`) or answers 404 (`false`).
     */
    async function proxyDecision(
      method: string,
      url: string,
      upgrade = false
    ): Promise<'forwarded' | 'refused' | 'not proxied'> {
      const context = Object.keys(proxy).find((key) => {
        const options = proxy[key];
        if (upgrade && (typeof options === 'string' || !(options.ws || /^wss?:/u.test(String(options.target))))) {
          return false;
        }
        return (key[0] === '^' && new RegExp(key).test(url)) || url.startsWith(key);
      });
      if (context === undefined) return 'not proxied';
      const options = proxy[context];
      if (typeof options === 'string' || !options.bypass) throw new TypeError(`expected a guarded proxy for ${context}`);
      const request = { method, url, headers: upgrade ? { connection: 'Upgrade', upgrade: 'websocket' } : {} };
      const result = await options.bypass(request as never, upgrade ? undefined : ({} as never), options);
      if (result === false) return 'refused';
      if (result === undefined) return 'forwarded';
      throw new TypeError(`unexpected bypass result for ${method} ${url}`);
    }

    it('sends the V1 routes and the status snapshot to one Torii, upgrading WebSockets only under V1', () => {
      expect(Object.keys(proxy)).toEqual(['/v1', '^/status(?:\\?|$)']);
      const v1 = proxy['/v1'];
      const status = proxy['^/status(?:\\?|$)'];
      if (typeof v1 === 'string' || typeof status === 'string') throw new TypeError('expected proxy options');
      expect(v1.target).toBe(status.target);
      expect(v1.agent).toBe(status.agent);
      expect(v1).toMatchObject({ changeOrigin: true, ws: true });
      expect(status).toMatchObject({ changeOrigin: true });
      expect(status.ws).toBeUndefined();
    });

    it.each(DASHBOARD_TORII_READS)('forwards the dashboard read %s %s to Torii', async (method, url) => {
      expect(await proxyDecision(method, url)).toBe('forwarded');
    });

    it.each([
      ['POST', '/status', 'refused'],
      ['HEAD', '/status', 'refused'],
      ['GET', '/status/blocks', 'not proxied'],
      ['GET', '/status/peers', 'not proxied'],
      ['GET', '/statuses', 'not proxied'],
      ['GET', '/metrics', 'not proxied'],
      ['GET', '/health', 'not proxied'],
      ['GET', '/peers', 'not proxied'],
      ['GET', '/v1/status', 'refused'],
      ['GET', '/v1/metrics', 'refused'],
      ['POST', '/v1/query', 'refused'],
      ['POST', '/v1/explorer/assets/query', 'refused'],
      ['PUT', '/v1/explorer/blocks/query', 'refused'],
      ['GET', '/v1/explorer/blocks/query', 'refused'],
      ['POST', '/v1/query/../explorer/blocks/query', 'refused'],
    ])('keeps %s %s from Torii (%s)', async (method, url, decision) => {
      expect(await proxyDecision(method, url)).toBe(decision);
    });

    it.each([
      ['/v1/connect/ws?sid=test&role=app', 'forwarded'],
      ['/v1/explorer/health', 'refused'],
      ['/v1/explorer/transactions/stream', 'refused'],
      ['/status', 'not proxied'],
    ])('routes a WebSocket upgrade to %s as %s', async (url, decision) => {
      expect(await proxyDecision('GET', url, true)).toBe(decision);
    });
  });

  it('reserves root config.json for the signed deployment injector', async () => {
    const publicRoot = await mkdtemp(path.join(os.tmpdir(), 'explorer-public-assets-'));
    try {
      await mkdir(path.join(publicRoot, 'nested'));
      await Promise.all([
        writeFile(path.join(publicRoot, 'config.json'), '{"must":"not ship"}\n'),
        writeFile(path.join(publicRoot, 'favicon.svg'), '<svg/>\n'),
        writeFile(path.join(publicRoot, 'nested', 'config.json'), '{"fixture":true}\n'),
      ]);

      const assets = await collectBuildPublicAssets(publicRoot);

      expect(assets.map(({ fileName }) => fileName)).toEqual([
        'favicon.svg',
        'nested/config.json',
      ]);
      expect(Buffer.from(assets[0]?.source ?? []).toString('utf8')).toBe('<svg/>\n');
    } finally {
      await rm(publicRoot, { recursive: true, force: true });
    }
  });

  it('disables Vite public-directory copying in production builds', async () => {
    if (typeof explorerConfig !== 'function') {
      throw new TypeError('expected the Explorer Vite config to be environment-aware');
    }

    const config = await explorerConfig({
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    });

    expect(config.build?.copyPublicDir).toBe(false);
    expect(config.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'explorer-build-public-assets', apply: 'build' }),
    ]));
  });

  it('rejects public asset symlinks instead of shipping files outside the public directory', async () => {
    const publicRoot = await mkdtemp(path.join(os.tmpdir(), 'explorer-public-link-'));
    try {
      await symlink('/etc/hosts', path.join(publicRoot, 'outside'));
      await expect(collectBuildPublicAssets(publicRoot)).rejects.toThrow('Unsupported public asset type: outside');
    } finally {
      await rm(publicRoot, { recursive: true, force: true });
    }
  });
});
