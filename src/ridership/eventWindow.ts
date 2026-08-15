import { contains, monthOf, parseMonth, type Month } from '../utils/month';

/**
 * The Event Window predicate — the one copy.
 *
 * ## The Event Window is inclusive, and disagrees with the Month Window on purpose
 *
 * An event dated at calendar-month ordinal `R` is included when `S <= R <= E`. Both
 * ends are in. The Month Window over the *same* two dates excludes `E` and `E - 1`
 * (see `./monthWindow`), so for any given URL the context log runs two months past
 * the right-hand edge of the chart. That is the behaviour the app has always had;
 * reconciling the two would change which events a shared URL shows, and
 * `e2e/context-logs.spec.ts` pins it into committed PNG baselines. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * **Callers must not restate this.** It was inline in `buildRidershipView` as a
 * `YYYYMM` integer comparison while `src/utils/month.ts` stated the same rule a second
 * time as `contains` — the same fork shape ADR-0001 exists to prevent, one rule over
 * from the one it was written about. This function is the `Date`-and-`"YYYY-MM"`
 * adapter in front of `contains`, and `contains` is the rule.
 *
 * Like `isInMonthWindow`, this **assumes month-aligned bounds** — `new Date(y, m - 1)`,
 * midnight on the first. Every producer in the app is; a bound carrying a day or a
 * time would be truncated to its month here.
 *
 * A malformed `date` is excluded. `transit-events.json` is schema-checked so this
 * should be unreachable, but the alternative — treating an unparseable month as
 * inside every window — would put a broken event in every context log.
 */
export function isInEventWindow(
  event: { date: string },
  startDate: Date,
  endDate: Date,
): boolean {
  const month = parseMonth(event.date);
  if (!month) return false;
  return contains(
    { start: boundToMonth(startDate), end: boundToMonth(endDate) },
    month,
  );
}

/** A month-aligned window bound as the month it names. `Date`'s month is 0-based. */
const boundToMonth = (bound: Date): Month =>
  monthOf(bound.getFullYear(), bound.getMonth() + 1);
