import ridershipRecords from '../data/ridership.json';
import type { RidershipRecord } from '../@types/metrics.types';

/**
 * Date bounds derived from ridership.json so the selectable year range and the
 * default end date track the data automatically — no manual bumping when new
 * months land. Computed once at module load in a single pass over the records.
 */
const records = ridershipRecords as RidershipRecord[];

let minYear = Infinity;
let maxYear = -Infinity;
let maxMonth = 1; // 1-based, month of the latest record

for (const record of records) {
  if (record.year < minYear) minYear = record.year;
  if (
    record.year > maxYear ||
    (record.year === maxYear && record.month > maxMonth)
  ) {
    maxYear = record.year;
    maxMonth = record.month;
  }
}

export const dataMinYear: number = minYear;
export const dataMaxYear: number = maxYear;

/**
 * Default end of the date window.
 *
 * App.tsx filters with `new Date(record.year, record.month)` — month is 1-based
 * in the data but Date treats it as 0-based, and the end comparison is exclusive
 * (`endDate <= metricDate` skips the record). To include the latest record we
 * therefore set the default one month past it. This preserves the intentional
 * off-by-one (see CLAUDE.md); do not "fix" the filter.
 */
export const dataDefaultEndDate: Date = new Date(maxYear, maxMonth + 1);
