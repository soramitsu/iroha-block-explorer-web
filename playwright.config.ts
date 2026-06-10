import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  testMatch: /.*\.pw\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    headless: true,
    trace: 'on-first-retry',
    viewport: {
      width: 1600,
      height: 1400,
    },
  },
  webServer: {
    command: 'pnpm build:vite && pnpm preview --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175/studio',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
