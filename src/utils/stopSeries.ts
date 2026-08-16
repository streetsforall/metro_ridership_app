import { stopMetrics } from '../stops';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopRecord } from '../@types/stops.types';

/**
 * One stop's Boardings and Alightings across a Stop View's month axis.
 *
 * `src/stops/index.ts` exposes readouts and markers but no per-stop series, so the
 * panel assembles one. That is a gap worth closing in the module rather than a licence
 * to re-derive anything here: the months come from the derivation's own axis, and each
 * month's figures come from `stopMetrics`, so this function neither states the window
 * rule nor keeps a second copy of the Day Of Week → column mapping.
 */

export interface StopSeriesPoint {
  /** `YYYY-MM`. */
  month: string;
  /** `null` for a month this stop did not report — a gap, never a zero. */
  boardings: number | null;
  alightings: number | null;
}

export interface BuildStopSeriesInput {
  /** Every Stop Ridership Record loaded, unfiltered. */
  records: readonly StopRecord[];
  /**
   * The Stop View's month axis — the months **the derivation** put in the window.
   *
   * Taking the axis from the view is what keeps the window rule to one statement: this
   * function compares month keys against a list `buildStopView` produced and never
   * asks whether a month is in the window (ADR-0009).
   */
  months: readonly string[];
  stopKey: string;
  lineId: number;
  dayOfWeek: DayOfWeek;
}

const monthKey = (record: { year: number; month: number }): string =>
  `${record.year}-${String(record.month).padStart(2, '0')}`;

/**
 * The series for one (stop, line), aligned to the Stop View's month axis.
 *
 * Each month's figures come from `stopMetrics` over that month's single record — an
 * average of one value is that value — so the boardings a point plots are the same
 * figures the table ranks by and the marker is sized from. Reading the record's fields
 * directly would mean a second copy of the Day Of Week → column mapping, which is
 * private to `src/stops/` for exactly that reason.
 *
 * A month with no record contributes `null` rather than `0`, and the chart is left
 * without `spanGaps`, so the line breaks there.
 */
export function buildStopSeries({
  records,
  months,
  stopKey,
  lineId,
  dayOfWeek,
}: BuildStopSeriesInput): StopSeriesPoint[] {
  const byMonth = new Map<string, StopRecord>();
  for (const record of records)
    if (record.stop_key === stopKey && record.line_name === lineId)
      byMonth.set(monthKey(record), record);

  return months.map((month) => {
    const record = byMonth.get(month);
    const metrics = record ? stopMetrics({ records: [record], dayOfWeek }) : null;
    return {
      month,
      boardings: metrics ? metrics.averageBoardings : null,
      alightings: metrics ? metrics.averageAlightings : null,
    };
  });
}
