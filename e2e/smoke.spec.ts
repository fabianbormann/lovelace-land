import { expect, test, type Page } from '@playwright/test';
import { serializeWorld } from '../pipeline/emit';
import { runPipeline } from '../pipeline/run';

const fixture = serializeWorld(runPipeline('fixtures/mini', null, '2026-10-20T00:00:00.000Z').world!);

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('pageerror', e.stack);
  });
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
  await expect(page.locator('#lens-hint')).toHaveText('3 buildings have no road to any active customer in Oct 2026.');
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

test('without WebGL the list view is the map and its details panel sits on top', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : (original as Function).call(this, type, ...rest);
    } as typeof original;
  });
  await open(page);
  await expect(page.locator('#listview')).toBeVisible();
  await expect(page.locator('#list-note')).toContainText('WebGL');
  await page.locator('#list-table tbody tr', { hasText: 'Anvil Lib' }).click();
  const panel = page.locator('#panel');
  await expect(panel.locator('h2')).toHaveText('Anvil Lib');
  const onTop = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 40));
  });
  expect(onTop).toBe(true);
});

test('keyboard users keep focus when following a ship and opening results', async ({ page }) => {
  await open(page, '#customer=harbor-traders');
  const follow = page.getByRole('button', { name: /Follow this ship/ });
  await follow.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#lens-hint')).toContainText('Following Harbor Traders');
  await expect(follow).toBeFocused();
  await page.fill('#search-input', 'mill');
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h2')).toBeFocused();
  await page.locator('#search-input').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel h2')).toHaveText('Mill Indexer');
});

test('an unknown deep link is ignored', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (location.hash = '#node=does-not-exist'));
  await page.waitForTimeout(300);
  await expect(page.locator('#panel')).toBeHidden();
});

test('the time axis moves the island to an earlier month', async ({ page }) => {
  await open(page, '#customer=harbor-traders');
  await expect(page.locator('#tl-month')).toHaveText('Oct 2026');
  await expect(page.locator('#panel .state-line')).toContainText('Away in Oct 2026');
  const slider = page.locator('#tl-slider');
  await slider.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tl-month')).toHaveText('Jul 2026');
  await expect(page.locator('#panel .state-line')).toHaveText('Docked in Jul 2026 with 999 transactions through the products it uses.');
  await expect(page.locator('#stats')).toContainText('ships docked');
  await page.click('#tl-now');
  await expect(page.locator('#tl-month')).toHaveText('Oct 2026');
});

test('playback keeps focus inside the details panel', async ({ page }) => {
  await open(page, '#node=anvil-lib');
  await page.click('#tl-speed');
  const link = page.locator('#panel .evidence a').first();
  await link.focus();
  await page.evaluate(() => (document.querySelector('#tl-play') as HTMLButtonElement).click());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.activeElement?.closest('#panel') !== null)).toBe(true);
  await page.evaluate(() => (document.querySelector('#tl-play') as HTMLButtonElement).click());
});

test('on a phone the open panel leaves the timeline usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '#node=anvil-lib');
  await expect(page.locator('#panel')).toBeVisible();
  const free = await page.evaluate(() => {
    const r = document.querySelector('#tl-slider')!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit?.id === 'tl-slider';
  });
  expect(free).toBe(true);
});
