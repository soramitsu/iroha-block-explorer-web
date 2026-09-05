import { expect, test, type Page } from '@playwright/test';

const HASH = '0301b76be6d3dead32484180986523173082d770bc4fd954760d0a74a434624f';

async function installOverviewApi(page: Page, telemetry = false) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/stream') || url.pathname === '/v1/telemetry/live') {
      const data = telemetry && url.pathname === '/v1/telemetry/live'
        ? `data: ${JSON.stringify({ kind: 'network_status', peers: 5, domains: 3, accounts: 42, assets: 17, transactions_accepted: 11, transactions_rejected: 2, block: 99, block_created_at: null, finalized_block: 95, avg_commit_time: null, avg_block_time: null })}\n\n`
        : ': keepalive\n\n';
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: data });
      return;
    }
    if (!['/v1/explorer/blocks', '/v1/explorer/transactions/latest', '/v1/explorer/accounts'].includes(url.pathname)) {
      throw new Error(`Unexpected overview request: ${url.pathname}`);
    }
    const pagination = { limit: Number(url.searchParams.get('limit') ?? 10), snapshot_height: 42, snapshot_hash: HASH, next_cursor: null, has_more: false };
    const items = url.pathname.endsWith('/blocks') ? [{ hash: HASH, height: 42, created_at: '2026-07-21T12:00:00.000Z', prev_block_hash: null, transactions_hash: null, transactions_rejected: 0, transactions_total: 1 }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pagination, items, ...(url.pathname.endsWith('/latest') ? { sampled_at: '2026-07-21T12:00:00.000Z' } : {}) }) });
  });
}

test('responsive shell keeps overview activity visible, controls usable, and page width bounded in both themes', async ({ page }, testInfo) => {
  await installOverviewApi(page);
  await page.goto('/');
  await expect(page.locator('.latest-blocks__row').first()).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
      await expect.poll(async () => (await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(120);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.app-header')!.getBoundingClientRect();
        const search = document.querySelector('input[type="search"]')!.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, headerHeight: header.height, searchWidth: search.width };
      });
      expect(geometry.overflow, `${colorScheme} ${width}px page overflow`).toBe(false);
      expect(geometry.headerHeight).toBeLessThanOrEqual(120);
      expect(geometry.searchWidth).toBeGreaterThan(60);
      await expect(page.locator('.explorer-sidebar')).toBeVisible({ visible: width >= 1200 });
      if (width === 1280) {
        for (const selector of ['.latest-blocks .base-content-block__title', '.latest-transactions .base-content-block__title', '.latest-blocks__row', '.latest-transactions [data-test="collection-empty"]']) {
          const box = await page.locator(selector).first().boundingBox();
          expect(box, selector).not.toBeNull();
          expect(box!.y + Math.min(box!.height, 80), selector).toBeLessThan(720);
        }
      }
      if ([320, 390, 1280, 1440].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`overview-${colorScheme}-${width}.png`) });
      }
    }
  }
});

test('native drawer contains keyboard focus, restores it on Escape, expands groups, and closes on scoped navigation', async ({ page }) => {
  await installOverviewApi(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blocks?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2');
  expect(await page.locator('.app-header').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const trigger = page.locator('.app-header__menu');
  await trigger.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('button', { name: 'Analysis', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'Econometrics', exact: true })).toBeVisible();
  await drawer.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/\/accounts\?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2/u);
  await trigger.click();
  await expect(drawer.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await drawer.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(0.001);
  await drawer.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/\/\?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2/u);
  await expect(page.locator('.home-page__heading')).toContainText('scope.example');
  await expect(page.locator('.app-header .header-logo')).toHaveAttribute('href', '/?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2');

});

test('search validation persists, identifiers and timestamps disclose by keyboard or tap, and native theme override survives reload', async ({ page }) => {
  await installOverviewApi(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search blockchain' });
  await search.fill('not an identifier?!');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.search-field [role=alert]')).toContainText('complete supported identifier');
  await expect(search).toHaveValue('not an identifier?!');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  const info = page.locator('.latest-blocks').getByRole('button', { name: 'More information' }).first();
  await info.focus();
  await expect(page.locator('.latest-blocks [role="tooltip"]').first()).toBeVisible();
  await info.press('Escape');
  await expect(page.locator('.latest-blocks [role="tooltip"]').first()).not.toBeVisible();
  await info.click();
  await expect(page.locator('.latest-blocks [role="tooltip"]').first()).toBeVisible();
  await page.locator('.app-theme-switcher').click();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
});

test('RTL and long labels keep the mobile shell within its viewport', async ({ page }, testInfo) => {
  await installOverviewApi(page);
  for (const locale of ['ar', 'de']) {
    await page.addInitScript((language) => localStorage.setItem('app-language', language), locale);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.app-header__menu').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`drawer-${locale}-320.png`) });
    await page.keyboard.press('Escape');
  }
});


test('shows six exact telemetry values and marks the retained sample stale when SSE disconnects', async ({ page }, testInfo) => {
  await installOverviewApi(page, true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('.home-page-info__item-value')).toHaveText(['42', '17', '3', '99', '13', '5']);
  await expect(page.locator('.home-page-info__availability')).toContainText('Connection lost');
  await page.locator('.home-page-info').getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.home-page-info__item-value')).toHaveCount(6);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
    await page.screenshot({ path: testInfo.outputPath(`overview-statistics-${theme}.png`) });
  }
});
