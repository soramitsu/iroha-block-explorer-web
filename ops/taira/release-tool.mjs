import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import {
  access,
  chmod,
  cp,
  link,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  symlink,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { isCanonicalIrohaHashLiteral32 } from '../../src/shared/lib/iroha-hash.ts';
import { checkIrohaPinFiles } from '../../scripts/check-iroha-pin.mjs';
import { formatBundleBudgetReport, runBundleBudgetCheck } from '../../scripts/check-bundle-budget.mjs';
import {
  TAIRA_GIT_VERIFY_GNUPGHOME_ENV,
  TAIRA_GIT_VERIFY_GPG_ENV,
  TAIRA_RELEASE_ATTESTATION_ENV,
  TAIRA_RELEASE_ATTESTATION_NONCE_ENV,
  TAIRA_RELEASE_SIGNER_FINGERPRINT,
  TAIRA_RELEASE_SIGNERS_SHA256,
} from '../../scripts/run-exact-toolchain.mjs';

const MANIFEST_NAME = 'release-manifest.json';
const RELEASE_ID_PATTERN = /^[0-9a-f]{12}-[0-9a-f]{12}$/u;
const REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TAIRA_EXPLORER_HOST = 'taira-explorer.sora.org';
const TAIRA_EXPLORER_URL = 'https://taira-explorer.sora.org/';
const TAIRA_EXPLORER_ORIGIN = new URL(TAIRA_EXPLORER_URL).origin;
const TAIRA_TORII_ORIGIN = 'https://taira.sora.org';
const TAIRA_TORII_STATUS_URL = `${TAIRA_TORII_ORIGIN}/status`;
const EXPLORER_REPOSITORY = 'github.com/soramitsu/iroha-block-explorer-web';
const IROHA_REPOSITORY = 'github.com/hyperledger-iroha/iroha';
const IROHA_REPOSITORY_URL = 'https://github.com/hyperledger-iroha/iroha.git';
const EXPLORER_REPOSITORY_URL = 'https://github.com/soramitsu/iroha-block-explorer-web.git';
const IROHA_SDK_SUBTREE = 'javascript/iroha_js';
const REVIEWED_BASELINE_INVENTORY_NAME = 'baseline-public-inventory.json';
const REQUIRED_PNPM_VERSION = '10.11.0';
const REQUIRED_NODE_VERSION = '24.19.0';
const VALIDATED_RUNTIME_CONFIG = Symbol('validated-runtime-config');
const PUBLIC_RUNTIME_CONFIG_KEYS = Object.freeze([
  'networkId',
  'networkPrefix',
  'toriiBaseUrl',
  'toriiForceBaseUrl',
]);
const REVIEWED_BASELINE = Object.freeze({
  explorerRevision: '68ccf50f3944aff310d1d11d5ee3c04f93f250ba',
  sdkRevision: 'a457d6b60846923441fea549edcae30626c5e939',
  runtimeRevision: '986cc54ed6bd0bd5adf5c9dfc191288abf034046',
  dependency: 'file:../iroha/javascript/iroha_js',
  packageJsonSha256: 'e943734aa0612d8064433d7810b05b2e5926b6a5331d32d9892eb27ee8790dbd',
  packageLockSha256: '706f8678d4d5bcf24df3217717c0c68fab3aac215883f8fa4ba49943345ece01',
  profileSha256: 'ecd38f35fa0890db545da63450cea65cc18aad599500966a55890cd7de3906f1',
  sdkSubtreeTree: 'c86222b3f00374381c48b06210ef8267f5ee0411',
});

export class CutoverCommitUncertainError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CutoverCommitUncertainError';
  }
}

export class DeploymentRolledBackError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'DeploymentRolledBackError';
  }
}

export class DurableCommitUncertainError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'DurableCommitUncertainError';
  }
}

export class ReleasePublicationUncertainError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleasePublicationUncertainError';
  }
}

export class RuntimeTransitionIntentRequiredError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'RuntimeTransitionIntentRequiredError';
  }
}

export class CoupledRuntimeRollbackRequiredError extends Error {
  constructor({
    failedReleaseId,
    failedRuntimeRevision,
    previousReleaseId,
    previousRuntimeRevision,
    recoveryAction = 'rollback',
    cause,
  }) {
    const message =
      recoveryAction === 'transition'
        ? `Explorer ${failedReleaseId} failed smoke checks after the coupled rollback to Torii ` +
          `${failedRuntimeRevision} and remains selected. Explorer was not switched back to ` +
          `incompatible ${previousReleaseId}. Restore Torii to ${previousRuntimeRevision}, wait ` +
          `for /status, set TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION=${failedRuntimeRevision}, ` +
          `then run ops/taira/deploy-explorer.sh transition ${previousReleaseId} to re-adopt it.`
        : `Explorer ${failedReleaseId} failed smoke checks during the coupled Torii transition to ` +
          `${failedRuntimeRevision}. Explorer was not switched to incompatible predecessor ` +
          `${previousReleaseId}. Roll Torii back to ${previousRuntimeRevision} first, then run ` +
          `ops/taira/deploy-explorer.sh rollback ${previousReleaseId}.`;
    super(message, { cause });
    this.name = 'CoupledRuntimeRollbackRequiredError';
    this.failedReleaseId = failedReleaseId;
    this.failedRuntimeRevision = failedRuntimeRevision;
    this.previousReleaseId = previousReleaseId;
    this.previousRuntimeRevision = previousRuntimeRevision;
    this.recoveryAction = recoveryAction;
    this.recoveryRuntimeRevision = previousRuntimeRevision;
    this.recoveryReleaseId = previousReleaseId;
    this.runtimeTransitionFrom = recoveryAction === 'transition' ? failedRuntimeRevision : null;
  }
}

export class ReleaseLockRemovalUncertainError extends AggregateError {
  constructor(actionError, cleanupErrors) {
    const errors = actionError ? [actionError, ...cleanupErrors] : cleanupErrors;
    super(errors, 'Release lock was removed, but parent-directory durability is uncertain', {
      cause: actionError ?? cleanupErrors[0],
    });
    this.name = 'ReleaseLockRemovalUncertainError';
    this.actionError = actionError;
    this.cleanupErrors = cleanupErrors;
  }
}

function assertRevision(value, name) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new Error(`${name} must be a full lowercase commit SHA`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 digest`);
  }
}

function assertReleaseId(value) {
  if (typeof value !== 'string' || !RELEASE_ID_PATTERN.test(value)) {
    throw new Error('release_id must contain two 12-character lowercase hexadecimal revisions');
  }
}

function assertExactKeys(value, expectedKeys, name) {
  const actualKeys = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const sortedExpected = [...expectedKeys].sort((left, right) => left.localeCompare(right, 'en'));
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${name} has unexpected or missing fields`);
  }
}

function releaseIdFor(explorerRevision, runtimeRevision) {
  return `${explorerRevision.slice(0, 12)}-${runtimeRevision.slice(0, 12)}`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function pathEntryStats(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function deploymentUid() {
  const getter = typeof process.geteuid === 'function' ? process.geteuid : process.getuid;
  if (typeof getter !== 'function') {
    throw new Error('Taira release operations require a platform with numeric file ownership');
  }
  return getter.call(process);
}

function assertDeploymentOwnedNonWritable(stats, name, filePath) {
  if (stats.uid !== deploymentUid()) {
    throw new Error(`${name} must be owned by the deployment account: ${filePath}`);
  }
  if ((stats.mode & 0o022) !== 0) {
    throw new Error(`${name} must not be group- or world-writable: ${filePath}`);
  }
}

function fileIdentity(stats) {
  return { dev: stats.dev, ino: stats.ino };
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export async function validateCanonicalRealDirectory(directory, name = 'Directory') {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) {
    throw new Error(`${name} must be an absolute normalized path`);
  }
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${name} must be a real directory: ${directory}`);
  }
  if ((await realpath(directory)) !== directory) {
    throw new Error(`${name} must not traverse symbolic links: ${directory}`);
  }
  return directory;
}

async function inspectOwnedCanonicalRealDirectory(directory, name) {
  await validateCanonicalRealDirectory(directory, name);
  const stats = await lstat(directory);
  assertDeploymentOwnedNonWritable(stats, name, directory);
  return fileIdentity(stats);
}

async function recheckOwnedCanonicalRealDirectory(directory, name, expectedIdentity) {
  const currentIdentity = await inspectOwnedCanonicalRealDirectory(directory, name);
  if (!sameFileIdentity(currentIdentity, expectedIdentity)) {
    throw new Error(`${name} changed identity during the release transaction: ${directory}`);
  }
  return currentIdentity;
}

function assertNginxTraversableDirectory(stats, name, directory) {
  if ((stats.mode & 0o001) === 0) {
    throw new Error(`${name} must be traversable by the nginx worker: ${directory}`);
  }
}

function assertNginxReadableFile(stats, name, filePath) {
  if ((stats.mode & 0o004) === 0) {
    throw new Error(`${name} must be readable by the nginx worker: ${filePath}`);
  }
}

async function assertPublicTraversalAncestors(directory) {
  const root = path.parse(directory).root;
  const segments = path.relative(root, directory).split(path.sep).filter(Boolean);
  const ancestors = [root];
  let ancestor = root;
  for (const segment of segments) {
    ancestor = path.join(ancestor, segment);
    ancestors.push(ancestor);
  }
  for (const current of ancestors) {
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Taira public path ancestor must be a real directory: ${current}`);
    }
    assertNginxTraversableDirectory(stats, 'Taira public path ancestor', current);
  }
}

async function inspectPublicReleaseParent(directory) {
  const identity = await inspectOwnedCanonicalRealDirectory(directory, 'Taira release parent');
  await assertPublicTraversalAncestors(directory);
  return identity;
}

async function recheckPublicReleaseParent(directory, expectedIdentity) {
  const currentIdentity = await inspectPublicReleaseParent(directory);
  if (!sameFileIdentity(currentIdentity, expectedIdentity)) {
    throw new Error(`Taira release parent changed identity during the release transaction: ${directory}`);
  }
  return currentIdentity;
}

function assertPublicReleaseStoreMode(stats, directory) {
  if ((stats.mode & 0o7777) !== 0o711) {
    throw new Error(`Taira release store must have exact mode 0711: ${directory}`);
  }
}

async function inspectPublicReleaseStore(directory) {
  const identity = await inspectOwnedCanonicalRealDirectory(directory, 'Taira release store');
  const stats = await lstat(directory);
  if (!sameFileIdentity(identity, fileIdentity(stats))) {
    throw new Error(`Taira release store changed while it was inspected: ${directory}`);
  }
  assertPublicReleaseStoreMode(stats, directory);
  return identity;
}

async function recheckPublicReleaseStore(directory, expectedIdentity) {
  const currentIdentity = await inspectPublicReleaseStore(directory);
  if (!sameFileIdentity(currentIdentity, expectedIdentity)) {
    throw new Error(`Taira release store changed identity during the release transaction: ${directory}`);
  }
  return currentIdentity;
}

async function inspectCanonicalReleasePaths({ servedPath, releasesDir }) {
  const normalized = validateReleasePaths({ servedPath, releasesDir });
  const parent = path.dirname(normalized.servedPath);
  const parentIdentity = await inspectPublicReleaseParent(parent);

  const releasesStats = await pathEntryStats(normalized.releasesDir);
  const releasesIdentity = releasesStats ? await inspectPublicReleaseStore(normalized.releasesDir) : null;
  return { ...normalized, parent, parentIdentity, releasesIdentity };
}

async function validateCanonicalRegularFile(filePath, name) {
  const normalized = path.resolve(filePath);
  if (normalized !== filePath) throw new Error(`${name} must be an absolute normalized path`);
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${name} must be a regular file: ${filePath}`);
  }
  if ((await realpath(filePath)) !== filePath) {
    throw new Error(`${name} must not traverse symbolic links: ${filePath}`);
  }
  return filePath;
}

export async function readCanonicalRegularFileSnapshot(filePath, name = 'File') {
  const normalized = path.resolve(filePath);
  if (normalized !== filePath) throw new Error(`${name} must be an absolute normalized path`);
  await validateCanonicalRealDirectory(path.dirname(filePath), `${name} parent`);
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | noFollow);
  } catch (error) {
    throw new Error(`${name} must be a canonical regular file: ${filePath}`, { cause: error });
  }
  try {
    const [openedStats, entryStats, canonicalPath] = await Promise.all([
      handle.stat(),
      lstat(filePath),
      realpath(filePath),
    ]);
    if (!openedStats.isFile() || !entryStats.isFile() || entryStats.isSymbolicLink()) {
      throw new Error(`${name} must be a regular file: ${filePath}`);
    }
    if (openedStats.dev !== entryStats.dev || openedStats.ino !== entryStats.ino) {
      throw new Error(`${name} changed while it was being opened: ${filePath}`);
    }
    if (canonicalPath !== filePath) {
      throw new Error(`${name} must not traverse symbolic links: ${filePath}`);
    }
    return { bytes: await handle.readFile(), stats: openedStats };
  } finally {
    await handle.close();
  }
}

export async function validateCanonicalReleasePaths({ servedPath, releasesDir }) {
  const inspection = await inspectCanonicalReleasePaths({ servedPath, releasesDir });
  return { servedPath: inspection.servedPath, releasesDir: inspection.releasesDir };
}

async function ensurePrivateReleaseStore({ servedPath, releasesDir }) {
  const inspection = await inspectCanonicalReleasePaths({ servedPath, releasesDir });
  if (inspection.releasesIdentity) return inspection.releasesIdentity;

  await recheckPublicReleaseParent(inspection.parent, inspection.parentIdentity);
  await mkdir(releasesDir, { mode: 0o711 });
  await chmod(releasesDir, 0o711);
  const createdStats = await lstat(releasesDir);
  if ((createdStats.mode & 0o7777) !== 0o711) {
    throw new Error(`New Taira release store must have mode 0711: ${releasesDir}`);
  }
  assertDeploymentOwnedNonWritable(createdStats, 'Taira release store', releasesDir);
  try {
    await syncDirectory(releasesDir);
    await syncDirectory(inspection.parent);
  } catch (error) {
    throw new DurableCommitUncertainError(
      `Taira release store ${releasesDir} was created, but its durability could not be confirmed`,
      { cause: error }
    );
  }
  await recheckPublicReleaseParent(inspection.parent, inspection.parentIdentity);
  return inspectPublicReleaseStore(releasesDir);
}

export function validateReleasePaths({ servedPath, releasesDir }) {
  if (!path.isAbsolute(servedPath) || !path.isAbsolute(releasesDir)) {
    throw new Error('Served and release-store paths must be absolute');
  }
  const normalizedServed = path.normalize(servedPath);
  const normalizedReleases = path.normalize(releasesDir);
  if (normalizedServed !== servedPath || normalizedReleases !== releasesDir) {
    throw new Error('Served and release-store paths must already be normalized');
  }
  const parent = path.dirname(normalizedServed);
  if (path.basename(normalizedServed) !== 'dist') {
    throw new Error('The Taira served path must end in dist');
  }
  if (path.basename(normalizedReleases) !== 'releases') {
    throw new Error('The Taira release store must end in releases');
  }
  if (path.dirname(normalizedReleases) !== parent) {
    throw new Error('The served symlink and release store must be siblings');
  }
  const unsafeRoots = new Set([path.parse(parent).root, path.normalize(homedir())]);
  if (unsafeRoots.has(parent) || parent.split(path.sep).filter(Boolean).length < 2) {
    throw new Error(`Refusing broad Taira release parent: ${parent}`);
  }
  return { servedPath: normalizedServed, releasesDir: normalizedReleases };
}

export function validateTairaRuntimeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Taira runtime config must be a JSON object');
  }
  const unexpectedKeys = Object.keys(config).filter((key) => !PUBLIC_RUNTIME_CONFIG_KEYS.includes(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`Taira runtime config contains unknown public fields: ${unexpectedKeys.join(', ')}`);
  }
  if (config.toriiBaseUrl !== TAIRA_TORII_ORIGIN) {
    throw new Error(`toriiBaseUrl must be exactly ${TAIRA_TORII_ORIGIN}`);
  }
  if (config.toriiForceBaseUrl !== true) {
    throw new Error('toriiForceBaseUrl must be true for the Taira release');
  }
  if (!isCanonicalIrohaHashLiteral32(config.networkId)) {
    throw new Error('networkId must be an exact canonical checked 32-byte Iroha NetworkId');
  }
  if (config.networkPrefix !== 369) {
    throw new Error('networkPrefix must be 369 for the Taira release');
  }
  return config;
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function readOperatorRuntimeConfig(configPath, { forbiddenRoots = [] } = {}) {
  const snapshot = await readCanonicalRegularFileSnapshot(configPath, 'Operator runtime config');
  if (typeof process.getuid === 'function' && snapshot.stats.uid !== process.getuid()) {
    throw new Error('Operator runtime config must be owned by the deployment account');
  }
  if ((snapshot.stats.mode & 0o022) !== 0) {
    throw new Error('Operator runtime config must not be group- or world-writable');
  }
  for (const forbiddenRoot of forbiddenRoots) {
    const canonicalRoot = path.resolve(forbiddenRoot);
    if (pathIsWithin(canonicalRoot, configPath)) {
      throw new Error(`Operator runtime config must be outside ${canonicalRoot}`);
    }
  }
  return validateTairaRuntimeConfig(JSON.parse(snapshot.bytes.toString('utf8')));
}

export async function installTairaRuntimeConfig({ configPath, distDir, forbiddenRoots = [] }, operations = {}) {
  const { writeFileDurablyFn = writeFileDurably } = operations;
  await validateCanonicalRealDirectory(distDir, 'Runtime-config dist');
  const config = Object.prototype.hasOwnProperty.call(operations, VALIDATED_RUNTIME_CONFIG)
    ? operations[VALIDATED_RUNTIME_CONFIG]
    : await readOperatorRuntimeConfig(configPath, { forbiddenRoots });
  await writeFileDurablyFn(path.join(distDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o644 });
  return config;
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Cannot sync release symlink: ${entryPath}`);
    if (entry.isDirectory()) {
      await syncTree(entryPath);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Cannot sync non-file release entry: ${entryPath}`);
    const handle = await open(entryPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  await syncDirectory(directory);
}

function safeReleaseTarget(releasesDir, releaseId) {
  assertReleaseId(releaseId);
  const target = path.resolve(releasesDir, releaseId);
  if (path.dirname(target) !== path.resolve(releasesDir)) {
    throw new Error(`Release target escapes the release store: ${releaseId}`);
  }
  return target;
}

function validateRelativeFilePath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath === MANIFEST_NAME ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe release file path: ${String(relativePath)}`);
  }
}

export async function collectReleaseFiles(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const files = [];

  async function walk(directory, prefix) {
    const directoryName = prefix ? `Release directory ${prefix}` : 'Release tree root';
    const directoryIdentity = await inspectOwnedCanonicalRealDirectory(directory, directoryName);
    const directoryStats = await lstat(directory);
    if (!sameFileIdentity(directoryIdentity, fileIdentity(directoryStats))) {
      throw new Error(`${directoryName} changed while it was inspected: ${directory}`);
    }
    assertNginxTraversableDirectory(directoryStats, directoryName, directory);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isManifest = relativePath === MANIFEST_NAME;
      if (!isManifest) validateRelativeFilePath(relativePath);
      const absolutePath = path.join(directory, entry.name);
      const entryStats = await lstat(absolutePath);
      if (entryStats.isSymbolicLink()) {
        throw new Error(`Release trees cannot contain symbolic links: ${relativePath}`);
      }
      assertDeploymentOwnedNonWritable(entryStats, `Release entry ${relativePath}`, absolutePath);
      if (entryStats.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!entryStats.isFile()) {
        throw new Error(`Release trees may contain only regular files: ${relativePath}`);
      }
      const fileName = `Release file ${relativePath}`;
      assertNginxReadableFile(entryStats, fileName, absolutePath);
      const snapshot = await readCanonicalRegularFileSnapshot(absolutePath, fileName);
      assertDeploymentOwnedNonWritable(snapshot.stats, fileName, absolutePath);
      assertNginxReadableFile(snapshot.stats, fileName, absolutePath);
      const finalStats = await lstat(absolutePath);
      if (!sameFileIdentity(fileIdentity(snapshot.stats), fileIdentity(finalStats))) {
        throw new Error(`${fileName} changed while it was inspected: ${absolutePath}`);
      }
      assertDeploymentOwnedNonWritable(finalStats, fileName, absolutePath);
      assertNginxReadableFile(finalStats, fileName, absolutePath);
      if (isManifest) continue;
      const { bytes } = snapshot;
      files.push({ path: relativePath, size: bytes.byteLength, sha256: sha256(bytes) });
    }
    await recheckOwnedCanonicalRealDirectory(directory, directoryName, directoryIdentity);
    const finalDirectoryStats = await lstat(directory);
    if (!sameFileIdentity(directoryIdentity, fileIdentity(finalDirectoryStats))) {
      throw new Error(`${directoryName} changed while it was rechecked: ${directory}`);
    }
    assertDeploymentOwnedNonWritable(finalDirectoryStats, directoryName, directory);
    assertNginxTraversableDirectory(finalDirectoryStats, directoryName, directory);
  }

  await walk(root, '');
  return files;
}

function serializeReviewedBaselineInventory(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

export async function verifyReviewedBaselineInventory(distDir, inventoryPath) {
  const source = await readFile(inventoryPath, 'utf8');
  const inventory = JSON.parse(source);
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    throw new Error('Reviewed baseline inventory must be an object');
  }
  assertExactKeys(
    inventory,
    [
      'dependency',
      'explorer_revision',
      'files',
      'package_json_sha256',
      'package_lock_sha256',
      'profile_sha256',
      'runtime_revision',
      'schema_version',
      'sdk_revision',
      'sdk_subtree_tree',
    ],
    'reviewed baseline inventory'
  );
  if (source !== serializeReviewedBaselineInventory(inventory)) {
    throw new Error('Reviewed baseline inventory is not encoded in canonical bytes');
  }
  const expectedTuple = {
    explorer_revision: REVIEWED_BASELINE.explorerRevision,
    sdk_revision: REVIEWED_BASELINE.sdkRevision,
    runtime_revision: REVIEWED_BASELINE.runtimeRevision,
    dependency: REVIEWED_BASELINE.dependency,
    package_json_sha256: REVIEWED_BASELINE.packageJsonSha256,
    package_lock_sha256: REVIEWED_BASELINE.packageLockSha256,
    profile_sha256: REVIEWED_BASELINE.profileSha256,
    sdk_subtree_tree: REVIEWED_BASELINE.sdkSubtreeTree,
  };
  if (inventory.schema_version !== 1) throw new Error('Unsupported reviewed inventory schema');
  for (const [key, expected] of Object.entries(expectedTuple)) {
    if (inventory[key] !== expected) throw new Error(`Reviewed baseline inventory ${key} mismatch`);
  }
  if (!Array.isArray(inventory.files) || inventory.files.length === 0) {
    throw new Error('Reviewed baseline inventory must contain public files');
  }
  let previousPath = null;
  for (const file of inventory.files) {
    validateManifestFileEntry(file, previousPath);
    if (file.path === 'config.json') {
      throw new Error('Reviewed baseline inventory must exclude operator config.json');
    }
    previousPath = file.path;
  }
  const actualFiles = (await collectReleaseFiles(distDir)).filter((file) => file.path !== 'config.json');
  if (JSON.stringify(actualFiles) !== JSON.stringify(inventory.files)) {
    throw new Error('Built baseline does not match the checked-in reviewed public inventory');
  }
  return inventory;
}

export function validateReviewedBaselineManifest(manifest) {
  validateReleaseManifest(manifest);
  const expected = {
    explorer_revision: REVIEWED_BASELINE.explorerRevision,
    sdk_revision: REVIEWED_BASELINE.sdkRevision,
    profile_revision: REVIEWED_BASELINE.sdkRevision,
    runtime_revision: REVIEWED_BASELINE.runtimeRevision,
    package_lock_sha256: REVIEWED_BASELINE.packageLockSha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) throw new Error(`Reviewed baseline manifest ${key} mismatch`);
  }
  const provenanceExpected = {
    revision: REVIEWED_BASELINE.sdkRevision,
    subtree_tree: REVIEWED_BASELINE.sdkSubtreeTree,
    dependency: REVIEWED_BASELINE.dependency,
    package_json_sha256: REVIEWED_BASELINE.packageJsonSha256,
    package_lock_sha256: REVIEWED_BASELINE.packageLockSha256,
    profile_sha256: REVIEWED_BASELINE.profileSha256,
  };
  for (const [key, value] of Object.entries(provenanceExpected)) {
    if (manifest.sdk_provenance[key] !== value) {
      throw new Error(`Reviewed baseline manifest sdk_provenance.${key} mismatch`);
    }
  }
  if (manifest.previous_release_id !== null) {
    throw new Error('Reviewed baseline manifest must not name a previous release');
  }
  return manifest;
}

function validateReviewedBaselineManifestInventory(manifest, reviewedInventory) {
  const publicFiles = manifest.files.filter((file) => file.path !== 'config.json');
  if (JSON.stringify(publicFiles) !== JSON.stringify(reviewedInventory.files)) {
    throw new Error('Reviewed baseline manifest public files do not match checked-in inventory');
  }
}

export function serializeReleaseManifest(manifest) {
  validateReleaseManifest(manifest);
  const canonical = {
    schema_version: manifest.schema_version,
    release_id: manifest.release_id,
    previous_release_id: manifest.previous_release_id,
    explorer_revision: manifest.explorer_revision,
    generator_revision: manifest.generator_revision,
    sdk_revision: manifest.sdk_revision,
    runtime_revision: manifest.runtime_revision,
    profile_revision: manifest.profile_revision,
    package_lock_sha256: manifest.package_lock_sha256,
    sdk_provenance: {
      repository: manifest.sdk_provenance.repository,
      revision: manifest.sdk_provenance.revision,
      subtree_path: manifest.sdk_provenance.subtree_path,
      subtree_tree: manifest.sdk_provenance.subtree_tree,
      dependency: manifest.sdk_provenance.dependency,
      package_json_sha256: manifest.sdk_provenance.package_json_sha256,
      package_lock_sha256: manifest.sdk_provenance.package_lock_sha256,
      profile_sha256: manifest.sdk_provenance.profile_sha256,
    },
    runtime_config: {
      path: manifest.runtime_config.path,
      sha256: manifest.runtime_config.sha256,
    },
    files: manifest.files.map((file) => ({
      path: file.path,
      size: file.size,
      sha256: file.sha256,
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

function validateManifestIdentity(manifest) {
  assertRevision(manifest.explorer_revision, 'explorer_revision');
  assertRevision(manifest.generator_revision, 'generator_revision');
  assertRevision(manifest.sdk_revision, 'sdk_revision');
  assertRevision(manifest.runtime_revision, 'runtime_revision');
  assertRevision(manifest.profile_revision, 'profile_revision');
  if (manifest.profile_revision !== manifest.sdk_revision) {
    throw new Error('profile_revision must match sdk_revision');
  }
  assertReleaseId(manifest.release_id);
  if (manifest.release_id !== releaseIdFor(manifest.explorer_revision, manifest.runtime_revision)) {
    throw new Error('release_id does not match explorer_revision and runtime_revision');
  }
  if (manifest.previous_release_id !== null) assertReleaseId(manifest.previous_release_id);
}

function validateManifestRuntimeConfig(manifest) {
  if (
    !manifest.runtime_config ||
    typeof manifest.runtime_config !== 'object' ||
    Array.isArray(manifest.runtime_config)
  ) {
    throw new Error('runtime_config must be an object');
  }
  assertExactKeys(manifest.runtime_config, ['path', 'sha256'], 'runtime_config');
  assertSha256(manifest.package_lock_sha256, 'package_lock_sha256');
  if (manifest.runtime_config?.path !== 'config.json') {
    throw new Error('runtime_config.path must be config.json');
  }
  assertSha256(manifest.runtime_config?.sha256, 'runtime_config.sha256');
}

function validateSdkProvenance(manifest) {
  const provenance = manifest.sdk_provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('sdk_provenance must be an object');
  }
  assertExactKeys(
    provenance,
    [
      'dependency',
      'package_json_sha256',
      'package_lock_sha256',
      'profile_sha256',
      'repository',
      'revision',
      'subtree_path',
      'subtree_tree',
    ],
    'sdk_provenance'
  );
  if (typeof provenance.dependency !== 'string' || provenance.dependency.length === 0) {
    throw new Error('sdk_provenance.dependency must be non-empty');
  }
  if (provenance.repository !== IROHA_REPOSITORY) {
    throw new Error(`sdk_provenance.repository must be ${IROHA_REPOSITORY}`);
  }
  assertRevision(provenance.revision, 'sdk_provenance.revision');
  if (provenance.revision !== manifest.sdk_revision) {
    throw new Error('sdk_provenance.revision must match sdk_revision');
  }
  if (provenance.subtree_path !== IROHA_SDK_SUBTREE) {
    throw new Error(`sdk_provenance.subtree_path must be ${IROHA_SDK_SUBTREE}`);
  }
  assertRevision(provenance.subtree_tree, 'sdk_provenance.subtree_tree');
  for (const key of ['package_json_sha256', 'package_lock_sha256', 'profile_sha256']) {
    assertSha256(provenance[key], `sdk_provenance.${key}`);
  }
  if (provenance.package_lock_sha256 !== manifest.package_lock_sha256) {
    throw new Error('sdk_provenance package-lock digest must match package_lock_sha256');
  }
}

function validateManifestFileEntry(file, previousPath) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new Error('Release file inventory entries must be objects');
  }
  assertExactKeys(file, ['path', 'sha256', 'size'], 'release file inventory entry');
  validateRelativeFilePath(file.path);
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error(`Invalid file size for ${String(file.path)}`);
  }
  assertSha256(file.sha256, `${String(file.path)} sha256`);
  if (previousPath !== null && previousPath.localeCompare(file.path, 'en') >= 0) {
    throw new Error('Release file inventory must be uniquely sorted by path');
  }
}

function validateManifestFiles(manifest) {
  validateManifestRuntimeConfig(manifest);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('files must be a non-empty array');
  }

  let previousPath = null;
  for (const file of manifest.files) {
    validateManifestFileEntry(file, previousPath);
    previousPath = file.path;
  }
  const configEntry = manifest.files.find((file) => file.path === 'config.json');
  if (!configEntry || configEntry.sha256 !== manifest.runtime_config.sha256) {
    throw new Error('runtime_config digest does not match the config.json inventory entry');
  }
  if (!manifest.files.some((file) => file.path === 'index.html')) {
    throw new Error('Release inventory must contain index.html');
  }
}

export function validateReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Release manifest must be an object');
  }
  assertExactKeys(
    manifest,
    [
      'explorer_revision',
      'files',
      'generator_revision',
      'package_lock_sha256',
      'previous_release_id',
      'profile_revision',
      'release_id',
      'runtime_config',
      'runtime_revision',
      'schema_version',
      'sdk_provenance',
      'sdk_revision',
    ],
    'release manifest'
  );
  if (manifest.schema_version !== 1) throw new Error('Unsupported release manifest schema_version');
  validateManifestIdentity(manifest);
  validateSdkProvenance(manifest);
  validateManifestFiles(manifest);
  return manifest;
}

export async function createReleaseManifest({
  distDir,
  packageLockPath,
  explorerRevision,
  generatorRevision,
  sdkRevision,
  runtimeRevision,
  profileRevision,
  sdkProvenance,
  previousReleaseId = null,
}) {
  assertRevision(explorerRevision, 'explorerRevision');
  assertRevision(generatorRevision, 'generatorRevision');
  assertRevision(sdkRevision, 'sdkRevision');
  assertRevision(runtimeRevision, 'runtimeRevision');
  assertRevision(profileRevision, 'profileRevision');
  if (profileRevision !== sdkRevision) throw new Error('profileRevision must match sdkRevision');
  if (previousReleaseId !== null) assertReleaseId(previousReleaseId);
  if (!sdkProvenance || sdkProvenance.revision !== sdkRevision) {
    throw new Error('A verified sdkProvenance matching sdkRevision is required');
  }

  const files = await collectReleaseFiles(distDir);
  const configEntry = files.find((file) => file.path === 'config.json');
  if (!configEntry) throw new Error('Release dist must contain config.json');
  validateTairaRuntimeConfig(JSON.parse(await readFile(path.join(distDir, 'config.json'), 'utf8')));
  const manifest = {
    schema_version: 1,
    release_id: releaseIdFor(explorerRevision, runtimeRevision),
    previous_release_id: previousReleaseId,
    explorer_revision: explorerRevision,
    generator_revision: generatorRevision,
    sdk_revision: sdkRevision,
    runtime_revision: runtimeRevision,
    profile_revision: profileRevision,
    package_lock_sha256: await sha256File(packageLockPath),
    sdk_provenance: sdkProvenance,
    runtime_config: { path: 'config.json', sha256: configEntry.sha256 },
    files,
  };
  return validateReleaseManifest(manifest);
}

function preservePrimaryFailure(primaryError, cleanupErrors) {
  if (cleanupErrors.length === 0) return primaryError;
  try {
    Object.defineProperty(primaryError, 'cleanupErrors', {
      configurable: true,
      value: cleanupErrors,
    });
    return primaryError;
  } catch {
    return new AggregateError(
      [primaryError, ...cleanupErrors],
      'Durable file operation failed and cleanup also failed',
      { cause: primaryError }
    );
  }
}

async function cleanupOwnedTemporary({ temporaryPath, identity, lstatFn, removeFn, syncDirectoryFn }) {
  const cleanupErrors = [];
  let current;
  try {
    current = await lstatFn(temporaryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return cleanupErrors;
    cleanupErrors.push(error);
    return cleanupErrors;
  }
  if (current.dev !== identity.dev || current.ino !== identity.ino) {
    cleanupErrors.push(new Error(`Refusing to remove temporary path whose ownership changed: ${temporaryPath}`));
    return cleanupErrors;
  }
  try {
    await removeFn(temporaryPath, { force: false });
  } catch (error) {
    cleanupErrors.push(error);
    return cleanupErrors;
  }
  try {
    await syncDirectoryFn(path.dirname(temporaryPath));
  } catch (error) {
    cleanupErrors.push(error);
  }
  return cleanupErrors;
}

function validateDurableFileMode(mode) {
  if (mode !== null && (!Number.isInteger(mode) || mode < 0 || mode > 0o7777)) {
    throw new Error('Durable file mode must be an integer between 0000 and 07777');
  }
  return mode;
}

async function applyDurableFileMode(handle, mode) {
  if (mode !== null) await handle.chmod(mode);
}

export async function writeFileDurably(
  filePath,
  contents,
  {
    openFn = open,
    renameFn = rename,
    syncDirectoryFn = syncDirectory,
    removeFn = rm,
    lstatFn = lstat,
    randomBytesFn = randomBytes,
    mode = null,
  } = {}
) {
  const durableMode = validateDurableFileMode(mode);
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytesFn(6).toString('hex')}.tmp`
  );
  // An open failure yields no handle, so this call never owns or removes a colliding path.
  const handle = await openFn(temporaryPath, 'wx', durableMode ?? 0o644);

  let identity = null;
  let primaryError = null;
  const cleanupErrors = [];
  try {
    identity = await handle.stat();
    await handle.writeFile(contents, 'utf8');
    await applyDurableFileMode(handle, durableMode);
    await handle.sync();
  } catch (error) {
    primaryError = error;
  }
  try {
    await handle.close();
  } catch (error) {
    if (primaryError) cleanupErrors.push(error);
    else primaryError = error;
  }

  if (primaryError) {
    if (identity) {
      cleanupErrors.push(
        ...(await cleanupOwnedTemporary({
          temporaryPath,
          identity,
          lstatFn,
          removeFn,
          syncDirectoryFn,
        }))
      );
    } else {
      cleanupErrors.push(
        new Error(`Could not establish ownership of temporary path for safe cleanup: ${temporaryPath}`)
      );
    }
    throw preservePrimaryFailure(primaryError, cleanupErrors);
  }

  try {
    await renameFn(temporaryPath, filePath);
  } catch (error) {
    cleanupErrors.push(
      ...(await cleanupOwnedTemporary({
        temporaryPath,
        identity,
        lstatFn,
        removeFn,
        syncDirectoryFn,
      }))
    );
    throw preservePrimaryFailure(error, cleanupErrors);
  }

  try {
    await syncDirectoryFn(directory);
  } catch (error) {
    throw new DurableCommitUncertainError(
      `Durable file rename completed for ${filePath}, but its directory could not be synced`,
      { cause: error }
    );
  }
}

export async function publishFileDurablyNoReplace(
  filePath,
  contents,
  {
    openFn = open,
    linkFn = link,
    syncDirectoryFn = syncDirectory,
    removeFn = rm,
    lstatFn = lstat,
    randomBytesFn = randomBytes,
  } = {}
) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytesFn(6).toString('hex')}.publish`
  );
  // Exclusive creation means an unowned temporary collision is never cleaned up by this process.
  const handle = await openFn(temporaryPath, 'wx', 0o644);

  let identity = null;
  let primaryError = null;
  const cleanupErrors = [];
  try {
    identity = await handle.stat();
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } catch (error) {
    primaryError = error;
  }
  try {
    await handle.close();
  } catch (error) {
    if (primaryError) cleanupErrors.push(error);
    else primaryError = error;
  }

  if (primaryError) {
    if (identity) {
      cleanupErrors.push(
        ...(await cleanupOwnedTemporary({
          temporaryPath,
          identity,
          lstatFn,
          removeFn,
          syncDirectoryFn,
        }))
      );
    } else {
      cleanupErrors.push(new Error(`Could not establish ownership of publication temporary path: ${temporaryPath}`));
    }
    throw preservePrimaryFailure(primaryError, cleanupErrors);
  }

  try {
    // link(2) is an atomic no-replace publication: every pre-existing entry, including a
    // dangling symlink or a concurrent winner, causes EEXIST and is left untouched.
    await linkFn(temporaryPath, filePath);
  } catch (error) {
    cleanupErrors.push(
      ...(await cleanupOwnedTemporary({
        temporaryPath,
        identity,
        lstatFn,
        removeFn,
        syncDirectoryFn,
      }))
    );
    throw preservePrimaryFailure(error, cleanupErrors);
  }

  let publicationError = null;
  try {
    await syncDirectoryFn(directory);
  } catch (error) {
    publicationError = new DurableCommitUncertainError(
      `File ${filePath} was exclusively published, but its directory could not be synced`,
      { cause: error }
    );
  }
  cleanupErrors.push(
    ...(await cleanupOwnedTemporary({
      temporaryPath,
      identity,
      lstatFn,
      removeFn,
      syncDirectoryFn,
    }))
  );
  if (publicationError) throw preservePrimaryFailure(publicationError, cleanupErrors);
  if (cleanupErrors.length > 0) {
    throw new DurableCommitUncertainError(
      `File ${filePath} was published, but temporary-link cleanup durability is uncertain`,
      {
        cause: cleanupErrors.length === 1 ? cleanupErrors[0] : new AggregateError(cleanupErrors),
      }
    );
  }
}

export async function publishBaselineManifestOutput(filePath, contents, operations = {}) {
  const outputDirectory = path.dirname(filePath);
  if (!(await pathEntryStats(outputDirectory))) {
    throw new Error(`Manifest output directory must already exist: ${outputDirectory}`);
  }
  await inspectOwnedCanonicalRealDirectory(outputDirectory, 'Manifest output directory');
  await publishFileDurablyNoReplace(filePath, contents, operations);
}

export async function writeReleaseManifest(releaseDirectory, manifest) {
  validateReleaseManifest(manifest);
  await writeFileDurably(path.join(releaseDirectory, MANIFEST_NAME), serializeReleaseManifest(manifest), {
    mode: 0o644,
  });
}

export async function readReleaseManifest(releaseDirectory) {
  return readCanonicalManifestFile(path.join(releaseDirectory, MANIFEST_NAME));
}

async function readCanonicalManifestFile(manifestPath) {
  const { bytes, stats } = await readCanonicalRegularFileSnapshot(manifestPath, 'Release manifest');
  assertDeploymentOwnedNonWritable(stats, 'Release manifest', manifestPath);
  const source = bytes.toString('utf8');
  const manifest = validateReleaseManifest(JSON.parse(source));
  if (source !== serializeReleaseManifest(manifest)) {
    throw new Error(`Release manifest is not encoded in canonical bytes: ${manifestPath}`);
  }
  return manifest;
}

export async function verifyReleaseDirectory(releaseDirectory, expectedManifest = null) {
  await validateCanonicalRealDirectory(releaseDirectory, 'Release directory');
  const manifest = await readReleaseManifest(releaseDirectory);
  if (expectedManifest) {
    const expected = validateReleaseManifest(expectedManifest);
    if (serializeReleaseManifest(manifest) !== serializeReleaseManifest(expected)) {
      throw new Error(`Release manifest does not match the expected canonical manifest: ${releaseDirectory}`);
    }
  }
  await verifyReleaseInventory(releaseDirectory, manifest);
  return manifest;
}

async function verifyReleaseInventory(releaseDirectory, manifest) {
  const actualFiles = await collectReleaseFiles(releaseDirectory);
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
    throw new Error(`Release file inventory mismatch: ${releaseDirectory}`);
  }
}

async function resolveSymlinkTarget(linkPath) {
  const target = await readlink(linkPath);
  return path.resolve(path.dirname(linkPath), target);
}

export async function resolveActiveRelease(servedPath, releasesDir) {
  await validateCanonicalReleasePaths({ servedPath, releasesDir });
  const stats = await lstat(servedPath);
  if (!stats.isSymbolicLink()) {
    throw new Error(`${servedPath} must be an initialized release symlink`);
  }
  const target = await resolveSymlinkTarget(servedPath);
  if (path.dirname(target) !== path.resolve(releasesDir)) {
    throw new Error(`Active release points outside ${releasesDir}`);
  }
  const releaseId = path.basename(target);
  if (safeReleaseTarget(releasesDir, releaseId) !== target) {
    throw new Error('Active release target is not canonical');
  }
  const targetStats = await lstat(target);
  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    throw new Error('Active release target must be a real directory');
  }
  const manifest = await verifyReleaseDirectory(target);
  if (manifest.release_id !== releaseId) {
    throw new Error('Active release directory name does not match its manifest');
  }
  return { releaseId, target, manifest };
}

export async function atomicSwitchRelease({ servedPath, releasesDir, releaseId, syncDirectoryFn = syncDirectory }) {
  const releasePaths = await inspectCanonicalReleasePaths({ servedPath, releasesDir });
  if (!releasePaths.releasesIdentity) {
    throw new Error(`Taira release store does not exist: ${releasesDir}`);
  }
  const target = safeReleaseTarget(releasesDir, releaseId);
  const stats = await lstat(target);
  if (!stats.isDirectory()) throw new Error(`Release target is not a directory: ${target}`);
  assertDeploymentOwnedNonWritable(stats, 'Release target', target);
  const targetIdentity = fileIdentity(stats);
  const manifest = await verifyReleaseDirectory(target);
  if (manifest.release_id !== releaseId) {
    throw new Error('Release target directory does not match its manifest');
  }
  const parent = path.dirname(servedPath);
  await recheckPublicReleaseParent(parent, releasePaths.parentIdentity);
  await recheckPublicReleaseStore(releasesDir, releasePaths.releasesIdentity);
  await recheckOwnedCanonicalRealDirectory(target, 'Release target', targetIdentity);
  const temporaryLink = path.join(
    parent,
    `.${path.basename(servedPath)}.switch.${process.pid}.${randomBytes(6).toString('hex')}`
  );
  const relativeTarget = path.relative(parent, target);
  await symlink(relativeTarget, temporaryLink, 'dir');
  let renamed = false;
  try {
    await recheckPublicReleaseParent(parent, releasePaths.parentIdentity);
    await recheckPublicReleaseStore(releasesDir, releasePaths.releasesIdentity);
    await recheckOwnedCanonicalRealDirectory(target, 'Release target', targetIdentity);
    await rename(temporaryLink, servedPath);
    renamed = true;
    try {
      await syncDirectoryFn(parent);
    } catch (error) {
      throw new CutoverCommitUncertainError(
        `Release pointer switched to ${releaseId}, but the parent directory could not be synced`,
        { cause: error }
      );
    }
  } finally {
    if (!renamed) await rm(temporaryLink, { force: true });
  }
}

async function cleanupReleaseLock({
  handle,
  lockPath,
  lockIdentity,
  tokenPath,
  tokenCreated,
  parent,
  removeTokenFn,
  rmdirFn,
  lstatFn,
  syncDirectoryFn,
}) {
  const cleanupErrors = [];
  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  let ownTokenRemoved = !tokenCreated;
  if (tokenCreated) {
    try {
      // Only this transaction knows its random lease entry. Never unlink the shared lock path.
      await removeTokenFn(tokenPath, { force: false });
      ownTokenRemoved = true;
    } catch (error) {
      cleanupErrors.push(
        error?.code === 'ENOENT'
          ? new Error(`Release lock lease disappeared before owned cleanup: ${tokenPath}`, {
              cause: error,
            })
          : error
      );
    }
  }

  let lockDirectoryRemoved = false;
  if (ownTokenRemoved) {
    try {
      const current = await lstatFn(lockPath);
      if (current.dev !== lockIdentity.dev || current.ino !== lockIdentity.ino) {
        throw new Error(`Refusing to remove release lock whose directory identity changed: ${lockPath}`);
      }
      // rmdir(2) is the ownership guard: a replacement transaction's distinct lease makes its
      // directory non-empty, so cleanup cannot remove it.
      await rmdirFn(lockPath);
      lockDirectoryRemoved = true;
    } catch (error) {
      cleanupErrors.push(
        error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST'
          ? new Error(`Refusing to remove release lock containing another lease: ${lockPath}`, {
              cause: error,
            })
          : error
      );
    }
  }
  let removalDurabilityUncertain = false;
  try {
    await syncDirectoryFn(parent);
  } catch (error) {
    cleanupErrors.push(error);
    removalDurabilityUncertain = lockDirectoryRemoved;
  }
  return { cleanupErrors, removalDurabilityUncertain };
}

async function inspectReleaseLockRoots(releasesDir) {
  const parent = path.dirname(releasesDir);
  const parentIdentity = await inspectPublicReleaseParent(parent);
  const existingStore = await pathEntryStats(releasesDir);
  const releasesIdentity = existingStore ? await inspectPublicReleaseStore(releasesDir) : null;
  return { parent, parentIdentity, releasesIdentity };
}

async function validateCreatedReleaseLock({
  lockPath,
  lstatFn,
  parent,
  parentIdentity,
  releasesDir,
  releasesIdentity,
}) {
  await chmod(lockPath, 0o700);
  const lockIdentity = await lstatFn(lockPath);
  if (!lockIdentity.isDirectory() || lockIdentity.isSymbolicLink()) {
    throw new Error(`Taira release lock must be a real directory: ${lockPath}`);
  }
  assertDeploymentOwnedNonWritable(lockIdentity, 'Taira release lock', lockPath);
  if ((lockIdentity.mode & 0o777) !== 0o700) {
    throw new Error(`Taira release lock must have mode 0700: ${lockPath}`);
  }
  await recheckPublicReleaseParent(parent, parentIdentity);
  if (releasesIdentity) {
    await recheckPublicReleaseStore(releasesDir, releasesIdentity);
  }
  return lockIdentity;
}

export async function withReleaseLock(
  { releasesDir },
  action,
  {
    mkdirFn = mkdir,
    openFn = open,
    removeTokenFn = rm,
    rmdirFn = rmdir,
    lstatFn = lstat,
    syncDirectoryFn = syncDirectory,
    randomBytesFn = randomBytes,
  } = {}
) {
  const { parent, parentIdentity, releasesIdentity } = await inspectReleaseLockRoots(releasesDir);
  const lockPath = path.join(parent, '.taira-release.lock');
  try {
    await mkdirFn(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Another Taira release transaction owns ${lockPath}`, { cause: error });
    }
    throw error;
  }
  const lockIdentity = await validateCreatedReleaseLock({
    lockPath,
    lstatFn,
    parent,
    parentIdentity,
    releasesDir,
    releasesIdentity,
  });

  const token = `${process.pid}-${randomBytesFn(16).toString('hex')}`;
  const tokenPath = path.join(lockPath, `${token}.lease`);
  let handle = null;
  let tokenCreated = false;
  let result;
  let actionError = null;
  try {
    handle = await openFn(tokenPath, 'wx', 0o600);
    tokenCreated = true;
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, token })}\n`, 'utf8');
    await handle.sync();
    await syncDirectoryFn(lockPath);
    await syncDirectoryFn(parent);
    result = await action();
  } catch (error) {
    actionError = error;
  }

  const { cleanupErrors, removalDurabilityUncertain } = await cleanupReleaseLock({
    handle,
    lockPath,
    lockIdentity,
    tokenPath,
    tokenCreated,
    parent,
    removeTokenFn,
    rmdirFn,
    lstatFn,
    syncDirectoryFn,
  });

  if (removalDurabilityUncertain) {
    throw new ReleaseLockRemovalUncertainError(actionError, cleanupErrors);
  }
  if (cleanupErrors.length > 0) {
    const errors = actionError ? [actionError, ...cleanupErrors] : cleanupErrors;
    throw new AggregateError(errors, 'Release lock cleanup failed', {
      cause: actionError ?? cleanupErrors[0],
    });
  }
  if (actionError) throw actionError;
  return result;
}

async function verifyPublicReleaseIfConfigured({ baseUrl, statusUrl, manifest, verification }) {
  if (!baseUrl || !statusUrl) return;
  await verifyPublicReleaseWithRetries({ baseUrl, statusUrl, manifest, ...verification });
}

async function restoreBaselineLayout({
  servedPath,
  releasesDir,
  releaseTarget,
  baselineManifest,
  pointerPublished,
  renameFn,
  syncDirectoryFn,
  removeFn,
  originalError,
}) {
  try {
    if (pointerPublished) {
      const active = await resolveActiveRelease(servedPath, releasesDir);
      if (active.releaseId !== baselineManifest.release_id) {
        throw new Error('published baseline is not the active release');
      }
      await removeFn(servedPath, { force: false });
      await syncDirectoryFn(path.dirname(servedPath));
    }
    const servedEntry = await pathEntryStats(servedPath);
    const releaseEntry = await pathEntryStats(releaseTarget);
    if (!servedEntry && releaseEntry) {
      await removeFn(path.join(releaseTarget, MANIFEST_NAME), { force: true });
      await syncDirectoryFn(releaseTarget);
      await renameFn(releaseTarget, servedPath);
      await syncDirectoryFn(releasesDir);
      await syncDirectoryFn(path.dirname(servedPath));
      return;
    }
    if (!servedEntry) throw new Error('the original served directory could not be located');
  } catch (restorationError) {
    throw new DurableCommitUncertainError(
      'Baseline initialization failed and durable restoration could not be confirmed',
      { cause: new AggregateError([originalError, restorationError]) }
    );
  }
}

async function restoreOriginalRuntimeConfig(servedPath, originalConfig, originalError) {
  if (originalConfig === null) return;
  try {
    await writeFileDurably(path.join(servedPath, 'config.json'), originalConfig.bytes, {
      mode: originalConfig.mode,
    });
  } catch (restorationError) {
    throw new DurableCommitUncertainError(
      'Baseline initialization failed and the original runtime config could not be restored',
      { cause: new AggregateError([originalError, restorationError]) }
    );
  }
}

async function inspectBaselineInitialization({
  servedPath,
  releasesDir,
  baselineManifestPath,
  suppliedBaselineManifest,
}) {
  const initialPaths = await inspectCanonicalReleasePaths({ servedPath, releasesDir });
  const releasesIdentity = await ensurePrivateReleaseStore({ servedPath, releasesDir });
  await recheckPublicReleaseParent(initialPaths.parent, initialPaths.parentIdentity);
  await recheckPublicReleaseStore(releasesDir, releasesIdentity);
  if (suppliedBaselineManifest === null && baselineManifestPath === null) {
    throw new Error('A canonical reviewed baseline manifest is required for initialization');
  }
  const baselineManifest =
    suppliedBaselineManifest === null
      ? await readCanonicalManifestFile(baselineManifestPath)
      : validateReleaseManifest(suppliedBaselineManifest);
  if (baselineManifest.previous_release_id !== null) {
    throw new Error('The imported baseline manifest must not name a previous release');
  }
  const servedStats = await lstat(servedPath);
  if (servedStats.isSymbolicLink()) {
    const active = await resolveActiveRelease(servedPath, releasesDir);
    if (serializeReleaseManifest(active.manifest) !== serializeReleaseManifest(baselineManifest)) {
      throw new Error(
        `Release store is initialized at ${active.releaseId}, not supplied reviewed baseline ` +
          baselineManifest.release_id
      );
    }
    return { active, baselineManifest };
  }
  if (!servedStats.isDirectory()) {
    throw new Error(`${servedPath} must be a directory for one-time initialization`);
  }
  assertDeploymentOwnedNonWritable(servedStats, 'Uninitialized live release root', servedPath);
  const servedIdentity = fileIdentity(servedStats);
  await collectReleaseFiles(servedPath);
  await recheckOwnedCanonicalRealDirectory(servedPath, 'Uninitialized live release root', servedIdentity);
  if (await pathEntryStats(path.join(servedPath, MANIFEST_NAME))) {
    throw new Error(`Uninitialized live directory must not contain reserved ${MANIFEST_NAME}`);
  }
  const releaseTarget = safeReleaseTarget(releasesDir, baselineManifest.release_id);
  if (await pathEntryStats(releaseTarget)) {
    throw new Error(`Refusing to overwrite existing release ${baselineManifest.release_id}`);
  }
  return {
    active: null,
    baselineManifest,
    releaseTarget,
    servedIdentity,
    releasesIdentity,
    parentIdentity: initialPaths.parentIdentity,
  };
}

async function snapshotBaselineRuntimeConfig(servedPath) {
  const servedConfigPath = path.join(servedPath, 'config.json');
  const snapshot = await readCanonicalRegularFileSnapshot(servedConfigPath, 'Existing served runtime config');
  return { bytes: snapshot.bytes, mode: snapshot.stats.mode & 0o7777 };
}

async function installBaselineRuntimeConfig({
  installRuntimeConfigFn,
  replacementConfigPath,
  replacementConfig,
  servedPath,
  runtimeConfigForbiddenRoots,
}) {
  await installRuntimeConfigFn(
    {
      configPath: replacementConfigPath,
      distDir: servedPath,
      forbiddenRoots: runtimeConfigForbiddenRoots,
    },
    { [VALIDATED_RUNTIME_CONFIG]: replacementConfig }
  );
}

async function commitBaselineInitialization(options, inspection) {
  const {
    servedPath,
    releasesDir,
    baseUrl = null,
    statusUrl = null,
    verification = {},
    operations = {},
    replacementConfigPath = null,
    runtimeConfigForbiddenRoots = [],
  } = options;
  const { baselineManifest, releaseTarget, servedIdentity, releasesIdentity, parentIdentity } = inspection;
  const renameFn = operations.renameFn ?? rename;
  const syncDirectoryFn = operations.syncDirectoryFn ?? syncDirectory;
  const removeFn = operations.removeFn ?? rm;
  const writeReleaseManifestFn = operations.writeReleaseManifestFn ?? writeReleaseManifest;
  const installRuntimeConfigFn = operations.installRuntimeConfigFn ?? installTairaRuntimeConfig;
  const replacementConfig = options[VALIDATED_RUNTIME_CONFIG] ?? null;
  let moved = false;
  let pointerPublished = false;
  let originalConfig = null;
  try {
    await recheckPublicReleaseParent(path.dirname(servedPath), parentIdentity);
    await recheckPublicReleaseStore(releasesDir, releasesIdentity);
    await recheckOwnedCanonicalRealDirectory(servedPath, 'Uninitialized live release root', servedIdentity);
    if (replacementConfigPath) {
      // Keep the original bytes in the caller before the replacement write begins. A durable
      // write can commit its rename and then throw when the parent fsync fails; assigning only
      // after that await would lose the sole restoration snapshot.
      originalConfig = await snapshotBaselineRuntimeConfig(servedPath);
      await installBaselineRuntimeConfig({
        installRuntimeConfigFn,
        servedPath,
        replacementConfigPath,
        replacementConfig,
        runtimeConfigForbiddenRoots,
      });
    }
    await verifyReleaseInventory(servedPath, baselineManifest);
    await recheckPublicReleaseParent(path.dirname(servedPath), parentIdentity);
    await recheckPublicReleaseStore(releasesDir, releasesIdentity);
    await recheckOwnedCanonicalRealDirectory(servedPath, 'Uninitialized live release root', servedIdentity);
    if (await pathEntryStats(releaseTarget)) {
      throw new Error(`Refusing to overwrite existing release ${baselineManifest.release_id}`);
    }
    await renameFn(servedPath, releaseTarget);
    moved = true;
    await recheckOwnedCanonicalRealDirectory(releaseTarget, 'Imported baseline release root', servedIdentity);
    await syncDirectoryFn(path.dirname(servedPath));
    await syncDirectoryFn(releasesDir);
    await writeReleaseManifestFn(releaseTarget, baselineManifest);
    await syncTree(releaseTarget);
    await atomicSwitchRelease({
      servedPath,
      releasesDir,
      releaseId: baselineManifest.release_id,
    });
    pointerPublished = true;
    await verifyPublicReleaseIfConfigured({
      baseUrl,
      statusUrl,
      manifest: baselineManifest,
      verification,
    });
  } catch (error) {
    if (error instanceof CutoverCommitUncertainError) throw error;
    if (moved)
      await restoreBaselineLayout({
        servedPath,
        releasesDir,
        releaseTarget,
        baselineManifest,
        pointerPublished,
        renameFn,
        syncDirectoryFn,
        removeFn,
        originalError: error,
      });
    if (originalConfig !== null) {
      await restoreOriginalRuntimeConfig(servedPath, originalConfig, error);
    }
    throw error;
  }
  return {
    releaseId: baselineManifest.release_id,
    target: releaseTarget,
    manifest: baselineManifest,
    alreadyInitialized: false,
  };
}

export async function initializeReleaseStore(options) {
  let validatedOptions = options;
  if (options.replacementConfigPath && !Object.prototype.hasOwnProperty.call(options, VALIDATED_RUNTIME_CONFIG)) {
    const config = await readOperatorRuntimeConfig(options.replacementConfigPath, {
      forbiddenRoots: options.runtimeConfigForbiddenRoots ?? [],
    });
    validatedOptions = { ...options, [VALIDATED_RUNTIME_CONFIG]: config };
  }
  if (!validatedOptions.lockHeld) {
    return withReleaseLock(
      validatedOptions,
      () => initializeReleaseStore({ ...validatedOptions, lockHeld: true }),
      validatedOptions.lockOperations
    );
  }
  const {
    servedPath,
    releasesDir,
    baselineManifestPath = null,
    baselineManifest: suppliedBaselineManifest = null,
    baseUrl = null,
    statusUrl = null,
    verification = {},
  } = validatedOptions;
  const inspection = await inspectBaselineInitialization({
    servedPath,
    releasesDir,
    baselineManifestPath,
    suppliedBaselineManifest,
  });
  if (validatedOptions.reviewedBaselineInventoryPath) {
    const verifyReviewedBaselineInventoryFn =
      validatedOptions.operations?.verifyReviewedBaselineInventoryFn ?? verifyReviewedBaselineInventory;
    const inventoryRoot = inspection.active?.target ?? servedPath;
    const reviewedInventory = await verifyReviewedBaselineInventoryFn(
      inventoryRoot,
      validatedOptions.reviewedBaselineInventoryPath
    );
    validateReviewedBaselineManifestInventory(inspection.baselineManifest, reviewedInventory);
  }
  if (inspection.active) {
    await verifyPublicReleaseIfConfigured({
      baseUrl,
      statusUrl,
      manifest: inspection.active.manifest,
      verification,
    });
    return { ...inspection.active, alreadyInitialized: true };
  }
  return commitBaselineInitialization(validatedOptions, inspection);
}

function publicFileUrl(baseUrl, relativePath, releaseId) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const url = new URL(encodedPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('release', releaseId);
  return url;
}

async function fetchChecked(url, { accept = null, method = 'GET', requestHeaders = {} } = {}) {
  const headers = { 'cache-control': 'no-cache', ...requestHeaders };
  if (accept) headers.accept = accept;
  const response = await fetch(url, {
    cache: 'no-store',
    headers,
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

function requireExactCorsOrigin(response, url) {
  const actualOrigin = response.headers.get('access-control-allow-origin');
  if (actualOrigin !== TAIRA_EXPLORER_ORIGIN) {
    throw new Error(
      `${url} must authorize browser origin ${TAIRA_EXPLORER_ORIGIN}; found ${actualOrigin ?? 'no Access-Control-Allow-Origin'}`
    );
  }
}

function commaSeparatedHeaderValues(response, name) {
  return new Set(
    (response.headers.get(name) ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function verifyCorsPreflight(url, method, requestedHeaders) {
  const preflightResponse = await fetchChecked(url, {
    method: 'OPTIONS',
    requestHeaders: {
      origin: TAIRA_EXPLORER_ORIGIN,
      'access-control-request-headers': requestedHeaders.join(', '),
      'access-control-request-method': method,
    },
  });
  requireExactCorsOrigin(preflightResponse, url);
  if (!commaSeparatedHeaderValues(preflightResponse, 'access-control-allow-methods').has(method.toLowerCase())) {
    throw new Error(`${url} CORS preflight must allow ${method}`);
  }
  const allowedHeaders = commaSeparatedHeaderValues(preflightResponse, 'access-control-allow-headers');
  for (const header of requestedHeaders) {
    if (!allowedHeaders.has(header.toLowerCase())) {
      throw new Error(`${url} CORS preflight must allow the ${header} header`);
    }
  }
}

export async function verifyToriiBrowserCors(statusUrl) {
  const originHeaders = { origin: TAIRA_EXPLORER_ORIGIN };
  const statusResponse = await fetchChecked(statusUrl, {
    accept: 'application/json',
    requestHeaders: originHeaders,
  });
  requireExactCorsOrigin(statusResponse, statusUrl);

  await verifyCorsPreflight(new URL('/v1/explorer/blocks', statusUrl), 'GET', ['Accept']);
  await verifyCorsPreflight(new URL('/v1/pipeline/transactions', statusUrl), 'POST', ['Content-Type']);
  await verifyCorsPreflight(new URL('/v1/multisig/spec', statusUrl), 'POST', [
    'Content-Type',
    'X-Iroha-Account',
    'X-Iroha-Signature',
    'X-Iroha-Timestamp-Ms',
    'X-Iroha-Nonce',
    'X-Iroha-Witness',
  ]);
  return statusResponse;
}

export async function fetchRuntimeRevision(statusUrl) {
  const response = await verifyToriiBrowserCors(statusUrl);
  const payload = await response.json();
  const revision = payload?.build?.git_commit_sha;
  assertRevision(revision, 'Torii /status build.git_commit_sha');
  return revision;
}

export async function verifyPublicRelease({ baseUrl, statusUrl, manifest }) {
  validateReleaseManifest(manifest);
  const remoteManifestResponse = await fetchChecked(publicFileUrl(baseUrl, MANIFEST_NAME, manifest.release_id));
  const remoteManifest = await remoteManifestResponse.text();
  if (remoteManifest !== serializeReleaseManifest(manifest)) {
    throw new Error('Public release manifest does not match the active local manifest');
  }

  let indexBytes = null;
  for (const file of manifest.files) {
    const response = await fetchChecked(publicFileUrl(baseUrl, file.path, manifest.release_id));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== file.size || sha256(bytes) !== file.sha256) {
      throw new Error(`Public release file does not match its manifest: ${file.path}`);
    }
    if (file.path === 'index.html') indexBytes = bytes;
  }
  if (!indexBytes) throw new Error('Public release manifest does not contain index.html');
  for (const route of ['', 'accounts']) {
    const url = publicFileUrl(baseUrl, route, manifest.release_id);
    const response = await fetchChecked(url, { accept: 'text/html' });
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'text/html') {
      throw new Error(`${url} must serve the SPA shell as text/html`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== indexBytes.byteLength || bytes.some((byte, index) => byte !== indexBytes[index])) {
      throw new Error(`${url} must serve the exact active index.html SPA shell`);
    }
  }
  const runtimeRevision = await fetchRuntimeRevision(statusUrl);
  if (runtimeRevision !== manifest.runtime_revision) {
    throw new Error(`Torii runtime ${runtimeRevision} does not match release runtime ${manifest.runtime_revision}`);
  }
  return manifest;
}

export async function verifyPublicReleaseWithRetries(options) {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 2_000;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyPublicRelease(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
  }
  throw new Error(`Public release verification failed after ${attempts} attempts`, {
    cause: lastError,
  });
}

async function rollbackAfterFailedSmoke({
  servedPath,
  releasesDir,
  previous,
  baseUrl,
  statusUrl,
  verification,
  failedReleaseId,
  cause,
}) {
  try {
    await atomicSwitchRelease({ servedPath, releasesDir, releaseId: previous.releaseId });
    await verifyPublicReleaseWithRetries({
      baseUrl,
      statusUrl,
      manifest: previous.manifest,
      ...verification,
    });
  } catch (rollbackError) {
    throw new Error(
      `Release ${failedReleaseId} failed smoke checks and rollback to ${previous.releaseId} also failed`,
      { cause: new AggregateError([cause, rollbackError]) }
    );
  }
  throw new DeploymentRolledBackError(
    `Release ${failedReleaseId} failed smoke checks; restored ${previous.releaseId}`,
    { cause }
  );
}

function validateRuntimeTransitionIntent(previous, runtimeRevision, runtimeTransitionFrom) {
  const previousRuntimeRevision = previous.manifest.runtime_revision;
  const isRuntimeTransition = previousRuntimeRevision !== runtimeRevision;
  if (!isRuntimeTransition) {
    if (runtimeTransitionFrom !== null) {
      throw new Error('Coupled-runtime transition intent is invalid for a same-runtime deployment');
    }
    return { isRuntimeTransition, previousRuntimeRevision };
  }
  if (runtimeTransitionFrom === null) {
    throw new RuntimeTransitionIntentRequiredError(
      `Active Explorer ${previous.releaseId} is bound to Torii ${previousRuntimeRevision}, while ` +
        `the deployment targets ${runtimeRevision}; use the explicit coupled-runtime transition ` +
        'mode with the exact predecessor runtime'
    );
  }
  assertRevision(runtimeTransitionFrom, 'runtimeTransitionFrom');
  if (runtimeTransitionFrom !== previousRuntimeRevision) {
    throw new RuntimeTransitionIntentRequiredError(
      `Coupled-runtime transition declared predecessor ${runtimeTransitionFrom}, but active ` +
        `Explorer ${previous.releaseId} is bound to ${previousRuntimeRevision}`
    );
  }
  return { isRuntimeTransition, previousRuntimeRevision };
}

async function verifyDeploymentSmoke({
  baseUrl,
  statusUrl,
  manifest,
  verification,
  isRuntimeTransition,
  previousRuntimeRevision,
  previous,
  servedPath,
  releasesDir,
  releaseId,
}) {
  try {
    await verifyPublicReleaseWithRetries({ baseUrl, statusUrl, manifest, ...verification });
    return;
  } catch (error) {
    if (isRuntimeTransition) {
      throw new CoupledRuntimeRollbackRequiredError({
        failedReleaseId: releaseId,
        failedRuntimeRevision: manifest.runtime_revision,
        previousReleaseId: previous.releaseId,
        previousRuntimeRevision,
        cause: error,
      });
    }
    const rollbackPrevious =
      previous.releaseId === releaseId ? await resolvePredecessorRelease(releasesDir, manifest) : previous;
    await rollbackAfterFailedSmoke({
      servedPath,
      releasesDir,
      previous: rollbackPrevious,
      baseUrl,
      statusUrl,
      verification,
      failedReleaseId: releaseId,
      cause: error,
    });
  }
}

async function publishPreparedReleaseLocked(options, previous) {
  const {
    distDir,
    packageLockPath,
    releasesDir,
    explorerRevision,
    generatorRevision,
    sdkRevision,
    runtimeRevision,
    profileRevision,
    sdkProvenance,
    bundleBudgetPath = path.join(path.dirname(packageLockPath), 'bundle-budgets.json'),
    operations = {},
  } = options;
  const renameFn = operations.renameFn ?? rename;
  const syncDirectoryFn = operations.syncDirectoryFn ?? syncDirectory;
  const syncTreeFn = operations.syncTreeFn ?? syncTree;
  if (generatorRevision !== explorerRevision) {
    throw new Error('New releases require generatorRevision to match explorerRevision');
  }
  if (sdkRevision !== runtimeRevision || profileRevision !== runtimeRevision) {
    throw new Error('New releases require the SDK, Mochi profile, and Torii runtime to use one revision');
  }
  if (await pathExists(path.join(distDir, MANIFEST_NAME))) {
    throw new Error(`Build output must not contain a pre-existing ${MANIFEST_NAME}`);
  }
  await validateCanonicalRealDirectory(distDir, 'Release dist');
  await validateCanonicalRegularFile(packageLockPath, 'Package lock');
  await validateCanonicalRegularFile(bundleBudgetPath, 'Bundle budget');
  const releaseId = releaseIdFor(explorerRevision, runtimeRevision);
  const releaseTarget = safeReleaseTarget(releasesDir, releaseId);

  const stagingDirectory = path.join(
    releasesDir,
    `.staging-${releaseId}-${process.pid}-${randomBytes(6).toString('hex')}`
  );
  let published = false;
  try {
    await cp(distDir, stagingDirectory, { recursive: true, errorOnExist: true, force: false });
    await validateCanonicalRealDirectory(stagingDirectory, 'Release staging directory');
    const bundleResult = runBundleBudgetCheck({
      distDir: stagingDirectory,
      manifestPath: path.join(stagingDirectory, '.vite/manifest.json'),
      budgetPath: bundleBudgetPath,
    });
    if (bundleResult.failures.length > 0) {
      throw new Error(formatBundleBudgetReport(bundleResult));
    }
    const manifest = await createReleaseManifest({
      distDir: stagingDirectory,
      packageLockPath,
      explorerRevision,
      generatorRevision,
      sdkRevision,
      runtimeRevision,
      profileRevision,
      sdkProvenance,
      previousReleaseId: previous.releaseId === releaseId ? previous.manifest.previous_release_id : previous.releaseId,
    });
    await writeReleaseManifest(stagingDirectory, manifest);
    await verifyReleaseDirectory(stagingDirectory, manifest);
    await syncTree(stagingDirectory);

    const existingTarget = await pathEntryStats(releaseTarget);
    if (existingTarget) {
      if (!existingTarget.isDirectory() || existingTarget.isSymbolicLink()) {
        throw new Error(`Immutable release target is not a real directory: ${releaseTarget}`);
      }
      await verifyReleaseDirectory(releaseTarget, manifest);
      await rm(stagingDirectory, { recursive: true, force: false });
      await syncTreeFn(releaseTarget);
      await verifyReleaseDirectory(releaseTarget, manifest);
      try {
        await syncDirectoryFn(releasesDir);
      } catch (error) {
        throw new ReleasePublicationUncertainError(
          `Exact immutable release ${releaseId} was resynced, but release-store durability could ` +
            'not be confirmed before cutover; retry with identical inputs',
          { cause: error }
        );
      }
      published = true;
    } else {
      await renameFn(stagingDirectory, releaseTarget);
      published = true;
      try {
        await syncDirectoryFn(releasesDir);
      } catch (error) {
        throw new ReleasePublicationUncertainError(
          `Immutable release ${releaseId} was renamed into the store, but the store could not be synced; ` +
            'retry with the identical inputs to reconcile and adopt it',
          { cause: error }
        );
      }
    }
    await verifyReleaseDirectory(releaseTarget, manifest);
    return {
      releaseId,
      target: releaseTarget,
      manifest,
      previousReleaseId: manifest.previous_release_id,
      adoptedExisting: Boolean(existingTarget),
    };
  } finally {
    if (!published) await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function prepareTransitionRelease(options) {
  if (!options.lockHeld) {
    return withReleaseLock(
      options,
      () => prepareTransitionRelease({ ...options, lockHeld: true }),
      options.lockOperations
    );
  }
  const { servedPath, releasesDir, runtimeRevision, runtimeTransitionFrom, currentRuntimeRevision } = options;
  const previous = await resolveActiveRelease(servedPath, releasesDir);
  if (currentRuntimeRevision !== previous.manifest.runtime_revision) {
    throw new Error(
      `Active Explorer expects Torii ${previous.manifest.runtime_revision}, but live Torii reports ` +
        `${currentRuntimeRevision}`
    );
  }
  const { isRuntimeTransition } = validateRuntimeTransitionIntent(previous, runtimeRevision, runtimeTransitionFrom);
  if (!isRuntimeTransition) {
    throw new Error('prepare-transition requires a target runtime different from the active runtime');
  }
  return publishPreparedReleaseLocked(options, previous);
}

export async function activatePreparedTransition(options) {
  if (!options.lockHeld) {
    return withReleaseLock(
      options,
      () => activatePreparedTransition({ ...options, lockHeld: true }),
      options.lockOperations
    );
  }
  const {
    releaseId,
    expectedManifest,
    servedPath,
    releasesDir,
    baseUrl,
    statusUrl,
    currentRuntimeRevision,
    runtimeTransitionFrom,
    verification = {},
  } = options;
  const previous = await resolveActiveRelease(servedPath, releasesDir);
  assertRevision(runtimeTransitionFrom, 'runtimeTransitionFrom');
  if (previous.manifest.runtime_revision !== runtimeTransitionFrom) {
    throw new RuntimeTransitionIntentRequiredError(
      `Active Explorer ${previous.releaseId} is bound to ${previous.manifest.runtime_revision}, not ` +
        `declared predecessor ${runtimeTransitionFrom}`
    );
  }
  const target = safeReleaseTarget(releasesDir, releaseId);
  const manifest = await verifyReleaseDirectory(target, expectedManifest);
  if (manifest.release_id !== releaseId) {
    throw new Error('Prepared transition release directory does not match its manifest');
  }
  if (manifest.previous_release_id !== previous.releaseId) {
    throw new Error(
      `Prepared transition ${releaseId} expects predecessor ${manifest.previous_release_id}, not ` +
        `${previous.releaseId}`
    );
  }
  if (manifest.runtime_revision !== currentRuntimeRevision) {
    throw new Error(
      `Prepared transition expects Torii ${manifest.runtime_revision}, but live Torii reports ` +
        `${currentRuntimeRevision}`
    );
  }
  if (manifest.runtime_revision === previous.manifest.runtime_revision) {
    throw new Error('Prepared transition must change the Torii runtime revision');
  }
  await atomicSwitchRelease({ servedPath, releasesDir, releaseId });
  await verifyDeploymentSmoke({
    baseUrl,
    statusUrl,
    manifest,
    verification,
    isRuntimeTransition: true,
    previousRuntimeRevision: previous.manifest.runtime_revision,
    previous,
    servedPath,
    releasesDir,
    releaseId,
  });
  return { releaseId, target, manifest, previousReleaseId: previous.releaseId };
}

export async function deployRelease(options) {
  if (!options.lockHeld) {
    return withReleaseLock(options, () => deployRelease({ ...options, lockHeld: true }), options.lockOperations);
  }
  const { servedPath, releasesDir, runtimeRevision, baseUrl, statusUrl, verification = {} } = options;
  const previous = await resolveActiveRelease(servedPath, releasesDir);
  const { isRuntimeTransition, previousRuntimeRevision } = validateRuntimeTransitionIntent(
    previous,
    runtimeRevision,
    null
  );
  if (isRuntimeTransition) {
    throw new RuntimeTransitionIntentRequiredError(
      'Same-runtime deploy cannot publish a coupled runtime transition; use prepare-transition'
    );
  }
  const prepared = await publishPreparedReleaseLocked(options, previous);
  if (previous.releaseId !== prepared.releaseId) {
    await atomicSwitchRelease({ servedPath, releasesDir, releaseId: prepared.releaseId });
  }
  await verifyDeploymentSmoke({
    baseUrl,
    statusUrl,
    manifest: prepared.manifest,
    verification,
    isRuntimeTransition: false,
    previousRuntimeRevision,
    previous,
    servedPath,
    releasesDir,
    releaseId: prepared.releaseId,
  });
  return prepared;
}

async function resolvePredecessorRelease(releasesDir, manifest) {
  if (manifest.previous_release_id === null) {
    throw new Error(`Release ${manifest.release_id} has no predecessor available for automatic rollback`);
  }
  const target = safeReleaseTarget(releasesDir, manifest.previous_release_id);
  const predecessor = await verifyReleaseDirectory(target);
  if (predecessor.release_id !== manifest.previous_release_id) {
    throw new Error('Predecessor release directory does not match its manifest');
  }
  if (predecessor.runtime_revision !== manifest.runtime_revision) {
    throw new Error(`Predecessor ${predecessor.release_id} is not compatible with Torii ${manifest.runtime_revision}`);
  }
  return { releaseId: predecessor.release_id, target, manifest: predecessor };
}

export async function rollbackRelease(options) {
  if (!options.lockHeld) {
    return withReleaseLock(options, () => rollbackRelease({ ...options, lockHeld: true }), options.lockOperations);
  }
  const {
    releaseId,
    servedPath,
    releasesDir,
    baseUrl,
    statusUrl,
    currentRuntimeRevision,
    expectedManifest = null,
    verification = {},
  } = options;
  const previous = await resolveActiveRelease(servedPath, releasesDir);
  const target = safeReleaseTarget(releasesDir, releaseId);
  const targetStats = await lstat(target);
  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    throw new Error(`Rollback target must be a real directory: ${target}`);
  }
  const manifest = await verifyReleaseDirectory(target, expectedManifest);
  if (manifest.release_id !== releaseId) throw new Error('Rollback target manifest does not match its directory');
  if (manifest.runtime_revision !== currentRuntimeRevision) {
    throw new Error(
      `Rollback release expects Torii ${manifest.runtime_revision}, but current runtime is ${currentRuntimeRevision}`
    );
  }
  const activeRuntimeCompatible = previous.manifest.runtime_revision === currentRuntimeRevision;
  const isCoupledRecovery = !activeRuntimeCompatible && previous.manifest.previous_release_id === releaseId;
  if (!activeRuntimeCompatible && !isCoupledRecovery) {
    throw new Error(
      `Active release expects Torii ${previous.manifest.runtime_revision}, but current runtime is ` +
        `${currentRuntimeRevision}; coupled recovery is allowed only to its exact runtime-compatible ` +
        'predecessor after Torii is rolled back first'
    );
  }
  if (previous.releaseId === releaseId) {
    await verifyPublicReleaseWithRetries({
      baseUrl,
      statusUrl,
      manifest,
      ...verification,
    });
    return { ...previous, alreadyActive: true };
  }

  await atomicSwitchRelease({ servedPath, releasesDir, releaseId });
  try {
    await verifyPublicReleaseWithRetries({
      baseUrl,
      statusUrl,
      manifest,
      ...verification,
    });
  } catch (error) {
    if (isCoupledRecovery) {
      throw new CoupledRuntimeRollbackRequiredError({
        failedReleaseId: releaseId,
        failedRuntimeRevision: manifest.runtime_revision,
        previousReleaseId: previous.releaseId,
        previousRuntimeRevision: previous.manifest.runtime_revision,
        recoveryAction: 'transition',
        cause: error,
      });
    }
    await rollbackAfterFailedSmoke({
      servedPath,
      releasesDir,
      previous,
      baseUrl,
      statusUrl,
      verification,
      failedReleaseId: releaseId,
      cause: error,
    });
  }
  return { releaseId, target, manifest, previousReleaseId: previous.releaseId, alreadyActive: false };
}

function requiredEnvironment(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const NGINX_ALTERNATE_CONTENT_DIRECTIVES = new Set([
  'content_by_lua',
  'content_by_lua_block',
  'content_by_lua_file',
  'empty_gif',
  'fastcgi_pass',
  'grpc_pass',
  'js_content',
  'memcached_pass',
  'perl',
  'proxy_pass',
  'return',
  'rewrite',
  'scgi_pass',
  'stub_status',
  'uwsgi_pass',
]);
const TAIRA_CERTBOT_ROOT = '/var/www/certbot';

function lexNginxSource(configSource) {
  let cleaned = '';
  let structural = '';
  let quote = null;
  let escaped = false;
  let comment = false;
  for (const character of configSource) {
    if (comment) {
      if (character === '\n') {
        comment = false;
        cleaned += character;
        structural += character;
      } else {
        cleaned += ' ';
        structural += ' ';
      }
      continue;
    }
    if (quote) {
      cleaned += character;
      structural += ' ';
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (escaped) {
      cleaned += character;
      structural += ' ';
      escaped = false;
      continue;
    }
    if (character === '\\') {
      cleaned += character;
      structural += ' ';
      escaped = true;
      continue;
    }
    if (character === '#') {
      cleaned += ' ';
      structural += ' ';
      comment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      cleaned += character;
      structural += ' ';
      quote = character;
      continue;
    }
    cleaned += character;
    structural += character;
  }
  if (quote) throw new Error('nginx configuration contains an unterminated quoted value');
  if (escaped) throw new Error('nginx configuration contains a trailing escape');
  return { cleaned, structural };
}

function normalizedNginxDirectiveName(nameToken) {
  let normalized = '';
  let quote = null;
  let escaped = false;
  for (const character of nameToken) {
    if (escaped) {
      normalized += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else normalized += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else {
      normalized += character;
    }
  }
  return normalized;
}

function assertNoObscuredNginxServerBlocks(cleaned, structural) {
  let statement = '';
  for (let index = 0; index < structural.length; index += 1) {
    const character = structural[index];
    if (character === '{') {
      const nameToken = /^\s*(\S+)/u.exec(statement)?.[1] ?? '';
      if (normalizedNginxDirectiveName(nameToken) === 'server' && nameToken !== 'server') {
        throw new Error('nginx configuration must not use quoted or escaped directive names');
      }
      statement = '';
      continue;
    }
    if (character === '}' || character === ';') {
      statement = '';
      continue;
    }
    statement += cleaned[index];
  }
}

export function verifyNginxRoot(configSource, { host, servedPath }) {
  if (typeof configSource !== 'string' || configSource.trim() === '') {
    throw new Error('nginx configuration dump is empty');
  }
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/u.test(host)) {
    throw new Error('Taira nginx host must be a lowercase DNS name');
  }
  const { cleaned: source, structural } = lexNginxSource(configSource);
  assertNoObscuredNginxServerBlocks(source, structural);
  const matchingBlocks = nginxServerBlocksForHost(source, structural, host);
  const servingBlocks = matchingBlocks.filter(isNginxTlsServerBlock);
  if (servingBlocks.length !== 1) {
    throw new Error(`nginx must contain exactly one TLS content-serving block for ${host}`);
  }
  const redirectBlocks = matchingBlocks.filter((block) => block !== servingBlocks[0]);
  if (redirectBlocks.length > 1) {
    throw new Error(`nginx must contain at most one HTTP redirect block for ${host}`);
  }
  for (const redirect of redirectBlocks) verifyNginxHttpsRedirectBlock(redirect, host);

  const expected = path.normalize(servedPath);
  verifyNginxStaticServingBlock(servingBlocks[0], { expected, host });
  return expected;
}

function nginxServerBlocksForHost(source, structural, host) {
  const serverStart = /\bserver\s*\{/gu;
  const matchingBlocks = [];
  for (const match of structural.matchAll(serverStart)) {
    const openingBrace = match.index + match[0].lastIndexOf('{');
    let depth = 1;
    let cursor = openingBrace + 1;
    while (cursor < structural.length && depth > 0) {
      if (structural[cursor] === '{') depth += 1;
      if (structural[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) throw new Error('nginx configuration contains an unterminated server block');
    const block = source.slice(openingBrace + 1, cursor - 1);
    const directives = topLevelNginxDirectives(block);
    const names = directives
      .filter((directive) => directive.name === 'server_name')
      .flatMap((directive) => directive.value.split(/\s+/u));
    if (!names.includes(host)) continue;
    matchingBlocks.push({ block, directives });
  }
  return matchingBlocks;
}

function isNginxTlsServerBlock({ directives }) {
  const listeners = directives
    .filter((directive) => directive.name === 'listen')
    .map((directive) => directive.value.trim());
  const reviewedTlsListeners = new Set(['443 ssl', '[::]:443 ssl']);
  return listeners.length > 0 && listeners.every((listener) => reviewedTlsListeners.has(listener));
}

function verifyNginxStaticServingBlock(servingBlock, { expected, host }) {
  const matchingRoots = servingBlock.directives
    .filter((directive) => directive.name === 'root')
    .map((directive) => unquoteNginxValue(directive.value));
  if (matchingRoots.length !== 1) {
    throw new Error(`nginx must contain exactly one top-level root for ${host}`);
  }
  if (path.normalize(matchingRoots[0]) !== expected) {
    throw new Error(`nginx root for ${host} does not match ${expected}: ${matchingRoots.join(', ')}`);
  }
  const effectiveDirectives = allNginxDirectives(servingBlock.block);
  const includes = effectiveDirectives.filter((directive) => directive.name === 'include');
  if (includes.length > 0) {
    throw new Error(
      `nginx server for ${host} must not use include directives whose effective routing cannot be verified`
    );
  }
  const alternateContent = effectiveDirectives.filter((directive) =>
    NGINX_ALTERNATE_CONTENT_DIRECTIVES.has(directive.name)
  );
  if (alternateContent.length > 0) {
    throw new Error(
      `nginx server for ${host} must serve release files directly from ${expected}; ` +
        `alternate content directives are not allowed: ${[
          ...new Set(alternateContent.map((directive) => directive.name)),
        ].join(', ')}`
    );
  }
  const nestedOverrides = effectiveDirectives.filter(
    (directive) => directive.depth > 0 && (directive.name === 'root' || directive.name === 'alias')
  );
  if (nestedOverrides.length > 0) {
    throw new Error(`nginx server for ${host} must not override root with nested root/alias directives`);
  }
  verifyNginxSpaFallback(servingBlock, host);
}

function verifyNginxSpaFallback(servingBlock, host) {
  const indexes = servingBlock.directives
    .filter((directive) => directive.name === 'index')
    .map((directive) => unquoteNginxValue(directive.value));
  if (indexes.length !== 1 || indexes[0] !== 'index.html') {
    throw new Error(`nginx server for ${host} must define exactly index index.html`);
  }
  const topLevelBlocks = topLevelNginxBlocks(servingBlock.block);
  const rootLocations = topLevelBlocks.filter(
    (directive) => directive.name === 'location' && directive.value.trim() === '/'
  );
  const rootLocationDirectives = rootLocations.length === 1 ? allNginxDirectives(rootLocations[0].content) : [];
  const spaFallbacks = rootLocationDirectives.filter(
    (directive) =>
      !directive.block &&
      directive.depth === 0 &&
      directive.name === 'try_files' &&
      directive.value.trim() === '$uri $uri/ /index.html'
  );
  if (
    topLevelBlocks.length !== 1 ||
    rootLocations.length !== 1 ||
    rootLocationDirectives.length !== 1 ||
    spaFallbacks.length !== 1
  ) {
    throw new Error(`nginx server for ${host} must have one location / with try_files $uri $uri/ /index.html`);
  }
}

function verifyNginxHttpsRedirectBlock({ block, directives }, host) {
  const effectiveDirectives = allNginxDirectives(block);
  verifyNginxRedirectListeners(directives, host);
  verifyNginxRedirectDirectiveInventory(effectiveDirectives, directives, host);
  verifyNginxRedirectLocations(block, host);
}

function verifyNginxRedirectListeners(directives, host) {
  const listens = directives
    .filter((directive) => directive.name === 'listen')
    .map((directive) => directive.value.trim())
    .sort();
  if (listens.length !== 2 || listens[0] !== '80' || listens[1] !== '[::]:80') {
    throw new Error(`nginx HTTP redirect block for ${host} must listen only on IPv4/IPv6 port 80`);
  }
}

function verifyNginxRedirectDirectiveInventory(effectiveDirectives, directives, host) {
  const allowedNames = new Set(['default_type', 'listen', 'location', 'return', 'root', 'server_name']);
  const unexpected = effectiveDirectives.filter((directive) => !allowedNames.has(directive.name));
  if (unexpected.length > 0) {
    throw new Error(
      `nginx HTTP redirect block for ${host} contains unsupported directives: ${[
        ...new Set(unexpected.map((directive) => directive.name)),
      ].join(', ')}`
    );
  }
  const serverNames = directives.filter((directive) => directive.name === 'server_name');
  if (serverNames.length !== 1) {
    throw new Error(`nginx HTTP redirect block for ${host} must define server_name exactly once`);
  }
}

function verifyNginxRedirectLocations(block, host) {
  const locations = topLevelNginxBlocks(block).filter((directive) => directive.name === 'location');
  const locationValues = locations.map((directive) => directive.value.trim()).sort();
  if (
    locationValues.length !== 2 ||
    locationValues[0] !== '/' ||
    locationValues[1] !== '^~ /.well-known/acme-challenge/'
  ) {
    throw new Error(`nginx HTTP redirect block for ${host} must contain only ACME and root locations`);
  }
  const rootLocation = locations.find((directive) => directive.value.trim() === '/');
  const acmeLocation = locations.find((directive) => directive.value.trim() === '^~ /.well-known/acme-challenge/');
  const redirectDirectives = rootLocation ? allNginxDirectives(rootLocation.content) : [];
  const redirects = redirectDirectives.filter((directive) => directive.name === 'return');
  if (
    redirectDirectives.length !== 1 ||
    redirects.length !== 1 ||
    redirects[0].depth !== 0 ||
    redirects[0].value.trim() !== '301 https://$host$request_uri'
  ) {
    throw new Error(`nginx HTTP redirect block for ${host} must redirect exactly to HTTPS`);
  }
  const acmeDirectives = acmeLocation ? allNginxDirectives(acmeLocation.content) : [];
  const roots = acmeDirectives.filter((directive) => directive.name === 'root');
  if (
    acmeDirectives.length !== 2 ||
    roots.length !== 1 ||
    roots[0].depth !== 0 ||
    path.normalize(unquoteNginxValue(roots[0].value)) !== TAIRA_CERTBOT_ROOT
  ) {
    throw new Error(`nginx HTTP redirect block for ${host} must use the reviewed ACME root`);
  }
  const contentTypes = acmeDirectives.filter((directive) => directive.name === 'default_type');
  if (
    contentTypes.length !== 1 ||
    contentTypes[0].depth !== 0 ||
    unquoteNginxValue(contentTypes[0].value) !== 'text/plain'
  ) {
    throw new Error(`nginx HTTP redirect block for ${host} must serve ACME as text/plain`);
  }
}

function topLevelNginxBlocks(block) {
  const { cleaned, structural } = lexNginxSource(block);
  const blocks = [];
  let current = null;
  let depth = 0;
  let statement = '';
  for (let index = 0; index < structural.length; index += 1) {
    const character = structural[index];
    if (character === '{') {
      const directive = parseNginxDirective(statement, { block: true, depth });
      if (depth === 0 && directive) {
        current = { ...directive, contentStart: index + 1 };
      }
      depth += 1;
      statement = '';
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('nginx configuration contains an unexpected closing brace');
      if (depth === 0 && current) {
        blocks.push({
          ...current,
          content: cleaned.slice(current.contentStart, index),
        });
        current = null;
      }
      statement = '';
      continue;
    }
    if (character === ';') {
      statement = '';
      continue;
    }
    statement += cleaned[index];
  }
  if (depth !== 0) throw new Error('nginx configuration contains an unterminated nested block');
  return blocks;
}

function topLevelNginxDirectives(block) {
  return allNginxDirectives(block).filter((directive) => directive.depth === 0);
}

function parseNginxDirective(statement, { block, depth }) {
  const trimmed = statement.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    throw new Error('nginx configuration must not use quoted directive names');
  }
  const match = /^([a-z_][a-z0-9_]*)(?:\s+([\s\S]*?))?$/u.exec(trimmed);
  if (!match) {
    throw new Error(`nginx directive cannot be parsed safely: ${trimmed}`);
  }
  return {
    name: match[1],
    value: match[2] ?? '',
    depth,
    block,
  };
}

function allNginxDirectives(block) {
  const { cleaned, structural } = lexNginxSource(block);
  const directives = [];
  let depth = 0;
  let statement = '';
  for (let index = 0; index < structural.length; index += 1) {
    const character = structural[index];
    if (character === '{') {
      const directive = parseNginxDirective(statement, { block: true, depth });
      if (directive) directives.push(directive);
      depth += 1;
      statement = '';
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('nginx configuration contains an unexpected closing brace');
      statement = '';
      continue;
    }
    if (character === ';') {
      const directive = parseNginxDirective(statement, { block: false, depth });
      if (directive) directives.push(directive);
      statement = '';
      continue;
    }
    statement += cleaned[index];
  }
  if (depth !== 0) throw new Error('nginx configuration contains an unterminated nested block');
  if (statement.trim() !== '') {
    throw new Error('nginx configuration contains an unterminated directive');
  }
  return directives;
}

function unquoteNginxValue(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export async function nginxConfigDump(env = process.env) {
  if (env.TAIRA_NGINX_CONFIG_DUMP) {
    const dumpPath = path.resolve(env.TAIRA_NGINX_CONFIG_DUMP);
    const snapshot = await readCanonicalRegularFileSnapshot(dumpPath, 'nginx configuration dump');
    assertDeploymentOwnedNonWritable(snapshot.stats, 'nginx configuration dump', dumpPath);
    return snapshot.bytes.toString('utf8');
  }
  const binary = env.TAIRA_NGINX_BIN ?? 'nginx';
  const result = spawnSync(binary, ['-T'], { encoding: 'utf8' });
  if (result.error) throw new Error(`Could not execute ${binary} -T`, { cause: result.error });
  if (result.status !== 0) {
    throw new Error(`${binary} -T failed:\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

async function verifyOperationalTarget({ servedPath, releasesDir }) {
  validateReleasePaths({ servedPath, releasesDir });
  verifyNginxRoot(await nginxConfigDump(), { host: TAIRA_EXPLORER_HOST, servedPath });
}

export function normalizeExplorerRemote(remote) {
  if (typeof remote !== 'string' || remote.trim() !== remote) return null;
  const scpMatch = /^git@github\.com:(soramitsu\/iroha-block-explorer-web)(?:\.git)?$/u.exec(remote);
  if (scpMatch) return `github.com/${scpMatch[1]}`;

  let url;
  try {
    url = new URL(remote);
  } catch {
    return null;
  }
  const isHttps = url.protocol === 'https:' && !url.username && !url.password && !url.port;
  const isSsh = url.protocol === 'ssh:' && url.username === 'git' && !url.password && (!url.port || url.port === '22');
  if ((!isHttps && !isSsh) || url.hostname !== 'github.com' || url.search || url.hash) return null;
  const repositoryPath = url.pathname.replace(/^\//u, '').replace(/\.git$/u, '');
  return repositoryPath === 'soramitsu/iroha-block-explorer-web' ? EXPLORER_REPOSITORY : null;
}

export function normalizeIrohaRemote(remote) {
  if (typeof remote !== 'string' || remote.trim() !== remote) return null;
  const scpMatch = /^git@github\.com:(hyperledger-iroha\/iroha)(?:\.git)?$/u.exec(remote);
  if (scpMatch) return `github.com/${scpMatch[1]}`;
  let url;
  try {
    url = new URL(remote);
  } catch {
    return null;
  }
  const isHttps = url.protocol === 'https:' && !url.username && !url.password && !url.port;
  const isSsh = url.protocol === 'ssh:' && url.username === 'git' && !url.password && (!url.port || url.port === '22');
  if ((!isHttps && !isSsh) || url.hostname !== 'github.com' || url.search || url.hash) return null;
  const repositoryPath = url.pathname.replace(/^\//u, '').replace(/\.git$/u, '');
  return repositoryPath === 'hyperledger-iroha/iroha' ? IROHA_REPOSITORY : null;
}

function defaultGit(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    env: options.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
}

function gitSignatureVerificationEnvironment(baseEnvironment, source = process.env) {
  const currentUid = process.getuid?.();
  if (!Number.isSafeInteger(currentUid)) throw tairaReleaseInvocationError();
  const gpgPath = canonicalTairaInvocationPath(source[TAIRA_GIT_VERIFY_GPG_ENV]);
  const gnupgHome = canonicalTairaInvocationPath(source[TAIRA_GIT_VERIFY_GNUPGHOME_ENV]);
  assertOwnerPrivateExactDirectory(gnupgHome, currentUid);
  let gpgStats;
  try {
    gpgStats = lstatSync(gpgPath);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (
    !gpgStats.isFile() ||
    gpgStats.isSymbolicLink() ||
    (gpgStats.uid !== 0 && gpgStats.uid !== currentUid) ||
    gpgStats.nlink !== 1 ||
    (gpgStats.mode & 0o111) === 0 ||
    (gpgStats.mode & 0o022) !== 0
  ) {
    throw tairaReleaseInvocationError();
  }
  return {
    ...baseEnvironment,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '9',
    GIT_CONFIG_KEY_0: 'gpg.program',
    GIT_CONFIG_VALUE_0: gpgPath,
    GIT_CONFIG_KEY_1: 'protocol.allow',
    GIT_CONFIG_VALUE_1: 'never',
    GIT_CONFIG_KEY_2: 'protocol.https.allow',
    GIT_CONFIG_VALUE_2: 'always',
    GIT_CONFIG_KEY_3: 'http.followRedirects',
    GIT_CONFIG_VALUE_3: 'false',
    GIT_CONFIG_KEY_4: 'gpg.format',
    GIT_CONFIG_VALUE_4: 'openpgp',
    GIT_CONFIG_KEY_5: 'gpg.openpgp.program',
    GIT_CONFIG_VALUE_5: gpgPath,
    GIT_CONFIG_KEY_6: 'core.hooksPath',
    GIT_CONFIG_VALUE_6: '/dev/null',
    GIT_CONFIG_KEY_7: 'core.fsmonitor',
    GIT_CONFIG_VALUE_7: 'false',
    GIT_CONFIG_KEY_8: 'maintenance.auto',
    GIT_CONFIG_VALUE_8: 'false',
    GNUPGHOME: gnupgHome,
  };
}

function closedLocalGitEnvironment(source = process.env) {
  if (typeof source.PATH !== 'string' || source.PATH.length === 0) {
    throw new Error('A non-empty PATH is required for release provenance verification');
  }
  return gitSignatureVerificationEnvironment(
    {
      HOME: homedir(),
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: source.PATH,
    },
    source
  );
}

function assertOpenPgpCommitObject(commitObject, revision) {
  if (typeof commitObject !== 'string' || commitObject.includes('\r')) {
    throw new Error(`Commit ${revision} could not be inspected as a canonical Git commit object`);
  }
  const headerEnd = commitObject.indexOf('\n\n');
  if (headerEnd < 0) {
    throw new Error(`Commit ${revision} could not be inspected as a canonical Git commit object`);
  }

  const headers = commitObject.slice(0, headerEnd).split('\n');
  const signatureBlocks = [];
  for (let index = 0; index < headers.length; index += 1) {
    const match = /^(gpgsig(?:-[^ ]+)?) (.*)$/u.exec(headers[index]);
    if (!match) continue;
    const lines = [match[2]];
    while (index + 1 < headers.length && headers[index + 1].startsWith(' ')) {
      index += 1;
      lines.push(headers[index].slice(1));
    }
    signatureBlocks.push({ name: match[1], lines });
  }

  if (signatureBlocks.length !== 1) {
    throw new Error(`Commit ${revision} must contain exactly one OpenPGP signature`);
  }
  const [{ name, lines }] = signatureBlocks;
  if (
    name !== 'gpgsig' ||
    lines[0] !== '-----BEGIN PGP SIGNATURE-----' ||
    lines.at(-1) !== '-----END PGP SIGNATURE-----'
  ) {
    throw new Error(`Commit ${revision} signature must use OpenPGP armor`);
  }
}

function assertExpectedGitSigner(signatureIdentity, revision) {
  if (typeof signatureIdentity !== 'string' || !signatureIdentity.endsWith('\n')) {
    throw new Error(`Commit ${revision} signer identity could not be read canonically`);
  }
  const record = signatureIdentity.slice(0, -1);
  if (record.includes('\n')) {
    throw new Error(`Commit ${revision} signer identity could not be read canonically`);
  }
  const [status, signerFingerprint, primaryFingerprint, ...unexpected] = record.split('\0');
  if (unexpected.length !== 0 || !['G', 'U'].includes(status)) {
    throw new Error(`Commit ${revision} does not have a current valid OpenPGP signature`);
  }
  if (
    signerFingerprint !== TAIRA_RELEASE_SIGNER_FINGERPRINT ||
    primaryFingerprint !== TAIRA_RELEASE_SIGNER_FINGERPRINT
  ) {
    throw new Error(
      `Commit ${revision} must be signed by exact Taira release signer ${TAIRA_RELEASE_SIGNER_FINGERPRINT}`
    );
  }
}

function verifyGitCommitSignatureWithEnvironment(root, revision, { git, environment }) {
  assertOpenPgpCommitObject(git(root, ['cat-file', 'commit', revision], { env: environment }), revision);
  git(root, ['verify-commit', revision], { env: environment });
  assertExpectedGitSigner(
    git(root, ['show', '--no-patch', '--format=%G?%x00%GF%x00%GP', revision], { env: environment }),
    revision
  );
  return revision;
}

export function verifyGitCommitSignature(root, revision, { git = defaultGit, source = process.env } = {}) {
  return verifyGitCommitSignatureWithEnvironment(root, revision, {
    git,
    environment: closedLocalGitEnvironment(source),
  });
}

function canonicalVerifierGitEnvironment(verifierRoot, source = process.env) {
  if (typeof source.PATH !== 'string' || source.PATH.length === 0) {
    throw new Error('A non-empty PATH is required for canonical provenance verification');
  }
  return gitSignatureVerificationEnvironment(
    {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      HOME: homedir(),
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: source.PATH,
      TMPDIR: verifierRoot,
    },
    source
  );
}

export async function verifyCanonicalSdkRevision(
  expectedRevision,
  { git = defaultGit, mkdtempFn = mkdtemp, removeDirectoryFn = rm, source = process.env } = {}
) {
  assertRevision(expectedRevision, 'Canonical SDK revision');
  const verifierRoot = await mkdtempFn(path.join(realpathSync(tmpdir()), 'taira-sdk-provenance-'));
  await chmod(verifierRoot, 0o700);
  await inspectOwnedCanonicalRealDirectory(verifierRoot, 'Canonical SDK verifier');
  const environment = canonicalVerifierGitEnvironment(verifierRoot, source);
  let subtreeTree = null;
  let actionError = null;
  try {
    git(verifierRoot, ['init', '--bare', '.'], { env: environment });
    git(
      verifierRoot,
      [
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.https.allow=always',
        '-c',
        'http.followRedirects=false',
        'fetch',
        '--force',
        '--prune',
        '--no-tags',
        '--no-recurse-submodules',
        '--no-write-fetch-head',
        '--filter=blob:none',
        IROHA_REPOSITORY_URL,
        '+refs/heads/optimizations:refs/taira-sdk-verifier/heads/optimizations',
      ],
      { env: environment }
    );
    const canonicalCommit = git(verifierRoot, ['rev-parse', '--verify', `${expectedRevision}^{commit}`], {
      env: environment,
    }).trim();
    if (canonicalCommit !== expectedRevision) {
      throw new Error(`Canonical SDK verifier did not resolve exact commit ${expectedRevision}`);
    }
    try {
      git(
        verifierRoot,
        ['merge-base', '--is-ancestor', expectedRevision, 'refs/taira-sdk-verifier/heads/optimizations'],
        { env: environment }
      );
    } catch (error) {
      throw new Error(
        `SDK revision ${expectedRevision} is not reachable from the freshly fetched canonical optimizations branch`,
        { cause: error }
      );
    }
    try {
      verifyGitCommitSignatureWithEnvironment(verifierRoot, expectedRevision, { git, environment });
    } catch (error) {
      throw new Error('SDK source closure requires a cryptographically verified canonical commit', {
        cause: error,
      });
    }
    subtreeTree = git(verifierRoot, ['rev-parse', `${expectedRevision}:${IROHA_SDK_SUBTREE}`], {
      env: environment,
    }).trim();
    assertRevision(subtreeTree, 'Canonical SDK subtree tree');
  } catch (error) {
    actionError = error;
  }

  let cleanupError = null;
  try {
    await removeDirectoryFn(verifierRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupError = error;
  }
  if (actionError) {
    throw cleanupError ? preservePrimaryFailure(actionError, [cleanupError]) : actionError;
  }
  if (cleanupError) throw cleanupError;
  return subtreeTree;
}

export async function verifyCanonicalExplorerRevision(
  expectedRevision,
  { requireMasterTip = false, git = defaultGit, mkdtempFn = mkdtemp, removeDirectoryFn = rm, source = process.env } = {}
) {
  assertRevision(expectedRevision, 'Canonical Explorer revision');
  const verifierRoot = await mkdtempFn(path.join(realpathSync(tmpdir()), 'taira-explorer-provenance-'));
  await chmod(verifierRoot, 0o700);
  await inspectOwnedCanonicalRealDirectory(verifierRoot, 'Canonical Explorer verifier');
  const environment = canonicalVerifierGitEnvironment(verifierRoot, source);
  let actionError = null;
  try {
    git(verifierRoot, ['init', '--bare', '.'], { env: environment });
    git(
      verifierRoot,
      [
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.https.allow=always',
        '-c',
        'http.followRedirects=false',
        'fetch',
        '--force',
        '--prune',
        '--no-tags',
        '--no-recurse-submodules',
        '--no-write-fetch-head',
        '--filter=blob:none',
        EXPLORER_REPOSITORY_URL,
        '+refs/heads/*:refs/taira-explorer-verifier/heads/*',
      ],
      { env: environment }
    );
    const canonicalCommit = git(verifierRoot, ['rev-parse', '--verify', `${expectedRevision}^{commit}`], {
      env: environment,
    }).trim();
    if (canonicalCommit !== expectedRevision) {
      throw new Error(`Canonical Explorer verifier did not resolve exact commit ${expectedRevision}`);
    }
    const containingRefs = git(
      verifierRoot,
      ['for-each-ref', '--contains', expectedRevision, '--format=%(refname)', 'refs/taira-explorer-verifier/heads'],
      { env: environment }
    ).trim();
    if (containingRefs === '') {
      throw new Error(`Explorer revision ${expectedRevision} is not reachable from freshly fetched canonical refs`);
    }
    if (containingRefs.split('\n').some((ref) => !ref.startsWith('refs/taira-explorer-verifier/heads/'))) {
      throw new Error('Canonical Explorer verifier returned a ref outside its fresh namespace');
    }
    if (requireMasterTip) {
      const masterRevision = git(
        verifierRoot,
        ['rev-parse', '--verify', 'refs/taira-explorer-verifier/heads/master^{commit}'],
        { env: environment }
      ).trim();
      if (masterRevision !== expectedRevision) {
        throw new Error(
          `Explorer revision ${expectedRevision} must equal freshly fetched canonical master ${masterRevision}`
        );
      }
    }
    try {
      verifyGitCommitSignatureWithEnvironment(verifierRoot, expectedRevision, { git, environment });
    } catch (error) {
      throw new Error('Explorer releases require a cryptographically verified canonical commit', {
        cause: error,
      });
    }
  } catch (error) {
    actionError = error;
  }

  let cleanupError = null;
  try {
    await removeDirectoryFn(verifierRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupError = error;
  }
  if (actionError) {
    throw cleanupError ? preservePrimaryFailure(actionError, [cleanupError]) : actionError;
  }
  if (cleanupError) throw cleanupError;
  return expectedRevision;
}

export function verifyReleaseCheckout(
  root,
  { allowReviewedBaseline = false, git = defaultGit, source = process.env } = {}
) {
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== path.resolve(root)) {
    throw new Error(`Explorer checkout must be a canonical real path: ${root}`);
  }
  const gitEnvironment = closedLocalGitEnvironment(source);
  const remote = git(root, ['config', '--get', 'remote.origin.url'], { env: gitEnvironment }).trim();
  if (normalizeExplorerRemote(remote) !== EXPLORER_REPOSITORY) {
    throw new Error(`Taira releases require origin ${EXPLORER_REPOSITORY}`);
  }
  git(
    root,
    [
      'fetch',
      '--force',
      '--prune',
      '--no-tags',
      '--no-recurse-submodules',
      EXPLORER_REPOSITORY_URL,
      '+refs/heads/master:refs/remotes/origin/master',
    ],
    { env: gitEnvironment }
  );
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all'], { env: gitEnvironment });
  if (status.trim() !== '') {
    throw new Error('Taira releases require a clean checkout with no tracked or untracked changes');
  }
  const revision = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], {
    env: gitEnvironment,
  }).trim();
  assertRevision(revision, 'Explorer HEAD');
  try {
    verifyGitCommitSignatureWithEnvironment(root, revision, { git, environment: gitEnvironment });
  } catch (error) {
    throw new Error('Taira releases require a cryptographically verified HEAD commit', { cause: error });
  }
  const verifiedHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], {
    env: gitEnvironment,
  }).trim();
  if (verifiedHead !== revision) {
    throw new Error(`Explorer HEAD changed during signature verification: ${revision} -> ${verifiedHead}`);
  }
  const masterRevision = git(root, ['rev-parse', '--verify', 'refs/remotes/origin/master^{commit}'], {
    env: gitEnvironment,
  }).trim();
  assertRevision(masterRevision, 'fetched origin/master');
  if (revision === masterRevision) return revision;
  if (!allowReviewedBaseline || revision !== REVIEWED_BASELINE.explorerRevision) {
    throw new Error(`Explorer HEAD ${revision} must equal freshly fetched origin/master ${masterRevision}`);
  }
  try {
    git(root, ['merge-base', '--is-ancestor', revision, masterRevision], { env: gitEnvironment });
  } catch (error) {
    throw new Error('Reviewed historical baseline is not an ancestor of fetched origin/master', {
      cause: error,
    });
  }
  return revision;
}

export function verifyLocalReleaseCheckout(root, expectedRevision, { git = defaultGit, source = process.env } = {}) {
  assertRevision(expectedRevision, 'Expected local Explorer revision');
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== path.resolve(root)) {
    throw new Error(`Explorer checkout must be a canonical real path: ${root}`);
  }
  const gitEnvironment = closedLocalGitEnvironment(source);
  const remote = git(root, ['config', '--get', 'remote.origin.url'], { env: gitEnvironment }).trim();
  if (normalizeExplorerRemote(remote) !== EXPLORER_REPOSITORY) {
    throw new Error(`Taira recovery requires origin ${EXPLORER_REPOSITORY}`);
  }
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all'], { env: gitEnvironment }).trim() !== '') {
    throw new Error('Taira recovery requires a clean checkout with no tracked or untracked changes');
  }
  const revision = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], {
    env: gitEnvironment,
  }).trim();
  assertRevision(revision, 'Recovery tool HEAD');
  try {
    verifyGitCommitSignatureWithEnvironment(root, revision, { git, environment: gitEnvironment });
  } catch (error) {
    throw new Error('Taira recovery requires a cryptographically verified HEAD commit', { cause: error });
  }
  const verifiedHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], {
    env: gitEnvironment,
  }).trim();
  if (verifiedHead !== revision) {
    throw new Error(`Recovery tool HEAD changed during signature verification: ${revision} -> ${verifiedHead}`);
  }
  if (revision !== expectedRevision) {
    throw new Error(`Recovery tool HEAD ${revision} does not match manifest generator ${expectedRevision}`);
  }
  return revision;
}

async function verifyMutatingCheckout(root) {
  const expectedTool = path.join(root, 'ops/taira/release-tool.mjs');
  const actualTool = fileURLToPath(import.meta.url);
  if ((await realpath(expectedTool)) !== (await realpath(actualTool))) {
    throw new Error('Mutating Taira commands must run the release tool from the verified checkout');
  }
  const revision = verifyReleaseCheckout(root);
  await verifyCanonicalExplorerRevision(revision, { requireMasterTip: true });
  return revision;
}

async function verifyLocalMutatingCheckout(root, expectedRevision) {
  const expectedTool = path.join(root, 'ops/taira/release-tool.mjs');
  const actualTool = fileURLToPath(import.meta.url);
  if ((await realpath(expectedTool)) !== (await realpath(actualTool))) {
    throw new Error('Taira recovery must run the release tool from the manifest-pinned checkout');
  }
  return verifyLocalReleaseCheckout(root, expectedRevision);
}

async function verifyCanonicalPinnedMutatingCheckout(root, expectedRevision) {
  const revision = await verifyLocalMutatingCheckout(root, expectedRevision);
  await verifyCanonicalExplorerRevision(revision);
  return revision;
}

function dependencyFromPackage(packageJson) {
  const dependency = packageJson?.dependencies?.['@iroha/iroha-js'];
  if (typeof dependency !== 'string' || dependency.length === 0) {
    throw new Error('package.json must contain the @iroha/iroha-js dependency');
  }
  return dependency;
}

function resolvedIrohaRoot(explorerRoot, dependency) {
  if (dependency.startsWith('file:')) {
    const sdkPath = path.resolve(explorerRoot, dependency.slice('file:'.length));
    if (path.basename(sdkPath) !== 'iroha_js' || path.basename(path.dirname(sdkPath)) !== 'javascript') {
      throw new Error('Reviewed local SDK dependency does not resolve to javascript/iroha_js');
    }
    return path.dirname(path.dirname(sdkPath));
  }
  return path.resolve(explorerRoot, '../iroha');
}

export async function verifySdkSourceClosure(
  explorerRoot,
  expectedRevision,
  { reviewedBaseline = false, git = defaultGit, mkdtempFn = mkdtemp, removeDirectoryFn = rm } = {}
) {
  assertRevision(expectedRevision, 'expected SDK revision');
  const packagePath = path.join(explorerRoot, 'package.json');
  const lockPath = path.join(explorerRoot, 'pnpm-lock.yaml');
  const profilePath = path.join(explorerRoot, 'tests/mochi/explorer-profile.json');
  const packageJsonBytes = await readFile(packagePath);
  const packageJson = JSON.parse(packageJsonBytes.toString('utf8'));
  const dependency = dependencyFromPackage(packageJson);
  const packageJsonSha256 = sha256(packageJsonBytes);
  const packageLockSha256 = await sha256File(lockPath);
  const profileSha256 = await sha256File(profilePath);

  if (reviewedBaseline) {
    const actualTuple = {
      explorerRevision: git(explorerRoot, ['rev-parse', 'HEAD']).trim(),
      sdkRevision: expectedRevision,
      dependency,
      packageJsonSha256,
      packageLockSha256,
      profileSha256,
    };
    for (const [key, expected] of Object.entries(REVIEWED_BASELINE)) {
      if (key === 'sdkSubtreeTree' || key === 'runtimeRevision') continue;
      if (actualTuple[key] !== expected) {
        throw new Error(`Reviewed baseline ${key} mismatch: ${String(actualTuple[key])}`);
      }
    }
  } else {
    const expectedDependency = `github:hyperledger-iroha/iroha#${expectedRevision}&path:${IROHA_SDK_SUBTREE}`;
    if (dependency !== expectedDependency) {
      throw new Error(`Final SDK dependency must be exactly ${expectedDependency}`);
    }
  }

  const irohaRoot = resolvedIrohaRoot(explorerRoot, dependency);
  if (realpathSync(irohaRoot) !== path.resolve(irohaRoot)) {
    throw new Error(`Iroha checkout must be a canonical real path: ${irohaRoot}`);
  }
  const remote = git(irohaRoot, ['config', '--get', 'remote.origin.url']).trim();
  if (normalizeIrohaRemote(remote) !== IROHA_REPOSITORY) {
    throw new Error(`SDK source closure requires origin ${IROHA_REPOSITORY}`);
  }
  if (git(irohaRoot, ['status', '--porcelain=v1', '--untracked-files=all']).trim() !== '') {
    throw new Error('SDK source closure requires a clean Iroha checkout');
  }
  const actualRevision = git(irohaRoot, ['rev-parse', 'HEAD']).trim();
  if (actualRevision !== expectedRevision) {
    throw new Error(`Iroha checkout HEAD ${actualRevision} does not match SDK ${expectedRevision}`);
  }
  const localSubtreeTree = git(irohaRoot, ['rev-parse', `HEAD:${IROHA_SDK_SUBTREE}`]).trim();
  assertRevision(localSubtreeTree, 'Local SDK subtree tree');
  const canonicalSubtreeTree = await verifyCanonicalSdkRevision(expectedRevision, {
    git,
    mkdtempFn,
    removeDirectoryFn,
  });
  if (localSubtreeTree !== canonicalSubtreeTree) {
    throw new Error(
      `Local SDK subtree ${localSubtreeTree} does not match freshly fetched canonical subtree ` + canonicalSubtreeTree
    );
  }
  if (reviewedBaseline && canonicalSubtreeTree !== REVIEWED_BASELINE.sdkSubtreeTree) {
    throw new Error(`Reviewed baseline SDK subtree tree mismatch: ${canonicalSubtreeTree}`);
  }
  return {
    repository: IROHA_REPOSITORY,
    revision: expectedRevision,
    subtree_path: IROHA_SDK_SUBTREE,
    subtree_tree: canonicalSubtreeTree,
    dependency,
    package_json_sha256: packageJsonSha256,
    package_lock_sha256: packageLockSha256,
    profile_sha256: profileSha256,
  };
}

function defaultReleaseCommand(command, args, { cwd, env, capture = false } = {}) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
}

export function sanitizedReleaseBuildEnvironment(source = process.env, buildParent = null) {
  const root = buildParent === null ? path.join(realpathSync(tmpdir()), 'taira-release-sterile') : buildParent;
  const inheritedPath = typeof source.PATH === 'string' ? source.PATH : '';
  const nodeDirectory = path.dirname(process.execPath);
  const searchPath = [
    nodeDirectory,
    ...inheritedPath.split(path.delimiter).filter((entry) => entry && entry !== nodeDirectory),
  ].join(path.delimiter);
  const env = {
    BROWSERSLIST_IGNORE_OLD_DATA: '1',
    CI: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    HOME: path.join(root, 'home'),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NPM_CONFIG_GLOBALCONFIG: path.join(root, '.npmrc'),
    NPM_CONFIG_USERCONFIG: path.join(root, '.npmrc'),
    PATH: searchPath,
    TMPDIR: path.join(root, 'tmp'),
    TZ: 'UTC',
    XDG_CACHE_HOME: path.join(root, 'xdg-cache'),
    XDG_CONFIG_HOME: path.join(root, 'xdg-config'),
    XDG_DATA_HOME: path.join(root, 'xdg-data'),
    npm_config_cache: path.join(root, 'npm-cache'),
  };
  if (!inheritedPath) throw new Error('A non-empty PATH is required for the audited release toolchain');
  return env;
}

export function assertReleaseNodeVersion(nodeVersion = process.versions.node) {
  const normalizedNodeVersion = String(nodeVersion).replace(/^v/u, '');
  if (normalizedNodeVersion !== REQUIRED_NODE_VERSION) {
    throw new Error(`Node ${REQUIRED_NODE_VERSION} is required, found ${normalizedNodeVersion}`);
  }
  return normalizedNodeVersion;
}

const TAIRA_RELEASE_INVOCATION_ERROR =
  'The Taira release CLI must be invoked through ops/taira/deploy-explorer.sh and the exact-toolchain bootstrap';

function tairaReleaseInvocationError() {
  return new Error(TAIRA_RELEASE_INVOCATION_ERROR);
}

function assertOwnerPrivateExactDirectory(directory, currentUid) {
  let stats;
  try {
    stats = lstatSync(directory);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== currentUid ||
    (stats.mode & 0o777) !== 0o700 ||
    realpathSync(directory) !== directory
  ) {
    throw tairaReleaseInvocationError();
  }
}

function tairaAttestationCoordinates(env) {
  const attestationPath = env[TAIRA_RELEASE_ATTESTATION_ENV];
  const nonce = env[TAIRA_RELEASE_ATTESTATION_NONCE_ENV];
  const cacheRoot = env.IROHA_EXPLORER_TOOLCHAIN_CACHE;
  if (
    typeof attestationPath !== 'string' ||
    !path.isAbsolute(attestationPath) ||
    path.resolve(attestationPath) !== attestationPath ||
    path.basename(attestationPath) !== '.taira-release-attestation.json' ||
    typeof nonce !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(nonce) ||
    typeof cacheRoot !== 'string' ||
    !path.isAbsolute(cacheRoot) ||
    path.resolve(cacheRoot) !== cacheRoot
  ) {
    throw tairaReleaseInvocationError();
  }
  const currentUid = process.getuid?.();
  const runRoot = path.dirname(attestationPath);
  if (
    !Number.isSafeInteger(currentUid) ||
    path.dirname(runRoot) !== cacheRoot ||
    !/^\.toolchain-run-[A-Za-z0-9]+$/u.test(path.basename(runRoot))
  ) {
    throw tairaReleaseInvocationError();
  }
  assertOwnerPrivateExactDirectory(cacheRoot, currentUid);
  assertOwnerPrivateExactDirectory(runRoot, currentUid);
  return { attestationPath, cacheRoot, currentUid, nonce, runRoot };
}

function canonicalTairaInvocationPath(candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate) || path.resolve(candidate) !== candidate) {
    throw tairaReleaseInvocationError();
  }
  let canonical;
  try {
    canonical = realpathSync(candidate);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (canonical !== candidate) throw tairaReleaseInvocationError();
  return canonical;
}

function expectedTairaNodeArchiveRoot() {
  const platform = { darwin: 'darwin', linux: 'linux' }[process.platform];
  const architecture = { arm64: 'arm64', x64: 'x64' }[process.arch];
  if (!platform || !architecture) throw tairaReleaseInvocationError();
  return `node-v${REQUIRED_NODE_VERSION}-${platform}-${architecture}`;
}

function validateTairaInvocationBinaries({ cacheRoot, currentUid, nodePath, releaseToolPath }) {
  assertReleaseNodeVersion();
  const canonicalNodePath = canonicalTairaInvocationPath(nodePath);
  const canonicalReleaseToolPath = canonicalTairaInvocationPath(releaseToolPath);
  const nodePathParts = path.relative(cacheRoot, canonicalNodePath).split(path.sep);
  if (
    nodePathParts.length !== 4 ||
    !/^\.node-run\.[A-Za-z0-9]+$/u.test(nodePathParts[0]) ||
    nodePathParts[1] !== expectedTairaNodeArchiveRoot() ||
    nodePathParts[2] !== 'bin' ||
    nodePathParts[3] !== 'node'
  ) {
    throw tairaReleaseInvocationError();
  }
  const nodeRunRoot = path.join(cacheRoot, nodePathParts[0]);
  assertOwnerPrivateExactDirectory(nodeRunRoot, currentUid);
  let nodeStats;
  try {
    nodeStats = lstatSync(canonicalNodePath);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (
    !nodeStats.isFile() ||
    nodeStats.isSymbolicLink() ||
    nodeStats.uid !== currentUid ||
    nodeStats.nlink !== 1 ||
    (nodeStats.mode & 0o111) === 0 ||
    (nodeStats.mode & 0o022) !== 0
  ) {
    throw tairaReleaseInvocationError();
  }
  return { canonicalNodePath, canonicalReleaseToolPath };
}

function validateTairaGitVerifier({ env, currentUid, runRoot }) {
  const gpgPath = canonicalTairaInvocationPath(env[TAIRA_GIT_VERIFY_GPG_ENV]);
  const gnupgHome = canonicalTairaInvocationPath(env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV]);
  if (gnupgHome !== path.join(runRoot, 'git-verify-gnupg')) {
    throw tairaReleaseInvocationError();
  }
  assertOwnerPrivateExactDirectory(gnupgHome, currentUid);
  let gpgStats;
  try {
    gpgStats = lstatSync(gpgPath);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (
    !gpgStats.isFile() ||
    gpgStats.isSymbolicLink() ||
    (gpgStats.uid !== 0 && gpgStats.uid !== currentUid) ||
    gpgStats.nlink !== 1 ||
    (gpgStats.mode & 0o111) === 0 ||
    (gpgStats.mode & 0o022) !== 0
  ) {
    throw tairaReleaseInvocationError();
  }
  return { gitVerifyGnupgHome: gnupgHome, gitVerifyGpgPath: gpgPath };
}

function readTairaReleaseAttestation(attestationPath, currentUid) {
  let descriptor;
  try {
    descriptor = openSync(attestationPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const openedStats = fstatSync(descriptor);
    if (
      !openedStats.isFile() ||
      openedStats.uid !== currentUid ||
      openedStats.nlink !== 1 ||
      (openedStats.mode & 0o777) !== 0o600 ||
      openedStats.size < 2 ||
      openedStats.size > 4_096
    ) {
      throw tairaReleaseInvocationError();
    }
    const payloadText = readFileSync(descriptor, 'utf8');
    const pathStats = lstatSync(attestationPath);
    if (pathStats.isSymbolicLink() || pathStats.dev !== openedStats.dev || pathStats.ino !== openedStats.ino) {
      throw tairaReleaseInvocationError();
    }
    return { openedStats, payloadText };
  } catch {
    throw tairaReleaseInvocationError();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseTairaReleaseAttestation(payloadText) {
  if (!payloadText.endsWith('\n') || payloadText.indexOf('\n') !== payloadText.length - 1) {
    throw tairaReleaseInvocationError();
  }
  try {
    const payload = JSON.parse(payloadText);
    assertExactKeys(
      payload,
      [
        'argv_sha256',
        'git_verify_gnupghome',
        'git_verify_gpg_path',
        'git_verify_gpg_sha256',
        'git_verify_signers_sha256',
        'node_path',
        'node_sha256',
        'nonce',
        'release_tool_path',
        'release_tool_sha256',
        'schema',
      ],
      'Taira release attestation'
    );
    return payload;
  } catch {
    throw tairaReleaseInvocationError();
  }
}

function assertTairaAttestationMatches(
  payload,
  { argv, canonicalNodePath, canonicalReleaseToolPath, gitVerifyGnupgHome, gitVerifyGpgPath, nonce }
) {
  let matches = false;
  try {
    matches =
      payload.schema === 1 &&
      payload.nonce === nonce &&
      payload.git_verify_gnupghome === gitVerifyGnupgHome &&
      payload.git_verify_gpg_path === gitVerifyGpgPath &&
      payload.git_verify_gpg_sha256 === sha256(readFileSync(gitVerifyGpgPath)) &&
      payload.git_verify_signers_sha256 === TAIRA_RELEASE_SIGNERS_SHA256 &&
      payload.node_path === canonicalNodePath &&
      payload.node_sha256 === sha256(readFileSync(canonicalNodePath)) &&
      payload.release_tool_path === canonicalReleaseToolPath &&
      payload.release_tool_sha256 === sha256(readFileSync(canonicalReleaseToolPath)) &&
      payload.argv_sha256 === sha256(JSON.stringify(argv));
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (!matches) throw tairaReleaseInvocationError();
}

function assertTairaAttestationIdentity(attestationPath, openedStats) {
  let finalStats;
  try {
    finalStats = lstatSync(attestationPath);
  } catch {
    throw tairaReleaseInvocationError();
  }
  if (finalStats.dev !== openedStats.dev || finalStats.ino !== openedStats.ino) {
    throw tairaReleaseInvocationError();
  }
}

export function consumeTairaReleaseAttestation({
  env = process.env,
  argv = process.argv.slice(2),
  nodePath = process.execPath,
  releaseToolPath = fileURLToPath(import.meta.url),
} = {}) {
  const coordinates = tairaAttestationCoordinates(env);
  const binaries = validateTairaInvocationBinaries({
    cacheRoot: coordinates.cacheRoot,
    currentUid: coordinates.currentUid,
    nodePath,
    releaseToolPath,
  });
  const gitVerifier = validateTairaGitVerifier({
    env,
    currentUid: coordinates.currentUid,
    runRoot: coordinates.runRoot,
  });
  const snapshot = readTairaReleaseAttestation(coordinates.attestationPath, coordinates.currentUid);
  const payload = parseTairaReleaseAttestation(snapshot.payloadText);
  assertTairaAttestationMatches(payload, {
    argv,
    ...binaries,
    ...gitVerifier,
    nonce: coordinates.nonce,
  });
  assertTairaAttestationIdentity(coordinates.attestationPath, snapshot.openedStats);
  const { attestationPath } = coordinates;
  unlinkSync(attestationPath);
  delete env[TAIRA_RELEASE_ATTESTATION_ENV];
  delete env[TAIRA_RELEASE_ATTESTATION_NONCE_ENV];
  return payload;
}

function validateIsolatedBuildSpec({ explorerRevision, irohaRoot, irohaRevision, nodeVersion }) {
  assertRevision(explorerRevision, 'isolated Explorer revision');
  if ((irohaRoot === null) !== (irohaRevision === null)) {
    throw new Error('An isolated Iroha worktree requires both root and revision');
  }
  if (irohaRevision !== null) assertRevision(irohaRevision, 'isolated Iroha revision');
  assertReleaseNodeVersion(nodeVersion);
}

async function initializeSterileBuildEnvironment(environment) {
  for (const directory of [
    environment.HOME,
    environment.TMPDIR,
    environment.XDG_CACHE_HOME,
    environment.XDG_CONFIG_HOME,
    environment.XDG_DATA_HOME,
    environment.npm_config_cache,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await writeFileDurably(environment.NPM_CONFIG_USERCONFIG, '');
}

function verifyIsolatedWorktree(worktree, { runCommandFn, environment, requirePristine = false }) {
  const actualRevision = String(
    runCommandFn('git', ['rev-parse', 'HEAD'], {
      cwd: worktree.buildRoot,
      env: environment,
      capture: true,
    })
  ).trim();
  if (actualRevision !== worktree.expectedRevision) {
    throw new Error(
      `Isolated worktree HEAD ${actualRevision || 'unknown'} does not match ` + worktree.expectedRevision
    );
  }
  const statusArgs = requirePristine
    ? ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching']
    : ['status', '--porcelain=v1', '--untracked-files=no'];
  const trackedStatus = String(
    runCommandFn('git', statusArgs, {
      cwd: worktree.buildRoot,
      env: environment,
      capture: true,
    })
  ).trim();
  if (trackedStatus) {
    const scope = requirePristine ? 'contains unsigned files' : 'modified tracked files';
    throw new Error(`Isolated release build ${scope}:\n${trackedStatus}`);
  }
}

async function executeIsolatedReleaseBuild(
  {
    repositoryRoot,
    explorerRevision,
    irohaRoot,
    irohaRevision,
    buildParent,
    environment,
    runCommandFn,
    addedWorktrees,
  },
  action
) {
  const emptyHooksDir = path.join(buildParent, 'empty-hooks');
  await mkdir(emptyHooksDir, { mode: 0o700 });
  await validateCanonicalRealDirectory(emptyHooksDir, 'Isolated empty Git hooks directory');
  const worktreePrefix = ['-c', `core.hooksPath=${emptyHooksDir}`, 'worktree', 'add', '--detach'];
  if (irohaRoot !== null) {
    const irohaBuildRoot = path.join(buildParent, 'iroha');
    runCommandFn('git', [...worktreePrefix, irohaBuildRoot, irohaRevision], {
      cwd: irohaRoot,
      env: environment,
    });
    addedWorktrees.push({
      sourceRoot: irohaRoot,
      buildRoot: irohaBuildRoot,
      expectedRevision: irohaRevision,
    });
    verifyIsolatedWorktree(addedWorktrees.at(-1), {
      runCommandFn,
      environment,
      requirePristine: true,
    });
  }
  const explorerBuildRoot = path.join(buildParent, 'explorer');
  runCommandFn('git', [...worktreePrefix, explorerBuildRoot, explorerRevision], {
    cwd: repositoryRoot,
    env: environment,
  });
  addedWorktrees.push({
    sourceRoot: repositoryRoot,
    buildRoot: explorerBuildRoot,
    expectedRevision: explorerRevision,
  });
  await validateCanonicalRealDirectory(explorerBuildRoot, 'Isolated Explorer checkout');
  verifyIsolatedWorktree(addedWorktrees.at(-1), {
    runCommandFn,
    environment,
    requirePristine: true,
  });

  const pathNodeVersion = String(
    runCommandFn('node', ['--version'], {
      cwd: explorerBuildRoot,
      env: environment,
      capture: true,
    })
  ).trim();
  assertReleaseNodeVersion(pathNodeVersion);
  const pnpmVersion = String(
    runCommandFn('pnpm', ['--version'], {
      cwd: explorerBuildRoot,
      env: environment,
      capture: true,
    })
  ).trim();
  if (pnpmVersion !== REQUIRED_PNPM_VERSION) {
    throw new Error(`pnpm ${REQUIRED_PNPM_VERSION} is required, found ${pnpmVersion || 'unknown'}`);
  }
  const pnpmStoreDir = path.join(buildParent, '.pnpm-store');
  for (const args of [
    ['fetch', '--frozen-lockfile', '--store-dir', pnpmStoreDir],
    ['install', '--offline', '--frozen-lockfile', '--store-dir', pnpmStoreDir],
    ['build'],
    ['check:bundle'],
  ]) {
    runCommandFn('pnpm', args, { cwd: explorerBuildRoot, env: environment });
  }
  for (const worktree of addedWorktrees) {
    verifyIsolatedWorktree(worktree, { runCommandFn, environment });
  }
  const distDir = path.join(explorerBuildRoot, 'dist');
  await validateCanonicalRealDirectory(distDir, 'Isolated release dist');
  return action({ repositoryRoot: explorerBuildRoot, distDir });
}

async function cleanupIsolatedReleaseBuild({
  addedWorktrees,
  runCommandFn,
  environment,
  buildParent,
  removeDirectoryFn,
}) {
  const errors = [];
  for (const worktree of addedWorktrees.reverse()) {
    try {
      runCommandFn('git', ['worktree', 'remove', '--force', worktree.buildRoot], {
        cwd: worktree.sourceRoot,
        env: environment,
      });
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await removeDirectoryFn(buildParent, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

function finishIsolatedReleaseBuild(result, actionError, cleanupErrors) {
  if (!actionError && cleanupErrors.length === 0) return result;
  if (actionError && cleanupErrors.length === 0) throw actionError;
  const errors = actionError ? [actionError, ...cleanupErrors] : cleanupErrors;
  throw new AggregateError(errors, 'Isolated Taira release build failed or could not be cleaned', {
    cause: actionError ?? cleanupErrors[0],
  });
}

export async function withIsolatedReleaseBuild(
  { repositoryRoot, explorerRevision, irohaRoot = null, irohaRevision = null },
  action,
  {
    mkdtempFn = mkdtemp,
    runCommandFn = defaultReleaseCommand,
    removeDirectoryFn = rm,
    buildEnvironment = null,
    nodeVersion = process.versions.node,
  } = {}
) {
  validateIsolatedBuildSpec({ explorerRevision, irohaRoot, irohaRevision, nodeVersion });
  const buildParent = await mkdtempFn(path.join(realpathSync(tmpdir()), 'taira-explorer-build-'));
  await validateCanonicalRealDirectory(buildParent, 'Isolated build parent');
  const effectiveBuildEnvironment = buildEnvironment ?? sanitizedReleaseBuildEnvironment(process.env, buildParent);
  await initializeSterileBuildEnvironment(effectiveBuildEnvironment);
  const addedWorktrees = [];
  let result;
  let actionError = null;
  try {
    result = await executeIsolatedReleaseBuild(
      {
        repositoryRoot,
        explorerRevision,
        irohaRoot,
        irohaRevision,
        buildParent,
        environment: effectiveBuildEnvironment,
        runCommandFn,
        addedWorktrees,
      },
      action
    );
  } catch (error) {
    actionError = error;
  }
  const cleanupErrors = await cleanupIsolatedReleaseBuild({
    addedWorktrees,
    runCommandFn,
    environment: effectiveBuildEnvironment,
    buildParent,
    removeDirectoryFn,
  });
  return finishIsolatedReleaseBuild(result, actionError, cleanupErrors);
}

async function validatedPin(root) {
  const result = await checkIrohaPinFiles({
    packagePath: path.join(root, 'package.json'),
    profilePath: path.join(root, 'tests/mochi/explorer-profile.json'),
    lockfilePath: path.join(root, 'pnpm-lock.yaml'),
  });
  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  return result.revision;
}

function commandContext(env = process.env) {
  const toolRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const repositoryRoot = path.resolve(env.TAIRA_EXPLORER_ROOT ?? toolRoot);
  const servedPath = path.resolve(
    env.TAIRA_EXPLORER_SERVED_DIST ?? '/Users/administrator/dev/iroha2-block-explorer-web/dist'
  );
  const releasesDir = path.resolve(env.TAIRA_EXPLORER_RELEASES_DIR ?? path.join(path.dirname(servedPath), 'releases'));
  return {
    repositoryRoot,
    toolRoot,
    servedPath,
    releasesDir,
    baseUrl: TAIRA_EXPLORER_URL,
    statusUrl: TAIRA_TORII_STATUS_URL,
    reviewedBaselineInventoryPath: path.join(toolRoot, 'ops/taira', REVIEWED_BASELINE_INVENTORY_NAME),
  };
}

async function runManifestCommand(context, { env }) {
  const explorerRevision = requiredEnvironment('TAIRA_EXPLORER_REVISION', env);
  const generatorRevision = await verifyMutatingCheckout(context.toolRoot);
  const artifactRevision = verifyReleaseCheckout(context.repositoryRoot, {
    allowReviewedBaseline: true,
  });
  await verifyCanonicalExplorerRevision(artifactRevision);
  if (explorerRevision !== artifactRevision) {
    throw new Error(`TAIRA_EXPLORER_REVISION ${explorerRevision} does not match artifact HEAD ${artifactRevision}`);
  }
  if (artifactRevision !== REVIEWED_BASELINE.explorerRevision) {
    throw new Error(`Baseline artifact must be the reviewed Explorer ${REVIEWED_BASELINE.explorerRevision}`);
  }
  const sdkRevision = requiredEnvironment('TAIRA_SDK_REVISION', env);
  if (sdkRevision !== REVIEWED_BASELINE.sdkRevision) {
    throw new Error(`Baseline SDK must be the reviewed revision ${REVIEWED_BASELINE.sdkRevision}`);
  }
  const runtimeRevision = requiredEnvironment('TAIRA_RUNTIME_REVISION', env);
  if (runtimeRevision !== REVIEWED_BASELINE.runtimeRevision) {
    throw new Error(`Reviewed baseline runtime must be ${REVIEWED_BASELINE.runtimeRevision}, not ${runtimeRevision}`);
  }
  const sdkProvenance = await verifySdkSourceClosure(context.repositoryRoot, sdkRevision, {
    reviewedBaseline: true,
  });
  const output = path.resolve(requiredEnvironment('TAIRA_MANIFEST_OUTPUT', env));
  const operatorConfigPath = path.resolve(requiredEnvironment('TAIRA_RUNTIME_CONFIG', env));
  const irohaRoot = resolvedIrohaRoot(context.repositoryRoot, REVIEWED_BASELINE.dependency);
  await withIsolatedReleaseBuild(
    {
      repositoryRoot: context.repositoryRoot,
      explorerRevision,
      irohaRoot,
      irohaRevision: sdkRevision,
    },
    async ({ repositoryRoot: buildRoot, distDir }) => {
      const reviewedInventory = await verifyReviewedBaselineInventory(distDir, context.reviewedBaselineInventoryPath);
      await installTairaRuntimeConfig({
        configPath: operatorConfigPath,
        distDir,
        forbiddenRoots: [context.repositoryRoot, context.toolRoot, path.dirname(context.servedPath)],
      });
      const manifest = await createReleaseManifest({
        distDir,
        packageLockPath: path.join(buildRoot, 'pnpm-lock.yaml'),
        explorerRevision,
        generatorRevision,
        sdkRevision,
        runtimeRevision,
        profileRevision: JSON.parse(await readFile(path.join(buildRoot, 'tests/mochi/explorer-profile.json'), 'utf8'))
          .iroha_revision,
        sdkProvenance,
      });
      validateReviewedBaselineManifest(manifest);
      validateReviewedBaselineManifestInventory(manifest, reviewedInventory);
      try {
        await publishBaselineManifestOutput(output, serializeReleaseManifest(manifest));
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error(`Refusing to overwrite release manifest: ${output}`, { cause: error });
        }
        throw error;
      }
    }
  );
  console.log(`Wrote audited release manifest: ${output}`);
}

async function runInitializeCommand(context, { env }) {
  await verifyOperationalTarget(context);
  const baselineManifestPath = path.resolve(requiredEnvironment('TAIRA_BASELINE_MANIFEST', env));
  const baseline = await readCanonicalManifestFile(baselineManifestPath);
  validateReviewedBaselineManifest(baseline);
  await verifyCanonicalPinnedMutatingCheckout(context.repositoryRoot, baseline.generator_revision);
  const runtimeRevision = await fetchRuntimeRevision(context.statusUrl);
  if (baseline.runtime_revision !== runtimeRevision) {
    throw new Error(`Baseline expects Torii ${baseline.runtime_revision}, but current runtime is ${runtimeRevision}`);
  }
  const result = await initializeReleaseStore({
    servedPath: context.servedPath,
    releasesDir: context.releasesDir,
    baselineManifest: baseline,
    reviewedBaselineInventoryPath: context.reviewedBaselineInventoryPath,
    baseUrl: context.baseUrl,
    statusUrl: context.statusUrl,
    replacementConfigPath: path.resolve(requiredEnvironment('TAIRA_RUNTIME_CONFIG', env)),
    runtimeConfigForbiddenRoots: [context.repositoryRoot, context.toolRoot, path.dirname(context.servedPath)],
  });
  console.log(
    result.alreadyInitialized
      ? `Release store already initialized at ${result.releaseId}`
      : `Imported baseline and initialized release store at ${result.releaseId}`
  );
}

async function runVerifyCommand(context) {
  await verifyOperationalTarget(context);
  const active = await resolveActiveRelease(context.servedPath, context.releasesDir);
  await verifyPublicReleaseWithRetries({
    baseUrl: context.baseUrl,
    statusUrl: context.statusUrl,
    manifest: active.manifest,
  });
  console.log(`Verified active Taira Explorer release: ${active.releaseId}`);
}

async function runRollbackCommand(context, { args }) {
  await verifyOperationalTarget(context);
  const [releaseId] = args;
  assertReleaseId(releaseId);
  const targetManifest = await verifyReleaseDirectory(safeReleaseTarget(context.releasesDir, releaseId));
  await verifyLocalMutatingCheckout(context.repositoryRoot, targetManifest.generator_revision);
  const result = await withReleaseLock({ releasesDir: context.releasesDir }, async () => {
    const currentRuntimeRevision = await fetchRuntimeRevision(context.statusUrl);
    return rollbackRelease({
      lockHeld: true,
      releaseId,
      servedPath: context.servedPath,
      releasesDir: context.releasesDir,
      baseUrl: context.baseUrl,
      statusUrl: context.statusUrl,
      currentRuntimeRevision,
      expectedManifest: targetManifest,
    });
  });
  console.log(
    result.alreadyActive
      ? `Release already active: ${result.releaseId}`
      : `Rolled Taira Explorer back to: ${result.releaseId}`
  );
}

async function verifiedFinalReleaseInputs(context) {
  await verifyOperationalTarget(context);
  const explorerRevision = await verifyMutatingCheckout(context.repositoryRoot);
  const pinRevision = await validatedPin(context.repositoryRoot);
  const sdkProvenance = await verifySdkSourceClosure(context.repositoryRoot, pinRevision);
  return { explorerRevision, pinRevision, sdkProvenance };
}

function releaseRuntimeConfigForbiddenRoots(context, buildRoot) {
  return [...new Set([context.repositoryRoot, context.toolRoot, buildRoot, path.dirname(context.servedPath)])];
}

async function runDeployCommand(context, { env }) {
  const { explorerRevision, pinRevision, sdkProvenance } = await verifiedFinalReleaseInputs(context);
  const active = await resolveActiveRelease(context.servedPath, context.releasesDir);
  if (active.manifest.runtime_revision !== pinRevision) {
    throw new RuntimeTransitionIntentRequiredError(
      `Active Explorer ${active.releaseId} is bound to Torii ${active.manifest.runtime_revision}; ` +
        'prepare the pinned transition while that predecessor is still live'
    );
  }
  const runtimeRevision = await fetchRuntimeRevision(context.statusUrl);
  if (runtimeRevision !== pinRevision) {
    throw new Error(`Torii runtime ${runtimeRevision} does not match pinned Iroha ${pinRevision}`);
  }
  const operatorConfigPath = path.resolve(requiredEnvironment('TAIRA_RUNTIME_CONFIG', env));
  const irohaRoot = resolvedIrohaRoot(context.repositoryRoot, sdkProvenance.dependency);
  const result = await withIsolatedReleaseBuild(
    {
      repositoryRoot: context.repositoryRoot,
      explorerRevision,
      irohaRoot,
      irohaRevision: pinRevision,
    },
    async ({ repositoryRoot: buildRoot, distDir }) => {
      await installTairaRuntimeConfig({
        configPath: operatorConfigPath,
        distDir,
        forbiddenRoots: releaseRuntimeConfigForbiddenRoots(context, buildRoot),
      });
      return withReleaseLock({ releasesDir: context.releasesDir }, async () => {
        const currentRuntimeRevision = await fetchRuntimeRevision(context.statusUrl);
        if (currentRuntimeRevision !== pinRevision) {
          throw new Error(
            `Torii runtime changed to ${currentRuntimeRevision} before publication; expected ` + pinRevision
          );
        }
        return deployRelease({
          lockHeld: true,
          distDir,
          packageLockPath: path.join(buildRoot, 'pnpm-lock.yaml'),
          bundleBudgetPath: path.join(buildRoot, 'bundle-budgets.json'),
          servedPath: context.servedPath,
          releasesDir: context.releasesDir,
          baseUrl: context.baseUrl,
          statusUrl: context.statusUrl,
          explorerRevision,
          generatorRevision: explorerRevision,
          sdkRevision: pinRevision,
          runtimeRevision: pinRevision,
          profileRevision: pinRevision,
          sdkProvenance,
        });
      });
    }
  );
  console.log(`Deployed and verified Taira Explorer release: ${result.releaseId}`);
}

async function runPrepareTransitionCommand(context, { env }) {
  const runtimeTransitionFrom = requiredEnvironment('TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION', env);
  assertRevision(runtimeTransitionFrom, 'TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION');
  const { explorerRevision, pinRevision, sdkProvenance } = await verifiedFinalReleaseInputs(context);
  if (pinRevision === runtimeTransitionFrom) {
    throw new Error('prepare-transition target must differ from its declared predecessor runtime');
  }
  const active = await resolveActiveRelease(context.servedPath, context.releasesDir);
  if (active.manifest.runtime_revision !== runtimeTransitionFrom) {
    throw new RuntimeTransitionIntentRequiredError(
      `Active Explorer ${active.releaseId} is bound to ${active.manifest.runtime_revision}, not ` +
        `declared predecessor ${runtimeTransitionFrom}`
    );
  }
  const initialRuntimeRevision = await fetchRuntimeRevision(context.statusUrl);
  if (initialRuntimeRevision !== runtimeTransitionFrom) {
    throw new Error(
      `prepare-transition requires live Torii predecessor ${runtimeTransitionFrom}, but reports ` +
        initialRuntimeRevision
    );
  }
  const operatorConfigPath = path.resolve(requiredEnvironment('TAIRA_RUNTIME_CONFIG', env));
  const irohaRoot = resolvedIrohaRoot(context.repositoryRoot, sdkProvenance.dependency);
  const result = await withIsolatedReleaseBuild(
    {
      repositoryRoot: context.repositoryRoot,
      explorerRevision,
      irohaRoot,
      irohaRevision: pinRevision,
    },
    async ({ repositoryRoot: buildRoot, distDir }) => {
      await installTairaRuntimeConfig({
        configPath: operatorConfigPath,
        distDir,
        forbiddenRoots: releaseRuntimeConfigForbiddenRoots(context, buildRoot),
      });
      return withReleaseLock({ releasesDir: context.releasesDir }, async () => {
        const currentRuntimeRevision = await fetchRuntimeRevision(context.statusUrl);
        return prepareTransitionRelease({
          lockHeld: true,
          distDir,
          packageLockPath: path.join(buildRoot, 'pnpm-lock.yaml'),
          bundleBudgetPath: path.join(buildRoot, 'bundle-budgets.json'),
          servedPath: context.servedPath,
          releasesDir: context.releasesDir,
          explorerRevision,
          generatorRevision: explorerRevision,
          sdkRevision: pinRevision,
          runtimeRevision: pinRevision,
          profileRevision: pinRevision,
          sdkProvenance,
          runtimeTransitionFrom,
          currentRuntimeRevision,
        });
      });
    }
  );
  console.log(`Prepared immutable Taira transition release without activation: ${result.releaseId}`);
}

async function runTransitionCommand(context, { args, env }) {
  await verifyOperationalTarget(context);
  const [releaseId] = args;
  assertReleaseId(releaseId);
  const expectedManifest = await verifyReleaseDirectory(safeReleaseTarget(context.releasesDir, releaseId));
  await verifyLocalMutatingCheckout(context.repositoryRoot, expectedManifest.generator_revision);
  const runtimeTransitionFrom = requiredEnvironment('TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION', env);
  assertRevision(runtimeTransitionFrom, 'TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION');
  const result = await withReleaseLock({ releasesDir: context.releasesDir }, async () => {
    const currentRuntimeRevision = await fetchRuntimeRevision(context.statusUrl);
    return activatePreparedTransition({
      lockHeld: true,
      releaseId,
      expectedManifest,
      servedPath: context.servedPath,
      releasesDir: context.releasesDir,
      baseUrl: context.baseUrl,
      statusUrl: context.statusUrl,
      currentRuntimeRevision,
      runtimeTransitionFrom,
    });
  });
  console.log(`Adopted and verified prepared Taira transition release: ${result.releaseId}`);
}

export async function runReleaseCommand({
  argv = process.argv.slice(2),
  env = process.env,
  context = commandContext(env),
  nodeVersion = process.versions.node,
} = {}) {
  assertReleaseNodeVersion(nodeVersion);
  const [command = 'deploy', ...args] = argv;
  const handlers = {
    deploy: runDeployCommand,
    initialize: runInitializeCommand,
    manifest: runManifestCommand,
    'prepare-transition': runPrepareTransitionCommand,
    rollback: runRollbackCommand,
    transition: runTransitionCommand,
    verify: runVerifyCommand,
  };
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown release command: ${command}`);
  const requiredArgumentCount = command === 'rollback' || command === 'transition' ? 1 : 0;
  if (args.length !== requiredArgumentCount) {
    const suffix = requiredArgumentCount === 1 ? ' <exact-release-id>' : '';
    throw new Error(`Usage: ${command}${suffix}`);
  }
  await handler(context, { args, env });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  consumeTairaReleaseAttestation();
  await runReleaseCommand({ argv: process.argv.slice(2) });
}
