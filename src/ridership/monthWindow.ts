/**
 * The Month Window predicate — the one copy.
 *
 * ## The Month Window is deliberately offset
 *
 * A record at calendar-month ordinal `R` is included when `S <= R <= E - 2`: the
 * start month is included, and **the end month and the month immediately before it
 * are excluded**. This is intended, not an off-by-one bug — the app has always
 * behaved this way, users have shared URLs against it, and
 * `e2e/chart-content.spec.ts` renders windows through it into committed PNG
 * baselines. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * The `Date` arithmetic below is the original comparison **verbatim** rather than
 * restated as an ordinal comparison, precisely so it cannot drift. `new Date(year,
 * month)` treats `month` as 0-based while the data stores it 1-based, and the window
 * bounds are built as `new Date(year, month - 1)`; the strict comparison on both ends
 * is what produces the offset. ADR-0001 records why copy-paste beat algebra here:
 * copy-paste is provably non-drifting, algebra is only provably equivalent if the
 * algebra is right.
 *
 * **Callers must not restate this.** It has two derivations now — the chart's
 * Ridership View and the stop panel's Stop View — and if either restated it the two
 * panels would disagree about which months are on screen for the same URL.
 *
 * Note `src/utils/month.ts` states the same rule a second time as `containsOffset`,
 * over `Month`/`MonthWindow` ordinals. That is not a fork: it has no production
 * caller and is the landing site for the month migration ADR-0007 tracks as #144 /
 * #145 / #146, whose whole point is to replace this arithmetic without changing these
 * boundaries. Until that migration lands, production goes through this function.
 */
export function isInMonthWindow(
  record: { year: number; month: number },
  startDate: Date,
  endDate: Date,
): boolean {
  const metricDate = new Date(record.year, record.month);
  if (
    startDate.getTime() >= metricDate.getTime() ||
    endDate.getTime() <= metricDate.getTime()
  )
    return false;
  return true;
}
