import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { haversineDistance, multiLineStringDistance, isRoundTrip } from './compute-line-distances.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const geojson = JSON.parse(readFileSync(resolve(__dirname, '../public/metro_lines.geojson'), 'utf8'));

function computeLineMiles(lineId) {
  const feature = geojson.features.find((f) => f.properties.line_id === lineId);
  const coords = feature.geometry.coordinates;
  const miles = multiLineStringDistance(isRoundTrip(coords) ? [coords[0]] : coords);
  return Math.round(miles * 10) / 10;
}

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
    expect(haversineDistance(-118.2, 34.05, -118.2, 34.05)).toBe(0);
  });

  it('approximates 1 degree of latitude as ~69 miles', () => {
    expect(haversineDistance(0, 0, 0, 1)).toBeCloseTo(69.09, 0);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(-73.9857, 40.7484, -118.2437, 34.0522);
    const d2 = haversineDistance(-118.2437, 34.0522, -73.9857, 40.7484);
    expect(d1).toBeCloseTo(d2, 8);
  });

  it('returns a cross-country distance in the expected range', () => {
    // NYC to LA is approximately 2,445 miles by great circle
    const d = haversineDistance(-73.9857, 40.7484, -118.2437, 34.0522);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });
});

describe('multiLineStringDistance', () => {
  it('returns 0 for empty coordinates', () => {
    expect(multiLineStringDistance([])).toBe(0);
  });

  it('returns 0 for a single-point lineString', () => {
    expect(multiLineStringDistance([[[0, 0]]])).toBe(0);
  });

  it('equals haversineDistance for a single segment', () => {
    const coords = [[[0, 0], [0, 1]]];
    expect(multiLineStringDistance(coords)).toBeCloseTo(haversineDistance(0, 0, 0, 1), 8);
  });

  it('sums consecutive segments within a lineString', () => {
    const coords = [[[0, 0], [0, 1], [0, 2]]];
    const expected = haversineDistance(0, 0, 0, 1) + haversineDistance(0, 1, 0, 2);
    expect(multiLineStringDistance(coords)).toBeCloseTo(expected, 8);
  });

  it('sums distances across multiple lineStrings', () => {
    const coords = [[[0, 0], [0, 1]], [[10, 10], [10, 11]]];
    const expected = haversineDistance(0, 0, 0, 1) + haversineDistance(10, 10, 10, 11);
    expect(multiLineStringDistance(coords)).toBeCloseTo(expected, 8);
  });

  it('skips segments between separate lineStrings (no phantom segment)', () => {
    // End of first lineString and start of second should NOT be connected
    const twoSeparate = [[[0, 0], [0, 1]], [[100, 0], [100, 1]]];
    const joined = [[[0, 0], [0, 1], [100, 0], [100, 1]]];
    expect(multiLineStringDistance(twoSeparate)).toBeLessThan(multiLineStringDistance(joined));
  });
});

describe('isRoundTrip', () => {
  it('returns true when the second lineString starts at the endpoint of the first', () => {
    // Outbound A→B then inbound B→A: second starts at B (where first ended)
    const outbound = [[0, 0], [0, 1], [0, 2]];
    const inbound  = [[0, 2], [0, 1], [0, 0]];
    expect(isRoundTrip([outbound, inbound])).toBe(true);
  });

  it('returns false for a single lineString', () => {
    expect(isRoundTrip([[[0, 0], [0, 1]]])).toBe(false);
  });

  it('returns false for three or more lineStrings', () => {
    const ls = [[0, 0], [0, 1]];
    expect(isRoundTrip([ls, ls, ls])).toBe(false);
  });

  it('returns false when the second lineString starts at a different point', () => {
    const ls0 = [[0, 0], [0, 1]];
    const ls1 = [[10, 10], [10, 11]]; // starts somewhere else
    expect(isRoundTrip([ls0, ls1])).toBe(false);
  });

  it('tolerates endpoint imprecision up to 0.001 degrees (~111 m)', () => {
    // Real GeoJSON data has endpoints offset by up to ~0.0002° at line junctions
    const ls0 = [[0, 0], [-118.378153841, 34.1708482878]];
    const ls1 = [[-118.378268605, 34.1708004635], [0, 0]]; // 0.000115° lon, 0.000048° lat apart
    expect(isRoundTrip([ls0, ls1])).toBe(true);
  });

  it('returns false when endpoints are more than 0.001 degrees apart', () => {
    const ls0 = [[0, 0], [0, 1]];
    const ls1 = [[0, 1.002], [0, 0]]; // 0.002° apart — clearly separate
    expect(isRoundTrip([ls0, ls1])).toBe(false);
  });
});

// Bus lines have a single lineString, so isRoundTrip returns false and the full
// route is summed without any deduplication.
describe('bus line distances from GeoJSON', () => {
  it('Line 2 is ~20.6 mi', () => {
    expect(computeLineMiles(2)).toBe(20.6);
  });

  it('Line 4 is ~21.8 mi', () => {
    expect(computeLineMiles(4)).toBe(21.8);
  });

  it('Line 14 is ~16.8 mi', () => {
    expect(computeLineMiles(14)).toBe(16.8);
  });

  it('bus lines are not detected as round trips', () => {
    for (const id of [2, 4, 14]) {
      const feature = geojson.features.find((f) => f.properties.line_id === id);
      expect(isRoundTrip(feature.geometry.coordinates), `line ${id}`).toBe(false);
    }
  });
});

// Each Metro Rail line has two lineStrings (outbound + inbound). The expected
// values below are one-way distances; without the isRoundTrip guard they would
// be doubled (e.g. A Line would read 115.5 mi instead of 57.8 mi).
describe('metro rail line distances from GeoJSON', () => {
  it('A Line (801) is ~57.8 mi one-way', () => {
    expect(computeLineMiles(801)).toBe(57.8);
  });

  it('B Line (802) is ~15.7 mi one-way', () => {
    expect(computeLineMiles(802)).toBe(15.7);
  });

  it('C Line (803) is ~17.7 mi one-way', () => {
    expect(computeLineMiles(803)).toBe(17.7);
  });

  it('E Line (804) is ~22 mi one-way', () => {
    expect(computeLineMiles(804)).toBe(22);
  });

  it('K Line (805) is ~9.7 mi one-way', () => {
    expect(computeLineMiles(805)).toBe(9.7);
  });

  it('L Line (807) is ~11.6 mi one-way', () => {
    expect(computeLineMiles(807)).toBe(11.6);
  });

  it('all six rail lines are detected as round trips', () => {
    for (const id of [801, 802, 803, 804, 805, 807]) {
      const feature = geojson.features.find((f) => f.properties.line_id === id);
      expect(isRoundTrip(feature.geometry.coordinates), `line ${id}`).toBe(true);
    }
  });
});

describe('round-trip double-counting guard', () => {
  it('counts each direction once when combined with isRoundTrip detection', () => {
    // Simulate a bidirectional line: outbound [A→B] + inbound [B→A]
    const outbound = [[0, 0], [0, 1]];
    const inbound  = [[0, 1], [0, 0]];
    const coords = [outbound, inbound];

    const oneWay = multiLineStringDistance([coords[0]]);
    const withGuard = multiLineStringDistance(isRoundTrip(coords) ? [coords[0]] : coords);
    const withoutGuard = multiLineStringDistance(coords);

    expect(withGuard).toBeCloseTo(oneWay, 8);
    expect(withoutGuard).toBeCloseTo(oneWay * 2, 8);
  });
});
