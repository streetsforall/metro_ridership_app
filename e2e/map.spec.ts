import { test, expect, type Page } from '@playwright/test';

/**
 * Visual + structural coverage for src/components/Map.tsx.
 *
 * `visual.spec.ts` masks `#lineMap` out of every screenshot, because a live MapLibre map is
 * WebGL over third-party basemap tiles and never renders identically twice. This file gets the
 * map back under test by removing the only genuinely nondeterministic input — the basemap.
 *
 * How it is made deterministic:
 * - **The basemap style is stubbed** (`stubBasemap`). Every off-localhost request is fulfilled
 *   with a blank style: one solid background layer, zero sources. Nothing is fetched from
 *   OpenFreeMap/MapTiler, so no tiles, sprites or glyphs can vary between runs. What is left
 *   painting is exactly the part that regresses when line data or map styling changes: the
 *   route geometry the app loads itself from same-origin `/metro_lines.geojson`.
 * - **Waits are on MapLibre's `idle` event**, not on timeouts. `idle` fires when every pending
 *   source load and render has finished, which is the real "the map is done" signal.
 * - **The GL backend and device scale factor are pinned** in the `map` project in
 *   playwright.config.ts (SwiftShader, dsf 1), so rasterisation does not depend on the host GPU.
 *
 * The screenshots cover styling — colour, width, opacity, layer order, controls. The
 * `queryRenderedFeatures` assertions cover selection wiring, and fail with an actual list of
 * line IDs rather than a pixel count, so they are worth keeping alongside the pixels.
 */

/**
 * A Line and B Line carry hardcoded brand colours from `definedLines`; Line 14 gets the
 * golden-angle HSL fallback every other bus line uses. Between them the baseline covers both
 * colour paths, in three hues far enough apart that losing one is obvious in the diff.
 */
const SELECTED_LINE_IDS = [801, 802, 14];

/**
 * A valid MapLibre style with no sources, so loading it issues no further network requests.
 * The background colour is deliberately unlike any line colour, so a line that stops rendering
 * shows up as background rather than blending in.
 */
const BLANK_STYLE = {
  version: 8,
  name: 'e2e-blank-basemap',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e9edf2' },
    },
  ],
};

/**
 * Serve the blank style in place of anything the map would fetch off-host.
 *
 * Matching on "not localhost" rather than on a hostname keeps this correct if `STYLE_URL` in
 * Map.tsx moves, and covers the MapTiler branch that a `VITE_MAPTILER_KEY` build takes — the
 * two produce different URLs but the same stub. `/metro_lines.geojson` is same-origin and is
 * therefore untouched.
 */
async function stubBasemap(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(BLANK_STYLE),
      }),
  );
}

/**
 * Resolve once the map has nothing left to load or draw.
 *
 * `idle` only fires after a render, so a map that already settled before the listener attached
 * would never resolve — `triggerRepaint()` guarantees one more render/idle cycle. Any pending
 * geojson fetch still gates that idle, so this also waits out the source load.
 */
async function waitForMapIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__metroMap?.isStyleLoaded() === true);
  await page.evaluate(async () => {
    const map = window.__metroMap!;
    const idle = map.once('idle');
    map.triggerRepaint();
    await idle;
  });
}

/** Navigate to the dashboard with a known selection and wait for the map to finish drawing. */
async function gotoMap(page: Page, selectedIds: readonly number[] = []): Promise<void> {
  await stubBasemap(page);

  const query = selectedIds.length > 0 ? `?lines=${selectedIds.join(',')}` : '';
  await page.goto(`/${query}`);

  // #lineMap only exists once the lazy-loaded OutputArea chunk has mounted.
  await expect(page.locator('#lineMap')).toBeVisible();
  await waitForMapIdle(page);

  // The attribution control renders text over the map.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** The distinct `line_id`s currently painted by a layer, sorted for stable comparison. */
async function renderedLineIds(page: Page, layerId: string): Promise<number[]> {
  return page.evaluate((layer) => {
    const features = window.__metroMap!.queryRenderedFeatures({ layers: [layer] });
    const ids = features.map((feature) => feature.properties.line_id as number);
    return [...new Set(ids)].sort((a, b) => a - b);
  }, layerId);
}

test('map — every line dimmed, none selected', async ({ page }) => {
  await gotoMap(page);

  // Nothing selected: the brand-colour layer paints nothing, the dimmed layer paints the network.
  expect(await renderedLineIds(page, 'lines-selected')).toEqual([]);
  expect((await renderedLineIds(page, 'lines-all')).length).toBeGreaterThan(0);

  await expect(page.locator('#lineMap')).toHaveScreenshot('all-lines-dimmed.png');
});

test('map — selected lines render in brand colours', async ({ page }) => {
  await gotoMap(page, SELECTED_LINE_IDS);

  // queryRenderedFeatures is viewport-clipped, so a selected line that sits entirely off-screen
  // legitimately will not appear. Assert on the containment that matters instead of an exact
  // list: something is highlighted, and nothing is highlighted that was not selected — the
  // shape a broken filter (all 114 lines in colour, or none) fails on either way.
  const selected = await renderedLineIds(page, 'lines-selected');
  expect(selected.length).toBeGreaterThan(0);
  expect(selected.filter((id) => !SELECTED_LINE_IDS.includes(id))).toEqual([]);

  await expect(page.locator('#lineMap')).toHaveScreenshot('lines-selected.png');
});

test('map — selecting a line updates the layer filter without a reload', async ({ page }) => {
  await gotoMap(page);
  expect(await renderedLineIds(page, 'lines-selected')).toEqual([]);

  // Covers the second effect in Map.tsx: selection changes call setFilter on the existing map
  // rather than re-initialising it, so the URL-driven tests above would not tell the two apart.
  // Selecting by line ID rather than by row position keeps this independent of table sort order.
  await page.locator('td[data-qa="select-801"] button').click();
  await waitForMapIdle(page);

  expect(await renderedLineIds(page, 'lines-selected')).toEqual([801]);
});

test('map — layer stack is background, dimmed lines, then selected lines', async ({ page }) => {
  await gotoMap(page, SELECTED_LINE_IDS);

  // Also proves the basemap stub took effect: the real style carries ~100 layers.
  const layerIds = await page.evaluate(() =>
    window.__metroMap!.getStyle().layers.map((layer) => layer.id),
  );
  expect(layerIds).toEqual(['background', 'lines-all', 'lines-selected']);

  // Draw order is what keeps a selected line legible on top of its dimmed twin.
  expect(await page.evaluate(() => window.__metroMap!.getPaintProperty('lines-all', 'line-opacity')))
    .toBe(0.15);
  expect(await page.evaluate(() => window.__metroMap!.getPaintProperty('lines-selected', 'line-opacity')))
    .toBe(1);
});
