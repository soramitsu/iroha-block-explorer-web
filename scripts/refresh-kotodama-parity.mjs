import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const fixturesDir = path.join(repoRoot, 'tests/fixtures/kotodama-parity');
const negativeFixturesDir = path.join(fixturesDir, 'sources');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'kotodama-parity-'));
const irohaRoot = path.resolve(repoRoot, '../iroha');
const upstreamCorpusRoots = [
  { rootDir: path.resolve(irohaRoot, 'demo'), idStyle: 'basename' },
  { rootDir: path.resolve(irohaRoot, 'crates/kotodama_lang/src/samples'), idStyle: 'basename' },
  { rootDir: path.resolve(irohaRoot, 'crates/ivm/docs/examples'), idStyle: 'relative-path' },
  { rootDir: path.resolve(irohaRoot, 'crates/ivm/tests/data'), idStyle: 'relative-path' },
  { rootDir: path.resolve(irohaRoot, 'docs/portal/static/norito-snippets'), idStyle: 'relative-path' },
  { rootDir: path.resolve(irohaRoot, 'examples'), idStyle: 'relative-path', recursive: true },
  { rootDir: path.resolve(irohaRoot, 'fuzz/attachments/zk/kotodama'), idStyle: 'relative-path' },
  { rootDir: path.resolve(irohaRoot, 'tools/kotodama_linguist/samples'), idStyle: 'relative-path' },
];

function normalizeSource(source) {
  return source.replace(/\r\n/g, '\n');
}

function normalizeStderr(stderr) {
  return stderr
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeSourcePath(sourcePath) {
  if (!sourcePath) return null;
  const relativePath = path.relative(irohaRoot, sourcePath);
  const normalized = relativePath.startsWith('..') ? path.basename(sourcePath) : relativePath;
  return normalized.split(path.sep).join('/');
}

function resolveCompilerSourcePath(sourcePath) {
  const relativePath = path.relative(irohaRoot, sourcePath);
  return relativePath.startsWith('..')
    ? sourcePath
    : relativePath.split(path.sep).join('/');
}

function normalizeSourceMap(entries) {
  return entries.map((entry) => ({
    ...entry,
    source_path: normalizeSourcePath(entry.source_path),
  }));
}

function normalizeBudgetReport(entries) {
  return entries.map((entry) => ({
    ...entry,
    source_path: normalizeSourcePath(entry.source_path),
  }));
}

function discoverKoFiles(rootDir, { recursive = false } = {}) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.ko')) {
      return [entryPath];
    }
    if (recursive && entry.isDirectory()) {
      return discoverKoFiles(entryPath, { recursive });
    }
    return [];
  });

  return files.sort();
}

function slugifyFixtureId(raw) {
  return raw.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/g, '');
}

function createFixtureId(sourcePath, idStyle = 'basename') {
  if (idStyle === 'basename') {
    return slugifyFixtureId(path.basename(sourcePath, '.ko'));
  }

  const relativePath = resolveCompilerSourcePath(sourcePath).replace(/\.ko$/u, '');
  return slugifyFixtureId(relativePath);
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveCompilerCommand() {
  if (process.env.KOTO_BIN) {
    return {
      command: process.env.KOTO_BIN,
      baseArgs: [],
      cwd: irohaRoot,
    };
  }

  return {
    command: 'cargo',
    baseArgs: ['run', '-q', '-p', 'ivm', '--bin', 'koto_compile', '--'],
    cwd: path.resolve(repoRoot, '../iroha'),
  };
}

function buildFailureDiagnostics(stderrLines) {
  const diagnosticLines = [];
  for (const line of stderrLines) {
    if (/^\^+$/u.test(line) && diagnosticLines.length > 0) {
      diagnosticLines.pop();
      continue;
    }
    diagnosticLines.push(line);
  }

  return diagnosticLines.map((message) => ({
    severity: 'error',
    message,
    code: null,
    phase: null,
  }));
}

function collectCorpusEntries() {
  const ids = new Set();
  const claimId = (sourcePath, idStyle) => {
    const id = createFixtureId(sourcePath, idStyle);
    if (ids.has(id)) {
      throw new Error(`Duplicate parity fixture id \`${id}\` from ${sourcePath}`);
    }
    ids.add(id);
    return id;
  };

  const upstreamEntries = upstreamCorpusRoots
    .flatMap(({ rootDir, idStyle, recursive }) => discoverKoFiles(rootDir, { recursive })
      .map((sourcePath) => ({ sourcePath, idStyle })))
    .map(({ sourcePath, idStyle }) => ({
      id: claimId(sourcePath, idStyle),
      sourcePath,
      origin: 'upstream',
    }));

  const localNegativeEntries = discoverKoFiles(negativeFixturesDir)
    .map((sourcePath) => ({
      id: claimId(sourcePath, 'basename'),
      sourcePath,
      origin: 'negative',
    }));

  return {
    upstreamEntries,
    localNegativeEntries,
  };
}

function compileFixture(entry, compiler) {
  const fixtureTempDir = path.join(tempRoot, entry.id);
  mkdirSync(fixtureTempDir, { recursive: true });

  const artifactPath = path.join(fixtureTempDir, `${entry.id}.to`);
  const manifestPath = path.join(fixtureTempDir, `${entry.id}.manifest.json`);
  const sourceMapPath = path.join(fixtureTempDir, `${entry.id}.source-map.json`);
  const budgetReportPath = path.join(fixtureTempDir, `${entry.id}.budget-report.json`);

  const args = [
    ...compiler.baseArgs,
    resolveCompilerSourcePath(entry.sourcePath),
    '--abi', '1',
    '--no-lint',
    '--out', artifactPath,
    '--manifest-out', manifestPath,
    '--emit-source-map', sourceMapPath,
    '--emit-budget-report', budgetReportPath,
    '--diagnostic-format', 'json',
  ];

  const result = spawnSync(compiler.command, args, {
    cwd: compiler.cwd ?? repoRoot,
    encoding: 'utf8',
  });

  const source = normalizeSource(readFileSync(entry.sourcePath, 'utf8'));
  const stderrLines = normalizeStderr(result.stderr ?? '');

  if (result.status !== 0) {
    return {
      version: 1,
      id: entry.id,
      source_name: path.basename(entry.sourcePath),
      compiler_source_path: resolveCompilerSourcePath(entry.sourcePath),
      source,
      rust: {
        kind: 'failure',
        diagnostics: buildFailureDiagnostics(stderrLines),
        compiler_stderr: stderrLines,
      },
    };
  }

  return {
    version: 1,
    id: entry.id,
    source_name: path.basename(entry.sourcePath),
    compiler_source_path: resolveCompilerSourcePath(entry.sourcePath),
    source,
    rust: {
      kind: 'success',
      artifact_b64: readFileSync(artifactPath).toString('base64'),
      manifest: loadJson(manifestPath),
      source_map: normalizeSourceMap(loadJson(sourceMapPath)),
      budget_report: normalizeBudgetReport(loadJson(budgetReportPath)),
      diagnostics: [],
      compiler_stderr: stderrLines,
    },
  };
}

try {
  const compiler = resolveCompilerCommand();
  const staleFixtures = readdirSync(fixturesDir).filter((entry) => entry.endsWith('.json'));
  const { upstreamEntries, localNegativeEntries } = collectCorpusEntries();
  const upstreamFailures = [];

  for (const staleFixture of staleFixtures) {
    rmSync(path.join(fixturesDir, staleFixture));
  }

  for (const entry of upstreamEntries) {
    const fixture = compileFixture(entry, compiler);
    if (fixture.rust.kind === 'failure') {
      upstreamFailures.push({
        id: entry.id,
        source: path.relative(repoRoot, entry.sourcePath),
        diagnostics: fixture.rust.compiler_stderr,
      });
    }
    const fixturePath = path.join(fixturesDir, `${entry.id}.json`);
    writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`wrote ${path.relative(repoRoot, fixturePath)}`);
  }

  for (const entry of localNegativeEntries) {
    const fixture = compileFixture(entry, compiler);
    if (fixture.rust.kind !== 'failure') {
      throw new Error(`Local negative fixture ${entry.sourcePath} compiled successfully under Rust.`);
    }
    const fixturePath = path.join(fixturesDir, `${entry.id}.json`);
    writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`wrote ${path.relative(repoRoot, fixturePath)}`);
  }

  console.log(`included ${upstreamEntries.length} upstream fixture(s), ${upstreamFailures.length} upstream failure fixture(s), and ${localNegativeEntries.length} local negative fixture(s)`);
  if (upstreamFailures.length > 0) {
    console.log(`included ${upstreamFailures.length} upstream compile failure fixture(s):`);
    for (const failure of upstreamFailures) {
      const detail = failure.diagnostics[0] ?? 'compile failure';
      console.log(`- ${failure.id} (${failure.source}): ${detail}`);
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
