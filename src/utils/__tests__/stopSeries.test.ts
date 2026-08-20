import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStopSeriesIndex } from '../stopSeries';
import { makeStopRecord } from '../../test/builders';
import { daysOfWeek } from '../../@types/metrics.types';
import type { StopRecord } from '../../@types/stops.types';

/** Spied rather than replaced, so the figures stay real while the call count stays observable. */
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

  /** A month the stop did not report is a gap, never a zero. */
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

  /** The grain is (stop, line), because a stop-only key would silently merge these two. */
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

  /** It is handed the derivation's axis, so it never decides what is in the window. */
  it('drops a record whose month is not on the axis it was given', () => {
    expect(series(['2025-09']).map((p) => p.boardings)).toEqual([300]);
  });

  it('returns nothing for an empty axis', () => {
    expect(series([])).toEqual([]);
  });

  /** A pair with no records still gets one point per month, so the chart is the right width. */
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

  /** The perf contract: no pair is aligned until something asks for it. */
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
