import { describe, it, expect } from 'vitest';
import {
  alignToMonthAxis,
  buildAggregateSeries,
  buildMonthAxis,
} from './chartData';
import type { RidershipRecord } from '../@types/metrics.types';

const record = (
  year: number,
  month: number,
  wkday: number | null = 100,
): RidershipRecord => ({
  year,
  month,
  line_name: 804,
  est_wkday_ridership: wkday,
  est_sat_ridership: wkday === null ? null : wkday / 2,
  est_sun_ridership: wkday === null ? null : wkday / 4,
});

describe('buildMonthAxis', () => {
  it('returns the months of a single series in chronological order', () => {
    const axis = buildMonthAxis([
      [record(2025, 7), record(2025, 8), record(2025, 9)],
    ]);

    expect(axis).toEqual(['2025 7', '2025 8', '2025 9']);
  });

  it('sorts by month ordinal, not lexicographically', () => {
    // "2025 10" sorts before "2025 7" as a string — the axis must not do that.
    const axis = buildMonthAxis([
      [record(2025, 7), record(2025, 10), record(2025, 9), record(2026, 1)],
    ]);

    expect(axis).toEqual(['2025 7', '2025 9', '2025 10', '2026 1']);
  });

  it('merges the union of months across series and sorts the result', () => {
    // Mirrors the D Line (short, late) + E Line (long) case: the short series is
    // first, so a first-dataset-derived axis would put 2025 onto the front.
    const dLine = [record(2025, 7), record(2025, 8)];
    const eLine = [record(2020, 7), record(2020, 8), record(2025, 7)];

    expect(buildMonthAxis([dLine, eLine])).toEqual([
      '2020 7',
      '2020 8',
      '2025 7',
      '2025 8',
    ]);
  });

  it('deduplicates months shared by several series', () => {
    const axis = buildMonthAxis([
      [record(2024, 3), record(2024, 4)],
      [record(2024, 3), record(2024, 4)],
    ]);

    expect(axis).toEqual(['2024 3', '2024 4']);
  });

  it('returns an empty axis for no series and for empty series', () => {
    expect(buildMonthAxis([])).toEqual([]);
    expect(buildMonthAxis([[], []])).toEqual([]);
  });
});

describe('alignToMonthAxis', () => {
  const months = ['2020 7', '2020 8', '2025 7', '2025 8'];

  it('emits one point per axis month, in axis order', () => {
    const data = alignToMonthAxis(
      [record(2025, 7, 500), record(2025, 8, 600)],
      months,
      'est_wkday_ridership',
    );

    expect(data.map((d) => d.time)).toEqual(months);
  });

  it('nulls months the line has no record for', () => {
    const data = alignToMonthAxis(
      [record(2025, 7, 500), record(2025, 8, 600)],
      months,
      'est_wkday_ridership',
    );

    expect(data.map((d) => d.stat)).toEqual([null, null, 500, 600]);
  });

  it('preserves a legitimate zero rather than nulling it', () => {
    const data = alignToMonthAxis(
      [record(2025, 7, 0)],
      months,
      'est_wkday_ridership',
    );

    expect(data[2].stat).toBe(0);
  });

  it('nulls a record whose value for the selected day is null', () => {
    const data = alignToMonthAxis(
      [record(2025, 7, null)],
      months,
      'est_wkday_ridership',
    );

    expect(data[2].stat).toBeNull();
  });

  it('reads the field named by dayOfWeek', () => {
    const records = [record(2025, 7, 800)];

    expect(
      alignToMonthAxis(records, months, 'est_sat_ridership')[2].stat,
    ).toBe(400);
    expect(
      alignToMonthAxis(records, months, 'est_sun_ridership')[2].stat,
    ).toBe(200);
  });
});

describe('buildAggregateSeries', () => {
  const months = ['2020 7', '2025 7', '2025 8'];

  it('sums by month rather than by array index', () => {
    // Both series are aligned to `months`, so the short line's values line up
    // with the months they actually belong to.
    const long = alignToMonthAxis(
      [record(2020, 7, 100), record(2025, 7, 200), record(2025, 8, 300)],
      months,
      'est_wkday_ridership',
    );
    const short = alignToMonthAxis(
      [record(2025, 7, 10), record(2025, 8, 20)],
      months,
      'est_wkday_ridership',
    );

    expect(buildAggregateSeries([long, short], months)).toEqual([
      { time: '2020 7', stat: 100 },
      { time: '2025 7', stat: 210 },
      { time: '2025 8', stat: 320 },
    ]);
  });

  it('skips missing lines instead of counting them as zero', () => {
    const long = alignToMonthAxis(
      [record(2020, 7, 100)],
      months,
      'est_wkday_ridership',
    );
    const short = alignToMonthAxis([], months, 'est_wkday_ridership');

    // 2020 7 reports 100 from one line only — not 100 dragged down by a phantom 0.
    expect(buildAggregateSeries([long, short], months)[0].stat).toBe(100);
  });

  it('returns null for a month no line reports', () => {
    const data = alignToMonthAxis(
      [record(2025, 7, 200)],
      months,
      'est_wkday_ridership',
    );

    const aggregate = buildAggregateSeries([data], months);
    expect(aggregate[0].stat).toBeNull();
    expect(aggregate[1].stat).toBe(200);
    expect(aggregate[2].stat).toBeNull();
  });

  it('returns an all-null series when there are no datasets', () => {
    expect(buildAggregateSeries([], months)).toEqual([
      { time: '2020 7', stat: null },
      { time: '2025 7', stat: null },
      { time: '2025 8', stat: null },
    ]);
  });
});
