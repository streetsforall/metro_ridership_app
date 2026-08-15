import { describe, it, expect } from 'vitest';
import { isInEventWindow } from './eventWindow';
import { isInMonthWindow } from './monthWindow';
import { contains } from '../utils/month';

/**
 * Boundary tests for the Event Window rule, pinned at month granularity — the sibling
 * of `monthWindow.test.ts`, and deliberately not the same rule.
 *
 * Bounds are constructed the way the app constructs them, `new Date(year, month - 1)`,
 * and event dates the way `transit-events.json` stores them, `"YYYY-MM"`.
 */
const bound = (year: number, month: number) => new Date(year, month - 1);

// The window the chart's date pickers produce for "Jan 2020 – Dec 2020".
const start = bound(2020, 1);
const end = bound(2020, 12);

const event = (date: string) => ({ date });

describe('isInEventWindow — the Event Window rule, S <= R <= E', () => {
  it('includes the start month', () => {
    expect(isInEventWindow(event('2020-01'), start, end)).toBe(true);
  });

  it('excludes the month before the start month', () => {
    expect(isInEventWindow(event('2019-12'), start, end)).toBe(false);
  });

  it('includes the end month — both ends are in', () => {
    expect(isInEventWindow(event('2020-12'), start, end)).toBe(true);
  });

  it('excludes the month after the end month', () => {
    expect(isInEventWindow(event('2021-01'), start, end)).toBe(false);
  });

  it('includes a single-month window at its one month', () => {
    const point = bound(2020, 6);
    expect(isInEventWindow(event('2020-06'), point, point)).toBe(true);
    expect(isInEventWindow(event('2020-05'), point, point)).toBe(false);
    expect(isInEventWindow(event('2020-07'), point, point)).toBe(false);
  });

  describe('across a year boundary', () => {
    const crossStart = bound(2019, 11);
    const crossEnd = bound(2020, 3);

    it('includes every month from the start to the end inclusive', () => {
      for (const date of ['2019-11', '2019-12', '2020-01', '2020-02', '2020-03'])
        expect(isInEventWindow(event(date), crossStart, crossEnd)).toBe(true);
    });

    it('excludes the months either side', () => {
      expect(isInEventWindow(event('2019-10'), crossStart, crossEnd)).toBe(
        false,
      );
      expect(isInEventWindow(event('2020-04'), crossStart, crossEnd)).toBe(
        false,
      );
    });
  });

  /**
   * The disagreement with the Month Window is the whole reason both rules exist. For
   * one window, the context log runs two months past the chart's right-hand edge: the
   * chart's last plotted month is `E - 2`, and events at `E - 1` and `E` still show.
   *
   * ADR-0001: reconciling the two would change which events a shared URL displays.
   */
  it('disagrees with the Month Window at E and E - 1, deliberately', () => {
    // E - 1
    expect(isInEventWindow(event('2020-11'), start, end)).toBe(true);
    expect(isInMonthWindow({ year: 2020, month: 11 }, start, end)).toBe(false);

    // E
    expect(isInEventWindow(event('2020-12'), start, end)).toBe(true);
    expect(isInMonthWindow({ year: 2020, month: 12 }, start, end)).toBe(false);

    // Everywhere else in the window they agree.
    expect(isInEventWindow(event('2020-05'), start, end)).toBe(true);
    expect(isInMonthWindow({ year: 2020, month: 5 }, start, end)).toBe(true);
  });

  it('excludes an unparseable date rather than admitting it to every window', () => {
    // `transit-events.json` is schema-checked, so this should be unreachable. The
    // failure mode being guarded is the old inline `YYYYMM` compare's: `Number("xx")`
    // is `NaN`, every comparison against it is false, and the event fell through into
    // the log for *every* window instead of none.
    expect(isInEventWindow(event('not-a-month'), start, end)).toBe(false);
    expect(isInEventWindow(event('2020'), start, end)).toBe(false);
    expect(isInEventWindow(event(''), start, end)).toBe(false);
  });

  /**
   * The same exhaustive check `monthWindow.test.ts` runs, for the same reason: the
   * hand-written cases above pin the boundaries, and this pins that the `Date`-and-text
   * adapter never disagrees with the rule it wraps, over every window in a decade.
   */
  it('agrees with `contains` over a decade of windows, exhaustively', () => {
    const months = [];
    for (let year = 2018; year <= 2027; year++)
      for (let month = 1; month <= 12; month++) months.push({ year, month });
    const bounds = months.map((m) => bound(m.year, m.month));
    const dates = months.map(
      (m) => `${m.year}-${String(m.month).padStart(2, '0')}`,
    );

    let compared = 0;
    for (const [s, start] of months.entries())
      for (const [e, end] of months.entries())
        for (const [i, m] of months.entries()) {
          const live = isInEventWindow({ date: dates[i] }, bounds[s], bounds[e]);
          const byOrdinal = contains({ start, end }, m);
          if (live !== byOrdinal)
            throw new Error(
              `disagree at start=${start.year}-${start.month} end=${end.year}-${end.month} event=${dates[i]}: adapter says ${String(live)}, rule says ${String(byOrdinal)}`,
            );
          compared++;
        }

    expect(compared).toBe(months.length ** 3);
  });
});
