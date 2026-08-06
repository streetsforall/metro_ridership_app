import { expect, type Page } from '@playwright/test';

/**
 * Shared navigation/capture helpers for the dashboard visual suites
 * (`visual.spec.ts`, `chart-content.spec.ts`).
 *
 * `map.spec.ts` deliberately does not use these: it needs its own readiness gate (MapLibre's
 * `idle` event) and its own basemap route stub, so it keeps `gotoMap()` locally.
 */

/**
 * The MapLibre map is WebGL over third-party basemap tiles and never renders identically twice,
 * so full-page snapshots mask it out. Its container is a fixed 400px (see Map.css), so masking
 * does not shift page layout. Element-scoped chart shots do not need this — `#lineMap` sits in a
 * sibling pane, outside the crop.
 */
export const mapMask = (page: Page) => [page.locator('#lineMap')];

/**
 * Navigate to the dashboard and wait for it to be interactive and fonts to be ready.
 *
 * `search` is appended verbatim to `/`, e.g. `'?lines=801&day=wkday'`. Dashboard state is parsed
 * from the query string once, in the lazy `useState` initialisers in `useUserDashboardInput.ts`,
 * so this is the only way to drive a specific view — and the app re-serialises its own state back
 * over the URL via `history.replaceState`, so never assert on `page.url()` afterwards.
 */
export async function gotoDashboard(page: Page, search = ''): Promise<void> {
  // Chart.js `responsive: true` observes its container via ResizeObserver and, during a
  // full-page capture, enters a 1px resize feedback loop that oscillates the document width
  // frame-to-frame — so the screenshot can never stabilise its dimensions. Stubbing
  // ResizeObserver makes Chart.js size once at load and hold, which fixes the page dimensions.
  // Layout is static after load, so nothing legitimately needs resize observation here.
  //
  // This MUST stay ahead of `page.goto` — an init script only applies to documents created
  // after it is registered.
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  await page.goto('/' + search);
  await expect(page.locator('#expand-toggle')).toBeVisible();

  // Ridership data is fetched at runtime (/ridership.json). Wait for it to land:
  // line rows only render once per-line metrics are computed from the dataset, and
  // #lineMap confirms the lazy-loaded OutputArea chunk has mounted. Without this the
  // screenshot can capture the loading state instead of the populated dashboard.
  await expect(page.locator('td[data-qa^="select-"]').first()).toBeVisible();
  await expect(page.locator('#lineMap')).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Screenshot the ridership chart pane on its own.
 *
 * The pane rather than the bare `<canvas>`: its padding and background give a stable box even if
 * the canvas resizes, and it is a named element rather than the DOM-order accident that
 * `.pane canvas` `.first()` relies on.
 */
export async function shootChart(page: Page, name: string): Promise<void> {
  // hoverCrosshairPlugin draws a dashed line whenever the tooltip has active elements,
  // and interaction.intersect:false makes that trivially easy to trigger. Park the cursor.
  await page.mouse.move(0, 0);
  await expect(page.locator('#ridership-chart')).toHaveScreenshot(name, {
    // Tighter than the config defaults: this crop is roughly a sixth of the full-page area, so
    // the same ratio would let a proportionally much larger chart regression through.
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
  });
}
