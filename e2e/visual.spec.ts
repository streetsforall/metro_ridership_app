import { test, expect, type Page } from '@playwright/test';

/**
 * Full-page visual-regression baselines for the metro ridership dashboard.
 *
 * Determinism notes:
 * - The MapLibre map (#lineMap) is WebGL + external tiles and never renders identically
 *   twice, so it is masked out of every snapshot. Its container is a fixed 400px (see
 *   Map.css), so masking it does not shift page layout.
 * - Chart.js animates its main canvas; `toHaveScreenshot` re-shoots until two consecutive
 *   frames are identical, which waits out that animation. The dashboard content is otherwise
 *   driven entirely by the static `ridership.json`, so it is stable across runs.
 */

const mapMask = (page: Page) => [page.locator('#lineMap')];

/** Navigate to the dashboard and wait for it to be interactive and fonts to be ready. */
async function gotoDashboard(page: Page): Promise<void> {
  // Chart.js `responsive: true` observes its container via ResizeObserver and, during a
  // full-page capture, enters a 1px resize feedback loop that oscillates the document width
  // frame-to-frame — so the screenshot can never stabilise its dimensions. Stubbing
  // ResizeObserver makes Chart.js size once at load and hold, which fixes the page dimensions.
  // Layout is static after load, so nothing legitimately needs resize observation here.
  await page.addInitScript(() => {
    // @ts-expect-error - replace with a no-op for deterministic layout during capture
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  await page.goto('/');
  await expect(page.locator('#expand-toggle')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test('dashboard — default (no line selected)', async ({ page }) => {
  await gotoDashboard(page);
  await expect(page).toHaveScreenshot('dashboard-default.png', {
    fullPage: true,
    mask: mapMask(page),
  });
});

test('dashboard — with a line selected', async ({ page }) => {
  await gotoDashboard(page);

  // Select the first visible line; the main ridership chart and summary tiles then render.
  await page.locator('td[data-qa^="select-"] button').first().click();
  await expect(page.locator('.pane canvas').first()).toBeVisible();
  await expect(page.getByText('Average Ridership', { exact: false })).toBeVisible();
  // Let the Chart.js intro animation (~1s) run to completion so the canvas is static.
  await page.waitForTimeout(1500);

  await expect(page).toHaveScreenshot('dashboard-line-selected.png', {
    fullPage: true,
    mask: mapMask(page),
  });
});

test('line selector — expanded table view', async ({ page }) => {
  await gotoDashboard(page);

  // Expand into the full table view (this swaps out the chart/map output area).
  await page.locator('#expand-toggle').click();
  await expect(page.locator('table thead')).toBeVisible();

  await expect(page).toHaveScreenshot('line-selector-expanded.png', {
    fullPage: true,
    mask: mapMask(page),
  });
});
