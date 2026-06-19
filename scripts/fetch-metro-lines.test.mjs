import { describe, it, expect } from 'vitest';
import { splitCSVLine, parseCSV, busLineColor } from './fetch-metro-lines.mjs';

describe('splitCSVLine', () => {
  it('splits simple comma-separated fields', () => {
    expect(splitCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace from fields', () => {
    expect(splitCSVLine('a, b , c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quoted fields', () => {
    expect(splitCSVLine('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  it('handles multiple quoted fields', () => {
    expect(splitCSVLine('"a,b","c,d"')).toEqual(['a,b', 'c,d']);
  });

  it('handles an empty field at the end', () => {
    expect(splitCSVLine('a,b,')).toEqual(['a', 'b', '']);
  });

  it('handles a single field', () => {
    expect(splitCSVLine('only')).toEqual(['only']);
  });

  it('handles a fully empty string', () => {
    expect(splitCSVLine('')).toEqual(['']);
  });
});

describe('parseCSV', () => {
  it('returns an empty array for empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('returns an empty array for headers-only input', () => {
    expect(parseCSV('id,name')).toEqual([]);
  });

  it('maps each row to an object keyed by header', () => {
    const csv = 'id,name\n1,Alice\n2,Bob';
    expect(parseCSV(csv)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('normalizes Windows line endings (\\r\\n)', () => {
    const csv = 'id,name\r\n1,Alice\r\n2,Bob';
    expect(parseCSV(csv)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'route_id,route_long_name\n801,"Metro A Line, Blue"';
    expect(parseCSV(csv)).toEqual([
      { route_id: '801', route_long_name: 'Metro A Line, Blue' },
    ]);
  });

  it('fills missing trailing fields with empty string', () => {
    const csv = 'a,b,c\n1,2';
    expect(parseCSV(csv)).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('skips blank lines', () => {
    const csv = 'id,name\n1,Alice\n\n2,Bob';
    expect(parseCSV(csv)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });
});

describe('busLineColor', () => {
  it('returns an hsl() string', () => {
    expect(busLineColor(1)).toMatch(/^hsl\(\d+, 75%, 45%\)$/);
  });

  it('is deterministic for the same input', () => {
    expect(busLineColor(42)).toBe(busLineColor(42));
  });

  it('returns different colors for different line IDs', () => {
    expect(busLineColor(1)).not.toBe(busLineColor(2));
  });

  it('hue stays within [0, 359]', () => {
    for (const id of [1, 2, 10, 100, 500, 999]) {
      const match = busLineColor(id).match(/^hsl\((\d+),/);
      const hue = parseInt(match[1], 10);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('computes the correct hue via the golden-angle formula', () => {
    // hue = Math.round((lineId * 137.508) % 360)
    const id = 5;
    const expectedHue = Math.round((id * 137.508) % 360);
    expect(busLineColor(id)).toBe(`hsl(${expectedHue}, 75%, 45%)`);
  });
});
