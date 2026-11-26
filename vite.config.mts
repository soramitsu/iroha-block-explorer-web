/// <reference types="vitest" />
import {
  defineConfig,
  loadEnv,
  defaultClientConditions,
  defaultClientMainFields,
  type Plugin,
  type ProxyOptions,
} from 'vite';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { configDefaults } from 'vitest/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'os';
import path from 'path';
import vue from '@vitejs/plugin-vue';
import svg from 'vite-svg-loader';

// Local/CI environments without npm registry access can repeatedly emit
// browserslist "old data" warnings; suppress those noisy advisories in tooling output.
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= '1';
const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[baseline-browser-mapping]')) {
    return;
  }
  originalConsoleWarn(...args);
};
const vitestLocalStorageFile = path.join(os.tmpdir(), 'iroha2-block-explorer-web-vitest-localstorage');
const runtimeConfigFileName = 'config.json';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));

interface BuildPublicAsset {
  fileName: string
  source: Uint8Array
}

/** Collect public build assets while reserving root config.json for deployment injection. */
export async function collectBuildPublicAssets(
  publicRoot: string,
  currentDirectory = ''
): Promise<BuildPublicAsset[]> {
  const assets: BuildPublicAsset[] = [];
  const directory = currentDirectory
    ? path.join(publicRoot, ...currentDirectory.split('/'))
    : publicRoot;
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = currentDirectory ? `${currentDirectory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      assets.push(...(await collectBuildPublicAssets(publicRoot, relative)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported public asset type: ${relative}`);
    }
    if (relative === runtimeConfigFileName) continue;
    assets.push({
      fileName: relative,
      source: await readFile(path.join(publicRoot, ...relative.split('/'))),
    });
  }

  return assets;
}

function copyBuildPublicAssets(publicRoot: string): Plugin {
  return {
    name: 'explorer-build-public-assets',
    apply: 'build',
    async buildStart() {
      for (const asset of await collectBuildPublicAssets(publicRoot)) {
        this.emitFile({ type: 'asset', ...asset });
      }
    },
  };
}

const VITE_PRELOAD_HELPER_ID = '\0vite/preload-helper.js';
const IROHA_SDK_MODULE_PATTERN = /\/javascript\/iroha_js\/|\/node_modules\/@iroha\/iroha-js\//u;

/** Assign stable named chunks to heavy dependencies and to the entry's preload runtime. */
export function explorerManualChunk(id: string): string | undefined {
  const moduleId = id.replaceAll('\\', '/');
  // The entry needs Vite's dynamic-import helper before it can request the
  // runtime configuration. Left to Rollup, the helper was merged into the
  // iroha-sdk chunk, which made that request wait for the whole SDK.
  if (moduleId === VITE_PRELOAD_HELPER_ID) return 'preload-helper';
  if (/\/node_modules\/(?:vue|vue-router|vue-i18n)\//u.test(moduleId)) return 'vue';
  if (moduleId.includes('/node_modules/blockly/')) return 'studio-blockly';
  if (moduleId.includes('/node_modules/@vue-flow/')) return 'studio-flow';
  if (moduleId.includes('/node_modules/vue-json-pretty/')) return 'json-viewer';
  if (IROHA_SDK_MODULE_PATTERN.test(moduleId)) return 'iroha-sdk';
  if (/\/node_modules\/(?:@vueuse\/core|@iroha\/core|zod|date-fns|date-fns-tz|bignumber\.js)\//u.test(moduleId))
    return 'vendor';
  return undefined;
}

interface BootGraphChunk {
  type: 'chunk'
  fileName: string
  imports: readonly string[]
  dynamicImports: readonly string[]
  moduleIds: readonly string[]
  viteMetadata?: { importedCss: ReadonlySet<string> }
}

type BootGraphBundle = Readonly<Record<string, { type: string }>>;

function bootGraphChunk(bundle: BootGraphBundle, fileName: string): BootGraphChunk {
  const item = bundle[fileName];
  if (!item || item.type !== 'chunk') throw new Error(`Boot chunk is missing from the bundle: ${fileName}`);
  return item as BootGraphChunk;
}

/** Breadth-first static import closure, in a deterministic discovery order. */
function staticChunkClosure(bundle: BootGraphBundle, roots: readonly string[], seen = new Set<string>()): string[] {
  const order: string[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const fileName = pending.shift() as string;
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    order.push(fileName);
    pending.push(...bootGraphChunk(bundle, fileName).imports);
  }
  return order;
}

/**
 * Chunks the entry imports dynamically at boot, with their static imports and CSS,
 * minus what the entry HTML already loads. Every dynamic import of the entry is
 * a boot step (the bundle budget counts them the same way).
 */
export function collectBootPreloadFiles(
  bundle: BootGraphBundle,
  entryFileName: string
): { scripts: string[], styles: string[] } {
  const entry = bootGraphChunk(bundle, entryFileName);
  const loaded = new Set<string>();
  const entryClosure = staticChunkClosure(bundle, [entryFileName], loaded);
  const loadedStyles = new Set(entryClosure.flatMap((fileName) => [
    ...(bootGraphChunk(bundle, fileName).viteMetadata?.importedCss ?? []),
  ]));
  const scripts = staticChunkClosure(bundle, entry.dynamicImports, loaded);
  const styles = [...new Set(scripts.flatMap((fileName) => [
    ...(bootGraphChunk(bundle, fileName).viteMetadata?.importedCss ?? []),
  ]))].filter((fileName) => !loadedStyles.has(fileName));
  return { scripts, styles };
}

/** Bundled Iroha SDK modules the entry must evaluate before its own code runs. */
export function entryStaticSdkModules(bundle: BootGraphBundle, entryFileName: string): string[] {
  return staticChunkClosure(bundle, [entryFileName])
    .flatMap((fileName) => bootGraphChunk(bundle, fileName).moduleIds)
    .filter((moduleId) => IROHA_SDK_MODULE_PATTERN.test(moduleId.replaceAll('\\', '/')));
}

/**
 * Fetch every boot chunk from the document instead of one dependency level
 * per round trip. `modulepreload` downloads and compiles without evaluating,
 * so no API module runs before the runtime configuration is valid.
 */
function preloadBootChunks(): Plugin {
  let base = '/';
  return {
    name: 'explorer-boot-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        if (!context.bundle || !context.chunk) throw new Error('The HTML entry chunk is unavailable for boot preloading');
        const sdkModules = entryStaticSdkModules(context.bundle, context.chunk.fileName);
        if (sdkModules.length > 0) {
          throw new Error(`The entry must not wait for the Iroha SDK before loading its runtime configuration: ${sdkModules[0]}`);
        }
        const { scripts, styles } = collectBootPreloadFiles(context.bundle, context.chunk.fileName);
        return [
          ...scripts.map((fileName) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${fileName}` },
            injectTo: 'head' as const,
          })),
          // Boot stylesheets are linked outright: Vite's preload helper finds
          // them and does not wait for a second load. A style preload would
          // stay unused until the configuration and API load, which Chrome
          // reports as an unused preload on slow networks.
          ...styles.map((fileName) => ({
            tag: 'link',
            attrs: { rel: 'stylesheet', crossorigin: true, href: `${base}${fileName}` },
            injectTo: 'head' as const,
          })),
        ];
      },
    },
  };
}

const EXPLORER_PROXY_GET_PATHS = [
  // The reporting peer's status snapshot, polled by the Network dashboard.
  // Torii's `/status/blocks` and `/status/peers` scalars and `/metrics` stay closed.
  /^\/status$/u,
  /^\/v1\/parameters$/u,
  /^\/v1\/soracles\/(?:feeds(?:\/[^/]+\/history)?|defi\/attestations\/latest)$/u,
  /^\/v1\/confidential\/assets\/[^/]+\/transitions$/u,
  /^\/v1\/explorer\/health$/u,
  /^\/v1\/explorer\/accounts(?:\/[^/]+(?:\/qr)?)?$/u,
  /^\/v1\/explorer\/(?:nfts|rwas|domains|blocks)(?:\/[^/]+)?$/u,
  /^\/v1\/explorer\/assets(?:\/[^/]+)?$/u,
  /^\/v1\/explorer\/asset-definitions(?:\/[^/]+\/(?:econometrics|snapshot))?$/u,
  /^\/v1\/explorer\/transactions(?:\/(?:latest|stream|[^/]+))?$/u,
  /^\/v1\/explorer\/instructions(?:\/(?:latest|stream|[^/]+\/\d+(?:\/contract-view)?))?$/u,
  /^\/v1\/accounts\/[^/]+\/(?:permissions|history)$/u,
  /^\/v1\/assets\/definitions(?:\/[^/]+)?$/u,
  /^\/v1\/ledger\/(?:block\/[^/]+\/proof\/[^/]+|state(?:-proof)?\/[^/]+)$/u,
  /^\/v1\/telemetry\/(?:live|peers-info)$/u,
  /^\/v1\/vpn\/profile$/u,
  /^\/v1\/contracts\/(?:activity|events(?:\/sse)?)$/u,
  /^\/v1\/nexus\/dataspaces\/accounts\/[^/]+\/summary$/u,
  /^\/v1\/sorafs\/pin(?:\/[^/]+)?$/u,
  /^\/v1\/zk\/(?:proofs(?:\/count)?|proof\/[^/]+\/[^/]+|vk(?:\/[^/]+\/[^/]+)?)$/u,
  /^\/v1\/connect\/ws$/u,
] as const;

const EXPLORER_PROXY_POST_PATHS = new Set([
  '/v1/connect/session',
  '/v1/multisig/spec',
  '/v1/multisig/proposals/query',
  // Read-only collection queries the installed SDK sends as `POST <collection>/query`
  // for the home page and the Network, Activity and Ledger dashboards. Torii
  // answers each with its bounded Explorer query handler. Every other query
  // route stays closed, including the signed `/v1/query`.
  '/v1/explorer/blocks/query', // home latest blocks; Network and Activity block windows
  '/v1/explorer/transactions/latest/query', // home latest transactions
  '/v1/explorer/transactions/query', // Activity transaction sample
  '/v1/explorer/domains/query', // Ledger
  '/v1/explorer/asset-definitions/query', // Ledger
  '/v1/explorer/accounts/query', // Ledger
]);

// Vite reads a proxy key that starts with `^` as a RegExp and any other key as
// a URL prefix. Torii's root routes share no prefix, so the status snapshot gets
// an anchored key and no other root path reaches the proxy.
const EXPLORER_PROXY_STATUS_CONTEXT = '^/status(?:\\?|$)';

// The Connect socket is the only route the Explorer opens as a WebSocket.
const EXPLORER_PROXY_WEBSOCKET_PATH = '/v1/connect/ws';

/**
 * Restrict the development proxy to requests issued by current Explorer capabilities.
 * `upgrade` marks a protocol-upgrade (WebSocket) request.
 */
export function isExplorerToriiProxyRequestAllowed(
  method: string | undefined,
  requestUrl: string | undefined,
  upgrade = false
): boolean {
  if (!method || !requestUrl) return false;
  let pathname: string;
  try {
    pathname = new URL(requestUrl, 'http://explorer.invalid').pathname;
  } catch {
    return false;
  }
  // `URL` resolves dot segments and backslashes, but the proxy forwards the
  // request target as sent. Check that same spelling, so a rewritten path
  // cannot pass as an allowed route and reach Torii as another.
  if (requestUrl.split('?', 1)[0] !== pathname) return false;

  const normalizedMethod = method.toUpperCase();
  if (upgrade) return normalizedMethod === 'GET' && pathname === EXPLORER_PROXY_WEBSOCKET_PATH;
  // A POST route never doubles as a GET read, although `blocks/query`, for
  // example, would otherwise match the `blocks/{id}` detail route.
  if (normalizedMethod === 'GET') {
    return !EXPLORER_PROXY_POST_PATHS.has(pathname) && EXPLORER_PROXY_GET_PATHS.some((pattern) => pattern.test(pathname));
  }
  if (normalizedMethod === 'POST') return EXPLORER_PROXY_POST_PATHS.has(pathname);
  return false;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const toriiProxyTarget = (env.VITE_TORII_PROXY_TARGET || 'http://127.0.0.1:29080').replace(/\/+$/, '');
  // Reuse upstream connections: a fresh TCP and TLS handshake for every proxied
  // request adds about half a second per read against a remote Torii.
  const toriiProxyAgent = toriiProxyTarget.startsWith('https:')
    ? new HttpsAgent({ keepAlive: true })
    : new HttpAgent({ keepAlive: true });
  const toriiProxy: ProxyOptions = {
    target: toriiProxyTarget,
    agent: toriiProxyAgent,
    changeOrigin: true,
    // Vite consults this for ordinary requests and for WebSocket upgrades,
    // which carry an `Upgrade` header (browsers never send one otherwise).
    bypass: (request) =>
      isExplorerToriiProxyRequestAllowed(request.method, request.url, Boolean(request.headers?.upgrade))
        ? undefined
        : false,
  };
  const rawAppBasePath = (env.VITE_APP_BASE_PATH || '/').trim();
  const appBasePath =
    rawAppBasePath === '' || rawAppBasePath === '/' ? '/' : `/${rawAppBasePath.replace(/^\/+|\/+$/g, '')}/`;

  return {
    base: appBasePath,
    // Vitest defaults to Node resolution even for jsdom. Browser tests must use
    // the same package-owned browser mappings as the real application build.
    ...(mode === 'test' ? {
      environments: {
        client: {
          resolve: {
            conditions: [...defaultClientConditions],
            mainFields: [...defaultClientMainFields],
          },
        },
      },
    } : {}),
    server: {
      proxy: {
        '/v1': { ...toriiProxy, ws: true },
        [EXPLORER_PROXY_STATUS_CONTEXT]: toriiProxy,
      },
    },
    test: {
      environment: 'jsdom',
      // Shared development hosts may give each worker only 5–10% of a core.
      // Allow SDK imports and page renders to finish within the test/hook budget.
      testTimeout: 60_000,
      hookTimeout: 60_000,
      // Retained release candidates have their own explicit test configuration.
      // They must not run as maintained source tests against this checkout.
      exclude: [...configDefaults.exclude, 'output/**'],
      globalSetup: 'test-globals.ts',
      // Node v25 + forked pools can intermittently crash with EPIPE on worker IPC.
      // Threads avoid child-process IPC and keep default parallel `vitest run` stable.
      pool: 'threads',
      // Node 22 emits a warning when localStorage is touched without an explicit backing file.
      // Passing a deterministic temp file keeps Vitest output clean.
      execArgv: [`--localstorage-file=${vitestLocalStorageFile}`],
      // Keep SDK typed arrays in Vitest's jsdom realm. Externalizing the file:
      // dependency creates foreign-realm Uint8Arrays that fail strict key checks.
      server: {
        deps: {
          inline: [/@iroha\/iroha-js/],
        },
      },
    },
    build: {
      // The signed deployment bundle injects root config.json separately.
      // Disable Vite's all-or-nothing public copy and emit only application
      // assets through explorer-build-public-assets below.
      copyPublicDir: false,
      // to not overlap with the `/assets` route in the app
      assetsDir: '_assets',
      manifest: true,
      target: 'esnext',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: explorerManualChunk,
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
    plugins: [
      copyBuildPublicAssets(path.resolve(configDirectory, 'public')),
      preloadBootChunks(),
      vue(),
      svg({
        svgoConfig: {
          // Keep authored scaling bounds. SVGO 3 no longer supports the old
          // active:false flag, which caused removeViewBox to run on every icon.
          plugins: [],
        },
      }),
    ],
    resolve: {
      alias: {
        '@/': `${path.resolve(configDirectory, 'src')}/`,
        '@noble/ciphers/chacha': path.resolve(configDirectory, 'node_modules/@noble/ciphers/esm/chacha.js'),
        'node:buffer': 'buffer',
        'node:url': path.resolve(configDirectory, 'src/shared/lib/node-url-browser.ts'),
      },
    },
  };
});
