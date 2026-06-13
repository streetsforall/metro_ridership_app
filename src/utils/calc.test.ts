import { describe, it, expect } from 'vitest';
import { calcAvg, calcAbsChange, calcEnd, calcStart } from './calc';
import type { RidershipRecord } from '../@types/metrics.types';

const makeRecord = (
  year: number,
  month: number,
  wkday: number | null,
  sat: number | null = null,
  sun: number | null = null,
): RidershipRecord => ({
  year,
  month,
  line_name: 801,
  est_wkday_ridership: wkday,
  est_sat_ridership: sat,
  est_sun_ridership: sun,
});

// Unsorted: March, January, June
const records = [
  makeRecord(2022, 3, 1000, 500, 300),
  makeRecord(2022, 1, 2000, 800, 400),
  makeRecord(2022, 6, 3000, 1200, 600),
];

describe('calcAvg', () => {
  it('returns the average weekday ridership', () => {
    expect(calcAvg(records, 'est_wkday_ridership')).toBe(2000);
  });

  it('returns the average saturday ridership', () => {
    expect(calcAvg(records, 'est_sat_ridership')).toBeCloseTo(833.33, 1);
  });

  it('returns the average sunday ridership', () => {
    expect(calcAvg(records, 'est_sun_ridership')).toBeCloseTo(433.33, 1);
  });

  it('treats null values as 0', () => {
    const mixed = [makeRecord(2022, 1, null), makeRecord(2022, 2, 3000)];
    expect(calcAvg(mixed, 'est_wkday_ridership')).toBe(1500);
  });

  it('handles a single record', () => {
    expect(calcAvg([makeRecord(2022, 1, 500)], 'est_wkday_ridership')).toBe(500);
  });

  it('handles all-null values as average of 0s', () => {
    const nulls = [makeRecord(2022, 1, null), makeRecord(2022, 2, null)];
    expect(calcAvg(nulls, 'est_wkday_ridership')).toBe(0);
  });
});

describe('calcAbsChange', () => {
  it('returns last minus first ridership after sorting by date', () => {
    // Sorted: Jan=2000, Mar=1000, Jun=3000 → last - first = 3000 - 2000 = 1000
    expect(calcAbsChange([...records], 'est_wkday_ridership')).toBe(1000);
  });

  it('returns negative value when ridership declined', () => {
    const declining = [makeRecord(2022, 1, 5000), makeRecord(2022, 6, 2000)];
    expect(calcAbsChange(declining, 'est_wkday_ridership')).toBe(-3000);
  });

  it('returns 0 for a single record', () => {
    expect(calcAbsChange([makeRecord(2022, 1, 1000)], 'est_wkday_ridership')).toBe(0);
  });

  it('sorts by year then month across multiple years', () => {
    const multiYear = [makeRecord(2023, 1, 8000), makeRecord(2021, 6, 4000)];
    expect(calcAbsChange(multiYear, 'est_wkday_ridership')).toBe(4000);
  });

  it('treats null as 0 for both endpoints', () => {
    const withNull = [makeRecord(2022, 1, null), makeRecord(2022, 6, 3000)];
    expect(calcAbsChange(withNull, 'est_wkday_ridership')).toBe(3000);
  });

  it('works for saturday ridership', () => {
    // Sorted: Jan=800, Mar=500, Jun=1200 → 1200 - 800 = 400
    expect(calcAbsChange([...records], 'est_sat_ridership')).toBe(400);
  });
});

describe('calcEnd', () => {
  it('returns the most recent weekday ridership', () => {
    // Sorted chronologically, last is June=3000
    expect(calcEnd([...records], 'est_wkday_ridership')).toBe(3000);
  });

  it('returns the most recent saturday ridership', () => {
    expect(calcEnd([...records], 'est_sat_ridership')).toBe(1200);
  });

  it('handles a single record', () => {
    expect(calcEnd([makeRecord(2022, 1, 999)], 'est_wkday_ridership')).toBe(999);
  });

  it('treats a null last value as 0', () => {
    const withNull = [makeRecord(2022, 1, 500), makeRecord(2022, 6, null)];
    expect(calcEnd(withNull, 'est_wkday_ridership')).toBe(0);
  });

  it('picks the later year as the end', () => {
    const multiYear = [makeRecord(2023, 1, 9000), makeRecord(2021, 12, 1000)];
    expect(calcEnd(multiYear, 'est_wkday_ridership')).toBe(9000);
  });
});

describe('calcStart', () => {
  it('returns the earliest weekday ridership', () => {
    // Sorted chronologically, first is January=2000
    expect(calcStart([...records], 'est_wkday_ridership')).toBe(2000);
  });

  it('returns the earliest saturday ridership', () => {
    expect(calcStart([...records], 'est_sat_ridership')).toBe(800);
  });

  it('handles a single record', () => {
    expect(calcStart([makeRecord(2022, 1, 750)], 'est_wkday_ridership')).toBe(750);
  });

  it('treats a null first value as 0', () => {
    const withNull = [makeRecord(2022, 1, null), makeRecord(2022, 6, 500)];
    expect(calcStart(withNull, 'est_wkday_ridership')).toBe(0);
  });

  it('picks the earlier year as the start', () => {
    const multiYear = [makeRecord(2023, 1, 9000), makeRecord(2021, 12, 1000)];
    expect(calcStart(multiYear, 'est_wkday_ridership')).toBe(1000);
  });
});
