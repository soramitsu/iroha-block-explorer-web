import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { REQUIRED_NODE_VERSION, assertRequiredNodeVersion } from './check-node-version.mjs';

export const REQUIRED_PNPM_VERSION = '10.11.0';
export const REQUIRED_PNPM_INTEGRITY =
  'sha512.6540583f41cc5f628eb3d9773ecee802f4f9ef9923cc45b69890fb47991d4b092964694ec3a4f738a420c918a333062c8b925d312f42e4f0c263eb603551f977';
export const NODE_DOWNLOAD_ORIGIN = `https://nodejs.org/dist/v${REQUIRED_NODE_VERSION}`;
export const EXACT_TOOLCHAIN_REPOSITORY_ROOT = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
);
export const TAIRA_RELEASE_TOOL_PATH = path.join(EXACT_TOOLCHAIN_REPOSITORY_ROOT, 'ops', 'taira', 'release-tool.mjs');
export const TAIRA_RELEASE_ATTESTATION_ENV = 'IROHA_EXPLORER_TAIRA_RELEASE_ATTESTATION';
export const TAIRA_RELEASE_ATTESTATION_NONCE_ENV = 'IROHA_EXPLORER_TAIRA_RELEASE_ATTESTATION_NONCE';
export const TAIRA_GIT_VERIFY_GPG_ENV = 'IROHA_EXPLORER_TAIRA_GIT_VERIFY_GPG';
export const TAIRA_GIT_VERIFY_GNUPGHOME_ENV = 'IROHA_EXPLORER_TAIRA_GIT_VERIFY_GNUPGHOME';
export const TAIRA_RELEASE_SIGNERS_PATH = path.join(
  EXACT_TOOLCHAIN_REPOSITORY_ROOT,
  'ops',
  'taira',
  'trusted-release-signers.asc'
);
export const TAIRA_RELEASE_SIGNERS_SHA256 = '6e5f5a01094f7257c7bb29708d2479d67beeb0cc945b20cce2b24f6b84c7808e';
export const TAIRA_RELEASE_SIGNER_FINGERPRINT = '9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB';

const TAIRA_RELEASE_COMMON_ENVIRONMENT_KEYS = Object.freeze([
  'TAIRA_EXPLORER_RELEASES_DIR',
  'TAIRA_EXPLORER_ROOT',
  'TAIRA_EXPLORER_SERVED_DIST',
  'TAIRA_NGINX_BIN',
  'TAIRA_NGINX_CONFIG_DUMP',
]);
const TAIRA_RELEASE_COMMAND_ENVIRONMENT_KEYS = Object.freeze({
  manifest: Object.freeze([
    'TAIRA_EXPLORER_REVISION',
    'TAIRA_SDK_REVISION',
    'TAIRA_RUNTIME_REVISION',
    'TAIRA_MANIFEST_OUTPUT',
    'TAIRA_RUNTIME_CONFIG',
  ]),
  initialize: Object.freeze(['TAIRA_BASELINE_MANIFEST', 'TAIRA_RUNTIME_CONFIG']),
  deploy: Object.freeze(['TAIRA_RUNTIME_CONFIG']),
  'prepare-transition': Object.freeze(['TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION', 'TAIRA_RUNTIME_CONFIG']),
  transition: Object.freeze(['TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION']),
  verify: Object.freeze([]),
  rollback: Object.freeze([]),
});

const CANONICAL_TEMP_ROOT = realpathSync(tmpdir());
const CANONICAL_HOME_ROOT = realpathSync(homedir());

const NODE_ARTIFACTS = Object.freeze({
  'darwin-arm64': Object.freeze({
    file: `node-v${REQUIRED_NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: '8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d',
  }),
  'darwin-x64': Object.freeze({
    file: `node-v${REQUIRED_NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: 'd1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316',
  }),
  'linux-arm64': Object.freeze({
    file: `node-v${REQUIRED_NODE_VERSION}-linux-arm64.tar.gz`,
    sha256: 'd28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f',
  }),
  'linux-x64': Object.freeze({
    file: `node-v${REQUIRED_NODE_VERSION}-linux-x64.tar.gz`,
    sha256: 'f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4',
  }),
});

export function resolveNodeArtifact(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const artifact = NODE_ARTIFACTS[key];
  if (!artifact) {
    throw new Error(`Node ${REQUIRED_NODE_VERSION} bootstrap does not support platform ${platform}/${arch}`);
  }
  return artifact;
}

export function assertRequiredPnpmVersion(version) {
  const normalized = String(version).trim();
  if (normalized !== REQUIRED_PNPM_VERSION) {
    throw new Error(`pnpm ${REQUIRED_PNPM_VERSION} is required, found ${normalized || 'unknown'}`);
  }
  return normalized;
}

export function resolveToolchainCache(override = process.env.IROHA_EXPLORER_TOOLCHAIN_CACHE) {
  const candidate = override ?? path.join(CANONICAL_TEMP_ROOT, 'iroha-explorer-web-toolchain');
  if (!path.isAbsolute(candidate) || path.resolve(candidate) !== candidate) {
    throw new Error('IROHA_EXPLORER_TOOLCHAIN_CACHE must be an absolute normalized path');
  }
  const root = path.parse(candidate).root;
  const relativeToRepository = path.relative(EXACT_TOOLCHAIN_REPOSITORY_ROOT, candidate);
  const insideRepository =
    relativeToRepository === '' ||
    (!relativeToRepository.startsWith(`..${path.sep}`) &&
      relativeToRepository !== '..' &&
      !path.isAbsolute(relativeToRepository));
  if (
    candidate === root ||
    candidate === CANONICAL_TEMP_ROOT ||
    candidate === CANONICAL_HOME_ROOT ||
    insideRepository ||
    path.dirname(candidate) === root
  ) {
    throw new Error(`Refusing broad or in-repository exact-toolchain cache: ${candidate}`);
  }
  return candidate;
}

function checkedSpawn(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function deploymentUid() {
  const getter = typeof process.geteuid === 'function' ? process.geteuid : process.getuid;
  if (typeof getter !== 'function') {
    throw new Error('The exact toolchain requires numeric filesystem ownership');
  }
  return getter.call(process);
}

function assertOwnedPrivateDirectory(stats, directory, name) {
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${name} must be a real directory: ${directory}`);
  }
  if (stats.uid !== deploymentUid()) {
    throw new Error(`${name} must be owned by the current account: ${directory}`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`${name} must have mode 0700: ${directory}`);
  }
}

async function inspectOwnedPrivateDirectory(directory, name) {
  const stats = await lstat(directory);
  assertOwnedPrivateDirectory(stats, directory, name);
  if ((await realpath(directory)) !== directory) {
    throw new Error(`${name} must not traverse symbolic links: ${directory}`);
  }
  return stats;
}

async function validateCanonicalParent(parent) {
  const stats = await lstat(parent);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (await realpath(parent)) !== parent) {
    throw new Error(`Exact-toolchain cache parent must be a canonical real directory: ${parent}`);
  }
  const isPrivateOwnerDirectory = stats.uid === deploymentUid() && (stats.mode & 0o022) === 0;
  const isSystemTemporaryRoot = parent === CANONICAL_TEMP_ROOT && (stats.mode & 0o1000) !== 0;
  if (!isPrivateOwnerDirectory && !isSystemTemporaryRoot) {
    throw new Error(`Exact-toolchain cache parent must be owner-controlled or the sticky temp root: ${parent}`);
  }
}

export async function validateToolchainCacheDirectory(override = process.env.IROHA_EXPLORER_TOOLCHAIN_CACHE) {
  const effectiveCacheRoot = resolveToolchainCache(override);
  const parent = path.dirname(effectiveCacheRoot);
  await validateCanonicalParent(parent);

  if (!(await pathExists(effectiveCacheRoot))) {
    try {
      await mkdir(effectiveCacheRoot, { mode: 0o700 });
      await chmod(effectiveCacheRoot, 0o700);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  await inspectOwnedPrivateDirectory(effectiveCacheRoot, 'Exact-toolchain cache');
  return effectiveCacheRoot;
}

export async function validatePlaywrightBrowserCacheDirectory(
  override = process.env.IROHA_EXPLORER_TOOLCHAIN_CACHE
) {
  const cacheRoot = await validateToolchainCacheDirectory(override);
  const browserCache = path.join(cacheRoot, 'ms-playwright');
  if (!(await pathExists(browserCache))) {
    try {
      await mkdir(browserCache, { mode: 0o700 });
      await chmod(browserCache, 0o700);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  await inspectOwnedPrivateDirectory(browserCache, 'Playwright browser cache');
  return browserCache;
}

function normalizePlaywrightBrowsersPath(value) {
  const browserPath = String(value);
  if (!path.isAbsolute(browserPath) || path.resolve(browserPath) !== browserPath) {
    throw new Error('PLAYWRIGHT_BROWSERS_PATH must be an absolute normalized path');
  }
  return browserPath;
}

export async function resolvePlaywrightBrowsersPath(
  source,
  cacheOverride = source.IROHA_EXPLORER_TOOLCHAIN_CACHE
) {
  if (source.PLAYWRIGHT_BROWSERS_PATH !== undefined) {
    return normalizePlaywrightBrowsersPath(source.PLAYWRIGHT_BROWSERS_PATH);
  }
  return validatePlaywrightBrowserCacheDirectory(cacheOverride);
}

export function sanitizedExactToolchainEnvironment(
  source,
  {
    nodeBin,
    corepackHome,
    playwrightBrowsersPath = undefined,
    toolBin,
    toolRoot = path.dirname(corepackHome),
  }
) {
  for (const [value, label] of [
    [nodeBin, 'verified Node bin'],
    [corepackHome, 'Corepack home'],
    [toolBin, 'exact-toolchain bin'],
    [toolRoot, 'exact-toolchain run root'],
  ]) {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) {
      throw new Error(`${label} must be an absolute normalized path`);
    }
  }

  const environment = {
    COREPACK_DEFAULT_TO_LATEST: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    COREPACK_ENABLE_NETWORK: '1',
    COREPACK_ENABLE_PROJECT_SPEC: '1',
    COREPACK_ENABLE_STRICT: '1',
    COREPACK_ENABLE_UNSAFE_CUSTOM_URLS: '0',
    COREPACK_ENV_FILE: '0',
    COREPACK_HOME: corepackHome,
    COREPACK_NPM_REGISTRY: 'https://registry.npmjs.org',
    COREPACK_USE_LATEST: '0',
    HOME: path.join(toolRoot, 'home'),
    NPM_CONFIG_CACHE: path.join(toolRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: path.join(toolRoot, 'npm-globalconfig'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    NPM_CONFIG_USERCONFIG: path.join(toolRoot, 'npm-userconfig'),
    PATH: `${toolBin}${path.delimiter}${nodeBin}${path.delimiter}${source.PATH || ''}`,
    PNPM_HOME: path.join(toolRoot, 'pnpm-home'),
    TEMP: path.join(toolRoot, 'tmp'),
    TMP: path.join(toolRoot, 'tmp'),
    TMPDIR: path.join(toolRoot, 'tmp'),
    XDG_CACHE_HOME: path.join(toolRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: path.join(toolRoot, 'xdg-config'),
    XDG_DATA_HOME: path.join(toolRoot, 'xdg-data'),
  };

  if (source.CI === '1') environment.CI = '1';
  if (source.IROHA_EXPLORER_TOOLCHAIN_CACHE !== undefined) {
    environment.IROHA_EXPLORER_TOOLCHAIN_CACHE = resolveToolchainCache(String(source.IROHA_EXPLORER_TOOLCHAIN_CACHE));
  }
  if (source.RUN_LIVE_MOCHI_E2E === '1') {
    environment.RUN_LIVE_MOCHI_E2E = '1';
    if (source.IROHA_REPO_ROOT !== undefined) {
      const irohaRoot = String(source.IROHA_REPO_ROOT);
      if (!path.isAbsolute(irohaRoot) || path.resolve(irohaRoot) !== irohaRoot) {
        throw new Error('IROHA_REPO_ROOT must be an absolute normalized path');
      }
      let canonical;
      let stats;
      try {
        canonical = realpathSync(irohaRoot);
        stats = statSync(irohaRoot);
      } catch (cause) {
        throw new Error('IROHA_REPO_ROOT must be an existing canonical directory', { cause });
      }
      if (!stats.isDirectory()) {
        throw new Error('IROHA_REPO_ROOT must be an existing canonical directory');
      }
      if (canonical !== irohaRoot) {
        throw new Error('IROHA_REPO_ROOT must be canonical and must not traverse symbolic links');
      }
      environment.IROHA_REPO_ROOT = irohaRoot;
    }
  }
  const requestedBrowserPath = source.PLAYWRIGHT_BROWSERS_PATH === undefined
    ? playwrightBrowsersPath
    : source.PLAYWRIGHT_BROWSERS_PATH;
  if (requestedBrowserPath !== undefined) {
    environment.PLAYWRIGHT_BROWSERS_PATH = normalizePlaywrightBrowsersPath(
      requestedBrowserPath
    );
  }
  return environment;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function resolveTairaGpgExecutable(
  candidates = ['/usr/bin/gpg', '/opt/homebrew/bin/gpg', '/usr/local/bin/gpg']
) {
  const currentUid = process.getuid?.();
  for (const candidate of candidates) {
    try {
      const canonical = realpathSync(candidate);
      const stats = lstatSync(canonical);
      if (
        stats.isFile() &&
        !stats.isSymbolicLink() &&
        (stats.uid === 0 || stats.uid === currentUid) &&
        (stats.mode & 0o111) !== 0 &&
        (stats.mode & 0o022) === 0
      ) {
        return canonical;
      }
    } catch {
      // Try the next fixed, checked-in system location.
    }
  }
  throw new Error('The Taira release profile requires a canonical owner-controlled GPG executable');
}

function runTairaGpg(gpgExecutable, args, { home }) {
  const result = spawnSync(gpgExecutable, args, {
    encoding: 'utf8',
    env: {
      HOME: home,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Taira GPG verifier preparation failed with status ${result.status}: ${String(result.stderr || '').trim()}`
    );
  }
  return String(result.stdout || '');
}

export async function prepareTairaGitVerification({
  environment,
  toolRoot,
  gpgExecutable = resolveTairaGpgExecutable(),
}) {
  const signersPath = realpathSync(TAIRA_RELEASE_SIGNERS_PATH);
  if (
    signersPath !== TAIRA_RELEASE_SIGNERS_PATH ||
    sha256Bytes(readFileSync(signersPath)) !== TAIRA_RELEASE_SIGNERS_SHA256
  ) {
    throw new Error('The checked-in Taira release signer keyring does not match its pinned digest');
  }
  const canonicalGpgExecutable = realpathSync(gpgExecutable);
  if (canonicalGpgExecutable !== resolveTairaGpgExecutable([canonicalGpgExecutable])) {
    throw new Error('The Taira GPG verifier must be a canonical owner-controlled executable');
  }

  const gnupgHome = path.join(toolRoot, 'git-verify-gnupg');
  await mkdir(gnupgHome, { mode: 0o700 });
  await chmod(gnupgHome, 0o700);
  const keyringPath = path.join(gnupgHome, 'trusted-release-signers.gpg');
  runTairaGpg(
    canonicalGpgExecutable,
    ['--batch', '--yes', '--no-options', '--homedir', gnupgHome, '--dearmor', '--output', keyringPath, signersPath],
    { home: path.join(toolRoot, 'home') }
  );
  await chmod(keyringPath, 0o600);
  const quotedKeyringPath = keyringPath.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  await writeFile(
    path.join(gnupgHome, 'gpg.conf'),
    `no-default-keyring\nkeyring "${quotedKeyringPath}"\nno-auto-key-retrieve\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  const listing = runTairaGpg(
    canonicalGpgExecutable,
    [
      '--batch',
      '--no-options',
      '--homedir',
      gnupgHome,
      '--no-default-keyring',
      '--keyring',
      keyringPath,
      '--with-colons',
      '--fingerprint',
      '--list-keys',
    ],
    { home: path.join(toolRoot, 'home') }
  );
  const primaryFingerprints = [];
  let expectPrimaryFingerprint = false;
  for (const line of listing.split('\n')) {
    const fields = line.split(':');
    if (fields[0] === 'pub') {
      expectPrimaryFingerprint = true;
    } else if (fields[0] === 'fpr' && expectPrimaryFingerprint) {
      primaryFingerprints.push(fields[9]);
      expectPrimaryFingerprint = false;
    }
  }
  if (primaryFingerprints.length !== 1 || primaryFingerprints[0] !== TAIRA_RELEASE_SIGNER_FINGERPRINT) {
    throw new Error('The Taira public verification keyring contains an unexpected signer set');
  }
  environment[TAIRA_GIT_VERIFY_GPG_ENV] = canonicalGpgExecutable;
  environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV] = gnupgHome;
  return { gpgExecutable: canonicalGpgExecutable, gnupgHome };
}

export function sanitizedTairaReleaseEnvironment(source, baseEnvironment, argv) {
  const releaseCommand = argv[0];
  const commandKeys = TAIRA_RELEASE_COMMAND_ENVIRONMENT_KEYS[releaseCommand];
  if (!commandKeys) {
    throw new Error(`Unknown Taira release command: ${releaseCommand ?? 'missing'}`);
  }
  const environment = { ...baseEnvironment };
  for (const key of [...TAIRA_RELEASE_COMMON_ENVIRONMENT_KEYS, ...commandKeys]) {
    if (source[key] !== undefined) environment[key] = String(source[key]);
  }
  return environment;
}

export async function createTairaReleaseAttestation({
  argv,
  environment,
  toolRoot,
  nodeExecutable = process.execPath,
  releaseToolPath = TAIRA_RELEASE_TOOL_PATH,
}) {
  const canonicalReleaseTool = realpathSync(TAIRA_RELEASE_TOOL_PATH);
  const releaseTool = realpathSync(releaseToolPath);
  if (releaseTool !== canonicalReleaseTool) {
    throw new Error('The Taira release profile requires the canonical release tool');
  }
  const canonicalNodeExecutable = realpathSync(nodeExecutable);
  const gitVerifyGpg = realpathSync(environment[TAIRA_GIT_VERIFY_GPG_ENV]);
  const gitVerifyGnupgHome = realpathSync(environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV]);

  const nonce = randomBytes(32).toString('hex');
  const attestationPath = path.join(toolRoot, '.taira-release-attestation.json');
  const payload = {
    schema: 1,
    nonce,
    git_verify_gnupghome: gitVerifyGnupgHome,
    git_verify_gpg_path: gitVerifyGpg,
    git_verify_gpg_sha256: sha256Bytes(readFileSync(gitVerifyGpg)),
    git_verify_signers_sha256: TAIRA_RELEASE_SIGNERS_SHA256,
    node_path: canonicalNodeExecutable,
    node_sha256: sha256Bytes(readFileSync(canonicalNodeExecutable)),
    release_tool_path: releaseTool,
    release_tool_sha256: sha256Bytes(readFileSync(releaseTool)),
    argv_sha256: sha256Bytes(JSON.stringify(argv)),
  };
  await writeFile(attestationPath, `${JSON.stringify(payload)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  environment[TAIRA_RELEASE_ATTESTATION_ENV] = attestationPath;
  environment[TAIRA_RELEASE_ATTESTATION_NONCE_ENV] = nonce;
  return attestationPath;
}

async function removeExactToolchainRunDirectory(toolRoot, initialStats) {
  const currentStats = await inspectOwnedPrivateDirectory(toolRoot, 'Exact-toolchain run directory');
  if (currentStats.dev !== initialStats.dev || currentStats.ino !== initialStats.ino) {
    throw new Error('Exact-toolchain run directory identity changed before cleanup');
  }
  await rm(toolRoot, { force: true, recursive: true });
}

async function prepareExactToolchain() {
  resolveNodeArtifact();
  assertRequiredNodeVersion(process.versions.node);
  const cacheRoot = await validateToolchainCacheDirectory();
  const playwrightBrowsersPath = await resolvePlaywrightBrowsersPath(
    process.env,
    cacheRoot
  );
  const nodeExecutable = process.execPath;
  const nodeBin = path.dirname(nodeExecutable);
  const nodeRoot = path.dirname(nodeBin);
  const corepackScript = path.join(nodeRoot, 'lib', 'node_modules', 'corepack', 'dist', 'corepack.js');
  await access(corepackScript);
  const toolRoot = await mkdtemp(path.join(cacheRoot, '.toolchain-run-'));
  await chmod(toolRoot, 0o700);
  const toolRootStats = await inspectOwnedPrivateDirectory(toolRoot, 'Exact-toolchain run directory');
  const corepackHome = path.join(toolRoot, 'corepack');
  const toolBin = path.join(toolRoot, 'bin');
  const privateDirectories = [
    corepackHome,
    toolBin,
    path.join(toolRoot, 'home'),
    path.join(toolRoot, 'npm-cache'),
    path.join(toolRoot, 'pnpm-home'),
    path.join(toolRoot, 'tmp'),
    path.join(toolRoot, 'xdg-cache'),
    path.join(toolRoot, 'xdg-config'),
    path.join(toolRoot, 'xdg-data'),
  ];
  await Promise.all(privateDirectories.map((directory) => mkdir(directory, { mode: 0o700 })));
  await Promise.all([
    writeFile(path.join(toolRoot, 'npm-globalconfig'), '', { mode: 0o600 }),
    writeFile(path.join(toolRoot, 'npm-userconfig'), '', { mode: 0o600 }),
  ]);

  const childEnvironment = sanitizedExactToolchainEnvironment(process.env, {
    nodeBin,
    corepackHome,
    playwrightBrowsersPath,
    toolBin,
    toolRoot,
  });
  let preparationError = null;
  try {
    checkedSpawn(nodeExecutable, [corepackScript, 'enable', '--install-directory', toolBin], {
      cwd: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
      env: childEnvironment,
    });
    checkedSpawn(
      nodeExecutable,
      [corepackScript, 'install', '--global', `pnpm@${REQUIRED_PNPM_VERSION}+${REQUIRED_PNPM_INTEGRITY}`],
      { cwd: EXACT_TOOLCHAIN_REPOSITORY_ROOT, env: childEnvironment }
    );
    assertRequiredPnpmVersion(
      checkedSpawn(path.join(toolBin, 'pnpm'), ['--version'], {
        cwd: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
        env: childEnvironment,
      })
    );
  } catch (error) {
    preparationError = error;
  }
  if (preparationError) {
    try {
      await removeExactToolchainRunDirectory(toolRoot, toolRootStats);
    } catch (cleanupError) {
      throw new AggregateError(
        [preparationError, cleanupError],
        'Exact-toolchain preparation and cleanup both failed',
        { cause: preparationError }
      );
    }
    throw preparationError;
  }
  return { childEnvironment, toolRoot, toolRootStats };
}

export function executeExactToolchainCommand(command, args, { environment, spawn = spawnSync }) {
  const result = spawn(command, args, {
    cwd: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  return result.status ?? 1;
}

async function main() {
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv[separator + 1] : undefined;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!command) {
    throw new Error('usage: node scripts/run-exact-toolchain.mjs -- <command> [arguments...]');
  }

  const { childEnvironment, toolRoot, toolRootStats } = await prepareExactToolchain();
  let executable = command;
  let executableArgs = args;
  let executionEnvironment = childEnvironment;
  let status;
  let commandError = null;
  try {
    if (command === 'taira-release') {
      executionEnvironment = sanitizedTairaReleaseEnvironment(process.env, childEnvironment, args);
      await prepareTairaGitVerification({
        environment: executionEnvironment,
        toolRoot,
      });
      await createTairaReleaseAttestation({
        argv: args,
        environment: executionEnvironment,
        toolRoot,
      });
      executable = process.execPath;
      executableArgs = [TAIRA_RELEASE_TOOL_PATH, ...args];
    }
    console.log(`EXACT TOOLCHAIN: Node ${REQUIRED_NODE_VERSION}, pnpm ${REQUIRED_PNPM_VERSION}`);
    status = executeExactToolchainCommand(executable, executableArgs, {
      environment: executionEnvironment,
    });
  } catch (error) {
    commandError = error;
  }
  let cleanupError = null;
  try {
    await removeExactToolchainRunDirectory(toolRoot, toolRootStats);
  } catch (error) {
    cleanupError = error;
  }
  if (commandError && cleanupError) {
    throw new AggregateError([commandError, cleanupError], 'Exact-toolchain command and cleanup failed', {
      cause: commandError,
    });
  }
  if (commandError) throw commandError;
  if (cleanupError) throw cleanupError;
  process.exitCode = status;
}

if (process.argv[1]?.endsWith('run-exact-toolchain.mjs')) {
  try {
    await main();
  } catch (error) {
    console.error(`EXACT TOOLCHAIN: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
