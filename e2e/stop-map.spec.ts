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
 * Unticking Stop Ridership takes the circles with it.
 *
 * The layer is created on first use and never destroyed, and the payload stays cached so
 * reopening the panel costs nothing — so neither of those can be what clears the map. The
 * view is: `useStopView` yields the empty view while the panel is off, and empty markers
 * reach the live layer through `setData`.
 *
 * Worth an end-to-end case rather than only a hook test, because the bug it guards was
 * invisible at the hook's own seam — `records` was correct throughout and `view.markers`
 * was the leak.
 */
test('stop map — unticking Stop Ridership removes the circles', async ({
  page,
}) => {
  await gotoStopMap(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);

  expect((await renderedStopKeys(page)).length).toBeGreaterThan(0);

  await page.locator('#stop-ridership').click();

  // The panel goes, which is the control's other half.
  await expect(page.locator('#stop-panel')).toHaveCount(0);

  await waitForMapIdle(page);
  expect(await renderedStopKeys(page)).toEqual([]);

  // And back again, without a second fetch — the layer is reused, not rebuilt.
  await page.locator('#stop-ridership').click();
  await expect(page.locator('#stop-panel')).toBeVisible();
  await waitForMapIdle(page);
  expect((await renderedStopKeys(page)).length).toBeGreaterThan(0);
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

/**
 * Where a stop's circle currently sits, in viewport coordinates.
 *
 * `page.mouse` takes viewport coordinates and does not scroll to reach them, so the
 * caller must bring the canvas into view first. Recomputed per call rather than cached:
 * a click changes the selection, and the map may repaint between clicks.
 */
async function circlePoint(
  page: Page,
  stopKey: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((key) => {
    const map = window.__metroMap!;
    const feature = map
      .queryRenderedFeatures({ layers: ['stops-selected'] })
      .find((f) => f.properties.stop_key === key);
    if (!feature) return null;
    const [lon, lat] = (feature.geometry as { coordinates: [number, number] })
      .coordinates;
    const { x, y } = map.project([lon, lat]);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  }, stopKey);

  expect(point).not.toBeNull();
  return point!;
}

test('stop map — clicking a circle selects that stop in the panel', async ({
  page,
}) => {
  await gotoStopMap(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);

  // With a line selected the chart sits above the map, so the canvas starts below the
  // fold and every computed point would land off-screen.
  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const point = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(point.x, point.y);

  /*
   * The figure's caption counts rather than naming, and the legend that names each series
   * is drawn into a canvas — so the witness for *which* stop the click selected is the
   * row's checkbox, which is the panel's own statement about it.
   */
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '1 stop',
  );
  await expect(
    page.locator('[data-qa="stop-select-bus:vermont-wilshire"] [role="checkbox"]'),
  ).toHaveAttribute('data-state', 'checked');
});

/**
 * A circle is the same toggle its table row is. The handler is registered once, in
 * `load`, so it calls out through a ref — a closed-over prop would be the first render's
 * and would leave the map wired to a selection nobody has any more.
 */
test('stop map — clicking the selected circle deselects it', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);

  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const first = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(first.x, first.y);
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '1 stop',
  );

  // Selecting redraws the circle with a heavier ring, so the point is taken again
  // rather than reused.
  await waitForMapIdle(page);
  const second = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(second.x, second.y);

  await expect(page.locator('[data-qa="stop-series-figure"]')).toHaveCount(0);
  expect(page.url()).not.toContain('stop=');
});

/**
 * Several circles ring at once, and each ring is the same neutral colour.
 *
 * The map's paint is asserted through the panel and the URL rather than through pixels,
 * because the ring's colour is pinned by `Map.test.tsx` — where a hue can be read exactly
 * instead of sampled off a WebGL canvas over third-party tiles.
 */
test('stop map — two circles can be selected at once', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);

  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const first = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(first.x, first.y);
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '1 stop',
  );

  await waitForMapIdle(page);
  const second = await circlePoint(page, 'bus:vermont-santa-monica');
  await page.mouse.click(second.x, second.y);

  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '2 stops',
  );
  expect(decodeURIComponent(page.url())).toContain(
    'bus:vermont-wilshire,bus:vermont-santa-monica',
  );
});
