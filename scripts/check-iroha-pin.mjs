import { readFile } from 'node:fs/promises';

const IROHA_PACKAGE = '@iroha/iroha-js';
const IROHA_REPOSITORY = 'hyperledger-iroha/iroha';
const IROHA_SUBDIRECTORY = 'javascript/iroha_js';
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SPECIFIER_PATTERN = new RegExp(
  `^github:${IROHA_REPOSITORY}#([0-9a-f]{40})&path:${IROHA_SUBDIRECTORY}$`,
  'u'
);

function expectedLockVersion(revision) {
  return `https://codeload.github.com/hyperledger-iroha/iroha/tar.gz/${revision}#path:${IROHA_SUBDIRECTORY}`;
}

function expectedTarball(revision) {
  return `https://codeload.github.com/hyperledger-iroha/iroha/tar.gz/${revision}`;
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith("'") && trimmed.endsWith("'"))
      || (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseIrohaGitSpecifier(specifier) {
  if (typeof specifier !== 'string') return null;
  const match = SPECIFIER_PATTERN.exec(specifier);
  if (!match) return null;
  return {
    repository: IROHA_REPOSITORY,
    revision: match[1],
    subdirectory: IROHA_SUBDIRECTORY,
  };
}

export function readLockfileImporterPin(lockfile) {
  const lines = lockfile.split(/\r?\n/u);
  const packageLine = lines.findIndex((line) => /^\s{6}'@iroha\/iroha-js':\s*$/u.test(line));
  if (packageLine === -1) return null;

  let specifier = null;
  let version = null;
  for (let index = packageLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{6}\S/u.test(line)) break;
    const specifierMatch = /^\s{8}specifier:\s*(.+?)\s*$/u.exec(line);
    if (specifierMatch) specifier = unquoteYamlScalar(specifierMatch[1]);
    const versionMatch = /^\s{8}version:\s*(.+?)\s*$/u.exec(line);
    if (versionMatch) version = unquoteYamlScalar(versionMatch[1]);
  }
  return specifier && version ? { specifier, version } : null;
}

export function readLockfilePackageResolution(lockfile, version) {
  const lines = lockfile.split(/\r?\n/u);
  const expectedKey = `${IROHA_PACKAGE}@${version}`;
  const packageLine = lines.findIndex((line) => {
    const match = /^\s{2}(.+):\s*$/u.exec(line);
    return match && unquoteYamlScalar(match[1]) === expectedKey;
  });
  if (packageLine === -1) return null;

  for (let index = packageLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{2}\S/u.test(line)) break;
    const inlineMatch = /^\s{4}resolution:\s*\{path:\s*([^,}]+),\s*tarball:\s*([^,}]+)\}\s*$/u.exec(line);
    if (inlineMatch) {
      return {
        path: unquoteYamlScalar(inlineMatch[1]),
        tarball: unquoteYamlScalar(inlineMatch[2]),
      };
    }
    if (/^\s{4}resolution:\s*$/u.test(line)) {
      let resolutionPath = null;
      let resolutionTarball = null;
      for (let resolutionIndex = index + 1; resolutionIndex < lines.length; resolutionIndex += 1) {
        const resolutionLine = lines[resolutionIndex];
        if (!/^\s{6}\S/u.test(resolutionLine)) break;
        const pathMatch = /^\s{6}path:\s*(.+?)\s*$/u.exec(resolutionLine);
        if (pathMatch) resolutionPath = unquoteYamlScalar(pathMatch[1]);
        const tarballMatch = /^\s{6}tarball:\s*(.+?)\s*$/u.exec(resolutionLine);
        if (tarballMatch) resolutionTarball = unquoteYamlScalar(tarballMatch[1]);
      }
      return resolutionPath && resolutionTarball
        ? { path: resolutionPath, tarball: resolutionTarball }
        : null;
    }
  }
  return null;
}

function readIrohaLockKeys(lockfile) {
  return lockfile
    .split(/\r?\n/u)
    .map((line) => /^\s{2}(.+):\s*$/u.exec(line))
    .filter(Boolean)
    .map((match) => unquoteYamlScalar(match[1]))
    .filter((key) => key.startsWith(`${IROHA_PACKAGE}@`));
}

function validateLockResolution(lockfile, parsed, importerPin) {
  if (!parsed || !importerPin) return [];
  const errors = [];
  const expectedVersion = expectedLockVersion(parsed.revision);
  if (importerPin.version !== expectedVersion) {
    errors.push(`pnpm-lock.yaml importer version must be ${expectedVersion}`);
  }
  const resolution = readLockfilePackageResolution(lockfile, expectedVersion);
  if (
    !resolution
    || resolution.path !== IROHA_SUBDIRECTORY
    || resolution.tarball !== expectedTarball(parsed.revision)
  ) {
    errors.push(
      `pnpm-lock.yaml package resolution must use ${expectedTarball(parsed.revision)} at ${IROHA_SUBDIRECTORY}`
    );
  }
  const expectedKey = `${IROHA_PACKAGE}@${expectedVersion}`;
  const packageKeys = readIrohaLockKeys(lockfile);
  if (packageKeys.length !== 2 || packageKeys.some((key) => key !== expectedKey)) {
    errors.push(`pnpm-lock.yaml must contain only the pinned package and snapshot key ${expectedKey}`);
  }
  return errors;
}

export function validateIrohaPin({ packageJson, profile, lockfile }) {
  const errors = [];
  const dependency = packageJson?.dependencies?.[IROHA_PACKAGE];
  const parsed = parseIrohaGitSpecifier(dependency);

  if (!parsed) {
    errors.push(
      `${IROHA_PACKAGE} must use github:${IROHA_REPOSITORY}#<40-lowercase-hex-sha>&path:${IROHA_SUBDIRECTORY}`
    );
  }

  const profileRevision = profile?.iroha_revision;
  if (typeof profileRevision !== 'string' || !FULL_SHA_PATTERN.test(profileRevision)) {
    errors.push('tests/mochi/explorer-profile.json iroha_revision must be a full lowercase commit SHA');
  } else if (parsed && profileRevision !== parsed.revision) {
    errors.push(
      `Mochi profile revision ${profileRevision} does not match SDK revision ${parsed.revision}`
    );
  }

  const importerPin = readLockfileImporterPin(lockfile);
  if (!importerPin) {
    errors.push(`pnpm-lock.yaml is missing the ${IROHA_PACKAGE} importer entry`);
  } else if (typeof dependency === 'string' && importerPin.specifier !== dependency) {
    errors.push(
      `pnpm-lock.yaml importer specifier ${importerPin.specifier} does not match package.json ${dependency}`
    );
  }

  if (/\b(?:file|link):[^\s'"}]*iroha(?:\/|\\)javascript(?:\/|\\)iroha_js/iu.test(lockfile)) {
    errors.push('pnpm-lock.yaml must not resolve @iroha/iroha-js through a local file or link');
  }

  errors.push(...validateLockResolution(lockfile, parsed, importerPin));

  return {
    errors,
    revision: parsed?.revision ?? null,
  };
}

export async function checkIrohaPinFiles({ packagePath, profilePath, lockfilePath }) {
  const [packageSource, profileSource, lockfile] = await Promise.all([
    readFile(packagePath, 'utf8'),
    readFile(profilePath, 'utf8'),
    readFile(lockfilePath, 'utf8'),
  ]);
  return validateIrohaPin({
    packageJson: JSON.parse(packageSource),
    profile: JSON.parse(profileSource),
    lockfile,
  });
}

async function main() {
  const root = new URL('../', import.meta.url);
  const result = await checkIrohaPinFiles({
    packagePath: new URL('package.json', root),
    profilePath: new URL('tests/mochi/explorer-profile.json', root),
    lockfilePath: new URL('pnpm-lock.yaml', root),
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`IROHA PIN: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`IROHA PIN: SDK, lockfile, and Mochi profile use ${result.revision}`);
}

if (process.argv[1]?.endsWith('check-iroha-pin.mjs')) {
  await main();
}
