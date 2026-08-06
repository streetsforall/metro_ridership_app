import type { CustomChartData } from '../@types/chart.types';
import type { DayOfWeek, RidershipRecord } from '../@types/metrics.types';

/**
 * Chart.js category label for a record's month. Matches the `${year} ${month}`
 * format the chart has always used.
 */
const timeKey = (year: number, month: number): string => `${year} ${month}`;

/**
 * Chronologically sorted union of the months covered by every series.
 *
 * Chart.js's CategoryScale appends any label it can't find in `labels` to the end
 * of the array, so every dataset must be drawn against one shared, complete axis —
 * deriving it from a single dataset scrambles the ordering as soon as two selected
 * lines cover different months.
 *
 * Sorts on the numeric ordinal rather than the label: "2025 10" precedes "2025 7"
 * as a string.
 */
export function buildMonthAxis(series: RidershipRecord[][]): string[] {
  const byOrdinal = new Map<number, string>();

  for (const records of series)
    for (const record of records)
      byOrdinal.set(
        record.year * 12 + record.month,
        timeKey(record.year, record.month),
      );

  return [...byOrdinal.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, label]) => label);
}

/**
 * Re-index one line's records onto `months`. Months the line has no record for get
 * `null` so Chart.js draws a gap instead of connecting a stroke across the missing
 * span.
 */
export function alignToMonthAxis(
  records: RidershipRecord[],
  months: string[],
  dayOfWeek: DayOfWeek,
): CustomChartData[] {
  const byMonth = new Map(
    records.map((r) => [timeKey(r.year, r.month), r[dayOfWeek]]),
  );

  // `?? null` rather than `|| null` so a legitimate 0 survives.
  return months.map((time) => ({ time, stat: byMonth.get(time) ?? null }));
}

/**
 * Total across the selected lines at each month.
 *
 * A line with no record for a month contributes nothing rather than zero — an
 * absent line must not read as ridership collapsing. A month no selected line
 * reports stays `null`, i.e. a gap.
 */
export function buildAggregateSeries(
  alignedData: CustomChartData[][],
  months: string[],
): CustomChartData[] {
  return months.map((time, i) => {
    let stat: number | null = null;

    for (const data of alignedData) {
      const value = data[i]?.stat;
      if (value == null) continue;
      stat = (stat ?? 0) + value;
    }

    return { time, stat };
  });
}
