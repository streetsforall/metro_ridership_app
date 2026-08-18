import { describe, it, expect } from 'vitest';
import { stopAggregateSeries } from '../stopAggregateSeries';
import type { StopSeriesPoint } from '../stopSeries';

const series = (
  ...points: [string, number | null, number | null][]
): StopSeriesPoint[] =>
  points.map(([month, boardings, alightings]) => ({
    month,
    boardings,
    alightings,
  }));

describe('stopAggregateSeries', () => {
  it('totals every drawn series at each month, on both figures', () => {
    const drawn = [
      { series: series(['2025-07', 100, 90], ['2025-08', 200, 180]) },
      { series: series(['2025-07', 10, 5], ['2025-08', 20, 15]) },
    ];

    expect(stopAggregateSeries(drawn)).toEqual(
      series(['2025-07', 110, 95], ['2025-08', 220, 195]),
    );
  });

  it('lets a stop’s missing month contribute nothing rather than zero', () => {
    const drawn = [
      { series: series(['2025-07', 100, 90]) },
      { series: series(['2025-07', null, null]) },
    ];

    expect(stopAggregateSeries(drawn)).toEqual(series(['2025-07', 100, 90]));
  });

  /**
   * The rule that matters most: one month nobody reported must stay a gap, so the
   * aggregate breaks there rather than plunging to zero and back.
   */
  it('keeps a month no drawn stop reports as a gap', () => {
    const drawn = [
      { series: series(['2025-07', 100, 90], ['2025-08', null, null]) },
      { series: series(['2025-07', 10, 5], ['2025-08', null, null]) },
    ];

    expect(stopAggregateSeries(drawn)[1]).toEqual({
      month: '2025-08',
      boardings: null,
      alightings: null,
    });
  });

  it('sums Boardings and Alightings independently', () => {
    const drawn = [
      { series: series(['2025-07', 100, null]) },
      { series: series(['2025-07', null, 40]) },
    ];

    expect(stopAggregateSeries(drawn)).toEqual(series(['2025-07', 100, 40]));
  });

  it('is empty when nothing is drawn', () => {
    expect(stopAggregateSeries([])).toEqual([]);
  });

  /**
   * A stop served by two selected lines is two drawn series and both are counted. The
   * figure's caption already counts series separately from stops, which is what prepares
   * a reader for a total larger than the stop count suggests.
   */
  it('counts a stop drawn on two lines once per series', () => {
    const drawn = [
      { series: series(['2025-07', 100, 90]) },
      { series: series(['2025-07', 30, 20]) },
    ];

    expect(stopAggregateSeries(drawn)[0].boardings).toBe(130);
  });
});
