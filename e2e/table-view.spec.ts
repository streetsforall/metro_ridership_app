import { test, expect, type Page } from '@playwright/test';
import { desktopOnly, gotoDashboard, shootPane } from './helpers';

/**
 * The expanded table view's own chrome: the sort arrows on the column headers, the
 * partial-coverage marker beside a line name, and a row's sparkline canvas.
 *
 * `visual.spec.ts` already shoots the expanded table full-page. That baseline is 1.2 MB
 * because it renders ~180 rows, each carrying a Chart.js canvas, and a pixel diff over it
 * localises nothing. Everything here is scoped: two element crops (a `thead` and a single
 * `<tr>`) plus ordering assertions read out of the DOM.
 *
 * ## The window
 *
 * `?buses=0` narrows the table to the seven rail lines (801–807), so a `<tr>` crop is a
 * cheap, legible baseline rather than a slice of a 180-row canvas farm.
 *
 * `start=2023-01&end=2025-12` is closed and historical. The Month Window is inclusive of both
 * ends, so those params render **2023-01 through 2025-12, 36 months**. (It was 34, stopping at
 * 2025-10, until ADR-0009 removed the offset.) Both ends are pinned and the rendered end sits
 * inside the dataset, so appending new months to `ridership.json` cannot move a figure in these
 * baselines.
 *
 * ## Why the L Line (806) for the coverage marker
 *
 * `buildCoverageByLine` marks a line partial when its own first or last month differs from
 * the window's. Among rail only two lines qualify here: the D Line (805), whose `coveredTo`
 * advances with every monthly data refresh and would rot the baseline on a schedule, and the
 * L Line (806) — discontinued when the Regional Connector opened, last record 2025-06, which
 * is *inside* the rendered window and can never advance. So 806 renders
 * `2023-01 → 2025-06` and stays there. Its ridership is real through 2023-06 and zero after,
 * which is exactly the shape its sparkline draws.
 *
 * ## Desktop only
 *
 * Both crops are `desktopOnly()`. The ten-column table overflows the 390px mobile viewport,
 * and Playwright clips an element screenshot at the viewport edge — a mobile run captured
 * 1037 of the row's 1184 device px, cutting off the coverage marker mid-string and leaving
 * both the sparkline and the sort arrow outside the frame entirely. That is the "second,
 * meaningless baseline under mobile" `desktopOnly` exists to prevent, and at
 * `deviceScaleFactor: 2.625` it would not even be a cheap one. The mobile expanded table
 * itself stays covered full-page by `visual.spec.ts`.
 */

desktopOnly();

/** Ascending by average weekday ridership over the window above; see the header comment. */
const AVG_ASCENDING = ['807', '806', '805', '803', '804', '801', '802'];

/** Rail only, pinned closed window. Every navigation in this file uses it. */
const RAIL_WINDOW = '?buses=0&start=2023-01&end=2025-12&day=wkday';

/** The L Line: discontinued inside the window, so its coverage bounds are frozen. */
const PARTIAL_LINE = '806';

/** Open the dashboard on the rail-only window and expand into the table view. */
async function gotoExpandedTable(page: Page): Promise<void> {
  await gotoDashboard(page, RAIL_WINDOW);
  await page.locator('#expand-toggle').click();
  await expect(page.locator('table thead')).toBeVisible();
}

/**
 * The rendered row order, as line ids read off the rank cells in DOM order.
 *
 * A failure prints two lists of line ids rather than "some pixels moved", which is the whole
 * reason sort order is asserted here instead of screenshotted.
 */
async function renderedLineIds(page: Page): Promise<string[]> {
  return page
    .locator('td[data-qa^="rank-"]')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('data-qa')!.replace('rank-', '')),
    );
}

/**
 * Reset every scroll container above the table, then the document.
 *
 * The `thead` is `sticky top-0`, and an element screenshot scrolls its target into view
 * first — which offsets a sticky header relative to whatever is scrolling it. Below `lg`
 * the wrapper div around the table is itself the scroller (`max-h-[70vh]`), on desktop it is
 * the document, and the horizontal reset matters because the ten-column table overflows a
 * 390px viewport. Resetting the whole ancestor chain covers all of it without hard-coding
 * which element scrolls at which breakpoint.
 */
async function resetScroll(page: Page): Promise<void> {
  await page.locator('table').evaluate((table) => {
    for (
      let el: HTMLElement | null = table.parentElement;
      el;
      el = el.parentElement
    ) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
      document.scrollingElement.scrollLeft = 0;
    }
  });
}

/**
 * Wait for a row's sparkline to have actually drawn.
 *
 * `LineTableRow` renders the string `'Loading'` until `isMounted` flips on its first effect,
 * then a *second* effect pushes the dataset in — so the canvas element exists a tick before
 * it has anything on it. Gating on the cell, or on the canvas merely being attached, can
 * therefore shoot a blank chart. This reads the canvas back and waits for non-transparent
 * pixels, which is the only observable that distinguishes a drawn sparkline from an empty
 * one without adding a test seam to the component.
 */
async function waitForSparkline(page: Page, lineId: string): Promise<void> {
  const canvas = page.locator(`td[data-qa="sparkline-${lineId}"] canvas`);
  await expect(canvas).toBeVisible();

  await expect
    .poll(
      () =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext('2d');
          if (!ctx || !c.width || !c.height) return 0;
          const { data } = ctx.getImageData(0, 0, c.width, c.height);
          let painted = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) painted++;
          }
          return painted;
        }),
      { message: `sparkline for line ${lineId} never painted` },
    )
    .toBeGreaterThan(0);
}

test('table view — sort chrome and ordering on Avg. Ridership', async ({
  page,
}) => {
  await gotoExpandedTable(page);

  const avgHeader = page.getByRole('columnheader', { name: 'Avg. Ridership' });

  // First click sorts ascending — `headerSortUp` on this header, cleared on every other.
  await avgHeader.click();
  expect(await renderedLineIds(page)).toEqual(AVG_ASCENDING);
  await expect(avgHeader).toHaveClass(/headerSortUp/);

  await resetScroll(page);
  await shootPane(page, 'table thead', 'table-view-sort-asc.png');

  // Second click flips to descending. Asserted, not screenshotted: the arrow glyph is the
  // only pixel difference, and the ordering is what would actually be wrong.
  await avgHeader.click();
  expect(await renderedLineIds(page)).toEqual([...AVG_ASCENDING].reverse());
  await expect(avgHeader).toHaveClass(/headerSortDown/);

  // Third click clears the sort and restores the lines' own order (lettered, then numbered).
  await avgHeader.click();
  await expect(avgHeader).not.toHaveClass(/headerSort(Up|Down)/);
  expect(await renderedLineIds(page)).toEqual([
    '801',
    '802',
    '803',
    '805',
    '804',
    '807',
    '806',
  ]);
});

test('table view — partial-coverage row with sparkline', async ({ page }) => {
  await gotoExpandedTable(page);

  // The L Line stopped reporting 2025-06, inside the window, so it is marked partial.
  await expect(page.locator(`[data-qa="coverage-${PARTIAL_LINE}"]`)).toHaveText(
    '2023-01 → 2025-06',
  );

  await waitForSparkline(page, PARTIAL_LINE);
  await resetScroll(page);

  await shootPane(
    page,
    `tr:has(> td[data-qa="rank-${PARTIAL_LINE}"])`,
    'table-view-partial-coverage-row.png',
  );
});
