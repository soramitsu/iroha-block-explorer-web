import { describe, expect, it, vi } from 'vitest';
import {
  buildMochiEnvironment,
  resolveIrohaRoot,
  resolveMochiPython,
  runMochiCommand,
  validateMochiProfile,
  verifyPinnedIrohaRevision,
} from './mochi-explorer.mjs';

const profile = {
  schema_version: 1,
  iroha_revision: 'a'.repeat(40),
  profile: 'single-peer',
  profile_slug: 'explorer-v1',
  chain_id: 'explorer-chain',
  start_timeout_seconds: 60,
  seed: {
    domain_id: 'wonderland.universal',
    minimum_head_height: 2,
    minimum_transactions: 1,
  },
};

const canonicalDirectoryOperations = {
  lstatSyncFn: vi.fn(() => ({
    isDirectory: () => true,
    isSymbolicLink: () => false,
  })),
  realpathSyncFn: vi.fn((candidate: string) => candidate),
};

describe('pinned Mochi Explorer profile', () => {
  it('accepts the complete deterministic profile and freezes its seed assertions', () => {
    const parsed = validateMochiProfile(profile);
    expect(parsed.profile).toBe('single-peer');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.seed)).toBe(true);
  });

  it('rejects abbreviated revisions, unsupported presets, and incomplete seed assertions', () => {
    expect(() => validateMochiProfile({ ...profile, iroha_revision: 'abc' })).toThrow(/full lowercase/);
    expect(() => validateMochiProfile({ ...profile, profile: 'custom' })).toThrow(/supported/);
    expect(() => validateMochiProfile({ ...profile, seed: { domain_id: '' } })).toThrow(/seed assertions/);
  });

  it('resolves the sibling checkout unless an explicit checkout is supplied', () => {
    expect(resolveIrohaRoot('/work/explorer', undefined, canonicalDirectoryOperations)).toBe('/work/iroha');
    expect(resolveIrohaRoot('/work/explorer', '/pinned/iroha', canonicalDirectoryOperations)).toBe(
      '/pinned/iroha'
    );
  });

  it('rejects relative, non-normalized, missing, and symbolic checkout roots', () => {
    expect(() => resolveIrohaRoot('/work/explorer', '../iroha', canonicalDirectoryOperations)).toThrow(
      /absolute normalized/
    );
    expect(() => resolveIrohaRoot('/work/explorer', '/work/../iroha', canonicalDirectoryOperations)).toThrow(
      /absolute normalized/
    );
    expect(() => resolveIrohaRoot('/work/explorer', '/missing/iroha', {
      ...canonicalDirectoryOperations,
      lstatSyncFn: () => {
        throw new Error('missing');
      },
    })).toThrow(/existing real directory/);
    expect(() => resolveIrohaRoot('/work/explorer', '/linked/iroha', {
      lstatSyncFn: () => ({
        isDirectory: () => false,
        isSymbolicLink: () => true,
      }),
      realpathSyncFn: (candidate: string) => candidate,
    })).toThrow(/real directory/);
    expect(() => resolveIrohaRoot('/work/explorer', '/aliased/iroha', {
      ...canonicalDirectoryOperations,
      realpathSyncFn: () => '/real/iroha',
    })).toThrow(/must not traverse symbolic links/);
  });

  it('selects one explicit platform interpreter without silent retries', () => {
    expect(resolveMochiPython('darwin')).toBe('/usr/bin/python3');
    expect(resolveMochiPython('linux')).toBe('python3');
    expect(resolveMochiPython('darwin', { MOCHI_PYTHON: '/tools/python3' })).toBe('/tools/python3');
  });

  it('builds a local-only environment without discarding caller variables', () => {
    expect(buildMochiEnvironment(profile, '/work/explorer', { CI: 'true' })).toMatchObject({
      CI: 'true',
      RUST_MIN_STACK: '33554432',
      MOCHI_CONFIG: '/work/explorer/tests/mochi/explorer-local.toml',
      MOCHI_WORKSPACE_ROOT: '/work/explorer',
      MOCHI_PROFILE: 'single-peer',
      MOCHI_PROFILE_SLUG: 'explorer-v1',
      MOCHI_CHAIN_ID: 'explorer-chain',
      MOCHI_START_TIMEOUT_SECONDS: '60',
      MOCHI_PYTHON: process.platform === 'darwin' ? '/usr/bin/python3' : 'python3',
    });
  });

  it('preserves an explicit Rust worker-stack size for the upstream runtime', () => {
    expect(buildMochiEnvironment(profile, '/work/explorer', {
      RUST_MIN_STACK: '67108864',
    })).toMatchObject({
      RUST_MIN_STACK: '67108864',
    });
  });

  it('accepts only the exact pinned upstream revision', () => {
    const matching = vi.fn((_command: string, args: string[]) =>
      args[0] === 'rev-parse'
        ? { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' }
        : { status: 0, stdout: '', stderr: '' }
    );
    expect(verifyPinnedIrohaRevision('/iroha', 'a'.repeat(40), matching)).toBe('a'.repeat(40));
    const mismatching = vi.fn().mockReturnValue({ status: 0, stdout: `${'b'.repeat(40)}\n`, stderr: '' });
    expect(() => verifyPinnedIrohaRevision('/iroha', 'a'.repeat(40), mismatching)).toThrow(/mismatch/);
    const dirty = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: ' M scripts/mochi_local_sandbox.sh\n', stderr: '' });
    expect(() => verifyPinnedIrohaRevision('/iroha', 'a'.repeat(40), dirty)).toThrow(
      /must be clean/
    );
  });

  it('delegates an allowed command to the upstream helper after the revision check', () => {
    const runner = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0 });
    expect(runMochiCommand('status', {
      workspaceRoot: '/work/explorer',
      irohaRoot: '/work/iroha',
      profile,
      runner,
      irohaRootOperations: canonicalDirectoryOperations,
      environment: { TEST_SENTINEL: 'yes' },
    })).toBe(0);
    expect(runner).toHaveBeenLastCalledWith(
      'bash',
      ['/work/iroha/scripts/mochi_local_sandbox.sh', 'status'],
      expect.objectContaining({
        cwd: '/work/iroha',
        env: expect.objectContaining({
          TEST_SENTINEL: 'yes',
          MOCHI_CONFIG: '/work/explorer/tests/mochi/explorer-local.toml',
          MOCHI_PROFILE_SLUG: 'explorer-v1',
        }),
      })
    );
    expect(() => runMochiCommand('wipe-everything', { profile, runner })).toThrow(/Unsupported/);
  });
});
