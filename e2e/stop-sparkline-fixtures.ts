import type { Page } from '@playwright/test';

/**
 * A rail payload with more stops than fit the table's `max-h-[28rem]` scroller.
 *
 * `stop-fixtures.ts` serves three stops, which is right for every case that shoots the
 * panel but useless for the one behaviour that only appears in a long list: the table
 * mounts a row's sparkline when it is scrolled to, not before. Three rows are all
 * visible at once, so nothing is deferred and the assertion would pass on a table that
 * had no laziness at all.
 *
 * A separate file rather than an option on the shared one: `stop-fixtures.ts` is an
 * existing helper that other cases and every committed baseline depend on, and widening
 * it to serve two shapes is how a fixture starts deciding what a spec proves.
 *
 * **The stop keys are invented, and that is fine here.** `attachStopLocations` joins
 * against the bundled `stop_locations.json`, so these stops are absent from the map
 * layer — which is the honest behaviour for a stop GTFS has no geometry for, and
 * irrelevant to a table-only spec. Nothing in this file may be used for a map shot.
 */

const COLS = [
  'year',
  'month',
  'line',
  'stop',
  'wd_ons',
  'wd_offs',
  'sa_ons',
  'sa_offs',
  'su_ons',
  'su_offs',
];

const MONTHS = [
  [2025, 7],
  [2025, 8],
  [2025, 9],
  [2025, 10],
  [2025, 11],
  [2025, 12],
] as const;

export const MANY_ROWS_LINE_ID = 801;

/** Comfortably more than the ~10 rows the 28rem scroller shows at once. */
export const MANY_ROWS_COUNT = 60;

/**
 * Serve a rail payload of `MANY_ROWS_COUNT` stops.
 *
 * MUST be called before navigating — a route registered after `page.goto` does not
 * apply to a request the page has already issued. The bus route is stubbed empty so a
 * selection can never reach for the committed 5.3 MB file.
 */
export async function stubManyStopRows(page: Page): Promise<void> {
  const stops = Array.from({ length: MANY_ROWS_COUNT }, (_, index) => ({
    key: `rail:sparkline-stop-${index}`,
    name: `Sparkline Stop ${String(index).padStart(2, '0')}`,
  }));

  const rows: number[][] = [];
  stops.forEach((_, index) => {
    // Descending, so the ranked default order matches the generated order and a row's
    // position in the list is predictable from its index.
    const base = (MANY_ROWS_COUNT - index) * 100;
    MONTHS.forEach(([year, month], monthIndex) => {
      const ons = base + monthIndex * 10;
      const offs = Math.round(ons * 0.9);
      rows.push([
        year,
        month,
        MANY_ROWS_LINE_ID,
        index,
        ons,
        offs,
        Math.round(ons * 0.6),
        Math.round(offs * 0.6),
        Math.round(ons * 0.4),
        Math.round(offs * 0.4),
      ]);
    });
  });

  await page.route('**/stop-ridership.rail.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schema: 1, cols: COLS, stops, rows }),
    }),
  );

  await page.route('**/stop-ridership.bus.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schema: 1, cols: COLS, stops: [], rows: [] }),
    }),
  );
}
