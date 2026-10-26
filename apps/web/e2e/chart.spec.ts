import { expect, test } from '@playwright/test';
import { dragOnChart, isPhone, openApp, switchSymbol, waitForChart } from './helpers';

test.describe('chart basics', () => {
  test('opens the default chart with live status', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-symbol', 'BINANCE:BTCUSDT');
    await expect(page.getByTestId('feed-status').first()).toHaveAttribute('data-status', /live|connecting/);
    await expect(page.getByTestId('legend').first()).toContainText('BTC');
  });

  test('switches symbol across crypto, stocks and metals', async ({ page }) => {
    await openApp(page);
    await switchSymbol(page, 'AAPL', 'NASDAQ:AAPL');
    await expect(page.getByTestId('legend').first()).toContainText('Apple');
    await switchSymbol(page, 'gold', 'METALS:XAUUSD');
    await expect(page.getByTestId('legend').first()).toContainText('Gold');
    await switchSymbol(page, 'COINBASE:SOL', 'COINBASE:SOLUSD');
    await expect(page.getByTestId('legend').first()).toContainText('COINBASE');
  });

  test('accepts exchange-prefixed input with Enter', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('open-symbol-search').click();
    await page.getByTestId('symbol-search-input').fill('kraken:eth/usd');
    await page.getByTestId('symbol-search-input').press('Enter');
    await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-symbol', 'KRAKEN:ETHUSD');
  });

  test('switches timeframe from quick bar and menu', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tf-15m').first().click();
    await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-timeframe', '15m');
    await waitForChart(page);
    await page.getByTestId('tf-more').first().click();
    await page.getByTestId('tf-menu-1M').first().click();
    await expect(page.getByTestId('chart-view').first()).toHaveAttribute('data-timeframe', '1M');
    await waitForChart(page);
  });

  test('switches chart type and log scale', async ({ page }) => {
    await openApp(page);
    for (const t of ['bars', 'line', 'area', 'heikinashi', 'candles']) {
      await page.getByTestId('chart-type').first().click();
      await page.getByTestId(`chart-type-${t}`).first().click();
      await expect(page.locator('.chart-view canvas').first()).toBeVisible();
    }
    await page.getByTestId('log-toggle').first().click();
    await expect(page.getByTestId('log-toggle').first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('adds and removes an indicator', async ({ page }) => {
    await openApp(page);
    const legend = page.getByTestId('legend').first();
    const before = await legend.getByTestId('legend-indicator').count();
    await page.getByTestId('indicators-button').first().click();
    await page.getByTestId('indicator-rsi').click();
    await expect(legend.getByTestId('legend-indicator')).toHaveCount(before + 1);
    await expect(legend).toContainText('Relative Strength Index');
    await page.getByTestId('indicators-button').first().click();
    await page.getByTestId('indicator-bb').click();
    await expect(legend).toContainText('Bollinger');
    await legend.getByTestId('remove-indicator').last().click();
    await expect(legend.getByTestId('legend-indicator')).toHaveCount(before + 1);
  });

  test('draws a trend line and a horizontal line, then deletes it', async ({ page }) => {
    await openApp(page);
    const phone = await isPhone(page);
    if (phone) await page.getByTestId('tab-tools').click();
    await page.getByTestId('tool-trendline').click();
    await expect(page.getByTestId('tool-trendline')).toHaveAttribute('aria-pressed', 'true');
    await dragOnChart(page, [0.2, 0.7], [0.6, 0.3]);
    const overlay = page.getByTestId('drawing-overlay').first();
    await expect(overlay).toHaveAttribute('data-count', '1');
    await expect(page.getByTestId('tool-trendline')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('tool-hline').click();
    await dragOnChart(page, [0.5, 0.5], [0.5, 0.5]);
    await expect(overlay).toHaveAttribute('data-count', '2');
    // Select the horizontal line by tapping on it, then delete with the toolbar button.
    await dragOnChart(page, [0.8, 0.5], [0.8, 0.5]);
    await expect(page.getByTestId('tool-delete')).toBeEnabled();
    await page.getByTestId('tool-delete').click();
    await expect(overlay).toHaveAttribute('data-count', '1');
    // Drawings survive a reload (persisted layout).
    await page.reload();
    await waitForChart(page);
    await expect(page.getByTestId('drawing-overlay').first()).toHaveAttribute('data-count', '1');
  });

  test('loads older history when scrolling left', async ({ page }) => {
    await openApp(page);
    const area = page.locator('.chart-area').first();
    const box = (await area.boundingBox())!;
    // Zoom out then drag right several times to reach the left edge.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
    for (let i = 0; i < 4; i++) await dragOnChart(page, [0.2, 0.5], [0.9, 0.5]);
    await expect(page.getByTestId('chart-error')).toHaveCount(0);
    await expect(page.locator('.chart-view canvas').first()).toBeVisible();
  });
});
