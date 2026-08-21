import { stopMetrics } from '../stops';
import { formatMonth } from './month';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopRecord } from '../@types/stops.types';

/**
 * Every stop's boardings and alightings across a stop view's month axis, built once per
 * panel because a scan per row would be ~800 × ~106,000.
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
  /** The stop view's month axis, taken as given so the window rule stays stated once (ADR-0009). */
  months: readonly string[];
  dayOfWeek: DayOfWeek;
}

export interface StopSeriesIndex {
  /**
   * One pair's series, always the axis's full length and cached, so Chart.js doesn't
   * rebuild a dataset it already has.
   */
  seriesFor(stopKey: string, lineId: number): StopSeriesPoint[];
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  map.set(key, made);
  return made;
}

/**
 * Groups every record once and aligns a pair's months only when asked, with `null` — never
 * `0` — for a month the stop did not report.
 */
export function buildStopSeriesIndex({
  records,
  months,
  dayOfWeek,
}: BuildStopSeriesIndexInput): StopSeriesIndex {
  // Nested rather than a composite key, because stop keys already contain a delimiter.
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
    // `formatMonth`, so these keys match the axis strings `buildStopView` emitted.
    byMonth.set(formatMonth(record), record);
  }

  // Alignment is deferred, because the table mounts a sparkline only when scrolled to.
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
