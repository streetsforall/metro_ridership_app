import { describe, it, expect } from 'vitest';
import { haversineDistance, multiLineStringDistance, isRoundTrip } from './compute-line-distances.mjs';

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

  it('tolerates floating-point imprecision within 0.0001 degrees', () => {
    const ls0 = [[0, 0], [0, 1.0000001]];
    const ls1 = [[0, 1.0000009], [0, 0]]; // within tolerance
    expect(isRoundTrip([ls0, ls1])).toBe(true);
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
