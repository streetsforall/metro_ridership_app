import { stopMetrics } from '../stops';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopRecord } from '../@types/stops.types';

/**
 * Every stop's Boardings and Alightings across a Stop View's month axis.
 *
 * `src/stops/index.ts` exposes readouts and markers but no per-stop series, so the
 * panel assembles one. That is a gap worth closing in the module rather than a licence
 * to re-derive anything here: the months come from the derivation's own axis, and each
 * month's figures come from `stopMetrics`, so this file neither states the window rule
 * nor keeps a second copy of the Day Of Week → column mapping.
 *
 * There is one index per panel, not one build per row. The ranked table draws a
 * sparkline in every row and the figure above it draws the selected stop, so a
 * per-caller scan of the records would be O(rows × records) — ~800 × ~106,000. Both
 * read this.
 */

export interface StopSeriesPoint {
  /** `YYYY-MM`. */
  month: string;
  /** `null` for a month this stop did not report — a gap, never a zero. */
  boardings: number | null;
  alightings: number | null;
}

export interface BuildStopSeriesIndexInput {
  /** Every Stop Ridership Record loaded, unfiltered. */
  records: readonly StopRecord[];
  /**
   * The Stop View's month axis — the months **the derivation** put in the window.
   *
   * Taking the axis from the view is what keeps the window rule to one statement: this
   * file compares month keys against a list `buildStopView` produced and never asks
   * whether a month is in the window (ADR-0009).
   */
  months: readonly string[];
  dayOfWeek: DayOfWeek;
}

export interface StopSeriesIndex {
  /**
   * The series for one (stop, line), aligned to the view's month axis.
   *
   * Never null and never short: a pair with no records in the window still yields one
   * point per month with every figure `null`, so a caller drawing it gets an empty
   * chart of the right width rather than a chart of the wrong width.
   *
   * The returned array is cached, so repeat calls hand back the identical reference —
   * which is what stops Chart.js rebuilding a dataset it already has.
   */
  seriesFor(stopKey: string, lineId: number): StopSeriesPoint[];
}

const monthKey = (record: { year: number; month: number }): string =>
  `${record.year}-${String(record.month).padStart(2, '0')}`;

/**
 * Group every record once, and align a pair's months only when someone asks for it.
 *
 * Each month's figures come from `stopMetrics` over that month's single record — an
 * average of one value is that value — so the boardings a sparkline plots are the same
 * figures the table ranks by and the marker is sized from. Reading the record's fields
 * directly would mean a second copy of the Day Of Week → column mapping, which is
 * private to `src/stops/` for exactly that reason.
 *
 * A month with no record contributes `null` rather than `0`, and no chart drawing this
 * sets `spanGaps`, so the line breaks there.
 */
export function buildStopSeriesIndex({
  records,
  months,
  dayOfWeek,
}: BuildStopSeriesIndexInput): StopSeriesIndex {
  /*
   * Nested line → stop → month rather than a `${lineId}:${stopKey}` composite key.
   * Stop keys are themselves colon-delimited (`bus:vermont-wilshire`), so any
   * delimiter cheap enough to concatenate is one a key could already contain.
   */
  const grouped = new Map<number, Map<string, Map<string, StopRecord>>>();
  for (const record of records) {
    let byStop = grouped.get(record.line_name);
    if (!byStop) {
      byStop = new Map<string, Map<string, StopRecord>>();
      grouped.set(record.line_name, byStop);
    }

    let byMonth = byStop.get(record.stop_key);
    if (!byMonth) {
      byMonth = new Map<string, StopRecord>();
      byStop.set(record.stop_key, byMonth);
    }

    byMonth.set(monthKey(record), record);
  }

  /*
   * Alignment is deferred, not done in the loop above. Grouping the records is one
   * cheap pass; the cost is a `stopMetrics` call per month per pair, and the table
   * mounts a row's sparkline only when it is scrolled to. Aligning every pair up front
   * would do that work for rows nobody looks at.
   */
  const aligned = new Map<number, Map<string, StopSeriesPoint[]>>();

  return {
    seriesFor(stopKey: string, lineId: number): StopSeriesPoint[] {
      let cache = aligned.get(lineId);
      if (!cache) {
        cache = new Map<string, StopSeriesPoint[]>();
        aligned.set(lineId, cache);
      }

      const hit = cache.get(stopKey);
      if (hit) return hit;

      const byMonth = grouped.get(lineId)?.get(stopKey);
      const series = months.map((month) => {
        const record = byMonth?.get(month);
        const metrics = record
          ? stopMetrics({ records: [record], dayOfWeek })
          : null;
        return {
          month,
          boardings: metrics ? metrics.averageBoardings : null,
          alightings: metrics ? metrics.averageAlightings : null,
        };
      });

      cache.set(stopKey, series);
      return series;
    },
  };
}
