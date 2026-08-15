import { test, expect } from '@playwright/test';
import { gotoDashboard, mapMask } from './helpers';

/**
 * Full-page visual-regression baselines for the metro ridership dashboard.
 *
 * These cover page-level layout — header, date pickers, line selector, summary tiles, chart and
 * map in their places. What the chart itself *draws* is covered by `chart-content.spec.ts`,
 * element-scoped: at full-page scale the chart is a small enough fraction of the frame that a
 * wrong render fits inside `maxDiffPixelRatio`.
 *
 * Determinism notes:
 * - The MapLibre map (#lineMap) is WebGL + external tiles and never renders identically twice,
 *   so it is masked out of every snapshot. Its container is a fixed 400px (see Map.css), so
 *   masking it does not shift page layout.
 * - The Chart.js intro animation is off: the config emulates `prefers-reduced-motion: reduce`
 *   and OutputArea honours it, so the canvas paints its final frame immediately. The dashboard
 *   content is otherwise driven entirely by the static `ridership.json`, so it is stable across
 *   runs.
 */

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
  await expect(page.locator('#chart-panel')).toBeVisible();
  await expect(page.getByText('Average Ridership', { exact: false })).toBeVisible();

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
