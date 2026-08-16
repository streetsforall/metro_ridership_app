import { test, expect, type Page } from '@playwright/test';
import { BUS_LINE_ID, RAIL_LINE_ID, stubStopPayloads } from './stop-fixtures';

/**
 * The `stops-selected` circle layer in `src/components/Map.tsx`.
 *
 * ## Why this file is named `stop-map.spec.ts`
 *
 * `playwright.config.ts` routes specs by regex: the `map` project takes
 * `/map\.spec\.ts/` and the `desktop`/`mobile` projects `testIgnore` the same pattern.
 * Those patterns are unanchored, so a name ending in `map.spec.ts` lands in the `map`
 * project and only there — which is where it belongs, because that project is the one
 * pinning SwiftShader and `deviceScaleFactor: 1`, and those are what make a WebGL
 * baseline reproducible. **Renaming this file to anything not ending in
 * `map.spec.ts` would silently move it into both viewport projects.** The panel's DOM
 * is covered separately in `stop-panel.spec.ts`.
 *
 * ## Determinism
 *
 * Two stubs, no shared helper. The basemap style is replaced with a blank one so
 * nothing is fetched off-host, and both stop payloads are replaced with the small
 * fixtures in `stop-fixtures.ts` — a baseline must not depend on 5.3 MB of committed
 * data that changes every time an export lands. `e2e/map.spec.ts` keeps its own copies
 * of the same basemap stub; duplicating ~15 lines is the cost of not editing a file
 * two other open PRs are rewriting.
 *
 * The `queryRenderedFeatures` assertions are the point of the file. They fail with a
 * list of stop keys, which localises a broken filter or a missing coordinate far
 * faster than a pixel count; the screenshot covers what a key list cannot — radius,
 * colour, and that the circles sit above the routes.
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
 * Resolve once the map has nothing left to load or draw. `idle` only fires after a
 * render, so `triggerRepaint()` guarantees one more render/idle cycle for a map that
 * settled before the listener attached.
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

async function gotoStopMap(page: Page, search: string): Promise<void> {
  await stubBasemap(page);
  await stubStopPayloads(page);

  await page.goto('/' + search);
  await expect(page.locator('#lineMap')).toBeVisible();
  // The panel's table is the signal that the payload landed and the derivation ran;
  // the markers reach the source in the same pass.
  await expect(
    page.locator('[data-qa="stop-table"] tbody tr').first(),
  ).toBeVisible();
  await waitForMapIdle(page);

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** The stop keys currently painted by a layer, sorted for stable comparison. */
async function renderedStopKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const features = window.__metroMap!.queryRenderedFeatures({
      layers: ['stops-selected'],
    });
    const keys = features.map((feature) => feature.properties.stop_key as string);
    return [...new Set(keys)].sort();
  });
}

/**
 * The panel is off by default, so a map nobody asked for stops on carries exactly the
 * two route layers it always did — which is also what keeps `e2e/map.spec.ts`'s exact
 * layer-stack assertion true without that spec being touched. The layer is created on
 * first use and never re-created.
 */
test('stop map — no stop layer at all until the panel is on', async ({ page }) => {
  await stubBasemap(page);
  await stubStopPayloads(page);
  await page.goto(`/?lines=${String(RAIL_LINE_ID)}`);
  await expect(page.locator('#lineMap')).toBeVisible();
  await waitForMapIdle(page);

  const layerIds = await page.evaluate(() =>
    window.__metroMap!.getStyle().layers.map((layer) => layer.id),
  );
  expect(layerIds).toEqual(['background', 'lines-all', 'lines-selected']);
});

test('stop map — selected line’s stops render as circles', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);

  // The whole fixture line, and nothing from the bus fixture — which is not fetched
  // at all for a rail-only selection.
  expect(await renderedStopKeys(page)).toEqual([
    'rail:103rd-street-watts-towers-station',
    'rail:7th-street-metro-center-station',
    'rail:union-station',
  ]);

  await expect(page.locator('#lineMap')).toHaveScreenshot('stops-selected.png');
});

/**
 * Radius comes from the feature property `buildStopView` wrote, sqrt-normalised per
 * mode. Asserting the ordering rather than the numbers keeps this a test of the seam —
 * that the layer paints what the module computed — instead of a second copy of the
 * scale.
 */
test('stop map — circle radius follows the module’s per-stop scale', async ({
  page,
}) => {
  await gotoStopMap(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);

  const radii = await page.evaluate(() =>
    Object.fromEntries(
      window
        .__metroMap!.queryRenderedFeatures({ layers: ['stops-selected'] })
        .map((feature) => [
          feature.properties.stop_key as string,
          feature.properties.radius as number,
        ]),
    ),
  );

  expect(radii['rail:union-station']).toBeGreaterThan(
    radii['rail:7th-street-metro-center-station'],
  );
  // The busiest stop of its mode sits at the top of the range.
  expect(radii['rail:union-station']).toBeCloseTo(22, 5);
});

test('stop map — deselecting a line takes its circles with it', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  expect((await renderedStopKeys(page)).length).toBeGreaterThan(0);

  // Selecting by line id rather than by row position keeps this independent of the
  // table's sort order.
  await page.locator(`td[data-qa="select-${String(RAIL_LINE_ID)}"] button`).click();
  await waitForMapIdle(page);

  expect(await renderedStopKeys(page)).toEqual([]);
});

test('stop map — the stop layer sits above both route layers', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);

  const layerIds = await page.evaluate(() =>
    window.__metroMap!.getStyle().layers.map((layer) => layer.id),
  );
  expect(layerIds).toEqual([
    'background',
    'lines-all',
    'lines-selected',
    'stops-selected',
  ]);
});

test('stop map — clicking a circle selects that stop in the panel', async ({
  page,
}) => {
  await gotoStopMap(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);

  // `page.mouse` takes viewport coordinates and does not scroll to reach them. With a
  // line selected the chart sits above the map, so the canvas starts below the fold
  // and every computed point would land off-screen.
  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const point = await page.evaluate(() => {
    const map = window.__metroMap!;
    const feature = map
      .queryRenderedFeatures({ layers: ['stops-selected'] })
      .find((f) => f.properties.stop_key === 'bus:vermont-wilshire');
    if (!feature) return null;
    const [lon, lat] = (feature.geometry as { coordinates: [number, number] })
      .coordinates;
    const { x, y } = map.project([lon, lat]);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  });
  expect(point).not.toBeNull();

  await page.mouse.click(point!.x, point!.y);

  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    'Vermont / Wilshire',
  );
});
