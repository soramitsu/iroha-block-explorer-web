import { expect, test } from '@playwright/test';

// Select the test network explicitly before application startup.
test.beforeEach(async ({ page }) => {
  await page.route('**/config.json', route => route.fulfill({
    json: {
      toriiBaseUrl: 'https://taira.sora.org',
      toriiForceBaseUrl: true,
      networkId: `hash:${'AB'.repeat(32)}#B99E`,
      networkPrefix: 369,
    },
  }));
});

const GRAPH_STORAGE_KEY = 'kotodama_studio_graph_document_v2';

function dataTest(name: string): string {
  return `[data-test="${name}"]`;
}

test('builds and diagnoses a graph-first contract while deployment stays unavailable', async ({ page }) => {
  await page.goto('/studio');

  await expect(page.locator('.contract-graph-canvas')).toBeVisible();
  await expect(page.locator('.kotodama-graph-node--entrypoint').first()).toBeVisible();
  await expect(page.locator('.kotodama-graph-node--guard').first()).toBeVisible();
  await expect(page.locator('.kotodama-graph-node--effect').first()).toBeVisible();
  await expect(page.locator(dataTest('studio-source'))).toContainText('seiyaku StablecoinSimple');

  await page.getByRole('button', { name: 'State', exact: true }).click();
  await page.getByRole('button', { name: 'State', exact: true }).click();
  await expect(page.locator(dataTest('studio-semantic-diagnostics'))).toContainText('State "counter" is defined more than once.');
  await expect(page.locator(dataTest('studio-compile'))).toBeDisabled();

  await page.locator(dataTest('studio-semantic-diagnostics')).getByRole('button').first().click();
  await expect(page.locator(dataTest('studio-node-title'))).toHaveValue('State field');

  await page.getByLabel('State name').fill('counter_two');
  await expect(page.locator(dataTest('studio-semantic-diagnostics'))).toHaveCount(0);
  await expect(page.locator(dataTest('studio-source'))).toContainText('state int counter_two;');

  await expect(page.locator(dataTest('studio-deploy'))).toBeDisabled();
  await expect(page.locator(dataTest('studio-deployment-unavailable')))
    .toContainText('does not provide an approved browser signing and submission API');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), GRAPH_STORAGE_KEY);
  expect(stored).toContain('"version": 2');
});
