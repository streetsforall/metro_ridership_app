import { describe, it, expect } from 'vitest';
// Not decoration: this import is the only thing in the suite that makes
// `stopRidershipPlugin()` load-bearing in `vitest.config.ts`. Without it, deleting the
// plugin from that config leaves the whole suite green and the parallel-registration
// rule silently rots — exactly the way `dataDateRange.ts` pins the ridership plugin's.
import { monthCount } from 'virtual:stop-ridership-manifest';
import {
  attachStopLocations,
  decodeStopRidership,
  modeFromStopKey,
} from '../stopData';
import { makeStopPlace } from '../../test/builders';
import stopLocationsJson from '../../data/stop_locations.json';
import type {
  ColumnarStopRidership,
  StopLocationsFile,
} from '../../@types/stops.types';

/**
 * A payload with the columns in a **deliberately unusual order**.
 *
 * The decoder resolves by name, so this order must not matter — and stating it
 * scrambled is the only way a positional decoder fails the suite instead of passing it
 * and mislabelling alightings as boardings in production.
 */
const payload = (
  overrides: Partial<ColumnarStopRidership> = {},
): ColumnarStopRidership => ({
  schema: 1,
  cols: [
    'su_offs',
    'stop',
    'wd_ons',
    'month',
    'sa_ons',
    'line',
    'wd_offs',
    'year',
    'sa_offs',
    'su_ons',
  ],
  stops: [
    { key: 'bus:vermont-wilshire', name: 'Vermont / Wilshire' },
    { key: 'rail:union-station', name: 'Union Station', station_order: 3 },
  ],
  rows: [
    //su_offs stop wd_ons month sa_ons line wd_offs year sa_offs su_ons
    [350, 0, 1000, 7, 600, 204, 900, 2025, 550, 400],
    [null, 1, 9000, 8, 6000, 802, 8800, 2025, 5900, null],
  ],
  ...overrides,
});

describe('virtual:stop-ridership-manifest', () => {
  it('resolves under the test runner', () => {
    // The assertion that matters is that the import resolved at all. The count itself
    // is deliberately not pinned: it was `0` before the payloads existed — the
    // manifest's documented zero-coverage state — and it grows by one with every month
    // `update_ridership.py` ingests, so pinning it would make a data update fail a
    // client test.
    expect(Number.isInteger(monthCount)).toBe(true);
    expect(monthCount).toBeGreaterThanOrEqual(0);
  });
});

describe('modeFromStopKey', () => {
  it('reads the mode off the key prefix', () => {
    expect(modeFromStopKey('rail:union-station')).toBe('Rail');
    expect(modeFromStopKey('bus:vermont-wilshire')).toBe('Bus');
  });

  it('falls back to Bus for an unrecognised prefix rather than throwing', () => {
    // Mode only chooses a radius domain. A malformed key must not take the panel down.
    expect(modeFromStopKey('vermont-wilshire')).toBe('Bus');
  });
});

describe('decodeStopRidership', () => {
  it('resolves every column by name, not by position', () => {
    const { records } = decodeStopRidership(payload());

    expect(records[0]).toEqual({
      year: 2025,
      month: 7,
      stop_key: 'bus:vermont-wilshire',
      line_name: 204,
      wkday_ons: 1000,
      wkday_offs: 900,
      sat_ons: 600,
      sat_offs: 550,
      sun_ons: 400,
      sun_offs: 350,
    });
  });

  it('resolves the dictionary index to the stop key', () => {
    const { records } = decodeStopRidership(payload());
    expect(records[1].stop_key).toBe('rail:union-station');
  });

  it('preserves nulls — a month a stop did not report is a gap, not a zero', () => {
    const { records } = decodeStopRidership(payload());
    expect(records[1].sun_ons).toBeNull();
    expect(records[1].sun_offs).toBeNull();
  });

  it('returns a geometry-free Stop Place for every dictionary entry', () => {
    const { places } = decodeStopRidership(payload());

    expect(places).toEqual([
      {
        key: 'bus:vermont-wilshire',
        name: 'Vermont / Wilshire',
        lat: null,
        lon: null,
        mode: 'Bus',
        stationOrder: null,
      },
      {
        key: 'rail:union-station',
        name: 'Union Station',
        lat: null,
        lon: null,
        mode: 'Rail',
        stationOrder: 3,
      },
    ]);
  });

  it('keeps a stop the rows never reference', () => {
    // The dictionary is the authority on which stops the payload names. Dropping an
    // unreferenced one would change a line's stop count for no observable reason.
    const { places } = decodeStopRidership(
      payload({
        stops: [
          { key: 'bus:vermont-wilshire', name: 'Vermont / Wilshire' },
          { key: 'rail:union-station', name: 'Union Station' },
          { key: 'bus:western-olympic', name: 'Western / Olympic' },
        ],
      }),
    );
    expect(places.map((place) => place.key)).toContain('bus:western-olympic');
  });

  it('rejects an unrecognised schema instead of guessing', () => {
    expect(() => decodeStopRidership(payload({ schema: 2 }))).toThrow(
      /schema 2, expected 1/,
    );
  });

  it('names the column the pipeline failed to write', () => {
    expect(() =>
      decodeStopRidership(
        payload({ cols: payload().cols.filter((col) => col !== 'wd_offs') }),
      ),
    ).toThrow(/missing the "wd_offs" column/);
  });

  it('throws on a short row rather than reading undefined into a figure', () => {
    // Otherwise the missing slot arrives as `undefined`, `stopMetrics` absorbs it as
    // `?? 0`, and a column of silent zeroes reaches the map.
    expect(() =>
      decodeStopRidership(payload({ rows: [[350, 0, 1000, 7, 600, 204]] })),
    ).toThrow(/has 6 values, expected 10/);
  });

  it('throws on a row pointing outside the dictionary', () => {
    expect(() =>
      decodeStopRidership(
        payload({ rows: [[350, 9, 1000, 7, 600, 204, 900, 2025, 550, 400]] }),
      ),
    ).toThrow(/stop index 9/);
  });
});

/**
 * The committed `stop_locations.json` against the type that describes it.
 *
 * This is the one place the suite reads real data, and it earns it: the file is written
 * by a Python script in another PR, `StopLocationsFile` was declared before that script
 * existed, and nothing else would notice them drifting apart. The assignment on the
 * first line is the actual assertion — it is a compile error if the shape moves, which
 * is how the mismatch this replaced was found.
 *
 * It is safe to import here in a way `stop_ridership.bus.json` would not be: this file
 * is bundled metadata that the map needs in the same tick as the markers, not the
 * multi-megabyte payload fetched at runtime.
 */
describe('the committed stop_locations.json', () => {
  const locations: StopLocationsFile = stopLocationsJson;

  it('gives every located stop a coordinate', () => {
    const entries = Object.values(locations.stops);
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.filter((e) => typeof e.lat !== 'number' || typeof e.lon !== 'number'),
    ).toEqual([]);
  });

  it('never contradicts the key prefix about the mode', () => {
    // `attachStopLocations` deliberately ignores this file's `mode` and keeps the one
    // the key prefix implies, so that a GTFS-derived mode cannot flip a G/J Line BRT
    // stop into the rail radius domain. This asserts the two agree anyway today — if
    // that ever stops being true, the decision to ignore it is what saves the map.
    const disagreements = Object.entries(locations.stops).filter(
      ([key, entry]) =>
        entry.mode !== undefined &&
        entry.mode !== (key.startsWith('rail:') ? 'Rail' : 'Bus'),
    );
    expect(disagreements).toEqual([]);
  });

  it('reports unmatched stops rather than dropping them', () => {
    // A stop with ridership and no geometry still belongs in the table and the series.
    for (const stop of locations.unmatched ?? []) {
      expect(stop.stop_key).toMatch(/^(bus|rail):[a-z0-9-]+$/);
      expect(stop.lines.length).toBeGreaterThan(0);
    }
  });
});

describe('attachStopLocations', () => {
  const places = [
    makeStopPlace({ key: 'bus:vermont-wilshire', lat: null, lon: null }),
    makeStopPlace({
      key: 'rail:union-station',
      name: 'Union Station',
      lat: null,
      lon: null,
      mode: 'Rail',
    }),
  ];

  const locations: StopLocationsFile = {
    stops: {
      'bus:vermont-wilshire': { lat: 34.0625, lon: -118.2914 },
      'bus:not-in-the-payload': { lat: 1, lon: 2 },
    },
  };

  it('overlays the coordinate onto the matching place', () => {
    const joined = attachStopLocations(places, locations);
    expect(joined[0]).toMatchObject({ lat: 34.0625, lon: -118.2914 });
  });

  it('keeps an unmatched stop with a null coordinate rather than dropping it', () => {
    // It still has ridership, so it still belongs in the table and the series. It is
    // absent from the map layer only.
    const joined = attachStopLocations(places, locations);
    expect(joined).toHaveLength(2);
    expect(joined[1]).toMatchObject({ key: 'rail:union-station', lat: null });
  });

  it('ignores a location with no ridership — the payload says which stops exist', () => {
    const joined = attachStopLocations(places, locations);
    expect(joined.map((place) => place.key)).not.toContain(
      'bus:not-in-the-payload',
    );
  });

  it('takes coordinates only — the location file cannot restate the mode', () => {
    // The key prefix is the authority on which export the row arrived in. If GTFS
    // called a G Line BRT stop `Rail`, honouring that would normalise its radius
    // against the rail domain, two orders of magnitude from its real magnitude.
    const joined = attachStopLocations(places, {
      stops: { 'bus:vermont-wilshire': { lat: 1, lon: 2, mode: 'Rail' } },
    });
    expect(joined[0]).toMatchObject({ lat: 1, lon: 2, mode: 'Bus' });
  });

  it('returns copies, leaving the input places untouched', () => {
    const joined = attachStopLocations(places, locations);
    expect(joined[0]).not.toBe(places[0]);
    expect(places[0].lat).toBeNull();
  });

  it('is a no-op when the location file has not loaded', () => {
    expect(attachStopLocations(places, null)).toEqual(places);
  });
});
