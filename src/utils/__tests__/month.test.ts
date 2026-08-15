import { describe, it, expect } from 'vitest';
import {
  ordinal,
  monthOf,
  monthsEqual,
  compareMonths,
  parseMonth,
  formatMonth,
  displayMonth,
  contains,
  containsOffset,
  type Month,
  type MonthWindow,
} from '../month';

/** The window ADR-0001's boundary cases are stated against. */
const window2020: MonthWindow = {
  start: { year: 2020, month: 1 },
  end: { year: 2020, month: 12 },
};

describe('ordinal', () => {
  it('is 1-based month minus one, plus twelve per year', () => {
    expect(ordinal({ year: 2020, month: 1 })).toBe(2020 * 12);
    expect(ordinal({ year: 2020, month: 12 })).toBe(2020 * 12 + 11);
  });

  it('advances by one across a year boundary', () => {
    expect(ordinal({ year: 2021, month: 1 }) - ordinal({ year: 2020, month: 12 })).toBe(1);
  });
});

describe('containsOffset — the Month Window rule, S <= R <= E - 2', () => {
  it('includes the start month', () => {
    expect(containsOffset(window2020, { year: 2020, month: 1 })).toBe(true);
  });

  it('excludes one month before the start', () => {
    expect(containsOffset(window2020, { year: 2019, month: 12 })).toBe(false);
  });

  it('includes E - 2', () => {
    expect(containsOffset(window2020, { year: 2020, month: 10 })).toBe(true);
  });

  it('excludes E - 1', () => {
    expect(containsOffset(window2020, { year: 2020, month: 11 })).toBe(false);
  });

  it('excludes the end month', () => {
    expect(containsOffset(window2020, { year: 2020, month: 12 })).toBe(false);
  });

  // Exercises the *12 term: the window and its boundaries straddle a year boundary.
  describe('across a year boundary', () => {
    const crossing: MonthWindow = {
      start: { year: 2019, month: 11 },
      end: { year: 2020, month: 2 },
    };

    it('includes the start month and E - 2', () => {
      expect(containsOffset(crossing, { year: 2019, month: 11 })).toBe(true);
      expect(containsOffset(crossing, { year: 2019, month: 12 })).toBe(true);
    });

    it('excludes E - 1 and E', () => {
      expect(containsOffset(crossing, { year: 2020, month: 1 })).toBe(false);
      expect(containsOffset(crossing, { year: 2020, month: 2 })).toBe(false);
    });
  });
});

describe('contains — the Event Window rule, inclusive on both ends', () => {
  it('includes the start month', () => {
    expect(contains(window2020, { year: 2020, month: 1 })).toBe(true);
  });

  it('includes the end month', () => {
    expect(contains(window2020, { year: 2020, month: 12 })).toBe(true);
  });

  it('excludes one month before the start', () => {
    expect(contains(window2020, { year: 2019, month: 12 })).toBe(false);
  });

  it('excludes one month after the end', () => {
    expect(contains(window2020, { year: 2021, month: 1 })).toBe(false);
  });

  // The two rules read the same window and genuinely disagree about it. That is
  // deliberate — see ADR-0001. This test is the guard against a future tidy-up that
  // "unifies" them; if it fails, one of the two rules has drifted.
  it('disagrees with containsOffset at the end of the window', () => {
    const endMonth: Month = { year: 2020, month: 12 };
    expect(contains(window2020, endMonth)).toBe(true);
    expect(containsOffset(window2020, endMonth)).toBe(false);
  });
});

describe('monthOf', () => {
  it('leaves an in-range month alone', () => {
    expect(monthOf(2025, 9)).toEqual({ year: 2025, month: 9 });
  });

  it('rolls 13 forward into the next January', () => {
    expect(monthOf(2025, 13)).toEqual({ year: 2026, month: 1 });
  });

  it('rolls 0 back into the previous December', () => {
    expect(monthOf(2025, 0)).toEqual({ year: 2024, month: 12 });
  });

  // Pins the ((o % 12) + 12) % 12 guard: a plain % would yield a negative month here.
  it('rolls a negative month back into the previous November', () => {
    expect(monthOf(2025, -1)).toEqual({ year: 2024, month: 11 });
  });
});

describe('monthsEqual', () => {
  it('compares by value, not identity', () => {
    expect(monthsEqual({ year: 2025, month: 9 }, { year: 2025, month: 9 })).toBe(true);
  });

  it('is false when the month differs', () => {
    expect(monthsEqual({ year: 2025, month: 9 }, { year: 2025, month: 10 })).toBe(false);
  });

  it('is false when the year differs', () => {
    expect(monthsEqual({ year: 2025, month: 9 }, { year: 2024, month: 9 })).toBe(false);
  });
});

describe('compareMonths', () => {
  // A lexicographic sort on "YYYY M" gets this wrong — "2025 10" < "2025 7" as text.
  // This is why buildMonthAxis sorts on an ordinal.
  it('sorts chronologically, not lexicographically', () => {
    const months: Month[] = [
      { year: 2025, month: 10 },
      { year: 2025, month: 7 },
      { year: 2024, month: 12 },
    ];
    expect([...months].sort(compareMonths)).toEqual([
      { year: 2024, month: 12 },
      { year: 2025, month: 7 },
      { year: 2025, month: 10 },
    ]);
  });

  it('is zero for equal months', () => {
    expect(compareMonths({ year: 2025, month: 9 }, { year: 2025, month: 9 })).toBe(0);
  });
});

describe('parseMonth', () => {
  it('parses a valid YYYY-MM string to a Month', () => {
    expect(parseMonth('2020-07')).toEqual({ year: 2020, month: 7 });
  });

  it('zero-pads single-digit months correctly', () => {
    expect(parseMonth('2022-01')).toEqual({ year: 2022, month: 1 });
  });

  it('parses December correctly', () => {
    expect(parseMonth('2025-12')).toEqual({ year: 2025, month: 12 });
  });

  it('returns null for a non-numeric string', () => {
    expect(parseMonth('invalid')).toBeNull();
  });

  it('returns null for nonsense', () => {
    expect(parseMonth('nonsense')).toBeNull();
  });

  it('returns null when month is 0', () => {
    expect(parseMonth('2020-00')).toBeNull();
    expect(parseMonth('2025-00')).toBeNull();
  });

  it('returns null when month exceeds 12', () => {
    expect(parseMonth('2020-13')).toBeNull();
    expect(parseMonth('2025-13')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseMonth('')).toBeNull();
  });
});

describe('formatMonth', () => {
  it('formats a Month to YYYY-MM with zero-padded month', () => {
    expect(formatMonth({ year: 2020, month: 7 })).toBe('2020-07');
  });

  it('zero-pads January', () => {
    expect(formatMonth({ year: 2022, month: 1 })).toBe('2022-01');
  });

  it('formats December without padding', () => {
    expect(formatMonth({ year: 2025, month: 12 })).toBe('2025-12');
  });
});

describe('parseMonth / formatMonth round-trip', () => {
  // Every shared URL depends on this holding.
  it.each(['2019-12', '2026-05', '2009-01'])('round-trips %s', (text) => {
    expect(formatMonth(parseMonth(text)!)).toBe(text);
  });
});

describe('displayMonth', () => {
  it('renders a Month for humans', () => {
    expect(displayMonth({ year: 2025, month: 9 })).toBe('Sep 2025');
  });
});
