import { expect, test, type Page } from '@playwright/test';
import {
  BUS_LINE_ID,
  RAIL_LINE_ID,
  stopQa,
  stubStopPayloads,
} from './stop-fixtures';

/**
 * The stop panel's DOM — the ranked table, the measure toggle and the two coverage
 * states, all served from stubbed payloads so an export can't move these baselines.
 */

/** The panel is URL-gated: `stops=1`, plus whatever else the case needs. */
async function gotoStopPanel(page: Page, search: string): Promise<void> {
  await stubStopPayloads(page);

  // Chart.js's responsive mode never settles during a full-page capture without this stub.
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

/** Waits for the ranked table, the panel's own signal that the data has landed. */
async function waitForStopTable(page: Page): Promise<void> {
  await expect(
    page.locator('[data-qa="stop-table"] tbody tr').first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Shoots the panel pane on its own, at the tolerance element crops use. */
async function shootPanel(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator('#stop-panel')).toHaveScreenshot(name, {
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
  });
}

test('stop panel — the ranked table is the primary readout', async ({
  page,
}) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  // Assert what the pixels are *of*, so a mistyped param can't bake into a green baseline.
  await expect(page.getByText('Avg. Boardings')).toBeVisible();
  await expect(page.getByText('Avg. Alightings')).toBeVisible();
  await expect(
    page.locator(stopQa('row', RAIL_LINE_ID, 'rail:union-station')),
  ).toBeVisible();
  await expect(page.locator('[data-qa="stop-table"] tbody tr')).toHaveCount(3);

  // Ranked, not listed: the busiest stop is first with no interaction at all.
  await expect(
    page.locator('[data-qa="stop-table"] tbody tr').first(),
  ).toContainText('Union Station');

  await shootPanel(page, 'stop-panel-table.png');
});

/** `Clear All` is the way out, without which the selection would be a one-way door. */
test('stop panel — Clear All empties the selection, and the URL follows', async ({
  page,
}) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  await page.locator(stopQa('row', RAIL_LINE_ID, 'rail:union-station')).click();
  expect(page.url()).toContain('stop=');

  await page.locator('[data-qa="stop-clear-all"]').click();

  await expect(page.locator('[data-qa="stop-series"]')).toHaveCount(0);
  // A param that must *disappear* is the one thing `page.url()` can actually prove.
  expect(page.url()).not.toContain('stop=');
});

/** The whole row is a click target, not just the checkbox inside it. */
test('stop panel — clicking the selected row deselects it', async ({
  page,
}) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  const row = page.locator(stopQa('row', RAIL_LINE_ID, 'rail:union-station'));

  await row.click();
  await expect(
    page.locator(
      `${stopQa('select', RAIL_LINE_ID, 'rail:union-station')} [role="checkbox"]`,
    ),
  ).toHaveAttribute('data-state', 'checked');

  await row.click();
  await expect(
    page.locator(
      `${stopQa('select', RAIL_LINE_ID, 'rail:union-station')} [role="checkbox"]`,
    ),
  ).toHaveAttribute('data-state', 'unchecked');
});

/** The checkbox sits inside a row that is itself a toggle, so one click must toggle once. */
test('stop panel — a row checkbox toggles once, not twice', async ({
  page,
}) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  const checkbox = page.locator(
    `${stopQa('select', RAIL_LINE_ID, 'rail:union-station')} [role="checkbox"]`,
  );
  await expect(checkbox).toHaveAttribute('data-state', 'unchecked');

  await checkbox.click();

  await expect(checkbox).toHaveAttribute('data-state', 'checked');

  await checkbox.click();

  await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
});

/** Select All reaches every listed row; Clear All reaches everything. */
test('stop panel — Select All checks every listed row', async ({ page }) => {
  await gotoStopPanel(page, `?stops=1&lines=${String(RAIL_LINE_ID)}`);
  await waitForStopTable(page);

  await page.locator('[data-qa="stop-select-all"]').click();

  await expect(
    page.locator(
      '[data-qa^="stop-select-"] [role="checkbox"][data-state="checked"]',
    ),
  ).toHaveCount(3);

  await page.locator('[data-qa="stop-clear-all"]').click();

  await expect(
    page.locator(
      '[data-qa^="stop-select-"] [role="checkbox"][data-state="checked"]',
    ),
  ).toHaveCount(0);
});

/**
 * The search narrows the table and with it what `Select All` reaches, driven through
 * `stopq=` because typing races the re-render (`line-filters.spec.ts`).
 */
test('stop panel — the search narrows the table and scopes Select All', async ({
  page,
}) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&stopq=union`,
  );
  await waitForStopTable(page);

  await expect(page.locator('[data-qa="stop-table"] tbody tr')).toHaveCount(1);
  await expect(
    page.locator(stopQa('row', RAIL_LINE_ID, 'rail:union-station')),
  ).toBeVisible();
  // The box has to agree with the param, not merely prove the param parsed.
  await expect(page.locator('#search-stops')).toHaveValue('union');

  await page.locator('[data-qa="stop-select-all"]').click();

  await expect(
    page.locator(
      '[data-qa^="stop-select-"] [role="checkbox"][data-state="checked"]',
    ),
  ).toHaveCount(1);
});

test('stop panel — the measure toggle switches to Alightings', async ({
  page,
}) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&measure=offs`,
  );
  await waitForStopTable(page);

  // The control has to agree with the param, not merely prove the param parsed.
  await expect(page.getByRole('radio', { name: 'Alightings' })).toHaveAttribute(
    'data-state',
    'on',
  );
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
 * The button sets the window through the same setters a chart drag uses, which the
 * pickers — not the URL — are the witness to.
 */
test('stop panel — the covered-period button moves the pickers and the chart', async ({
  page,
}) => {
  await gotoStopPanel(
    page,
    `?stops=1&lines=${String(RAIL_LINE_ID)}&start=2015-01&end=2015-12`,
  );

  // The span comes from the manifest, built from the real payloads rather than these fixtures.
  await page.locator('#use-stop-coverage-window').click();

  await expect(page.locator('#start-year')).toHaveValue('2025');
  await expect(page.locator('#start-month')).toHaveValue('6');
  await expect(page.locator('#end-year')).toHaveValue('2026');
  await expect(page.locator('#end-month')).toHaveValue('5');

  // The panel now has data, which is what the button was for.
  await waitForStopTable(page);
});

/** Selecting a rail line must not pull the 5.3 MB bus payload. */
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
    page.locator(stopQa('row', BUS_LINE_ID, 'bus:vermont-wilshire')),
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
