import { expect, test, type Page, type Request, type Route } from '@playwright/test';

const ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const UNQUALIFIED_LOCALES = [
  { locale: 'akk', retiredOption: 'AKK - 𒀝𒅗𒁕' },
  { locale: 'egy', retiredOption: 'EGY - 𓆎𓅓𓏏' },
] as const;

function createAncientFontRequestRecorder(output: string[]): (request: Request) => void {
  return (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.includes('cuneiform') || pathname.includes('egyptian-text')) {
      output.push(pathname);
    }
  };
}

function saveLocalePreference(locale: string): void {
  window.localStorage.setItem('app-language', locale);
}

async function installHermeticApi(page: Page): Promise<void> {
  await page.route('**/config.json', (route) => route.fulfill({ json: {
    toriiBaseUrl: 'https://taira.sora.org',
    networkId: `hash:${'AB'.repeat(32)}#B99E`,
    networkPrefix: 369,
  } }));
  await page.route('**/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return await route.fulfill({ status: 204, headers });
    if (url.pathname === '/v1/explorer/accounts/query') {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          next_cursor: null,
          items: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 503, headers, contentType: 'application/json', body: '{}' });
  });
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const overflow = async () => await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  await expect.poll(overflow).toBeLessThanOrEqual(1);
}

async function readHtmlLocale(page: Page): Promise<{ lang: string; dir: string }> {
  return await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
}

async function readSavedLocale(page: Page): Promise<string | null> {
  return await page.evaluate(() => window.localStorage.getItem('app-language'));
}

test.describe('unqualified ancient locale safety', () => {
  for (const fixture of UNQUALIFIED_LOCALES) {
    test(`withholds ${fixture.locale} and normalizes its stale preference`, async ({ page }) => {
      const ancientFontRequests: string[] = [];
      page.on('request', createAncientFontRequestRecorder(ancientFontRequests));
      await installHermeticApi(page);
      await page.addInitScript(saveLocalePreference, fixture.locale);

      await page.goto('/');
      await expect.poll(async () => (await readHtmlLocale(page)).lang).toBe('en');
      await expect.poll(async () => (await readHtmlLocale(page)).dir).toBe('ltr');
      await expect.poll(async () => await readSavedLocale(page)).toBe('en');
      expect(ancientFontRequests).toEqual([]);
      await expectNoDocumentOverflow(page);

      await page.locator('[role="combobox"]').click();
      await expect(page.getByRole('option', { name: fixture.retiredOption, exact: true })).toHaveCount(0);
      await expectNoDocumentOverflow(page);

      await page.goto('/accounts');
      await expect(page.locator('.accounts-list-page')).toBeVisible();
      await expect(page.locator('.accounts-list-page .base-table')).toBeVisible();
      await expectNoDocumentOverflow(page);

      await page.locator('.node-settings__button').click();
      await expect(page.locator('.node-settings__dropdown')).toBeVisible();
      await expectNoDocumentOverflow(page);

      await page.goto(`/accounts/${encodeURIComponent(ACCOUNT)}`);
      await expect(page.getByRole('alert')).toBeVisible();
      await expectNoDocumentOverflow(page);
      expect(ancientFontRequests).toEqual([]);
    });
  }
});
