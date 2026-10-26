// Measures frame timing with 4 live charts (mock ticks every 500 ms per chart) for 10 seconds.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (require('node:fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe });
for (const [name, w, h, grid] of [['mac-4charts', 1440, 900, '4'], ['ipad-2charts', 1024, 768, '2h']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'}/?mock=1`, { waitUntil: 'networkidle' });
  await page.getByTestId(`grid-${grid}`).click();
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => new Promise((resolve) => {
    const frames = [];
    let last = performance.now();
    const start = last;
    const tick = (t) => { frames.push(t - last); last = t; if (t - start < 10000) requestAnimationFrame(tick); else done(); };
    const done = () => {
      frames.shift();
      const sorted = [...frames].sort((a, b) => a - b);
      const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      resolve({ frames: frames.length, fps: (frames.length / 10).toFixed(1), p50: p(0.5).toFixed(1), p95: p(0.95).toFixed(1), p99: p(0.99).toFixed(1), max: sorted[sorted.length - 1].toFixed(1), long: frames.filter((f) => f > 50).length });
    };
    requestAnimationFrame(tick);
  }));
  console.log(name, JSON.stringify(stats));
  await page.close();
}
await browser.close();
