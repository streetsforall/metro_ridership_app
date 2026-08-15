import { describe, it, expect } from 'vitest';
import {
  dataMinYear,
  dataMaxYear,
  dataDefaultEndDate,
} from '../dataDateRange';
import { isInMonthWindow } from '../../ridership';
import ridershipRecords from '../../data/ridership.json';
import type { RidershipRecord } from '../../@types/metrics.types';

const records = ridershipRecords as RidershipRecord[];

describe('dataMinYear', () => {
  it('equals the smallest year in ridership.json', () => {
    const expected = Math.min(...records.map((r) => r.year));
    expect(dataMinYear).toBe(expected);
  });

  it('is a finite number', () => {
    expect(isFinite(dataMinYear)).toBe(true);
  });
});

describe('dataMaxYear', () => {
  it('equals the largest year in ridership.json', () => {
    const expected = Math.max(...records.map((r) => r.year));
    expect(dataMaxYear).toBe(expected);
  });

  it('is greater than or equal to dataMinYear', () => {
    expect(dataMaxYear).toBeGreaterThanOrEqual(dataMinYear);
  });
});

describe('dataDefaultEndDate', () => {
  // The latest record — the one with the highest (year * 12 + month) value.
  const latest = records.reduce((best, r) =>
    r.year * 12 + r.month > best.year * 12 + best.month ? r : best,
  );

  it('is the last month of data', () => {
    // 1-based in the data, 0-based as a Date month argument.
    expect(dataDefaultEndDate).toEqual(new Date(latest.year, latest.month - 1));
  });

  /**
   * This used to be `latest.month + 1` — one month *past* the data — to compensate for
   * the Month Window excluding its own end month and the month before it. ADR-0009
   * removed the offset, so the compensation went with it. Had it stayed, the default
   * view would open on two empty trailing months.
   */
  it('leaves no empty trailing month: the latest record is inside the default window', () => {
    expect(
      isInMonthWindow(latest, new Date(dataMinYear, 0), dataDefaultEndDate),
    ).toBe(true);
    // And nothing beyond it is.
    const oneMonthOn = { year: latest.year, month: latest.month + 1 };
    expect(
      isInMonthWindow(oneMonthOn, new Date(dataMinYear, 0), dataDefaultEndDate),
    ).toBe(false);
  });
});
