/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const toriiProxyTarget = (env.VITE_TORII_PROXY_TARGET || 'http://127.0.0.1:29080').replace(/\/+$/, '');
  const rawAppBasePath = (env.VITE_APP_BASE_PATH || '/').trim();
  const appBasePath =
    rawAppBasePath === '' || rawAppBasePath === '/'
      ? '/'
      : `/${rawAppBasePath.replace(/^\/+|\/+$/g, '')}/`;

  return {
    base: appBasePath,
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
      globalSetup: 'test-globals.ts',
      // Node v25 + forked pools can intermittently crash with EPIPE on worker IPC.
      // Threads avoid child-process IPC and keep default parallel `vitest run` stable.
      pool: 'threads',
      // Node 22 emits a warning when localStorage is touched without an explicit backing file.
      // Passing a deterministic temp file keeps Vitest output clean.
      execArgv: [`--localstorage-file=${vitestLocalStorageFile}`],
    },
    build: {
      // to not overlap with the `/assets` route in the app
      assetsDir: '_assets',
      target: 'esnext',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'vue-i18n'],
            vendor: ['@vueuse/core', '@iroha/core', 'zod', 'date-fns', 'date-fns-tz', 'bignumber.js'],
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
