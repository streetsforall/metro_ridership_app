import { isInMonthWindow } from '../ridership';
import { getLineColor } from '../utils/lines';
import { buildStopReadouts, type StopReadout } from './stopReadouts';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure, StopPlace, StopRecord } from '../@types/stops.types';

/**
 * Smallest and largest circle radius, in pixels, at any zoom.
 *
 * The floor exists so a stop with real but tiny ridership is still clickable; it is
 * the one place the area proportionality below is deliberately broken, and it is
 * broken at the bottom of the range, where the distortion is least misleading.
 */
const RADIUS_MIN = 3;
const RADIUS_MAX = 22;

/** What the map layer reads off each marker. No expression in `Map.tsx` recomputes these. */
export interface StopMarkerProperties {
  stop_key: string;
  /** For the layer filter: `['in', ['get','line_id'], ['literal', selectedIds]]`. */
  line_id: number;
  name: string;
  /** Circle radius in pixels. See {@link buildStopView} for the scale. */
  radius: number;
  /** `getLineColor(line_id)` — the same colour the chart, the legend and the popup use. */
  color: string;
  /** The average the current Stop Measure selects, for the popup and the legend. */
  value: number;
}

export interface StopCoverage {
  /** First month the payload reports, `YYYY-MM`. `null` when it reports nothing. */
  from: string | null;
  /** Last month the payload reports, `YYYY-MM`. */
  to: string | null;
  /**
   * Does the payload's span intersect the current Month Window at all?
   *
   * Answered by running the **same** `isInMonthWindow` predicate the records are
   * filtered by, not by comparing `from`/`to` against the window — an independent
   * comparison would have to restate the offset, which is the one thing ADR-0001
   * forbids. `false` is the panel's empty state: stop data exists, just not here.
   */
  overlapsWindow: boolean;
}

export interface StopViewInput {
  /**
   * `null` is the loading state — it yields the empty view, exactly as
   * `RidershipViewInput.records` does.
   */
  records: StopRecord[] | null;
  /** Stop Places, from `decodeStopRidership` then `attachStopLocations`. */
  places: readonly StopPlace[];
  /** The lines to include. Readout and marker order follow this order. */
  lineIds: readonly number[];
  startDate: Date;
  endDate: Date;
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
}

export interface StopView {
  /** The stop-grain Month Axis: chronological union of the months in the window, `YYYY-MM`. */
  months: string[];
  /** One per (stop, line) in the window. Deterministically ordered; the table ranks. */
  readouts: StopReadout[];
  /** Ready for `getSource('stop-ridership').setData(...)` — nothing downstream recomputes it. */
  markers: GeoJSON.FeatureCollection<GeoJSON.Point, StopMarkerProperties>;
  coverage: StopCoverage;
}

const monthKey = (record: { year: number; month: number }): string =>
  `${record.year}-${String(record.month).padStart(2, '0')}`;

const emptyMarkers = (): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  StopMarkerProperties
> => ({ type: 'FeatureCollection', features: [] });

/**
 * Everything the stop panel draws that follows from one set of user choices — the
 * ranked readouts, the map markers, the month axis and the coverage banner.
 *
 * ## One window predicate, imported not restated
 *
 * The Month Window filter is `isInMonthWindow` from `src/ridership`. This module does
 * **not** restate it. The two derivations run against the same user choices and are
 * drawn one above the other; if they disagreed by a month the panel would contradict
 * the chart for the same URL, which is the failure
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md` exists to prevent.
 *
 * ## The marker scale is per mode, and sqrt-scales area
 *
 * Rail and bus differ by roughly two orders of magnitude at stop grain. One shared
 * domain makes every rail station a blob or every bus stop invisible, so each mode is
 * normalised against its own maximum. `radius = MIN + (MAX - MIN) * sqrt(v / vmax)`:
 * because a circle's area goes as `r²`, taking the square root of the **value** is
 * what makes the drawn **area** proportional to it. Scaling the radius linearly
 * instead would draw a stop with 10× the boardings 100× larger.
 *
 * A mode whose maximum is `0` — every stop reporting nothing — draws every circle at
 * `RADIUS_MIN` rather than dividing by zero.
 *
 * It is computed here, where the domain is known, and carried in feature properties,
 * so the paint expression is a plain `['get', 'radius']`. The map layer does not
 * recompute it, and neither does anything else.
 *
 * The mode a marker normalises against is its **Stop Place's** mode, i.e. which export
 * the row came from. G Line and J Line BRT stops therefore sit in the bus domain,
 * which is where their magnitudes belong even though the app lists those lines under
 * the train filter.
 */
export function buildStopView({
  records,
  places,
  lineIds,
  startDate,
  endDate,
  dayOfWeek,
  measure,
}: StopViewInput): StopView {
  if (!records)
    return {
      months: [],
      readouts: [],
      markers: emptyMarkers(),
      coverage: { from: null, to: null, overlapsWindow: false },
    };

  /**
   * Coverage spans the **whole payload**, before either filter: the banner says what
   * stop data exists, not what the current selection happens to show. `overlapsWindow`
   * is likewise about the payload, so a window with no *selected* lines still reports
   * an overlap rather than offering to move the window that is already right.
   */
  let from: string | null = null;
  let to: string | null = null;
  let overlapsWindow = false;
  for (const record of records) {
    const key = monthKey(record);
    if (from === null || key < from) from = key;
    if (to === null || key > to) to = key;
    if (!overlapsWindow && isInMonthWindow(record, startDate, endDate))
      overlapsWindow = true;
  }

  const lineSet = new Set(lineIds);
  const windowed = records.filter(
    (record) =>
      lineSet.has(record.line_name) &&
      isInMonthWindow(record, startDate, endDate),
  );

  // Sorted as `YYYY-MM` strings, which are chronological lexicographically —
  // unlike the chart's `"2025 9"` time keys, which are not.
  const months = [...new Set(windowed.map(monthKey))].sort();

  const placesByKey = new Map(places.map((place) => [place.key, place]));
  const readouts = buildStopReadouts({
    records: windowed,
    places: placesByKey,
    lineIds,
    dayOfWeek,
    measure,
  });

  /**
   * Only readouts with a coordinate reach the map. A stop GTFS had no geometry for
   * still has a readout and still appears in the table — it is absent from this layer
   * only, which is the whole reason unmatched stops are kept rather than dropped.
   */
  const mappable = readouts.filter(
    (readout) =>
      readout.lat !== null &&
      readout.lon !== null &&
      readout.measuredAverage !== undefined,
  );

  const maxByMode = new Map<StopPlace['mode'], number>();
  for (const readout of mappable)
    maxByMode.set(
      readout.mode,
      Math.max(maxByMode.get(readout.mode) ?? 0, readout.measuredAverage ?? 0),
    );

  const features: GeoJSON.Feature<GeoJSON.Point, StopMarkerProperties>[] =
    mappable.map((readout) => {
      const value = readout.measuredAverage ?? 0;
      const max = maxByMode.get(readout.mode) ?? 0;
      const radius =
        max > 0
          ? RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * Math.sqrt(value / max)
          : RADIUS_MIN;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          // GeoJSON is [lon, lat]. The one place in this module that order matters.
          coordinates: [readout.lon as number, readout.lat as number],
        },
        properties: {
          stop_key: readout.key,
          line_id: readout.line_name,
          name: readout.name,
          radius,
          color: getLineColor(readout.line_name),
          value,
        },
      };
    });

  return {
    months,
    readouts,
    markers: { type: 'FeatureCollection', features },
    coverage: { from, to, overlapsWindow },
  };
}
