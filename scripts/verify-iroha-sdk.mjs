/** Read-only package integrity checks. These hashes identify the admitted
 * consumer artifact; they do not grant signed release or deployment authority. */
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IROHA_SDK_SPECIFIER = 'file:vendor/iroha-iroha-js-0.0.3-e968431b87ef.tgz';
export const IROHA_SDK_ARCHIVE_SHA256 = 'e968431b87ef519bb4ca5482ba4f59863436f248799b5eb839ea7cf041a52aa5';
export const IROHA_SDK_INVENTORY_SHA256 = '0f9cc7be940c6a8b2feb33945b4153abaf3fd279d6c733a1507f3c165208d4a2';
const archiveBytesLength = 1088405;
const inventoryBytesLength = 111749;
const inventoryFilename = 'iroha-iroha-js-0.0.3-e968431b87ef.files.json';
export const IROHA_SDK_SOURCE_REVISION = '02403c8449c3287d2516408d8d33984c969514d5';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function regularBytes(filename, expectedSize) {
  if (await realpath(filename) !== filename) throw new Error(`SDK input must not traverse links: ${filename}`);
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`SDK input must be a regular file: ${filename}`);
  if (before.size > 64 * 1024 * 1024 || (expectedSize !== undefined && before.size !== expectedSize)) {
    throw new Error(`SDK input size differs from the pinned artifact: ${filename}`);
  }
  const bytes = await readFile(filename); const after = await lstat(filename);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || bytes.length !== after.size
    || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.mode !== after.mode) {
    throw new Error(`SDK input changed while reading: ${filename}`);
  }
  return bytes;
}

async function verifiedArchiveInputs(repositoryRoot) {
  const repository = await realpath(repositoryRoot);
  const packageJson = JSON.parse(await regularBytes(path.join(repository, 'package.json')));
  if (packageJson.dependencies?.['@iroha/iroha-js'] !== IROHA_SDK_SPECIFIER) {
    throw new Error('SDK dependency must select the exact admitted vendored archive');
  }
  const archive = await regularBytes(path.join(repository, IROHA_SDK_SPECIFIER.slice(5)), archiveBytesLength);
  if (hash(archive) !== IROHA_SDK_ARCHIVE_SHA256) throw new Error('SDK archive differs from the pinned consumer artifact');
  const inventoryBytes = await regularBytes(path.join(repository, 'vendor', inventoryFilename), inventoryBytesLength);
  if (hash(inventoryBytes) !== IROHA_SDK_INVENTORY_SHA256) throw new Error('SDK inventory differs from the pinned consumer artifact');
  const inventory = JSON.parse(inventoryBytes);
  if (inventory.schema !== 'iroha.sdk-package-inventory.v2' || inventory.archiveSha256 !== IROHA_SDK_ARCHIVE_SHA256 || inventory.files.length !== 259) {
    throw new Error('SDK inventory does not describe the admitted 259-file package');
  }
  if (inventory.source?.revision !== IROHA_SDK_SOURCE_REVISION
    || inventory.source?.packageGitTree !== '1a42e40c9b2c6e1e2d7a95d907696b14b1512538'
    || inventory.source?.packageSourceClean !== true
    || inventory.source?.sourceInventorySha256 !== '753130cdd6cfc8a85e0bba400f5a760bdb993d72fe82e05926d7f517bc91819e'
    || inventory.source?.repeatPackSha256 !== IROHA_SDK_ARCHIVE_SHA256) {
    throw new Error('SDK inventory source identity differs from the pinned package');
  }
  if (inventory.files.some(entry => /(?:^|\/)wasm(?:\/|$)|\.wasm$|(?:^|\/)(?:browserCodec(?:Runtime)?\.js|browser-codec\.d\.ts)$/iu.test(entry.path))) {
    throw new Error('SDK inventory contains a retired browser codec artifact');
  }
  return { repository, inventory };
}

/** Check immutable inputs before an offline package install exists. */
export async function verifyIrohaSdkArchive(repositoryRoot) {
  const { inventory } = await verifiedArchiveInputs(repositoryRoot);
  return { files: inventory.files.length, archiveSha256: IROHA_SDK_ARCHIVE_SHA256, inventorySha256: IROHA_SDK_INVENTORY_SHA256, status: 'archive-integrity-verified' };
}

/** Verify every installed package byte, including browser code and declarations.
 * Missing dist files fail; this checker never copies source or builds anything. */
export async function verifyIrohaSdk(repositoryRoot) {
  const { repository, inventory } = await verifiedArchiveInputs(repositoryRoot);
  const nodeModules = await realpath(path.join(repository, 'node_modules'));
  if (nodeModules !== path.join(repository, 'node_modules')) throw new Error('SDK node_modules must be a real directory inside this checkout');
  const packageRoot = await realpath(path.join(nodeModules, '@iroha/iroha-js'));
  const relative = path.relative(nodeModules, packageRoot);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Installed SDK must remain inside this checkout node_modules');
  }
  const expectedFiles = new Map(inventory.files.map(entry => [entry.path, entry]));
  const expectedDirectories = new Set(inventory.files.flatMap(entry => {
    const segments = entry.path.split('/');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
  }));
  const found = [];
  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const relative = `${prefix}${name}`; const filename = path.join(directory, name);
      const metadata = await lstat(filename);
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        if (!expectedDirectories.has(relative)) throw new Error(`Installed SDK contains an unexpected directory: ${relative}`);
        await visit(filename, `${relative}/`);
      } else if (metadata.isFile() && !metadata.isSymbolicLink()) {
        const expected = expectedFiles.get(relative);
        if (!expected) throw new Error(`Installed SDK contains an unexpected file: ${relative}`);
        const bytes = await regularBytes(filename, expected.sizeBytes);
        if (hash(bytes) !== expected.sha256) throw new Error(`Installed SDK bytes differ: ${relative}`);
        found.push(relative);
      } else throw new Error(`Installed SDK must not contain links or special files: ${relative}`);
    }
  }
  await visit(packageRoot);
  if (JSON.stringify(found.sort()) !== JSON.stringify([...expectedFiles.keys()].sort())) {
    throw new Error('Installed SDK file inventory differs from the admitted package');
  }
  return { files: found.length, archiveSha256: IROHA_SDK_ARCHIVE_SHA256, inventorySha256: IROHA_SDK_INVENTORY_SHA256, status: 'package-integrity-verified' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--archive-only')) throw new Error('Usage: node scripts/verify-iroha-sdk.mjs [--archive-only]');
    const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const result = await (args.length ? verifyIrohaSdkArchive(repository) : verifyIrohaSdk(repository));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
