import { describe, it, expect } from 'vitest';
import { buildLineReadouts } from './lineReadouts';
import type { LineMetrics } from './lineMetrics';
import type { LineCoverage } from './chartData';
import { makeLine } from '../test/builders';

const metrics801: LineMetrics = {
  averageRidership: 1000,
  changeInRidership: 200,
  startingRidership: 900,
  endingRidership: 1100,
  ridersPerMile: 50,
};

const coverage801: LineCoverage = {
  coveredFrom: '2022-01',
  coveredTo: '2022-06',
  isPartialCoverage: true,
};

describe('buildLineReadouts', () => {
  it('carries all five figures for a line present in metrics', () => {
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: { 801: metrics801 },
      coverage: {},
    });

    expect(readout.averageRidership).toBe(1000);
    expect(readout.changeInRidership).toBe(200);
    expect(readout.startingRidership).toBe(900);
    expect(readout.endingRidership).toBe(1100);
    expect(readout.ridersPerMile).toBe(50);
  });

  it("keeps the line's own fields alongside its figures", () => {
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801, name: 'A Line', selected: true })],
      metrics: { 801: metrics801 },
      coverage: {},
    });

    expect(readout.id).toBe(801);
    expect(readout.name).toBe('A Line');
    expect(readout.mode).toBe('Rail');
    expect(readout.selected).toBe(true);
  });

  it('carries the covered span for a line present in coverage', () => {
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: {},
      coverage: { 801: coverage801 },
    });

    expect(readout.coveredFrom).toBe('2022-01');
    expect(readout.coveredTo).toBe('2022-06');
    expect(readout.isPartialCoverage).toBe(true);
  });

  it('writes no figure keys at all for a line in neither map', () => {
    // Presence, not value: spreading `undefined` writes no keys, which is what makes
    // a figure from a previous Month Window structurally impossible to survive.
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: {},
      coverage: {},
    });

    expect('averageRidership' in readout).toBe(false);
    expect('changeInRidership' in readout).toBe(false);
    expect('startingRidership' in readout).toBe(false);
    expect('endingRidership' in readout).toBe(false);
    expect('ridersPerMile' in readout).toBe(false);
    expect('coveredFrom' in readout).toBe(false);
    expect('coveredTo' in readout).toBe(false);
    expect('isPartialCoverage' in readout).toBe(false);
  });

  it('writes a ridersPerMile key of undefined when the metrics say so', () => {
    // `LineMetrics.ridersPerMile` is `number | undefined`, never optional: the key is
    // always written, so a line that lost its distance reads as `undefined` rather
    // than as absent.
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: { 801: { ...metrics801, ridersPerMile: undefined } },
      coverage: {},
    });

    expect('ridersPerMile' in readout).toBe(true);
    expect(readout.ridersPerMile).toBeUndefined();
  });

  it('joins metrics and coverage onto the same readout', () => {
    const [readout] = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: { 801: metrics801 },
      coverage: { 801: coverage801 },
    });

    expect(readout.averageRidership).toBe(1000);
    expect(readout.coveredTo).toBe('2022-06');
  });

  it('follows the order of lines, not the key order of metrics', () => {
    const readouts = buildLineReadouts({
      lines: [
        makeLine({ id: 801, name: 'A Line' }),
        makeLine({ id: 802, name: 'B Line' }),
        makeLine({ id: 2, name: 'Line 2', mode: 'Bus' }),
      ],
      metrics: {
        2: { ...metrics801, averageRidership: 2 },
        802: { ...metrics801, averageRidership: 802 },
        801: { ...metrics801, averageRidership: 801 },
      },
      coverage: {},
    });

    expect(readouts.map((readout) => readout.id)).toEqual([801, 802, 2]);
    expect(readouts.map((readout) => readout.averageRidership)).toEqual([
      801, 802, 2,
    ]);
  });

  it('returns an empty array for no lines', () => {
    expect(
      buildLineReadouts({
        lines: [],
        metrics: { 801: metrics801 },
        coverage: { 801: coverage801 },
      }),
    ).toEqual([]);
  });

  it('ignores metrics and coverage for lines that are not present', () => {
    const readouts = buildLineReadouts({
      lines: [makeLine({ id: 801 })],
      metrics: { 802: metrics801 },
      coverage: { 802: coverage801 },
    });

    expect(readouts).toHaveLength(1);
    expect('averageRidership' in readouts[0]).toBe(false);
  });

  it('does not mutate the input lines array or its elements', () => {
    const line = makeLine({ id: 801 });
    const lines = [line];
    const snapshot = { ...line };

    const readouts = buildLineReadouts({
      lines,
      metrics: { 801: metrics801 },
      coverage: { 801: coverage801 },
    });

    expect(lines).toHaveLength(1);
    expect(line).toEqual(snapshot);
    expect(readouts[0]).not.toBe(line);
  });
});
