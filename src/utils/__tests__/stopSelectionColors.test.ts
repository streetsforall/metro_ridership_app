import { describe, it, expect } from 'vitest';
import { colorForSelectionIndex } from '../stopSelectionColors';

/**
 * The palette contract, restated independently of the module — the same habit
 * `src/chart/__tests__/eventGutter.test.ts` keeps for the event hues. Spelling the eight
 * values out here rather than importing the list means a silent edit to a hue fails a
 * test instead of passing quietly, which is the only review a colour decision gets.
 */
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

  /**
   * Selection is uncapped by design, so a ninth stop has to get *some* colour. It repeats
   * the first rather than coming back undefined, and the legend is what tells the two
   * apart — nothing here is the sole signal for which series is which.
   */
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

  /* The types forbid it, but the data does not, and `undefined` here would paint nothing. */
  it('folds a negative index back into the palette', () => {
    expect(colorForSelectionIndex(-1)).toBe(colorForSelectionIndex(7));
    expect(colorForSelectionIndex(-8)).toBe(colorForSelectionIndex(0));
  });

  /**
   * `NaN` survives neither `%` nor `Math.trunc`, so it would index the array with `NaN`,
   * get `undefined`, and throw on `['600']` — a function that promises a colour must not
   * throw for a number it was handed.
   */
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
