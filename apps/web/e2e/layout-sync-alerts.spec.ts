import { expect, test } from '@playwright/test';
import { isPhone, openApp, waitForChart, MOCK } from './helpers';

test.describe('layouts, watchlist, sync and alerts', () => {
  test('multi-chart layouts on Mac/iPad, quick switch on iPhone', async ({ page }) => {
    await openApp(page);
    if (await isPhone(page)) {
      await page.getByTestId('layouts-button').click();
      await page.getByTestId('sheet-grid-2h').click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('chart-grid')).toHaveAttribute('data-grid', 'phone');
      await expect(page.getByRole('tab', { name: /2 ·/ })).toBeVisible();
      await page.getByRole('tab', { name: /2 ·/ }).click();
      await waitForChart(page);
      await expect(page.getByTestId('chart-panel')).toHaveCount(1);
      return;
    }
    await page.getByTestId('grid-2h').click();
    await expect(page.getByTestId('chart-panel')).toHaveCount(2);
    await page.getByTestId('grid-4').click();
    await expect(page.getByTestId('chart-panel')).toHaveCount(4);
    for (const panel of await page.getByTestId('chart-panel').all()) {
      await expect(panel.getByTestId('chart-loading')).toHaveCount(0, { timeout: 30_000 });
      await expect(panel.locator('canvas').first()).toBeVisible();
    }
    // Activate the second chart and change its symbol only.
    await page.getByTestId('chart-panel').nth(1).getByTestId('symbol-button').click();
    await page.getByTestId('symbol-search-input').fill('NVDA');
    await page.locator('[data-testid="symbol-result"][data-symbol="NASDAQ:NVDA"]').first().click();
    await expect(page.getByTestId('chart-view').nth(1)).toHaveAttribute('data-symbol', 'NASDAQ:NVDA');
    await expect(page.getByTestId('chart-view').nth(0)).toHaveAttribute('data-symbol', 'BINANCE:BTCUSDT');
    await page.getByTestId('grid-1').click();
    await expect(page.getByTestId('chart-panel')).toHaveCount(1);
  });

  test('saves a layout and syncs it to a second session (same account storage)', async ({ page, context }) => {
    await openApp(page);
    // The compact phone toolbar hides 1D behind the timeframe menu.
    await page.getByTestId('tf-more').first().click();
    await page.getByTestId('tf-menu-1D').first().click();
    await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-timeframe', '1D');
    await page.getByTestId('layouts-button').click();
    await page.getByTestId('layout-name').fill('Daily BTC');
    await page.getByTestId('layout-save').click();
    await expect(page.locator('[data-testid="layout-row"][data-layout-name="Daily BTC"]')).toBeVisible();
    await page.keyboard.press('Escape');
    // Second session: a new tab sharing the account's persisted state (local storage in mock mode, Supabase when signed in).
    const page2 = await context.newPage();
    await page2.goto(`/${MOCK}`);
    await page2.getByTestId('layouts-button').click();
    await expect(page2.locator('[data-testid="layout-row"][data-layout-name="Daily BTC"]')).toBeVisible();
    await page2.locator('[data-testid="layout-row"][data-layout-name="Daily BTC"]').click();
    await expect(page2.getByTestId('chart-view').first()).toHaveAttribute('data-timeframe', '1D');
    await page2.close();
  });

  test('watchlist shows live prices and adds a symbol', async ({ page }) => {
    await openApp(page);
    const phone = await isPhone(page);
    if (phone) await page.getByTestId('tab-watchlist').click();
    const rows = page.getByTestId('watchlist-row');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByTestId('watch-price')).not.toHaveText('—', { timeout: 15_000 });
    await expect(rows.first().getByTestId('watch-change')).toContainText('%');
    await page.getByTestId('watchlist-add').click();
    await page.getByTestId('symbol-search-input').fill('XAGUSD');
    await page.locator('[data-testid="symbol-result"][data-symbol="METALS:XAGUSD"]').first().click();
    await expect(page.getByTestId('toast').filter({ hasText: 'added' })).toBeVisible();
    if (!phone) {
      await rows.filter({ hasText: 'ETHUSDT' }).first().click();
      await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-symbol', 'BINANCE:ETHUSDT');
    }
  });

  test('creates an alert and triggers it', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('alert-button').first().click();
    await expect(page.getByTestId('alert-symbol')).toHaveValue('BINANCE:BTCUSDT');
    // "Greater than 1" fires on the next tick in mock mode (prices are tens of thousands).
    await page.getByTestId('alert-condition').selectOption('greater');
    await page.getByTestId('alert-price').fill('1');
    await page.getByTestId('alert-message').fill('e2e alert');
    await page.getByTestId('alert-save').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Alert:' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('toast').filter({ hasText: 'e2e alert' })).toBeVisible();
    // The alert panel shows it as triggered and disabled (frequency once).
    if (await isPhone(page)) await page.getByTestId('tab-alerts').click();
    else await page.getByTestId('toggle-alerts').click();
    const row = page.getByTestId('alert-row').first();
    await expect(row).toContainText('Triggered');
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  test('toggles light theme and persists it', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('PWA manifest and service worker are served', async ({ page, request }) => {
    await openApp(page);
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBeTruthy();
    const json = await manifest.json();
    expect(json.display).toBe('standalone');
    expect(json.icons.length).toBeGreaterThanOrEqual(2);
    const sw = await request.get('/sw.js');
    expect(sw.ok()).toBeTruthy();
  });
});
