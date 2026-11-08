import { defineConfig, type Project } from '@playwright/test';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const liveSpecPattern = /(?:mochi-live|soracloud-live)\.pw\.ts/u;
const onlineSdkSpecPattern = /online-sdk-startup\.pw\.ts/u;
const onlineSdkEnabled = process.env.BPNG_EXPLORER_ONLINE_BUILD === '1';

function verifiedOnlineChromium(): string {
  const executable = process.env.BPNG_CHROMIUM_EXECUTABLE_PATH;
  const expectedSha256 = process.env.BPNG_EXPECTED_CHROMIUM_SHA256;
  if (typeof executable !== 'string' || !isAbsolute(executable) || resolve(executable) !== executable
    || typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedSha256) || /^0+$/u.test(expectedSha256)) {
    throw new Error('Online SDK tests require independently pinned Chromium executable and SHA-256.');
  }
  const before = lstatSync(executable);
  if (realpathSync(executable) !== executable || !before.isFile() || before.isSymbolicLink() || (before.mode & 0o111) === 0) {
    throw new Error('Online SDK Chromium must be a canonical executable regular file.');
  }
  const actualSha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
  const after = lstatSync(executable);
  if (actualSha256 !== expectedSha256 || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mode !== after.mode || before.mtimeMs !== after.mtimeMs
    || before.ctimeMs !== after.ctimeMs || after.isSymbolicLink()) {
    throw new Error('Online SDK Chromium differs from the independently pinned stable executable.');
  }
  return executable;
}

// Only the explicit online release project consumes this executable. Existing
// development and hermetic projects retain their managed Playwright browsers.
const onlineSdkChromium = onlineSdkEnabled ? verifiedOnlineChromium() : undefined;
const previewCommand = process.env.PLAYWRIGHT_REUSE_BUILD === '1'
  ? 'pnpm preview --host 127.0.0.1 --port 4175'
  : 'pnpm build:vite && pnpm preview --host 127.0.0.1 --port 4175';
const projects: Project[] = [
  {
    name: 'desktop-chromium',
    testIgnore: [liveSpecPattern, onlineSdkSpecPattern],
    use: {
      browserName: 'chromium',
      viewport: { width: 1440, height: 1000 },
    },
  },
  {
    name: 'mobile-chromium',
    testMatch: /quality-gates\.hermetic\.pw\.ts/u,
    use: {
      browserName: 'chromium',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    },
  },
];


if (onlineSdkEnabled) {
  if (process.env.PLAYWRIGHT_REUSE_BUILD !== '1') {
    throw new Error('Online SDK tests require the already admitted production build.');
  }
  projects.push({
    name: 'online-sdk',
    testMatch: onlineSdkSpecPattern,
    timeout: 90_000,
    use: {
      browserName: 'chromium',
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
      launchOptions: { executablePath: onlineSdkChromium },
    },
  });
}

if (process.env.PLAYWRIGHT_LIVE_MOCHI === '1') {
  projects.push({
    name: 'live-mochi',
    testMatch: /mochi-live\.pw\.ts/u,
    use: {
      browserName: 'chromium',
      viewport: { width: 1440, height: 1000 },
    },
  });
}

if (process.env.PLAYWRIGHT_SORACLOUD_TORII_URL?.trim()) {
  projects.push({
    name: 'live-soracloud',
    testMatch: /soracloud-live\.pw\.ts/u,
    use: {
      browserName: 'chromium',
      viewport: { width: 1440, height: 1000 },
    },
  });
}

export default defineConfig({
  testDir: fileURLToPath(new URL('./tests/playwright', import.meta.url)),
  testMatch: /.*\.pw\.ts/u,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  outputDir: 'output/playwright/test-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects,
  webServer: {
    command: previewCommand,
    url: 'http://127.0.0.1:4175/',
    reuseExistingServer: onlineSdkEnabled ? false : !process.env.CI,
    timeout: 240_000,
  },
});
