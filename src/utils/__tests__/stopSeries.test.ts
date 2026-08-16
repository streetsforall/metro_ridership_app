import { describe, it, expect } from 'vitest';
import { buildStopSeries } from '../stopSeries';
import { makeStopRecord } from '../../test/builders';
import { daysOfWeek } from '../../@types/metrics.types';

describe('buildStopSeries', () => {
  const records = [
    makeStopRecord({ year: 2025, month: 7, wkday_ons: 100, wkday_offs: 90 }),
    makeStopRecord({ year: 2025, month: 9, wkday_ons: 300, wkday_offs: 280 }),
  ];

  const build = (months: string[]) =>
    buildStopSeries({
      records,
      months,
      stopKey: 'bus:vermont-wilshire',
      lineId: 204,
      dayOfWeek: daysOfWeek.Weekday,
    });

  it('follows the month axis the derivation produced, in order', () => {
    expect(build(['2025-07', '2025-08', '2025-09']).map((p) => p.month)).toEqual(
      ['2025-07', '2025-08', '2025-09'],
    );
  });

  /**
   * A month the stop did not report is a gap, never a zero — the same rule the chart
   * follows, which is why `spanGaps` is off there and this returns `null` here.
   */
  it('leaves an unreported month null rather than zero', () => {
    const august = build(['2025-07', '2025-08', '2025-09'])[1];
    expect(august.boardings).toBeNull();
    expect(august.alightings).toBeNull();
  });

  it('reads that month’s own boardings and alightings', () => {
    const [july] = build(['2025-07']);
    expect(july.boardings).toBe(100);
    expect(july.alightings).toBe(90);
  });

  it('reads the Day Of Week the caller asked for', () => {
    const [july] = buildStopSeries({
      records,
      months: ['2025-07'],
      stopKey: 'bus:vermont-wilshire',
      lineId: 204,
      dayOfWeek: daysOfWeek.Saturday,
    });
    expect(july.boardings).toBe(600);
    expect(july.alightings).toBe(550);
  });

  it('ignores records belonging to another line at the same stop', () => {
    const [july] = buildStopSeries({
      records: [
        ...records,
        makeStopRecord({ year: 2025, month: 7, line_name: 206, wkday_ons: 9999 }),
      ],
      months: ['2025-07'],
      stopKey: 'bus:vermont-wilshire',
      lineId: 204,
      dayOfWeek: daysOfWeek.Weekday,
    });
    expect(july.boardings).toBe(100);
  });

  it('ignores records belonging to another stop on the same line', () => {
    const [july] = buildStopSeries({
      records: [
        ...records,
        makeStopRecord({
          year: 2025,
          month: 7,
          stop_key: 'bus:elsewhere',
          wkday_ons: 9999,
        }),
      ],
      months: ['2025-07'],
      stopKey: 'bus:vermont-wilshire',
      lineId: 204,
      dayOfWeek: daysOfWeek.Weekday,
    });
    expect(july.boardings).toBe(100);
  });

  /**
   * The one thing this function must not do is decide which months are in the window.
   * It is handed the derivation's own axis, so a record outside it cannot appear no
   * matter what the window is.
   */
  it('drops a record whose month is not on the axis it was given', () => {
    expect(build(['2025-09']).map((p) => p.boardings)).toEqual([300]);
  });

  it('returns nothing for an empty axis', () => {
    expect(build([])).toEqual([]);
  });
});
