import { describe, it, expect } from 'vitest';
import {
  alignToMonthAxis,
  buildAggregateSeries,
  buildCoverageByLine,
  buildMonthAxis,
  buildWindowMonthAxis,
  formatMonthKey,
  timeKey,
} from '../chartData';
import type {
  ConsolidatedRidership,
  RidershipRecord,
} from '../../@types/metrics.types';

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

describe('timeKey / formatMonthKey', () => {
  it('builds the Chart.js category label the axis has always used', () => {
    expect(timeKey(2025, 9)).toBe('2025 9');
  });

  it('renders a key for display in the same shape as the URL month params', () => {
    expect(formatMonthKey('2025 9')).toBe('2025-09');
    expect(formatMonthKey('2025 12')).toBe('2025-12');
  });
});

describe('buildWindowMonthAxis / buildCoverageByLine', () => {
  // The D Line (805) only reports from 2025-09; the E Line (804) reaches back years.
  // Coverage is read off the records, never off the selected start/end dates — App's
  // date filter is off by one on purpose, so recomputed bounds would disagree with the
  // records already grouped into ConsolidatedRidership.
  const mixedCoverage = (): ConsolidatedRidership => ({
    804: {
      selected: true,
      ridershipRecords: [
        record(2020, 7),
        record(2020, 8),
        record(2025, 9),
        record(2025, 10),
      ],
    },
    805: {
      selected: true,
      ridershipRecords: [record(2025, 9), record(2025, 10)],
    },
  });

  it('spans the union of the months every line reports', () => {
    expect(buildWindowMonthAxis(mixedCoverage())).toEqual([
      '2020 7',
      '2020 8',
      '2025 9',
      '2025 10',
    ]);
  });

  it('returns an empty axis for an empty window', () => {
    expect(buildWindowMonthAxis({})).toEqual([]);
  });

  it('marks a line that starts after the window as partial', () => {
    const coverage = buildCoverageByLine(mixedCoverage());

    expect(coverage[805]).toEqual({
      coveredFrom: '2025-09',
      coveredTo: '2025-10',
      isPartialCoverage: true,
    });
  });

  it('does not mark a line that spans the whole window', () => {
    const coverage = buildCoverageByLine(mixedCoverage());

    expect(coverage[804]).toEqual({
      coveredFrom: '2020-07',
      coveredTo: '2025-10',
      isPartialCoverage: false,
    });
  });

  it('marks a line that ends before the window does', () => {
    const retired = buildCoverageByLine({
      804: {
        selected: true,
        ridershipRecords: [record(2020, 7), record(2025, 9)],
      },
      805: { selected: true, ridershipRecords: [record(2020, 7)] },
    });

    expect(retired[805].isPartialCoverage).toBe(true);
    expect(retired[805].coveredTo).toBe('2020-07');
  });

  it('treats a line covering an interior gap by its endpoints, not its month count', () => {
    // 804 reports 2020-07 and 2025-09 but nothing between; it still starts and ends
    // with the window, so it is not partial — the gap shows up in the sparkline.
    const coverage = buildCoverageByLine({
      804: {
        selected: true,
        ridershipRecords: [record(2020, 7), record(2025, 9)],
      },
      805: {
        selected: true,
        ridershipRecords: [record(2020, 7), record(2022, 3), record(2025, 9)],
      },
    });

    expect(coverage[804].isPartialCoverage).toBe(false);
    expect(coverage[805].isPartialCoverage).toBe(false);
  });

  it('is not partial when every line covers the same single month', () => {
    const coverage = buildCoverageByLine({
      804: { selected: true, ridershipRecords: [record(2026, 3)] },
      805: { selected: true, ridershipRecords: [record(2026, 3)] },
    });

    expect(coverage[804].isPartialCoverage).toBe(false);
    expect(coverage[804].coveredFrom).toBe('2026-03');
    expect(coverage[804].coveredTo).toBe('2026-03');
  });

  it('omits lines with no records rather than reporting an empty range', () => {
    const coverage = buildCoverageByLine({
      804: { selected: true, ridershipRecords: [record(2025, 9)] },
      805: { selected: true, ridershipRecords: [] },
    });

    expect(coverage[805]).toBeUndefined();
    expect(Object.keys(coverage)).toEqual(['804']);
  });

  it('sorts on the month ordinal when deciding the window edges', () => {
    // '2025 10' precedes '2025 9' as a string; a lexicographic span would call the
    // line covering 2025-09..2025-10 partial.
    const coverage = buildCoverageByLine({
      804: {
        selected: true,
        ridershipRecords: [record(2025, 9), record(2025, 10)],
      },
    });

    expect(coverage[804].isPartialCoverage).toBe(false);
    expect(coverage[804].coveredTo).toBe('2025-10');
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
