import { expect, test } from '@playwright/test';

test('keeps protected Soracloud reads behind canonical account authentication', async ({ page }) => {
  const soracloudRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/v1/soracloud/')) soracloudRequests.push(pathname);
  });

  await page.route('**/config.json', (route) => route.fulfill({ json: {
    toriiBaseUrl: 'https://taira.sora.org', networkPrefix: 369,
  } }));
  await page.goto('/soracloud');

  await expect(page.locator('[data-test="soracloud-auth-boundary"]')).toBeVisible();
  await expect(page.locator('[data-test="soracloud-public-routes"] li')).toHaveCount(2);
  await expect(page.locator('[data-test="soracloud-authenticated-routes"] li')).toHaveCount(14);
  await expect(page.locator('[data-test="soracloud-retired-routes"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('/model-host/status');
  expect(soracloudRequests).toEqual([]);
});
