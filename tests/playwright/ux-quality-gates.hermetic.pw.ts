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

test('restored landing layout keeps centered branding, open navigation, usable controls and responsive activity in both themes', async ({ page }, testInfo) => {
  await installOverviewApi(page);
  await page.goto('/');
  await expect(page.locator('.latest-blocks__row').first()).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
      await expect(page.locator('.app-theme-switcher svg')).toHaveAttribute('data-theme-icon', colorScheme);
      await expect(page.locator('.app-theme-switcher')).toHaveAttribute('aria-pressed', String(colorScheme === 'dark'));
      await expect.poll(async () => (await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(120);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.app-header')!.getBoundingClientRect();
        const search = document.querySelector('input[type="search"]')!.getBoundingClientRect();
        const emblem = document.querySelector('.home-page__logo-icon')!.getBoundingClientRect();
        const title = document.querySelector('.home-page__title')!.getBoundingClientRect();
        const navigation = document.querySelector('.home-page__menu')!.getBoundingClientRect();
        const statistics = document.querySelector('.home-page-info')!.getBoundingClientRect();
        const blocks = document.querySelector('.latest-blocks')!.getBoundingClientRect();
        const transactions = document.querySelector('.latest-transactions')!.getBoundingClientRect();
        const themeControl = document.querySelector('.app-theme-switcher')!.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          headerHeight: header.height,
          searchWidth: search.width,
          centeredEmblem: Math.abs(emblem.x + emblem.width / 2 - innerWidth / 2),
          emblemWidth: emblem.width,
          ordered: header.bottom <= emblem.top && emblem.bottom <= title.top && title.bottom <= search.top
            && search.bottom <= navigation.top && navigation.bottom <= statistics.top && statistics.bottom <= blocks.top,
          activityAligned: Math.abs(blocks.y - transactions.y) < 1,
          activityStacked: transactions.top >= blocks.bottom,
          themeWidth: themeControl.width,
          themeHeight: themeControl.height,
        };
      });
      expect(geometry.overflow, `${colorScheme} ${width}px page overflow`).toBe(false);
      expect(geometry.headerHeight).toBeLessThanOrEqual(120);
      expect(geometry.searchWidth).toBeGreaterThan(60);
      expect(geometry.centeredEmblem).toBeLessThan(1);
      expect(geometry.emblemWidth).toBe(112);
      expect(geometry.ordered, `${colorScheme} ${width}px landing hierarchy`).toBe(true);
      expect(geometry.themeWidth).toBeGreaterThanOrEqual(44);
      expect(geometry.themeHeight).toBeGreaterThanOrEqual(44);
      expect(width >= 1200 ? geometry.activityAligned : geometry.activityStacked).toBe(true);
      await expect(page.locator('.app-header--home')).toBeVisible();
      await expect(page.locator('.app-header__search, .explorer-sidebar, .explorer-mobile-navigation, .app-header__menu')).toHaveCount(0);
      const links = page.locator('.home-page__menu').getByRole('link');
      await expect(links).toHaveCount(20);
      for (const link of await links.all()) {
        await expect(link).toBeVisible();
      }
      await expect(page.locator('.home-page__menu button, .home-page__menu details')).toHaveCount(0);
      if ([320, 390, 1280, 1440].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`landing-${colorScheme}-${width}.png`), fullPage: true });
      }
    }
  }
});

test('all navigation links stay open and keyboard accessible while scoped URLs and active routes survive page changes', async ({ page }) => {
  await installOverviewApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1200, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/blocks?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2');
    expect(await page.locator('.app-header').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.app-header__search')).toBeVisible();
    await expect(page.locator('.app-header__menu, dialog, .navigation-menu__toggle')).toHaveCount(0);
    await expect(page.locator('.explorer-sidebar')).toBeVisible({ visible: width >= 1200 });
    await expect(page.locator('.explorer-mobile-navigation')).toBeVisible({ visible: width < 1200 });
    const navigation = page.locator(width >= 1200 ? '.explorer-sidebar .navigation-menu' : '.explorer-mobile-navigation');
    const links = navigation.getByRole('link');
    await expect(links).toHaveCount(20);
    for (const link of await links.all()) {
      await expect(link).toBeVisible();
    }
    await expect(navigation.locator('button, details')).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Blocks', exact: true })).toHaveAttribute('aria-current', 'page');
    await navigation.getByRole('link', { name: 'Transactions', exact: true }).focus();
    await page.keyboard.press('Tab');
    const accounts = navigation.getByRole('link', { name: 'Accounts', exact: true });
    await expect(accounts).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/accounts\?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2/u);
    await expect(accounts).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#main-content')).toBeFocused();
    await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page).toHaveURL(/\/\?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2/u);
    await expect(page.locator('.home-page__context')).toContainText('scope.example');
    await expect(page.locator('.home-page__menu').getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.home-page__menu').getByRole('link', { name: 'Blocks', exact: true })).toHaveAttribute('href', '/blocks?torii=https%3A%2F%2Fscope.example&dataspaceLaneId=1&dataspaceId=2');
  }
});

test('search validation persists, identifiers and timestamps disclose by keyboard or tap, and native theme override survives reload', async ({ page }) => {
  await installOverviewApi(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app-theme-switcher svg')).toHaveAttribute('data-theme-icon', 'dark');
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
  await expect(page.locator('.app-theme-switcher svg')).toHaveAttribute('data-theme-icon', 'light');
  await expect(page.locator('.app-theme-switcher')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.app-theme-switcher').evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.app-theme-switcher svg')).toHaveAttribute('data-theme-icon', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
});

test('RTL and long labels keep landing and open mobile navigation within their viewport', async ({ page }, testInfo) => {
  await installOverviewApi(page);
  for (const locale of ['ar', 'de']) {
    await page.addInitScript((language) => localStorage.setItem('app-language', language), locale);
    await page.setViewportSize({ width: 320, height: 720 });
    for (const route of ['/', '/accounts']) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const navigation = page.locator(route === '/' ? '.home-page__menu' : '.explorer-mobile-navigation');
      const links = navigation.getByRole('link');
      await expect(links).toHaveCount(20);
      for (const link of await links.all()) {
        await expect(link).toBeVisible();
      }
      await expect(page.locator('.app-header__menu, dialog, .navigation-menu__toggle')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${route === '/' ? 'landing' : 'navigation'}-${locale}-320.png`), fullPage: true });
    }
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
    for (const width of [390, 1280, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      const values = await page.locator('.home-page-info__item-value').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { y: rect.y, x: rect.x };
      }));
      expect(values).toHaveLength(6);
      expect(values.slice(0, 3).every((value) => Math.abs(value.y - values[0]!.y) < 1)).toBe(true);
      expect(values.slice(3).every((value) => Math.abs(value.y - values[3]!.y) < 1)).toBe(true);
      expect(values[3]!.y).toBeGreaterThan(values[0]!.y);
      expect(new Set(values.slice(0, 3).map((value) => value.x)).size).toBe(3);
      await page.screenshot({ path: testInfo.outputPath(`landing-statistics-${theme}-${width}.png`), fullPage: true });
    }
  }
});
