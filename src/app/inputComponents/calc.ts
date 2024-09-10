import { Metric } from '../charts/page';
import { DayOfWeek } from '../hooks/useUserDashboardInput';

/**
 * Calculates average daily ridership over a series of metrics for a presumed line
 * @param metrics Array of Metric objects from source JSON
 * @param dayOfWeek Day of week enum in question
 * @returns Calculated average daily ridership
 */
function calcAvg(metrics: Metric[], dayOfWeek: DayOfWeek): number {
  const count = metrics.length;
  const sum = metrics.reduce((prev, curr) => {
    return prev + (curr[dayOfWeek] ?? 0);
  }, 0);

  return sum / count;
}

/**
 * Calculates absolute change in daily ridership over a series of metrics for a presumed line
 * @param metrics Array of Metric objects from source JSON
 * @param dayOfWeek Day of week enum in question
 * @returns Calculated difference in daily ridership
 */
function calcAbsChange(metrics: Metric[], dayOfWeek: DayOfWeek): number {
  const sorted = metrics.sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month;
    } else {
      return a.year - b.year;
    }
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return (last[dayOfWeek] ?? 0) - (first[dayOfWeek] ?? 0);
}

export { calcAbsChange, calcAvg };
