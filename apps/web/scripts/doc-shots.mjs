// Documentation screenshots (mock data): Mac/iPad/iPhone in dark and light themes plus key states.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const out = new URL('../../../replica/screenshots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: exe });
const sizes = { mac: [1440, 900, false], ipad: [1024, 768, true], iphone: [390, 844, true] };
for (const [name, [w, h, touch]] of Object.entries(sizes)) {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: name === 'iphone', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}/?mock=1`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => localStorage.setItem('tvk-state-v1', JSON.stringify({ state: { settings: { theme: t, defaultTimeframe: '1h', defaultChartType: 'candles', notificationsEnabled: false, soundEnabled: true, updatedAt: 1 }, revision: 1 }, version: 1 })), theme);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}${name}-${theme}.png` });
    if (theme === 'dark' && name === 'mac') {
      await page.getByTestId('indicators-button').first().click();
      await page.getByTestId('indicator-ema').click();
      await page.getByTestId('indicators-button').first().click();
      await page.getByTestId('indicator-rsi').click();
      await page.getByTestId('indicators-button').first().click();
      await page.getByTestId('indicator-bb').click();
      await page.getByTestId('tool-fib').click();
      const area = await page.locator('.chart-area').first().boundingBox();
      await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.42);
      await page.mouse.down();
      await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.12, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}mac-indicators-drawings.png` });
      await page.getByTestId('grid-4').click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${out}mac-4-charts.png` });
      await page.getByTestId('grid-1').click();
      await page.getByTestId('open-symbol-search').click();
      await page.getByTestId('symbol-search-input').fill('gold');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}mac-symbol-search.png` });
      await page.keyboard.press('Escape');
      await page.getByTestId('toggle-alerts').click();
      await page.getByTestId('alert-button').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}mac-alert-sheet.png` });
    }
    if (theme === 'dark' && name === 'iphone') {
      await page.getByTestId('tab-watchlist').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${out}iphone-watchlist.png` });
      await page.keyboard.press('Escape');
      await page.getByTestId('tab-tools').click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}iphone-draw-tools.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('screenshots written to', out);
