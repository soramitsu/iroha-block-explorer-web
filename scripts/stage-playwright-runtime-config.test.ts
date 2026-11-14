// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PLAYWRIGHT_RUNTIME_CONFIG,
  stagePlaywrightRuntimeConfig,
} from './stage-playwright-runtime-config.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

async function createBuildDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'iroha-explorer-playwright-build-'));
  temporaryDirectories.push(directory);
  await writeFile(path.join(directory, 'index.html'), '<!doctype html>\n', 'utf8');
  return directory;
}

describe('Playwright runtime config staging', () => {
  it('writes the exact same-origin production contract into an existing build', async () => {
    const directory = await createBuildDirectory();

    const configPath = await stagePlaywrightRuntimeConfig(directory);

    expect(configPath).toBe(path.join(directory, 'config.json'));
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual(PLAYWRIGHT_RUNTIME_CONFIG);
    expect(PLAYWRIGHT_RUNTIME_CONFIG).toMatchObject({
      toriiBaseUrl: 'http://127.0.0.1:4175',
      toriiFailoverEnabled: false,
      toriiForceBaseUrl: false,
    });
  });

  it('fails instead of creating a config without a completed Vite build', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'iroha-explorer-playwright-empty-'));
    temporaryDirectories.push(directory);

    await expect(stagePlaywrightRuntimeConfig(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(directory, 'config.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
