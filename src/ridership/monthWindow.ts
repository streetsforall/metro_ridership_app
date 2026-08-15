import { contains, monthOf, type Month } from '../utils/month';

/**
 * The Month Window predicate — the `Date`-shaped adapter in front of `contains`.
 *
 * A record at calendar-month ordinal `R` is included when `S <= R <= E`. Both ends are
 * in: ask for Jan 2022 – Dec 2022 and you get Jan through December.
 *
 * ## This used to exclude the last two months
 *
 * Until ADR-0009 the rule here was `S <= R <= E - 2` — the end month and the month
 * before it were dropped, so the chart hid the two most recent months of whatever
 * range you asked for, including the newest data in the app. That was an accident of
 * `Date`'s 0-based months that ADR-0001 chose to keep rather than risk changing. It is
 * now gone, deliberately, with the chart baselines regenerated against it. See
 * `docs/adr/0009-the-two-window-rules-are-one-rule.md`.
 *
 * The Event Window used to disagree with this one by exactly those two months. It no
 * longer does — `eventWindow.ts` calls the same `contains`, and the two differ only in
 * the shape of what they are handed.
 *
 * **Callers must not restate this.** It has two derivations — the chart's Ridership
 * View and the stop panel's Stop View — and if either restated it the two panels
 * would disagree about which months are on screen for the same URL.
 *
 * **This adapter assumes the bounds are month-aligned** — `new Date(y, m - 1)`,
 * midnight on the first. Every producer is: `parseMonthParam`, `DefaultStartDate`,
 * `dataDefaultEndDate`, the chart drag's `labelToDate`, and `DateRangeSelector`,
 * which mutates an already-aligned date with `setMonth`/`setFullYear` only. A bound
 * carrying a day or a time is truncated to its month here. ADR-0006 is the standing
 * argument for why bounds should not be `Date`s at all.
 */
export function isInMonthWindow(
  record: { year: number; month: number },
  startDate: Date,
  endDate: Date,
): boolean {
  return contains(
    { start: boundToMonth(startDate), end: boundToMonth(endDate) },
    record,
  );
}

/** A month-aligned window bound as the month it names. `Date`'s month is 0-based. */
const boundToMonth = (bound: Date): Month =>
  monthOf(bound.getFullYear(), bound.getMonth() + 1);
