import { describe, it, expect } from 'vitest';
import type { Chart as ChartJS } from 'chart.js';
import {
  eventDateToLabel,
  labelToEventDate,
  labelToDate,
  formatMonthLabel,
  formatEventDate,
  monthIndexAtPixel,
} from '../months';

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

describe('monthIndexAtPixel', () => {
  /**
   * Twelve months laid out 25px apart starting at x=50, inside a plot area
   * running 0..400 — the same geometry the gutter plugin's tests draw against.
   */
  const makeChart = () =>
    ({
      data: { labels: Array.from({ length: 12 }, (_, i) => `2020 ${i + 1}`) },
      chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
      scales: { x: { getValueForPixel: (px: number) => (px - 50) / 25 } },
    }) as unknown as ChartJS;

  it('returns the month whose position the pixel is nearest', () => {
    expect(monthIndexAtPixel(makeChart(), 150)).toBe(4);
  });

  it('rounds to the nearer of two months', () => {
    expect(monthIndexAtPixel(makeChart(), 161)).toBe(4);
    expect(monthIndexAtPixel(makeChart(), 164)).toBe(5);
  });

  /**
   * A drag that runs off either edge of the plot still has to land on a month,
   * so the pixel is clamped to the plot area and the index to the axis. Without
   * the clamp the left case yields a negative index and the right case an index
   * past the last label, and the drag would select nothing.
   */
  it('clamps a pixel left of the first month to the first month', () => {
    expect(monthIndexAtPixel(makeChart(), -300)).toBe(0);
  });

  it('clamps a pixel right of the last month to the last month', () => {
    expect(monthIndexAtPixel(makeChart(), 9000)).toBe(11);
  });

  it('clamps to month zero on an axis with no labels', () => {
    const chart = {
      data: { labels: [] },
      chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
      scales: { x: { getValueForPixel: (px: number) => (px - 50) / 25 } },
    } as unknown as ChartJS;
    expect(monthIndexAtPixel(chart, 300)).toBe(0);
  });
});
