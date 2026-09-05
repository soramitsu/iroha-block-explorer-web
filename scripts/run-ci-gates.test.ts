import { existsSync, realpathSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  CI_REPOSITORY_ROOT,
  buildCiGates,
  executeCiGates,
  sanitizedCiEnvironment,
  withIsolatedCiStore,
  withPreservedNodeModules,
} from './run-ci-gates.mjs';

const testStore = path.resolve('/tmp/iroha-explorer-ci-test-store');
const canonicalTemporaryRoot = realpathSync(tmpdir());
const nodeModulesBackupPrefix = '.iroha-explorer-ci-node-modules-';

async function createTemporaryRepository() {
  return await mkdtemp(
    path.join(canonicalTemporaryRoot, 'iroha-explorer-ci-repository-')
  );
}

function isNodeModulesBackup(entry: string) {
  return entry.startsWith(nodeModulesBackupPrefix);
}

describe('ordered CI gates', () => {
  it('checks exact versions and pins before an isolated frozen dependency operation', () => {
    const gates = buildCiGates({ storeDir: testStore });
    expect(gates.map(({ label }) => label)).toEqual([
      'exact Node version',
      'exact Iroha SDK pin',
      'frozen dependency fetch',
      'offline frozen install',
      'roadmap integrity',
      'lint',
      'unit tests',
      'typecheck',
      'production build',
      'bundle budgets',
      'hermetic Playwright',
    ]);
    expect(gates[0]).toMatchObject({
      args: ['scripts/check-node-version.mjs'],
      command: 'node',
    });
    expect(gates[2]).toMatchObject({
      args: ['fetch', '--frozen-lockfile', '--store-dir', testStore],
      command: 'pnpm',
    });
    expect(gates[3]).toMatchObject({
      args: [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--force',
        '--store-dir',
        testStore,
      ],
      command: 'pnpm',
    });
  });

  it('requires a normalized absolute per-run store and gates live Mochi explicitly', () => {
    expect(() => buildCiGates()).toThrow('CI pnpm store must be an absolute normalized path');
    expect(() => buildCiGates({ storeDir: 'relative/store' })).toThrow(
      'CI pnpm store must be an absolute normalized path'
    );
    expect(
      buildCiGates({ storeDir: testStore }).some(
        ({ label }) => label === 'live Mochi Playwright'
      )
    ).toBe(false);
    expect(
      buildCiGates({ runLiveMochi: true, storeDir: testStore }).at(-1)
    ).toMatchObject({
      args: ['test:playwright:mochi'],
      env: { PLAYWRIGHT_REUSE_BUILD: '1' },
      label: 'live Mochi Playwright',
    });
  });

  it('runs every gate from the canonical repository with an allowlisted environment', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const gates = buildCiGates({ storeDir: testStore }).slice(-2);
    executeCiGates(gates, spawn, {
      environment: {
        NODE_OPTIONS: '--require /attacker.js',
        NODE_PATH: '/attacker',
        HTTPS_PROXY: 'https://attacker.invalid',
        NPM_CONFIG_USERCONFIG: '/attacker/npmrc',
        PNPM_PACKAGE_EXTENSIONS: '{"attacker":{}}',
        VITE_API_URL: 'https://attacker.invalid',
        GIT_CONFIG_GLOBAL: '/attacker/gitconfig',
        PATH: '/usr/bin',
      },
    });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]?.[2]).toMatchObject({
      cwd: CI_REPOSITORY_ROOT,
      env: {
        CI: '1',
        PATH: '/usr/bin',
        PLAYWRIGHT_REUSE_BUILD: '1',
      },
      stdio: 'inherit',
    });
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('NODE_OPTIONS');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('NODE_PATH');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('HTTPS_PROXY');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('NPM_CONFIG_USERCONFIG');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('PNPM_PACKAGE_EXTENSIONS');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('VITE_API_URL');
    expect(spawn.mock.calls[1]?.[2].env).not.toHaveProperty('GIT_CONFIG_GLOBAL');
  });

  it('replaces inherited package-manager state with private paths and preserves only deliberate controls', () => {
    const isolatedRoot = path.resolve('/tmp/iroha-explorer-ci-private');
    const environment = sanitizedCiEnvironment(
      {
        PATH: '/verified/bin:/usr/bin',
        COREPACK_HOME: '/private/toolchain/corepack',
        RUN_LIVE_MOCHI_E2E: '1',
        IROHA_REPO_ROOT: CI_REPOSITORY_ROOT,
        PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        NODE_OPTIONS: '--require /attacker.js',
        NPM_CONFIG_USERCONFIG: '/attacker/npmrc',
        npm_config_registry: 'https://attacker.invalid',
        PNPM_HOME: '/attacker/pnpm',
        HTTPS_PROXY: 'https://attacker.invalid',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
        GIT_CONFIG_GLOBAL: '/attacker/gitconfig',
        VITE_API_URL: 'https://attacker.invalid',
      },
      { isolatedRoot }
    );
    expect(environment).toMatchObject({
      CI: '1',
      COREPACK_HOME: '/private/toolchain/corepack',
      HOME: path.join(isolatedRoot, 'home'),
      IROHA_REPO_ROOT: CI_REPOSITORY_ROOT,
      NPM_CONFIG_GLOBALCONFIG: path.join(isolatedRoot, 'npm-globalconfig'),
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
      NPM_CONFIG_USERCONFIG: path.join(isolatedRoot, 'npm-userconfig'),
      PATH: '/verified/bin:/usr/bin',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      PNPM_HOME: path.join(isolatedRoot, 'pnpm-home'),
      RUN_LIVE_MOCHI_E2E: '1',
      TMPDIR: path.join(isolatedRoot, 'tmp'),
      XDG_CONFIG_HOME: path.join(isolatedRoot, 'xdg-config'),
    });
    for (const key of [
      'NODE_OPTIONS',
      'npm_config_registry',
      'HTTPS_PROXY',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'GIT_CONFIG_GLOBAL',
      'VITE_API_URL',
    ]) {
      expect(environment).not.toHaveProperty(key);
    }
    expect(() =>
      sanitizedCiEnvironment(
        { PATH: '/usr/bin', PLAYWRIGHT_BROWSERS_PATH: '../browser' },
        { isolatedRoot }
      )
    ).toThrow('PLAYWRIGHT_BROWSERS_PATH must be an absolute normalized path');
    expect(() =>
      sanitizedCiEnvironment(
        { PATH: '/usr/bin', RUN_LIVE_MOCHI_E2E: '1', IROHA_REPO_ROOT: '../iroha' },
        { isolatedRoot }
      )
    ).toThrow('IROHA_REPO_ROOT must be an absolute normalized path');
    expect(
      sanitizedCiEnvironment(
        { PATH: '/usr/bin', IROHA_REPO_ROOT: CI_REPOSITORY_ROOT },
        { isolatedRoot }
      )
    ).not.toHaveProperty('IROHA_REPO_ROOT');
  });

  it('exposes the reviewed Iroha checkout only to the explicitly enabled live gate', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const gates = buildCiGates({ runLiveMochi: true, storeDir: testStore }).slice(-2);
    executeCiGates(gates, spawn, {
      environment: {
        PATH: '/usr/bin',
        RUN_LIVE_MOCHI_E2E: '1',
        IROHA_REPO_ROOT: CI_REPOSITORY_ROOT,
      },
      isolatedRoot: '/tmp/iroha-explorer-ci-private',
    });

    expect(spawn.mock.calls[0]?.[2].env).not.toHaveProperty('IROHA_REPO_ROOT');
    expect(spawn.mock.calls[1]?.[2].env).toMatchObject({
      IROHA_REPO_ROOT: CI_REPOSITORY_ROOT,
      RUN_LIVE_MOCHI_E2E: '1',
    });
  });

  it('passes an explicit browser cache through the isolated environment to Playwright', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const gate = buildCiGates({ storeDir: testStore }).slice(-1);
    executeCiGates(gate, spawn, {
      environment: {
        PATH: '/usr/bin',
        PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      },
      isolatedRoot: '/tmp/iroha-explorer-ci-private',
    });

    expect(spawn).toHaveBeenCalledWith('pnpm', ['test:playwright:hermetic'], {
      cwd: CI_REPOSITORY_ROOT,
      env: expect.objectContaining({
        CI: '1',
        PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        PLAYWRIGHT_REUSE_BUILD: '1',
      }),
      stdio: 'inherit',
    });
  });

  it('stops at the first failed gate', () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 7 });
    expect(() =>
      executeCiGates(buildCiGates({ storeDir: testStore }).slice(0, 3), spawn)
    ).toThrow('exact Iroha SDK pin exited with status 7');
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('atomically restores the pre-existing node_modules tree after successful gates', async () => {
    const repositoryRoot = await createTemporaryRepository();
    try {
      const nodeModules = path.join(repositoryRoot, 'node_modules');
      const originalMarker = path.join(nodeModules, 'original.txt');
      const gateMarker = path.join(nodeModules, 'isolated.txt');
      await mkdir(nodeModules);
      await writeFile(originalMarker, 'original dependency tree');
      const originalInode = statSync(nodeModules).ino;

      const result = await withPreservedNodeModules(
        async () => {
          expect(existsSync(nodeModules)).toBe(false);
          const backup = (await readdir(repositoryRoot)).find(isNodeModulesBackup);
          expect(backup).toBeDefined();
          expect(statSync(path.join(repositoryRoot, backup!)).mode & 0o777).toBe(0o700);
          await mkdir(nodeModules);
          await writeFile(gateMarker, 'isolated dependency tree');
          return 'complete';
        },
        { repositoryRoot }
      );

      expect(result).toBe('complete');
      expect(statSync(nodeModules).ino).toBe(originalInode);
      await expect(readFile(originalMarker, 'utf8')).resolves.toBe('original dependency tree');
      expect(existsSync(gateMarker)).toBe(false);
      expect((await readdir(repositoryRoot)).some(isNodeModulesBackup)).toBe(false);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it('restores pre-existing node_modules when a gate fails', async () => {
    const repositoryRoot = await createTemporaryRepository();
    try {
      const nodeModules = path.join(repositoryRoot, 'node_modules');
      const originalMarker = path.join(nodeModules, 'original.txt');
      await mkdir(nodeModules);
      await writeFile(originalMarker, 'original dependency tree');
      const originalInode = statSync(nodeModules).ino;

      await expect(
        withPreservedNodeModules(
          async () => {
            await mkdir(nodeModules);
            await writeFile(path.join(nodeModules, 'isolated.txt'), 'isolated dependency tree');
            throw new Error('injected gate failure');
          },
          { repositoryRoot }
        )
      ).rejects.toThrow('injected gate failure');

      expect(statSync(nodeModules).ino).toBe(originalInode);
      await expect(readFile(originalMarker, 'utf8')).resolves.toBe('original dependency tree');
      expect(existsSync(path.join(nodeModules, 'isolated.txt'))).toBe(false);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it('removes the isolated dependency tree when no node_modules existed before the gates', async () => {
    const repositoryRoot = await createTemporaryRepository();
    try {
      const nodeModules = path.join(repositoryRoot, 'node_modules');

      await withPreservedNodeModules(
        async () => {
          await mkdir(nodeModules);
          await writeFile(path.join(nodeModules, 'isolated.txt'), 'isolated dependency tree');
        },
        { repositoryRoot }
      );

      expect(existsSync(nodeModules)).toBe(false);
      expect(await readdir(repositoryRoot)).toEqual([]);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it('uses an owner-only per-run store and removes it after success or failure', async () => {
    let successfulRoot = '';
    const result = await withIsolatedCiStore(async ({ environment, isolatedRoot, storeDir }) => {
      successfulRoot = isolatedRoot;
      expect(statSync(isolatedRoot).mode & 0o777).toBe(0o700);
      expect(path.dirname(storeDir)).toBe(isolatedRoot);
      expect(statSync(environment.HOME).mode & 0o777).toBe(0o700);
      expect(statSync(environment.NPM_CONFIG_USERCONFIG).mode & 0o777).toBe(0o600);
      return 'complete';
    });
    expect(result).toBe('complete');
    expect(existsSync(successfulRoot)).toBe(false);

    let failedRoot = '';
    await expect(
      withIsolatedCiStore(async ({ isolatedRoot }) => {
        failedRoot = isolatedRoot;
        throw new Error('injected gate failure');
      })
    ).rejects.toThrow('injected gate failure');
    expect(existsSync(failedRoot)).toBe(false);
  });

  it('refuses recursive cleanup if the isolated root identity changes', async () => {
    const temporaryRoot = path.resolve('/tmp');
    const isolatedRoot = path.join(temporaryRoot, 'iroha-explorer-ci-injected');
    const uid =
      typeof process.geteuid === 'function'
        ? process.geteuid()
        : (process.getuid?.() ?? 0);
    const baseStats = {
      dev: 1,
      ino: 10,
      isDirectory: () => true,
      isSymbolicLink: () => false,
      mode: 0o40700,
      uid,
    };
    const lstatFn = vi
      .fn()
      .mockResolvedValueOnce(baseStats)
      .mockResolvedValueOnce({ ...baseStats, ino: 11 });
    const removeFn = vi.fn();

    await expect(
      withIsolatedCiStore(async () => undefined, {
        chmodFn: vi.fn(),
        lstatFn,
        mkdirFn: vi.fn(),
        mkdtempFn: vi.fn(async () => isolatedRoot),
        realpathFn: vi.fn(async () => isolatedRoot),
        removeFn,
        temporaryRoot,
        writeFileFn: vi.fn(),
      })
    ).rejects.toThrow('identity changed before cleanup');
    expect(removeFn).not.toHaveBeenCalled();
  });
});
