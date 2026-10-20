import { expect, test, type Page } from '@playwright/test';
import { serializeWorld } from '../pipeline/emit';
import { runPipeline } from '../pipeline/run';

const fixture = serializeWorld(runPipeline('fixtures/mini', null, '2026-10-20T00:00:00.000Z').world!);

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/world.json', (route) => route.fulfill({ body: fixture, contentType: 'application/json' }));
  await page.goto(`/${hash}`);
  await expect(page.locator('#stats')).toContainText('6 buildings');
  return errors;
}

test('draws the island without script errors', async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(1500);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#map canvas') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext;
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[3] > 0;
  });
  expect(painted).toBe(true);
  await expect(page.locator('.label-district', { hasText: 'Off-chain SDKs' })).toBeAttached();
  expect(errors).toEqual([]);
});

test('search finds a building and opens its panel with sources', async ({ page }) => {
  await open(page);
  await page.fill('#search-input', 'anvil');
  await page.locator('#search-results li').first().dispatchEvent('mousedown');
  const panel = page.locator('#panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('h2')).toHaveText('Anvil Lib');
  await expect(panel).toContainText('Hidden highway');
  await expect(panel.locator('.evidence a').first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page).toHaveURL(/#node=anvil-lib$/);
});

test('deep link opens a customer and following its ship sets the lens', async ({ page }) => {
  await open(page, '#customer=guild-of-scribes');
  const panel = page.locator('#panel');
  await expect(panel.locator('h2')).toHaveText('Guild of Scribes');
  await panel.getByRole('button', { name: /Follow this ship/ }).click();
  await expect(page.locator('.lens[data-lens="follow"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#lens-hint')).toContainText('Following Guild of Scribes');
});

test('stranded lens explains what it shows', async ({ page }) => {
  await open(page);
  await page.locator('.lens[data-lens="stranded"]').click();
  await expect(page.locator('#lens-hint')).toHaveText('1 buildings have no road to any active customer.');
});

test('list view lists every building and jumps back to the map', async ({ page }) => {
  await open(page);
  await page.click('#list-btn');
  const rows = page.locator('#list-table tbody tr');
  await expect(rows).toHaveCount(6);
  await page.getByRole('tab', { name: 'Roads' }).click();
  await expect(rows).toHaveCount(11);
  await page.getByRole('tab', { name: 'Buildings' }).click();
  await rows.filter({ hasText: 'Lonely Tool' }).click();
  await expect(page.locator('#listview')).toBeHidden();
  await expect(page.locator('#panel h2')).toHaveText('Lonely Tool');
  await expect(page.locator('#panel')).toContainText('Stranded');
});

test('shows the fog screen when the data cannot load', async ({ page }) => {
  await page.route('**/world.json', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.locator('#fog')).toBeVisible();
  await expect(page.locator('#fog-detail')).toContainText('503');
});

test('works at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.fill('#search-input', 'swap');
  await page.locator('#search-results li').first().dispatchEvent('mousedown');
  await expect(page.locator('#panel')).toBeVisible();
});
