import { test, expect, type Page } from '@playwright/test';
import {
  BUS_LINE_ID,
  RAIL_LINE_ID,
  stopQa,
  stubStopPayloads,
} from './stop-fixtures';

/**
 * The `stops-selected` circle layer in `src/components/Map.tsx` — the name must keep
 * ending in `map.spec.ts`, or `playwright.config.ts` moves it into both viewport projects.
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

/** Resolves once the map has nothing left to load or draw. */
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
  // The panel's table is the signal that the payload landed and the derivation ran.
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

/** A map nobody asked for stops on carries exactly the two route layers it always did. */
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

  // The whole fixture line, and nothing from the bus fixture, which is never fetched here.
  expect(await renderedStopKeys(page)).toEqual([
    'rail:103rd-street-watts-towers-station',
    'rail:7th-street-metro-center-station',
    'rail:union-station',
  ]);

  await expect(page.locator('#lineMap')).toHaveScreenshot('stops-selected.png');
});

/**
 * Unticking Stop Ridership takes the circles with it, through the empty view rather than
 * by tearing the layer down.
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

  // Back on again, without a second fetch — the layer is reused, not rebuilt.
  await page.locator('#stop-ridership').click();
  await expect(page.locator('#stop-panel')).toBeVisible();
  await waitForMapIdle(page);
  expect((await renderedStopKeys(page)).length).toBeGreaterThan(0);
});

/** Radius comes from the module, so the ordering is asserted rather than the numbers. */
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

  // By line id rather than row position, so the table's sort order can't break this.
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
 * Where a stop's circle currently sits, in viewport coordinates, recomputed per call
 * because the map repaints between clicks.
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

  // The canvas starts below the fold here, and computed points would land off-screen.
  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const point = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(point.x, point.y);

  /* The row's checkbox is the witness for *which* stop the click selected. */
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '1 stop',
  );
  await expect(
    page.locator(
      `${stopQa('select', BUS_LINE_ID, 'bus:vermont-wilshire')} [role="checkbox"]`,
    ),
  ).toHaveAttribute('data-state', 'checked');
});

/** A circle is the same toggle its table row is, through a ref rather than a stale prop. */
test('stop map — clicking the selected circle deselects it', async ({ page }) => {
  await gotoStopMap(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);

  await page.locator('#lineMap').scrollIntoViewIfNeeded();
  await waitForMapIdle(page);

  const first = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(first.x, first.y);
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    '1 stop',
  );

  // Selecting redraws the circle, so the point is taken again rather than reused.
  await waitForMapIdle(page);
  const second = await circlePoint(page, 'bus:vermont-wilshire');
  await page.mouse.click(second.x, second.y);

  await expect(page.locator('[data-qa="stop-series-figure"]')).toHaveCount(0);
  expect(page.url()).not.toContain('stop=');
});

/**
 * Several circles ring at once, asserted through the panel and the URL because
 * `Map.test.tsx` is where the hue itself is pinned.
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
