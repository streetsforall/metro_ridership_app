import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStopSeriesIndex } from '../stopSeries';
import { makeStopRecord } from '../../test/builders';
import { daysOfWeek } from '../../@types/metrics.types';
import type { StopRecord } from '../../@types/stops.types';

/**
 * The seam is spied rather than replaced, so the figures stay real while the number of
 * calls stays observable — the deferred alignment below is a perf contract, and a
 * contract nothing checks is one someone will optimise away.
 */
const { metricsSpy } = vi.hoisted(() => ({ metricsSpy: vi.fn() }));

vi.mock('../../stops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stops')>();
  return {
    ...actual,
    stopMetrics: (input: Parameters<typeof actual.stopMetrics>[0]) => {
      metricsSpy(input);
      return actual.stopMetrics(input);
    },
  };
});

beforeEach(() => {
  metricsSpy.mockClear();
});

describe('buildStopSeriesIndex', () => {
  const records = [
    makeStopRecord({ year: 2025, month: 7, wkday_ons: 100, wkday_offs: 90 }),
    makeStopRecord({ year: 2025, month: 9, wkday_ons: 300, wkday_offs: 280 }),
  ];

  const build = (months: string[], extra: StopRecord[] = []) =>
    buildStopSeriesIndex({
      records: [...records, ...extra],
      months,
      dayOfWeek: daysOfWeek.Weekday,
    });

  const series = (months: string[], extra: StopRecord[] = []) =>
    build(months, extra).seriesFor('bus:vermont-wilshire', 204);

  it('follows the month axis the derivation produced, in order', () => {
    expect(
      series(['2025-07', '2025-08', '2025-09']).map((p) => p.month),
    ).toEqual(['2025-07', '2025-08', '2025-09']);
  });

  /**
   * A month the stop did not report is a gap, never a zero — the same rule the chart
   * follows, which is why `spanGaps` is off there and this returns `null` here.
   */
  it('leaves an unreported month null rather than zero', () => {
    const august = series(['2025-07', '2025-08', '2025-09'])[1];
    expect(august.boardings).toBeNull();
    expect(august.alightings).toBeNull();
  });

  it('reads that month’s own boardings and alightings', () => {
    const [july] = series(['2025-07']);
    expect(july.boardings).toBe(100);
    expect(july.alightings).toBe(90);
  });

  it('reads the Day Of Week the caller asked for', () => {
    const [july] = buildStopSeriesIndex({
      records,
      months: ['2025-07'],
      dayOfWeek: daysOfWeek.Saturday,
    }).seriesFor('bus:vermont-wilshire', 204);

    expect(july.boardings).toBe(600);
    expect(july.alightings).toBe(550);
  });

  /**
   * The grain is (stop, line), not stop. A flat index keyed by stop key alone would
   * silently merge these two — the bug this test exists to prevent.
   */
  it('keeps two lines at the same stop apart', () => {
    const index = build(['2025-07'], [
      makeStopRecord({ year: 2025, month: 7, line_name: 206, wkday_ons: 9999 }),
    ]);

    expect(index.seriesFor('bus:vermont-wilshire', 204)[0].boardings).toBe(100);
    expect(index.seriesFor('bus:vermont-wilshire', 206)[0].boardings).toBe(9999);
  });

  it('keeps two stops on the same line apart', () => {
    const index = build(['2025-07'], [
      makeStopRecord({
        year: 2025,
        month: 7,
        stop_key: 'bus:elsewhere',
        wkday_ons: 9999,
      }),
    ]);

    expect(index.seriesFor('bus:vermont-wilshire', 204)[0].boardings).toBe(100);
    expect(index.seriesFor('bus:elsewhere', 204)[0].boardings).toBe(9999);
  });

  /**
   * The one thing this must not do is decide which months are in the window. It is
   * handed the derivation's own axis, so a record outside it cannot appear no matter
   * what the window is.
   */
  it('drops a record whose month is not on the axis it was given', () => {
    expect(series(['2025-09']).map((p) => p.boardings)).toEqual([300]);
  });

  it('returns nothing for an empty axis', () => {
    expect(series([])).toEqual([]);
  });

  /**
   * A pair with no records still gets one point per month. A caller drawing it gets an
   * empty chart of the right width rather than a chart of the wrong width.
   */
  it('gives an unknown pair a full-length, all-null series', () => {
    const points = build(['2025-07', '2025-08']).seriesFor('bus:nowhere', 999);

    expect(points).toHaveLength(2);
    expect(points.every((p) => p.boardings === null)).toBe(true);
  });

  it('hands back the identical array on a repeat ask', () => {
    const index = build(['2025-07']);
    expect(index.seriesFor('bus:vermont-wilshire', 204)).toBe(
      index.seriesFor('bus:vermont-wilshire', 204),
    );
  });

  /**
   * The perf contract. Grouping is one cheap pass; aligning every pair up front would
   * do a `stopMetrics` call per month for ~800 rows nobody has scrolled to yet.
   */
  it('does no per-stop work until a series is asked for', () => {
    build(['2025-07', '2025-08', '2025-09']);
    expect(metricsSpy).not.toHaveBeenCalled();
  });

  it('aligns a pair once however often it is asked for', () => {
    const index = build(['2025-07', '2025-08', '2025-09']);

    index.seriesFor('bus:vermont-wilshire', 204);
    const afterFirst = metricsSpy.mock.calls.length;
    index.seriesFor('bus:vermont-wilshire', 204);

    // Only the months that actually have a record cost a call, and never twice.
    expect(afterFirst).toBeLessThanOrEqual(3);
    expect(metricsSpy.mock.calls.length).toBe(afterFirst);
  });
});
