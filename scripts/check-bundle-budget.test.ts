import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectEntryBootManifestKeys,
  collectStaticManifestKeys,
  evaluateBundleBudgets,
  formatBundleBudgetReport,
  validateBundleBudgets,
} from './check-bundle-budget.mjs';

const temporaryDirectories: string[] = [];
const wasmFile = '_assets/iroha_js_codec_wasm_bg-fixture.wasm';
const wasmBytes = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

function fixture() {
  const distDir = mkdtempSync(join(tmpdir(), 'explorer-bundle-budget-'));
  temporaryDirectories.push(distDir);
  mkdirSync(join(distDir, '_assets'));
  const files: Record<string, string | Buffer> = {
    'index.html': '<!doctype html><script type="module" src="/_assets/index.js"></script>',
    '_assets/index.js': 'const entry = "entry";'.repeat(50),
    '_assets/index.css': '.entry { color: red; }'.repeat(50),
    '_assets/font.woff2': 'font bytes'.repeat(50),
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
      css: ['_assets/index.css'],
      assets: ['_assets/font.woff2'],
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
    schema_version: 3,
    default_chunk_gzip_bytes: 10_000,
    chunk_gzip_bytes: {
      index: 10_000,
      bootstrap: 10_000,
      shared: 10_000,
      Route: 10_000,
      'contract.worker': 10_000,
    },
    entry_gzip_bytes: { 'index.html': 10_000 },
    entry_startup_gzip_bytes: { 'index.html': 11_024 },
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
        sizes['_assets/index.js'] + sizes['_assets/shared.js'] + sizes['_assets/bootstrap.js']
        + sizes['_assets/index.css'] + sizes['_assets/font.woff2'] + sizes['index.html'],
      limit: 10_000,
    });
    expect(result.measurements).toContainEqual({
      kind: 'chunk',
      name: 'contract.worker',
      actual: sizes['_assets/contract.worker-AbCd1234.js'],
      limit: 10_000,
    });
  });

  it('charges each startup asset once across shared imports and references', () => {
    const { distDir, manifest, sizes } = fixture();
    manifest['index.html'].assets.push('_assets/font.woff2', '_assets/font.woff2');
    const result = evaluateBundleBudgets({ manifest, budgets: budgets(), distDir });
    const entry = result.entries[0];
    const jsCss = sizes['_assets/index.js'] + sizes['_assets/bootstrap.js']
      + sizes['_assets/shared.js'] + sizes['_assets/index.css'];
    const other = sizes['index.html'] + sizes['_assets/font.woff2'];

    expect(entry.categories.js_css.gzip_bytes).toBe(jsCss);
    expect(entry.categories.other_assets.gzip_bytes).toBe(other);
    expect(entry.total.gzip_bytes).toBe(jsCss + other);
    expect(result.measurements).toContainEqual({
      kind: 'entry', name: 'index.html', actual: jsCss + other, limit: 10_000,
    });
    expect(result.measurements).toContainEqual({
      kind: 'startup', name: 'index.html', actual: entry.total.gzip_bytes, limit: 11_024,
    });
    expect(formatBundleBudgetReport(result)).toContain(`js_css: ${entry.categories.js_css.raw_bytes} raw bytes; ${jsCss} gzip bytes`);
    expect(formatBundleBudgetReport(result)).toContain(`other_assets: ${entry.categories.other_assets.raw_bytes} raw bytes; ${other} gzip bytes`);
    expect(formatBundleBudgetReport(result)).toContain(`total: ${entry.total.raw_bytes} raw bytes; ${entry.total.gzip_bytes} gzip bytes`);
  });

  it('fails the total startup budget independently of the entry cap', () => {
    const { distDir, manifest } = fixture();
    const entryTotal = evaluateBundleBudgets({ manifest, budgets: budgets(), distDir }).entries[0].total.gzip_bytes;
    const result = evaluateBundleBudgets({
      manifest, distDir,
      budgets: budgets({ entry_startup_gzip_bytes: { 'index.html': entryTotal - 1 } }),
    });
    expect(result.failures).toEqual([
      { kind: 'startup', name: 'index.html', actual: entryTotal, limit: entryTotal - 1 },
    ]);
    expect(formatBundleBudgetReport(result)).toContain('Bundle budget check failed with 1 over-budget artifact(s).');
  });

  it('counts unexpected startup assets against both the entry and total budgets', () => {
    const { distDir, manifest } = fixture();
    const before = evaluateBundleBudgets({ manifest, budgets: budgets(), distDir });
    const previousEntry = before.measurements.find(({ kind }: { kind: string }) => kind === 'entry')!;
    writeFileSync(join(distDir, '_assets/extra.bin'), 'Unexpected asset');
    manifest['index.html'].assets.push('_assets/extra.bin');
    const result = evaluateBundleBudgets({
      manifest, distDir,
      budgets: budgets({
        entry_gzip_bytes: { 'index.html': previousEntry.actual },
        entry_startup_gzip_bytes: { 'index.html': before.entries[0].total.gzip_bytes },
      }),
    });
    expect(result.entries[0].categories.other_assets.files).toContain('_assets/extra.bin');
    expect(result.failures.map(({ kind }: { kind: string }) => kind)).toEqual(['entry', 'startup']);
  });

  it.each([wasmFile, '_assets/extra.WASM', '_assets/extra.wasm.gz', '_assets/extra.wasm.br', '_assets/hidden.bin'])(
    'rejects emitted Wasm even when it is absent from the manifest: %s', (file) => {
      const { distDir, manifest } = fixture();
      writeFileSync(join(distDir, file), file.endsWith('.bin') ? wasmBytes : 'artifact bytes');
      expect(() => evaluateBundleBudgets({ manifest, budgets: budgets(), distDir }))
        .toThrow(`Wasm artifacts are prohibited: ${file}`);
    }
  );

  it('rejects non-CSS assets misclassified as CSS and noncanonical asset aliases', () => {
    const { distDir, manifest } = fixture();
    manifest['index.html'].css.push(wasmFile);
    expect(() => evaluateBundleBudgets({ manifest, budgets: budgets(), distDir }))
      .toThrow('Manifest CSS asset is not CSS');
    manifest['index.html'].css.pop();
    manifest['index.html'].assets.push('_assets/../_assets/index.css');
    expect(() => evaluateBundleBudgets({ manifest, budgets: budgets(), distDir }))
      .toThrow('Manifest asset path must be a canonical relative path');
  });

  it('requires the current complete budget schema and rejects retired Wasm budgets', () => {
    expect(() => validateBundleBudgets(budgets({ schema_version: 1 })))
      .toThrow('Unsupported bundle budget schema');
    expect(() => validateBundleBudgets(budgets({ entry_startup_gzip_bytes: {} })))
      .toThrow('Every entry must have both an entry and total startup budget');
    expect(() => validateBundleBudgets(budgets({ sdk_wasm: {} })))
      .toThrow('Wasm artifacts are prohibited; remove the retired sdk_wasm budget');
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
