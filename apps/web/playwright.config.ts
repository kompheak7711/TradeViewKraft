import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Sandboxed CI images may pin a Chromium build at this path; local machines use Playwright's own browsers.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const mock = process.env.E2E_LIVE ? '' : '?mock=1';
const useWebKit = process.env.E2E_WEBKIT === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', extraHTTPHeaders: {} },
  metadata: { mockQuery: mock },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: chromiumPath } } },
    { name: 'ipad', use: { ...(useWebKit ? devices['iPad (gen 7)'] : { ...devices['Desktop Chrome'], hasTouch: true }), viewport: { width: 1024, height: 768 }, launchOptions: { executablePath: useWebKit ? undefined : chromiumPath } } },
    { name: 'iphone', use: { ...(useWebKit ? devices['iPhone 14'] : { ...devices['Desktop Chrome'], hasTouch: true, isMobile: true }), viewport: { width: 390, height: 844 }, launchOptions: { executablePath: useWebKit ? undefined : chromiumPath } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm exec vite preview --port 4173 --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
