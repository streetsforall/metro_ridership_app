import { containsOffset, monthOf, type Month } from '../utils/month';

/**
 * The Month Window predicate — the one copy.
 *
 * ## The Month Window is deliberately offset
 *
 * A record at calendar-month ordinal `R` is included when `S <= R <= E - 2`: the
 * start month is included, and **the end month and the month immediately before it
 * are excluded**. This is intended, not an off-by-one bug — the app has always
 * behaved this way and `e2e/chart-content.spec.ts` renders windows through it into
 * committed PNG baselines. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * **Callers must not restate this.** It has two derivations — the chart's Ridership
 * View and the stop panel's Stop View — and if either restated it the two panels
 * would disagree about which months are on screen for the same URL.
 *
 * ## Why this is now ordinal arithmetic and not the original `Date` comparison
 *
 * The rule used to be written here as the `Date` comparison it was extracted from,
 * verbatim, on the argument that copy-paste is provably non-drifting where algebra is
 * only provably equivalent if the algebra is right. That held while there was nowhere
 * else for the rule to live. It stopped holding once `src/utils/month.ts` grew
 * `containsOffset` — a *second* statement of the same rule, over `Month` ordinals.
 * Two statements is the fork ADR-0001 exists to prevent, whichever one production
 * happens to call.
 *
 * So this delegates. `containsOffset` is the one statement of the rule; this function
 * is the `Date`-shaped adapter in front of it, and it is what ADR-0006 meant by
 * licensing a replacement of the arithmetic that does not move the boundaries. What
 * makes the replacement safe is not the derivation but
 * `monthWindow.test.ts`'s exhaustive case, which runs both forms over every window
 * pair in a decade and requires they agree record for record.
 *
 * **This adapter assumes the bounds are month-aligned** — `new Date(y, m - 1)`,
 * midnight on the first. Every producer is: `parseMonthParam`, `DefaultStartDate`,
 * `dataDefaultEndDate`, the chart drag's `labelToDate`, and `DateRangeSelector`,
 * which mutates an already-aligned date with `setMonth`/`setFullYear` only. A bound
 * carrying a day or a time would compare differently here than under the old
 * timestamp comparison, so a new producer must keep to that shape. ADR-0006 is the
 * standing argument for why bounds should not be `Date`s at all.
 */
export function isInMonthWindow(
  record: { year: number; month: number },
  startDate: Date,
  endDate: Date,
): boolean {
  return containsOffset(
    { start: boundToMonth(startDate), end: boundToMonth(endDate) },
    record,
  );
}

/** A month-aligned window bound as the month it names. `Date`'s month is 0-based. */
const boundToMonth = (bound: Date): Month =>
  monthOf(bound.getFullYear(), bound.getMonth() + 1);
