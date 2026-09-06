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
  if (value.schema_version !== 1) throw new Error('Unsupported bundle budget schema');
  assertPositiveInteger(value.default_chunk_gzip_bytes, 'default_chunk_gzip_bytes');
  return {
    schema_version: 1,
    default_chunk_gzip_bytes: value.default_chunk_gzip_bytes,
    chunk_gzip_bytes: validateBudgetMap(value.chunk_gzip_bytes, 'chunk_gzip_bytes'),
    entry_gzip_bytes: validateBudgetMap(value.entry_gzip_bytes, 'entry_gzip_bytes'),
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

function assetFilesForKeys(manifest, keys) {
  const files = new Set();
  for (const key of keys) {
    const item = manifestItem(manifest, key);
    if (typeof item.file === 'string') files.add(item.file);
    for (const cssFile of item.css ?? []) files.add(cssFile);
    for (const assetFile of item.assets ?? []) files.add(assetFile);
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

function emittedJavaScriptFiles(distDir, currentDirectory = distDir) {
  const files = [];
  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const absolutePath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...emittedJavaScriptFiles(distDir, absolutePath));
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relative(distDir, absolutePath).split(sep).join('/'));
    }
  }
  return files;
}

function emittedChunkName(file) {
  const stem = basename(file, '.js');
  return stem.replace(/-[A-Za-z0-9_-]{8,}$/u, '');
}

export function evaluateBundleBudgets({ manifest, budgets, distDir }) {
  const checkedBudgets = validateBundleBudgets(budgets);
  const measurements = [];
  const entryClosures = new Map();

  for (const [source, limit] of Object.entries(checkedBudgets.entry_gzip_bytes)) {
    const entryKey = findEntryKey(manifest, source);
    if (!entryKey) throw new Error(`Configured entry is missing from the manifest: ${source}`);
    const keys = collectEntryBootManifestKeys(manifest, entryKey);
    entryClosures.set(entryKey, keys);
    const actual = sumGzipBytes(distDir, assetFilesForKeys(manifest, keys));
    measurements.push({ kind: 'entry', name: source, actual, limit });
  }

  const initialKeys = new Set([...entryClosures.values()].flatMap((keys) => [...keys]));
  for (const [source, limit] of Object.entries(checkedBudgets.route_gzip_bytes)) {
    if (!manifest[source]) throw new Error(`Configured route is missing from the manifest: ${source}`);
    const routeKeys = collectStaticManifestKeys(manifest, source);
    const incrementalKeys = new Set([...routeKeys].filter((key) => !initialKeys.has(key)));
    const actual = sumGzipBytes(distDir, assetFilesForKeys(manifest, incrementalKeys));
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


  for (const file of emittedJavaScriptFiles(distDir)) {
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
  return { measurements, failures };
}

export function formatBundleBudgetReport(result) {
  const lines = result.measurements
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map(({ kind, name, actual, limit }) => {
      const state = actual > limit ? 'FAIL' : 'PASS';
      return `${state} ${kind.padEnd(5)} ${name}: ${actual} / ${limit} gzip bytes`;
    });
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
