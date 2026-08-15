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
 * The Month Window excludes the end month **and the month before it** — the rule is
 * `isInMonthWindow` in `src/ridership/monthWindow.ts`, and it is deliberate. To include
 * the latest record in the default view we therefore set the default end one month past
 * it. See `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`; do not
 * "fix" the filter.
 *
 * This bound must stay **month-aligned** — `new Date(y, m)`, midnight on the first —
 * like every other producer of a window bound. `isInMonthWindow` reads only the year
 * and month off it.
 */
export const dataDefaultEndDate: Date = new Date(maxYear, maxMonth + 1);
