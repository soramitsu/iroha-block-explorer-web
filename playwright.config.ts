import { defineConfig, type Project } from '@playwright/test';

const liveSpecPattern = /mochi-live\.pw\.ts/u;
const stageRuntimeConfigCommand = 'node scripts/stage-playwright-runtime-config.mjs';
const previewCommand =
  process.env.PLAYWRIGHT_REUSE_BUILD === '1'
    ? `${stageRuntimeConfigCommand} && pnpm preview --host 127.0.0.1 --port 4175`
    : `pnpm build:vite && ${stageRuntimeConfigCommand} && pnpm preview --host 127.0.0.1 --port 4175`;
const projects: Project[] = [
  {
    name: 'desktop-chromium',
    testIgnore: liveSpecPattern,
    use: {
      browserName: 'chromium',
      viewport: { width: 1440, height: 1000 },
    },
  },
  {
    name: 'mobile-chromium',
    testMatch: /(?:quality-gates|ancient-locales)\.hermetic\.pw\.ts/u,
    use: {
      browserName: 'chromium',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    },
  },
];

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

export default defineConfig({
  testDir: './tests/playwright',
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
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
