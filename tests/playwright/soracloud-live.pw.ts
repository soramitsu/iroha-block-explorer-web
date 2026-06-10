import { expect, test } from '@playwright/test';

const toriiBaseUrl = process.env.PLAYWRIGHT_SORACLOUD_TORII_URL?.trim() ?? '';

test.skip(!toriiBaseUrl, 'PLAYWRIGHT_SORACLOUD_TORII_URL is not set');

test('loads live Soracloud overview sections from a configured Torii node', async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('torii_base_url', value);
  }, toriiBaseUrl);

  const statusResponse = page.waitForResponse((response) =>
    response.url().startsWith(`${toriiBaseUrl}/v1/soracloud/status`)
  );
  const modelHostResponse = page.waitForResponse((response) =>
    response.url().startsWith(`${toriiBaseUrl}/v1/soracloud/model-host/status`)
  );
  const agentStatusResponse = page.waitForResponse((response) =>
    response.url().startsWith(`${toriiBaseUrl}/v1/soracloud/agent/status`)
  );

  await page.goto('/soracloud');

  expect((await statusResponse).ok()).toBe(true);
  expect((await modelHostResponse).ok()).toBe(true);
  expect((await agentStatusResponse).ok()).toBe(true);

  await expect(page.locator('[data-test="soracloud-refresh"]')).toBeVisible();
  await expect(page.locator('[data-test="soracloud-stats"]')).toBeVisible();
  await expect(page.locator('[data-test="soracloud-service"], [data-test="soracloud-services-empty"]').first()).toBeVisible();
  await expect(page.locator('[data-test="soracloud-error"]')).toHaveCount(0);
});
