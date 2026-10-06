// @vitest-environment node
import { cp, lstat, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { IROHA_SDK_SPECIFIER, IROHA_SDK_SOURCE_REVISION, verifyIrohaSdk, verifyIrohaSdkArchive } from './verify-iroha-sdk.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];
const archiveName = 'iroha-iroha-js-0.0.3-cc8e6620f6cb.tgz';
const inventoryName = 'iroha-iroha-js-0.0.3-cc8e6620f6cb.files.json';

async function fixture({ installed = true } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'explorer-sdk-integrity-')));
  roots.push(root);
  await mkdir(path.join(root, 'vendor'));
  for (const name of [archiveName, inventoryName]) await cp(path.join(repository, 'vendor', name), path.join(root, 'vendor', name));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@iroha/iroha-js': IROHA_SDK_SPECIFIER } }));
  const packageRoot = path.join(root, 'node_modules/@iroha/iroha-js');
  if (installed) {
    await cp(await realpath(path.join(repository, 'node_modules/@iroha/iroha-js')), packageRoot, { recursive: true });
    // Every mutation starts from a package accepted by the exact same checker.
    await verifyIrohaSdk(root);
  }
  return { root, packageRoot };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('admitted SDK package integrity', () => {
  it('checks all 231 installed files without changing the real package', async () => {
    const browserClient = path.join(repository, 'node_modules/@iroha/iroha-js/dist/toriiBrowserClient.js');
    const before = await lstat(browserClient);
    expect(await verifyIrohaSdk(repository)).toEqual({
      files: 231,
      archiveSha256: 'db24d5e042a475a24d204a0045e07f1dd8bafc821c098a64fffe046bf216e15a',
      inventorySha256: '9cd0272751874d0243d03af4a7b49f44aaff1c165e03dc78a3107f5f8c688880',
      status: 'package-integrity-verified',
    });
    const after = await lstat(browserClient);
    expect([after.ino, after.size, after.mtimeMs, after.ctimeMs]).toEqual([before.ino, before.size, before.mtimeMs, before.ctimeMs]);
  });

  it('records the clean source package and contains no retired browser codec artifacts', async () => {
    const inventory = JSON.parse(await readFile(path.join(repository, 'vendor', inventoryName), 'utf8'));
    expect(inventory.source).toMatchObject({
      revision: IROHA_SDK_SOURCE_REVISION,
      packageGitTree: '297429298cd4fd06d488be9575a71aeb6cd19524',
      packageSourceClean: true,
      repeatPackSha256: inventory.archiveSha256,
      nodeVersion: '24.19.0',
    });
    expect(inventory.files.some(({ path: name }: { path: string }) => (
      /(?:^|\/)wasm(?:\/|$)|\.wasm$|browserCodec|browser-codec/iu.test(name)
    ))).toBe(false);
    const sdkPackage = JSON.parse(await readFile(path.join(repository, 'node_modules/@iroha/iroha-js/package.json'), 'utf8'));
    expect(sdkPackage.exports['./browser-codec']).toBeUndefined();
  });

  it('authenticates archive inputs before installation without claiming installed-package integrity', async () => {
    const { root } = await fixture({ installed: false });
    expect(await verifyIrohaSdkArchive(root)).toMatchObject({ files: 231, status: 'archive-integrity-verified' });
    await expect(lstat(path.join(root, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(verifyIrohaSdk(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([archiveName, inventoryName])('rejects substituted bytes in %s before installation', async name => {
    const { root } = await fixture({ installed: false });
    const filename = path.join(root, 'vendor', name); const bytes = await readFile(filename);
    bytes[0] = bytes[0]! ^ 1;
    await writeFile(filename, bytes);
    await expect(verifyIrohaSdkArchive(root)).rejects.toThrow(/SDK (archive|inventory) differs/);
  });

  it('rejects other SDK dependency sources', async () => {
    const { root } = await fixture({ installed: false });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@iroha/iroha-js': 'file:../iroha/javascript/iroha_js' } }));
    await expect(verifyIrohaSdkArchive(root)).rejects.toThrow('SDK dependency must select the exact admitted vendored archive');
  });

  it.each([
    'dist/toriiBrowserClient.js',
    'dist/public/address.js',
    'dist/public/transactionCodec.js',
    'native/iroha_js_host.checksums.json',
    'torii-browser.d.ts',
    'package.json',
  ])('rejects altered installed %s bytes', async name => {
    const { root, packageRoot } = await fixture();
    const filename = path.join(packageRoot, name); const bytes = await readFile(filename);
    bytes[0] = bytes[0]! ^ 1;
    await writeFile(filename, bytes);
    await expect(verifyIrohaSdk(root)).rejects.toThrow(`Installed SDK bytes differ: ${name}`);
  });

  it('rejects additional installed files', async () => {
    const { root, packageRoot } = await fixture();
    await writeFile(path.join(packageRoot, 'unexpected.js'), 'extra');
    await expect(verifyIrohaSdk(root)).rejects.toThrow('Installed SDK contains an unexpected file: unexpected.js');
  });

  it('rejects additional empty directories', async () => {
    const { root, packageRoot } = await fixture();
    await mkdir(path.join(packageRoot, 'unexpected'));
    await expect(verifyIrohaSdk(root)).rejects.toThrow('Installed SDK contains an unexpected directory: unexpected');
  });

  it('rejects installed symlinks even when they select package bytes', async () => {
    const { root, packageRoot } = await fixture();
    await symlink('package.json', path.join(packageRoot, 'unexpected-link'));
    await expect(verifyIrohaSdk(root)).rejects.toThrow('Installed SDK must not contain links or special files: unexpected-link');
  });

  it('fails on missing distribution files without recreating them', async () => {
    const { root, packageRoot } = await fixture();
    const dist = path.join(packageRoot, 'dist');
    await rm(dist, { recursive: true });
    await expect(verifyIrohaSdk(root)).rejects.toThrow('Installed SDK file inventory differs from the admitted package');
    await expect(lstat(dist)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an installed package link outside its node_modules', async () => {
    const { root, packageRoot } = await fixture();
    const outside = path.join(root, 'outside-package');
    await rename(packageRoot, outside); await symlink(outside, packageRoot);
    await expect(verifyIrohaSdk(root)).rejects.toThrow('Installed SDK must remain inside this checkout node_modules');
  });

  it('rejects a linked node_modules root', async () => {
    const { root } = await fixture();
    const modules = path.join(root, 'node_modules'); const outside = path.join(root, 'outside-modules');
    await rename(modules, outside); await symlink(outside, modules);
    await expect(verifyIrohaSdk(root)).rejects.toThrow('SDK node_modules must be a real directory inside this checkout');
  });
});
