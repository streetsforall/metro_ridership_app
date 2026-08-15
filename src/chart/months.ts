/**
 * Two month spellings meet at the chart and disagree about zero-padding.
 *
 * The x-axis labels are `"YYYY M"` — a space, and the month is *not* padded
 * (`"2023 2"`), because they are built from `Date#getMonth() + 1`. Transit event
 * dates are `"YYYY-MM"` — a hyphen, and the month *is* padded (`"2023-02"`),
 * because they are hand-authored in `transit-events.json` against a schema.
 *
 * Every conversion between the two lives here. It used to be inlined at each
 * call site, which is how the Event Gutter plugin ended up re-deriving a label
 * with a `slice`/`parseInt` pair a few lines away from a formatter doing the
 * same job.
 *
 * The pixel → month lookup lives here for the same reason: the gutter resolves
 * a click below the axis to a month and the drag resolves a press to a month,
 * and if the two disagreed a triangle and a drag would disagree about where a
 * month starts.
 */
import type { Chart as ChartJS } from 'chart.js';

/** `"2023-02"` → `"2023 2"`, the x-axis label for that month. */
export function eventDateToLabel(date: string): string {
  return `${date.slice(0, 4)} ${parseInt(date.slice(5), 10)}`;
}

/** `"2023 2"` → `"2023-02"`. Inverse of {@link eventDateToLabel}. */
export function labelToEventDate(label: string): string {
  const [year, month] = label.split(' ');
  return `${year}-${month.padStart(2, '0')}`;
}

/**
 * `"2023 2"` → a Date at midnight on the first of that month, or null if the
 * label is not a month label. Local time, matching `DefaultStartDate` and the
 * rest of the date handling in `useUserDashboardInput`.
 */
export function labelToDate(label: string): Date | null {
  const [year, month] = label.split(' ').map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1);
}

/** `"2026 5"` → `"May 2026"`, for tooltip and axis headings. */
export function formatMonthLabel(label: string): string {
  const date = labelToDate(label);
  if (!date) return label;
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** `"2026-05"` → `"May 2026"`, for the context log's date column. */
export function formatEventDate(date: string): string {
  return formatMonthLabel(eventDateToLabel(date));
}

/** Pixel → month index, clamped to the axis so a drag off the edge still lands. */
export function monthIndexAtPixel(chart: ChartJS, pixel: number): number {
  const { left, right } = chart.chartArea;
  const clamped = Math.min(Math.max(pixel, left), right);
  const lastIndex = ((chart.data.labels ?? []).length || 1) - 1;
  const value = chart.scales.x.getValueForPixel(clamped) ?? 0;
  return Math.min(Math.max(Math.round(value), 0), lastIndex);
}
