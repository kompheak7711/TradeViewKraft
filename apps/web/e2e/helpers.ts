import { expect, type Page } from '@playwright/test';

export const MOCK = process.env.E2E_LIVE ? '' : '?mock=1';

export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${MOCK}`);
  await expect(page.getByTestId('app')).toBeVisible();
  await waitForChart(page);
}

export async function waitForChart(page: Page): Promise<void> {
  const panel = page.getByTestId('chart-panel').first();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('chart-loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(panel.getByTestId('chart-error')).toHaveCount(0);
  await expect(panel.locator('canvas').first()).toBeVisible();
}

export async function isPhone(page: Page): Promise<boolean> {
  return (await page.getByTestId('app').getAttribute('data-form-factor')) === 'phone';
}

export async function switchSymbol(page: Page, query: string, expectId: string): Promise<void> {
  await page.getByTestId('open-symbol-search').click();
  const input = page.getByTestId('symbol-search-input');
  await input.fill(query);
  const result = page.locator(`[data-testid="symbol-result"][data-symbol="${expectId}"]`).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator(`[data-testid="chart-view"][data-symbol="${expectId}"]`).first()).toBeVisible();
  await waitForChart(page);
}

/** Pointer gesture on the chart canvas area (works for mouse and touch projects). */
export async function dragOnChart(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const area = page.locator('.chart-area').first();
  const box = await area.boundingBox();
  if (!box) throw new Error('chart area not visible');
  const p1 = { x: box.x + box.width * from[0], y: box.y + box.height * from[1] };
  const p2 = { x: box.x + box.width * to[0], y: box.y + box.height * to[1] };
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 5 });
  await page.mouse.move(p2.x, p2.y, { steps: 5 });
  await page.mouse.up();
}
