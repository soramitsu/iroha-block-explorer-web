import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CI_REPOSITORY_ROOT = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
);
const CI_TEMP_ROOT = realpathSync(tmpdir());

function gate({ label, command, args, env = undefined }) {
  return Object.freeze({
    args: Object.freeze(args),
    command,
    env: env ? Object.freeze(env) : undefined,
    label,
  });
}

function assertNormalizedAbsolutePath(candidate, label) {
  if (
    typeof candidate !== 'string'
    || !path.isAbsolute(candidate)
    || path.resolve(candidate) !== candidate
  ) {
    throw new Error(`${label} must be an absolute normalized path`);
  }
}

function assertCanonicalDirectory(candidate, label) {
  assertNormalizedAbsolutePath(candidate, label);
  let canonical;
  let stats;
  try {
    canonical = realpathSync(candidate);
    stats = statSync(candidate);
  } catch (cause) {
    throw new Error(`${label} must be an existing canonical directory`, { cause });
  }
  if (!stats.isDirectory()) {
    throw new Error(`${label} must be an existing canonical directory`);
  }
  if (canonical !== candidate) {
    throw new Error(`${label} must be canonical and must not traverse symbolic links`);
  }
}

const FIXED_COREPACK_ENVIRONMENT = Object.freeze({
  COREPACK_DEFAULT_TO_LATEST: '0',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  COREPACK_ENABLE_NETWORK: '1',
  COREPACK_ENABLE_PROJECT_SPEC: '1',
  COREPACK_ENABLE_STRICT: '1',
  COREPACK_ENABLE_UNSAFE_CUSTOM_URLS: '0',
  COREPACK_ENV_FILE: '0',
  COREPACK_NPM_REGISTRY: 'https://registry.npmjs.org',
  COREPACK_USE_LATEST: '0',
});
const CI_GATE_ENVIRONMENT_KEYS = Object.freeze([
  ...Object.keys(FIXED_COREPACK_ENVIRONMENT),
  'CI',
  'COREPACK_HOME',
  'HOME',
  'IROHA_REPO_ROOT',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_GLOBALCONFIG',
  'NPM_CONFIG_REGISTRY',
  'NPM_CONFIG_USERCONFIG',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PNPM_HOME',
  'RUN_LIVE_MOCHI_E2E',
  'TEMP',
  'TMP',
  'TMPDIR',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
]);

export function sanitizedCiEnvironment(source, { isolatedRoot }) {
  assertNormalizedAbsolutePath(isolatedRoot, 'CI isolated root');
  const environment = {
    ...FIXED_COREPACK_ENVIRONMENT,
    CI: '1',
    HOME: path.join(isolatedRoot, 'home'),
    NPM_CONFIG_CACHE: path.join(isolatedRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: path.join(isolatedRoot, 'npm-globalconfig'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    NPM_CONFIG_USERCONFIG: path.join(isolatedRoot, 'npm-userconfig'),
    PATH: source.PATH || '',
    PNPM_HOME: path.join(isolatedRoot, 'pnpm-home'),
    TEMP: path.join(isolatedRoot, 'tmp'),
    TMP: path.join(isolatedRoot, 'tmp'),
    TMPDIR: path.join(isolatedRoot, 'tmp'),
    XDG_CACHE_HOME: path.join(isolatedRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: path.join(isolatedRoot, 'xdg-config'),
    XDG_DATA_HOME: path.join(isolatedRoot, 'xdg-data'),
  };

  if (source.COREPACK_HOME !== undefined) {
    assertNormalizedAbsolutePath(source.COREPACK_HOME, 'Corepack home');
    environment.COREPACK_HOME = source.COREPACK_HOME;
  }
  if (source.RUN_LIVE_MOCHI_E2E === '1') {
    environment.RUN_LIVE_MOCHI_E2E = '1';
    if (source.IROHA_REPO_ROOT !== undefined) {
      assertCanonicalDirectory(source.IROHA_REPO_ROOT, 'IROHA_REPO_ROOT');
      environment.IROHA_REPO_ROOT = source.IROHA_REPO_ROOT;
    }
  }
  if (source.PLAYWRIGHT_BROWSERS_PATH !== undefined) {
    assertNormalizedAbsolutePath(
      source.PLAYWRIGHT_BROWSERS_PATH,
      'PLAYWRIGHT_BROWSERS_PATH'
    );
    environment.PLAYWRIGHT_BROWSERS_PATH = source.PLAYWRIGHT_BROWSERS_PATH;
  }
  return environment;
}

export function buildCiGates({ runLiveMochi = false, storeDir } = {}) {
  assertNormalizedAbsolutePath(storeDir, 'CI pnpm store');
  const gates = [
    gate({
      args: ['scripts/check-node-version.mjs'],
      command: 'node',
      label: 'exact Node version',
    }),
    gate({
      args: ['scripts/check-iroha-pin.mjs'],
      command: 'node',
      label: 'exact Iroha SDK pin',
    }),
    gate({
      args: ['fetch', '--frozen-lockfile', '--store-dir', storeDir],
      command: 'pnpm',
      label: 'frozen dependency fetch',
    }),
    gate({
      args: [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--force',
        '--store-dir',
        storeDir,
      ],
      command: 'pnpm',
      label: 'offline frozen install',
    }),
    gate({ args: ['check:roadmap'], command: 'pnpm', label: 'roadmap integrity' }),
    gate({ args: ['lint'], command: 'pnpm', label: 'lint' }),
    gate({ args: ['test:unit'], command: 'pnpm', label: 'unit tests' }),
    gate({ args: ['typecheck'], command: 'pnpm', label: 'typecheck' }),
    gate({ args: ['build:vite'], command: 'pnpm', label: 'production build' }),
    gate({ args: ['check:bundle'], command: 'pnpm', label: 'bundle budgets' }),
    gate({
      args: ['test:playwright:hermetic'],
      command: 'pnpm',
      env: { PLAYWRIGHT_REUSE_BUILD: '1' },
      label: 'hermetic Playwright',
    }),
  ];
  if (runLiveMochi) {
    gates.push(
      gate({
        args: ['test:playwright:mochi'],
        command: 'pnpm',
        env: { PLAYWRIGHT_REUSE_BUILD: '1' },
        label: 'live Mochi Playwright',
      })
    );
  }
  return gates;
}

export function executeCiGates(
  gates,
  spawn = spawnSync,
  {
    environment = process.env,
    isolatedRoot = undefined,
    repositoryRoot = CI_REPOSITORY_ROOT,
  } = {}
) {
  const effectiveEnvironment = isolatedRoot === undefined
    ? {
        CI: '1',
        PATH: environment.PATH || '',
        ...(environment.PLAYWRIGHT_BROWSERS_PATH === undefined
          ? {}
          : {
              PLAYWRIGHT_BROWSERS_PATH: (() => {
                assertNormalizedAbsolutePath(
                  environment.PLAYWRIGHT_BROWSERS_PATH,
                  'PLAYWRIGHT_BROWSERS_PATH'
                );
                return environment.PLAYWRIGHT_BROWSERS_PATH;
              })(),
            }),
      }
    : sanitizedCiEnvironment(environment, { isolatedRoot });
  for (const current of gates) {
    console.log(`CI GATE: ${current.label}`);
    const childEnvironment = {};
    for (const key of CI_GATE_ENVIRONMENT_KEYS) {
      if (key === 'IROHA_REPO_ROOT' && current.label !== 'live Mochi Playwright') {
        continue;
      }
      if (effectiveEnvironment[key] !== undefined) {
        childEnvironment[key] = effectiveEnvironment[key];
      }
    }
    Object.assign(childEnvironment, current.env, { CI: '1' });
    const result = spawn(current.command, current.args, {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.signal) {
      throw new Error(`${current.label} terminated by signal ${result.signal}`);
    }
    if (result.status !== 0) {
      throw new Error(
        `${current.label} exited with status ${result.status ?? 'unknown'}`
      );
    }
  }
}

function effectiveUid() {
  const getter = typeof process.geteuid === 'function' ? process.geteuid : process.getuid;
  if (typeof getter !== 'function') {
    throw new Error('CI store isolation requires numeric filesystem ownership');
  }
  return getter.call(process);
}

function assertPrivateStoreRoot(stats, directory) {
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`CI store root must be a real directory: ${directory}`);
  }
  if (stats.uid !== effectiveUid()) {
    throw new Error(`CI store root must be owned by the current account: ${directory}`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`CI store root must have mode 0700: ${directory}`);
  }
}

async function inspectStoreRoot(directory, { lstatFn, realpathFn }) {
  const stats = await lstatFn(directory);
  assertPrivateStoreRoot(stats, directory);
  if ((await realpathFn(directory)) !== directory) {
    throw new Error(`CI store root must be canonical and must not traverse symlinks: ${directory}`);
  }
  return stats;
}

async function prepareIsolatedCiEnvironment(
  isolatedRoot,
  environment,
  { mkdirFn, writeFileFn }
) {
  const privateDirectories = [
    'home',
    'npm-cache',
    'pnpm-home',
    'tmp',
    'xdg-cache',
    'xdg-config',
    'xdg-data',
  ].map((name) => path.join(isolatedRoot, name));
  await Promise.all(
    privateDirectories.map((directory) => mkdirFn(directory, { mode: 0o700 }))
  );
  await Promise.all([
    writeFileFn(path.join(isolatedRoot, 'npm-globalconfig'), '', { mode: 0o600 }),
    writeFileFn(path.join(isolatedRoot, 'npm-userconfig'), '', { mode: 0o600 }),
  ]);
  return sanitizedCiEnvironment(environment, { isolatedRoot });
}

async function removeIsolatedCiRoot(
  isolatedRoot,
  initialStats,
  { lstatFn, realpathFn, removeFn }
) {
  if (!initialStats) return;
  const currentStats = await inspectStoreRoot(isolatedRoot, { lstatFn, realpathFn });
  if (
    currentStats.dev !== initialStats.dev
    || currentStats.ino !== initialStats.ino
  ) {
    throw new Error('CI store root identity changed before cleanup');
  }
  await removeFn(isolatedRoot, { force: true, recursive: true });
}

function returnOrThrowCiGateResult(actionResult, actionError, cleanupError) {
  if (actionError && cleanupError) {
    throw new AggregateError(
      [actionError, cleanupError],
      'CI gates and isolated-store cleanup both failed',
      { cause: actionError }
    );
  }
  if (actionError) throw actionError;
  if (cleanupError) throw cleanupError;
  return actionResult;
}

function isMissingPathError(error) {
  return error !== null
    && typeof error === 'object'
    && error.code === 'ENOENT';
}

/**
 * Keep an existing dependency tree byte-for-byte while pnpm links the isolated
 * CI install into the repository. The backup is a sibling on the same
 * filesystem, so both moves are atomic and do not depend on the temporary
 * store's mount.
 */
export async function withPreservedNodeModules(
  action,
  {
    chmodFn = chmod,
    lstatFn = lstat,
    mkdtempFn = mkdtemp,
    removeFn = rm,
    renameFn = rename,
    repositoryRoot = CI_REPOSITORY_ROOT,
    rmdirFn = rmdir,
  } = {}
) {
  assertCanonicalDirectory(repositoryRoot, 'CI repository root');
  const nodeModulesPath = path.join(repositoryRoot, 'node_modules');
  const backupPrefix = path.join(
    repositoryRoot,
    '.iroha-explorer-ci-node-modules-'
  );
  const backupRoot = await mkdtempFn(backupPrefix);
  if (
    path.dirname(backupRoot) !== repositoryRoot
    || !path.basename(backupRoot).startsWith('.iroha-explorer-ci-node-modules-')
  ) {
    throw new Error(`mkdtemp returned an unexpected node_modules backup root: ${backupRoot}`);
  }
  const backupNodeModulesPath = path.join(backupRoot, 'node_modules');

  let originalMoved = false;
  let setupError = null;
  try {
    await chmodFn(backupRoot, 0o700);
    try {
      await lstatFn(nodeModulesPath);
      await renameFn(nodeModulesPath, backupNodeModulesPath);
      originalMoved = true;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  } catch (error) {
    setupError = error;
  }
  if (setupError) {
    let setupCleanupError = null;
    try {
      await rmdirFn(backupRoot);
    } catch (error) {
      setupCleanupError = error;
    }
    return returnOrThrowCiGateResult(undefined, setupError, setupCleanupError);
  }

  let actionResult;
  let actionError = null;
  try {
    actionResult = await action();
  } catch (error) {
    actionError = error;
  }

  let restoreError = null;
  try {
    await removeFn(nodeModulesPath, { force: true, recursive: true });
    if (originalMoved) {
      await renameFn(backupNodeModulesPath, nodeModulesPath);
    }
    await rmdirFn(backupRoot);
  } catch (error) {
    restoreError = error;
  }

  return returnOrThrowCiGateResult(actionResult, actionError, restoreError);
}

export async function withIsolatedCiStore(
  action,
  {
    chmodFn = chmod,
    environment = process.env,
    lstatFn = lstat,
    mkdirFn = mkdir,
    mkdtempFn = mkdtemp,
    realpathFn = realpath,
    removeFn = rm,
    temporaryRoot = CI_TEMP_ROOT,
    writeFileFn = writeFile,
  } = {}
) {
  assertNormalizedAbsolutePath(temporaryRoot, 'CI temporary root');
  const prefix = path.join(temporaryRoot, 'iroha-explorer-ci-');
  const isolatedRoot = await mkdtempFn(prefix);
  if (
    path.dirname(isolatedRoot) !== temporaryRoot
    || !path.basename(isolatedRoot).startsWith('iroha-explorer-ci-')
  ) {
    throw new Error(`mkdtemp returned an unexpected CI store root: ${isolatedRoot}`);
  }

  let initialStats = null;
  let actionResult;
  let actionError = null;
  try {
    await chmodFn(isolatedRoot, 0o700);
    initialStats = await inspectStoreRoot(isolatedRoot, { lstatFn, realpathFn });
    const childEnvironment = await prepareIsolatedCiEnvironment(
      isolatedRoot,
      environment,
      { mkdirFn, writeFileFn }
    );
    actionResult = await action({
      environment: childEnvironment,
      isolatedRoot,
      storeDir: path.join(isolatedRoot, 'pnpm-store'),
    });
  } catch (error) {
    actionError = error;
  }

  let cleanupError = null;
  try {
    await removeIsolatedCiRoot(isolatedRoot, initialStats, {
      lstatFn,
      realpathFn,
      removeFn,
    });
  } catch (error) {
    cleanupError = error;
  }

  return returnOrThrowCiGateResult(actionResult, actionError, cleanupError);
}

async function main() {
  const runLiveMochi = process.env.RUN_LIVE_MOCHI_E2E === '1';
  if (!runLiveMochi) {
    console.log('CI GATE: live Mochi not requested; set RUN_LIVE_MOCHI_E2E=1 to enable it');
  }
  await withIsolatedCiStore(async ({ environment, isolatedRoot, storeDir }) => {
    await withPreservedNodeModules(() => {
      executeCiGates(buildCiGates({ runLiveMochi, storeDir }), spawnSync, {
        environment,
        isolatedRoot,
      });
    });
  });
}

if (process.argv[1]?.endsWith('run-ci-gates.mjs')) {
  try {
    await main();
  } catch (error) {
    console.error(`CI GATE: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
