import { test, expect, type Page } from '@playwright/test';
import { gotoDashboardShell } from './helpers';

/**
 * Panel Settings — the disclosure in the filter bar and the four visibility
 * params it writes.
 *
 * DOM assertions only, no screenshots. What this section changes is which
 * panels are in the document, and each hidden state's *appearance* is already
 * a baseline somewhere else: a hidden chart is `#output-placeholder`, which
 * `loading.spec.ts` shoots, and a hidden context log is the default view that
 * `visual.spec.ts` shoots. A second set of near-identical PNGs would gate on
 * pixels that nothing here can move.
 *
 * A line is selected in every case so the panels have something to render —
 * `#chart-panel` and `#summary-panel` are gated on a selection as well as on
 * their setting.
 */
const LINE = '?lines=801&start=2019-06&end=2020-12&day=wkday';

/**
 * `gotoDashboard` cannot be used here. Its readiness gate waits for `#lineMap`
 * to be *visible*, and half of these cases hide the map on purpose — the gate
 * would never pass. `#map-panel` having a count instead proves the same thing
 * the gate was there for, that the lazily-loaded OutputArea chunk has mounted,
 * without caring whether the panel is on screen.
 */
async function gotoPanels(page: Page, search: string): Promise<void> {
  await gotoDashboardShell(page, search);
  await expect(page.locator('td[data-qa^="select-"]').first()).toBeVisible();
  await expect(page.locator('#map-panel')).toHaveCount(1);
}

test('every panel is on screen by default', async ({ page }) => {
  await gotoPanels(page, LINE);

  await expect(page.locator('#chart-panel')).toBeVisible();
  await expect(page.locator('#summary-panel')).toBeVisible();
  await expect(page.locator('#map-panel')).toBeVisible();
});

test('the settings are collapsed on load', async ({ page }) => {
  await gotoPanels(page, LINE);

  await expect(page.locator('#panel-settings-toggle')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#panel-settings')).toHaveCount(0);
});

test('opening the disclosure reveals the four toggles and the reset', async ({
  page,
}) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();

  await expect(page.locator('#panel-chart-toggle')).toBeVisible();
  await expect(page.locator('#panel-summary-toggle')).toBeVisible();
  await expect(page.locator('#panel-map-toggle')).toBeVisible();
  await expect(page.locator('#panel-context-logs-toggle')).toBeVisible();
  await expect(page.locator('#panel-settings-reset')).toBeVisible();
});

test('unchecking Chart drops the chart for the placeholder', async ({
  page,
}) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-chart-toggle').click();

  await expect(page.locator('#chart-panel')).toHaveCount(0);
  await expect(page.locator('#output-placeholder')).toBeVisible();
});

test('chart=0 restores the same view from the URL', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0`);

  await expect(page.locator('#chart-panel')).toHaveCount(0);
  await expect(page.locator('#output-placeholder')).toBeVisible();
});

test('summary=0 hides the summary and leaves the chart alone', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&summary=0`);

  await expect(page.locator('#summary-panel')).toHaveCount(0);
  await expect(page.locator('#chart-panel')).toBeVisible();
});

/**
 * The map is hidden, not unmounted — the one thing this feature must not do to
 * MapLibre. `#lineMap` staying in the document while `#map-panel` is invisible
 * is exactly that distinction.
 */
test('map=0 hides the map panel without unmounting MapLibre', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&map=0`);

  await expect(page.locator('#map-panel')).toBeHidden();
  await expect(page.locator('#lineMap')).toHaveCount(1);
});

test('the map comes back visible when the toggle goes back on', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&map=0`);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-map-toggle').click();

  await expect(page.locator('#map-panel')).toBeVisible();
});

test('all four off leaves the placeholder standing', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0&summary=0&map=0`);

  await expect(page.locator('#output-placeholder')).toBeVisible();
  await expect(page.locator('#summary-panel')).toHaveCount(0);
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});

test('reset puts every panel back', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0&summary=0&map=0&logs=1`);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-settings-reset').click();

  await expect(page.locator('#chart-panel')).toBeVisible();
  await expect(page.locator('#summary-panel')).toBeVisible();
  await expect(page.locator('#map-panel')).toBeVisible();
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});

/**
 * The one place `page.url()` is worth asserting on. Everywhere else the app
 * re-serialises its own state over the URL and the assertion would be circular
 * — here that re-serialisation *is* the subject: a panel left at its default
 * must not write a param.
 */
test('a default view writes no panel params', async ({ page }) => {
  await gotoPanels(page, LINE);

  const search = new URL(page.url()).search;
  expect(search).not.toContain('chart=');
  expect(search).not.toContain('summary=');
  expect(search).not.toContain('map=');
  expect(search).not.toContain('logs=');
});

test('switching a panel off writes its param', async ({ page }) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-map-toggle').click();

  await expect
    .poll(() => new URL(page.url()).search)
    .toContain('map=0');
});
