import type { DayOfWeek, RidershipRecord } from '../@types/metrics.types';

/**
 * Chronological copy of a line's records.
 *
 * Copies before sorting: the array handed in is the live `ridershipRecords` array
 * inside Consolidated Ridership, which also feeds the row sparklines and the CSV
 * export — sorting it in place reorders data other callers are reading. See PR #93,
 * which is where that bug was fixed.
 */
function sortChronologically(
  records: readonly RidershipRecord[],
): RidershipRecord[] {
  return [...records].sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month;
    } else {
      return a.year - b.year;
    }
  });
}

export interface LineMetricsInput {
  /** One Line's Ridership Records, in any order. Never mutated. */
  records: readonly RidershipRecord[];
  /** Which of the three reported figures to read. */
  dayOfWeek: DayOfWeek;
  /**
   * The line's one-way route length. Falsy — `0` or absent — yields no `ridersPerMile`,
   * which is the rule this module absorbs from its caller.
   */
  distanceMiles?: number;
}

export interface LineMetrics {
  averageRidership: number;
  changeInRidership: number;
  startingRidership: number;
  endingRidership: number;
  /**
   * `undefined` when `distanceMiles` is falsy. Declared `| undefined` rather than `?:`
   * deliberately: the key is *always written*, so spreading `LineMetrics` onto a `Line`
   * clears a previous window's figure instead of silently preserving it.
   */
  ridersPerMile: number | undefined;
}

/**
 * The Line Metrics one line's Ridership Records yield for one Day Of Week.
 *
 * Sorts once, on a copy, and reads both endpoints off the same array — the five
 * functions this replaced sorted three times for one line's figures.
 *
 * These figures describe the span the line itself covers, which is not necessarily the
 * Month Window: a line whose data starts mid-window reports its own first and last
 * record, not the window's endpoints. That is deliberate — see `buildCoverageByLine`
 * in `./chartData`, which labels the difference in the UI rather than redefining the
 * metric, and `docs/adr/0004-line-metrics-are-one-nullable-shape.md`.
 *
 * Returns `null` for an empty series. No records means no metrics, not zeroes.
 */
export function lineMetrics({
  records,
  dayOfWeek,
  distanceMiles,
}: LineMetricsInput): LineMetrics | null {
  if (records.length === 0) return null;

  const sorted = sortChronologically(records);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Divides by the record count, not by the count of non-null figures: a null month
  // counts as 0 ridership rather than being excluded. Lifted from `calcAvg`.
  const sum = sorted.reduce((prev, curr) => prev + (curr[dayOfWeek] ?? 0), 0);
  const averageRidership = sum / sorted.length;

  const startingRidership = first[dayOfWeek] ?? 0;
  const endingRidership = last[dayOfWeek] ?? 0;

  return {
    averageRidership,
    changeInRidership: endingRidership - startingRidership,
    startingRidership,
    endingRidership,
    // The missing-distance rule, absorbed from the caller. A falsy distance means no
    // figure — never Infinity, never NaN.
    ridersPerMile: distanceMiles ? averageRidership / distanceMiles : undefined,
  };
}
