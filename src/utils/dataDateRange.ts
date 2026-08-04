import { minYear, maxYear, maxMonth } from 'virtual:ridership-bounds';

/**
 * Date bounds derived from ridership.json so the selectable year range and the
 * default end date track the data automatically — no manual bumping when new
 * months land. The values are computed at build time by the `ridership-data`
 * Vite plugin (see vite/ridership-data-plugin.ts) and exposed via the
 * `virtual:ridership-bounds` module, so the full 6.6 MB dataset never has to be
 * imported into the client bundle just to read its min/max dates.
 */
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
