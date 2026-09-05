import { expect, test, type Page, type Route } from '@playwright/test';

const HASH = '0301b76be6d3dead32484180986523173082d770bc4fd954760d0a74a434624f';
const PARTIAL_HASH = `${'a'.repeat(63)}b`;
const FAILURE_HASH = 'b'.repeat(64);
const ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const DESTINATION = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const ASSET_DEFINITION = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const CREATED_AT = '2026-07-21T12:00:00.000Z';

interface MockResponse {
  status?: number
  body?: unknown
  contentType?: string
}

type MockResolver = (url: URL) => MockResponse | null;

const emptyHistoryPage = (url: URL) => {
  const limit = Number(url.searchParams.get('limit') ?? 10);
  return {
    pagination: {
      limit,
      snapshot_height: 42,
      snapshot_hash: 'd'.repeat(64),
      next_cursor: null,
      has_more: false,
    },
    items: [],
  };
};

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
    executable_payload: { instruction_count: 1 },
    status: 'Committed',
    rejection_reason: null,
    metadata: { purpose: 'hermetic quality gate' },
    nonce: 7,
    signature: 'ed0120-hermetic-signature',
    time_to_live: null,
  };
}

function transferInstruction() {
  return {
    authority: ACCOUNT,
    created_at: CREATED_AT,
    kind: 'Transfer',
    index: 0,
    box: {
      encoded: '0x01',
      framed_sha256: `0x${'e'.repeat(64)}`,
      json: {
        kind: 'Transfer',
        wire_id: 'iroha_data_model::isi::TransferBox',
        encoded: '01',
        payload: {
          variant: 'Asset',
          value: {
            source: `${ASSET_DEFINITION}#${ACCOUNT}`,
            object: '100000',
            destination: DESTINATION,
          },
        },
      },
    },
    transaction_hash: HASH,
    transaction_status: 'Committed',
    block: 42,
  };
}

async function installHermeticApi(page: Page, resolver: MockResolver, requests: URL[] = []) {
  await page.route('**/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if ([
      '/v1/telemetry/live',
      '/v1/explorer/transactions/stream',
      '/v1/explorer/instructions/stream',
    ].includes(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ': hermetic keepalive\n\n',
      });
      return;
    }
    const response = resolver(url);
    if (response === null) {
      await route.abort('failed');
      throw new Error(`Unexpected hermetic Explorer request: ${url.pathname}${url.search}`);
    }
    await route.fulfill({
      status: response.status ?? 200,
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
  if (url.pathname === '/v1/explorer/blocks') return { body: emptyHistoryPage(url) };
  if (url.pathname === '/v1/explorer/transactions/latest') {
    return { body: { sampled_at: CREATED_AT, ...emptyHistoryPage(url) } };
  }
  return null;
}

function countTransactionRequests(requests: URL[], hash: string): number {
  return requests.filter((url) => (
    url.pathname.endsWith(hash) && url.pathname.includes('/transactions/')
  )).length;
}

function requestedInstructionKind(requests: URL[], kind: string): boolean {
  return requests.some((url) => (
    url.pathname === '/v1/explorer/instructions' && url.searchParams.get('kind') === kind
  ));
}

function requestedAccountsCursor(
  requests: URL[],
  expected: { domain: string, cursor: string | null, limit: string }
): boolean {
  return requests.some((url) => (
    url.searchParams.get('domain') === expected.domain
    && url.searchParams.get('cursor') === expected.cursor
    && url.searchParams.get('limit') === expected.limit
  ));
}

test.describe('hermetic Explorer quality gates', () => {
  test('normalizes an exact hash search and renders both exact matches', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await installHermeticApi(page, exactSearchResolver);
    await page.goto('/');

    const search = page.locator('.app-header__search input[type="search"]');
    await search.fill(`0x${HASH.toUpperCase()}`);
    await search.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${HASH}$`, 'u'));
    await expect(page.locator('[data-test="search-results-query"]')).toHaveText(HASH);
    await expect(page.locator('[data-test="search-result-block"]')).toContainText('Block');
    await expect(page.locator('[data-test="search-result-transaction"]')).toContainText('Transaction');
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('keeps a successful probe visible on partial failure and exposes a full failure retry', async ({ page }) => {
    const requests: URL[] = [];
    await installHermeticApi(page, exactSearchResolver, requests);

    await page.goto(`/search?q=${PARTIAL_HASH}`);
    await expect(page.locator('[data-test="search-result-block"]')).toBeVisible();
    await expect(page.locator('[data-test="search-result-transaction-notice"]')).toHaveAttribute('role', 'alert');
    const partialFailure = page.locator('[data-test="search-result-transaction-notice"]');
    await expect(partialFailure)
      .toContainText('Transaction lookup failed: the Explorer API returned an invalid response.');
    await expect(partialFailure).not.toContainText('transaction index unavailable');
    expect(countTransactionRequests(requests, PARTIAL_HASH)).toBe(1);

    await page.locator('[data-test="search-results-partial-retry"]').click();
    await expect.poll(() => countTransactionRequests(requests, PARTIAL_HASH)).toBe(2);

    await page.goto(`/search?q=${FAILURE_HASH}`);
    const fullFailure = page.locator('[data-test="search-results-error"]');
    await expect(fullFailure)
      .toContainText('The exact lookup could not be completed: the Explorer API returned an invalid response');
    await expect(fullFailure).not.toContainText('exact index unavailable');
    await expect(page.locator('[data-test="resource-retry"]')).toHaveText('Retry exact lookup');
  });

  test('shows semantic, raw, and unavailable evidence states and supports keyboard tabs', async ({ page }, testInfo) => {
    const instruction = transferInstruction();
    const requests: URL[] = [];
    await installHermeticApi(page, (url) => {
      if (url.pathname === `/v1/explorer/transactions/${HASH}`) return { body: transaction() };
      if (url.pathname === '/v1/explorer/blocks/42') return { body: block(HASH) };
      if (url.pathname === '/v1/explorer/instructions') {
        const limit = Number(url.searchParams.get('limit') ?? 10);
        return {
          body: {
            pagination: {
              limit,
              snapshot_height: 42,
              snapshot_hash: 'd'.repeat(64),
              next_cursor: null,
              has_more: false,
            },
            items: [instruction],
          },
        };
      }
      if (url.pathname === `/v1/explorer/instructions/${HASH}/0`) return { body: instruction };
      if (
        url.pathname === `/v1/ledger/block/42/proof/${HASH}`
        || url.pathname === '/v1/ledger/state/42'
        || url.pathname === '/v1/ledger/state-proof/42'
      ) return { status: 404, body: { message: 'evidence unavailable in fixture node' } };
      return null;
    }, requests);

    await page.goto(`/transactions/${HASH}?instruction=0`);

    await expect(page.locator('[data-test="instruction-semantic-card"]').first()).toContainText('Asset transfer');
    await expect(page.locator('[data-test="instruction-semantic-field-amount"] dd').first()).toHaveText('100000');
    await expect(page.locator('[data-test="instruction-encoded-payload"]'))
      .toHaveText('0x01');
    await expect(page.locator('.instructions-detail__json')).toContainText('Raw instruction JSON');
    await expect(page.locator('[data-test="block-proof-unavailable"]')).toBeVisible();
    await expect(page.locator('[data-test="state-proof-unavailable"]')).toBeVisible();
    await expect(page.getByText("This node has no state root at the transaction's block height.")).toBeVisible();
    await expect(page.getByText('Node-provided · BLS not verified here')).toBeVisible();

    await expect(page.locator('.transaction-details__technical')).not.toHaveAttribute('open', '');
    const overflow = await page.locator('#main-content').evaluate((element) => {
      const elements = [];
      for (const child of element.querySelectorAll('*')) {
        const rect = child.getBoundingClientRect();
        if (rect.right > innerWidth && elements.length < 20) elements.push({ tag: child.tagName, class: child.className, right: rect.right, width: rect.width });
      }
      return { width: element.clientWidth, scrollWidth: element.scrollWidth, elements };
    });
    expect(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow)).toBe(true);
    const tabsBounds = await page.getByRole('tablist').boundingBox();
    expect(tabsBounds!.x + tabsBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      await page.screenshot({ path: testInfo.outputPath(`transaction-${theme}.png`) });
    }

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    await allTab.focus();
    await allTab.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Register', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => requestedInstructionKind(requests, 'Register')).toBe(true);
  });

  test('restores URL filters and activates cursor pagination from the keyboard', async ({ page }) => {
    const accountRequests: URL[] = [];
    await installHermeticApi(page, (url) => {
      if (url.pathname !== '/v1/explorer/accounts') return null;
      const cursor = url.searchParams.get('cursor');
      const limit = Number(url.searchParams.get('limit') ?? 10);
      accountRequests.push(url);
      return {
        body: {
          pagination: {
            limit,
            next_cursor: cursor === null ? 'cursor-1' : null,
            has_more: cursor === null,
          },
          items: [{
            id: ACCOUNT,
            network_prefix: 0,
            metadata: {},
            owned_assets: 2,
            owned_nfts: 1,
            owned_domains: 1,
          }],
        },
      };
    });

    await page.goto('/accounts?domain=wonderland.universal&limit=20');
    const domainFilter = page.getByLabel('Domain filter');
    await expect(domainFilter).toHaveValue('wonderland.universal');
    await expect.poll(() => requestedAccountsCursor(
      accountRequests,
      { domain: 'wonderland.universal', cursor: null, limit: '20' }
    )).toBe(true);

    await domainFilter.fill('treasury.universal');
    await expect(page).toHaveURL(/\/accounts\?[^#]*domain=treasury\.universal/u);
    await expect(page).not.toHaveURL(/[?&]cursor=/u);
    await page.reload();
    await expect(page.getByLabel('Domain filter')).toHaveValue('treasury.universal');

    const nextPage = page.getByRole('button', { name: 'Next cursor page' });
    await nextPage.focus();
    await nextPage.press('Enter');
    await expect(page).toHaveURL(/[?&]cursor=cursor-1(?:&|$)/u);
    await expect.poll(() => requestedAccountsCursor(
      accountRequests,
      { domain: 'treasury.universal', cursor: 'cursor-1', limit: '20' }
    )).toBe(true);
  });

  test('renders the exact public VPN profile without scraping operator diagnostics', async ({ page }) => {
    const requests: URL[] = [];
    const allRequestPaths: string[] = [];
    page.on('request', (request) => allRequestPaths.push(new URL(request.url()).pathname));
    await installHermeticApi(page, (url) => {
      if (url.pathname !== '/v1/vpn/profile') return null;
      return {
        body: {
          available: true,
          relay_endpoint: '/dns/relay.example/udp/9443/quic',
          supported_exit_classes: ['standard', 'low-latency', 'high-security'],
          default_exit_class: 'standard',
          lease_secs: 3_600,
          dns_push_interval_secs: 60,
          meter_family: 'soranet-v1',
          route_pushes: ['0.0.0.0/0', '::/0'],
          excluded_routes: ['10.0.0.0/8'],
          dns_servers: ['1.1.1.1'],
          tunnel_addresses: ['10.10.0.2/32'],
          mtu_bytes: 1_280,
          display_billing_label: 'standard · soranet-v1 · 1 XOR',
          operator_account_id: ACCOUNT,
          lease_fee: '1',
          settlement_grace_secs: 300,
          flow_label_bits: 24,
          padding_budget_ms: 250,
          relay_id_hex: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
          relay_mldsa65_public_key_hex: '5a'.repeat(1_952),
          descriptor_commit_hex: 'cd'.repeat(32),
          tls_server_name: 'relay.example',
          relay_tls_spki_sha256_hex: 'ab'.repeat(32),
          relay_certificate_sha256_hex: 'ef'.repeat(32),
          directory_snapshot_digest_hex: '42'.repeat(32),
        },
      };
    }, requests);

    await page.goto('/vpn');

    await expect(page.locator('[data-test="vpn-public-profile"]')).toBeVisible();
    await expect(page.locator('[data-test="vpn-profile-relay"]'))
      .toContainText('/dns/relay.example/udp/9443/quic');
    await expect(page.locator('[data-test="vpn-profile-exit-classes"]'))
      .toContainText('standard · low-latency · high-security');
    await expect(page.locator('[data-test="vpn-profile-tls"]')).toContainText('relay.example');
    expect(requests.filter((url) => url.pathname === '/v1/vpn/profile')).toHaveLength(1);
    expect(allRequestPaths.filter((path) => (
      path === '/metrics'
      || path.endsWith('/metrics')
      || path === '/status'
      || path.startsWith('/status/')
      || path.endsWith('/status')
      || path.includes('/sumeragi/')
    ))).toEqual([]);
  });

  test('uses a multi-column table on desktop and a card list on mobile', async ({ page }, testInfo) => {
    await installHermeticApi(page, (url) => {
      if (url.pathname !== '/v1/explorer/accounts') return null;
      const limit = Number(url.searchParams.get('limit') ?? 10);
      return {
        body: {
          pagination: {
            limit,
            next_cursor: null,
            has_more: false,
          },
          items: [{
            id: ACCOUNT,
            network_prefix: 0,
            metadata: {},
            owned_assets: 2,
            owned_nfts: 1,
            owned_domains: 1,
          }],
        },
      };
    });

    await page.goto('/accounts');

    const explorerTable = page.locator('.accounts-list-page .base-table');
    if (testInfo.project.name === 'mobile-chromium') {
      await expect(explorerTable).not.toHaveAttribute('role', 'table');
      await expect(explorerTable.getByRole('list')).toHaveCount(1);
      await expect(explorerTable.getByRole('listitem')).toHaveCount(1);
      await expect(explorerTable.getByRole('columnheader')).toHaveCount(0);
      await expect(explorerTable.getByRole('cell')).toHaveCount(0);
      const copy = explorerTable.getByRole('button', { name: 'Copy identifier' });
      const reveal = explorerTable.getByRole('button', { name: 'Show full identifier' });
      for (const action of [copy, reveal]) {
        const box = await action.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await reveal.focus();
      await reveal.press('Enter');
      await expect(explorerTable.locator('.base-hash__full')).toHaveText(ACCOUNT);
      await expect(explorerTable.getByRole('link')).toHaveCount(1);
      await expect(explorerTable.getByRole('button', { name: 'Hide full identifier' })).toHaveAttribute('aria-expanded', 'true');
      return;
    }

    await expect(explorerTable).toHaveAttribute('role', 'table');
    await expect(explorerTable.getByRole('columnheader')).toHaveCount(3);
    const dataRow = explorerTable.locator('.content-row--with-hover');
    await expect(dataRow.getByRole('cell')).toHaveCount(3);
    await expect(dataRow.getByRole('link')).toHaveCount(1);
  });
});
