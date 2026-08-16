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
 * Default end of the date window: the last month the data covers.
 *
 * It used to be `maxMonth + 1`, one month past the data, and that was not a fudge — the
 * Month Window excluded its own end month and the month before it, so a default end
 * *at* the last record would have hidden it. ADR-0009 removed that offset, so the
 * compensation had to go with it or the default view would have opened on two empty
 * trailing months.
 *
 * `maxMonth` is 1-based and `Date`'s month argument is 0-based, so `maxMonth - 1` is the
 * last month of data. The bound must stay **month-aligned** — midnight on the first —
 * like every other producer of a window bound; `isInMonthWindow` reads only the year and
 * month off it.
 */
export const dataDefaultEndDate: Date = new Date(maxYear, maxMonth - 1);

