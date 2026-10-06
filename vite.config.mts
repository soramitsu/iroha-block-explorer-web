/// <reference types="vitest" />
import { defineConfig, loadEnv, defaultClientConditions, defaultClientMainFields, type Plugin } from 'vite';
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const toriiProxyTarget = (env.VITE_TORII_PROXY_TARGET || 'http://127.0.0.1:29080').replace(/\/+$/, '');
  const rawAppBasePath = (env.VITE_APP_BASE_PATH || '/').trim();
  const appBasePath =
    rawAppBasePath === '' || rawAppBasePath === '/'
      ? '/'
      : `/${rawAppBasePath.replace(/^\/+|\/+$/g, '')}/`;

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
        '/v1': {
          target: toriiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
        '/status': {
          target: toriiProxyTarget,
          changeOrigin: true,
          headers: {
            Accept: 'application/json',
          },
        },
        '/metrics': {
          target: toriiProxyTarget,
          changeOrigin: true,
        },
        '/peers': {
          target: toriiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
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
          manualChunks(id) {
            const moduleId = id.replaceAll('\\', '/');
            if (/\/node_modules\/(?:vue|vue-router|vue-i18n)\//u.test(moduleId)) return 'vue';
            if (moduleId.includes('/node_modules/blockly/')) return 'studio-blockly';
            if (moduleId.includes('/node_modules/@vue-flow/')) return 'studio-flow';
            if (moduleId.includes('/node_modules/qrcode/')) return 'qr-code';
            if (moduleId.includes('/node_modules/vue-json-pretty/')) return 'json-viewer';
            if (moduleId.includes('/node_modules/tr46/') || moduleId.includes('/node_modules/punycode/')) return 'domain-validation';
            if (moduleId.includes('/node_modules/buffer/')) return 'binary-buffer';
            // Preserve the upstream lazy telemetry parser and route-only compiler.
            // The blanket SDK bucket otherwise makes both startup dependencies.
            if (moduleId.includes('/iroha-js/dist/sumeragiTyped.js')) return 'iroha-sumeragi';
            if (moduleId.includes('/iroha-js/dist/kotodamaCompiler/')) return 'iroha-compiler';
            if (
              moduleId.includes('/javascript/iroha_js/')
              || moduleId.includes('/node_modules/@iroha/iroha-js/')
            ) return 'iroha-sdk';
            if (
              /\/node_modules\/(?:@vueuse\/core|@iroha\/core|zod|date-fns|date-fns-tz|bignumber\.js)\//u.test(
                moduleId
              )
            ) return 'vendor';
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
      copyBuildPublicAssets(path.resolve(configDirectory, 'public')),
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
