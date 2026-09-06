/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
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

const EXPLORER_PROXY_GET_PATHS = [
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

const EXPLORER_PROXY_POST_PATHS = new Set(['/v1/connect/session', '/v1/multisig/spec', '/v1/multisig/proposals/query']);

/** Restrict the development proxy to requests issued by current Explorer capabilities. */
export function isExplorerToriiProxyRequestAllowed(
  method: string | undefined,
  requestUrl: string | undefined
): boolean {
  if (!method || !requestUrl) return false;
  let pathname: string;
  try {
    pathname = new URL(requestUrl, 'http://explorer.invalid').pathname;
  } catch {
    return false;
  }

  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'GET') return EXPLORER_PROXY_GET_PATHS.some((pattern) => pattern.test(pathname));
  if (normalizedMethod === 'POST') return EXPLORER_PROXY_POST_PATHS.has(pathname);
  return false;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const toriiProxyTarget = (env.VITE_TORII_PROXY_TARGET || 'http://127.0.0.1:29080').replace(/\/+$/, '');
  const rawAppBasePath = (env.VITE_APP_BASE_PATH || '/').trim();
  const appBasePath =
    rawAppBasePath === '' || rawAppBasePath === '/' ? '/' : `/${rawAppBasePath.replace(/^\/+|\/+$/g, '')}/`;

  return {
    base: appBasePath,
    server: {
      proxy: {
        '/v1': {
          target: toriiProxyTarget,
          changeOrigin: true,
          ws: true,
          bypass: (request) => (isExplorerToriiProxyRequestAllowed(request.method, request.url) ? undefined : false),
        },
      },
    },
    test: {
      environment: 'jsdom',
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
          manualChunks(id) {
            const moduleId = id.replaceAll('\\', '/');
            if (/\/node_modules\/(?:vue|vue-router|vue-i18n)\//u.test(moduleId)) return 'vue';
            if (moduleId.includes('/node_modules/blockly/')) return 'studio-blockly';
            if (moduleId.includes('/node_modules/@vue-flow/')) return 'studio-flow';
            if (moduleId.includes('/node_modules/vue-json-pretty/')) return 'json-viewer';
            if (moduleId.includes('/javascript/iroha_js/') || moduleId.includes('/node_modules/@iroha/iroha-js/'))
              return 'iroha-sdk';
            if (
              /\/node_modules\/(?:@vueuse\/core|@iroha\/core|zod|date-fns|date-fns-tz|bignumber\.js)\//u.test(moduleId)
            )
              return 'vendor';
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
    plugins: [
      copyBuildPublicAssets(path.resolve(__dirname, 'public')),
      vue(),
      svg({
        svgoConfig: {
          plugins: [{ name: 'removeViewBox', active: false }],
        },
      }),
    ],
    resolve: {
      alias: {
        '@/': `${path.resolve(__dirname, 'src')}/`,
        '@noble/ciphers/chacha': path.resolve(__dirname, 'node_modules/@noble/ciphers/esm/chacha.js'),
        'node:buffer': 'buffer',
        'node:url': path.resolve(__dirname, 'src/shared/lib/node-url-browser.ts'),
      },
    },
  };
});
