import { describe, it, expect } from 'vitest';
import {
  getLineColor,
  getLineNames,
  lineNameSortFunction,
  generateCSV,
  listedReadouts,
} from '../lines';
import type { ConsolidatedRidership } from '../../@types/metrics.types';
import type { LineReadout } from '../../ridership';
import {
  makeConsolidatedRidership,
  makeLine,
  makeRidershipRecord,
} from '../../test/builders';

describe('getLineColor', () => {
  it('returns the defined color for the A Line (801)', () => {
    expect(getLineColor(801)).toBe('#0072bc');
  });

  it('returns the defined color for the B Line (802)', () => {
    expect(getLineColor(802)).toBe('#eb131b');
  });

  it('returns the defined color for the C Line (803)', () => {
    expect(getLineColor(803)).toBe('#58a738');
  });

  it('returns the defined color for the K Line (807)', () => {
    expect(getLineColor(807)).toBe('#e56db1');
  });

  it('returns an HSL color string for an unknown bus line number', () => {
    expect(getLineColor(99999)).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  it('always returns a string (never undefined)', () => {
    expect(typeof getLineColor(0)).toBe('string');
    expect(typeof getLineColor(1)).toBe('string');
    expect(typeof getLineColor(99999)).toBe('string');
  });

  it('returns the same color for the same bus line on repeated calls', () => {
    expect(getLineColor(100)).toBe(getLineColor(100));
    expect(getLineColor(200)).toBe(getLineColor(200));
  });

  it('returns different colors for different bus line numbers', () => {
    expect(getLineColor(100)).not.toBe(getLineColor(101));
  });
});

describe('getLineNames', () => {
  it('returns a lettered current name for the A Line (801)', () => {
    expect(getLineNames(801).current).toBe('A Line');
  });

  it('returns a former name for lines that have one', () => {
    expect(getLineNames(801).former).toBe('Blue Line');
    expect(getLineNames(802).former).toBe('Red Line');
    expect(getLineNames(804).former).toBe('Expo Line');
  });

  it('does not include a former name for lines without one (807 K Line)', () => {
    expect(getLineNames(807).former).toBeUndefined();
  });

  it('returns "Line N" for unknown line numbers', () => {
    expect(getLineNames(99999).current).toBe('Line 99999');
  });

  it('does not include a former name for unknown lines', () => {
    expect(getLineNames(99999).former).toBeUndefined();
  });

  it('returns correct letter for each defined line', () => {
    expect(getLineNames(802).current).toBe('B Line');
    expect(getLineNames(803).current).toBe('C Line');
    expect(getLineNames(805).current).toBe('D Line');
    expect(getLineNames(804).current).toBe('E Line');
    expect(getLineNames(806).current).toBe('L Line');
    expect(getLineNames(807).current).toBe('K Line');
    expect(getLineNames(901).current).toBe('G Line');
    expect(getLineNames(910).current).toBe('J Line');
  });
});

describe('lineNameSortFunction', () => {
  it('places lettered lines before numbered lines', () => {
    const lettered = makeLine({ name: 'A Line' });
    const numbered = makeLine({ name: 'Line 2' });
    expect(lineNameSortFunction(lettered, numbered)).toBeLessThan(0);
  });

  it('places numbered lines after lettered lines', () => {
    const numbered = makeLine({ name: 'Line 2' });
    const lettered = makeLine({ name: 'A Line' });
    expect(lineNameSortFunction(numbered, lettered)).toBeGreaterThan(0);
  });

  it('sorts numbered lines numerically (not lexicographically)', () => {
    const line2 = makeLine({ id: 2, name: 'Line 2' });
    const line10 = makeLine({ id: 10, name: 'Line 10' });
    expect(lineNameSortFunction(line2, line10)).toBeLessThan(0);
  });

  it('sorts lettered lines alphabetically', () => {
    const a = makeLine({ name: 'A Line' });
    const b = makeLine({ name: 'B Line' });
    expect(lineNameSortFunction(a, b)).toBeLessThan(0);
    expect(lineNameSortFunction(b, a)).toBeGreaterThan(0);
  });

  it('returns 0 for equal names', () => {
    const a = makeLine({ name: 'A Line' });
    const b = makeLine({ name: 'A Line' });
    expect(lineNameSortFunction(a, b)).toBe(0);
  });

  it('two numbered lines maintain correct numerical order', () => {
    const line5 = makeLine({ id: 5, name: 'Line 5' });
    const line20 = makeLine({ id: 20, name: 'Line 20' });
    expect(lineNameSortFunction(line5, line20)).toBeLessThan(0);
  });
});

describe('generateCSV', () => {
  it('returns a data URI string', () => {
    const csv = generateCSV({});
    expect(csv.startsWith('data:text/csv;charset=utf-8,')).toBe(true);
  });

  it('includes CSV column headers', () => {
    const csv = decodeURI(generateCSV({}));
    expect(csv).toContain(
      'line_name,year,month,est_wkday_ridership,est_sat_ridership,est_sun_ridership',
    );
  });

  it('includes rows for selected lines', () => {
    const ridership: ConsolidatedRidership = makeConsolidatedRidership(
      801,
      [
        makeRidershipRecord({
          est_wkday_ridership: 5000,
          est_sat_ridership: 3000,
          est_sun_ridership: 2000,
        }),
      ],
      { selected: true },
    );
    const csv = decodeURI(generateCSV(ridership));
    expect(csv).toContain('A Line');
    expect(csv).toContain('2022');
    expect(csv).toContain('5000');
  });

  it('excludes rows for unselected lines', () => {
    const ridership: ConsolidatedRidership = makeConsolidatedRidership(801, [
      makeRidershipRecord({
        est_wkday_ridership: 5000,
        est_sat_ridership: 3000,
        est_sun_ridership: 2000,
      }),
    ]);
    const csv = decodeURI(generateCSV(ridership));
    expect(csv).not.toContain('5000');
  });

  it('uses the friendly line name in the CSV row', () => {
    const ridership: ConsolidatedRidership = makeConsolidatedRidership(
      802,
      [
        makeRidershipRecord({
          year: 2023,
          month: 6,
          line_name: 802,
          est_wkday_ridership: 12000,
          est_sat_ridership: 8000,
          est_sun_ridership: 6000,
        }),
      ],
      { selected: true },
    );
    const csv = decodeURI(generateCSV(ridership));
    expect(csv).toContain('B Line');
    expect(csv).not.toContain('802');
  });

  it('includes multiple records for the same line', () => {
    const ridership: ConsolidatedRidership = makeConsolidatedRidership(
      801,
      [
        makeRidershipRecord({
          month: 1,
          est_wkday_ridership: 1000,
          est_sat_ridership: null,
          est_sun_ridership: null,
        }),
        makeRidershipRecord({
          month: 2,
          est_wkday_ridership: 2000,
          est_sat_ridership: null,
          est_sun_ridership: null,
        }),
      ],
      { selected: true },
    );
    const csv = decodeURI(generateCSV(ridership));
    expect(csv).toContain('1000');
    expect(csv).toContain('2000');
  });

  it('returns only headers for an empty ridership object', () => {
    const csv = decodeURI(generateCSV({}));
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1); // just the header line
  });
});

describe('listedReadouts', () => {
  const figures = {
    averageRidership: 1000,
    changeInRidership: 200,
    startingRidership: 900,
    endingRidership: 1100,
    ridersPerMile: 50,
  };

  const railWithFigures: LineReadout = {
    ...makeLine({ id: 801, name: 'A Line', mode: 'Rail' }),
    ...figures,
  };

  const busWithFigures: LineReadout = {
    ...makeLine({ id: 2, name: 'Line 2', mode: 'Bus' }),
    ...figures,
  };

  const bothModes = ['bus', 'train'];

  it('drops a Bus line when modes excludes "bus"', () => {
    const listed = listedReadouts({
      readouts: [busWithFigures, railWithFigures],
      searchText: '',
      modes: ['train'],
    });

    expect(listed.map((readout) => readout.id)).toEqual([801]);
  });

  it('drops a Rail line when modes excludes "train"', () => {
    const listed = listedReadouts({
      readouts: [busWithFigures, railWithFigures],
      searchText: '',
      modes: ['bus'],
    });

    expect(listed.map((readout) => readout.id)).toEqual([2]);
  });

  it('lists both modes when both are switched on', () => {
    const listed = listedReadouts({
      readouts: [busWithFigures, railWithFigures],
      searchText: '',
      modes: bothModes,
    });

    expect(listed.map((readout) => readout.id)).toEqual([2, 801]);
  });

  it('lists nothing when no mode is switched on', () => {
    expect(
      listedReadouts({
        readouts: [busWithFigures, railWithFigures],
        searchText: '',
        modes: [],
      }),
    ).toEqual([]);
  });

  it('changes the listed set when modes changes', () => {
    const readouts = [busWithFigures, railWithFigures];

    expect(
      listedReadouts({ readouts, searchText: '', modes: bothModes }),
    ).toHaveLength(2);
    expect(
      listedReadouts({ readouts, searchText: '', modes: ['train'] }),
    ).toHaveLength(1);
  });

  it('lists a line whose change is exactly 0', () => {
    // `lineMetrics` yields changeInRidership 0 for a single record, so a truthy
    // check emptied the whole table for any single-month window (PR #93).
    const zeroChange: LineReadout = {
      ...railWithFigures,
      changeInRidership: 0,
    };

    expect(
      listedReadouts({
        readouts: [zeroChange],
        searchText: '',
        modes: bothModes,
      }),
    ).toHaveLength(1);
  });

  it('lists a line whose average ridership is 0', () => {
    const zeroAverage: LineReadout = {
      ...railWithFigures,
      averageRidership: 0,
    };

    expect(
      listedReadouts({
        readouts: [zeroAverage],
        searchText: '',
        modes: bothModes,
      }),
    ).toHaveLength(1);
  });

  it('does not list a line with no figures at all', () => {
    // A line with no records in the Month Window gets no figure keys, so it is
    // absent from the table rather than shown with blanks.
    const noFigures: LineReadout = makeLine({ id: 801, mode: 'Rail' });

    expect(
      listedReadouts({
        readouts: [noFigures],
        searchText: '',
        modes: bothModes,
      }),
    ).toEqual([]);
  });

  it('does not list a line carrying only an average', () => {
    const halfFigures: LineReadout = {
      ...makeLine({ id: 801, mode: 'Rail' }),
      averageRidership: 1000,
    };

    expect(
      listedReadouts({
        readouts: [halfFigures],
        searchText: '',
        modes: bothModes,
      }),
    ).toEqual([]);
  });

  it('does not list a line whose mode is switched off even with figures', () => {
    expect(
      listedReadouts({
        readouts: [railWithFigures],
        searchText: '',
        modes: ['bus'],
      }),
    ).toEqual([]);
  });

  it('matches the search text case-insensitively', () => {
    expect(
      listedReadouts({
        readouts: [busWithFigures, railWithFigures],
        searchText: 'a lIne',
        modes: bothModes,
      }).map((readout) => readout.id),
    ).toEqual([801]);
  });

  it('lists nothing when the search text matches no name', () => {
    expect(
      listedReadouts({
        readouts: [busWithFigures, railWithFigures],
        searchText: 'zzz',
        modes: bothModes,
      }),
    ).toEqual([]);
  });

  it('filters nothing on an empty search text', () => {
    expect(
      listedReadouts({
        readouts: [busWithFigures, railWithFigures],
        searchText: '',
        modes: bothModes,
      }),
    ).toHaveLength(2);
  });

  it('preserves the order of readouts', () => {
    const other: LineReadout = {
      ...makeLine({ id: 10, name: 'Line 10', mode: 'Bus' }),
      ...figures,
    };
    const listed = listedReadouts({
      readouts: [railWithFigures, other, busWithFigures],
      searchText: '',
      modes: bothModes,
    });

    expect(listed.map((readout) => readout.id)).toEqual([801, 10, 2]);
  });

  it('does not mutate the readouts it is given', () => {
    const readouts = [busWithFigures, railWithFigures];
    const snapshot = readouts.map((readout) => ({ ...readout }));

    listedReadouts({ readouts, searchText: 'a line', modes: ['train'] });

    expect(readouts).toEqual(snapshot);
  });
});
