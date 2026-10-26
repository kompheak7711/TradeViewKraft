// Renders public/icons/icon.svg to the PNG sizes needed by the PWA manifest, iOS and Tauri.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Prefer the workspace's playwright-core (via @playwright/test); fall back to a global install.
let chromium;
try { ({ chromium } = require('@playwright/test')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(here, '../public/icons/icon.svg'), 'utf8');
const targets = [
  ['../public/icons/icon-192.png', 192, false],
  ['../public/icons/icon-512.png', 512, false],
  ['../public/icons/icon-512-maskable.png', 512, true],
  ['../public/icons/apple-touch-icon.png', 180, true],
  ['../../desktop/src-tauri/icons/32x32.png', 32, false],
  ['../../desktop/src-tauri/icons/128x128.png', 128, false],
  ['../../desktop/src-tauri/icons/128x128@2x.png', 256, false],
  ['../../desktop/src-tauri/icons/icon.png', 1024, false],
];
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const [out, size, maskable] of targets) {
  // Maskable/iOS icons need a full-bleed background (no transparent corners).
  const body = maskable ? svg.replace('rx="112" fill="#0b0f17"', 'rx="0" fill="#0b0f17"') : svg;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  const file = resolve(here, out);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', out);
}
await browser.close();
