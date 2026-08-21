import { describe, it, expect } from 'vitest';
import { colorForSelectionIndex } from '../stopSelectionColors';

/** The eight hues spelled out rather than imported, so a silent edit fails a test. */
const PALETTE = [
  '#2563eb', // blue-600
  '#ea580c', // orange-600
  '#059669', // emerald-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#d97706', // amber-600
  '#0891b2', // cyan-600
  '#c026d3', // fuchsia-600
];

describe('colorForSelectionIndex', () => {
  it.each(PALETTE.map((color, index) => [index, color] as const))(
    'draws the stop at position %i in %s',
    (index, color) => {
      expect(colorForSelectionIndex(index)).toBe(color);
    },
  );

  it('holds eight distinguishable hues', () => {
    expect(new Set(PALETTE).size).toBe(8);
  });

  /** Selection is uncapped, so a ninth stop repeats the first hue rather than getting none. */
  it('cycles rather than running out', () => {
    expect(colorForSelectionIndex(8)).toBe(colorForSelectionIndex(0));
    expect(colorForSelectionIndex(9)).toBe(colorForSelectionIndex(1));
    expect(colorForSelectionIndex(17)).toBe(colorForSelectionIndex(1));
  });

  it('never yields undefined, however far past the palette it is asked', () => {
    for (let index = 0; index < 40; index += 1) {
      expect(colorForSelectionIndex(index)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /** The types forbid it, but the data does not, and `undefined` here would paint nothing. */
  it('folds a negative index back into the palette', () => {
    expect(colorForSelectionIndex(-1)).toBe(colorForSelectionIndex(7));
    expect(colorForSelectionIndex(-8)).toBe(colorForSelectionIndex(0));
  });

  /** `NaN` survives neither `%` nor `Math.trunc`, and a colour was promised for any number. */
  it.each([NaN, Infinity, -Infinity])(
    'still yields a colour for %s',
    (index) => {
      expect(colorForSelectionIndex(index)).toMatch(/^#[0-9a-f]{6}$/);
    },
  );

  it('truncates a fractional index rather than mangling it', () => {
    expect(colorForSelectionIndex(2.9)).toBe(colorForSelectionIndex(2));
  });

  it('is not a Metro line colour, so a series never claims a line', () => {
    // The teal and navy the dashboard's chrome and rail lines use.
    expect(PALETTE).not.toContain('#0fada8');
    expect(PALETTE).not.toContain('#033056');
  });
});
