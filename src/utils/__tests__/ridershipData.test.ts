import { describe, it, expect } from 'vitest';
import { decodeRidership, type ColumnarRidership } from '../ridershipData';

const CANONICAL_COLS = [
  'year',
  'month',
  'line_name',
  'est_wkday_ridership',
  'est_sat_ridership',
  'est_sun_ridership',
];

describe('decodeRidership', () => {
  it('decodes columnar rows into records', () => {
    const data: ColumnarRidership = {
      cols: CANONICAL_COLS,
      rows: [
        [2009, 1, 2, 21816, 13442, 8924],
        [2022, 6, 807, 5000, 3000, 2000],
      ],
    };

    expect(decodeRidership(data)).toEqual([
      {
        year: 2009,
        month: 1,
        line_name: 2,
        est_wkday_ridership: 21816,
        est_sat_ridership: 13442,
        est_sun_ridership: 8924,
      },
      {
        year: 2022,
        month: 6,
        line_name: 807,
        est_wkday_ridership: 5000,
        est_sat_ridership: 3000,
        est_sun_ridership: 2000,
      },
    ]);
  });

  it('preserves null ridership values', () => {
    const data: ColumnarRidership = {
      cols: CANONICAL_COLS,
      rows: [[2020, 3, 10, null, null, null]],
    };

    const [record] = decodeRidership(data);
    expect(record.est_wkday_ridership).toBeNull();
    expect(record.est_sat_ridership).toBeNull();
    expect(record.est_sun_ridership).toBeNull();
  });

  it('resolves fields by name regardless of column order', () => {
    const data: ColumnarRidership = {
      cols: ['line_name', 'est_sun_ridership', 'est_sat_ridership', 'est_wkday_ridership', 'month', 'year'],
      rows: [[807, 2000, 3000, 5000, 6, 2022]],
    };

    expect(decodeRidership(data)).toEqual([
      {
        year: 2022,
        month: 6,
        line_name: 807,
        est_wkday_ridership: 5000,
        est_sat_ridership: 3000,
        est_sun_ridership: 2000,
      },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(decodeRidership({ cols: CANONICAL_COLS, rows: [] })).toEqual([]);
  });
});
