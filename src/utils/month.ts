/**
 * A month, and the rule for whether one falls inside a Month Window.
 *
 * A month is a year and a 1-based month number — not a `Date`. A `Date` is a
 * timestamp: it carries a day, an hour and a timezone that a month does not have, its
 * month is 0-based where every other month in this system is 1-based, and its two
 * constructors disagree about which month it is (`new Date("2025-09")` is UTC midnight,
 * which is August in Los Angeles). See
 * `docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md`.
 */

export interface Month {
  year: number;
  /** 1-based: January is 1, matching the data, the URL and `transit-events.json`. */
  month: number;
}

export interface MonthWindow {
  start: Month;
  end: Month;
}

/**
 * Months since year 0. The single arithmetic form; every comparison goes through it.
 */
export const ordinal = (m: Month): number => m.year * 12 + (m.month - 1);

/**
 * Build a Month, normalising out-of-range month numbers rather than rejecting them:
 * `monthOf(2025, 13)` is January 2026. Total — it never throws, so there is no crash
 * path to guard.
 *
 * It does not make an invalid Month unrepresentable. `{year: 2025, month: 13}` is a
 * legal literal, because `Month` is structural on purpose (a `RidershipRecord` is one).
 * That is an accepted limitation: such a value sorts and compares as January 2026
 * rather than corrupting anything. Untrusted input goes through `parseMonth`, which
 * rejects instead.
 */
export function monthOf(year: number, month: number): Month {
  const o = year * 12 + (month - 1);
  return { year: Math.floor(o / 12), month: (((o % 12) + 12) % 12) + 1 };
}

export const monthsEqual = (a: Month, b: Month): boolean =>
  a.year === b.year && a.month === b.month;

/** Sort comparator. Chronological. */
export const compareMonths = (a: Month, b: Month): number => ordinal(a) - ordinal(b);

/**
 * Parse the canonical text form, `"YYYY-MM"` — the format of the `start`/`end` URL
 * params, of `transit-events.json` dates, and of the coverage labels. `null` for
 * anything malformed; this is the untrusted edge.
 */
export function parseMonth(text: string): Month | null {
  const [yearStr, monthStr] = text.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/** The inverse of `parseMonth`: `"2025-09"`, zero-padded. */
export const formatMonth = (m: Month): string =>
  `${m.year}-${String(m.month).padStart(2, '0')}`;

/**
 * For humans: `"Sep 2025"`.
 *
 * The **one** place in the app that constructs a `Date`, because `toLocaleString` needs
 * one. It is local and immediately discarded, so none of `Date`'s hazards escape this
 * function. Do not add a second.
 */
export const displayMonth = (m: Month): string =>
  new Date(m.year, m.month - 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });

/**
 * Is `m` inside the window, **inclusive of both ends**?
 *
 * The one statement of the app's one window rule, and the whole of it. Ask for
 * Jan 2022 – Dec 2022 and you get January through December — in the chart, in the stop
 * panel and in the context log alike.
 *
 * There used to be a second rule beside this one, `containsOffset` — `S <= R <= E - 2`
 * — which the chart and the stop panel filtered through while only the context log used
 * this one, so for a single date range the log ran two months past the chart's
 * right-hand edge. That rule is gone; see
 * `docs/adr/0009-the-two-window-rules-are-one-rule.md`.
 *
 * Production reaches this through two `Date`-shaped adapters that differ only in what
 * they are handed: `src/ridership/monthWindow.ts` takes a record's `{year, month}`,
 * `src/ridership/eventWindow.ts` takes an event's `"YYYY-MM"`. Do not restate the rule
 * at a call site.
 */
export function contains(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end);
}
