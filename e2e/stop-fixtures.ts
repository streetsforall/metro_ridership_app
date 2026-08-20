import type { Page } from '@playwright/test';

/**
 * Route stubs for the two stop payloads.
 *
 * The committed bus payload is 5.3 MB. Nothing that gates a PR should depend on it:
 * a baseline shot against the real file re-renders every time an export lands, and a
 * 5.3 MB parse inside a screenshot run is time spent proving nothing. These fixtures
 * are small, fixed, and shaped exactly like the wire format `decodeStopRidership`
 * accepts — columns resolved by name, `stop` an index into the dictionary.
 *
 * **The stop keys are real.** `attachStopLocations` joins against the bundled
 * `src/data/stop_locations.json`, so a made-up key would decode fine, appear in the
 * table, and be silently missing from the map — which is the honest behaviour for a
 * stop GTFS has no geometry for, and useless as a fixture for the map layer.
 *
 * Kept out of `helpers.ts` deliberately: that file is shared by the suites this change
 * does not touch, and its `gotoDashboard` gates on the line table and the map rather
 * than on the stop table.
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

/** The months the fixtures report. Inside the app's default Month Window. */
export const FIXTURE_MONTHS = [
  [2025, 7],
  [2025, 8],
  [2025, 9],
  [2025, 10],
  [2025, 11],
  [2025, 12],
] as const;

/** A Line, whose stops carry rail-scale magnitudes. */
export const RAIL_LINE_ID = 801;
/** Line 204, whose stops carry bus-scale magnitudes two orders of magnitude below. */
export const BUS_LINE_ID = 204;

/**
 * The selector for one cell of one stop row.
 *
 * A stop key alone does not identify a row: the same stop serves several lines, and a
 * reader selecting two of them gets two rows for it. `StopTable` therefore suffixes
 * `stop-row-`, `stop-select-` and `stop-sparkline-` with the line and the key together,
 * which is also what React keys the row by. Built here rather than written out at each
 * call site so the shape is stated once.
 */
export function stopQa(
  part: 'row' | 'select' | 'sparkline',
  lineId: number,
  key: string,
): string {
  return `[data-qa="stop-${part}-${String(lineId)}-${key}"]`;
}

interface StopFixture {
  key: string;
  name: string;
  /** Weekday boardings in the first fixture month; later months step up from it. */
  boardings: number;
}

const RAIL_STOPS: StopFixture[] = [
  { key: 'rail:union-station', name: 'Union Station', boardings: 9000 },
  {
    key: 'rail:7th-street-metro-center-station',
    name: '7th Street / Metro Center Station',
    boardings: 6000,
  },
  {
    key: 'rail:103rd-street-watts-towers-station',
    name: '103rd Street / Watts Towers Station',
    boardings: 1500,
  },
];

const BUS_STOPS: StopFixture[] = [
  { key: 'bus:vermont-wilshire', name: 'Vermont / Wilshire', boardings: 900 },
  {
    key: 'bus:vermont-santa-monica',
    name: 'Vermont / Santa Monica',
    boardings: 450,
  },
  { key: 'bus:vermont-sunset', name: 'Vermont / Sunset', boardings: 120 },
];

/**
 * Build one payload. Alightings sit just below boardings so a shot that reads one
 * column where the other was meant is visibly wrong rather than plausibly right, and
 * each month steps by a fixed amount so the per-stop series is a legible slope rather
 * than a flat line.
 */
function payload(stops: StopFixture[], lineId: number) {
  const rows: number[][] = [];
  stops.forEach((stop, index) => {
    FIXTURE_MONTHS.forEach(([year, month], monthIndex) => {
      const ons = stop.boardings + monthIndex * Math.round(stop.boardings * 0.05);
      const offs = Math.round(ons * 0.9);
      rows.push([
        year,
        month,
        lineId,
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

  return {
    schema: 1,
    cols: COLS,
    stops: stops.map((stop) => ({ key: stop.key, name: stop.name })),
    rows,
  };
}

/**
 * Serve both fixtures in place of the real payloads.
 *
 * MUST be called before navigating — a route registered after `page.goto` does not
 * apply to a request the page has already issued.
 */
export async function stubStopPayloads(page: Page): Promise<void> {
  await page.route('**/stop-ridership.rail.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload(RAIL_STOPS, RAIL_LINE_ID)),
    }),
  );
  await page.route('**/stop-ridership.bus.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload(BUS_STOPS, BUS_LINE_ID)),
    }),
  );
}
