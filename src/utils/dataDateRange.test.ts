import { describe, it, expect } from 'vitest';
import {
  dataMinYear,
  dataMaxYear,
  dataDefaultEndDate,
} from './dataDateRange';
import ridershipRecords from '../data/ridership.json';
import type { RidershipRecord } from '../@types/metrics.types';

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
  it('is set one month past the latest record so the filter includes it', () => {
    // Find the latest record — the one with the highest (year * 12 + month) value.
    const latest = records.reduce((best, r) =>
      r.year * 12 + r.month > best.year * 12 + best.month ? r : best,
    );
    // The end filter in App.tsx is exclusive and month is 1-based in the data
    // but 0-based in Date, so "one past" means maxMonth + 1 as the month arg.
    const expected = new Date(latest.year, latest.month + 1);
    expect(dataDefaultEndDate).toEqual(expected);
  });

  it('is after the latest record date under the same off-by-one convention App.tsx uses', () => {
    const latest = records.reduce((best, r) =>
      r.year * 12 + r.month > best.year * 12 + best.month ? r : best,
    );
    // App.tsx builds metricDate as new Date(record.year, record.month) (0-based)
    const latestMetricDate = new Date(latest.year, latest.month);
    expect(dataDefaultEndDate.getTime()).toBeGreaterThan(latestMetricDate.getTime());
  });
});
