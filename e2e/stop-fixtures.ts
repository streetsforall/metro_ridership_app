import type { Page } from '@playwright/test';

/**
 * Small route stubs for the two stop payloads, so no baseline depends on the committed
 * 5.3 MB bus file — the stop keys are real, or the map would have no geometry to join.
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
 * The selector for one cell of one stop row, keyed by line and stop because one stop can
 * be two rows.
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
 * Builds one payload, with alightings just below boardings and a fixed step per month
 * so a column read in the wrong place is visibly wrong.
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

/** Serves both fixtures in place of the real payloads, and must be called before navigating. */
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
