import { describe, it, expect } from 'vitest';
import { isInMonthWindow } from '../monthWindow';
import { isInEventWindow } from '../eventWindow';
import { contains } from '../../utils/month';

/**
 * Boundary tests for the window rule, pinned at month granularity.
 *
 * Bounds are constructed the way the app constructs them — `new Date(year, month - 1)`
 * — and records the way the data stores them, 1-based.
 *
 * These boundaries **moved** in ADR-0009. Until then the rule here was
 * `S <= R <= E - 2`: the end month and the month before it were excluded, so the chart
 * hid the two most recent months of any range asked for. The block at the bottom is
 * what that decision cost — it pins the two months that changed hands, so nobody has to
 * diff PNGs to see what the change was.
 */
const bound = (year: number, month: number) => new Date(year, month - 1);

// The window the chart's date pickers produce for "Jan 2020 – Dec 2020".
const start = bound(2020, 1);
const end = bound(2020, 12);

const record = (year: number, month: number) => ({ year, month });

describe('isInMonthWindow — the window rule, S <= R <= E', () => {
  it('includes the start month', () => {
    expect(isInMonthWindow(record(2020, 1), start, end)).toBe(true);
  });

  it('excludes the month before the start month', () => {
    expect(isInMonthWindow(record(2019, 12), start, end)).toBe(false);
  });

  it('includes the end month — both ends are in', () => {
    expect(isInMonthWindow(record(2020, 12), start, end)).toBe(true);
  });

  it('excludes the month after the end month', () => {
    expect(isInMonthWindow(record(2021, 1), start, end)).toBe(false);
  });

  describe('across a year boundary', () => {
    const crossStart = bound(2019, 11);
    const crossEnd = bound(2020, 3);

    it('includes every month from the start to the end inclusive', () => {
      for (const [year, month] of [
        [2019, 11],
        [2019, 12],
        [2020, 1],
        [2020, 2],
        [2020, 3],
      ])
        expect(isInMonthWindow(record(year, month), crossStart, crossEnd)).toBe(
          true,
        );
    });

    it('excludes the months either side', () => {
      expect(isInMonthWindow(record(2019, 10), crossStart, crossEnd)).toBe(
        false,
      );
      expect(isInMonthWindow(record(2020, 4), crossStart, crossEnd)).toBe(false);
    });
  });

  it('includes exactly one month when start === end', () => {
    const point = bound(2020, 6);
    expect(isInMonthWindow(record(2020, 5), point, point)).toBe(false);
    expect(isInMonthWindow(record(2020, 6), point, point)).toBe(true);
    expect(isInMonthWindow(record(2020, 7), point, point)).toBe(false);
  });

  it('handles a December record, where the old rule leaned on Date rolling into the next year', () => {
    // The retired implementation built `new Date(2020, 12)` — January 2021 — off a
    // December record, and the whole offset fell out of that 1-based/0-based mismatch.
    // Nothing constructs a `Date` from a record any more, so December is just December.
    const decStart = bound(2020, 12);
    const decEnd = bound(2021, 11);
    expect(isInMonthWindow(record(2020, 12), decStart, decEnd)).toBe(true);
    expect(isInMonthWindow(record(2020, 11), decStart, decEnd)).toBe(false);
    expect(isInMonthWindow(record(2021, 11), decStart, decEnd)).toBe(true);
  });

  /**
   * The two months ADR-0009 changed hands, stated as a test rather than left to a
   * baseline diff. Under the retired rule `E` and `E - 1` were excluded from the chart
   * while the context log showed them, which is exactly the two-month disagreement the
   * ADR removed.
   */
  it('now includes E and E - 1, which the retired offset rule excluded', () => {
    expect(isInMonthWindow(record(2020, 11), start, end)).toBe(true); // was false
    expect(isInMonthWindow(record(2020, 12), start, end)).toBe(true); // was false
  });

  /**
   * The Month Window and the Event Window are now one rule reached through two
   * adapters, so they must agree everywhere. This is the test that fails if anyone
   * reintroduces a second rule for one of them.
   */
  it('agrees with the Event Window, month for month', () => {
    for (let month = 1; month <= 12; month++)
      expect(isInMonthWindow(record(2020, month), start, end)).toBe(
        isInEventWindow(
          { date: `2020-${String(month).padStart(2, '0')}` },
          start,
          end,
        ),
      );
  });

  /**
   * Hand-written cases on each side do not establish that the adapter never disagrees
   * with the rule it wraps. This does: every month from 2018 through 2027 against every
   * window with endpoints in the same span, exhaustively.
   */
  it('agrees with `contains` over a decade of windows, exhaustively', () => {
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
          const byOrdinal = contains({ start, end }, m);
          if (live !== byOrdinal)
            throw new Error(
              `disagree at start=${start.year}-${start.month} end=${end.year}-${end.month} record=${m.year}-${m.month}: adapter says ${String(live)}, rule says ${String(byOrdinal)}`,
            );
          compared++;
        }

    expect(compared).toBe(months.length ** 3);
  });
});
