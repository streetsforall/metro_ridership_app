import { describe, it, expect } from 'vitest';
import {
  eventDateToLabel,
  labelToEventDate,
  labelToDate,
  formatMonthLabel,
  formatEventDate,
} from './months';

describe('eventDateToLabel', () => {
  it('drops the zero padding the axis labels do not use', () => {
    expect(eventDateToLabel('2023-02')).toBe('2023 2');
  });

  it('leaves a two-digit month alone', () => {
    expect(eventDateToLabel('2020-12')).toBe('2020 12');
  });
});

describe('labelToEventDate', () => {
  it('restores the zero padding the event dates require', () => {
    expect(labelToEventDate('2023 2')).toBe('2023-02');
  });

  it('round-trips every month of a year', () => {
    for (let month = 1; month <= 12; month++) {
      const date = `2021-${String(month).padStart(2, '0')}`;
      expect(labelToEventDate(eventDateToLabel(date))).toBe(date);
    }
  });
});

describe('labelToDate', () => {
  it('returns the first of the month in local time', () => {
    const date = labelToDate('2020 7');
    expect(date?.getFullYear()).toBe(2020);
    // Month is 0-based on Date, so July is 6.
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(1);
  });

  it('returns null for a label that is not a month', () => {
    expect(labelToDate('not a month')).toBeNull();
  });

  /**
   * Month zero would silently roll into the previous December, which is worse
   * than refusing: a dragged range would land a month off with nothing to show
   * for it.
   */
  it('returns null rather than rolling over on a zero month', () => {
    expect(labelToDate('2020 0')).toBeNull();
  });
});

describe('formatMonthLabel', () => {
  it('renders "YYYY M" as "Mon YYYY"', () => {
    expect(formatMonthLabel('2026 5')).toBe('May 2026');
  });

  it('passes an unparseable label through unchanged', () => {
    expect(formatMonthLabel('whenever')).toBe('whenever');
  });
});

describe('formatEventDate', () => {
  it('renders "YYYY-MM" as "Mon YYYY"', () => {
    expect(formatEventDate('2026-05')).toBe('May 2026');
  });

  it('agrees with formatMonthLabel on the same month', () => {
    expect(formatEventDate('2023-02')).toBe(formatMonthLabel('2023 2'));
  });
});
