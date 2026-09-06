import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectEntryBootManifestKeys,
  collectStaticManifestKeys,
  evaluateBundleBudgets,
  validateBundleBudgets,
} from './check-bundle-budget.mjs';

const temporaryDirectories: string[] = [];

function fixture() {
  const distDir = mkdtempSync(join(tmpdir(), 'explorer-bundle-budget-'));
  temporaryDirectories.push(distDir);
  mkdirSync(join(distDir, '_assets'));
  const files: Record<string, string> = {
    '_assets/index.js': 'const entry = "entry";'.repeat(50),
    '_assets/bootstrap.js': 'const bootstrap = "bootstrap";'.repeat(50),
    '_assets/shared.js': 'const shared = "shared";'.repeat(50),
    '_assets/route.js': 'const route = "route";'.repeat(50),
    '_assets/contract.worker-AbCd1234.js': 'const worker = "worker";'.repeat(50),
  };
  for (const [file, contents] of Object.entries(files)) writeFileSync(join(distDir, file), contents);
  const manifest = {
    'index.html': {
      file: '_assets/index.js',
      name: 'index',
      src: 'index.html',
      isEntry: true,
      imports: ['_shared.js'],
      dynamicImports: ['_bootstrap.js'],
    },
    '_shared.js': { file: '_assets/shared.js', name: 'shared' },
    '_bootstrap.js': {
      file: '_assets/bootstrap.js',
      name: 'bootstrap',
      isDynamicEntry: true,
      imports: ['_shared.js', 'index.html'],
    },
    'src/pages/Route.vue': {
      file: '_assets/route.js',
      name: 'Route',
      src: 'src/pages/Route.vue',
      isDynamicEntry: true,
      imports: ['_shared.js', '_bootstrap.js'],
    },
  };
  const sizes = Object.fromEntries(
    Object.entries(files).map(([file, contents]) => [file, gzipSync(contents, { level: 9 }).byteLength])
  );
  return { distDir, manifest, sizes };
}

function budgets(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    default_chunk_gzip_bytes: 10_000,
    chunk_gzip_bytes: {
      index: 10_000,
      bootstrap: 10_000,
      shared: 10_000,
      Route: 10_000,
      'contract.worker': 10_000,
    },
    entry_gzip_bytes: { 'index.html': 10_000 },
    route_gzip_bytes: { 'src/pages/Route.vue': 10_000 },
    ...overrides,
  };
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('bundle budget checker', () => {
  it('measures a route incrementally without charging its entry-shared chunk twice', () => {
    const { distDir, manifest, sizes } = fixture();
    const result = evaluateBundleBudgets({ manifest, budgets: budgets(), distDir });

    expect(collectStaticManifestKeys(manifest, 'src/pages/Route.vue')).toEqual(
      new Set(['src/pages/Route.vue', '_bootstrap.js', 'index.html', '_shared.js'])
    );
    expect(collectEntryBootManifestKeys(manifest, 'index.html')).toEqual(
      new Set(['index.html', '_shared.js', '_bootstrap.js'])
    );
    expect(result.failures).toEqual([]);
    expect(result.measurements).toContainEqual({
      kind: 'route',
      name: 'src/pages/Route.vue',
      actual: sizes['_assets/route.js'],
      limit: 10_000,
    });
    expect(result.measurements).toContainEqual({
      kind: 'entry',
      name: 'index.html',
      actual:
        sizes['_assets/index.js'] + sizes['_assets/shared.js'] + sizes['_assets/bootstrap.js'],
      limit: 10_000,
    });
    expect(result.measurements).toContainEqual({
      kind: 'chunk',
      name: 'contract.worker',
      actual: sizes['_assets/contract.worker-AbCd1234.js'],
      limit: 10_000,
    });
  });

  it('reports independent route and chunk regressions', () => {
    const { distDir, manifest, sizes } = fixture();
    const result = evaluateBundleBudgets({
      manifest,
      budgets: budgets({
        chunk_gzip_bytes: {
          index: 10_000,
          bootstrap: 10_000,
          shared: 10_000,
          Route: sizes['_assets/route.js'] - 1,
          'contract.worker': 10_000,
        },
        route_gzip_bytes: { 'src/pages/Route.vue': sizes['_assets/route.js'] - 1 },
      }),
      distDir,
    });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'route', name: 'src/pages/Route.vue' }),
      expect.objectContaining({ kind: 'chunk', name: 'Route' }),
    ]));
  });

  it('rejects malformed budgets and routes absent from the manifest', () => {
    expect(() => validateBundleBudgets(budgets({ default_chunk_gzip_bytes: 0 })))
      .toThrow('default_chunk_gzip_bytes must be a positive integer');

    const { distDir, manifest } = fixture();
    expect(() => evaluateBundleBudgets({
      manifest,
      budgets: budgets({ route_gzip_bytes: { 'src/pages/Missing.vue': 1000 } }),
      distDir,
    })).toThrow('Configured route is missing from the manifest');

    expect(() => evaluateBundleBudgets({
      manifest,
      budgets: budgets({
        chunk_gzip_bytes: {
          index: 10_000,
          bootstrap: 10_000,
          shared: 10_000,
          Route: 10_000,
          'contract.worker': 10_000,
          stale: 10_000,
        },
      }),
      distDir,
    })).toThrow('Configured chunk is missing from the manifest: stale');
  });
});
