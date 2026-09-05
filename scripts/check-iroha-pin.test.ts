import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  checkIrohaPinFiles,
  parseIrohaGitSpecifier,
  readLockfileImporterPin,
  readLockfilePackageResolution,
  validateIrohaPin,
} from './check-iroha-pin.mjs';

const revision = '0123456789abcdef0123456789abcdef01234567';
const specifier = `github:hyperledger-iroha/iroha#${revision}&path:javascript/iroha_js`;

function packageJson(dependency = specifier) {
  return { dependencies: { '@iroha/iroha-js': dependency } };
}

function profile(irohaRevision = revision) {
  return { iroha_revision: irohaRevision };
}

const tarball = `https://codeload.github.com/hyperledger-iroha/iroha/tar.gz/${revision}`;
const lockVersion = `${tarball}#path:javascript/iroha_js`;

function lockfile({
  importerSpecifier = specifier,
  version = lockVersion,
  resolutionPath = 'javascript/iroha_js',
  resolutionTarball = tarball,
  inlineResolution = false,
} = {}) {
  const resolution = inlineResolution
    ? `    resolution: {path: ${resolutionPath}, tarball: ${resolutionTarball}}`
    : `    resolution:\n      path: ${resolutionPath}\n      tarball: ${resolutionTarball}`;
  return `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@iroha/iroha-js':
        specifier: ${importerSpecifier}
        version: ${version}

packages:

  '@iroha/iroha-js@${version}':
${resolution}

snapshots:

  '@iroha/iroha-js@${version}':
    dependencies: {}
`;
}

describe('parseIrohaGitSpecifier', () => {
  it('accepts only the exact repository, full revision, and package subdirectory', () => {
    expect(parseIrohaGitSpecifier(specifier)).toEqual({
      repository: 'hyperledger-iroha/iroha',
      revision,
      subdirectory: 'javascript/iroha_js',
    });
    expect(parseIrohaGitSpecifier(`github:hyperledger-iroha/iroha#${revision.slice(0, 12)}&path:javascript/iroha_js`)).toBeNull();
    expect(parseIrohaGitSpecifier(`github:fork/iroha#${revision}&path:javascript/iroha_js`)).toBeNull();
    expect(parseIrohaGitSpecifier(`github:hyperledger-iroha/iroha#${revision}&path:crates/iroha`)).toBeNull();
  });
});

describe('readLockfileImporterPin', () => {
  it('reads quoted package keys and scalars from the root importer', () => {
    expect(readLockfileImporterPin(lockfile())).toEqual({
      specifier,
      version: lockVersion,
    });
    expect(readLockfilePackageResolution(lockfile(), lockVersion)).toEqual({
      path: 'javascript/iroha_js',
      tarball,
    });
    expect(readLockfilePackageResolution(lockfile({ inlineResolution: true }), lockVersion)).toEqual({
      path: 'javascript/iroha_js',
      tarball,
    });
  });
});

describe('checkIrohaPinFiles', () => {
  it('reads a valid pin tuple from the requested files', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'iroha-pin-files-'));
    const packagePath = path.join(directory, 'package.json');
    const profilePath = path.join(directory, 'explorer-profile.json');
    const lockfilePath = path.join(directory, 'pnpm-lock.yaml');
    try {
      writeFileSync(packagePath, JSON.stringify(packageJson()));
      writeFileSync(profilePath, JSON.stringify(profile()));
      writeFileSync(lockfilePath, lockfile());

      await expect(checkIrohaPinFiles({
        packagePath,
        profilePath,
        lockfilePath,
      })).resolves.toEqual({
        errors: [],
        revision,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('validateIrohaPin', () => {
  it('accepts one exact revision across package.json, the lockfile, and Mochi profile', () => {
    expect(validateIrohaPin({ packageJson: packageJson(), profile: profile(), lockfile: lockfile() })).toEqual({
      errors: [],
      revision,
    });
  });

  it('rejects local SDK links and independently drifting revisions', () => {
    const result = validateIrohaPin({
      packageJson: packageJson('file:../iroha/javascript/iroha_js'),
      profile: profile('1234567890abcdef1234567890abcdef12345678'),
      lockfile: `
importers:
  .:
    dependencies:
      '@iroha/iroha-js':
        specifier: file:../iroha/javascript/iroha_js
        version: file:../iroha/javascript/iroha_js
`,
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('must use github:'),
      expect.stringContaining('local file or link'),
    ]));
  });

  it('rejects a lock importer version that is not the pinned codeload subdirectory', () => {
    const otherRevision = '1234567890abcdef1234567890abcdef12345678';
    const result = validateIrohaPin({
      packageJson: packageJson(),
      profile: profile(),
      lockfile: lockfile({
        version: `https://codeload.github.com/hyperledger-iroha/iroha/tar.gz/${otherRevision}#path:javascript/other`,
      }),
    });

    expect(result.errors).toEqual([
      `pnpm-lock.yaml importer version must be ${lockVersion}`,
      `pnpm-lock.yaml package resolution must use ${tarball} at javascript/iroha_js`,
      expect.stringContaining('must contain only the pinned package and snapshot key'),
    ]);
  });

  it('rejects an uppercase dependency revision and an alternate package tarball', () => {
    const uppercase = revision.toUpperCase();
    expect(validateIrohaPin({
      packageJson: packageJson(specifier.replace(revision, uppercase)),
      profile: profile(),
      lockfile: lockfile(),
    }).errors).toContainEqual(expect.stringContaining('must use github:'));

    expect(validateIrohaPin({
      packageJson: packageJson(),
      profile: profile(),
      lockfile: lockfile({ resolutionTarball: `https://example.invalid/iroha/${revision}.tar.gz` }),
    }).errors).toEqual([
      `pnpm-lock.yaml package resolution must use ${tarball} at javascript/iroha_js`,
    ]);
  });

  it('rejects additional Iroha SDK package keys outside the pinned package and snapshot', () => {
    const alternate = lockfile().replace(
      '\nsnapshots:',
      `\n  '@iroha/iroha-js@https://example.invalid/alternate.tgz':\n    dependencies: {}\n\nsnapshots:`
    );
    const result = validateIrohaPin({
      packageJson: packageJson(),
      profile: profile(),
      lockfile: alternate,
    });
    expect(result.errors).toEqual([
      expect.stringContaining('must contain only the pinned package and snapshot key'),
    ]);
  });

  it('rejects malformed importer and resolution entries', () => {
    const malformed = lockfile().replace('      path:', '      directory:');
    const result = validateIrohaPin({ packageJson: packageJson(), profile: profile(), lockfile: malformed });
    expect(result.errors).toEqual([
      `pnpm-lock.yaml package resolution must use ${tarball} at javascript/iroha_js`,
    ]);
  });
});
