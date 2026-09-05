import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EXACT_TOOLCHAIN_REPOSITORY_ROOT,
  NODE_DOWNLOAD_ORIGIN,
  REQUIRED_PNPM_INTEGRITY,
  REQUIRED_PNPM_VERSION,
  TAIRA_RELEASE_ATTESTATION_ENV,
  TAIRA_RELEASE_ATTESTATION_NONCE_ENV,
  TAIRA_GIT_VERIFY_GNUPGHOME_ENV,
  TAIRA_GIT_VERIFY_GPG_ENV,
  TAIRA_RELEASE_SIGNER_FINGERPRINT,
  TAIRA_RELEASE_TOOL_PATH,
  assertRequiredPnpmVersion,
  createTairaReleaseAttestation,
  executeExactToolchainCommand,
  prepareTairaGitVerification,
  resolveNodeArtifact,
  resolvePlaywrightBrowsersPath,
  resolveToolchainCache,
  sanitizedExactToolchainEnvironment,
  sanitizedTairaReleaseEnvironment,
  validatePlaywrightBrowserCacheDirectory,
  validateToolchainCacheDirectory,
} from './run-exact-toolchain.mjs';

const cleanupRoots: string[] = [];

afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    if (existsSync(root)) rmSync(root, { force: true, recursive: true });
  }
});

function privateTemporaryParent() {
  const parent = mkdtempSync(path.join(realpathSync(tmpdir()), 'iroha-exact-toolchain-test-'));
  chmodSync(parent, 0o700);
  cleanupRoots.push(parent);
  return parent;
}

function installHermeticGpgFixture(parent: string): string {
  const executable = path.join(parent, 'fixture-gpg');
  writeFileSync(
    executable,
    [
      '#!/bin/sh',
      'mode=',
      'output=',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    --dearmor) mode=dearmor; shift ;;',
      '    --list-keys) mode=list; shift ;;',
      '    --output) output=$2; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'if [ "$mode" = dearmor ]; then',
      '  umask 077',
      '  : > "$output"',
      '  exit 0',
      'fi',
      'if [ "$mode" = list ]; then',
      '  printf "pub:::::::::\\nfpr:::::::::%s:\\n" ' + JSON.stringify(TAIRA_RELEASE_SIGNER_FINGERPRINT),
      '  exit 0',
      'fi',
      'exit 97',
      '',
    ].join('\n'),
    { mode: 0o700 }
  );
  return realpathSync(executable);
}

describe('exact CI toolchain bootstrap', () => {
  it('matches the repository Node and package-manager declarations', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
    expect(readFileSync(path.resolve('.node-version'), 'utf8').trim()).toBe('24.19.0');
    expect(packageJson.engines?.node).toBe('24.19.0');
    expect(packageJson.packageManager).toBe('pnpm@10.11.0');
  });

  it('pins official Node 24.19.0 archives for every supported CI/local platform', () => {
    expect(NODE_DOWNLOAD_ORIGIN).toBe('https://nodejs.org/dist/v24.19.0');
    expect(resolveNodeArtifact('linux', 'x64')).toEqual({
      file: 'node-v24.19.0-linux-x64.tar.gz',
      sha256: 'f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4',
    });
    expect(resolveNodeArtifact('linux', 'arm64')).toEqual({
      file: 'node-v24.19.0-linux-arm64.tar.gz',
      sha256: 'd28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f',
    });
    expect(resolveNodeArtifact('darwin', 'x64').file).toBe('node-v24.19.0-darwin-x64.tar.gz');
    expect(resolveNodeArtifact('darwin', 'arm64').file).toBe('node-v24.19.0-darwin-arm64.tar.gz');
  });

  it('keeps the shell-first bootstrap hashes aligned with the verified artifact map', () => {
    const bootstrap = readFileSync(path.resolve('scripts/bootstrap-exact-toolchain.sh'), 'utf8');
    for (const [platform, architecture] of [
      ['linux', 'x64'],
      ['linux', 'arm64'],
      ['darwin', 'x64'],
      ['darwin', 'arm64'],
    ] as const) {
      const artifact = resolveNodeArtifact(platform, architecture);
      expect(bootstrap).toContain(`node_archive="${artifact.file}"`);
      expect(bootstrap).toContain(`node_archive_sha256="${artifact.sha256}"`);
    }
  });

  it('rehashes the cached official archive and freshly extracts Node for every invocation', () => {
    const bootstrap = readFileSync(path.resolve('scripts/bootstrap-exact-toolchain.sh'), 'utf8');
    expect(bootstrap).toContain('archives_root="$toolchain_cache/.archives"');
    expect(bootstrap).toContain('validate_archive_file "$archive_path"');
    expect(bootstrap).toContain('staging_root=$(mktemp -d "$toolchain_cache/.node-run.XXXXXX")');
    expect(bootstrap).not.toContain('node_installation=');
    expect(bootstrap).not.toContain('cached Node installation');
  });

  it('publishes a raced Node archive without replacing or leaking either verified copy', () => {
    const bootstrap = readFileSync(path.resolve('scripts/bootstrap-exact-toolchain.sh'), 'utf8');
    expect(bootstrap).toContain('if ln "$downloaded_archive" "$archive_path" 2>/dev/null; then');
    expect(bootstrap).toContain('elif [ -e "$archive_path" ] || [ -L "$archive_path" ]; then');
    expect(bootstrap.match(/rm -f -- "\$downloaded_archive"/gu)).toHaveLength(3);
    expect(bootstrap).not.toContain('mv "$downloaded_archive" "$archive_path"');
  });

  it('rejects unsupported platforms instead of selecting a fallback binary', () => {
    expect(() => resolveNodeArtifact('win32', 'x64')).toThrow('does not support platform');
    expect(() => resolveNodeArtifact('linux', 'riscv64')).toThrow('does not support platform');
  });

  it('accepts only pnpm 10.11.0', () => {
    expect(REQUIRED_PNPM_VERSION).toBe('10.11.0');
    expect(REQUIRED_PNPM_INTEGRITY).toBe(
      'sha512.6540583f41cc5f628eb3d9773ecee802f4f9ef9923cc45b69890fb47991d4b092964694ec3a4f738a420c918a333062c8b925d312f42e4f0c263eb603551f977'
    );
    expect(assertRequiredPnpmVersion('10.11.0\n')).toBe('10.11.0');
    expect(() => assertRequiredPnpmVersion('10.11.1')).toThrow('pnpm 10.11.0 is required');
    expect(() => assertRequiredPnpmVersion('9.15.0')).toThrow('pnpm 10.11.0 is required');
  });

  it('rejects broad, in-repository, relative, and non-normalized cache paths', () => {
    const filesystemRoot = path.parse(EXACT_TOOLCHAIN_REPOSITORY_ROOT).root;
    const canonicalTemp = realpathSync(tmpdir());
    const canonicalHome = realpathSync(homedir());
    for (const unsafe of [
      filesystemRoot,
      path.join(filesystemRoot, 'cache'),
      canonicalTemp,
      canonicalHome,
      EXACT_TOOLCHAIN_REPOSITORY_ROOT,
      path.join(EXACT_TOOLCHAIN_REPOSITORY_ROOT, '.toolchain-cache'),
      `${canonicalTemp}/nested/../cache`,
      'relative/cache',
    ]) {
      expect(() => resolveToolchainCache(unsafe)).toThrow(/absolute normalized|broad or in-repository/u);
    }

    const safe = path.join(privateTemporaryParent(), 'cache');
    expect(resolveToolchainCache(safe)).toBe(safe);
  });

  it('creates only an owner-private real cache and rejects unsafe existing entries', async () => {
    const parent = privateTemporaryParent();
    const cache = path.join(parent, 'cache');
    await expect(validateToolchainCacheDirectory(cache)).resolves.toBe(cache);
    expect(lstatSync(cache).mode & 0o777).toBe(0o700);

    chmodSync(cache, 0o770);
    await expect(validateToolchainCacheDirectory(cache)).rejects.toThrow('must have mode 0700');

    const secondParent = privateTemporaryParent();
    const target = path.join(secondParent, 'target');
    const linkedCache = path.join(secondParent, 'cache');
    mkdirSync(target, { mode: 0o700 });
    symlinkSync(target, linkedCache);
    await expect(validateToolchainCacheDirectory(linkedCache)).rejects.toThrow('must be a real directory');
  });

  it('persists Playwright payloads in an owner-private exact-toolchain cache', async () => {
    const parent = privateTemporaryParent();
    const cache = path.join(parent, 'cache');
    const browserCache = await validatePlaywrightBrowserCacheDirectory(cache);

    expect(browserCache).toBe(path.join(cache, 'ms-playwright'));
    expect(lstatSync(browserCache).mode & 0o777).toBe(0o700);

    chmodSync(browserCache, 0o755);
    await expect(validatePlaywrightBrowserCacheDirectory(cache)).rejects.toThrow(
      'Playwright browser cache must have mode 0700'
    );

    rmSync(browserCache, { recursive: true });
    const linkedTarget = path.join(parent, 'browser-target');
    mkdirSync(linkedTarget, { mode: 0o700 });
    symlinkSync(linkedTarget, browserCache);
    await expect(validatePlaywrightBrowserCacheDirectory(cache)).rejects.toThrow(
      'Playwright browser cache must be a real directory'
    );
  });

  it('resolves an unset browser path to the persistent cache and preserves an explicit image path', async () => {
    const parent = privateTemporaryParent();
    const cache = path.join(parent, 'cache');
    await expect(resolvePlaywrightBrowsersPath({}, cache)).resolves.toBe(
      path.join(cache, 'ms-playwright')
    );
    await expect(
      resolvePlaywrightBrowsersPath(
        { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
        path.join(parent, 'unused-cache')
      )
    ).resolves.toBe('/ms-playwright');
    expect(existsSync(path.join(parent, 'unused-cache'))).toBe(false);
  });

  it('makes the shell-first boundary reject broad and permissive caches before Node starts', () => {
    const bootstrap = path.resolve('scripts/bootstrap-exact-toolchain.sh');
    const broadResult = spawnSync('sh', [bootstrap, 'true'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        IROHA_EXPLORER_TOOLCHAIN_CACHE: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
        NODE_OPTIONS: '--require /definitely-not-present/attacker.js',
      },
    });
    expect(broadResult.status).toBe(1);
    expect(broadResult.stderr).toContain('refusing broad or in-repository exact-toolchain cache');
    expect(broadResult.stderr).not.toContain('attacker.js');

    const parent = privateTemporaryParent();
    const permissiveCache = path.join(parent, 'cache');
    mkdirSync(permissiveCache, { mode: 0o755 });
    const permissiveResult = spawnSync('sh', [bootstrap, 'true'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        IROHA_EXPLORER_TOOLCHAIN_CACHE: permissiveCache,
      },
    });
    expect(permissiveResult.status).toBe(1);
    expect(permissiveResult.stderr).toContain('must have mode 0700');
  });

  it('uses an allowlisted private environment and binds commands to the canonical repository', () => {
    const environment = sanitizedExactToolchainEnvironment(
      {
        COREPACK_INTEGRITY_KEYS: '0',
        COREPACK_ENV_FILE: '/attacker/.corepack.env',
        COREPACK_NPM_PASSWORD: 'attacker-password',
        COREPACK_NPM_REGISTRY: 'https://attacker.invalid',
        COREPACK_NPM_TOKEN: 'attacker-token',
        NODE_OPTIONS: '--require /attacker.js',
        NODE_PATH: '/attacker',
        NPM_CONFIG_REGISTRY: 'https://attacker.invalid',
        PNPM_HOME: '/attacker/pnpm',
        HTTPS_PROXY: 'https://attacker.invalid',
        NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
        GIT_CONFIG_GLOBAL: '/attacker/gitconfig',
        VITE_API_URL: 'https://attacker.invalid',
        PATH: '/usr/bin',
        IROHA_REPO_ROOT: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
        PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        RUN_LIVE_MOCHI_E2E: '1',
        TAIRA_EXPLORER_ROOT: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
        TAIRA_RUNTIME_CONFIG: '/operator/runtime.json',
        TAIRA_UNREVIEWED_SECRET: 'drop-me',
      },
      {
        corepackHome: '/private/cache/corepack',
        nodeBin: '/verified-node/bin',
        toolBin: '/private/cache/tool-bin',
      }
    );
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
    expect(environment).not.toHaveProperty('NODE_PATH');
    expect(environment).not.toHaveProperty('COREPACK_INTEGRITY_KEYS');
    expect(environment).not.toHaveProperty('COREPACK_NPM_PASSWORD');
    expect(environment).not.toHaveProperty('COREPACK_NPM_TOKEN');
    expect(environment).not.toHaveProperty('HTTPS_PROXY');
    expect(environment).not.toHaveProperty('NODE_EXTRA_CA_CERTS');
    expect(environment).not.toHaveProperty('GIT_CONFIG_GLOBAL');
    expect(environment).not.toHaveProperty('VITE_API_URL');
    expect(environment).toMatchObject({
      COREPACK_DEFAULT_TO_LATEST: '0',
      COREPACK_ENABLE_NETWORK: '1',
      COREPACK_ENABLE_PROJECT_SPEC: '1',
      COREPACK_ENABLE_STRICT: '1',
      COREPACK_ENABLE_UNSAFE_CUSTOM_URLS: '0',
      COREPACK_ENV_FILE: '0',
      COREPACK_HOME: '/private/cache/corepack',
      COREPACK_NPM_REGISTRY: 'https://registry.npmjs.org',
      HOME: '/private/cache/home',
      IROHA_REPO_ROOT: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
      NPM_CONFIG_GLOBALCONFIG: '/private/cache/npm-globalconfig',
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
      NPM_CONFIG_USERCONFIG: '/private/cache/npm-userconfig',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      PNPM_HOME: '/private/cache/pnpm-home',
      RUN_LIVE_MOCHI_E2E: '1',
      TMPDIR: '/private/cache/tmp',
      XDG_CONFIG_HOME: '/private/cache/xdg-config',
    });
    expect(environment.PATH).toBe(['/private/cache/tool-bin', '/verified-node/bin', '/usr/bin'].join(path.delimiter));
    expect(Object.keys(environment).filter((key) => key.startsWith('TAIRA_'))).toEqual([]);

    const spawn = vi.fn(() => ({ status: 0 }));
    expect(executeExactToolchainCommand('pnpm', ['test:unit'], { environment, spawn })).toBe(0);
    expect(spawn).toHaveBeenCalledWith('pnpm', ['test:unit'], {
      cwd: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
      env: environment,
      stdio: 'inherit',
    });
  });

  it('uses the persistent browser cache by default and preserves an explicit CI image cache', () => {
    const options = {
      corepackHome: '/private/cache/corepack',
      nodeBin: '/verified-node/bin',
      playwrightBrowsersPath: '/private/cache/ms-playwright',
      toolBin: '/private/cache/tool-bin',
    };
    expect(
      sanitizedExactToolchainEnvironment({ PATH: '/usr/bin' }, options)
        .PLAYWRIGHT_BROWSERS_PATH
    ).toBe('/private/cache/ms-playwright');
    expect(
      sanitizedExactToolchainEnvironment(
        { PATH: '/usr/bin', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
        options
      ).PLAYWRIGHT_BROWSERS_PATH
    ).toBe('/ms-playwright');
  });

  it.each([
    [
      'manifest',
      [
        'TAIRA_EXPLORER_REVISION',
        'TAIRA_SDK_REVISION',
        'TAIRA_RUNTIME_REVISION',
        'TAIRA_MANIFEST_OUTPUT',
        'TAIRA_RUNTIME_CONFIG',
      ],
    ],
    ['initialize', ['TAIRA_BASELINE_MANIFEST', 'TAIRA_RUNTIME_CONFIG']],
    ['deploy', ['TAIRA_RUNTIME_CONFIG']],
    ['prepare-transition', ['TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION', 'TAIRA_RUNTIME_CONFIG']],
    ['transition', ['TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION']],
    ['verify', []],
    ['rollback', []],
  ])('scopes the Taira %s environment to its exact release inputs', (command, commandKeys) => {
    const commonKeys = [
      'TAIRA_EXPLORER_RELEASES_DIR',
      'TAIRA_EXPLORER_ROOT',
      'TAIRA_EXPLORER_SERVED_DIST',
      'TAIRA_NGINX_BIN',
      'TAIRA_NGINX_CONFIG_DUMP',
    ];
    const source = Object.fromEntries(
      [
        ...commonKeys,
        'TAIRA_BASELINE_MANIFEST',
        'TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION',
        'TAIRA_EXPLORER_REVISION',
        'TAIRA_MANIFEST_OUTPUT',
        'TAIRA_RUNTIME_CONFIG',
        'TAIRA_RUNTIME_REVISION',
        'TAIRA_SDK_REVISION',
        'TAIRA_EXPLORER_HOST',
        'TAIRA_EXPLORER_URL',
        'TAIRA_TORII_ORIGIN',
        'TAIRA_TORII_STATUS_URL',
        'TAIRA_CERTBOT_ROOT',
        'TAIRA_UNKNOWN_REDIRECT',
      ].map((key) => [key, `/operator/${key.toLowerCase()}`])
    );
    Object.assign(source, {
      BASH_ENV: '/attacker/bash-env',
      COREPACK_NPM_TOKEN: 'registry-secret',
      HTTPS_PROXY: 'https://attacker.invalid',
      NODE_EXTRA_CA_CERTS: '/attacker/ca.pem',
      NODE_OPTIONS: '--require /attacker.js',
      PATH: '/usr/bin',
    });
    const base = sanitizedExactToolchainEnvironment(source, {
      corepackHome: '/private/cache/corepack',
      nodeBin: '/verified-node/bin',
      toolBin: '/private/cache/tool-bin',
    });
    const environment = sanitizedTairaReleaseEnvironment(source, base, [command]);
    expect(
      Object.keys(environment)
        .filter((key) => key.startsWith('TAIRA_'))
        .sort()
    ).toEqual([...commonKeys, ...commandKeys].sort());
    for (const rejected of [
      'BASH_ENV',
      'COREPACK_NPM_TOKEN',
      'HTTPS_PROXY',
      'NODE_EXTRA_CA_CERTS',
      'NODE_OPTIONS',
      'TAIRA_CERTBOT_ROOT',
      'TAIRA_EXPLORER_HOST',
      'TAIRA_EXPLORER_URL',
      'TAIRA_TORII_ORIGIN',
      'TAIRA_TORII_STATUS_URL',
      'TAIRA_UNKNOWN_REDIRECT',
    ]) {
      expect(environment).not.toHaveProperty(rejected);
    }
  });

  it('creates a one-shot attestation for the canonical Taira profile and exact argv', async () => {
    const parent = privateTemporaryParent();
    const cacheRoot = path.join(parent, 'cache');
    mkdirSync(cacheRoot, { mode: 0o700 });
    const toolRoot = mkdtempSync(path.join(cacheRoot, '.toolchain-run-'));
    chmodSync(toolRoot, 0o700);
    const environment: Record<string, string> = {};
    mkdirSync(path.join(toolRoot, 'home'), { mode: 0o700 });
    const gpgExecutable = installHermeticGpgFixture(parent);
    await prepareTairaGitVerification({ environment, toolRoot, gpgExecutable });
    const argv = ['rollback', `${'a'.repeat(12)}-${'b'.repeat(12)}`];
    const attestation = await createTairaReleaseAttestation({
      argv,
      environment,
      toolRoot,
    });
    expect(attestation).toBe(path.join(toolRoot, '.taira-release-attestation.json'));
    expect(lstatSync(attestation!).mode & 0o777).toBe(0o600);
    expect(environment[TAIRA_RELEASE_ATTESTATION_ENV]).toBe(attestation);
    expect(environment[TAIRA_RELEASE_ATTESTATION_NONCE_ENV]).toMatch(/^[0-9a-f]{64}$/u);
    const payload = JSON.parse(readFileSync(attestation!, 'utf8'));
    expect(payload).toMatchObject({
      schema: 1,
      nonce: environment[TAIRA_RELEASE_ATTESTATION_NONCE_ENV],
      git_verify_gnupghome: environment[TAIRA_GIT_VERIFY_GNUPGHOME_ENV],
      git_verify_gpg_path: environment[TAIRA_GIT_VERIFY_GPG_ENV],
      node_path: realpathSync(process.execPath),
      release_tool_path: realpathSync(TAIRA_RELEASE_TOOL_PATH),
    });
    expect(payload.argv_sha256).toMatch(/^[0-9a-f]{64}$/u);

    await expect(
      createTairaReleaseAttestation({
        argv,
        environment: {},
        toolRoot,
        releaseToolPath: path.resolve('scripts/check-node-version.mjs'),
      })
    ).rejects.toThrow('canonical release tool');
  });

  it('pins Docker bases and the builder package manager by immutable digests', () => {
    const dockerfile = readFileSync(path.resolve('Dockerfile'), 'utf8');
    expect(dockerfile).toContain(
      'FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder'
    );
    expect(dockerfile).toContain(
      'FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648'
    );
    expect(dockerfile).toContain(`pnpm@${REQUIRED_PNPM_VERSION}+${REQUIRED_PNPM_INTEGRITY}`);
    expect(dockerfile).toContain('test "$(node --version)" = "v24.19.0"');
    expect(dockerfile).toContain('test "$(pnpm --version)" = "10.11.0"');
    const sdkPrepareCopy = dockerfile.indexOf(
      'COPY scripts/prepare-iroha-sdk.mjs scripts/prepare-iroha-sdk.mjs'
    );
    const frozenInstall = dockerfile.indexOf('RUN pnpm install --offline --frozen-lockfile');
    expect(sdkPrepareCopy).toBeGreaterThanOrEqual(0);
    expect(frozenInstall).toBeGreaterThan(sdkPrepareCopy);
    expect(dockerfile).not.toMatch(/^FROM (?:node|caddy):[^@\n]+$/gmu);
  });

  it('rejects a relative Playwright browser override and ignores non-enabled controls', () => {
    expect(() =>
      sanitizedExactToolchainEnvironment(
        { PATH: '/usr/bin', PLAYWRIGHT_BROWSERS_PATH: '../attacker' },
        {
          corepackHome: '/private/cache/corepack',
          nodeBin: '/verified-node/bin',
          toolBin: '/private/cache/tool-bin',
        }
      )
    ).toThrow('PLAYWRIGHT_BROWSERS_PATH must be an absolute normalized path');

    expect(() =>
      sanitizedExactToolchainEnvironment(
        { PATH: '/usr/bin', RUN_LIVE_MOCHI_E2E: '1', IROHA_REPO_ROOT: '../iroha' },
        {
          corepackHome: '/private/cache/corepack',
          nodeBin: '/verified-node/bin',
          toolBin: '/private/cache/tool-bin',
        }
      )
    ).toThrow('IROHA_REPO_ROOT must be an absolute normalized path');

    const environment = sanitizedExactToolchainEnvironment(
      {
        CI: 'true',
        PATH: '/usr/bin',
        RUN_LIVE_MOCHI_E2E: 'true',
        IROHA_REPO_ROOT: EXACT_TOOLCHAIN_REPOSITORY_ROOT,
      },
      {
        corepackHome: '/private/cache/corepack',
        nodeBin: '/verified-node/bin',
        toolBin: '/private/cache/tool-bin',
      }
    );
    expect(environment).not.toHaveProperty('CI');
    expect(environment).not.toHaveProperty('RUN_LIVE_MOCHI_E2E');
    expect(environment).not.toHaveProperty('IROHA_REPO_ROOT');
  });

  it('uses a disposable Corepack home instead of a persistent executable cache', () => {
    const runner = readFileSync(path.resolve('scripts/run-exact-toolchain.mjs'), 'utf8');
    expect(runner).toContain("mkdtemp(path.join(cacheRoot, '.toolchain-run-'))");
    expect(runner).toContain("path.join(toolRoot, 'corepack')");
    expect(runner).toContain('`pnpm@§{REQUIRED_PNPM_VERSION}+§{REQUIRED_PNPM_INTEGRITY}`'.replaceAll('§', '$'));
    expect(runner).not.toContain("path.join(cacheRoot, 'corepack')");
  });

  it('removes Node injection before the verified Node executable is first invoked', () => {
    const bootstrap = readFileSync(path.resolve('scripts/bootstrap-exact-toolchain.sh'), 'utf8');
    const trustedPath = bootstrap.indexOf('PATH=/usr/bin:/bin:/usr/sbin:/sbin');
    const stripInjection = bootstrap.indexOf('unset CDPATH ENV BASH_ENV NODE_OPTIONS NODE_PATH TAR_OPTIONS');
    const versionCheck = bootstrap.indexOf('"$exact_node" --version');
    const runner = bootstrap.indexOf('"$exact_node" "$repository_root/scripts/run-exact-toolchain.mjs"');
    expect(trustedPath).toBeGreaterThan(0);
    expect(stripInjection).toBeGreaterThan(trustedPath);
    expect(stripInjection).toBeGreaterThan(0);
    expect(versionCheck).toBeGreaterThan(stripInjection);
    expect(runner).toBeGreaterThan(versionCheck);
    expect(bootstrap).toContain('curl --disable');
  });
});
