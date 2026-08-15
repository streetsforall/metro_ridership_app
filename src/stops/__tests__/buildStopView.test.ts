import { describe, it, expect } from 'vitest';
import { buildStopView, type StopViewInput } from '../buildStopView';
import { isInMonthWindow } from '../../ridership';
import { getLineColor } from '../../utils/lines';
import { makeStopPlace, makeStopRecord } from '../../test/builders';

/** Bounds the way the app builds them: `new Date(year, month - 1)`. */
const bound = (year: number, month: number) => new Date(year, month - 1);

const vermont = makeStopPlace({ key: 'bus:vermont-wilshire' });
const western = makeStopPlace({
  key: 'bus:western-olympic',
  name: 'Western / Olympic',
  lat: 34.0518,
  lon: -118.3089,
});
const union = makeStopPlace({
  key: 'rail:union-station',
  name: 'Union Station',
  mode: 'Rail',
  lat: 34.0561,
  lon: -118.2365,
});
const unlocated = makeStopPlace({
  key: 'bus:no-geometry',
  name: 'Nowhere / Nothing',
  lat: null,
  lon: null,
});

const input = (overrides: Partial<StopViewInput> = {}): StopViewInput => ({
  records: [makeStopRecord()],
  places: [vermont],
  lineIds: [204],
  startDate: bound(2025, 7),
  endDate: bound(2025, 12),
  dayOfWeek: 'est_wkday_ridership',
  measure: 'ons',
  ...overrides,
});

describe('buildStopView', () => {
  it('yields the empty view while records are loading', () => {
    const view = buildStopView(input({ records: null }));

    expect(view).toEqual({
      months: [],
      readouts: [],
      markers: { type: 'FeatureCollection', features: [] },
      coverage: { from: null, to: null, overlapsWindow: false },
    });
  });

  describe('the Month Window', () => {
    /**
     * The predicate is `isInMonthWindow`, imported from `src/ridership`. These cases
     * pin that this module did not restate it — the offset is intended (ADR-0001) and
     * the stop panel has to agree with the chart above it, month for month.
     */
    const across2025 = [7, 8, 9, 10, 11, 12].map((month) =>
      makeStopRecord({ month }),
    );

    it('includes the start month and E - 2, and excludes E - 1 and E', () => {
      const view = buildStopView(
        input({
          records: across2025,
          startDate: bound(2025, 7),
          endDate: bound(2025, 12),
        }),
      );

      expect(view.months).toEqual(['2025-07', '2025-08', '2025-09', '2025-10']);
    });

    it('agrees with `isInMonthWindow` record for record', () => {
      const startDate = bound(2025, 7);
      const endDate = bound(2025, 12);
      const view = buildStopView(
        input({ records: across2025, startDate, endDate }),
      );

      const expected = across2025
        .filter((record) => isInMonthWindow(record, startDate, endDate))
        .map(
          (record) => `${record.year}-${String(record.month).padStart(2, '0')}`,
        );

      expect(view.months).toEqual(expected);
    });
  });

  it('narrows to the given lines', () => {
    const view = buildStopView(
      input({
        records: [
          makeStopRecord({ line_name: 204 }),
          makeStopRecord({ line_name: 754 }),
        ],
        lineIds: [204],
      }),
    );

    expect(view.readouts.map((readout) => readout.line_name)).toEqual([204]);
  });

  it('sorts months as YYYY-MM, which is chronological lexicographically', () => {
    // Unlike the chart's `"2025 9"` time keys, which are not.
    const view = buildStopView(
      input({
        records: [7, 8, 9, 10].map((month) => makeStopRecord({ month })),
      }),
    );
    expect(view.months).toEqual(['2025-07', '2025-08', '2025-09', '2025-10']);
  });

  describe('coverage', () => {
    it('spans the whole payload, before either filter', () => {
      // The banner states what stop data exists, not what the selection shows.
      const view = buildStopView(
        input({
          records: [
            makeStopRecord({ year: 2025, month: 7, line_name: 999 }),
            makeStopRecord({ year: 2026, month: 5, line_name: 999 }),
          ],
          lineIds: [204],
        }),
      );

      expect(view.coverage).toMatchObject({ from: '2025-07', to: '2026-05' });
      expect(view.readouts).toEqual([]);
    });

    it('reports an overlap when any record falls in the window', () => {
      expect(buildStopView(input()).coverage.overlapsWindow).toBe(true);
    });

    it('reports no overlap when the window sits outside the data', () => {
      // §2.7's empty state: stop data exists, just not for the months on screen.
      const view = buildStopView(
        input({ startDate: bound(2019, 1), endDate: bound(2019, 12) }),
      );
      expect(view.coverage).toMatchObject({
        from: '2025-07',
        to: '2025-07',
        overlapsWindow: false,
      });
    });

    it('reports an overlap even when no selected line is in the window', () => {
      // Otherwise the panel would offer to move a window that is already right.
      const view = buildStopView(
        input({ records: [makeStopRecord({ line_name: 999 })] }),
      );
      expect(view.coverage.overlapsWindow).toBe(true);
    });
  });

  describe('markers', () => {
    it('carries everything the layer needs, so no paint expression recomputes', () => {
      const [feature] = buildStopView(input()).markers.features;

      expect(feature).toMatchObject({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-118.2914, 34.0625] },
        properties: {
          stop_key: 'bus:vermont-wilshire',
          line_id: 204,
          name: 'Vermont / Wilshire',
          color: getLineColor(204),
          value: 1000,
        },
      });
    });

    it('puts coordinates in GeoJSON order — [lon, lat]', () => {
      const [feature] = buildStopView(input()).markers.features;
      expect(feature.geometry.coordinates).toEqual([vermont.lon, vermont.lat]);
    });

    it('omits a stop with no geometry, which still has a readout', () => {
      const view = buildStopView(
        input({
          records: [
            makeStopRecord({ stop_key: 'bus:vermont-wilshire' }),
            makeStopRecord({ stop_key: 'bus:no-geometry' }),
          ],
          places: [vermont, unlocated],
        }),
      );

      expect(view.readouts).toHaveLength(2);
      expect(view.markers.features).toHaveLength(1);
      expect(view.markers.features[0].properties.stop_key).toBe(
        'bus:vermont-wilshire',
      );
    });

    it('normalises the radius per mode, so rail does not swamp bus', () => {
      // Rail and bus differ by ~2 orders of magnitude at stop grain. One shared domain
      // makes every bus stop invisible; each mode gets its own maximum instead.
      const view = buildStopView(
        input({
          records: [
            makeStopRecord({
              stop_key: 'bus:vermont-wilshire',
              wkday_ons: 1000,
            }),
            makeStopRecord({
              stop_key: 'rail:union-station',
              line_name: 802,
              wkday_ons: 90000,
            }),
          ],
          places: [vermont, union],
          lineIds: [204, 802],
        }),
      );

      const radii = view.markers.features.map(
        (feature) => feature.properties.radius,
      );
      // Each mode's own maximum draws at the top of the range.
      expect(radii[0]).toBe(radii[1]);
    });

    it('sqrt-scales area, not radius', () => {
      // Three stops pin the whole scale: `0` draws at the floor, `1600` at the ceiling,
      // and `400` — a quarter of the maximum — must land **half way** between them,
      // because a circle's area goes as r². A linear radius scale would put it a
      // quarter of the way up, and a stop with 10× the boardings would look 100×
      // bigger.
      const view = buildStopView(
        input({
          records: [
            makeStopRecord({ stop_key: 'bus:no-geometry', wkday_ons: 0 }),
            makeStopRecord({
              stop_key: 'bus:vermont-wilshire',
              wkday_ons: 400,
            }),
            makeStopRecord({
              stop_key: 'bus:western-olympic',
              wkday_ons: 1600,
            }),
          ],
          // `bus:no-geometry` is located here purely so it reaches the layer and
          // exposes the floor.
          places: [
            makeStopPlace({ key: 'bus:no-geometry', lat: 34, lon: -118 }),
            vermont,
            western,
          ],
        }),
      );

      const radiusOf = new Map(
        view.markers.features.map((feature) => [
          feature.properties.stop_key,
          feature.properties.radius,
        ]),
      );

      const floor = radiusOf.get('bus:no-geometry') as number;
      const ceiling = radiusOf.get('bus:western-olympic') as number;
      const quarter = radiusOf.get('bus:vermont-wilshire') as number;

      expect(quarter).toBeCloseTo(floor + (ceiling - floor) * 0.5, 10);
    });

    it('draws every circle at the floor when a mode reports nothing', () => {
      const view = buildStopView(
        input({
          records: [
            makeStopRecord({ stop_key: 'bus:vermont-wilshire', wkday_ons: 0 }),
            makeStopRecord({ stop_key: 'bus:western-olympic', wkday_ons: 0 }),
          ],
          places: [vermont, western],
        }),
      );

      const radii = view.markers.features.map(
        (feature) => feature.properties.radius,
      );
      expect(radii[0]).toBe(radii[1]);
      expect(radii[0]).toBeGreaterThan(0);
    });

    it('follows the measure', () => {
      const records = [makeStopRecord({ wkday_ons: 1000, wkday_offs: 250 })];
      const ons = buildStopView(input({ records, measure: 'ons' }));
      const offs = buildStopView(input({ records, measure: 'offs' }));
      const both = buildStopView(input({ records, measure: 'both' }));

      expect(ons.markers.features[0].properties.value).toBe(1000);
      expect(offs.markers.features[0].properties.value).toBe(250);
      expect(both.markers.features[0].properties.value).toBe(1250);
    });

    it('is an empty FeatureCollection when nothing is selected', () => {
      const view = buildStopView(input({ lineIds: [] }));
      expect(view.markers).toEqual({
        type: 'FeatureCollection',
        features: [],
      });
    });
  });

  it('does not mutate the records it is handed', () => {
    const records = [
      makeStopRecord({ month: 10 }),
      makeStopRecord({ month: 7 }),
    ];
    buildStopView(input({ records }));
    expect(records.map((record) => record.month)).toEqual([10, 7]);
  });
});
