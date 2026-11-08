import { expect, test, type Page, type Route } from '@playwright/test';

// Select the test network explicitly before application startup.
test.beforeEach(async ({ page }) => {
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: {
        toriiBaseUrl: 'https://taira.sora.org',
        toriiForceBaseUrl: true,
        networkId: `hash:${'AB'.repeat(32)}#B99E`,
        networkPrefix: 369,
      },
    })
  );
});
import tairaHistory from '../fixtures/taira-history.json' with { type: 'json' };
import nativeLogInstruction from '../fixtures/taira-ce5-log-instruction.json' with { type: 'json' };

const HASH = '0301b76be6d3dead32484180986523173082d770bc4fd954760d0a74a434624f';
const PARTIAL_HASH = 'ab'.repeat(32);
const FAILURE_HASH = 'b'.repeat(64);
const ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const CREATED_AT = '2026-07-21T12:00:00.000Z';

interface MockResponse {
  status?: number;
  body?: unknown;
  contentType?: string;
}

interface QueryFilter {
  op: string;
  args: unknown[];
}
interface CollectionQuery {
  cursor?: string;
  limit?: number;
  filter?: QueryFilter;
}
interface ObservedRequest {
  url: URL;
  method: string;
  query: CollectionQuery;
}
type MockResolver = (url: URL, query: CollectionQuery) => MockResponse | null;
const READ_QUERY_PATHS = new Set([
  '/v1/explorer/blocks/query',
  '/v1/explorer/transactions/latest/query',
  '/v1/explorer/instructions/query',
  '/v1/explorer/accounts/query',
]);

const emptyHistoryPage = (_url: URL) => ({ items: [], next_cursor: null });

function block(hash: string) {
  return {
    hash,
    height: 42,
    created_at: CREATED_AT,
    prev_block_hash: null,
    transactions_hash: null,
    transactions_rejected: 0,
    transactions_total: 1,
  };
}

function transaction(hash = HASH) {
  return {
    authority: ACCOUNT,
    hash,
    block: 42,
    created_at: CREATED_AT,
    executable: 'Instructions',
    status: 'Committed',
    rejection_reason: null,
    executable_payload: { instruction_count: 1 },
    metadata: { purpose: 'hermetic quality gate' },
    nonce: 7,
    signature: 'ed0120-hermetic-signature',
    time_to_live: null,
  };
}

function nativeInstruction() {
  return {
    ...nativeLogInstruction,
    authority: ACCOUNT,
    transaction_hash: HASH,
    block: 42,
    created_at: CREATED_AT,
  };
}

async function expectNoDocumentOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

async function installHermeticApi(page: Page, resolver: MockResolver, requests: ObservedRequest[] = []) {
  await page.route('**/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (method === 'OPTIONS') return await route.fulfill({ status: 204, headers });
    const isCollectionRead = method === 'POST' && READ_QUERY_PATHS.has(url.pathname);
    expect(['GET', 'HEAD'].includes(method) || isCollectionRead).toBe(true);
    if (READ_QUERY_PATHS.has(url.pathname)) expect(method).toBe('POST');
    const query = isCollectionRead ? (route.request().postDataJSON() as CollectionQuery) : {};
    if (isCollectionRead) {
      expect(url.search).toBe('');
      expect(Object.keys(query).every((key) => ['filter', 'limit', 'cursor'].includes(key))).toBe(true);
    }
    requests.push({ url, method, query });
    const response = resolver(url, query) ?? { status: 404, body: { message: `No fixture for ${url.pathname}` } };
    await route.fulfill({
      status: response.status ?? 200,
      headers,
      contentType: response.contentType ?? 'application/json',
      body: JSON.stringify(response.body ?? {}),
    });
  });
}

function exactSearchResolver(url: URL): MockResponse | null {
  const blockHash = decodeURIComponent(url.pathname.replace('/v1/explorer/blocks/', ''));
  const transactionHash = decodeURIComponent(url.pathname.replace('/v1/explorer/transactions/', ''));

  if (url.pathname === `/v1/explorer/blocks/${HASH}`) return { body: block(HASH) };
  if (url.pathname === `/v1/explorer/transactions/${HASH}`) return { body: transaction(HASH) };
  if (url.pathname === `/v1/explorer/blocks/${PARTIAL_HASH}`) return { body: block(PARTIAL_HASH) };
  if (url.pathname === `/v1/explorer/transactions/${PARTIAL_HASH}`) {
    return { status: 500, body: { message: 'transaction index unavailable' } };
  }
  if (blockHash === FAILURE_HASH || transactionHash === FAILURE_HASH) {
    return { status: 500, body: { message: 'exact index unavailable' } };
  }
  if (url.pathname === '/v1/explorer/blocks/query') return { body: emptyHistoryPage(url) };
  if (url.pathname === '/v1/explorer/transactions/latest/query') {
    return { body: emptyHistoryPage(url) };
  }
  return null;
}

function countTransactionRequests(requests: ObservedRequest[], hash: string): number {
  return requests.filter(({ url }) => url.pathname.endsWith(hash) && url.pathname.includes('/transactions/')).length;
}

function matchesQueryField(filter: QueryFilter | undefined, name: string, value: string): boolean {
  if (!filter) return false;
  if (filter.op === 'eq') return filter.args[0] === name && filter.args[1] === value;
  return filter.op === 'and' && filter.args.some((child) => matchesQueryField(child as QueryFilter, name, value));
}

function requestedInstructionKind(requests: ObservedRequest[], kind: string): boolean {
  return requests.some(
    ({ url, query }) =>
      url.pathname === '/v1/explorer/instructions/query' && matchesQueryField(query.filter, 'kind', kind)
  );
}

function requestedAccountsCursor(
  requests: ObservedRequest[],
  expected: { domain: string; cursor: string | null; limit: string }
): boolean {
  return requests.some(
    ({ query }) =>
      matchesQueryField(query.filter, 'domain', expected.domain) &&
      (query.cursor ?? null) === expected.cursor &&
      String(query.limit) === expected.limit
  );
}

test.describe('hermetic Explorer quality gates', () => {
  test('keeps search and visible navigation accessible within the viewport in both directions', async ({ page }) => {
    await installHermeticApi(page, (url) => {
      if (url.pathname === '/v1/explorer/blocks/query') return { body: tairaHistory.blocks };
      if (url.pathname === '/v1/explorer/transactions/latest/query') return { body: tairaHistory.latestTransactions };
      return null;
    });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const search = page.getByRole('searchbox', { name: 'Search blockchain' });
      const menu = page.locator('.home-page__menu');
      await expect(search).toBeVisible();
      await expect(menu.getByRole('link')).toHaveCount(21);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      for (const direction of ['ltr', 'rtl']) {
        await page.evaluate((value) => {
          document.documentElement.dir = value;
        }, direction);
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await expectNoDocumentOverflow(page);
          await expect(search).toBeVisible();
          await expect(menu.getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await search.fill(ACCOUNT);
      await search.press('Enter');
      await expect(page).toHaveURL((url) => decodeURIComponent(url.pathname) === `/accounts/${ACCOUNT}`);
    }
  });

  test('keeps real transaction status, identifiers and timestamps separate in both themes', async ({ page }) => {
    await installHermeticApi(page, (url) => {
      if (url.pathname === '/v1/explorer/blocks/query') return { body: tairaHistory.blocks };
      if (url.pathname === '/v1/explorer/transactions/latest/query') return { body: tairaHistory.latestTransactions };
      return null;
    });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const row = page.locator('.latest-transactions__row').first();
      const status = row.locator('.transaction-status__trigger');
      await expect(status).toBeVisible();
      const bounds = await row.evaluate((element) => {
        const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
        const statusRect = rect('.transaction-status__trigger');
        const hashRect = rect('.latest-transactions__hash');
        const accountRect = rect('.latest-transactions__account');
        const timeRect = rect('.latest-transactions__time');
        return {
          statusBeforeHash: statusRect.right <= hashRect.left,
          statusBeforeTime: statusRect.right <= timeRect.left,
          accountSeparate: accountRect.right <= timeRect.left || accountRect.bottom <= timeRect.top,
          overflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(bounds).toEqual({ statusBeforeHash: true, statusBeforeTime: true, accountSeparate: true, overflow: 0 });
      await status.focus();
      await expect(status).toHaveAttribute('aria-expanded', 'true');
      await status.press('Escape');
      await expect(status).toHaveAttribute('aria-expanded', 'false');
      const link = row.locator('.latest-transactions__hash a');
      const identifier = await link.getAttribute('title');
      expect(tairaHistory.latestTransactions.items.map((item) => item.hash)).toContain(identifier);
      await expect(link).toHaveAttribute('href', `/transactions/${identifier}`);
    }
  });

  test('renders native Taira history and follows its opaque cursor unchanged', async ({ page }) => {
    const firstBlock = tairaHistory.blocks.items[0];
    const secondBlock = tairaHistory.blocks.items[1];
    const cursor = tairaHistory.blocks.next_cursor;
    await installHermeticApi(page, (url, query) => {
      if (url.pathname === '/v1/explorer/blocks/query') {
        const isNextPage = query.cursor !== undefined;
        return {
          body: {
            next_cursor: isNextPage ? null : cursor,
            items: [isNextPage ? secondBlock : firstBlock],
          },
        };
      }
      if (url.pathname === '/v1/explorer/transactions/latest/query') {
        return { body: tairaHistory.latestTransactions };
      }
      return null;
    });

    await page.goto('/');
    await expect(
      page.locator(`a[href="/transactions/${tairaHistory.latestTransactions.items[0].hash}"]`)
    ).toBeVisible();
    await page.goto('/blocks');
    await expect(page.locator(`a[href="/blocks/${firstBlock.height}"]:visible`).first()).toBeVisible();
    const nextRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/v1/explorer/blocks/query' &&
        request.method() === 'POST' &&
        request.postDataJSON().cursor === cursor
    );
    await page.getByRole('button', { name: 'Next cursor page' }).click();
    expect((await nextRequest).postDataJSON().cursor).toBe(cursor);
    await expect(page.locator(`a[href="/blocks/${secondBlock.height}"]:visible`).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next cursor page' })).toBeDisabled();
  });

  test('normalizes an exact hash search and renders both exact matches', async ({ page }) => {
    await installHermeticApi(page, exactSearchResolver);
    await page.goto('/');

    const search = page.locator('.home-page__search input[type="search"]');
    await search.fill(`0x${HASH.toUpperCase()}`);
    await search.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${HASH}$`, 'u'));
    await expect(page.locator('[data-test="search-results-query"]')).toHaveText(HASH);
    await expect(page.locator('[data-test="search-result-block"]')).toContainText('Block');
    await expect(page.locator('[data-test="search-result-transaction"]')).toContainText('Transaction');
  });

  test('keeps a successful probe visible on partial failure and exposes a full failure retry', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installHermeticApi(page, exactSearchResolver, requests);

    await page.goto(`/search?q=${PARTIAL_HASH}`);
    await expect(page.locator('[data-test="search-result-block"]')).toBeVisible();
    await expect(page.locator('[data-test="search-result-transaction-notice"]')).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-test="search-result-transaction-notice"]')).toContainText(
      'Transaction lookup failed: the Explorer API returned HTTP status 500.'
    );
    expect(countTransactionRequests(requests, PARTIAL_HASH)).toBe(1);

    await page.locator('[data-test="search-results-partial-retry"]').click();
    await expect.poll(() => countTransactionRequests(requests, PARTIAL_HASH)).toBe(2);

    await page.goto(`/search?q=${FAILURE_HASH}`);
    await expect(page.locator('[data-test="search-results-error"]')).toContainText(
      'The exact lookup could not be completed: the Explorer API returned HTTP status 500'
    );
    await expect(page.locator('[data-test="resource-retry"]')).toHaveText('Retry exact lookup');
  });

  test('preserves opaque native instruction bytes, reports unavailable proof, and supports keyboard tabs', async ({
    page,
  }) => {
    const instruction = nativeInstruction();
    const requests: ObservedRequest[] = [];
    await installHermeticApi(
      page,
      (url) => {
        if (url.pathname === `/v1/explorer/transactions/${HASH}`) return { body: transaction() };
        if (url.pathname === '/v1/explorer/instructions/query') {
          return {
            body: {
              ...emptyHistoryPage(url),
              items: [instruction],
            },
          };
        }
        if (url.pathname === `/v1/explorer/instructions/${HASH}/0`) return { body: instruction };
        if (url.pathname === `/v1/explorer/transactions/${HASH}/proof`)
          return { status: 404, body: { message: 'evidence unavailable in fixture node' } };
        return null;
      },
      requests
    );

    await page.goto(`/transactions/${HASH}?instruction=0`);

    await expect(page.locator('[data-test="instruction-semantic-card"]')).toHaveCount(0);
    await expect(page.locator('[data-test="instruction-encoded-payload"]')).toHaveText(
      nativeLogInstruction.box.instruction
    );
    await expect(page.locator('.instructions-detail__json')).toContainText('Raw instruction JSON');
    await expect(page.locator('.instructions-detail__json')).toContainText(nativeLogInstruction.box.wire_id);
    await expect(page.locator('[data-test="transaction-proof-unavailable"]')).toContainText(
      'For a private data space, use Read access to connect an authorized wallet.'
    );
    await expect(page.locator('[data-test="transaction-proof-claim"]')).toHaveCount(0);
    expect(requests.some(({ url }) => url.pathname === `/v1/explorer/transactions/${HASH}/proof`)).toBe(true);
    expect(requests.some(({ url }) => url.pathname.startsWith('/v1/ledger/'))).toBe(false);

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    await allTab.focus();
    await allTab.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Register', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => requestedInstructionKind(requests, 'Register')).toBe(true);
  });

  test('restores URL filters and activates cursor pagination from the keyboard', async ({ page }) => {
    const accountRequests: ObservedRequest[] = [];
    await installHermeticApi(page, (url, query) => {
      if (url.pathname !== '/v1/explorer/accounts/query') return null;
      const cursor = query.cursor ?? null;
      accountRequests.push({ url, method: 'POST', query });
      return {
        body: {
          next_cursor: cursor === null ? 'cursor-1' : null,
          items: [
            {
              id: ACCOUNT,
              network_prefix: 0,
              metadata: {},
              owned_assets: 2,
              owned_nfts: 1,
              owned_domains: 1,
            },
          ],
        },
      };
    });

    await page.goto('/accounts?domain=wonderland.universal&limit=20');
    const domainFilter = page.getByLabel('Domain filter');
    await expect(domainFilter).toHaveValue('wonderland.universal');
    await expect
      .poll(() =>
        requestedAccountsCursor(accountRequests, { domain: 'wonderland.universal', cursor: null, limit: '20' })
      )
      .toBe(true);

    await domainFilter.fill('treasury.universal');
    await expect(page).toHaveURL(/\/accounts\?[^#]*domain=treasury\.universal/u);
    await expect(page).not.toHaveURL(/[?&]cursor=/u);
    await page.reload();
    await expect(page.getByLabel('Domain filter')).toHaveValue('treasury.universal');

    const nextPage = page.getByRole('button', { name: 'Next cursor page' });
    await nextPage.focus();
    await nextPage.press('Enter');
    await expect(page).toHaveURL(/[?&]cursor=cursor-1(?:&|$)/u);
    await expect
      .poll(() =>
        requestedAccountsCursor(accountRequests, { domain: 'treasury.universal', cursor: 'cursor-1', limit: '20' })
      )
      .toBe(true);
  });

  test('keeps adaptive identifiers on one line and exposes full identities through accessible controls', async ({ page }, testInfo) => {
    // Exact account from the captured Taira account list that exposed the split address.
    const accountId = 'testuﾛ1NiﾗNｼGﾜiｿｵ8ﾌVoXﾂﾅﾛTKﾏRｷi5ｹﾌﾊﾗﾍBﾁﾁPﾜpﾌDmQWB5Q6';
    await installHermeticApi(page, (url) => {
      if (url.pathname !== '/v1/explorer/accounts/query') return null;
      return {
        body: {
          next_cursor: null,
          items: [
            {
              id: accountId,
              network_prefix: 369,
              metadata: {},
              owned_assets: 2,
              owned_nfts: 1,
              owned_domains: 1,
            },
          ],
        },
      };
    });

    await page.goto('/accounts');

    const explorerTable = page.locator('.accounts-list-page .base-table');
    if (testInfo.project.name === 'mobile-chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await page.goto('/accounts');
        const card = explorerTable.getByRole('listitem');
        const address = card.locator('.accounts-list-page__mobile-row-id');
        const link = address.getByRole('link');
        await expect(card).toHaveCount(1);
        await expect(link).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        for (const width of [320, 390, 480, 640]) {
          await page.setViewportSize({ width, height: 844 });
          await expect(explorerTable).not.toHaveAttribute('role', 'table');
          await expect(explorerTable.getByRole('list')).toHaveCount(1);
          await expect(explorerTable.getByRole('columnheader')).toHaveCount(0);
          await expect(explorerTable.getByRole('cell')).toHaveCount(0);
          const keep = width < 640 ? 4 : 10;
          await expect(link).toHaveText(`${accountId.slice(0, keep)}...${accountId.slice(-keep)}`);
          await expect(link).toHaveAttribute('title', accountId);
          await expect(link).toHaveAttribute('href', `/accounts/${encodeURIComponent(accountId)}`);
          await expect(link.locator('br')).toHaveCount(0);
          const bounds = await address.evaluate((element) => {
            const row = element.parentElement!.getBoundingClientRect();
            const label = element.previousElementSibling!.getBoundingClientRect();
            const anchor = element.querySelector('a')!;
            const text = anchor.querySelector('span')!;
            const linkBox = anchor.getBoundingClientRect();
            const copy = element.querySelector('.base-hash__copy')!.getBoundingClientRect();
            const reveal = element.querySelector('.base-hash__reveal')!.getBoundingClientRect();
            const separated = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
            const range = document.createRange();
            range.selectNodeContents(text);
            const lineTops = new Set<number>();
            for (const rect of range.getClientRects()) lineTops.add(Math.round(rect.top));
            return {
              textLines: lineTops.size,
              noOverlap: separated(label, linkBox) && separated(linkBox, copy) && separated(copy, reveal) && separated(linkBox, reveal),
              withinRow: [linkBox, copy, reveal].every(box => box.left >= row.left && box.right <= row.right + 1),
              withinViewport: row.left >= 0 && [linkBox, copy, reveal].every(box => box.right <= document.documentElement.clientWidth),
              overflow: element.scrollWidth - element.clientWidth,
              controlsAccessible: [copy, reveal].every(box => box.width >= 44 && box.height >= 44),
            };
          });
          expect(bounds, `${colorScheme}/${width}`).toEqual({
            textLines: 1,
            noOverlap: true,
            withinRow: true,
            withinViewport: true,
            overflow: 0,
            controlsAccessible: true,
          });
        }

        const reveal = address.locator('.base-hash__reveal');
        await expect(reveal).toHaveAccessibleName('Show full identifier');
        await reveal.focus();
        await reveal.press('Enter');
        await expect(address.locator('.base-hash__full')).toHaveText(accountId);
        await expect(reveal).toHaveAttribute('aria-expanded', 'true');
        await expectNoDocumentOverflow(page);
        await reveal.press('Enter');
        await expect(address.locator('.base-hash__full')).toHaveCount(0);
        const copy = address.getByRole('button', { name: 'Copy identifier' });
        await copy.focus();
        await expect(copy).toBeFocused();
        await copy.press('Enter');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(accountId);
        await link.focus();
        await link.press('Enter');
        await expect(page).toHaveURL((url) => decodeURIComponent(url.pathname) === `/accounts/${accountId}`);
      }
      return;
    }

    await expect(explorerTable).toHaveAttribute('role', 'table');
    await expect(explorerTable.getByRole('columnheader')).toHaveCount(3);
    const dataRow = explorerTable.locator('.content-row--with-hover');
    await expect(dataRow.getByRole('cell')).toHaveCount(3);
    await expect(dataRow.getByRole('link')).toHaveCount(1);
    await expect(dataRow.getByRole('link')).toHaveText(`${accountId.slice(0, 10)}...${accountId.slice(-10)}`);
    const reveal = dataRow.locator('.base-hash__reveal');
    await expect(reveal).toHaveAccessibleName('Show full identifier');
    await reveal.focus();
    await reveal.press('Enter');
    await expect(dataRow.locator('.base-hash__full')).toHaveText(accountId);
    await expectNoDocumentOverflow(page);
    await reveal.press('Enter');
    await expect(dataRow.getByRole('link')).toHaveAttribute('title', accountId);
    await expect(dataRow.getByRole('link')).toHaveAttribute('href', `/accounts/${encodeURIComponent(accountId)}`);
  });
});
