import { describe, it, expect } from 'vitest';
import { lineMetrics } from './lineMetrics';
import { makeRidershipRecord } from '../test/builders';

/**
 * Keeps the cases ported from `src/utils/calc.test.ts` at their original positional
 * readability. Three lines and file-local — not a new record factory: it wraps the
 * shared `makeRidershipRecord`, which is what `src/test/builders.ts` exists to enforce.
 */
const at = (
  year: number,
  month: number,
  wkday: number | null,
  sat: number | null = null,
  sun: number | null = null,
) =>
  makeRidershipRecord({
    year,
    month,
    est_wkday_ridership: wkday,
    est_sat_ridership: sat,
    est_sun_ridership: sun,
  });

// Unsorted: March, January, June
const records = [
  at(2022, 3, 1000, 500, 300),
  at(2022, 1, 2000, 800, 400),
  at(2022, 6, 3000, 1200, 600),
];

const metricsFor = (input: Parameters<typeof lineMetrics>[0]) => {
  const result = lineMetrics(input);
  if (!result) throw new Error('expected metrics');
  return result;
};

describe('averageRidership', () => {
  it('returns the average weekday ridership', () => {
    expect(
      metricsFor({ records, dayOfWeek: 'est_wkday_ridership' })
        .averageRidership,
    ).toBe(2000);
  });

  it('returns the average saturday ridership', () => {
    expect(
      metricsFor({ records, dayOfWeek: 'est_sat_ridership' }).averageRidership,
    ).toBeCloseTo(833.33, 1);
  });

  it('returns the average sunday ridership', () => {
    expect(
      metricsFor({ records, dayOfWeek: 'est_sun_ridership' }).averageRidership,
    ).toBeCloseTo(433.33, 1);
  });

  it('treats null values as 0', () => {
    const mixed = [at(2022, 1, null), at(2022, 2, 3000)];
    expect(
      metricsFor({ records: mixed, dayOfWeek: 'est_wkday_ridership' })
        .averageRidership,
    ).toBe(1500);
  });

  it('handles a single record', () => {
    expect(
      metricsFor({
        records: [at(2022, 1, 500)],
        dayOfWeek: 'est_wkday_ridership',
      }).averageRidership,
    ).toBe(500);
  });

  it('handles all-null values as average of 0s', () => {
    const nulls = [at(2022, 1, null), at(2022, 2, null)];
    expect(
      metricsFor({ records: nulls, dayOfWeek: 'est_wkday_ridership' })
        .averageRidership,
    ).toBe(0);
  });
});

describe('changeInRidership', () => {
  it('returns last minus first ridership after sorting by date', () => {
    // Sorted: Jan=2000, Mar=1000, Jun=3000 → last - first = 3000 - 2000 = 1000
    expect(
      metricsFor({ records, dayOfWeek: 'est_wkday_ridership' })
        .changeInRidership,
    ).toBe(1000);
  });

  it('returns negative value when ridership declined', () => {
    const declining = [at(2022, 1, 5000), at(2022, 6, 2000)];
    expect(
      metricsFor({ records: declining, dayOfWeek: 'est_wkday_ridership' })
        .changeInRidership,
    ).toBe(-3000);
  });

  it('returns 0 for a single record', () => {
    expect(
      metricsFor({
        records: [at(2022, 1, 1000)],
        dayOfWeek: 'est_wkday_ridership',
      }).changeInRidership,
    ).toBe(0);
  });

  it('sorts by year then month across multiple years', () => {
    const multiYear = [at(2023, 1, 8000), at(2021, 6, 4000)];
    expect(
      metricsFor({ records: multiYear, dayOfWeek: 'est_wkday_ridership' })
        .changeInRidership,
    ).toBe(4000);
  });

  it('treats null as 0 for both endpoints', () => {
    const withNull = [at(2022, 1, null), at(2022, 6, 3000)];
    expect(
      metricsFor({ records: withNull, dayOfWeek: 'est_wkday_ridership' })
        .changeInRidership,
    ).toBe(3000);
  });

  it('works for saturday ridership', () => {
    // Sorted: Jan=800, Mar=500, Jun=1200 → 1200 - 800 = 400
    expect(
      metricsFor({ records, dayOfWeek: 'est_sat_ridership' }).changeInRidership,
    ).toBe(400);
  });
});

describe('endingRidership', () => {
  it('returns the most recent weekday ridership', () => {
    // Sorted chronologically, last is June=3000
    expect(
      metricsFor({ records, dayOfWeek: 'est_wkday_ridership' }).endingRidership,
    ).toBe(3000);
  });

  it('returns the most recent saturday ridership', () => {
    expect(
      metricsFor({ records, dayOfWeek: 'est_sat_ridership' }).endingRidership,
    ).toBe(1200);
  });

  it('handles a single record', () => {
    expect(
      metricsFor({
        records: [at(2022, 1, 999)],
        dayOfWeek: 'est_wkday_ridership',
      }).endingRidership,
    ).toBe(999);
  });

  it('treats a null last value as 0', () => {
    const withNull = [at(2022, 1, 500), at(2022, 6, null)];
    expect(
      metricsFor({ records: withNull, dayOfWeek: 'est_wkday_ridership' })
        .endingRidership,
    ).toBe(0);
  });

  it('picks the later year as the end', () => {
    const multiYear = [at(2023, 1, 9000), at(2021, 12, 1000)];
    expect(
      metricsFor({ records: multiYear, dayOfWeek: 'est_wkday_ridership' })
        .endingRidership,
    ).toBe(9000);
  });
});

describe('startingRidership', () => {
  it('returns the earliest weekday ridership', () => {
    // Sorted chronologically, first is January=2000
    expect(
      metricsFor({ records, dayOfWeek: 'est_wkday_ridership' })
        .startingRidership,
    ).toBe(2000);
  });

  it('returns the earliest saturday ridership', () => {
    expect(
      metricsFor({ records, dayOfWeek: 'est_sat_ridership' }).startingRidership,
    ).toBe(800);
  });

  it('handles a single record', () => {
    expect(
      metricsFor({
        records: [at(2022, 1, 750)],
        dayOfWeek: 'est_wkday_ridership',
      }).startingRidership,
    ).toBe(750);
  });

  it('treats a null first value as 0', () => {
    const withNull = [at(2022, 1, null), at(2022, 6, 500)];
    expect(
      metricsFor({ records: withNull, dayOfWeek: 'est_wkday_ridership' })
        .startingRidership,
    ).toBe(0);
  });

  it('picks the earlier year as the start', () => {
    const multiYear = [at(2023, 1, 9000), at(2021, 12, 1000)];
    expect(
      metricsFor({ records: multiYear, dayOfWeek: 'est_wkday_ridership' })
        .startingRidership,
    ).toBe(1000);
  });
});

describe('an empty series', () => {
  // No records means no metrics, not zeroes. The caller's existing
  // "this line has nothing" branch handles null — see ADR-0004. This collapses the
  // three per-function empty guards `calc.test.ts` carried; there is one function now.
  it('returns null', () => {
    expect(
      lineMetrics({ records: [], dayOfWeek: 'est_wkday_ridership' }),
    ).toBeNull();
  });
});

describe('input is not mutated', () => {
  // The array handed in is the live ridershipRecords array inside ridershipByLine,
  // which also backs the row sparklines and the CSV export — sorting it in place
  // reorders data other callers are reading.
  const unsorted = () => [
    at(2022, 3, 1000),
    at(2022, 1, 2000),
    at(2022, 6, 3000),
  ];

  it('leaves the caller order intact', () => {
    const input = unsorted();
    lineMetrics({ records: input, dayOfWeek: 'est_wkday_ridership' });
    expect(input.map((r) => r.month)).toEqual([3, 1, 6]);
  });

  it('still returns the chronological endpoints from an unsorted input', () => {
    const input = unsorted();
    const m = metricsFor({
      records: input,
      dayOfWeek: 'est_wkday_ridership',
    });
    expect(m.startingRidership).toBe(2000);
    expect(m.endingRidership).toBe(3000);
    expect(m.changeInRidership).toBe(1000);
  });
});

describe('ridersPerMile', () => {
  it('divides average ridership by distance', () => {
    const m = metricsFor({
      records: [at(2022, 1, 10000)],
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 20,
    });
    expect(m.ridersPerMile).toBe(500);
  });

  it('returns a decimal when ridership does not divide evenly', () => {
    const m = metricsFor({
      records: [at(2022, 1, 1000)],
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 3,
    });
    expect(m.ridersPerMile).toBeCloseTo(333.33, 1);
  });

  it('returns 0 when ridership is 0', () => {
    const m = metricsFor({
      records: [at(2022, 1, 0)],
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 15,
    });
    expect(m.ridersPerMile).toBe(0);
  });

  it('divides the average by the distance', () => {
    const m = metricsFor({
      records,
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 10,
    });
    expect(m.ridersPerMile).toBe(200);
  });

  // Preserves `if (updatedLine.distanceMiles)` from the former call site: a falsy
  // distance means no figure, never Infinity and never NaN.
  it('is undefined when the distance is absent', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership' });
    expect(m.ridersPerMile).toBeUndefined();
  });

  it('is undefined when the distance is 0', () => {
    const m = metricsFor({
      records,
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 0,
    });
    expect(m.ridersPerMile).toBeUndefined();
  });

  // Always written, never omitted, so spreading onto a Line clears a stale figure.
  it('is present as a key even when undefined', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership' });
    expect('ridersPerMile' in m).toBe(true);
  });
});

describe('one call, all five figures', () => {
  it('returns every figure from a single call', () => {
    const m = metricsFor({
      records,
      dayOfWeek: 'est_wkday_ridership',
      distanceMiles: 10,
    });
    expect(m).toEqual({
      averageRidership: 2000,
      changeInRidership: 1000,
      startingRidership: 2000,
      endingRidership: 3000,
      ridersPerMile: 200,
    });
  });
});
