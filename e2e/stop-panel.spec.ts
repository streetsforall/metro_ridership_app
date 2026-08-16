import { expect, test, type Page } from '@playwright/test';
import { BUS_LINE_ID, RAIL_LINE_ID, stubStopPayloads } from './stop-fixtures';

/**
 * The stop panel's DOM — the ranked table, the measure toggle, the per-stop series and
 * the two coverage states.
 *
 * Runs in the `desktop` and `mobile` projects. The map layer is covered separately in
 * `stop-map.spec.ts`, which the `map` project picks up: a feature spanning WebGL and
 * DOM needs two specs in two projects, because the `map` project runs once rather than
 * per-viewport and the two viewport projects `testIgnore` it.
 *
 * ## Determinism
 *
 * Both payloads are route-stubbed with `stop-fixtures.ts`. Nothing here reads the
 * committed 5.3 MB bus file, so a monthly export cannot move these baselines.
 * `#lineMap` is masked out of the one full-panel shot for the usual reason — WebGL
 * over third-party tiles never renders identically twice.
 *
 * ## Its own navigation gate
 *
 * `helpers.ts`'s `gotoDashboard` gates on the line table and `#lineMap`, neither of
 * which says anything about whether the stop payload has landed. This spec defines its
 * own gate locally rather than widening a helper five other suites depend on.
 */

/** The panel is URL-gated: `stops=1`, plus whatever else the case needs. */
async function gotoStopPanel(page: Page, search: string): Promise<void> {
  await stubStopPayloads(page);

  // Chart.js `responsive: true` enters a 1px resize feedback loop during a full-page
  // capture, so the document width never settles. Same stub as `gotoDashboardShell`,
  // and it must stay ahead of `page.goto` — an init script only applies to documents
  // created after it is registered.
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  await page.goto('/' + search);
  await expect(page.locator('#stop-panel')).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Wait for the ranked table — the panel's own "data has landed" signal. */
async function waitForStopTable(page: Page): Promise<void> {
  await expect(page.locator('[data-qa="stop-table"] tbody tr').first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Shoot the panel pane on its own, at the tolerance element crops use. */
async function shootPanel(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator('#stop-panel')).toHaveScreenshot(name, {
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
  });
}

test('stop panel — the ranked table is the primary readout', async ({ page }) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  // Assert what the pixels are *of* before capturing them, so a mistyped param cannot
  // be baked into a green baseline: the vocabulary, and the stops themselves.
  await expect(page.getByText('Avg. Boardings')).toBeVisible();
  await expect(page.getByText('Avg. Alightings')).toBeVisible();
  await expect(page.locator('[data-qa="stop-row-rail:union-station"]')).toBeVisible();
  await expect(page.locator('[data-qa="stop-table"] tbody tr')).toHaveCount(3);

  // Ranked, not listed: the busiest stop is first with no interaction at all.
  await expect(
    page.locator('[data-qa="stop-table"] tbody tr').first(),
  ).toContainText('Union Station');

  await shootPanel(page, 'stop-panel-table.png');
});

test('stop panel — a table row draws that stop’s series', async ({ page }) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  await expect(page.locator('[data-qa="stop-series"]')).toHaveCount(0);
  await page.locator('[data-qa="stop-row-rail:union-station"]').click();

  await expect(page.locator('[data-qa="stop-series"]')).toBeVisible();
  await expect(page.locator('[data-qa="stop-series-figure"]')).toContainText(
    'Union Station',
  );

  await shootPanel(page, 'stop-panel-selected-stop.png');
});

test('stop panel — the measure toggle switches to Alightings', async ({ page }) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&measure=offs`,
  );
  await waitForStopTable(page);

  // The measure is URL state, so a shared link opens on it. Assert the control agrees
  // with the param rather than only that the param parsed.
  await expect(
    page.getByRole('radio', { name: 'Alightings' }),
  ).toHaveAttribute('data-state', 'on');
});

test('stop panel — a period with no stop data offers the covered one', async ({
  page,
}) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&start=2015-01&end=2015-12`,
  );

  await expect(page.locator('[data-qa="stop-coverage-empty"]')).toBeVisible();
  await expect(page.locator('[data-qa="stop-table"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await shootPanel(page, 'stop-panel-no-overlap.png');
});

/**
 * The button must set the window through the same setters a chart drag uses, so the
 * pickers and the chart follow it. Asserted through the pickers rather than the URL:
 * the app re-serialises its own state over the query string, so `page.url()` is not a
 * witness to anything.
 */
test('stop panel — the covered-period button moves the pickers and the chart', async ({
  page,
}) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&start=2015-01&end=2015-12`,
  );

  // The button sets the span it names, and both come from the manifest — which is
  // built from the real payloads, not from the fixtures this spec serves. So the
  // window it lands on is Jul 2025 – Jun 2026 even though the stubbed data stops in
  // December, and the fixture months sit inside it.
  await page.locator('#use-stop-coverage-window').click();

  await expect(page.locator('#start-year')).toHaveValue('2025');
  await expect(page.locator('#start-month')).toHaveValue('6');
  await expect(page.locator('#end-year')).toHaveValue('2026');
  await expect(page.locator('#end-month')).toHaveValue('5');

  // And the panel now has data, which is what the button was for.
  await waitForStopTable(page);
});

/**
 * The intent gate. Selecting a rail line must not pull the bus payload, because that
 * file is 5.3 MB and putting it on any path a reader did not ask for is the failure
 * that would undo `OutputArea`'s lazy-load.
 */
test('stop panel — a rail-only selection never requests the bus payload', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  expect(requested.filter((url) => url.includes('stop-ridership.bus'))).toEqual(
    [],
  );
  expect(
    requested.filter((url) => url.includes('stop-ridership.rail')).length,
  ).toBeGreaterThan(0);
});

test('stop panel — selecting a bus line fetches the bus payload once', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await gotoStopPanel(page, `?stops=1&lines=${String(BUS_LINE_ID)}`);
  await waitForStopTable(page);

  await expect(
    page.locator('[data-qa="stop-row-bus:vermont-wilshire"]'),
  ).toBeVisible();
  expect(
    requested.filter((url) => url.includes('stop-ridership.bus')),
  ).toHaveLength(1);
});

/** Off by default, and nothing is fetched for a panel nobody opened. */
test('stop panel — absent, and silent, without stops=1', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await stubStopPayloads(page);
  await page.goto(`/?lines=${String(RAIL_LINE_ID)}`);
  await expect(page.locator('#lineMap')).toBeVisible();

  await expect(page.locator('#stop-panel')).toHaveCount(0);
  expect(requested.filter((url) => url.includes('stop-ridership'))).toEqual([]);
});
