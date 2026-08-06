import type { CustomChartData } from '../@types/chart.types';
import type {
  ConsolidatedRidership,
  DayOfWeek,
  RidershipRecord,
} from '../@types/metrics.types';

/**
 * Chart.js category label for a record's month. Matches the `${year} ${month}`
 * format the chart has always used.
 */
export const timeKey = (year: number, month: number): string =>
  `${year} ${month}`;

/**
 * A `timeKey` rendered for display: `'2025 9'` → `'2025-09'`, the same shape as the
 * `start`/`end` URL params and the month pickers.
 */
export const formatMonthKey = (key: string): string => {
  const [year, month] = key.split(' ');
  return `${year}-${month.padStart(2, '0')}`;
};

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
 * The months that actually exist in the current window: the union across every line
 * in `ridershipByLine`.
 *
 * Deliberately derived from the records rather than from the selected
 * `startDate`/`endDate`. The Month Window `buildRidershipView` applies is offset on
 * purpose (see `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`), so a
 * span recomputed from those `Date`s would disagree by a month with the records
 * already grouped into `ConsolidatedRidership` — and the coverage labels would then
 * contradict the rows they sit on.
 *
 * Wider than `RidershipView.months`, deliberately: that axis spans the **selected**
 * lines, for the chart. This one spans every line in the window, because the table
 * draws a row — and a coverage label — for lines the chart never plots.
 */
export function buildWindowMonthAxis(
  ridershipByLine: ConsolidatedRidership,
): string[] {
  return buildMonthAxis(
    Object.values(ridershipByLine).map((record) => record.ridershipRecords),
  );
}

export interface LineCoverage {
  /** First month this line reports inside the window, as `YYYY-MM`. */
  coveredFrom: string;
  /** Last month this line reports inside the window, as `YYYY-MM`. */
  coveredTo: string;
  /** True when this line's covered span is narrower than the window's own span. */
  isPartialCoverage: boolean;
}

/**
 * How much of the current window each line actually covers.
 *
 * A line counts as partial when its own first month starts after the window's span
 * does, or its last month ends before it — the D Line, whose data only begins
 * 2025-09, against rail lines reaching back to 2009.
 *
 * This *labels* the summary metrics; it does not change them. `calcAvg`,
 * `calcAbsChange`, `calcStart` and `calcEnd` still estimate from each line's own first
 * and last record. The point is that the UI stops implying they all mean the same
 * period.
 */
export function buildCoverageByLine(
  ridershipByLine: ConsolidatedRidership,
): Record<string, LineCoverage> {
  const windowMonths = buildWindowMonthAxis(ridershipByLine);
  const coverage: Record<string, LineCoverage> = {};

  for (const [lineId, record] of Object.entries(ridershipByLine)) {
    // Reusing buildMonthAxis for a single line dedupes and sorts it the same way the
    // window span was built, so the two are directly comparable.
    const months = buildMonthAxis([record.ridershipRecords]);
    if (months.length === 0) continue;

    const first = months[0];
    const last = months[months.length - 1];

    coverage[lineId] = {
      coveredFrom: formatMonthKey(first),
      coveredTo: formatMonthKey(last),
      isPartialCoverage:
        first !== windowMonths[0] ||
        last !== windowMonths[windowMonths.length - 1],
    };
  }

  return coverage;
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
