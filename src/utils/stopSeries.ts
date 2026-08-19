import { stopMetrics } from '../stops';
import { formatMonth } from './month';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopRecord } from '../@types/stops.types';

/**
 * Every stop's boardings and alightings across a stop view's month axis. `src/stops/`
 * exposes no per-stop series, so the panel assembles one — a gap to close there rather
 * than a licence to re-derive anything here. The months come from the derivation's axis
 * and the figures from `stopMetrics`, so this states no window rule and keeps no second
 * copy of the day-of-week → column mapping.
 *
 * One index per panel, not one build per row: the table draws a sparkline per row and the
 * figure draws the selection, so a per-caller scan would be ~800 × ~106,000.
 */

export interface StopSeriesPoint {
  /** `YYYY-MM`. */
  month: string;
  /** `null` for a month this stop did not report — a gap, never a zero. */
  boardings: number | null;
  alightings: number | null;
}

export interface BuildStopSeriesIndexInput {
  /** Every loaded stop record, unfiltered. */
  records: readonly StopRecord[];
  /**
   * The stop view's month axis — the months the derivation put in the window. Taking it
   * from the view keeps the window rule to one statement: this file compares keys against
   * a list `buildStopView` produced and never asks what "in the window" means (ADR-0009).
   */
  months: readonly string[];
  dayOfWeek: DayOfWeek;
}

export interface StopSeriesIndex {
  /**
   * The series for one (stop, line), aligned to the view's month axis. Never null and
   * never short: a pair with no records still yields one all-`null` point per month, so a
   * caller gets an empty chart of the right width. The array is cached, so repeat calls
   * hand back the same reference and Chart.js does not rebuild a dataset it has.
   */
  seriesFor(stopKey: string, lineId: number): StopSeriesPoint[];
}

/** Get the entry, creating it on first ask. */
function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  map.set(key, made);
  return made;
}

/**
 * Group every record once, and align a pair's months only when asked. Each month's figures
 * come from `stopMetrics` over that month's single record — an average of one value is
 * that value — so a sparkline plots the figures the table ranks by. Reading the record's
 * fields directly would mean a second copy of the day-of-week → column mapping.
 *
 * A month with no record contributes `null` rather than `0`, and nothing drawing this sets
 * `spanGaps`, so the line breaks there.
 */
export function buildStopSeriesIndex({
  records,
  months,
  dayOfWeek,
}: BuildStopSeriesIndexInput): StopSeriesIndex {
  // Nested line → stop → month rather than a composite key: stop keys are themselves
  // colon-delimited, so any cheap delimiter is one a key could already contain.
  const grouped = new Map<number, Map<string, Map<string, StopRecord>>>();
  for (const record of records) {
    const byStop = getOrCreate(
      grouped,
      record.line_name,
      () => new Map<string, Map<string, StopRecord>>(),
    );
    const byMonth = getOrCreate(
      byStop,
      record.stop_key,
      () => new Map<string, StopRecord>(),
    );
    // `formatMonth`, not a second `padStart`: these keys must match the axis strings
    // `buildStopView` emitted, or every lookup below misses and the sparklines draw
    // blank.
    byMonth.set(formatMonth(record), record);
  }

  // Alignment is deferred: grouping is one cheap pass, but the cost is a `stopMetrics`
  // call per month per pair, and the table mounts a sparkline only when scrolled to.
  const aligned = new Map<number, Map<string, StopSeriesPoint[]>>();

  return {
    seriesFor(stopKey: string, lineId: number): StopSeriesPoint[] {
      const cache = getOrCreate(
        aligned,
        lineId,
        () => new Map<string, StopSeriesPoint[]>(),
      );

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
