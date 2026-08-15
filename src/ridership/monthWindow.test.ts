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
   * `src/utils/month.ts`'s `containsOffset` states this rule a second time, in ordinal
   * form, and is the landing site for the month migration ADR-0007 tracks as #144 /
   * #145 / #146. ADR-0001 is explicit that "a `Month` module that unifies the app's
   * several month encodings **may** replace the arithmetic; it **may not** change these
   * boundaries" — and that the tests, not the algebra, are what makes that safe.
   *
   * Two functions each asserted against their own hand-written cases does not establish
   * that. This does: every month from 2018 through 2027 against every window with
   * endpoints in the same span, both functions, exhaustively. If the migration ever
   * moves a boundary, this fails before anything reaches a chart baseline.
   */
  it('agrees with `containsOffset` over a decade of windows, exhaustively', () => {
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
          const byDate = isInMonthWindow(m, bounds[s], bounds[e]);
          const byOrdinal = containsOffset({ start, end }, m);
          if (byDate !== byOrdinal)
            throw new Error(
              `disagree at start=${start.year}-${start.month} end=${end.year}-${end.month} record=${m.year}-${m.month}: Date says ${String(byDate)}, ordinal says ${String(byOrdinal)}`,
            );
          compared++;
        }

    expect(compared).toBe(months.length ** 3);
  });
});
