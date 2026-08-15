import { describe, it, expect } from 'vitest';
import { measuredAverage, stopMetrics } from '../stopMetrics';
import { makeStopRecord } from '../../test/builders';

describe('stopMetrics', () => {
  it('returns null for an empty series — no records means no metrics, not zeroes', () => {
    // ADR-0004's contract, at stop grain. `0` is indistinguishable from a real figure,
    // and a stop that reported nothing did not report nobody.
    expect(
      stopMetrics({ records: [], dayOfWeek: 'est_wkday_ridership' }),
    ).toBeNull();
  });

  it('averages boardings and alightings over the reported months', () => {
    const metrics = stopMetrics({
      records: [
        makeStopRecord({ month: 7, wkday_ons: 1000, wkday_offs: 900 }),
        makeStopRecord({ month: 8, wkday_ons: 1400, wkday_offs: 1100 }),
      ],
      dayOfWeek: 'est_wkday_ridership',
    });

    expect(metrics).toEqual({
      averageBoardings: 1200,
      averageAlightings: 1000,
      netAverage: 200,
      monthsReported: 2,
    });
  });

  it('divides by the record count, so a null month counts as 0', () => {
    // Lifted verbatim from `lineMetrics`. The two grains must average the same way, or
    // the ranked table and the line table describe the same window differently.
    const metrics = stopMetrics({
      records: [
        makeStopRecord({ month: 7, wkday_ons: 1000, wkday_offs: 800 }),
        makeStopRecord({ month: 8, wkday_ons: null, wkday_offs: null }),
      ],
      dayOfWeek: 'est_wkday_ridership',
    });

    expect(metrics?.averageBoardings).toBe(500);
    expect(metrics?.monthsReported).toBe(2);
  });

  it('reads the pair of columns the Day Of Week selects', () => {
    const records = [
      makeStopRecord({
        wkday_ons: 1000,
        wkday_offs: 900,
        sat_ons: 600,
        sat_offs: 550,
        sun_ons: 400,
        sun_offs: 350,
      }),
    ];

    expect(
      stopMetrics({ records, dayOfWeek: 'est_sat_ridership' }),
    ).toMatchObject({ averageBoardings: 600, averageAlightings: 550 });
    expect(
      stopMetrics({ records, dayOfWeek: 'est_sun_ridership' }),
    ).toMatchObject({ averageBoardings: 400, averageAlightings: 350 });
  });

  it('reports a negative net where more riders alight than board', () => {
    // Most of downtown, most mornings. Information, not an error.
    const metrics = stopMetrics({
      records: [makeStopRecord({ wkday_ons: 200, wkday_offs: 1800 })],
      dayOfWeek: 'est_wkday_ridership',
    });
    expect(metrics?.netAverage).toBe(-1600);
  });

  it('averages over the stop’s own months, not the window’s', () => {
    // The same "label, don't redefine" policy Line Metrics follow: a stop that appears
    // halfway through the window averages over the months it actually reports.
    const metrics = stopMetrics({
      records: [makeStopRecord({ month: 12, wkday_ons: 900, wkday_offs: 900 })],
      dayOfWeek: 'est_wkday_ridership',
    });
    expect(metrics).toMatchObject({ averageBoardings: 900, monthsReported: 1 });
  });

  it('does not mutate the records it is handed', () => {
    const records = [
      makeStopRecord({ month: 8 }),
      makeStopRecord({ month: 7 }),
    ];
    stopMetrics({ records, dayOfWeek: 'est_wkday_ridership' });
    expect(records.map((record) => record.month)).toEqual([8, 7]);
  });
});

describe('measuredAverage', () => {
  const metrics = {
    averageBoardings: 1000,
    averageAlightings: 400,
    netAverage: 600,
    monthsReported: 3,
  };

  it('selects boardings, alightings or their sum', () => {
    expect(measuredAverage(metrics, 'ons')).toBe(1000);
    expect(measuredAverage(metrics, 'offs')).toBe(400);
    expect(measuredAverage(metrics, 'both')).toBe(1400);
  });
});
