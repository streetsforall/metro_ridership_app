import type { Page } from '@playwright/test';

/**
 * A rail payload longer than the table's scroller, for the one behaviour a three-stop
 * fixture can't show — its stop keys are invented, so nothing here may be used for a map shot.
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
 * Serves a rail payload of `MANY_ROWS_COUNT` stops, and must be called before
 * navigating.
 */
export async function stubManyStopRows(page: Page): Promise<void> {
  const stops = Array.from({ length: MANY_ROWS_COUNT }, (_, index) => ({
    key: `rail:sparkline-stop-${index}`,
    name: `Sparkline Stop ${String(index).padStart(2, '0')}`,
  }));

  const rows: number[][] = [];
  stops.forEach((_, index) => {
    // Descending, so a row's position in the ranked list is predictable from its index.
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
