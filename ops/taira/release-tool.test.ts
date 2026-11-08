import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { link as linkFile, open as openFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CutoverCommitUncertainError,
  CoupledRuntimeRollbackRequiredError,
  DeploymentRolledBackError,
  DurableCommitUncertainError,
  ReleasePublicationUncertainError,
  ReleaseLockRemovalUncertainError,
  RuntimeTransitionIntentRequiredError,
  activatePreparedTransition,
  assertReleaseNodeVersion,
  atomicSwitchRelease,
  collectReleaseFiles,
  consumeTairaReleaseAttestation,
  createReleaseManifest,
  deployRelease,
  installTairaRuntimeConfig,
  initializeReleaseStore,
  nginxConfigDump,
  normalizeExplorerRemote,
  normalizeIrohaRemote,
  publishBaselineManifestOutput,
  publishFileDurablyNoReplace,
  prepareTransitionRelease,
  readReleaseManifest,
  readCanonicalRegularFileSnapshot,
  readOperatorRuntimeConfig,
  runReleaseCommand,
  resolveActiveRelease,
  rollbackRelease,
  serializeReleaseManifest,
  sanitizedReleaseBuildEnvironment,
  validateReleasePaths,
  validateCanonicalReleasePaths,
  validateCanonicalRealDirectory,
  validateReleaseManifest,
  validateReviewedBaselineManifest,
  validateTairaRuntimeConfig,
  fetchRuntimeRevision,
  verifyReleaseDirectory,
  verifyNginxRoot,
  verifyPublicRelease,
  verifyReleaseCheckout,
  verifyLocalReleaseCheckout,
  verifyReviewedBaselineInventory,
  verifyCanonicalSdkRevision,
  verifyCanonicalExplorerRevision,
  verifyGitCommitSignature,
  verifySdkSourceClosure,
  withReleaseLock,
  withIsolatedReleaseBuild,
  writeFileDurably,
  writeReleaseManifest,
} from './release-tool.mjs';
import {
  TAIRA_GIT_VERIFY_GNUPGHOME_ENV,
  TAIRA_GIT_VERIFY_GPG_ENV,
  TAIRA_RELEASE_ATTESTATION_NONCE_ENV,
  TAIRA_RELEASE_SIGNER_FINGERPRINT,
  TAIRA_RELEASE_TOOL_PATH,
  createTairaReleaseAttestation,
  prepareTairaGitVerification,
} from '../../scripts/run-exact-toolchain.mjs';

const explorerA = 'a'.repeat(40);
const explorerB = 'b'.repeat(40);
const runtimeRevision = 'c'.repeat(40);
const reviewedRuntimeRevision = '986cc54ed6bd0bd5adf5c9dfc191288abf034046';
const generatorRevision = 'e'.repeat(40);
const releaseA = `${explorerA.slice(0, 12)}-${runtimeRevision.slice(0, 12)}`;
const releaseB = `${explorerB.slice(0, 12)}-${runtimeRevision.slice(0, 12)}`;
const packageLockSha256 = 'f0bcde463fa201480015b9caa7db2017d3c1b6ca9c7e133df955038c54333d48';
const explorerOrigin = 'https://taira-explorer.sora.org';
const checkedNetworkId = `hash:${'AB'.repeat(32)}#B99E`;
const tairaRuntimeConfig = {
  toriiBaseUrl: 'https://taira.sora.org',
  toriiForceBaseUrl: true,
  networkId: checkedNetworkId,
  networkPrefix: 369,
};
// Synthetic release content exercises the real budget gate without using the
// admitted production SDK owner or relaxing its separate artifact policy.
const fixtureSdkModulePath = '_assets/fixture-sdk.js';
const fixtureSdkModuleBytes = Buffer.from('export const fixture = true;\n');
const fixtureBundleBudgets = {
  schema_version: 3,
  default_chunk_gzip_bytes: 1_000_000,
  chunk_gzip_bytes: {},
  entry_gzip_bytes: { 'index.html': 1_000_000 },
  entry_startup_gzip_bytes: { 'index.html': 1_000_000 },
  route_gzip_bytes: {},
};
const temporaryDirectories: string[] = [];
const servers: Server[] = [];
let suiteGitVerifierRoot: string;
let previousGitVerifyGpg: string | undefined;
let previousGitVerifyGnupgHome: string | undefined;
const runGpgIntegration = process.env.IROHA_EXPLORER_RUN_GPG_INTEGRATION === '1';

type Fixture = ReturnType<typeof fixture>;

function installFixtureGitVerifier(root: string, environment: Record<string, string>) {
  const gpgPath = path.join(root, 'fixture-gpg');
  const gnupgHome = path.join(root, 'git-verify-gnupg');
  writeFileSync(gpgPath, '#!/bin/sh\nexit 97\n', { mode: 0o700 });
  mkdirSync(gnupgHome, { mode: 0o700 });
  environment[TAIRA_GIT_VERIFY_GPG_ENV] = realpathSync(gpgPath);
  environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV] = realpathSync(gnupgHome);
}

function openPgpCommitObject(signatureArmor = 'PGP SIGNATURE') {
  return [
    `tree ${'1'.repeat(40)}`,
    'author Release Test <release@example.test> 1700000000 +0000',
    'committer Release Test <release@example.test> 1700000000 +0000',
    `gpgsig -----BEGIN ${signatureArmor}-----`,
    ' fixture-signature',
    ` -----END ${signatureArmor}-----`,
    '',
    'fixture commit',
    '',
  ].join('\n');
}

function expectedOpenPgpIdentity(status = 'G') {
  return `${status}\0${TAIRA_RELEASE_SIGNER_FINGERPRINT}\0${TAIRA_RELEASE_SIGNER_FINGERPRINT}\n`;
}

beforeAll(() => {
  suiteGitVerifierRoot = realpathSync(mkdtempSync(path.join(realpathSync('/tmp'), 'taira-suite-git-verifier-')));
  chmodSync(suiteGitVerifierRoot, 0o700);
  const environment: Record<string, string> = {};
  installFixtureGitVerifier(suiteGitVerifierRoot, environment);
  previousGitVerifyGpg = process.env[TAIRA_GIT_VERIFY_GPG_ENV];
  previousGitVerifyGnupgHome = process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV];
  process.env[TAIRA_GIT_VERIFY_GPG_ENV] = environment[TAIRA_GIT_VERIFY_GPG_ENV];
  process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV] = environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV];
});

afterAll(() => {
  if (previousGitVerifyGpg === undefined) {
    delete process.env[TAIRA_GIT_VERIFY_GPG_ENV];
  } else {
    process.env[TAIRA_GIT_VERIFY_GPG_ENV] = previousGitVerifyGpg;
  }
  if (previousGitVerifyGnupgHome === undefined) {
    delete process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV];
  } else {
    process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV] = previousGitVerifyGnupgHome;
  }
  if (suiteGitVerifierRoot) {
    rmSync(suiteGitVerifierRoot, { force: true, recursive: true });
  }
});

function sdkProvenance(revision = runtimeRevision) {
  return {
    repository: 'github.com/hyperledger-iroha/iroha',
    revision,
    subtree_path: 'javascript/iroha_js',
    subtree_tree: 'f'.repeat(40),
    dependency: `github:hyperledger-iroha/iroha#${revision}&path:javascript/iroha_js`,
    package_json_sha256: '1'.repeat(64),
    package_lock_sha256: packageLockSha256,
    profile_sha256: '2'.repeat(64),
  };
}

function writeDist(directory: string, marker: string) {
  mkdirSync(path.join(directory, '_assets'), { recursive: true });
  mkdirSync(path.join(directory, '.vite'), { recursive: true });
  writeFileSync(path.join(directory, 'index.html'), `<main>${marker}</main>\n`);
  writeFileSync(
    path.join(directory, 'config.json'),
    `${JSON.stringify(tairaRuntimeConfig)}\n`
  );
  writeFileSync(path.join(directory, '_assets/app.js'), `globalThis.release = ${JSON.stringify(marker)};\n`);
  writeFileSync(path.join(directory, fixtureSdkModulePath), fixtureSdkModuleBytes);
  writeFileSync(path.join(directory, '.vite/build.json'), `${JSON.stringify({ marker })}\n`);
  writeFileSync(
    path.join(directory, '.vite/manifest.json'),
    `${JSON.stringify({
      'index.html': {
        file: '_assets/app.js',
        isEntry: true,
        src: 'index.html',
        assets: [fixtureSdkModulePath],
      },
    })}\n`
  );
}

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(realpathSync('/tmp'), 'taira-release-tool-')));
  chmodSync(root, 0o711);
  temporaryDirectories.push(root);
  const servedPath = path.join(root, 'dist');
  const releasesDir = path.join(root, 'releases');
  const packageLockPath = path.join(root, 'pnpm-lock.yaml');
  const nextDist = path.join(root, 'next-dist');
  const baselineManifestPath = path.join(root, 'baseline-manifest.json');
  writeFileSync(packageLockPath, "lockfileVersion: '9.0'\n");
  writeFileSync(
    path.join(root, 'bundle-budgets.json'),
    `${JSON.stringify(
      fixtureBundleBudgets,
      null,
      2
    )}\n`
  );
  writeDist(servedPath, 'release-a');
  writeDist(nextDist, 'release-b');
  return {
    root,
    servedPath,
    releasesDir,
    packageLockPath,
    nextDist,
    baselineManifestPath,
    corsOrigin: explorerOrigin,
    corsMethods: 'GET, POST, DELETE, OPTIONS',
    corsHeaders: [
      'accept',
      'authorization',
      'content-type',
      'x-iroha-account',
      'x-iroha-signature',
      'x-iroha-timestamp-ms',
      'x-iroha-nonce',
      'x-iroha-witness',
    ].join(', '),
    spaFallbackMode: 'valid',
  };
}

async function tairaReleaseAttestation(argv: string[] = ['verify']) {
  const root = realpathSync(mkdtempSync(path.join(realpathSync('/tmp'), 'taira-release-attestation-')));
  chmodSync(root, 0o700);
  temporaryDirectories.push(root);
  const cacheRoot = path.join(root, 'cache');
  mkdirSync(cacheRoot, { mode: 0o700 });
  const nodeRunRoot = mkdtempSync(path.join(cacheRoot, '.node-run.'));
  chmodSync(nodeRunRoot, 0o700);
  const nodePlatform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const nodeArchitecture = process.arch === 'arm64' ? 'arm64' : 'x64';
  const nodeBin = path.join(nodeRunRoot, `node-v24.19.0-${nodePlatform}-${nodeArchitecture}`, 'bin');
  mkdirSync(nodeBin, { recursive: true, mode: 0o700 });
  const nodePath = path.join(nodeBin, 'node');
  writeFileSync(nodePath, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const toolRoot = mkdtempSync(path.join(cacheRoot, '.toolchain-run-'));
  chmodSync(toolRoot, 0o700);
  mkdirSync(path.join(toolRoot, 'home'), { mode: 0o700 });
  const env: Record<string, string> = {
    IROHA_EXPLORER_TOOLCHAIN_CACHE: cacheRoot,
  };
  installFixtureGitVerifier(toolRoot, env);
  const attestationPath = await createTairaReleaseAttestation({
    argv,
    environment: env,
    toolRoot,
    nodeExecutable: nodePath,
  });
  return { attestationPath, cacheRoot, env, nodePath, nodeRunRoot, toolRoot, argv };
}

async function baselineManifest(testFixture: Fixture) {
  return createReleaseManifest({
    distDir: testFixture.servedPath,
    packageLockPath: testFixture.packageLockPath,
    explorerRevision: explorerA,
    generatorRevision,
    sdkRevision: runtimeRevision,
    runtimeRevision,
    profileRevision: runtimeRevision,
    sdkProvenance: sdkProvenance(),
  });
}

async function initialize(testFixture: Fixture) {
  const manifest = await baselineManifest(testFixture);
  writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
  await initializeReleaseStore({
    servedPath: testFixture.servedPath,
    releasesDir: testFixture.releasesDir,
    baselineManifestPath: testFixture.baselineManifestPath,
  });
  return manifest;
}

async function startPublicServer(testFixture: Fixture, failMarker?: string, reportedRuntimeRevision = runtimeRevision) {
  const requestedPaths: string[] = [];
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    requestedPaths.push(requestUrl.pathname);
    if (request.headers.origin === explorerOrigin && testFixture.corsOrigin) {
      response.setHeader('access-control-allow-origin', testFixture.corsOrigin);
    }
    if (
      request.method === 'OPTIONS' &&
      ['/v1/explorer/blocks', '/v1/pipeline/transactions', '/v1/multisig/spec'].includes(requestUrl.pathname)
    ) {
      response.statusCode = 204;
      response.setHeader('access-control-allow-methods', testFixture.corsMethods);
      response.setHeader('access-control-allow-headers', testFixture.corsHeaders);
      response.end();
      return;
    }
    if (requestUrl.pathname === '/status') {
      if (request.headers.accept !== 'application/json') {
        response.statusCode = 406;
        response.end('JSON accept header required');
        return;
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ build: { git_commit_sha: reportedRuntimeRevision } }));
      return;
    }
    const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1));
    try {
      const contents = readFileSync(path.join(testFixture.servedPath, relativePath));
      if (failMarker && contents.toString().includes(failMarker)) {
        response.statusCode = 503;
        response.end('deliberate smoke failure');
        return;
      }
      if (relativePath.endsWith('.html')) {
        response.setHeader('content-type', 'text/html; charset=utf-8');
      }
      response.end(contents);
    } catch {
      if (requestUrl.pathname === '/accounts' && testFixture.spaFallbackMode !== 'missing') {
        const contents =
          testFixture.spaFallbackMode === 'wrong-bytes'
            ? Buffer.from('<main>wrong release</main>\n')
            : readFileSync(path.join(testFixture.servedPath, 'index.html'));
        response.setHeader(
          'content-type',
          testFixture.spaFallbackMode === 'wrong-content-type' ? 'application/octet-stream' : 'text/html; charset=utf-8'
        );
        response.end(contents);
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    statusUrl: `http://127.0.0.1:${address.port}/status`,
    requestedPaths,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release manifest', () => {
  it('is deterministic, sorted, and binds the runtime config and package lock', async () => {
    const testFixture = fixture();
    const first = await baselineManifest(testFixture);
    const second = await baselineManifest(testFixture);

    expect(serializeReleaseManifest(first)).toBe(serializeReleaseManifest(second));
    expect(first.release_id).toBe(releaseA);
    expect(first.files.map((file: { path: string }) => file.path)).toEqual([
      '_assets/app.js',
      fixtureSdkModulePath,
      '.vite/build.json',
      '.vite/manifest.json',
      'config.json',
      'index.html',
    ]);
    expect(first.runtime_config.sha256).toBe(
      first.files.find((file: { path: string }) => file.path === 'config.json')?.sha256
    );

    const legacySdkRevision = 'd'.repeat(40);
    const importedBaseline = await createReleaseManifest({
      distDir: testFixture.servedPath,
      packageLockPath: testFixture.packageLockPath,
      explorerRevision: explorerA,
      generatorRevision,
      sdkRevision: legacySdkRevision,
      runtimeRevision,
      profileRevision: legacySdkRevision,
      sdkProvenance: sdkProvenance(legacySdkRevision),
    });
    expect(importedBaseline.sdk_revision).toBe(legacySdkRevision);
    expect(importedBaseline.runtime_revision).toBe(runtimeRevision);
  });

  it('rejects modified, additional, and symlinked release content', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    await writeReleaseManifest(testFixture.servedPath, manifest);

    writeFileSync(path.join(testFixture.servedPath, 'index.html'), 'tampered');
    await expect(verifyReleaseDirectory(testFixture.servedPath, manifest)).rejects.toThrow('inventory mismatch');

    writeDist(testFixture.servedPath, 'release-a');
    writeFileSync(path.join(testFixture.servedPath, 'extra.txt'), 'unexpected');
    await expect(verifyReleaseDirectory(testFixture.servedPath, manifest)).rejects.toThrow('inventory mismatch');

    rmSync(path.join(testFixture.servedPath, 'extra.txt'));
    const target = path.join(testFixture.servedPath, '_assets/app.js');
    rmSync(target);
    symlinkSync('../index.html', target);
    await expect(verifyReleaseDirectory(testFixture.servedPath, manifest)).rejects.toThrow(
      'cannot contain symbolic links'
    );
  });

  it('rejects release trees that an unprivileged nginx worker cannot traverse or read', async () => {
    const unreadableFileFixture = fixture();
    chmodSync(path.join(unreadableFileFixture.servedPath, 'index.html'), 0o600);
    await expect(collectReleaseFiles(unreadableFileFixture.servedPath)).rejects.toThrow(
      'must be readable by the nginx worker'
    );

    const untraversableDirectoryFixture = fixture();
    chmodSync(path.join(untraversableDirectoryFixture.servedPath, '_assets'), 0o700);
    await expect(collectReleaseFiles(untraversableDirectoryFixture.servedPath)).rejects.toThrow(
      'must be traversable by the nginx worker'
    );
  });

  it('rejects unreviewed manifest and inventory fields', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    expect(() => validateReleaseManifest({ ...manifest, generated_by: 'unreviewed' })).toThrow(
      'release manifest has unexpected or missing fields'
    );
    const inventoryWithUnexpectedField = manifest.files.map((file: Record<string, unknown>) => ({
      ...file,
    }));
    inventoryWithUnexpectedField[0].source = 'unreviewed';
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        files: inventoryWithUnexpectedField,
      })
    ).toThrow('release file inventory entry has unexpected or missing fields');
  });
});

describe('operator safety gates', () => {
  it('keeps build and publication inseparable inside the exact Taira profile', () => {
    const script = readFileSync(path.resolve('ops/taira/deploy-explorer.sh'), 'utf8');
    expect(script).not.toContain('preflight');
    expect(script).not.toContain('pnpm ');
    expect(script).not.toContain('corepack');
    expect(script).toContain('exec /bin/sh "$DEFAULT_ROOT/scripts/bootstrap-exact-toolchain.sh"');
    expect(script).toContain('taira-release "$@"');
    expect(script.match(/bootstrap-exact-toolchain\.sh/gu)).toHaveLength(1);
    expect(script).not.toContain('deploy-explorer.sh "$@"');

    const tool = readFileSync(path.resolve('ops/taira/release-tool.mjs'), 'utf8');
    const deployHandler = tool.indexOf('async function runDeployCommand');
    const activeRuntimeGate = tool.indexOf('const active = await resolveActiveRelease', deployHandler);
    const isolatedBuild = tool.indexOf('withIsolatedReleaseBuild(', deployHandler);
    const publication = tool.indexOf('return deployRelease({', isolatedBuild);
    expect(deployHandler).toBeGreaterThan(0);
    expect(activeRuntimeGate).toBeGreaterThan(deployHandler);
    expect(activeRuntimeGate).toBeLessThan(isolatedBuild);
    expect(isolatedBuild).toBeGreaterThan(deployHandler);
    expect(publication).toBeGreaterThan(isolatedBuild);
  });

  it('pins every release-tool invocation to the canonical checkout that is built', () => {
    const script = readFileSync(path.resolve('ops/taira/deploy-explorer.sh'), 'utf8');
    const changeDirectory = script.indexOf('cd -- "$ROOT"');
    const canonicalizeRoot = script.indexOf('ROOT="$(pwd -P)"');
    const exportRoot = script.indexOf('export TAIRA_EXPLORER_ROOT="$ROOT"');
    const trustedPath = script.indexOf('PATH=/usr/bin:/bin:/usr/sbin:/sbin');
    const stripInjection = script.indexOf('unset CDPATH ENV BASH_ENV NODE_OPTIONS NODE_PATH');
    const exactBootstrap = script.indexOf('exec /bin/sh "$DEFAULT_ROOT/scripts/bootstrap-exact-toolchain.sh"');
    const releaseProfile = script.indexOf('taira-release "$@"');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(trustedPath).toBeGreaterThan(0);
    expect(stripInjection).toBeGreaterThan(trustedPath);
    expect(changeDirectory).toBeGreaterThan(0);
    expect(canonicalizeRoot).toBeGreaterThan(changeDirectory);
    expect(exportRoot).toBeGreaterThan(canonicalizeRoot);
    expect(exactBootstrap).toBeGreaterThan(exportRoot);
    expect(releaseProfile).toBeGreaterThan(exactBootstrap);
  });

  it('ignores caller PATH and preload injection before entering the fixed Taira profile', () => {
    const root = realpathSync(mkdtempSync(path.join(realpathSync('/tmp'), 'taira-wrapper-fixture-')));
    chmodSync(root, 0o700);
    temporaryDirectories.push(root);
    const wrapperDirectory = path.join(root, 'ops', 'taira');
    const scriptsDirectory = path.join(root, 'scripts');
    const fakeBin = path.join(root, 'fake-bin');
    mkdirSync(wrapperDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(scriptsDirectory, { mode: 0o700 });
    mkdirSync(fakeBin, { mode: 0o700 });
    const wrapper = path.join(wrapperDirectory, 'deploy-explorer.sh');
    cpSync(path.resolve('ops/taira/deploy-explorer.sh'), wrapper);
    chmodSync(wrapper, 0o700);
    const sentinel = path.join(root, 'fake-command-ran');
    for (const command of ['dirname', 'node', 'sh', 'sha256sum', 'tar', 'uname']) {
      writeFileSync(
        path.join(fakeBin, command),
        `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(command)} >> ${JSON.stringify(sentinel)}\nexit 97\n`,
        { mode: 0o700 }
      );
    }
    writeFileSync(
      path.join(scriptsDirectory, 'bootstrap-exact-toolchain.sh'),
      [
        '#!/bin/sh',
        'printf "PATH=%s\\n" "$PATH"',
        'printf "ROOT=%s\\n" "$TAIRA_EXPLORER_ROOT"',
        'printf "NODE_OPTIONS=%s\\n" "§{NODE_OPTIONS-unset}"'.replace('§', '$'),
        'printf "NODE_PATH=%s\\n" "§{NODE_PATH-unset}"'.replace('§', '$'),
        'printf "CDPATH=%s\\n" "§{CDPATH-unset}"'.replace('§', '$'),
        'printf "ENV=%s\\n" "§{ENV-unset}"'.replace('§', '$'),
        'printf "BASH_ENV=%s\\n" "§{BASH_ENV-unset}"'.replace('§', '$'),
        'for argument do printf "ARG=%s\\n" "$argument"; done',
      ].join('\n'),
      { mode: 0o700 }
    );
    const result = spawnSync('/bin/sh', [wrapper, 'verify'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH_ENV: '/attacker/bash-env',
        CDPATH: '/attacker/cdpath',
        ENV: '/attacker/env',
        NODE_OPTIONS: '--require /attacker.js',
        NODE_PATH: '/attacker/node-path',
        PATH: `${fakeBin}${path.delimiter}/usr/bin:/bin`,
      },
    });
    expect(result.status).toBe(0);
    expect(existsSync(sentinel)).toBe(false);
    expect(result.stdout).toContain('PATH=/usr/bin:/bin:/usr/sbin:/sbin');
    expect(result.stdout).toContain(`ROOT=${root}`);
    for (const variable of ['NODE_OPTIONS', 'NODE_PATH', 'CDPATH', 'ENV', 'BASH_ENV']) {
      expect(result.stdout).toContain(`${variable}=unset`);
    }
    expect(result.stdout).toContain('ARG=taira-release');
    expect(result.stdout).toContain('ARG=verify');
  });

  it('rejects direct entry even when the retired public wrapper marker is supplied', () => {
    const direct = spawnSync(process.execPath, [path.resolve('ops/taira/release-tool.mjs'), 'verify'], {
      encoding: 'utf8',
    });
    expect(direct.status).toBe(1);
    expect(direct.stderr).toContain(
      'must be invoked through ops/taira/deploy-explorer.sh and the exact-toolchain bootstrap'
    );
    const forgedMarker = spawnSync(
      process.execPath,
      [path.resolve('ops/taira/release-tool.mjs'), '--taira-release-wrapper', 'verify'],
      { encoding: 'utf8' }
    );
    expect(forgedMarker.status).toBe(1);
    expect(forgedMarker.stderr).toContain('exact-toolchain bootstrap');
  });

  it('consumes one owner-only exact-toolchain attestation bound to Node, source, and argv', async () => {
    const { attestationPath, env, nodePath, argv } = await tairaReleaseAttestation();
    const expectedGitVerifyGpg = env[TAIRA_GIT_VERIFY_GPG_ENV];
    const expectedGitVerifyGnupgHome = env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV];
    expect(lstatSync(attestationPath).mode & 0o777).toBe(0o600);
    const payload = consumeTairaReleaseAttestation({ env, argv, nodePath });
    expect(payload.schema).toBe(1);
    expect(existsSync(attestationPath)).toBe(false);
    expect(env).toEqual({
      [TAIRA_GIT_VERIFY_GNUPGHOME_ENV]: expectedGitVerifyGnupgHome,
      [TAIRA_GIT_VERIFY_GPG_ENV]: expectedGitVerifyGpg,
      IROHA_EXPLORER_TOOLCHAIN_CACHE: path.dirname(path.dirname(attestationPath)),
    });
    expect(() => consumeTairaReleaseAttestation({ env, argv })).toThrow('exact-toolchain bootstrap');
  });

  it('rejects a reusable, permissive, or argv-mismatched release attestation', async () => {
    const permissive = await tairaReleaseAttestation();
    chmodSync(permissive.attestationPath, 0o644);
    expect(() =>
      consumeTairaReleaseAttestation({
        env: permissive.env,
        argv: permissive.argv,
        nodePath: permissive.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');

    const mismatched = await tairaReleaseAttestation(['rollback', releaseA]);
    expect(() =>
      consumeTairaReleaseAttestation({
        env: mismatched.env,
        argv: ['verify'],
        nodePath: mismatched.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');
  });

  it('rejects forged attestation identity, content, filesystem, and extracted-Node provenance', async () => {
    const wrongNonce = await tairaReleaseAttestation();
    wrongNonce.env[TAIRA_RELEASE_ATTESTATION_NONCE_ENV] = 'f'.repeat(64);
    expect(() =>
      consumeTairaReleaseAttestation({
        env: wrongNonce.env,
        argv: wrongNonce.argv,
        nodePath: wrongNonce.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');

    for (const field of [
      'git_verify_gpg_sha256',
      'git_verify_signers_sha256',
      'node_sha256',
      'release_tool_sha256',
    ] as const) {
      const corrupted = await tairaReleaseAttestation();
      const payload = JSON.parse(readFileSync(corrupted.attestationPath, 'utf8'));
      payload[field] = '0'.repeat(64);
      writeFileSync(corrupted.attestationPath, `${JSON.stringify(payload)}\n`, {
        mode: 0o600,
      });
      expect(() =>
        consumeTairaReleaseAttestation({
          env: corrupted.env,
          argv: corrupted.argv,
          nodePath: corrupted.nodePath,
        })
      ).toThrow('exact-toolchain bootstrap');
    }

    const hardLinked = await tairaReleaseAttestation();
    await linkFile(hardLinked.attestationPath, path.join(hardLinked.toolRoot, 'attestation-link'));
    expect(() =>
      consumeTairaReleaseAttestation({
        env: hardLinked.env,
        argv: hardLinked.argv,
        nodePath: hardLinked.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');

    const symbolic = await tairaReleaseAttestation();
    const backingPath = path.join(symbolic.toolRoot, 'attestation-backing');
    renameSync(symbolic.attestationPath, backingPath);
    symlinkSync(backingPath, symbolic.attestationPath);
    expect(() =>
      consumeTairaReleaseAttestation({
        env: symbolic.env,
        argv: symbolic.argv,
        nodePath: symbolic.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');

    const removedStaging = await tairaReleaseAttestation();
    rmSync(removedStaging.nodeRunRoot, { recursive: true });
    expect(() =>
      consumeTairaReleaseAttestation({
        env: removedStaging.env,
        argv: removedStaging.argv,
        nodePath: removedStaging.nodePath,
      })
    ).toThrow('exact-toolchain bootstrap');

    const outsideStaging = await tairaReleaseAttestation();
    const outsideNode = path.join(path.dirname(outsideStaging.cacheRoot), 'outside-node');
    writeFileSync(outsideNode, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    unlinkSync(outsideStaging.attestationPath);
    await createTairaReleaseAttestation({
      argv: outsideStaging.argv,
      environment: outsideStaging.env,
      toolRoot: outsideStaging.toolRoot,
      nodeExecutable: outsideNode,
    });
    expect(() =>
      consumeTairaReleaseAttestation({
        env: outsideStaging.env,
        argv: outsideStaging.argv,
        nodePath: outsideNode,
      })
    ).toThrow('exact-toolchain bootstrap');

    const noncanonicalTool = await tairaReleaseAttestation();
    const linkedTool = path.join(path.dirname(noncanonicalTool.cacheRoot), 'release-tool-link');
    symlinkSync(TAIRA_RELEASE_TOOL_PATH, linkedTool);
    expect(() =>
      consumeTairaReleaseAttestation({
        env: noncanonicalTool.env,
        argv: noncanonicalTool.argv,
        nodePath: noncanonicalTool.nodePath,
        releaseToolPath: linkedTool,
      })
    ).toThrow('exact-toolchain bootstrap');
  });

  it('keeps transition adoption-only with no build, package, SDK, or network-Git path', () => {
    const tool = readFileSync(path.resolve('ops/taira/release-tool.mjs'), 'utf8');
    const transitionStart = tool.indexOf('async function runTransitionCommand');
    const transitionEnd = tool.indexOf('export async function runReleaseCommand', transitionStart);
    const transitionHandler = tool.slice(transitionStart, transitionEnd);
    expect(transitionHandler).toContain('verifyLocalMutatingCheckout');
    expect(transitionHandler).toContain('activatePreparedTransition');
    expect(transitionHandler).not.toContain('withIsolatedReleaseBuild');
    expect(transitionHandler).not.toContain('verifySdkSourceClosure');
    expect(transitionHandler).not.toContain('verifyMutatingCheckout');
    expect(transitionHandler).not.toContain("'fetch'");
    expect(transitionHandler).not.toContain("'pnpm'");
  });

  it('accepts only the canonical Explorer GitHub origin in SSH or HTTPS form', () => {
    const canonical = 'github.com/soramitsu/iroha-block-explorer-web';
    expect(normalizeExplorerRemote('git@github.com:soramitsu/iroha-block-explorer-web.git')).toBe(canonical);
    expect(normalizeExplorerRemote('ssh://git@github.com/soramitsu/iroha-block-explorer-web.git')).toBe(canonical);
    expect(normalizeExplorerRemote('https://github.com/soramitsu/iroha-block-explorer-web.git')).toBe(canonical);
    expect(normalizeExplorerRemote('git@github.com:fork/iroha-block-explorer-web.git')).toBeNull();
    expect(normalizeExplorerRemote('http://github.com/soramitsu/iroha-block-explorer-web.git')).toBeNull();
    expect(normalizeExplorerRemote('https://token@github.com/soramitsu/iroha-block-explorer-web.git')).toBeNull();
  });

  it('requires and installs the exact direct Taira operator config', async () => {
    const testFixture = fixture();
    expect(validateTairaRuntimeConfig(tairaRuntimeConfig)).toEqual(tairaRuntimeConfig);

    const operatorConfig = path.join(testFixture.root, 'operator-config.json');
    writeFileSync(operatorConfig, JSON.stringify(tairaRuntimeConfig));
    await installTairaRuntimeConfig({ configPath: operatorConfig, distDir: testFixture.nextDist });
    expect(JSON.parse(readFileSync(path.join(testFixture.nextDist, 'config.json'), 'utf8'))).toEqual(
      tairaRuntimeConfig
    );
  });

  it.each([
    ['missing config', undefined],
    ['null config', null],
    ['array config', []],
    ['string config', 'https://taira.sora.org'],
  ])('rejects %s', (_label, config) => {
    expect(() => validateTairaRuntimeConfig(config)).toThrow('must be a JSON object');
  });

  it.each([
    undefined,
    '',
    '/v1/explorer',
    'http://127.0.0.1:5175',
    'https://nexus.example.org',
    'https://taira-explorer.sora.org',
    'https://taira.sora.org/',
    'https://taira.sora.org/v1/explorer',
    'https://taira.sora.org:443',
    ' https://taira.sora.org',
  ])('rejects a noncanonical Torii endpoint %s', (toriiBaseUrl) => {
    expect(() => validateTairaRuntimeConfig({ ...tairaRuntimeConfig, toriiBaseUrl }))
      .toThrow('must be exactly https://taira.sora.org');
  });

  it.each([undefined, false, 'true'])('rejects an unforced Taira endpoint %s', (toriiForceBaseUrl) => {
    expect(() => validateTairaRuntimeConfig({ ...tairaRuntimeConfig, toriiForceBaseUrl }))
      .toThrow('toriiForceBaseUrl must be true');
  });

  it.each([
    undefined,
    '11'.repeat(32),
    'AA'.repeat(32),
    '11'.repeat(31),
    `${'11'.repeat(31)}10`,
    `hash:${'ab'.repeat(32)}#B99E`,
    `hash:${'AB'.repeat(32)}#b99E`,
    `hash:${'AB'.repeat(32)}#0000`,
    `hash:${'AB'.repeat(32)}`,
    `hash:${'10'.repeat(32)}#2B24`,
    ` ${checkedNetworkId}`,
  ])('rejects a missing or noncanonical checked NetworkId %s', (networkId) => {
    expect(() => validateTairaRuntimeConfig({ ...tairaRuntimeConfig, networkId }))
      .toThrow('exact canonical checked 32-byte Iroha NetworkId');
  });

  it.each([
    { toriiFailoverEnabled: true },
    { toriiFailoverEnabled: false },
    { toriiFailoverNodes: [] },
    { sorafsPublicBaseUrl: 'https://taira.sora.org' },
    { kotodamaCompilerUrl: 'https://compiler.example' },
    { toriiRequestTimeoutMs: 5000 },
  ])('rejects optional config outside the exact deployment profile: %j', (extraConfig) => {
    expect(() => validateTairaRuntimeConfig({ ...tairaRuntimeConfig, ...extraConfig }))
      .toThrow('unknown public fields');
  });

  it('requires authenticated network metadata to complete the tracked Taira example', () => {
    const example = JSON.parse(readFileSync(path.resolve('ops/taira/config.json.example'), 'utf8'));
    expect(() => validateTairaRuntimeConfig(example)).toThrow('exact canonical checked 32-byte Iroha NetworkId');
    expect(validateTairaRuntimeConfig({ ...example, networkId: checkedNetworkId })).toEqual(tairaRuntimeConfig);
  });

  it('rejects secret-shaped unknown config, unsafe permissions, in-tree files, and symlinks', async () => {
    const testFixture = fixture();
    const validConfig = tairaRuntimeConfig;
    expect(() =>
      validateTairaRuntimeConfig({
        ...validConfig,
        analyticsApiKey: 'must-never-be-public',
      })
    ).toThrow('unknown public fields');

    const operatorConfig = path.join(testFixture.root, 'operator-config.json');
    writeFileSync(operatorConfig, `${JSON.stringify(validConfig)}\n`, { mode: 0o600 });
    await expect(
      readOperatorRuntimeConfig(operatorConfig, {
        forbiddenRoots: [testFixture.root],
      })
    ).rejects.toThrow('must be outside');

    chmodSync(operatorConfig, 0o620);
    await expect(readOperatorRuntimeConfig(operatorConfig)).rejects.toThrow('must not be group- or world-writable');
    chmodSync(operatorConfig, 0o600);

    const linkedConfig = path.join(testFixture.root, 'linked-config.json');
    symlinkSync(operatorConfig, linkedConfig);
    await expect(readCanonicalRegularFileSnapshot(linkedConfig, 'Operator runtime config')).rejects.toThrow(
      'canonical regular file'
    );
    await expect(readOperatorRuntimeConfig(linkedConfig)).rejects.toThrow('canonical regular file');
  });

  it('rejects broad path targets and requires sibling dist/releases paths', () => {
    const testFixture = fixture();
    expect(
      validateReleasePaths({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
      })
    ).toEqual({
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
    });
    expect(() => validateReleasePaths({ servedPath: '/dist', releasesDir: '/releases' })).toThrow(
      'broad Taira release parent'
    );
    expect(() =>
      validateReleasePaths({
        servedPath: `${testFixture.root}/nested/../dist`,
        releasesDir: `${testFixture.root}/nested/../releases`,
      })
    ).toThrow('must already be normalized');
    expect(() =>
      validateReleasePaths({
        servedPath: testFixture.servedPath,
        releasesDir: path.join(testFixture.root, 'other', 'releases'),
      })
    ).toThrow('must be siblings');
  });

  it('rejects release parents that traverse symbolic links', async () => {
    const testFixture = fixture();
    const realParent = path.join(testFixture.root, 'real-parent');
    const linkedParent = path.join(testFixture.root, 'linked-parent');
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, 'dir');
    await expect(
      validateCanonicalReleasePaths({
        servedPath: path.join(linkedParent, 'dist'),
        releasesDir: path.join(linkedParent, 'releases'),
      })
    ).rejects.toThrow('must be a real directory');
  });

  it('requires deployment-owned, non-writable release parents and stores', async () => {
    const parentFixture = fixture();
    chmodSync(parentFixture.root, 0o777);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: parentFixture.servedPath,
        releasesDir: parentFixture.releasesDir,
      })
    ).rejects.toThrow('must not be group- or world-writable');
    chmodSync(parentFixture.root, 0o711);

    const ancestorFixture = fixture();
    const nestedParent = path.join(ancestorFixture.root, 'nested', 'deployment');
    mkdirSync(nestedParent, { recursive: true });
    chmodSync(nestedParent, 0o711);
    chmodSync(ancestorFixture.root, 0o700);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: path.join(nestedParent, 'dist'),
        releasesDir: path.join(nestedParent, 'releases'),
      })
    ).rejects.toThrow(`Taira public path ancestor must be traversable by the nginx worker: ${ancestorFixture.root}`);

    const storeFixture = fixture();
    mkdirSync(storeFixture.releasesDir, { mode: 0o777 });
    chmodSync(storeFixture.releasesDir, 0o777);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: storeFixture.servedPath,
        releasesDir: storeFixture.releasesDir,
      })
    ).rejects.toThrow('Taira release store must not be group- or world-writable');

    const listableStoreFixture = fixture();
    mkdirSync(listableStoreFixture.releasesDir, { mode: 0o755 });
    chmodSync(listableStoreFixture.releasesDir, 0o755);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: listableStoreFixture.servedPath,
        releasesDir: listableStoreFixture.releasesDir,
      })
    ).rejects.toThrow('Taira release store must have exact mode 0711');

    const specialModeStoreFixture = fixture();
    mkdirSync(specialModeStoreFixture.releasesDir, { mode: 0o711 });
    chmodSync(specialModeStoreFixture.releasesDir, 0o1711);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: specialModeStoreFixture.servedPath,
        releasesDir: specialModeStoreFixture.releasesDir,
      })
    ).rejects.toThrow('Taira release store must have exact mode 0711');

    const untraversableStoreFixture = fixture();
    mkdirSync(untraversableStoreFixture.releasesDir, { mode: 0o700 });
    chmodSync(untraversableStoreFixture.releasesDir, 0o700);
    await expect(
      validateCanonicalReleasePaths({
        servedPath: untraversableStoreFixture.servedPath,
        releasesDir: untraversableStoreFixture.releasesDir,
      })
    ).rejects.toThrow('Taira release store must have exact mode 0711');

    if (typeof process.geteuid === 'function') {
      const foreignFixture = fixture();
      const actualUid = process.geteuid();
      const uid = vi.spyOn(process, 'geteuid').mockReturnValue(actualUid + 1);
      try {
        await expect(
          validateCanonicalReleasePaths({
            servedPath: foreignFixture.servedPath,
            releasesDir: foreignFixture.releasesDir,
          })
        ).rejects.toThrow('must be owned by the deployment account');
      } finally {
        uid.mockRestore();
      }
    }
  });

  it('rejects writable release-tree entries before baseline cutover', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const writableFile = path.join(testFixture.servedPath, 'index.html');
    chmodSync(writableFile, 0o666);

    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
      })
    ).rejects.toThrow('must not be group- or world-writable');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.releasesDir, manifest.release_id))).toBe(false);
  });

  it('accepts only an nginx server block whose Taira root is the served symlink', () => {
    const testFixture = fixture();
    const valid = `
server {
  listen 443 ssl;
  server_name taira-explorer.sora.org;
  root ${testFixture.servedPath};
  index index.html;
  location / { try_files $uri /index.html; }
}`;
    const validWithRedirect = `
server {
  listen 80;
  listen [::]:80;
  server_name taira.sora.org taira-explorer.sora.org;
  location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type "text/plain";
  }
  location / {
    return 301 https://$host$request_uri;
  }
}
${valid}`;
    const validSpa = valid.replace('try_files $uri /index.html', 'try_files $uri $uri/ /index.html');
    expect(
      verifyNginxRoot(validSpa, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toBe(testFixture.servedPath);
    expect(
      verifyNginxRoot(validSpa.replace('listen 443 ssl;', 'listen 443 ssl;\n  listen [::]:443 ssl;'), {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toBe(testFixture.servedPath);
    for (const unreviewedListeners of [
      'listen 443;',
      'listen [::]:443;',
      'listen 443 ssl;\n  listen 80;',
      'listen 443 ssl http2;',
    ]) {
      expect(() =>
        verifyNginxRoot(validSpa.replace('listen 443 ssl;', unreviewedListeners), {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow('exactly one TLS content-serving block');
    }
    expect(
      verifyNginxRoot(validWithRedirect.replace('try_files $uri /index.html', 'try_files $uri $uri/ /index.html'), {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toBe(testFixture.servedPath);
    expect(() =>
      verifyNginxRoot(validSpa.replace(testFixture.servedPath, '/var/www/wrong'), {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('does not match');
    expect(() =>
      verifyNginxRoot(validSpa, {
        host: 'other.example.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('exactly one TLS content-serving block');

    expect(() =>
      verifyNginxRoot(valid, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('try_files $uri $uri/ /index.html');

    const nestedRootOnly = validSpa
      .replace(`  root ${testFixture.servedPath};\n`, '')
      .replace('location / {', `location / { root ${testFixture.servedPath};`);
    expect(() =>
      verifyNginxRoot(nestedRootOnly, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('exactly one top-level root');

    for (const override of ['root /var/www/nested;', 'alias /var/www/nested/;']) {
      const nestedOverride = validSpa.replace(
        'location / { try_files $uri $uri/ /index.html; }',
        `location / { ${override} try_files $uri $uri/ /index.html; }`
      );
      expect(() =>
        verifyNginxRoot(nestedOverride, {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow('must not override root');
    }

    for (const alternateHandler of [
      'proxy_pass http://old-explorer;',
      'fastcgi_pass unix:/run/explorer.sock;',
      'uwsgi_pass unix:/run/explorer.sock;',
      'scgi_pass 127.0.0.1:9000;',
      'grpc_pass grpc://old-explorer;',
      'rewrite ^ /old-explorer/index.html last;',
      'return 302 https://old-explorer.example.org$request_uri;',
      'content_by_lua_block { ngx.say("old explorer") }',
    ]) {
      const alternateContent = validSpa.replace(
        'location / { try_files $uri $uri/ /index.html; }',
        `location / { ${alternateHandler} }`
      );
      expect(() =>
        verifyNginxRoot(alternateContent, {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow('alternate content directives are not allowed');
    }

    for (const quotedDirective of [
      '"proxy_pass" http://old-explorer;',
      "'alias' /var/www/old-explorer/;",
      '"include" /etc/nginx/snippets/old-explorer.conf;',
      "'return' 302 https://old-explorer.example.org;",
    ]) {
      const quotedDirectiveBypass = validSpa.replace(
        'location / { try_files $uri $uri/ /index.html; }',
        `location / { ${quotedDirective} }`
      );
      expect(() =>
        verifyNginxRoot(quotedDirectiveBypass, {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow('must not use quoted directive names');
    }

    for (const obscuredServerName of ['"server"', 'ser\\ver']) {
      const obscuredDuplicateServer = `
${validSpa}
${obscuredServerName} {
  listen 443 ssl;
  server_name taira-explorer.sora.org;
  root ${testFixture.servedPath};
  location / { proxy_pass http://old-explorer; }
}`;
      expect(() =>
        verifyNginxRoot(obscuredDuplicateServer, {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow('must not use quoted or escaped directive names');
    }

    const separatedIncludedOverride = `
server {
  listen 443 ssl;
  server_name taira-explorer.sora.org;
  root ${testFixture.servedPath};
  include /etc/nginx/snippets/taira-explorer-routing.conf;
}
# configuration file /etc/nginx/snippets/taira-explorer-routing.conf:
location / { alias /var/www/old-explorer/; }
`;
    expect(() =>
      verifyNginxRoot(separatedIncludedOverride, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('must not use include directives');

    expect(() =>
      verifyNginxRoot(`${validSpa}\n${validSpa.replace(testFixture.servedPath, '/var/www/wrong')}`, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('exactly one TLS content-serving block');

    const quotedBraceBypass = `
server {
  listen 443 ssl;
  server_name taira-explorer.sora.org;
  root ${testFixture.servedPath};
  add_header X-Debug "}";
  location / { proxy_pass http://old-explorer; }
}`;
    expect(() =>
      verifyNginxRoot(quotedBraceBypass, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('alternate content directives');

    const escapedQuoteBypass = `
server {
  listen 443 ssl;
  server_name taira-explorer.sora.org;
  root ${testFixture.servedPath};
  add_header X-Debug \\";
  location / { proxy_pass http://old-explorer; }
}`;
    expect(() =>
      verifyNginxRoot(escapedQuoteBypass, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toThrow('alternate content directives');

    const quotedCommentAndEscapedQuote = validSpa.replace(
      'location / { try_files $uri $uri/ /index.html; }',
      'add_header X-Debug "escaped \\" brace } # literal";\n' +
        '  # ignored comment with } and proxy_pass http://old-explorer;\n' +
        '  location / { try_files $uri $uri/ /index.html; }'
    );
    expect(quotedCommentAndEscapedQuote).toContain('X-Debug');
    expect(
      verifyNginxRoot(quotedCommentAndEscapedQuote, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toBe(testFixture.servedPath);

    const escapedStructuralCharacters = validSpa.replace(
      'location / { try_files $uri $uri/ /index.html; }',
      'add_header X-Debug escaped\\{brace\\}\\#hash\\;semi;\n  location / { try_files $uri $uri/ /index.html; }'
    );
    expect(
      verifyNginxRoot(escapedStructuralCharacters, {
        host: 'taira-explorer.sora.org',
        servedPath: testFixture.servedPath,
      })
    ).toBe(testFixture.servedPath);

    for (const malformed of [
      validSpa.replace('location /', 'add_header X-Debug "unterminated;\n  location /'),
      `${validSpa}\\`,
    ]) {
      expect(() =>
        verifyNginxRoot(malformed, {
          host: 'taira-explorer.sora.org',
          servedPath: testFixture.servedPath,
        })
      ).toThrow(/unterminated|trailing escape/u);
    }
  });

  it('reads an explicit nginx dump only from an owned immutable regular file', async () => {
    const testFixture = fixture();
    const dump = path.join(testFixture.root, 'nginx.conf');
    writeFileSync(dump, 'server { listen 443; }\n', { mode: 0o600 });
    await expect(nginxConfigDump({ TAIRA_NGINX_CONFIG_DUMP: dump })).resolves.toBe('server { listen 443; }\n');

    chmodSync(dump, 0o620);
    await expect(nginxConfigDump({ TAIRA_NGINX_CONFIG_DUMP: dump })).rejects.toThrow(
      'must not be group- or world-writable'
    );
    chmodSync(dump, 0o600);

    if (typeof process.geteuid === 'function') {
      const actualUid = process.geteuid();
      const uid = vi.spyOn(process, 'geteuid').mockReturnValue(actualUid + 1);
      try {
        await expect(nginxConfigDump({ TAIRA_NGINX_CONFIG_DUMP: dump })).rejects.toThrow(
          'must be owned by the deployment account'
        );
      } finally {
        uid.mockRestore();
      }
    }

    const linkedDump = path.join(testFixture.root, 'nginx-linked.conf');
    symlinkSync(dump, linkedDump);
    await expect(nginxConfigDump({ TAIRA_NGINX_CONFIG_DUMP: linkedDump })).rejects.toThrow('canonical regular file');
  });
});

describe('release command dispatch', () => {
  it('rejects an invalid Node runtime before selecting a command', async () => {
    await expect(
      runReleaseCommand({
        argv: ['verify'],
        nodeVersion: '24.18.0',
      })
    ).rejects.toThrow('Node 24.19.0 is required, found 24.18.0');
  });

  it('rejects an unknown command before dispatch', async () => {
    await expect(
      runReleaseCommand({
        argv: ['publish'],
        nodeVersion: '24.19.0',
      })
    ).rejects.toThrow('Unknown release command: publish');
  });

  it('rejects invalid command arity before dispatch', async () => {
    await expect(
      runReleaseCommand({
        argv: ['verify', 'unexpected'],
        nodeVersion: '24.19.0',
      })
    ).rejects.toThrow('Usage: verify');
    await expect(
      runReleaseCommand({
        argv: ['rollback'],
        nodeVersion: '24.19.0',
      })
    ).rejects.toThrow('Usage: rollback <exact-release-id>');
  });

  it('dispatches manifest generation only after its required input gate', async () => {
    await expect(
      runReleaseCommand({
        argv: ['manifest'],
        env: {},
        nodeVersion: '24.19.0',
      })
    ).rejects.toThrow('TAIRA_EXPLORER_REVISION is required');
  });
});

describe('isolated release build boundary', () => {
  it('requires exact Node and pnpm patches and runs the full build in a sterile worktree', async () => {
    expect(assertReleaseNodeVersion('v24.19.0')).toBe('24.19.0');
    expect(() => assertReleaseNodeVersion('24.19.1')).toThrow('Node 24.19.0 is required');

    const testFixture = fixture();
    const commands: Array<{ command: string; args: string[]; env: Record<string, string> }> = [];
    const runCommandFn = (
      command: string,
      args: string[],
      options: { cwd: string; env: Record<string, string>; capture?: boolean }
    ) => {
      commands.push({ command, args, env: options.env });
      if (command === 'git' && args.includes('worktree') && args.includes('add')) {
        mkdirSync(args.at(-2)!, { recursive: true });
        return '';
      }
      if (command === 'git' && args[0] === 'rev-parse') return `${explorerA}\n`;
      if (command === 'git' && args[0] === 'status') return '';
      if (command === 'node' && args[0] === '--version') return 'v24.19.0\n';
      if (command === 'pnpm' && args[0] === '--version') return '10.11.0\n';
      if (command === 'pnpm' && args[0] === 'build') {
        writeDist(path.join(options.cwd, 'dist'), 'isolated-build');
      }
      return '';
    };
    const result = await withIsolatedReleaseBuild(
      {
        repositoryRoot: testFixture.root,
        explorerRevision: explorerA,
      },
      async ({ repositoryRoot, distDir }) => {
        expect(path.dirname(distDir)).toBe(repositoryRoot);
        expect(readFileSync(path.join(distDir, 'index.html'), 'utf8')).toContain('isolated-build');
        return 'built-and-consumed';
      },
      {
        nodeVersion: '24.19.0',
        runCommandFn,
      }
    );
    expect(result).toBe('built-and-consumed');
    expect(commands.filter(({ command }) => command === 'pnpm').map(({ args }) => args)).toEqual([
      ['--version'],
      ['fetch', '--frozen-lockfile', '--store-dir', expect.any(String)],
      ['install', '--offline', '--frozen-lockfile', '--store-dir', expect.any(String)],
      ['build'],
      ['check:bundle'],
    ]);
    const worktreeAdd = commands.find(
      ({ command, args }) => command === 'git' && args.includes('worktree') && args.includes('add')
    );
    expect(worktreeAdd?.args.slice(0, 5)).toEqual([
      '-c',
      expect.stringMatching(/^core\.hooksPath=.+\/empty-hooks$/u),
      'worktree',
      'add',
      '--detach',
    ]);
    expect(commands).toContainEqual(
      expect.objectContaining({
        command: 'git',
        args: ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'],
      })
    );
    for (const { env } of commands) {
      expect(env).not.toHaveProperty('VITE_SECRET');
      expect(env).not.toHaveProperty('TAIRA_RUNTIME_CONFIG');
      expect(env).not.toHaveProperty('NODE_OPTIONS');
      expect(env).not.toHaveProperty('HTTP_PROXY');
      expect(env).not.toHaveProperty('NODE_EXTRA_CA_CERTS');
      expect(env.NPM_CONFIG_USERCONFIG).toMatch(/\.npmrc$/u);
    }

    await expect(
      withIsolatedReleaseBuild(
        {
          repositoryRoot: testFixture.root,
          explorerRevision: explorerA,
        },
        async () => undefined,
        {
          nodeVersion: '24.19.1',
          runCommandFn,
        }
      )
    ).rejects.toThrow('Node 24.19.0 is required');

    await expect(
      withIsolatedReleaseBuild(
        {
          repositoryRoot: testFixture.root,
          explorerRevision: explorerA,
        },
        async () => undefined,
        {
          nodeVersion: '24.19.0',
          runCommandFn: (
            command: string,
            args: string[],
            options: { cwd: string; env: Record<string, string>; capture?: boolean }
          ) => {
            if (command === 'git' && args.includes('worktree') && args.includes('add')) {
              mkdirSync(args.at(-2)!, { recursive: true });
              return '';
            }
            if (command === 'node') return 'v24.19.0\n';
            if (command === 'pnpm' && args[0] === '--version') return '10.11.1\n';
            return runCommandFn(command, args, options);
          },
        }
      )
    ).rejects.toThrow('pnpm 10.11.0 is required');
  });

  it.each([
    ['untracked', '?? .npmrc'],
    ['ignored', '!! .pnpmfile.cjs'],
  ])('rejects %s hook-injected package input before pnpm runs', async (_kind, injectedStatus) => {
    const testFixture = fixture();
    const commands: Array<{ command: string; args: string[] }> = [];
    await expect(
      withIsolatedReleaseBuild(
        {
          repositoryRoot: testFixture.root,
          explorerRevision: explorerA,
        },
        async () => undefined,
        {
          nodeVersion: '24.19.0',
          runCommandFn: (command: string, args: string[]) => {
            commands.push({ command, args });
            if (command === 'git' && args.includes('worktree') && args.includes('add')) {
              mkdirSync(args.at(-2)!, { recursive: true });
              return '';
            }
            if (command === 'git' && args[0] === 'rev-parse') return `${explorerA}\n`;
            if (command === 'git' && args.includes('--ignored=matching')) {
              return `${injectedStatus}\n`;
            }
            return '';
          },
        }
      )
    ).rejects.toThrow(`Isolated release build contains unsigned files:\n${injectedStatus}`);
    expect(commands.some(({ command }) => command === 'pnpm')).toBe(false);
  });

  it('does not inherit deployment, frontend, registry, proxy, TLS, or Node injection variables', () => {
    const env = sanitizedReleaseBuildEnvironment(
      {
        PATH: '/audited/bin',
        LANG: 'host-locale',
        VITE_SECRET: 'secret',
        TAIRA_RUNTIME_CONFIG: '/secret/config.json',
        NODE_OPTIONS: '--require attacker.js',
        NODE_PATH: '/attacker',
        NPM_CONFIG_REGISTRY: 'https://attacker.invalid',
        NPM_TOKEN: 'secret',
        HTTP_PROXY: 'http://proxy.invalid',
        NODE_EXTRA_CA_CERTS: '/attacker.pem',
        SSL_CERT_FILE: '/attacker.pem',
      },
      '/isolated/build'
    );
    expect(env).toEqual({
      BROWSERSLIST_IGNORE_OLD_DATA: '1',
      CI: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      HOME: '/isolated/build/home',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      NPM_CONFIG_GLOBALCONFIG: '/isolated/build/.npmrc',
      NPM_CONFIG_USERCONFIG: '/isolated/build/.npmrc',
      PATH: `${path.dirname(process.execPath)}${path.delimiter}/audited/bin`,
      TMPDIR: '/isolated/build/tmp',
      TZ: 'UTC',
      XDG_CACHE_HOME: '/isolated/build/xdg-cache',
      XDG_CONFIG_HOME: '/isolated/build/xdg-config',
      XDG_DATA_HOME: '/isolated/build/xdg-data',
      npm_config_cache: '/isolated/build/npm-cache',
    });
  });
});

describe('release store lifecycle', () => {
  it('requires browser-authorized status reads and a cataloged Explorer preflight', async () => {
    const testFixture = fixture();
    const urls = await startPublicServer(testFixture);
    await expect(fetchRuntimeRevision(urls.statusUrl)).resolves.toBe(runtimeRevision);
    expect(urls.requestedPaths).toEqual([
      '/status',
      '/v1/explorer/blocks',
      '/v1/pipeline/transactions',
      '/v1/multisig/spec',
    ]);
  });

  it.each([
    ['missing', ''],
    ['wrong', 'https://wrong-explorer.example'],
  ])('rejects %s Torii browser-origin authorization', async (_case, corsOrigin) => {
    const testFixture = fixture();
    testFixture.corsOrigin = corsOrigin;
    const urls = await startPublicServer(testFixture);
    await expect(fetchRuntimeRevision(urls.statusUrl)).rejects.toThrow(
      `must authorize browser origin ${explorerOrigin}`
    );
  });

  it.each([
    ['GET method', 'corsMethods', 'POST, OPTIONS', 'CORS preflight must allow GET'],
    ['Accept header', 'corsHeaders', 'content-type', 'CORS preflight must allow the Accept header'],
    ['POST method', 'corsMethods', 'GET, OPTIONS', 'CORS preflight must allow POST'],
    ['Content-Type header', 'corsHeaders', 'accept', 'CORS preflight must allow the Content-Type header'],
  ] as const)('rejects an Explorer preflight without the required %s', async (_case, field, value, error) => {
    const testFixture = fixture();
    testFixture[field] = value;
    const urls = await startPublicServer(testFixture);
    await expect(fetchRuntimeRevision(urls.statusUrl)).rejects.toThrow(error);
  });

  it.each(['X-Iroha-Account', 'X-Iroha-Signature', 'X-Iroha-Timestamp-Ms', 'X-Iroha-Nonce', 'X-Iroha-Witness'])(
    'rejects canonical-auth preflight without the %s header',
    async (missingHeader) => {
      const testFixture = fixture();
      testFixture.corsHeaders = testFixture.corsHeaders
        .split(', ')
        .filter((header) => header !== missingHeader.toLowerCase())
        .join(', ');
      const urls = await startPublicServer(testFixture);
      await expect(fetchRuntimeRevision(urls.statusUrl)).rejects.toThrow(
        `CORS preflight must allow the ${missingHeader} header`
      );
    }
  );

  it('smokes the public root and a history-mode deep route as the exact active SPA shell', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(path.join(testFixture.servedPath, 'release-manifest.json'), serializeReleaseManifest(manifest));
    const urls = await startPublicServer(testFixture);
    await expect(verifyPublicRelease({ ...urls, manifest })).resolves.toEqual(manifest);
    expect(urls.requestedPaths).toContain('/');
    expect(urls.requestedPaths).toContain('/accounts');
  });

  it.each([
    ['missing fallback', 'missing', 'returned HTTP 404'],
    ['wrong shell bytes', 'wrong-bytes', 'exact active index.html SPA shell'],
    ['wrong content type', 'wrong-content-type', 'SPA shell as text/html'],
  ] as const)('rejects a public deep route with %s', async (_case, mode, error) => {
    const testFixture = fixture();
    testFixture.spaFallbackMode = mode;
    const manifest = await baselineManifest(testFixture);
    writeFileSync(path.join(testFixture.servedPath, 'release-manifest.json'), serializeReleaseManifest(manifest));
    const urls = await startPublicServer(testFixture);
    await expect(verifyPublicRelease({ ...urls, manifest })).rejects.toThrow(error);
  });

  it('fails closed when an uninitialized live directory contains reserved release metadata', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const reserved = path.join(testFixture.servedPath, 'release-manifest.json');
    writeFileSync(reserved, 'pre-existing operator data\n');
    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
      })
    ).rejects.toThrow('must not contain reserved release-manifest.json');
    expect(readFileSync(reserved, 'utf8')).toBe('pre-existing operator data\n');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
  });

  it('imports an audited directory once and refuses deployment before initialization', async () => {
    const uninitialized = fixture();
    const urls = await startPublicServer(uninitialized);
    await expect(
      deployRelease({
        distDir: uninitialized.nextDist,
        packageLockPath: uninitialized.packageLockPath,
        servedPath: uninitialized.servedPath,
        releasesDir: uninitialized.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow('initialized release symlink');
    expect(lstatSync(uninitialized.servedPath).isDirectory()).toBe(true);

    const testFixture = fixture();
    const manifest = await initialize(testFixture);
    expect(lstatSync(testFixture.servedPath).isSymbolicLink()).toBe(true);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
    expect(statSync(testFixture.releasesDir).mode & 0o777).toBe(0o711);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).manifest).toEqual(manifest);

    const repeatedUrls = await startPublicServer(testFixture);
    const repeated = await initializeReleaseStore({
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      baselineManifestPath: testFixture.baselineManifestPath,
      ...repeatedUrls,
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(repeated.alreadyInitialized).toBe(true);
    expect(repeatedUrls.requestedPaths).toContain('/release-manifest.json');
  });

  it('treats initialization as idempotent only for the exact supplied baseline', async () => {
    const testFixture = fixture();
    const manifest = await initialize(testFixture);
    const differentIdentity = {
      ...manifest,
      release_id: releaseB,
      explorer_revision: explorerB,
    };

    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifest: differentIdentity,
      })
    ).rejects.toThrow(`not supplied reviewed baseline ${releaseB}`);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);

    writeFileSync(testFixture.baselineManifestPath, 'not a canonical manifest\n');
    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
      })
    ).rejects.toThrow();
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
  });

  it('verifies reviewed baseline bytes from the real release directory on every initialization', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const publicFiles = manifest.files.filter((file) => file.path !== 'config.json');
    const inspectedRoots: string[] = [];
    const verifyReviewedBaselineInventoryFn = vi.fn(async (root: string) => {
      const stats = lstatSync(root);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
      inspectedRoots.push(root);
      return { files: publicFiles };
    });
    const options = {
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      baselineManifestPath: testFixture.baselineManifestPath,
      reviewedBaselineInventoryPath: path.join(testFixture.root, 'reviewed-inventory.json'),
      operations: { verifyReviewedBaselineInventoryFn },
    };

    await initializeReleaseStore(options);
    const repeated = await initializeReleaseStore(options);

    expect(repeated.alreadyInitialized).toBe(true);
    expect(inspectedRoots).toEqual([testFixture.servedPath, path.join(testFixture.releasesDir, releaseA)]);
  });

  it('atomically deploys A to B and rolls B back to the retained A release', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);

    const deployed = await deployRelease({
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(deployed.releaseId).toBe(releaseB);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseB);
    expect(urls.requestedPaths).toContain('/.vite/build.json');
    const reconciled = await deployRelease({
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(reconciled.adoptedExisting).toBe(true);

    const rolledBack = await rollbackRelease({
      releaseId: releaseA,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      currentRuntimeRevision: runtimeRevision,
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(rolledBack.previousReleaseId).toBe(releaseB);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseA);
  });

  it('smoke-checks an already-active rollback target instead of returning success early', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture, 'release-a');
    await expect(
      rollbackRelease({
        releaseId: releaseA,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        currentRuntimeRevision: runtimeRevision,
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow('Public release verification failed');
    expect(urls.requestedPaths).toContain('/release-manifest.json');
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
  });

  it('automatically restores the previous release when post-cutover smoke checks fail', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    writeDist(testFixture.nextDist, 'FAIL_SMOKE');
    const urls = await startPublicServer(testFixture, 'FAIL_SMOKE');

    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toBeInstanceOf(DeploymentRolledBackError);

    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseA);
    expect(lstatSync(path.join(testFixture.releasesDir, releaseB)).isDirectory()).toBe(true);
  });

  it('reports a commit-uncertain cutover when the pointer rename succeeds but parent sync fails', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const releaseTarget = path.join(testFixture.releasesDir, releaseB);
    cpSync(testFixture.nextDist, releaseTarget, { recursive: true });
    const manifest = await createReleaseManifest({
      distDir: releaseTarget,
      packageLockPath: testFixture.packageLockPath,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      previousReleaseId: releaseA,
    });
    await writeReleaseManifest(releaseTarget, manifest);

    await expect(
      atomicSwitchRelease({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        releaseId: releaseB,
        syncDirectoryFn: async () => {
          throw new Error('injected sync failure');
        },
      })
    ).rejects.toBeInstanceOf(CutoverCommitUncertainError);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseB);
  });
});

describe('durability and transaction recovery', () => {
  it('rejects a live release root whose inode changes after inspection', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const operatorConfigPath = path.join(testFixture.root, 'operator-config.json');
    writeFileSync(operatorConfigPath, `${JSON.stringify(tairaRuntimeConfig)}\n`, {
      mode: 0o600,
    });
    const displaced = path.join(testFixture.root, 'displaced-dist');

    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        replacementConfigPath: operatorConfigPath,
        operations: {
          installRuntimeConfigFn: async ({ distDir }: { distDir: string }) => {
            renameSync(distDir, displaced);
            cpSync(displaced, distDir, { recursive: true });
          },
        },
      })
    ).rejects.toThrow('changed identity during the release transaction');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.releasesDir, manifest.release_id))).toBe(false);
  });

  it('cleans temporary files before rename and reports uncertainty after rename', async () => {
    const testFixture = fixture();
    const target = path.join(testFixture.root, 'durable.json');
    await expect(
      writeFileDurably(target, 'first\n', {
        renameFn: async () => {
          throw new Error('injected rename failure');
        },
      })
    ).rejects.toThrow('injected rename failure');
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(testFixture.root).some((entry) => entry.includes('.durable.json.'))).toBe(false);

    await expect(
      writeFileDurably(target, 'second\n', {
        syncDirectoryFn: async () => {
          throw new Error('injected directory sync failure');
        },
      })
    ).rejects.toBeInstanceOf(DurableCommitUncertainError);
    expect(readFileSync(target, 'utf8')).toBe('second\n');
    expect(readdirSync(testFixture.root).some((entry) => entry.includes('.durable.json.'))).toBe(false);
  });

  it('rejects an invalid explicit durable-file mode before creating a temporary file', async () => {
    const testFixture = fixture();
    const target = path.join(testFixture.root, 'invalid-mode.json');
    await expect(writeFileDurably(target, 'contents\n', { mode: 0o10000 })).rejects.toThrow(
      'Durable file mode must be an integer between 0000 and 07777'
    );
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(testFixture.root).some((entry) => entry.includes('.invalid-mode.json.'))).toBe(false);
  });

  it('cleans owned temp files after write, sync, and close failures and syncs their parent', async () => {
    for (const failurePoint of ['write', 'sync', 'close'] as const) {
      const testFixture = fixture();
      const target = path.join(testFixture.root, `${failurePoint}.json`);
      const primary = new Error(`injected ${failurePoint} failure`);
      let directorySyncs = 0;
      const openFn = async (...args: Parameters<typeof openFile>) => {
        const realHandle = await openFile(...args);
        return {
          stat: () => realHandle.stat(),
          writeFile: async (...writeArgs: Parameters<typeof realHandle.writeFile>) => {
            if (failurePoint === 'write') throw primary;
            return realHandle.writeFile(...writeArgs);
          },
          sync: async () => {
            if (failurePoint === 'sync') throw primary;
            return realHandle.sync();
          },
          close: async () => {
            await realHandle.close();
            if (failurePoint === 'close') throw primary;
          },
        };
      };
      let thrown: unknown;
      try {
        await writeFileDurably(target, 'contents\n', {
          openFn,
          syncDirectoryFn: async () => {
            directorySyncs += 1;
          },
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(primary);
      expect(readdirSync(testFixture.root).some((entry) => entry.includes(`.${failurePoint}.json.`))).toBe(false);
      expect(directorySyncs).toBe(1);
    }
  });

  it('never removes an unowned temp-name collision or a path replaced after open', async () => {
    const collisionFixture = fixture();
    const collisionTarget = path.join(collisionFixture.root, 'collision.json');
    const deterministicRandom = Buffer.alloc(6, 0xab);
    const collisionPath = path.join(
      collisionFixture.root,
      `.collision.json.${process.pid}.${deterministicRandom.toString('hex')}.tmp`
    );
    writeFileSync(collisionPath, 'unowned collision\n');
    let removeCalls = 0;
    await expect(
      writeFileDurably(collisionTarget, 'new\n', {
        randomBytesFn: () => deterministicRandom,
        removeFn: async () => {
          removeCalls += 1;
        },
      })
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(removeCalls).toBe(0);
    expect(readFileSync(collisionPath, 'utf8')).toBe('unowned collision\n');

    const replacedFixture = fixture();
    const replacedTarget = path.join(replacedFixture.root, 'replaced.json');
    const primary = new Error('injected write failure after replacement');
    let temporaryPath = '';
    const openFn = async (...args: Parameters<typeof openFile>) => {
      temporaryPath = String(args[0]);
      const realHandle = await openFile(...args);
      return {
        stat: () => realHandle.stat(),
        writeFile: async () => {
          unlinkSync(temporaryPath);
          writeFileSync(temporaryPath, 'replacement owned elsewhere\n');
          throw primary;
        },
        sync: () => realHandle.sync(),
        close: () => realHandle.close(),
      };
    };
    let thrown: (Error & { cleanupErrors?: Error[] }) | null = null;
    try {
      await writeFileDurably(replacedTarget, 'new\n', { openFn });
    } catch (error) {
      thrown = error as Error & { cleanupErrors?: Error[] };
    }
    expect(thrown).toBe(primary);
    expect(thrown?.cleanupErrors?.[0]?.message).toContain('ownership changed');
    expect(readFileSync(temporaryPath, 'utf8')).toBe('replacement owned elsewhere\n');
  });

  it('preserves the primary pre-rename failure when cleanup also fails', async () => {
    const testFixture = fixture();
    const target = path.join(testFixture.root, 'cleanup-failure.json');
    const primary = new Error('injected rename failure');
    const cleanup = new Error('injected temp removal failure');
    let thrown: (Error & { cleanupErrors?: Error[] }) | null = null;
    try {
      await writeFileDurably(target, 'contents\n', {
        renameFn: async () => {
          throw primary;
        },
        removeFn: async () => {
          throw cleanup;
        },
      });
    } catch (error) {
      thrown = error as Error & { cleanupErrors?: Error[] };
    }
    expect(thrown).toBe(primary);
    expect(thrown?.cleanupErrors).toEqual([cleanup]);
  });

  it('publishes audited manifests atomically without replacing any existing directory entry', async () => {
    const regularFixture = fixture();
    const regularOutput = path.join(regularFixture.root, 'reviewed-manifest.json');
    writeFileSync(regularOutput, 'operator-owned regular file\n');
    await expect(publishFileDurablyNoReplace(regularOutput, 'new manifest\n')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(readFileSync(regularOutput, 'utf8')).toBe('operator-owned regular file\n');

    const danglingFixture = fixture();
    const danglingOutput = path.join(danglingFixture.root, 'reviewed-manifest.json');
    symlinkSync('missing-operator-target', danglingOutput);
    await expect(publishFileDurablyNoReplace(danglingOutput, 'new manifest\n')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(lstatSync(danglingOutput).isSymbolicLink()).toBe(true);
    expect(readlinkSync(danglingOutput)).toBe('missing-operator-target');

    const racingFixture = fixture();
    const racingOutput = path.join(racingFixture.root, 'reviewed-manifest.json');
    await expect(
      publishFileDurablyNoReplace(racingOutput, 'new manifest\n', {
        linkFn: async (source: string, destination: string) => {
          writeFileSync(destination, 'concurrent winner\n');
          await linkFile(source, destination);
        },
      })
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readFileSync(racingOutput, 'utf8')).toBe('concurrent winner\n');
    expect(readdirSync(racingFixture.root).some((entry) => entry.endsWith('.publish'))).toBe(false);

    const successFixture = fixture();
    const successOutput = path.join(successFixture.root, 'reviewed-manifest.json');
    await publishFileDurablyNoReplace(successOutput, 'canonical manifest\n');
    expect(readFileSync(successOutput, 'utf8')).toBe('canonical manifest\n');
    expect(readdirSync(successFixture.root).some((entry) => entry.endsWith('.publish'))).toBe(false);
  });

  it('requires a pre-existing canonical manifest parent and durably syncs publication changes', async () => {
    const testFixture = fixture();
    const missingParent = path.join(testFixture.root, 'missing', 'reviewed-manifest.json');
    await expect(publishBaselineManifestOutput(missingParent, 'canonical manifest\n')).rejects.toThrow(
      'Manifest output directory must already exist'
    );
    expect(existsSync(path.dirname(missingParent))).toBe(false);

    const realParent = path.join(testFixture.root, 'real-reviewed');
    const linkedParent = path.join(testFixture.root, 'linked-reviewed');
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, 'dir');
    await expect(
      publishBaselineManifestOutput(path.join(linkedParent, 'reviewed-manifest.json'), 'canonical manifest\n')
    ).rejects.toThrow('Manifest output directory must be a real directory');

    const outputParent = path.join(testFixture.root, 'reviewed');
    const output = path.join(outputParent, 'reviewed-manifest.json');
    mkdirSync(outputParent);
    const syncedDirectories: string[] = [];
    await publishBaselineManifestOutput(output, 'canonical manifest\n', {
      syncDirectoryFn: async (directory: string) => {
        syncedDirectories.push(directory);
      },
    });
    expect(readFileSync(output, 'utf8')).toBe('canonical manifest\n');
    expect(syncedDirectories).toEqual([outputParent, outputParent]);
  });

  it('durably restores the original baseline directory after a pre-publication fault', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    let syncCalls = 0;
    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        operations: {
          syncDirectoryFn: async () => {
            syncCalls += 1;
            if (syncCalls === 1) throw new Error('injected initial move sync failure');
          },
        },
      })
    ).rejects.toThrow('injected initial move sync failure');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.releasesDir, releaseA))).toBe(false);
    expect(existsSync(path.join(testFixture.root, '.taira-release.lock'))).toBe(false);
  });

  it('removes partial release metadata and restores after a manifest-publication fault', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        operations: {
          writeReleaseManifestFn: async (releaseDirectory: string) => {
            writeFileSync(path.join(releaseDirectory, 'release-manifest.json'), 'partial');
            throw new Error('injected manifest publication failure');
          },
        },
      })
    ).rejects.toThrow('injected manifest publication failure');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.servedPath, 'release-manifest.json'))).toBe(false);
    expect(existsSync(path.join(testFixture.releasesDir, releaseA))).toBe(false);
  });

  it('validates replacement config before creating the store or touching the live config', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const operatorConfigPath = path.join(testFixture.root, 'invalid-taira-config.json');
    writeFileSync(operatorConfigPath, '{"toriiBaseUrl":"https://wrong.example","toriiForceBaseUrl":true}\n', {
      mode: 0o600,
    });
    const liveConfigPath = path.join(testFixture.servedPath, 'config.json');
    chmodSync(liveConfigPath, 0o644);
    const originalConfig = readFileSync(liveConfigPath);
    const originalStats = lstatSync(liveConfigPath);

    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        replacementConfigPath: operatorConfigPath,
      })
    ).rejects.toThrow('must be exactly https://taira.sora.org');

    const finalStats = lstatSync(liveConfigPath);
    expect(readFileSync(liveConfigPath)).toEqual(originalConfig);
    expect({ dev: finalStats.dev, ino: finalStats.ino, mode: finalStats.mode & 0o777 }).toEqual({
      dev: originalStats.dev,
      ino: originalStats.ino,
      mode: 0o644,
    });
    expect(existsSync(testFixture.releasesDir)).toBe(false);
    expect(existsSync(path.join(testFixture.root, '.taira-release.lock'))).toBe(false);
  });

  it('restores exact config bytes and mode under umask 077, then publishes readable files', async () => {
    const testFixture = fixture();
    const expectedDist = path.join(testFixture.root, 'expected-baseline');
    cpSync(testFixture.servedPath, expectedDist, { recursive: true });
    const operatorConfigPath = path.join(testFixture.root, 'taira-config.json');
    writeFileSync(
      operatorConfigPath,
      `${JSON.stringify(
        {
          toriiBaseUrl: 'https://taira.sora.org',
          toriiForceBaseUrl: true,
          networkId: checkedNetworkId,
          networkPrefix: 369,
        },
        null,
        2
      )}\n`
    );
    await installTairaRuntimeConfig({ configPath: operatorConfigPath, distDir: expectedDist });
    const manifest = await createReleaseManifest({
      distDir: expectedDist,
      packageLockPath: testFixture.packageLockPath,
      explorerRevision: explorerA,
      generatorRevision,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
    });
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const liveConfigPath = path.join(testFixture.servedPath, 'config.json');
    chmodSync(liveConfigPath, 0o444);
    const originalConfig = readFileSync(liveConfigPath);

    const childScript = `
      import assert from 'node:assert/strict';
      import { readFileSync, statSync } from 'node:fs';
      import path from 'node:path';
      import { initializeReleaseStore } from ${JSON.stringify(path.resolve('ops/taira/release-tool.mjs'))};

      const servedPath = ${JSON.stringify(testFixture.servedPath)};
      const releasesDir = ${JSON.stringify(testFixture.releasesDir)};
      const baselineManifestPath = ${JSON.stringify(testFixture.baselineManifestPath)};
      const replacementConfigPath = ${JSON.stringify(operatorConfigPath)};
      const originalConfig = readFileSync(path.join(servedPath, 'config.json'));
      process.umask(0o077);
      let failure = null;
      try {
        await initializeReleaseStore({
          servedPath,
          releasesDir,
          baselineManifestPath,
          replacementConfigPath,
          operations: {
            writeReleaseManifestFn: async () => {
              throw new Error('injected failure after config replacement');
            },
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.match(String(failure?.message), /injected failure after config replacement/u);
      assert.deepEqual(readFileSync(path.join(servedPath, 'config.json')), originalConfig);
      assert.equal(statSync(path.join(servedPath, 'config.json')).mode & 0o777, 0o444);

      const initialized = await initializeReleaseStore({
        servedPath,
        releasesDir,
        baselineManifestPath,
        replacementConfigPath,
      });
      assert.equal(initialized.releaseId, ${JSON.stringify(releaseA)});
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(initialized.target, 'config.json'), 'utf8')),
        JSON.parse(readFileSync(replacementConfigPath, 'utf8')),
      );
      assert.equal(statSync(path.join(initialized.target, 'config.json')).mode & 0o777, 0o644);
      assert.equal(
        statSync(path.join(initialized.target, 'release-manifest.json')).mode & 0o777,
        0o644,
      );
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', childScript], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(child.status, child.stderr).toBe(0);
    expect(readFileSync(liveConfigPath)).not.toEqual(originalConfig);
  });

  it('restores operator config when its rename commits but parent sync fails', async () => {
    const testFixture = fixture();
    const expectedDist = path.join(testFixture.root, 'expected-uncertain-baseline');
    cpSync(testFixture.servedPath, expectedDist, { recursive: true });
    const operatorConfigPath = path.join(testFixture.root, 'uncertain-taira-config.json');
    writeFileSync(
      operatorConfigPath,
      `${JSON.stringify(
        {
          toriiBaseUrl: 'https://taira.sora.org',
          toriiForceBaseUrl: true,
          networkId: checkedNetworkId,
          networkPrefix: 369,
        },
        null,
        2
      )}\n`
    );
    await installTairaRuntimeConfig({ configPath: operatorConfigPath, distDir: expectedDist });
    const manifest = await createReleaseManifest({
      distDir: expectedDist,
      packageLockPath: testFixture.packageLockPath,
      explorerRevision: explorerA,
      generatorRevision,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
    });
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const originalConfig = readFileSync(path.join(testFixture.servedPath, 'config.json'));

    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        replacementConfigPath: operatorConfigPath,
        operations: {
          installRuntimeConfigFn: async (installOptions: {
            configPath: string;
            distDir: string;
            forbiddenRoots?: string[];
          }) =>
            installTairaRuntimeConfig(installOptions, {
              writeFileDurablyFn: (filePath: string, contents: string) =>
                writeFileDurably(filePath, contents, {
                  syncDirectoryFn: async () => {
                    throw new Error('injected config parent-sync failure');
                  },
                }),
            }),
        },
      })
    ).rejects.toBeInstanceOf(DurableCommitUncertainError);

    expect(readFileSync(path.join(testFixture.servedPath, 'config.json'))).toEqual(originalConfig);
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.releasesDir, manifest.release_id))).toBe(false);
  });

  it('restores the original baseline layout when initialization public smoke fails', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(testFixture.baselineManifestPath, serializeReleaseManifest(manifest));
    const urls = await startPublicServer(testFixture, 'release-a');
    await expect(
      initializeReleaseStore({
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        baselineManifestPath: testFixture.baselineManifestPath,
        ...urls,
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow('Public release verification failed');
    expect(urls.requestedPaths).toContain('/release-manifest.json');
    expect(lstatSync(testFixture.servedPath).isDirectory()).toBe(true);
    expect(existsSync(path.join(testFixture.servedPath, 'release-manifest.json'))).toBe(false);
  });

  it('reconciles and adopts an exact immutable release after store-sync uncertainty', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
        operations: {
          syncDirectoryFn: async () => {
            throw new Error('injected release-store sync failure');
          },
        },
      })
    ).rejects.toBeInstanceOf(ReleasePublicationUncertainError);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseA);
    expect(existsSync(path.join(testFixture.releasesDir, releaseB))).toBe(true);

    const adopted = await deployRelease({
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(adopted.adoptedExisting).toBe(true);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseB);
  });

  it('resyncs and reverifies an adopted release and fsyncs its store before cutover', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    const deployment = {
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      verification: { attempts: 1, delayMs: 0 },
    };
    await expect(
      deployRelease({
        ...deployment,
        operations: {
          syncDirectoryFn: async () => {
            throw new Error('injected release-store sync failure');
          },
        },
      })
    ).rejects.toBeInstanceOf(ReleasePublicationUncertainError);

    const releaseTarget = path.join(testFixture.releasesDir, releaseB);
    let storeSyncCalls = 0;
    await expect(
      deployRelease({
        ...deployment,
        operations: {
          syncTreeFn: async () => {
            writeFileSync(path.join(releaseTarget, 'index.html'), 'changed during target resync\n');
          },
          syncDirectoryFn: async () => {
            storeSyncCalls += 1;
          },
        },
      })
    ).rejects.toThrow('inventory mismatch');
    expect(storeSyncCalls).toBe(0);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);

    writeFileSync(path.join(releaseTarget, 'index.html'), '<main>release-b</main>\n');
    const durabilityOrder: string[] = [];
    const adopted = await deployRelease({
      ...deployment,
      operations: {
        syncTreeFn: async (target: string) => {
          expect(target).toBe(releaseTarget);
          expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
          durabilityOrder.push('target-tree-sync');
        },
        syncDirectoryFn: async (directory: string) => {
          expect(directory).toBe(testFixture.releasesDir);
          expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
          durabilityOrder.push('release-store-sync');
        },
      },
    });
    expect(adopted.adoptedExisting).toBe(true);
    expect(durabilityOrder).toEqual(['target-tree-sync', 'release-store-sync']);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseB);
  });

  it('refuses to adopt an immutable target unless its canonical manifest and files are exact', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
        operations: {
          syncDirectoryFn: async () => {
            throw new Error('injected release-store sync failure');
          },
        },
      })
    ).rejects.toBeInstanceOf(ReleasePublicationUncertainError);
    writeFileSync(path.join(testFixture.releasesDir, releaseB, 'index.html'), 'tampered');
    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow('inventory mismatch');
  });

  it('rejects deploy and rollback when either retained side is incompatible with the current runtime', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    const otherRuntime = 'd'.repeat(40);
    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: otherRuntime,
        runtimeRevision: otherRuntime,
        profileRevision: otherRuntime,
        sdkProvenance: sdkProvenance(otherRuntime),
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toBeInstanceOf(RuntimeTransitionIntentRequiredError);
    await expect(
      rollbackRelease({
        releaseId: releaseA,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        currentRuntimeRevision: otherRuntime,
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow('Rollback release expects Torii');
  });

  it('requires exact explicit operator intent for a coupled runtime transition', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const nextRuntime = 'd'.repeat(40);
    const predecessorUrls = await startPublicServer(testFixture, undefined, runtimeRevision);
    const nextRelease = `${explorerB.slice(0, 12)}-${nextRuntime.slice(0, 12)}`;
    const transition = {
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: nextRuntime,
      runtimeRevision: nextRuntime,
      profileRevision: nextRuntime,
      sdkProvenance: sdkProvenance(nextRuntime),
      verification: { attempts: 1, delayMs: 0 },
    };
    await expect(deployRelease(transition)).rejects.toBeInstanceOf(RuntimeTransitionIntentRequiredError);
    await expect(
      prepareTransitionRelease({
        ...transition,
        runtimeTransitionFrom: 'e'.repeat(40),
        currentRuntimeRevision: runtimeRevision,
      })
    ).rejects.toBeInstanceOf(RuntimeTransitionIntentRequiredError);
    const prepared = await prepareTransitionRelease({
      ...transition,
      runtimeTransitionFrom: runtimeRevision,
      currentRuntimeRevision: runtimeRevision,
    });
    expect(prepared.releaseId).toBe(nextRelease);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseA);
    expect(predecessorUrls.requestedPaths).toEqual([]);

    const targetUrls = await startPublicServer(testFixture, undefined, nextRuntime);
    const deployed = await activatePreparedTransition({
      releaseId: nextRelease,
      expectedManifest: prepared.manifest,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...targetUrls,
      currentRuntimeRevision: nextRuntime,
      runtimeTransitionFrom: runtimeRevision,
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(deployed.previousReleaseId).toBe(releaseA);
    expect(
      (await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).manifest.runtime_revision
    ).toBe(nextRuntime);
  });

  it('never automatically restores an incompatible Explorer and requires Torii-first recovery', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    writeDist(testFixture.nextDist, 'FAIL_TRANSITION');
    const nextRuntime = 'd'.repeat(40);
    const nextRelease = `${explorerB.slice(0, 12)}-${nextRuntime.slice(0, 12)}`;
    const prepared = await prepareTransitionRelease({
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: nextRuntime,
      runtimeRevision: nextRuntime,
      profileRevision: nextRuntime,
      sdkProvenance: sdkProvenance(nextRuntime),
      runtimeTransitionFrom: runtimeRevision,
      currentRuntimeRevision: runtimeRevision,
    });
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
    const newRuntimeUrls = await startPublicServer(testFixture, 'FAIL_TRANSITION', nextRuntime);
    let transitionError: CoupledRuntimeRollbackRequiredError | null = null;
    try {
      await activatePreparedTransition({
        releaseId: nextRelease,
        expectedManifest: prepared.manifest,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...newRuntimeUrls,
        currentRuntimeRevision: nextRuntime,
        runtimeTransitionFrom: runtimeRevision,
        verification: { attempts: 1, delayMs: 0 },
      });
    } catch (error) {
      transitionError = error as CoupledRuntimeRollbackRequiredError;
    }
    expect(transitionError).toBeInstanceOf(CoupledRuntimeRollbackRequiredError);
    expect(transitionError).toMatchObject({
      failedReleaseId: nextRelease,
      failedRuntimeRevision: nextRuntime,
      previousReleaseId: releaseA,
      previousRuntimeRevision: runtimeRevision,
    });
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(nextRelease);

    await expect(
      rollbackRelease({
        releaseId: releaseA,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...newRuntimeUrls,
        currentRuntimeRevision: nextRuntime,
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow(`Rollback release expects Torii ${runtimeRevision}`);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(nextRelease);

    const oldRuntimeUrls = await startPublicServer(testFixture, undefined, runtimeRevision);
    const recovered = await rollbackRelease({
      releaseId: releaseA,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...oldRuntimeUrls,
      currentRuntimeRevision: runtimeRevision,
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(recovered.previousReleaseId).toBe(nextRelease);
    expect((await resolveActiveRelease(testFixture.servedPath, testFixture.releasesDir)).releaseId).toBe(releaseA);
  });

  it('gives an executable transition path when predecessor smoke fails during coupled recovery', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    writeDist(testFixture.nextDist, 'FAIL_NEW_RUNTIME');
    const nextRuntime = 'd'.repeat(40);
    const nextRelease = `${explorerB.slice(0, 12)}-${nextRuntime.slice(0, 12)}`;
    const preparation = {
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: nextRuntime,
      runtimeRevision: nextRuntime,
      profileRevision: nextRuntime,
      sdkProvenance: sdkProvenance(nextRuntime),
      runtimeTransitionFrom: runtimeRevision,
      currentRuntimeRevision: runtimeRevision,
    };
    const prepared = await prepareTransitionRelease(preparation);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
    const failingNewRuntimeUrls = await startPublicServer(testFixture, 'FAIL_NEW_RUNTIME', nextRuntime);
    await expect(
      activatePreparedTransition({
        releaseId: nextRelease,
        expectedManifest: prepared.manifest,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...failingNewRuntimeUrls,
        currentRuntimeRevision: nextRuntime,
        runtimeTransitionFrom: runtimeRevision,
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toBeInstanceOf(CoupledRuntimeRollbackRequiredError);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(nextRelease);

    const failingOldRuntimeUrls = await startPublicServer(testFixture, 'release-a', runtimeRevision);
    let recoveryError: CoupledRuntimeRollbackRequiredError | null = null;
    try {
      await rollbackRelease({
        releaseId: releaseA,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...failingOldRuntimeUrls,
        currentRuntimeRevision: runtimeRevision,
        verification: { attempts: 1, delayMs: 0 },
      });
    } catch (error) {
      recoveryError = error as CoupledRuntimeRollbackRequiredError;
    }
    expect(recoveryError).toBeInstanceOf(CoupledRuntimeRollbackRequiredError);
    expect(recoveryError).toMatchObject({
      failedReleaseId: releaseA,
      failedRuntimeRevision: runtimeRevision,
      previousReleaseId: nextRelease,
      previousRuntimeRevision: nextRuntime,
      recoveryAction: 'transition',
      recoveryRuntimeRevision: nextRuntime,
      recoveryReleaseId: nextRelease,
      runtimeTransitionFrom: runtimeRevision,
    });
    expect(recoveryError?.message).toContain(`TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION=${runtimeRevision}`);
    expect(recoveryError?.message).toContain(`ops/taira/deploy-explorer.sh transition ${nextRelease}`);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);

    const healthyNewRuntimeUrls = await startPublicServer(testFixture, undefined, nextRuntime);
    const recovered = await activatePreparedTransition({
      releaseId: nextRelease,
      expectedManifest: prepared.manifest,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...healthyNewRuntimeUrls,
      currentRuntimeRevision: nextRuntime,
      runtimeTransitionFrom: runtimeRevision,
      verification: { attempts: 1, delayMs: 0 },
    });
    expect(recovered.releaseId).toBe(nextRelease);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(nextRelease);
  }, 15_000);

  it('removes staging on a publication rename failure and rejects a symlinked dist source', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    const deployment = {
      distDir: testFixture.nextDist,
      packageLockPath: testFixture.packageLockPath,
      servedPath: testFixture.servedPath,
      releasesDir: testFixture.releasesDir,
      ...urls,
      explorerRevision: explorerB,
      generatorRevision: explorerB,
      sdkRevision: runtimeRevision,
      runtimeRevision,
      profileRevision: runtimeRevision,
      sdkProvenance: sdkProvenance(),
      verification: { attempts: 1, delayMs: 0 },
    };
    await expect(
      deployRelease({
        ...deployment,
        operations: {
          renameFn: async () => {
            throw new Error('injected publication rename failure');
          },
        },
      })
    ).rejects.toThrow('injected publication rename failure');
    expect(readdirSync(testFixture.releasesDir).some((entry) => entry.startsWith('.staging-'))).toBe(false);

    const linkedDist = path.join(testFixture.root, 'linked-next-dist');
    symlinkSync(testFixture.nextDist, linkedDist, 'dir');
    await expect(deployRelease({ ...deployment, distDir: linkedDist })).rejects.toThrow(
      'Release dist must be a real directory'
    );
  });

  it('enforces bundle budgets on release-store staging bytes before manifest publication', async () => {
    const testFixture = fixture();
    await initialize(testFixture);
    const urls = await startPublicServer(testFixture);
    writeFileSync(
      path.join(testFixture.root, 'bundle-budgets.json'),
      `${JSON.stringify({
        ...fixtureBundleBudgets,
        default_chunk_gzip_bytes: 1,
      })}\n`
    );
    await expect(
      deployRelease({
        distDir: testFixture.nextDist,
        packageLockPath: testFixture.packageLockPath,
        servedPath: testFixture.servedPath,
        releasesDir: testFixture.releasesDir,
        ...urls,
        explorerRevision: explorerB,
        generatorRevision: explorerB,
        sdkRevision: runtimeRevision,
        runtimeRevision,
        profileRevision: runtimeRevision,
        sdkProvenance: sdkProvenance(),
        verification: { attempts: 1, delayMs: 0 },
      })
    ).rejects.toThrow(/FAIL chunk\s+index\.html: \d+ \/ 1 gzip bytes[\s\S]*Bundle budget check failed/u);
    expect(path.basename(readlinkSync(testFixture.servedPath))).toBe(releaseA);
    expect(existsSync(path.join(testFixture.releasesDir, releaseB))).toBe(false);
    expect(readdirSync(testFixture.releasesDir).some((entry) => entry.startsWith('.staging-'))).toBe(false);
  });

  it('holds an owner-only exclusive lock through a whole transaction', async () => {
    const testFixture = fixture();
    let releaseFirst!: () => void;
    let markStarted!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const first = withReleaseLock({ releasesDir: testFixture.releasesDir }, async () => {
      const lockPath = path.join(testFixture.root, '.taira-release.lock');
      const lock = statSync(lockPath);
      expect(lock.isDirectory()).toBe(true);
      expect(lock.mode & 0o777).toBe(0o700);
      const leases = readdirSync(lockPath);
      expect(leases).toHaveLength(1);
      expect(leases[0]).toMatch(/\.lease$/u);
      expect(statSync(path.join(lockPath, leases[0])).mode & 0o777).toBe(0o600);
      markStarted();
      await firstMayFinish;
      return 'done';
    });
    await started;
    await expect(
      withReleaseLock({ releasesDir: testFixture.releasesDir }, async () => 'should-not-run')
    ).rejects.toThrow('Another Taira release transaction owns');
    releaseFirst();
    await expect(first).resolves.toBe('done');
    expect(existsSync(path.join(testFixture.root, '.taira-release.lock'))).toBe(false);
  });

  it('preserves action plus every safe lock cleanup failure', async () => {
    const testFixture = fixture();
    const actionFailure = new Error('injected action failure');
    const closeFailure = new Error('injected close failure');
    const removeFailure = new Error('injected remove failure');
    const syncFailure = new Error('injected cleanup sync failure');
    let removeCalls = 0;
    let directorySyncs = 0;
    let thrown: AggregateError | null = null;
    try {
      await withReleaseLock(
        { releasesDir: testFixture.releasesDir },
        async () => {
          throw actionFailure;
        },
        {
          openFn: async () => ({
            writeFile: async () => {},
            sync: async () => {},
            close: async () => {
              throw closeFailure;
            },
          }),
          removeTokenFn: async () => {
            removeCalls += 1;
            throw removeFailure;
          },
          syncDirectoryFn: async () => {
            directorySyncs += 1;
            if (directorySyncs === 3) throw syncFailure;
          },
        }
      );
    } catch (error) {
      thrown = error as AggregateError;
    }
    expect(removeCalls).toBe(1);
    expect(directorySyncs).toBe(3);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown?.errors).toEqual([actionFailure, closeFailure, removeFailure, syncFailure]);
    expect(thrown?.cause).toBe(actionFailure);
  });

  it('classifies lock removal whose parent sync is uncertain without losing action failure', async () => {
    const testFixture = fixture();
    const actionFailure = new Error('injected action failure');
    const syncFailure = new Error('injected post-removal sync failure');
    let directorySyncs = 0;
    let thrown: ReleaseLockRemovalUncertainError | null = null;
    try {
      await withReleaseLock(
        { releasesDir: testFixture.releasesDir },
        async () => {
          throw actionFailure;
        },
        {
          openFn: async () => ({
            writeFile: async () => {},
            sync: async () => {},
            close: async () => {},
          }),
          removeTokenFn: async () => {},
          rmdirFn: async () => {},
          syncDirectoryFn: async () => {
            directorySyncs += 1;
            if (directorySyncs === 3) throw syncFailure;
          },
        }
      );
    } catch (error) {
      thrown = error as ReleaseLockRemovalUncertainError;
    }
    expect(thrown).toBeInstanceOf(ReleaseLockRemovalUncertainError);
    expect(thrown?.actionError).toBe(actionFailure);
    expect(thrown?.errors).toEqual([actionFailure, syncFailure]);
  });

  it('cannot remove a replacement lease installed deterministically during owner cleanup', async () => {
    const testFixture = fixture();
    const lockPath = path.join(testFixture.root, '.taira-release.lock');
    const replacementLease = path.join(lockPath, 'replacement-owner-b.lease');
    const actionFailure = new Error('owner A action failed before cleanup replacement');
    let thrown: AggregateError | null = null;
    try {
      await withReleaseLock(
        { releasesDir: testFixture.releasesDir },
        async () => {
          throw actionFailure;
        },
        {
          removeTokenFn: async (tokenPath: string) => {
            unlinkSync(tokenPath);
            rmdirSync(lockPath);
            mkdirSync(lockPath, { mode: 0o700 });
            writeFileSync(replacementLease, 'replacement owner B\n', { mode: 0o600 });
          },
        }
      );
    } catch (error) {
      thrown = error as AggregateError;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown?.errors[0]).toBe(actionFailure);
    expect((thrown?.errors[1] as Error).message).toContain('directory identity changed');
    expect(readFileSync(replacementLease, 'utf8')).toBe('replacement owner B\n');
    await expect(withReleaseLock({ releasesDir: testFixture.releasesDir }, async () => 'must not run')).rejects.toThrow(
      'Another Taira release transaction owns'
    );
  });
});

describe('closed provenance and canonical inputs', () => {
  it.each(['G', 'U'])('accepts an exact OpenPGP signer with Git status %s', (status) => {
    const calls: Array<{ args: string[]; environment: NodeJS.ProcessEnv }> = [];
    const git = (_root: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      calls.push({ args, environment: options?.env ?? {} });
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'verify-commit') return '';
      if (args[0] === 'show') return expectedOpenPgpIdentity(status);
      throw new Error(`unexpected signature verifier call: ${args.join(' ')}`);
    };

    const source = {
      ...process.env,
      GIT_DIR: '/attacker/repository',
      GIT_OBJECT_DIRECTORY: '/attacker/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/attacker/alternate-objects',
      GIT_EXEC_PATH: '/attacker/git-exec',
      GIT_CONFIG_PARAMETERS: "'gpg.format'='ssh'",
      LD_PRELOAD: '/attacker/preload.so',
      DYLD_INSERT_LIBRARIES: '/attacker/preload.dylib',
      DYLD_LIBRARY_PATH: '/attacker/lib',
      HTTP_PROXY: 'http://attacker.invalid',
      HTTPS_PROXY: 'http://attacker.invalid',
      ALL_PROXY: 'socks5://attacker.invalid',
      GIT_SSL_CAINFO: '/attacker/ca.pem',
      NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
      SSL_CERT_FILE: '/attacker/ca.pem',
    };
    expect(verifyGitCommitSignature('/fixture/repository', explorerA, { git, source })).toBe(explorerA);
    expect(calls.map(({ args }) => args)).toEqual([
      ['cat-file', 'commit', explorerA],
      ['verify-commit', explorerA],
      ['show', '--no-patch', '--format=%G?%x00%GF%x00%GP', explorerA],
    ]);
    for (const { environment } of calls) {
      expect(environment).toMatchObject({
        GIT_CONFIG_COUNT: '9',
        GIT_CONFIG_KEY_0: 'gpg.program',
        GIT_CONFIG_KEY_4: 'gpg.format',
        GIT_CONFIG_VALUE_4: 'openpgp',
        GIT_CONFIG_KEY_5: 'gpg.openpgp.program',
        GIT_CONFIG_VALUE_5: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
        GIT_NO_REPLACE_OBJECTS: '1',
        GNUPGHOME: process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
      });
      for (const unsafe of [
        'GIT_DIR',
        'GIT_OBJECT_DIRECTORY',
        'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_EXEC_PATH',
        'GIT_CONFIG_PARAMETERS',
        'LD_PRELOAD',
        'DYLD_INSERT_LIBRARIES',
        'DYLD_LIBRARY_PATH',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'GIT_SSL_CAINFO',
        'NODE_EXTRA_CA_CERTS',
        'SSL_CERT_FILE',
      ]) {
        expect(environment).not.toHaveProperty(unsafe);
      }
    }
  });

  it.each(['SSH SIGNATURE', 'SIGNED MESSAGE'])(
    'rejects a cryptographically accepted %s commit before invoking its verifier',
    (signatureArmor) => {
      const calls: string[][] = [];
      const git = (_root: string, args: string[]) => {
        calls.push(args);
        if (args[0] === 'cat-file') return openPgpCommitObject(signatureArmor);
        if (args[0] === 'verify-commit') return '';
        if (args[0] === 'show') return expectedOpenPgpIdentity();
        throw new Error(`unexpected signature verifier call: ${args.join(' ')}`);
      };

      expect(() => verifyGitCommitSignature('/fixture/repository', explorerA, { git })).toThrow(
        'signature must use OpenPGP armor'
      );
      expect(calls).toEqual([['cat-file', 'commit', explorerA]]);
    }
  );

  it.each([
    [
      'missing signature',
      openPgpCommitObject()
        .split('\n')
        .filter((_line, index) => index < 3 || index > 5)
        .join('\n'),
      'exactly one OpenPGP signature',
    ],
    [
      'duplicate signatures',
      [...openPgpCommitObject().split('\n').slice(0, 6), ...openPgpCommitObject().split('\n').slice(3)].join('\n'),
      'exactly one OpenPGP signature',
    ],
    [
      'gpgsig-sha256 header',
      openPgpCommitObject().replace('\ngpgsig ', '\ngpgsig-sha256 '),
      'signature must use OpenPGP armor',
    ],
    [
      'malformed armor terminator',
      openPgpCommitObject().replace(' -----END PGP SIGNATURE-----', ' malformed-signature-terminator'),
      'signature must use OpenPGP armor',
    ],
  ])('rejects a commit object with %s', (_case, commitObject, expectedError) => {
    const calls: string[][] = [];
    const git = (_root: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'cat-file') return commitObject;
      throw new Error(`unexpected signature verifier call: ${args.join(' ')}`);
    };

    expect(() => verifyGitCommitSignature('/fixture/repository', explorerA, { git })).toThrow(expectedError);
    expect(calls).toEqual([['cat-file', 'commit', explorerA]]);
  });

  it('rejects a valid, locally trusted OpenPGP signature from the wrong signer', () => {
    const wrongFingerprint = 'A'.repeat(40);
    const git = (_root: string, args: string[]) => {
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'verify-commit') return '';
      if (args[0] === 'show') return `G\0${wrongFingerprint}\0${wrongFingerprint}\n`;
      throw new Error(`unexpected signature verifier call: ${args.join(' ')}`);
    };

    expect(() => verifyGitCommitSignature('/fixture/repository', explorerA, { git })).toThrow(
      `exact Taira release signer ${TAIRA_RELEASE_SIGNER_FINGERPRINT}`
    );
  });

  it.each([
    ['B', TAIRA_RELEASE_SIGNER_FINGERPRINT, TAIRA_RELEASE_SIGNER_FINGERPRINT],
    ['G', TAIRA_RELEASE_SIGNER_FINGERPRINT, 'B'.repeat(40)],
    ['G', TAIRA_RELEASE_SIGNER_FINGERPRINT, ''],
  ])('rejects invalid or ambiguous OpenPGP identity tuple %#', (status, signer, primary) => {
    const git = (_root: string, args: string[]) => {
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'verify-commit') return '';
      if (args[0] === 'show') return `${status}\0${signer}\0${primary}\n`;
      throw new Error(`unexpected signature verifier call: ${args.join(' ')}`);
    };

    expect(() => verifyGitCommitSignature('/fixture/repository', explorerA, { git })).toThrow();
  });

  it.skipIf(!runGpgIntegration)('verifies the actual signed HEAD with the generated public-only keyring', async () => {
    const integrationRoot = realpathSync(
      mkdtempSync(path.join(realpathSync('/tmp'), 'taira-release-gpg-integration-'))
    );
    temporaryDirectories.push(integrationRoot);
    chmodSync(integrationRoot, 0o700);
    mkdirSync(path.join(integrationRoot, 'home'), { mode: 0o700 });
    const environment: Record<string, string> = {};
    await prepareTairaGitVerification({ environment, toolRoot: integrationRoot });
    const repositoryRoot = path.resolve(import.meta.dirname, '../..');
    const source = {
      HOME: path.join(integrationRoot, 'home'),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      [TAIRA_GIT_VERIFY_GPG_ENV]: environment[TAIRA_GIT_VERIFY_GPG_ENV],
      [TAIRA_GIT_VERIFY_GNUPGHOME_ENV]: environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
    };
    expect(verifyGitCommitSignature(repositoryRoot, 'HEAD', { source })).toBe('HEAD');
  });

  it('keeps the live release store out of checkout cleanliness while retaining its independent gates', () => {
    const repositoryRoot = path.resolve(import.meta.dirname, '../..');
    const ignored = spawnSync('git', ['check-ignore', '--no-index', '--quiet', 'releases/.release-tool-contract'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });

    expect(ignored.status).toBe(0);
    expect(readFileSync(path.join(repositoryRoot, '.dockerignore'), 'utf8').split(/\r?\n/u)).toContain('/releases/');
  });

  function fakeExplorerGit({
    head,
    master,
    ancestor = true,
    headAfterVerification = head,
  }: {
    head: string,
    master: string,
    ancestor?: boolean,
    headAfterVerification?: string,
  }) {
    const calls: string[][] = [];
    const environments: NodeJS.ProcessEnv[] = [];
    let headReads = 0;
    const git = (_root: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      calls.push(args);
      environments.push(options?.env ?? {});
      if (args[0] === 'config') return 'https://github.com/soramitsu/iroha-block-explorer-web.git\n';
      if (args[0] === 'fetch' || args[0] === 'verify-commit') return '';
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'show') return expectedOpenPgpIdentity();
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-parse' && args.at(-1) === 'HEAD^{commit}') {
        const revision = headReads === 0 ? head : headAfterVerification;
        headReads += 1;
        return `${revision}\n`;
      }
      if (args[0] === 'rev-parse') return `${master}\n`;
      if (args[0] === 'merge-base') {
        if (!ancestor) throw new Error('not an ancestor');
        return '';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    };
    return { git, calls, environments };
  }

  it('freshly fetches canonical origin/master and requires final HEAD to equal it', () => {
    const testFixture = fixture();
    const matching = fakeExplorerGit({ head: explorerA, master: explorerA });
    const source = {
      ...process.env,
      GIT_DIR: '/attacker/repository',
      GIT_OBJECT_DIRECTORY: '/attacker/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/attacker/alternate-objects',
      GIT_EXEC_PATH: '/attacker/git-exec',
      GIT_CONFIG_PARAMETERS: "'gpg.format'='ssh'",
      LD_PRELOAD: '/attacker/preload.so',
      DYLD_INSERT_LIBRARIES: '/attacker/preload.dylib',
      DYLD_LIBRARY_PATH: '/attacker/lib',
      HTTP_PROXY: 'http://attacker.invalid',
      HTTPS_PROXY: 'http://attacker.invalid',
      ALL_PROXY: 'socks5://attacker.invalid',
      GIT_SSL_CAINFO: '/attacker/ca.pem',
      NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
      SSL_CERT_FILE: '/attacker/ca.pem',
    };
    expect(verifyReleaseCheckout(testFixture.root, { git: matching.git, source })).toBe(explorerA);
    expect(matching.calls).toContainEqual([
      'fetch',
      '--force',
      '--prune',
      '--no-tags',
      '--no-recurse-submodules',
      'https://github.com/soramitsu/iroha-block-explorer-web.git',
      '+refs/heads/master:refs/remotes/origin/master',
    ]);
    for (const environment of matching.environments) {
      expect(environment).toMatchObject({
        GIT_CONFIG_COUNT: '9',
        GIT_CONFIG_KEY_0: 'gpg.program',
        GIT_CONFIG_KEY_4: 'gpg.format',
        GIT_CONFIG_VALUE_4: 'openpgp',
        GIT_CONFIG_KEY_5: 'gpg.openpgp.program',
        GIT_CONFIG_VALUE_5: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
        GIT_NO_REPLACE_OBJECTS: '1',
        GNUPGHOME: process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
      });
      for (const unsafe of [
        'GIT_DIR',
        'GIT_OBJECT_DIRECTORY',
        'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_EXEC_PATH',
        'GIT_CONFIG_PARAMETERS',
        'LD_PRELOAD',
        'DYLD_INSERT_LIBRARIES',
        'DYLD_LIBRARY_PATH',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'GIT_SSL_CAINFO',
        'NODE_EXTRA_CA_CERTS',
        'SSL_CERT_FILE',
      ]) {
        expect(environment).not.toHaveProperty(unsafe);
      }
    }

    const stale = fakeExplorerGit({ head: explorerA, master: explorerB });
    expect(() => verifyReleaseCheckout(testFixture.root, { git: stale.git })).toThrow(
      'must equal freshly fetched origin/master'
    );

    const raced = fakeExplorerGit({
      head: explorerA,
      headAfterVerification: explorerB,
      master: explorerB,
    });
    expect(() => verifyReleaseCheckout(testFixture.root, { git: raced.git })).toThrow(
      `Explorer HEAD changed during signature verification: ${explorerA} -> ${explorerB}`
    );
  });

  it('verifies rollback tooling against the manifest-pinned local commit without fetching', () => {
    const testFixture = fixture();
    const matching = fakeExplorerGit({ head: explorerA, master: explorerB });
    expect(verifyLocalReleaseCheckout(testFixture.root, explorerA, { git: matching.git })).toBe(explorerA);
    expect(matching.calls.some((args) => args[0] === 'fetch')).toBe(false);
    expect(matching.calls.some((args) => args[0] === 'merge-base')).toBe(false);

    const mismatched = fakeExplorerGit({ head: explorerB, master: explorerB });
    expect(() => verifyLocalReleaseCheckout(testFixture.root, explorerA, { git: mismatched.git })).toThrow(
      `HEAD ${explorerB} does not match manifest generator ${explorerA}`
    );
    expect(mismatched.calls.some((args) => args[0] === 'fetch')).toBe(false);

    const raced = fakeExplorerGit({
      head: explorerA,
      headAfterVerification: explorerB,
      master: explorerB,
    });
    expect(() => verifyLocalReleaseCheckout(testFixture.root, explorerA, { git: raced.git })).toThrow(
      `Recovery tool HEAD changed during signature verification: ${explorerA} -> ${explorerB}`
    );
  });

  it('accepts only the hard-coded reviewed baseline manifest tuple', async () => {
    const testFixture = fixture();
    const generic = await baselineManifest(testFixture);
    const reviewed = {
      ...generic,
      release_id: `68ccf50f3944-${reviewedRuntimeRevision.slice(0, 12)}`,
      explorer_revision: '68ccf50f3944aff310d1d11d5ee3c04f93f250ba',
      sdk_revision: 'a457d6b60846923441fea549edcae30626c5e939',
      profile_revision: 'a457d6b60846923441fea549edcae30626c5e939',
      runtime_revision: reviewedRuntimeRevision,
      package_lock_sha256: '706f8678d4d5bcf24df3217717c0c68fab3aac215883f8fa4ba49943345ece01',
      sdk_provenance: {
        repository: 'github.com/hyperledger-iroha/iroha',
        revision: 'a457d6b60846923441fea549edcae30626c5e939',
        subtree_path: 'javascript/iroha_js',
        subtree_tree: 'c86222b3f00374381c48b06210ef8267f5ee0411',
        dependency: 'file:../iroha/javascript/iroha_js',
        package_json_sha256: 'e943734aa0612d8064433d7810b05b2e5926b6a5331d32d9892eb27ee8790dbd',
        package_lock_sha256: '706f8678d4d5bcf24df3217717c0c68fab3aac215883f8fa4ba49943345ece01',
        profile_sha256: 'ecd38f35fa0890db545da63450cea65cc18aad599500966a55890cd7de3906f1',
      },
    };
    expect(validateReviewedBaselineManifest(reviewed)).toBe(reviewed);
    expect(() =>
      validateReviewedBaselineManifest({
        ...reviewed,
        release_id: `68ccf50f3944-${runtimeRevision.slice(0, 12)}`,
        runtime_revision: runtimeRevision,
      })
    ).toThrow('runtime_revision mismatch');
    expect(() =>
      validateReviewedBaselineManifest({
        ...reviewed,
        sdk_provenance: { ...reviewed.sdk_provenance, subtree_tree: '0'.repeat(40) },
      })
    ).toThrow('sdk_provenance.subtree_tree mismatch');
  });

  it('verifies the canonical checked-in inventory schema while excluding operator config', async () => {
    const testFixture = fixture();
    const inventoryPath = path.join(testFixture.root, 'reviewed-inventory.json');
    const files = (await collectReleaseFiles(testFixture.nextDist)).filter(
      (file: { path: string }) => file.path !== 'config.json'
    );
    const inventory = {
      schema_version: 1,
      explorer_revision: '68ccf50f3944aff310d1d11d5ee3c04f93f250ba',
      sdk_revision: 'a457d6b60846923441fea549edcae30626c5e939',
      runtime_revision: reviewedRuntimeRevision,
      dependency: 'file:../iroha/javascript/iroha_js',
      package_json_sha256: 'e943734aa0612d8064433d7810b05b2e5926b6a5331d32d9892eb27ee8790dbd',
      package_lock_sha256: '706f8678d4d5bcf24df3217717c0c68fab3aac215883f8fa4ba49943345ece01',
      profile_sha256: 'ecd38f35fa0890db545da63450cea65cc18aad599500966a55890cd7de3906f1',
      sdk_subtree_tree: 'c86222b3f00374381c48b06210ef8267f5ee0411',
      files,
    };
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    await expect(verifyReviewedBaselineInventory(testFixture.nextDist, inventoryPath)).resolves.toEqual(inventory);
    writeFileSync(path.join(testFixture.nextDist, 'unexpected.txt'), 'not reviewed');
    await expect(verifyReviewedBaselineInventory(testFixture.nextDist, inventoryPath)).rejects.toThrow(
      'does not match the checked-in reviewed public inventory'
    );
  });

  it('permits only the exact signed reviewed historical baseline as a master ancestor', () => {
    const testFixture = fixture();
    const baselineRevision = '68ccf50f3944aff310d1d11d5ee3c04f93f250ba';
    const accepted = fakeExplorerGit({ head: baselineRevision, master: explorerB });
    expect(
      verifyReleaseCheckout(testFixture.root, {
        allowReviewedBaseline: true,
        git: accepted.git,
      })
    ).toBe(baselineRevision);

    const unreviewed = fakeExplorerGit({ head: explorerA, master: explorerB });
    expect(() =>
      verifyReleaseCheckout(testFixture.root, {
        allowReviewedBaseline: true,
        git: unreviewed.git,
      })
    ).toThrow('must equal freshly fetched origin/master');

    const detached = fakeExplorerGit({ head: baselineRevision, master: explorerB, ancestor: false });
    expect(() =>
      verifyReleaseCheckout(testFixture.root, {
        allowReviewedBaseline: true,
        git: detached.git,
      })
    ).toThrow('not an ancestor');
  });

  it('verifies Explorer provenance through fresh canonical refs without requiring a pinned ancestor to stay tip', async () => {
    const verifierRoots: string[] = [];
    const fetchArguments: string[][] = [];
    const fetchEnvironments: NodeJS.ProcessEnv[] = [];
    let masterRevision = explorerB;
    let canonicalReachable = true;
    let signatureValid = true;
    let signatureIdentity = expectedOpenPgpIdentity();
    const git = (root: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      if (args[0] === 'init') {
        verifierRoots.push(root);
        expect(statSync(root).mode & 0o777).toBe(0o700);
        if (typeof process.geteuid === 'function') {
          expect(statSync(root).uid).toBe(process.geteuid());
        }
        return '';
      }
      if (args.includes('fetch')) {
        fetchArguments.push(args);
        fetchEnvironments.push(options?.env ?? {});
        return '';
      }
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return args[2].startsWith('refs/taira-explorer-verifier/heads/master')
          ? `${masterRevision}\n`
          : `${explorerA}\n`;
      }
      if (args[0] === 'for-each-ref') {
        return canonicalReachable ? 'refs/taira-explorer-verifier/heads/master\n' : '';
      }
      if (args[0] === 'verify-commit') {
        if (!signatureValid) throw new Error('injected signature failure');
        return '';
      }
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'show') return signatureIdentity;
      throw new Error(`unexpected canonical Explorer verifier call: ${args.join(' ')}`);
    };

    const hostileSource = {
      ...process.env,
      GIT_DIR: '/attacker/repository',
      GIT_OBJECT_DIRECTORY: '/attacker/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/attacker/alternate-objects',
      GIT_EXEC_PATH: '/attacker/git-exec',
      GIT_CONFIG_PARAMETERS: "'gpg.openpgp.program'='/attacker/fake-gpg'",
      LD_PRELOAD: '/attacker/preload.so',
      DYLD_INSERT_LIBRARIES: '/attacker/preload.dylib',
      DYLD_LIBRARY_PATH: '/attacker/lib',
      HTTP_PROXY: 'http://attacker.invalid',
      HTTPS_PROXY: 'http://attacker.invalid',
      ALL_PROXY: 'socks5://attacker.invalid',
      GIT_SSL_CAINFO: '/attacker/ca.pem',
      NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
      SSL_CERT_FILE: '/attacker/ca.pem',
    };
    await expect(verifyCanonicalExplorerRevision(explorerA, { git, source: hostileSource })).resolves.toBe(explorerA);
    expect(fetchArguments[0]).toEqual([
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
      'https://github.com/soramitsu/iroha-block-explorer-web.git',
      '+refs/heads/*:refs/taira-explorer-verifier/heads/*',
    ]);
    expect(fetchEnvironments[0]).toMatchObject({
      GIT_CONFIG_COUNT: '9',
      GIT_CONFIG_KEY_0: 'gpg.program',
      GIT_CONFIG_VALUE_0: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
      GIT_CONFIG_KEY_4: 'gpg.format',
      GIT_CONFIG_VALUE_4: 'openpgp',
      GIT_CONFIG_KEY_5: 'gpg.openpgp.program',
      GIT_CONFIG_VALUE_5: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_TERMINAL_PROMPT: '0',
      GNUPGHOME: process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
    });
    for (const unsafe of [
      'GIT_DIR',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_EXEC_PATH',
      'GIT_CONFIG_PARAMETERS',
      'LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES',
      'DYLD_LIBRARY_PATH',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'GIT_SSL_CAINFO',
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_FILE',
    ]) {
      expect(fetchEnvironments[0]).not.toHaveProperty(unsafe);
    }

    await expect(verifyCanonicalExplorerRevision(explorerA, { git, requireMasterTip: true })).rejects.toThrow(
      `must equal freshly fetched canonical master ${explorerB}`
    );
    masterRevision = explorerA;
    await expect(verifyCanonicalExplorerRevision(explorerA, { git, requireMasterTip: true })).resolves.toBe(explorerA);

    canonicalReachable = false;
    await expect(verifyCanonicalExplorerRevision(explorerA, { git })).rejects.toThrow(
      'not reachable from freshly fetched canonical refs'
    );
    canonicalReachable = true;
    signatureValid = false;
    await expect(verifyCanonicalExplorerRevision(explorerA, { git })).rejects.toThrow(
      'cryptographically verified canonical commit'
    );
    signatureValid = true;
    signatureIdentity = `G\0${'A'.repeat(40)}\0${'A'.repeat(40)}\n`;
    await expect(verifyCanonicalExplorerRevision(explorerA, { git })).rejects.toThrow(
      'cryptographically verified canonical commit'
    );

    expect(verifierRoots).toHaveLength(6);
    for (const root of verifierRoots) expect(existsSync(root)).toBe(false);
  });

  it('fetches SDK provenance through a fresh owner-only canonical verifier', async () => {
    let verifierRoot = '';
    let fetchArguments: string[] | null = null;
    let fetchEnvironment: NodeJS.ProcessEnv | null = null;
    let ancestryArguments: string[] | null = null;
    const git = (root: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      verifierRoot = root;
      expect(statSync(root).mode & 0o777).toBe(0o700);
      if (typeof process.geteuid === 'function') {
        expect(statSync(root).uid).toBe(process.geteuid());
      }
      if (args[0] === 'init') return '';
      if (args.includes('fetch')) {
        fetchArguments = args;
        fetchEnvironment = options?.env ?? null;
        return '';
      }
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return `${runtimeRevision}\n`;
      }
      if (args[0] === 'merge-base') {
        ancestryArguments = args;
        return '';
      }
      if (args[0] === 'verify-commit') return '';
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'show') return expectedOpenPgpIdentity();
      if (args[0] === 'rev-parse') return `${'f'.repeat(40)}\n`;
      throw new Error(`unexpected canonical verifier call: ${args.join(' ')}`);
    };

    const hostileSource = {
      ...process.env,
      GIT_DIR: '/attacker/repository',
      GIT_OBJECT_DIRECTORY: '/attacker/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/attacker/alternate-objects',
      GIT_EXEC_PATH: '/attacker/git-exec',
      GIT_CONFIG_PARAMETERS: "'gpg.openpgp.program'='/attacker/fake-gpg'",
      LD_PRELOAD: '/attacker/preload.so',
      DYLD_INSERT_LIBRARIES: '/attacker/preload.dylib',
      DYLD_LIBRARY_PATH: '/attacker/lib',
      HTTP_PROXY: 'http://attacker.invalid',
      HTTPS_PROXY: 'http://attacker.invalid',
      ALL_PROXY: 'socks5://attacker.invalid',
      GIT_SSL_CAINFO: '/attacker/ca.pem',
      NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
      SSL_CERT_FILE: '/attacker/ca.pem',
    };
    await expect(verifyCanonicalSdkRevision(runtimeRevision, { git, source: hostileSource })).resolves.toBe(
      'f'.repeat(40)
    );
    expect(fetchArguments).toEqual([
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
      'https://github.com/hyperledger-iroha/iroha.git',
      '+refs/heads/optimizations:refs/taira-sdk-verifier/heads/optimizations',
    ]);
    expect(fetchEnvironment).toMatchObject({
      GIT_CONFIG_COUNT: '9',
      GIT_CONFIG_KEY_0: 'gpg.program',
      GIT_CONFIG_VALUE_0: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
      GIT_CONFIG_KEY_4: 'gpg.format',
      GIT_CONFIG_VALUE_4: 'openpgp',
      GIT_CONFIG_KEY_5: 'gpg.openpgp.program',
      GIT_CONFIG_VALUE_5: process.env[TAIRA_GIT_VERIFY_GPG_ENV],
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_TERMINAL_PROMPT: '0',
      GNUPGHOME: process.env[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
    });
    for (const unsafe of [
      'GIT_DIR',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_EXEC_PATH',
      'GIT_CONFIG_PARAMETERS',
      'LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES',
      'DYLD_LIBRARY_PATH',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'GIT_SSL_CAINFO',
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_FILE',
    ]) {
      expect(fetchEnvironment).not.toHaveProperty(unsafe);
    }
    expect(ancestryArguments).toEqual([
      'merge-base',
      '--is-ancestor',
      runtimeRevision,
      'refs/taira-sdk-verifier/heads/optimizations',
    ]);
    expect(existsSync(verifierRoot)).toBe(false);
  });

  it('rejects a non-commit SDK revision before creating a canonical verifier', async () => {
    await expect(verifyCanonicalSdkRevision('HEAD')).rejects.toThrow('Canonical SDK revision');
  });

  it('binds the clean sibling checkout only to freshly fetched canonical SDK refs', async () => {
    const testFixture = fixture();
    const explorerRoot = path.join(testFixture.root, 'explorer');
    const irohaRoot = path.join(testFixture.root, 'iroha');
    mkdirSync(path.join(explorerRoot, 'tests/mochi'), { recursive: true });
    mkdirSync(irohaRoot);
    writeFileSync(
      path.join(explorerRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@iroha/iroha-js': `github:hyperledger-iroha/iroha#${runtimeRevision}&path:javascript/iroha_js`,
        },
      })
    );
    writeFileSync(path.join(explorerRoot, 'pnpm-lock.yaml'), 'reviewed lock\n');
    writeFileSync(path.join(explorerRoot, 'tests/mochi/explorer-profile.json'), '{}\n');
    let dirty = false;
    let canonicalReachable = true;
    let canonicalTree = 'f'.repeat(40);
    const localCalls: string[][] = [];
    const git = (root: string, args: string[]) => {
      if (root === irohaRoot) {
        localCalls.push(args);
        if (args[0] === 'config') return 'git@github.com:hyperledger-iroha/iroha.git\n';
        if (args[0] === 'status') return dirty ? ' M javascript/iroha_js/package.json\n' : '';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${runtimeRevision}\n`;
        if (args[0] === 'rev-parse') return `${'f'.repeat(40)}\n`;
        if (args[0] === 'for-each-ref') return 'refs/remotes/origin/stale-spoof\n';
        throw new Error(`unexpected local git call: ${args.join(' ')}`);
      }
      if (args[0] === 'init' || args.includes('fetch') || args[0] === 'verify-commit') return '';
      if (args[0] === 'cat-file') return openPgpCommitObject();
      if (args[0] === 'show') return expectedOpenPgpIdentity();
      if (args[0] === 'rev-parse' && args[1] === '--verify') return `${runtimeRevision}\n`;
      if (args[0] === 'merge-base') {
        if (!canonicalReachable) throw new Error('not an optimizations ancestor');
        return '';
      }
      if (args[0] === 'rev-parse') return `${canonicalTree}\n`;
      throw new Error(`unexpected canonical git call: ${args.join(' ')}`);
    };
    const provenance = await verifySdkSourceClosure(explorerRoot, runtimeRevision, { git });
    expect(provenance.revision).toBe(runtimeRevision);
    expect(provenance.subtree_tree).toBe('f'.repeat(40));
    expect(provenance.repository).toBe('github.com/hyperledger-iroha/iroha');
    expect(localCalls.some((args) => args[0] === 'fetch')).toBe(false);
    expect(localCalls.some((args) => args[0] === 'for-each-ref')).toBe(false);
    expect(localCalls.some((args) => args[0] === 'verify-commit')).toBe(false);

    dirty = true;
    await expect(verifySdkSourceClosure(explorerRoot, runtimeRevision, { git })).rejects.toThrow(
      'requires a clean Iroha checkout'
    );

    dirty = false;
    canonicalReachable = false;
    await expect(verifySdkSourceClosure(explorerRoot, runtimeRevision, { git })).rejects.toThrow(
      'not reachable from the freshly fetched canonical optimizations branch'
    );
    expect(localCalls.some((args) => args[0] === 'for-each-ref')).toBe(false);

    canonicalReachable = true;
    canonicalTree = '0'.repeat(40);
    await expect(verifySdkSourceClosure(explorerRoot, runtimeRevision, { git })).rejects.toThrow(
      'does not match freshly fetched canonical subtree'
    );
  });

  it('rejects noncanonical manifest bytes even when parsed contents and expected manifest match', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    writeFileSync(path.join(testFixture.servedPath, 'release-manifest.json'), JSON.stringify(manifest));
    await expect(verifyReleaseDirectory(testFixture.servedPath, manifest)).rejects.toThrow(
      'not encoded in canonical bytes'
    );
  });

  it('rejects writable or foreign-owned external baseline manifests', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    const reviewedDirectory = path.join(testFixture.root, 'reviewed');
    const manifestPath = path.join(reviewedDirectory, 'release-manifest.json');
    mkdirSync(reviewedDirectory, { mode: 0o700 });
    writeFileSync(manifestPath, serializeReleaseManifest(manifest), { mode: 0o644 });
    await expect(readReleaseManifest(reviewedDirectory)).resolves.toEqual(manifest);

    chmodSync(manifestPath, 0o666);
    await expect(readReleaseManifest(reviewedDirectory)).rejects.toThrow('must not be group- or world-writable');
    chmodSync(manifestPath, 0o644);

    if (typeof process.geteuid === 'function') {
      const actualUid = process.geteuid();
      const uid = vi.spyOn(process, 'geteuid').mockReturnValue(actualUid + 1);
      try {
        await expect(readReleaseManifest(reviewedDirectory)).rejects.toThrow('must be owned by the deployment account');
      } finally {
        uid.mockRestore();
      }
    }
  });

  it('rejects symlinked manifests and consumes a supplied canonical baseline snapshot only once', async () => {
    const linkedFixture = fixture();
    const linkedManifest = await baselineManifest(linkedFixture);
    const realManifestPath = path.join(linkedFixture.root, 'real-baseline-manifest.json');
    writeFileSync(realManifestPath, serializeReleaseManifest(linkedManifest));
    symlinkSync(realManifestPath, linkedFixture.baselineManifestPath);
    await expect(
      initializeReleaseStore({
        servedPath: linkedFixture.servedPath,
        releasesDir: linkedFixture.releasesDir,
        baselineManifestPath: linkedFixture.baselineManifestPath,
      })
    ).rejects.toThrow('canonical regular file');

    const snapshotFixture = fixture();
    const snapshotManifest = await baselineManifest(snapshotFixture);
    writeFileSync(snapshotFixture.baselineManifestPath, 'changed after the audited read\n');
    const initialized = await initializeReleaseStore({
      servedPath: snapshotFixture.servedPath,
      releasesDir: snapshotFixture.releasesDir,
      baselineManifestPath: snapshotFixture.baselineManifestPath,
      baselineManifest: snapshotManifest,
    });
    expect(initialized.manifest).toEqual(snapshotManifest);
  });

  it('uses a fixed recursive manifest key order and rejects reordered pretty JSON', async () => {
    const testFixture = fixture();
    const manifest = await baselineManifest(testFixture);
    const reordered = {
      files: manifest.files.map((file: { path: string; size: number; sha256: string }) => ({
        sha256: file.sha256,
        size: file.size,
        path: file.path,
      })),
      sdk_provenance: {
        profile_sha256: manifest.sdk_provenance.profile_sha256,
        package_lock_sha256: manifest.sdk_provenance.package_lock_sha256,
        package_json_sha256: manifest.sdk_provenance.package_json_sha256,
        dependency: manifest.sdk_provenance.dependency,
        subtree_tree: manifest.sdk_provenance.subtree_tree,
        subtree_path: manifest.sdk_provenance.subtree_path,
        revision: manifest.sdk_provenance.revision,
        repository: manifest.sdk_provenance.repository,
      },
      runtime_config: {
        sha256: manifest.runtime_config.sha256,
        path: manifest.runtime_config.path,
      },
      package_lock_sha256: manifest.package_lock_sha256,
      profile_revision: manifest.profile_revision,
      runtime_revision: manifest.runtime_revision,
      sdk_revision: manifest.sdk_revision,
      generator_revision: manifest.generator_revision,
      explorer_revision: manifest.explorer_revision,
      previous_release_id: manifest.previous_release_id,
      release_id: manifest.release_id,
      schema_version: manifest.schema_version,
    };
    const canonical = serializeReleaseManifest(manifest);
    expect(serializeReleaseManifest(reordered)).toBe(canonical);
    writeFileSync(
      path.join(testFixture.servedPath, 'release-manifest.json'),
      `${JSON.stringify(reordered, null, 2)}\n`
    );
    await expect(verifyReleaseDirectory(testFixture.servedPath, manifest)).rejects.toThrow(
      'not encoded in canonical bytes'
    );
  });

  it('rejects symlinked dist roots and recognizes canonical real roots', async () => {
    const testFixture = fixture();
    expect(await validateCanonicalRealDirectory(testFixture.nextDist, 'dist')).toBe(testFixture.nextDist);
    const linkedDist = path.join(testFixture.root, 'linked-dist');
    symlinkSync(testFixture.nextDist, linkedDist, 'dir');
    await expect(validateCanonicalRealDirectory(linkedDist, 'dist')).rejects.toThrow('must be a real directory');
  });

  it('normalizes only the canonical Iroha upstream remote', () => {
    expect(normalizeIrohaRemote('git@github.com:hyperledger-iroha/iroha.git')).toBe(
      'github.com/hyperledger-iroha/iroha'
    );
    expect(normalizeIrohaRemote('https://github.com/hyperledger-iroha/iroha.git')).toBe(
      'github.com/hyperledger-iroha/iroha'
    );
    expect(normalizeIrohaRemote('https://github.com/fork/iroha.git')).toBeNull();
  });
});
