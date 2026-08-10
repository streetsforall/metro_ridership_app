import { test, expect, type Page } from '@playwright/test';
import { desktopOnly, gotoDashboard, gotoDashboardShell, shootPane } from './helpers';

/**
 * Element-scoped visual coverage for the line selector's *filters* — the search box, the
 * bus/train mode toggles, and the empty state they can produce between them.
 *
 * Every case shoots `#line-selector-pane` in its **collapsed** form. Collapsed the table renders
 * no metric columns and no per-row sparkline (`isExpanded` gates all of them in
 * `LineTableRow.tsx`), so the crop is entirely canvas-free — the most stable shot this suite can
 * take. The expanded table is covered elsewhere; nothing here touches `#expand-toggle`.
 *
 * Rules these baselines depend on:
 *
 * - **Driven by the query string, never by typing.** `q`, `buses` and `trains` are all real URL
 *   params (`useUserDashboardInput.ts` L107-112, `parseModesFromParams`), parsed once in the lazy
 *   `useState` initialisers. Typing into `#search-lines` would race the re-render that the
 *   screenshot is waiting on.
 * - **`start` and `end` are both pinned, to a closed historical window.** The collapsed pane shows
 *   no ridership figures, but *which rows exist* still depends on the window: `isVisibleLine`
 *   drops any line with no metrics over it. A closed past window cannot gain records, so appends
 *   to `ridership.json` cannot move these baselines.
 * - **Line 805 is never named**, and does not appear at all: its coverage bounds advance with
 *   every monthly refresh, and the `?buses=0` window happens to leave it without metrics, so the
 *   rail rows are A, B, C, E, K, L. A closed window fixes that set either way.
 *
 * Captures go through `shootPane`, which parks the mouse at (0,0) first. Without that, a cursor
 * left over a row triggers the `group-hover` swap in `LineTableRow` that replaces a line's name
 * with "Former <name>", and the shot pins the hover state instead of the resting one.
 */

/** Closed historical window: one full year of 2023, well behind any future data append. */
const WINDOW = 'start=2022-12&end=2023-12&day=wkday';

/** Every row checkbox in the collapsed list. Excludes the Aggregate checkbox, which is a sibling
 *  of the table rather than a cell in it. */
const rowCheckboxes = (page: Page) =>
  page.locator('#line-selector-pane td[data-qa^="select-"] [role="checkbox"]');

const checkedRowCheckboxes = (page: Page) =>
  page.locator(
    '#line-selector-pane td[data-qa^="select-"] [role="checkbox"][data-state="checked"]',
  );

test('search filters the line list', async ({ page }) => {
  // `isVisibleLine` substring-matches the *display* name, case-insensitively. Bus lines are named
  // "Line <number>", so "a line" cannot match one — this resolves to the A Line alone, whatever
  // the bus roster does next.
  await gotoDashboard(page, `?q=a+line&${WINDOW}`);
  await expect(page.locator('#line-selector-pane td[data-qa="select-801"]')).toBeVisible();
  await expect(rowCheckboxes(page)).toHaveCount(1);

  await shootPane(page, '#line-selector-pane', 'line-filters-search.png');
});

test('rail-only mode filter', async ({ page }) => {
  // `parseModesFromParams` reads absence as on, so `buses=0` alone leaves `['train']`.
  await gotoDashboard(page, `?buses=0&${WINDOW}`);
  // Rail only: the bus rows are the numeric names, and none of them should have survived.
  await expect(page.locator('#line-selector-pane td[data-qa="select-801"]')).toBeVisible();
  await expect(
    page.locator('#line-selector-pane').getByText(/^Line \d+$/),
  ).toHaveCount(0);

  await shootPane(page, '#line-selector-pane', 'line-filters-rail-only.png');
});

/**
 * Its own `describe` purely so `desktopOnly()` scopes to this one test: the helper is a
 * declaration-scope modifier, and at file scope it would skip every test here under `mobile`.
 * The empty state is a centred single string with no width-dependent layout, so a mobile
 * baseline would pin nothing the desktop one does not.
 */
test.describe('empty mode', () => {
  desktopOnly();

  test('empty mode state', async ({ page }) => {
    // `gotoDashboardShell`, not `gotoDashboard`: with both modes off `sortedLines` is empty, so
    // LineSelector renders the "Please select a transit mode." branch and no
    // `td[data-qa^="select-"]` ever appears for the data gate to resolve on.
    await gotoDashboardShell(page, `?buses=0&trains=0&${WINDOW}`);
    await expect(page.getByText('Please select a transit mode.')).toBeVisible();
    await expect(rowCheckboxes(page)).toHaveCount(0);

    // The pane is `min-h-full` inside a grid it shares with the lazily-loaded `OutputArea`, so
    // its height is settled by the sibling. Wait for that chunk to mount before cropping.
    await expect(page.locator('#lineMap')).toBeVisible();

    await shootPane(page, '#line-selector-pane', 'line-filters-empty-mode.png');
  });
});

/**
 * Select All / Clear All are behavioural, not visual: a pixel diff of a column of checkboxes
 * localises nothing, while a checked-count before and after says exactly what changed. Run against
 * the rail-only list to keep the row count small and the assertions fast.
 */
test('select all and clear all', async ({ page }) => {
  await gotoDashboard(page, `?buses=0&lines=801&${WINDOW}`);

  const total = await rowCheckboxes(page).count();
  expect(total).toBeGreaterThan(1);
  await expect(checkedRowCheckboxes(page)).toHaveCount(1);

  await page.locator('#select-all').click();
  await expect(checkedRowCheckboxes(page)).toHaveCount(total);

  await page.locator('#clear-all').click();
  await expect(checkedRowCheckboxes(page)).toHaveCount(0);
});
