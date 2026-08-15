import { measuredAverage, stopMetrics, type StopMetrics } from './stopMetrics';
import { modeFromStopKey } from './stopData';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure, StopPlace, StopRecord } from '../@types/stops.types';

/**
 * A Stop Place together with everything the current Stop View derives about it **for
 * one line**.
 *
 * The stop-grain parallel of a Line Readout, and it follows the same rule: derived
 * per Month Window and thrown away, never written back onto the Stop Place. A Stop
 * Place is a location and a name, permanently; a Stop Readout is that stop as
 * displayed for one window, one day-of-week and one measure. See
 * `docs/adr/0005-derived-figures-live-on-line-readouts.md`.
 *
 * **One readout per (stop, line), not per stop.** The grain of the data is stop ×
 * line — a stop served by three lines produces three readouts, and the plan's
 * decision not to ship a stop-total-across-lines rollup is what makes that the honest
 * shape. Callers wanting a whole-stop total sum the readouts themselves.
 */
export type StopReadout = StopPlace & {
  /** Numeric line id. Named to match `RidershipRecord.line_name`. */
  line_name: number;
  /**
   * The average the current Stop Measure selects. `undefined` when the stop has no
   * records in the window, matching the `Partial<StopMetrics>` fields beside it.
   *
   * **That state is not reachable through `buildStopView`.** A group exists only
   * because a record landed in it, so `stopMetrics` never returns `null` on that path
   * and these fields are always written. The nullability is the honest signature of
   * ADR-0004's contract rather than a case the UI has to render — a "no figures" branch
   * in the table would be dead code no test could reach. Treat it the way
   * `buildRidershipView` treats an empty series: structurally impossible, declared
   * anyway so the contract does not depend on the caller knowing that.
   */
  measuredAverage: number | undefined;
  /**
   * This stop's share of its line's total under the current measure, `0`–`1`.
   *
   * Cannot be derived from one stop's records — it needs every stop on the line — so
   * it is computed here rather than in `stopMetrics`, the same way `isPartialCoverage`
   * stays out of `LineMetrics` (ADR-0004). `undefined` when the line's total is `0`,
   * because `0 / 0` is not a share.
   */
  shareOfLine: number | undefined;
} & Partial<StopMetrics>;

export interface StopReadoutsInput {
  /**
   * Stop Ridership Records already narrowed to the Month Window and the selected
   * lines. This function does not filter; `buildStopView` owns that, so the window
   * predicate is applied exactly once.
   */
  records: readonly StopRecord[];
  /** Stop Places by key, from `decodeStopRidership` + `attachStopLocations`. */
  places: ReadonlyMap<string, StopPlace>;
  /** Readout order follows this order, then stop key. Ranking is the table's job. */
  lineIds: readonly number[];
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
}

/** Group key. `\u0000` cannot occur in a line id or a slug, so it cannot collide. */
const groupKey = (lineId: number, stopKey: string) =>
  `${lineId}\u0000${stopKey}`;

/**
 * A Stop Place for a key the caller supplied no place for.
 *
 * Unreachable through `buildStopView`, whose places come from the payload's own
 * dictionary and therefore cover every key in it. It exists so that a caller handing
 * in a partial map gets a row with a visible key rather than a crash or a silently
 * missing stop — the same "keep it, label it" choice the pipeline makes for stops
 * GTFS had no geometry for.
 */
const placeholderPlace = (key: string): StopPlace => ({
  key,
  name: key,
  lat: null,
  lon: null,
  mode: modeFromStopKey(key),
  stationOrder: null,
});

/**
 * Attach each stop's derived figures to its Stop Place, one readout per (stop, line).
 *
 * A group whose records yield no Stop Metrics gets no figures rather than zeroes:
 * spreading an absent entry writes no keys, so there is nothing to clear between
 * windows. That is ADR-0005's contract at stop grain.
 */
export function buildStopReadouts({
  records,
  places,
  lineIds,
  dayOfWeek,
  measure,
}: StopReadoutsInput): StopReadout[] {
  const groups = new Map<
    string,
    { lineId: number; stopKey: string; records: StopRecord[] }
  >();

  for (const record of records) {
    const key = groupKey(record.line_name, record.stop_key);
    let group = groups.get(key);
    if (!group) {
      group = {
        lineId: record.line_name,
        stopKey: record.stop_key,
        records: [],
      };
      groups.set(key, group);
    }
    group.records.push(record);
  }

  // Line totals for `shareOfLine`, over the same measure the shares will be read
  // against. Accumulated in a first pass because a share needs the whole line.
  const lineTotals = new Map<number, number>();
  const figures = new Map<string, StopMetrics | null>();
  for (const [key, group] of groups) {
    const metrics = stopMetrics({ records: group.records, dayOfWeek });
    figures.set(key, metrics);
    if (metrics)
      lineTotals.set(
        group.lineId,
        (lineTotals.get(group.lineId) ?? 0) + measuredAverage(metrics, measure),
      );
  }

  const lineRank = new Map(lineIds.map((id, index) => [id, index]));

  return [...groups.entries()]
    .sort(([, a], [, b]) => {
      const rankA = lineRank.get(a.lineId) ?? Infinity;
      const rankB = lineRank.get(b.lineId) ?? Infinity;
      if (rankA !== rankB) return rankA - rankB;
      if (a.lineId !== b.lineId) return a.lineId - b.lineId;
      return a.stopKey.localeCompare(b.stopKey);
    })
    .map(([key, group]) => {
      const metrics = figures.get(key) ?? null;
      const total = lineTotals.get(group.lineId) ?? 0;
      const value = metrics ? measuredAverage(metrics, measure) : undefined;

      return {
        ...(places.get(group.stopKey) ?? placeholderPlace(group.stopKey)),
        line_name: group.lineId,
        measuredAverage: value,
        shareOfLine:
          value !== undefined && total > 0 ? value / total : undefined,
        ...metrics,
      };
    });
}
