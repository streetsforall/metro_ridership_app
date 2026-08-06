import type { RidershipRecord, DayOfWeek } from '../@types/metrics.types';

/**
 * Calculates average daily ridership over a series of metrics for a presumed line
 * @param metrics Array of Metric objects from source JSON
 * @param dayOfWeek Day of week enum in question
 * @returns Calculated average daily ridership
 */
function calcAvg(metrics: RidershipRecord[], dayOfWeek: DayOfWeek): number {
  const count = metrics.length;
  const sum = metrics.reduce((prev, curr) => {
    return prev + (curr[dayOfWeek] ?? 0);
  }, 0);

  return sum / count;
}

/**
 * Chronological copy of a line's records.
 *
 * Copies before sorting: the array handed in is the live `ridershipRecords` array
 * inside `ridershipByLine`, which also feeds the row sparklines and the CSV export —
 * sorting it in place reorders data other callers are reading.
 *
 * These metrics describe the span the line itself covers, which is not necessarily the
 * selected window: a line whose data starts mid-window reports its own first and last
 * record, not the window's endpoints. See `buildCoverageByLine` in `src/ridership/`,
 * which labels that difference in the UI.
 */
function sortChronologically(metrics: RidershipRecord[]): RidershipRecord[] {
  return [...metrics].sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month;
    } else {
      return a.year - b.year;
    }
  });
}

/**
 * Calculates absolute change in daily ridership over a series of metrics for a presumed line
 * @param metrics Array of Metric objects from source JSON
 * @param dayOfWeek Day of week enum in question
 * @returns Calculated difference in daily ridership, or 0 for an empty series
 */
function calcAbsChange(metrics: RidershipRecord[], dayOfWeek: DayOfWeek): number {
  const sorted = sortChronologically(metrics);
  if (sorted.length === 0) return 0;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return (last[dayOfWeek] ?? 0) - (first[dayOfWeek] ?? 0);
}

function calcEnd(metrics: RidershipRecord[], dayOfWeek: DayOfWeek): number {
  const sorted = sortChronologically(metrics);
  if (sorted.length === 0) return 0;

  const last = sorted[sorted.length - 1];

  return last[dayOfWeek] ?? 0;
}

function calcStart(metrics: RidershipRecord[], dayOfWeek: DayOfWeek): number {
  const sorted = sortChronologically(metrics);
  if (sorted.length === 0) return 0;

  const first = sorted[0];
  return first[dayOfWeek] ?? 0;
}

function calcRidersPerMile(avgRidership: number, distanceMiles: number): number {
  return avgRidership / distanceMiles;
}

export { calcAbsChange, calcAvg, calcEnd, calcStart, calcRidersPerMile };
