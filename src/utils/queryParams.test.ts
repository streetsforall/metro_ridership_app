import { describe, it, expect } from 'vitest';
import {
  parseMonthParam,
  formatMonthParam,
  dayOfWeekToParam,
  paramToDayOfWeek,
  parseModesFromParams,
} from './queryParams';

describe('parseMonthParam', () => {
  it('parses a valid YYYY-MM string to a Date', () => {
    expect(parseMonthParam('2020-07')).toEqual(new Date(2020, 6));
  });

  it('zero-pads single-digit months correctly', () => {
    expect(parseMonthParam('2022-01')).toEqual(new Date(2022, 0));
  });

  it('parses December correctly', () => {
    expect(parseMonthParam('2025-12')).toEqual(new Date(2025, 11));
  });

  it('returns null for a non-numeric string', () => {
    expect(parseMonthParam('invalid')).toBeNull();
  });

  it('returns null when month is 0', () => {
    expect(parseMonthParam('2020-00')).toBeNull();
  });

  it('returns null when month exceeds 12', () => {
    expect(parseMonthParam('2020-13')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseMonthParam('')).toBeNull();
  });
});

describe('formatMonthParam', () => {
  it('formats a date to YYYY-MM with zero-padded month', () => {
    expect(formatMonthParam(new Date(2020, 6))).toBe('2020-07');
  });

  it('zero-pads January (month 0)', () => {
    expect(formatMonthParam(new Date(2022, 0))).toBe('2022-01');
  });

  it('formats December without padding', () => {
    expect(formatMonthParam(new Date(2025, 11))).toBe('2025-12');
  });
});

describe('dayOfWeekToParam', () => {
  it('maps weekday key to wkday', () => {
    expect(dayOfWeekToParam['est_wkday_ridership']).toBe('wkday');
  });

  it('maps saturday key to sat', () => {
    expect(dayOfWeekToParam['est_sat_ridership']).toBe('sat');
  });

  it('maps sunday key to sun', () => {
    expect(dayOfWeekToParam['est_sun_ridership']).toBe('sun');
  });
});

describe('paramToDayOfWeek', () => {
  it('maps wkday to weekday ridership key', () => {
    expect(paramToDayOfWeek['wkday']).toBe('est_wkday_ridership');
  });

  it('maps sat to saturday ridership key', () => {
    expect(paramToDayOfWeek['sat']).toBe('est_sat_ridership');
  });

  it('maps sun to sunday ridership key', () => {
    expect(paramToDayOfWeek['sun']).toBe('est_sun_ridership');
  });

  it('returns undefined for an unknown param', () => {
    expect(paramToDayOfWeek['unknown']).toBeUndefined();
  });
});

describe('parseModesFromParams', () => {
  const makeParams = (search: string) => new URLSearchParams(search);

  it('returns both modes when no params are set', () => {
    expect(parseModesFromParams(makeParams(''))).toEqual(['bus', 'train']);
  });

  it('excludes bus when buses=0', () => {
    expect(parseModesFromParams(makeParams('buses=0'))).toEqual(['train']);
  });

  it('excludes train when trains=0', () => {
    expect(parseModesFromParams(makeParams('trains=0'))).toEqual(['bus']);
  });

  it('returns empty array when both modes are disabled', () => {
    expect(parseModesFromParams(makeParams('buses=0&trains=0'))).toEqual([]);
  });

  it('includes both when buses=1 is explicitly set', () => {
    expect(parseModesFromParams(makeParams('buses=1'))).toEqual(['bus', 'train']);
  });
});
