/**
 * A month, and the two rules for whether one falls inside a Month Window.
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
 * This is the **Event Window** rule (`CONTEXT.md`). It deliberately disagrees with
 * `containsOffset` below, which applies to the same window. Reconciling them would
 * change which events appear for a given URL — see ADR-0001.
 *
 * The one statement of the rule. Production reaches it through
 * `src/ridership/eventWindow.ts`, which adapts the `Date` bounds and the `"YYYY-MM"`
 * event date the context log actually carries. Do not restate it at a call site.
 */
export function contains(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end);
}

/**
 * Is `m` inside the window under the **Month Window** rule — `S <= R <= E - 2`?
 *
 * The start month is included; the end month **and the month immediately before it**
 * are excluded. This reads like a bug and is not: it is the behaviour the app has
 * always had, users have shared URLs against it, and `e2e/chart-content.spec.ts`
 * renders windows through it into committed PNG baselines. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * Derived from the `Date` comparison it replaces. With bounds built as
 * `new Date(y, m - 1)` and records as `new Date(r.year, r.month)`, the strict
 * comparison `start < record < end` is `S < R + 1 < E`, i.e. `S <= R <= E - 2`. The
 * boundary tests in `month.test.ts`, not this derivation, are what make that safe;
 * ADR-0006 carries the working.
 *
 * The one statement of the rule. Production reaches it through
 * `src/ridership/monthWindow.ts`, which adapts the `Date` bounds; both the chart's
 * Ridership View and the stop panel's Stop View filter through that adapter.
 * `monthWindow.test.ts` runs the two forms against each other over every window pair
 * in a decade, which is what let the `Date` arithmetic be retired. Do not restate this
 * at a call site.
 */
export function containsOffset(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end) - 2;
}
