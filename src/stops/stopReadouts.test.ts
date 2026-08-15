import { describe, it, expect } from 'vitest';
import { buildStopReadouts } from './stopReadouts';
import { makeStopPlace, makeStopRecord } from '../test/builders';
import type { StopPlace } from '../@types/stops.types';

const vermont = makeStopPlace({ key: 'bus:vermont-wilshire' });
const western = makeStopPlace({
  key: 'bus:western-olympic',
  name: 'Western / Olympic',
});
const union = makeStopPlace({
  key: 'rail:union-station',
  name: 'Union Station',
  mode: 'Rail',
  stationOrder: 3,
});

const placesByKey = (...places: StopPlace[]) =>
  new Map(places.map((place) => [place.key, place]));

describe('buildStopReadouts', () => {
  it('produces one readout per (stop, line), not per stop', () => {
    // The grain of the data is stop × line, and there is no rollup across lines. A
    // stop served by two lines is two rows.
    const readouts = buildStopReadouts({
      records: [
        makeStopRecord({ stop_key: 'bus:vermont-wilshire', line_name: 204 }),
        makeStopRecord({ stop_key: 'bus:vermont-wilshire', line_name: 754 }),
      ],
      places: placesByKey(vermont),
      lineIds: [204, 754],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readouts).toHaveLength(2);
    expect(readouts.map((readout) => readout.line_name)).toEqual([204, 754]);
    expect(new Set(readouts.map((readout) => readout.key))).toEqual(
      new Set(['bus:vermont-wilshire']),
    );
  });

  it('joins the Stop Place onto its figures', () => {
    const [readout] = buildStopReadouts({
      records: [makeStopRecord({ wkday_ons: 1000, wkday_offs: 800 })],
      places: placesByKey(vermont),
      lineIds: [204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readout).toMatchObject({
      key: 'bus:vermont-wilshire',
      name: 'Vermont / Wilshire',
      lat: 34.0625,
      mode: 'Bus',
      line_name: 204,
      averageBoardings: 1000,
      averageAlightings: 800,
      netAverage: 200,
      measuredAverage: 1000,
      shareOfLine: 1,
    });
  });

  it('shares sum to 1 across a line', () => {
    const readouts = buildStopReadouts({
      records: [
        makeStopRecord({ stop_key: 'bus:vermont-wilshire', wkday_ons: 750 }),
        makeStopRecord({ stop_key: 'bus:western-olympic', wkday_ons: 250 }),
      ],
      places: placesByKey(vermont, western),
      lineIds: [204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readouts.map((readout) => readout.shareOfLine)).toEqual([
      0.75, 0.25,
    ]);
  });

  it('scopes shares per line, so two lines do not dilute each other', () => {
    const readouts = buildStopReadouts({
      records: [
        makeStopRecord({ line_name: 204, wkday_ons: 1000 }),
        makeStopRecord({
          line_name: 754,
          stop_key: 'bus:western-olympic',
          wkday_ons: 50,
        }),
      ],
      places: placesByKey(vermont, western),
      lineIds: [204, 754],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readouts.map((readout) => readout.shareOfLine)).toEqual([1, 1]);
  });

  it('follows the measure — shares under `offs` are alightings shares', () => {
    const readouts = buildStopReadouts({
      records: [
        makeStopRecord({
          stop_key: 'bus:vermont-wilshire',
          wkday_ons: 900,
          wkday_offs: 100,
        }),
        makeStopRecord({
          stop_key: 'bus:western-olympic',
          wkday_ons: 100,
          wkday_offs: 900,
        }),
      ],
      places: placesByKey(vermont, western),
      lineIds: [204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'offs',
    });

    expect(readouts.map((readout) => readout.measuredAverage)).toEqual([
      100, 900,
    ]);
    expect(readouts.map((readout) => readout.shareOfLine)).toEqual([0.1, 0.9]);
  });

  it('leaves the share undefined when the line total is 0 — 0/0 is not a share', () => {
    const [readout] = buildStopReadouts({
      records: [makeStopRecord({ wkday_ons: 0 })],
      places: placesByKey(vermont),
      lineIds: [204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readout.measuredAverage).toBe(0);
    expect(readout.shareOfLine).toBeUndefined();
  });

  it('orders by the given line order, then by stop key', () => {
    // Deterministic, not ranked. The table sorts; this only has to be stable.
    const readouts = buildStopReadouts({
      records: [
        makeStopRecord({ line_name: 204, stop_key: 'bus:western-olympic' }),
        makeStopRecord({ line_name: 754, stop_key: 'bus:vermont-wilshire' }),
        makeStopRecord({ line_name: 204, stop_key: 'bus:vermont-wilshire' }),
      ],
      places: placesByKey(vermont, western),
      lineIds: [754, 204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(
      readouts.map((readout) => `${readout.line_name} ${readout.key}`),
    ).toEqual([
      '754 bus:vermont-wilshire',
      '204 bus:vermont-wilshire',
      '204 bus:western-olympic',
    ]);
  });

  it('carries the rail station order through without treating it as identity', () => {
    const [readout] = buildStopReadouts({
      records: [
        makeStopRecord({ stop_key: 'rail:union-station', line_name: 802 }),
      ],
      places: placesByKey(union),
      lineIds: [802],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readout).toMatchObject({
      key: 'rail:union-station',
      stationOrder: 3,
    });
  });

  it('falls back to a keyed placeholder when a place is missing', () => {
    const [readout] = buildStopReadouts({
      records: [makeStopRecord({ stop_key: 'bus:unknown-corner' })],
      places: placesByKey(),
      lineIds: [204],
      dayOfWeek: 'est_wkday_ridership',
      measure: 'ons',
    });

    expect(readout).toMatchObject({
      key: 'bus:unknown-corner',
      name: 'bus:unknown-corner',
      lat: null,
      lon: null,
      mode: 'Bus',
    });
  });

  it('returns nothing for no records', () => {
    expect(
      buildStopReadouts({
        records: [],
        places: placesByKey(vermont),
        lineIds: [204],
        dayOfWeek: 'est_wkday_ridership',
        measure: 'ons',
      }),
    ).toEqual([]);
  });
});
