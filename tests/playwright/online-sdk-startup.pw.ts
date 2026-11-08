import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import tairaHistory from '../fixtures/taira-history.json' with { type: 'json' };
import { startHistoryRecoveryServer } from '../helpers/history-recovery-server';

// These tests serve unchanged production bytes from the admitted local preview.
// Only runtime configuration and read-only Torii responses are controlled here.
// Application modules are never replaced by fixtures; no browser codec is required.
const EXPLORER_ORIGIN = 'https://taira-explorer.sora.org';
const TORII_ORIGIN = 'https://taira.sora.org';
const PREVIEW_ORIGIN = 'http://127.0.0.1:4175';
const READ_QUERY_PATHS = new Set(['/v1/explorer/blocks/query', '/v1/explorer/transactions/latest/query']);
const PROFILE = {
  toriiBaseUrl: TORII_ORIGIN,
  toriiForceBaseUrl: true,
  networkId: 'hash:97507E381726890C14F116C07577A26146286D6B2C2747F902FC08D8FBE4731D#DF02',
  networkPrefix: 369,
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self' ${TORII_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');
const EXPECTED_ERROR = 'The deployment configuration or application could not be loaded. Retry, or contact the deployment operator.';
const EXPECTED_CONSOLE_ERROR = '[bootstrap] Explorer initialization failed. Check deployment configuration and connectivity.';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

interface Observation {
  event: string
  url?: string
  method?: string
}

interface Scenario {
  profile?: Record<string, unknown>
  configGate?: ReturnType<typeof barrier>
  failFirstConfig?: boolean
  failApplicationModule?: boolean
  recoveryServer?: Awaited<ReturnType<typeof startHistoryRecoveryServer>>
}

async function installScenario(page: Page, scenario: Scenario = {}) {
  const explorerOrigin = scenario.recoveryServer ? PREVIEW_ORIGIN : EXPLORER_ORIGIN;
  const toriiOrigin = scenario.recoveryServer?.origin ?? TORII_ORIGIN;
  const contentSecurityPolicy = scenario.recoveryServer ? CSP.replace(TORII_ORIGIN, toriiOrigin) : CSP;
  const observations: Observation[] = [];
  const apiRequests: { url: string, method: string }[] = [];
  const unexpectedRequests: string[] = [];
  const pageErrors: string[] = [];
  const bootstrapErrors: string[] = [];
  let configRequests = 0;
  let wasmRequests = 0;
  let failedModules = 0;
  let configReady = false;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('[bootstrap]')) bootstrapErrors.push(message.text());
  });
  await page.routeWebSocket('**/*', async (socket) => {
    unexpectedRequests.push(`Unexpected WebSocket blocked: ${socket.url()}`);
    await socket.close({ code: 1008, reason: 'No WebSocket is part of the startup gate.' });
  });
  async function fulfillToriiRead(route: Route, url: URL) {
    const request = route.request();
    const method = request.method();
    apiRequests.push({ url: url.href, method });
    observations.push({ event: 'api-request', url: url.href, method });
    const headers = {
      'access-control-allow-origin': EXPLORER_ORIGIN,
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
    };
    if (method === 'OPTIONS') return await route.fulfill({ status: 204, headers });
    if (READ_QUERY_PATHS.has(url.pathname)) {
      expect(method).toBe('POST');
      expect(url.search).toBe('');
      expect(Object.keys(request.postDataJSON()).every(key => ['filter', 'limit', 'cursor'].includes(key))).toBe(true);
    }
    if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && READ_QUERY_PATHS.has(url.pathname))) {
      unexpectedRequests.push(`Ledger write blocked: ${method} ${url.href}`);
      return await route.abort('blockedbyclient');
    }
    if (url.pathname === '/v1/explorer/blocks/query') {
      return await route.fulfill({
        contentType: 'application/json', headers,
        body: JSON.stringify(tairaHistory.blocks),
      });
    }
    if (url.pathname === '/v1/explorer/transactions/latest/query') {
      return await route.fulfill({
        contentType: 'application/json', headers,
        body: JSON.stringify(tairaHistory.latestTransactions),
      });
    }
    if (url.pathname === '/v1/telemetry/live' || url.pathname === '/v1/explorer/blocks/stream'
      || url.pathname === '/v1/explorer/transactions/stream') {
      // These startup checks do not claim live telemetry availability.
      return await route.fulfill({ status: 204, headers });
    }
    unexpectedRequests.push(`Unreviewed Torii read: ${method} ${url.href}`);
    return await route.fulfill({ status: 404, contentType: 'application/json', headers, body: '{}' });
  }
  // Browser routing disables its HTTP cache, and the project blocks service
  // workers. Every actual module load must therefore cross this boundary.
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === toriiOrigin) {
      if (!scenario.recoveryServer) return await fulfillToriiRead(route, url);
      apiRequests.push({ url: url.href, method });
      observations.push({ event: 'api-request', url: url.href, method });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !(method === 'POST' && READ_QUERY_PATHS.has(url.pathname))) {
        unexpectedRequests.push(`Ledger write blocked: ${method} ${url.href}`);
        return await route.abort('blockedbyclient');
      }
      // Preserve a real streaming response and the browser's own EventSource.
      // route.fulfill would buffer/close SSE and would not test OPEN recovery.
      return await route.continue();
    }
    if (url.origin !== explorerOrigin || method !== 'GET') {
      unexpectedRequests.push(`Unexpected request blocked: ${method} ${url.href}`);
      return await route.abort('blockedbyclient');
    }
    if (url.pathname === '/config.json') {
      configRequests += 1;
      observations.push({ event: 'config-request', url: url.href });
      await scenario.configGate?.promise;
      if (scenario.failFirstConfig && configRequests === 1) {
        return await route.fulfill({ status: 503, body: 'Controlled config failure' });
      }
      configReady = true;
      observations.push({ event: 'config-response', url: url.href });
      return await route.fulfill({
        contentType: 'application/json', headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(scenario.profile ?? PROFILE),
      });
    }
    if (url.pathname.endsWith('.wasm')) {
      wasmRequests += 1;
      unexpectedRequests.push(`Prohibited browser codec requested: ${url.href}`);
      return await route.abort('blockedbyclient');
    }
    if (scenario.failApplicationModule && configReady && url.pathname.endsWith('.js')) {
      failedModules += 1;
      observations.push({ event: 'module-request-failed', url: url.href });
      return await route.abort('failed');
    }
    // Fetch only from the fixed local Vite production preview. Disallow
    // redirects so a static response cannot cause an unobserved remote fetch.
    const response = await route.fetch({ url: `${PREVIEW_ORIGIN}${url.pathname}${url.search}`, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.body();
    const headers: Record<string, string> = { ...response.headers(), 'cache-control': 'no-store' };
    if (request.isNavigationRequest()) headers['content-security-policy'] = contentSecurityPolicy;
    // The application/module body is exactly the local production body;
    // the test adds only the deployment CSP and cache policy headers.
    await route.fulfill({ response, body, headers });
  });
  return {
    observations, apiRequests, unexpectedRequests, pageErrors, bootstrapErrors, contentSecurityPolicy,
    get configRequests() { return configRequests; },
    get wasmRequests() { return wasmRequests; },
    get failedModules() { return failedModules; },
  };
}

type InstalledScenario = Awaited<ReturnType<typeof installScenario>>;

async function expectNotMounted(page: Page, state: InstalledScenario) {
  await expect(page.locator('#app[data-v-app]')).toHaveCount(0);
  await expect(page.locator('.latest-transactions__row')).toHaveCount(0);
  expect(state.apiRequests).toEqual([]);
}

async function expectReady(page: Page, state: InstalledScenario) {
  await expect(page.getByTestId('explorer-loading')).toHaveCount(0);
  await expect(page.locator('#app[data-v-app]')).toHaveCount(1);
  await expect(page.locator(`a[href="/transactions/${tairaHistory.latestTransactions.items[0].hash}"]`)).toBeVisible();
  await expect(page.locator('.latest-blocks__row').first()).toContainText(String(tairaHistory.blocks.items[0].height));
  expect(state.apiRequests.some(request => new URL(request.url).pathname === '/v1/explorer/transactions/latest/query')).toBe(true);
  expect(state.unexpectedRequests).toEqual([]);
  expect(state.pageErrors).toEqual([]);
  expect(state.wasmRequests).toBe(0);
  const configResponse = state.observations.findIndex(item => item.event === 'config-response');
  const firstApiRequest = state.observations.findIndex(item => item.event === 'api-request');
  expect(configResponse).toBeGreaterThan(-1);
  expect(firstApiRequest).toBeGreaterThan(configResponse);
}

async function attachObservations(testInfo: TestInfo, state: InstalledScenario) {
  await testInfo.attach('online-sdk-startup-observations', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(state, null, 2)),
  });
}

test('validates the Taira profile before mounting or Torii reads without a browser codec', async ({ page }, testInfo) => {
  const configGate = barrier();
  const state = await installScenario(page, { configGate });
  try {
    const documentResponse = await page.goto(EXPLORER_ORIGIN, { waitUntil: 'domcontentloaded' });
    expect(documentResponse?.headers()['content-security-policy']).toBe(CSP);
    expect(CSP).not.toContain("'unsafe-eval'");
    expect(CSP).not.toContain("'wasm-unsafe-eval'");
    await expect(page.getByTestId('explorer-loading')).toBeVisible();
    await expect.poll(() => state.configRequests).toBe(1);
    await expectNotMounted(page, state);
    expect(state.wasmRequests).toBe(0);
    configGate.release();
    await expectReady(page, state);
    expect(state.bootstrapErrors).toEqual([]);
  } finally {
    configGate.release();
    await attachObservations(testInfo, state);
  }
});

test('retries failed configuration explicitly and mounts only after a valid response', async ({ page }, testInfo) => {
  const state = await installScenario(page, { failFirstConfig: true });
  try {
    await page.goto(EXPLORER_ORIGIN, { waitUntil: 'domcontentloaded' });
    const alert = page.getByRole('alert');
    await expect(alert.getByRole('heading', { name: 'Explorer could not start' })).toBeVisible();
    await expect(alert.locator('p')).toHaveText(EXPECTED_ERROR);
    await expectNotMounted(page, state);
    expect(state.configRequests).toBe(1);
    expect(state.bootstrapErrors).toEqual([EXPECTED_CONSOLE_ERROR]);
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expectReady(page, state);
    expect(state.configRequests).toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await attachObservations(testInfo, state);
  }
});

test('failed application modules expose a safe error and leave explicit retry available', async ({ page }, testInfo) => {
  const state = await installScenario(page, { failApplicationModule: true });
  try {
    await page.goto(EXPLORER_ORIGIN, { waitUntil: 'domcontentloaded' });
    const alert = page.getByRole('alert');
    await expect(alert.getByRole('heading', { name: 'Explorer could not start' })).toBeVisible();
    await expect(alert.locator('p')).toHaveText(EXPECTED_ERROR);
    await expectNotMounted(page, state);
    expect(state.failedModules).toBeGreaterThan(0);
    expect(state.wasmRequests).toBe(0);
    expect(state.bootstrapErrors).toEqual([EXPECTED_CONSOLE_ERROR]);
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
    await expectNotMounted(page, state);
    expect(state.bootstrapErrors).toEqual([EXPECTED_CONSOLE_ERROR, EXPECTED_CONSOLE_ERROR]);
    expect(state.configRequests).toBe(1);
    expect(state.unexpectedRequests).toEqual([]);
  } finally {
    await attachObservations(testInfo, state);
  }
});

test('recovers failed initial history while a real HTTP transaction stream stays open without events', async ({ page }, testInfo) => {
  const peer = await startHistoryRecoveryServer(PREVIEW_ORIGIN);
  const networkDiagnostics: string[] = [];
  page.on('requestfailed', request => networkDiagnostics.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on('console', message => {
    if (message.type() === 'error') networkDiagnostics.push(message.text());
  });
  const state = await installScenario(page, {
    recoveryServer: peer,
    // Explicit local test peer; the production-host profile remains covered
    // unchanged by the other scenarios and the separate live Taira run.
    profile: { ...PROFILE, toriiBaseUrl: peer.origin },
  });
  try {
    // Chrome requires permission for an actual loopback peer. Grant it only to
    // this fresh test context and this local origin, with all request guards intact.
    await page.context().grantPermissions(['local-network-access'], { origin: PREVIEW_ORIGIN });
    const firstHistory = page.waitForResponse(response =>
      response.url().startsWith(`${peer.origin}/v1/explorer/transactions/latest/query`) && response.status() === 500,
    { timeout: 10_000 });
    const documentResponse = await page.goto(PREVIEW_ORIGIN, { waitUntil: 'domcontentloaded' });
    expect(documentResponse?.headers()['content-security-policy']).toBe(state.contentSecurityPolicy);
    await (await firstHistory).finished();
    await expect(page.locator('.latest-transactions_loading')).toHaveCount(0);
    await expect(page.locator('.latest-transactions__row')).toHaveCount(0);
    await expect(page.locator('.latest-transactions [role="alert"]')).toBeVisible();
    expect(peer.latestRequests).toBe(1);
    await expect.poll(() => peer.connectedStreams).toBe(1);
    const streamResponse = page.waitForResponse(response =>
      response.url() === `${peer.origin}/v1/explorer/transactions/stream` && response.status() === 200,
    { timeout: 10_000 });
    peer.openTransactionStream();
    expect((await streamResponse).headers()['content-type']).toBe('text/event-stream');
    await expect(page.locator('.latest-transactions__row')).toHaveCount(tairaHistory.latestTransactions.items.length, { timeout: 15_000 });
    await expect(page.locator(`.latest-transactions a[href="/transactions/${tairaHistory.latestTransactions.items[0].hash}"]`)).toBeVisible();
    await expect(page.locator('.latest-transactions [role="alert"]')).toHaveCount(0);
    expect(peer.latestRequests).toBeGreaterThanOrEqual(2);
    expect(peer.connectedStreams).toBe(1);
    expect(peer.openedStreams).toBe(1);
    expect(peer.transactionEventsSent).toBe(0);
    expect(peer.requests.filter(request => request.path.startsWith('/v1/explorer/transactions/latest/query')).map(request => request.status))
      .toEqual([500, 200]);
    expect(peer.unexpectedRequests).toEqual([]);
    expect(state.unexpectedRequests).toEqual([]);
    expect(state.pageErrors).toEqual([]);
    expect(state.bootstrapErrors).toEqual([]);
    expect(state.wasmRequests).toBe(0);
  } finally {
    await testInfo.attach('real-http-history-recovery', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        requests: peer.requests, connectedStreams: peer.connectedStreams, openedStreams: peer.openedStreams,
        transactionEventsSent: peer.transactionEventsSent, unexpectedRequests: peer.unexpectedRequests,
        localNetworkPermissionOrigin: PREVIEW_ORIGIN, networkDiagnostics,
      }, null, 2)),
    });
    await attachObservations(testInfo, state);
    await page.close();
    await peer.close();
  }
});

for (const [name, profile] of [
  ['missing network prefix', { toriiBaseUrl: TORII_ORIGIN, toriiForceBaseUrl: true, networkId: PROFILE.networkId }],
  ['wrong network prefix', { ...PROFILE, networkPrefix: 0 }],
  ['extra failover setting', { ...PROFILE, toriiFailoverEnabled: true }],
] as const) {
  test(`invalid production profile (${name}) starts no application API consumers`, async ({ page }, testInfo) => {
    const state = await installScenario(page, { profile });
    try {
      await page.goto(EXPLORER_ORIGIN, { waitUntil: 'domcontentloaded' });
      const alert = page.getByRole('alert');
      await expect(alert.getByRole('heading', { name: 'Explorer could not start' })).toBeVisible();
      await expect(alert.locator('p')).toHaveText(EXPECTED_ERROR);
      await expectNotMounted(page, state);
      expect(state.configRequests).toBe(1);
      expect(state.wasmRequests).toBe(0);
      expect(state.bootstrapErrors).toEqual([EXPECTED_CONSOLE_ERROR]);
      expect(state.unexpectedRequests).toEqual([]);
      expect(state.pageErrors).toEqual([]);
    } finally {
      await attachObservations(testInfo, state);
    }
  });
}
