#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, '..');

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function validateBudgetMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const [key, budget] of Object.entries(value)) {
    if (!key.trim()) throw new Error(`${label} contains an empty key`);
    assertPositiveInteger(budget, `${label}.${key}`);
  }
  return value;
}

export function validateBundleBudgets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bundle budgets must be an object');
  }
  if (value.schema_version !== 3) throw new Error('Unsupported bundle budget schema');
  assertPositiveInteger(value.default_chunk_gzip_bytes, 'default_chunk_gzip_bytes');
  const entries = validateBudgetMap(value.entry_gzip_bytes, 'entry_gzip_bytes');
  const startup = validateBudgetMap(value.entry_startup_gzip_bytes, 'entry_startup_gzip_bytes');
  if (Object.keys(entries).length === 0
    || JSON.stringify(Object.keys(entries).sort()) !== JSON.stringify(Object.keys(startup).sort())) {
    throw new Error('Every entry must have both an entry and total startup budget');
  }
  if ('sdk_wasm' in value) throw new Error('Wasm artifacts are prohibited; remove the retired sdk_wasm budget');
  return {
    schema_version: 3,
    default_chunk_gzip_bytes: value.default_chunk_gzip_bytes,
    chunk_gzip_bytes: validateBudgetMap(value.chunk_gzip_bytes, 'chunk_gzip_bytes'),
    entry_gzip_bytes: entries,
    entry_startup_gzip_bytes: startup,
    route_gzip_bytes: validateBudgetMap(value.route_gzip_bytes, 'route_gzip_bytes'),
  };
}

function manifestItem(manifest, key) {
  const item = manifest[key];
  if (!item || typeof item !== 'object') throw new Error(`Manifest item is missing: ${key}`);
  return item;
}

export function collectStaticManifestKeys(manifest, rootKey) {
  const visited = new Set();
  const pending = [rootKey];
  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    const item = manifestItem(manifest, key);
    visited.add(key);
    for (const importedKey of item.imports ?? []) pending.push(importedKey);
  }
  return visited;
}

export function collectEntryBootManifestKeys(manifest, entryKey) {
  const entry = manifestItem(manifest, entryKey);
  const bootKeys = collectStaticManifestKeys(manifest, entryKey);
  for (const dynamicImportKey of entry.dynamicImports ?? []) {
    for (const key of collectStaticManifestKeys(manifest, dynamicImportKey)) bootKeys.add(key);
  }
  return bootKeys;
}

function assertAssetPath(file) {
  if (typeof file !== 'string' || file.includes('\\')
    || file.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Manifest asset path must be a canonical relative path: ${String(file)}`);
  }
  return file;
}

function assetFilesForKeys(manifest, keys) {
  const files = new Set();
  for (const key of keys) {
    const item = manifestItem(manifest, key);
    if (typeof item.file === 'string') files.add(assertAssetPath(item.file));
    for (const cssFile of item.css ?? []) {
      if (typeof cssFile !== 'string' || !cssFile.endsWith('.css')) {
        throw new Error(`Manifest CSS asset is not CSS: ${String(cssFile)}`);
      }
      files.add(assertAssetPath(cssFile));
    }
    for (const assetFile of item.assets ?? []) files.add(assertAssetPath(assetFile));
  }
  return files;
}

function gzipBytes(distDir, file) {
  const filePath = join(distDir, file);
  if (!existsSync(filePath)) throw new Error(`Manifest asset is missing: ${file}`);
  return gzipSync(readFileSync(filePath), { level: 9 }).byteLength;
}

function sumGzipBytes(distDir, files) {
  let total = 0;
  for (const file of files) total += gzipBytes(distDir, file);
  return total;
}

function findEntryKey(manifest, source) {
  if (manifest[source]?.isEntry) return source;
  return Object.keys(manifest).find((key) => manifest[key]?.isEntry && manifest[key]?.src === source) ?? null;
}

function chunkBudgetKey(item, manifestKey) {
  if (typeof item.name === 'string' && item.name.trim()) return item.name;
  if (typeof item.src === 'string' && item.src.trim()) return item.src;
  return manifestKey;
}

function emittedFiles(distDir, currentDirectory = distDir) {
  const files = [];
  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const absolutePath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...emittedFiles(distDir, absolutePath));
    else if (entry.isFile()) {
      files.push(relative(distDir, absolutePath).split(sep).join('/'));
    } else {
      throw new Error(`Emitted asset must be a regular file: ${absolutePath}`);
    }
  }
  return files;
}

function emittedChunkName(file) {
  const stem = basename(file, '.js');
  return stem.replace(/-[A-Za-z0-9_-]{8,}$/u, '');
}

function measureEntryStartup({ manifest, source, distDir }) {
  const entryKey = findEntryKey(manifest, source);
  if (!entryKey) throw new Error(`Configured entry is missing from the manifest: ${source}`);
  const keys = collectEntryBootManifestKeys(manifest, entryKey);
  const files = assetFilesForKeys(manifest, keys);
  // The HTML document is transferred before its manifest entry module.
  files.add(assertAssetPath(source));
  const categoryFiles = { js_css: [], other_assets: [] };
  for (const file of files) {
    const category = /\.(?:js|css)$/u.test(file) ? 'js_css' : 'other_assets';
    categoryFiles[category].push(file);
  }
  const categories = Object.fromEntries(Object.entries(categoryFiles).map(([category, assets]) => [
    category,
    {
      files: assets.sort(),
      raw_bytes: assets.reduce((sum, file) => sum + readFileSync(join(distDir, file)).byteLength, 0),
      gzip_bytes: sumGzipBytes(distDir, assets),
    },
  ]));
  const total = {
    raw_bytes: Object.values(categories).reduce((sum, category) => sum + category.raw_bytes, 0),
    gzip_bytes: Object.values(categories).reduce((sum, category) => sum + category.gzip_bytes, 0),
  };
  return { source, categories, total };
}

export function evaluateBundleBudgets({ manifest, budgets, distDir }) {
  const checkedBudgets = validateBundleBudgets(budgets);
  const measurements = [];
  const entries = [];
  const outputFiles = emittedFiles(distDir);
  for (const file of outputFiles) {
    const bytes = readFileSync(join(distDir, file));
    if (/\.wasm(?:\.(?:gz|br))?$/iu.test(file) || bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
      throw new Error(`Wasm artifacts are prohibited: ${file}`);
    }
  }

  for (const [source, limit] of Object.entries(checkedBudgets.entry_gzip_bytes)) {
    const entry = measureEntryStartup({ manifest, source, distDir });
    entries.push(entry);
    // Every startup asset, including fonts and the HTML document, is charged.
    const actual = entry.categories.js_css.gzip_bytes + entry.categories.other_assets.gzip_bytes;
    measurements.push({ kind: 'entry', name: source, actual, limit });
    measurements.push({
      kind: 'startup', name: source, actual: entry.total.gzip_bytes,
      limit: checkedBudgets.entry_startup_gzip_bytes[source],
    });
  }

  const initialFiles = new Set(entries.flatMap(({ categories }) => (
    Object.values(categories).flatMap(({ files }) => files)
  )));
  for (const [source, limit] of Object.entries(checkedBudgets.route_gzip_bytes)) {
    if (!manifest[source]) throw new Error(`Configured route is missing from the manifest: ${source}`);
    const routeKeys = collectStaticManifestKeys(manifest, source);
    const incrementalFiles = [...assetFilesForKeys(manifest, routeKeys)]
      .filter((file) => !initialFiles.has(file));
    const actual = sumGzipBytes(distDir, incrementalFiles);
    measurements.push({ kind: 'route', name: source, actual, limit });
  }

  const matchedChunkBudgetKeys = new Set();
  const manifestJavaScriptFiles = new Set();
  for (const [manifestKey, item] of Object.entries(manifest)) {
    if (typeof item?.file !== 'string' || !item.file.endsWith('.js')) continue;
    manifestJavaScriptFiles.add(item.file);
    const name = chunkBudgetKey(item, manifestKey);
    const configuredLimit = checkedBudgets.chunk_gzip_bytes[name];
    if (configuredLimit !== undefined) matchedChunkBudgetKeys.add(name);
    const limit = configuredLimit ?? checkedBudgets.default_chunk_gzip_bytes;
    const actual = gzipBytes(distDir, item.file);
    measurements.push({ kind: 'chunk', name, actual, limit });
  }


  for (const file of outputFiles.filter((file) => file.endsWith('.js'))) {
    if (manifestJavaScriptFiles.has(file)) continue;
    const name = emittedChunkName(file);
    const configuredLimit = checkedBudgets.chunk_gzip_bytes[name];
    if (configuredLimit !== undefined) matchedChunkBudgetKeys.add(name);
    const limit = configuredLimit ?? checkedBudgets.default_chunk_gzip_bytes;
    const actual = gzipBytes(distDir, file);
    measurements.push({ kind: 'chunk', name, actual, limit });
  }

  for (const name of Object.keys(checkedBudgets.chunk_gzip_bytes)) {
    if (!matchedChunkBudgetKeys.has(name)) {
      throw new Error(`Configured chunk is missing from the manifest: ${name}`);
    }
  }

  const failures = measurements
    .filter(({ actual, limit }) => actual > limit)
    .map((measurement) => ({ ...measurement }));
  return { measurements, failures, entries };
}

export function formatBundleBudgetReport(result) {
  const lines = result.entries.flatMap(({ source, categories, total }) => [
    ...Object.entries(categories).map(([category, size]) => (
      `INFO startup ${source} ${category}: ${size.raw_bytes} raw bytes; ${size.gzip_bytes} gzip bytes`
    )),
    `INFO startup ${source} total: ${total.raw_bytes} raw bytes; ${total.gzip_bytes} gzip bytes`,
  ]);
  lines.push(...[...result.measurements]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map(({ kind, name, actual, limit, unit = 'gzip' }) => {
      const state = actual > limit ? 'FAIL' : 'PASS';
      return `${state} ${kind.padEnd(8)} ${name}: ${actual} / ${limit} ${unit} bytes`;
    }));
  lines.push(result.failures.length === 0
    ? 'Bundle budget check passed.'
    : `Bundle budget check failed with ${result.failures.length} over-budget artifact(s).`);
  return lines.join('\n');
}

export function runBundleBudgetCheck(options = {}) {
  const distDir = resolve(options.distDir ?? join(WORKSPACE_ROOT, 'dist'));
  const manifestPath = resolve(options.manifestPath ?? join(distDir, '.vite/manifest.json'));
  const budgetPath = resolve(options.budgetPath ?? join(WORKSPACE_ROOT, 'bundle-budgets.json'));
  if (!existsSync(manifestPath)) {
    throw new Error(`Vite manifest not found at ${manifestPath}; run pnpm build:vite first`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
  return evaluateBundleBudgets({ manifest, budgets, distDir });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = runBundleBudgetCheck();
    process.stdout.write(`${formatBundleBudgetReport(result)}\n`);
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
