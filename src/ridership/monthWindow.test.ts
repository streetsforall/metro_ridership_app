import { describe, it, expect } from 'vitest';
import { isInMonthWindow } from './monthWindow';
import { containsOffset } from '../utils/month';

/**
 * Boundary tests for the Month Window rule, pinned at month granularity.
 *
 * ADR-0001: "Boundary tests pin the rule at month granularity — a record exactly at
 * the start month is in, one month earlier is out, `E − 2` is in, `E − 1` and `E` are
 * out. Those tests, not the arithmetic, are what makes a future rewrite safe."
 *
 * Bounds are constructed the way the app constructs them — `new Date(year, month - 1)`
 * — and records the way the data stores them, 1-based. `src/utils/month.test.ts` states
 * the same *rule* against `containsOffset`, over its own cases; the final block here
 * compares the two functions directly, which is the thing that has to hold.
 */
const bound = (year: number, month: number) => new Date(year, month - 1);

// The window the chart's date pickers produce for "Jan 2020 – Dec 2020".
const start = bound(2020, 1);
const end = bound(2020, 12);

const record = (year: number, month: number) => ({ year, month });

describe('isInMonthWindow — the Month Window rule, S <= R <= E - 2', () => {
  it('includes the start month', () => {
    expect(isInMonthWindow(record(2020, 1), start, end)).toBe(true);
  });

  it('excludes the month before the start month', () => {
    expect(isInMonthWindow(record(2019, 12), start, end)).toBe(false);
  });

  it('includes E - 2', () => {
    expect(isInMonthWindow(record(2020, 10), start, end)).toBe(true);
  });

  it('excludes E - 1 — the month immediately before the end month', () => {
    expect(isInMonthWindow(record(2020, 11), start, end)).toBe(false);
  });

  it('excludes the end month itself', () => {
    expect(isInMonthWindow(record(2020, 12), start, end)).toBe(false);
  });

  describe('across a year boundary', () => {
    const crossStart = bound(2019, 11);
    const crossEnd = bound(2020, 3);

    it('includes the start month and E - 2', () => {
      expect(isInMonthWindow(record(2019, 11), crossStart, crossEnd)).toBe(
        true,
      );
      expect(isInMonthWindow(record(2019, 12), crossStart, crossEnd)).toBe(
        true,
      );
      expect(isInMonthWindow(record(2020, 1), crossStart, crossEnd)).toBe(true);
    });

    it('excludes E - 1 and E', () => {
      expect(isInMonthWindow(record(2020, 2), crossStart, crossEnd)).toBe(
        false,
      );
      expect(isInMonthWindow(record(2020, 3), crossStart, crossEnd)).toBe(
        false,
      );
    });
  });

  it('handles month 12, which rolls the constructed Date into the next year', () => {
    // `new Date(2020, 12)` is January 2021 — the 1-based/0-based mismatch the rule is
    // built on. A December record therefore compares as if it were the January after.
    const decWindowStart = bound(2020, 12);
    const decWindowEnd = bound(2021, 11);
    expect(
      isInMonthWindow(record(2020, 12), decWindowStart, decWindowEnd),
    ).toBe(true);
    expect(
      isInMonthWindow(record(2020, 11), decWindowStart, decWindowEnd),
    ).toBe(false);
  });

  it('excludes everything when the window is degenerate (start === end)', () => {
    const point = bound(2020, 6);
    expect(isInMonthWindow(record(2020, 5), point, point)).toBe(false);
    expect(isInMonthWindow(record(2020, 6), point, point)).toBe(false);
    expect(isInMonthWindow(record(2020, 7), point, point)).toBe(false);
  });

  /**
   * The `Date` comparison `isInMonthWindow` used to be, kept here **verbatim** as the
   * historical reference. Nothing in `src/` calls it and nothing should — it exists so
   * the rule that shipped for years stays executable and can be asserted against.
   *
   * `new Date(year, month)` treats `month` as 0-based while the data stores it 1-based,
   * and the bounds are built as `new Date(year, month - 1)`; the strict comparison on
   * both ends is what produces the offset.
   */
  const legacyIsInMonthWindow = (
    record: { year: number; month: number },
    startDate: Date,
    endDate: Date,
  ): boolean => {
    const metricDate = new Date(record.year, record.month);
    if (
      startDate.getTime() >= metricDate.getTime() ||
      endDate.getTime() <= metricDate.getTime()
    )
      return false;
    return true;
  };

  /**
   * ADR-0001 is explicit that "a `Month` module that unifies the app's several month
   * encodings **may** replace the arithmetic; it **may not** change these boundaries" —
   * and that the tests, not the algebra, are what makes that safe. This is that test,
   * and it is what licensed `isInMonthWindow` to stop being the `Date` comparison and
   * start delegating to `containsOffset`.
   *
   * Hand-written cases on each side do not establish equivalence. This does: every
   * month from 2018 through 2027 against every window with endpoints in the same span,
   * exhaustively, three ways — the live function, the ordinal rule it delegates to, and
   * the `Date` arithmetic it replaced.
   *
   * The third comparand is the point. Now that `isInMonthWindow` calls `containsOffset`,
   * checking those two against each other alone would be a tautology that passes no
   * matter what either does. `legacyIsInMonthWindow` is the only comparand here that
   * cannot move, so it is the one holding the boundaries still.
   */
  it('agrees with `containsOffset` and the retired `Date` arithmetic over a decade of windows, exhaustively', () => {
    const months = [];
    for (let year = 2018; year <= 2027; year++)
      for (let month = 1; month <= 12; month++) months.push({ year, month });
    // Hoisted: the bounds are the same 120 `Date`s every time round, and building them
    // in the inner loop costs 3.4M allocations for no extra coverage.
    const bounds = months.map((m) => bound(m.year, m.month));

    let compared = 0;
    for (const [s, start] of months.entries())
      for (const [e, end] of months.entries())
        for (const m of months) {
          const live = isInMonthWindow(m, bounds[s], bounds[e]);
          const byOrdinal = containsOffset({ start, end }, m);
          const byDate = legacyIsInMonthWindow(m, bounds[s], bounds[e]);
          if (live !== byOrdinal || live !== byDate)
            throw new Error(
              `disagree at start=${start.year}-${start.month} end=${end.year}-${end.month} record=${m.year}-${m.month}: live says ${String(live)}, ordinal says ${String(byOrdinal)}, retired Date arithmetic says ${String(byDate)}`,
            );
          compared++;
        }

    expect(compared).toBe(months.length ** 3);
  });
});
